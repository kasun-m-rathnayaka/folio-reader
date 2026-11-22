import test from 'node:test';
import assert from 'node:assert/strict';
import { spreadOfPage, lastSpread, pagesOfSpread, readFraction, riffleCount, READ } from '../../src/Folio.UI/stage/reading.js';
import { curlPoint, turnShape, easeTurn, fitFor } from '../../src/Folio.UI/stage/curl-page.js';
import { targetHeight, PREVIEW_HEIGHT, MAX_HEIGHT } from '../../src/Folio.UI/stage/page-textures.js';

// reading.js imports three and the book factory; Node can load them (no DOM is touched at import time).

test('spreads: page 0 sits alone on the right, then (1,2), (3,4)…', () => {
    assert.deepEqual(pagesOfSpread(0, 300), { left: null, right: 0 });
    assert.deepEqual(pagesOfSpread(1, 300), { left: 1, right: 2 });
    assert.deepEqual(pagesOfSpread(60, 300), { left: 119, right: 120 });
    assert.deepEqual(pagesOfSpread(150, 300), { left: 299, right: null });     // an even page count ends on a lone left page
    assert.deepEqual(pagesOfSpread(2, 5), { left: 3, right: 4 });
    for (let page = 0; page < 40; page++) {
        const { left, right } = pagesOfSpread(spreadOfPage(page), 40);
        assert.ok(left === page || right === page, `page ${page} is on its spread`);
    }
    assert.equal(lastSpread(300), 150); assert.equal(lastSpread(5), 2); assert.equal(lastSpread(1), 0);
});

test('block thickness follows progress: read pages on the left, unread on the right', () => {
    assert.equal(readFraction(0, 300), 0);
    assert.ok(Math.abs(readFraction(60, 300) - 119 / 300) < 1e-12);
    assert.ok(readFraction(150, 300) <= 1);
    assert.equal(readFraction(3, 0), 0);
});

test('a neighbour is one curl; a long way riffles up to 12 leaves', () => {
    assert.equal(riffleCount(1), 1);
    assert.ok(riffleCount(2) >= 3 && riffleCount(40) === READ.maxRiffleLeaves && riffleCount(1000) === 12);
    for (let d = 2; d < 80; d++) assert.ok(riffleCount(d) >= riffleCount(d - 1));
});

test('curl: unfolded pages are flat, a finished turn is the mirror image, and the surface never tears', () => {
    const w = 13.6;
    for (let x = 0; x <= w; x += 0.4) {
        const flat = curlPoint(x, w, 0);                                        // fold at the outer edge: nothing is curled
        assert.deepEqual([flat.x, flat.z, flat.nz], [x, 0, 1]);
        if (x === 0) continue;                                                   // the spine itself does not move
        const done = curlPoint(x, 0, 0);                                        // fold at the spine with no radius: flat on the other side
        assert.ok(Math.abs(done.x + x) < 1e-9 && Math.abs(done.z) < 1e-9 && done.nz === -1, `x=${x}`);
    }
    const start = turnShape(0, w), end = turnShape(1, w), mid = turnShape(0.5, w);
    assert.deepEqual([start.fold, start.radius], [w, 0]);
    assert.ok(Math.abs(end.fold) < 1e-12 && Math.abs(end.radius) < 1e-9);
    assert.ok(mid.radius > 2 && mid.radius < 3 && Math.abs(mid.fold - w / 2) < 1e-9);   // the roll swells mid-turn and shrinks away
    // Continuity: stepping along the page, positions change smoothly (no jumps bigger than the step).
    for (const u of [0.15, 0.4, 0.6, 0.85]) {
        const { fold, radius } = turnShape(u, w);
        let previous = curlPoint(0, fold, radius);
        for (let x = 0.05; x <= w; x += 0.05) {
            const p = curlPoint(x, fold, radius);
            assert.ok(Math.hypot(p.x - previous.x, p.z - previous.z) < 0.12, `u=${u} x=${x.toFixed(2)}`);
            previous = p;
        }
    }
});

test('the curl radius is zero at both ends of a turn and ease is monotonic', () => {
    assert.equal(turnShape(0, 10).radius, 0); assert.ok(turnShape(1, 10).radius < 1e-9);
    let last = -1; for (let t = 0; t <= 1.0001; t += 0.05) { const e = easeTurn(Math.min(1, t)); assert.ok(e >= last); last = e; }
});

test('pages that are not 2:3 are letterboxed into the plane', () => {
    assert.deepEqual(fitFor(0.667, 0.667), [1, 1]);
    const [sx, sy] = fitFor(0.773, 0.667); assert.equal(sx, 1); assert.ok(sy < 1);            // wider than the plane: bars top and bottom
    const [tx, ty] = fitFor(0.5, 0.667); assert.equal(ty, 1); assert.ok(tx < 1);              // taller: bars at the sides
    assert.deepEqual(fitFor(0, 0.667), [1, 1]);
});

test('page images render at the projected height × the pixel ratio, capped at 2,048 px', () => {
    assert.equal(targetHeight(700, 1), 700);
    assert.equal(targetHeight(700, 2), 1400);
    assert.equal(targetHeight(1500, 2), MAX_HEIGHT);
    assert.equal(targetHeight(100, 1), PREVIEW_HEIGHT);
});

import { squareToQuad, applyMapping, quadToSquare, quadMatrix3d } from '../../src/Folio.UI/wwwroot/js/reader-geometry.mjs';
import { pageBow, BOW } from '../../src/Folio.UI/stage/curl-page.js';

test('the text layer maps onto a tilted page exactly at its corners, and selections map back', () => {
    const quad = [[230, 190], [640, 175], [650, 830], [160, 820]];           // a page of the leaning book, in viewport pixels
    const m = squareToQuad(quad), back = quadToSquare(m);
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], i) => {
        const [x, y] = applyMapping(m, u, v);
        assert.ok(Math.hypot(x - quad[i][0], y - quad[i][1]) < 1e-6, `corner ${i}`);
    });
    for (const [u, v] of [[0.25, 0.4], [0.9, 0.1], [0.5, 0.5]]) {
        const [x, y] = applyMapping(m, u, v), [u2, v2] = back(x, y);
        assert.ok(Math.abs(u2 - u) < 1e-9 && Math.abs(v2 - v) < 1e-9);
    }
    assert.match(quadMatrix3d(400, 600, quad), /^matrix3d\((-?[\d.e-]+,){15}-?[\d.e-]+\)$/);
});

test('an open page bows: down into the gutter, up over the inner third, flat at the outer edge', () => {
    const w = 13.6;
    assert.ok(Math.abs(pageBow(0, w) + BOW.gutterDip) < 1e-9);
    assert.ok(pageBow(w * 0.35, w) > 0.2);
    assert.ok(Math.abs(pageBow(w, w)) < 0.01);
});
