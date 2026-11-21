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

## D-011 · HTML chrome uses the CSS spring curve, not the Motion library (M3)

The spec offers `cubic-bezier(0.22, 1, 0.36, 1)` over 240 ms as the CSS fallback for HTML springs. Hover tilt, labels and
panels only ever move between two states, so the curve gives the same feel without a runtime dependency; `motion` is not
installed. The 3D stage uses exponential damping as specified.

## D-012 · Covers are served with CORS on desktop (M3)

The details tint and the stage's cover textures read cover pixels. The desktop `folio.covers` virtual host changes from
`DenyCors` to `Allow` so canvases are not tainted. Covers are local, app-generated images.

## D-013 · Route details beyond the spec's table (M3)

- Reading-status filters are `/shelf?status=Reading|WantToRead|Finished`; typing in the library search filters the current
  view through `?q=` (replace, not push), and Enter goes to `/search?q=`.
- Unknown addresses render `/not-found` with a way back.
- The hero is the most recently read book of any status (`GetRecentAsync` no longer requires "Reading").
- Closing the reader returns to the address the book was opened from (deep links return to `/`).

## D-014 · One window listener for scene keys (M3)

Enter, D/Space, Esc, arrows, 1–9 and ? go through one listener in `folio-shell.js` that ignores text fields, dialogs,
menus, the reader, and Enter/Space on a focused control (so its own activation runs once). Pages attach a handler with
`SceneKeys.AttachAsync`.

## D-015 · Accessibility fixes found by axe (M3)

Pre-existing issues fixed: the book card and reader "…" menus had unnamed buttons (MudBlazor put the label on the
wrapper); loading spinners had no name. MudBlazor 8 menu items are not exposed as `menuitem`; tests drive the bottom bar.

## D-016 · Visual baselines come from the container's Chromium (M3)

Baselines were recorded locally on Chromium build 1243; CI installs Playwright 1.62.1's build 1255. If CI reports pixel
differences above 0.1%, the CI images are reviewed from the `web-e2e` artifact and committed as the approved update.

## D-017 · Stage sources live outside wwwroot; the bundle is committed and verified (M4)

Sources are in `src/Folio.UI/stage/` (not served); esbuild bundles them into `wwwroot/js/stage.bundle.mjs`, which is
committed so `dotnet build` needs no Node step. `npm run check` rebuilds it into a temp folder and fails if the committed
bundle differs (line endings normalised). three 0.187.0 and esbuild 0.28.2 are pinned exactly.

## D-018 · Stage details (M4)

- Books are one box mesh with six material groups (fore-edge, spine, top, bottom, cover, back) rather than a rounded box:
  it keeps draw calls low for 300 books. A detailed, hinged model is only needed for the opening animation (M6).
- Contact shadows are soft radial-gradient planes under each book (no shadow maps); quality "shadows off" hides them.
- The featured book (hero, details, opening) sits above the shelf rows, so Hero → Shelf is one continuous camera move.
- Pointer input reaches the stage through the HTML layer (`#folio-main`); clicks on HTML controls are ignored by it.
- The stage adds `OnScrollIntent(direction)` and `OnBookAccent(id, color)` to the bridge contract: Blazor owns
  navigation, so wheel and swipe become intents, and covers' colours feed the HTML accent.
- Software renderers (SwiftShader, Microsoft Basic Render Driver, llvmpipe) fall back to 2D except in stage test mode
  (`?stageTest=1`), which CI uses to exercise 3D.
- Scenes are owned: a page shows a scene and releases only its own, so route changes never leave a stale scene showing.

## D-019 · Shelf scene details (M5)

- Rows: "All books" then each shelf (SHF-1). Up/Down and the wheel move between Hero → All books → shelves; 1–9 jump to
  shelf n; Left/Right move along the row. The first arrow press moves keyboard focus onto the focused book.
- The HTML focus layer is a list with an Open and a Details button per book, visually hidden except a focused control,
  which shows a labelled outline at the bottom left; the 3D pull-out and the bottom bar show the focused book. Hovering a
  spine moves DOM focus (SPEC: accessibility). Space on a book means Details, Enter means Open.
- The stage always holds the whole library; sort and filters (`?sort=`, `?status=`, `?q=`) only decide which books stand
  on the rows, so any book can still open (search results, SRC-2). Changes reflow by damping to new slots (LIB-6).
