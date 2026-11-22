// The page curl (WP6): a page rolls round a cylinder whose axis runs along the page (the cylinder method). A point at distance
// s beyond the fold line wraps round a radius R: it rises along the arc for half a turn, then lies flat again on the other side
// at height 2R. Moving the fold from the outer edge to the spine while R swells and shrinks turns the page over. The same maths
// runs in the vertex shader and in `curlPoint` below, which the unit tests check (flat when unfolded, mirrored when finished).
import * as THREE from 'three';

/** Position and surface normal of a page point at x, with the fold at `fold` and cylinder radius `radius`. */
/**
 * How an open page bows: it dips into the gutter, rises over its inner third and settles flat at the outer edge, like a real
 * spread. `d` is the distance from the spine in cm, `width` the page width. The vertex shader uses the same curve.
 */
export const BOW = { gutterDip: 0.6, gutterFalloff: 1.2, rise: 0.4 };
export function pageBow(d, width) {
    const t = Math.min(1, Math.max(0, d / width));
    return -BOW.gutterDip * Math.exp(-d / BOW.gutterFalloff) + BOW.rise * Math.sin(Math.PI * t);
}

export function curlPoint(x, fold, radius) {
    const s = x - fold;
    if (s <= 0) return { x, z: 0, nx: 0, nz: 1, theta: 0 };
    if (radius < 1e-4 || s >= Math.PI * radius) return { x: fold - (s - Math.PI * radius), z: 2 * radius, nx: 0, nz: -1, theta: Math.PI };
    const theta = s / radius;
    return { x: fold + radius * Math.sin(theta), z: radius * (1 - Math.cos(theta)), nx: -Math.sin(theta), nz: Math.cos(theta), theta };
}

/** Fold position and cylinder radius for a turn that is `u` (0–1) of the way over a page of width `width`. */
export function turnShape(u, width) {
    const t = Math.min(1, Math.max(0, u));
    return { fold: width * (1 - t), radius: 0.19 * width * Math.sin(Math.PI * t) };
}

/** Smooth ease for the flight of one page (quick lift, soft landing). */
export const easeTurn = t => t * t * (3 - 2 * t);

const VERTEX = /* glsl */`
uniform float uFold;
uniform float uRadius;
uniform float uGutter;
uniform float uWidth;
varying vec2 vUv;
varying vec3 vNormal;
varying float vShade;
const float PI = 3.14159265358979;
void main() {
    vUv = uv;
    vec3 p = position;
    vec3 n = vec3(0.0, 0.0, 1.0);
    float theta = 0.0;
    float s = p.x - uFold;
    bool lying = true;
    if (s > 0.0) {
        if (uRadius < 0.0001 || s >= PI * uRadius) { p.x = uFold - (s - PI * uRadius); p.z = 2.0 * uRadius; n = vec3(0.0, 0.0, -1.0); theta = PI; }
        else { theta = s / uRadius; p.x = uFold + uRadius * sin(theta); p.z = uRadius * (1.0 - cos(theta)); n = vec3(-sin(theta), 0.0, cos(theta)); lying = false; }
    }
    // Lying pages bow like a real spread: into the gutter, up over the inner third, flat at the outer edge (pageBow in JS).
    float d = abs(p.x);
    float g = exp(-d / 1.2);
    if (lying && uGutter > 0.0) {
        float bow = -0.6 * g + 0.4 * sin(PI * clamp(d / uWidth, 0.0, 1.0));
        float slope = 0.6 / 1.2 * g + 0.4 * PI / uWidth * cos(PI * clamp(d / uWidth, 0.0, 1.0));
        p.z += uGutter * bow;
        vec3 bent = normalize(vec3(-sign(p.x) * slope * uGutter, 0.0, 1.0));
        n = n.z < 0.0 ? -bent : bent;
    }
    vShade = 1.0 - uGutter * 0.22 * exp(-pow(d / 1.4, 2.0));
    vNormal = normalize(normalMatrix * n);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAGMENT = /* glsl */`
