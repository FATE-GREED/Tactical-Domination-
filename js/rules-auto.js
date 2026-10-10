// ====================================================================
// rules-auto.js — Sistem giliran baru: fase RENCANA (30 detik) lalu
// fase EKSEKUSI otomatis. Pemain 1 lalu Pemain 2.
//   - Tiap unit punya target (entitas musuh / hex / default).
//     Default unit tempur = Markas musuh terdekat. Unit non-combat
//     default = nganggur, atau menjalankan job (isi fuel / isi medical).
//   - Eksekusi: unit diproses berurutan sesuai urutan deploy (id kecil
//     dulu). Tiap unit bergerak menuju targetnya (pathfinding, dibatasi
//     MP seperti aturan lama), lalu menyerang otomatis.
//   - Prioritas serang (v8.9): Benteng (taunt) > Markas > Bangunan lain (terdekat, lebih dulu
//     dibangun, HP paling sedikit) > Unit (terdekat, lebih dulu deploy) > acak.
// Aturan dasar (damage, MP, terrain, supply, build) TIDAK diubah.
// ====================================================================

// sleep ikut berhenti selama game di-pause (eksekusi membeku di antara langkah)
async function wait(ms) {
  await new Promise(res => setTimeout(res, ms));
  while (paused && !gameOver) await new Promise(res => setTimeout(res, 100));
}
// v8.9: kecepatan normal = 2x lebih lambat; tombol 2x mengembalikan kecepatan lama (Settings.timeScale)
async function sleep(ms) { return wait(ms * Settings.timeScale()); }
// Pemain manusia boleh memberi perintah: fase rencana, giliran manusia, tidak pause
function canAct() { return phase === 'plan' && currentPlayerIdx === HUMAN && !paused && !gameOver; }
function defOf(u) { return u.type === 'corps' ? CORPS_DEF : UNITS[u.type]; }
function unitName(u) { return u.type === 'corps' ? 'Corps' : UNITS[u.type].name; }
function tileFree(u, r, c) { return (r === u.r && c === u.c) || !isTileBlocked(r, c, u); }

