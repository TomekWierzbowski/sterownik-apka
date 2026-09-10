/* service worker — cache-first, apka działa OFFLINE (dane demo i tak
 * są w środku; po podpięciu mostka: network-first na /api/, reszta cache) */
const CACHE = 'basen-apka-v2';
const PLIKI = ['./', './index.html', './manifest.webmanifest',
               './ikona-192.png', './ikona-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PLIKI)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k =>
    Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request)
    .then(r => r || fetch(e.request)));
});
