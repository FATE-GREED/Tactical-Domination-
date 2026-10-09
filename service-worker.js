// Service Worker: cache semua file game saat pertama kali dibuka, supaya
// bisa dimainkan offline setelahnya (khas PWA). Versi cache dinaikkan
// manual kalau ada update file game.
const CACHE_NAME = 'tactical-domination-v8-9';
const ASSETS = [
  './',
  './manifest.json',
  './css/style.css',
  './css/lobby.css',
  './css/settings.css',
  './js/state.js',
  './js/settings.js',
  './js/stats.js',
  './js/audio.js',
  './js/unit-art.js',
  './js/hud.js',
  './js/lanes.js',
  './js/lockrows.js',
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
  './js/bot.js',
  './js/input.js',
  './js/main.js',
  './js/lobby.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './img/commander.webp',
  './img/lobby-bg.webp',
  './img/logo-banner.webp',
  './img/logo.webp',
];

// Audio disimpan 'seadanya': kalau ada file yang hilang/diganti nama, instalasi
// PWA tidak boleh gagal, jadi file audio di-cache terpisah dan kegagalannya diabaikan.
const AUDIO_ASSETS = [
  './audio/bgm-battle.mp3',
  './audio/bgm-plan.mp3',
  './audio/execute-start.mp3',
  './audio/explosion-big-1.mp3',
  './audio/explosion-big-2.mp3',
  './audio/explosion-small-1.mp3',
  './audio/explosion-small-2.mp3',
  './audio/hit-1.mp3',
  './audio/hit-2.mp3',
  './audio/hit-3.mp3',
  './audio/lose.mp3',
  './audio/move-foot-1.mp3',
  './audio/move-foot-2.mp3',
  './audio/move-foot-3.mp3',
  './audio/move-vehicle-1.mp3',
  './audio/move-vehicle-2.mp3',
  './audio/shoot-auto-1.mp3',
  './audio/shoot-auto-2.mp3',
  './audio/shoot-cannon-1.mp3',
  './audio/shoot-cannon-2.mp3',
  './audio/shoot-cannon-3.mp3',
  './audio/shoot-mortar-1.mp3',
  './audio/shoot-mortar-2.mp3',
  './audio/shoot-rifle-1.mp3',
  './audio/shoot-rifle-2.mp3',
  './audio/shoot-rifle-3.mp3',
  './audio/shoot-rocket-1.mp3',
  './audio/shoot-rocket-2.mp3',
  './audio/shoot-sniper-1.mp3',
  './audio/shoot-sniper-2.mp3',
  './audio/win.mp3',
];

// Cloudflare Pages mengalihkan /index.html -> /. Respons hasil alihan (redirected)
// DITOLAK Chrome kalau dipakai menjawab navigasi (ERR_FAILED). Jadi semua respons
// dibersihkan dulu menjadi respons biasa sebelum disimpan / dikirim.
async function cleanResponse(response) {
  if (!response.redirected) return response;
  const body = await response.blob();
  return new Response(body, { headers: response.headers, status: response.status, statusText: response.statusText });
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.all(ASSETS.map(async url => {
      const res = await fetch(url, { cache: 'reload' });
      if (!res.ok) throw new Error('Gagal cache ' + url);
      await cache.put(url, await cleanResponse(res));
    })).then(() => Promise.all(AUDIO_ASSETS.map(url =>
      fetch(url, { cache: 'reload' }).then(r => r.ok && cache.put(url, r)).catch(() => {}))))
    )
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

// Cache-first. Semua navigasi (termasuk /index.html dari PWA lama) dijawab dengan halaman
// utama './' dari cache, jadi jalan offline tanpa alihan.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (req.mode === 'navigate') {
      const shell = await cache.match('./');
      if (shell) return shell;
      try { return await cleanResponse(await fetch(req)); }
      catch (e) { return new Response('Tidak ada koneksi dan game belum tersimpan.', { status: 503 }); }
    }
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, (await cleanResponse(res.clone())).clone());
      return res;
    } catch (e) { return new Response('', { status: 504 }); }
  })());
});