// ---------------------------------------------------------------
// Target
// ---------------------------------------------------------------
function nearestEnemyMarkas(u) {
  let best = null, bd = Infinity;
  for (const b of players[1 - u.owner].buildings) {
    if (b.type !== 'markas') continue;
    const d = distToBuilding(u.r, u.c, b);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

// Posisi target saat ini. Target hilang (mati / tak terlihat) -> kembali default.
function resolveTarget(u) {
  const t = u.target;
  if (t) {
    if (t.kind === 'hex') return { kind: 'hex', r: t.r, c: t.c };
    if (t.kind === 'unit') {
      const e = units.find(x => x.id === t.id && x.owner !== u.owner);
      if (e && !isUnitUnseen(e)) return { kind: 'unit', r: e.r, c: e.c, obj: e };
      u.target = null;
    } else if (t.kind === 'building') {
      if (players[1 - u.owner].buildings.includes(t.ref)) { const nt = nearestTileOf(t.ref, u.r, u.c); return { kind: 'building', r: nt[0], c: nt[1], obj: t.ref }; }
      u.target = null;
    }
  }
  if (!defOf(u).combat) return null;
  const m = nearestEnemyMarkas(u);
  if (!m) return null;
  const nt = nearestTileOf(m, u.r, u.c);                       // v9.0: bangunan multi-tile -> tile terdekat
  return { kind: 'building', r: nt[0], c: nt[1], obj: m, isDefault: true };
}

// Batalkan pesanan Markas milik Corps ini (pesanan Markas melibatkan 2 Corps, jadi pasangannya ikut batal)
function cancelMarkasSite(site, u) {
  if (site) {
    markasSites = markasSites.filter(s => s !== site);
    for (const id of site.corpsIds) {
      const x = units.find(y => y.id === id);
      if (x && x.buildOrder && x.buildOrder.site === site.id) { x.buildOrder = null; x.target = null; }
    }
  }
  if (u) { u.buildOrder = null; u.target = null; }
}
function dropBuildOrder(u) {
  if (u.buildOrder && u.buildOrder.type === 'markas') cancelMarkasSite(markasSites.find(s => s.id === u.buildOrder.site), u);
}
function setUnitTarget(u, target) { dropBuildOrder(u); u.focus = null; u.target = target; u.buildOrder = null; u.haul = null; if (!defOf(u).combat) u.job = 'idle'; }
function resetUnit(u) { dropBuildOrder(u); u.focus = null; u.target = null; u.buildOrder = null; u.haul = null; u.job = 'idle'; }
function setJob(u, job) { dropBuildOrder(u); u.focus = null; u.job = job; u.target = null; u.buildOrder = null; u.haul = null; }
// Job Angkut (APC): jemput Corps `corpsId`, antar ke `dest` ({r,c}) bila ada; tanpa tujuan APC diam.
function setHaulJob(u, corpsId, dest) { dropBuildOrder(u); u.job = 'angkut'; u.target = null; u.buildOrder = null; u.haul = { corpsId, dest: dest || null }; }

// ---------------------------------------------------------------
// Perintah bangun (tekan lama hex -> Bangun)
// ---------------------------------------------------------------
function isIdleCorps(u, owner) {
  return u.owner === owner && u.type === 'corps' && !u.isBuilding && !u.cargo && !u.buildOrder && !u.target && u.job === 'idle';
}
function nearestIdleCorps(owner, r, c) {
  let best = null, bd = Infinity;
  for (const u of units) {
    if (!isIdleCorps(u, owner)) continue;
    const d = hexDistance(u.r, u.c, r, c);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
function pendingBuildCount(owner, type) {
  if (type === 'markas') return markasSites.filter(s => s.owner === owner).length; // 1 pesanan = 2 Corps
  return units.filter(u => u.owner === owner && u.buildOrder && u.buildOrder.type === type).length;
}
// Cek apakah bangunan `type` boleh dipesan dengan tile tengah (r,c). Mengembalikan alasan penolakan atau null.
function buildOrderBlockReason(owner, type, r, c) {
  const spec = BUILDING_TYPES[type];
  const p = players[owner];
  const count = p.buildings.filter(b => b.type === type).length + pendingBuildCount(owner, type);
  if (count >= spec.maxCount) return 'maks tercapai';
  if (!footprintOptions(owner, type, r, c).length) return footprintWhy(owner, type, r, c);   // footprint.js
  if (type === 'markas') {
    if (idleCorpsSorted(owner, r, c).length < spec.corpsRequired) return `butuh ${spec.corpsRequired} Corps nganggur`;
    if (siteSlots(r, c, []).length < spec.corpsRequired) return 'ruang di sekitar tile kurang';
  } else if (!nearestIdleCorps(owner, r, c)) return 'tidak ada Corps nganggur';
  return null;
}
function idleCorpsSorted(owner, r, c) {
  return units.filter(u => isIdleCorps(u, owner)).sort((a, b) => hexDistance(a.r, a.c, r, c) - hexDistance(b.r, b.c, r, c));
}
// Tile kosong di samping (r,c) yang bisa dipijak Corps (tempat Corps berdiri saat membangun Markas)
function siteSlots(r, c, taken, self) {
  return neighborsOf(r, c)
    .filter(([nr, nc]) => !isTileBlocked(nr, nc, self) && tileMoveCost(nr, nc, CORPS_DEF) !== Infinity && !taken.some(t => t[0] === nr && t[1] === nc))
    .map(([nr, nc]) => ({ r: nr, c: nc }));
}
function orderBuild(owner, type, r, c, tiles) {
  const why = buildOrderBlockReason(owner, type, r, c);
  if (why) return { ok: false, message: `Tidak bisa membangun: ${why}.` };
  const opts = footprintOptions(owner, type, r, c);
  const same = (a, b) => a.length === b.length && a.every(t => tileIn(b, t[0], t[1]));
  const fp = (tiles && opts.find(o => same(o, tiles))) || opts[0];   // bentuk pilihan pemain, atau bentuk pertama yang valid
  if (type === 'markas') {                      // Markas: 2 Corps terdekat otomatis dipanggil, membangun di samping tile
    const spec = BUILDING_TYPES.markas;
    const cs = idleCorpsSorted(owner, r, c).slice(0, spec.corpsRequired);
    const slots = siteSlots(r, c, []);
    const site = { id: siteSeq++, owner, r, c, tiles: fp, corpsIds: cs.map(x => x.id), started: false, turnsRemaining: spec.turnsRequired };
    const used = [];
    for (const cu of cs) {
      const s = slots.filter(x => !used.includes(x)).sort((a, b) => hexDistance(cu.r, cu.c, a.r, a.c) - hexDistance(cu.r, cu.c, b.r, b.c))[0];
      used.push(s);
      cu.buildOrder = { type, r, c, slot: { r: s.r, c: s.c }, site: site.id };
      cu.target = { kind: 'hex', r: s.r, c: s.c };
    }
    markasSites.push(site);
    return { ok: true, message: `Corps #${cs.map(x => x.id).join(' & #')} berangkat membangun Markas di (${r},${c}).` };
  }
  const corps = nearestIdleCorps(owner, r, c);
  corps.buildOrder = { type, r, c, tiles: fp };
  corps.target = { kind: 'hex', r, c };
  return { ok: true, message: `Corps #${corps.id} berangkat ${type === 'renov' ? 'merenov' : 'membangun ' + BUILDING_TYPES[type].name} di (${r},${c}).` };
}

// ---------------------------------------------------------------
// Deploy unit dari Barak (dipakai tombol Deploy & bot)
// ---------------------------------------------------------------
function doDeploy(key, barak, player) {
  const def = UNITS[key];
  if (player.barakSlots <= 0 || player.resources.kredit < def.price) return false;
  const spot = emptyAdjacentBuilding(barak, def);
  if (!spot) return false;
  player.resources.kredit -= def.price;
  Stats.use(player, 'kredit', def.price);
  player.barakSlots--;
  units.push({ id: uidCounter++, owner: player.id - 1, type: key, r: spot.r, c: spot.c, mp: 0, fuel: def.hasFuel ? def.fuelMax : 0, hp: def.hp, attacked: false, speedDebuffTurns: 0, cargo: null, isBuilding: false, assaultExtend: 0, assaultGraceUsed: false, ambushAtkTimer: 0, ambushWasUnseen: false, intimidatedTurns: 0, semangatBesiUsed: false, roadFreeUsesLeft: 2, target: null, job: 'idle', buildOrder: null, locked: false });
  return true;
}

// ---------------------------------------------------------------
// Pathfinding (Dijkstra pada seluruh map, biaya terrain = aturan lama)
// Unit sekutu boleh dilewati (dengan penalti), musuh & bangunan tidak.
// ---------------------------------------------------------------
function findPath(u, goalFn, extraBlocked, near) {
  const def = defOf(u);
  const key = (r, c) => r * COLS + c;
  const occ = new Map();
  for (const o of units) if (o !== u) occ.set(key(o.r, o.c), o.owner === u.owner ? 'ally' : 'enemy');
  for (const p of players) for (const b of p.buildings) if (b.type !== 'jembatan') for (const [br, bc] of bTiles(b)) occ.set(key(br, bc), 'block');
  const mySite = u.buildOrder ? u.buildOrder.site : u.buildSite;
  for (const s of markasSites) if (s.id !== mySite) for (const [sr, sc] of s.tiles) occ.set(key(sr, sc), 'block');
  for (const x of units) {                      // tile yang dicadangkan proyek bangunan Corps lain
    if (x === u) continue;
    const t = (x.buildOrder && x.buildOrder.tiles && x.buildOrder.type !== 'markas' && x.buildOrder.type !== 'renov') ? x.buildOrder.tiles
      : (x.isBuilding && x.buildTiles && x.buildType !== 'markas' && x.buildType !== 'renov') ? x.buildTiles : null;
    if (t) for (const [tr, tc] of t) occ.set(key(tr, tc), 'block');
  }

  const N = ROWS * COLS;
  const dist = new Array(N).fill(Infinity), prev = new Array(N).fill(-1);
  const start = key(u.r, u.c);
  dist[start] = 0;
  const open = [{ r: u.r, c: u.c, d: 0 }];
  let best = null, bestH = near ? hexDistance(u.r, u.c, near.r, near.c) : Infinity, bestD = 0;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].d < open[bi].d) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.r, cur.c);
    if (cur.d > dist[ck]) continue;
    if (near && tileFree(u, cur.r, cur.c)) {
      const h = hexDistance(cur.r, cur.c, near.r, near.c);
      if (h < bestH || (h === bestH && best && cur.d < bestD)) { best = ck; bestH = h; bestD = cur.d; }
    }
    if (goalFn(cur.r, cur.c)) {
      const path = [];
      let k = ck;
      while (k !== start) { path.push([Math.floor(k / COLS), k % COLS]); k = prev[k]; }
      path.reverse();
      return path;
    }
    for (const [nr, nc] of neighborsOf(cur.r, cur.c)) {
      const nk = key(nr, nc);
      const o = occ.get(nk);
      if (o === 'enemy' || o === 'block') continue;
      if (extraBlocked && extraBlocked.has(nk)) continue;
      let cost = tileMoveCost(nr, nc, def);
      if (cost === Infinity) continue;
      if (o === 'ally') cost += 2;
      const nd = cur.d + cost;
      if (nd < dist[nk]) { dist[nk] = nd; prev[nk] = ck; open.push({ r: nr, c: nc, d: nd }); }
    }
  }
  // Tidak ada rute ke tujuan: maju sedekat mungkin (kalau memang lebih dekat dari posisi sekarang)
  if (near && best !== null && best !== start) {
    const path = [];
    let k = best;
    while (k !== start) { path.push([Math.floor(k / COLS), k % COLS]); k = prev[k]; }
    path.reverse();
    return path;
  }
  return null;
}

