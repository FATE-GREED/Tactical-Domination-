// ====================================================================
// main.js — Titik masuk aplikasi. Menghubungkan semua modul dengan
// urutan inisialisasi yang benar. Tidak ada logika aturan/render di
// sini, hanya orkestrasi.
// ====================================================================

mapData = generateMap();          // map-gen.js
setupPlayersAndBuildings();       // setup.js

currentPlayerIdx = Math.random() < 0.5 ? 0 : 1;
turnNumber = 1;

initCanvas();                     // render.js — siapkan canvas & pertama kali draw
initInput();                      // input.js  — pasang semua event listener

startTurn(currentPlayerIdx);      // rules-economy.js — giliran pertama

renderLegend();
renderResourcePanels();
updateTurnBar();
updateActionPanel();
renderLog();
logAction('Permainan dimulai.');
draw();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(err => console.warn('SW gagal daftar:', err));
  });
}
