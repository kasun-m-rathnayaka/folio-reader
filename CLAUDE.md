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

## Environment notes (cloud container)
- The .NET 10.0.4xx SDK is not reachable from builds.dotnet.microsoft.com here. Install it from Microsoft's Debian 12 apt repo
  (packages.microsoft.com/debian/12/prod: dotnet-sdk-10.0 and its runtime/targeting/host packages), extracted into ~/.dotnet.
- Branch: cloud sessions may be restricted to one development branch; see DECISIONS.md D-001.