// Jalani path selama MP cukup. Mengembalikan {moved, blockedAt}: blockedAt = tile yang
// ternyata terisi (supaya pemanggil bisa mencari jalan memutar).
async function moveAlongPath(u, path) {
  const def = defOf(u);
  const nonCombat = !def.combat;
  let moved = false, blockedAt = null;
  for (const [r, c] of path) {
    if (isTileBlocked(r, c, u)) { blockedAt = [r, c]; break; }   // cadangan footprint milik Corps sendiri tidak memblokir
    let cost = tileMoveCost(r, c, def);
    let free = false;
    if (mapData[r][c] === 'road' && nonCombat && u.roadFreeUsesLeft > 0) { cost = 0; free = true; }
    if (cost === Infinity || cost > u.mp) break;
    const fr = u.r, fc = u.c;
    u.mp -= cost;
    if (free) u.roadFreeUsesLeft--;
    u.r = r; u.c = c;
    moved = true;
    startMoveAnim(u, fr, fc, 170);
    Sfx.move(u);
    await sleep(180);
    if (lockOnStep(u)) break;                   // menginjak Baris Kunci -> langsung terkunci (lockrows.js)
    if (laneJoin(u)) break;                     // baru menginjak jalur -> langsung ikut jalur
  }
  return { moved, blockedAt };
}

