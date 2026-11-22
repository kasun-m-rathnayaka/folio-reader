// Target poses per scene (SPEC: scenes). The stage damps every book and the camera toward these each frame.
// The featured book (hero, opening) lives at the top of the world; shelf rows hang below it, so moving from
// the hero to the shelf is one continuous camera travel downwards (LIB-3).
import { BOOK_HEIGHT, ROW_SPACING, PULL_OUT, rowPositions, cameraX } from './layout.js';

export const FEATURE_Y = 0;
export const SHELF_TOP_Y = -70;
export const CAMERA_FOV = 30;
export const SHELF_DISTANCE = 108;
const HERO_TURN = 0.48;                 // 3/4 view: cover and spine both visible
const DEG = Math.PI / 180;

export const rowY = index => SHELF_TOP_Y - index * ROW_SPACING;

/** Camera pose for a scene: position and look-at point. */
export function cameraPose(scene, ctx) {
    switch (scene.kind) {
        case 'shelf': {
            const row = Math.max(0, ctx.rowIndex ?? 0);
            const y = rowY(row);
            const layout = ctx.rows?.[row]?.layout;
            const focus = layout?.positions.get(ctx.focusId)?.x ?? (layout ? Math.min(layout.width / 2, 20) : 0);
            const x = layout ? cameraX(focus, layout.width, ctx.halfViewWidth ?? 30) : 0;
            return { px: x, py: y + 6, pz: SHELF_DISTANCE, lx: x, ly: y + 1, lz: 0 };
        }
        case 'opening':
            return { px: 0, py: FEATURE_Y, pz: 40, lx: 0, ly: FEATURE_Y, lz: 0 };
        default: // hero: close, slightly low, 3/4 view; the book sits left of the HTML copy
            return { px: 3, py: FEATURE_Y - 6, pz: 76, lx: 3, ly: FEATURE_Y - 2.5, lz: 0 };
    }
}

/** Pose of the featured book. `t` carries idle turn and pointer tilt (radians). */
export function featuredPose(scene, t) {
    switch (scene.kind) {
        case 'opening':
            return { x: 0, y: FEATURE_Y, z: 8, ry: 0, rx: 0, rz: 0 };
        default:
            return { x: -13, y: FEATURE_Y - 3, z: 0, ry: HERO_TURN + t.idle + t.pointerY, rx: -0.06 + t.pointerX, rz: 0 };
    }
}

/** Pose of a book standing spine-out on a row; the focused one slides out 24 mm and tilts 6° (LIB-5). */
export function shelfPose(rowIndex, x, focused) {
    return {
        x, y: rowY(rowIndex) + BOOK_HEIGHT / 2 - 10, z: focused ? PULL_OUT : 0,
        ry: Math.PI / 2 + (focused ? -6 * DEG : 0), rx: 0, rz: 0,
    };
}

export function layoutRows(rows) {
    return rows.map(row => ({ ...row, layout: rowPositions(row.books) }));
}
