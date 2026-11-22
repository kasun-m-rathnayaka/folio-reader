// The base the books stand on (WP3): one dark, charred-wood plank under every row, and nothing else — no back panel, uprights,
// crown or side frames. Soft spotlights hang in the dark above each row and fall onto its plank (a faint cone of light and a pool
// on the wood), like a gallery floor. Wood is tiled in world units (one tile per 60 cm) with a random offset and the odd flip per
// plank so the grain never visibly repeats; the three 1K maps are shared by every plank.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { rowY } from './scenes.js';

export const CASE = {
    plank: 2.2, depth: 24, bevel: 0.3, tile: 60, margin: 14, minWidth: 288,
    plankZ: -1, spacing: 34, floorToTop: 10,
    lampPeriod: 72, coneZ: -15,
};

/** Loads the shared wood maps; resolves to null maps if they cannot be loaded (plain dark colour is used instead). */
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

/** Deterministic pseudo-random in [0, 1) so a rebuilt row keeps the same grain. */
const rand = (a, b = 0) => { let h = (a * 374761393 + b * 668265263 + 1013904223) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/**
 * Re-maps a geometry's UVs to world units (60 cm per tile) so a long plank does not stretch one tile. `grain` is the axis the
 * wood grain runs along; each face picks the projection that keeps the grain along it.
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

const LIGHT_VERTEX = /* glsl */`
varying vec3 vWorld;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

/** A faint cone of light under each lamp: narrow at the top (just under the plank above), widening and fading downwards. */
const CONE_FRAGMENT = /* glsl */`
uniform float uPeriod; uniform float uTop; uniform float uBottom; uniform float uIntensity; uniform vec3 uColor;
varying vec3 vWorld;
void main() {
    float lamp = (floor(vWorld.x / uPeriod) + 0.5) * uPeriod;
    float t = clamp((uTop - vWorld.y) / (uTop - uBottom), 0.0, 1.0);          // 0 at the lamp, 1 at the plank
    float spread = 2.5 + 16.0 * t;
    float dx = (vWorld.x - lamp) / spread;
    float beam = exp(-2.2 * dx * dx) * (0.18 + 0.82 * pow(1.0 - t, 1.3)) * smoothstep(0.0, 0.3, t);
    gl_FragColor = vec4(uColor, beam * uIntensity);
}`;

/** The pool of light a lamp leaves on the wood (an ellipse on the plank's top face). */
const POOL_FRAGMENT = /* glsl */`
uniform float uPeriod; uniform float uIntensity; uniform vec3 uColor;
varying vec3 vWorld;
void main() {
    float lamp = (floor(vWorld.x / uPeriod) + 0.5) * uPeriod;
    float dx = (vWorld.x - lamp) / 15.0, dz = (vWorld.z + 1.0) / 8.0;
    gl_FragColor = vec4(uColor, exp(-(dx * dx + dz * dz) * 1.6) * uIntensity);
}`;

function lightMaterial(fragment, uniforms) {
    return new THREE.ShaderMaterial({ vertexShader: LIGHT_VERTEX, fragmentShader: fragment, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
}

export class Bookcase {
    constructor(world, anisotropy = 4) {
        this.world = world;
        this.group = new THREE.Group(); this.group.name = 'bookcase';
        world.add(this.group);
        this.theme = 'dark';
        this.maps = { map: null, normalMap: null, roughnessMap: null };
        this.wood = new THREE.MeshStandardMaterial({ color: 0x24201c, roughness: 0.6, metalness: 0.1, normalScale: new THREE.Vector2(1.3, 1.3) });
        this.parts = [];
        this.lights = { cone: { uPeriod: { value: CASE.lampPeriod }, uTop: { value: 0 }, uBottom: { value: 0 }, uIntensity: { value: 0.2 }, uColor: { value: new THREE.Color(0xfff1dc) } },
            pool: { uPeriod: { value: CASE.lampPeriod }, uIntensity: { value: 0.3 }, uColor: { value: new THREE.Color(0xffe9c8) } } };
        this.coneMaterial = lightMaterial(CONE_FRAGMENT, this.lights.cone);
        this.poolMaterial = lightMaterial(POOL_FRAGMENT, this.lights.pool);
        this.width = 0; this.left = 0; this.rowCount = 0;
        this.ready = loadWoodTextures(anisotropy).then(maps => {
            this.maps = maps;
            Object.assign(this.wood, maps); this.wood.color.setRGB(1, 1, 1); this.wood.needsUpdate = true;
            this.onTextures?.();
        });
        this.setTheme('dark');
    }

    /** The wood is the same in both themes; the lights are softer on a light page, where they would only wash it out. */
    setTheme(theme) {
        this.theme = theme;
        const k = theme === 'light' ? 0.35 : 1;
        this.lights.cone.uIntensity.value = 0.5 * k; this.lights.pool.uIntensity.value = 0.55 * k;
    }

    get extent() { return { left: this.left, right: this.left + this.width }; }

    rebuild(rows) {
        this.clear();
        this.rowCount = rows.length;
        const widest = Math.max(0, ...rows.map(r => r.layout.width));
        this.width = Math.max(CASE.minWidth, widest + CASE.margin * 2);
        this.left = widest + CASE.margin * 2 >= CASE.minWidth ? -CASE.margin : widest / 2 - this.width / 2;
        const center = this.left + this.width / 2;
        rows.forEach((row, r) => {
            const y = rowY(r) - CASE.floorToTop - CASE.plank / 2;
            const geometry = new RoundedBoxGeometry(this.width, CASE.plank, CASE.depth, 2, CASE.bevel);
            mapWorldUVs(geometry, { grain: 'x', offset: [rand(r + 1, 1) * 4, rand(r + 1, 2) * 4], flip: rand(r + 1, 3) > 0.7 });
            const plank = new THREE.Mesh(geometry, this.wood);
            plank.position.set(center, y, CASE.plankZ);
            plank.userData.plank = true;
            this.add(plank, geometry);
            // Lamps: a cone of light behind the books, from just under the plank above down to this row's plank, and its pool on the wood.
            const top = y + CASE.spacing - CASE.plank, bottom = y + CASE.plank / 2;
            const coneGeometry = new THREE.PlaneGeometry(this.width, top - bottom);
            const cone = new THREE.Mesh(coneGeometry, this.coneMaterial);
            cone.position.set(center, (top + bottom) / 2, CASE.coneZ); cone.renderOrder = -2; cone.userData.light = 'cone';
            const poolGeometry = new THREE.PlaneGeometry(this.width, CASE.depth - 2);
            const pool = new THREE.Mesh(poolGeometry, this.poolMaterial);
            pool.rotation.x = -Math.PI / 2; pool.position.set(center, bottom + 0.02, CASE.plankZ); pool.renderOrder = -1; pool.userData.light = 'pool';
            this.add(cone, coneGeometry); this.add(pool, poolGeometry);
            cone.userData.top = top; cone.userData.bottom = bottom;
        });
        // Every row has its own height range; the cone shader reads the shared range of the last row (rows are equally spaced).
        const last = rows.length - 1, topY = rowY(last) - CASE.floorToTop - CASE.plank / 2;
        this.lights.cone.uTop.value = topY + CASE.spacing - CASE.plank; this.lights.cone.uBottom.value = topY + CASE.plank / 2;
        this.layoutLights(rows);
    }

    /** The cone's top and bottom are per row: write them into one material per row so every row's lamps sit under its own plank above. */
    layoutLights(rows) {
        const cones = this.group.children.filter(c => c.userData.light === 'cone');
        cones.forEach((cone, r) => {
            const material = this.coneMaterial.clone();
            material.uniforms = { ...this.lights.cone, uTop: { value: cone.userData.top }, uBottom: { value: cone.userData.bottom } };
            cone.material = material; this.parts.push(material);
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
        this.wood.dispose(); this.coneMaterial.dispose(); this.poolMaterial.dispose();
        for (const texture of Object.values(this.maps)) texture?.dispose();
    }
}
