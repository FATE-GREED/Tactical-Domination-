// ====================================================================
// bot.js — Lawan bot tingkat SULIT. Bot memakai aturan yang sama dengan
// manusia (kredit, slot Barak, MP, BBM, deteksi unit unseen) dan hanya
// memanggil API yang sama: doDeploy, orderBuild, setJob, setUnitTarget,
// locked. Bot menyusun rencana seketika di awal gilirannya; eksekusinya
// berjalan lewat runExecution() seperti pemain biasa.
//
// Strategi:
//  - Deploy menyesuaikan unit musuh yang terlihat (counter).
//  - Bangunan: Pom/Pos Pemulihan, Jembatan di titik penyeberangan jika
//    kendaraan tak punya rute, Benteng & Barak tambahan dekat Markas.
//  - Baris pertahanan: Sniper/Anti-Tank menempati slot depan Markas lalu dikunci.
//  - Sisanya berkumpul di titik kumpul, lalu menyerbu berkelompok dengan
//    fokus tembak (unit musuh terlemah/terdekat) dan membela Markas bila terancam.
// ====================================================================

let botWaveStarted = false;

function botTakeTurn(me) {
  botDeploy(me);
  botBuild(me);
  botJobs(me);
  botTargets(me);
}

function botFoe(me) { return 1 - me; }
function botMarkas(me) { return players[me].buildings.find(b => b.type === 'markas'); }
function botEnemyMarkas(me) { return players[botFoe(me)].buildings.find(b => b.type === 'markas'); }
function botVisibleFoes(me) { return units.filter(u => u.owner === botFoe(me) && !isUnitUnseen(u)); }

// Tile Grass kosong dalam cincin jarak [minD, maxD] dari `center`, diurutkan oleh scoreFn (kecil = baik)
function botSpots(center, minD, maxD, scoreFn, avoid) {
  const out = [];
  for (let r = Math.max(0, center.r - maxD); r <= Math.min(ROWS - 1, center.r + maxD); r++) {
    for (let c = Math.max(0, center.c - maxD); c <= Math.min(COLS - 1, center.c + maxD); c++) {
      const d = hexDistance(center.r, center.c, r, c);
      if (d < minD || d > maxD) continue;
      if (mapData[r][c] !== 'grass' || isTileBlocked(r, c)) continue;
      if (avoid && avoid.some(b => distToBuilding(r, c, b) <= 1)) continue;
      out.push({ r, c, s: scoreFn(r, c) + Math.random() * 0.5 });
    }
  }
  return out.sort((a, b) => a.s - b.s);
}

// ---------------- Deploy ----------------
function botDeploy(me) {
  const p = players[me];
  const baraks = p.buildings.filter(b => b.type === 'barak');
  if (!baraks.length) return;
  const em = botEnemyMarkas(me);
  baraks.sort((a, b) => hexDistance(a.r, a.c, em.r, em.c) - hexDistance(b.r, b.c, em.r, em.c));
  const foes = botVisibleFoes(me);
  const tanks = foes.filter(u => UNITS[u.type] && UNITS[u.type].tank).length;
  const snipers = foes.filter(u => u.type === 'sniper').length;
  const infantry = foes.filter(u => u.type === 'infantry' || u.type === 'assault').length;
  const mine = () => units.filter(u => u.owner === me);
  const hasPom = p.buildings.some(b => b.type === 'pom');

  for (let guard = 0; guard < 4 && totalBarakSlots(p) > 0; guard++) {
    const w = { infantry: 2, assault: 2, sniper: 1.6, antitank: 1.2, tanklapis: 2, tankcrusher: 1.6, montir: 0.8, apc: 0 };
    if (tanks > 0) { w.antitank += 3 * tanks; w.tankcrusher += 1.5 * tanks; }
    if (snipers > 0) w.assault += 2 * snipers;
    if (infantry >= 3) { w.tanklapis += 2; w.tankcrusher += 1; }
    const fuelVeh = mine().filter(u => UNITS[u.type] && UNITS[u.type].hasFuel && u.type !== 'apc').length;
    const apcs = mine().filter(u => u.type === 'apc').length;
    if (hasPom && fuelVeh >= 2 && apcs < (fuelVeh >= 5 ? 2 : 1)) w.apc = 7;
    let bestKey = null, bestScore = -1;
    for (const key of Object.keys(w)) {
      if (UNITS[key].price > p.resources.kredit || w[key] <= 0) continue;
      const have = mine().filter(u => u.type === key).length;
      const score = (w[key] / (1 + have * 0.35)) * (0.85 + Math.random() * 0.3);
      if (score > bestScore) { bestScore = score; bestKey = key; }
    }
    if (!bestKey) break;
    if (!baraks.some(b => doDeploy(bestKey, b, p))) break;
  }
}

