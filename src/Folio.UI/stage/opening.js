// Open-book handoff geometry (OPN-1). The reader reports where it draws the current page (viewport pixels); the stage
// places the open book's right-hand page in a plane facing the camera so that its projection covers exactly that
// rectangle. With the camera looking straight down −z and no view offset, the mapping is closed-form.

/** World-space pose for the page plane at depth `planeZ`, given a rectangle in viewport pixels. */
export function alignmentPose(rect, viewport, camera) {
    const distance = camera.z - camera.planeZ;
    const visibleHeight = 2 * distance * Math.tan((camera.fov * Math.PI / 180) / 2);
    const unit = visibleHeight / viewport.height;                 // world units per CSS pixel at the plane
    const centerX = rect.x + rect.width / 2 - viewport.width / 2;
    const centerY = rect.y + rect.height / 2 - viewport.height / 2;
    return {
        x: camera.x + centerX * unit,
        y: camera.y - centerY * unit,
        width: rect.width * unit,
        height: rect.height * unit,
    };
}

/** Viewport-pixel rectangle of a world-space plane rectangle seen by the same camera (inverse of alignmentPose). */
export function projectedRect(plane, viewport, camera) {
    const distance = camera.z - camera.planeZ;
    const visibleHeight = 2 * distance * Math.tan((camera.fov * Math.PI / 180) / 2);
    const pixels = viewport.height / visibleHeight;
    const width = plane.width * pixels, height = plane.height * pixels;
    const x = (plane.x - camera.x) * pixels + viewport.width / 2 - width / 2;
    const y = -(plane.y - camera.y) * pixels + viewport.height / 2 - height / 2;
    return { x, y, width, height };
}

/** Largest corner distance, in pixels, between two rectangles (the M6 "≤ 2 px at the corners" gate). */
export function cornerError(a, b) {
    const corners = r => [[r.x, r.y], [r.x + r.width, r.y], [r.x, r.y + r.height], [r.x + r.width, r.y + r.height]];
    const ca = corners(a), cb = corners(b);
    return Math.max(...ca.map(([x, y], i) => Math.hypot(x - cb[i][0], y - cb[i][1])));
}

/** Opening timeline in seconds (SPEC: forward 250 → cover 400 → align 250 → crossfade 120), overlapped to fit 900 ms. */
export const OPENING = { forward: 0.25, coverStart: 0.15, cover: 0.4, alignStart: 0.42, align: 0.25, crossfade: 0.12, total: 0.79 };
