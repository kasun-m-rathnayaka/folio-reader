// The persistent library stage (SPEC: stage modules). One WebGL2 canvas behind the HTML chrome. Blazor owns state and
// navigation; the stage only shows the scene it is told to and reports intent back. Frames are drawn only while
// something is settling (render on demand), and never while paused or hidden.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { damp, dampObject, dampKeys, idleTurn, motionSettings, travelLambda, LAMBDA } from './motion.js';
import { GestureGate } from './input.js';
import { rowsFor, visibleRange, partedShift } from './layout.js';
import { Bookcase } from './bookcase.js';
import { Pan, panBounds } from './pan.js';
import { BookFactory } from './book-factory.js';
import { LruCache, ensureFonts } from './textures.js';
import { loadSpineLook, loadCoverLook } from './book-look.js';
import { COVER_SIZES, composeCover, composeSpine } from './cover-composer.js';
import { Reading } from './reading.js';
import { designFor } from './cover-design.js';
import { QualityMonitor, SOFTWARE_RENDERER, percentile } from './quality.js';
import { cameraPose, featuredPose, shelfPose, poseLambdas, layoutRows, rowY, CAMERA_FOV, SHELF_DISTANCE } from './scenes.js';
import { readableAccent, accentTint, parseHex } from '../wwwroot/js/folio-color.mjs';
import { alignmentPose, cornerError, OPENING } from './opening.js';
import { BOOK_WIDTH, BOOK_HEIGHT, thicknessCm } from './layout.js';
import { FEATURE_Y } from './scenes.js';

const DWELL_MS = 250;         // a pointer resting this long on a book presents it
const IDLE_STOP_MS = 20000;   // idle turn stops 20 s after the last input
const LOOK_LIMIT = 120;       // ~120 books keep their detailed textures
const POINTER_MAX = { hero: 4 };

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

