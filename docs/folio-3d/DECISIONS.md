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