uniform sampler2D uFront;
uniform sampler2D uBack;
uniform vec3 uPaper;
uniform vec4 uFrontFit;   // scale.xy, offset.xy: maps the page's uv onto the texture, letterboxing pages that are not 2:3
uniform vec4 uBackFit;
uniform float uHasFront;
uniform float uHasBack;
uniform float uFade;
varying vec2 vUv;
varying vec3 vNormal;
varying float vShade;
vec3 sampleFit(sampler2D tex, vec4 fit, vec2 uv, float has) {
    if (has < 0.5) return uPaper;
    vec2 t = (uv - 0.5) / fit.xy + 0.5 + fit.zw;
    if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0) return uPaper;
    return texture2D(tex, t).rgb;
}
void main() {
    bool front = gl_FrontFacing;
    // The back of a leaf is seen from behind, so its image is mirrored in u.
    vec3 color = front ? sampleFit(uFront, uFrontFit, vUv, uHasFront) : sampleFit(uBack, uBackFit, vec2(1.0 - vUv.x, vUv.y), uHasBack);
    vec3 n = normalize(vNormal);
    if (!front) n = -n;
    // White paper: a page facing the light stays white; the bow and a curling page pick up soft shading.
    float light = 0.72 + 0.28 * clamp(dot(n, normalize(vec3(0.15, 0.55, 0.82))) + 0.12, 0.0, 1.0);
    gl_FragColor = vec4(color * light * vShade * uFade, 1.0);
    #include <colorspace_fragment>
}`;

const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
blank.needsUpdate = true;

/** One leaf (or static page): a shader material with front and back images. */
export function createPageMaterial() {
    return new THREE.ShaderMaterial({
        vertexShader: VERTEX, fragmentShader: FRAGMENT, side: THREE.DoubleSide, toneMapped: false,
        uniforms: {
            uFold: { value: 1e6 }, uRadius: { value: 0 }, uGutter: { value: 0 }, uWidth: { value: 13.6 },
            uFront: { value: blank }, uBack: { value: blank }, uHasFront: { value: 0 }, uHasBack: { value: 0 },
            uFrontFit: { value: new THREE.Vector4(1, 1, 0, 0) }, uBackFit: { value: new THREE.Vector4(1, 1, 0, 0) },
            uPaper: { value: new THREE.Color(0xFFFFFF) }, uFade: { value: 1 },
        },
    });
}

/** How a page image of `aspect` (w / h) sits in a plane of `planeAspect`: scale < 1 on the axis it letterboxes. */
export function fitFor(aspect, planeAspect) {
    if (!(aspect > 0)) return [1, 1];
    return aspect > planeAspect ? [1, planeAspect / aspect] : [aspect / planeAspect, 1];
}

export function setImage(material, side, image) {
    const u = material.uniforms, key = side === 'front' ? 'uFront' : 'uBack', has = side === 'front' ? 'uHasFront' : 'uHasBack', fit = side === 'front' ? 'uFrontFit' : 'uBackFit';
    if (!image) { u[has].value = 0; u[key].value = blank; return; }
    u[key].value = image.texture; u[has].value = 1;
    const [sx, sy] = fitFor(image.aspect, image.planeAspect);
    u[fit].value.set(sx, sy, 0, 0);
}

export class CurlPage {
    constructor(width, height) {
        this.width = width; this.height = height;
        this.geometry = new THREE.PlaneGeometry(width, height, 48, 8);
        this.geometry.translate(width / 2, 0, 0);          // x runs from the spine (0) to the outer edge (width)
        this.material = createPageMaterial();
        this.material.uniforms.uGutter.value = 1;        // a leaf lies on the bowed pages, so it bows with them while flat
        this.material.uniforms.uWidth.value = width;
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.frustumCulled = false; this.mesh.visible = false;
        this.u = 0; this.active = false;
    }
    /** Poses the leaf `u` of the way over (0 = flat on the right, 1 = flat on the left). */
    setProgress(u) {
        this.u = u;
        const { fold, radius } = turnShape(u, this.width);
        this.material.uniforms.uFold.value = fold; this.material.uniforms.uRadius.value = radius;
    }
    dispose() { this.geometry.dispose(); this.material.dispose(); }
}
