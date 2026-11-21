# Folio 3D — Progress

Resume from the first unchecked step. Gates marked *(CI)* are proven by GitHub Actions; *(human)* needs real hardware.

## M0 — Baseline and environment

- [x] 1. .NET SDK 10.0.404 and Node installed; `npm ci` in `src/Folio.UI`
- [x] 2. Linux build with `-p:EnableWindowsTargeting=true` — 0 warnings, 0 errors
- [x] 3. Linux checks: Domain tests 10/10, `npm run check`, `npm test` 7/7
- [x] 4. `ubuntu-latest` CI job added beside the Windows job
- [x] 5. `docs/folio-3d/` with SPEC, PROGRESS, DECISIONS; `CLAUDE.md` at the root

Done when:
- [x] Linux build succeeds with zero warnings under `-warnaserror`
- [x] Windows CI job green *(CI)* — run 44950422834

## M1 — Platform split

- [x] 1. Removed marginalia (lane, card, note action), Notebook (dialog and library page), OCR (service, JS painting, tests) and quote with citation; data untouched (D-004)
- [x] 2. `Folio.Infrastructure` → net10.0; WinRT rasterizer and battery monitor → `Folio.Platform.Windows` (FileStore stays shared, D-003)
- [x] 3. `IBookUrlResolver`, `IDatabaseSetup`, `IPlatformCapabilities` added; UI uses the resolver instead of hard-coded hosts
- [x] 4. `Folio.Platform.Windows.Tests` (DI, virtual-host URLs, WinRT rasterizer on a fixture)
- [x] 5. Desktop DI registers `AddFolioWindowsPlatform()` and initialises the database through `IDatabaseSetup`

Done when:
- [x] `Folio.Infrastructure.Tests` pass on Linux — 43/43
- [x] Full Windows CI green, including `test:reader` *(CI)* — run 44950422834
- [x] No `net10.0-windows` reference from any shared project
- [x] No marginalia, Notebook, OCR or quote-with-citation code or UI remains; highlights and bookmarks still work (reader test 7/7 on Chromium)

## M2 — Web host (2D, today's look)

- [x] 1. `Folio.Web` (Blazor WebAssembly standalone, PWA manifest and service workers) on `Folio.UI` + `Folio.Platform.Browser`
- [x] 2. `OpfsFileStore`, SqliteWasmBlazor `IDatabaseSetup` with the existing migrations, `PdfJsCoverRenderer`, blob-URL
      `IBookUrlResolver`, file/folder pickers and drag-and-drop import, `localStorage` preferences (D-007, D-009)
- [x] 3. Search speed on the 300-page fixture: PdfPig 17.9 s → switched web extraction to PDF.js: 6.0 s (D-008)
- [x] 4. `tests/Folio.Web.E2E` (Playwright) with the fixture PDFs; `web` CI job on Chromium, Firefox, WebKit

Done when:
- [x] Import, open, highlight, reload — book and highlight persist: Chromium (local and CI)
- [ ] Same on Firefox and WebKit — blocked in CI: Playwright's builds lack OPFS sync access handles (D-021); manual check on real browsers at M8
- [x] Library search returns "Paragraph 15.1" from `01_single_column_book_300p.pdf` on page 15
- [x] `dotnet publish src/Folio.Web` produces a static site that runs from a plain file server (`tests/Folio.Web.E2E/serve.mjs`)

## M3 — Design system, routes and 2D books

- [x] 1. Tokens (`--folio-*`, mapped onto the md-sys names so MudBlazor dialogs restyle), self-hosted OFL fonts (Instrument
      Serif, Inter, JetBrains Mono), `BracketButton`, restyled header, sidebar, bottom bar, dialogs (`folio-library.css`)
- [x] 2. Blazor Router: `/`, `/shelf/{id?}`, `/book/{id}`, `/book/{id}/read?page=`, `/search?q=`, `/trash`, `/settings` (D-013)
- [x] 3. `CssBook.razor` (CSS 3D cover, spine, page block, ribbon) and the 2D library with hero, marquee and bottom bar;
      details page with contrast-checked tint (DET-1) and highlight/bookmark counts (DET-2)
- [x] 4. View Transition from book to reader and back (OPN-3), feature-detected; reduced = 150 ms crossfade, off = cut
- [x] 5. Settings: Motion (SET-1), Library style (SET-2) and 3D quality (SET-3, used from M4)

Done when:
- [x] Visual snapshots for library, details and reader toolbar in light and dark (`visual.spec.mjs`; baselines rendered and approved from CI, D-016)
- [x] Axe: no serious or critical issues on library, details, reader and settings in both themes; reduced-motion check passes
- [x] Back and Forward work across all routes on the web (`routes.spec.mjs`), deep link `?page=12` opens page 12

## M4 — Stage core and hero