/** Largest remaining distance between the camera and its target pose (cm). */
function cameraRemaining(state, target) {
    let max = 0;
    for (const key in target) max = Math.max(max, Math.abs((state[key] ?? target[key]) - target[key]));
    return max;
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
        this.settledKind = null; this.reportedKey = null;
        this.rowsVersion = null; this.pendingScene = null; this.cameraLambda = LAMBDA.camera;
        this.gate = new GestureGate();

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
        this.bookcase = new Bookcase(this.world, this.renderer.capabilities.getMaxAnisotropy());
        this.bookcase.onTextures = () => this.invalidate();
        this.pan = new Pan(); this.pool = []; this.window = null; this.memory = new Map(); this.arriving = new Set();
        this.lastPointerAt = 0; this.suppressClick = false;
        this.reading = null;                   // 3D reading: the open book (WP6)
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
        this.backgroundTarget = null;         // accent tint of the presented book (WP4)

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
    setLibrary(books, shelves = [], visibleIds = null, rowsVersion = null) {
        const known = new Set(this.byId.keys());
        const signature = b => `${b.title}|${b.author}|${b.coverUrl}|${Math.round((b.progress || 0) * 100)}|${b.color}`;
        for (const book of books) {
            const previous = this.byId.get(book.id);
            if (previous && signature(previous) !== signature(book)) this.looks.delete(book.id);
        }
        const firstLoad = !this.libraryLoaded; this.libraryLoaded = true;
        this.books = books; this.shelves = shelves; this.rowsVersion = rowsVersion;
        this.byId = new Map(books.map(b => [b.id, b]));
        const visible = visibleIds ? new Set(visibleIds) : null;
        this.rows = layoutRows(rowsFor(visible ? books.filter(b => visible.has(b.id)) : books, shelves));
        // Meshes are windowed (WP3): only books near the camera stand on the rows. Poses survive a reload.
        for (const [key, mesh] of [...this.instances]) { this.memory.set(key, mesh.userData.state); this.release(key); }
        this.arriving = new Set(firstLoad || !this.motion.travel ? [] : books.filter(b => !known.has(b.id)).map(b => b.id));   // LIB-7
        this.window = null;
        this.bookcase.rebuild(this.rows);
        for (const id of [...this.looks.map.keys()]) if (!this.byId.has(id)) this.looks.delete(id);
        if (this.featuredId && !this.byId.has(this.featuredId)) this.setFeatured(null);
        this.updatePanBounds();
        this.syncWindow(true);
        this.memory.clear(); this.arriving.clear();
        this.invalidate();
        this.applyPendingScene();
    }

    /** A shelf scene waits here when it names a newer row list than the stage holds (WP2). */
    applyPendingScene() {
        const pending = this.pendingScene;
        if (pending && (pending.rowsVersion == null || pending.rowsVersion === this.rowsVersion)) { this.pendingScene = null; this.setScene(pending); }
    }

    // ---- windowed meshes (WP3) ---------------------------------------------------------------------------------------

    /** x range of books that get meshes: 1.5 view widths either side of the camera, on the current row and its neighbours. */
    windowRanges() {
        const half = this.halfViewWidth() * 1.5 * 2, x = this.pan.x;
        const ranges = [];
        for (let r = Math.max(0, this.rowIndex - 1); r <= Math.min(this.rows.length - 1, this.rowIndex + 1); r++) {
            const [a, b] = visibleRange(this.rows[r].layout, x - half, x + half);
            ranges.push([r, a, b]);
        }
        return ranges;
    }

    /** Creates meshes for books that entered the window and recycles those that left (from a pool of meshes). */
    syncWindow(force = false) {
        if (!this.rows.length) return false;
        const ranges = this.windowRanges();
        const signature = ranges.map(r => r.join(':')).join('|');
        if (!force && signature === this.window) return false;
        this.window = signature;
        const wanted = new Set();
        for (const [r, a, b] of ranges) {
            const row = this.rows[r];
            for (let i = a; i < b; i++) {
                const book = row.books[i], key = `${r}:${book.id}`; wanted.add(key);
                if (!this.instances.has(key)) this.acquire(key, book, r, row.layout.positions.get(book.id).x);
            }
        }
        for (const key of [...this.instances.keys()]) if (!wanted.has(key)) this.release(key);
        this.refreshLooks();
        return true;
    }

    acquire(key, book, row, x) {
        const mesh = this.pool.pop() ?? this.factory.create(book);
        this.factory.retarget(mesh, book);
        mesh.userData.row = row; mesh.userData.pages = book.pages; mesh.visible = true;
        const pose = shelfPose(row, x);
        const remembered = this.memory.get(key);
        mesh.userData.state = remembered ? { ...remembered } : this.arriving.has(book.id) ? { ...pose, z: pose.z + 30, ry: pose.ry - 0.6 } : { ...pose };
        this.applyPose(mesh, mesh.userData.state);
        this.instances.set(key, mesh); this.world.add(mesh);
        this.applyLook(mesh, book.id);
        return mesh;
    }

    release(key) {
        const mesh = this.instances.get(key);
        if (!mesh) return;
        this.world.remove(mesh); this.instances.delete(key);
        mesh.material = this.factory.plainMaterials();
        if (this.pool.length < 400) this.pool.push(mesh); else this.factory.discard(mesh);
    }

    /** Camera x limits of the current row; wide rows pan, narrow ones sit centred. */
    updatePanBounds() {
        const row = this.rows[this.rowIndex];
        const [min, max] = panBounds(row?.layout.width ?? 0, this.halfViewWidth());
        this.pan.setBounds(min, max);
    }

    /** x of a book on the current row (its centre), or null when it is not on it. */
    focusX(id = this.focusId) { return this.rows[this.rowIndex]?.layout.positions.get(id)?.x ?? null; }

    setScene(scene) {
        const next = { kind: scene?.kind || 'hero', bookId: scene?.bookId ?? null, rowIndex: Number.isInteger(scene?.rowIndex) ? scene.rowIndex : null,
            rowsVersion: Number.isInteger(scene?.rowsVersion) ? scene.rowsVersion : null, page: scene?.page ?? null };
        if (next.kind === 'shelf' && next.rowsVersion != null && next.rowsVersion !== this.rowsVersion) {
            // The row list changed (a shelf was created, renamed or reordered): ask for it again instead of guessing a row.
            this.pendingScene = next; this.callbacks.onRowsStale?.(next.rowsVersion);
            return;
        }
        this.pendingScene = null;
        const previousCamera = this.cameraState, previousKind = this.scene.kind, previousRow = this.rowIndex;
        if (next.kind === 'shelf') {
            const wanted = next.rowIndex ?? this.rowIndex;
            this.rowIndex = Math.min(Math.max(0, wanted), Math.max(0, this.rows.length - 1));
            // Entering the bookcase from the hero starts panning from where the camera is.
            if (previousKind !== 'shelf' && previousCamera) this.pan.x = previousCamera.px;
            this.updatePanBounds();
            this.pan.x = this.pan.clamp(this.pan.x);
        }
        const previousFocus = this.focusId, focusChanged = !!next.bookId && next.bookId !== this.focusId;
        if (next.bookId) this.focusId = next.bookId;
        if (next.kind !== 'shelf') this.setFeatured(next.bookId || this.featuredId || this.books[0]?.id || null);
        this.scene = next; this.settledKind = null; this.reportedKey = null;
        this.backgroundTarget = null;
        this.cameraLambda = LAMBDA.camera;
        if (next.kind === 'shelf' && previousCamera) {
            const target = cameraPose(next, { rowIndex: this.rowIndex, rows: this.rows, focusId: this.focusId, halfViewWidth: this.halfViewWidth() });
            this.cameraLambda = travelLambda(Math.abs(target.py - previousCamera.py));
        }
        this.touch();
        if (next.kind === 'shelf') {
            this.followFocus(focusChanged || previousKind !== 'shelf' || previousRow !== this.rowIndex);
            this.syncWindow(true);
            this.syncPresented(previousFocus);
        } else this.refreshLooks();
        if (!this.motion.travel && this.cameraState) this.snap();
        this.invalidate();
    }

    /**
     * The presented book tints the page with its accent (contrast-checked, λ = 5) and gets its painted cover; the one it replaces
     * gives its large cover back once it has turned away. Off the shelf there is no presented book and no tint.
     */
    syncPresented(previous) {
        if (this.scene.kind !== 'shelf') { this.backgroundTarget = null; return; }
        const id = this.focusId;
        this.backgroundTarget = id ? this.accentBackground(id) : null;
        if (id) { this.requestLook(id); if (this.looks.has(id)) this.requestCover(id, 'full'); }
        if (previous && previous !== id) setTimeout(() => this.dropCover(previous), 1500);
        if (this.hoverId === id) clearTimeout(this.dwell);
    }

    /** Frees a book's large cover texture once it is neither presented, featured nor opening: memory stays bounded while browsing. */
    dropCover(id) {
        if (this.disposed) return;
        if (id === this.featuredId || this.opening?.id === id || (this.scene.kind === 'shelf' && id === this.focusId)) return;
        const look = this.looks.map.get(id);
        if (!look?.cover) return;
        look.disposeMaterials?.(); look.materials = null;
        look.disposeCover(); look.coverWidth = 0;
        this.applyLookEverywhere(id);
    }

    /** A presented book (arrow keys, click, dwell, entering a row) recentres the row on it; a plain hover never presents (WP3/WP4). */
    followFocus(changed) {
        if (!changed || this.scene.kind !== 'shelf') return;
        const x = this.focusX();
        if (x != null) { if (this.motion.travel) this.pan.recenter(x); else { this.pan.x = this.pan.clamp(x); this.pan.target = null; } }
    }

    focusBook(id) {
        if (this.focusId === id) return;
        const previous = this.focusId;
        this.focusId = id;
        this.followFocus(true);
        this.syncPresented(previous);
        if (this.scene.kind !== 'shelf' && id) this.setFeatured(id);
        this.touch(); this.invalidate();
    }

    setMotion(level) { this.motion = motionSettings(level); if (!this.motion.travel) this.snap(); this.invalidate(); }

    setQuality(level) {
        this.quality = new QualityMonitor({ level, devicePixelRatio: window.devicePixelRatio, onStep: s => this.applyQuality(s), onFallback: r => this.fallback(r) });
        this.applyQuality(this.quality.current); this.invalidate();
    }

    /** The page tinted toward the cover's colour while text keeps 4.5:1; null keeps the neutral background. */
    accentBackground(bookId) {
        const accent = this.accents.get(bookId);
        if (!accent) return null;
        const style = getComputedStyle(document.documentElement);
        const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
        const tint = accentTint(accent, read('--folio-bg', '#0B0B0C'), [read('--folio-text', '#EDEBE6'), read('--folio-text-muted', '#9A968E')]);
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

    // ---- 3D reading (WP6) -------------------------------------------------------------------------------------------------------

    /** The book hidden from the shelf and hero while its open copy is drawn. */
    get hiddenId() { return this.opening?.id ?? this.reading?.id ?? null; }

    /** Starts opening the book as a 3D spread: forward, cover open, lay flat. The reader then reports the page (readingStart). */
    beginReading(bookId) {
        const book = this.byId.get(bookId);
        if (!book) return false;
        this.endOpening(); this.endReading();
        const from = this.worldPoseOf(bookId);
        this.requestLook(bookId); this.requestCover(bookId, 'full');
        this.reading = new Reading(this, book, this.looks.map.get(bookId));
        this.reading.placeFrom(from);
        this.scene = { kind: 'reading', bookId }; this.settledKind = null; this.reportedKey = null;
        this.cameraLambda = LAMBDA.opening; this.backgroundTarget = null;
        this.touch(); this.invalidate();
        return true;
    }

    /** The document is open: land on this page. The riffle starts as soon as the book lies open. */
    readingStart(pageIndex, total) { this.reading?.start(pageIndex, total); this.invalidate(); }

    /** Closing: the cover shuts and the book returns to its place in `returnScene`. */
    closeReading(returnScene) {
        const reading = this.reading;
        if (!reading) { this.setScene(returnScene); return; }
        this.setScene(returnScene);
        const back = this.scene.kind === 'shelf' ? this.worldPoseOfSlot(reading.id) : featuredPose(this.scene, { idle: 0, pointerX: 0, pointerY: 0 });
        reading.close(reading.groupPoseFor({ ...back, rx: back.rx ?? 0 }), () => { this.endReading(); this.callbacks.onReadingClosed?.(reading.id); this.invalidate(); });
        this.invalidate();
    }

    endReading() {
        if (!this.reading) return;
        this.reading.dispose(); this.reading = null;
    }

    /** Current world pose of a book: the featured mesh, else its shelf instance in the focused row. */
    worldPoseOf(bookId) {
        if (this.featured && this.featuredId === bookId && this.featured.visible) {
            const f = this.featuredState; return { x: f.x, y: f.y, z: f.z, ry: f.ry, rx: f.rx };
        }
        const mesh = this.instances.get(`${this.rowIndex}:${bookId}`) ?? [...this.instances.entries()].find(([k]) => k.endsWith(`:${bookId}`))?.[1];
        if (mesh) { const st = mesh.userData.state; return { x: st.x, y: st.y, z: st.z, ry: st.ry, rx: st.rx }; }
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
        return x == null ? { x: 0, y: FEATURE_Y, z: 0, ry: 0 } : shelfPose(this.rowIndex, x, 'presented');
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
        this.bookcase?.setTheme(theme);
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
        if (this.looks.has(id)) this.requestCover(id, 'full');
    }

    /** Detailed textures for the books nearest the camera, up to the LRU limit; others keep the placeholder. */
    refreshLooks() {
        const priority = [];
        if (this.featuredId) priority.push(this.featuredId);
        // Detailed textures go to the books nearest the camera: the current row first, then its neighbours (WP3).
        const near = [...this.instances.keys()].map(key => {
            const split = key.indexOf(':'), row = +key.slice(0, split), id = key.slice(split + 1);
            return { id, current: row === this.rowIndex ? 0 : 1, d: Math.abs((this.rows[row]?.layout.positions.get(id)?.x ?? 0) - this.pan.x) };
        }).sort((a, b) => a.current - b.current || a.d - b.d);
        for (const entry of near) priority.push(entry.id);
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
            let loaded;
            try { loaded = await loadSpineLook(book, { anisotropy: this.renderer.capabilities.getMaxAnisotropy() }); }
            catch (error) { console.warn('[FolioStage] look', book.id, error?.message); return; }
            if (this.disposed || this.byId.get(id) !== book && !this.byId.has(id)) { loaded.spine.dispose(); return; }
            const accent = loaded.dominant ? readableAccent(loaded.dominant, '#0B0B0C', 3) : null;
            this.accents.set(id, accent);
            const look = { ...loaded, accent, cover: null, coverWidth: 0, materials: null, disposeMaterials: null,
                dispose() { this.disposeMaterials?.(); this.spine.dispose(); this.disposeCover?.(); } };
            look.disposeCover = () => { look.cover?.color.dispose(); look.cover?.orm.dispose(); look.cover?.normal?.dispose(); look.cover = null; };
            this.looks.set(id, look);
            this.applyLookEverywhere(id);
            this.callbacks.onAccent?.(id, accent);
            if (this.scene.kind === 'shelf' && id === this.focusId) this.backgroundTarget = this.accentBackground(id);
            if (this.wantsCover(id)) this.requestCover(id);
            this.invalidate();
        })().finally(() => this.loading.delete(id));
        this.loading.set(id, task);
    }

    /** Books whose cover is visible (the featured book, and later the presented one) get a painted cover. */
    wantsCover(id) { return id === this.featuredId || (this.scene.kind === 'shelf' && id === this.focusId); }

    /** Paints (or loads from the cache) the book's cover at 'shelf' (512 px) or 'full' (1024 px); no-op if already there. */
    async requestCover(id, level = 'full') {
        const look = this.looks.get(id), book = this.byId.get(id);
        if (!look || !book) return;
        const width = COVER_SIZES[level] ?? COVER_SIZES.full;
        if (look.coverWidth >= width || look.coverPending >= width) return;
        look.coverPending = width;
        try {
            const cover = await loadCoverLook(book, { level, dominant: look.dominant, anisotropy: this.renderer.capabilities.getMaxAnisotropy() });
            if (this.disposed || this.looks.map.get(id) !== look) { cover.color.dispose(); cover.orm.dispose(); cover.normal?.dispose(); return; }
            look.disposeMaterials?.(); look.materials = null;
            look.disposeCover();
            look.cover = cover; look.coverWidth = width;
            this.applyLookEverywhere(id);
            this.invalidate();
        } catch (error) { console.warn('[FolioStage] cover', id, error?.message); }
        finally { look.coverPending = 0; }
    }

    applyLookEverywhere(id) {
        for (const [key, mesh] of this.instances) if (key.endsWith(`:${id}`)) this.applyLook(mesh, id);
        if (this.featuredId === id && this.featured) this.applyLook(this.featured, id);
    }

    applyLook(mesh, id) {
        const look = this.looks.map.get(id);
        if (!look) return;
        if (!look.materials) { const made = this.factory.materialsFor(look); look.materials = made.materials; look.disposeMaterials = made.dispose; }
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
        const ctx = { rowIndex: this.rowIndex, rows: this.rows, focusId: this.focusId, halfViewWidth: this.halfViewWidth(), panX: this.pan.x };
        // Horizontal browsing: the pan position is the camera's x (the row moves under the user's hand, undamped).
        let panActive = false;
        if (this.scene.kind === 'shelf' && !this.opening) { this.updatePanBounds(); panActive = this.pan.step(dt); }

        // camera
        const target = cameraPose(this.scene, ctx);
        if (!this.cameraState || !this.motion.travel) this.cameraState = { ...target };
        else remaining = Math.max(remaining, dampObject(this.cameraState, target, this.scene.kind === 'opening' || this.scene.kind === 'reading' ? LAMBDA.opening : this.cameraLambda, dt));
        if (this.scene.kind === 'shelf' && !this.pendingScene && cameraRemaining(this.cameraState, target) < 0.3) this.report('shelf');
        const c = this.cameraState;
        if (this.scene.kind === 'shelf' && !this.opening) { c.px = c.lx = this.pan.x; if (panActive) remaining = Math.max(remaining, 1); if (this.syncWindow()) this.invalidate(); }
        // Scenes centre on the main area (right of the sidebar, below the header); opening uses the whole window.
        const offsetTarget = this.scene.kind === 'opening' || this.scene.kind === 'reading' || this.opening || this.reading ? { x: 0, y: 0 } : this.mainOffset();
        remaining = Math.max(remaining, this.motion.travel ? dampObject(this.viewOffset, offsetTarget, LAMBDA.camera * 2, dt) : (Object.assign(this.viewOffset, offsetTarget), 0));
        this.applyCamera();
        if (this.opening) remaining = Math.max(remaining, this.updateOpening(dt));
        if (this.reading) remaining = Math.max(remaining, this.reading.update(dt));
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
            this.featured.visible = (this.scene.kind !== 'shelf' || Math.abs(c.py - fs.y) < 60) && this.hiddenId !== this.featuredId;
            if (idle) remaining = Math.max(remaining, 1);
        }

        // shelf books: rest, lifted (hovered) or presented (facing the camera); neighbours of the presented book part (WP4)
        const presented = this.scene.kind === 'shelf' ? this.presentedInfo() : null;
        for (const [key, mesh] of this.instances) {
            const row = mesh.userData.row, id = key.slice(key.indexOf(':') + 1);
            const layout = this.rows[row]?.layout; if (!layout) continue;
            const entry = layout.positions.get(id);
            let mode = 'rest', shift = 0, distance = 0;
            if (presented && row === presented.row) {
                if (id === this.focusId) mode = 'presented';
                else { distance = Math.abs(entry.index - presented.index); shift = entry.index < presented.index ? -presented.shift : presented.shift; }
            }
            if (mode === 'rest' && this.motion.lift && this.scene.kind === 'shelf' && row === this.rowIndex && id === this.hoverId) mode = 'lifted';
            const pose = shelfPose(row, entry.x + shift, mode);
            const state = mesh.userData.state;
            remaining = Math.max(remaining, this.motion.travel ? dampKeys(state, pose, poseLambdas(mode, distance), dt) : (Object.assign(state, pose), 0));
            this.applyPose(mesh, state);
            mesh.visible = Math.abs(rowY(row) - c.ly) < 90 && !(this.hiddenId === id && row === this.rowIndex);
        }
        return remaining > 0;
    }

    /** The presented book on the current row and how far its neighbours part, or null. */
    presentedInfo() {
        const entry = this.rows[this.rowIndex]?.layout.positions.get(this.focusId);
        return entry ? { row: this.rowIndex, index: entry.index, shift: partedShift(entry.thickness) } : null;
    }

    applyPose(mesh, p) { mesh.position.set(p.x, p.y, p.z); mesh.rotation.set(p.rx, p.ry, p.rz); }

    snap() {
        this.cameraState = null;
        for (const mesh of this.instances.values()) mesh.userData.state = { ...mesh.userData.state };
    }

    maybeSettled() {
        this.settledKind = this.scene.kind;
        this.report(this.scene.kind);
    }

    /** Tells .NET the scene arrived, once per scene and row (the shelf navigator's settle handshake, WP2). */
    report(kind) {
        const key = `${kind}:${kind === 'shelf' ? this.rowIndex : ''}`;
        if (this.reportedKey === key) return;
        this.reportedKey = key;
        this.callbacks.onSceneSettled?.(kind, kind === 'shelf' ? this.rowIndex : -1);
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
                    looks: stage.looks.size, reading: stage.reading ? { phase: stage.reading.phase, spread: stage.reading.spread, total: stage.reading.total, flights: stage.reading.flights.length, interactive: stage.reading.interactive } : null, paused: stage.paused, powerSaver: !!stage.powerSaver, contextLosses: stage.contextLosses, handoff: stage.lastHandoff };
            },
            get settled() { return stage.raf === 0 && stage.settledKind === stage.scene.kind; },
            resetFrameTimes() { stage.stats.frameTimes = []; stage.stats.cpuTimes = []; },
            /** Test hook: paints a cover (optionally forcing a template) and returns it with its design as data URLs. */
            composeCover(book, { template = null, width = 512, dominant = null } = {}) {
                const design = { ...designFor(book, dominant), ...(template ? { template } : {}) };
                const painted = composeCover(book, { width, dominant, design });
                return { color: painted.color.toDataURL(), orm: painted.orm.toDataURL(), normal: painted.normal?.toDataURL() ?? null, design: painted.design,
                    spine: composeSpine(book, { width: 64, dominant, design }).toDataURL() };
            },
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

    /** Where a book's centre is on screen (client pixels), or null when it has no mesh right now. Used by tests and keyboard helpers. */
    screenPoint(id) {
        const mesh = [...this.instances].find(([key]) => key.endsWith(`:${id}`))?.[1];
        if (!mesh) return null;
        const v = mesh.position.clone().project(this.camera), rect = this.canvas.getBoundingClientRect();
        return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
    }

    /** Hover lifts a spine at once; resting on the same book for 250 ms presents it (a click or an arrow key presents sooner). */
    setHover(id) {
        if (id === this.hoverId) return;
        this.hoverId = id;
        clearTimeout(this.dwell);
        if (id && id !== this.focusId && this.motion.lift) {
            this.dwell = setTimeout(() => { if (this.hoverId === id && this.scene.kind === 'shelf' && !this.disposed) this.callbacks.onBookActivated?.(id, 'present'); }, DWELL_MS);
        }
        this.invalidate();
    }

    /** Centimetres of the row per CSS pixel at shelf distance. */
    cmPerPx() {
        const width = this.mainRect?.width || this.canvas.clientWidth || 1;
        return (this.halfViewWidth() * 2) / width;
    }

    /** Wheel and trackpad panning (horizontal gestures, Shift + wheel); discrete notches keep a short glide. */
    panBy(pixels) {
        const cm = pixels * this.cmPerPx();
        this.pan.dragBy(cm);
        if (Math.abs(pixels) >= 40) this.pan.v = cm * 5;
        this.touch(); this.invalidate();
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
        // 3D reading: the stage turns pages; any key or click during the opening skips to the spread (WP6).
        on(window, 'keydown', event => {
            const r = this.reading;
            if (!r || this.disposed || event.timeStamp <= r.createdAt) return;   // the key press that opened the book is not a skip
            if (['opening', 'waiting', 'riffle'].includes(r.phase) && !['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) { r.skip(); this.invalidate(); if (event.key !== 'Escape') return; }
            if (!r.interactive || event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"], .mud-dialog')) return;
            const step = { ArrowRight: 1, PageDown: 1, ArrowLeft: -1, PageUp: -1 }[event.key];
            if (step) { event.preventDefault(); r.turn(step); this.touch(); this.invalidate(); }
            else if (event.key === 'Home') { event.preventDefault(); r.goToSpread(0); this.invalidate(); }
            else if (event.key === 'End') { event.preventDefault(); r.goToSpread(Infinity); this.invalidate(); }
        });
        on(window, 'pointerdown', event => { if (this.reading && event.timeStamp > this.reading.createdAt && ['opening', 'waiting', 'riffle'].includes(this.reading.phase)) { this.reading.skip(); this.invalidate(); } });
        on(window, 'folio-turn', event => { this.reading?.turn(event.detail?.step > 0 ? 1 : -1); this.invalidate(); });
        on(window, 'folio-spread-request', () => { this.reading?.showOverlay(); this.invalidate(); });
        on(window, 'folio-goto', event => { this.reading?.goToPage(event.detail?.index ?? 0); this.invalidate(); });
        on(document, 'visibilitychange', () => { if (!document.hidden) { this.lastTick = 0; this.invalidate(); } });
        // Click and drag on empty wood or the back panel pans the row; a release with speed keeps gliding (WP3).
        on(this.input, 'pointerdown', event => {
            if (!live() || this.scene.kind !== 'shelf' || this.opening || event.button !== 0 || onControl(event) || this.pick(event)) return;
            this.drag = { id: event.pointerId, x: event.clientX, moved: 0, lastMove: event.timeStamp };
            this.pan.beginDrag(); this.touch();
            try { this.input.setPointerCapture?.(event.pointerId); } catch { /* the pointer may already be gone */ }
            this.invalidate();
        });
        const endDrag = event => {
            if (!this.drag || event.pointerId !== this.drag.id) return;
            const moved = this.drag.moved > 4;
            // Input timestamps, not the clock: a busy main thread must not look like a pause before release.
            this.pan.endDrag(this.testMode ? 0 : event.timeStamp - this.drag.lastMove);
            this.drag = null; this.suppressClick = moved;
            if (moved) setTimeout(() => { this.suppressClick = false; }, 0);
            this.invalidate();
        };
        on(this.input, 'pointerup', endDrag);
        on(this.input, 'pointercancel', endDrag);
        on(this.input, 'pointermove', event => {
            if (!this.drag || event.pointerId !== this.drag.id) return;
            const now = event.timeStamp, dx = event.clientX - this.drag.x;
            this.drag.x = event.clientX; this.drag.moved += Math.abs(dx);
            // Test mode runs on a fixed clock (software GL stretches real time), so its drags use a fixed 60 Hz sample interval.
            this.pan.dragBy(-dx * this.cmPerPx(), this.testMode ? 1 / 60 : Math.max(0.004, (now - this.drag.lastMove) / 1000));
            this.drag.lastMove = now; this.touch(); this.invalidate();
        });
        on(this.input, 'pointermove', event => {
            this.lastPointerAt = performance.now();
            if (!live()) return;
            const rect = this.canvas.getBoundingClientRect();
            this.pointer.x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
            this.pointer.y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
            this.touch();
            if (this.scene.kind === 'shelf') this.setHover(this.pick(event));
            if (this.motion.tilt || this.scene.kind === 'shelf') this.invalidate();
        });
        on(this.input, 'pointerleave', () => { this.pointer.x = 0; this.pointer.y = 0; this.setHover(null); this.invalidate(); });
        on(this.input, 'click', event => {
            if (this.suppressClick) { this.suppressClick = false; return; }
            if (!live() || onControl(event)) return;
            const id = this.pick(event);
            if (!id) return;
            this.touch();
            // A click presents a book; a click on the presented book (or the hero's book) opens it.
            if (id === this.focusId || (this.scene.kind === 'hero' && id === this.featuredId)) this.callbacks.onBookActivated?.(id, 'open');
            else this.callbacks.onBookActivated?.(id, 'present');
        });
        on(this.input, 'contextmenu', event => {
            if (!live() || onControl(event)) return;
            const id = this.pick(event);
            if (!id) return;
            event.preventDefault(); this.touch();
            this.callbacks.onBookActivated?.(id, 'menu');
        });
        on(this.input, 'wheel', event => {
            if (!live() || event.target?.closest?.('.folio-stage-scroll')) return;
            // One gesture is one step: momentum events of a trackpad swipe never fire a second one (WP2).
            // Input timestamps, not the time the handler runs: a busy main thread must not stretch a gesture into several.
            const { intent, pan } = this.gate.wheel(event, event.timeStamp);
            if (!event.deltaX && !event.deltaY) return;
            event.preventDefault();
            if (pan && this.scene.kind === 'shelf' && !this.opening) this.panBy(pan);
            if (intent) { this.touch(); this.callbacks.onScrollIntent?.(intent); }
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
        this.endReading();
        this.looks.clear();
        this.bookcase.dispose();
        this.factory.dispose();
        this.environment.dispose();
        this.renderer.dispose();
        if (window.__folioStage?.stage === this) delete window.__folioStage;
    }
}
