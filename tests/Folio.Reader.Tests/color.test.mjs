import test from 'node:test';
import assert from 'node:assert/strict';
import { contrast, readableAccent, accentTint, dominantColor, parseHex, toHex } from '../../src/Folio.UI/wwwroot/js/folio-color.mjs';

test('WCAG contrast matches known values', () => {
    assert.equal(Math.round(contrast('#000000', '#FFFFFF') * 10) / 10, 21);
    assert.equal(contrast('#777777', '#777777'), 1);
    assert.ok(contrast('#EDEBE6', '#0B0B0C') > 15);
});

test('hex round-trips', () => {
    assert.deepEqual(parseHex('#abc'), [170, 187, 204]);
    assert.equal(toHex([10, 20, 300]), '#0A14FF');
});

test('readable accent reaches 4.5:1 on both themes', () => {
    for (const bg of ['#0B0B0C', '#F3F0E8']) for (const color of ['#1B2A6B', '#FFE066', '#7F7F7F', '#C0392B']) {
        assert.ok(contrast(readableAccent(color, bg), bg) >= 4.5, `${color} on ${bg}`);
    }
});

test('details tint keeps text and muted text at 4.5:1 or falls back', () => {
    const dark = accentTint('#C0392B', '#0B0B0C', ['#EDEBE6', '#9A968E']);
    assert.ok(dark);
    for (const text of ['#EDEBE6', '#9A968E']) assert.ok(contrast(text, dark) >= 4.5);
    const light = accentTint('#1B2A6B', '#F3F0E8', ['#1A1917', '#5E5A53']);
    assert.ok(light);
    for (const text of ['#1A1917', '#5E5A53']) assert.ok(contrast(text, light) >= 4.5);
    assert.equal(accentTint('#FFFFFF', '#777777', ['#808080']), null);
});

test('dominant colour prefers saturated areas over paper white', () => {
    const pixels = [];
    for (let i = 0; i < 70; i++) pixels.push(250, 250, 248, 255);
    for (let i = 0; i < 30; i++) pixels.push(30, 60, 160, 255);
    const color = parseHex(dominantColor(new Uint8ClampedArray(pixels)));
    assert.ok(color[2] > color[0] + 60, `got ${color}`);
    assert.equal(dominantColor(new Uint8ClampedArray([0, 0, 0, 0])), null);
});
