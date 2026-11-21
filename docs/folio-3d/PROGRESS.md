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
- [x] Import, open, highlight, reload — book and highlight persist: Chromium (local); Firefox and WebKit *(CI)*
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
- [x] Visual snapshots for library, details and reader toolbar in light and dark (`visual.spec.mjs`; D-016)
- [x] Axe: no serious or critical issues on library, details, reader and settings in both themes; reduced-motion check passes
- [x] Back and Forward work across all routes on the web (`routes.spec.mjs`), deep link `?page=12` opens page 12
