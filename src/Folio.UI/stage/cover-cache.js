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

export const cacheGet = key => run('readonly', store => store.get(key));
export const cachePut = (key, value) => run('readwrite', store => store.put(value, key));
export const cacheClear = () => run('readwrite', store => store.clear());
