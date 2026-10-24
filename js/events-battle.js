// ====================================================================
// events-battle.js — v13 Tahap 7-8: mekanik pertempuran Event (Bagian 16.4 - 16.8).
//   Event 1 Terobos Benteng Musuh : peta 30x45, pita Kota/Racun, 10 bangunan musuh (5 Balista, 3 Benteng, 2 Markas).
//   Event 2 Benteng Pertahanan Terakhir : segienam radius 20, void di luar, fog JPD, gelombang musuh tiap turn.
//   Event 3 Jendral Perang Taktis : peta 20x20 dari rasio salah satu map World War, penempatan unit, pertempuran otomatis dua sisi.
// Semua fungsi publik dipanggil dari titik integrasi di main.js, setup.js, rules-*.js, render.js, input.js.
// Poin & peti dikreditkan lewat Ev.credit1/2/3 (events.js) sekali saat percobaan berakhir.
// ====================================================================
const EventBattle = (function () {
  const BOT_I = 1;
  const SESS_RETRY = 'td-event-retry';
  const rnd = n => Math.floor(Math.random() * n);
  const pick = a => a[rnd(a.length)];
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const $ = id => document.getElementById(id);
  const NAMA = { 1: 'Terobos Benteng Musuh', 2: 'Benteng Pertahanan Terakhir', 3: 'Jendral Perang Taktis' };

  let placing = false, selType = null, delMode = false, placed = [], credit = 0, lastSig = null, stagn = 0, hudTimer = null;
  let visCache = { sig: '', set: null };

  // ---------- koordinat kubus (odd-r, sama dengan neighborsOf state.js) ----------
  const DIRS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];
  const offToCube = (r, c) => { const x = c - (r - (r & 1)) / 2; return [x, -x - r, r]; };
  const cubeToOff = (x, y, z) => [z, x + (z - (z & 1)) / 2];
  const cubeAt = (cen, k, n) => cubeToOff(cen[0] + DIRS[k][0] * n, cen[1] + DIRS[k][1] * n, cen[2] + DIRS[k][2] * n);

  // ---------- persiapan pertandingan ----------
  function prepare(opts) {
    const no = opts.no;
    EVENT = { no, tahap: opts.tahap || 1, turnsDone: 0, credited: false, started: no !== 3, result: null, startHp: null, hpLost: 0 };
    if (no === 1) { ROWS = 30; COLS = 45; }
    else if (no === 3) { ROWS = 20; COLS = 20; }
    // Event 2: ROWS/COLS ditetapkan di buildMap (tergantung geometri segienam)
    lastSig = null; stagn = 0; placing = false; placed = []; visCache = { sig: '', set: null };
    document.body.classList.add('event', 'event' + no);
    return EVENT;
  }

  // ---------- peta ----------
  function emptyGrid(key) { const g = []; for (let r = 0; r < ROWS; r++) { g.push(new Array(COLS).fill(key)); } return g; }

  function mapEvent1() {
    const g = emptyGrid('grass');
    for (let r = 0; r < ROWS; r++) for (let c = 15; c <= 29; c++) g[r][c] = (Math.floor(r / 5) % 2 === 0) ? 'city' : 'racun';
    return g;
  }

  function hexPoints2() {
    const pts = []; let minC = Infinity, maxC = -Infinity;
    for (let r = 0; r <= 40; r++) for (let c = -8; c <= 52; c++) if (hexDistance(20, 20, r, c) <= 20) { pts.push([r, c]); if (c < minC) minC = c; if (c > maxC) maxC = c; }
    return { pts, minC, maxC };
  }
  function mapEvent2() {
    const { pts, minC, maxC } = hexPoints2();
    ROWS = 41; COLS = maxC - minC + 1;
    EVENT.cen = [20, 20 - minC];
    const g = emptyGrid('void');
    pts.forEach(([r, c]) => { g[r][c - minC] = 'grass'; });
    return g;
  }

  // Rasio terrain per jenis map (dihitung dari generator di map-gen.js / map-types.js pada peta Klasik 30x45)
  function ratioOf(type) {
    const sr = ROWS, sc = COLS; ROWS = 30; COLS = 45;
    let g;
    try { g = type === 1 ? generateMap() : generateMapByType(type); } catch (e) { g = null; }
    ROWS = sr; COLS = sc;
    const cnt = {}; let total = 0;
    if (g) for (const row of g) for (const t of row) { if (t === 'racun' || t === 'void') continue; cnt[t] = (cnt[t] || 0) + 1; total++; }
    if (!total) return { grass: 1 };
    const out = {}; Object.keys(cnt).forEach(k => { out[k] = cnt[k] / total; });
    return out;
  }
  function tilesFromRatio(ratio, n) {
    const keys = Object.keys(ratio), arr = [];
    const base = keys.map(k => ({ k, v: ratio[k] * n }));
    base.forEach(o => { o.n = Math.floor(o.v); o.f = o.v - o.n; });
    let left = n - base.reduce((a, o) => a + o.n, 0);
    base.sort((a, b) => b.f - a.f); for (let i = 0; left > 0; i = (i + 1) % base.length, left--) base[i].n++;
    base.forEach(o => { for (let i = 0; i < o.n; i++) arr.push(o.k); });
    return shuffle(arr);
  }
  const MK3 = { 0: [1, 1], 1: [18, 18] };       // Markas pemain (kiri atas) & musuh (kanan bawah), rapat ke tepi
  function connected3(g) {
    const [ar, ac] = MK3[0], [br, bc] = MK3[1];
    const seen = new Set([ar * COLS + ac]), q = [[ar, ac]];
    while (q.length) {
      const [r, c] = q.shift();
      if (r === br && c === bc) return true;
      for (const [nr, nc] of neighborsOf(r, c)) {
        const k = nr * COLS + nc;
        if (seen.has(k) || g[nr][nc] === 'valley') continue;
        seen.add(k); q.push([nr, nc]);
      }
    }
    return false;
  }
  function mapEvent3() {
    const type = 1 + rnd(7);
    EVENT.mapType = type;
    let ratio = ratioOf(type), g = null;
    const tryBuild = rt => {
      const list = tilesFromRatio(rt, ROWS * COLS); let i = 0;
      const gg = emptyGrid('grass');
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) gg[r][c] = list[i++];
      for (const k of [0, 1]) {            // tile Markas + sekitarnya dipaksa rumput
        const [mr, mc] = MK3[k]; gg[mr][mc] = 'grass';
        for (const [nr, nc] of neighborsOf(mr, mc)) gg[nr][nc] = 'grass';
      }
      return gg;
    };
    for (let i = 0; i < 60 && !g; i++) { const t = tryBuild(ratio); if (connected3(t)) g = t; }
    if (!g) { ratio = ratioOf(1); for (let i = 0; i < 60 && !g; i++) { const t = tryBuild(ratio); if (connected3(t)) g = t; } }
    if (!g) g = emptyGrid('grass');
    return g;
  }
  function buildMap() {
    if (EVENT.no === 1) return mapEvent1();
    if (EVENT.no === 2) return mapEvent2();
    return mapEvent3();
  }

  // ---------- bangunan ----------
  function addB(pIdx, type, r, c, o) {
    o = o || {};
    const tiles = o.tiles || footprintShapes(type, r, c)[0] || [[r, c]];
    for (const [tr, tc] of tiles) if (mapData[tr][tc] !== 'racun' || !o.keepRacun) { if (mapData[tr][tc] === 'racun' || mapData[tr][tc] === 'valley') mapData[tr][tc] = 'grass'; }
    const hpMax = BUILDING_TYPES[type].hp;
    const hp = o.hp !== undefined ? o.hp : hpMax;
    const b = { r, c, tiles, type, hp, maxHp: hpMax, defDebuffTurns: 0, seq: buildingSeq++, evInit: o.evInit !== false };
    if (o.evIdx !== undefined) b.evIdx = o.evIdx;
    players[pIdx].buildings.push(b);
    return b;
  }
  const mkPlayers = () => [
    { id: 1, name: 'Pemain', color: PLAYER_COLORS[0], buildings: [], resources: { kredit: 200, fuel: 0, medical: 0 }, corps: { count: 0, timer: null }, infantrySpiritTurns: 0, rushUsed: false },
    { id: 2, name: 'Musuh', color: PLAYER_COLORS[1], buildings: [], resources: { kredit: 200, fuel: 0, medical: 0 }, corps: { count: 0, timer: null }, infantrySpiritTurns: 0, rushUsed: false },
  ];

  // Posisi 10 bangunan musuh Event 1 (tengah): [jenis, baris, kolom]
  const E1_LAYOUT = [
    ['balista', 3, 36], ['balista', 9, 36], ['balista', 15, 36], ['balista', 21, 36], ['balista', 27, 36],
    ['benteng', 3, 40], ['benteng', 15, 40], ['benteng', 27, 40],
    ['markas', 9, 40], ['markas', 21, 40],
  ];

  function setupPlayers() {
    players = mkPlayers();
    if (EVENT.no === 1) {
      const e = Ev.data().e[1];
      E1_LAYOUT.forEach(([type, r, c], i) => { if (e.hp[i] > 0) addB(BOT_I, type, r, c, { hp: e.hp[i], evIdx: i }); });
      EVENT.startHp = e.hp.slice();
      const midR = Math.floor(ROWS / 2), top = Math.random() < 0.5;       // pangkalan awal seperti Klasik, sisi kiri
      addB(HUMAN, 'markas', midR, 5); addB(HUMAN, 'barak', midR + (top ? 10 : -10), 5); addB(HUMAN, 'garnisun', top ? 3 : ROWS - 4, 3);
      (e.bangunan || []).forEach(sb => {        // bangunan buatan pemain yang tersimpan antar percobaan
        if (!BUILDING_TYPES[sb.jenis] || sb.hp <= 0) return;
        const tiles = (Array.isArray(sb.tiles) && sb.tiles.length) ? sb.tiles : (footprintShapes(sb.jenis, sb.r, sb.c)[0] || [[sb.r, sb.c]]);
        if (tiles.some(([tr, tc]) => tr < 0 || tc < 0 || tr >= ROWS || tc >= COLS || buildingAt(tr, tc))) return;
        const b = addB(HUMAN, sb.jenis, sb.r, sb.c, { tiles, hp: Math.min(sb.hp, BUILDING_TYPES[sb.jenis].hp), evInit: false });
        b.evBuilt = true;
      });
    } else if (EVENT.no === 2) {
      const [cr, cc] = EVENT.cen;
      const flower = [[cr, cc], ...neighborsOf(cr, cc)];
      addB(HUMAN, 'markas', cr, cc, { tiles: flower });
      const near = (type, r, c) => {         // pilih footprint 3 tile dengan jarak ke Markas minimal 3 (1 tile kosong), paling dekat
        const shapes = footprintShapes(type, r, c).filter(t => t.every(([tr, tc]) => mapData[tr][tc] === 'grass' && !buildingAt(tr, tc) && hexDistance(cr, cc, tr, tc) >= 3));
        shapes.sort((a, b) => Math.min(...a.map(([x, y]) => hexDistance(cr, cc, x, y))) - Math.min(...b.map(([x, y]) => hexDistance(cr, cc, x, y))));
        return shapes[0];
      };
      [['barak', cr - 4, cc], ['barak', cr + 4, cc], ['pom', cr, cc - 4], ['pospemulihan', cr, cc + 4]].forEach(([t, r, c]) => { const sh = near(t, r, c); if (sh) addB(HUMAN, t, r, c, { tiles: sh }); });
      // Garnisun (aturan Klasik): di dalam cincin Benteng
      let gdone = false;
      for (let r = cr - 8; r <= cr + 8 && !gdone; r++) for (let c = 0; c < COLS && !gdone; c++) {
        if (mapData[r][c] !== 'grass' || hexDistance(cr, cc, r, c) !== 7 || r > cr) continue;
        const sh = footprintShapes('garnisun', r, c).find(t => t.every(([tr, tc]) => mapData[tr][tc] === 'grass' && !buildingAt(tr, tc) && hexDistance(cr, cc, tr, tc) >= 6));
        if (sh) { addB(HUMAN, 'garnisun', r, c, { tiles: sh }); gdone = true; }
      }
      // 12 Benteng pada cincin jarak 10: 6 sudut + 6 tengah sisi
      const cen = offToCube(cr, cc), corners = [];
      for (let k = 0; k < 6; k++) corners.push([cen[0] + DIRS[k][0] * 10, cen[1] + DIRS[k][1] * 10, cen[2] + DIRS[k][2] * 10]);
      const pts = [];
      for (let k = 0; k < 6; k++) {
        const a = corners[k], b = corners[(k + 1) % 6];
        pts.push(cubeToOff(...a));
        pts.push(cubeToOff((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2));
      }
      pts.forEach(([r, c]) => {
        const sh = footprintShapes('benteng', r, c).find(t => t.every(([tr, tc]) => mapData[tr][tc] === 'grass' && !buildingAt(tr, tc)));
        if (sh) addB(HUMAN, 'benteng', r, c, { tiles: sh });
      });
    } else {
      addB(HUMAN, 'markas', MK3[0][0], MK3[0][1]);
      addB(BOT_I, 'markas', MK3[1][0], MK3[1][1]);
    }
  }

  // ---------- pembuatan unit ----------
  function makeUnit(owner, key, r, c, noStat) {
    const def = unitDef(key);
    const hp = progHpScale(owner, key, isCorpsType(key) ? corpsHpOf(def, owner) : unitHpOf(def, owner));
    const u = { id: uidCounter++, owner, type: key, r, c, mp: 0, fuel: def.hasFuel ? fuelMaxOf(def, owner) : 0, hp, maxHp: hp, attacked: false, speedDebuffTurns: 0, cargo: null, isBuilding: false, assaultExtend: 0, assaultGraceUsed: false, ambushAtkTimer: 0, ambushWasUnseen: false, intimidatedTurns: 0, semangatBesiUsed: false, roadFreeUsesLeft: 2, target: null, job: 'idle', buildOrder: null, locked: false, leakStacks: 0, leakTurns: 0, pierceTurns: 0, toughTurns: 0, toughCd: 0, reviveUsed: false, downed: false, weakened: false,
      legacyStacks: 0, sacrificeUsed: false, sacrificeState: 0, jumpCycle: 0, camo: false, eagerTurns: 0, focusTurns: 0, toxinTurns: 0, toxinDmg: 0 };
    units.push(u);
    if (!noStat) Stats.deploy(owner, key);
    return u;
  }
  const tileFree = (r, c) => !units.some(u => u.r === r && u.c === c) && !buildingAt(r, c);

  // ---------- fog Event 2 (JPD) ----------
  function visibleSet() {
    const sig = units.filter(u => u.owner === HUMAN).map(u => u.r + ':' + u.c).join(',') + '|' + players[HUMAN].buildings.map(b => b.seq + ':' + b.hp).join(',') + '|' + (EVENT ? EVENT.no : 0);
    if (visCache.sig === sig && visCache.set) return visCache.set;
    const set = new Set();
    const mark = (r0, c0, rad) => {
      for (let r = Math.max(0, r0 - rad); r <= Math.min(ROWS - 1, r0 + rad); r++)
        for (let c = 0; c < COLS; c++) if (mapData[r][c] !== 'void' && hexDistance(r0, c0, r, c) <= rad) set.add(r * COLS + c);
    };
    for (const u of units) if (u.owner === HUMAN && !u.downed) mark(u.r, u.c, effectiveJPD(u));
    for (const b of players[HUMAN].buildings) {
      for (const [tr, tc] of b.tiles) set.add(tr * COLS + tc);       // bangunan sendiri selalu terlihat
      const jpd = b.type === 'benteng' ? 0 : b.type === 'markas' ? 8 : 4;
      if (jpd > 0) for (const [tr, tc] of b.tiles) mark(tr, tc, jpd);
    }
    visCache = { sig, set };
    return set;
  }
  function drawFog() {
    if (!EVENT || EVENT.no !== 2 || enemyView) return;
    const vis = visibleSet();
    ctx.save();
    ctx.fillStyle = 'rgba(6,8,10,0.93)';
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (mapData[r][c] === 'void' || vis.has(r * COLS + c)) continue;
      const { x, y } = hexCenter(r, c);
      const sx = x * scale + camX, sy = y * scale + camY;
      if (sx < -40 || sx > canvas.width + 40 || sy < -40 || sy > canvas.height + 40) continue;
      ctx.beginPath();
      hexCorners(x, y, HEX_SIZE + 0.3).forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- gelombang musuh Event 2 ----------
  const POOL2 = ['infantry', 'assault', 'sniper', 'antitank', 'trapper', 'tanklapis', 'tankcrusher', 'montir'];
  const WAVE2 = {
    1: ['infantry', 'infantry'], 2: ['infantry', 'assault'], 3: ['assault', 'sniper'], 4: ['infantry', 'sniper'],
    5: ['antitank', 'trapper'], 6: ['montir', 'infantry'], 7: ['trapper', 'antitank'], 8: ['tankcrusher', 'montir'],
    9: ['assault', 'sniper'], 10: ['tankcrusher', 'infantry'], 11: ['tanklapis', 'trapper'],
  };
  function waveFor(t) {
    if (WAVE2[t]) return WAVE2[t].slice();
    const n = t <= 19 ? 3 : t <= 24 ? 4 : t <= 29 ? 5 : t === 30 ? 6 : t - 24;
    const out = []; for (let i = 0; i < n; i++) out.push(pick(POOL2)); return out;
  }
  function spawnWave() {
    if (!EVENT || EVENT.no !== 2) return;
    const list = waveFor(turnNumber), vis = visibleSet();
    const corners = []; const cen = offToCube(EVENT.cen[0], EVENT.cen[1]);
    for (let k = 0; k < 6; k++) corners.push(cubeAt(cen, k, 20));
    list.forEach(key => {
      const def = unitDef(key), cand = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (mapData[r][c] === 'void' || vis.has(r * COLS + c) || !tileFree(r, c)) continue;
        if (tileMoveCost(r, c, def) === Infinity) continue;
        cand.push([r, c]);
      }
      let spot = cand.length ? pick(cand) : null;
      if (!spot) { const free = corners.filter(([r, c]) => mapData[r] && mapData[r][c] !== 'void' && tileFree(r, c)); spot = free.length ? pick(free) : null; }
      if (spot) makeUnit(BOT_I, key, spot[0], spot[1]);
    });
  }

  // ---------- Balista ----------
  async function balistaFire() {
    const bs = players[BOT_I].buildings.filter(b => b.type === 'balista');
    for (const b of bs) {
      if (gameOver) break;
      if (!players[BOT_I].buildings.includes(b)) continue;
      const cand = [];
      for (const u of units) {
        if (u.owner !== HUMAN || u.downed || isUnitUnseen(u)) continue;
        const d = distToBuilding(u.r, u.c, b);
        if (d <= 15) cand.push({ d, hp: u.hp, r: u.r, c: u.c });
      }
      for (const pb of players[HUMAN].buildings) {
        if (BUILDING_TYPES[pb.type].destructible === false) continue;
        let d = Infinity, t = null;
        for (const [tr, tc] of pb.tiles) { const dd = distToBuilding(tr, tc, b); if (dd < d) { d = dd; t = [tr, tc]; } }
        if (d <= 15) cand.push({ d, hp: pb.hp, r: t[0], c: t[1] });
      }
      if (!cand.length) continue;
      cand.sort((a, z) => a.d - z.d || a.hp - z.hp);
      const tg = cand[0], info = describeTarget(tg.r, tg.c);
      if (!info) continue;
      const dmg = damageFormula(BUILDING_TYPES.balista.atk, 0, info, 1, undefined, BOT_I);
      const from = nearestTileOf(b, tg.r, tg.c);
      if (!FAST) { try { startAttackFx(from[0], from[1], tg.r, tg.c, dmg); } catch (e) {} draw(); }
      if (info.kind === 'unit') damageUnit(info.obj, dmg, BOT_I, 'balista'); else damageBuilding(info.ownerIdx, info.obj, dmg, BOT_I, 'balista');
      if (!FAST) { draw(); await sleep(450); }
    }
  }
  async function preExec(pIdx) {
    if (!EVENT || pIdx !== BOT_I) return;
    if (EVENT.no === 1) { try { await balistaFire(); } catch (e) { console.warn('Balista gagal:', e); } }
  }

  // ---------- akhir giliran / kondisi menang ----------
  function endNow(win) { gameOver = true; winner = win ? HUMAN : BOT_I; return true; }
  function checkWin() {
    if (gameOver) return true;
    if (EVENT.no === 3 && !EVENT.started) return false;
    const hm = players[HUMAN].buildings.some(b => b.type === 'markas');
    if (!hm) return endNow(false);
    if (EVENT.no === 1) { if (!players[BOT_I].buildings.some(b => b.evIdx !== undefined)) return endNow(true); return false; }
    if (EVENT.no === 3 && !players[BOT_I].buildings.some(b => b.type === 'markas')) return endNow(true);
    return false;
  }
  function sigNow() {
    return units.map(u => u.r + ',' + u.c + ',' + u.hp).join(';') + '|' + players.map(p => p.buildings.map(b => b.hp).join(',')).join('/');
  }
  function afterExec(pIdx) {
    if (!EVENT || gameOver) return false;
    if (pIdx === BOT_I) EVENT.turnsDone++;
    if (EVENT.no === 1 && pIdx === BOT_I && EVENT.turnsDone >= 30) return endNow(false);
    if (EVENT.no === 3 && EVENT.started) {
      const s = sigNow();
      if (s === lastSig) stagn++; else stagn = 0;
      lastSig = s;
      if (stagn >= 2) return endNow(false);
      if (pIdx === BOT_I && EVENT.turnsDone >= 60) return endNow(false);
    }
    return false;
  }
  function incomeKredit() { return !(EVENT && EVENT.no === 3); }

  // ---------- statistik percobaan ----------
  function hpLostNow() { const d = Stats.data[HUMAN]; return d.dmgUnit + d.dmgBld; }
  function e1HpArr() {
    const arr = [];
    for (let i = 0; i < 10; i++) { const b = players[BOT_I].buildings.find(x => x.evIdx === i); arr.push(b ? Math.max(0, b.hp) : 0); }
    return arr;
  }
  function pointsNow() {
    if (EVENT.no === 1) { const a = e1HpArr(); return EVENT.startHp.reduce((s, h, i) => s + Math.max(0, h - a[i]), 0); }
    return Math.floor(hpLostNow() / 4);
  }
  function nextChest() {
    const e = Ev.data().e[EVENT.no], td = EVENT.turnsDone;
    if (EVENT.no === 1) return 'bangunan hancur';
    const list = EVENT.no === 2 ? Ev.TONGGAK2 : Ev.TONGGAK3;
    const taken = EVENT.no === 2 ? e.tonggak : (e.tonggak[EVENT.tahap - 1] || []);
    const nx = list.find(t => t > td && !taken.includes(t));
    return nx ? 'turn ' + nx : '-';
  }

  // ---------- kredit & layar akhir ----------
  function finish(reason) {
    if (!EVENT || EVENT.credited) return EVENT && EVENT.result;
    EVENT.credited = true;
    let r = null;
    try {
      if (EVENT.no === 1) {
        const mine = players[HUMAN].buildings.filter(b => !b.evInit && b.hp > 0).map(b => ({ jenis: b.type, r: b.r, c: b.c, hp: b.hp, tiles: b.tiles }));
        r = Ev.credit1(e1HpArr(), mine);
      } else if (EVENT.no === 2) {
        r = Ev.credit2({ hpLost: hpLostNow(), turn: EVENT.turnsDone });
      } else if (EVENT.started) {
        r = Ev.credit3(EVENT.tahap, { hpLost: hpLostNow(), turn: EVENT.turnsDone, markasHancur: !players[BOT_I].buildings.some(b => b.type === 'markas') });
      }
    } catch (e) { console.warn('kredit event gagal:', e); }
    EVENT.result = r || { ok: false, poinBaru: 0, total: 0, peti: [], gem: 0 };
    EVENT.reason = reason;
    return EVENT.result;
  }
  function onEnd() {
    stopHud();
    const win = winner === HUMAN && (EVENT.no !== 2);
    const r = finish('selesai') || {};
    let box = $('evEnd');
    if (!box) { box = document.createElement('div'); box.id = 'evEnd'; document.body.appendChild(box); }
    const F = n => Prog.fmt(n);
    const left = Ev.attemptsLeft(EVENT.no);
    const title = EVENT.no === 3 ? (win ? 'Tahap berhasil' : 'Tahap gagal') : (EVENT.no === 1 && r.selesai ? 'Selesai' : NAMA[EVENT.no]);
    const chest = (r.peti || []).map(p => `<li>Peti ${p.sumber}: +${F(p.gem)} Gem</li>`).join('') || '<li>Tidak ada peti baru</li>';
    box.innerHTML = `<div class="ev-end-box"><h2 class="${win || EVENT.no === 2 ? 'ok' : 'bad'}">${title}</h2>
      <p class="ev-end-sub">${NAMA[EVENT.no]}${EVENT.no === 3 ? ' · Tahap ' + EVENT.tahap : ''}</p>
      <div class="ev-end-rows"><div><span>Poin baru</span><b>+${F(r.poinBaru || 0)}</b></div><div><span>Total poin periode</span><b>${F(r.total || 0)}</b></div>
      <div><span>Peti didapat (+${F(r.gem || 0)} Gem)</span><b></b></div></div><ul>${chest}</ul>
      <p>Sisa percobaan: <b>${left}/5</b></p>
      <div class="ev-end-btns">${(left > 0 && !(EVENT.no === 1 && r.selesai)) ? '<button id="evRetry">Coba Lagi</button>' : ''}<button id="evBack">Kembali</button><button id="evDetail">Rincian</button></div></div>`;
    box.style.display = 'flex';
    const go = (retry) => {
      try { if (retry) sessionStorage.setItem(SESS_RETRY, JSON.stringify({ no: EVENT.no, tahap: EVENT.tahap })); else sessionStorage.setItem('td-open', 'event'); } catch (e) {}
      location.reload();
    };
    $('evRetry') && $('evRetry').addEventListener('click', () => go(true));
    $('evBack').addEventListener('click', () => go(false));
    $('evDetail').addEventListener('click', () => Rincian.open());
  }

  // ---------- HUD event ----------
  function startHud() {
    let el = $('evHud');
    if (!el) { el = document.createElement('div'); el.id = 'evHud'; document.body.appendChild(el); }
    const upd = () => {
      if (!EVENT || !EVENT.started) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      const t = EVENT.no === 1 ? `Turn ${Math.min(turnNumber, 30)}/30` : `Turn ${turnNumber}`;
      el.innerHTML = `<b>${t}</b> · Poin +${Prog.fmt(pointsNow())} · Peti berikutnya: ${nextChest()}`;
    };
    upd(); clearInterval(hudTimer); hudTimer = setInterval(upd, 500);
  }
  function stopHud() { clearInterval(hudTimer); }

  // ---------- Event 3: penempatan ----------
  const regionOf = (r, c) => {
    const a = hexDistance(r, c, MK3[0][0], MK3[0][1]), b = hexDistance(r, c, MK3[1][0], MK3[1][1]);
    return a < b ? HUMAN : b < a ? BOT_I : -1;
  };
  const KREDIT3 = { 1: 600, 2: 700, 3: 800, 4: 900, 5: 1200 };
  const BUY3 = ['infantry', 'assault', 'sniper', 'antitank', 'trapper', 'tanklapis', 'tankcrusher', 'montir', 'apc'];
  function enemyBuy() {
    let kr = KREDIT3[EVENT.tahap] || 600;
    const free = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (regionOf(r, c) === BOT_I && tileFree(r, c)) free.push([r, c]);
    shuffle(free);
    for (;;) {
      const ok = BUY3.filter(k => priceOf(k, BOT_I) <= kr);
      if (!ok.length) break;
      const k = pick(ok), def = unitDef(k);
      const idx = free.findIndex(([r, c]) => tileMoveCost(r, c, def) !== Infinity);
      if (idx < 0) break;
      const [r, c] = free.splice(idx, 1)[0];
      kr -= priceOf(k, BOT_I);
      makeUnit(BOT_I, k, r, c, true);
    }
    units.filter(u => u.owner === BOT_I).forEach(u => Stats.deploy(BOT_I, u.type));
  }
  function ownedKeys() {
    return Object.keys(UNITS).filter(k => !isCorpsType(k) && UNITS[k].price != null && Prog.data.unit[k] && Prog.data.unit[k].dimiliki);
  }
  function placementUI() {
    let el = $('evPlace');
    if (!el) { el = document.createElement('div'); el.id = 'evPlace'; document.body.appendChild(el); }
    const keys = ownedKeys();
    el.innerHTML = `<div class="ev-pl-head"><span>Kredit tersisa: <b id="evCr">${credit}</b></span>
      <button id="evDel" class="${delMode ? 'on' : ''}">Hapus</button><button id="evGo" ${placed.length ? '' : 'disabled'}>Mulai</button></div>
      <div class="ev-pl-list">${keys.map(k => { const p = priceOf(k, HUMAN); return `<button data-k="${k}" class="${selType === k && !delMode ? 'on' : ''}" ${p > credit ? 'disabled' : ''}><b>${unitDef(k).name}</b><small>${p}</small></button>`; }).join('')}</div>`;
    el.style.display = 'block';
    el.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { selType = b.dataset.k; delMode = false; placementUI(); }));
    $('evDel').addEventListener('click', () => { delMode = !delMode; placementUI(); });
    $('evGo').addEventListener('click', () => { if (placed.length) beginBattle(); });
  }
  function beginPlacement() {
    credit = 700; placing = true; delMode = false;
    const keys = ownedKeys(); selType = keys.includes('infantry') ? 'infantry' : keys[0];
    enemyBuy();
    fitView();
    renderLegend(); renderResourcePanels(); updateActionPanel(); renderLog();
    placementUI(); draw(); startHud();
  }
  function onTap(r, c) {
    if (!placing) return;
    const ex = placed.find(p => p.r === r && p.c === c);
    if (ex || delMode) {
      if (ex) { credit += priceOf(ex.key, HUMAN); const i = units.findIndex(u => u.id === ex.id); if (i >= 0) units.splice(i, 1); placed = placed.filter(p => p !== ex); }
    } else {
      if (regionOf(r, c) !== HUMAN || !selType || !tileFree(r, c)) return;
      const price = priceOf(selType, HUMAN);
      if (price > credit || tileMoveCost(r, c, unitDef(selType)) === Infinity) return;
      credit -= price;
      const u = makeUnit(HUMAN, selType, r, c, true);
      placed.push({ id: u.id, key: selType, r, c });
    }
    placementUI(); draw();
  }
  function beginBattle() {
    placing = false; EVENT.started = true;
    const el = $('evPlace'); if (el) el.style.display = 'none';
    placed.forEach(p => Stats.deploy(HUMAN, p.key));
    lastSig = null; stagn = 0;
    autoMode = true; autoPernahAktif = true;
    startTurn(currentPlayerIdx);
    updateAutoUI(); draw();
    Sfx.music('plan');
    beginPlanning();
  }
  function regionHL(r, c) { return placing && regionOf(r, c) === HUMAN; }
  function fitView() {
    const mw = COLS * hexW + hexW / 2, mh = (ROWS - 1) * vertSpacing + hexH;
    const x0 = 84, y0 = 36, aw = canvas.width - x0 - 8, ah = canvas.height - y0 - 150;
    scale = Math.max(0.4, Math.min(aw / mw, ah / mh));
    camX = x0 + (aw - mw * scale) / 2 + hexW / 2 * scale;
    camY = y0 + (ah - mh * scale) / 2 + hexH / 2 * scale;
  }
  function fitWhole() {          // Event 2: seluruh segienam tidak muat; pusatkan di Markas
    const m = getBuilding(players[HUMAN], 'markas'); if (!m) return;
    const { x, y } = hexCenter(m.r, m.c);
    scale = Math.max(0.45, Math.min(1, canvas.width / (COLS * hexW) * 1.6));
    camX = canvas.width / 2 - x * scale; camY = canvas.height / 2 - y * scale;
  }

  function afterStart() {
    if (!EVENT) return;
    if (EVENT.no === 3) fitView(); else if (EVENT.no === 2) fitWhole(); else { const m = getBuilding(players[HUMAN], 'markas'); if (m) { const { x, y } = hexCenter(m.r, m.c); scale = Math.min(scale, 1); camX = canvas.width * 0.3 - x * scale; camY = canvas.height / 2 - y * scale; } }
    if (EVENT.no !== 3) startHud();
    window.addEventListener('pagehide', () => { try { if (EVENT && !EVENT.credited && (EVENT.no !== 3 || EVENT.started)) finish('keluar'); } catch (e) {} });
    document.addEventListener('visibilitychange', () => {});
  }

  return {
    prepare, buildMap, setupPlayers, afterStart, beginPlacement, onTap, drawFog, visibleSet, preExec, afterExec, checkWin, spawnWave, onEnd, finish,
    incomeKredit, regionHL, makeUnit, offToCube, cubeToOff, waveFor, hexPoints2, ratioOf, tilesFromRatio, regionOf,
    placing: () => placing,
  };
})();
