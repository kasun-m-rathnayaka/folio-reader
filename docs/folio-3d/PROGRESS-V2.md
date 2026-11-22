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
- [ ] pending

## WP7 — UI clean-up
- [ ] pending

## WP3 — Wooden bookcase and endless browsing
- [ ] pending

## WP5 — Covers and spines
- [ ] pending

## WP4 — Hover and present motion
- [ ] pending

## WP6 — 3D reading mode
- [ ] pending

## WP8 — Hardening
- [ ] pending
