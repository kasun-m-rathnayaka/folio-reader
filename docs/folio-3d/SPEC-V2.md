# Folio 3D — Fixes & Stripe Press Motion: Implementation Plan

Nov 22, 2026 · @Kasun Rathnayaka

## Summary

This plan turns the shipped Folio 3D (main at `f404ddd`, milestones M0–M8 done) into a Stripe Press–quality library in nine work packages, WP0–WP8. It removes the crashing View Details feature, fixes shelf switching, and replaces the flat shelves with one tall wooden bookcase you can scroll left and right without limit. Books turn to show their cover with the reference site's motion, and covers get a new hardcover look with the book's own title typeset on them. Reading also moves into 3D: the book opens, riffles to your page, and turns pages with a real curl.

Two decisions shape everything below:

- **Hover versus select.** On the reference site a hover only lifts a spine; the turn-to-cover move happens on selection. You asked for the full move on hover, so Folio does it after a short dwell (250 ms) on a book, or at once on click or arrow keys. A plain hover still lifts the spine immediately, so the shelf never chases the pointer.
- **3D reading keeps every reading feature.** Pages are PDF.js renders on a 3D spread. When the spread is at rest, a transparent PDF.js text layer is laid exactly over it, so selection, highlights, find and bookmarks keep working. The existing 2D reader stays as Zoom mode for long or dense documents.

### Done means

- [ ] View Details, its route, scene and shortcuts are gone, and no path can reach the old crash
- [ ] One wheel or trackpad gesture, or one key press, moves exactly one shelf, always with the vertical camera move
- [ ] Shelves are textured wood in one bookcase; each shelf scrolls horizontally through all its books
- [ ] Hovering a book lifts it; dwelling or clicking turns it to its cover, parts its neighbours and recentres the row
- [ ] Every cover and spine uses the new design with the book's title, author and the Folio mark
- [ ] Opening a book plays open → riffle → spread; arrow keys turn pages with a curl; highlights still work
- [ ] Create shelf, Manage shelves and the sidebar use the bracket design; the duplicate shelf list on the home page is gone; the app icon shows in the sidebar
- [ ] All existing tests pass, updated where behaviour changed, and new tests cover each item above

## Issues and requests

Each row comes from reading `main` at `f404ddd`. Causes marked *confirmed* follow directly from the code; *likely* ones still need a reproduction on Windows.

| # | Item | Type | Cause in the current code | Fix (work package) |
| --- | --- | --- | --- | --- |
| 1 | View Details crashes the app | Bug → remove | *Likely:* an unhandled exception on the details path. The desktop host has no `ErrorBoundary` and no `blazor-error-ui`, so any exception in `BookDetailsPage` or the `details` scene stops the BlazorWebView. The exact exception should be in the local log under the data folder. | Remove the feature (WP1); add an error boundary so no future exception freezes the app (WP0) |
| 2 | Hover motion is weak | Change | *Confirmed:* `shelfPose` only slides the focused book 2.4 cm forward and turns it 6°; there is no turn to the cover, no neighbour movement and no row recentring | Hover lift plus dwell-to-present motion (WP4) |
| 3 | Shelves look flat | Change | *Confirmed:* `buildPlanks` draws one 1.2 cm box per row with a flat dark material (`0x1c1a17`); no wood texture, uprights or back panel | Wooden bookcase with CC0 wood textures (WP3) |
| 4 | Shelf width should be unlimited | Change | *Confirmed:* `cameraX` clamps the camera to the row's ends and horizontal movement only follows keyboard focus; there is no horizontal scroll, drag or trackpad pan | Free horizontal browsing with inertia (WP3) |
| 5 | Covers should match the reference style | Change | *Confirmed:* the front face is the raw PDF page-1 render (`loadCover`), so each cover shows the PDF's own text | Generated hardcover designs with the book title (WP5) |
| 6 | Shelf switching skips shelves or snaps | Bug | *Confirmed:* the wheel handler drops events for only 450 ms, but a trackpad swipe sends momentum events for 1–2 s, so one swipe fires two or three steps. Held arrow keys repeat without any limit. Each step reads the route's `ShelfId`, not the shelf the camera is travelling to. In the stage, a shelf id missing from its rows silently becomes row 0 (All books), a jump with no animation | Shelf navigation state machine (WP2) |
| 7 | Reading should animate like the reference | Change | *Confirmed:* the 3D book only opens and hands off to the 2D reader; there is no riffle, no 3D spread and no page curl | 3D reading mode (WP6) |
| 8 | Shelf dialogs and sidebar look old | Change | *Confirmed:* `CreateShelfDialog` and `ManageShelvesDialog` use `folio-primary-btn` and `folio-subtle-btn`; the sidebar uses Material icons and sans labels | Restyle to bracket design (WP7) |
| 9 | Shelf names repeat under All books | Change | *Confirmed:* `LibraryPage` renders a `folio-row-index` nav listing every shelf, which duplicates the sidebar | Remove the nav (WP7) |
| 10 | App icon missing top-left | Bug | *Confirmed:* the sidebar brand button shows only the "FOLIO" wordmark; `wwwroot/images/folio-logo.png` exists but is never used | Add the icon (WP7) |

## Reference behaviour

Observed on [stripe.press](https://stripe.press/) on 22 Nov 2026 by stepping through each interaction and capturing frames at 0, 300 and 1,500 ms. Folio copies the motion and construction, never Stripe's artwork, fonts, mark or layout.

### Catalogue shelf

| Moment | What happens |
| --- | --- |
| Hover a spine | The spine lifts by roughly 3–4% of its height and settles in about 250 ms. Nothing else moves. |
| Select (click or arrow) | Within about 300 ms the row pans so the selected book sits centre. The book turns about 90° on its vertical axis to face the viewer and comes slightly forward. Neighbours slide apart to leave room for its cover width. The previously selected book turns back to spine-out. |
| Same moment, page | The background fades to a colour taken from the selected cover. A large serif title marquee slides to the new title, with the neighbours' titles cut off at the edges. The bottom bar updates the book name. |
| Spines while panning | Spines at the edges of the view show a little of their side because of the wide perspective, so the row reads as solid objects rather than a flat strip. |

### Covers and spines

- **Construction:** a real hardcover. The boards overhang the page block by a few millimetres, the spine is slightly rounded, and the cream page block shows at head and tail.
- **Cover layout:** a small author line, then the title in a large serif at the top-left. A small publisher mark sits in a square at the top-right. Artwork fills the rest: halftone portraits, marbled paper, single-line drawings, technical illustration.
- **Spine layout:** author in small caps at the top, title in serif running top to bottom, publisher mark at the foot.

### Opening and reading

1. **Open:** the selected book moves to centre and the front board swings open on its spine, showing a patterned endpaper.
2. **Riffle:** the book settles nearly flat facing the camera, and a run of pages flips rapidly from the front toward the reader's page. Several pages are in the air at once, each curled.
3. **Spread:** it settles on the saved page with real page images. The left and right page blocks have visible thickness in proportion to progress. The tinted background stays, with the shelf dimmed behind.
4. **Read:** a toolbar `[←] 192 of 195 [→]` with zoom, colour and close sits below the book. Arrow keys turn one page with a 3D curl in about 400 ms, and the address updates to `/book/<slug>/page/<n>`.
5. **Close:** the reverse — the board closes and the book returns to its shelf.

## Wooden bookcase and endless browsing

All shelves become one tall wooden bookcase. Each shelf is a plank row, and switching shelf moves the camera up or down the case. Each row is as long as its books need and scrolls left and right freely. The photo you attached is a watermarked stock image, so it serves as the mood reference only: warm, worn wood with soft daylight. The textures come from CC0 libraries.

### Construction

| Part | Geometry | Material |
| --- | --- | --- |
| Plank (one per row) | Rounded box, 2.2 cm thick, 24 cm deep, 0.3 cm bevel on the front edge (`RoundedBoxGeometry` from three's examples) | Wood colour, normal and roughness maps; grain runs along the plank |
| Uprights | 2.2 cm boards every 96 cm bay, full case height | Same wood, grain vertical |
| Back panel | One plane per bay, 14 cm behind the books | Same wood, about 35% darker, rougher |
| End caps | An upright at the start of the case and after the longest row | Same wood |
| Shelf label | A small plate on each plank's front edge with the shelf name in JetBrains Mono | Brass-tinted physical material, low roughness |

Row spacing stays 34 cm: a 21 cm book, the plank, and headroom. At shelf distance the camera shows about 58 cm of height, so the planks above and below show at the edges, and the case reads as one piece of furniture.

### Textures

- **Source:** [Poly Haven](https://polyhaven.com/a/oak_veneer_01), whose Oak Veneer 01 is CC0, as are its [Fine Grained Wood](https://polyhaven.com/a/fine_grained_wood) and [Wood Planks](https://polyhaven.com/a/wood_planks). ambientCG is a CC0 fallback. Use the 1K set (colour, normal, roughness) and bundle it under `wwwroot/assets/wood/`, so nothing loads from the network at runtime.
- **Tiling:** set UVs in world units so one texture tile covers 60 cm. Give each plank and upright a random UV offset and occasional 180° flip, so the grain never repeats visibly.
- **Theme:** the dark theme multiplies the colour map toward walnut (about #5A3E2B); the light theme keeps oak.
- **Light:** a warm key light (about 3,000 K) from upper left. A baked soft shadow strip runs under each plank onto the back panel, plus the existing contact shadow under each book. Optional: a faint dappled-light texture (cookie) on the key light for the daylight feel.
- **Budget:** three 1K textures shared by every wooden part, so wood adds about 12 MB of GPU memory and no extra draw calls per book.

### Endless horizontal browsing

| Input | Effect |
| --- | --- |
| Trackpad horizontal swipe, Shift + wheel | Pans the row with momentum |
| Click and drag on empty wood or the back panel | Pans with momentum; a release with speed keeps gliding |
| ← / → | Presents the previous or next book; the camera follows |
| Home / End | Jumps to the first or last book with one smooth move |
| Vertical wheel or swipe, ↑ / ↓ | Changes shelf (WP2), never pans |

- **Motion:** pan position and velocity live in the stage. Velocity decays with friction λ = 4 per second. Past either end the row resists like a rubber band (up to 20 cm) and springs back with λ = 8.
- **Gesture split:** a wheel event pans when |deltaX| > |deltaY|; otherwise it is a shelf gesture.
- **Virtualisation:** only books within 1.5 view-widths of the camera on the current row and the rows directly above and below get meshes, from a reused pool. Bays are instanced, so a row of 2,000 books costs about as much as a row of 60.

## Book motion and cover design

### Three book states

Each book on the shelf is in one of three states, and every value eases toward its state's target with the existing `damp` function.

| State | Enters when | Target pose | Ease |
| --- | --- | --- | --- |
| Rest | Default | Spine out, on the plank | — |
| Lifted | Pointer over the book | Up 0.8 cm, forward 0.4 cm | λ = 12 (settles in about 250 ms) |
| Presented | Pointer stays 250 ms on the same book, a click, or ← / → | Turned from spine-out (90°) to facing the camera (0°), forward 9 cm, leaning back 2° | Turn λ = 7, forward λ = 9 |

When a book is presented:

- **Neighbours part.** Books to its left shift left and books to its right shift right by half the cover width (7 cm) minus half the book's thickness, plus 1 cm of air. Nearer neighbours ease faster (λ = 10) than farther ones (λ = 7), so the row ripples open rather than sliding as a block.
- **The row recentres.** The camera pans so the presented book is centred (λ = 6), but only on present, never on a plain hover.
- **The page answers.** The background fades to the cover's accent through the existing contrast-checked tint (λ = 5). The title marquee slides to the new title, and the bottom bar and screen-reader live region update.
- **One at a time.** The previously presented book turns back to spine-out.

Clicking a presented book, or pressing Enter, opens it (WP6). Pressing Esc, or clicking the wood, returns it to rest. With reduced motion, books don't lift, presenting is a 150 ms crossfade, and the camera jumps.

### Cover and spine design

The front face stops showing the raw PDF page 1. A new `cover-composer.js` paints every cover and spine onto a canvas from a template, using the book's own title and author from the library. Results are cached as images, keyed by book id and design version: in the covers folder on desktop, in OPFS on the web. The 2D fallback books (`CssBook`) use the same images.

**Hardcover construction:**

- 0.25 cm boards overhanging the page block by 0.3 cm at head, tail and fore-edge.
- A gently rounded spine.
- A cream page block visible at head and tail.
- Built as one merged `HardcoverGeometry` with material groups, so it costs the same draw calls as today's box.

**Cover layout (1024 × 1536 px canvas):**

| Element | Spec |
| --- | --- |
| Author | Inter 500, small caps, tracking 0.08em, top-left at 7% margin; left out if unknown |
| Title | Instrument Serif, auto-fit to at most three lines, line height 0.95, below the author |
| Mark | The Folio icon in a small square, top-right |
| Artwork | Lower 60% of the board, from one of the four templates below |
| Foil | Title and mark also go into a mask that drives metalness 0.8 and roughness 0.3, so they catch the key light |

**Artwork templates** (chosen by a stable hash of the book id; a later option can let users pick):

1. **Plate:** the PDF's page 1 turned into a two-colour halftone in the cloth and ink colours. Coarse dots hide its small print, so the typeset title is the only text that reads.
2. **Marble:** generated marbled paper from domain-warped noise in three palette colours. It wraps around the spine.
3. **Line:** one continuous generated line drawing in foil.
4. **Cloth:** plain cloth with the title blind-debossed through the normal map.

**Palette:** the dominant colour of page 1, checked for contrast against the title. If it fails, the book uses the nearest of 12 curated cloth colours.

**Spine (128 × 1024 px):** author in mono caps at the top, title in Instrument Serif running top to bottom, the Folio mark at the foot, and the progress ribbon kept.

**Texture sizes:** 1024 px tall for the presented or open book, a 512 px level for books on the shelf.

## 3D reading mode

Reading moves onto the stage: the book opens, riffles to your page, and stays open as a 3D spread you turn with a real page curl. The 2D PDF.js reader becomes Zoom mode, and remains the default whenever 3D is unavailable or motion is off. A new setting, Reading view (3D book · Flat pages), lets users choose.

### Opening sequence

Any key or click during the sequence skips straight to step 5. Steps overlap slightly, so the whole sequence takes about 1.6 s.

1. **Bring forward, 300 ms:** the presented book moves to centre and turns to face the camera.
2. **Open the board, 400 ms:** the front board swings 180° on the spine, showing an endpaper patterned in the cover's palette.
3. **Lay open, 300 ms:** the book tips back toward flat and scales so the spread fills the reading area.
4. **Riffle, about 600 ms:** up to 12 visual page flips run from the front toward the saved page, 50 ms apart, each a curled page in flight. Distant pages are blank paper; only the last two flips carry real page images.
5. **Settle, 200 ms:** the spread shows the saved page at full resolution. The text layer fades in and the toolbar slides up.

Closing runs the same steps in reverse, without the riffle, and the book returns to its shelf slot.

### The open book model

| Part | Build |
| --- | --- |
| Page blocks | Left block thickness follows pages read; right block follows pages left (the 8–60 mm book thickness split by progress) |
| Spread | Two planes, 32 × 4 segments, with a slight curve near the gutter from the vertex shader |
| Turning page | A pool of 6 `CurlPage` meshes, 48 × 8 segments, with front and back textures. A vertex shader rolls each round a cylinder whose radius shrinks as the turn completes, as in the cylinder method in [Microsoft's page-curl write-up](https://msdn.microsoft.com/en-us/magazine/ebf6cd3a-98c0-475f-82b0-18fd17b047b6) |
| Shading | Per-vertex normals from the curl; a soft shadow from the curling page onto the page beneath |
| Background | Accent tint stays; the bookcase behind dims to about 40% through fog |

### Page images

- **Rendering:** PDF.js renders pages in a worker with OffscreenCanvas and returns ImageBitmaps for textures. Resolution follows each page's projected height × device pixel ratio, capped at 2,048 px.
- **Prefetch and cache:** the next and previous spreads render ahead; an LRU cache holds 8 pages.
- **Fallback:** if a page isn't ready when a turn ends, a low-resolution version shows first and sharpens when the full render arrives.

### Keeping highlights, selection and find

When the spread is at rest it faces the camera squarely. The stage therefore reports each page's on-screen rectangle with the existing `measurePage` maths. The reader engine (`folio-reader.js`) draws its PDF.js text layer and highlight layer into two absolutely positioned containers scaled to those rectangles. The visible page is the 3D texture, but selection, the selection quick bar, highlights, bookmarks, find-in-book and screen readers all use the real text DOM above it.

The overlay hides during turns and fades back in when a turn settles. A find result on another page turns there: one curl for the next spread, or a short riffle for a farther one.

### Toolbar and keys

The toolbar reads `[ ← ]  12 OF 300  [ → ]  [ ZOOM ]  [ BOOKMARK ]  [ × ]` in the bracket style, centred under the book.

| Key | Action |
| --- | --- |
| ← / →, Page Up / Page Down | Turn one page with a curl (about 400 ms) |
| Home / End | Riffle to the first or last page |
| Z | Crossfade to the flat 2D reader at this page; Esc returns to the spread |
| Ctrl + F | Find in book (existing) |
| Esc | Close the book (reverse sequence) |

With reduced motion, there is no riffle and a page turn is a 150 ms crossfade. The address stays `/book/{id}/read?page={n}` and updates on every turn, as it does today.

## Fixing shelf switching

One gesture or key press moves exactly one shelf, the camera always travels there, and the destination comes from one shared list of rows. Today, three things break that: a 450 ms wheel throttle shorter than trackpad momentum, unthrottled key repeat, and two separately built row lists with a silent fallback to row 0.

### Changes

1. **One source of truth for rows.** A new `ShelfNavigator` service in `Folio.UI/Services` holds the ordered rows (All books, then shelves in their saved order), a `RowsVersion` number, `CurrentIndex`, `TargetIndex` and a state (Idle or Travelling). `StageHost` sends the stage exactly this list with its version, and `LibraryPage` and the sidebar read from it.
2. **Steps from the target, not the route.** A step moves `TargetIndex` by one, clamped to the rows, and the route follows with `Navigator.Go`. A route change that matches `TargetIndex` does nothing, so Back, Forward, typed addresses and sidebar clicks set the target directly.
3. **Gesture gate in the stage (`input.js`).**
   - Wheel deltas add up within a gesture; one intent fires when the total passes 40 px.
   - The gesture ends only after 180 ms with no wheel events, so trackpad momentum can't fire a second step.
   - Horizontal-dominant wheel events go to panning instead (WP3).
4. **Key gate.** Repeated ↑ / ↓ key events (`event.repeat`) are ignored. A press while Travelling queues at most one more step; further presses drop.
5. **Settle handshake.** The stage reports `OnSceneSettled("shelf", rowIndex)`. The navigator returns to Idle only when that index equals `TargetIndex`, with a 900 ms watchdog in case the report never comes.
6. **No silent fallback.** `setScene` carries `rowIndex` and `rowsVersion`. If the stage holds a different version, for example just after a shelf was created, renamed or reordered, it asks .NET for the library again (`OnRowsStale`) and applies the scene once the rows match. It never drops to row 0.
7. **Always animate.** Rows sit in one bookcase, so any change of row is a vertical camera move. Jumps of several rows (keys 1–9, the sidebar) use a faster ease so even a long jump arrives within 700 ms.

The diagram below shows the gate.

&#91;embedded content: Shelf navigation gate · one step per gesture\]

A step only finishes when the stage reports the same row the navigator asked for; a stale row list loops through a resend instead of falling back to All books.

## UI clean-up

### Remove View Details completely

The three actions that only lived on the details page (Edit, Move to shelf, Move to Trash) move to a book menu. Open it with `[ ⋯ ]` in the bottom bar, by right-clicking a book in 3D or 2D, or with the context-menu key. The menu reuses `EditBookDialog` and the existing shelf toggles.

| Area | Change |
| --- | --- |
| Pages | Delete `BookDetailsPage.razor`. Keep the `/book/{id}` address as a redirect to the shelf with that book presented, so old links still work |
| Buttons | Remove VIEW DETAILS from `LibraryBottomBar` and `LibraryHero`, the `folio-focus-details` buttons in `LibraryPage`, and the details link in `BookCard` |
| Keys | Remove D and Space from `LibraryPage.Key` and the shortcut sheet |
| Stage | Remove `details` from the scene set in `bridge.js`, its cases in `cameraPose` and `featuredPose`, `detailsBackground`, `POINTER_MAX.details` and the `details` click action. A click now presents, and a click on the presented book opens |
| C# | Remove `StageScene.Details`, `OnDetails` parameters and `FolioRoutes.Book` callers |
| Tests and docs | Delete the details specs and visual baselines; update the keyboard-path and axe tests; mark DET-1 and DET-2 removed in `SPEC.md` with a `DECISIONS.md` entry |

**Safety net (WP0, before anything else):**

- Wrap `@Body` in an `ErrorBoundary` that logs through `ILogger` and shows a calm recovery panel with `[ BACK TO LIBRARY ]`.
- Add the `blazor-error-ui` element to the desktop `index.html`, and log WPF dispatcher exceptions.
- Read the existing log for the details crash and note the exception in `DECISIONS.md`, so the same fault can't hide in shared code.

### Create shelf and Manage shelves

- **Both dialogs:** become Folio panels, keeping MudDialog as the container but restyling it with a `.folio-dialog` class in `m3-tokens.css`. That means the near-black surface, a 1 px hairline border, a mono eyebrow, a title in Instrument Serif, an underline-style input and bracket buttons.
- **Create shelf:** eyebrow `[ NEW SHELF ]`, title "Create a shelf", actions `[ CANCEL ]` and `[ CREATE SHELF + ]`. Enter submits and Esc cancels, as today.
- **Manage shelves:** one row per shelf with a drag handle, an inline rename field, ↑ / ↓ reorder buttons and `[ DELETE ]`. Delete confirms in place ("Delete Design? Its books stay in your library. \[ DELETE \] \[ KEEP \]"). Reordering bumps `RowsVersion` so the bookcase updates live (WP2).

### Sidebar

- **Icons:** replace the Material icons with a small set of thin custom SVG icons (1.25 px stroke) drawn in `--folio-text-muted`.
- **Labels and counts:** labels in Inter 13 px. Counts and shelf numbers (01, 02…) in JetBrains Mono, aligned right.
- **Active item:** a 2 px accent rule on the left, with the text in `--folio-text`.
- **Shelf actions:** the shelves heading carries `[ + ]` for Create and `[ ⋯ ]` for Manage. The collapsed sidebar shows icons only.

### Home page duplication

Remove the `folio-row-index` nav (ALL BOOKS plus every shelf name) from the shelf view in `LibraryPage`. The current shelf's name stays in the eyebrow and on the plank's label, and the sidebar is the one place to jump between shelves.

**Open question:** the reading-status buttons on the same screen also repeat the sidebar's Reading section. Remove them too?

### App icon

- **Sidebar brand:** show the icon beside the wordmark, using `<img src="_content/Folio.UI/images/folio-logo.png" width="28" height="28" alt="">`.
- **Path:** the path is relative, so it works under the web app's GitHub Pages sub-path and in the desktop BlazorWebView.
- **Collapsed sidebar:** shows the icon alone.
- **Asset check:** add the file to `verify-assets.mjs`.
- **Cover mark:** export a one-colour SVG of the mark for the cover and spine mark (WP5).

## Implementation plan

Nine work packages, each with its own branch (`folio3d/wp<N>-<slug>`) and pull request into `main`, and each merged only when its checks and the Windows CI job pass. The run order puts fixes and quick wins first, the bookcase before the motion that sits on it, and reading last.

**Order:** WP0 → WP1 → WP2 → WP7 → WP3 → WP5 → WP4 → WP6 → WP8. Progress goes in `docs/folio-3d/PROGRESS-V2.md`; deviations go in `DECISIONS.md`.

### WP0 — Safety net

Files: `MainLayout.razor`, `Folio.Desktop/wwwroot/index.html`, `App.xaml.cs`, new `FolioErrorBoundary.razor`.

- [ ] A thrown exception in any page shows the recovery panel and is logged; the app keeps running
- [ ] The cause of the details crash is recorded in `DECISIONS.md`

### WP1 — Remove View Details

Files: `BookDetailsPage.razor` (delete), `LibraryBottomBar.razor`, `LibraryHero.razor`, `LibraryPage.razor`, `BookCard.razor`, `StageState.cs`, `bridge.js`, `scenes.js`, `index.js`, new `BookMenu.razor`, specs and baselines.

- [ ] No VIEW DETAILS button, D shortcut, `details` scene or details route remains (grep is clean)
- [ ] `/book/{id}` redirects to the shelf with that book presented
- [ ] Edit, Move to shelf and Move to Trash work from the book menu in 3D and 2D

### WP2 — Shelf navigation

Files: new `ShelfNavigator.cs` and `stage/input.js`; `LibraryPage.razor`, `StageHost.razor`, `StageState.cs`, `bridge.js`, `index.js`, `MainLayout.razor`.

- [ ] A simulated trackpad swipe (30 wheel events over 1.2 s) moves exactly one shelf
- [ ] A held ↓ key moves one shelf per settle
- [ ] Creating, renaming or reordering a shelf and switching to it at once lands on the right row, with the camera's height changing smoothly in every sampled frame

### WP7 — UI clean-up

Files: `CreateShelfDialog.razor`, `ManageShelvesDialog.razor`, `MainLayout.razor`, `m3-tokens.css`, `folio-library.css`, `LibraryPage.razor`, new `wwwroot/icons/*.svg`, `verify-assets.mjs`.

- [ ] Both dialogs and the sidebar match the bracket design in light and dark (new visual baselines)
- [ ] The shelf-name row under All books is gone
- [ ] The app icon shows in the sidebar on desktop and on the web sub-path

### WP3 — Wooden bookcase and endless browsing

Files: new `stage/bookcase.js` and `stage/pan.js`; `index.js`, `scenes.js`, `layout.js`, `wwwroot/assets/wood/*` (CC0, with a `LICENSES.md` entry).

- [ ] Planks, uprights, back panel and labels render with wood textures in both themes
- [ ] A row of 2,000 synthetic books pans end to end with p95 frame time ≤ 16.7 ms in CI's Chromium
- [ ] Panning has momentum and a rubber-band stop at both ends; vertical gestures never pan

### WP5 — Covers and spines

Files: new `stage/cover-composer.js`, `stage/hardcover.js` and `stage/artwork/{plate,marble,line,cloth}.js`; `textures.js`, `book-factory.js`, `CssBook.razor`, the cover cache in `IFileStore`.

- [ ] Every book shows its title and author typeset on the cover and spine, never page 1's own text
- [ ] All four templates render; a given book always gets the same design
- [ ] Generated covers are cached and reused after restart

### WP4 — Hover and present motion

Files: `scenes.js` (book states), `index.js`, `motion.js`, `LibraryPage.razor` (dwell, presented id, marquee).

- [ ] Hover lifts within about 250 ms; a 250 ms dwell, a click or an arrow presents
- [ ] Neighbours part without books intersecting, checked in a geometry unit test
- [ ] The background tint and title marquee follow the presented book; reduced motion uses crossfades

### WP6 — 3D reading mode

Files: new `stage/open-book.js`, `stage/curl-page.js` (with shaders) and `stage/page-textures.js`; `opening.js`, `index.js`, `folio-reader.js` (overlay containers), `ReaderView.razor`, a new Reading view setting.

- [ ] Open → riffle → spread completes in about 1.6 s, and any key or click skips it
- [ ] ← / → turn pages with a curl at p95 ≤ 16.7 ms; the address updates every turn
- [ ] On the 3D spread, select text, add a highlight and find a phrase; the overlay is within 2 px of the page corners
- [ ] Z crossfades to the 2D reader at the same page, and Esc closes the book back to its slot

### WP8 — Hardening

Files: specs, `SPEC.md`, `README.md`, `docs/how-folio-works.md`.

- [ ] Full CI green on Linux, Windows and web; axe clean on bookcase, presented book and 3D spread
- [ ] Performance re-measured with 300 and 2,000 books
- [ ] A human checks on Windows hardware: the trackpad swipe, page-turn smoothness and highlights on the 3D spread

## Testing and the Claude Code prompt

### New and changed tests

| Test | Where | Pass rule |
| --- | --- | --- |
| Gesture gate | `tests/Folio.Reader.Tests/input.test.mjs` | Recorded trackpad and mouse wheel streams produce exactly one step each; a horizontal stream produces none |
| Shelf navigation | `tests/Folio.Web.E2E/specs/shelf-nav.spec.mjs` | Swipe, held key, 1–9 and sidebar land on the right row; camera height changes in the same direction in every sampled frame |
| Book states | `stage/*.test.mjs` | Presented and neighbour poses never intersect, across thicknesses from 8 to 60 mm |
| Covers | `cover-composer.test.mjs` plus visual baselines | Same book → same design; title fits in three lines or fewer; title contrast ≥ 4.5:1 |
| Bookcase performance | `perf.spec.mjs` | 2,000-book row: p95 ≤ 16.7 ms while panning; zero frames after 2 s idle |
| Reading | `reading.spec.mjs` | Open sequence and skip; a turn updates the address; text overlay corner error ≤ 2 px; a highlight made on the 3D spread persists after reload |
| Removed details | Existing specs | Details specs and baselines deleted; `/book/{id}` redirect covered |
| Accessibility | `a11y.spec.mjs` | axe clean on bookcase, presented book, 3D spread and both dialogs; keyboard path completes |

### Prompt for Claude Code (cloud)

Copy this doc into the repo as `docs/folio-3d/SPEC-V2.md` first, or attach it to the session.

```text
Read CLAUDE.md, docs/folio-3d/SPEC.md and docs/folio-3d/SPEC-V2.md (this plan).
Work through the work packages in the order the plan gives: WP0, WP1, WP2, WP7, WP3, WP5, WP4, WP6, WP8.
For each: create branch folio3d/wp<N>-<slug> from main, do the work, keep docs/folio-3d/PROGRESS-V2.md current, open a PR, and merge only when every check in that package and the Windows CI job pass.
Write every commit message as a plain summary of the change, with no AI attribution, Co-Authored-By or other trailers.
Use only CC0 assets (Poly Haven or ambientCG) for wood, bundle them under wwwroot/assets, and record each in LICENSES.md. Use no Stripe Press artwork, fonts, logos or page layouts.
Keep the 2D library and 2D reader working at every commit.
When the plan leaves something open, choose the option that keeps the app accessible, local-first and smooth on an integrated GPU, record it in DECISIONS.md, and continue.
Stop and report only if a check fails twice for the same reason or a step needs Windows hardware.
At the end, list what shipped, what was deferred, and what a human must check on Windows.
```

## Sources

- [Stripe Press](https://stripe.press/): reference interactions observed 22 Nov 2026 (catalogue hover and select, open, riffle, page turn)
- [folio-reader, main at f404ddd](https://github.com/kasun-m-rathnayaka/folio-reader): stage, pages and dialogs reviewed for root causes
- [Poly Haven: Oak Veneer 01](https://polyhaven.com/a/oak_veneer_01), [Fine Grained Wood](https://polyhaven.com/a/fine_grained_wood) and [Wood Planks](https://polyhaven.com/a/wood_planks): CC0 wood textures
- [Free wood textures overview (Cinevva)](https://app.cinevva.com/game-assets/free-wood-textures): Poly Haven and ambientCG wood under CC0; 1K is the browser default
- [Microsoft: page curl on a cylinder (MSDN Magazine, Aug 2013)](https://msdn.microsoft.com/en-us/magazine/ebf6cd3a-98c0-475f-82b0-18fd17b047b6): the curl geometry used for `CurlPage`
- [turngl](https://github.com/oguzhanT/turngl): PDF.js pages as Three.js textures with page curl, as a reference implementation
