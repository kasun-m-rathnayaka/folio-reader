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
    const positions = new Map();
    let x = 0;
    for (const book of books) {
        const t = thicknessCm(book.pages);
        positions.set(book.id, { x: x + t / 2, thickness: t });
        x += t + SHELF_GAP;
    }
    return { positions, width: Math.max(0, x - SHELF_GAP) };
}

/** Clamps a camera x so the row never scrolls past its ends by more than half the view. */
export function cameraX(focusX, rowWidth, halfView) {
    if (rowWidth <= halfView * 2) return rowWidth / 2;
    return Math.min(Math.max(focusX, halfView * 0.6), rowWidth - halfView * 0.6);
}