// Bergerak ke tujuan; kalau terhalang unit lain, hitung ulang jalur memutar.
// `near` = titik acuan untuk fallback "sedekat mungkin" bila tujuan tak terjangkau.
async function moveToward(u, goalFn, near) {
  if (u.locked || u.mp <= 0) return false;      // kunci: unit tidak ikut bergerak
  const extra = new Set();
  let movedAny = false;
  for (let attempt = 0; attempt < 8 && u.mp > 0; attempt++) {
    const path = findPath(u, goalFn, extra, near);
    if (!path || path.length === 0) break;
    const res = await moveAlongPath(u, path);
    if (res.moved) movedAny = true;
    if (!res.blockedAt) break;
    extra.add(res.blockedAt[0] * COLS + res.blockedAt[1]);
  }
  if (movedAny) { logAction(`${unitName(u)} #${u.id} bergerak ke (${u.r},${u.c})`, 'combat'); draw(); }
  return movedAny;
}

// ---------------------------------------------------------------
// Serang otomatis
// ---------------------------------------------------------------
function pickAutoTarget(u) {
  const cands = computeAttackable(u).map(t => {
    const info = describeTarget(t.r, t.c);
    const d = hexDistance(u.r, u.c, t.r, t.c);
    let cat, k1, k2 = 0;
    if (info.kind === 'building') { cat = info.obj.type === 'benteng' ? 0 : info.obj.type === 'markas' ? 1 : 2; k1 = info.obj.seq || 0; k2 = info.obj.hp; }  // Benteng = taunt
    else { cat = 3; k1 = info.obj.id; }
    return { r: t.r, c: t.c, cat, d, k1, k2, rnd: Math.random() };
  });
  if (!cands.length) return null;
  cands.sort((a, b) => a.cat - b.cat || a.d - b.d || a.k1 - b.k1 || a.k2 - b.k2 || a.rnd - b.rnd);
  return cands[0];
}

async function autoAttack(u) {
  if (u.attacked || !units.includes(u)) return;
  const pick = pickAutoTarget(u);
  if (!pick) return;
  const fr = u.r, fc = u.c;
  const info = describeTarget(pick.r, pick.c);
  const res = applyAttack(u, pick.r, pick.c);
  if (!res.ok) return;
  dmgFeedAdd(u, res.targetName, info ? info.ownerIdx : 1 - u.owner, res.damage);
  startAttackFx(fr, fc, pick.r, pick.c, res.damage);
  Sfx.shoot(u, info ? info.ownerIdx : 1 - u.owner, res);
  if (res.destroyed && (u.owner === HUMAN || (info && info.ownerIdx === HUMAN) || !isUnitUnseen(u)))
    killFeedAdd(unitName(u), u.owner, res.targetName, info ? info.ownerIdx : 1 - u.owner);
  renderResourcePanels();
  draw();
  logAction(`${unitName(u)} #${u.id} serang ${res.targetName}: ${res.damage} dmg${res.destroyed ? ' (HANCUR)' : ''}`, 'combat');
  await sleep(520);
}

