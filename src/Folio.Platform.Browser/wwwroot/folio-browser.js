// Browser platform services for Folio Web. Everything stays on the device: PDFs and covers live in the
// Origin Private File System (OPFS) under folio/<relative path>, mirroring the desktop data folder layout.

const ROOT = 'folio';
const picked = new Map();          // id -> File chosen by a picker or dropped onto the page
const bookUrls = new Map();        // relative path -> blob URL (revoked when the reader closes)
const coverUrls = new Map();       // relative path -> blob URL (kept, least recently used dropped)
const MAX_COVER_URLS = 300;
let nextId = 1, dropHelper = null;

async function rootDir() {
    if (!navigator.storage?.getDirectory) throw new Error('This browser does not support private file storage (OPFS).');
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(ROOT, { create: true });
}

function parts(path) { return String(path).split('/').filter(p => p && p !== '.' && p !== '..'); }

async function dirFor(path, create) {
    let dir = await rootDir();
    const segments = parts(path);
    for (const segment of segments.slice(0, -1)) dir = await dir.getDirectoryHandle(segment, { create });
    return { dir, name: segments.at(-1) };
}

async function fileHandle(path, create = false) {
    const { dir, name } = await dirFor(path, create);
    return dir.getFileHandle(name, { create });
}

// Safari before createWritable: write through a sync access handle in a dedicated worker.
let writerWorker = null, writerSeq = 0;
const writerPending = new Map();
function writeWithWorker(path, blob) {
    if (!writerWorker) {
        const source = `onmessage = async e => {
            const { id, path, blob } = e.data;
            try {
                let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('${ROOT}', { create: true });
                const segs = path.split('/').filter(Boolean);
                for (const s of segs.slice(0, -1)) dir = await dir.getDirectoryHandle(s, { create: true });
                const handle = await (await dir.getFileHandle(segs.at(-1), { create: true })).createSyncAccessHandle();
                const bytes = new Uint8Array(await blob.arrayBuffer());
                handle.truncate(0); handle.write(bytes, { at: 0 }); handle.flush(); handle.close();
                postMessage({ id });
            } catch (error) { postMessage({ id, error: String(error?.message || error) }); }
        };`;
        writerWorker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
        writerWorker.onmessage = e => {
            const pending = writerPending.get(e.data.id); writerPending.delete(e.data.id);
            e.data.error ? pending.reject(new Error(e.data.error)) : pending.resolve();
        };
    }
    const id = ++writerSeq;
    return new Promise((resolve, reject) => { writerPending.set(id, { resolve, reject }); writerWorker.postMessage({ id, path, blob }); });
}

async function writeBlob(path, blob) {
    const handle = await fileHandle(path, true);
    if (handle.createWritable) {
        const writable = await handle.createWritable();
        try { await writable.write(blob); await writable.close(); }
        catch (error) { await writable.abort?.(); throw error; }
    } else {
        await writeWithWorker(parts(path).join('/'), blob);
    }
}

async function readFile(path) {
    try { return await (await fileHandle(path)).getFile(); }
    catch (error) { if (error?.name === 'NotFoundError' || error?.name === 'TypeMismatchError') return null; throw error; }
}

const typeFor = path => path.endsWith('.pdf') ? 'application/pdf' : path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'application/octet-stream';

// ---- storage ----------------------------------------------------------------------------------------------------

export async function listFiles(directory) {
    try {
        let dir = await rootDir();
        for (const segment of parts(directory)) dir = await dir.getDirectoryHandle(segment, { create: true });
        const names = [];
        for await (const [name, handle] of dir.entries()) if (handle.kind === 'file') names.push(name);
        return names;
    } catch { return []; }
}

export async function writeFromStream(path, streamRef) {
    const buffer = await streamRef.arrayBuffer();
    await writeBlob(path, new Blob([buffer], { type: typeFor(path) }));
}

export async function readBytes(path) {
    const file = await readFile(path);
    return file ? new Uint8Array(await file.arrayBuffer()) : null;
}

export async function deleteFile(path) {
    try { const { dir, name } = await dirFor(path, false); await dir.removeEntry(name); } catch { /* already gone */ }
    revokeUrl(path);
}

