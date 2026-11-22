import test from 'node:test';
import assert from 'node:assert/strict';
import { rowPositions, partedPositions, partedShift, thicknessCm, BOOK_WIDTH } from '../../src/Folio.UI/stage/layout.js';
import { shelfPose, poseLambdas, LIFT, PRESENT } from '../../src/Folio.UI/stage/scenes.js';
import { dampKeys, motionSettings } from '../../src/Folio.UI/stage/motion.js';

// Books of every thickness from 8 mm to 60 mm (pages × 0.075 mm, clamped), in mixed order.
const pagesFor = mm => Math.ceil(mm / 0.075);
const row = Array.from({ length: 14 }, (_, i) => ({ id: `b${i}`, pages: pagesFor([8, 60, 22, 40, 12, 55, 30, 9, 48, 18, 60, 8, 35, 26][i]) }));

test('presented and neighbouring books never intersect, at any thickness from 8 to 60 mm', () => {
    const layout = rowPositions(row);
    for (let p = 0; p < row.length; p++) {
        const xs = partedPositions(layout, p);
        const edges = row.map((b, i) => { const t = thicknessCm(b.pages); return i === p ? [xs[i] - BOOK_WIDTH / 2, xs[i] + BOOK_WIDTH / 2] : [xs[i] - t / 2, xs[i] + t / 2]; });
        for (let i = 0; i + 1 < row.length; i++) {
            const gap = edges[i + 1][0] - edges[i][1];
            const touchesPresented = i === p || i + 1 === p;
            // Next to the presented book there is at least 1 cm of air; elsewhere the usual 3.5 mm between spines is kept.
            assert.ok(gap >= (touchesPresented ? 1 : 0.35) - 1e-9, `presented ${p}: books ${i} and ${i + 1} are ${gap.toFixed(3)} cm apart`);
        }
    }
});

test('books left of the presented one move left, right ones move right, by the same shift', () => {
    const layout = rowPositions(row);
    const xs = partedPositions(layout, 5), shift = partedShift(thicknessCm(row[5].pages));
    assert.equal(xs[5], layout.xs[5]);
    for (let i = 0; i < row.length; i++) if (i !== 5) assert.ok(Math.abs(Math.abs(xs[i] - layout.xs[i]) - shift) < 1e-9);
    assert.ok(xs[4] < layout.xs[4] && xs[6] > layout.xs[6]);
    assert.ok(Math.abs(shift - (BOOK_WIDTH / 2 - thicknessCm(row[5].pages) / 2 + 1)) < 1e-9);   // half the cover width − half the thickness + 1 cm
});

test('poses: rest is spine-out, lifted is up 0.8 cm and forward 0.4 cm, presented faces the camera 9 cm forward', () => {
    const rest = shelfPose(0, 10), lifted = shelfPose(0, 10, 'lifted'), presented = shelfPose(0, 10, 'presented');
    assert.equal(rest.ry, Math.PI / 2);
    assert.ok(Math.abs(lifted.y - rest.y - LIFT.y) < 1e-12 && Math.abs(lifted.z - rest.z - LIFT.z) < 1e-12);
    assert.equal(presented.ry, 0);                                   // turned 90° from spine-out to face the camera
    assert.equal(presented.z, PRESENT.z);
    assert.ok(Math.abs(presented.rx + 2 * Math.PI / 180) < 1e-12);  // leaning back 2°
});

test('rates: lift λ = 12, turn λ = 7, forward λ = 9, nearer neighbours faster', () => {
    assert.equal(poseLambdas('lifted').y, 12);
    assert.equal(poseLambdas('presented').ry, 7);
    assert.equal(poseLambdas('presented').z, 9);
    assert.ok(poseLambdas('rest', 1).x > poseLambdas('rest', 2).x);
    assert.equal(poseLambdas('rest', 1).x, 10); assert.equal(poseLambdas('rest', 2).x, 7);
});

test('a lifted spine settles in about 250 ms', () => {
    const state = { ...shelfPose(0, 0) }, target = shelfPose(0, 0, 'lifted');
    let t = 0;
    while (Math.abs(state.y - target.y) > LIFT.y * 0.05 && t < 2) { dampKeys(state, target, poseLambdas('lifted'), 1 / 120); t += 1 / 120; }
    assert.ok(t > 0.18 && t < 0.32, `${t.toFixed(3)} s to within 5%`);
});

test('reduced and off motion do not lift books', () => {
    assert.equal(motionSettings('full').lift, true);
    assert.equal(motionSettings('reduced').lift, false);
    assert.equal(motionSettings('off').lift, false);
});
