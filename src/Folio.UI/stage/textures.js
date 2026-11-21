// Generated textures (LIB-4): cover from the PDF's first-page render, spine drawn from title and author, cream
// page edges, and the cover's dominant colour as the book's accent. Covers and spines live in an LRU of ~120 books.
import * as THREE from 'three';
import { dominantColor, parseHex, toHex, mix } from '../wwwroot/js/folio-color.mjs';

export const COVER_MAX = 512, SPINE_W = 64, SPINE_H = 512;

export class LruCache {
    constructor(limit, dispose) { this.limit = limit; this.dispose = dispose; this.map = new Map(); }
    get(key) {
        if (!this.map.has(key)) return undefined;
        const value = this.map.get(key); this.map.delete(key); this.map.set(key, value); return value;
    }
    set(key, value) {
        if (this.map.has(key)) this.map.delete(key);
        this.map.set(key, value);
        while (this.map.size > this.limit) { const [oldest, old] = this.map.entries().next().value; this.map.delete(oldest); this.dispose?.(old, oldest); }
    }
    has(key) { return this.map.has(key); }
    delete(key) { const value = this.map.get(key); if (this.map.delete(key)) this.dispose?.(value, key); }
    clear() { for (const [key, value] of this.map) this.dispose?.(value, key); this.map.clear(); }
    get size() { return this.map.size; }
}

/** Loads a cover image into a texture at most 512 px on its long edge, and measures its dominant colour. */
export async function loadCover(url, anisotropy = 4) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Cover ${response.status}`);
    const source = await createImageBitmap(await response.blob());
    const scale = Math.min(1, COVER_MAX / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale)), height = Math.max(1, Math.round(source.height * scale));
    const bitmap = await createImageBitmap(source, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high', imageOrientation: 'flipY' });
    const probe = document.createElement('canvas'); probe.width = probe.height = 32;
    const context = probe.getContext('2d', { willReadFrequently: true });
    context.drawImage(source, 0, 0, 32, 32);
    const color = dominantColor(context.getImageData(0, 0, 32, 32).data);
    source.close?.();
    const texture = new THREE.Texture(bitmap);
    texture.flipY = false; // already flipped by createImageBitmap
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    return { texture, color, aspect: width / height };
}

/** Cloth colour for a book: the accent darkened enough that light spine text reads on it. */
export function clothColor(accent) {
    const base = accent ? parseHex(accent) : [58, 54, 48];
    return toHex(mix(base, [18, 17, 16], 0.45));
}

let fontsReady = null;
export function ensureFonts() {
    fontsReady ??= Promise.all([
        document.fonts?.load?.('48px "Instrument Serif"'),
        document.fonts?.load?.('500 20px "Inter"'),
    ]).catch(() => {});
    return fontsReady;
}

/** Spine texture 64 × 512: title in Instrument Serif, author in Inter, reading top to bottom. */
export function spineTexture(book, cloth, ribbon) {
    const canvas = document.createElement('canvas');
    canvas.width = SPINE_W; canvas.height = SPINE_H;
    const g = canvas.getContext('2d');
    g.fillStyle = cloth; g.fillRect(0, 0, SPINE_W, SPINE_H);
    // subtle cloth weave
    g.globalAlpha = 0.05; g.fillStyle = '#fff';
    for (let y = 0; y < SPINE_H; y += 3) g.fillRect(0, y, SPINE_W, 1);
    g.globalAlpha = 1;
    g.save();
    g.translate(SPINE_W / 2, 0); g.rotate(Math.PI / 2);
    g.fillStyle = '#F2EEE6'; g.textBaseline = 'middle';
    const fit = (text, font, max, size) => {
        let s = size;
        do { g.font = `${font.replace('{s}', s)}`; s -= 1; } while (g.measureText(text).width > max && s > 10);
        let t = text;
        while (g.measureText(t).width > max && t.length > 2) t = t.slice(0, -2) + '…';
        return t;
    };
    const title = fit(book.title || 'Untitled', '{s}px "Instrument Serif", Georgia, serif', SPINE_H * 0.66, 34);
    g.fillText(title, 26, 2);
    const author = fit(book.author || '', '500 {s}px Inter, system-ui, sans-serif', SPINE_H * 0.24, 15);
    g.fillStyle = 'rgba(242,238,230,.72)'; g.textAlign = 'right';
    g.fillText(author.toUpperCase(), SPINE_H - 22, 2);
    g.restore();
    // LIB-8: a thin ribbon down the spine's edge marks reading progress.
    if (book.progress > 0) {
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(SPINE_W - 7, 0, 4, SPINE_H);
        g.fillStyle = ribbon || '#D9B98C'; g.fillRect(SPINE_W - 7, 0, 4, Math.max(6, SPINE_H * book.progress));
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

let pageEdge = null;
/** Shared fine-line texture for page edges. */
export function pageEdgeTexture() {
    if (pageEdge) return pageEdge;
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 4;
    const g = canvas.getContext('2d');
    g.fillStyle = '#EFE8D8'; g.fillRect(0, 0, 256, 4);
    for (let x = 0; x < 256; x += 2) { g.fillStyle = `rgba(90,70,40,${0.05 + ((x * 37) % 11) / 160})`; g.fillRect(x, 0, 1, 4); }
    pageEdge = new THREE.CanvasTexture(canvas);
    pageEdge.colorSpace = THREE.SRGBColorSpace;
    pageEdge.wrapS = pageEdge.wrapT = THREE.RepeatWrapping;
    return pageEdge;
}

let shadow = null;
/** Soft contact shadow: a radial gradient used on a plane under each book or row. */
export function shadowTexture() {
    if (shadow) return shadow;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d');
    const gradient = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(0,0,0,0.55)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gradient; g.fillRect(0, 0, 128, 128);
    shadow = new THREE.CanvasTexture(canvas);
    return shadow;
}
