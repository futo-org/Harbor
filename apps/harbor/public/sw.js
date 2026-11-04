// Network-only service worker: it caches nothing, so bundles never go stale.
// It exists because Chrome only offers to install a web app that has one with
// a fetch handler.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => event.respondWith(fetch(event.request)));
