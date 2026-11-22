// Book proportions and shelf layout. Units are centimetres. Pure functions, unit-tested.

export const BOOK_HEIGHT = 21, BOOK_WIDTH = 14;
export const SHELF_GAP = 0.35, ROW_SPACING = 34, PULL_OUT = 2.4; // 24 mm pull-out (SPEC: motion)

/** Thickness from page count, clamped to 8–60 mm (LIB-4). Matches BookGeometry.ThicknessMm in C#. */
export const thicknessCm = pages => Math.min(60, Math.max(8, (pages || 0) * 0.075)) / 10;

/** Row order: "All books" first, then each shelf in its order (SHF-1). */
export function rowsFor(books, shelves) {
    const rows = [{ id: null, name: 'All books', books: books.slice() }];
    for (const shelf of shelves || []) rows.push({ id: shelf.id, name: shelf.name, books: books.filter(b => (b.shelfIds || []).includes(shelf.id)) });
    return rows;
}

/** Spine-out positions along a row, centred on x = 0 for the first book's left edge. */
export function rowPositions(books) {
    const positions = new Map(), xs = new Float64Array(books.length);
    let x = 0, index = 0;
    for (const book of books) {
        const t = thicknessCm(book.pages);
        positions.set(book.id, { x: x + t / 2, thickness: t, index });
        xs[index++] = x + t / 2;
        x += t + SHELF_GAP;
    }
    return { positions, xs, books, width: Math.max(0, x - SHELF_GAP) };
}

/** Index range [first, last) of the books whose centre lies within [x0, x1]: binary search over the row's sorted centres. */
export function visibleRange(layout, x0, x1) {
    const xs = layout.xs, bound = value => { let lo = 0, hi = xs.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] < value) lo = mid + 1; else hi = mid; } return lo; };
    const first = bound(x0), last = bound(x1 + 1e-9);
    return [first, Math.max(first, last)];
}

/** How far each neighbour moves when a book is presented: half the cover width, minus half this book's thickness, plus 1 cm of air. */
export const partedShift = thickness => BOOK_WIDTH / 2 - thickness / 2 + 1;

/**
 * Where every book in a row stands while the book at `presentedIndex` faces the camera: books on its left move left and books on
 * its right move right by the same shift, so the row opens like a book rather than sliding as a block. Returns x per index.
 */
export function partedPositions(layout, presentedIndex) {
    const shift = partedShift(thicknessCm(layout.books[presentedIndex].pages));
    return Array.from(layout.xs, (x, i) => i < presentedIndex ? x - shift : i > presentedIndex ? x + shift : x);
}

/** Clamps a camera x so the row never scrolls past its ends by more than half the view. */
export function cameraX(focusX, rowWidth, halfView) {
    if (rowWidth <= halfView * 2) return rowWidth / 2;
    return Math.min(Math.max(focusX, halfView * 0.6), rowWidth - halfView * 0.6);
}
