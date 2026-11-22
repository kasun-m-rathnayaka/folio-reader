// The design of a generated cover (WP5): which template a book gets, its cloth colour, the title colour and how the title
// wraps. Pure and deterministic — the same book always gets the same design — so it is unit-tested without a canvas.
import { parseHex, toHex, mix, contrast } from '../wwwroot/js/folio-color.mjs';

/** Bump when a template changes: cached covers are keyed by it. */
export const DESIGN_VERSION = 2;
export const TEMPLATES = ['plate', 'marble', 'line', 'cloth'];
export const CREAM = '#F2EEE6', INK = '#16130F';
/** Title and author text must keep at least this contrast against the cloth. */
export const TEXT_CONTRAST = 4.5;

/** 12 curated cloth colours: used when a book's own colour is dull or cannot carry the title. */
export const CLOTH_COLORS = ['#1F3D36', '#5A1F26', '#1B2A4A', '#B9852B', '#2B5F63', '#4B2A4E', '#3C4650', '#8A3F22', '#4F5B2A', '#CDBA94', '#6B2D3E', '#24402A'];

/** FNV-1a: a stable 32-bit hash of a string. */
export function hashString(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
}

export const templateFor = bookId => TEMPLATES[hashString(String(bookId)) % TEMPLATES.length];

/** Whichever of cream and ink reads better on a colour, with its contrast ratio. */
export function titleColorFor(cloth) {
    const cream = contrast(cloth, CREAM), ink = contrast(cloth, INK);
    return cream >= ink ? { color: CREAM, ratio: cream } : { color: INK, ratio: ink };
}

const saturationOf = ([r, g, b]) => { const max = Math.max(r, g, b), min = Math.min(r, g, b); return max === 0 ? 0 : (max - min) / max; };
const hueOf = ([r, g, b]) => {
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    if (d === 0) return 0;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
};
const hueDistance = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/**
 * The cloth colour: page 1's dominant colour when it is colourful and carries the title at 4.5:1 (after pulling it into a
 * mid-tone), otherwise the nearest curated colour by hue, or a hash-picked one when page 1 has no colour of its own.
 */
export function clothFor(bookId, dominant) {
    if (dominant) {
        const rgb = parseHex(dominant);
        if (saturationOf(rgb) >= 0.22) {
            // Cover cloth is a mid-to-dark tone: pull very light or very dark dominants toward it.
            const light = (rgb[0] + rgb[1] + rgb[2]) / 765;
            const adjusted = light > 0.62 ? mix(rgb, [20, 18, 16], 0.45) : light < 0.12 ? mix(rgb, [90, 84, 78], 0.35) : rgb;
            const hex = toHex(adjusted);
            if (titleColorFor(hex).ratio >= TEXT_CONTRAST) return hex;
            const hue = hueOf(rgb);
            return CLOTH_COLORS.map(c => ({ c, d: hueDistance(hue, hueOf(parseHex(c))) })).sort((a, b) => a.d - b.d)[0].c;
        }
    }
    return CLOTH_COLORS[hashString(`${bookId}:cloth`) % CLOTH_COLORS.length];
}

/** Everything the painters need, derived from the book id and page 1's dominant colour. */
export function designFor(book, dominant = null) {
    const cloth = clothFor(book.id, dominant);
    const text = titleColorFor(cloth);
    const foil = contrast(cloth, '#D9B98C') >= 3 ? '#D9B98C' : text.color;
    return { version: DESIGN_VERSION, template: templateFor(book.id), seed: hashString(`${book.id}:art`), cloth, title: text.color, titleContrast: text.ratio, foil };
}

/** Cuts a line that is still too wide (one very long word) so it ends in an ellipsis within `maxWidth`. */
export function ellipsize(measure, text, size, maxWidth) {
    if (measure(text, size) <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && measure(`${t}…`, size) > maxWidth) t = t.slice(0, -1);
    return `${t}…`;
}

/**
 * Wraps a title into at most `maxLines` lines no wider than `maxWidth`, shrinking the type from `startSize` toward
 * `minSize` when it does not fit; if it still does not, the last line is cut with an ellipsis. `measure(text, size)` returns
 * a width, so the same logic runs against a canvas or a stub.
 */
export function fitTitle(measure, text, { maxWidth, maxLines = 3, startSize, minSize }) {
    const words = String(text || 'Untitled').trim().split(/\s+/);
    const wrap = size => {
        const lines = []; let line = '';
        for (const word of words) {
            const next = line ? `${line} ${word}` : word;
            if (!line || measure(next, size) <= maxWidth) line = next; else { lines.push(line); line = word; }
        }
        lines.push(line);
        return lines;
    };
    for (let size = startSize; size >= minSize; size -= 2) {
        const lines = wrap(size);
        if (lines.length <= maxLines && lines.every(l => measure(l, size) <= maxWidth || !l.includes(' ') && size <= minSize))
            return { lines: lines.map(l => ellipsize(measure, l, size, maxWidth)), size, truncated: false };
    }
    const lines = wrap(minSize).slice(0, maxLines);
    let last = lines[lines.length - 1];
    while (last.length > 1 && measure(`${last}…`, minSize) > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last.replace(/[\s.,;:]+$/, '')}…`;
    return { lines, size: minSize, truncated: true };
}
