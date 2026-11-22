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

Baselines were first recorded locally on Chromium build 1243; CI installs Playwright 1.62.1's build 1255, which renders
about 1% of pixels differently. The approved baselines are therefore CI's: on a mismatch in CI, the visual spec prints the
actual image (base64) in the log, which was reviewed and committed. Local runs on another Chromium build will differ.

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

## D-024 · Fixes and Stripe Press motion plan (SPEC-V2): branches, safety net and the details crash

- SPEC-V2 asks for one branch and one PR per work package. This session may push to a single branch only (D-001), so
  the work packages are separate commits on `kasunr/sleepy-hypatia-kzdvvv`, each prefixed `WP<N>:`, with progress in
  `PROGRESS-V2.md`. PR #1 was merged, so the branch restarted from `main` (`f404ddd`) and new commits feed a new PR when
  one is requested.
- SPEC-V2 asks for commit messages with no AI attribution or trailers; commits in this series follow that.
- WP0: `FolioErrorBoundary` wraps every routed view (both the library and the reader render paths) and logs through
  `ILogger`; a new address recovers it. The desktop `index.html` has the `blazor-error-ui` bar, and the WPF dispatcher and
  unobserved-task exceptions are logged and handled. `/__fault` (no links, no data) throws on render so the end-to-end
  suite can prove the boundary works (`safety-net.spec.mjs`).
- Cause of the details crash: the desktop log from the user's machine is not available in this container, so it could not
  be read, and the failure does not reproduce on the web host (the details path is exercised by CI on Chromium). The
  difference between hosts on that path is the desktop-only WebView2 cover host (`https://folio.covers`, read through a
  canvas by `applyBookTint`), so an unhandled exception there is the likeliest source. The page, the scene and that
  JavaScript are removed in WP1, and the boundary now logs any similar fault to `%LocalAppData%\Folio\logs`.

## D-025 · View Details removed (WP1)

- Deleted `BookDetailsPage`, the `details` stage scene and camera/pose cases, `StageScene.Details`, `applyBookTint`, the
  `D`/Space shortcuts and the Details buttons. `/book/{id}` is kept as `BookRedirectPage`: it redirects (replace) to
  `shelf?book={id}`, which brings that book into focus on the shelf.
- `BookMenu` holds Edit details, Move to shelf (toggles) and Move to Trash. It opens from `[ ⋯ ]` in the bottom bar and from
  right-click or the context-menu key on a book (3D focus layer, the stage canvas, and 2D cards).
- A click in the stage now presents a book (`present`); a click on the presented (or hero) book opens it (`open`).
- `detailsTint` became `accentTint` (still contrast-checked); the stage uses it for the presented book's background (WP4).
- The reading-status buttons on the shelf scene stay for now: they filter the row (LIB-6) and are not duplicated by the
  sidebar's links, which change the route rather than the filter on the current shelf. Revisit if the user asks.


## D-026 · Shelf navigation, UI clean-up and the bookcase (WP2, WP7, WP3)

- **One step per gesture (WP2).** `GestureGate` (`stage/input.js`) adds wheel deltas within a gesture and fires one intent at
  40 px; a gesture ends only after 180 ms with no wheel events, so trackpad momentum cannot fire a second step. Horizontal
  gestures and Shift + wheel are pans. `ShelfNavigator` owns the rows, a version, `CurrentIndex`, `TargetIndex` and
  Idle/Travelling; the stage reports arrival (camera within 3 mm of the row) and the navigator returns to Idle then, with a
  900 ms watchdog. A scene carries `rowIndex` and `rowsVersion`; a stage holding another version asks .NET to resend the
  library (`OnRowsStale`) and applies the scene afterwards, never falling back to row 0.
- **Held ↑ / ↓ keys.** SPEC-V2 says repeats are ignored and also that a held key moves one shelf per settle. Both hold: a
  repeat while travelling is dropped, and once the navigator is idle again the next repeat moves one more shelf. A fresh press
  while travelling queues at most one more step. Every row change is a camera move; long jumps (keys 1–9, sidebar) use a
  faster damping rate so they land within 0.7 s.
- **WP7.** Icons are one `FolioIcon` component with inline paths (1.25 px, `currentColor`) instead of separate `.svg` files, so
  they take the muted/active text colour from CSS. `MudDialogProvider` now closes on Escape (it did not before). Manage shelves
  renames in place (Enter or leaving the field), reorders by handle drag or arrows, confirms deletion in the row, and refreshes
  the shared row list after every change so the sidebar and bookcase update live. The reading-status buttons stay (D-025).
- **Wood textures are generated, not downloaded.** Poly Haven and ambientCG are not reachable from this build environment, so
  `scripts/gen-wood.mjs` writes 1K seamless colour, normal and roughness maps (`wwwroot/assets/wood/oak-*.png`) from
  deterministic periodic noise. They are original work, need no licence, and can be replaced by photographed CC0 sets under
  the same file names. Wood adds three shared textures and no per-book cost.
- **Bookcase.** One case: a plank under every row plus a crown, uprights every 96 cm and at both ends, a back panel per row
  (one plane per row, not per bay, so the grain is continuous), a baked shadow strip under each plank, and a brass plate on each
  bay's plank with the shelf name. UVs are in world units (one tile per 60 cm) with a random offset and the odd flip per board.
  Dark theme multiplies the oak toward walnut. A short row sits in a case at least 288 cm wide, centred on its books.
