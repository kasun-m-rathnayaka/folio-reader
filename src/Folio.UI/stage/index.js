// The persistent library stage (SPEC: stage modules). One WebGL2 canvas behind the HTML chrome. Blazor owns state and
// navigation; the stage only shows the scene it is told to and reports intent back. Frames are drawn only while
// something is settling (render on demand), and never while paused or hidden.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { damp, dampObject, idleTurn, motionSettings, LAMBDA } from './motion.js';
import { rowsFor } from './layout.js';
import { BookFactory } from './book-factory.js';
import { LruCache, loadCover, ensureFonts } from './textures.js';
import { QualityMonitor, SOFTWARE_RENDERER, percentile } from './quality.js';
import { cameraPose, featuredPose, shelfPose, layoutRows, rowY, CAMERA_FOV, SHELF_DISTANCE } from './scenes.js';
import { readableAccent, detailsTint, parseHex } from '../wwwroot/js/folio-color.mjs';
import { alignmentPose, cornerError, OPENING } from './opening.js';
import { BOOK_WIDTH, BOOK_HEIGHT, thicknessCm } from './layout.js';
import { FEATURE_Y } from './scenes.js';

const IDLE_STOP_MS = 20000;   // idle turn stops 20 s after the last input
const LOOK_LIMIT = 120;       // ~120 books keep their detailed textures
const POINTER_MAX = { hero: 4, details: 3 };

/** Checks whether this device should draw 3D. Returns null when it can, else the fallback reason. */
export function probeWebGL(canvas, { allowSoftware = false } = {}) {
    let gl = null;
    try { gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'default' }); } catch { gl = null; }
    if (!gl) return { reason: 'no-webgl2' };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    if (!allowSoftware && SOFTWARE_RENDERER.test(String(renderer))) return { reason: 'software-renderer', renderer };
    return { gl, renderer };
}

export class Stage {
    constructor(canvas, options = {}, callbacks = {}) {
        this.canvas = canvas;
        this.callbacks = callbacks;
        this.testMode = !!options.testMode;
        this.motion = motionSettings(options.motion);
        this.scene = { kind: 'hero' };
        this.books = []; this.shelves = []; this.byId = new Map();
        this.rows = []; this.instances = new Map(); // `${row}:${bookId}` -> mesh
        this.focusId = null; this.rowIndex = 0;
        this.pointer = { x: 0, y: 0 }; this.lastInputAt = performance.now(); this.idleClock = 0;
        this.paused = false; this.disposed = false; this.raf = 0; this.contextLosses = 0;
        this.stats = { frames: 0, lastFrameAt: 0, frameTimes: [], drawCalls: 0, textures: 0, quality: null, renderer: options.renderer ?? null };
        this.settledKind = null;

        const probe = options.gl ? { gl: options.gl } : probeWebGL(canvas, { allowSoftware: this.testMode || options.allowSoftware });
        if (!probe.gl) throw Object.assign(new Error(probe.reason), { fallbackReason: probe.reason });

        this.renderer = new THREE.WebGLRenderer({ canvas, context: probe.gl, antialias: true });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        this.world = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 1, 600);
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
        this.world.environment = this.environment;
        this.world.environmentIntensity = 0.55;
        const key = new THREE.DirectionalLight(0xffe2bd, 1.6); key.position.set(-30, 40, 40); this.world.add(key);
        this.world.add(new THREE.AmbientLight(0xffffff, 0.12));

        this.factory = new BookFactory();
        this.looks = new LruCache(LOOK_LIMIT, (look, id) => { this.undressMeshes(id); look.dispose?.(); });
        this.loading = new Map();
        this.accents = new Map();
        this.featured = null; this.featuredId = null;
        this.featuredState = { x: -13, y: -3, z: 0, ry: 0.48, rx: 0, rz: 0 };
        this.cameraState = null;
        this.viewOffset = { x: 0, y: 0 };     // principal-point shift (CSS px) that centres scenes on the main area
        this.mainRect = null;
        this.opening = null;                  // open/close sequence state (OPN-1, OPN-2)
        this.lastHandoff = null;
        this.backgroundTarget = null;         // details tint (DET-1)

        this.quality = new QualityMonitor({
            level: options.quality || 'auto', devicePixelRatio: window.devicePixelRatio,
            onStep: step => { this.applyQuality(step); this.callbacks.onQualityChanged?.(step); },
            onFallback: reason => this.fallback(reason),
        });
        this.applyQuality(this.quality.current);
        this.setTheme(options.theme || 'dark');

