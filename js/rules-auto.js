// ====================================================================
// rules-auto.js — Sistem giliran baru: fase RENCANA (30 detik) lalu
// fase EKSEKUSI otomatis. Pemain 1 lalu Pemain 2.
//   - Tiap unit punya target (entitas musuh / hex / default).
//     Default unit tempur = Markas musuh terdekat. Unit non-combat
//     default = nganggur, atau menjalankan job (isi fuel / isi medical).
//   - Eksekusi: unit diproses berurutan sesuai urutan deploy (id kecil
//     dulu). Tiap unit bergerak menuju targetnya (pathfinding, dibatasi
//     MP seperti aturan lama), lalu menyerang otomatis.
//   - Prioritas serang: Markas > Bangunan (terdekat, lebih dulu dibangun,
//     HP paling sedikit) > Unit (terdekat, lebih dulu deploy) > acak.
// Aturan dasar (damage, MP, terrain, supply, build) TIDAK diubah.
// ====================================================================

const sleep = ms => new Promise(res => setTimeout(res, ms));
function defOf(u) { return u.type === 'corps' ? CORPS_DEF : UNITS[u.type]; }
function unitName(u) { return u.type === 'corps' ? 'Corps' : UNITS[u.type].name; }
function tileFree(u, r, c) { return (r === u.r && c === u.c) || !isTileBlocked(r, c); }

// ---------------------------------------------------------------
// Target
// ---------------------------------------------------------------
function nearestEnemyMarkas(u) {
  let best = null, bd = Infinity;
  for (const b of players[1 - u.owner].buildings) {
    if (b.type !== 'markas') continue;
    const d = hexDistance(u.r, u.c, b.r, b.c);
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
      if (players[1 - u.owner].buildings.includes(t.ref)) return { kind: 'building', r: t.ref.r, c: t.ref.c, obj: t.ref };
      u.target = null;
    }
  }
  if (!defOf(u).combat) return null;
  const m = nearestEnemyMarkas(u);
  return m ? { kind: 'building', r: m.r, c: m.c, obj: m, isDefault: true } : null;
}

function setUnitTarget(u, target) { u.target = target; u.buildOrder = null; if (!defOf(u).combat) u.job = 'idle'; }
function resetUnit(u) { u.target = null; u.buildOrder = null; u.job = 'idle'; }
function setJob(u, job) { u.job = job; u.target = null; u.buildOrder = null; }

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
  return units.filter(u => u.owner === owner && u.buildOrder && u.buildOrder.type === type).length;
}
// Cek apakah bangunan `type` boleh dipesan di hex (r,c). Mengembalikan alasan penolakan atau null.
function buildOrderBlockReason(owner, type, r, c) {
  const spec = BUILDING_TYPES[type];
  const p = players[owner];
  const count = p.buildings.filter(b => b.type === type).length + pendingBuildCount(owner, type);
  if (count >= spec.maxCount) return 'maks tercapai';
  const terr = mapData[r][c];
  if (type === 'jembatan') {
    if (terr !== 'river') return 'butuh tile River';
    if (players.some(pp => pp.buildings.some(b => b.r === r && b.c === c))) return 'tile terisi';
  } else {
    if (terr !== 'grass') return 'butuh tile Grass';
    if (isTileBlocked(r, c)) return 'tile terisi';
  }
  if (!nearestIdleCorps(owner, r, c)) return 'tidak ada Corps nganggur';
  return null;
}
function orderBuild(owner, type, r, c) {
  const why = buildOrderBlockReason(owner, type, r, c);
  if (why) return { ok: false, message: `Tidak bisa membangun: ${why}.` };
  const corps = nearestIdleCorps(owner, r, c);
  corps.buildOrder = { type, r, c };
  corps.target = { kind: 'hex', r, c };
  return { ok: true, message: `Corps #${corps.id} berangkat membangun ${BUILDING_TYPES[type].name} di (${r},${c}).` };
}

