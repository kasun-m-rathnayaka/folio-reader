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
import { cameraPose, featuredPose, shelfPose, layoutRows, rowY, CAMERA_FOV } from './scenes.js';
import { readableAccent } from '../wwwroot/js/folio-color.mjs';

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

    setLibrary(books, shelves = []) {
        const known = new Set(this.byId.keys());
        const signature = b => `${b.title}|${b.author}|${b.coverUrl}|${Math.round((b.progress || 0) * 100)}|${b.color}`;
        for (const book of books) {
            const previous = this.byId.get(book.id);
            if (previous && signature(previous) !== signature(book)) this.looks.delete(book.id);
        }
        const firstLoad = !this.libraryLoaded; this.libraryLoaded = true;
        this.books = books; this.shelves = shelves;
        this.byId = new Map(books.map(b => [b.id, b]));
        this.rows = layoutRows(rowsFor(books, shelves));
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

    setTheme(theme) {
        const style = getComputedStyle(document.documentElement);
        const bg = style.getPropertyValue('--folio-bg').trim() || (theme === 'light' ? '#F3F0E8' : '#0B0B0C');
        this.theme = theme;
        this.background = new THREE.Color(bg);
        this.world.background = this.background;
        this.world.fog = new THREE.Fog(this.background, 120, 260);
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

    tick(now) {
        this.raf = 0;
        if (this.disposed || this.paused) return;
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
        const idle = this.motion.idle && !this.testMode && this.scene.kind === 'hero' && now - this.lastInputAt < IDLE_STOP_MS;
        if (idle) this.idleClock += dt;
        const ctx = { rowIndex: this.rowIndex, rows: this.rows, focusId: this.focusId, halfViewWidth: this.halfViewWidth() };

        // camera
        const target = cameraPose(this.scene, ctx);
        if (!this.cameraState || !this.motion.travel) this.cameraState = { ...target };
        else remaining = Math.max(remaining, dampObject(this.cameraState, target, LAMBDA.camera, dt));
        const c = this.cameraState;
        this.camera.position.set(c.px, c.py, c.pz); this.camera.lookAt(c.lx, c.ly, c.lz);

        // featured book: idle turn fades back to rest instead of snapping
        if (this.featured) {
            const maxTilt = (POINTER_MAX[this.scene.kind] ?? 0) * Math.PI / 180;
            const tilt = this.motion.tilt ? { x: -this.pointer.y * maxTilt, y: this.pointer.x * maxTilt } : { x: 0, y: 0 };
            const pose = featuredPose(this.scene, { idle: idle ? idleTurn(this.idleClock) : 0, pointerX: tilt.x, pointerY: tilt.y });
            const fs = this.featuredState;
            remaining = Math.max(remaining, dampObject(fs, pose, this.motion.travel ? LAMBDA.pointer : 1e3, dt));
            this.applyPose(this.featured, fs);
            this.featured.visible = this.scene.kind !== 'shelf' || Math.abs(c.py - fs.y) < 60;
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
            mesh.visible = Math.abs(rowY(row) - c.ly) < 90;
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
        this.quality.record(intervalMs);
    }

    publishStats() {
        const stage = this;
        window.__folioStage = {
            get stats() {
                const s = stage.stats;
                return { frames: s.frames, lastFrameAt: s.lastFrameAt, drawCalls: s.drawCalls, textures: s.textures,
                    p95FrameMs: percentile(s.frameTimes, 0.95), p95CpuMs: percentile(s.cpuTimes || [], 0.95),
                    quality: stage.quality.current, scene: stage.scene.kind, renderer: s.renderer, books: stage.books.length,
                    looks: stage.looks.size, paused: stage.paused, contextLosses: stage.contextLosses };
            },
            resetFrameTimes() { stage.stats.frameTimes = []; stage.stats.cpuTimes = []; },
            /** Test hook: force continuous frames for a duration to measure frame time. */
            async measure(ms) {
                stage.resetFrameTimes();
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
        const distance = 64;
        return Math.tan((CAMERA_FOV * Math.PI / 180) / 2) * distance * this.camera.aspect;
    }

    resize() {
        const width = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 1;
        const height = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 1;
        this.renderer.setSize(width, height, false);
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
