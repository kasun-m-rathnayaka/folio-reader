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
