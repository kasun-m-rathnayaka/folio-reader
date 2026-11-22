// 3D reading (WP6): the book opens, riffles to your page and stays open as a spread you turn with a real page curl. The
// reader engine (folio-reader.js) draws the text layer, highlights and dog-ears over the two pages; this module draws the book.
//
// Book space: the gutter is the origin, pages lie in the z = 0 plane facing +z (the camera), the spine runs along y. A closed
// book occupies x ∈ [0, W] with its front cover on top; opening swings the front cover round the spine (rotation about y by −π)
// onto the left while leaves flip from the right pile to the left pile.
import * as THREE from 'three';
import { BOOK_WIDTH as W, BOOK_HEIGHT as H, thicknessCm } from './layout.js';
import { MAT, BOARD } from './hardcover.js';
import { composeEndpaper } from './cover-composer.js';
import { CurlPage, createPageMaterial, setImage, fitFor, easeTurn, turnShape } from './curl-page.js';
import { PageTextures, targetHeight } from './page-textures.js';
import { dampObject } from './motion.js';

export const READ = {
    PW: 13.6, PH: 20.4,                         // a page: inside the board's overhang
    camZ: 52, camY: 0.9,                        // keep in step with READ_CAMERA_Z in scenes.js
    forwardMs: 300, coverMs: 400, coverStartMs: 200, layMs: 300, layStartMs: 500,
    riffleFlightMs: 300, riffleStepMs: 50, maxRiffleLeaves: 12, turnMs: 400, settleMs: 200,
    leaves: 6,
};

// ---- spread arithmetic (pure; unit-tested) -----------------------------------------------------------------------------

/** Page 0 sits alone on the right; then (1,2), (3,4)…: spread s shows pages 2s−1 (left) and 2s (right). */
export const spreadOfPage = page => (Math.max(0, page) + 1) >> 1;
export const lastSpread = total => Math.max(0, total) >> 1;
export function pagesOfSpread(spread, total) {
    const left = 2 * spread - 1, right = 2 * spread;
    return { left: left >= 0 && left < total ? left : null, right: right >= 0 && right < total ? right : null };
}
/** Share of the pages that lie on the left of the spine for a spread (drives the thickness of the two page blocks). */
export const readFraction = (spread, total) => total > 0 ? Math.min(1, Math.max(0, (2 * spread - 1) / total)) : 0;
/** How many leaves fly when jumping `distance` spreads: one curl for a neighbour, up to 12 flips for a long way. */
export const riffleCount = distance => distance <= 1 ? 1 : Math.min(READ.maxRiffleLeaves, Math.max(3, Math.ceil(distance / 2)));

const smooth = (a, b, t) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;

export class Reading {
    constructor(stage, book, look) {
        this.stage = stage; this.book = book; this.id = book.id;
        this.createdAt = performance.now();                    // input that started the opening must not also skip it
        this.thickness = thicknessCm(book.pages);
        this.blockTotal = Math.max(0.3, this.thickness - 2 * BOARD);
        this.total = book.pages;
        this.phase = 'opening'; this.t = 0;
        this.spread = 0; this.targetSpread = 0;
        this.fraction = 0;                                   // share of pages on the left: animates with the riffle
        this.cover = 0;                                       // front cover angle, 0 (closed) … 1 (open flat on the left)
        this.slide = 0;                                       // 0: closed book centred; 1: gutter centred
        this.tilt = 1;                                        // lean-back that flattens as the book lies open
        this.queue = []; this.flights = []; this.interactive = false;
        this.ready = false; this.settledReported = false;
        this.materials = look?.materials ?? stage.factory.plainMaterials();
        this.design = look?.design ?? null;
        this.pageTextures = new PageTextures({ onReady: () => this.onTexture(), anisotropy: stage.renderer.capabilities.getMaxAnisotropy() });
        this.build();
    }

    // ---- model ------------------------------------------------------------------------------------------------------------

