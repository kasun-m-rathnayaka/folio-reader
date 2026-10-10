/**
 * Folio Coordinate Space Conversion Module
 * 
 * Maps between:
 * 1. PDF Point Space: origin bottom-left of MediaBox/CropBox, +y up.
 * 2. Normalized Visible Page Space (0.0 to 1.0): origin TOP-LEFT of the visible page,
 *    after applying CropBox and clockwise page rotation.
 * 3. Viewport Pixel Space: CSS pixels at zoom level and device pixel ratio.
 */

export class PageGeometry {
  /**
   * @param {number[]} mediaBox [x0, y0, x1, y1]
   * @param {number[]|null} cropBox [x0, y0, x1, y1] or null if identical to mediaBox
   * @param {number} rotation Clockwise rotation degrees: 0, 90, 180, 270
   */
  constructor(mediaBox, cropBox = null, rotation = 0) {
    this.mediaBox = mediaBox;
    this.cropBox = cropBox || mediaBox;
    this.rotation = ((rotation % 360) + 360) % 360;

    this.cropX0 = this.cropBox[0];
    this.cropY0 = this.cropBox[1];
    this.cropX1 = this.cropBox[2];
    this.cropY1 = this.cropBox[3];

    this.pdfWidth = this.cropX1 - this.cropX0;
    this.pdfHeight = this.cropY1 - this.cropY0;

    if (this.rotation === 90 || this.rotation === 270) {
      this.visibleWidth = this.pdfHeight;
      this.visibleHeight = this.pdfWidth;
    } else {
      this.visibleWidth = this.pdfWidth;
      this.visibleHeight = this.pdfHeight;
    }
  }

  /**
   * Converts a PDF point [x, y] to normalized visible page space [nx, ny] (0.0 - 1.0).
   */
  pdfPointToNormalized(x, y) {
    // Clamp to crop box bounds
    const cx = Math.max(this.cropX0, Math.min(this.cropX1, x));
    const cy = Math.max(this.cropY0, Math.min(this.cropY1, y));

    let nx = 0;
    let ny = 0;

    switch (this.rotation) {
      case 0:
        nx = (cx - this.cropX0) / this.pdfWidth;
        ny = (this.cropY1 - cy) / this.pdfHeight;
        break;
      case 90:
        nx = (cy - this.cropY0) / this.pdfHeight;
        ny = (cx - this.cropX0) / this.pdfWidth;
        break;
      case 180:
        nx = (this.cropX1 - cx) / this.pdfWidth;
        ny = (cy - this.cropY0) / this.pdfHeight;
        break;
      case 270:
        nx = (this.cropY1 - cy) / this.pdfHeight;
        ny = (this.cropX1 - cx) / this.pdfWidth;
        break;
      default:
        throw new Error(`Unsupported rotation: ${this.rotation}`);
    }

    return [nx, ny];
  }

  /**
   * Converts a normalized point [nx, ny] back to PDF point [x, y].
   */
  normalizedToPdfPoint(nx, ny) {
    let x = 0;
    let y = 0;

    switch (this.rotation) {
      case 0:
        x = this.cropX0 + nx * this.pdfWidth;
        y = this.cropY1 - ny * this.pdfHeight;
        break;
      case 90:
        x = this.cropX0 + ny * this.pdfWidth;
        y = this.cropY0 + nx * this.pdfHeight;
        break;
      case 180:
        x = this.cropX1 - nx * this.pdfWidth;
        y = this.cropY0 + ny * this.pdfHeight;
        break;
      case 270:
        x = this.cropX1 - ny * this.pdfWidth;
        y = this.cropY1 - nx * this.pdfHeight;
        break;
      default:
        throw new Error(`Unsupported rotation: ${this.rotation}`);
    }

    return [x, y];
  }

  /**
   * Converts a PDF bounding rectangle [x0, y0, x1, y1] to a normalized visible rect [nx, ny, nw, nh].
   */
  pdfRectToNormalized(rect) {
    const [x0, y0, x1, y1] = rect;
    // Map all four corners
    const p1 = this.pdfPointToNormalized(x0, y0);
    const p2 = this.pdfPointToNormalized(x1, y1);

    const minX = Math.min(p1[0], p2[0]);
    const minY = Math.min(p1[1], p2[1]);
    const maxX = Math.max(p1[0], p2[0]);
    const maxY = Math.max(p1[1], p2[1]);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Converts a normalized rect [nx, ny, nw, nh] to viewport pixel coordinates at a given zoom scale.
   * @param {{x: number, y: number, width: number, height: number}} normRect
   * @param {number} scale CSS zoom scale (e.g. 1.0, 1.5, 2.0)
   */
  normalizedToViewportPixels(normRect, scale = 1.0) {
    const pageWidthPx = this.visibleWidth * scale;
    const pageHeightPx = this.visibleHeight * scale;

    return {
      left: normRect.x * pageWidthPx,
      top: normRect.y * pageHeightPx,
      width: normRect.width * pageWidthPx,
      height: normRect.height * pageHeightPx
    };
  }
}