// ---------------- Bangunan ----------------
function botBuild(me) {
  const p = players[me];
  const mk = botMarkas(me), em = botEnemyMarkas(me);
  if (!mk || !em) return;
  const avoid = p.buildings.filter(b => ['markas', 'barak', 'garnisun'].includes(b.type));
  const has = type => p.buildings.some(b => b.type === type) || pendingBuildCount(me, type) > 0;
  const count = type => p.buildings.filter(b => b.type === type).length + pendingBuildCount(me, type);
  const mine = units.filter(u => u.owner === me && u.type !== 'corps');
  const fuelUnits = mine.filter(u => UNITS[u.type].hasFuel).length;
  const front = (r, c) => hexDistance(r, c, em.r, em.c);

  const tryBuild = (type, spots) => {
    for (const s of spots.slice(0, 6)) {
      if (!buildOrderBlockReason(me, type, s.r, s.c)) return orderBuild(me, type, s.r, s.c).ok;
    }
    return false;
  };

  if (!has('pom') && (fuelUnits >= 1 || turnNumber >= 2)) tryBuild('pom', botSpots(mk, 2, 6, (r, c) => hexDistance(r, c, mk.r, mk.c), avoid));
  if (!has('pospemulihan') && turnNumber >= 3 && mine.length >= 4) tryBuild('pospemulihan', botSpots(mk, 2, 6, (r, c) => hexDistance(r, c, mk.r, mk.c) + 1, avoid));

  // Jembatan: bila kendaraan tak punya rute darat ke Markas musuh, bangun di titik penyeberangan sungai
  if (turnNumber >= 2 && count('jembatan') < 3 && mine.some(u => UNITS[u.type].vehicle)) {
    const veh = { type: 'tanklapis', owner: me, r: mk.r, c: mk.c, mp: 0 };
    const goal = (r, c) => hexDistance(r, c, em.r, em.c) <= 1 && !isTileBlocked(r, c);
    const vehPath = findPath(veh, goal);
    if (!vehPath) {
      const inf = { type: 'infantry', owner: me, r: mk.r, c: mk.c, mp: 0 };
      const path = findPath(inf, goal);
      if (path) {
        const cross = path.find(([r, c]) => mapData[r][c] === 'river' && !hasBridgeAt(r, c));
        if (cross && !buildOrderBlockReason(me, 'jembatan', cross[0], cross[1])) orderBuild(me, 'jembatan', cross[0], cross[1]);
      }
    }
  }

  if (turnNumber >= 3 && count('benteng') < 3) tryBuild('benteng', botSpots(mk, 3, 5, (r, c) => front(r, c), avoid));
  if (turnNumber >= 5 && count('barak') < 2 && p.resources.kredit >= 60) tryBuild('barak', botSpots(mk, 3, 7, (r, c) => hexDistance(r, c, mk.r, mk.c), avoid));
}

// ---------------- Job APC / Corps ----------------
function botJobs(me) {
  const p = players[me];
  const hasPom = p.buildings.some(b => b.type === 'pom');
  const hasPos = p.buildings.some(b => b.type === 'pospemulihan');
  const free = units.filter(u => u.owner === me && u.type === 'corps' && !u.isBuilding && !u.buildOrder);
  for (const u of units) if (u.owner === me && u.type === 'apc') setJob(u, hasPom ? 'fuel' : 'idle');
  const medic = free.find(u => u.job === 'medical');
  if (!hasPos) free.forEach(u => { if (u.job === 'medical') setJob(u, 'idle'); });
  else if (!medic && free.length >= 2) setJob(free[free.length - 1], 'medical');
}

