import test from 'node:test';
import assert from 'node:assert/strict';
import { Pan, PAN, panBounds } from '../../src/Folio.UI/stage/pan.js';
import { rowPositions, visibleRange } from '../../src/Folio.UI/stage/layout.js';

const run = (pan, seconds, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) pan.step(dt); };

test('bounds: narrow rows sit centred, wide rows pan within the ends', () => {
    assert.deepEqual(panBounds(30, 20), [15, 15]);
    assert.deepEqual(panBounds(500, 20), [12, 488]);
});

test('a flick glides with friction and stops', () => {
    const pan = new Pan(); pan.setBounds(0, 1000); pan.x = 100;
    pan.beginDrag(); pan.dragBy(5, 1 / 60); pan.dragBy(5, 1 / 60); pan.endDrag(0);
    const speed = pan.v;
    assert.ok(speed > 100);
    run(pan, 0.5);
    assert.ok(pan.x > 100 && pan.v < speed);
    run(pan, 5);
    assert.equal(pan.active, false);
    // total glide distance of an exponential decay is v / λ
    assert.ok(Math.abs(pan.x - (100 + 10 + speed / PAN.friction)) < speed * 0.02 + 15);
});

test('a pause before release means no glide', () => {
    const pan = new Pan(); pan.setBounds(0, 1000);
    pan.beginDrag(); pan.dragBy(8, 1 / 60); pan.endDrag(300);
    assert.equal(pan.v, 0);
});

test('past an end the row resists, stays within 20 cm and springs back', () => {
    const pan = new Pan(); pan.setBounds(0, 100); pan.x = 100;
    pan.beginDrag();
    pan.dragBy(3, 1 / 60);
    const first = pan.over;                                     // the first outward pixels already move less than the hand
    assert.ok(first > 0 && first < 3);
    let before = pan.over;
    for (let i = 0; i < 200; i++) { before = pan.over; pan.dragBy(3, 1 / 60); }   // keep dragging outward
    assert.ok(pan.over <= PAN.band, String(pan.over));
    assert.ok(pan.over - before < first / 4, 'resistance grows as it stretches');
    pan.endDrag(300);
    run(pan, 1.5);
    assert.ok(Math.abs(pan.x - 100) < 0.01, String(pan.x));
});

test('a fast glide into an end is absorbed by the band and returns', () => {
    const pan = new Pan(); pan.setBounds(0, 100); pan.x = 90; pan.v = 900;
    let peak = 0;
    for (let t = 0; t < 3; t += 1 / 60) { pan.step(1 / 60); peak = Math.max(peak, pan.over); }
    assert.ok(peak > 0 && peak <= PAN.band);
    assert.ok(Math.abs(pan.x - 100) < 0.01);
});

test('recentre eases to a target within the bounds and dragging cancels it', () => {
    const pan = new Pan(); pan.setBounds(10, 500); pan.x = 100;
    pan.recenter(300);
    run(pan, 2);
    assert.ok(Math.abs(pan.x - 300) < 0.02);
    pan.recenter(9999);
    assert.equal(pan.target, 500);
    pan.dragBy(2);
    assert.equal(pan.target, null);
});

test('visible range finds the books near x by binary search', () => {
    const books = Array.from({ length: 2000 }, (_, i) => ({ id: `b${i}`, pages: 100 + (i % 7) * 40 }));
    const layout = rowPositions(books);
    const [a, b] = visibleRange(layout, 500, 700);
    assert.ok(a > 0 && b > a && b < 2000);
    for (let i = a; i < b; i++) assert.ok(layout.xs[i] >= 500 && layout.xs[i] <= 700);
    assert.ok(layout.xs[a - 1] < 500 && layout.xs[b] > 700);
    assert.deepEqual(visibleRange(layout, -50, -10), [0, 0]);
    assert.deepEqual(visibleRange(layout, layout.width + 10, layout.width + 50), [2000, 2000]);
});
