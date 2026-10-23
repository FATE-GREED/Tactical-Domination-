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
  // opts: { mode: 'bot', level: 'mudah' | 'sedang' | 'sulit' } (v10.2); { mode: 'campaign' } untuk Campaign.
  BOT_LEVEL = (opts && BOT_STAT_MUL[opts.level]) ? opts.level : 'sedang';   // v10.2 (World War: WW_BOT_LEVEL, K8)
  MPM = (opts && opts.mode === 'mp') ? opts.mpm : null; document.body.classList.toggle('mp', !!MPM);   // v12: Multiplayer
  WW = null; document.body.classList.remove('ww');   // v11: data World War hanya ada di mode 'ww'
  if (opts && opts.mode === 'ww') { WW = WorldWar.prepareBattle(); document.body.classList.add('ww'); }

  document.getElementById('game').style.display = 'block'; // canvas butuh ukuran nyata sebelum initCanvas

  if (opts && opts.mode === 'campaign') Campaign.prepareBattle(opts);   // v9.7: aturan, ukuran peta 15x25, UI disederhanakan
  mapData = CAMPAIGN ? Campaign.battleMap() : (WW ? generateMapByType(WW.mapType) : generateMap());   // map-gen.js (acak, tanpa simetri); v11: World War memakai 7 jenis map (map-types.js)
  setupPlayersAndBuildings();       // setup.js
  Stats.init();                     // stats.js — statistik pertandingan mulai dari nol

  currentPlayerIdx = (CAMPAIGN || MPM) ? HUMAN : (Math.random() < 0.5 ? 0 : 1);   // v12: Multiplayer — tuan rumah jalan dulu
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
  document.getElementById('pmLobby').addEventListener('click', () => { if (MPM) MP.confirmLeave(); else if (WW) WorldWar.confirmLeave(); else document.getElementById('lobbyBtn').click(); });   // v11 (5.4): keluar = KALAH

  if (MPM && MPM.role === 'guest') MP.applyStart(opts.snap);   // v12: tamu memakai keadaan awal dari tuan rumah
  else startTurn(currentPlayerIdx);      // rules-economy.js — giliran pertama
  if (MPM && MPM.role === 'host') MP.sendStart();

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
