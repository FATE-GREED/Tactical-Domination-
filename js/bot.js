// ====================================================================
// bot.js — Lawan bot (v10.2: Mudah / Sedang / Sulit lewat BOT_LEVELS; perilaku v10.1 = LEGACY untuk Campaign & ∞). Bot memakai aturan yang sama dengan
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

// ---------------- v10.2: konfigurasi per tingkat bot ----------------
// LEGACY = perilaku v10.1 (dipakai Campaign dan mode ∞ saat bot memainkan pihak kita).
// Stat bot (Mudah 0,8 / Sedang 1 / Sulit 1,2) diatur di state.js (BOT_STAT_MUL); di sini hanya perilaku.
const BOT_LEVELS = {
  legacy: { deployMax: 4, deployChance: 1, counter: true, advBoost: 1,
            pom: true, pos: true, jembatan: true, benteng: 3, bentengTurn: 3, barak: 2, barakTurn: 5, barakKredit: 60,
            defMax: 3, defDiv: 3, waveAttackers: 5, waveTurn: 8, rallyMin: 6, rallyMax: 8,
            defendRadius: 10, defendShare: 1, chaseRange: 99, focusFire: true, regroup: 9, idleChance: 0 },
  mudah:  { deployMax: 1, deployChance: 0.6, counter: false, advBoost: 0.6,
            pom: true, pos: false, jembatan: false, benteng: 0, bentengTurn: 99, barak: 1, barakTurn: 99, barakKredit: 999,
            defMax: 0, defDiv: 99, waveAttackers: 8, waveTurn: 12, rallyMin: 7, rallyMax: 9,
            defendRadius: 6, defendShare: 1, chaseRange: 6, focusFire: false, regroup: 9, idleChance: 0.25 },
  sedang: { deployMax: 5, deployChance: 1, counter: true, advBoost: 1.1,
            pom: true, pos: true, jembatan: true, benteng: 1, bentengTurn: 8, barak: 2, barakTurn: 4, barakKredit: 60,
            defMax: 1, defDiv: 4, waveAttackers: 3, waveTurn: 5, rallyMin: 5, rallyMax: 7,
            defendRadius: 8, defendShare: 1, chaseRange: 10, focusFire: true, regroup: 11, idleChance: 0 },
  sulit:  { deployMax: 6, deployChance: 1, counter: true, advBoost: 1.4,
            pom: true, pos: true, jembatan: true, benteng: 0, bentengTurn: 99, barak: 3, barakTurn: 3, barakKredit: 50,
            defMax: 0, defDiv: 99, waveAttackers: 3, waveTurn: 3, rallyMin: 4, rallyMax: 6,
            defendRadius: 7, defendShare: 0.5, chaseRange: 9, focusFire: true, regroup: 12, idleChance: 0 },
};
function botCfg(me) {
  if (CAMPAIGN || me === HUMAN) return BOT_LEVELS.legacy;   // Campaign & mode ∞ tidak berubah
  return BOT_LEVELS[BOT_LEVEL] || BOT_LEVELS.sedang;
}

// v10.1 (P7): per-pemain (bot bisa memainkan pihak HUMAN saat ∞ aktif), indeks = nomor pemain
let botWaveStarted = [false, false];

