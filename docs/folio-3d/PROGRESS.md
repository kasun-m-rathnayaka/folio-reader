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
- [ ] Windows CI job green *(CI)*

## M1 — Platform split

- [x] 1. Removed marginalia (lane, card, note action), Notebook (dialog and library page), OCR (service, JS painting, tests) and quote with citation; data untouched (D-004)
- [x] 2. `Folio.Infrastructure` → net10.0; WinRT rasterizer and battery monitor → `Folio.Platform.Windows` (FileStore stays shared, D-003)
- [x] 3. `IBookUrlResolver`, `IDatabaseSetup`, `IPlatformCapabilities` added; UI uses the resolver instead of hard-coded hosts
- [x] 4. `Folio.Platform.Windows.Tests` (DI, virtual-host URLs, WinRT rasterizer on a fixture)
- [x] 5. Desktop DI registers `AddFolioWindowsPlatform()` and initialises the database through `IDatabaseSetup`

Done when:
- [x] `Folio.Infrastructure.Tests` pass on Linux — 43/43
- [ ] Full Windows CI green, including `test:reader` *(CI)*
- [x] No `net10.0-windows` reference from any shared project
- [x] No marginalia, Notebook, OCR or quote-with-citation code or UI remains; highlights and bookmarks still work (reader test 7/7 on Chromium)
