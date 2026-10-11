import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotateRect, clampRect, resolvePageIndex } from '../../src/Folio.UI/wwwroot/js/reader-geometry.mjs';
test('annotations return to the same canonical rectangle after any quarter turn', () => {
  const rect = { x:.12, y:.33, width:.23, height:.07 };
  for (const turn of [0,90,180,270]) {
    const restored = rotateRect(rotateRect(rect, turn), -turn);
    for (const key of Object.keys(rect)) assert.ok(Math.abs(restored[key] - rect[key]) < 1e-12);
  }
});
test('a top-left highlight appears at top-right after a clockwise turn', () => {
  assert.deepEqual(rotateRect({x:0,y:0,width:.2,height:.1},90), {x:.9,y:0,width:.1,height:.2});
});
test('selection rectangles cannot extend past the page edges', () => {
  assert.deepEqual(clampRect({x:.9,y:.8,width:.5,height:.5}), {x:.9,y:.8,width:1-.9,height:1-.8});
});
test('invalid navigation targets clamp to a real page', () => {
  assert.equal(resolvePageIndex(-1,300),0); assert.equal(resolvePageIndex(1000,300),299);
  assert.equal(resolvePageIndex(NaN,300),0);
});
