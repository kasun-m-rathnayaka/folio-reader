// Page images for the 3D spread (WP6). The reader engine renders a page to its own canvas (`folioReader.renderPageImage`); this
// keeps the textures: a small LRU (8 pages), the next and previous spreads rendered ahead, and a quick low-resolution render shown
// first when a page is not ready, sharpened when the full one arrives.
import * as THREE from 'three';

export const CACHE_PAGES = 8, PREVIEW_HEIGHT = 480, MAX_HEIGHT = 2048;

/** Pixel height to render a page at: its projected height on screen × the device pixel ratio, capped at 2,048 px. */
export const targetHeight = (projectedPx, dpr = 1) => Math.min(MAX_HEIGHT, Math.max(PREVIEW_HEIGHT, Math.round(projectedPx * dpr)));

export class PageTextures {
    constructor({ source = () => window.folioReader, onReady = () => {}, anisotropy = 4 } = {}) {
        this.source = source; this.onReady = onReady; this.anisotropy = anisotropy;
        this.entries = new Map();       // index -> { texture, aspect, height, preview: bool }
        this.pending = new Map();       // `${index}:${height}` -> Promise
        this.disposed = false;
    }

    /** The best image available for a page right now: { texture, aspect } or null. */
    get(index) {
        const entry = this.entries.get(index);
        if (!entry) return null;
        this.entries.delete(index); this.entries.set(index, entry);      // most recently used
        return entry;
    }

    /** Renders a page (a preview first if it has no image yet) and calls `onReady(index)` when a better one arrives. */
    request(index, height) {
        if (this.disposed || index < 0) return;
        const have = this.entries.get(index);
        if (have && have.height >= height * 0.9) return;
        if (!have) this.load(index, PREVIEW_HEIGHT, true);
        if (height > PREVIEW_HEIGHT * 1.2) this.load(index, height, false);
    }

    /** Renders the pages around a spread so a turn never waits (the spreads either side, per the plan). */
    prefetch(indices, height) { for (const index of indices) this.request(index, height); }

    load(index, height, preview) {
        const key = `${index}:${height}`;
        if (this.pending.has(key)) return this.pending.get(key);
        const reader = this.source();
        const task = (async () => {
            const rendered = await reader?.renderPageImage?.(index, height);
            if (!rendered || this.disposed) { rendered?.canvas && (rendered.canvas.width = rendered.canvas.height = 0); return; }
            const current = this.entries.get(index);
            if (current && current.height >= height) { rendered.canvas.width = rendered.canvas.height = 0; return; }
            const texture = new THREE.CanvasTexture(rendered.canvas);
            texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = this.anisotropy; texture.generateMipmaps = true;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            if (current) this.free(current);
            this.entries.set(index, { texture, aspect: rendered.aspect, height, preview });
            while (this.entries.size > CACHE_PAGES) { const [oldest] = this.entries; this.free(oldest[1]); this.entries.delete(oldest[0]); }
            this.onReady(index);
        })().catch(error => console.warn('[FolioStage] page', index, error?.message)).finally(() => this.pending.delete(key));
        this.pending.set(key, task);
        return task;
    }

    free(entry) { entry.texture.image && (entry.texture.image.width = entry.texture.image.height = 0); entry.texture.dispose(); }

    clear() { for (const entry of this.entries.values()) this.free(entry); this.entries.clear(); }
    dispose() { this.disposed = true; this.clear(); }
}
