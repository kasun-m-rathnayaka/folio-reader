import test from 'node:test';
import assert from 'node:assert/strict';
import { damp, dampObject, settleTime, idleTurn, motionSettings, LAMBDA } from '../../src/Folio.UI/stage/motion.js';
import { thicknessCm, rowsFor, rowPositions, cameraX } from '../../src/Folio.UI/stage/layout.js';

test('damp is frame-rate independent', () => {
    let a = 0, b = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 4, 1 / 60);
    for (let i = 0; i < 30; i++) b = damp(b, 1, 4, 1 / 30);
    assert.ok(Math.abs(a - b) < 1e-9);
    assert.ok(Math.abs(a - (1 - Math.exp(-4))) < 1e-9);
    assert.equal(damp(5, 1, 4, 0), 5);
});

test('camera settles in about 700 ms at λ = 4', () => {
    const t = settleTime(LAMBDA.camera);
    assert.ok(t > 0.6 && t < 0.75, String(t));
});

test('dampObject snaps within epsilon and reports remaining distance', () => {
    const state = { x: 0, y: 1 };
    let remaining = Infinity;
    for (let i = 0; i < 600 && remaining > 0; i++) remaining = dampObject(state, { x: 2, y: 1 }, 10, 1 / 60);
    assert.deepEqual(state, { x: 2, y: 1 });
    assert.equal(remaining, 0);
});

test('idle turn stays within ±12°', () => {
    for (let s = 0; s < 32; s += 0.25) assert.ok(Math.abs(idleTurn(s)) <= 12 * Math.PI / 180 + 1e-12);
    assert.ok(Math.abs(idleTurn(4) - 12 * Math.PI / 180) < 1e-9);
});

test('motion levels', () => {
    assert.equal(motionSettings('reduced').idle, false);
    assert.equal(motionSettings('reduced').crossfadeMs, 150);
    assert.equal(motionSettings('off').crossfadeMs, 0);
    assert.equal(motionSettings('anything').level, 'full');
});

test('thickness follows page count within 8–60 mm', () => {
    assert.equal(thicknessCm(10), 0.8);
    assert.equal(thicknessCm(300), 2.25);
    assert.equal(thicknessCm(5000), 6);
});

test('rows put All books first and filter by shelf', () => {
    const books = [{ id: 'a', pages: 100, shelfIds: ['s1'] }, { id: 'b', pages: 200, shelfIds: [] }];
    const rows = rowsFor(books, [{ id: 's1', name: 'Design' }]);
    assert.deepEqual(rows.map(r => [r.name, r.books.map(b => b.id)]), [['All books', ['a', 'b']], ['Design', ['a']]]);
});

test('row positions pack spines with gaps; camera clamps to the row', () => {
    const { positions, width } = rowPositions([{ id: 'a', pages: 100 }, { id: 'b', pages: 100 }]);
    assert.equal(positions.get('a').x, 0.4);
    assert.ok(Math.abs(positions.get('b').x - (0.8 + 0.35 + 0.4)) < 1e-9);
    assert.ok(Math.abs(width - 1.95) < 1e-9);
    assert.equal(cameraX(5, 10, 20), 5);
    assert.equal(cameraX(0, 100, 20), 12);
    assert.equal(cameraX(100, 100, 20), 88);
});

import { percentile, qualitySteps, QualityMonitor, SOFTWARE_RENDERER } from '../../src/Folio.UI/stage/quality.js';

test('p95 and quality steps', () => {
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 0.95), 100);
    assert.equal(percentile([], 0.95), 0);
    assert.deepEqual(qualitySteps(3).map(s => [s.dpr, s.shadows]), [[2, true], [1.5, true], [1, true], [1, false]]);
    assert.deepEqual(qualitySteps(1).map(s => [s.dpr, s.shadows]), [[1, true], [1, false]]);
});

test('Auto steps down on slow frames and finally asks for 2D', () => {
    const events = [];
    const monitor = new QualityMonitor({ level: 'auto', devicePixelRatio: 2, onStep: s => events.push(['step', s.dpr, s.shadows]), onFallback: r => events.push(['fallback', r]) });
    const slowWindow = () => { for (let i = 0; i < 120; i++) monitor.record(45); };
    for (let i = 0; i < 4; i++) slowWindow();
    assert.deepEqual(events, [['step', 1.5, true], ['step', 1, true], ['step', 1, false], ['fallback', 'slow']]);
});

test('fast frames and fixed levels never step', () => {
    const events = [];
    const fast = new QualityMonitor({ level: 'auto', devicePixelRatio: 2, onStep: () => events.push('step') });
    for (let i = 0; i < 1000; i++) fast.record(10);
    const high = new QualityMonitor({ level: 'high', devicePixelRatio: 2, onStep: () => events.push('step') });
    for (let i = 0; i < 1000; i++) high.record(50);
    assert.deepEqual(events, []);
    assert.equal(new QualityMonitor({ level: 'low', devicePixelRatio: 2 }).current.shadows, false);
});

test('software renderers are detected', () => {
    for (const name of ['Google SwiftShader', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))', 'Microsoft Basic Render Driver', 'llvmpipe (LLVM 17.0.6, 256 bits)'])
        assert.ok(SOFTWARE_RENDERER.test(name), name);
    assert.ok(!SOFTWARE_RENDERER.test('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'));
});
