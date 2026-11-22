// The wooden bookcase (WP3): one tall piece of furniture. Each shelf is a plank row; uprights stand every 96 cm; a back
// panel sits 14 cm behind the books; a brass plate on every bay's plank carries the shelf name. Textured oak (grain
// along planks, vertical on uprights) tiled in world units — one tile per 60 cm — with a random offset and the odd flip
// per board so the grain never visibly repeats. Everything shares three 1K maps, so wood adds no per-book cost.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { rowY } from './scenes.js';

export const CASE = {
    plank: 2.2, depth: 24, bevel: 0.3, bay: 96, tile: 60, margin: 12,
    plankZ: -1, backZ: -13.6, spacing: 34, floorToTop: 10, minWidth: 288,
};
const WALNUT = [0.49, 0.43, 0.47];   // multiplies oak toward #5A3E2B in the dark theme

/** Loads the shared oak maps; resolves to null maps if they cannot be loaded (plain colour is used instead). */
export function loadWoodTextures(anisotropy = 4) {
    const base = new URL('_content/Folio.UI/assets/wood/', document.baseURI).href;
    const loader = new THREE.TextureLoader();
    const load = (name, srgb) => new Promise(resolve => loader.load(base + name, texture => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = anisotropy;
        if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
        resolve(texture);
    }, undefined, () => resolve(null)));
    return Promise.all([load('oak-color.png', true), load('oak-normal.png', false), load('oak-roughness.png', false)])
        .then(([map, normalMap, roughnessMap]) => ({ map, normalMap, roughnessMap }));
}

/** Deterministic pseudo-random in [0, 1) so a rebuilt case keeps the same grain per board. */
const rand = (a, b = 0) => { let h = (a * 374761393 + b * 668265263 + 1013904223) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/**
 * Re-maps a geometry's UVs to world units (60 cm per tile) so a long plank does not stretch one tile. `grain` is the axis the
 * wood grain runs along ('x' for planks, 'y' for uprights); each face picks the projection that keeps the grain along it.
 */
export function mapWorldUVs(geometry, { tile = CASE.tile, grain = 'x', offset = [0, 0], flip = false } = {}) {
    const pos = geometry.attributes.position, nor = geometry.attributes.normal, uv = geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
        let u, v;
        if (grain === 'x') { [u, v] = ay >= ax && ay >= az ? [x, z] : az >= ax ? [x, y] : [z, y]; }
        else { [u, v] = ay >= ax && ay >= az ? [z, x] : az >= ax ? [y, x] : [y, z]; }
        u = u / tile + offset[0]; v = v / tile + offset[1];
        uv.setXY(i, flip ? -u : u, v);
    }
    uv.needsUpdate = true;
    return geometry;
}

function plateTexture(name) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 64;
    const g = canvas.getContext('2d');
    g.fillStyle = '#C9A24E'; g.fillRect(0, 0, 512, 64);
    const grad = g.createLinearGradient(0, 0, 0, 64); grad.addColorStop(0, 'rgba(255,255,255,.35)'); grad.addColorStop(0.5, 'rgba(255,255,255,0)'); grad.addColorStop(1, 'rgba(0,0,0,.25)');
    g.fillStyle = grad; g.fillRect(0, 0, 512, 64);
    g.strokeStyle = 'rgba(60,40,10,.55)'; g.lineWidth = 3; g.strokeRect(2, 2, 508, 60);
    g.fillStyle = '#2B1D08'; g.textBaseline = 'middle'; g.textAlign = 'center';
    let size = 30, text = name.toUpperCase();
    do { g.font = `500 ${size}px "JetBrains Mono", ui-monospace, monospace`; size -= 2; } while (g.measureText(text).width > 470 && size > 12);
    while (g.measureText(text).width > 470 && text.length > 3) text = text.slice(0, -2) + '…';
    g.fillText(text, 256, 34);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    return texture;
}

let gradientTexture = null;
/** Soft shadow under a plank, falling onto the back panel: dark at the top, clear at the bottom (baked, no light cost). */
function shadowStrip() {
    if (gradientTexture) return gradientTexture;
    const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 64;
    const g = canvas.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 64); grad.addColorStop(0, 'rgba(0,0,0,.6)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 4, 64);
    gradientTexture = new THREE.CanvasTexture(canvas);
    return gradientTexture;
}

export class Bookcase {
    constructor(world, anisotropy = 4) {
        this.world = world;
        this.group = new THREE.Group(); this.group.name = 'bookcase';
        world.add(this.group);
        this.theme = 'dark';
        this.maps = { map: null, normalMap: null, roughnessMap: null };
        this.wood = new THREE.MeshStandardMaterial({ color: 0x8a6a50, roughness: 0.75, metalness: 0 });
        this.back = new THREE.MeshStandardMaterial({ color: 0x4a382c, roughness: 0.95, metalness: 0 });
        this.brass = new THREE.MeshPhysicalMaterial({ color: 0xC9A24E, roughness: 0.28, metalness: 0.85 });
        this.shadow = new THREE.MeshBasicMaterial({ map: shadowStrip(), transparent: true, depthWrite: false, opacity: 0.85 });
        this.parts = [];                  // geometries and label materials to dispose on rebuild
        this.width = 0; this.left = 0; this.rowCount = 0;
        this.ready = loadWoodTextures(anisotropy).then(maps => {
            this.maps = maps;
            for (const material of [this.wood, this.back]) { Object.assign(material, maps); material.needsUpdate = true; }
            this.setTheme(this.theme);
            this.onTextures?.();
        });
        this.setTheme('dark');
    }