// ---------------------------------------------------------------
// Eksekusi per jenis unit
// ---------------------------------------------------------------
function goalForTarget(u, tgt, reach) {
  // reach = jarak maksimum dari target agar dianggap "sampai"
  if (tgt.kind === 'hex') {
    const occupied = isTileBlocked(tgt.r, tgt.c) && !(u.r === tgt.r && u.c === tgt.c);
    return (r, c) => tileFree(u, r, c) && (occupied ? hexDistance(r, c, tgt.r, tgt.c) <= 1 : (r === tgt.r && c === tgt.c));
  }
  const def = defOf(u);
  return (r, c) => tileFree(u, r, c) && hexDistance(r, c, tgt.r, tgt.c) <= (reach === 'range' ? rangeAtTile(def, r, c) : reach);
}

function clearReachedHex(u) {
  if (u.target && u.target.kind === 'hex' && u.r === u.target.r && u.c === u.target.c) u.target = null;
}

// ---------------------------------------------------------------
// Jalur (khusus sekutu): unit di tile jalur mengalir ke tile berikutnya sampai ujung, lalu kembali
// ke perilaku default. Terhalang -> menuju tile jalur terdekat di depan (moveToward menghitung
// jalan memutar). Di persimpangan, jalur diundi acak. Jalur yang sudah selesai tidak diikuti lagi.
function laneOpts(u) {
  const out = [];
  for (const L of lanes) {
    if ((u.laneDone || []).includes(L.id)) continue;
    const i = L.tiles.findIndex(p => p[0] === u.r && p[1] === u.c);
    if (i >= 0) out.push({ L, i });
  }
  return out;
}
function laneJoin(u) {
  if (u.owner !== HUMAN || u.locked || u.lane || !lanes.length) return false;
  const o = laneOpts(u).filter(x => x.i < x.L.tiles.length - 1);
  if (!o.length) return false;
  const p = o[Math.floor(Math.random() * o.length)];
  u.lane = { id: p.L.id, idx: p.i };
  return true;
}
async function execLane(u) {
  if (u.owner !== HUMAN || u.locked || !lanes.length) return false;
  if (!u.lane && !lanes.some(L => L.tiles.some(p => p[0] === u.r && p[1] === u.c))) u.laneDone = [];
  for (let g = 0; g < 60 && u.mp > 0 && units.includes(u); g++) {
    let opts = laneOpts(u);
    for (const o of opts) if (o.i >= o.L.tiles.length - 1) { (u.laneDone = u.laneDone || []).push(o.L.id); if (u.lane && u.lane.id === o.L.id) u.lane = null; }
    opts = opts.filter(o => o.i < o.L.tiles.length - 1);
    if (u.lane && !lanes.some(l => l.id === u.lane.id)) u.lane = null;        // jalur dihapus pemain
    if (opts.length > 1 || (opts.length === 1 && !u.lane)) {
      const p = opts[Math.floor(Math.random() * opts.length)]; u.lane = { id: p.L.id, idx: p.i };
    } else if (opts.length === 1) u.lane = { id: opts[0].L.id, idx: opts[0].i };
    if (!u.lane) return false;
    const L = lanes.find(l => l.id === u.lane.id), e = L.tiles[L.tiles.length - 1];
    if (hexDistance(u.r, u.c, e[0], e[1]) <= 1 && isTileBlocked(e[0], e[1])) { (u.laneDone = u.laneDone || []).push(L.id); u.lane = null; continue; }
    const ahead = new Set(L.tiles.slice(u.lane.idx + 1).map(p => p[0] * COLS + p[1]));
    if (!(await moveToward(u, (r, c) => ahead.has(r * COLS + c) && tileFree(u, r, c), null))) break;
    const j = L.tiles.findIndex(p => p[0] === u.r && p[1] === u.c);
    if (j > u.lane.idx) u.lane.idx = j;
  }
  return !!u.lane;
}

