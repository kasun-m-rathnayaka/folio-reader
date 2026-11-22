// Plate: the PDF's first page as a two-colour halftone in the cloth and ink colours. Coarse dots hide its small print, so the
// typeset title is the only text that reads. Without a page image a seeded portrait-like blob stands in.
import { mix, parseHex, toHex } from '../../wwwroot/js/folio-color.mjs';
import { rng, fbm } from './noise.js';

export function paint(g, area, design, { pageImage, k }) {
    const step = Math.max(6, Math.round(16 * k)), cols = Math.floor(area.w / step), rows = Math.floor(area.h / step);
    const probe = new OffscreenCanvasOrElement(cols, rows);
    const pg = probe.getContext('2d', { willReadFrequently: true });
    let lum;
    if (pageImage) {
        pg.fillStyle = '#fff'; pg.fillRect(0, 0, cols, rows);
        pg.imageSmoothingQuality = 'high';
        pg.drawImage(pageImage, 0, 0, cols, rows);             // the browser averages the page down to one pixel per dot
        const data = pg.getImageData(0, 0, cols, rows).data;
        lum = Float32Array.from({ length: cols * rows }, (_, i) => (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255);
        const sorted = [...lum].sort((a, b) => a - b), lo = sorted[Math.floor(sorted.length * 0.02)], hi = sorted[Math.floor(sorted.length * 0.98)];
        for (let i = 0; i < lum.length; i++) lum[i] = Math.min(1, Math.max(0, (lum[i] - lo) / Math.max(0.05, hi - lo)));
    } else {
        const rand = rng(design.seed), cx = 0.35 + rand() * 0.3, cy = 0.35 + rand() * 0.2;
        lum = Float32Array.from({ length: cols * rows }, (_, i) => {
            const x = (i % cols) / cols, y = Math.floor(i / cols) / rows;
            const d = Math.hypot((x - cx) / 0.28, (y - cy) / 0.38);
            return Math.min(1, Math.max(0, d * 0.9 + (fbm(x * 5, y * 5, design.seed) - 0.5) * 0.7));
        });
    }
    const ink = toHex(mix(parseHex(design.cloth), parseHex(design.title), 0.3));
    g.save();
    g.beginPath(); g.rect(area.x, area.y, area.w, area.h); g.clip();
    g.fillStyle = ink;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const darkness = 1 - lum[r * cols + c];
        const radius = step * 0.52 * Math.pow(darkness, 0.8);
        if (radius < 0.6) continue;
        g.beginPath(); g.arc(area.x + (c + 0.5) * step, area.y + (r + 0.5) * step, radius, 0, Math.PI * 2); g.fill();
    }
    g.restore();
}

function OffscreenCanvasOrElement(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; return canvas;
}
