// A real hardcover (WP5), built as one merged geometry with material groups so it costs the same single draw call as a box:
// two 2.5 mm boards that overhang the page block by 3 mm at head, tail and fore-edge, a gently rounded spine, and a cream
// page block showing at head and tail. Local axes match the old box: width along x (spine at −x, fore-edge at +x), height
// along y, thickness along z (front cover at +z).
import * as THREE from 'three';
import { BOOK_HEIGHT as H, BOOK_WIDTH as W } from './layout.js';

/** Material slots. The first six keep the old box order (fore-edge, spine, head, tail, front, back); the rest are new. */
export const MAT = { foreEdge: 0, spine: 1, head: 2, tail: 3, front: 4, back: 5, board: 6, endpaper: 7 };
export const BOARD = 0.25, OVERHANG = 0.3, SPINE_BULGE = 0.3, SPINE_SEGMENTS = 8;

/** Builds the hardcover for a block of `thickness` cm (overall depth, boards included). */
export function hardcoverGeometry(thickness) {
    const T = thickness, hz = T / 2;
    const quads = [];   // { material, p: [4 positions CCW seen from outside], n: normal or [4 normals], uv: [4 uv] }
    // Each quad is wound counter-clockwise as seen from outside: if the corners given come out facing inward, flip them.
    const quad = (material, p, n, uv) => {
        const avg = Array.isArray(n[0]) ? n.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]) : n;
        const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], e2 = [p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]];
        const face = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        if (face[0] * avg[0] + face[1] * avg[1] + face[2] * avg[2] < 0) { p = [p[0], p[3], p[2], p[1]]; uv = [uv[0], uv[3], uv[2], uv[1]]; if (Array.isArray(n[0])) n = [n[0], n[3], n[2], n[1]]; }
        quads.push({ material, p, n, uv });
    };
    const faceUv = [[0, 0], [1, 0], [1, 1], [0, 1]];

    // Boards: full width and height; front at +z, back at −z. Outer face = cover art, inner face = endpaper.
    for (const side of [1, -1]) {
        const zOuter = side * hz, zInner = side * (hz - BOARD);
        const outer = side > 0 ? MAT.front : MAT.back;
        // outer face (normal ±z). Counter-clockwise from the viewer: front looks down −z, back looks down +z.
        if (side > 0) quad(outer, [[-W / 2, -H / 2, zOuter], [W / 2, -H / 2, zOuter], [W / 2, H / 2, zOuter], [-W / 2, H / 2, zOuter]], [0, 0, 1], faceUv);
        else quad(outer, [[W / 2, -H / 2, zOuter], [-W / 2, -H / 2, zOuter], [-W / 2, H / 2, zOuter], [W / 2, H / 2, zOuter]], [0, 0, -1], faceUv);
        // inner face
        if (side > 0) quad(MAT.endpaper, [[W / 2, -H / 2, zInner], [-W / 2, -H / 2, zInner], [-W / 2, H / 2, zInner], [W / 2, H / 2, zInner]], [0, 0, -1], faceUv);
        else quad(MAT.endpaper, [[-W / 2, -H / 2, zInner], [W / 2, -H / 2, zInner], [W / 2, H / 2, zInner], [-W / 2, H / 2, zInner]], [0, 0, 1], faceUv);
        // board edges: fore-edge (+x), head (+y), tail (−y)
        quad(MAT.board, [[W / 2, -H / 2, zInner], [W / 2, -H / 2, zOuter], [W / 2, H / 2, zOuter], [W / 2, H / 2, zInner]], [1, 0, 0], faceUv);
        quad(MAT.board, [[-W / 2, H / 2, zOuter], [W / 2, H / 2, zOuter], [W / 2, H / 2, zInner], [-W / 2, H / 2, zInner]], [0, 1, 0], faceUv);
        quad(MAT.board, [[-W / 2, -H / 2, zInner], [W / 2, -H / 2, zInner], [W / 2, -H / 2, zOuter], [-W / 2, -H / 2, zOuter]], [0, -1, 0], faceUv);
    }
    // Page block between the boards, set back from head, tail and fore-edge.
    const bx = W / 2 - OVERHANG, by = H / 2 - OVERHANG, bz = hz - BOARD, bxLeft = -W / 2 + 0.1;
    quad(MAT.foreEdge, [[bx, -by, bz], [bx, -by, -bz], [bx, by, -bz], [bx, by, bz]], [1, 0, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    quad(MAT.head, [[bxLeft, by, bz], [bx, by, bz], [bx, by, -bz], [bxLeft, by, -bz]], [0, 1, 0], faceUv);
    quad(MAT.tail, [[bxLeft, -by, -bz], [bx, -by, -bz], [bx, -by, bz], [bxLeft, -by, bz]], [0, -1, 0], faceUv);

    // Spine: a strip bulging a little outward (−x), joining the two boards. u runs back (0) → front (1) like the old box.
    for (let i = 0; i < SPINE_SEGMENTS; i++) {
        const t0 = i / SPINE_SEGMENTS, t1 = (i + 1) / SPINE_SEGMENTS;
        const at = t => ({ z: -hz + t * T, x: -W / 2 - SPINE_BULGE * Math.sin(Math.PI * t) });
        const normalAt = t => { const dz = T, dx = -SPINE_BULGE * Math.PI * Math.cos(Math.PI * t); const len = Math.hypot(dx, dz); return [-dz / len, 0, dx / len]; };
        const a = at(t0), b = at(t1);
        // Seen from −x looking +x, +z is to the right: bottom-left → bottom-right → top-right → top-left.
        quad(MAT.spine, [[a.x, -H / 2, a.z], [b.x, -H / 2, b.z], [b.x, H / 2, b.z], [a.x, H / 2, a.z]], [normalAt(t0), normalAt(t1), normalAt(t1), normalAt(t0)], [[t0, 0], [t1, 0], [t1, 1], [t0, 1]]);
    }

    // Emit grouped by material so each slot is one contiguous range.
    quads.sort((a, b) => a.material - b.material);
    const position = [], normal = [], uv = [], index = [];
    const geometry = new THREE.BufferGeometry();
    let start = 0, current = quads[0].material;
    quads.forEach((q, qi) => {
        if (q.material !== current) { geometry.addGroup(start, index.length - start, current); start = index.length; current = q.material; }
        const base = position.length / 3;
        q.p.forEach((p, i) => { position.push(...p); normal.push(...(Array.isArray(q.n[0]) ? q.n[i] : q.n)); uv.push(...q.uv[i]); });
        index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    geometry.addGroup(start, index.length - start, current);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(index);
    geometry.computeBoundingSphere(); geometry.computeBoundingBox();
    return geometry;
}