export async function exists(path) { return (await readFile(path)) !== null; }

export async function estimate() {
    const persisted = await navigator.storage?.persisted?.() ?? false;
    const { usage = 0, quota = 0 } = await navigator.storage?.estimate?.() ?? {};
    return { persisted, usage, quota };
}

export async function requestPersistence() {
    try { return await navigator.storage?.persist?.() ?? false; } catch { return false; }
}

// ---- URLs -------------------------------------------------------------------------------------------------------

export async function bookUrl(path) {
    if (bookUrls.has(path)) return bookUrls.get(path);
    const file = await readFile(path);
    if (!file) return null;
    const url = URL.createObjectURL(new Blob([file], { type: 'application/pdf' }));
    bookUrls.set(path, url);
    return url;
}

export async function coverUrl(path) {
    if (coverUrls.has(path)) { const url = coverUrls.get(path); coverUrls.delete(path); coverUrls.set(path, url); return url; }
    const file = await readFile(path);
    if (!file) return null;
    const url = URL.createObjectURL(new Blob([file], { type: typeFor(path) }));
    coverUrls.set(path, url);
    while (coverUrls.size > MAX_COVER_URLS) { const [oldest, old] = coverUrls.entries().next().value; coverUrls.delete(oldest); URL.revokeObjectURL(old); }
    return url;
}

export function revokeUrl(path) {
    for (const map of [bookUrls, coverUrls]) {
        const url = map.get(path);
        if (url) { URL.revokeObjectURL(url); map.delete(path); }
    }
}

// ---- picking and dropping ---------------------------------------------------------------------------------------

function remember(file, relativePath) {
    const id = String(nextId++);
    picked.set(id, file);
    return { id, name: file.name, size: file.size, relativePath: relativePath || file.webkitRelativePath || file.name };
}

const isPdf = file => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

function pick(configure) {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file'; input.style.display = 'none';
        configure(input);
        let done = false;
        const finish = files => {
            if (done) return; done = true; input.remove();
            resolve(files.filter(isPdf).map(f => remember(f)));
        };
        input.addEventListener('change', () => finish(Array.from(input.files || [])));
        input.addEventListener('cancel', () => finish([]));
        document.body.append(input);
        input.click();
    });
}

export function pickPdfFiles() { return pick(input => { input.multiple = true; input.accept = 'application/pdf,.pdf'; }); }
export function pickFolder() { return pick(input => { input.multiple = true; input.webkitdirectory = true; }); }

export function takePicked(id) {
    const file = picked.get(String(id));
    picked.delete(String(id));
    return file ?? null;
}

export async function readPicked(id) {
    const file = takePicked(id);
    return file ? new Uint8Array(await file.arrayBuffer()) : null;
}

async function walk(entry, prefix, out) {
    if (entry.isFile) {
        const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
        if (isPdf(file)) out.push(remember(file, prefix + file.name));
    } else if (entry.isDirectory) {
        const reader = entry.createReader();
        for (;;) {
            const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
            if (!batch.length) break;
            for (const child of batch) await walk(child, `${prefix}${entry.name}/`, out);
        }
    }
}

export function registerDropTarget(helper) {
    dropHelper = helper;
    if (window.__folioDropRegistered) return;
    window.__folioDropRegistered = true;
    document.addEventListener('drop', async event => {
        if (!dropHelper || window.chrome?.webview || !event.dataTransfer?.types.includes('Files')) return;
        event.preventDefault();
        const out = [];
        const entries = Array.from(event.dataTransfer.items || []).map(item => item.webkitGetAsEntry?.()).filter(Boolean);
        try {
            if (entries.length) for (const entry of entries) await walk(entry, '', out);
            else for (const file of Array.from(event.dataTransfer.files || [])) if (isPdf(file)) out.push(remember(file));
        } catch (error) { console.error('[FolioWeb] Drop failed', error); }
        if (out.length) await dropHelper.invokeMethodAsync('OnFilesDropped', out);
    });
}

// ---- covers -----------------------------------------------------------------------------------------------------

