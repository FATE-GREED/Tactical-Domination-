// ====================================================================
// worldwar.js — Mode World War (v11), tahap 1: lapisan strategis (peta benua).
//   Isi: aturan peta (Bagian 4), alur pertandingan dari/ke peta (5.1-5.5), rumus buff untuk
//   tampilan panel (6.2, 6.4, 6.5), antarmuka peta (Bagian 8), penyimpanan (Bagian 9).
//   Tahap 2: fungsi hook buff (6.3, 6.6) dipakai di damage/HP/harga/fuel/penghasilan/batas bangunan,
//   7 jenis map pertempuran (Bagian 7, js/map-types.js), bot dibatasi 10 unit faksi, Corps Garnisun per faksi.
// Pola mengikuti Campaign: IIFE, layar #wwmap, localStorage 'td-ww', kembali ke peta lewat
// sessionStorage 'td-open' + reload. Data tetap ada di js/worldwar-data.js.
// ====================================================================
const WorldWar = (() => {
  const KEY = 'td-ww';
  const NODES = [...Object.keys(WW_CITIES).map(Number), 'A', 'B', 'C', 'D', 'E', 'F'];
  const BOTS = ['B', 'C', 'D', 'E', 'F'];
  const CAPS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const ADJ = {};
  for (const n of NODES) ADJ[n] = [];
  for (const [a, b] of WW_EDGES) { ADJ[a].push(b); ADJ[b].push(a); }
  const isCap = n => typeof n === 'string';
  const WW_MAP_TYPES_READY = 7;       // Bagian 7: tujuh jenis map pertempuran (js/map-types.js)
  const rngDef = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const nm = L => WW_COUNTRIES[L].name;
  const sh = L => WW_COUNTRIES[L].short;
  const pos = n => isCap(n) ? WW_COUNTRIES[n].cap : WW_CITIES[n];

  // ================= Aturan murni (tanpa DOM) =================
  function newRun(rng = rngDef) {
    const owner = {};
    for (const n of NODES) owner[n] = isCap(n) ? n : (WW_CITIES[n].region === 'A' ? null : WW_CITIES[n].region);
    const ids = shuffle(WW_FACTION_IDS), factions = {}, botCd = {}, alive = {};
    BOTS.forEach((b, i) => { factions[b] = ids[i]; botCd[b] = rng(2, 5); alive[b] = true; });
    return { id: Date.now(), matches: 0, over: null, factions, owner, timer: {}, botCd, alive, pending: null, events: [], lastWin: null, lastNo: 0 };
  }
  const mine = (R, n) => R.owner[n] === 'A';
  function connected(R) {                       // simpul milik pemain yang tersambung ke ibukota A
    const seen = new Set(['A']), q = ['A'];
    while (q.length) { const x = q.pop(); for (const y of ADJ[x]) if (mine(R, y) && !seen.has(y)) { seen.add(y); q.push(y); } }
    return seen;
  }
  function isFrontier(R, n) {                   // garis depan: kota (bukan ibukota) milik pemain dengan tetangga bukan milik pemain
    if (isCap(n) || !mine(R, n)) return false;
    return ADJ[n].some(y => !mine(R, y));
  }
  const timerIds = R => Object.keys(R.timer).map(Number).sort((a, b) => a - b);
  function attackReason(R, n) {                 // null = boleh diserang; selain itu alasan
    if (R.over) return 'Run telah berakhir';
    if (R.pending && R.pending.role === 'defend') return 'Ibukota sedang diserang';
    if (mine(R, n)) return 'Sudah milik kita';
    const conn = connected(R);
    if (ADJ[n].some(y => conn.has(y))) return null;
    return ADJ[n].some(y => mine(R, y)) ? 'Terputus dari ibukota' : 'Belum bertetangga dengan wilayah kita';
  }
  const attackable = (R, n) => attackReason(R, n) === null;

  function normalize(R, rng, log) {             // frontier tanpa timer -> acak 2-5; bukan frontier -> timer dihapus
    for (const n of NODES) {
      if (!mine(R, n)) { delete R.timer[n]; continue; }
      if (isFrontier(R, n)) {
        if (R.timer[n] == null) { R.timer[n] = rng(2, 5); log && log.push(`Timer kota ${n}: ${R.timer[n]}.`); }
      } else if (R.timer[n] != null) { delete R.timer[n]; log && log.push(`Timer kota ${n} dihapus.`); }
    }
  }
  function eliminate(R, L, log) {               // ibukota L jatuh: negara tersingkir, semua simpul miliknya (selain ibukota itu) netral
    if (R.alive[L] === false) return;
    R.alive[L] = false;
    for (const n of NODES) if (R.owner[n] === L && n !== L) R.owner[n] = null;
    log && log.push(`${nm(L)} tersingkir.`);
  }
  function pickTarget(R, b, rng) {              // 4.6 + K4 + K6
    const cand = new Set();
    for (const n of NODES) if (R.owner[n] === b) for (const y of ADJ[n]) if (R.owner[y] !== b && R.owner[y] !== 'A') cand.add(y);
    const c = [...cand];
    const p1 = c.filter(y => R.owner[y] == null);
    if (ADJ.A.some(y => R.owner[y] === b)) p1.push('A');                       // K4: ibukota A ikut jadi kandidat
    const p2 = c.filter(y => !isCap(y) && R.owner[y] != null);
    const p3 = c.filter(y => isCap(y) && R.owner[y] != null && NODES.every(n => n === y || R.owner[n] !== R.owner[y]));   // K6: pemegang tak punya kota lain
    const pool = p1.length ? p1 : p2.length ? p2 : p3;
    return pool.length ? pool[rng(0, pool.length - 1)] : null;
  }
  function expandBots(R, rng, log) {            // 4.4 langkah 5
    const picks = [];
    for (const b of shuffle(BOTS.filter(x => R.alive[x]))) {
      R.botCd[b]--;
      if (R.botCd[b] > 0) continue;
      const t = pickTarget(R, b, rng);
      if (t == null) { R.botCd[b] = rng(2, 5); continue; }
      picks.push({ b, t });
    }
    const byT = {};
    for (const p of picks) (byT[p.t] = byT[p.t] || []).push(p);
    for (const t of Object.keys(byT)) {
      const g = byT[t], win = g[rng(0, g.length - 1)];            // bentrokan: undi acak
      for (const p of g) if (p !== win) R.botCd[p.b] = rng(2, 5);
      const node = isNaN(+t) ? t : +t, b = win.b;
      R.botCd[b] = rng(2, 5);
      if (node === 'A') {                                          // K4: Serangan Ibukota
        R.pending = { target: 'A', role: 'defend', defender: b, faction: R.factions[b], mapType: 1, started: false };
        log.push(`Ibukota diserang oleh ${nm(b)}!`);
        continue;
      }
      R.owner[node] = b;
      if (isCap(node)) { log.push(`${nm(b)} merebut ibukota ${sh(node)}.`); eliminate(R, node, log); }
      else log.push(`${nm(b)} memperluas wilayah: kota ${node}.`);
    }
  }
  // Satu pertandingan selesai (K16). ctx = { target, win, role: 'attack'|'defend', attacker }. opts.skipBots hanya untuk uji.
  function settleCore(R, ctx, rng = rngDef, opts = {}) {
    const log = [];
    R.matches++;
    for (const k of Object.keys(R.timer)) R.timer[k]--;                              // 1) semua timer -1
    if (ctx.role === 'defend') {
      if (ctx.win) { R.botCd[ctx.attacker] = rng(2, 5); log.push(`Serangan ${nm(ctx.attacker)} ke ibukota kita dipukul mundur.`); }
      else { R.over = 'lose'; log.push('Ibukota Kekaisaran Vanderick jatuh.'); }
    } else if (ctx.win && ctx.target != null) {                                      // 2) rebut + bonus timer tetangga
      const t = ctx.target;
      R.owner[t] = 'A';
      log.push(isCap(t) ? `Ibukota ${sh(t)} direbut.` : `Kota ${t} direbut.`);
      if (isCap(t)) eliminate(R, t, log);
      const before = { ...R.timer };
      normalize(R, rng, log);
      for (const y of ADJ[t]) if (!isCap(y) && mine(R, y) && before[y] != null && R.timer[y] != null) {
        const add = rng(1, 3); R.timer[y] += add; log.push(`Timer kota ${y} +${add}.`);
      }
    }
    for (let guard = 0; guard < 40; guard++) {                                       // 3) timer habis -> kota lepas
      const n = timerIds(R).find(k => R.timer[k] <= 0);
      if (n == null) break;
      const bots = [...new Set(ADJ[n].map(y => R.owner[y]).filter(o => o && o !== 'A'))];
      const taker = bots.length ? bots[rng(0, bots.length - 1)] : null;
      const had = new Set(timerIds(R));
      delete R.timer[n];
      R.owner[n] = taker;
      log.push(taker ? `Kota ${n} lepas ke ${nm(taker)}.` : `Kota ${n} menjadi netral.`);
      if (taker) R.botCd[taker] = rng(2, 5);
      const conn = connected(R);
      const disc = NODES.filter(m => !isCap(m) && mine(R, m) && !conn.has(m));
      normalize(R, rng, log);
      for (const m of disc) if (had.has(m) && R.timer[m] != null) {                  // penalti putus (sekali)
        const pen = rng(1, 2); R.timer[m] = Math.max(1, R.timer[m] - pen); log.push(`Penalti terputus: kota ${m} −${pen}.`);
      }
    }
    log.push(`Eskalasi musuh: +${escalation(R.matches)}%.`);                         // 4) eskalasi
    if (!R.over && !opts.skipBots) expandBots(R, rng, log);                          // 5) ekspansi bot
    if (!R.over && CAPS.every(c => R.owner[c] === 'A')) { R.over = 'win'; log.push('Seluruh ibukota benua dikuasai.'); }   // 6)
    return log;
  }

  // ================= Rumus buff (6.2, 6.4, 6.5) — dipakai untuk tampilan; penerapan ke damage = tahap 2 =================
  const SYN = { atk: [[2, 9], [4, 9]], defUnit: [[2, 9], [4, 9]], hpUnit: [[2, 9], [4, 9]], defBld: [[3, 10]], hpBld: [[3, 10]] };
  function cityBuffs(owned) {
    const t = { atk: 0, defUnit: 0, hpUnit: 0, defBld: 0, hpBld: 0, kredit: 0 }, cnt = { atk: 0, defUnit: 0, hpUnit: 0, defBld: 0, hpBld: 0 };
    for (const id of owned) { const c = WW_CITIES[id]; t[c.buff] += c.v; if (c.buff in cnt) cnt[c.buff]++; }
    for (const k in SYN) for (const [need, add] of SYN[k]) if (cnt[k] >= need) t[k] += add;
    return t;
  }
  const escalation = matches => 2 * Math.min(30, matches);
  const capitalDefense = n => Math.max(0, 60 - 20 * n);
  const ownedCities = (R, L) => NODES.filter(n => !isCap(n) && R.owner[n] === L);
  function enemyBuff(R, L, target) {            // ringkasan buff musuh untuk kartu kota (L = huruf bot atau null = pemberontak)
    const t = L ? cityBuffs(ownedCities(R, L)) : cityBuffs([]);
    const esc = escalation(R.matches), f = L ? R.factions[L] : null;
    const cap = (target != null && isCap(target)) ? capitalDefense(ADJ[target].filter(y => mine(R, y)).length) : 0;
    return { atk: t.atk + esc + cap + (f === 'pejalankaki' ? 10 : 0), def: t.defUnit + esc + cap + (f === 'pejalankaki' ? 20 : 0), hp: t.hpUnit + esc + cap, esc, cap };
  }


  // ================= Hook buff pertempuran (6.3, 6.6) =================
  // Semua hook membaca global WW (null di mode lain) dan mengembalikan nilai netral (0 / 1 / nilai asli) saat WW null.
  // WW.side[0] = pemain (HUMAN), WW.side[1] = lawan (BOT). Dihitung sekali di prepareBattle() dan tidak berubah (5.1).
  const COUNTRY_UNIT = { defNonCombat: d => !d.combat, defInfantry: d => d.combat && !d.vehicle, defVehicle: d => !!d.vehicle, defCombat: d => !!d.combat, defBldNonCombat: d => !d.combat };
  const COUNTRY_BLD = ['defBuilding', 'defBldNonCombat'];
  function buildSide(R, L, caps, cities, buffFaction, esc, cap) {   // L = pemilik (huruf) atau null (pemberontak)
    const city = cityBuffs(cities);
    const pk = buffFaction === 'pejalankaki', pb = buffFaction === 'pembangunan';
    return { owner: L, caps: caps.slice(), cities: cities.slice(), city, faction: buffFaction, esc, cap,
      atkPct: city.atk + (pk ? 10 : 0) + esc + cap,
      defUnitBase: city.defUnit + (pk ? 20 : 0) + esc + cap,
      defBldBase: city.defBld + (pb ? 20 : 0) + esc + cap,
      hpUnitPct: city.hpUnit + esc + cap,
      hpBldPct: city.hpBld + esc + cap };
  }
  function countryPct(side, pred, isBld) {            // jumlah buff negara (3.1) dari semua ibukota yang dipegang sisi ini
    let t = 0;
    for (const c of side.caps) {
      const b = WW_COUNTRIES[c].buff;
      if (isBld ? COUNTRY_BLD.includes(b.kind) : (COUNTRY_UNIT[b.kind] && COUNTRY_UNIT[b.kind](pred))) t += b.pct;
    }
    return t;
  }
  const wwSide = o => (WW && WW.side && WW.side[o]) || null;
  function wwAtkPct(owner) { const s = wwSide(owner); return s ? s.atkPct : 0; }
  function wwDefPct(targetInfo) {                       // persen DEF untuk sasaran (unit atau bangunan); ditambahkan ke modifier DEF lama
    const s = wwSide(targetInfo.ownerIdx);
    if (!s) return 0;
    return targetInfo.kind === 'unit' ? s.defUnitBase + countryPct(s, targetInfo.def, false) : s.defBldBase + countryPct(s, null, true);
  }
  function wwHpMul(owner, kind) { const s = wwSide(owner); return s ? 1 + (kind === 'bld' ? s.hpBldPct : s.hpUnitPct) / 100 : 1; }
  function unitHpOf(def, owner) { const base = scaleStat(def.hp, owner); return WW ? Math.round(base * wwHpMul(owner, 'unit')) : base; }
  function corpsHpOf(def, owner) { return WW ? Math.round(def.hp * wwHpMul(owner, 'unit')) : def.hp; }   // Corps Garnisun tidak diskala level bot (v10.2)
  function bldHpOf(baseHp, owner) { return (WW && isFinite(baseHp)) ? Math.round(baseHp * wwHpMul(owner, 'bld')) : baseHp; }
  const wwFaction = owner => { const s = wwSide(owner); return s ? s.faction : null; };
  function fuelMaxOf(def, owner) {
    if (def.fuelMax == null) return def.fuelMax;
    return wwFaction(owner) === 'kendaraan' ? Math.round(def.fuelMax * 1.3) : def.fuelMax;
  }
  function priceOf(key, owner) {
    const def = unitDef(key), base = def && def.price;
    if (typeof base !== 'number' || wwFaction(owner) !== 'elite') return base;
    const top = Math.max(...WW_FACTIONS.elite.units.map(n => { const d = unitDef(WW_UNIT_ID[n]); return d && typeof d.price === 'number' ? d.price : 0; }));
    return base === top ? Math.round(base * 0.7) : base;   // K13: semua unit berharga tertinggi (75 -> 53)
  }
  const bentengUnlimited = owner => wwFaction(owner) === 'pembangunan';
  function maxCountOf(owner, type) {
    const spec = BUILDING_TYPES[type];
    if (wwFaction(owner) !== 'pembangunan' || type === 'garnisun') return spec.maxCount;
    return type === 'benteng' ? Infinity : spec.maxCount + 1;
  }
  function wwIncome(owner, inc) {                       // inc = { kredit, fuel, medical } dasar; mengembalikan nilai sesudah buff
    const s = wwSide(owner);
    if (!s) return inc;
    let k = inc.kredit + s.city.kredit, f = inc.fuel, m = inc.medical;
    if (s.faction === 'ekonomi') { k = Math.round(k * 1.3); f = Math.round(f * 1.3); m = Math.round(m * 1.3); }
    return { kredit: k, fuel: f, medical: m };
  }
  const wwUnitList = () => (WW && WW.unitFaction) ? WW_FACTIONS[WW.unitFaction].units.map(n => WW_UNIT_ID[n]) : null;
  function wwBotAllowed(key) { const l = wwUnitList(); return !l || l.includes(key); }
  function wwCorpsKinds(owner) {                        // 3.4: kolom "Corps di Garnisun"
    const l = (owner === BOT && wwUnitList()) || [];
    return ['corps', 'advcorps'].filter(k => l.includes(k));
  }
  function wwBuffLine(target) {                         // baris panel "Buff WW" (6.6)
    const s = wwSide(target.ownerIdx);
    if (!s) return '';
    const def = wwDefPct(target);
    const txt = target.kind === 'unit' ? `ATK +${s.atkPct}% DEF +${def}%` : `DEF +${def}%`;
    return `<span style="color:#7fb4ff">Buff WW: ${txt}</span><br>`;
  }

  // ================= Penyimpanan (Bagian 9) =================
  let S = null, api = null, selected = null;
  const fresh = () => ({ v: 1, stats: { total: 0, wins: 0, losses: 0, loadout: [] }, run: null });
  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY));
      if (o && o.v === 1 && o.stats) {
        if (o.run && !(o.run.owner && o.run.botCd && o.run.factions)) o.run = null;
        if (!Array.isArray(o.stats.loadout)) o.stats.loadout = [];
        return o;
      }
    } catch (e) { /* data rusak -> mulai baru */ }
    return fresh();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* penyimpanan penuh/diblokir */ } }
  const data = () => S || (S = load());
  const loadout = () => data().stats.loadout.slice();
  function saveLoadout(keys) { data().stats.loadout = keys.slice(); save(); }

  // ================= Alur pertandingan (Bagian 5) =================
  function bind(a) { api = a; }
  function beginBattle(target, role) {          // dipanggil sesaat sebelum startGame (dasar K9)
    const R = data().run;
    let defender, faction;
    if (role === 'defend' && R.pending) { defender = R.pending.defender; faction = R.pending.faction; }
    else {
      const o = R.owner[target];
      defender = (o && o !== 'A') ? o : null;
      faction = defender ? R.factions[defender] : WW_FACTION_IDS[rngDef(0, WW_FACTION_IDS.length - 1)];   // K3: pemberontak = faksi acak
    }
    R.pending = { target, mapType: rngDef(1, WW_MAP_TYPES_READY), defender, faction, role: role || 'attack', started: true };
    save();
  }
  function cancelBattle() { const R = data().run; if (R && R.pending && R.pending.role !== 'defend') { R.pending = null; save(); } else if (R && R.pending) { R.pending.started = false; save(); } }
  function prepareBattle() {                    // global WW untuk satu pertandingan (dibaca main.js)
    const R = data().run, p = R.pending;
    const opp = p.defender;                      // huruf bot lawan, atau null = pemberontak (K3: tanpa buff negara/kota/faksi; hanya eskalasi)
    const esc = escalation(R.matches);
    const defend = p.role === 'defend', tgtCap = (p.target != null && isCap(p.target));
    const capHuman = defend ? capitalDefense(ADJ.A.filter(y => R.owner[y] === opp).length) : 0;                 // 6.5: pembela = pemain
    const capFoe = (!defend && tgtCap) ? capitalDefense(ADJ[p.target].filter(y => mine(R, y)).length) : 0;       // 6.5: pembela = lawan
    const human = buildSide(R, 'A', capsOf(R, 'A'), ownedCities(R, 'A'), null, 0, capHuman);
    const foe = buildSide(R, opp, opp ? capsOf(R, opp) : [], opp ? ownedCities(R, opp) : [], opp ? R.factions[opp] : null, esc, capFoe);
    return { target: p.target, mapType: p.mapType, defender: opp, faction: p.faction, unitFaction: p.faction, role: p.role,
      side: [human, foe],
      buff: [{ atk: human.atkPct, def: human.defUnitBase, hp: human.hpUnitPct }, { atk: foe.atkPct, def: foe.defUnitBase, hp: foe.hpUnitPct }] };
  }
  function settle(win) {                        // 4.4 + statistik, tepat sekali per pertandingan
    const R = data().run;
    if (!R || !R.pending || !R.pending.started) return null;
    const p = R.pending;
    R.pending = null;
    const lines = settleCore(R, { target: p.role === 'defend' ? null : p.target, win, role: p.role, attacker: p.defender });
    S.stats.total++; if (win) S.stats.wins++; else S.stats.losses++;
    R.events = lines; R.lastWin = !!win; R.lastNo = R.matches;
    save();
    return lines;
  }
  function backToMap() {
    try { sessionStorage.setItem('td-open', 'ww'); sessionStorage.removeItem('td-autostart'); } catch (e) { /* abaikan */ }
    location.reload();
  }
  function onBattleEnd(win) {                   // dipanggil showGameOver()
    if (!settle(win)) return;
    Sfx.end(win);
    const wt = document.getElementById('winnerText');
    wt.textContent = win ? 'VICTORY' : 'DEFEAT';
    wt.className = win ? 'victory' : 'defeat';
    document.querySelector('#gameover p').textContent = win ? 'Pertandingan dimenangkan.' : 'Pertandingan dikalahkan.';
    const btn = document.getElementById('wwContinueBtn');
    if (!btn.dataset.bound) { btn.dataset.bound = '1'; btn.addEventListener('click', backToMap); }
    document.getElementById('gameover').style.display = 'flex';
  }
  function confirmLeave() {                     // 5.4: Lobby/Keluar saat pertandingan = KALAH
    dlg({ title: 'Keluar dari pertandingan?', html: '<p>Keluar dihitung KALAH.</p>', buttons: [
      { t: 'Batal' }, { t: 'Keluar', primary: true, cb: () => { settle(false); backToMap(); } }] });
  }

  // ================= Antarmuka (Bagian 8) =================
  let root = null, ui = {};
  const $ = (s, el) => (el || root).querySelector(s);
  const dim = v => v ? '' : ' dim';
  const timerCol = t => t <= 1 ? '#d9473d' : t === 2 ? '#e8c53a' : '#4fb35b';
  const ownerColor = o => o ? WW_COUNTRIES[o].color : '#9a9a9a';

  function dlg({ title, html, buttons, closable }) {
    let d = document.getElementById('wwDlg');
    if (!d) { d = document.createElement('div'); d.id = 'wwDlg'; document.body.appendChild(d); }
    d.innerHTML = `<div class="ww-card" role="dialog" aria-modal="true"><h3>${title}</h3><div class="ww-body">${html || ''}</div><div class="ww-btns"></div></div>`;
    const bx = d.querySelector('.ww-btns');
    const close = () => { d.style.display = 'none'; };
    (buttons || [{ t: 'OK' }]).forEach(b => {
      const el = document.createElement('button');
      el.textContent = b.t; if (b.primary) el.className = 'main';
      el.addEventListener('click', () => { close(); if (b.cb) b.cb(); });
      bx.appendChild(el);
    });
    d.onpointerdown = e => { if (closable && e.target === d) close(); };
    d.style.display = 'flex';
  }
  function toast(msg) {
    let t = document.getElementById('wwToast');
    if (!t) { t = document.createElement('div'); t.id = 'wwToast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 3200);
  }

  function build() {
    root = document.createElement('div');
    root.id = 'wwmap';
    root.innerHTML = `
      <div id="wwTop"><button id="wwBack">← Lobby</button><button id="wwBtnBuff" class="ww-m">Buff</button><b>W O R L D &nbsp; W A R</b><button id="wwBtnRank" class="ww-m">Peringkat</button><button id="wwNew">Run Baru</button></div>
      <div id="wwStage"><svg id="wwSvg" viewBox="0 0 1400 1050" preserveAspectRatio="xMidYMid meet">
        <image href="img/campaign/peta-benua.webp" x="0" y="0" width="1400" height="1050"></image>
        <g id="wwEdges"></g><g id="wwPins"></g><g id="wwTaps"></g></svg></div>
      <div id="wwLeft" class="ww-panel"></div><div id="wwRight" class="ww-panel"></div>
      <div id="wwCard" hidden></div>
      <div id="wwTotalMatches" class="ww-corner"></div><div id="wwTotalWL" class="ww-corner"></div>`;
    document.body.appendChild(root);
    ui = { edges: $('#wwEdges'), pins: $('#wwPins'), taps: $('#wwTaps'), left: $('#wwLeft'), right: $('#wwRight'), card: $('#wwCard'), stage: $('#wwStage') };
    $('#wwBack').addEventListener('click', leave);
    $('#wwNew').addEventListener('click', () => dlg({ title: 'Mulai run baru?', html: '<p>Run saat ini hilang. Statistik seumur hidup tetap.</p>', buttons: [
      { t: 'Batal' }, { t: 'Run Baru', primary: true, cb: newRunNow }] }));
    $('#wwBtnBuff').addEventListener('click', () => { ui.right.classList.remove('open'); ui.left.classList.toggle('open'); });
    $('#wwBtnRank').addEventListener('click', () => { ui.left.classList.remove('open'); ui.right.classList.toggle('open'); });
    ui.taps.addEventListener('click', e => { const n = e.target.dataset && e.target.dataset.n; if (n != null) select(isNaN(+n) ? n : +n); });
    window.addEventListener('resize', () => { if (root && root.classList.contains('on')) render(); });
  }

  function render() {
    const R = S.run;
    const conn = connected(R);
    const w = ui.stage.clientWidth || 700, h = ui.stage.clientHeight || 260, scale = Math.min(w / 1400, h / 1050) || 0.3;
    let e = '';
    for (const [a, b] of WW_EDGES) {
      const pa = pos(a), pb = pos(b), ma = mine(R, a), mb = mine(R, b);
      let st = 'stroke="#2b2b2b" stroke-opacity=".55" stroke-width="4"';
      if (ma && mb) st = (conn.has(a) && conn.has(b)) ? 'stroke="#4a90e2" stroke-width="6"' : 'stroke="#e08a2e" stroke-width="6" stroke-dasharray="14 9"';
      e += `<line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" ${st} stroke-linecap="round"/>`;
    }
    ui.edges.innerHTML = e;
    let p = '', t = '';
    const tapR = Math.max(34, 22 / scale);
    for (const n of NODES) {
      const q = isCap(n) ? WW_COUNTRIES[n].cap : WW_CITIES[n], o = R.owner[n], col = ownerColor(o), r = isCap(n) ? 30 : 19;
      if (attackable(R, n)) p += `<circle class="ww-pulse" cx="${q.x}" cy="${q.y}" r="${r + 9}" fill="none" stroke="#fff" stroke-width="5"/>`;
      if (selected === n) p += `<circle cx="${q.x}" cy="${q.y}" r="${r + 14}" fill="none" stroke="#f2d27a" stroke-width="4"/>`;
      if (isCap(n)) p += `<circle cx="${q.x}" cy="${q.y}" r="30" fill="${col}" stroke="#fff" stroke-width="4"/><text x="${q.x}" y="${q.y}" class="ww-cap">${n}</text>`;
      else p += `<circle cx="${q.x}" cy="${q.y}" r="19" fill="#faf5e6" stroke="${col}" stroke-width="5"/><text x="${q.x}" y="${q.y}" class="ww-num">${n}</text>`;
      if (R.timer[n] != null) p += `<circle cx="${q.x + 16}" cy="${q.y - 16}" r="11" fill="${timerCol(R.timer[n])}" stroke="#fff" stroke-width="2"/><text x="${q.x + 16}" y="${q.y - 16}" class="ww-tm">${R.timer[n]}</text>`;
      t += `<circle data-n="${n}" cx="${q.x}" cy="${q.y}" r="${tapR}" fill="transparent"/>`;
    }
    ui.pins.innerHTML = p; ui.taps.innerHTML = t;
    renderLeft(); renderRight(); renderCorners(); renderCard();
  }

  const countOf = (R, L) => NODES.filter(n => R.owner[n] === L).length;
  const capsOf = (R, L) => CAPS.filter(c => R.owner[c] === L);
  function renderLeft() {
    const R = S.run, b = cityBuffs(ownedCities(R, 'A')), esc = escalation(R.matches);
    const row = (k, v, suf) => `<div class="ww-row${dim(v)}"><span>${k}</span><b>${v ? '+' + v : '+0'}${suf || '%'}</b></div>`;
    const caps = capsOf(R, 'A');
    const owned = [...caps, ...NODES.filter(n => !isCap(n) && R.owner[n] === 'A')];
    const chips = owned.map(n => `<button class="ww-chip" data-n="${n}">${n}${R.timer[n] != null ? `<i style="background:${timerCol(R.timer[n])}">${R.timer[n]}</i>` : ''}</button>`).join('');
    ui.left.innerHTML = `
      <h4>Buff kita</h4>
      ${row('ATK', b.atk)}${row('DEF Unit', b.defUnit)}${row('HP Unit', b.hpUnit)}${row('DEF Bangunan', b.defBld)}${row('HP Bangunan', b.hpBld)}
      <div class="ww-row${dim(b.kredit)}"><span>Kredit</span><b>+${b.kredit} / giliran</b></div>
      <div class="ww-sub">Buff negara</div>
      ${caps.map(c => `<div class="ww-line">[${c}] ${WW_COUNTRIES[c].buff.label}</div>`).join('')}
      <h4>Kota dimiliki ${owned.length}/28</h4><div class="ww-chips">${chips}</div>
      <h4>Pertandingan berjalan: ${R.matches}</h4><div class="ww-line">Eskalasi musuh: +${esc}%</div>`;
    ui.left.querySelectorAll('.ww-chip').forEach(c => c.addEventListener('click', () => { const n = c.dataset.n; select(isNaN(+n) ? n : +n); ui.left.classList.remove('open'); }));
  }
  function renderRight() {
    const R = S.run;
    const rows = CAPS.map(L => ({ L, cnt: countOf(R, L), caps: capsOf(R, L).length, alive: R.alive[L] !== false }));
    rows.sort((a, b) => (b.alive - a.alive) || (b.cnt - a.cnt) || (b.caps - a.caps) || (a.L < b.L ? -1 : 1));
    ui.right.innerHTML = '<h4>Peringkat negara</h4>' + rows.map((r, i) => {
      const star = capsOf(R, r.L).filter(c => c !== r.L).map(() => '★').join('');
      return `<div class="ww-rank${r.L === 'A' ? ' me' : ''}${r.alive ? '' : ' out'}"><span class="rk">${i + 1}.</span><i style="background:${WW_COUNTRIES[r.L].color}">${r.L}</i><span class="nm">${sh(r.L)}${star ? ' <em>' + star + '</em>' : ''}${r.alive ? '' : ' <small>tersingkir</small>'}</span><b>${r.alive ? r.cnt : 0}</b></div>`;
    }).join('');
  }
  function renderCorners() {
    $('#wwTotalMatches').textContent = `Total pertandingan: ${S.stats.total}`;
    $('#wwTotalWL').textContent = `Menang ${S.stats.wins} · Kalah ${S.stats.losses}`;
  }

  function select(n) { selected = n; render(); }
  function renderCard() {
    const c = ui.card, R = S.run;
    if (selected == null) { c.hidden = true; return; }
    const n = selected, o = R.owner[n], cap = isCap(n);
    const title = cap ? `Ibukota ${sh(n)}` : `Kota ${n} — ${sh(WW_CITIES[n].region)}`;
    const ow = o === 'A' ? 'Kita' : o ? `Bot ${o} (${WW_FACTIONS[R.factions[o]].name})` : 'Netral';
    const bl = cap ? WW_COUNTRIES[n].buff.label : (() => { const ct = WW_CITIES[n]; const L = { atk: 'ATK', defUnit: 'DEF unit', hpUnit: 'HP unit', defBld: 'DEF bangunan', hpBld: 'HP bangunan', kredit: 'Kredit' }[ct.buff]; return ct.buff === 'kredit' ? `Kredit +${ct.v} / giliran` : `${L} +${ct.v}%`; })();
    let h = `<h3>${title}</h3><div>Pemilik: ${ow}</div><div>Buff ${cap ? 'negara' : 'kota'}: ${bl}</div>`;
    if (o === 'A' && R.timer[n] != null) h += `<div>Timer: ${R.timer[n]} pertandingan</div>`;
    if (o !== 'A') { const eb = enemyBuff(R, o && o !== 'A' ? o : null, n); h += `<div>Buff musuh: ATK +${eb.atk}% · DEF +${eb.def}% · HP +${eb.hp}%</div>`; }
    const why = o === 'A' ? null : attackReason(R, n);
    if (o !== 'A') h += why ? `<div class="ww-why">${why}</div>` : '';
    h += `<div class="ww-btns">${o !== 'A' ? `<button id="wwAtk" class="main"${why ? ' disabled' : ''}>Serang</button>` : ''}<button id="wwClose">Tutup</button></div>`;
    c.innerHTML = h; c.hidden = false;
    $('#wwClose', c).addEventListener('click', () => { selected = null; render(); });
    const a = $('#wwAtk', c); if (a) a.addEventListener('click', () => { if (attackable(S.run, n)) startBattle(n, 'attack'); });
  }

  function startBattle(target, role) {
    api.showLoading(() => { root.classList.remove('on'); },
      () => showUnitSelectScreen({ mode: 'ww', level: WW_BOT_LEVEL, target, role }));
  }

  function newRunNow() { S.run = newRun(); selected = null; save(); render(); }
  function leave() { root.classList.remove('on'); if (api && api.lobby) api.lobby.style.display = ''; }

  function endScreen() {
    const R = S.run, win = R.over === 'win';
    const own = NODES.filter(n => R.owner[n] === 'A').length;
    dlg({ title: win ? 'KEMENANGAN DUNIA' : 'IBUKOTA JATUH',
      html: `<p>Pertandingan run ini: ${R.matches}<br>Kota dimiliki: ${own}/28</p>`,
      buttons: [{ t: 'Mulai Run Baru', primary: true, cb: newRunNow }] });
  }
  function defendModal() {
    const R = S.run, p = R.pending;
    dlg({ title: 'IBUKOTA DISERANG', html: `<p>Ibukota kita diserang oleh ${nm(p.defender)}.</p>`,
      buttons: [{ t: 'Bertahan', primary: true, cb: () => startBattle('A', 'defend') }] });
  }
  function flow() {                              // ringkasan -> layar akhir / modal bertahan
    const R = S.run;
    const next = () => {
      if (R.over) endScreen();
      else if (R.pending && R.pending.role === 'defend' && !R.pending.started) defendModal();
    };
    if (R.events && R.events.length) {
      dlg({ title: `Pertandingan #${R.lastNo} — ${R.lastWin ? 'MENANG' : 'KALAH'}`,
        html: '<ul>' + R.events.map(x => `<li>${x}</li>`).join('') + '</ul>',
        buttons: [{ t: 'OK', primary: true, cb: () => { R.events = []; save(); next(); } }] });
    } else next();
  }

  function enter() {
    data();
    if (!S.run) { S.run = newRun(); save(); }
    const R = S.run;
    if (R.pending && R.pending.started) {        // 5.5: pertandingan tertinggal = kalah
      settle(false);
      toast('Pertandingan sebelumnya ditinggalkan — dihitung kalah');
    }
    if (!root) build();
    selected = null;
    root.classList.add('on');
    render();
    flow();
  }

  return { bind, enter, leave, beginBattle, cancelBattle, prepareBattle, onBattleEnd, confirmLeave, loadout, saveLoadout,
    wwAtkPct, wwDefPct, wwHpMul, unitHpOf, corpsHpOf, bldHpOf, fuelMaxOf, priceOf, maxCountOf, bentengUnlimited, wwIncome, wwBotAllowed, wwCorpsKinds, wwBuffLine,
    _core: {buildSide, countryPct,  isCap, newRun, connected, isFrontier, attackable, attackReason, normalize, settleCore, expandBots, pickTarget, cityBuffs, escalation, capitalDefense, enemyBuff, ADJ, NODES } };
})();

// v11 tahap 2: hook buff sebagai fungsi global (dipakai rules-*.js, bot.js, render.js, setup.js). Netral bila WW === null.
const { wwAtkPct, wwDefPct, wwHpMul, unitHpOf, corpsHpOf, bldHpOf, fuelMaxOf, priceOf, maxCountOf, bentengUnlimited, wwIncome, wwBotAllowed, wwCorpsKinds, wwBuffLine } = WorldWar;