function botTakeTurn(me) {
  botDeploy(me);
  if (!CAMPAIGN) { botBuild(me); botJobs(me); }   // v9.7: Campaign tanpa bangunan/Corps
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
  const cfg = botCfg(me);
  if (cfg.deployChance < 1 && Math.random() > cfg.deployChance) return;   // v10.2: Mudah kadang melewatkan deploy

  for (let guard = 0; guard < cfg.deployMax && totalBarakSlots(p) > 0; guard++) {
    const w = { infantry: 2, assault: 2, sniper: 1.6, antitank: 1.2, tanklapis: 2, tankcrusher: 1.6, montir: 0.8, apc: 0, trapper: 1.2 };
    // v9.7 Advanced + Trapper: bobot sedang ≈ unit dasar setara (Bagian 6 butir 3)
    Object.assign(w, { advinfantry: 2, advassault: 2, advsniper: 1.6, advantitank: 1.2, advtrapper: 1.2, advmontir: 0.8, advtanklapis: 2, advtankcrusher: 1.6, advapc: 0 });
    if (cfg.counter && tanks > 0) { w.antitank += 3 * tanks; w.advantitank += 3 * tanks; w.tankcrusher += 1.5 * tanks; w.advtankcrusher += 1.5 * tanks; }
    if (cfg.counter && snipers > 0) { w.assault += 2 * snipers; w.advassault += 2 * snipers; }
    if (cfg.counter && infantry >= 3) { w.tanklapis += 2; w.advtanklapis += 2; w.tankcrusher += 1; w.advtankcrusher += 1; }
    if (cfg.advBoost !== 1) for (const k of Object.keys(w)) if (k.startsWith('adv')) w[k] *= cfg.advBoost;   // v10.2: Sulit lebih suka unit Advanced
    const fuelVeh = mine().filter(u => UNITS[u.type] && UNITS[u.type].hasFuel && !isApcType(u.type)).length;
    const apcs = mine().filter(u => isApcType(u.type)).length;
    if (hasPom && fuelVeh >= 2 && apcs < (fuelVeh >= 5 ? 2 : 1)) { w.apc = 4; w.advapc = 3; }
    if (CAMPAIGN) for (const k of Object.keys(w)) if (!CAMPAIGN.units.includes(k)) w[k] = 0;   // v9.7: unit bot = unit yang tersedia bagi pemain
    // v10.1 (P7): bot yang memainkan pihak HUMAN hanya membeli dari 10 unit pilihan pemain (bobot jenis tak terpilih = 0; Corps/Advanced Corps tidak dibeli di Barak)
    if (me === HUMAN && typeof isHumanUnitAllowed === 'function') for (const k of Object.keys(w)) if (!isHumanUnitAllowed(k)) w[k] = 0;
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
  const mine = units.filter(u => u.owner === me && !isCorpsType(u.type));
  const fuelUnits = mine.filter(u => UNITS[u.type].hasFuel).length;
  const front = (r, c) => hexDistance(r, c, em.r, em.c);
  const cfg = botCfg(me);

  const tryBuild = (type, spots) => {
    for (const s of spots.slice(0, 6)) {
      if (!buildOrderBlockReason(me, type, s.r, s.c)) return orderBuild(me, type, s.r, s.c).ok;
    }
    return false;
  };

  if (cfg.pom && !has('pom') && (fuelUnits >= 1 || turnNumber >= 2)) tryBuild('pom', botSpots(mk, 2, 6, (r, c) => hexDistance(r, c, mk.r, mk.c), avoid));
  if (cfg.pos && !has('pospemulihan') && turnNumber >= 3 && mine.length >= 4) tryBuild('pospemulihan', botSpots(mk, 2, 6, (r, c) => hexDistance(r, c, mk.r, mk.c) + 1, avoid));

  // Jembatan: bila kendaraan tak punya rute darat ke Markas musuh, bangun di titik penyeberangan sungai
  if (cfg.jembatan && turnNumber >= 2 && count('jembatan') < 3 && mine.some(u => UNITS[u.type].vehicle)) {
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

  if (turnNumber >= cfg.bentengTurn && count('benteng') < cfg.benteng) tryBuild('benteng', botSpots(mk, 3, 5, (r, c) => front(r, c), avoid));
  if (turnNumber >= cfg.barakTurn && count('barak') < cfg.barak && p.resources.kredit >= cfg.barakKredit) tryBuild('barak', botSpots(mk, 3, 7, (r, c) => hexDistance(r, c, mk.r, mk.c), avoid));
}

// ---------------- Job APC / Corps ----------------
function botJobs(me) {
  const p = players[me];
  const hasPom = p.buildings.some(b => b.type === 'pom');
  const hasPos = p.buildings.some(b => b.type === 'pospemulihan');
  const free = units.filter(u => u.owner === me && isCorpsType(u.type) && !u.isBuilding && !u.buildOrder);
  for (const u of units) if (u.owner === me && isApcType(u.type)) setJob(u, hasPom ? 'fuel' : 'idle');
  const medic = free.find(u => u.job === 'medical');
  if (!hasPos) free.forEach(u => { if (u.job === 'medical') setJob(u, 'idle'); });
  else if (!medic && free.length >= 2) setJob(free[free.length - 1], 'medical');
}

// ---------------- Target, baris pertahanan, serbuan ----------------
function botTargets(me) {
  const mk = botMarkas(me), em = botEnemyMarkas(me);
  if (!mk || !em) return;
  const allCombat = units.filter(u => u.owner === me && defOf(u).combat && !u.isBuilding);
  // v9.7: Trapper bot memakai perilaku default (bom di jalur musuh terlihat); target manual akan membuatnya memasang bom di atas musuh
  for (const t of allCombat) if (isTrapperType(t.type)) { t.target = null; t.locked = false; }
  const combat = allCombat.filter(u => !isTrapperType(u.type));
  if (!combat.length) return;
  const foes = botVisibleFoes(me);
  const cfg = botCfg(me);

  // Slot baris pertahanan: depan Markas (jarak 3-5), condong ke arah musuh
  const slots = botSpots(mk, 3, 5, (r, c) => hexDistance(r, c, em.r, em.c));
  const maxDef = cfg.defMax > 0 ? Math.min(cfg.defMax, Math.floor(combat.length / cfg.defDiv)) : 0;   // v10.2: Sedang/Sulit tidak terlalu fokus bertahan
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
  if (!botWaveStarted[me] && (attackers.length >= cfg.waveAttackers || turnNumber >= cfg.waveTurn)) botWaveStarted[me] = true;

  const centroid = {
    r: Math.round(attackers.reduce((s, u) => s + u.r, 0) / attackers.length),
    c: Math.round(attackers.reduce((s, u) => s + u.c, 0) / attackers.length),
  };
  const rally = botSpots(mk, cfg.rallyMin, cfg.rallyMax, (r, c) => hexDistance(r, c, em.r, em.c))[0] || mk;

  // Ancaman dekat Markas -> semua unit dalam jangkauan bantu membela
  const threats = foes.filter(f => hexDistance(f.r, f.c, mk.r, mk.c) <= cfg.defendRadius).sort((a, b) => hexDistance(a.r, a.c, mk.r, mk.c) - hexDistance(b.r, b.c, mk.r, mk.c));
  // Fokus tembak: unit musuh terlemah (rasio HP) di sekitar pasukan
  const dC = f => hexDistance(f.r, f.c, centroid.r, centroid.c);
  const near = foes.filter(f => dC(f) <= 12)
    .sort(cfg.focusFire ? (a, b) => (a.hp / defOf(a).hp) - (b.hp / defOf(b).hp) || dC(a) - dC(b) : (a, b) => dC(a) - dC(b));   // Mudah: tanpa fokus tembak lemah
  const focus = threats[0] || near[0] || null;

  // v10.2 (Sulit): hanya sebagian unit terdekat Markas yang pulang membela; sisanya terus menyerang
  const homeGuard = new Set();
  if (threats.length && cfg.defendShare < 1) {
    attackers.slice().sort((a, b) => hexDistance(a.r, a.c, mk.r, mk.c) - hexDistance(b.r, b.c, mk.r, mk.c))
      .slice(0, Math.max(1, Math.ceil(attackers.length * cfg.defendShare))).forEach(u => homeGuard.add(u));
  }

  for (const u of attackers) {
    if (cfg.idleChance && !threats.length && Math.random() < cfg.idleChance) { u.locked = true; u.target = null; continue; }   // Mudah: kadang diam
    const isGuard = threats.length && (cfg.defendShare >= 1 || homeGuard.has(u));
    if (focus && isGuard) {
      setUnitTarget(u, { kind: 'unit', id: threats[0].id });
    } else if (focus && botWaveStarted[me] && hexDistance(u.r, u.c, focus.r, focus.c) <= cfg.chaseRange) {
      setUnitTarget(u, { kind: 'unit', id: focus.id });
    } else if (threats.length && botWaveStarted[me]) {
      u.target = null;                                                   // v10.2: bukan penjaga -> terus ke Markas musuh
    } else if (!botWaveStarted[me]) {
      if (hexDistance(u.r, u.c, rally.r, rally.c) > 2) setUnitTarget(u, { kind: 'hex', r: rally.r, c: rally.c });
      else u.target = null, u.job = 'idle';
    } else if (hexDistance(u.r, u.c, centroid.r, centroid.c) > cfg.regroup) {
      setUnitTarget(u, { kind: 'hex', r: centroid.r, c: centroid.c });   // berkumpul dulu agar maju berkelompok
    } else {
      u.target = null;                                                   // default: Markas musuh terdekat
    }
  }
}
