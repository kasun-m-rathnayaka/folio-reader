export function rotateRect(rect, degrees) {
    const turn = ((degrees % 360) + 360) % 360;
    const { x, y, width, height } = rect;
    if (turn === 90) return { x: 1 - y - height, y: x, width: height, height: width };
    if (turn === 180) return { x: 1 - x - width, y: 1 - y - height, width, height };
    if (turn === 270) return { x: y, y: 1 - x - width, width: height, height: width };
    return { x, y, width, height };
}
export function resolvePageIndex(value, count) { return Math.max(0, Math.min(count - 1, Number.isFinite(value) ? Math.floor(value) : 0)); }
export function clampRect(rect) {
    const x = Math.max(0, Math.min(1, rect.x)), y = Math.max(0, Math.min(1, rect.y));
    return { x, y, width: Math.max(0, Math.min(1 - x, rect.width)), height: Math.max(0, Math.min(1 - y, rect.height)) };
}

/**
 * Perspective (projective) mapping of the unit square onto a quadrilateral `[tl, tr, br, bl]` (each `[x, y]`). Returns the
 * coefficients `{ a, b, c, d, e, f, g, h }` of (u, v) → ((a·u + b·v + c) / w, (d·u + e·v + f) / w) with w = g·u + h·v + 1.
 * Used to lay the reader's text layer exactly over a page of the tilted 3D book (WP6).
 */
export function squareToQuad(quad) {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    const det = dx1 * dy2 - dx2 * dy1;
    const g = Math.abs(det) < 1e-12 ? 0 : (dx3 * dy2 - dx2 * dy3) / det;
    const h = Math.abs(det) < 1e-12 ? 0 : (dx1 * dy3 - dx3 * dy1) / det;
    return { a: x1 - x0 + g * x1, b: x3 - x0 + h * x3, c: x0, d: y1 - y0 + g * y1, e: y3 - y0 + h * y3, f: y0, g, h };
}

export function applyMapping(m, u, v) {
    const w = m.g * u + m.h * v + 1;
    return [(m.a * u + m.b * v + m.c) / w, (m.d * u + m.e * v + m.f) / w];
}

/** The inverse mapping: a viewport point back to (u, v) in the unit square of the page. */
export function quadToSquare(m) {
    // Invert the 3 × 3 matrix [[a, b, c], [d, e, f], [g, h, 1]].
    const { a, b, c, d, e, f, g, h } = m, i = 1;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    const inv = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map(v => v / det);
    return (x, y) => { const w = inv[6] * x + inv[7] * y + inv[8]; return [(inv[0] * x + inv[1] * y + inv[2]) / w, (inv[3] * x + inv[4] * y + inv[5]) / w]; };
}

/** CSS `matrix3d` that maps an element of `width` × `height` (transform-origin 0 0) onto the quadrilateral. */
export function quadMatrix3d(width, height, quad) {
    const m = squareToQuad(quad);
    const v = [m.a / width, m.d / width, 0, m.g / width, m.b / height, m.e / height, 0, m.h / height, 0, 0, 1, 0, m.c, m.f, 0, 1];
    return `matrix3d(${v.map(n => +n.toFixed(9)).join(',')})`;
}
