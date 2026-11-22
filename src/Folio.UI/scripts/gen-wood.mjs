// Generates the bookcase base's wood textures (WP3): 1024 × 1024 seamless colour, normal and roughness maps of dark charred wood.
// Procedural and deterministic: grain from periodic fractal noise, so there is nothing to license or download. They are
// drop-in replaceable by photographed CC0 sets (Poly Haven, ambientCG) under the same file names.
// Usage: node scripts/gen-wood.mjs   (writes wwwroot/assets/wood/oak-{color,normal,roughness}.png)
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 1024;
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../wwwroot/assets/wood');
mkdirSync(out, { recursive: true });

// Deterministic hash and periodic value noise (period px, py lattice cells) so maps tile in both directions.
const hash = (x, y, seed) => { let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const smooth = t => t * t * (3 - 2 * t);
function pnoise(x, y, px, py, seed) {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
    const w = (i, p) => ((i % p) + p) % p;
    const a = hash(w(x0, px), w(y0, py), seed), b = hash(w(x0 + 1, px), w(y0, py), seed);
    const c = hash(w(x0, px), w(y0 + 1, py), seed), d = hash(w(x0 + 1, px), w(y0 + 1, py), seed);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(u, v, px, py, seed, octaves = 5) {
    let sum = 0, amp = 0.5, total = 0;
    for (let o = 0; o < octaves; o++) { sum += amp * pnoise(u * 2 ** o, v * 2 ** o, px * 2 ** o, py * 2 ** o, seed + o); total += amp; amp /= 2; }
    return sum / total;
}

// Dark, charred wood (shou sugi ban): hundreds of fine ridges that flow like contour lines and part around knots, near-black with
// warm brass glints on the ridge tops. Ridges run along x; every term is periodic, so the maps tile.
const LINES = 84;
const knots = [[0.27, 0.34, 0.12, 1.15], [0.74, 0.77, 0.1, 0.9], [0.55, 0.12, 0.08, 0.7], [0.08, 0.7, 0.07, 0.6]];   // u, v, radius, strength
const wrap = d => d - Math.round(d);
const height = new Float32Array(SIZE * SIZE), ridge = new Float32Array(SIZE * SIZE), glint = new Float32Array(SIZE * SIZE), pores = new Float32Array(SIZE * SIZE);
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE, v = y / SIZE;
    // Gentle wander plus the ridges swelling apart around each knot.
    let vv = v + (fbm(u, v, 2, 2, 11, 4) - 0.5) * 0.12 + (fbm(u, v, 4, 3, 17, 3) - 0.5) * 0.03;
    for (const [ku, kv, r, strength] of knots) {
        const du = wrap(u - ku) * 1.6, dv = wrap(v - kv);
        const g = Math.exp(-(du * du + dv * dv) / (r * r));
        vv += strength * g * dv * 0.9;
    }
    const phase = (((vv * LINES) % 1) + 1) % 1, tri = 1 - Math.abs(2 * phase - 1);
    const fibre = fbm(u, v, 3, 120, 31, 3);
    const profile = Math.pow(tri, 0.8) * (0.8 + 0.2 * fibre);
    height[y * SIZE + x] = profile;
    ridge[y * SIZE + x] = tri;
    glint[y * SIZE + x] = Math.pow(tri, 7) * (0.35 + 0.65 * fbm(u, v, 5, 40, 41, 3));
    const pore = pnoise(u * 180, v * 260, 180, 260, 51);
    pores[y * SIZE + x] = pore > 0.93 ? (pore - 0.93) / 0.07 : 0;
}

const deep = [13, 11, 10], mid = [58, 51, 44], brass = [150, 122, 82];
const color = Buffer.alloc(SIZE * SIZE * 3), normal = Buffer.alloc(SIZE * SIZE * 3), rough = Buffer.alloc(SIZE * SIZE);
const at = (x, y) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const i = y * SIZE + x, t = ridge[i], gl = glint[i], p = pores[i];
    for (let c = 0; c < 3; c++) {
        const base = deep[c] + (mid[c] - deep[c]) * Math.pow(t, 1.4);
        color[i * 3 + c] = Math.round(Math.min(255, base + brass[c] * 0.42 * gl + 38 * p));
    }
    const dx = (at(x + 1, y) - at(x - 1, y)) * 7, dy = (at(x, y + 1) - at(x, y - 1)) * 7;
    const len = Math.hypot(dx, dy, 1);
    normal[i * 3] = Math.round((-dx / len * 0.5 + 0.5) * 255); normal[i * 3 + 1] = Math.round((dy / len * 0.5 + 0.5) * 255); normal[i * 3 + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
    rough[i] = Math.round(255 * Math.min(1, 0.78 - 0.42 * gl - 0.1 * t + 0.15 * p));      // ridge tops are glossy char, grooves are matt
}

// Minimal PNG writer (8-bit, no interlace) so the generator needs no dependencies.
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function chunk(type, data) {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
}
function png(pixels, channels) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(SIZE, 0); header.writeUInt32BE(SIZE, 4); header[8] = 8; header[9] = channels === 1 ? 0 : 2;
    const raw = Buffer.alloc((SIZE * channels + 1) * SIZE);
    for (let y = 0; y < SIZE; y++) pixels.copy(raw, y * (SIZE * channels + 1) + 1, y * SIZE * channels, (y + 1) * SIZE * channels);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
writeFileSync(resolve(out, 'oak-color.png'), png(color, 3));
writeFileSync(resolve(out, 'oak-normal.png'), png(normal, 3));
writeFileSync(resolve(out, 'oak-roughness.png'), png(rough, 1));
console.log('wrote oak-color.png, oak-normal.png, oak-roughness.png');