- [x] 1. three 0.187.0 + esbuild 0.28.2 (pinned); `npm run build:stage` → `wwwroot/js/stage.bundle.mjs`; bundle, fonts and
      "no remote URLs" verified by `npm run check` (D-017)
- [x] 2. `StageHost.razor`, `StageJsBridge.cs`, `StageState`; render-on-demand loop, visibility pause, context-loss handling,
      quality manager (`quality.js`), test mode `?stageTest=1`, stats on `window.__folioStage`
- [x] 3. `book-factory.js`, `textures.js`: cover (≤ 512 px), spine (64 × 512, Instrument Serif + Inter), page edges,
      dominant colour, LRU of 120 books
- [x] 4. Hero scene with marquee and HTML overlay (LIB-1, LIB-2, LIB-4); idle turn and pointer tilt
- [x] 5. Fallback: no WebGL2, software renderer, double context loss, persistent slowness → 2D

Done when:
- [x] Hero renders real covers from fixtures on web (`stage.spec.mjs`); desktop *(CI build; human check at M8)*
- [x] Zero frames rendered after 2 s idle (`window.__folioStage.stats.frames` unchanged)
- [x] Forcing WebGL off shows the 2D library with no errors

## M5 — Shelf scene and navigation

- [x] 1. Shelf scene: rows per shelf, focus pull-out (24 mm, 6°), camera travel, wheel/swipe/keys (LIB-3, LIB-5, SHF-1)
- [x] 2. HTML focus layer synchronised with 3D focus both ways; polite live region ("Shelf: Design, 14 books")
- [x] 3. Sort and filter reflow (LIB-6), progress ribbon (LIB-8), empty shelf + Add books and import slide-in (LIB-7),
      live shelf updates through `LibraryEvents` (SHF-2) (D-019)

Done when:
- [x] Keyboard only: every book on three shelves reached, one opened, Escape returns to the same shelf (`shelf.spec.mjs`)
- [x] 300 synthetic books: main-thread p95 3–5 ms per frame, 197–212 draw calls, textures capped at 120 books; recorded in
      `perf-shelf-300.json` (D-019 — absolute 60 fps confirmed on hardware at M8)

## M6 — Details and the open-book transition

- [x] 1. Details scene: book turned to face the reader, stage background tinted with the contrast-checked accent; HTML
      panel with highlight and bookmark counts (DET-1, DET-2)
- [x] 2. Opening: forward → cover swings open → spread aligns to the reader's reported page → 120 ms crossfade (OPN-1)
- [x] 3. Close: spread fades in over the reader, cover closes, book returns to its place (OPN-2); search results use the
      same path and land on the matching page (SRC-2) (D-020)

Done when:
- [x] At handoff the 3D page and reader page differ by ≤ 2 px at the corners — measured ≈ 1e-13 px (`open.spec.mjs`)
- [x] Open completes in ≤ 900 ms (stage clock: 817–867 ms); reader accepts input after the crossfade — absolute ≤ 300 ms
      to confirm on hardware at M8 (D-020)

## M7 — Web parity and desktop polish

- [x] 1. `navigator.storage.persist()` at start-up; storage status in Settings; backup export and restore (WEB-4, D-022);
      offline service worker caches every published asset and serves `index.html` for in-app addresses (WEB-1)
- [x] 2. Battery saver (DSK-2) and 3D quality setting (SET-3)

Done when:
- [x] Offline: after the first visit the app loads and opens a stored book with the network disabled (`offline.spec.mjs`)
- [x] Backup round trip restores books, highlights, bookmarks and positions into an empty profile (`backup.spec.mjs`)

## M8 — Hardening and release

- [x] 1. Qualification: axe clean on 2D (both themes) and 3D hero, shelf and details; keyboard path; performance metrics
      recorded (`perf-shelf-300.json`, handoff metrics). Fixed: sub-path routing, skip link, NaN reader offset, stale
      announcements, idle frames after long moves
- [x] 2. `README.md`, `docs/how-folio-works.md` and a pointer from the original product spec updated
- [x] 3. `release.yml`: Folio Web → GitHub Pages on `main`; Windows build → GitHub release on `v*` tags (D-023)
- [x] 4. Dead code reviewed: removed in M1–M3 (Notebook, OCR, marginalia, quote, carousel, BookCover); study tables kept
      for compatibility; the 2D library remains the fallback

Done when:
- [x] All automated quality gates pass *(CI)* — run 44962290021 on `c4d3551`: linux, windows (incl. `test:reader` on Edge) and web (Chromium full suite; Firefox/WebKit cross-engine check skipped with reason, D-021)
- [ ] A human has used the Windows build on real hardware and signed off here *(human)*. Please also check: 60 fps with
      300 books on an integrated GPU, open ≤ 900 ms and reader input ≤ 300 ms in real time, WebView2 3D (not falling
      back), battery saver, and the web app on real Firefox and Safari (D-021)
