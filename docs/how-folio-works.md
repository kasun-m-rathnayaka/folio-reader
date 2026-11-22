# How Folio fits together

Folio is one Blazor interface that ships to two hosts: a Windows app (WPF + WebView2) and a web app (Blazor WebAssembly,
installable, offline). The library is a calm 3D stage drawn with Three.js; reading is the 2D PDF.js reader. You can
understand most of it with the C# you already know: screens are Razor components and CSS, and each host only wires
platform services together.

```mermaid
flowchart LR
    subgraph Hosts
      Desktop[Folio.Desktop<br/>WPF + WebView2]
      Web[Folio.Web<br/>Blazor WebAssembly PWA]
    end
    subgraph Shared
      UI[Folio.UI<br/>pages, components, stage host]
      App[Folio.Application<br/>services and ports]
      Domain[Folio.Domain]
      Infra[Folio.Infrastructure<br/>EF Core, migrations, search]
    end
    subgraph Platforms
      Win[Folio.Platform.Windows<br/>WinRT covers, battery, virtual hosts]
      Browser[Folio.Platform.Browser<br/>OPFS, SQLite on OPFS, PDF.js covers, backup]
    end
    Desktop --> UI
    Web --> UI
    UI --> App --> Domain
    App --> Infra
    Desktop --> Win
    Web --> Browser
    UI <-->|StageJsBridge| Stage[stage.bundle.mjs<br/>Three.js]
    UI <-->|ReaderJsBridge| Reader[folio-reader.js<br/>PDF.js]
```

The product spec for this design is [docs/folio-3d/SPEC.md](folio-3d/SPEC.md); decisions and deviations are in
[DECISIONS.md](folio-3d/DECISIONS.md) and progress in [PROGRESS.md](folio-3d/PROGRESS.md).

## 1. Startup and platforms

Shared code targets `net10.0` only. Each host registers one platform:

| Port | Windows | Browser |
|---|---|---|
| `IFileStore` | Folder under `%LocalAppData%\Folio` | In-memory working area mirrored to the Origin Private File System |
| `IDatabaseSetup` | SQLite file + `DatabaseMigrator` | SqliteWasmBlazor (SQLite on OPFS) + the same migrator |
| `IBookUrlResolver` | `https://folio.books/…`, `https://folio.covers/…` | Blob URLs read from OPFS |
| `IPdfRasterizer` | WinRT `Windows.Data.Pdf` | PDF.js, 512 px covers |
| `IPdfTextExtractor` | PdfPig | PDF.js text content (faster in WebAssembly) |
| `IBatteryMonitor` | Win32 power status | Battery Status API where available |
| `IPlatformCapabilities` | folder import, Locate PDF, command line | folder import, backup |

Desktop: [App.xaml.cs](../src/Folio.Desktop/App.xaml.cs) builds the host, runs `IDatabaseSetup` **before** starting
workers, and opens `MainWindow`, whose `BlazorWebView` renders [Routes](../src/Folio.UI/Routes.razor).
Web: [Program.cs](../src/Folio.Web/Program.cs) registers the browser platform; [App.razor](../src/Folio.Web/App.razor)
waits for the first render (SQLite starts its worker then), initialises storage, and renders the same `Routes`.

Exercise: put breakpoints in both hosts' start-up and compare which `IFileStore` each resolves.

## 2. Routes and the layout

Every view has an address, so Back/Forward, deep links and reload work: `/`, `/shelf/{id?}`, `/book/{id}`,
`/book/{id}/read?page=n`, `/search?q=`, `/trash`, `/settings`. Addresses are built by `FolioRoutes` and are relative to the
base href, which lets the web app live under a sub-path.

`MainLayout` owns the sidebar, header, import progress and the **persistent stage**. It stays mounted while you read
(hidden), so the stage survives route changes and can animate the book into the reader. `FolioNavigator` opens and
closes books and remembers where you came from.

## 3. The 3D stage

The stage is a pure view. Blazor owns state, data and navigation; the stage shows the scene it is told to and reports
intent (hover, activate, scroll, settled, handoff). Only state changes cross the bridge — the frame loop stays in JS.