let pdfjsModule = null;
async function pdfjs() {
    if (!pdfjsModule) {
        pdfjsModule = await import('../Folio.UI/lib/pdfjs/pdf.min.mjs');
        pdfjsModule.GlobalWorkerOptions.workerSrc ||= new URL('../Folio.UI/lib/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    }
    return pdfjsModule;
}

/** Renders page 1 of a stored PDF to an image at most maxDimension px on its long edge and stores it. */
export async function renderCover(bookPath, coverPath, maxDimension) {
    const file = await readFile(bookPath);
    if (!file) throw new Error('The stored PDF is missing.');
    const lib = await pdfjs();
    const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
    try {
        const doc = await task.promise;
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const scale = maxDimension / Math.max(base.width, base.height);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
        canvas.width = canvas.height = 0;
        if (!blob) throw new Error('The cover image could not be encoded.');
        await writeBlob(coverPath, blob);
        return new Uint8Array(await blob.arrayBuffer());
    } finally {
        await task.destroy();
    }
}

// ---- text (library search on the web; PdfPig in WebAssembly was too slow, DECISIONS D-008) ----------------------

const textDocs = new Map(); // path -> { task, doc }, at most two open
async function textDoc(path) {
    if (textDocs.has(path)) { const entry = textDocs.get(path); textDocs.delete(path); textDocs.set(path, entry); return entry.doc; }
    const file = await readFile(path);
    if (!file) throw new Error('The stored PDF is missing.');
    const lib = await pdfjs();
    const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
    const doc = await task.promise;
    textDocs.set(path, { task, doc });
    while (textDocs.size > 2) { const [oldest, entry] = textDocs.entries().next().value; textDocs.delete(oldest); await entry.task.destroy(); }
    return doc;
}

export async function pdfMetadata(path) {
    const doc = await textDoc(path);
    const { info } = await doc.getMetadata().catch(() => ({ info: {} }));
    const page = await doc.getPage(1), viewport = page.getViewport({ scale: 1 });
    return { title: info?.Title || null, author: info?.Author || null, pageCount: doc.numPages, width: viewport.width, height: viewport.height };
}

export async function pdfPageText(path, index) {
    const doc = await textDoc(path);
    const page = await doc.getPage(index + 1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    let text = '';
    for (const item of content.items) { text += item.str || ''; text += item.hasEOL ? '\n' : (item.str ? ' ' : ''); }
    return { text: text.replace(/[ \t]+/g, ' ').trim(), width: viewport.width, height: viewport.height };
}

export async function closeText(path) {
    const entry = textDocs.get(path);
    if (entry) { textDocs.delete(path); await entry.task.destroy(); }
}

// ---- backup (WEB-4) ---------------------------------------------------------------------------------------------

/** Picks one file of any type (a backup archive). */
export function pickFile(accept) {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = accept || ''; input.style.display = 'none';
        let done = false;
        const finish = files => { if (done) return; done = true; input.remove(); resolve(files.map(f => remember(f))); };
        input.addEventListener('change', () => finish(Array.from(input.files || []).slice(0, 1)));
        input.addEventListener('cancel', () => finish([]));
        document.body.append(input);
        input.click();
    });
}

/** Saves a stream from .NET as a download (the backup archive). */
export async function downloadStream(fileName, contentType, streamRef) {
    const blob = new Blob([await streamRef.arrayBuffer()], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = fileName; link.style.display = 'none';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Removes every file in a directory (used before restoring a backup). */
export async function clearDirectory(directory) {
    for (const name of await listFiles(directory)) await deleteFile(`${directory}/${name}`);
}

// ---- power (DSK-2 on the web where the Battery Status API exists; otherwise "unknown") ---------------------------

export async function watchBattery(helper) {
    try {
        const battery = await navigator.getBattery?.();
        if (!battery) return false;
        const send = () => helper.invokeMethodAsync('OnBattery', !battery.charging, Math.round(battery.level * 100)).catch(() => {});
        battery.addEventListener('chargingchange', send);
        battery.addEventListener('levelchange', send);
        send();
        return true;
    } catch { return false; }
}
