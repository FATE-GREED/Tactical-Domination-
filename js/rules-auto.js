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

// ---------------------------------------------------------------
// v10.1 (P7/P9): state Mode Otomatis (∞), Skip, dan mode cepat (FAST)
// ---------------------------------------------------------------
let autoMode = false;        // P7: tombol ∞ — gerak pihak HUMAN dikendalikan bot, eksekusi jalan sendiri tiap giliran
let autoTurnBusy = false;    // P7: autoPlayTurn sedang berjalan (cegah pemanggilan ganda)
let skipArmed = false;       // P9: Skip terpasang (berlaku untuk eksekusi HUMAN berikutnya)
let skipExecLeft = 0;        // P9: sisa eksekusi pada set Skip yang sedang berjalan (kita + musuh = 2)
let FAST = false;            // P9: mode cepat aktif selama skipExecLeft > 0 (tanpa animasi / suara / gambar bertahap)

// sleep ikut berhenti selama game di-pause (eksekusi membeku di antara langkah)
// v10.1 (P9): saat FAST, wait()/sleep() langsung selesai tanpa timer (pause tidak berpengaruh selama mode cepat).
async function wait(ms) {
  if (FAST) return;
  await new Promise(res => setTimeout(res, ms));
  while (paused && !gameOver) await new Promise(res => setTimeout(res, 100));
}
// v8.9: kecepatan normal = 2x lebih lambat; tombol 2x mengembalikan kecepatan lama (Settings.timeScale)
async function sleep(ms) { return wait(ms * Settings.timeScale()); }
// Pemain manusia boleh memberi perintah: fase rencana, giliran manusia, tidak pause. v10.1 (P7): tidak saat ∞ aktif.
function canAct() { return phase === 'plan' && currentPlayerIdx === HUMAN && !paused && !gameOver && !autoMode; }

