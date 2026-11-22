// Generates the bookcase's wood textures (WP3): 1024 × 1024 seamless colour, normal and roughness maps of warm oak.
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

// Grain runs along x. Long streaks: low frequency along x, high across y; warped so lines wander like real growth rings.
const height = new Float32Array(SIZE * SIZE), tone = new Float32Array(SIZE * SIZE), pores = new Float32Array(SIZE * SIZE);
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE, v = y / SIZE;
    const warp = fbm(u, v, 3, 3, 11, 4) * 1.1;
    const ring = fbm(u * 1 + warp * 0.12, v * 1, 2, 1, 21, 3);
    const rings = 0.5 + 0.5 * Math.sin((v * 7 + warp * 2.5 + ring * 2) * Math.PI * 2);   // growth-ring bands (periodic in v)
    const streak = fbm(u + warp * 0.03, v, 2, 96, 31, 5);                                                 // fine fibres
    const fibre = fbm(u, v, 4, 160, 41, 3);
    const pore = pnoise(u * 96, v * 220, 96, 220, 51);
    tone[y * SIZE + x] = 0.2 * rings + 0.5 * streak + 0.3 * fibre;
    height[y * SIZE + x] = 0.5 * streak + 0.3 * fibre + 0.2 * rings;
    pores[y * SIZE + x] = pore > 0.9 ? (pore - 0.9) / 0.1 : 0;
}

const light = [201, 158, 104], dark = [138, 96, 54];   // oak: honey to a deeper brown (average ≈ #B98F5C)
const color = Buffer.alloc(SIZE * SIZE * 3), normal = Buffer.alloc(SIZE * SIZE * 3), rough = Buffer.alloc(SIZE * SIZE);
const at = (x, y) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const i = y * SIZE + x, t = Math.min(1, Math.max(0, (tone[i] - 0.3) / 0.4)), p = pores[i];
    for (let c = 0; c < 3; c++) color[i * 3 + c] = Math.round((light[c] + (dark[c] - light[c]) * t) * (1 - 0.3 * p));
    const dx = (at(x + 1, y) - at(x - 1, y)) * 5.5 + (p ? 0.6 * p : 0), dy = (at(x, y + 1) - at(x, y - 1)) * 5.5 + (p ? 0.6 * p : 0);
    const len = Math.hypot(dx, dy, 1);
    normal[i * 3] = Math.round((-dx / len * 0.5 + 0.5) * 255); normal[i * 3 + 1] = Math.round((dy / len * 0.5 + 0.5) * 255); normal[i * 3 + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
    rough[i] = Math.round(255 * Math.min(1, 0.62 + 0.18 * t + 0.2 * p));
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
