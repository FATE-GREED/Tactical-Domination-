// ====================================================================
// main.js — Titik masuk GAME (bukan lobby). Menghubungkan semua modul
// dengan urutan inisialisasi yang benar. Tidak ada logika aturan/render
// di sini, hanya orkestrasi.
//
// Game dimulai setelah pemain memilih tepat 10 jenis unit di unit-select.js.
// lobby.js menampilkan layar pemilihan sebelum memanggil startGame(). Layar
// akhir (input.js): 'Main Lagi' reload ke layar pemilihan, 'Lobby' kembali
// ke lobby biasa.
// ====================================================================

let gameStarted = false;

function startGame(opts) {
  if (gameStarted) return;
  gameStarted = true;
  // opts (mis. { mode: 'bot', level: 'sulit' }) disiapkan untuk mode lain nanti.

  document.getElementById('game').style.display = 'block'; // canvas butuh ukuran nyata sebelum initCanvas

  if (opts && opts.mode === 'campaign') Campaign.prepareBattle(opts);   // v9.7: aturan, ukuran peta 15x25, UI disederhanakan
  mapData = CAMPAIGN ? Campaign.battleMap() : generateMap();          // map-gen.js (acak, tanpa simetri)
  setupPlayersAndBuildings();       // setup.js
  Stats.init();                     // stats.js — statistik pertandingan mulai dari nol

  currentPlayerIdx = CAMPAIGN ? HUMAN : (Math.random() < 0.5 ? 0 : 1);
  turnNumber = 1;

  // v10.1 (P7/P9/P10): reset mode otomatis, Skip, mode cepat, dan log eksekusi sebelumnya
  autoMode = false; autoTurnBusy = false;
  skipArmed = false; skipExecLeft = 0; FAST = false;
  dmgFeedPrev = null; dmgFeedPrevOpen = false;
  botWaveStarted = [false, false];

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

  if (CAMPAIGN) Campaign.fitView();   // seluruh peta kecil terlihat sekaligus
  renderLegend();
  renderResourcePanels();
  updateActionPanel();
  renderLog();
  logAction('Permainan dimulai.');
  Sfx.music('plan');                // musik lobby berganti ke musik fase rencana
  beginPlanning();                  // rules-auto.js — fase rencana pertama
  if (CAMPAIGN) Campaign.startTutorial();   // John memandu pemain
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(err => console.warn('SW gagal daftar:', err));
  });
}