- Sources: [src/Folio.UI/stage/](../src/Folio.UI/stage/) (`index.js`, `scenes.js`, `book-factory.js`, `textures.js`,
  `motion.js`, `quality.js`, `opening.js`, `bridge.js`), bundled by `npm run build:stage`.
- .NET side: [StageHost.razor](../src/Folio.UI/Stage/StageHost.razor), [StageJsBridge.cs](../src/Folio.UI/Stage/StageJsBridge.cs),
  [StageState.cs](../src/Folio.UI/Stage/StageState.cs). Pages call `Stage.Show(scene, this)` and `Stage.Release(this)`.
- Books are generated: cover from the PDF's first page, spine drawn from title and author, thickness from page count,
  accent from the cover's dominant colour. Textures live in an LRU of 120 books.
- Every moving value damps toward its target (`damp(value, target, λ, dt)`), and frames are drawn only while something
  is still settling. `window.__folioStage.stats` shows frames, draw calls and timings.
- Without WebGL2, on a software renderer, after two context losses, when persistently slow, or when you choose 2D in
  Settings, the library uses CSS 3D books (`CssBook.razor`) instead. Every action works in both.

Accessibility: the canvas is `aria-hidden`. Each page renders a real HTML layer — the hero's copy and buttons, and on a
shelf a list with an Open and a Details button per book — and a polite live region announces scene changes.

Exercise: open the library with `?stageTest=1` (fixed clock, no idle motion), then watch
`window.__folioStage.stats.frames` stop increasing once nothing moves.

## 4. Opening a book

With Full motion, `FolioNavigator.OpenBookAsync` asks the stage to start opening (the book comes forward and its cover
swings open) and navigates to the reader at the same time. The reader renders underneath, invisible, and reports where
it drew the current page (`folioReader.currentPageRect`). The stage computes the exact pose that puts its 3D page on that
rectangle ([opening.js](../src/Folio.UI/stage/opening.js)), snaps onto it, and hands off; a 120 ms crossfade reveals the
reader. Closing runs the other way. Reduced motion uses a short View Transition crossfade; Off cuts.

## 5. Reading and JavaScript interop

Read [ReaderView.razor](../src/Folio.UI/Pages/ReaderView.razor) alongside [folio-reader.js](../src/Folio.UI/wwwroot/js/folio-reader.js).
Razor owns the toolbar, panels and reading state; JavaScript owns **only the PDF viewport**. `ReaderJsBridge` calls
methods such as `goToPage`; JavaScript calls `[JSInvokable]` methods such as `OnPositionChanged` with typed payloads. The
PDF URL comes from `IBookUrlResolver` (virtual host on desktop, blob URL in the browser).

## 6. Highlights and bookmarks

Selecting text produces a page index and normalised rectangles (0–1 in page space). A highlight stores them and the
selected text in SQLite; it never edits the PDF. Double-click a highlight to remove it. Bookmarks are dog-ears or named
bookmarks. Marginalia, the Notebook, OCR and quote-with-citation were removed; their old data stays readable.

## 7. Saving, migrations and backup

A two-second loop saves dirty reading state in a fresh scope. Migrations in `DatabaseMigrator` are forward-only SQL steps
shared by both hosts. In the browser, Settings → Library backup exports one `.zip` (database, PDFs, covers) and restores
it into an empty profile; Folio asks for persistent storage and reminds you to back up.

## Where to change things

| Change | Starting place |
|---|---|
| Navigation, header, import UI, the persistent stage | `MainLayout`, `FolioNavigator`, `FolioRoutes` |
| Library pages (hero, shelves, 2D library) | `LibraryPage`, `LibraryView`, `LibraryHero`, `CssBook` |
| Book details | `BookDetailsPage` |
| 3D scenes, motion, textures | `src/Folio.UI/stage/*` then `npm run build:stage` |
| Colours, type, chrome | `m3-tokens.css` (tokens, fonts), `folio-library.css` (components) |
| Reader | `ReaderView`, `ReaderToolbar`, `folio-reader.js` |
| Storage and SQL schema | `Folio.Infrastructure` |
| Windows-only behaviour | `Folio.Platform.Windows`, `Folio.Desktop` |
| Browser-only behaviour | `Folio.Platform.Browser`, `Folio.Web` |