- Spine cloth is darkened until spine text reaches 7:1 in the texture (≥ 4.5:1 after lighting); sheen is a dim tint of
  the accent. LIB-8's progress ribbon is drawn along the spine's edge.
- Performance gate in CI: CI has no GPU, so the 300-book check asserts main-thread time per frame (p95 ≤ 16.7 ms; measured
  3–5 ms) and records the software-GL frame interval; the 60 fps target is confirmed on hardware at M8.
- Damping snaps within 2e-3 (under 0.05 px, about 0.1°) so long camera moves stop drawing promptly.

## D-020 · Open-book handoff (M6)

- The stage canvas is full-window behind the chrome; a damped projection offset centres scenes on the main area. While a
  book opens, the offset eases to zero and the chrome fades, so the 3D page can be aligned in the reader's coordinates
  without the canvas resizing.
- The reader reports its current page's rectangle after the first render; the stage places the spread's right page in a
  plane facing the camera with a closed-form pose (`opening.js`), then snaps exactly onto it and hands off. Measured
  through the real camera: corner error ≈ 1e-13 px. Timeline overlaps the spec's phases to finish in ~0.8–0.87 s.
- The reader's page shows real content only after the 120 ms crossfade; the 3D page is plain paper (rendering the PDF page
  on the stage as well would double the work for one frame of overlap).
- Reduced motion and Off skip the 3D opening and use the View Transition path (150 ms crossfade / cut).
- "Reader accepts input ≤ 300 ms after" is recorded as a metric: on software GL in CI the main thread is saturated, so the
  absolute number is checked on hardware at M8. The test asserts the reader responds to the keyboard after the handoff.
- Durations in CI are measured on the stage clock (test mode advances 1/60 s per frame).

## D-021 · Firefox and WebKit in CI lack OPFS sync access handles (M2–M6)

Playwright's headless Firefox and WebKit builds fail SqliteWasmBlazor's start-up with "Missing required OPFS APIs", so
the web app cannot open a library there, while current Firefox (111+) and Safari support them. Enabling Firefox's
`dom.fs.*` prefs in CI made start-up hang instead, so it was dropped; the app shows a plain explanation when storage is
missing, and after 30 s if storage never starts. Until those engines pass in CI,
the cross-browser gates for M2 are proven on Chromium only and need a manual check on real Firefox and Safari (M8).

## D-022 · Backup format and battery saver (M7)

- Backup: one `.zip` with `manifest.json` (`{ App: "Folio", Format: 1, Created, Books }`), `folio.db` (SqliteWasmBlazor's
  export) and `library/books/*.pdf`, `library/covers/*` stored uncompressed. Restore validates the manifest, replaces the
  database first (the current library is untouched if that fails), re-runs Folio's migrations, replaces the files, then
  reloads the app. The archive is built in memory: fine for typical libraries; a streaming writer is a later improvement.
- Reminder: after the first successful import, and then at most every 30 days, a notification suggests a backup
  (`AppPreferences.BackupReminderAt`). Export also resets it.
- Desktop has no backup UI (`SupportsLibraryBackup = false`): its library is a folder the user can copy.
- Battery saver (DSK-2): `StageHost` reads `IBatteryMonitor` every 30 s (Win32 power status on desktop; the Battery Status
  API in browsers that have it, else "unknown"). On battery the stage skips frames to stay ≤ 30 fps and turns idle motion
  off. Quality (SET-3) was wired in M4.

## D-023 · Release and hosting (M8)

- `release.yml` deploys Folio Web to GitHub Pages on `main` and attaches a zipped Windows build to a GitHub release for
  `v*` tags (using the workflow token; no secrets). Pages must be enabled with "GitHub Actions" as the source.
- Pages serves a project site under `/<repo>/`: the workflow rewrites the base href, copies `index.html` to `404.html` so
  deep links load the app, and the offline service worker caches HTML without an integrity hash (it is rewritten after
  publish). All in-app addresses are relative to the base href (`FolioRoutes`), and the skip link is a button that moves
  focus, since a `#fragment` link would resolve against the base and navigate home.
- CI runs every end-to-end spec on Chromium and a cross-engine spec on Firefox and WebKit, which runs the core flow where
  the engine has the storage Folio needs and otherwise checks the plain explanation and skips with the reason (D-021).
