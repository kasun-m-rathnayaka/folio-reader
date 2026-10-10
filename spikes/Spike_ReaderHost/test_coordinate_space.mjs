import test from 'node:test';
import assert from 'node:assert/strict';
import { PageGeometry } from './coordinate_space.mjs';

test('Standard 0 deg page: origin and bounds conversion', () => {
  const geo = new PageGeometry([0, 0, 612, 792], null, 0);

  assert.equal(geo.visibleWidth, 612);
  assert.equal(geo.visibleHeight, 792);

  // Top-left in PDF is (0, 792), should map to normalized (0, 0)
  const [nx0, ny0] = geo.pdfPointToNormalized(0, 792);
  assert.equal(nx0, 0);
  assert.equal(ny0, 0);

  // Bottom-right in PDF is (612, 0), should map to normalized (1, 1)
  const [nx1, ny1] = geo.pdfPointToNormalized(612, 0);
  assert.equal(nx1, 1);
  assert.equal(ny1, 1);

  // Center (306, 396) maps to (0.5, 0.5)
  const [cx, cy] = geo.pdfPointToNormalized(306, 396);
  assert.equal(cx, 0.5);
  assert.equal(cy, 0.5);

  // Roundtrip
  const [revX, revY] = geo.normalizedToPdfPoint(cx, cy);
  assert.equal(revX, 306);
  assert.equal(revY, 396);
});

test('Rotated 90 deg clockwise page: axes transpose correctly', () => {
  const geo = new PageGeometry([0, 0, 612, 792], null, 90);

  // In 90 deg clockwise, visible width is PDF height (792), visible height is PDF width (612)
  assert.equal(geo.visibleWidth, 792);
  assert.equal(geo.visibleHeight, 612);

  // Visual top-left corresponds to PDF (0, 0)
  const [nx0, ny0] = geo.pdfPointToNormalized(0, 0);
  assert.equal(nx0, 0);
  assert.equal(ny0, 0);

  // Visual bottom-right corresponds to PDF (612, 792)
  const [nx1, ny1] = geo.pdfPointToNormalized(612, 792);
  assert.equal(nx1, 1);
  assert.equal(ny1, 1);

  // Roundtrip test
  const [revX, revY] = geo.normalizedToPdfPoint(0.25, 0.75);
  const [normX, normY] = geo.pdfPointToNormalized(revX, revY);
  assert.ok(Math.abs(normX - 0.25) < 1e-6);
  assert.ok(Math.abs(normY - 0.75) < 1e-6);
});

test('Rotated 270 deg page: axes transpose correctly', () => {
  const geo = new PageGeometry([0, 0, 612, 792], null, 270);

  assert.equal(geo.visibleWidth, 792);
  assert.equal(geo.visibleHeight, 612);

  // Visual top-left in 270 deg corresponds to PDF (612, 792)
  const [nx0, ny0] = geo.pdfPointToNormalized(612, 792);
  assert.equal(nx0, 0);
  assert.equal(ny0, 0);

  // Visual bottom-right corresponds to PDF (0, 0)
  const [nx1, ny1] = geo.pdfPointToNormalized(0, 0);
  assert.equal(nx1, 1);
  assert.equal(ny1, 1);

  // Roundtrip
  const [revX, revY] = geo.normalizedToPdfPoint(0.4, 0.6);
  const [normX, normY] = geo.pdfPointToNormalized(revX, revY);
  assert.ok(Math.abs(normX - 0.4) < 1e-6);
  assert.ok(Math.abs(normY - 0.6) < 1e-6);
});

test('Cropped page (CropBox [36, 36, 576, 756]): offsets adjusted', () => {
  const geo = new PageGeometry([0, 0, 612, 792], [36, 36, 576, 756], 0);

  // Visible width = 576 - 36 = 540; height = 756 - 36 = 720
  assert.equal(geo.visibleWidth, 540);
  assert.equal(geo.visibleHeight, 720);

  // Visual top-left in crop box is (36, 756)
  const [nx0, ny0] = geo.pdfPointToNormalized(36, 756);
  assert.equal(nx0, 0);
  assert.equal(ny0, 0);

  // Visual bottom-right in crop box is (576, 36)
  const [nx1, ny1] = geo.pdfPointToNormalized(576, 36);
  assert.equal(nx1, 1);
  assert.equal(ny1, 1);

  // Rectangle conversion
  const normRect = geo.pdfRectToNormalized([72, 700, 200, 720]);
  assert.ok(normRect.x > 0 && normRect.x < 1);
  assert.ok(normRect.y > 0 && normRect.y < 1);
  assert.ok(normRect.width > 0 && normRect.height > 0);

  // Viewport pixel conversion at 150% zoom
  const px = geo.normalizedToViewportPixels(normRect, 1.5);
  assert.equal(px.left, normRect.x * 540 * 1.5);
  assert.equal(px.top, normRect.y * 720 * 1.5);
  assert.equal(px.width, normRect.width * 540 * 1.5);
  assert.equal(px.height, normRect.height * 720 * 1.5);
});