    /** Dark theme multiplies oak toward walnut; the light theme keeps oak. The back panel is about 35% darker and rougher. */
    setTheme(theme) {
        this.theme = theme;
        const tint = theme === 'light' ? [1, 1, 1] : WALNUT;
        const textured = !!this.maps.map;
        this.wood.color.setRGB(...(textured ? tint : theme === 'light' ? [0.72, 0.56, 0.36] : [0.35, 0.24, 0.17]));
        this.back.color.setRGB(...(textured ? tint : [0.5, 0.4, 0.3]).map(c => c * 0.65));
    }

    /** x range the case covers, and its row count: the camera and the books use the same coordinates. */
    get extent() { return { left: this.left, right: this.left + this.width }; }

    rebuild(rows) {
        this.clear();
        const widest = Math.max(0, ...rows.map(r => r.layout.width));
        // A short row still sits in a case wider than the view, centred on its books, so the case never reads as a small frame.
        this.width = Math.max(CASE.minWidth, widest + CASE.margin * 2);
        this.left = widest + CASE.margin * 2 >= CASE.minWidth ? -CASE.margin : widest / 2 - this.width / 2;
        this.rowCount = rows.length;
        const x0 = this.left, x1 = x0 + this.width, center = (x0 + x1) / 2;
        const rowCount = rows.length;
        const topPlankY = rowY(0) + CASE.spacing - CASE.floorToTop - CASE.plank / 2;     // the crown above the first row
        const bottomPlankY = rowY(rowCount - 1) - CASE.floorToTop - CASE.plank / 2;
        let seed = 1;

        // Planks: one under each row, plus the crown above the first.
        for (let r = -1; r < rowCount; r++) {
            const y = r < 0 ? topPlankY : rowY(r) - CASE.floorToTop - CASE.plank / 2;
            const geometry = new RoundedBoxGeometry(this.width, CASE.plank, CASE.depth, 2, CASE.bevel);
            mapWorldUVs(geometry, { grain: 'x', offset: [rand(seed, 1) * 4, rand(seed, 2) * 4], flip: rand(seed, 3) > 0.7 });
            const mesh = new THREE.Mesh(geometry, this.wood);
            mesh.position.set(center, y, CASE.plankZ);
            mesh.userData.plank = true;
            this.add(mesh, geometry); seed++;
        }

        // Uprights every bay, plus the end caps (first and last).
        const bays = Math.max(1, Math.ceil(this.width / CASE.bay));
        const height = topPlankY - bottomPlankY + CASE.plank;
        const midY = (topPlankY + bottomPlankY) / 2;
        for (let b = 0; b <= bays; b++) {
            const x = b === bays ? x1 : x0 + b * CASE.bay;
            const geometry = new RoundedBoxGeometry(CASE.plank, height, CASE.depth, 2, CASE.bevel);
            mapWorldUVs(geometry, { grain: 'y', offset: [rand(seed, 4) * 4, rand(seed, 5) * 4], flip: rand(seed, 6) > 0.7 });
            const mesh = new THREE.Mesh(geometry, this.wood);
            mesh.position.set(x, midY, CASE.plankZ);
            this.add(mesh, geometry); seed++;
        }

        // Back panels (one per row, continuous grain) with a baked soft shadow strip under each plank above.
        for (let r = 0; r < rowCount; r++) {
            const top = rowY(r) + CASE.spacing - CASE.floorToTop - CASE.plank, bottom = rowY(r) - CASE.floorToTop;
            const geometry = new THREE.PlaneGeometry(this.width, top - bottom);
            mapWorldUVs(geometry, { grain: 'x', offset: [rand(seed, 7) * 4, rand(seed, 8) * 4] });
            const mesh = new THREE.Mesh(geometry, this.back);
            mesh.position.set(center, (top + bottom) / 2, CASE.backZ);
            this.add(mesh, geometry);
            const strip = new THREE.PlaneGeometry(this.width, 9);
            const shade = new THREE.Mesh(strip, this.shadow);
            shade.position.set(center, top - 4.5, CASE.backZ + 0.05); shade.renderOrder = -1;
            this.add(shade, strip); seed++;
        }

        // Brass shelf plates on each bay's plank front; the text is the shelf name in JetBrains Mono.
        rows.forEach((row, r) => {
            const texture = plateTexture(row.name || '');
            const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.3, metalness: 0.7 });
            const geometry = new THREE.PlaneGeometry(20, 2.5);
            const plates = new THREE.InstancedMesh(geometry, material, bays);
            const matrix = new THREE.Matrix4();
            for (let b = 0; b < bays; b++) { matrix.setPosition(x0 + b * CASE.bay + 17, rowY(r) - CASE.floorToTop - CASE.plank / 2, CASE.plankZ + CASE.depth / 2 + 0.02); plates.setMatrixAt(b, matrix); }
            plates.instanceMatrix.needsUpdate = true; plates.frustumCulled = false;
            this.add(plates, geometry, material, texture);
        });
    }

    add(object, ...disposables) { this.group.add(object); this.parts.push(...disposables); }

    clear() {
        for (const child of [...this.group.children]) this.group.remove(child);
        for (const part of this.parts) part.dispose?.();
        this.parts = [];
    }

    dispose() {
        this.clear(); this.world.remove(this.group);
        this.wood.dispose(); this.back.dispose(); this.brass.dispose(); this.shadow.dispose();
        for (const texture of Object.values(this.maps)) texture?.dispose();
    }
}
