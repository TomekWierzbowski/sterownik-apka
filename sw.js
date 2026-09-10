/* SERVICE WORKER APLIKACJI [D-270]: pliki aplikacji z pamięci telefonu (cache-first),
   żeby HMI otwierało się od razu i bez zasięgu (dane z brokera i tak wymagają sieci -
   bez niej ekran pokazuje ostatni stan z napisem „czekam na pakiet”). Nowa wersja
   plików = nowa nazwa pamięci (WERSJA z odcisku treści) -> stare kopie znikają. */
const WERSJA = 'basen-hmi-b1c90f3894';
const PLIKI = ['./', './index.html', './hmi.html', './most_js.js', './paho-mqtt.min.js',
               './manifest.webmanifest', './ikona-192.png', './ikona-512.png', './ikona-maskable-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(WERSJA).then(c => c.addAll(PLIKI)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== WERSJA).map(k => caches.delete(k))))
              .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // broker (wss) i obce hosty - bez udziału SW
  /* ⚠ STRONY I SKRYPTY: NAJPIERW SIEĆ [2026-09-09, Tomasz: „mam starą wersję, nie odświeża"].
     Pierwsza wersja była cache-first i telefon utykał na starych plikach mimo nowej wersji
     na serwerze. Teraz: gdy jest zasięg — świeży plik (i odśwież kopię offline); bez zasięgu —
     z pamięci. Ikony/manifest/Paho zostają cache-first (nie zmieniają się, oszczędza transfer). */
  const swiezy = e.request.mode === 'navigate' || /\.(html|js|webmanifest)$/.test(u.pathname);
  if (swiezy) {
    e.respondWith(fetch(e.request).then(odp => {
      if (odp && odp.ok) { const kopia = odp.clone(); caches.open(WERSJA).then(c => c.put(e.request, kopia)); }
      return odp;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  } else {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(odp => {
      if (odp && odp.ok) { const kopia = odp.clone(); caches.open(WERSJA).then(c => c.put(e.request, kopia)); }
      return odp;
    })));
  }
});
