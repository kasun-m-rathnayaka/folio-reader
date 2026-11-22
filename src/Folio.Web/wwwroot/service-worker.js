// Development: no caching, so rebuilds show up on reload. The published app uses service-worker.published.js.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { });
