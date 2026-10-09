// lockrows.js — Baris Kunci (khusus sekutu). Tombol "🔒 Baris" -> geser di map untuk menggambar
// baris (tile berurutan, cara sama seperti Jalur). Unit sekutu yang MENGINJAK tile baris langsung
// terkunci geraknya (memakai kunci yang sama dengan tombol 🔒 Kunci Gerak) dan gerak sisanya hangus.
//  - Lepas manual : tombol 🔓 Buka Kunci di panel unit (lihat manualLockToggle).
//  - Hapus baris  : ketuk baris saat mode Baris aktif -> semua unit yang terkunci OLEH baris itu
//                   langsung lepas. Unit yang dibuka manual lalu dikunci manual lagi tidak ikut
//                   lepas (kunci manual tidak membawa penanda baris).
// Penanda di unit: u.lockLine = id baris penguncinya (null bila kunci manual),
//                  u.lockExempt = daftar id baris yang sedang diinjak saat kunci dibuka manual
//                  (tidak mengunci lagi sampai unit keluar dari baris itu).
let lockLines = [], lockMode = false, lockDraft = null, lockSeq = 1;

function toggleLockMode() {
  if (!canAct() && !lockMode) return;
  if (!lockMode && laneMode) toggleLaneMode();     // hanya satu mode gambar yang aktif
  lockMode = !lockMode; lockDraft = null;
  const b = document.getElementById('lockLineBtn');
  b.classList.toggle('on', lockMode);
  b.textContent = lockMode ? '🔒 Baris ON' : '🔒 Baris OFF';
  draw();
}

// ---------- Menggambar / menghapus ----------
function lockTry(t) {
  const d = lockDraft.tiles;
  if (!t || tileMoveCost(t.r, t.c, UNITS.infantry) === Infinity) return;
  const l = d[d.length - 1];
  if (l && !neighborsOf(l[0], l[1]).some(n => n[0] === t.r && n[1] === t.c)) return;
  if (d.some(p => p[0] === t.r && p[1] === t.c)) return;
  d.push([t.r, t.c]);
}
function lockStart(x, y) { const t = tileFromScreen(x, y); lockDraft = { tiles: [], tap: t }; lockTry(t); draw(); }
function lockMove(x, y) {
  const d = lockDraft.tiles, t = tileFromScreen(x, y);
  if (!t || !d.length) return;
  const a = hexCenter(d[d.length - 1][0], d[d.length - 1][1]), b = hexCenter(t.r, t.c);
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (HEX_SIZE * 0.7)));
  for (let i = 1; i <= n; i++) {          // isi tile yang terlewat saat geser cepat
    const wx = a.x + (b.x - a.x) * i / n, wy = a.y + (b.y - a.y) * i / n;
    lockTry(tileFromScreen(wx * scale + camX, wy * scale + camY));
  }
  draw();
}
function lockEnd() {
  const d = lockDraft; lockDraft = null;
  if (!d) return;
  if (d.tiles.length >= 2) lockLines.push({ id: lockSeq++, tiles: d.tiles });
  else if (d.tap) {
    const gone = lockLines.filter(L => L.tiles.some(p => p[0] === d.tap.r && p[1] === d.tap.c));
    if (gone.length) {
      lockLines = lockLines.filter(L => !gone.includes(L));
      releaseLockLines(gone.map(L => L.id));
    }
  }
  draw();
}

// Baris dihapus -> unit yang terkunci karena baris itu langsung lepas.
function releaseLockLines(ids) {
  let n = 0;
  units.forEach(u => {
    if (u.lockLine != null && ids.includes(u.lockLine)) { u.locked = false; u.lockLine = null; n++; }
    if (u.lockExempt) u.lockExempt = u.lockExempt.filter(id => !ids.includes(id));
  });
  if (n) logAction(`Baris Kunci dihapus: ${n} unit dilepas`);
  renderTargetPanel();
}

// ---------- Aturan kunci ----------
function lockLineAt(r, c, id) {
  return lockLines.find(l => (id === undefined || l.id === id) && l.tiles.some(p => p[0] === r && p[1] === c));
}
// Dipanggil tiap unit selesai melangkah (moveAlongPath) dan di awal eksekusi giliran pemain
// (unit yang sudah berdiri di tile baris saat baris digambar). true = unit baru saja terkunci.
function lockOnStep(u) {
  if (u.owner !== HUMAN || u.isBuilding) return false;
  if (u.lockExempt && u.lockExempt.length) u.lockExempt = u.lockExempt.filter(id => lockLineAt(u.r, u.c, id));
  if (u.locked) return false;
  const L = lockLines.find(l => !(u.lockExempt || []).includes(l.id) && l.tiles.some(p => p[0] === u.r && p[1] === u.c));
  if (!L) return false;
  u.locked = true; u.lockLine = L.id; u.lane = null; u.mp = 0;
  logAction(`${unitName(u)} #${u.id} terkunci oleh Baris Kunci`);
  return true;
}

// Tombol 🔒/🔓 di panel unit. Buka -> kebal dari baris yang sedang diinjak sampai unit keluar.
// Kunci manual -> tanpa penanda baris, jadi tidak ikut lepas saat baris dihapus.
function manualLockToggle(u) {
  if (u.locked) {
    u.locked = false; u.lockLine = null;
    u.lockExempt = lockLines.filter(l => l.tiles.some(p => p[0] === u.r && p[1] === u.c)).map(l => l.id);
  } else {
    u.locked = true; u.lockLine = null;
  }
}

// ---------- Gambar ----------
function drawLockLines() {
  const paint = (tiles, a) => {
    if (!tiles.length) return;
    const pts = tiles.map(p => hexCenter(p[0], p[1]));
    ctx.save();
    ctx.strokeStyle = Settings.hexA(Settings.get('lockColor'), a);
    ctx.lineWidth = Math.max(HEX_SIZE * 0.18, 3 / scale); ctx.lineJoin = 'round';
    ctx.setLineDash([HEX_SIZE * 0.5, HEX_SIZE * 0.3]);
    ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = a * 0.75;
    ctx.font = `${Math.max(HEX_SIZE * 0.55, 9 / scale)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    pts.forEach(q => ctx.fillText('🔒', q.x, q.y));
    ctx.restore();
  };
  lockLines.forEach(L => paint(L.tiles, 0.85));
  if (lockDraft) paint(lockDraft.tiles, 0.5);
}
