// Generated covers and spines are cached as PNG blobs, keyed by book id, design version and title, so a restart reads them
// instead of repainting (WP5). The cache is the origin's IndexedDB: it lives in the browser profile on the web and in the
// WebView2 profile on desktop. Every call is best-effort: if storage is unavailable the stage just paints again.
const DB = 'folio-covers', STORE = 'images';
let opening = null;

function open() {
    opening ??= new Promise(resolve => {
        try {
            const request = indexedDB.open(DB, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(STORE);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
        } catch { resolve(null); }
    });
    return opening;
}

const run = async (mode, action) => {
    const db = await open();
    if (!db) return null;
    return new Promise(resolve => {
        try {
            const transaction = db.transaction(STORE, mode);
            const result = action(transaction.objectStore(STORE));
            transaction.oncomplete = () => resolve(result.result ?? true);
            transaction.onerror = transaction.onabort = () => resolve(null);
        } catch { resolve(null); }
    });
};

// Writes wait in memory and land together in one transaction once reads go quiet (at most FLUSH_MAX_MS after the first one), so a
// burst of spine reads after a fling never queues behind PNG writes. Reads see buffered values at once.
const FLUSH_QUIET_MS = 300, FLUSH_MAX_MS = 2000;
const pending = new Map();
let flushTimer = 0, firstPendingAt = 0;

function scheduleFlush() {
    if (!pending.size) return;
    clearTimeout(flushTimer);
    const wait = Math.max(0, Math.min(FLUSH_QUIET_MS, firstPendingAt + FLUSH_MAX_MS - performance.now()));
    flushTimer = setTimeout(flush, wait);
}

export function flush() {
    clearTimeout(flushTimer); flushTimer = 0;
    if (!pending.size) return Promise.resolve(true);
    const entries = [...pending]; pending.clear(); firstPendingAt = 0;
    return run('readwrite', store => { let last = null; for (const [key, value] of entries) last = store.put(value, key); return last ?? {}; });
}

if (typeof addEventListener === 'function') {
    addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    addEventListener('pagehide', () => flush());
}

export const cacheGet = key => {
    if (pending.has(key)) return Promise.resolve(pending.get(key));
    if (pending.size) scheduleFlush();                       // a read pushes the flush back, up to FLUSH_MAX_MS
    return run('readonly', store => store.get(key));
};
export const cachePut = (key, value) => {
    if (!pending.size) firstPendingAt = performance.now();
    pending.set(key, value);
    scheduleFlush();
    return Promise.resolve(true);
};
export const cacheClear = () => { pending.clear(); clearTimeout(flushTimer); return run('readwrite', store => store.clear()); };
