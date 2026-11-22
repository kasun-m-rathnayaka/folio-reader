# Folio 3D — Product Requirements & Build Plan

Nov 22, 2026 · @Kasun Rathnayaka

## Summary

Folio 3D turns the Folio library into a calm, tactile 3D bookshelf on Windows and the web. Reading itself stays a sharp, fully featured 2D reader. One codebase ships to two hosts — the existing WPF + WebView2 desktop app and a new installable Blazor WebAssembly web app — through nine milestones (M0–M8), each with its own acceptance gate.

The visual reference is Stripe Press: one WebGL canvas behind thin HTML chrome, books as real 3D objects, and motion that eases rather than snaps. Folio takes the technique, not the look: no Stripe fonts, textures, wordmarks or layouts.

### Goals

- The library feels physical: every PDF becomes a 3D book generated from its own cover, title and page count.
- Motion is subtle and continuous. Nothing snaps, nothing loops for attention, nothing competes with reading.
- Opening a book is one unbroken motion that lands in the existing reader at the right page.
- The same product runs on Windows 11 and in current browsers. Both stay local-first: no server, no account, no telemetry.
- Every existing feature keeps working: import, shelves, trash, bookmarks, highlights, and library search.

### Non-goals for this release

- A 3D reading mode with selectable text (a later experiment; see Risks).
- Cloud sync, accounts or sharing.
- Reflow, read-aloud and AI study tools (still out of scope, as the README states). Marginalia, the Notebook, OCR and quote with citation are removed from Folio entirely (M1).
- Phone-first layouts. The web app must work on tablets and phones, but the design targets desktop.

### Success criteria (proposed release gate)

| Criterion | Target |
| --- | --- |
| Library frame time, 300 books, integrated GPU (Intel Iris Xe class) | p95 ≤ 16.7 ms (60 fps) |
| Frames rendered while nothing moves | 0 after 2 s idle |
| Open-book animation | ≤ 900 ms, reader interactive ≤ 300 ms after |
| Cold start to library | ≤ 2.5 s desktop, ≤ 4 s web (cached) |
| No WebGL, or reduced motion | Every feature usable through the 2D fallback |
| Accessibility | All library actions by keyboard; screen readers can list and open books; WCAG 2.2 AA contrast |
| Regressions | All existing .NET and reader tests pass, build clean with -warnaserror |

## Product requirements

P0 items ship in this release; P1 items ship if their milestone has room; P2 items are recorded for later. Requirement IDs are referenced in milestones and tests.

### Library stage (LIB)

| ID | Requirement | Priority |
| --- | --- | --- |
| LIB-1 | Library home shows one persistent 3D stage behind the HTML chrome. The hero is the most recently read book, idling with a slow turn and pointer-follow tilt. | P0 |
| LIB-2 | A title marquee of large serif book titles scrolls above the hero; the current book's title is emphasised. | P0 |
| LIB-3 | Wheel, trackpad, touch swipe and arrow keys move the camera from the hero to the shelf scene and back. | P0 |
| LIB-4 | Each book is generated, not modelled: cover from a render of PDF page 1; spine texture drawn from title and author; thickness from page count (clamped 8–60 mm); cream page-edge texture; accent colour from the cover's dominant colour. | P0 |
| LIB-5 | Hovering or focusing a spine slides that book out and tilts it. The bottom bar shows `[ OPEN BOOK + ]` and `[ VIEW DETAILS + ]` for it. | P0 |
| LIB-6 | Existing sort (Recent, Title, Author, Date added, Progress) and filters (status, shelf, search) rearrange books with an animated reflow. | P1 |
| LIB-7 | Empty library shows an empty shelf and an Add books action. Newly imported books slide onto the shelf. | P0 |
| LIB-8 | A thin ribbon on the spine marks reading progress. | P1 |

### Shelves (SHF)

| ID | Requirement | Priority |
| --- | --- | --- |
| SHF-1 | Custom shelves render as named rows; switch with the sidebar, Up/Down keys or 1–9. | P0 |
| SHF-2 | Manage shelves (rename, reorder, delete) works as today; the 3D rows update live. Deleting a shelf keeps its books, highlights and bookmarks. | P0 |
| SHF-3 | Drag a book onto another shelf, with a drop highlight on the target row. | P2 |

### Book details (DET)

| ID | Requirement | Priority |
| --- | --- | --- |
| DET-1 | **Removed in SPEC-V2 (WP1).** The details page and scene are gone. Its Edit, Move to shelf and Move to Trash actions live in a book menu (`[ ⋯ ]` in the bottom bar, right-click or the context-menu key). The cover-colour tint now follows the presented book (SPEC-V2, WP4). | — |
| DET-2 | **Removed in SPEC-V2 (WP1).** | — |

### Opening and closing a book (OPN)