    build() {
        const { PW, PH } = READ, pages = this.stage.factory.pages, top = this.stage.factory.pagesTop;
        // The inside of the boards shows an endpaper patterned in the cover's palette.
        const m = this.materials.slice();
        if (this.design) {
            this.endpaperTexture = new THREE.CanvasTexture(composeEndpaper(this.design)); this.endpaperTexture.colorSpace = THREE.SRGBColorSpace;
            this.endpaperMaterial = new THREE.MeshStandardMaterial({ map: this.endpaperTexture, roughness: 0.9 });
            m[MAT.endpaper] = this.endpaperMaterial;
        }
        const hidden = this.hiddenTop = new THREE.MeshBasicMaterial({ visible: false });   // the page planes are the top of each block
        this.group = new THREE.Group(); this.group.name = 'reading';
        const box = (w, h, d, materials) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials);
        // Back board and the right page block: fixed; they only change thickness as pages move across.
        this.backBoard = box(W, H, BOARD, [m[MAT.board], m[MAT.board], m[MAT.board], m[MAT.board], m[MAT.endpaper], m[MAT.back]]);
        this.backBoard.position.x = W / 2;
        this.rightBlock = box(PW, PH, 1, [pages, pages, top, top, hidden, hidden]);
        this.rightBlock.position.x = 0.1 + PW / 2 - 0.1;
        // The front cover hangs on a hinge at the spine; its inner face (the endpaper) shows once it lies open.
        this.hinge = new THREE.Group();
        this.frontBoard = box(W, H, BOARD, [m[MAT.board], m[MAT.board], m[MAT.board], m[MAT.board], m[MAT.front], m[MAT.endpaper]]);
        this.frontBoard.position.set(W / 2, 0, BOARD / 2);
        this.hinge.add(this.frontBoard);
        this.leftBlock = box(PW, PH, 1, [pages, pages, top, top, hidden, hidden]);
        this.leftBlock.position.x = -PW / 2 - 0.0;
        this.group.add(this.backBoard, this.rightBlock, this.hinge, this.leftBlock);
        // The two static pages of the spread, and a pool of leaves for turns and the riffle.
        const plane = (x0) => { const g = new THREE.PlaneGeometry(PW, PH, 32, 4); g.translate(x0 + PW / 2, 0, 0); return g; };
        this.leftMaterial = createPageMaterial(); this.rightMaterial = createPageMaterial();
        this.leftMaterial.uniforms.uGutter.value = this.rightMaterial.uniforms.uGutter.value = 1;
        this.leftPage = new THREE.Mesh(plane(-PW), this.leftMaterial); this.rightPage = new THREE.Mesh(plane(0), this.rightMaterial);
        this.leftPage.position.z = this.rightPage.position.z = 0.002;
        this.leftPage.visible = false; this.rightPage.visible = false;
        this.group.add(this.leftPage, this.rightPage);
        this.leaves = Array.from({ length: READ.leaves }, () => { const leaf = new CurlPage(PW, PH); leaf.mesh.position.z = 0.02; this.group.add(leaf.mesh); return leaf; });
        this.shadows = [0, 1].map(() => { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, PH), this.shadowMaterial()); mesh.visible = false; mesh.position.z = 0.012; mesh.renderOrder = 1; this.group.add(mesh); return mesh; });
        this.applyBlocks();
        this.stage.world.add(this.group);
    }

    paper() { return this.stage.factory.paper; }

    /** A soft strip that fades away from the fold: the shadow a lifted leaf casts on the page beneath. Each strip has its own opacity. */
    shadowMaterial() {
        this.shadowMap ??= (() => {
            const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 4 }), g = canvas.getContext('2d');
            const grad = g.createLinearGradient(0, 0, 64, 0); grad.addColorStop(0, 'rgba(0,0,0,.55)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = grad; g.fillRect(0, 0, 64, 4);
            return new THREE.CanvasTexture(canvas);
        })();
        return new THREE.MeshBasicMaterial({ map: this.shadowMap, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    }

    /** Thickness of the left and right page blocks follows how far through the book the spread is (read pages left, unread right). */
    applyBlocks() {
        const left = Math.max(0.001, this.blockTotal * this.fraction), right = Math.max(0.001, this.blockTotal * (1 - this.fraction));
        this.leftBlock.scale.z = left; this.leftBlock.position.z = -left / 2; this.leftBlock.visible = this.fraction > 0.003;
        this.rightBlock.scale.z = right; this.rightBlock.position.z = -right / 2;
        this.backBoard.position.z = -right - BOARD / 2;
        // The open front cover lies under the left block; closed (angle 0) it lies on top of the right one.
        this.hinge.position.z = -left;
        this.hinge.rotation.y = -Math.PI * this.cover;
        this.leftPage.position.x = 0; this.leftPage.position.z = 0.002;
    }

    // ---- placement ---------------------------------------------------------------------------------------------------------

    /** Group transform that puts the closed book exactly where the shelf (or hero) mesh is: same pose, spine at the origin. */
    groupPoseFor(pose) {
        const offset = new THREE.Vector3(-W / 2, 0, this.blockTotal / 2).applyEuler(new THREE.Euler(pose.rx ?? 0, pose.ry ?? 0, 0));
        return { x: pose.x + offset.x, y: pose.y + offset.y, z: pose.z + offset.z, rx: pose.rx ?? 0, ry: pose.ry ?? 0, rz: 0 };
    }

    placeFrom(pose) {
        this.fromPose = this.groupPoseFor(pose);
        this.pose = { ...this.fromPose };
        this.applyPose();
    }

    applyPose() { this.group.position.set(this.pose.x, this.pose.y, this.pose.z); this.group.rotation.set(this.pose.rx, this.pose.ry, this.pose.rz); }

    /** Where the group sits when the book is shown: closed centred (slide 0) or open with the gutter at the centre (slide 1). */
    restPose(slide, tilt = 0) { return { x: lerp(-W / 2, 0, slide), y: READ.camY, z: 0, rx: -0.14 * tilt, ry: 0, rz: 0 }; }

    // ---- control ---------------------------------------------------------------------------------------------------------------

    /** The document is open: where to land, and how many pages there are. Starts the riffle once the book lies open. */
    start(pageIndex, total) {
        this.total = total || this.total;
        this.targetSpread = Math.min(spreadOfPage(pageIndex), lastSpread(this.total));
        this.ready = true;
        // A key or click already skipped the opening before the document arrived: land on the page without the riffle.
        if (!['opening', 'waiting'].includes(this.phase) && this.phase !== 'closing') {
            this.spread = this.targetSpread; this.fraction = readFraction(this.spread, this.total);
            this.applyBlocks(); this.showPages();
            if (this.phase === 'rest') this.showOverlay();
        }
    }

    skip() {
        if (!['opening', 'waiting', 'riffle'].includes(this.phase)) return;
        this.flights.forEach(f => f.leaf.mesh.visible = false); this.flights = [];
        this.phase = 'settle'; this.t = 0; this.spread = this.targetSpread; this.fraction = readFraction(this.spread, this.total);
        this.cover = 1; this.slide = 1; this.tilt = 0; this.pose = this.restPose(1, 0);
        this.applyPose(); this.applyBlocks(); this.showPages();
    }

    /** ← / → : one curl. Far jumps (Home, End, search hits, contents) riffle. */
    turn(direction) { return this.goToSpread(this.spread + direction); }

    goToPage(page) { return this.goToSpread(spreadOfPage(page)); }

    goToSpread(target) {
        target = Math.min(lastSpread(this.total), Math.max(0, target));
        if (this.phase === 'turning' || this.phase === 'riffle2') { this.queue = [target]; return; }
        if (this.phase !== 'rest' || target === this.spread) return;
        this.startJump(target);
    }

    // ---- textures -----------------------------------------------------------------------------------------------------------

    /** Render height for page images: the page's projected height on screen × the pixel ratio, capped at 2,048. */
    renderHeight() {
        const viewport = this.stage.viewportSize(), visible = 2 * READ.camZ * Math.tan(THREE.MathUtils.degToRad(this.stage.camera.fov / 2));
        return targetHeight(viewport.height * READ.PH / visible, this.stage.renderer.getPixelRatio());
    }

    image(index) {
        if (index == null) return null;
        const entry = this.pageTextures.get(index);
        if (!entry) { this.pageTextures.request(index, this.renderHeight()); return null; }
        if (entry.preview || entry.height < this.renderHeight() * 0.9) this.pageTextures.request(index, this.renderHeight());
        return { texture: entry.texture, aspect: entry.aspect, planeAspect: READ.PW / READ.PH };
    }

    onTexture() { this.showPages(); this.refreshLeaves(); this.stage.invalidate(); }

    /** Sets the two static pages (and prefetches the next and previous spreads, so turns never wait). */
    showPages() {
        const pages = pagesOfSpread(this.spread, this.total);
        if (this.phase !== 'turning' && this.phase !== 'riffle2') {
            setImage(this.leftMaterial, 'front', this.image(pages.left)); setImage(this.rightMaterial, 'front', this.image(pages.right));
        }
        this.leftPage.visible = pages.left != null && this.coverOpen();
        this.rightPage.visible = pages.right != null && this.coverOpen();
        const near = [this.spread - 1, this.spread + 1].flatMap(s => { const p = pagesOfSpread(s, this.total); return [p.left, p.right]; }).filter(i => i != null);
        this.pageTextures.prefetch(near, this.renderHeight());
    }

    coverOpen() { return this.cover > 0.98 || this.phase === 'rest' || this.phase === 'settle'; }

    refreshLeaves() { for (const f of this.flights) if (f.apply) f.apply(); }

    // ---- jumps: one curl, or a riffle ----------------------------------------------------------------------------------------

    startJump(target) {
        const distance = Math.abs(target - this.spread), forward = target > this.spread, from = this.spread;
        this.hideOverlay();
        this.interactive = false;
        const count = riffleCount(distance);
        const flights = [];
        const near = distance === 1;
        for (let i = 0; i < count; i++) {
            const leaf = this.leaves.find(l => !l.active); if (!leaf) break;
            leaf.active = true;
            const last = i === count - 1, second = i === count - 2;
            // Only the last leaves carry real pages; the rest are blank paper flying past.
            const fromPages = pagesOfSpread(from, this.total), toPages = pagesOfSpread(target, this.total);
            const frontIndex = forward ? (last ? fromPages.right : null) : (last ? toPages.right : null);
            const backIndex = forward ? (last ? toPages.left : null) : (last ? fromPages.left : null);
            const flight = { leaf, start: near ? 0 : i * READ.riffleStepMs, duration: near ? READ.turnMs : READ.riffleFlightMs, forward, frontIndex, backIndex, done: false, real: last || second };
            flight.apply = () => { setImage(leaf.material, 'front', this.image(flight.frontIndex)); setImage(leaf.material, 'back', this.image(flight.backIndex)); };
            flight.apply(); leaf.mesh.visible = true; leaf.setProgress(forward ? 0 : 1);
            flights.push(flight);
        }
        this.flights = flights; this.jump = { from, target, forward, elapsed: 0, fractionFrom: this.fraction, fractionTo: readFraction(target, this.total) };
        // What lies beneath: moving forward the right page of the destination is revealed; moving back, the left page of it.
        const toPages = pagesOfSpread(target, this.total);
        this.phase = near ? 'turning' : 'riffle2';
        if (this.stage.motion.travel === false) { this.finishJump(); return; }
        if (forward) setImage(this.rightMaterial, 'front', this.image(toPages.right)); else setImage(this.leftMaterial, 'front', this.image(toPages.left));
        this.rightPage.visible = forward ? toPages.right != null : pagesOfSpread(from, this.total).right != null;
        this.leftPage.visible = forward ? pagesOfSpread(from, this.total).left != null : toPages.left != null;
        this.pageTextures.prefetch([toPages.left, toPages.right, pagesOfSpread(target + (forward ? 1 : -1), this.total).left, pagesOfSpread(target + (forward ? 1 : -1), this.total).right].filter(i => i != null), this.renderHeight());
    }

    finishJump() {
        const jump = this.jump; if (!jump) return;
        for (const f of this.flights) { f.leaf.mesh.visible = false; f.leaf.active = false; }
        this.flights = []; this.shadows.forEach(s => s.visible = false);
        this.spread = jump.target; this.fraction = jump.fractionTo; this.jump = null;
        this.phase = 'rest'; this.interactive = true; this.applyBlocks(); this.showPages();
        if (this.queue.length) { const next = this.queue.shift(); this.goToSpread(next); return; }
        this.showOverlay();
    }

    // ---- frame -----------------------------------------------------------------------------------------------------------------

    /** Advances the book by `dt` seconds; returns the amount of motion left (0 when still). */
    update(dt) {
        const ms = dt * 1000, instant = this.stage.motion.travel === false;
        switch (this.phase) {
            case 'opening': case 'waiting': return this.updateOpening(ms, instant);
            case 'riffle': return this.updateRiffle(ms);
            case 'settle': this.t += ms; if (this.t >= READ.settleMs || instant) { this.phase = 'rest'; this.interactive = true; this.showOverlay(); this.stage.callbacks.onReadingSettled?.(this.id, this.spread); return 0; } return 1;
            case 'turning': case 'riffle2': return this.updateJump(ms);
            case 'closing': return this.updateClosing(ms);
            default: return 0;
        }
    }

    updateOpening(ms, instant) {
        this.t += instant ? 1e6 : ms;
        const t = this.t;
        const forward = smooth(0, READ.forwardMs, t), cover = smooth(READ.coverStartMs, READ.coverStartMs + READ.coverMs, t), lay = smooth(READ.layStartMs, READ.layStartMs + READ.layMs, t);
        this.cover = cover; this.slide = cover; this.tilt = 1 - lay;
        const closed = this.restPose(0, 1), open = this.restPose(1, 0), mix = this.restPose(cover, 1 - lay);
        // Forward: from the shelf pose to the centred closed pose; then the slide to the open pose follows the cover.
        const base = { x: lerp(this.fromPose.x, closed.x, forward), y: lerp(this.fromPose.y, closed.y, forward), z: lerp(this.fromPose.z, closed.z, forward),
            rx: lerp(this.fromPose.rx, closed.rx, forward), ry: lerp(this.fromPose.ry, closed.ry, forward), rz: 0 };
        this.pose = { x: lerp(base.x, open.x, cover), y: lerp(base.y, open.y, cover), z: lerp(base.z, open.z, cover), rx: lerp(base.rx, mix.rx, cover) * (1 - 0) , ry: lerp(base.ry, 0, cover), rz: 0 };
        this.pose.rx = lerp(base.rx, open.rx, lay);
        this.applyPose(); this.applyBlocks();
        const arrived = t >= READ.layStartMs + READ.layMs;
        if (arrived) { this.showPages(); if (this.phase === 'opening') this.phase = 'waiting'; }
        if (arrived && this.ready) { this.beginRiffle(); return 1; }
        return arrived && !this.ready ? 0.001 : 1;
    }

    beginRiffle() {
        const target = this.targetSpread;
        this.hideOverlay();
        if (target === 0 || this.stage.motion.travel === false) { this.spread = target; this.fraction = readFraction(target, this.total); this.applyBlocks(); this.showPages(); this.phase = 'settle'; this.t = 0; return; }
        const count = riffleCount(target * 2);
        const toPages = pagesOfSpread(target, this.total);
        this.flights = []; this.leaves.forEach(l => { l.active = false; });
        for (let i = 0; i < count; i++) {
            const leaf = this.leaves.find(l => !l.active); if (!leaf) break;
            leaf.active = true;
            const last = i === count - 1;
            const flight = { leaf, start: i * READ.riffleStepMs, duration: READ.riffleFlightMs, forward: true, frontIndex: last ? pagesOfSpread(target - 1, this.total).right : null, backIndex: last ? toPages.left : null, done: false };
            flight.apply = () => { setImage(leaf.material, 'front', this.image(flight.frontIndex)); setImage(leaf.material, 'back', this.image(flight.backIndex)); };
            flight.apply(); leaf.mesh.visible = true; leaf.setProgress(0); this.flights.push(flight);
        }
        // The right page of the destination is revealed as the leaves go; the left pile grows to its final thickness.
        setImage(this.rightMaterial, 'front', this.image(toPages.right)); this.rightPage.visible = toPages.right != null;
        this.leftPage.visible = false;
        this.pageTextures.prefetch([toPages.left, toPages.right].filter(i => i != null), this.renderHeight());
        this.riffleStart = { fraction: 0, target: readFraction(target, this.total) };
        this.phase = 'riffle'; this.t = 0;
    }

    updateRiffle(ms) {
        this.t += ms;
        const total = this.flights.length ? this.flights.at(-1).start + READ.riffleFlightMs : 0;
        this.advanceFlights(this.t);
        this.fraction = lerp(this.riffleStart.fraction, this.riffleStart.target, smooth(0, total, this.t));
        this.applyBlocks();
        if (this.t >= total) {
            for (const f of this.flights) { f.leaf.mesh.visible = false; f.leaf.active = false; }
            this.flights = []; this.shadows.forEach(s => s.visible = false);
            this.spread = this.targetSpread; this.fraction = this.riffleStart.target; this.applyBlocks();
            this.phase = 'settle'; this.t = 0; this.showPages();
        }
        return 1;
    }

    updateJump(ms) {
        const jump = this.jump; jump.elapsed += ms;
        const total = this.flights.length ? this.flights.at(-1).start + this.flights.at(-1).duration : 0;
        this.advanceFlights(jump.elapsed);
        this.fraction = lerp(jump.fractionFrom, jump.fractionTo, smooth(0, total, jump.elapsed));
        this.applyBlocks();
        if (jump.elapsed >= total) this.finishJump();
        return 1;
    }

    /** Poses every flying leaf for the elapsed time, and the soft shadow it casts on the page beneath. */
    advanceFlights(elapsed) {
        const { PW } = READ;
        this.shadows.forEach(s => s.visible = false);
        let shadowIndex = 0;
        for (const f of this.flights) {
            const raw = Math.min(1, Math.max(0, (elapsed - f.start) / f.duration)), eased = easeTurn(raw), u = f.forward ? eased : 1 - eased;
            f.leaf.setProgress(u);
            // Lift the leaf slightly so stacked leaves in flight do not fight in depth.
            f.leaf.mesh.position.z = 0.02 + 0.004 * this.flights.indexOf(f);
            const { fold, radius } = turnShape(u, PW);
            const lift = Math.sin(Math.PI * u);
            if (raw > 0 && raw < 1 && shadowIndex < this.shadows.length && lift > 0.05) {
                const onRight = u < 0.5, shadow = this.shadows[shadowIndex++];
                const reach = Math.max(1, radius * 1.8 + 2);
                shadow.visible = true; shadow.scale.x = reach;
                shadow.material.opacity = Math.min(0.9, lift * 0.9);
                // The strip hugs the fold on the page beneath the lifted leaf (gradient fades away from the fold).
                if (onRight) { shadow.position.x = fold + reach / 2 + radius * 0.4; shadow.rotation.y = 0; shadow.scale.x = reach; shadow.position.x = Math.min(PW - reach / 2, shadow.position.x); }
                else { shadow.position.x = -(PW - fold) * 0.5 - reach / 2 + radius; shadow.scale.x = -reach; }
            }
        }
    }

    // ---- closing ------------------------------------------------------------------------------------------------------------------

    /** Closing runs the opening backwards without the riffle: the cover shuts, the pages collapse and the book returns to its slot. */
    close(toPose, done) {
        this.hideOverlay(); this.interactive = false;
        this.flights.forEach(f => { f.leaf.mesh.visible = false; f.leaf.active = false; }); this.flights = []; this.shadows.forEach(s => s.visible = false);
        this.phase = 'closing'; this.t = 0; this.closeFrom = { ...this.pose, fraction: this.fraction }; this.closeTo = toPose; this.done = done;
        this.leftPage.visible = false; this.rightPage.visible = false;
    }

    updateClosing(ms) {
        this.t += this.stage.motion.travel === false ? 1e6 : ms;
        const total = READ.coverMs + READ.coverStartMs + READ.forwardMs;
        const cover = 1 - smooth(0, READ.coverMs, this.t), back = smooth(READ.coverMs - 100, total, this.t);
        this.cover = cover; this.fraction = this.closeFrom.fraction * cover; this.slide = cover;
        const closed = this.restPose(0, 1);
        const mid = { x: lerp(closed.x, 0, cover), y: lerp(this.closeFrom.y, closed.y, 1), z: closed.z, rx: lerp(closed.rx, 0, cover), ry: 0, rz: 0 };
        const to = this.closeTo ?? this.fromPose;
        this.pose = { x: lerp(mid.x, to.x, back), y: lerp(mid.y, to.y, back), z: lerp(mid.z, to.z, back), rx: lerp(mid.rx, to.rx, back), ry: lerp(mid.ry, to.ry, back), rz: 0 };
        this.applyPose(); this.applyBlocks();
        if (this.t >= total) { this.done?.(); this.done = null; return 0; }
        return 1;
    }

    // ---- overlay (the reader engine's text layer sits over the two pages) -------------------------------------------------

    /** The two pages' on-screen rectangles in viewport CSS pixels, fitted to each page's shape. */
    measure() {
        const pages = pagesOfSpread(this.spread, this.total), viewport = this.stage.viewportSize();
        const project = (x, y) => { const v = this.group.localToWorld(new THREE.Vector3(x, y, 0)).project(this.stage.camera); return [viewport.left + (v.x + 1) / 2 * viewport.width, viewport.top + (1 - v.y) / 2 * viewport.height]; };
        const plane = x0 => { const a = project(x0, READ.PH / 2), b = project(x0 + READ.PW, -READ.PH / 2); return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]) }; };
        const fit = (rect, index) => {
            const aspect = window.folioReader?.pageAspect?.(index) ?? READ.PW / READ.PH, [sx, sy] = fitFor(aspect, READ.PW / READ.PH);
            return { x: rect.x + rect.width * (1 - sx) / 2, y: rect.y + rect.height * (1 - sy) / 2, width: rect.width * sx, height: rect.height * sy };
        };
        const left = pages.left != null ? { index: pages.left, rect: fit(plane(-READ.PW), pages.left) } : null;
        const right = pages.right != null ? { index: pages.right, rect: fit(plane(0), pages.right) } : null;
        return { left, right };
    }

    showOverlay() { window.dispatchEvent(new CustomEvent('folio-spread', { detail: { ...this.measure(), visible: true } })); this.overlay = true; }
    hideOverlay() { if (this.overlay === false) return; window.dispatchEvent(new CustomEvent('folio-spread', { detail: { ...this.measure(), visible: false } })); this.overlay = false; }
    removeOverlay() { window.dispatchEvent(new CustomEvent('folio-spread', { detail: { off: true } })); this.overlay = false; }

    // ---- teardown ------------------------------------------------------------------------------------------------------------------

    dispose() {
        this.removeOverlay();
        this.stage.world.remove(this.group);
        this.group.traverse(o => { o.geometry?.dispose?.(); });
        this.leaves.forEach(l => l.dispose());
        this.endpaperMaterial?.dispose(); this.endpaperTexture?.dispose(); this.hiddenTop?.dispose();
        this.leftMaterial.dispose(); this.rightMaterial.dispose(); this.shadows.forEach(s => s.material.dispose()); this.shadowMap?.dispose();
        this.pageTextures.dispose();
    }
}
