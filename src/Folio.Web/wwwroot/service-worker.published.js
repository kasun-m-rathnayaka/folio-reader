// Offline support (WEB-1): cache every published asset on install, serve them cache-first, and fall back to
// index.html for in-app navigations so deep links work offline. The asset list and version come from the build.
self.importScripts('./service-worker-assets.js');
self.addEventListener('install', event => event.waitUntil(onInstall()));
self.addEventListener('activate', event => event.waitUntil(onActivate()));
self.addEventListener('fetch', event => event.respondWith(onFetch(event)));

const cacheNamePrefix = 'folio-offline-';
const cacheName = `${cacheNamePrefix}${self.assetsManifest.version}`;
const offlineAssetsInclude = [/\.dll$/, /\.pdb$/, /\.wasm/, /\.html/, /\.js$/, /\.mjs$/, /\.json$/, /\.css$/, /\.woff2?$/, /\.png$/, /\.jpe?g$/, /\.gif$/, /\.ico$/, /\.blat$/, /\.dat$/, /\.webmanifest$/, /\.svg$/];
const offlineAssetsExclude = [/^service-worker\.js$/];
const base = new URL('./', self.location.origin + self.location.pathname.replace(/[^/]*$/, ''));

async function onInstall() {
    const requests = self.assetsManifest.assets
        .filter(asset => offlineAssetsInclude.some(pattern => pattern.test(asset.url)))
        .filter(asset => !offlineAssetsExclude.some(pattern => pattern.test(asset.url)))
        .map(asset => new Request(new URL(asset.url, base).href, { integrity: asset.hash, cache: 'no-cache' }));
    await caches.open(cacheName).then(cache => cache.addAll(requests));
    self.skipWaiting();
}

async function onActivate() {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(cacheNamePrefix) && key !== cacheName).map(key => caches.delete(key)));
    await self.clients.claim();
}

async function onFetch(event) {
    if (event.request.method !== 'GET') return fetch(event.request);
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return fetch(event.request);
    const cache = await caches.open(cacheName);
    const isNavigation = event.request.mode === 'navigate' && !/\.[a-z0-9]+$/i.test(url.pathname);
    const cached = await cache.match(isNavigation ? new URL('index.html', base).href : event.request);
    return cached || fetch(event.request);
}