| ID | Requirement | Priority |
| --- | --- | --- |
| OPN-1 | Open: the book comes forward, the cover swings open, and the camera aligns the spread with where the reader will draw the current page, then crossfades into the 2D reader. Total ≤ 900 ms. | P0 |
| OPN-2 | Close: the reverse — the reader fades to the 3D spread, the cover closes, and the book returns to its shelf slot. | P0 |
| OPN-3 | Without 3D, a View Transition morphs the 2D cover into the reader instead. | P0 |

### Reader (RDR)

| ID | Requirement | Priority |
| --- | --- | --- |
| RDR-1 | The existing PDF.js reader stays: continuous and spread layouts, zoom, rotation, find, bookmarks, highlights, focus mode and outline. | P0 |
| RDR-2 | Reader chrome adopts the new design system (bracket labels, hairlines, type). | P1 |
| RDR-3 | Optional page-turn animation in spread mode, drawn by a WebGL overlay only while a page turns. | P2 |

### Search (SRC)

| ID | Requirement | Priority |
| --- | --- | --- |
| SRC-1 | Library search (contents, titles, bookmarks) behaves as today, restyled. Scanned PDFs without a text layer stay in the not-indexable list. | P0 |
| SRC-2 | Opening a search result or bookmark uses the open-book transition and lands on the matching page. | P1 |

### Web app (WEB)

| ID | Requirement | Priority |
| --- | --- | --- |
| WEB-1 | Installable PWA that works offline after first load. | P0 |
| WEB-2 | Import PDFs by file picker, folder picker (where supported) and drag-and-drop. PDFs and covers live in the browser's private file storage (OPFS); the library database is SQLite stored in OPFS. | P0 |
| WEB-4 | The app asks for persistent storage and offers library backup export and import (one .zip of database and PDFs). | P0 |
| WEB-5 | Supports current desktop Chrome, Edge, Firefox and Safari. 3D needs WebGL2; otherwise the 2D library is used. | P0 |
| WEB-6 | No data leaves the device. No analytics, no remote fonts or scripts at runtime. | P0 |

### Desktop (DSK)

| ID | Requirement | Priority |
| --- | --- | --- |
| DSK-1 | Command-line import, `--data-root`, `folio-profile.json`, the `folio.books` and `folio.covers` virtual hosts and Trash behave as today. | P0 |
| DSK-2 | On battery: cap the stage at 30 fps and turn off idle motion. | P1 |

### Settings (SET)

| ID | Requirement | Priority |
| --- | --- | --- |
| SET-1 | Motion: Full, Reduced, Off. Defaults to the OS reduced-motion setting. | P0 |
| SET-2 | Library style: 3D or 2D. | P0 |
| SET-3 | 3D quality: Auto, High, Low. | P1 |

## Behaviour specification

The stage is a pure view: Blazor owns state, data and navigation, and tells the stage which scene to show. The stage reports user intent back (hover, activate, scene settled) and never writes data.

### Scenes

| Scene | Shows | Enters from | Camera |
| --- | --- | --- | --- |
| Hero | The last-read book alone, turning slowly; title marquee above | App start, Esc from Shelf | Close, slightly low, 3/4 view |
| Shelf | Rows of spines, one row per shelf ("All books" first); focused book pulled out | Scroll or Down from Hero; Esc from Details | Pulled back, eye level with the focused row |
| Details | One book facing front; page tinted with its colour; metadata panel in HTML | `[ VIEW DETAILS + ]`, D or Space on a focused book | Front, centred left of the panel |
| Opening | Cover swings open onto the spread at the current page | `[ OPEN BOOK + ]`, Enter, a search result | Moves until the spread matches the reader's page rectangle |
| Reader | The 2D PDF.js reader; stage paused | End of Opening | Stage hidden and not rendering |

&#91;embedded content: Scene flow · 5 states\]

Enter opens from any library scene; the diagram shows the Shelf path, which every other entry follows after a short camera move.

### Routes

Today the app navigates by component state and has no URL routes. Add the Blazor Router so every scene has an address: it gives Back/Forward, deep links and reload on the web.

| Route | Scene |
| --- | --- |
| `/` | Hero |
| `/shelf/{shelfId?}` | Shelf, focused on that shelf (default All books) |
| `/book/{bookId}` | Details |
| `/book/{bookId}/read?page={n}` | Opening, then Reader |
| `/search?q=` · `/trash` · `/settings` | Existing views, stage dimmed and paused |

### Interactions

| Input | Hero | Shelf | Details | Reader |
| --- | --- | --- | --- | --- |
| Scroll / swipe down, ↓ | Go to Shelf | Next shelf row | — | Page scroll (as today) |
| ← / → | Previous / next recent book | Previous / next book in row | Previous / next book | Previous / next page (as today) |
| Enter | Open hero book | Open focused book | Open | — |
| D or Space | Details | Details of focused book | — | — |
| Esc | — | Back to Hero | Back to Shelf | Close book (reverse animation) |
| 1–9 | Shelf n | Shelf n | — | — |
| / | Focus library search | Focus library search | — | Find in book (as today) |
| Ctrl+K | Command palette (existing) | same | same | same |
| ? | Shortcut sheet | same | same | same |
| Pointer move | Hero tilts up to 4° toward pointer | Hovered spine pulls out | Book tilts up to 3° | — |
| Click | Spine or cover = focus; again = Details | same | Cover = Open | — |

