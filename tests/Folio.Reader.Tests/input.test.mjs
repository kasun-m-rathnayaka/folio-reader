import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureGate } from '../../src/Folio.UI/stage/input.js';

// Replays a recorded stream of [timeMs, deltaX, deltaY] through the gate and returns what it produced.
function replay(stream, options = {}) {
    const gate = new GestureGate();
    const intents = []; let pan = 0;
    for (const [t, dx, dy] of stream) {
        const r = gate.wheel({ deltaX: dx, deltaY: dy, deltaMode: 0, ...options }, t);
        if (r.intent) intents.push(r.intent);
        pan += r.pan;
    }
    return { intents, pan };
}

// A macOS-style swipe: a quick ramp up, then 1.2 s of decaying momentum, ~40 events.
const swipe = (start = 0, sign = 1) => Array.from({ length: 40 }, (_, i) => [start + i * 30, 0, sign * Math.max(1, Math.round(60 * Math.exp(-i / 9)))]);

test('a trackpad swipe with 1.2 s of momentum moves exactly one step', () => {
    assert.deepEqual(replay(swipe()).intents, ['down']);
    assert.deepEqual(replay(swipe(0, -1)).intents, ['up']);
});

test('two swipes separated by a pause move two steps', () => {
    const stream = [...swipe(0), ...swipe(1200 + 400)];
    assert.deepEqual(replay(stream).intents, ['down', 'down']);
});

test('mouse wheel notches 300 ms apart are one step each; a fast spin is one step', () => {
    assert.deepEqual(replay([[0, 0, 100], [300, 0, 100], [600, 0, 100]]).intents, ['down', 'down', 'down']);
    assert.deepEqual(replay([[0, 0, 100], [50, 0, 100], [100, 0, 100], [150, 0, 100]]).intents, ['down']);
});

test('small wheel deltas add up before they fire', () => {
    assert.deepEqual(replay([[0, 0, 10], [20, 0, 10], [40, 0, 10]]).intents, []);
    assert.deepEqual(replay([[0, 0, 10], [20, 0, 10], [40, 0, 10], [60, 0, 15]]).intents, ['down']);
});

test('a horizontal stream pans and never changes shelf', () => {
    const stream = Array.from({ length: 30 }, (_, i) => [i * 40, 30, i % 5 === 0 ? 6 : 1]);
    const { intents, pan } = replay(stream);
    assert.deepEqual(intents, []);
    assert.equal(pan, 30 * 30);
});

test('Shift + wheel pans along the row', () => {
    const { intents, pan } = replay([[0, 0, 100], [300, 0, 100]], { shiftKey: true });
    assert.deepEqual(intents, []);
    assert.equal(pan, 200);
});

test('line-mode deltas are scaled to pixels', () => {
    const gate = new GestureGate();
    assert.equal(gate.wheel({ deltaX: 0, deltaY: 3, deltaMode: 1 }, 0).intent, 'down'); // 3 lines = 48 px
});

test('direction reversal inside one gesture does not fire a second step', () => {
    const stream = [[0, 0, 50], [30, 0, -80], [60, 0, -80], [90, 0, -80]];
    assert.deepEqual(replay(stream).intents, ['down']);
});
