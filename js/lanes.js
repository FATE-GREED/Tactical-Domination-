// lanes.js — Jalur (khusus sekutu). Tombol "Jalur" -> geser di map untuk menggambar jalur
// (tile berurutan). Unit sekutu yang menginjak jalur mengalir ke ujungnya (lihat execLane di
// rules-auto.js). Ketuk sebuah jalur saat mode Jalur aktif = hapus jalur itu.
let lanes = [], laneMode = false, laneDraft = null, laneSeq = 1;

function toggleLaneMode() {
  if (!canAct() && !laneMode) return;
  if (!laneMode && lockMode) toggleLockMode();   // hanya satu mode gambar yang aktif
  laneMode = !laneMode; laneDraft = null;
  const b = document.getElementById('laneBtn');
  b.classList.toggle('on', laneMode);
  b.textContent = laneMode ? '🌊 Jalur: ON' : '🌊 Jalur';
  draw();
}
function laneTry(t) {
  const d = laneDraft.tiles;
  if (!t || tileMoveCost(t.r, t.c, UNITS.infantry) === Infinity) return;
  const l = d[d.length - 1];
  if (l && !neighborsOf(l[0], l[1]).some(n => n[0] === t.r && n[1] === t.c)) return;
  if (d.some(p => p[0] === t.r && p[1] === t.c)) return;
  d.push([t.r, t.c]);
}
function laneStart(x, y) { const t = tileFromScreen(x, y); laneDraft = { tiles: [], tap: t }; laneTry(t); draw(); }
function laneMove(x, y) {
  const d = laneDraft.tiles, t = tileFromScreen(x, y);
  if (!t || !d.length) return;
  const a = hexCenter(d[d.length - 1][0], d[d.length - 1][1]), b = hexCenter(t.r, t.c);
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (HEX_SIZE * 0.7)));
  for (let i = 1; i <= n; i++) {          // isi tile yang terlewat saat geser cepat
    const wx = a.x + (b.x - a.x) * i / n, wy = a.y + (b.y - a.y) * i / n;
    laneTry(tileFromScreen(wx * scale + camX, wy * scale + camY));
  }
  draw();
}
function laneEnd() {
  const d = laneDraft; laneDraft = null;
  if (!d) return;
  if (d.tiles.length >= 2) lanes.push({ id: laneSeq++, tiles: d.tiles });
  else if (d.tap) lanes = lanes.filter(L => !L.tiles.some(p => p[0] === d.tap.r && p[1] === d.tap.c));
  draw();
}
function drawLanes() {
  const paint = (tiles, a) => {
    if (!tiles.length) return;
    const pts = tiles.map(p => hexCenter(p[0], p[1]));
    ctx.strokeStyle = `rgba(90,169,255,${a})`; ctx.fillStyle = `rgba(150,205,255,${a})`;
    ctx.lineWidth = Math.max(HEX_SIZE * 0.22, 3 / scale); ctx.lineJoin = 'round';
    ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke();
    ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, HEX_SIZE * 0.3, 0, Math.PI * 2); ctx.fill();
    const s = HEX_SIZE * 0.3;
    for (let i = 1; i < pts.length; i++) {          // panah arah di tiap ruas
      const p = pts[i - 1], q = pts[i], ang = Math.atan2(q.y - p.y, q.x - p.x), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      ctx.beginPath();
      ctx.moveTo(mx + Math.cos(ang) * s, my + Math.sin(ang) * s);
      ctx.lineTo(mx + Math.cos(ang + 2.5) * s, my + Math.sin(ang + 2.5) * s);
      ctx.lineTo(mx + Math.cos(ang - 2.5) * s, my + Math.sin(ang - 2.5) * s);
      ctx.fill();
    }
  };
  lanes.forEach(L => paint(L.tiles, 0.8));
  if (laneDraft) paint(laneDraft.tiles, 0.5);
}
