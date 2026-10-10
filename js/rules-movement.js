// ====================================================================
// rules-movement.js — Aturan pergerakan: biaya MP per terrain,
// validasi occupancy (1 tile = 1 occupant), dan pathfinding jangkauan
// gerak (dibatasi MP unit). Tidak ada logika render/input di sini.
// ====================================================================

// Tetangga hex untuk peta PENUH (beda dari genNeighbors di map-gen.js
// yang hanya untuk separuh peta saat generate terrain)
function neighborsOf(r, c) {
  const offsets = (r % 2 === 0)
    ? [[-1,-1],[-1,0],[0,-1],[0,1],[1,-1],[1,0]]
    : [[-1,0],[-1,1],[0,-1],[0,1],[1,0],[1,1]];
  const out = [];
  for (const [dr, dc] of offsets) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) out.push([nr, nc]);
  }
  return out;
}

// Biaya MP masuk ke suatu tile terrain, tergantung tipe unit (Bagian 2)
function moveCost(terrainKey, def) {
  switch (terrainKey) {
    case 'valley': return Infinity;                           // tidak bisa dilewati sama sekali
    case 'mountain': return 1;                              // selalu 1 MP
    case 'road': return 1;                                   // normal; gratis terbatas ditangani di computeReachable (khusus Non-Combat)
    case 'sand': return 2;                                   // 2 MP/tile
    case 'rocks': return def.vehicle ? 2 : 1;                 // slow utk kendaraan
    case 'forest': return def.vehicle ? 2 : 1;                // slow utk kendaraan
    case 'swamp': return def.tank ? 1 : 2;                    // Tank normal, lain slow
    case 'river': return def.vehicle ? Infinity : 1;          // kendaraan butuh Jembatan
    case 'city': return def.vehicle ? Infinity : 1;           // kendaraan tak bisa masuk
    default: return 1;                                        // grass, tallgrass, ruins
  }
}

// Cari occupant (unit ATAU bangunan) di suatu tile, atau null jika kosong
function occupantAt(r, c) {
  for (const u of units) if (u.r === r && u.c === c) return u;
  return buildingAt(r, c);

}

// Ada Jembatan di tile ini? (Bagian 3: Jembatan boleh coexist dengan occupant lain di River)
function hasBridgeAt(r, c) {
  const b = buildingAt(r, c);
  return !!(b && b.type === 'jembatan');
}

// Apakah tile ini memblokir gerak/penempatan unit? Jembatan SENGAJA tidak
// dihitung sebagai penghalang (pengecualian aturan 1 tile = 1 occupant).
// v9.0: tile yang dicadangkan proyek bangunan (footprint Markas 7 tile / bangunan 3 tile) ikut memblokir.
// `self` = unit yang bertanya: cadangan miliknya sendiri tidak memblokir dirinya.
function reservedBy(r, c, self) {
  const selfSite = self && (self.buildOrder ? self.buildOrder.site : self.buildSite);
  for (const s of markasSites) if (s.id !== selfSite && s.tiles && tileIn(s.tiles, r, c)) return true;
  for (const x of units) {
    if (x === self) continue;
    let t = null;
    if (x.buildOrder && x.buildOrder.tiles && x.buildOrder.type !== 'markas' && x.buildOrder.type !== 'renov') t = x.buildOrder.tiles;
    else if (x.isBuilding && x.buildTiles && x.buildType !== 'markas' && x.buildType !== 'renov') t = x.buildTiles;
    if (t && tileIn(t, r, c)) return true;
  }
  return false;
}
function isTileBlocked(r, c, self) {
  if (reservedBy(r, c, self)) return true;
  if (units.some(u => u.r === r && u.c === c)) return true;
  const b = buildingAt(r, c);
  return !!(b && b.type !== 'jembatan');
}

// Biaya masuk tile untuk unit `def`, sudah memperhitungkan Jembatan
// (kendaraan yang tadinya terhalang River jadi bisa lewat normal lewat Jembatan)
function tileMoveCost(r, c, def) {
  let cost = moveCost(mapData[r][c], def);
  if (cost === Infinity && mapData[r][c] === 'river' && hasBridgeAt(r, c)) cost = 1;
  return cost;
}

