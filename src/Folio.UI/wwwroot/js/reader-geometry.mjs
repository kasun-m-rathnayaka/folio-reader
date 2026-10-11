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
