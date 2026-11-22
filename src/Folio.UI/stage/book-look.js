// The textures a book needs (WP5). On the shelf only the spine is visible, so every book gets a 64 × 512 spine at first; the
// cover (512 × 768, or 1024 × 1536 for a presented or open book) is painted when a book is presented or featured. Both are
// cached as images, so a restart decodes them instead of repainting.
import * as THREE from 'three';
import { composeCover, composeSpine, canvasToBlob, COVER_SIZES, SPINE_SIZES } from './cover-composer.js';
import { designFor, DESIGN_VERSION, hashString } from './cover-design.js';
import { cacheGet, cachePut } from './cover-cache.js';
import { loadCover } from './textures.js';
import { toHex, parseHex } from '../wwwroot/js/folio-color.mjs';

const signature = book => hashString(`${book.title}|${book.author}`).toString(36);
const keyOf = (kind, book, extra = '') => `${kind}|${book.id}|v${DESIGN_VERSION}|${signature(book)}${extra}`;

/** Decodes a cached PNG into a texture (flipped at decode time, since ImageBitmap textures cannot flip on upload). */
async function textureFromBlob(blob, srgb) {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' });
    const texture = new THREE.Texture(bitmap);
    texture.flipY = false; if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}
function textureFromCanvas(canvas, srgb, anisotropy = 4) {
    const texture = new THREE.CanvasTexture(canvas);
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    return texture;
}

/** A ribbon down the spine's edge marks reading progress (LIB-8); it is drawn on top of the cached spine. */
function withRibbon(source, progress, color) {
    const canvas = Object.assign(document.createElement('canvas'), { width: source.width, height: source.height });
    const g = canvas.getContext('2d');
    g.drawImage(source, 0, 0);
    if (progress > 0) {
        const k = source.width / 64, x = source.width - 7 * k, w = 4 * k;
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, 0, w, source.height);
        g.fillStyle = color || '#D9B98C'; g.fillRect(x, 0, w, Math.max(6 * k, source.height * progress));
    }
    return canvas;
}

/**
 * Loads (or paints, then caches) a book's spine and the colour of its first page. Resolves to
 * `{ spine, dominant, design, cached }`; the caller owns the textures.
 */
export async function loadSpineLook(book, { anisotropy = 4 } = {}) {
    const key = keyOf('s', book, `|${SPINE_SIZES.full}`);
    let record = await cacheGet(key);
    let dominant = book.color || record?.dominant || null, spineImage = null, cached = false;
    if (record?.blob) {
        try { spineImage = await createImageBitmap(record.blob); cached = true; } catch { record = null; }
    }
    if (!spineImage) {
        // Not cached yet: measure page 1's dominant colour (the cloth follows it), then paint the spine.
        if (!dominant && book.coverUrl) {
            try { const loaded = await loadCover(book.coverUrl, anisotropy); dominant = loaded.color; loaded.texture.dispose(); loaded.texture.image?.close?.(); }
            catch (error) { console.warn('[FolioStage] cover', book.id, error?.message); }
        }
        const canvas = composeSpine(book, { width: SPINE_SIZES.full, dominant });   // spines fill much of the view: 128 × 1024
        spineImage = canvas;
        canvasToBlob(canvas).then(blob => cachePut(key, { blob, dominant })).catch(() => {});
    }
    const design = designFor(book, dominant);
    const canvas = withRibbon(spineImage, book.progress || 0, design.foil);
    spineImage.close?.();
    return { spine: textureFromCanvas(canvas, true, anisotropy), dominant, design, cached };
}

/**
 * Loads (or paints, then caches) a book's cover at `level` ('shelf' 512 px or 'full' 1024 px wide). Resolves to
 * `{ color, orm, normal }` textures; the caller owns them.
 */
export async function loadCoverLook(book, { level = 'full', dominant = null, anisotropy = 4 } = {}) {
    const width = COVER_SIZES[level] ?? COVER_SIZES.full;
    const key = keyOf('c', book, `|${width}`);
    const record = await cacheGet(key);
    if (record?.color) {
        try {
            const [color, orm, normal] = await Promise.all([textureFromBlob(record.color, true), textureFromBlob(record.orm, false), record.normal ? textureFromBlob(record.normal, false) : null]);
            for (const t of [color, orm, normal]) if (t) t.anisotropy = anisotropy;
            return { color, orm, normal, cached: true, width };
        } catch { /* repaint below */ }
    }
    let pageImage = null, pageTexture = null;
    if (book.coverUrl) {
        try { const loaded = await loadCover(book.coverUrl, anisotropy); pageTexture = loaded.texture; pageImage = pageTexture.image; dominant ??= loaded.color; }
        catch (error) { console.warn('[FolioStage] cover', book.id, error?.message); }
    }
    const painted = composeCover(book, { width, dominant, pageImage });
    pageTexture?.dispose(); pageTexture?.image?.close?.();
    Promise.all([canvasToBlob(painted.color), canvasToBlob(painted.orm), painted.normal ? canvasToBlob(painted.normal) : null])
        .then(([color, orm, normal]) => cachePut(key, { color, orm, normal })).catch(() => {});
    return {
        color: textureFromCanvas(painted.color, true, anisotropy), orm: textureFromCanvas(painted.orm, false, anisotropy),
        normal: painted.normal ? textureFromCanvas(painted.normal, false, anisotropy) : null, cached: false, width, design: painted.design,
    };
}

/**
 * The same covers and spines as images, for the 2D books (CssBook) and anything else that is not WebGL: front and spine blobs
 * from the cache, painted first if needed. The shelf size (512 px cover, 64 px spine) is plenty for a 2D card.
 */
export async function bookImageBlobs(book, { anisotropy = 4 } = {}) {
    const width = COVER_SIZES.shelf, sKey = keyOf('s', book, `|${SPINE_SIZES.shelf}`), cKey = keyOf('c', book, `|${width}`);
    let [spine, cover] = await Promise.all([cacheGet(sKey), cacheGet(cKey)]);
    if (spine?.blob && cover?.color) return { front: cover.color, spine: spine.blob };
    let dominant = book.color || spine?.dominant || null, pageImage = null, pageTexture = null;
    if (book.coverUrl) {
        try { const loaded = await loadCover(book.coverUrl, anisotropy); pageTexture = loaded.texture; pageImage = pageTexture.image; dominant ??= loaded.color; }
        catch (error) { console.warn('[FolioStage] cover', book.id, error?.message); }
    }
    const design = designFor(book, dominant);
    const painted = composeCover(book, { width, dominant, pageImage, design });
    const front = await canvasToBlob(painted.color);
    const spineBlob = await canvasToBlob(composeSpine(book, { width: SPINE_SIZES.shelf, dominant, design }));
    pageTexture?.dispose(); pageTexture?.image?.close?.();
    cachePut(sKey, { blob: spineBlob, dominant }); cachePut(cKey, { color: front, orm: await canvasToBlob(painted.orm), normal: painted.normal ? await canvasToBlob(painted.normal) : null });
    return { front, spine: spineBlob };
}
