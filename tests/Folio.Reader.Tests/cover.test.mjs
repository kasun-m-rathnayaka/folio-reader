import test from 'node:test';
import assert from 'node:assert/strict';
import { designFor, templateFor, fitTitle, ellipsize, titleColorFor, clothFor, hashString, TEMPLATES, CLOTH_COLORS, TEXT_CONTRAST, DESIGN_VERSION } from '../../src/Folio.UI/stage/cover-design.js';
import { contrast } from '../../src/Folio.UI/wwwroot/js/folio-color.mjs';

const ids = Array.from({ length: 400 }, (_, i) => `book-${i}-${(i * 2654435761) >>> 0}`);
// A stub measure: 0.5 em per character, so widths are exact and the test needs no canvas.
const measure = (text, size) => text.length * size * 0.5;

test('the same book always gets the same design', () => {
    for (const id of ids.slice(0, 60)) {
        const a = designFor({ id }, '#8844AA'), b = designFor({ id }, '#8844AA');
        assert.deepEqual(a, b);
        assert.equal(a.version, DESIGN_VERSION);
    }
});

test('all four templates are used and the choice depends only on the book id', () => {
    const seen = new Set(ids.map(templateFor));
    assert.deepEqual([...seen].sort(), [...TEMPLATES].sort());
    const counts = Object.fromEntries(TEMPLATES.map(t => [t, ids.filter(id => templateFor(id) === t).length]));
    for (const t of TEMPLATES) assert.ok(counts[t] > 60, `${t}: ${counts[t]}`);   // roughly even, not skewed
});

test('title and author text keep 4.5:1 on every cloth colour', () => {
    for (const cloth of CLOTH_COLORS) assert.ok(titleColorFor(cloth).ratio >= TEXT_CONTRAST, `${cloth}: ${titleColorFor(cloth).ratio}`);
    for (const dominant of ['#FFFFFF', '#000000', '#FF0000', '#FFFF00', '#00FF00', '#7F7F7F', '#C0392B', '#1B2A6B', '#F7E9A0', null]) {
        for (const id of ids.slice(0, 40)) {
            const design = designFor({ id }, dominant);
            assert.ok(contrast(design.cloth, design.title) >= TEXT_CONTRAST, `${dominant} → ${design.cloth} vs ${design.title}`);
        }
    }
});

test('a dull page-1 colour falls back to a curated cloth; a vivid one that can carry the title is used', () => {
    assert.ok(CLOTH_COLORS.includes(clothFor('x', '#FFFFFF')));          // paper white has no colour of its own
    assert.ok(CLOTH_COLORS.includes(clothFor('x', null)));
    assert.equal(clothFor('x', '#1B2A6B'), '#1B2A6B');                   // a deep blue reads fine as is
    assert.equal(clothFor('a', '#999999'), clothFor('a', null));         // grey: same as no colour
});

test('titles fit in three lines or fewer at every length, or end in an ellipsis', () => {
    const titles = ['Go', 'The Rust Programming Language', 'Non-Destructive Annotation Anchoring', 'A'.repeat(80),
        'An Exceptionally Long Title That Goes On And On Across Many Words To Test The Fitting Of Wrapped Lines Properly',
        'Supercalifragilisticexpialidocious Pneumonoultramicroscopicsilicovolcanoconiosis', '', '   '];
    for (const text of titles) {
        const fit = fitTitle(measure, text, { maxWidth: 360, maxLines: 3, startSize: 120, minSize: 36 });
        assert.ok(fit.lines.length >= 1 && fit.lines.length <= 3, `${text}: ${fit.lines.length}`);
        for (const line of fit.lines) assert.ok(measure(line, fit.size) <= 360 + 1e-9, `${text}: "${line}" is ${measure(line, fit.size)} wide`);
    }
    const short = fitTitle(measure, 'Go', { maxWidth: 360, maxLines: 3, startSize: 120, minSize: 36 });
    assert.equal(short.size, 120);                                       // short titles keep the large type
    const long = fitTitle(measure, titles[4], { maxWidth: 360, maxLines: 3, startSize: 120, minSize: 36 });
    assert.ok(long.size < 120 && long.truncated);
});

test('ellipsize only cuts what does not fit', () => {
    assert.equal(ellipsize(measure, 'short', 20, 400), 'short');
    assert.ok(ellipsize(measure, 'x'.repeat(100), 20, 100).endsWith('…'));
});

test('hashing is stable', () => {
    assert.equal(hashString('folio'), hashString('folio'));
    assert.notEqual(hashString('folio'), hashString('folio '));
});
