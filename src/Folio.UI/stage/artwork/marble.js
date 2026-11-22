// Marble: marbled paper from domain-warped noise in three palette colours. The same field is sampled for the spine at a
// matching offset, so the pattern wraps around the book.
import { mix, parseHex, toHex } from '../../wwwroot/js/folio-color.mjs';
import { fbm } from './noise.js';

export function palette(design) {
    const cloth = parseHex(design.cloth), title = parseHex(design.title);
    return [mix(cloth, [0, 0, 0], 0.35), cloth, mix(cloth, title, 0.42)];
}

/** Draws the marble field for `region` of a canvas; `u0`/`v0` shift into the shared field (the spine uses an offset). */
export function paint(g, area, design, { u0 = 0, v0 = 0, fieldW = 1, fieldH = 1 } = {}) {
    const scale = 4, w = Math.max(8, Math.round(area.w / scale)), h = Math.max(8, Math.round(area.h / scale));
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const cg = canvas.getContext('2d');
    const image = cg.createImageData(w, h);
    const [dark, mid, light] = palette(design);
    const seed = design.seed;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = u0 + (x / w) * fieldW, v = v0 + (y / h) * fieldH;
        const wx = fbm(u * 2.2, v * 2.2, seed, 4), wy = fbm(u * 2.2 + 7.3, v * 2.2 + 3.1, seed + 5, 4);
        const t = 0.5 + 0.5 * Math.sin((u * 3 + (wx - 0.5) * 5.5 + v * 1.2) * Math.PI * 2 + (wy - 0.5) * 6);
        const band = t < 0.5 ? mix(dark, mid, t * 2) : mix(mid, light, (t - 0.5) * 2);
        const i = (y * w + x) * 4;
        image.data[i] = band[0]; image.data[i + 1] = band[1]; image.data[i + 2] = band[2]; image.data[i + 3] = 255;
    }
    cg.putImageData(image, 0, 0);
    g.save();
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(canvas, area.x, area.y, area.w, area.h);
    g.restore();
}
