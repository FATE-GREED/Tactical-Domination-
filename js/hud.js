// ====================================================================
// hud.js — HUD v9.0 (sesuai sketsa): panel samping, waktu pertandingan, tombol kecepatan 2x,
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
  const carried = mine.filter(u => isApcType(u.type) && u.cargo && u.cargo.type === 'corps').length;   // Corps yang sedang naik APC
  const corps = mine.filter(u => isCorpsType(u.type));
  const apcs = mine.filter(u => isApcType(u.type));
  const corpsIdle = corps.filter(u => isIdleCorps(u, HUMAN)).length;
  const apcIdle = apcs.filter(u => isIdleApc(u)).length;
  const job = (type, j) => mine.filter(u => (type === 'corps' ? isCorpsType(u.type) : isApcType(u.type)) && u.job === j).length;
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

  document.getElementById('speedBtn').addEventListener('click', () => Settings.set('speed', (Math.min(4, Math.max(1, +Settings.get('speed') || 1)) % 4) + 1));
  document.getElementById('rincianBtn').addEventListener('click', () => Rincian.open());
  document.getElementById('goRincianBtn').addEventListener('click', () => Rincian.open());
  document.getElementById('pmSettings').addEventListener('click', () => Settings.open());
  document.getElementById('deployOpenBtn').addEventListener('click', () => {      // modal deploy unit yang ada di Barak
    if (!canAct()) return;
    const p = players[HUMAN];
    if (!p.buildings.some(b => b.type === 'barak')) { alert('Belum ada Barak.'); return; }
    closeAllPanels(); openDeployModal(p);          // v9.4: semua deploy lewat modal ini (barak dipilih otomatis)
  });
  // v9.0 — Radar: toggle; seluruh jarak pandang unit sekutu diwarnai ungu
  const radarBtn = document.getElementById('radarBtn');
  radarBtn.addEventListener('click', () => { radarOn = !radarOn; radarBtn.classList.toggle('on', radarOn); draw(); });

  // v9.0 — Mata: TAHAN untuk melihat unit kita dari sudut pandang musuh, lepas = kembali normal
  const eyeBtn = document.getElementById('eyeBtn');
  const setEye = on => { if (enemyView === on) return; enemyView = on; eyeBtn.classList.toggle('on', on); draw(); };
  eyeBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { eyeBtn.setPointerCapture(e.pointerId); } catch (err) {}
    setEye(true);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => eyeBtn.addEventListener(ev, () => setEye(false)));
  eyeBtn.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('blur', () => setEye(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setEye(false); });

  Settings.apply();
  renderSidebar();
}