// ---------------------------------------------------------------
// Pathfinding (Dijkstra pada seluruh map, biaya terrain = aturan lama)
// Unit sekutu boleh dilewati (dengan penalti), musuh & bangunan tidak.
// ---------------------------------------------------------------
function findPath(u, goalFn) {
  const def = defOf(u);
  const key = (r, c) => r * COLS + c;
  const occ = new Map();
  for (const o of units) if (o !== u) occ.set(key(o.r, o.c), o.owner === u.owner ? 'ally' : 'enemy');
  for (const p of players) for (const b of p.buildings) if (b.type !== 'jembatan') occ.set(key(b.r, b.c), 'block');

  const N = ROWS * COLS;
  const dist = new Array(N).fill(Infinity), prev = new Array(N).fill(-1);
  const start = key(u.r, u.c);
  dist[start] = 0;
  const open = [{ r: u.r, c: u.c, d: 0 }];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].d < open[bi].d) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.r, cur.c);
    if (cur.d > dist[ck]) continue;
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
      let cost = tileMoveCost(nr, nc, def);
      if (cost === Infinity) continue;
      if (o === 'ally') cost += 2;
      const nd = cur.d + cost;
      if (nd < dist[nk]) { dist[nk] = nd; prev[nk] = ck; open.push({ r: nr, c: nc, d: nd }); }
    }
  }
  return null;
}

// Jalani path selama MP cukup & tile tidak terhalang (aturan MP/road gratis non-combat tetap berlaku)
async function moveAlongPath(u, path) {
  const def = defOf(u);
  const nonCombat = !def.combat;
  let moved = false;
  for (const [r, c] of path) {
    if (isTileBlocked(r, c)) break;
    let cost = tileMoveCost(r, c, def);
    let free = false;
    if (mapData[r][c] === 'road' && nonCombat && u.roadFreeUsesLeft > 0) { cost = 0; free = true; }
    if (cost === Infinity || cost > u.mp) break;
    const fr = u.r, fc = u.c;
    u.mp -= cost;
    if (free) u.roadFreeUsesLeft--;
    u.r = r; u.c = c;
    moved = true;
    startMoveAnim(u, fr, fc, 80);
    await sleep(90);
  }
  if (moved) { logAction(`${unitName(u)} #${u.id} bergerak ke (${u.r},${u.c})`); draw(); }
  return moved;
}

async function moveToward(u, goalFn) {
  if (u.mp <= 0) return false;
  const path = findPath(u, goalFn);
  if (!path || path.length === 0) return false;
  return moveAlongPath(u, path);
}

