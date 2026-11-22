# Folio

A calm, local-first PDF library and reader for Windows and the web, built with .NET 10, Blazor, Three.js, PDF.js and
SQLite. The library is a tactile 3D bookshelf — every PDF becomes a book made from its own cover, title and page count —
and reading happens in a sharp, fully featured 2D reader. No server, no account, no telemetry.

- **Windows:** WPF + WebView2 (`src/Folio.Desktop`). Data lives in `%LocalAppData%\Folio`.
- **Web:** an installable Blazor WebAssembly PWA (`src/Folio.Web`) that works offline. Books stay in the browser's private
  storage (OPFS); export a backup from Settings.

Folio includes shelves, highlights, bookmarks, recursive folder and drag-and-drop import, Trash, and search inside PDFs.
Reflow, read-aloud and AI study tools are not included. Marginalia, the Notebook, OCR and quote-with-citation were
removed in Folio 3D; existing library data stays readable.

## The library

- The home screen shows the book you read last, turning slowly. **Scroll**, swipe or press **↓** for your shelves:
  "All books" first, then each shelf. **← →** move along a shelf, **↑ ↓** between shelves, **1–9** jump to a shelf.
- Hover or focus a book to pull it out. **Enter** (or `[ OPEN BOOK + ]`) opens it: the book comes forward, its cover
  swings open and the page hands off to the reader. Right-click (or the menu key, or `[ ⋯ ]`) opens the book menu: edit, move to shelf, move to Trash. **Esc**
  goes back.
- Settings: **Motion** (match system, Full, Reduced, Off), **Library style** (3D or 2D) and **3D quality** (Auto, High,
  Low). Without WebGL2, on software rendering, or when 3D is too slow, Folio uses the 2D library automatically. On
  battery the 3D library draws at most 30 frames per second.

## Library and reading tools

- Use **Manage shelves** beside the Shelves heading to rename, reorder, or delete shelves. Removing a shelf keeps its books, highlights and bookmarks.
- Use **Import folder**, drop PDFs/folders onto Folio, or select **Add books**. Folder imports include nested folders and skip duplicate PDFs.
- Type in library search and press **Enter** to search PDF contents, titles, highlights, and bookmarks. The first search builds a local text cache with progress and cancellation; later searches reuse it. PDFs that cannot be indexed, such as scans without a text layer, are listed separately.
- In **Trash**, use a book's menu to delete it permanently, or **Empty Trash** to delete all trashed books. Both actions ask for confirmation. Imported source files are kept.
- Open the reader's **…** menu for PDF layout controls and focus mode. Select text to highlight it; double-click a highlight to remove it. Highlights stay local and original PDFs are never rewritten.

## Run on Windows

Requires Windows 11 x64, the .NET 10 SDK for development (and `dotnet workload install wasm-tools` once, because the
solution includes the web app), and WebView2 Runtime.

```powershell
dotnet build Folio.sln -m:1
dotnet run --project src/Folio.Desktop
```

Data defaults to `%LocalAppData%\Folio`. To use a separate development library:

```powershell
dotnet run --project src/Folio.Desktop -- --data-root "D:\Folio-Test-Library"
```

PDF paths passed as file arguments are imported. A published executable can also read an adjacent `folio-profile.json` containing `{"DataRoot":"D:/Folio-Test-Library"}`. Command-line configuration takes precedence. Keep that file out of a normal release package to use the default personal library.

## Run in a browser

Folio Web is a Blazor WebAssembly app with no server: PDFs, covers and the SQLite library stay in the browser's private
storage (OPFS). Building it needs the WebAssembly tools once: `dotnet workload install wasm-tools`.

```bash
dotnet publish src/Folio.Web -c Release -o .artifacts/web
node tests/Folio.Web.E2E/serve.mjs .artifacts/web/wwwroot 5080
```

Then open http://127.0.0.1:5080. Any static file server works if it falls back to `index.html` for unknown paths.

## Verify

```powershell
dotnet test tests/Folio.Domain.Tests
dotnet test tests/Folio.Infrastructure.Tests
dotnet test tests/Folio.Desktop.Tests
dotnet test tests/Folio.Platform.Windows.Tests
npm --prefix src/Folio.UI ci --ignore-scripts
npm --prefix src/Folio.UI run check
npm --prefix src/Folio.UI test
npm --prefix src/Folio.UI run test:reader
cd tests/Folio.Web.E2E && npm ci && npx playwright test   # after publishing Folio.Web; ?stageTest=1 checks run on Chromium
```

Reader integration tests use installed Microsoft Edge in headless mode, an HTTP server bound only to loopback, and repository fixtures. They write results and engine screenshots into `.artifacts/reader-tests`. Development browser tests require Node 24; normal application use does not require Node.

```powershell
dotnet publish src/Folio.Desktop -c Release --self-contained false -o .artifacts/release
```

The 3D stage is bundled from `src/Folio.UI/stage/` with `npm --prefix src/Folio.UI run build:stage`; the bundle is
committed and `npm run check` fails if it is out of date. On Linux the whole solution builds with
`-p:EnableWindowsTargeting=true`; the Windows-only parts are tested by the `windows` CI job.

## Release

`.github/workflows/release.yml` publishes Folio Web to GitHub Pages on every push to `main` (enable Pages with
"GitHub Actions" as the source), and attaches the Windows build to a GitHub release for tags such as `v1.0.0`.

The resulting folder needs the .NET 10 Desktop Runtime and WebView2 on the destination machine. A public installer and the full specification's performance/accessibility qualification are separate release gates.

Read [how the application works](docs/how-folio-works.md), the [Folio 3D specification](docs/folio-3d/SPEC.md) with its [progress](docs/folio-3d/PROGRESS.md) and [decisions](docs/folio-3d/DECISIONS.md), the [verification record](docs/verification/README.md), and the original [product specification](docs/Folio-PDF-Reader-Spec.md).