async function execCombat(u) {
  applySemangatBesi(u);
  const busy = await execLane(u);
  const tgt = resolveTarget(u);
  if (!busy && tgt && u.mp > 0) { await moveToward(u, goalForTarget(u, tgt, 'range'), tgt); if (u.lane) await execLane(u); }
  clearReachedHex(u);
  await autoAttack(u);
}

// Markas: 2 Corps berdiri di tile samping Markas; hitungan giliran baru mulai saat keduanya sudah tiba.
async function execMarkasOrder(u) {
  const o = u.buildOrder;
  const site = markasSites.find(s => s.id === o.site);
  const mate = site && units.find(x => x.id === site.corpsIds.find(id => id !== u.id));
  if (!site || !mate) { cancelMarkasSite(site, u); return; }
  const atSlot = x => x.buildOrder && x.r === x.buildOrder.slot.r && x.c === x.buildOrder.slot.c;
  if (!atSlot(u)) {
    let s = o.slot;
    if (isTileBlocked(s.r, s.c, u)) {             // slot terisi unit lain -> cari tile samping lain
      const taken = mate.buildOrder ? [[mate.buildOrder.slot.r, mate.buildOrder.slot.c]] : [];
      const alt = siteSlots(site.r, site.c, taken, u).sort((a, b) => hexDistance(u.r, u.c, a.r, a.c) - hexDistance(u.r, u.c, b.r, b.c))[0];
      if (alt) { o.slot = { r: alt.r, c: alt.c }; s = o.slot; u.target = { kind: 'hex', r: s.r, c: s.c }; }
    }
    await moveToward(u, (r, c) => r === s.r && c === s.c && tileFree(u, r, c), s);
  }
  if (atSlot(u) && atSlot(mate)) {
    const spec = BUILDING_TYPES.markas;
    for (const x of [u, mate]) {
      x.isBuilding = true; x.buildType = 'markas'; x.buildSite = site.id; x.buildTurnsRemaining = spec.turnsRequired;
      x.attacked = true; x.mp = 0; x.buildOrder = null; x.target = null;
    }
    site.started = true; site.turnsRemaining = spec.turnsRequired;
    logAction(`Corps #${u.id} & #${mate.id}: mulai membangun Markas (${spec.turnsRequired} giliran).`);
    actAdd(u.owner, [['Corps', 'unit'], [' membangun '], ['Markas', 'bld']]);
    renderResourcePanels(); draw();
    await sleep(250);
  }
}

async function execBuildOrder(u) {
  const o = u.buildOrder;
  if (o.type === 'markas') return execMarkasOrder(u);
  if (u.r !== o.r || u.c !== o.c) await moveToward(u, (r, c) => r === o.r && c === o.c && tileFree(u, r, c), o);
  if (u.r === o.r && u.c === o.c) {
    const res = startBuild(u, o.type, o.tiles);
    u.buildOrder = null; u.target = null;
    logAction(`Corps #${u.id}: ${res.message}`);
    renderResourcePanels(); draw();
    await sleep(250);
  }
}

// ---- Fokus supply (v8.9) ----
const FOCUS_SUPPLY_R = 15;   // hanya mengisi unit dalam radius ini dari titik fokus
const FOCUS_LEASH_R = 20;    // supplier berusaha tidak lebih jauh dari ini (kecuali pergi isi ulang)
function focusAnchor(u) {
  const f = u.focus; if (!f) return null;
  if (f.unitId != null) {
    const t = units.find(x => x.id === f.unitId && x.owner === u.owner);
    if (!t) { u.focus = null; return null; }
    return { r: t.r, c: t.c };
  }
  return { r: f.r, c: f.c };
}
// Corps/APC ber-job isi fuel/medical yang sedang menganggur -> diberi tanda (!)
function supplyIdle(u) {
  if (u.owner !== HUMAN || u.isBuilding || defOf(u).combat || (u.job !== 'fuel' && u.job !== 'medical')) return false;
  const ct = u.job === 'fuel' ? 'fuel' : 'medical', p = players[u.owner];
  if (u.cargo && u.cargo.type !== ct) return false;
  if (!u.cargo) return p.resources[ct] <= 0 || !p.buildings.some(b => b.type === (ct === 'fuel' ? 'pom' : 'pospemulihan'));
  const a = focusAnchor(u);
  return !units.some(o => o !== u && o.owner === u.owner && needsSupply(o, ct) && (!a || hexDistance(a.r, a.c, o.r, o.c) <= FOCUS_SUPPLY_R));
}

