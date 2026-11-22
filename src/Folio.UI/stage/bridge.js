// The only module .NET calls (SPEC: bridge contract). It validates input, owns the single Stage instance and forwards
// user intent to .NET. Per-frame work never crosses this boundary.
import { Stage } from './index.js';

let stage = null, dotnet = null;
const call = (method, ...args) => dotnet?.invokeMethodAsync(method, ...args).catch(error => console.warn(`[FolioStage] ${method}`, error));
const SCENES = new Set(['hero', 'shelf', 'opening']);
const LEVELS = new Set(['full', 'reduced', 'off']);
const QUALITIES = new Set(['auto', 'high', 'low']);
const str = (v, max = 400) => typeof v === 'string' ? v.slice(0, max) : null;
const num = v => Number.isFinite(v) ? v : 0;

function cleanBook(b) {
    if (!b || typeof b.id !== 'string') return null;
    return {
        id: b.id, title: str(b.title) || 'Untitled', author: str(b.author) || '', pages: Math.max(0, Math.round(num(b.pages))),
        coverUrl: str(b.coverUrl, 4096), color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : null,
        progress: Math.min(1, Math.max(0, num(b.progress))), shelfIds: Array.isArray(b.shelfIds) ? b.shelfIds.filter(x => typeof x === 'string') : [],
    };
}

/** Starts the stage on a canvas. Resolves to { ok: true } or { ok: false, reason } (then the 2D library is used). */
export function init(canvasId, options, dotNetRef) {
    dispose();
    dotnet = dotNetRef;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return { ok: false, reason: 'no-canvas' };
    const testMode = !!options?.testMode || new URLSearchParams(location.search).has('stageTest');
    try {
        stage = new Stage(canvas, {
            motion: LEVELS.has(options?.motion) ? options.motion : 'full',
            quality: QUALITIES.has(options?.quality) ? options.quality : 'auto',
            theme: options?.theme === 'light' ? 'light' : 'dark',
            testMode, allowSoftware: testMode || !!options?.allowSoftware,
            inputTarget: typeof options?.inputTarget === 'string' ? options.inputTarget : null,
        }, {
            onBookHovered: id => call('OnBookHovered', id),
            onBookActivated: (id, action) => call('OnBookActivated', id, action),
            onSceneSettled: kind => call('OnSceneSettled', kind),
            onScrollIntent: direction => call('OnScrollIntent', direction),
            onFallback: reason => call('OnFallback', reason),
            onAccent: (id, color) => call('OnBookAccent', id, color),
            onOpenHandoff: (id, rect, elapsedMs) => call('OnOpenHandoff', id, rect, elapsedMs),
        });
        return { ok: true, renderer: stage.stats.renderer };
    } catch (error) {
        stage = null;
        return { ok: false, reason: error?.fallbackReason || 'init-failed', detail: String(error?.message || error) };
    }
}

export function setLibrary(books, shelves, visibleIds) {
    if (!stage) return;
    const clean = (Array.isArray(books) ? books : []).map(cleanBook).filter(Boolean);
    const cleanShelves = (Array.isArray(shelves) ? shelves : []).filter(s => typeof s?.id === 'string').map(s => ({ id: s.id, name: str(s.name) || '' }));
    stage.setLibrary(clean, cleanShelves, Array.isArray(visibleIds) ? visibleIds.filter(x => typeof x === 'string') : null);
}

export function setScene(scene) {
    if (!stage || !SCENES.has(scene?.kind)) return;
    stage.setScene({ kind: scene.kind, bookId: str(scene.bookId, 64), shelfId: str(scene.shelfId, 64), page: Number.isFinite(scene.page) ? scene.page : null });
}

const cleanRect = r => r && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0
    ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;

/** OPN-1: start opening a book; returns false if the stage does not know it (then .NET just navigates). */
export const beginOpen = id => typeof id === 'string' && !!stage?.beginOpen(id);
/** OPN-1: the reader's page rectangle in viewport pixels; the stage aligns, then calls OnOpenHandoff. */
export const alignTo = rect => { const r = cleanRect(rect); if (r) stage?.alignTo(r); };
/** OPN-2: start aligned with the reader's page, close the cover and return to `scene`. */
export function beginClose(id, rect, scene) {
    if (!stage || !SCENES.has(scene?.kind)) return;
    const r = cleanRect(rect);
    const next = { kind: scene.kind, bookId: str(scene.bookId, 64), shelfId: str(scene.shelfId, 64) };
    if (!r || typeof id !== 'string') stage.setScene(next); else stage.beginClose(id, r, next);
}

export const focusBook = id => stage?.focusBook(typeof id === 'string' ? id : null);
export const setMotion = level => stage?.setMotion(LEVELS.has(level) ? level : 'full');
export const setQuality = level => stage?.setQuality(QUALITIES.has(level) ? level : 'auto');
export const setTheme = theme => stage?.setTheme(theme === 'light' ? 'light' : 'dark');
export const setPaused = paused => stage?.setPaused(!!paused);
export const setPowerSaver = on => stage?.setPowerSaver(!!on);

export function dispose() {
    stage?.dispose(); stage = null; dotnet = null;
}