// ---------------- Target, baris pertahanan, serbuan ----------------
function botTargets(me) {
  const mk = botMarkas(me), em = botEnemyMarkas(me);
  if (!mk || !em) return;
  const combat = units.filter(u => u.owner === me && defOf(u).combat && !u.isBuilding);
  if (!combat.length) return;
  const foes = botVisibleFoes(me);

  // Slot baris pertahanan: depan Markas (jarak 3-5), condong ke arah musuh
  const slots = botSpots(mk, 3, 5, (r, c) => hexDistance(r, c, em.r, em.c));
  const maxDef = Math.min(3, Math.floor(combat.length / 3));
  const defenders = combat.filter(u => u.type === 'sniper' || u.type === 'antitank').sort((a, b) => a.id - b.id).slice(0, maxDef);
  const taken = new Set();
  for (const d of defenders) {
    const dm = hexDistance(d.r, d.c, mk.r, mk.c);
    if (dm >= 3 && dm <= 5 && mapData[d.r][d.c] !== 'river' && !taken.has(d.r + ',' + d.c)) {  // sudah di garis depan: kunci di sini
      taken.add(d.r + ',' + d.c); d.locked = true; d.target = null; continue;
    }
    const slot = slots.find(s => !taken.has(s.r + ',' + s.c) && !isTileBlocked(s.r, s.c));
    if (!slot) { d.locked = false; continue; }
    taken.add(slot.r + ',' + slot.c);
    if (d.r === slot.r && d.c === slot.c) { d.locked = true; d.target = null; }
    else { d.locked = false; setUnitTarget(d, { kind: 'hex', r: slot.r, c: slot.c }); }
  }

  const attackers = combat.filter(u => !defenders.includes(u));
  attackers.forEach(u => { u.locked = false; });
  if (!attackers.length) return;
  if (!botWaveStarted && (attackers.length >= 5 || turnNumber >= 8)) botWaveStarted = true;

  const centroid = {
    r: Math.round(attackers.reduce((s, u) => s + u.r, 0) / attackers.length),
    c: Math.round(attackers.reduce((s, u) => s + u.c, 0) / attackers.length),
  };
  const rally = botSpots(mk, 6, 8, (r, c) => hexDistance(r, c, em.r, em.c))[0] || mk;

  // Ancaman dekat Markas -> semua unit dalam jangkauan bantu membela
  const threats = foes.filter(f => hexDistance(f.r, f.c, mk.r, mk.c) <= 10).sort((a, b) => hexDistance(a.r, a.c, mk.r, mk.c) - hexDistance(b.r, b.c, mk.r, mk.c));
  // Fokus tembak: unit musuh terlemah (rasio HP) di sekitar pasukan
  const near = foes.filter(f => hexDistance(f.r, f.c, centroid.r, centroid.c) <= 12)
    .sort((a, b) => (a.hp / defOf(a).hp) - (b.hp / defOf(b).hp) || hexDistance(a.r, a.c, centroid.r, centroid.c) - hexDistance(b.r, b.c, centroid.r, centroid.c));
  const focus = threats[0] || near[0] || null;

  for (const u of attackers) {
    if (focus && (botWaveStarted || threats.length)) {
      setUnitTarget(u, { kind: 'unit', id: focus.id });
    } else if (!botWaveStarted) {
      if (hexDistance(u.r, u.c, rally.r, rally.c) > 2) setUnitTarget(u, { kind: 'hex', r: rally.r, c: rally.c });
      else u.target = null, u.job = 'idle';
    } else if (hexDistance(u.r, u.c, centroid.r, centroid.c) > 9) {
      setUnitTarget(u, { kind: 'hex', r: centroid.r, c: centroid.c });   // berkumpul dulu agar maju berkelompok
    } else {
      u.target = null;                                                   // default: Markas musuh terdekat
    }
  }
}