// Cari tile kosong bersebelahan dengan (r,c) yang valid untuk unit `def`
// (dipakai saat deploy unit dari Barak / produksi Corps dari Garnisun)
function emptyAdjacent(r, c, def) {
  for (const [nr, nc] of neighborsOf(r, c)) {
    if (!mapData[nr]) continue;
    if (isTileBlocked(nr, nc)) continue;
    if (tileMoveCost(nr, nc, def) === Infinity) continue;
    return { r: nr, c: nc };
  }
  return null;
}

// Dijkstra: semua tile yang bisa dicapai unit dengan MP tersisa saat ini.
// Untuk unit Non-Combat, Road gratis MP tapi jatahnya terbatas (unit.roadFreeUsesLeft,
// direset tiap giliran) — dilacak sebagai dimensi tambahan di state pencarian (f =
// berapa kali jatah gratis sudah kepakai di jalur ini), supaya tidak bisa "curang"
// dapat jatah baru tiap kali computeReachable dipanggil ulang dalam giliran yang sama.
let lastReachableParents = new Map();
let lastReachableBestKey = new Map();

function computeReachable(unit) {
  const def = unit.type === 'corps' ? CORPS_DEF : UNITS[unit.type];
  const isNonCombat = !def.combat;
  const maxFree = isNonCombat ? unit.roadFreeUsesLeft : 0;

  const dist = new Map();    // key `r,c,f` -> cost termurah
  const parent = new Map();  // key `r,c,f` -> parent key
  const startKey = `${unit.r},${unit.c},0`;
  dist.set(startKey, 0);
  const frontier = [{ r: unit.r, c: unit.c, f: 0, cost: 0 }];

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost);
    const cur = frontier.shift();
    const curKey = `${cur.r},${cur.c},${cur.f}`;
    if (dist.get(curKey) < cur.cost) continue;
    for (const [nr, nc] of neighborsOf(cur.r, cur.c)) {
      if (isTileBlocked(nr, nc, unit) && !(nr === unit.r && nc === unit.c)) continue;
      let cost = tileMoveCost(nr, nc, def);
      let nf = cur.f;
      if (mapData[nr][nc] === 'road' && isNonCombat && cur.f < maxFree) {
        cost = 0; nf = cur.f + 1;
      }
      if (cost === Infinity) continue;
      const total = cur.cost + cost;
      if (total > unit.mp) continue;
      const nKey = `${nr},${nc},${nf}`;
      if (!dist.has(nKey) || dist.get(nKey) > total) {
        dist.set(nKey, total);
        parent.set(nKey, curKey);
        frontier.push({ r: nr, c: nc, f: nf, cost: total });
      }
    }
  }

  // Konsolidasi ke per-tile (ambil state termurah, simpan key-nya utk reconstruct nanti)
  const best = new Map(); // "r,c" -> {cost, key}
  for (const [key, cost] of dist) {
    const [r, c] = key.split(',');
    const rk = r + ',' + c;
    if (rk === unit.r + ',' + unit.c) continue;
    if (!best.has(rk) || best.get(rk).cost > cost) best.set(rk, { cost, key });
  }

  lastReachableParents = parent;
  lastReachableBestKey = new Map(Array.from(best, ([rk, v]) => [rk, v.key]));

  const result = new Map();
  for (const [rk, v] of best) result.set(rk, v.cost);
  return result;
}

// Hitung berapa banyak tile Road GRATIS yang terpakai di sepanjang jalur menuju
// tile tujuan (r,c), berdasarkan hasil computeReachable() TERAKHIR. Dipakai untuk
// mengurangi unit.roadFreeUsesLeft yang sesungguhnya setelah unit benar-benar bergerak.
function countFreeRoadUsesToTile(r, c) {
  const rk = r + ',' + c;
  let key = lastReachableBestKey.get(rk);
  if (!key) return 0;
  let count = 0;
  while (lastReachableParents.has(key)) {
    const f = Number(key.split(',')[2]);
    const pkey = lastReachableParents.get(key);
    const pf = Number(pkey.split(',')[2]);
    if (f > pf) count++;
    key = pkey;
  }
  return count;
}
