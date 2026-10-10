// ====================================================================
// footprint.js — Ukuran bangunan (v9.0)
//   Markas = 7 tile (bunga heksagon: tile tengah + 6 tetangga)
//   Bangunan lain = 3 tile (segitiga: 3 hex yang saling bersentuhan)
//   Jembatan = 3 tile (segitiga River) bila muat, kalau tidak 2 tile memanjang
//   Renov = aksi (bukan bangunan) yang mengubah 3 tile menjadi Grass dalam 1 giliran
// Bangunan: { r, c (= tile tengah/anchor), tiles: [[r,c],...], type, hp, seq, ... }
// Titik sambung untuk tim grafis: drawBuildingSprite(b, ownerColor, x, y) dipanggil SEKALI per
// bangunan (render.js); b.tiles = semua tile, buildingCenter(b) = titik tengah piksel.
// ====================================================================
const NON_RENOVABLE = ['valley', 'river', 'mountain'];
const canRenovTile = t => t !== 'grass' && !NON_RENOVABLE.includes(t);

const bTiles = b => b.tiles || [[b.r, b.c]];
const tileIn = (tiles, r, c) => tiles.some(t => t[0] === r && t[1] === c);

// Bangunan yang menempati tile (r,c); pIdx opsional = hanya milik pemain itu
function buildingAt(r, c, pIdx) {
  for (let i = 0; i < players.length; i++) {
    if (pIdx !== undefined && pIdx !== i) continue;
    const b = players[i].buildings.find(x => tileIn(bTiles(x), r, c));
    if (b) return b;
  }
  return null;
}
function buildingOwnerIdx(b) { return players.findIndex(p => p.buildings.includes(b)); }
function distToBuilding(r, c, b) {
  let d = Infinity;
  for (const [tr, tc] of bTiles(b)) d = Math.min(d, hexDistance(r, c, tr, tc));
  return d;
}
function nearestTileOf(b, r, c) {
  let best = null, bd = Infinity;
  for (const t of bTiles(b)) { const d = hexDistance(r, c, t[0], t[1]); if (d < bd) { bd = d; best = t; } }
  return best;
}
function buildingCenter(b) {
  const ts = bTiles(b); let sx = 0, sy = 0;
  for (const [r, c] of ts) { const p = hexCenter(r, c); sx += p.x; sy += p.y; }
  return { x: sx / ts.length, y: sy / ts.length };
}
// Tile terakhir dalam urutan gambar (baris lalu kolom): sprite digambar di sini supaya tidak tertimpa tile lain
function isLastDrawTile(b, r, c) {
  const ts = bTiles(b); let last = ts[0];
  for (const t of ts) if (t[0] > last[0] || (t[0] === last[0] && t[1] > last[1])) last = t;
  return last[0] === r && last[1] === c;
}
// Bangunan bertipe `type` milik pemain yang bersebelahan dengan unit u
function adjacentBuildingOfType(u, type) {
  for (const [nr, nc] of neighborsOf(u.r, u.c)) { const b = buildingAt(nr, nc, u.owner); if (b && b.type === type) return b; }
  return null;
}
// Tile kosong yang menempel pada bangunan (di luar footprint) — deploy Barak, Corps dari Garnisun
function emptyAdjacentBuilding(b, def) {
  const ts = bTiles(b);
  for (const [r, c] of ts) for (const [nr, nc] of neighborsOf(r, c)) {
    if (tileIn(ts, nr, nc) || isTileBlocked(nr, nc) || tileMoveCost(nr, nc, def) === Infinity) continue;
    return { r: nr, c: nc };
  }
  return null;
}
// n tile kosong berbeda yang menempel pada footprint `tiles` (untuk memindahkan Corps keluar setelah bangunan selesai)
function outsideSpots(tiles, def, n) {
  const out = [];
  for (const [r, c] of tiles) for (const [nr, nc] of neighborsOf(r, c)) {
    if (out.length >= n) return out;
    if (tileIn(tiles, nr, nc) || tileIn(out, nr, nc) || isTileBlocked(nr, nc) || tileMoveCost(nr, nc, def) === Infinity) continue;
    out.push([nr, nc]);
  }
  return out;
}

// ---------- Bentuk footprint ----------
// Semua kemungkinan bentuk yang memuat (r,c) sebagai tile pertama (anchor). Belum disaring validitasnya.
function footprintShapes(type, r, c) {
  const ring = neighborsOf(r, c);
  if (type === 'markas') return ring.length === 6 ? [[[r, c], ...ring]] : [];
  const tris = [];
  for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++)
    if (hexDistance(ring[i][0], ring[i][1], ring[j][0], ring[j][1]) === 1) tris.push([[r, c], ring[i], ring[j]]);
  if (type === 'jembatan') {
    const riv = ([a, b]) => mapData[a][b] === 'river';
    const full = tris.filter(t => t.every(riv));
    if (full.length) return full;                                  // segitiga River muat -> 3 tile
    return ring.filter(riv).map(n => [[r, c], n]);                 // kalau tidak: 2 tile memanjang
  }
  return tris;
}
// Alasan footprint `tiles` tidak valid (atau null). builders = Corps pembangun (boleh berdiri di footprint).
function footprintReason(owner, type, tiles, builders) {
  builders = builders || [];
  const self = builders[0];
  if (type === 'renov') {
    const [ar, ac] = tiles[0];
    if (tileMoveCost(ar, ac, CORPS_DEF) === Infinity) return 'tile tengah tidak bisa dipijak';
    return tiles.some(([r, c]) => canRenovTile(mapData[r][c])) ? null : 'tidak ada tile yang bisa direnov';
  }
  for (const [r, c] of tiles) {
    const terr = mapData[r][c];
    if (type === 'jembatan') {
      if (terr !== 'river') return 'butuh tile River';
      if (buildingAt(r, c)) return 'tile terisi';
      if (reservedBy(r, c, self)) return 'tile sudah dipesan';
    } else {
      if (terr !== 'grass') return 'butuh tile Grass';
      if (isTileBlocked(r, c, self) && !builders.some(b => b.r === r && b.c === c)) return 'tile terisi';
    }
  }
  return null;
}
function footprintBuilders(owner, type, r, c) {
  if (type === 'markas') return [];                                // Markas: semua 7 tile harus kosong
  const cu = nearestIdleCorps(owner, r, c);
  return cu ? [cu] : [];
}
// Bentuk yang valid untuk (owner, type) dengan anchor (r,c)
function footprintOptions(owner, type, r, c) {
  const builders = footprintBuilders(owner, type, r, c);
  return footprintShapes(type, r, c).filter(t => !footprintReason(owner, type, t, builders));
}
// Alasan umum kalau tidak ada bentuk yang valid
function footprintWhy(owner, type, r, c) {
  const shapes = footprintShapes(type, r, c);
  if (!shapes.length) return type === 'markas' ? 'terlalu dekat tepi map' : 'tidak muat di sini';
  const builders = footprintBuilders(owner, type, r, c);
  return footprintReason(owner, type, shapes[0], builders) || 'tidak muat di sini';
}

