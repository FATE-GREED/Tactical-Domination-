// ====================================================================
// main.js — Titik masuk aplikasi. Menghubungkan semua modul dengan
// urutan inisialisasi yang benar. Tidak ada logika aturan/render di
// sini, hanya orkestrasi.
// ====================================================================

mapData = generateMap();          // map-gen.js (40x60, tanpa simetri)
setupPlayersAndBuildings();       // setup.js

currentPlayerIdx = Math.random() < 0.5 ? 0 : 1;
turnNumber = 1;

initCanvas();                     // render.js — siapkan canvas & pertama kali draw
initInput();                      // input.js  — pasang semua event listener

startTurn(currentPlayerIdx);      // rules-economy.js — giliran pertama

// Pusatkan kamera ke Markas pemain yang mulai
(function centerOnStartingMarkas() {
  const m = getBuilding(players[currentPlayerIdx], 'markas');
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
beginPlanning();                  // rules-auto.js — fase rencana 30 detik pertama

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(err => console.warn('SW gagal daftar:', err));
  });
}
