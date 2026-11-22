// Asset gate (SPEC: testing — "All referenced assets present; no remote URLs").
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '../..');
const fail = message => { console.error(`✗ ${message}`); process.exitCode = 1; };

// 1. PDF.js renderer, worker and viewer share the pinned version.
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const version = manifest.dependencies['pdfjs-dist'];
for (const name of ['pdf.min.mjs', 'pdf.worker.min.mjs', 'pdf_viewer.mjs']) {
    const source = await readFile(resolve(root, 'wwwroot/lib/pdfjs', name), 'utf8');
    if (!source.includes(`pdfjsVersion = ${version}`)) fail(`${name} does not match PDF.js ${version}`);
}
console.log(`Verified PDF.js ${version}: renderer, worker, and viewer use the same version.`);

// 2. Stage dependencies are pinned exactly, and the committed bundle matches a fresh build of stage/.
for (const name of ['three', 'esbuild']) {
    const pinned = manifest.dependencies[name] ?? manifest.devDependencies[name];
    if (!/^\d+\.\d+\.\d+$/.test(pinned ?? '')) fail(`${name} must be pinned to an exact version (found ${pinned})`);
}
const bundle = resolve(root, 'wwwroot/js/stage.bundle.mjs');
if (!existsSync(bundle)) fail('wwwroot/js/stage.bundle.mjs is missing: run npm run build:stage');
else if (existsSync(resolve(root, 'node_modules/esbuild'))) {
    const temp = await mkdtemp(join(tmpdir(), 'folio-stage-'));
    try {
        const out = join(temp, 'stage.bundle.mjs');
        const script = manifest.scripts['build:stage'].replace('--outfile=wwwroot/js/stage.bundle.mjs', `--outfile=${out}`);
        execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', script.split(' '), { cwd: root, stdio: 'pipe', shell: process.platform === 'win32' });
        const lf = text => text.replace(/\r\n/g, '\n'); // Windows checkouts may convert line endings
        if (lf(await readFile(out, 'utf8')) !== lf(await readFile(bundle, 'utf8'))) fail('stage.bundle.mjs is out of date with stage/: run npm run build:stage and commit it');
        else console.log('Verified stage.bundle.mjs matches stage/ sources.');
    } finally { await rm(temp, { recursive: true, force: true }); }
}

// 3. Every font the stylesheets reference is present.
const css = await readFile(resolve(root, 'wwwroot/css/m3-tokens.css'), 'utf8');
const fonts = [...css.matchAll(/url\(\.\.\/fonts\/([^)]+)\)/g)].map(m => m[1]);
for (const font of fonts) if (!existsSync(resolve(root, 'wwwroot/fonts', font))) fail(`missing font ${font}`);
for (const license of ['OFL-InstrumentSerif.txt', 'OFL-Inter.txt', 'OFL-JetBrainsMono.txt'])
    if (!existsSync(resolve(root, 'wwwroot/fonts', license))) fail(`missing font licence ${license}`);
console.log(`Verified ${fonts.length} self-hosted font files and their OFL licences.`);

// 3b. The app icon shows in the sidebar (WP7): the file exists and the layout references it by a base-relative path.
const logo = resolve(root, 'wwwroot/images/folio-logo.png');
if (!existsSync(logo)) fail('wwwroot/images/folio-logo.png is missing');
const layout = await readFile(resolve(root, 'Layout/MainLayout.razor'), 'utf8');
if (!layout.includes('src="_content/Folio.UI/images/folio-logo.png"')) fail('MainLayout does not show the app icon in the sidebar brand');
else console.log('Verified the sidebar app icon.');

// 4. No runtime request leaves the device: no remote stylesheets, fonts, scripts, imports or workers.
const remote = /(url\(\s*['"]?https?:|@import\s+['"]?https?:|<(?:script|link)[^>]+(?:src|href)=["']https?:|\bimport\s*\(\s*["']https?:|\bfrom\s*["']https?:|new\s+Worker\(\s*["']https?:)/i;
const scan = async (dir, filter) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== 'lib') await scan(path, filter); continue; }
        if (!filter.test(entry.name)) continue;
        const text = await readFile(path, 'utf8');
        if (remote.test(text)) fail(`${path.slice(repo.length + 1)} references a remote URL`);
    }
};
await scan(resolve(root, 'wwwroot'), /\.(css|js|mjs)$/);
for (const page of ['src/Folio.Web/wwwroot/index.html', 'src/Folio.Desktop/wwwroot/index.html', 'src/Folio.Web/wwwroot/service-worker.published.js'])
    if (existsSync(resolve(repo, page)) && remote.test(await readFile(resolve(repo, page), 'utf8'))) fail(`${page} references a remote URL`);
console.log('Verified no remote URLs in styles, scripts or host pages.');
if (process.exitCode) throw new Error('Asset verification failed.');
