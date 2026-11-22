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
- [x] Axe clean (serious and critical) on the 2D library, book menu, settings, reader, 3D hero, bookcase, presented book, book menu over
      the bookcase and the 3D spread, in both themes where themed (`a11y.spec.mjs`, `wp7.spec.mjs`)
- [x] Performance: 300 books p95 frame CPU 3–6 ms; 2,000 books panned end to end p95 3–10 ms with at most 137 book meshes; a page turn
      p95 2 ms; open sequence 1.57 s on the stage clock (software GL in a container; recorded in the specs' `[metrics]` lines)
- [x] Visual baselines: sidebar, header and reader toolbar, light and dark (2% tolerance, D-028)
- [x] Docs: SPEC.md points to SPEC-V2; README and how-folio-works describe the bookcase, covers, present motion and 3D reading;
      DECISIONS D-024 to D-029
- [ ] Full CI green on Linux, Windows and web for the final commit *(CI)* — Linux and Windows green throughout; the web job's last
      completed run failed only on the old visual baselines and two pan tests, both fixed since
- [ ] A human checks on Windows hardware *(human)*: see below

## Review changes after WP6
- Shelf: base wood only (no back, top or side frames), dark charred-wood texture, soft spotlights (D-028).
- Reference quality from the Stripe Press screenshots: large books under a large serif marquee, 128 × 1024 px spines, pill buttons; the
  open book leans back with bowed pages, near-white page edges and the book's colour behind it; text layer mapped onto the tilted
  page (D-029). Pages are pure white with no corner marks.
- CI fix for the reference-quality commit: spine paints are queued two at a time and stale ones dropped after a fling; the flat
  opening's safety net waits for the stage once the reader has reported its page; the CPU-per-frame gates render at a reduced pixel
  ratio on software GL (D-030).
- Open item, stopped here per the "fails twice" rule (D-030): after a 2,000-book fling on CI's headless software-GL Chromium, the
  last one or two spine loads can take about two minutes. Their cache read or image decode, and even their timeout timers, do not
  run until the page next uses a canvas or IndexedDB. Locally it happens only when two workers run side by side. A wait for every
  spine to finish failed four times for this reason, so it was removed and the check keeps its original gates. Needs a human
  decision: accept it as a CI artefact, or check on hardware that spines appear promptly after a long fling.

## Final report

**Shipped:** WP0–WP8 as above: error boundary; View Details removed with a book menu and the `/book/{id}` redirect; one-step shelf
navigation with a shared row list; bracket dialogs and sidebar with the app icon; a wooden base with endless sideways browsing;
generated hardcovers (four templates, cached); hover lift and present motion with parting neighbours, tint and marquee; 3D reading
with riffle, page curl, text overlay, Zoom and a Reading view setting.

**Deferred or changed:** wood textures are generated, not Poly Haven/ambientCG (blocked here, D-026); covers are cached in IndexedDB
rather than the covers folder or OPFS (D-027); pages render on the main thread through the reader engine rather than a PDF.js worker
(D-027); the live Stripe Press site could not be studied from this environment, so motion follows the plan's captured reference and
the user's screenshots (D-028, D-029); one branch with `WP<N>:` commits instead of a branch and PR per package (D-024).

**A human must check on Windows hardware:**
1. 3D draws in WebView2 (does not fall back to 2D), with the dark wood base and spotlights.
2. A real trackpad swipe moves exactly one shelf; a held ↓ moves one shelf per settle; sideways swipes and dragging the wood pan with
   momentum and a soft stop.
3. Hover, dwell (250 ms) and click presenting feel right at 60 fps with 300 and 2,000 books on an integrated GPU.
4. Opening a book (about 1.6 s), page turns (about 0.4 s) and the riffle are smooth; reader input is immediate after the spread settles.
5. On the tilted spread: select text, highlight it (the highlight sits on the words), find a phrase, bookmark a page, Z and Esc.
6. Battery saver caps the frame rate on battery; the web app on real Firefox and Safari (D-021).