### Motion

Every moving value eases toward its target each frame with exponential damping (`value = damp(value, target, λ, dt)`); there are no fixed linear tweens in the stage. HTML chrome uses springs. These constants are starting values to tune by eye.

| Motion | Rule |
| --- | --- |
| Camera between scenes | λ = 4; settles in about 700 ms |
| Spine pull-out on hover or focus | λ = 10; 24 mm out, 6° tilt |
| Hero idle turn | ±12° over a 16 s cycle; stops 20 s after the last input |
| Pointer-follow tilt | λ = 6; max 4° |
| Open book | Forward 250 ms → cover opens 400 ms → camera aligns 250 ms → crossfade 120 ms |
| HTML chrome (labels, panels) | Spring stiffness 260, damping 30; CSS fallback `cubic-bezier(0.22, 1, 0.36, 1)` 240 ms |
| Title marquee | Moves only when the focused book changes; never auto-scrolls |
| Reduced motion | No idle turn, no tilt, no camera travel; scene changes are 150 ms crossfades |
| Motion off | Instant cuts |

### Rendering and fallback rules

- Render on demand: draw a frame only while something is still settling, then stop. Zero frames after 2 s with no input.
- Pause the stage completely when the Reader, a dialog or a non-library view covers it, and when the window or tab is hidden.
- Use the 2D library (CSS 3D books, no WebGL) when any of these hold: no WebGL2; the user chose 2D; the renderer is a software rasteriser (SwiftShader, Microsoft Basic Render Driver); the WebGL context is lost twice in one session.
- Quality Auto: start at device pixel ratio min(dpr, 2). If p95 frame time exceeds 33 ms over 5 s, step down (dpr 1.5 → 1, then shadows off). If it is still slow, switch to 2D and say so once in a toast.
- Textures: covers at 512 px on the long edge, spines at 64 × 512 px, in a least-recently-used cache of about 120 books; books far from the camera share a plain placeholder material.

### Accessibility

- The canvas is `aria-hidden`. A real HTML list of books sits over the stage with one focusable button per book; focus moves the 3D focus, and hovering in 3D moves DOM focus.
- Each button's name reads "Title, by Author, 42% read". Open and Details are separate, labelled buttons.
- The details tint is computed so text keeps 4.5:1 contrast; fall back to the neutral surface if no tint passes.
- Every scene change is announced in a polite live region ("Shelf: Design, 14 books").
- No information exists only in 3D: progress, shelf and title are all in the HTML layer.

## Visual design system

Dark-first editorial: near-black stage, warm off-white type, one accent taken from the focused book. The existing light and dark themes stay; both get the new tokens in `m3-tokens.css`, so MudBlazor dialogs restyle without rewriting them.

