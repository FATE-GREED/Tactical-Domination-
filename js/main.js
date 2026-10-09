// ====================================================================
// main.js — Titik masuk GAME (bukan lobby). Menghubungkan semua modul
// dengan urutan inisialisasi yang benar. Tidak ada logika aturan/render
// di sini, hanya orkestrasi.
//
// Game TIDAK jalan otomatis lagi: lobby.js memanggil startGame() saat
// pemain menekan Mulai -> Bot Sulit. Layar akhir (input.js) punya dua
// tombol: 'Main Lagi' (reload + tanda td-autostart, lobby.js langsung
// memulai game) dan 'Lobby' (reload biasa, kembali ke lobby).
// ====================================================================

let gameStarted = false;

function startGame(opts) {
  if (gameStarted) return;
  gameStarted = true;
  // opts (mis. { mode: 'bot', level: 'sulit' }) disiapkan untuk mode lain nanti.

  document.getElementById('game').style.display = 'block'; // canvas butuh ukuran nyata sebelum initCanvas

  mapData = generateMap();          // map-gen.js (40x60, tanpa simetri)
  setupPlayersAndBuildings();       // setup.js
  Stats.init();                     // stats.js — statistik pertandingan mulai dari nol

  currentPlayerIdx = Math.random() < 0.5 ? 0 : 1;
  turnNumber = 1;

  initCanvas();                     // render.js — siapkan canvas & pertama kali draw
  initInput();                      // input.js  — pasang semua event listener
  initHud();                        // hud.js    — sidebar, kecepatan, rincian, pengaturan
  document.getElementById('pauseBtn').addEventListener('click', togglePause);
  document.getElementById('pmResume').addEventListener('click', togglePause);
  document.getElementById('pmRestart').addEventListener('click', () => document.getElementById('restartBtn').click());
  document.getElementById('pmLobby').addEventListener('click', () => document.getElementById('lobbyBtn').click());

  startTurn(currentPlayerIdx);      // rules-economy.js — giliran pertama

  // Pusatkan kamera ke Markas pemain manusia
  (function centerOnStartingMarkas() {
    const m = getBuilding(players[HUMAN], 'markas');
    if (!m) return;
    const { x, y } = hexCenter(m.r, m.c);
    camX = canvas.width / 2 - x * scale;
    camY = canvas.height / 2 - y * scale;
  })();

  renderLegend();
  renderResourcePanels();
  updateActionPanel();
  renderLog();
  logAction('Permainan dimulai.');
  Sfx.music('plan');                // musik lobby berganti ke musik fase rencana
  beginPlanning();                  // rules-auto.js — fase rencana pertama
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(err => console.warn('SW gagal daftar:', err));
  });
}
