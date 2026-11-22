// Kept outside index.html so the Content-Security-Policy needs no inline scripts.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' }).catch(error => console.warn('[FolioWeb] Offline support unavailable', error));
}
