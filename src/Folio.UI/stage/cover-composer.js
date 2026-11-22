// Paints every cover and spine from the book's own title and author (WP5). The raw PDF page 1 never appears on the board:
// it only feeds the Plate template's halftone and the cloth colour. A cover is 2:3 (1024 × 1536 for the open or presented
// book, 512 × 768 for the shelf); a spine is 128 × 1024 (64 × 512 on the shelf). Painting is deterministic per design.
import { designFor, fitTitle, ellipsize } from './cover-design.js';
import * as plate from './artwork/plate.js';
import * as marble from './artwork/marble.js';
import * as line from './artwork/line.js';
import * as cloth from './artwork/cloth.js';

export const COVER_SIZES = { shelf: 512, full: 1024 }, SPINE_SIZES = { shelf: 64, full: 128 };
const DISPLAY = '"Instrument Serif", "Iowan Old Style", Georgia, serif', UI = 'Inter, "Segoe UI", system-ui, sans-serif', MONO = '"JetBrains Mono", ui-monospace, monospace';
const ARTWORK = { plate, marble, line, cloth };
/** ORM texel for plain cloth (roughness 0.8, no metal) and for foil (roughness 0.3, metalness 0.8): G = roughness, B = metalness. */
const ORM_CLOTH = '#FFCC00', ORM_FOIL = '#FF4DCC';
// The Folio mark: an F in a square, one colour (see wwwroot/images/folio-mark.svg for the same path).
const MARK_PATH = 'M20 16h26v7H28v9h15v7H28v17h-8z';
let markPath = null;

const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

function drawMark(g, x, y, size, color, k) {
    markPath ??= new Path2D(MARK_PATH);
    g.save();
    g.translate(x, y); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = Math.max(1.5, 3 * k);
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, size - g.lineWidth, size - g.lineWidth);
    g.scale(size / 64, size / 64); g.fill(markPath);
    g.restore();
}

const setSpacing = (g, px) => { if ('letterSpacing' in g) g.letterSpacing = `${px}px`; };

/** Wraps and paints the author and title onto `g` in `color`; the same call draws the foil mask. Returns where it ended. */
function paintType(g, book, design, { W, k, color }) {
    const margin = 72 * k;
    g.save();
    g.fillStyle = color; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    let y = margin + 24 * k;
    const author = (book.author || '').trim();
    if (author) {
        g.font = `500 ${28 * k}px ${UI}`; setSpacing(g, 2.2 * k);
        g.fillText(ellipsize((t, s) => g.measureText(t).width, author.toUpperCase(), 28 * k, W * 0.56), margin, y);
        y += 20 * k;
    }
    setSpacing(g, 0);
    const maxWidth = W - margin * 2 - 112 * k;
    const measure = (text, size) => { g.font = `${size}px ${DISPLAY}`; return g.measureText(text).width; };
    const fit = fitTitle(measure, book.title || 'Untitled', { maxWidth, maxLines: 3, startSize: 132 * k, minSize: 56 * k });
    g.font = `${fit.size}px ${DISPLAY}`;
    y += fit.size * 0.86;
    for (const text of fit.lines) { g.fillText(text, margin, y); y += fit.size * 0.95; }
    g.restore();
    return { fit, bottom: y };
}

/** Cover images for one book: `color` (sRGB), `orm` (roughness and metalness: foil title and mark), `normal` (cloth only). */
export function composeCover(book, { width = COVER_SIZES.full, dominant = null, pageImage = null, design = designFor(book, dominant) } = {}) {
    const W = width, H = Math.round(width * 1.5), k = W / 1024, margin = 72 * k;
    const color = canvas(W, H), orm = canvas(W, H);
    const g = color.getContext('2d'), og = orm.getContext('2d');
    g.fillStyle = design.cloth; g.fillRect(0, 0, W, H);
    og.fillStyle = ORM_CLOTH; og.fillRect(0, 0, W, H);

    // Artwork fills the lower 60% of the board.
    const area = { x: 0, y: Math.round(H * 0.4), w: W, h: H - Math.round(H * 0.4) };
    ARTWORK[design.template].paint(g, area, design, { pageImage, k });
    // The artwork dissolves into the cloth at its top edge instead of ending in a hard line.
    if (design.template !== 'line') {
        const fade = g.createLinearGradient(0, area.y, 0, area.y + H * 0.14);
        fade.addColorStop(0, design.cloth); fade.addColorStop(1, `${design.cloth}00`);
        g.fillStyle = fade; g.fillRect(0, area.y, W, H * 0.14);
    }
    // A soft vignette keeps the title area calm and gives the board some depth.
    const shade = g.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(0,0,0,.18)'); shade.addColorStop(0.4, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.28)');
    g.fillStyle = shade; g.fillRect(0, 0, W, H);

    // Type and mark. Foil templates also write the title, author and mark into the ORM texture so they catch the light.
    const foiled = design.template !== 'cloth';
    paintType(g, book, design, { W, k, color: design.title });
    drawMark(g, W - margin - 84 * k, margin, 84 * k, design.title, k);
    let normal = null;
    if (foiled) {
        paintType(og, book, design, { W, k, color: ORM_FOIL });
        drawMark(og, W - margin - 84 * k, margin, 84 * k, ORM_FOIL, k);
    } else {
        // Cloth: blind-debossed title. Draw the title mask small, then turn its edges into a normal map.
        const mask = canvas(Math.round(W / 2), Math.round(H / 2)), mg = mask.getContext('2d');
        mg.fillStyle = '#000'; mg.fillRect(0, 0, mask.width, mask.height);
        mg.scale(0.5, 0.5); paintType(mg, book, design, { W, k, color: '#fff' }); drawMark(mg, W - margin - 84 * k, margin, 84 * k, '#fff', k);
        normal = normalFromMask(mask, W, H);
    }
    return { color, orm, normal, design };
}