// P9: gambar & perbarui panel sekali (dipakai di akhir tiap eksekusi FAST dan saat FAST padam)
function fastFlush() {
  const f = FAST;
  FAST = false;
  try {
    draw();
    renderResourcePanels();
    renderTargetPanel();
    renderDmgFeed();
    if (typeof renderActFeed === 'function') renderActFeed();
  } catch (err) { console.warn('fastFlush gagal:', err); }
  FAST = f;
}
// P9: matikan mode cepat & Skip (akhir set, atau game over). toast = tampilkan "Skip selesai".
function endFast(toast) {
  const was = FAST || skipExecLeft > 0;
  FAST = false; skipExecLeft = 0; skipArmed = false;
  if (was) {
    fastFlush();
    if (toast && !gameOver) showToast('Skip selesai');
  }
  updateTimerUI();
}
// P7/P9: dipanggil showGameOver() — ∞ dan Skip mati sendiri saat game berakhir
function onGameOverAuto() {
  autoMode = false;
  endFast(false);
  updateAutoUI();
}
// P7/P9: sinkronkan tombol ∞ dan Skip dengan state
function updateAutoUI() {
  const a = document.getElementById('autoBtn');
  if (a) { a.classList.toggle('on', autoMode); a.setAttribute('aria-pressed', autoMode ? 'true' : 'false'); a.title = autoMode ? '∞ Otomatis AKTIF (ketuk untuk mematikan)' : '∞ Otomatis: bot memainkan pihak kita'; }
  const k = document.getElementById('skipBtn');
  if (k) {
    k.disabled = !canAct();
    k.classList.toggle('armed', skipArmed);
    k.title = skipArmed ? 'Skip siap (ketuk untuk batal)' : 'Skip: satu set eksekusi selesai seketika';
  }
  const e = document.getElementById('endturn');
  if (e && autoMode) e.disabled = true;
}
// Toast singkat di tengah bawah
let toastTimer = null;
function showToast(msg) {
  let el = document.getElementById('tdToast');
  if (!el) { el = document.createElement('div'); el.id = 'tdToast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}
// P9: tombol Skip — pasang / batalkan (hanya fase rencana kita, ∞ tidak aktif)
function toggleSkip() {
  if (!canAct()) return;
  skipArmed = !skipArmed;
  updateAutoUI();
}
// P7: tombol ∞ — nyala/mati
function toggleAutoMode() {
  if (gameOver) return;
  autoMode = !autoMode;
  if (autoMode) { cancelActionMode(); closeAllPanels(); pendingTile = null; }
  updateAutoUI();
  updateTimerUI();
  renderTargetPanel();
  draw();
  // Nyala saat fase rencana HUMAN: langsung susun & eksekusi. Selain itu: mulai di fase rencana HUMAN berikutnya (beginPlanning).
  if (autoMode && phase === 'plan' && currentPlayerIdx === HUMAN) autoPlayTurn(HUMAN);
}

function defOf(u) { return unitDef(u.type); }
function unitName(u) { return unitDef(u.type).name; }
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
      if (e && !e.downed && !isUnitUnseen(e)) return { kind: 'unit', r: e.r, c: e.c, obj: e };
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
// Job Angkut (APC): jemput unit `unitId` (Corps atau Advanced Montir; kind = 'corps' | 'montir'), antar ke `dest` ({r,c}) bila ada; tanpa tujuan APC diam.
// v10.1 (P3): corpsId dipertahankan sebagai id unit yang diangkut agar kode lama tetap jalan.
function setHaulJob(u, unitId, dest, kind) { dropBuildOrder(u); u.job = 'angkut'; u.target = null; u.buildOrder = null; u.haul = { corpsId: unitId, kind: kind || 'corps', dest: dest || null }; }

// ---------------------------------------------------------------
// Perintah bangun (tekan lama hex -> Bangun)
// ---------------------------------------------------------------
function isIdleCorps(u, owner) {
  return u.owner === owner && isCorpsType(u.type) && !u.isBuilding && !u.cargo && !u.buildOrder && !u.target && u.job === 'idle';
}
// v9.4: APC nganggur = tidak punya job/tujuan/pesanan bangun (job 'angkut', 'fuel', 'medical' dll. = punya job)
function isIdleApc(u) { return isApcType(u.type) && !u.cargo && !u.target && !u.buildOrder && u.job === 'idle'; }
// v9.4: tanda seru (!) untuk APC/Corps milik pemain yang nganggur
function needsOrders(u) { return u.owner === HUMAN && (isApcType(u.type) ? isIdleApc(u) : isCorpsType(u.type) && isIdleCorps(u, HUMAN)); }
// v9.4: Benteng yang sedang dipesan (Corps berangkat) atau sedang dibangun — maks 1 sekaligus
function bentengInProgress(owner, except) {
  return units.some(u => u !== except && u.owner === owner && ((u.buildOrder && u.buildOrder.type === 'benteng') || (u.isBuilding && u.buildType === 'benteng')));
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
  if (count >= maxCountOf(owner, type)) return 'maks tercapai';   // v11: faksi Pembangunan (Benteng tanpa batas, lainnya +1)
  if (type === 'benteng' && !bentengUnlimited(owner) && bentengInProgress(owner)) return 'Benteng lain masih dibangun (maks 1 sekaligus)';
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
// v9.4: Deploy otomatis (modal tombol +): unit muncul di samping Barak yang paling dekat dengan musuh dulu;
// bila Barak itu tidak bisa (slot/tile habis), pilih acak di antara Barak lain yang masih bisa.
function doDeployAuto(key, player) {
  const def = unitDef(key);
  if (player.id - 1 === HUMAN && typeof isHumanUnitAllowed === 'function' && !isHumanUnitAllowed(key)) return { ok: false, reason: 'Unit ini tidak termasuk dalam pilihan 10 unit.' };
  if (player.resources.kredit < priceOf(key, player.id - 1)) return { ok: false, reason: 'Kredit tidak cukup.' };   // v11: priceOf (diskon Elite)
  if (key === 'advcorps') return { ok: false, reason: 'Advanced Corps tidak dideploy di Barak; ia datang dari Garnisun.' };   // v10
  const baraks = player.buildings.filter(b => b.type === 'barak');
  const usable = baraks.filter(b => barakSlots(b) > 0 && emptyAdjacentBuilding(b, def));
  if (!usable.length) return { ok: false, reason: 'Tidak ada slot atau tile kosong di sekitar Barak.' };
  const foe = players[player === players[HUMAN] ? BOT : HUMAN];
  const anchor = foe.buildings.find(b => b.type === 'markas') || foe.buildings[0];
  const dist = b => anchor ? hexDistance(b.r, b.c, anchor.r, anchor.c) : 0;
  const nearest = baraks.reduce((x, y) => (dist(y) < dist(x) ? y : x));
  const rest = usable.filter(b => b !== nearest).sort(() => Math.random() - 0.5);
  const order = usable.includes(nearest) ? [nearest, ...rest] : rest;
  for (const b of order) if (doDeploy(key, b, player)) return { ok: true };
  return { ok: false, reason: 'Tidak ada tile kosong di sekitar Barak untuk deploy.' };
}
function doDeploy(key, barak, player) {
  const def = unitDef(key);
  if (player.id - 1 === HUMAN && typeof isHumanUnitAllowed === 'function' && !isHumanUnitAllowed(key)) return false;
  const price = priceOf(key, player.id - 1);                              // v11: diskon faksi Elite
  if (barakSlots(barak) <= 0 || player.resources.kredit < price) return false;
  if (key === 'advcorps') return false;                                  // v10: Advanced Corps hanya dari Garnisun
  const spot = emptyAdjacentBuilding(barak, def);
  if (!spot) return false;
  player.resources.kredit -= price;
  Stats.use(player, 'kredit', price);
  barak.slots = barakSlots(barak) - 1;
  units.push({ id: uidCounter++, owner: player.id - 1, type: key, r: spot.r, c: spot.c, mp: 0, fuel: def.hasFuel ? fuelMaxOf(def, player.id - 1) : 0, hp: unitHpOf(def, player.id - 1), maxHp: unitHpOf(def, player.id - 1), attacked: false, speedDebuffTurns: 0, cargo: null, isBuilding: false, assaultExtend: 0, assaultGraceUsed: false, ambushAtkTimer: 0, ambushWasUnseen: false, intimidatedTurns: 0, semangatBesiUsed: false, roadFreeUsesLeft: 2, target: null, job: 'idle', buildOrder: null, locked: false, leakStacks: 0, leakTurns: 0, pierceTurns: 0, toughTurns: 0, toughCd: 0, reviveUsed: false, downed: false, weakened: false,
    // v9.7 unit Advanced (batch A)
    legacyStacks: 0, sacrificeUsed: false, sacrificeState: 0, jumpCycle: 0, camo: false, eagerTurns: 0, focusTurns: 0, toxinTurns: 0, toxinDmg: 0 });
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
    u.camo = false;                             // v9.7: bergerak menghilangkan Teknik Kamuflase
    startMoveAnim(u, fr, fc, 170);
    Sfx.move(u);
    await sleep(180);
    refreshCamo();
    await checkBombTriggers(u);                 // v9.7: bom musuh dicek tiap langkah (bombs.js)
    if (!units.includes(u) || gameOver) break;  // gugur oleh bom
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
  for (let attempt = 0; attempt < 8 && u.mp > 0 && units.includes(u); attempt++) {
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
function pickAutoTarget(u, exclude) {          // exclude = {r,c} tile yang dilewati (tembakan kedua Laras Kedua)
  const cands = computeAttackable(u).filter(t => !(exclude && t.r === exclude.r && t.c === exclude.c)).map(t => {
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

// 1 tembakan: serang, umpan damage/kill-feed, animasi, suara. keepAction = jangan hanguskan Action (tembakan pertama Laras Kedua).
async function fireShot(u, pick, keepAction) {
  const fr = u.r, fc = u.c;
  const info = describeTarget(pick.r, pick.c);
  const res = applyAttack(u, pick.r, pick.c, { keepAction });
  if (!res.ok) return null;
  dmgFeedAdd(u, res.targetName, info ? info.ownerIdx : 1 - u.owner, res.damage);
  startAttackFx(fr, fc, pick.r, pick.c, res.damage);
  Sfx.shoot(u, info ? info.ownerIdx : 1 - u.owner, res);
  if (res.destroyed && (u.owner === HUMAN || (info && info.ownerIdx === HUMAN) || !isUnitUnseen(u)))
    killFeedAdd(unitName(u), u.owner, res.targetName, info ? info.ownerIdx : 1 - u.owner);
  renderResourcePanels();
  draw();
  logAction(`${unitName(u)} #${u.id} serang ${res.targetName}: ${res.damage} dmg${res.destroyed ? ' (HANCUR)' : res.downed ? ' (MODE GUGUR)' : ''}`, 'combat');
  await sleep(520);
  return res;
}

async function autoAttack(u) {
  if (isTrapperType(u.type)) return;               // v10.1 (P2): Trapper tidak pernah menembak
  if (u.attacked || !units.includes(u) || u.downed) return;
  const pick = pickAutoTarget(u);
  if (!pick) return;
  if (u.type !== 'advtankcrusher') { await fireShot(u, pick, false); return; }
  // v9.7 Laras Kedua (Advanced Tank Crusher): 2 tembakan per serangan (1 aksi). Tembakan kedua memilih target BERBEDA bila ada
  // (prioritas sama dengan pickAutoTarget tanpa target pertama); bila tak ada, menembak target yang sama; bila target pertama gugur, memilih ulang.
  try {
    const r1 = await fireShot(u, pick, true);
    if (!r1 || !units.includes(u)) return;
    let pick2 = pickAutoTarget(u, pick);
    if (!pick2 && !r1.destroyed && !r1.downed) pick2 = pick;
    if (pick2) await fireShot(u, pick2, true);
  } finally {
    u.attacked = true; u.mp = 0;                 // 1 aksi menghanguskan MP, apa pun hasil tembakan
  }
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
  // v9.7: di tile sekarang pakai Rng efektif (termasuk Titik Fokus) agar Advanced Sniper yang diam tidak ikut maju
  return (r, c) => tileFree(u, r, c) && hexDistance(r, c, tgt.r, tgt.c) <= (reach === 'range' ? ((r === u.r && c === u.c) ? effectiveRange(u) : rangeAtTile(def, r, c)) : reach);
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
  if (!defOf(u).combat) return false;           // v9.5: unit non-tempur (Corps/APC) tidak terpengaruh Jalur
  if (u.owner !== HUMAN || u.locked || u.lane || u.noLane || !lanes.length) return false;
  const o = laneOpts(u).filter(x => x.i < x.L.tiles.length - 1);
  if (!o.length) return false;
  const p = o[Math.floor(Math.random() * o.length)];
  u.lane = { id: p.L.id, idx: p.i };
  return true;
}
async function execLane(u) {
  if (!defOf(u).combat) { u.lane = null; return false; }   // v9.5: unit non-tempur tidak terpengaruh Jalur
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

// v9.7 Lompatan Seketika (Advanced Assault, giliran ke-3 siklus): langsung tiba di tile pendaratan valid
// terdekat ke target dalam jarak hex <= MP, tanpa memedulikan rintangan di antaranya (tiap tile = 1 MP).
async function execJump(u, tgt) {
  if (u.locked || u.mp <= 0) return false;
  if (goalForTarget(u, tgt, 'range')(u.r, u.c)) return false;     // sudah dalam jangkauan: tak perlu melompat
  const here = hexDistance(u.r, u.c, tgt.r, tgt.c);
  let best = null, bestT = Infinity, bestJ = Infinity;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const d = hexDistance(u.r, u.c, r, c);
    if (d === 0 || d > u.mp) continue;
    if (mapData[r][c] === 'valley' || isTileBlocked(r, c, u)) continue;   // wajib kosong, bukan Valley, bukan bangunan/cadangan
    const dt = hexDistance(r, c, tgt.r, tgt.c);
    if (dt < bestT || (dt === bestT && d < bestJ)) { best = [r, c]; bestT = dt; bestJ = d; }
  }
  if (!best || bestT >= here) return false;
  const fr = u.r, fc = u.c;
  u.mp -= hexDistance(fr, fc, best[0], best[1]);
  u.r = best[0]; u.c = best[1];
  u.camo = false;
  startMoveAnim(u, fr, fc, 420);
  Sfx.move(u);
  await sleep(440);
  refreshCamo();
  await checkBombTriggers(u);
  if (units.includes(u)) { lockOnStep(u); }
  draw();
  return true;
}

async function execCombat(u) {
  applySemangatBesi(u);
  const busy = await execLane(u);
  const tgt = resolveTarget(u);
  if (!busy && tgt && u.mp > 0 && u.type === 'advassault' && u.jumpCycle === 3 && !u.locked) await execJump(u, tgt);
  if (!busy && tgt && u.mp > 0 && units.includes(u)) { await moveToward(u, goalForTarget(u, tgt, 'range'), tgt); if (u.lane) await execLane(u); }
  clearReachedHex(u);
  await autoAttack(u);
}

// Markas: 2 Corps berdiri di tile samping Markas; hitungan giliran baru mulai saat keduanya sudah tiba.
// ---------------------------------------------------------------
// v9.7 Trapper / Advanced Trapper (aturan bom di bombs.js)
// ---------------------------------------------------------------
async function execTrapper(u) {
  // v10.1 (P2): Trapper TIDAK PERNAH menembak. ATK 48 hanya kekuatan bom; Rng 2 hanya jarak pasang.
  // Prioritas tujuan: (1) target manual, (2) bom < 3 & ada musuh terlihat -> defaultBombSpot,
  // (3) bom < 3 & tak ada musuh terlihat -> markasBombSpot (samping Markas musuh), (4) bom = 3 tanpa target -> mundur & diam.
  const mine = bombsOf(u).length;
  let spot = null, manual = false;
  if (u.target) {
    spot = manualBombSpot(u);                                // resolveTarget mengosongkan target yang hilang (musuh gugur / bangunan hancur)
    manual = !!u.target;
    if (manual && !spot) {
      if (u.target.kind === 'building') return;              // tak ada tile samping bangunan yang valid: diam
      u.target = null; manual = false;                       // hex / unit tak valid lagi: kembali ke perilaku default
    }
    if (manual && u.target.kind === 'building' && mine >= BOMB_MAX_PER_TRAPPER) return;   // 3 bom hidup: tunggu di tempat, pasang lagi saat ada bom terpakai
  }
  if (!manual) {
    if (mine >= BOMB_MAX_PER_TRAPPER) {                      // 3 bom terpasang: mundur & diam dekat Markas sendiri (tanpa menembak)
      const mk = nearestOwnMarkas(u);
      if (mk && distToBuilding(u.r, u.c, mk) > 4 && u.mp > 0) {
        u.noLane = true;
        try { await moveToward(u, (r, c) => tileFree(u, r, c) && distToBuilding(r, c, mk) <= 4, { r: mk.r, c: mk.c }); }
        finally { u.noLane = false; }
      }
      return;
    }
    spot = hasVisibleFoe(u) ? defaultBombSpot(u) : markasBombSpot(u);
    if (!spot) return;                                       // tak ada tujuan valid: diam
  }

  const goal = (r, c) => tileFree(u, r, c) && hexDistance(r, c, spot.r, spot.c) <= rangeAtTile(UNITS[u.type], r, c);
  if (!goal(u.r, u.c) && u.mp > 0) {
    u.noLane = true;
    try { await moveToward(u, goal, { r: spot.r, c: spot.c }); }
    finally { u.noLane = false; }
  }
  if (units.includes(u) && !u.attacked && hexDistance(u.r, u.c, spot.r, spot.c) <= effectiveRange(u)) {
    await placeBomb(u, spot);
    // Siklus target manual: hex / unit musuh -> setelah satu bom terpasang target dikosongkan (kembali default); bangunan -> tetap sampai hancur
    if (manual && units.includes(u) && u.attacked && u.target && u.target.kind !== 'building') u.target = null;
  }
}

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
    // v9.7 Percepatan Pembangunan: bila salah satu dari 2 Corps adalah Advanced Corps & jatah pemain belum dipakai -> Markas 1 giliran
    const rush = [u, mate].some(x => advRushAvailable(x, 'markas'));
    if (rush) players[u.owner].rushUsed = true;
    const turns = rush ? 1 : spec.turnsRequired;
    for (const x of [u, mate]) {
      x.isBuilding = true; x.buildType = 'markas'; x.buildSite = site.id; x.buildTurnsRemaining = turns;
      x.attacked = true; x.mp = 0; x.buildOrder = null; x.target = null;
    }
    site.started = true; site.turnsRemaining = turns;
    logAction(`Corps #${u.id} & #${mate.id}: mulai membangun Markas (${turns} giliran${rush ? ', Percepatan Pembangunan' : ''}).`);
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

// Job Angkut (APC): jemput Corps / Advanced Montir terpilih -> antar ke tujuan -> turunkan. Tanpa tujuan APC diam.
async function execHaul(u) {
  const h = u.haul;
  if (!h) { u.job = 'idle'; return; }
  const kind = h.kind || 'corps';                             // v10.1 (P3): 'corps' | 'montir'
  const label = kind === 'montir' ? 'Montir' : 'Corps';
  const adj = (tx, ty) => (r, c) => tileFree(u, r, c) && hexDistance(r, c, tx, ty) <= 1;
  if (!(u.cargo && u.cargo.type === kind)) {
    if (u.cargo) return;                                      // sedang membawa muatan lain (Fuel/Medical/jenis lain)
    const cu = units.find(x => x.id === h.corpsId && x.owner === u.owner);
    if (!cu || cu.isBuilding || cu.cargo) {                   // unit hilang / sibuk -> job batal
      logAction(`APC #${u.id}: ${label} #${h.corpsId} tidak tersedia, job angkut batal`);
      resetUnit(u); return;
    }
    if (hexDistance(u.r, u.c, cu.r, cu.c) > 1) await moveToward(u, adj(cu.r, cu.c), cu);
    if (units.includes(cu) && hexDistance(u.r, u.c, cu.r, cu.c) === 1 && !u.attacked) {
      const res = kind === 'montir' ? loadMontirIntoAPC(u, cu) : loadCorpsIntoAPC(u, cu);
      if (res.ok) { logAction(`APC #${u.id}: ${label} #${cu.id} naik`); renderTargetPanel(); draw(); await sleep(250); }
    }
    return;
  }
  if (!h.dest) return;                                        // tanpa tujuan: APC diam
  const d = h.dest;
  if (hexDistance(u.r, u.c, d.r, d.c) > 1 && u.mp > 0) await moveToward(u, adj(d.r, d.c), d);
  if (hexDistance(u.r, u.c, d.r, d.c) <= 1 && !u.attacked) {
    const res = kind === 'montir' ? unloadMontirFromAPC(u, d) : unloadCorpsFromAPC(u, d);
    if (res.ok) {
      logAction(`APC #${u.id}: ${label} diturunkan di dekat (${d.r},${d.c})`);
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
  updateAutoUI();
  if (MPM && currentPlayerIdx !== HUMAN) { MP.waitTurn(); return; }               // v12: giliran lawan manusia — menunggu snapshot
  if (currentPlayerIdx !== HUMAN) { autoPlayTurn(currentPlayerIdx); return; }   // giliran bot: susun rencana seketika, lalu eksekusi
  if (autoMode) { autoPlayTurn(HUMAN); return; }                               // v10.1 (P7): ∞ aktif -> bot memainkan pihak kita
  // v8.5: fase rencana pemain tanpa batas waktu — tidak ada hitung mundur;
  // eksekusi berjalan saat pemain menekan tombol Eksekusi.
}

// v10.1 (P7): siklus otomatis bersama — dipakai bot (musuh) dan HUMAN saat ∞ aktif.
// jeda 400 ms -> botTakeTurn(me) -> jeda enemyDelay (hanya untuk bot) -> 500 ms -> runExecution().
async function autoPlayTurn(me) {
  if (autoTurnBusy) return;
  autoTurnBusy = true;
  try {
    await wait(400);
    while (paused && !gameOver) await new Promise(res => setTimeout(res, 100));   // pause menahan awal eksekusi (juga saat FAST)
    if (gameOver) return;
    if (phase !== 'plan' || currentPlayerIdx !== me) return;
    if (me === HUMAN && !autoMode) return;                                       // ∞ dimatikan sebelum rencana disusun
    try { botTakeTurn(me); } catch (err) { console.warn('Bot gagal menyusun rencana:', err); }
    renderTargetPanel(); draw();
    if (me !== HUMAN) await wait((Settings.get('enemyDelay') || 0) * 1000);       // jeda sebelum musuh bergerak (Pengaturan)
    await sleep(500);
    while (paused && !gameOver) await new Promise(res => setTimeout(res, 100));
    if (gameOver) return;
    if (phase !== 'plan' || currentPlayerIdx !== me) return;
    if (me === HUMAN && !autoMode) { updateAutoUI(); updateTimerUI(); return; }  // ∞ dimatikan: kontrol kembali ke pemain
  } finally { autoTurnBusy = false; }
  runExecution();
}

// v9.7: pembaruan penghitung di akhir eksekusi giliran pemilik (sr/sc = posisi awal)
function afterUnitTurn(u, sr, sc) {
  if (!units.includes(u)) return;
  const moved = u.r !== sr || u.c !== sc;
  if (u.type === 'advsniper') {
    if (moved) { u.eagerTurns = 0; u.focusTurns = 0; }                                  // reset saat berpindah
    else {
      u.eagerTurns = (u.eagerTurns || 0) + 1;                                           // Mata Elang
      u.focusTurns = u.attacked ? 0 : Math.min(5, (u.focusTurns || 0) + 1);             // Titik Fokus (reset bila menyerang)
    }
  } else if (u.type === 'advassault') {
    if (moved) u.camo = false;                                                          // Teknik Kamuflase: diam 1 giliran penuh
    else { u.camo = true; refreshCamo(); }
  }
}
async function runExecution() {
  if (phase !== 'plan' || gameOver) return;
  phase = 'exec';
  const pIdx = currentPlayerIdx;
  // v10.1 (P9): Skip terpasang -> set ini (eksekusi kita + eksekusi musuh) berjalan tanpa animasi / suara
  if (pIdx === HUMAN && skipArmed) { skipArmed = false; skipExecLeft = 2; }
  FAST = skipExecLeft > 0;
  if (!FAST) { Sfx.executeStart(); Sfx.music('battle'); }
  clearInterval(planTimer);
  cancelActionMode();
  closeAllPanels();
  updateTimerUI();
  updateAutoUI();
  draw();

  dmgFeedReset();                               // log damage dikosongkan di awal tiap eksekusi (sekutu / musuh)
  if (pIdx === HUMAN) actFeedReset();           // v9.0: log aktivitas juga dikosongkan di awal eksekusi pemain
  if (laneMode) toggleLaneMode();
  if (lockMode) toggleLockMode();
  if (pIdx === HUMAN) units.forEach(lockOnStep);   // unit yang sudah berdiri di tile Baris Kunci ikut terkunci
  try { await moveBombs(pIdx); } catch (err) { console.warn('Gerak bom gagal:', err); }   // Hadiah Kejutan, sebelum unit pemilik bergerak
  const order = units.filter(u => u.owner === pIdx).sort((a, b) => a.id - b.id);
  for (const u of order) {
    if (gameOver) break;
    if (FAST) await new Promise(res => setTimeout(res, 0));          // v10.1 (P9): beri napas ke browser (tanpa menggambar) agar layar tidak membeku
    if (!units.includes(u) || u.isBuilding || u.downed) continue;     // v9.7: unit mode gugur tidak bertindak
    const sr = u.r, sc = u.c;
    try {
      await (isTrapperType(u.type) ? execTrapper(u) : defOf(u).combat ? execCombat(u) : execNonCombat(u));
    } catch (err) { console.warn('Eksekusi unit gagal:', err); }
    afterUnitTurn(u, sr, sc);
    renderTargetPanel();
  }
  if (gameOver) { endFast(false); showGameOver(); return; }

  // v10.1 (P9): satu eksekusi FAST selesai -> gambar sekali; set selesai setelah dua eksekusi -> mode cepat padam
  if (skipExecLeft > 0) {
    skipExecLeft--;
    if (skipExecLeft > 0) fastFlush();
    else endFast(true);
  }

  currentPlayerIdx = 1 - pIdx;
  if (currentPlayerIdx === 0) turnNumber++;
  startTurn(currentPlayerIdx);
  if (gameOver) { endFast(false); showGameOver(); return; }     // v9.7: Markas bisa hancur karena Peluru Pembakar di awal giliran
  if (MPM) MP.passTurn();                                       // v12: kirim snapshot ke lawan, lalu menunggu
  beginPlanning();
}
