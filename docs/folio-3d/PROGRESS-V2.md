# Folio 3D v2 — Progress (SPEC-V2)

Work packages in run order. Each is a series of commits prefixed `WP<N>:` on the session branch (D-024).
Gates marked *(CI)* are proven by GitHub Actions; *(human)* needs real hardware.

## WP0 — Safety net
- [x] A thrown exception in any page shows the recovery panel and is logged; the app keeps running (`safety-net.spec.mjs`)
- [x] The cause of the details crash is recorded in DECISIONS.md (D-024)

## WP1 — Remove View Details
- [x] No VIEW DETAILS button, D shortcut, `details` scene or details route remains
- [x] `/book/{id}` redirects to the shelf with that book in focus (`routes.spec.mjs`)
- [x] Edit, Move to shelf and Move to Trash work from the book menu in 3D and 2D

## WP2 — Shelf navigation
- [x] A simulated trackpad swipe (30 wheel events over 1.2 s) moves exactly one shelf (`shelf-nav.spec.mjs`, `input.test.mjs`)
- [x] A held ↓ key moves one shelf per settle (`ShelfNavigatorTests`, `shelf-nav.spec.mjs`)
- [x] Creating, renaming or reordering a shelf and switching to it at once lands on the right row, with the camera's height
      changing in one direction in every sampled frame

## WP7 — UI clean-up
- [x] Create shelf, Manage shelves and the sidebar match the bracket design in light and dark (`wp7.spec.mjs`; visual baselines in WP8)
- [x] The shelf-name row under All books is gone
- [x] The app icon shows in the sidebar (relative path, so it works on the Pages sub-path)

## WP3 — Wooden bookcase and endless browsing
- [x] Planks, uprights, back panel and labels render with wood textures in both themes (`wp3.spec.mjs`; generated textures, D-026)
- [x] A row of 2,000 synthetic books pans end to end: p95 frame CPU time ≈ 10 ms on software GL (`wp3.spec.mjs`)
- [x] Panning has momentum and a rubber-band stop at both ends; vertical gestures never pan

## WP5 — Covers and spines
- [x] Every book shows its title and author typeset on the cover and spine, never page 1's text (`wp5.spec.mjs`, `cover.test.mjs`)
- [x] All four templates render; a given book always gets the same design
- [x] Generated covers are cached and reused after restart (IndexedDB, D-027)

## WP4 — Hover and present motion
- [x] Hover lifts within about 250 ms; a 250 ms dwell, a click or an arrow presents (`wp4.spec.mjs`, `present.test.mjs`)
- [x] Neighbours part without books intersecting, from 8 to 60 mm thick (`present.test.mjs`)
- [x] The background tint and title marquee follow the presented book; reduced motion does not lift

## WP6 — 3D reading mode
- [x] Open → riffle → spread completes in 1.57 s on the stage clock; any key or click skips (`reading.spec.mjs`)
- [x] ← / → turn pages with a curl in 0.4 s; p95 frame CPU 2 ms; the address updates every turn
- [x] On the 3D spread, select text, highlight it and find a phrase; the overlay is within 2 px of the page corners
- [x] Z crossfades to the flat reader at the same page; Esc returns to the spread; Esc closes the book to its slot

## WP8 — Hardening
- [ ] pending
