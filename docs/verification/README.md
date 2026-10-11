# Folio recovery release verification

Date: 2026-10-11. Target: personal daily use on Windows; the full product specification remains the longer-term backlog.

## Evidence

| Check | Result and limits |
|---|---|
| Solution / release build | Compiles with warnings treated as errors. |
| Domain tests | 18 pass. |
| Infrastructure tests | 57 pass, including historical-schema upgrades, WAL-aware snapshots, restore rejection, trash/restore, paged queries, manual status, managed-file repair, and idle-worker behavior. |
| WPF close tests | 2 pass. A real WPF window closes correctly with immediate and delayed flushes; repeated close requests flush once. |
| JavaScript geometry tests | 4 pass. Quarter-turn round trips, page-edge clipping, and navigation bounds. |
| Browser reader integration | 7 scenarios pass, including a check against the existing-library PDF. These test the PDF engine; they do not substitute for the complete desktop workflow. |
| Native desktop inspection | Existing book opens; covers load; selection toolbar appears; highlight and note persist; Notebook shows the note and reopens its source page; Ctrl G navigates to page 42; stored page index is 41 after restart. |

The browser engine opened the synthetic 300-page fixture in 316 ms in the recorded run. Highlight alignment differed by less than 0.002 CSS pixels in width, with zero difference in top/left. Jumping to the final page retained two page canvases. **These are engine smoke measurements, not certification of the specification's native startup, FPS, latency, or memory budgets.**

The initial assessment had 62 passing .NET tests while opening a book failed with a missing bookmark column. The new tests exercise the actual startup migration path rather than relying only on `EnsureCreated()`.

## Desktop screenshots

The first two captures below show the user's existing library and book. Later captures were taken in an isolated verification profile containing repository fixtures and a separately imported book. Test annotations live in that profile.

- [Existing library with working cover](screenshots/library-dark.png)
- [Existing PDF opens](screenshots/reader-original.png)
- [Revised library with multiple books](screenshots/library-final.png)
- [Saved highlight](screenshots/highlight-desktop.png)
- [Saved note beside the highlighted passage](screenshots/reader-notes.png)
- [Global Notebook](screenshots/notebook.png)
- [Highlight after reopening](screenshots/highlight-reopened.png)
- [Go to page 42](screenshots/reader-page42.png)

Desktop automation sometimes required the user to bring Folio to the foreground. Black captures and captures of another foreground window were not treated as application evidence.

## Defects found during verification

- The entity model expected fields that the startup migration never created. Forward migrations repair the schema and preserve existing data.
- Cover URLs used `file:///` from a web origin. A local cover host fixes delivery.
- JavaScript replaced Blazor-owned children. The PDF engine now owns a dedicated viewport.
- Continuous scrolling repeatedly delayed autosave. Position reporting is throttled and persistence runs periodically.
- A PDF.js 6 link conversion API differed from the older implementation. Link geometry now converts both rectangle corners using the installed API; the existing-book regression verifies this path.
- WPF rejected `Close()` called recursively from `Closing` when an awaited save completed synchronously. A coordinator posts the final close to the dispatcher, with dedicated WPF tests for both timing cases.
- Background wakeup signals were not consumed, permitting idle busy loops after work. The worker drains stale signals and cancels timed-out waits; a regression test verifies it returns to idle.

## Release scope and remaining gates

| Area | Current scope |
|---|---|
| Library | PDF picker/file-argument import, de-duplication, per-file results, cancellation, grid/list, sorting, status filters, shelves, metadata edits, recoverable Trash. |
| Reader | Continuous/single page, zoom/fit, rotation, text selection, find, contents, page previews, bookmarks, focus mode, persisted position. |
| Notes | Highlights, underlines, typed comments, Notebook and page links, Markdown/JSON/CSV export. |
| Recovery | Verified migration snapshots, staged restore, optional PDFs/covers in archives, weekly backups, matching-hash relink. |
| Deferred features | OCR/reflow, narration, AI study/model-management UI, library-wide indexed PDF text search, recursive folder/drag-drop import, customizable shortcuts, automatic trash expiry/permanent-empty UI, richer reading statistics. |
| Qualification still required | Long-session soak testing, native 5,000-book/DPI benchmarks, forced-kill/power-cut stress, full accessibility audit, network-block verification, coverage measurement against the specification's 80% target, and public installer/licensing/upgrade qualification. |

The release is a tested core reader recovery. It is **not a claim that every requirement in the original specification is production-qualified**.

## Reproduce

Use the commands in the root README. Browser tests write machine-readable results to `.artifacts/reader-tests/results.json` and an engine screenshot to `.artifacts/reader-tests/highlight-alignment.png`.

For desktop checks, start a separate profile with `--data-root`, import the synthetic fixtures, then select text, highlight, edit its note, return to the library, open Notebook, and follow its page link. Navigate to another page and close/reopen the app. Compare the displayed page with the stored zero-based index. Never use a real user's notes as disposable test data.
