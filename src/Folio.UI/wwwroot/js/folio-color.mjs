// Colour helpers shared by the 2D library, the details view and (later) the 3D stage. Pure functions, unit-tested.
// Contrast follows WCAG 2.2: relative luminance and (L1 + 0.05) / (L2 + 0.05).

export function parseHex(hex) {
    const value = String(hex).trim().replace(/^#/, '');
    const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value;
    if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Not a hex colour: ${hex}`);
    return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
}

export const toHex = rgb => '#' + rgb.map(c => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('').toUpperCase();

export function luminance(rgb) {
    const [r, g, b] = rgb.map(c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
    const [x, y] = [luminance(typeof a === 'string' ? parseHex(a) : a), luminance(typeof b === 'string' ? parseHex(b) : b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export const mix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);

/** Moves a colour toward white (dark backgrounds) or black (light) until it reaches minRatio against bg. */
export function readableAccent(color, background, minRatio = 4.5) {
    let rgb = typeof color === 'string' ? parseHex(color) : color;
    const bg = typeof background === 'string' ? parseHex(background) : background;
    const target = luminance(bg) < 0.5 ? [255, 255, 255] : [0, 0, 0];
    for (let step = 0; step <= 20 && contrast(rgb, bg) < minRatio; step++) rgb = mix(rgb, target, 0.1);
    return toHex(rgb);
}

/**
 * The details page background: the page colour tinted toward the book's accent, as strongly as possible while every
 * listed text colour keeps minRatio. Returns null when no tint passes, so callers fall back to the neutral surface.
 */
export function detailsTint(accent, background, textColors, minRatio = 4.5) {
    const a = parseHex(accent), bg = parseHex(background), texts = textColors.map(parseHex);
    for (let t = 0.32; t >= 0.04; t -= 0.04) {
        const tint = mix(bg, a, t);
        if (texts.every(text => contrast(text, tint) >= minRatio)) return toHex(tint);
    }
    return null;
}

/**
 * Dominant colour of RGBA pixel data: a saturation- and coverage-weighted average over coarse hue bins, so a small
 * vivid title does not lose to a large paper-white margin, and pure white/black areas count little.
 */
export function dominantColor(data) {
    const bins = new Map();
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b), saturation = max === 0 ? 0 : (max - min) / max;
        const weight = 0.15 + saturation * (1 - Math.abs(max / 255 - 0.55));
        const key = `${r >> 5},${g >> 5},${b >> 5}`;
        const bin = bins.get(key) || { w: 0, r: 0, g: 0, b: 0 };
        bin.w += weight; bin.r += r * weight; bin.g += g * weight; bin.b += b * weight;
        bins.set(key, bin);
    }
    let best = null;
    for (const bin of bins.values()) if (!best || bin.w > best.w) best = bin;
    return best ? toHex([best.r / best.w, best.g / best.w, best.b / best.w]) : null;
}
