// Service Worker: cache semua file game saat pertama kali dibuka, supaya
// bisa dimainkan offline setelahnya (khas PWA). Versi cache dinaikkan
// manual kalau ada update file game.
const CACHE_NAME = 'tactical-domination-v7';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/state.js',
  './js/map-gen.js',
  './js/setup.js',
  './js/rules-movement.js',
  './js/rules-economy.js',
  './js/rules-abilities.js',
  './js/rules-supply.js',
  './js/rules-combat.js',
  './js/rules-detection.js',
  './js/rules-win.js',
  './js/rules-auto.js',
  './js/render-fx.js',
  './js/render.js',
  './js/ui-orders.js',
  './js/input.js',
  './js/main.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first: coba dari cache dulu (biar instan & jalan offline), kalau
// tidak ada baru ambil dari network (lalu simpan ke cache untuk lain kali).
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => cached);
    })
  );
});
