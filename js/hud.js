// ====================================================================
// hud.js — HUD v8.9 (sesuai sketsa): panel samping, waktu pertandingan, tombol kecepatan 2x,
// tombol rincian & deploy. Tidak ada aturan game di sini.
// ====================================================================
let matchSec = 0, matchTimer = null;

function updateMatchTime() {
  const el = document.getElementById('matchtime');
  if (el) el.textContent = String(Math.floor(matchSec / 60)).padStart(2, '0') + ':' + String(matchSec % 60).padStart(2, '0');
}

// Panel samping: turn, jumlah Corps/APC menganggur dari total, dan yang bertugas isi fuel / medical
function renderSidebar() {
  const el = document.getElementById('sidebar');
  if (!el || typeof players === 'undefined' || !players.length) return;
  const mine = units.filter(u => u.owner === HUMAN);
  const carried = mine.filter(u => u.type === 'apc' && u.cargo && u.cargo.type === 'corps').length;   // Corps yang sedang naik APC
  const corps = mine.filter(u => u.type === 'corps');
  const apcs = mine.filter(u => u.type === 'apc');
  const corpsIdle = corps.filter(u => isIdleCorps(u, HUMAN)).length;
  const apcIdle = apcs.filter(u => !u.cargo && !u.target && !u.buildOrder && u.job === 'idle').length;
  const job = (type, j) => mine.filter(u => u.type === type && u.job === j).length;
  const set = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
  set('sbTurn', turnNumber);
  set('sbCorps', `${corpsIdle}/${corps.length + carried}`);
  set('sbApc', `${apcIdle}/${apcs.length}`);
  set('sbFuel', `C${job('corps', 'fuel')} A${job('apc', 'fuel')}`);
  set('sbMed', `C${job('corps', 'medical')} A${job('apc', 'medical')}`);
}

function initHud() {
  matchSec = 0; updateMatchTime();
  clearInterval(matchTimer);
  matchTimer = setInterval(() => { if (!paused && !gameOver) { matchSec++; updateMatchTime(); } }, 1000);

  document.getElementById('speedBtn').addEventListener('click', () => Settings.set('fast', !Settings.get('fast')));
  document.getElementById('rincianBtn').addEventListener('click', () => Rincian.open());
  document.getElementById('goRincianBtn').addEventListener('click', () => Rincian.open());
  document.getElementById('pmSettings').addEventListener('click', () => Settings.open());
  document.getElementById('deployOpenBtn').addEventListener('click', () => {      // modal deploy unit yang ada di Barak
    if (!canAct()) return;
    const p = players[HUMAN], baraks = p.buildings.filter(b => b.type === 'barak');
    if (!baraks.length) { alert('Belum ada Barak.'); return; }
    const b = baraks.find(x => emptyAdjacent(x.r, x.c, UNITS.infantry)) || baraks[0];
    closeAllPanels(); openDeployPanel(b, p);
  });
  Settings.apply();
  renderSidebar();
}