// ---------- Penggambaran footprint (pratinjau pemain + proyek yang berjalan) ----------
let fpPreview = null;                       // { type, tiles } — pratinjau saat memilih bentuk
function drawHexOutline(r, c, stroke, fill, dash) {
  const { x, y } = hexCenter(r, c), pts = hexCorners(x, y, HEX_SIZE - 1);
  ctx.beginPath(); pts.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ctx.setLineDash(dash ? [4 / scale, 3 / scale] : []);
  ctx.strokeStyle = stroke; ctx.lineWidth = 2 / scale; ctx.stroke(); ctx.setLineDash([]);
}
function drawFootprints() {
  ctx.save();
  const mark = (tiles, color) => tiles.forEach(([r, c]) => drawHexOutline(r, c, color, null, true));
  for (const s of markasSites) if (s.owner === HUMAN) mark(s.tiles, '#7ec4e8');
  for (const u of units) {
    if (u.owner !== HUMAN) continue;
    if (u.buildOrder && u.buildOrder.tiles && u.buildOrder.type !== 'markas') mark(u.buildOrder.tiles, '#7ec4e8');
    if (u.isBuilding && u.buildTiles && u.buildType !== 'markas') mark(u.buildTiles, '#ffd966');
  }
  if (fpPreview) {
    fpPreview.tiles.forEach(([r, c]) => {
      const change = fpPreview.type === 'renov' ? canRenovTile(mapData[r][c]) : true;
      drawHexOutline(r, c, change ? '#9bd06b' : '#ff8a8a', change ? 'rgba(120,220,120,0.35)' : 'rgba(255,255,255,0.18)', false);
    });
  }
  ctx.restore();
}

// ---------- Pemilih bentuk (setelah memilih jenis bangunan di hex) ----------
let fpPick = null;                          // { type, r, c, opts, i }
function closeFootprintPicker() {
  fpPick = null; fpPreview = null;
  const el = document.getElementById('deploy'); if (el) el.style.display = 'none';
  draw();
}
function openFootprintPicker(type, r, c) {
  const opts = footprintOptions(HUMAN, type, r, c);
  if (!opts.length) { alert(`Tidak bisa membangun: ${footprintWhy(HUMAN, type, r, c)}.`); return; }
  fpPick = { type, r, c, opts, i: 0 };
  renderFootprintPicker();
}
function renderFootprintPicker() {
  const { type, opts, i } = fpPick, el = document.getElementById('deploy');
  const tiles = opts[i], spec = BUILDING_TYPES[type];
  fpPreview = { type, tiles };
  const change = type === 'renov' ? tiles.filter(([r, c]) => canRenovTile(mapData[r][c])).length : 0;
  const info = type === 'renov' ? `${change} dari ${tiles.length} tile akan menjadi Grass` : `${tiles.length} tile`;
  el.style.display = 'block';
  el.innerHTML = `<span class="close" id="deployclose">✕</span><h3>${spec.name} — pilih bentuk</h3>` +
    `<div class="unitrow"><span>Bentuk ${i + 1}/${opts.length} • ${info}</span>${opts.length > 1 ? '<button id="fpRot">↻ Putar</button>' : ''}</div>` +
    `<div class="unitrow"><span>${spec.turnsRequired} giliran${spec.corpsRequired > 1 ? ', ' + spec.corpsRequired + ' Corps' : ''}</span><button id="fpOk">✓ ${type === 'renov' ? 'Renov' : 'Bangun'}</button></div>`;
  document.getElementById('deployclose').addEventListener('click', closeFootprintPicker);
  const rot = document.getElementById('fpRot');
  if (rot) rot.addEventListener('click', () => { fpPick.i = (fpPick.i + 1) % fpPick.opts.length; renderFootprintPicker(); });
  document.getElementById('fpOk').addEventListener('click', () => {
    const p = fpPick, res = orderBuild(HUMAN, p.type, p.r, p.c, p.opts[p.i]);
    closeFootprintPicker();
    if (res.ok) { showGenericResult(res.message); logAction(res.message); } else alert(res.message);
    renderTargetPanel(); draw();
  });
  if (typeof focusOnTile === 'function') { /* peta tidak digeser: pemain sudah melihat hex-nya */ }
  draw();
}