        this.input = (options.inputTarget && document.querySelector(options.inputTarget)) || canvas;
        this.bindEvents();
        this.resize();
        this.publishStats();
        this.invalidate();
    }

    // ---- inputs from .NET ------------------------------------------------------------------------------------------

    /** All books (so any book can open), with `visibleIds` limiting which stand on the rows (LIB-6 filters). */
    setLibrary(books, shelves = [], visibleIds = null) {
        const known = new Set(this.byId.keys());
        const signature = b => `${b.title}|${b.author}|${b.coverUrl}|${Math.round((b.progress || 0) * 100)}|${b.color}`;
        for (const book of books) {
            const previous = this.byId.get(book.id);
            if (previous && signature(previous) !== signature(book)) this.looks.delete(book.id);
        }
        const firstLoad = !this.libraryLoaded; this.libraryLoaded = true;
        this.books = books; this.shelves = shelves;
        this.byId = new Map(books.map(b => [b.id, b]));
        const visible = visibleIds ? new Set(visibleIds) : null;
        this.rows = layoutRows(rowsFor(visible ? books.filter(b => visible.has(b.id)) : books, shelves));
        const wanted = new Set();
        this.rows.forEach((row, r) => row.books.forEach(book => {
            const key = `${r}:${book.id}`; wanted.add(key);
            let mesh = this.instances.get(key);
            if (!mesh || mesh.userData.pages !== book.pages) {
                if (mesh) { this.world.remove(mesh); }
                mesh = this.factory.create(book); mesh.userData.pages = book.pages; mesh.userData.row = r;
                this.instances.set(key, mesh); this.world.add(mesh);
                const pose = shelfPose(r, row.layout.positions.get(book.id).x, false);
                // LIB-7: a newly imported book slides onto the shelf from the front; others appear in place.
                const arriving = !firstLoad && !known.has(book.id) && this.motion.travel;
                mesh.userData.state = arriving ? { ...pose, z: pose.z + 30, ry: pose.ry - 0.6 } : { ...pose };
                this.applyPose(mesh, mesh.userData.state);
            }
        }));
        for (const [key, mesh] of this.instances) if (!wanted.has(key)) { this.world.remove(mesh); this.instances.delete(key); }
        this.buildPlanks();
        for (const id of [...this.looks.map.keys()]) if (!this.byId.has(id)) this.looks.delete(id);
        if (this.featuredId && !this.byId.has(this.featuredId)) this.setFeatured(null);
        this.refreshLooks();
        this.invalidate();
    }

    /** One plank under each row: the books stand on something, and an empty library still shows a shelf (LIB-7). */
    buildPlanks() {
        this.planks ??= new THREE.Group();
        if (!this.planks.parent) this.world.add(this.planks);
        for (const plank of this.planks.children) plank.geometry.dispose();
        this.planks.clear();
        this.plankMaterial ??= new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: 0.7, metalness: 0 });
        this.rows.forEach((row, r) => {
            const width = Math.max(40, row.layout.width + 16);
            const plank = new THREE.Mesh(new THREE.BoxGeometry(width, 1.2, 18), this.plankMaterial);
            plank.position.set(row.layout.width / 2, rowY(r) - 10.6, -1);
            plank.userData.plank = true;
            this.planks.add(plank);
        });
    }

    setScene(scene) {
        const next = { kind: scene?.kind || 'hero', bookId: scene?.bookId ?? null, shelfId: scene?.shelfId ?? null, page: scene?.page ?? null };
        if (next.kind === 'shelf') {
            const index = this.rows.findIndex(r => r.id === (next.shelfId || null));
            this.rowIndex = Math.max(0, index);
        }
        if (next.bookId) this.focusId = next.bookId;
        if (next.kind !== 'shelf') this.setFeatured(next.bookId || this.featuredId || this.books[0]?.id || null);
        this.scene = next; this.settledKind = null;
        this.backgroundTarget = next.kind === 'details' ? this.detailsBackground(next.bookId) : null;
        this.touch();
        this.refreshLooks();
        if (!this.motion.travel && this.cameraState) this.snap();
        this.invalidate();
    }

    focusBook(id) {
        if (this.focusId === id) return;
        this.focusId = id;
        if (this.scene.kind !== 'shelf' && id) this.setFeatured(id);
        this.touch(); this.invalidate();
    }

    setMotion(level) { this.motion = motionSettings(level); if (!this.motion.travel) this.snap(); this.invalidate(); }

    setQuality(level) {
        this.quality = new QualityMonitor({ level, devicePixelRatio: window.devicePixelRatio, onStep: s => this.applyQuality(s), onFallback: r => this.fallback(r) });
        this.applyQuality(this.quality.current); this.invalidate();
    }

    /** DET-1: the page tinted toward the cover's colour while text keeps 4.5:1; null keeps the neutral background. */
    detailsBackground(bookId) {
        const accent = this.accents.get(bookId);
        if (!accent) return null;
        const style = getComputedStyle(document.documentElement);
        const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
        const tint = detailsTint(accent, read('--folio-bg', '#0B0B0C'), [read('--folio-text', '#EDEBE6'), read('--folio-text-muted', '#9A968E')]);
        return tint ? new THREE.Color(tint) : null;
    }

    // ---- open and close (OPN-1, OPN-2) ------------------------------------------------------------------------------

    /** Hinged model used only while a book opens or closes: page block, and a cover that swings on the spine. */
    buildOpenBook(book) {
        const look = this.looks.get(book.id);
        const thickness = thicknessCm(book.pages);
        const materials = look?.materials ?? this.factory.plainMaterials();
        const paper = this.paperMaterial ??= new THREE.MeshStandardMaterial({ color: 0xF6F1E6, roughness: 0.92 });
        const group = new THREE.Group();
        const block = new THREE.Mesh(new THREE.BoxGeometry(BOOK_WIDTH, BOOK_HEIGHT, thickness * 0.9),
            [materials[0], materials[1], materials[2], materials[3], paper, materials[5]]);
        group.add(block);
        const hinge = new THREE.Group();
        hinge.position.set(-BOOK_WIDTH / 2, 0, thickness * 0.45);
        const cover = new THREE.Mesh(new THREE.BoxGeometry(BOOK_WIDTH, BOOK_HEIGHT, 0.18),
            [materials[5], materials[5], materials[5], materials[5], materials[4], paper]);
        cover.position.set(BOOK_WIDTH / 2, 0, 0.09);
        hinge.add(cover);
        group.add(hinge);
        group.userData = { hinge, block, cover, thickness, pageZ: thickness * 0.45 };
        return group;
    }

    /** Starts opening a book from wherever it is shown now. The reader's page rectangle arrives via alignTo. */
    beginOpen(bookId) {
        const book = this.byId.get(bookId);
        if (!book) return false;
        this.endOpening();
        const group = this.buildOpenBook(book);
        const from = this.worldPoseOf(bookId);
        this.world.add(group);
        this.opening = { id: bookId, phase: 'opening', group, rect: null, elapsed: 0,
            state: { ...from, sx: 1, sy: 1, hinge: 0 }, handedOff: false };
        this.scene = { kind: 'opening', bookId }; this.settledKind = null;
        this.touch(); this.invalidate();
        return true;
    }

    /** OPN-1: where the reader will draw the current page, in viewport CSS pixels. */
    alignTo(rect) {
        if (!this.opening || this.opening.phase !== 'opening') return;
        this.opening.rect = rect; this.invalidate();
    }

    /** OPN-2: starts aligned with the reader's page, closes the cover and returns the book to `returnScene`. */
    beginClose(bookId, rect, returnScene) {
        const book = this.byId.get(bookId);
        if (!book) { this.setScene(returnScene); return; }
        this.endOpening();
        const group = this.buildOpenBook(book);
        this.world.add(group);
        this.cameraState = { ...cameraPose({ kind: 'opening' }, {}) };
        this.viewOffset = { x: 0, y: 0 };
        const aligned = this.alignedPose(rect, group);
        this.opening = { id: bookId, phase: 'closing', group, rect, elapsed: 0, state: { ...aligned, hinge: -Math.PI }, handedOff: true };
        this.setScene(returnScene);
        this.lastTick = 0;
        this.invalidate();
    }

    endOpening() {
        if (!this.opening) return;
        const { group } = this.opening;
        this.world.remove(group);
        group.traverse(o => o.geometry?.dispose());
        this.opening = null;
    }

    /** Current world pose of a book: the featured mesh, else its shelf instance in the focused row. */
    worldPoseOf(bookId) {
        if (this.featured && this.featuredId === bookId && this.featured.visible) {
            const f = this.featuredState; return { x: f.x, y: f.y, z: f.z, ry: f.ry };
        }
        const mesh = this.instances.get(`${this.rowIndex}:${bookId}`) ?? [...this.instances.entries()].find(([k]) => k.endsWith(`:${bookId}`))?.[1];
        if (mesh) { const st = mesh.userData.state; return { x: st.x, y: st.y, z: st.z, ry: st.ry }; }
        return { x: 0, y: FEATURE_Y, z: 0, ry: 0 };
    }

    openingCamera() {
        const c = cameraPose({ kind: 'opening' }, {});
        return { x: c.px, y: c.py, z: c.pz, planeZ: 0, fov: CAMERA_FOV };
    }

    viewportSize() {
        const rect = this.canvas.getBoundingClientRect();
        return { width: rect.width || 1, height: rect.height || 1, left: rect.left, top: rect.top };
    }

    /** Group pose whose page plane (front of the block) projects exactly onto `rect`. */
    alignedPose(rect, group) {
        const viewport = this.viewportSize();
        const local = { ...rect, x: rect.x - viewport.left, y: rect.y - viewport.top };
        const plane = alignmentPose(local, viewport, this.openingCamera());
        const sx = plane.width / BOOK_WIDTH, sy = plane.height / BOOK_HEIGHT;
        return { x: plane.x, y: plane.y, z: -group.userData.pageZ, ry: 0, sx, sy };
    }

    /** The page plane's real projected rectangle, measured through the camera (used by the handoff gate). */
    measurePage() {
        const { group } = this.opening;
        const z = group.userData.pageZ, w = BOOK_WIDTH / 2, h = BOOK_HEIGHT / 2;
        const viewport = this.viewportSize();
        const points = [[-w, h], [w, h], [-w, -h], [w, -h]].map(([x, y]) => {
            const v = group.localToWorld(new THREE.Vector3(x, y, z)).project(this.camera);
            return [viewport.left + (v.x + 1) / 2 * viewport.width, viewport.top + (1 - v.y) / 2 * viewport.height];
        });
        const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
        return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    }

    updateOpening(dt) {
        const o = this.opening;
        o.elapsed += dt;
        const s = o.state;
        let target, lambda;
        if (o.phase === 'opening') {
            const forward = { x: 0, y: FEATURE_Y, z: -9, ry: 0, sx: 1, sy: 1 }; // forward, but whole: the open spread fits the view
            const aligned = o.rect && o.elapsed >= OPENING.alignStart ? this.alignedPose(o.rect, o.group) : null;
            target = { ...(aligned ?? forward), hinge: o.elapsed >= OPENING.coverStart ? -Math.PI : 0 };
            lambda = aligned ? 3 / OPENING.align : 3 / OPENING.forward;
        } else {
            const back = this.scene.kind === 'shelf' ? this.worldPoseOfSlot(o.id) : featuredPose(this.scene, { idle: 0, pointerX: 0, pointerY: 0 });
            target = { x: back.x, y: back.y, z: back.z, ry: back.ry, sx: 1, sy: 1, hinge: 0 };
            lambda = 3 / OPENING.forward;
        }
        const hingeTarget = target.hinge; delete target.hinge;
        let remaining = this.motion.travel ? dampObject(s, target, lambda, dt) : (Object.assign(s, target), 0);
        s.hinge = this.motion.travel ? damp(s.hinge, hingeTarget, 3 / OPENING.cover, dt) : hingeTarget;
        if (Math.abs(s.hinge - hingeTarget) < 0.002) s.hinge = hingeTarget;
        remaining = Math.max(remaining, Math.abs(s.hinge - hingeTarget));

        if (o.phase === 'opening' && !o.handedOff && o.rect && o.elapsed >= OPENING.alignStart + OPENING.align) {
            // Close enough: finish exactly on the reader's rectangle, then hand off on this frame.
            const settledCamera = Math.abs(this.cameraState.pz - this.openingCamera().z) < 0.05 && Math.hypot(this.viewOffset.x, this.viewOffset.y) < 0.5;
            if (settledCamera && remaining < 0.08) {
                Object.assign(s, this.alignedPose(o.rect, o.group)); s.hinge = -Math.PI;
                this.cameraState = { ...cameraPose({ kind: 'opening' }, {}) }; this.viewOffset = { x: 0, y: 0 };
                this.applyCamera(); this.applyOpeningPose();
                o.handedOff = true;
                this.lastHandoff = { bookId: o.id, target: o.rect, elapsedMs: Math.round(o.elapsed * 1000), at: performance.now() };
                queueMicrotask(() => {
                    this.lastHandoff.projected = this.measurePage();
                    this.lastHandoff.cornerError = cornerError(this.lastHandoff.projected, o.rect);
                    this.callbacks.onOpenHandoff?.(o.id, o.rect, this.lastHandoff.elapsedMs);
                });
                return 0;
            }
            remaining = Math.max(remaining, 1);
        }
        this.applyOpeningPose();
        if (o.phase === 'closing' && remaining === 0) { this.endOpening(); return 0; }
        return o.phase === 'opening' && !o.handedOff ? Math.max(remaining, 1) : remaining;
    }

    worldPoseOfSlot(bookId) {
        const row = this.rows[this.rowIndex];
        const x = row?.layout.positions.get(bookId)?.x;
        return x == null ? { x: 0, y: FEATURE_Y, z: 0, ry: 0 } : shelfPose(this.rowIndex, x, true);
    }

    applyOpeningPose() {
        const { group, state } = this.opening;
        group.position.set(state.x, state.y, state.z);
        group.rotation.set(0, state.ry, 0);
        group.scale.set(state.sx, state.sy, 1);
        group.userData.hinge.rotation.y = state.hinge;
    }

    applyCamera() {
        const c = this.cameraState;
        this.camera.position.set(c.px, c.py, c.pz); this.camera.lookAt(c.lx, c.ly, c.lz);
        const { width, height } = this.viewportSize();
        if (Math.abs(this.viewOffset.x) < 0.01 && Math.abs(this.viewOffset.y) < 0.01) { if (this.camera.view?.enabled) this.camera.clearViewOffset(); }
        else this.camera.setViewOffset(width, height, -this.viewOffset.x, -this.viewOffset.y, width, height);
    }

    setTheme(theme) {
        const style = getComputedStyle(document.documentElement);
        const bg = style.getPropertyValue('--folio-bg').trim() || (theme === 'light' ? '#F3F0E8' : '#0B0B0C');
        this.theme = theme;
        this.background = true;
        this.baseBackground = new THREE.Color(bg);
        this.world.background = this.baseBackground.clone();
        this.world.fog = new THREE.Fog(this.world.background.clone(), 120, 260);
        this.invalidate();
    }

    setPaused(paused) {
        this.paused = !!paused;
        if (!this.paused) { this.lastTick = 0; this.invalidate(); }
    }

    // ---- featured book and textures --------------------------------------------------------------------------------

    setFeatured(id) {
        if (this.featuredId === id && this.featured) return;
        if (this.featured) { this.world.remove(this.featured); this.featured = null; }
        this.featuredId = id;
        const book = id ? this.byId.get(id) : null;
        if (!book) return;
        this.featured = this.factory.create(book);
        this.featured.userData.featured = true;
        this.world.add(this.featured);
        this.applyLook(this.featured, book.id);
    }

    /** Detailed textures for the books nearest the camera, up to the LRU limit; others keep the placeholder. */
    refreshLooks() {
        const priority = [];
        if (this.featuredId) priority.push(this.featuredId);
        const rows = this.scene.kind === 'shelf' ? [this.rowIndex, this.rowIndex - 1, this.rowIndex + 1] : [0];
        for (const r of rows) for (const book of this.rows[r]?.books ?? []) priority.push(book.id);
        const ids = [...new Set(priority)].slice(0, LOOK_LIMIT);
        ids.forEach(id => this.requestLook(id));
        for (const [key, mesh] of this.instances) this.applyLook(mesh, key.slice(key.indexOf(':') + 1));
    }

    requestLook(id) {
        if (this.looks.has(id)) { this.looks.get(id); return; }
        if (this.loading.has(id)) return;
        const book = this.byId.get(id); if (!book) return;
        const task = (async () => {
            await ensureFonts();
            let cover = null, accent = book.color || null;
            if (book.coverUrl) {
                try { const loaded = await loadCover(book.coverUrl, this.renderer.capabilities.getMaxAnisotropy()); cover = loaded.texture; accent ||= loaded.color; }
                catch (error) { console.warn('[FolioStage] cover', book.id, error?.message); }
            }
            if (this.disposed) { cover?.dispose(); return; }
            accent = accent ? readableAccent(accent, '#0B0B0C', 3) : null;
            this.accents.set(id, accent);
            const look = { cover, accent, materials: null, dispose: null };
            this.looks.set(id, look);
            for (const [key, mesh] of this.instances) if (key.endsWith(`:${id}`)) this.applyLook(mesh, id);
            if (this.featuredId === id && this.featured) this.applyLook(this.featured, id);
            this.callbacks.onAccent?.(id, accent);
            if (this.scene.kind === 'details' && this.scene.bookId === id) this.backgroundTarget = this.detailsBackground(id);
            this.invalidate();
        })().finally(() => this.loading.delete(id));
        this.loading.set(id, task);
    }

    applyLook(mesh, id) {
        const look = this.looks.map.get(id);
        if (!look) return;
        if (!look.materials) {
            const probe = this.factory.create(this.byId.get(id) ?? { id, pages: 0 });
            const undress = this.factory.dress(probe, this.byId.get(id) ?? { id }, look.cover, look.accent);
            look.materials = probe.material;
            look.dispose = () => { undress(); look.cover?.dispose(); };
        }
        if (mesh.material !== look.materials) mesh.material = look.materials;
    }

    /** Back to the shared placeholder materials once a book's textures leave the cache. */
    undressMeshes(id) {
        const plain = this.factory.plainMaterials();
        for (const [key, mesh] of this.instances) if (key.endsWith(`:${id}`)) mesh.material = plain;
        if (this.featuredId === id && this.featured) this.featured.material = plain;
    }

    // ---- frame loop ------------------------------------------------------------------------------------------------

    invalidate() {
        if (this.disposed || this.paused || this.raf || document.hidden) return;
        this.raf = requestAnimationFrame(now => this.tick(now));
    }

    touch() { this.lastInputAt = performance.now(); }

    /** DSK-2: on battery the stage draws at most 30 frames per second and the hero does not idle-turn. */
    setPowerSaver(on) { this.powerSaver = !!on; this.invalidate(); }

    tick(now) {
        this.raf = 0;
        if (this.disposed || this.paused) return;
        if (this.powerSaver && this.lastTick && now - this.lastTick < 32) { this.raf = requestAnimationFrame(t => this.tick(t)); return; }
        const realDt = this.lastTick ? Math.min(0.1, (now - this.lastTick) / 1000) : 1 / 60;
        const dt = this.testMode ? 1 / 60 : realDt;
        this.lastTick = now;
        const started = performance.now();
        const active = this.update(dt, now);
        this.renderer.render(this.world, this.camera);
        const frameMs = performance.now() - started + (this.testMode ? 0 : 0);
        this.recordFrame(now, realDt * 1000, frameMs);
        if (active) this.invalidate();
        else { this.lastTick = 0; this.maybeSettled(); }
    }

    update(dt, now) {
        let remaining = 0;
        const idle = this.motion.idle && !this.testMode && !this.powerSaver && this.scene.kind === 'hero' && now - this.lastInputAt < IDLE_STOP_MS;
        if (idle) this.idleClock += dt;
        const ctx = { rowIndex: this.rowIndex, rows: this.rows, focusId: this.focusId, halfViewWidth: this.halfViewWidth() };

        // camera
        const target = cameraPose(this.scene, ctx);
        if (!this.cameraState || !this.motion.travel) this.cameraState = { ...target };
        else remaining = Math.max(remaining, dampObject(this.cameraState, target, this.scene.kind === 'opening' ? LAMBDA.opening : LAMBDA.camera, dt));
        const c = this.cameraState;
        // Scenes centre on the main area (right of the sidebar, below the header); opening uses the whole window.
        const offsetTarget = this.scene.kind === 'opening' || this.opening ? { x: 0, y: 0 } : this.mainOffset();
        remaining = Math.max(remaining, this.motion.travel ? dampObject(this.viewOffset, offsetTarget, LAMBDA.camera * 2, dt) : (Object.assign(this.viewOffset, offsetTarget), 0));
        this.applyCamera();
        if (this.opening) remaining = Math.max(remaining, this.updateOpening(dt));
        if (this.backgroundTarget || this.background) {
            const target = this.backgroundTarget ?? this.baseBackground;
            const bg = this.world.background;
            const before = bg.r + bg.g + bg.b;
            bg.r = damp(bg.r, target.r, LAMBDA.details, dt); bg.g = damp(bg.g, target.g, LAMBDA.details, dt); bg.b = damp(bg.b, target.b, LAMBDA.details, dt);
            if (Math.abs(bg.r - target.r) + Math.abs(bg.g - target.g) + Math.abs(bg.b - target.b) < 1e-3) bg.copy(target);
            else remaining = Math.max(remaining, Math.abs(before - (bg.r + bg.g + bg.b)) > 0 ? 1e-3 : 0);
            this.world.fog.color.copy(bg);
        }

        // featured book: idle turn fades back to rest instead of snapping
        if (this.featured) {
            const maxTilt = (POINTER_MAX[this.scene.kind] ?? 0) * Math.PI / 180;
            const tilt = this.motion.tilt ? { x: -this.pointer.y * maxTilt, y: this.pointer.x * maxTilt } : { x: 0, y: 0 };
            const pose = featuredPose(this.scene, { idle: idle ? idleTurn(this.idleClock) : 0, pointerX: tilt.x, pointerY: tilt.y });
            const fs = this.featuredState;
            remaining = Math.max(remaining, dampObject(fs, pose, this.motion.travel ? LAMBDA.pointer : 1e3, dt));
            this.applyPose(this.featured, fs);
            this.featured.visible = (this.scene.kind !== 'shelf' || Math.abs(c.py - fs.y) < 60) && this.opening?.id !== this.featuredId;
            if (idle) remaining = Math.max(remaining, 1);
        }

        // shelf books: only the focused book (and the one returning) moves
        for (const [key, mesh] of this.instances) {
            const row = mesh.userData.row, id = key.slice(key.indexOf(':') + 1);
            const layout = this.rows[row]?.layout; if (!layout) continue;
            const focused = this.scene.kind === 'shelf' && row === this.rowIndex && id === this.focusId;
            const pose = shelfPose(row, layout.positions.get(id).x, focused);
            const s = mesh.userData.state;
            remaining = Math.max(remaining, dampObject(s, pose, this.motion.travel ? LAMBDA.pullOut : 1e3, dt));
            this.applyPose(mesh, s);
            mesh.visible = Math.abs(rowY(row) - c.ly) < 90 && !(this.opening && this.opening.id === id && row === this.rowIndex);
        }
        return remaining > 0;
    }

    applyPose(mesh, p) { mesh.position.set(p.x, p.y, p.z); mesh.rotation.set(p.rx, p.ry, p.rz); }

    snap() {
        this.cameraState = null;
        for (const mesh of this.instances.values()) mesh.userData.state = { ...mesh.userData.state };
    }

    maybeSettled() {
        if (this.settledKind === this.scene.kind) return;
        this.settledKind = this.scene.kind;
        this.callbacks.onSceneSettled?.(this.scene.kind);
    }

    recordFrame(now, intervalMs, cpuMs) {
        const s = this.stats;
        s.frames++; s.lastFrameAt = now;
        s.frameTimes.push(intervalMs); if (s.frameTimes.length > 600) s.frameTimes.shift();
        s.cpuTimes = (s.cpuTimes || []); s.cpuTimes.push(cpuMs); if (s.cpuTimes.length > 600) s.cpuTimes.shift();
        s.drawCalls = this.renderer.info.render.calls;
        s.textures = this.renderer.info.memory.textures;
        if (!this.testMode) this.quality.record(intervalMs); // test mode runs on software GL: never step down
    }

    publishStats() {
        const stage = this;
        window.__folioStage = {
            get stats() {
                const s = stage.stats;
                return { frames: s.frames, lastFrameAt: s.lastFrameAt, drawCalls: s.drawCalls, textures: s.textures,
                    p95FrameMs: percentile(s.frameTimes, 0.95), p95CpuMs: percentile(s.cpuTimes || [], 0.95),
                    quality: stage.quality.current, scene: stage.scene.kind, renderer: s.renderer, books: stage.books.length,
                    looks: stage.looks.size, paused: stage.paused, powerSaver: !!stage.powerSaver, contextLosses: stage.contextLosses, handoff: stage.lastHandoff };
            },
            get settled() { return stage.raf === 0 && stage.settledKind === stage.scene.kind; },
            resetFrameTimes() { stage.stats.frameTimes = []; stage.stats.cpuTimes = []; },
            /** Test hook: force continuous frames for a duration to measure frame time. */
            async measure(ms) {
                stage.stats.frameTimes = []; stage.stats.cpuTimes = [];
                const end = performance.now() + ms;
                await new Promise(resolve => {
                    const step = () => { if (performance.now() >= end || stage.disposed) return resolve(); stage.lastInputAt = performance.now(); stage.idleClock += 0.05; stage.cameraState && (stage.cameraState.px += 0.0001); stage.invalidate(); requestAnimationFrame(step); };
                    step();
                });
                return percentile(stage.stats.frameTimes, 0.95);
            },
            stage,
        };
    }

    // ---- quality, resize, events ------------------------------------------------------------------------------------

    applyQuality(step) {
        this.renderer.setPixelRatio(step.dpr);
        this.shadows = step.shadows;
        for (const mesh of this.instances.values()) this.factory.setShadows(mesh, step.shadows);
        if (this.featured) this.factory.setShadows(this.featured, step.shadows);
        this.stats.quality = step;
        this.resize();
    }

    halfViewWidth() {
        const distance = SHELF_DISTANCE;
        const main = this.mainRect, aspect = main ? main.width / Math.max(1, main.height) : this.camera.aspect;
        return Math.tan((CAMERA_FOV * Math.PI / 180) / 2) * distance * aspect;
    }

    /** Offset from the canvas centre to the main area's centre, in CSS pixels. */
    mainOffset() {
        if (!this.mainRect || this.input === this.canvas) return { x: 0, y: 0 };
        const canvas = this.canvas.getBoundingClientRect(), m = this.mainRect;
        return { x: (m.left + m.width / 2) - (canvas.left + canvas.width / 2), y: (m.top + m.height / 2) - (canvas.top + canvas.height / 2) };
    }

    resize() {
        const width = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 1;
        const height = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 1;
        this.renderer.setSize(width, height, false);
        if (this.input && this.input !== this.canvas) { const r = this.input.getBoundingClientRect(); this.mainRect = { left: r.left, top: r.top, width: r.width, height: r.height }; }
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.invalidate();
    }

    pick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster ??= new THREE.Raycaster();
        this.raycaster.setFromCamera(ndc, this.camera);
        const candidates = [...this.instances.values()].filter(m => m.visible);
        if (this.featured?.visible) candidates.push(this.featured);
        const hit = this.raycaster.intersectObjects(candidates, false)[0];
        return hit?.object?.userData?.bookId ?? null;
    }

    bindEvents() {
        const on = (target, type, handler, options) => { target.addEventListener(type, handler, options); (this.unbind ??= []).push(() => target.removeEventListener(type, handler, options)); };
        // Pointer input arrives through the HTML layer laid over the canvas; its own controls keep their clicks.
        const live = () => !this.paused && !this.disposed;
        const onControl = event => event.target instanceof Element && !!event.target.closest('button, a[href], input, select, textarea, [role="button"], [role="menu"], .mud-popover');
        on(window, 'resize', () => this.resize());
        on(document, 'visibilitychange', () => { if (!document.hidden) { this.lastTick = 0; this.invalidate(); } });
        on(this.input, 'pointermove', event => {
            if (!live()) return;
            const rect = this.canvas.getBoundingClientRect();
            this.pointer.x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
            this.pointer.y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
            this.touch();
            if (this.scene.kind === 'shelf') {
                const id = this.pick(event);
                if (id && id !== this.hoverId) { this.hoverId = id; this.callbacks.onBookHovered?.(id); }
            }
            if (this.motion.tilt || this.scene.kind === 'shelf') this.invalidate();
        });
        on(this.input, 'pointerleave', () => { this.pointer.x = 0; this.pointer.y = 0; this.invalidate(); });
        on(this.input, 'click', event => {
            if (!live() || onControl(event)) return;
            const id = this.pick(event);
            if (!id) return;
            this.touch();
            if (this.scene.kind === 'details') this.callbacks.onBookActivated?.(id, 'open');
            else if (id === this.focusId || (this.scene.kind === 'hero' && id === this.featuredId)) this.callbacks.onBookActivated?.(id, 'details');
            else this.callbacks.onBookHovered?.(id);
        });
        on(this.input, 'wheel', event => {
            if (!live() || Math.abs(event.deltaY) < 4 || event.target?.closest?.('.folio-stage-scroll')) return;
            event.preventDefault();
            const now = performance.now();
            if (now - (this.lastWheel || 0) < 450) return;
            this.lastWheel = now; this.touch();
            this.callbacks.onScrollIntent?.(event.deltaY > 0 ? 'down' : 'up');
        }, { passive: false });
        let touchStart = null;
        on(this.input, 'touchstart', event => { touchStart = event.touches[0]?.clientY ?? null; }, { passive: true });
        on(this.input, 'touchend', event => {
            if (!live()) return;
            const end = event.changedTouches[0]?.clientY;
            if (touchStart == null || end == null || Math.abs(end - touchStart) < 40) return;
            this.touch(); this.callbacks.onScrollIntent?.(end < touchStart ? 'down' : 'up');
        }, { passive: true });
        on(this.canvas, 'webglcontextlost', event => {
            event.preventDefault();
            this.contextLosses++;
            if (this.contextLosses >= 2) this.fallback('context-lost');
        });
        on(this.canvas, 'webglcontextrestored', () => { this.lastTick = 0; this.invalidate(); });
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.canvas);
        if (this.input !== this.canvas) this.resizeObserver.observe(this.input);
    }

    fallback(reason) {
        if (this.fellBack) return;
        this.fellBack = true;
        this.callbacks.onFallback?.(reason);
    }

    dispose() {
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        this.unbind?.forEach(f => f());
        this.resizeObserver?.disconnect();
        this.looks.clear();
        this.factory.dispose();
        this.environment.dispose();
        this.renderer.dispose();
        if (window.__folioStage?.stage === this) delete window.__folioStage;
    }
}