### Colour tokens

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--folio-bg` | #0B0B0C | #F3F0E8 | Stage and page background |
| `--folio-surface` | #151517 | #FBF9F4 | Panels, dialogs |
| `--folio-text` | #EDEBE6 | #1A1917 | Primary text |
| `--folio-text-muted` | #9A968E | #5E5A53 | Labels, metadata |
| `--folio-hairline` | rgba(237,235,230,0.14) | rgba(26,25,23,0.14) | 1 px rules, header line |
| `--folio-accent` | Focused book's colour, contrast-checked | same | Focus ring, active label, details tint |

### Typography

All fonts are SIL Open Font License and self-hosted as WOFF2, so the app needs no network at runtime.

| Role | Font | Size and style |
| --- | --- | --- |
| Display (marquee, details title, spines) | Instrument Serif | 48–96 px marquee; 40 px details title; tight tracking (−0.01em) |
| UI text and panels | Inter | 14 px body, 13 px secondary, weights 400 and 500 |
| Labels, key hints, counters | JetBrains Mono | 11–12 px, uppercase, tracking 0.08em |

### Chrome

- Header: wordmark "FOLIO" in mono at the top left, a 1 px hairline under it, and search, theme and settings at the top right.
- Bottom bar: the focused book's title at the left; `[ OPEN BOOK + ]` and `[ VIEW DETAILS + ]` at the right, with key hints (`Enter`, `D`).
- Bracket labels are the only button style in the library. Hover adds the accent underline; focus adds a 2 px accent outline.
- Section eyebrows use the mono style, for example `[ CONTINUE READING ]` and `[ SHELF · DESIGN · 14 ]`.

### Book materials and light

| Part | Material |
| --- | --- |
| Cover | Physical material, roughness 0.8, cloth sheen 0.5 tinted by the accent; the cover image as the colour map |
| Spine | Same cloth; generated texture with title in Instrument Serif and author in Inter |
| Page block | Cream (#EFE8D8), roughness 0.95, a fine line texture for page edges |
| Light | Soft studio environment map, one warm key light from upper left, a soft contact shadow under each book |

### Assets to avoid

No Stripe Press fonts (Cardinal Fruit, Suisse Mono are commercial), textures, cover art, wordmarks or page layouts. The bracket-label idea and dark editorial tone are generic; keep everything else original.

## Tech stack

Keep .NET 10 and Blazor, and add a WebAssembly host beside the desktop one. Draw the 3D library with vanilla Three.js driven by a thin C# bridge. Use CSS 3D, View Transitions and Motion springs for everything HTML. This reuses roughly all of today's code and adds no second UI framework.

### Chosen stack

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime | .NET SDK 10.0.400 (pinned in `global.json`), C# latest | Existing; shared by both hosts |
| UI | Blazor components in `Folio.UI` (Razor class library, `net10.0`) + MudBlazor 8 | Already platform-neutral; both hosts reuse it unchanged |
| Desktop host | WPF + BlazorWebView (WebView2) in `Folio.Desktop` | Existing; keeps virtual hosts, file dialogs |
| Web host | Blazor WebAssembly standalone PWA, new `Folio.Web` | Runs fully in the browser, so the web app stays local-first and can be static-hosted |
| 3D stage | Three.js (latest release at M4 start, exact version pinned), vanilla ES modules, bundled by esbuild into `wwwroot/js/stage.bundle.mjs` | The library Stripe uses underneath; smallest option; most book and page-curl examples; no React |
| C# ↔ stage bridge | `StageJsBridge.cs` over `IJSRuntime` module import, the same pattern as `ReaderJsBridge.cs` | Proven in this repo; works in both hosts. The frame loop stays in JS |
| HTML motion | [Motion](https://motion.dev/) (`motion` npm package, vanilla `animate`) for springs | Small, spring physics, animates HTML and JS values |
| Page transitions | View Transitions API (same-document), feature-detected | Cross-browser since Firefox 144 ([web.dev](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available)) |
| 2D fallback books | CSS 3D transforms (`preserve-3d`) | Sharp text, accessible, no WebGL |
| PDF | PDF.js (`pdfjs-dist` 6.4.299, already vendored) | Reader on both hosts; cover rendering on the web |
| Desktop covers | Existing `WinRtPdfRasterizer` | Unchanged |
| Web database | EF Core + SQLite in OPFS via [SqliteWasmBlazor](https://www.nuget.org/packages/SqliteWasmBlazor) | Same entities and migrations as desktop. Pre-release: wrapped behind an interface with a named fallback (Risks) |
| Web files | Origin Private File System (OPFS) for PDFs and covers; `navigator.storage.persist()` | Private, fast, no server |
| Text extraction | PdfPig (existing `PdfPigTextExtractor`) | Managed .NET, so it should run in WebAssembly; M2 verifies speed |
| Fonts | Instrument Serif, Inter, JetBrains Mono (OFL), self-hosted | Offline, licence-safe |
| JS tooling | Node 24, npm, esbuild, `node --test` | Node 24 is already required for reader tests |
| Tests | xUnit 2.9 (existing), Playwright 1.62 (already a dev dependency), @axe-core/playwright | Reuse; add browser e2e, visual and accessibility checks |
| CI | GitHub Actions: existing `windows-latest` job + new `ubuntu-latest` web job; web deploys to GitHub Pages | Windows-only code is verified where it can run |

### Alternatives considered

| Option | Verdict |
| --- | --- |
| React Three Fiber (Stripe's exact stack) | Rejected: adds React beside Blazor for helpers Folio doesn't need |
| Babylon.js 9 | Strong runner-up: Microsoft-maintained, crisp SDF text. Rejected for a heavier bundle and fewer book examples |
| C# Three.js wrappers (Kebechet.Blazor.ThreeJS, BlazorThree) | Rejected: per-frame C# interop is slow and BlazorThree is preview. Scene setup from C# gives little here |
| Spline | Rejected: suits one designed hero scene, not hundreds of generated books; vendor runtime |
| Evergine, Unity WebGL | Rejected: engines for industrial or game apps; heavy, awkward beside a Blazor UI |
| GSAP | Acceptable alternative to Motion (now free for commercial use); Motion chosen for size |
| HTML-in-Canvas (selectable text on 3D pages) | Deferred: Chromium only; candidate for a later desktop-only 3D reading mode |
| Blazor Server or a hosted API for the web | Rejected: needs a server and breaks local-first |

## Architecture

Shared code moves to platform-neutral `net10.0` projects. Windows-only and browser-only code sits in two thin platform projects behind interfaces that `Folio.Application` mostly already defines. Each host wires one platform in its DI setup.

&#91;embedded content: Folio 3D architecture · 2 hosts, shared core, 2 platforms\]

The hosts only wire things together; everything a user sees lives in the shared middle column, so a fix there lands on both platforms.

### Solution layout (target)

```text
src/
  Folio.Domain/                 net10.0   unchanged
  Folio.Application/            net10.0   + IBookUrlResolver, IDatabaseSetup, IPlatformCapabilities, ILibraryBackupService
  Folio.Infrastructure/         net10.0   EF Core, repositories, import, search, jobs, PdfPig (Windows TFM removed)
  Folio.Platform.Windows/       net10.0-windows   WinRtPdfRasterizer, WindowsBatteryMonitor, disk FileStore
  Folio.Platform.Browser/       net10.0 (browser) OpfsFileStore, PdfJsCoverRenderer, SqliteWasm setup, backup
  Folio.UI/                     net10.0   pages, components, Stage/ (StageHost.razor, StageJsBridge.cs), wwwroot/js/stage/*
  Folio.Desktop/                net10.0-windows   WPF + BlazorWebView host (existing)
  Folio.Web/                    net10.0   Blazor WebAssembly PWA host (new)
tests/
  Folio.Domain.Tests, Folio.Infrastructure.Tests, Folio.Desktop.Tests (existing)
  Folio.Platform.Windows.Tests  (moved rasterizer tests)
  Folio.Reader.Tests            (existing node tests) + stage/*.test.mjs
  Folio.Web.E2E                 Playwright: e2e, visual, accessibility, performance
```

### Platform interfaces

| Interface | Status | Windows | Browser |
| --- | --- | --- | --- |
| `IFileStore` | Exists | Disk under `%LocalAppData%\Folio` | OPFS directory per library |
| `IFilePickerService` | Exists | WPF dialogs | `<input type=file>`, File System Access API where available, drag-drop |
| `IPdfRasterizer` | Exists | WinRT (background jobs) | PDF.js in a worker with OffscreenCanvas |
| `IBatteryMonitor` | Exists | Windows power status | Battery API where present, else "unknown" |
| `IBookUrlResolver` | New | `https://folio.books/...` virtual host | Blob URL from OPFS, revoked on close |
| `IDatabaseSetup` | New | SQLite file, existing `DatabaseMigrator` | SqliteWasmBlazor on OPFS, same migrations |
| `IPlatformCapabilities` | New | Desktop flags (folder import, command-line) | Feature detection (OPFS, folder picker, persist) |
| `ILibraryBackupService` | New | Optional | Export and import .zip |

### Stage modules (`Folio.UI/wwwroot/js/stage/`)

| Module | Job |
| --- | --- |
| `index.js` | `createStage`, `dispose`, render-on-demand loop, visibility pause, context-loss handling |
| `bridge.js` | The only module .NET calls; validates input, forwards intents to .NET |
| `book-factory.js` | Rounded box geometry, materials, thickness from page count, instanced placeholders |
| `textures.js` | Spine text canvas, page-edge texture, dominant-colour extraction, LRU cache |
| `scenes/hero.js`, `shelf.js`, `details.js`, `opening.js` | Target poses for camera and books per scene |
| `motion.js` | `damp`, springs, reduced-motion switches |
| `quality.js` | Frame-time monitor, pixel ratio steps, 2D fallback trigger, debug stats on `window.__folioStage` |

### Bridge contract

| Direction | Call | Payload |
| --- | --- | --- |
| .NET → JS | `init(canvasId, options, dotNetRef)` | Motion level, quality, theme, test mode |
| .NET → JS | `setLibrary(books)` | `[{ id, title, author, pages, coverUrl, color, progress, shelfId }]` |
| .NET → JS | `setScene(scene)` | `{ kind: 'hero' \| 'shelf' \| 'details' \| 'opening', bookId?, shelfId?, page? }` |
| .NET → JS | `focusBook(id)` · `setMotion(level)` · `setQuality(level)` · `setTheme(theme)` | — |
| JS → .NET | `OnBookHovered(id)` · `OnBookActivated(id, action)` | action = open \| details |
| JS → .NET | `OnSceneSettled(kind)` | Used by tests and the live region |
| JS → .NET | `OnOpenHandoff(bookId, pageRect)` | Reader starts drawing the page into this rectangle, then the stage fades |
| JS → .NET | `OnFallback(reason)` | Switch to the 2D library and record the reason |

Per-frame work never crosses the bridge: .NET sends state changes only, and the stage animates toward them on its own.

## Development plan

Nine milestones, run in order, each on its own branch and pull request into `main`, with a gate that must pass before the next starts. Every milestone keeps the app shippable: the 2D library remains available until M8. Progress is logged in `docs/folio-3d/PROGRESS.md` so a new session can resume exactly where the last stopped.

### M0 — Baseline and environment

Goal: a reproducible build and test loop in the cloud container, plus a record of today's behaviour.

1. Install .NET SDK 10.0.400 and Node 24; run `npm ci` in `src/Folio.UI`.
2. Build on Linux with `-p:EnableWindowsTargeting=true` (WPF and WinRT projects compile but cannot run).
3. Run what runs on Linux: `Folio.Domain.Tests`, `npm run check`, `npm test`.
4. Add an `ubuntu-latest` CI job for the Linux-runnable checks; keep the existing Windows job as the Windows gate.
5. Create `docs/folio-3d/` with this spec as `SPEC.md`, `PROGRESS.md`, and `DECISIONS.md` for any deviation.

Done when:

- [ ] Linux build succeeds with zero warnings under `-warnaserror`
- [ ] Windows CI job green on the M0 pull request

### M1 — Platform split

Goal: shared code no longer targets Windows; behaviour unchanged.

1. Remove marginalia, the Notebook, OCR and quote with citation: delete their UI (`MarginaliaLane`, `MarginaliaCard`, `NotebookView`, `LibraryNotebook`, the quote action), services (`QuoteCitationFormatter`, `IOcrService`, `WindowsOcrService`, OCR models and background jobs) and their tests. Keep highlights and bookmarks. Leave existing database tables and rows untouched (no destructive migration) and record this in `DECISIONS.md`.
2. Retarget `Folio.Infrastructure` to `net10.0`; move WinRT rasterizer, battery monitor and disk `FileStore` to `Folio.Platform.Windows`.
3. Add `IBookUrlResolver`, `IDatabaseSetup`, `IPlatformCapabilities`; replace hard-coded `folio.books` URLs in UI with the resolver.
4. Move Windows-specific tests to `Folio.Platform.Windows.Tests`.
5. Update `Folio.Desktop` DI to register the Windows platform.

Done when:

- [ ] `Folio.Infrastructure.Tests` pass on Linux (except moved tests)
- [ ] Full Windows CI green, including `test:reader`
- [ ] No `net10.0-windows` reference from any shared project
- [ ] No marginalia, Notebook, OCR or quote-with-citation code or UI remains; highlights and bookmarks still work

### M2 — Web host (2D, today's look)

Goal: the current app runs in the browser with real persistence.

1. Create `Folio.Web` (Blazor WebAssembly standalone, PWA template) referencing `Folio.UI` and `Folio.Platform.Browser`.
2. Implement `OpfsFileStore`, SqliteWasmBlazor `IDatabaseSetup` running the existing migrations, `PdfJsCoverRenderer`, blob-URL `IBookUrlResolver`, browser file picker and drag-drop import.
3. Verify PdfPig extraction and library search speed on the 300-page fixture; if slower than 10 s, switch web extraction to PDF.js text content behind `IPdfTextExtractor`.
4. Create `tests/Folio.Web.E2E` (Playwright) with the fixture PDFs.

Done when:

- [ ] On Chromium, Firefox and WebKit: import a fixture, open it, add a highlight, reload — book and highlight persist
- [ ] Library search returns a known phrase from `01_single_column_book_300p.pdf`
- [ ] `dotnet publish src/Folio.Web` produces a static site that runs from a plain file server

### M3 — Design system, routes and 2D books

Goal: the new look everywhere, without WebGL yet.

1. Add tokens, self-hosted fonts and bracket-label components; restyle header, bottom bar, sidebar, dialogs.
2. Add the Blazor Router and the routes in the Behaviour section; keep existing views as routed pages.
3. Build `CssBook.razor` (CSS 3D book) and the 2D library using it, with hover tilt and Motion springs.
4. Add the View Transition from book to reader (OPN-3), feature-detected.
5. Add Settings: Motion (SET-1) and Library style (SET-2).

Done when:

- [ ] Visual snapshots approved for library, details, reader chrome in light and dark
- [ ] Axe: no serious or critical issues; reduced-motion snapshot shows no transitions
- [ ] Back and Forward work across all routes on the web

### M4 — Stage core and hero

Goal: one persistent Three.js stage with real generated books.

1. Add Three.js and esbuild; bundle `wwwroot/js/stage/` to `stage.bundle.mjs`; add the bundle to `verify-assets.mjs`.
2. Implement `StageHost.razor`, `StageJsBridge.cs`, render-on-demand loop, context-loss recovery, quality manager, test mode (`?stageTest=1`: fixed clock, no idle motion).
3. Implement `book-factory.js` and `textures.js` (cover, spine, page edge, colour).
4. Implement the Hero scene and title marquee (LIB-1, LIB-2, LIB-4).
5. Implement fallback rules: no WebGL2, software renderer, double context loss → 2D.

Done when:

- [ ] Hero renders real covers from fixtures on web and desktop
- [ ] Zero frames rendered after 2 s idle (from `window.__folioStage.stats`)
- [ ] Forcing WebGL off shows the 2D library with no errors

### M5 — Shelf scene and navigation

Goal: the full browsing experience.

1. Shelf scene: rows per shelf, focus pull-out, camera travel, scroll and key handling (LIB-3, LIB-5, SHF-1).
2. HTML focus layer over the canvas, synchronised with 3D focus; live-region announcements.
3. Sort and filter reflow (LIB-6), progress ribbon (LIB-8), import slide-in (LIB-7), live shelf updates (SHF-2).

Done when:

- [ ] Keyboard-only test: reach every book on three shelves, open one, return
- [ ] 300 synthetic books: p95 frame time ≤ 16.7 ms in headless Chromium with GPU, recorded in CI artifacts

### M6 — Details and the open-book transition

Goal: the signature moment.

1. Details scene with contrast-checked tint and the HTML metadata panel (DET-1, DET-2).
2. Opening animation and handoff: the reader reports its first-page rectangle; the stage aligns the spread to it, then crossfades (OPN-1).
3. Reverse animation on close (OPN-2); search results and bookmarks use the same path (SRC-2).

Done when:

- [ ] At handoff, the 3D page and the reader page differ by ≤ 2 px at their corners (screenshot test)
- [ ] Open completes in ≤ 900 ms; reader accepts input ≤ 300 ms later

### M7 — Web parity and desktop polish

Goal: the web app is complete and safe for real libraries.

1. `navigator.storage.persist()`, backup export and import (WEB-4); offline service worker (WEB-1).
2. Desktop battery saver (DSK-2) and quality setting (SET-3).

Done when:

- [ ] Offline test: app loads and opens a stored book with the network disabled
- [ ] Backup round-trip restores books, highlights, bookmarks and positions

### M8 — Hardening and release

Goal: pass every gate in Testing and ship both builds.

1. Performance and accessibility qualification on both hosts; fix findings.
2. Update `README.md`, `docs/how-folio-works.md` and the product spec.
3. CI: deploy `Folio.Web` to GitHub Pages on `main`; attach the desktop publish output to a release.
4. Remove dead code paths; keep the 2D library as the fallback.

Done when:

- [ ] All quality gates pass on the release commit
- [ ] A human has used the Windows build on real hardware and signed off in `PROGRESS.md`

## Testing and quality gates

A milestone is done only when every gate that applies to it passes in CI. The cloud container runs the Linux gates; Windows-only behaviour is proven by the `windows-latest` job on each pull request.

| Gate | Tool | Runs on | Pass rule |
| --- | --- | --- | --- |
| Build | `dotnet build Folio.sln -c Release -warnaserror` | Linux (with Windows targeting) and Windows | Zero errors and warnings |
| .NET tests | xUnit: Domain, Infrastructure, Desktop, Platform.Windows | Linux for shared; Windows for platform | All pass |
| JS units | `node --test` for reader geometry, stage math, damping, layout, colour contrast | Linux | All pass |
| Reader integration | Existing `npm run test:reader` (headless Edge) | Windows | All pass |
| Web end-to-end | Playwright on Chromium, Firefox, WebKit with fixture PDFs | Linux | All pass |
| Visual regression | Playwright screenshots per scene and theme in stage test mode | Linux (Chromium) | Diff ≤ 0.1% of pixels or approved update |
| Performance | Playwright + `window.__folioStage.stats` with 300 synthetic books | Linux (Chromium with GPU flags) | p95 frame ≤ 16.7 ms; 0 idle frames after 2 s; open ≤ 900 ms |
| Accessibility | @axe-core/playwright + scripted keyboard path | Linux | No serious or critical issues; keyboard path completes |
| Assets | `npm run check` (extended to the stage bundle and fonts) | Linux and Windows | All referenced assets present; no remote URLs |
| Manual | Windows 11 laptop, integrated GPU | Human, at M8 | Signed off in `PROGRESS.md` |

Headless CI has no real GPU, so CI performance numbers catch regressions, not absolute speed. The absolute targets are confirmed on real hardware at M8.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| SqliteWasmBlazor is pre-release | Web persistence bugs or breaking changes | Pin the exact version; isolate behind `IDatabaseSetup`; fallback is [Bit.Bsqlite](https://www.nuget.org/packages/Bit.Bsqlite) (EF Core on wa-sqlite) with the same entities and migrations |
| Browser storage can be evicted | Users lose a web library | Request persistent storage; prompt for backup export after first import and every 30 days |
| The cloud container cannot run WPF, WebView2 or WinRT | Windows regressions slip through | Keep Windows code thin; the Windows CI job is a hard gate; human check at M8 |
| Weak or blocked GPUs (old laptops, remote desktop, WebView2 GPU blocklist) | Slow or broken 3D | Detection rules and automatic 2D fallback; quality steps |
| PdfPig too slow in WebAssembly | Slow web search indexing | Measure in M2; swap web extraction to PDF.js text behind `IPdfTextExtractor` |
| Texture memory on big libraries | Crashes or context loss | 512 px covers, LRU cache of 120 books, placeholders beyond it |
| Open-book handoff misalignment | Visible jump into the reader | Reader reports the page rectangle; screenshot test at ≤ 2 px |
| One long autonomous run drifts from the spec | Rework | Milestone gates, `PROGRESS.md`, `DECISIONS.md`; stop and report when a gate fails twice |
| Look copies Stripe Press too closely | Brand and licence issues | Original layout, OFL fonts, no Stripe assets (see Design) |
| HTML-in-Canvas stays Chromium-only | Later 3D reading mode only on desktop | Out of scope now; revisit after M8 |

## Claude Code handoff

Run it as one long autonomous job, but structured as nine gated milestones, not one giant change. A cloud session can stop mid-way; `PROGRESS.md` lets the next session pick up at the exact step.

### Set up the cloud environment first

- **Repository access:** connect `kasun-m-rathnayaka/folio-reader` with push access so Claude Code can create branches, open pull requests and read CI results with `gh`.
- **Network access:** the container's allowlist must reach NuGet, npm, GitHub and the .NET SDK download hosts. Playwright's browser downloads need their host too. If the SDK or browsers can't download, add a setup script to the environment that installs them before the session starts.
- **Platform:** the container is Linux. It can build the Windows projects with `-p:EnableWindowsTargeting=true` but cannot run WPF, WebView2 or WinRT. The GitHub Actions Windows job is the only Windows test, so keep it required on pull requests.
- **Secrets:** none needed. GitHub Pages deploy uses the workflow's own token.

### `CLAUDE.md` to add at the repo root

```markdown
# Folio — working rules for Claude Code

Spec: docs/folio-3d/SPEC.md (source of truth). Progress: docs/folio-3d/PROGRESS.md. Deviations: docs/folio-3d/DECISIONS.md.

## Workflow
- Work milestone by milestone (M0–M8). One branch and one PR per milestone: `folio3d/m<N>-<slug>`.
- Before starting, read PROGRESS.md and continue from the first unchecked step.
- After each step: build, run the tests that apply, commit, tick the step in PROGRESS.md.
- A milestone is done only when its "Done when" checks pass, including the Windows CI job. Wait for CI with `gh pr checks --watch`.
- If a gate fails twice for the same reason, stop, write what failed and why in PROGRESS.md, and ask.
- Any change to the spec's decisions goes in DECISIONS.md with the reason.

## Commands
- Build (Linux): dotnet build Folio.sln -c Release -m:1 -warnaserror -p:EnableWindowsTargeting=true
- .NET tests (Linux): dotnet test tests/Folio.Domain.Tests; dotnet test tests/Folio.Infrastructure.Tests (after M1)
- JS: cd src/Folio.UI && npm ci && npm run check && npm test
- Stage bundle: cd src/Folio.UI && npm run build:stage
- Web: dotnet run --project src/Folio.Web; e2e: cd tests/Folio.Web.E2E && npx playwright test

## Rules
- Shared projects target net10.0 only. Windows code lives in Folio.Platform.Windows; browser code in Folio.Platform.Browser.
- The stage's frame loop stays in JS. .NET sends state changes, never per-frame calls.
- No runtime network requests: fonts, scripts and workers are bundled.
- No Stripe Press assets, fonts or copied layouts.
- Keep the 2D library working at every commit.
- Marginalia, the Notebook, OCR and quote with citation are removed: do not reintroduce them.
- Pin exact versions for three, motion, esbuild and SqliteWasmBlazor.
```

### Kickoff prompt

```text
Read CLAUDE.md and docs/folio-3d/SPEC.md (copy the spec from the attached document into that path first if it is missing).
Then execute the development plan from M0 to M8 in order.
For each milestone: create its branch, do the numbered steps, keep PROGRESS.md current, open a PR, and wait until every "Done when" check passes, including the Windows CI job, before merging and starting the next milestone.
When something in the spec is ambiguous, choose the option that keeps the app local-first, accessible and shippable, record it in DECISIONS.md, and continue.
Stop and report only when a gate fails twice for the same reason or a step needs something you cannot do in this environment.
At the end, summarise what shipped, what was deferred, and what a human must check on real Windows hardware.
```

## Sources

- [Stripe Press](https://stripe.press/): reference site, inspected 22 Nov 2026 (Next.js, React Three Fiber, one WebGL2 canvas)
- [folio-reader repository](https://github.com/kasun-m-rathnayaka/folio-reader): current code, CI workflow and tests
- [Stripe: designing an interactive globe](https://stripe.com/blog/globe): why Stripe uses Three.js
- [SqliteWasmBlazor](https://www.nuget.org/packages/SqliteWasmBlazor) and [Bit.Bsqlite](https://www.nuget.org/packages/Bit.Bsqlite): SQLite and EF Core in Blazor WebAssembly
- [turngl](https://github.com/oguzhanT/turngl): PDF.js pages as Three.js textures with page curl
- [Same-document view transitions are Baseline](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available)
- [Announcing Interop 2026 (WebKit)](https://webkit.org/blog/17818/announcing-interop-2026): scroll-driven animations and view transitions
- [Motion](https://motion.dev/) and [GSAP pricing: now free](https://www.gsap.com/pricing/)
- [Announcing Babylon.js 9.0](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0)
- [Kebechet.Blazor.ThreeJS](https://www.nuget.org/packages/Kebechet.Blazor.ThreeJS) and [BlazorThree](https://www.nuget.org/packages/BlazorThree): C# wrappers considered
- [Spline Code API for Web](https://docs.spline.design/exporting-your-scene/web/code-api-for-web)
- [HTML-in-Canvas in Chrome 157](https://developer.chrome.com/blog/html-in-canvas)
