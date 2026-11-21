# Folio 3D — Decisions and deviations

Each entry records a place where the implementation differs from, or fills a gap in, `SPEC.md`.

## D-001 · One development branch instead of one branch per milestone (M0)

The spec asks for one branch and pull request per milestone (`folio3d/m<N>-<slug>`). This cloud session may push only to
its assigned development branch (`kasunr/sleepy-hypatia-kzdvvv`). All milestones are committed there in order, one or more
commits per milestone, with the milestone in each commit subject. CI runs on every push (`on: [push, pull_request]`), so the
Windows job still gates each milestone. Pull requests are opened only when the owner asks.

## D-002 · SDK 10.0.404 from Microsoft's Debian 12 feed (M0)

`builds.dotnet.microsoft.com` is blocked in the container. The Microsoft-built SDK 10.0.404 (feature band 400, so
`global.json`'s `10.0.400` + `latestPatch` accepts it) is extracted from packages.microsoft.com/debian/12/prod. Ubuntu's own
`dotnet-sdk-10.0` is 10.0.1xx and does not satisfy `global.json`.

## D-003 · The disk `FileStore` stays in shared Infrastructure (M1)

The spec moves the disk `FileStore` to `Folio.Platform.Windows`. It uses only `System.IO`, Infrastructure tests on Linux
depend on it, and `AppPreferencesService` and the migrator's pre-migration backup are built on it. It therefore stays in
`Folio.Infrastructure` (net10.0). Only code that needs Windows (WinRT rasterizer, Win32 battery status, the WebView2
virtual-host URL resolver) moved to `Folio.Platform.Windows`. The browser host registers its own `IFileStore`.

## D-004 · Feature removal keeps data and enum values (M1)

Marginalia, the Notebook, OCR and quote with citation are removed from UI, services and tests. Database tables and columns
(`Annotations.Note`, `DocumentPages.WordsJson`/`IsOcr`, `Flashcards`) are untouched; `AnnotationType.MarginNote` and
`JobType.OcrScan` stay so existing rows still load. Library search no longer matches note text, only highlighted text.
Removing the marginalia lane removed the only way to delete a highlight, so double-clicking a highlight now asks
"Remove highlight?". A book whose pages have no text layer is reported in the search page's not-indexable list.

## D-005 · `IBookUrlResolver` is asynchronous and owns the "file missing" check (M1)

Browser blob URLs are created asynchronously, so `GetBookUrlAsync`/`GetCoverUrlAsync` return `ValueTask`. A null book URL
means the stored PDF is missing; the reader no longer calls `File.Exists` itself.
`IPlatformCapabilities` gates host-only actions (folder import, Locate PDF).

## D-006 · Reader integration tests also run on Linux Chromium (M1)

`npm run test:reader` accepts `FOLIO_BROWSER_PATH`, so the Linux CI job runs it against Playwright's Chromium. The Windows
job still runs it against Edge, which remains the gate for WebView2 behaviour.

## D-007 · Web database: SqliteWasmBlazor 0.9.4-pre with Folio's own migrator (M2)

`SqliteWasmBlazor` is pinned to exactly `[0.9.4-pre]` and used only inside `Folio.Platform.Browser`, behind
`IDatabaseSetup`. Its own initializer starts the OPFS worker; Folio's versioned `DatabaseMigrator` then runs the same SQL
steps as desktop (contexts are not registered with `AddSqliteWasmDbContext`, so no EF migrations run). Consequences:
- The `wasm-tools` workload is required to build the solution (native relink of the SQLite stub); both CI jobs install it.
- `WASM0001` is suppressed in `Folio.Web` only: SQLitePCLRaw declares varargs P/Invokes that are never called there.
- MessagePack is lifted from 3.1.8 to 3.1.12 to clear GHSA-qhrr-8q5h-9q3h.
- The OPFS SAH pool cannot use WAL, so the browser interceptor sets only `foreign_keys` and `busy_timeout`.
- The pre-migration file backup is skipped on the web (there is no database file path); backup export arrives in M7.
Fallback if the package breaks: Bit.Bsqlite, as named in the spec's Risks table.

## D-008 · Web text extraction and metadata use PDF.js (M2)

SPEC M2 step 3 sets a 10 s budget for indexing the 300-page fixture. PdfPig in WebAssembly took 17.9 s (headless
Chromium, this container), so `BrowserPdfTextExtractor` reads text content and metadata with the vendored PDF.js instead:
6.0 s for index + search. Desktop keeps PdfPig. Web pages store plain text only (no line geometry), which is all search uses.

## D-009 · Browser storage layout (M2)

- Shared code stays path-based. The WebAssembly in-memory file system under `/folio` is a working area; OPFS under
  `folio/` mirrors the desktop layout (`library/books/<sha>.pdf`, `library/covers/<sha>.webp`) and is the durable copy.
  At most three imported PDFs stay in memory. The reader, covers and text extraction read OPFS directly in JavaScript.
- Picked and dropped files are copied into an in-memory inbox; the importer moves them into OPFS.
- Book PDFs open from blob URLs revoked when the reader closes (as the spec says). Cover blob URLs are cached, LRU 300.
- Preferences live in `localStorage` (synchronous read through the in-process JS runtime).
- Covers are rendered by PDF.js on the main thread at 512 px (not in a worker with OffscreenCanvas: simpler, and import
  is already a foreground, user-initiated task). Safari without `createWritable` writes through a sync access handle in a
  small worker.
- "Locate PDF" (re-link) is desktop-only (`IPlatformCapabilities.CanRelinkBooks`).

## D-010 · Firefox and WebKit run only in CI (M2)

Playwright's Firefox and WebKit builds cannot be downloaded in this container. Local runs use the preinstalled Chromium
(`FOLIO_E2E_BROWSERS=chromium FOLIO_CHROMIUM_PATH=...`); the `web` CI job runs all three engines.