/** Endpaper: marbled paper in the cover's palette, lightened toward cream, for the inside of the boards (WP6). */
export function composeEndpaper(design, width = 256) {
    const W = width, H = Math.round(width * 1.5), c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = design.cloth; g.fillRect(0, 0, W, H);
    marble.paint(g, { x: 0, y: 0, w: W, h: H }, { ...design, seed: design.seed ^ 0x5bd1e995 }, { fieldW: 1, fieldH: 1.5 });
    g.fillStyle = 'rgba(243,238,226,.58)'; g.fillRect(0, 0, W, H);
    return c;
}

/** A tangent-space normal map from a white-on-black mask: the white areas press into the board. */
export function normalFromMask(mask, W, H, strength = 3) {
    const w = mask.width, h = mask.height, src = mask.getContext('2d').getImageData(0, 0, w, h).data;
    const height = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) height[i] = src[i * 4] / 255;
    // Two box-blur passes soften the pressed edge so it catches the light instead of aliasing.
    const blur = (input) => { const out = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += input[yy * w + xx]; n++; } } out[y * w + x] = s / n; } return out; };
    const soft = blur(blur(height));
    const at = (x, y) => soft[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
    const small = canvas(w, h), sg = small.getContext('2d'), out = sg.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength, len = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
        out.data[i] = Math.round((-dx / len * 0.5 + 0.5) * 255); out.data[i + 1] = Math.round((dy / len * 0.5 + 0.5) * 255); out.data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255); out.data[i + 3] = 255;
    }
    sg.putImageData(out, 0, 0);
    const full = canvas(W, H); const fg = full.getContext('2d'); fg.imageSmoothingQuality = 'high'; fg.drawImage(small, 0, 0, W, H);
    return full;
}

/** Spine image: author in mono caps at the top, the title in Instrument Serif running top to bottom, the mark at the foot. */
export function composeSpine(book, { width = SPINE_SIZES.full, dominant = null, design = designFor(book, dominant) } = {}) {
    const W = width, H = width * 8, k = W / 128;
    const c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = design.cloth; g.fillRect(0, 0, W, H);
    if (design.template === 'marble') marble.paint(g, { x: 0, y: 0, w: W, h: H }, design, { u0: 1.0, v0: 0, fieldW: 0.14, fieldH: 1 });   // continues the board's pattern around the spine
    else cloth.paint(g, { x: 0, y: 0, w: W, h: H }, design, { k: k * 2 });
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, W, H);
    g.save();
    g.translate(W / 2, 0); g.rotate(Math.PI / 2);
    g.fillStyle = design.title; g.textBaseline = 'middle'; g.textAlign = 'left';
    const author = (book.author || '').trim();
    const measureAuthor = (t) => g.measureText(t).width;
    if (author) {
        g.font = `500 ${15 * k}px ${MONO}`; setSpacing(g, 1.6 * k);
        g.globalAlpha = 0.85;
        g.fillText(ellipsize(measureAuthor, author.toUpperCase(), 15 * k, H * 0.2), 42 * k, 2 * k);
        g.globalAlpha = 1; setSpacing(g, 0);
    }
    const titleMax = H * 0.58, titleStart = H * 0.27;
    const measure = (text, size) => { g.font = `${size}px ${DISPLAY}`; return g.measureText(text).width; };
    const fit = fitTitle(measure, book.title || 'Untitled', { maxWidth: titleMax, maxLines: 1, startSize: 44 * k, minSize: 22 * k });
    g.font = `${fit.size}px ${DISPLAY}`;
    g.fillText(fit.lines[0], titleStart, 2 * k);
    g.restore();
    drawMark(g, (W - 40 * k) / 2, H - 100 * k, 40 * k, design.title, k * 0.6);
    return c;
}

export const canvasToBlob = (c, type = 'image/png') => new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), type));