function needsSupply(o, cargoType) {
  const d = defOf(o);
  return cargoType === 'fuel' ? (d.hasFuel && o.fuel <= 0) : (o.hp < d.hp);
}

async function execJob(u) {
  const isFuel = u.job === 'fuel';
  const ct = isFuel ? 'fuel' : 'medical';
  const srcType = isFuel ? 'pom' : 'pospemulihan';
  const p = players[u.owner];
  if (u.cargo && u.cargo.type !== ct) return;               // sedang membawa muatan lain
  const adj = (tx, ty) => (r, c) => tileFree(u, r, c) && hexDistance(r, c, tx, ty) <= 1;
  const adjB = b => (r, c) => tileFree(u, r, c) && distToBuilding(r, c, b) <= 1;     // v9.0: bangunan multi-tile
  const byDist = (a, b) => hexDistance(u.r, u.c, a.r, a.c) - hexDistance(u.r, u.c, b.r, b.c);

  if (!u.cargo) {                                           // 1) ambil muatan di Pom / Pos Pemulihan
    if (p.resources[ct] <= 0) return;
    const srcs = p.buildings.filter(b => b.type === srcType).sort((a, b) => distToBuilding(u.r, u.c, a) - distToBuilding(u.r, u.c, b));
    if (!srcs.length) return;
    const s = srcs[0];
    if (distToBuilding(u.r, u.c, s) > 1) await moveToward(u, adjB(s), s);
    if (distToBuilding(u.r, u.c, s) === 1 && !u.attacked) {
      const res = loadCargo(u, ct);
      if (res.ok) { logAction(`${unitName(u)} #${u.id}: ${res.message}`); renderResourcePanels(); draw(); await sleep(250); }
    }
    return;
  }

  const anchor = focusAnchor(u);                            // v8.9: fokus ke unit/hex pilihan pemain
  const nearF = (o, lim) => !anchor || hexDistance(anchor.r, anchor.c, o.r, o.c) <= lim;
  const needy = units.filter(o => o !== u && o.owner === u.owner && needsSupply(o, ct) && nearF(o, FOCUS_SUPPLY_R));
  if (isFuel) needy.sort(byDist);
  else needy.sort((a, b) => (a.hp / defOf(a).hp) - (b.hp / defOf(b).hp) || byDist(a, b));
  if (needy.length) {                                       // 2) ada yang butuh -> mendekat & isi
    const t = needy[0];
    if (hexDistance(u.r, u.c, t.r, t.c) > 1) await moveToward(u, adj(t.r, t.c), t);
    if (units.includes(t) && hexDistance(u.r, u.c, t.r, t.c) === 1 && !u.attacked) {
      const res = isFuel ? performSupplyFuel(u, t) : performSupplyMedical(u, t);
      if (res.ok) { logAction(`${unitName(u)} #${u.id} → ${unitName(t)} #${t.id}: ${res.message}`); renderResourcePanels(); draw(); await sleep(300); }
    }
    return;
  }
  // 3) tidak ada yang butuh -> ikuti unit terdekat
  const pool = units.filter(o => o !== u && o.owner === u.owner && (isFuel ? (defOf(o).vehicle && defOf(o).hasFuel) : defOf(o).combat) && nearF(o, FOCUS_LEASH_R)).sort(byDist);
  if (pool.length && hexDistance(u.r, u.c, pool[0].r, pool[0].c) > 1) await moveToward(u, adj(pool[0].r, pool[0].c), pool[0]);
  else if (!pool.length && anchor && hexDistance(u.r, u.c, anchor.r, anchor.c) > FOCUS_LEASH_R) await moveToward(u, adj(anchor.r, anchor.c), anchor);   // jangan menjauh >20 tile dari fokus (kecuali isi ulang)
}