- **Endless browsing.** `Pan` keeps position and velocity (friction 4/s, 20 cm rubber band, spring 8/s, recentre 6/s). Drag on
  empty wood or the back panel, horizontal wheel and Shift + wheel pan; the pan position is the camera's x (undamped, so the
  row follows the hand). Only books within 1.5 view widths of the camera on the current and adjacent rows have meshes (a pool of
  reused meshes, binary search over the row's sorted positions).

## D-027 · Present motion, generated covers and 3D reading (WP4, WP5, WP6)

- **Present (WP4).** Hover lifts a spine 8 mm up and 4 mm forward at once (λ = 12, about 250 ms). Resting 250 ms on the same book,
  a click, or an arrow key presents it: it turns 90° to face the camera, comes 9 cm forward and leans back 2°; neighbours part by
  half the cover width − half the thickness + 1 cm (nearer ones faster, λ 10 against 7); the row recentres on it; the page
  tints with its contrast-checked accent and the title marquee slides to its title. Only presenting recentres, never a hover.
  Reduced motion and Off do not lift; presenting snaps (the 150 ms crossfade the plan names is a cut for books, since there is
  nothing to fade between). A presented book's large cover is released again once it has turned away.
- **Covers (WP5).** `cover-composer.js` paints every cover (1024 × 1536, 512 × 768 on the shelf) and spine (128 × 1024, 64 × 512) from
  the title and author; the PDF's page 1 only feeds the Plate halftone and the cloth colour. Templates (plate, marble, line, cloth)
  are chosen by an FNV hash of the book id; the cloth is page 1's dominant colour when it is colourful and carries the title at
  4.5:1, else the nearest of 12 curated colours. Foil is a roughness/metalness texture (G, B) written with the title and mark;
  cloth covers deboss the title through a normal map. `HardcoverGeometry` is one merged mesh with 8 material groups.
  Shelf books load only a spine; the cover is painted when a book is presented or featured.
- **Cover cache.** The plan says covers are cached in the covers folder (desktop) and OPFS (web). They are cached as PNG blobs in the
  origin's IndexedDB instead (`cover-cache.js`), which both hosts have and which needs no change to `IFileStore` or the .NET
  side. The cache key holds the book id, the design version and a hash of title and author, so edits repaint. The 2D books
  (`CssBook`) call `bookImages` in the stage bundle, so they show the same images.
- **3D reading (WP6).** Pages are rendered by the reader engine itself (`renderPageImage`, main thread) rather than by a separate
  PDF.js worker with `OffscreenCanvas`: the engine already owns the loaded document, and this avoids loading the PDF twice.
  Textures: 8-page LRU, spreads either side prefetched, a 480 px preview shown first. The engine gained a `spread` layout: the
  stage dispatches `folio-spread` with the two pages' rectangles (viewport pixels, fitted to each page's aspect) and the engine
  fixes its page wrappers (text layer, links, highlights, dog-ears) over them with the canvases not drawn; `folio-goto` and
  `folio-turn` go the other way. The reader's selection, quick bar, highlights, bookmarks and find therefore work unchanged.
  Open: forward 300 ms, cover 400 ms, lay open 300 ms, riffle (up to 12 leaves, 50 ms apart) and settle 200 ms: 1.57 s on the stage
  clock. A neighbour spread is one curl (400 ms); Home, End, find and contents riffle. Any key or click skips (input that started
  the opening does not). Spreads are (1,2), (3,4)… with page 1 alone on the right.
- **Reading view and Zoom.** Settings → Reading view (3D book | Flat pages). 3D reading needs the stage and Motion ≠ Off; reduced
  motion opens and turns without a riffle or curl. Z shows the flat reader at the same page (the stage pauses); Esc returns to the
  spread, and Esc again closes the book. A deep link or reload opens the 3D book too, from the hero position. Closing returns the
  book to its slot while the library appears.
- **Shadow of the lifted leaf** is two soft strips under the fold rather than a shadow map: no light or draw-call cost.

## D-028 · Base-only shelf, dark charred wood and spotlights; white pages (after review)

- **Base only.** The bookcase is now one wooden base plank under each row and nothing else: the back panels, uprights, end caps,
  crown, baked shadow strips and brass plates are gone (`bookcase.js`). Books stand directly on the planks in an open dark space.
- **Wood.** The generated maps (`scripts/gen-wood.mjs`) now draw dark, charred wood: about 84 fine ridges per 60 cm tile that flow like
  contour lines and part around knots, near-black with warm brass glints on the ridge tops and glossy ridges over matt grooves.
  The wood is the same in both themes.
- **Lights.** Soft spotlights hang in the dark every 72 cm above each row: a faint cone widening downwards (a shader plane behind the
  books) and a pool of light on the plank (a shader plane on the wood), both additive. They soften to about a third of their strength
  in the light theme, where they would only wash the page out.
- **Stripe Press.** The site could not be fetched from this environment (the hosts do not resolve), so the motion follows the reference
  captured when the plan was written: spine lift, turn to the cover on selection, neighbours parting, recentring, tinted
  background and title marquee. To compare against the live site, allow `stripe.press` in the environment's network settings.
- **Pages.** In the 3D book the page paper is pure white, so letterboxing around a PDF page that is not 2:3 is invisible (no yellow
  band), a flat page is not shaded, and the dog-ear corner marks are hidden (BOOKMARK in the toolbar still bookmarks the page).
- **Visual baselines** now cover the sidebar, header and reader toolbar, rendered here with a 2% pixel tolerance. The library page body
  is not compared because the generated covers differ per book id.
