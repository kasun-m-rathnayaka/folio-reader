import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const version = manifest.dependencies['pdfjs-dist'];
for (const name of ['pdf.min.mjs', 'pdf.worker.min.mjs', 'pdf_viewer.mjs']) {
  const source = await readFile(resolve(root, 'wwwroot/lib/pdfjs', name), 'utf8');
  if (!source.includes(`pdfjsVersion = ${version}`)) throw new Error(`${name} does not match PDF.js ${version}`);
}
console.log(`Verified PDF.js ${version}: renderer, worker, and viewer use the same version.`);