// Job Angkut (APC): jemput Corps terpilih -> antar ke tujuan -> turunkan. Tanpa tujuan APC diam.
async function execHaul(u) {
  const h = u.haul;
  if (!h) { u.job = 'idle'; return; }
  const adj = (tx, ty) => (r, c) => tileFree(u, r, c) && hexDistance(r, c, tx, ty) <= 1;
  if (!(u.cargo && u.cargo.type === 'corps')) {
    if (u.cargo) return;                                      // sedang membawa Fuel/Medical
    const cu = units.find(x => x.id === h.corpsId && x.owner === u.owner);
    if (!cu || cu.isBuilding || cu.cargo) {                   // Corps hilang / sibuk -> job batal
      logAction(`APC #${u.id}: Corps #${h.corpsId} tidak tersedia, job angkut batal`);
      resetUnit(u); return;
    }
    if (hexDistance(u.r, u.c, cu.r, cu.c) > 1) await moveToward(u, adj(cu.r, cu.c), cu);
    if (units.includes(cu) && hexDistance(u.r, u.c, cu.r, cu.c) === 1 && !u.attacked) {
      const res = loadCorpsIntoAPC(u, cu);
      if (res.ok) { logAction(`APC #${u.id}: Corps #${cu.id} naik`); renderTargetPanel(); draw(); await sleep(250); }
    }
    return;
  }
  if (!h.dest) return;                                        // tanpa tujuan: APC diam
  const d = h.dest;
  if (hexDistance(u.r, u.c, d.r, d.c) > 1 && u.mp > 0) await moveToward(u, adj(d.r, d.c), d);
  if (hexDistance(u.r, u.c, d.r, d.c) <= 1 && !u.attacked) {
    const res = unloadCorpsFromAPC(u, d);
    if (res.ok) {
      logAction(`APC #${u.id}: Corps diturunkan di dekat (${d.r},${d.c})`);
      u.job = 'idle'; u.haul = null;
      renderTargetPanel(); draw(); await sleep(250);
    }
  }
}

async function execNonCombat(u) {
  if (!u.buildOrder && u.job !== 'fuel' && u.job !== 'medical' && u.job !== 'angkut' && await execLane(u)) return;
  if (u.buildOrder) return execBuildOrder(u);
  if (u.job === 'angkut') return execHaul(u);
  if (u.job === 'fuel' || u.job === 'medical') return execJob(u);
  if (u.target) {
    const tgt = resolveTarget(u);
    if (tgt) await moveToward(u, goalForTarget(u, tgt, 1), tgt);
    clearReachedHex(u);
  }
}

// ---------------------------------------------------------------
// Alur giliran: rencana -> eksekusi -> pemain berikutnya
// ---------------------------------------------------------------
function beginPlanning() {
  phase = 'plan';
  if (currentPlayerIdx === HUMAN) Sfx.music('plan');
  planTimeLeft = PLAN_SECONDS;
  clearInterval(planTimer);
  updateTurnBar();
  updateTimerUI();
  renderResourcePanels();
  renderTargetPanel();
  draw();
  if (currentPlayerIdx !== HUMAN) {            // giliran bot: susun rencana seketika, lalu eksekusi
    const me = currentPlayerIdx;
    setTimeout(async () => {
      while (paused && !gameOver) await new Promise(res => setTimeout(res, 100));
      if (gameOver) return;
      try { botTakeTurn(me); } catch (err) { console.warn('Bot gagal menyusun rencana:', err); }
      renderTargetPanel(); draw();
      await wait((Settings.get('enemyDelay') || 0) * 1000);   // jeda sebelum musuh bergerak (Pengaturan)
      await sleep(500);
      runExecution();
    }, 400);
    return;
  }
  // v8.5: fase rencana pemain tanpa batas waktu — tidak ada hitung mundur;
  // eksekusi berjalan saat pemain menekan tombol Eksekusi.
}

async function runExecution() {
  if (phase !== 'plan' || gameOver) return;
  phase = 'exec';
  Sfx.executeStart(); Sfx.music('battle');
  clearInterval(planTimer);
  cancelActionMode();
  closeAllPanels();
  updateTimerUI();
  draw();

  const pIdx = currentPlayerIdx;
  dmgFeedReset();                               // log damage dikosongkan di awal tiap eksekusi (sekutu / musuh)
  if (pIdx === HUMAN) actFeedReset();           // v9.0: log aktivitas juga dikosongkan di awal eksekusi pemain
  if (laneMode) toggleLaneMode();
  if (lockMode) toggleLockMode();
  if (pIdx === HUMAN) units.forEach(lockOnStep);   // unit yang sudah berdiri di tile Baris Kunci ikut terkunci
  const order = units.filter(u => u.owner === pIdx).sort((a, b) => a.id - b.id);
  for (const u of order) {
    if (gameOver) break;
    if (!units.includes(u) || u.isBuilding) continue;
    try {
      await (defOf(u).combat ? execCombat(u) : execNonCombat(u));
    } catch (err) { console.warn('Eksekusi unit gagal:', err); }
    renderTargetPanel();
  }
  if (gameOver) { showGameOver(); return; }

  currentPlayerIdx = 1 - pIdx;
  if (currentPlayerIdx === 0) turnNumber++;
  startTurn(currentPlayerIdx);
  beginPlanning();
}