// ---------------------------------------------------------------
// Serang otomatis
// ---------------------------------------------------------------
function pickAutoTarget(u) {
  const cands = computeAttackable(u).map(t => {
    const info = describeTarget(t.r, t.c);
    const d = hexDistance(u.r, u.c, t.r, t.c);
    let cat, k1, k2 = 0;
    if (info.kind === 'building') { cat = info.obj.type === 'markas' ? 0 : 1; k1 = info.obj.seq || 0; k2 = info.obj.hp; }
    else { cat = 2; k1 = info.obj.id; }
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
  const res = applyAttack(u, pick.r, pick.c);
  if (!res.ok) return;
  startAttackFx(fr, fc, pick.r, pick.c, res.damage);
  renderResourcePanels();
  draw();
  logAction(`${unitName(u)} #${u.id} serang ${res.targetName}: ${res.damage} dmg${res.destroyed ? ' (HANCUR)' : ''}`);
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
  return (r, c) => tileFree(u, r, c) && hexDistance(r, c, tgt.r, tgt.c) <= reach;
}

function clearReachedHex(u) {
  if (u.target && u.target.kind === 'hex' && u.r === u.target.r && u.c === u.target.c) u.target = null;
}

async function execCombat(u) {
  applySemangatBesi(u);
  const tgt = resolveTarget(u);
  if (tgt && u.mp > 0) await moveToward(u, goalForTarget(u, tgt, defOf(u).range));
  clearReachedHex(u);
  await autoAttack(u);
}

async function execBuildOrder(u) {
  const o = u.buildOrder;
  if (u.r !== o.r || u.c !== o.c) await moveToward(u, (r, c) => r === o.r && c === o.c && tileFree(u, r, c));
  if (u.r === o.r && u.c === o.c) {
    const res = startBuild(u, o.type);
    u.buildOrder = null; u.target = null;
    logAction(`Corps #${u.id}: ${res.message}`);
    renderResourcePanels(); draw();
    await sleep(250);
  }
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
  const byDist = (a, b) => hexDistance(u.r, u.c, a.r, a.c) - hexDistance(u.r, u.c, b.r, b.c);

  if (!u.cargo) {                                           // 1) ambil muatan di Pom / Pos Pemulihan
    if (p.resources[ct] <= 0) return;
    const srcs = p.buildings.filter(b => b.type === srcType).sort(byDist);
    if (!srcs.length) return;
    const s = srcs[0];
    if (hexDistance(u.r, u.c, s.r, s.c) > 1) await moveToward(u, adj(s.r, s.c));
    if (hexDistance(u.r, u.c, s.r, s.c) === 1 && !u.attacked) {
      const res = loadCargo(u, ct);
      if (res.ok) { logAction(`${unitName(u)} #${u.id}: ${res.message}`); renderResourcePanels(); draw(); await sleep(250); }
    }
    return;
  }

  const needy = units.filter(o => o !== u && o.owner === u.owner && needsSupply(o, ct));
  if (isFuel) needy.sort(byDist);
  else needy.sort((a, b) => (a.hp / defOf(a).hp) - (b.hp / defOf(b).hp) || byDist(a, b));
  if (needy.length) {                                       // 2) ada yang butuh -> mendekat & isi
    const t = needy[0];
    if (hexDistance(u.r, u.c, t.r, t.c) > 1) await moveToward(u, adj(t.r, t.c));
    if (units.includes(t) && hexDistance(u.r, u.c, t.r, t.c) === 1 && !u.attacked) {
      const res = isFuel ? performSupplyFuel(u, t) : performSupplyMedical(u, t);
      if (res.ok) { logAction(`${unitName(u)} #${u.id} → ${unitName(t)} #${t.id}: ${res.message}`); renderResourcePanels(); draw(); await sleep(300); }
    }
    return;
  }
  // 3) tidak ada yang butuh -> ikuti unit terdekat
  const pool = units.filter(o => o !== u && o.owner === u.owner && (isFuel ? (defOf(o).vehicle && defOf(o).hasFuel) : defOf(o).combat)).sort(byDist);
  if (pool.length && hexDistance(u.r, u.c, pool[0].r, pool[0].c) > 1) await moveToward(u, adj(pool[0].r, pool[0].c));
}

async function execNonCombat(u) {
  if (u.buildOrder) return execBuildOrder(u);
  if (u.job === 'fuel' || u.job === 'medical') return execJob(u);
  if (u.target) {
    const tgt = resolveTarget(u);
    if (tgt) await moveToward(u, goalForTarget(u, tgt, 1));
    clearReachedHex(u);
  }
}

// ---------------------------------------------------------------
// Alur giliran: rencana -> eksekusi -> pemain berikutnya
// ---------------------------------------------------------------
function beginPlanning() {
  phase = 'plan';
  planTimeLeft = PLAN_SECONDS;
  clearInterval(planTimer);
  planTimer = setInterval(() => {
    if (gameOver) { clearInterval(planTimer); return; }
    planTimeLeft--;
    updateTimerUI();
    if (planTimeLeft <= 0) runExecution();
  }, 1000);
  updateTurnBar();
  updateTimerUI();
  renderResourcePanels();
  renderTargetPanel();
  draw();
}

async function runExecution() {
  if (phase !== 'plan' || gameOver) return;
  phase = 'exec';
  clearInterval(planTimer);
  cancelActionMode();
  closeAllPanels();
  updateTimerUI();
  draw();

  const pIdx = currentPlayerIdx;
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
