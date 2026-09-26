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
    case 'mountain': return 1;                              // selalu 1 MP
    case 'road': return 0;                                   // tidak makan MP
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
  for (const p of players) for (const b of p.buildings) if (b.r === r && b.c === c) return b;
  return null;
}

// Ada Jembatan di tile ini? (Bagian 3: Jembatan boleh coexist dengan occupant lain di River)
function hasBridgeAt(r, c) {
  return players.some(p => p.buildings.some(b => b.type === 'jembatan' && b.r === r && b.c === c));
}

// Apakah tile ini memblokir gerak/penempatan unit? Jembatan SENGAJA tidak
// dihitung sebagai penghalang (pengecualian aturan 1 tile = 1 occupant).
function isTileBlocked(r, c) {
  if (units.some(u => u.r === r && u.c === c)) return true;
  for (const p of players) {
    const b = p.buildings.find(bb => bb.r === r && bb.c === c);
    if (b && b.type !== 'jembatan') return true;
  }
  return false;
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

// Dijkstra sederhana: semua tile yang bisa dicapai unit dengan MP tersisa saat ini
function computeReachable(unit) {
  const def = unit.type === 'corps' ? CORPS_DEF : UNITS[unit.type];
  const dist = new Map();
  const start = unit.r + ',' + unit.c;
  dist.set(start, 0);
  const frontier = [{ r: unit.r, c: unit.c, cost: 0 }];
  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost);
    const cur = frontier.shift();
    const key = cur.r + ',' + cur.c;
    if (dist.get(key) < cur.cost) continue;
    for (const [nr, nc] of neighborsOf(cur.r, cur.c)) {
      if (isTileBlocked(nr, nc) && !(nr === unit.r && nc === unit.c)) continue; // tile terisi, tidak bisa lewat
      const cost = tileMoveCost(nr, nc, def);
      if (cost === Infinity) continue;
      const total = cur.cost + cost;
      if (total > unit.mp) continue;
      const nk = nr + ',' + nc;
      if (!dist.has(nk) || dist.get(nk) > total) {
        dist.set(nk, total);
        frontier.push({ r: nr, c: nc, cost: total });
      }
    }
  }
  dist.delete(start);
  return dist;
}
