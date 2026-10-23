// ====================================================================
// progress.js — v13 Tahap 1-4: akun progres (localStorage 'td-progress'), mata uang & bahan,
// kode, konversi, peti, surat, kepemilikan unit, Naikkan Level, Ascend, dan pengali stat pertandingan.
// Tahap 3: hadiah pertandingan (calcMatchReward, grantMatchReward). Tahap 4: Spin 8 banner + pity + fragmen (spin, exchangeFragments).
// Dokumen rancangan: Rancangan-Tactical-Domination-Progresi-Event v1.1 (Bagian 3-6, 9, 11, 12).
// Modul ini TIDAK menggambar UI (lihat progress-ui.js). Fungsi pengali global (progHpScale, progAtkMul,
// progDefMul, progSpd, progRng) ada di bagian bawah dan mengembalikan nilai netral bila PROG_AKTIF salah
// atau pemilik adalah BOT di mode bot (Bagian 6.1).
// ====================================================================
const Prog = (() => {
  const KEY = 'td-progress';

  // ---------- Data tetap ----------
  const COMMON_UNITS = ['infantry', 'assault', 'sniper', 'antitank', 'trapper', 'tanklapis', 'tankcrusher', 'montir', 'apc', 'corps'];
  const BANNER_UNITS = {
    advKendaraan: ['advtanklapis', 'advtankcrusher'],
    advInfantry: ['advinfantry', 'advassault', 'advsniper', 'advantitank', 'advtrapper'],
    advSupport: ['advmontir', 'advapc', 'advcorps'],
    common: COMMON_UNITS,
  };
  const UNIT_KEYS = [].concat(BANNER_UNITS.common, BANNER_UNITS.advKendaraan, BANNER_UNITS.advInfantry, BANNER_UNITS.advSupport);
  const BANNER_NAME = {
    advKendaraan: 'Advanced Kendaraan', advInfantry: 'Advanced Infantry', advSupport: 'Advanced Support', common: 'Common',
    kAdvPenyerang: 'Advanced Penyerang', kAdvBertahan: 'Advanced Bertahan', kAdvEkonomi: 'Advanced Ekonomi', kCommon: 'Common',
  };
  const BANNERS = ['advKendaraan', 'advInfantry', 'advSupport', 'common', 'kAdvPenyerang', 'kAdvBertahan', 'kAdvEkonomi', 'kCommon'];
  // Kemampuan per unit: [slot 1, slot 2] = [nama, banner kemampuan] (Lampiran B)
  const ABIL = {};
  COMMON_UNITS.forEach(k => { ABIL[k] = null; });   // diisi di bawah
  const COMMON_ABIL = {
    infantry: ['Moral Persatuan', 'Semangat Perjuangan'], assault: ['Serangan Kejut', 'Yang Tersembunyi'],
    sniper: ['Konsentrasi Tinggi', 'Sang Pengamat'], antitank: ['Semangat Besi', 'Ayo Ledakkan'],
    trapper: ['Keberuntungan', 'Pembuat Onar'], tanklapis: ['Sang Pelindung', 'Pejuang Bertahan'],
    tankcrusher: ['Penggila Perang', 'Intimidasi'], montir: ['Penghancur Bangunan', 'Perusak Formasi'],
    apc: ['Dikejar Waktu', 'Kurir Setia'], corps: ['Jangan Menganggur', 'Kerja Sampai Tuntas'],
  };
  for (const k of COMMON_UNITS) ABIL[k] = COMMON_ABIL[k].map(n => [n, 'kCommon']);
  const P = 'kAdvPenyerang', B = 'kAdvBertahan', E = 'kAdvEkonomi';
  Object.assign(ABIL, {
    advinfantry: [['Pengorbanan Terakhir', P], ['Penerus Tekad', B]],
    advassault: [['Lompatan Seketika', E], ['Teknik Kamuflase', B]],
    advsniper: [['Mata Elang', E], ['Titik Fokus', P]],
    advantitank: [['Kebocoran Minyak', P], ['Penembusan', P]],
    advtrapper: [['Hadiah Kejutan', P], ['Bom Beracun', P]],
    advtanklapis: [['Tembok Berjalan', B], ['Tak Terkalahkan', B]],
    advtankcrusher: [['Laras Kedua', P], ['Pasukan Berani Mati', B]],
    advmontir: [['Perubahan Model', E], ['Peluru Pembakar', P]],
    advapc: [['Kelebihan Muatan', E], ['Pantang Menyerah', B]],
    advcorps: [['Percepatan Pembangunan', E], ['Semangat Kerja', E]],
  });
  const ABIL_LIST = [];   // {name, unit, slot (1/2), banner}
  for (const k of UNIT_KEYS) ABIL[k].forEach(([name, banner], i) => ABIL_LIST.push({ name, unit: k, slot: i + 1, banner }));
  const ABIL_BY_NAME = {};
  ABIL_LIST.forEach(a => { ABIL_BY_NAME[a.name] = a; });
  const STARTER_ABIL = ['Moral Persatuan', 'Semangat Perjuangan', 'Jangan Menganggur', 'Kerja Sampai Tuntas'];

  // Level (Bagian 5.3): pengali HP/ATK/DEF dalam per mil; penalti SPD/RNG
  const LV_PM = [700, 725, 750, 775, 825, 850, 875, 900, 925, 1000];
  const LV_EXP = [100, 200, 300, 400, 600, 700, 800, 900, 1200];             // menuju level 2..10
  const LV_GOLD = [1500, 2100, 2700, 3300, 4500, 5100, 5700, 6300, 7500];
  const ASC_COPY = [1, 1, 1, 2, 2, 3], ASC_CRY = [20, 40, 60, 80, 100, 120], ASC_GOLD = [5000, 10000, 15000, 20000, 25000, 30000];
  const MAX_LV = 10, MAX_ASC = 6, PETI_HARIAN_MS = 22 * 3600 * 1000;

  const WALLET_KEYS = ['gold', 'gem', 'crystal', 'expUmum', 'gunpowder', 'steelJade', 'poinTerobos', 'poinBertahan', 'poinTaktis'];
  const isAdvanced = k => k.indexOf('adv') === 0;

  // ---------- Data awal & validasi ----------
  const nn = v => { v = Number(v); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0; };
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  function fresh() {
    const s = { versi: 1, wallet: {}, fragmen: {}, unit: {}, kemampuan: {}, pity: {}, peti: { harianSiapSejak: 0, pertandinganMenunggu: 0, hitungPertandingan: 0 },
      crystalHarian: { tanggal: '', jumlah: 0 }, kode: { kode1Dipakai: false, kode2Dipakai: false, kode3Percobaan: 0 },
      surat: { s1: false, s2: false, s3: false }, loadoutTerakhir: { bot: [], mp: [], event: [] },
      harian: { tanggal: '', pertandingan: 0, deploy: 0, naikLevel: 0, spin: 0, misi: {}, klaim: {}, login: false } };
    WALLET_KEYS.forEach(k => { s.wallet[k] = 0; });
    BANNERS.forEach(b => { s.fragmen[b] = 0; s.pity[b] = { c1: 0, c2: 0 }; });
    UNIT_KEYS.forEach(k => { s.unit[k] = { dimiliki: false, level: 1, ascend: 0, salinan: 0, exp: 0 }; });
    ['infantry', 'corps'].forEach(k => { s.unit[k].dimiliki = true; });
    ABIL_LIST.forEach(a => { s.kemampuan[a.name] = { dimiliki: STARTER_ABIL.includes(a.name) }; });
    return s;
  }
  // Lengkapi bidang hilang tanpa membuang bidang lain; nilai tak sah dipulihkan (Bagian 4.1)
  function normalize(raw) {
    const s = fresh();
    if (!raw || typeof raw !== 'object') return s;
    const w = raw.wallet || {}; WALLET_KEYS.forEach(k => { s.wallet[k] = nn(w[k]); });
    const f = raw.fragmen || {}; BANNERS.forEach(b => { s.fragmen[b] = nn(f[b]); });
    const pt = raw.pity || {}; BANNERS.forEach(b => { const x = pt[b] || {}; s.pity[b] = { c1: nn(x.c1), c2: nn(x.c2) }; });
    const un = raw.unit || {};
    UNIT_KEYS.forEach(k => {
      const x = un[k]; if (!x || typeof x !== 'object') return;
      const o = s.unit[k];
      o.dimiliki = k === 'infantry' || k === 'corps' ? x.dimiliki !== false : x.dimiliki === true;
      o.level = Math.min(MAX_LV, Math.max(1, nn(x.level) || 1));
      o.ascend = Math.min(MAX_ASC, nn(x.ascend));
      o.salinan = nn(x.salinan); o.exp = nn(x.exp);
      if (o.ascend > 0 && o.level < MAX_LV) o.ascend = 0;
      if (!o.dimiliki) { o.level = 1; o.ascend = 0; }
    });
    const ab = raw.kemampuan || {};
    ABIL_LIST.forEach(a => { const x = ab[a.name]; if (x && typeof x === 'object') s.kemampuan[a.name].dimiliki = x.dimiliki === true || STARTER_ABIL.includes(a.name); });
    const pe = raw.peti || {}; s.peti = { harianSiapSejak: nn(pe.harianSiapSejak), pertandinganMenunggu: nn(pe.pertandinganMenunggu), hitungPertandingan: Math.min(1, nn(pe.hitungPertandingan)) };
    const ch = raw.crystalHarian || {}; s.crystalHarian = { tanggal: typeof ch.tanggal === 'string' ? ch.tanggal : '', jumlah: nn(ch.jumlah) };
    const kd = raw.kode || {}; s.kode = { kode1Dipakai: kd.kode1Dipakai === true, kode2Dipakai: kd.kode2Dipakai === true, kode3Percobaan: nn(kd.kode3Percobaan) };
    const sr = raw.surat || {}; s.surat = { s1: sr.s1 === true, s2: sr.s2 === true, s3: sr.s3 === true };
    const lo = raw.loadoutTerakhir || {};
    ['bot', 'mp', 'event'].forEach(m => { s.loadoutTerakhir[m] = Array.isArray(lo[m]) ? lo[m].filter(k => UNIT_KEYS.includes(k)).slice(0, 10) : []; });
    if (raw.harian && typeof raw.harian === 'object') s.harian = Object.assign(s.harian, raw.harian);   // dipakai Tahap 6
    return s;
  }

  let S = fresh();
  const listeners = [];
  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY)); } catch (e) { raw = null; }
    S = normalize(raw);
    return S;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* penyimpanan penuh/diblokir: abaikan */ } listeners.forEach(f => { try { f(); } catch (e) {} }); }
  // Transaksi atomik: muat ulang dulu (dua tab), fn memeriksa semua syarat sebelum mengubah apa pun.
  function tx(fn) { load(); const r = fn(S) || { ok: false }; if (r.ok) save(); return r; }
  const onChange = f => listeners.push(f);

  // ---------- Format ----------
  function fmt(n) { n = nn(n); if (n > 999999999) return '999.999.999'; return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function fmt1(v) { return String(Math.round(v * 10) / 10).replace('.', ','); }

  // ---------- Stat efektif (Bagian 5.3 & 5.5) ----------
  function statsOf(key, level, asc) {
    const d = unitDef(key);
    level = Math.min(MAX_LV, Math.max(1, level | 0)); asc = Math.min(MAX_ASC, Math.max(0, asc | 0));
    const mul = LV_PM[level - 1] * (100 + 2 * asc) / 100000;
    const pen = level <= 4 ? 2 : level <= 9 ? 1 : 0;
    const eff = b => b <= 0 ? 0 : Math.max(Math.min(b, 1), b - pen) + (asc >= MAX_ASC ? 1 : 0);
    return {
      mul, hp: Math.floor(d.hp * mul + 0.5 + 1e-9),
      atk: d.combat ? d.atk * mul : null, def: d.def * mul,
      spd: eff(d.spd), rng: d.combat ? eff(d.range) : 0, jpd: d.jpd,
    };
  }
  const starsOf = ascend => 2 + ascend / 2;                       // 2 .. 5 bintang
  const slotOpen = (u, slot) => slot === 1 ? u.level >= MAX_LV : u.ascend >= MAX_ASC;
  const abilityActive = name => {                                  // dimiliki DAN slot di unit asal terbuka (Bagian 5.6)
    const a = ABIL_BY_NAME[name]; if (!a) return false;
    return !!(S.kemampuan[name] && S.kemampuan[name].dimiliki) && S.unit[a.unit].dimiliki && slotOpen(S.unit[a.unit], a.slot);
  };

  // ---------- Naikkan Level & Ascend ----------
  function levelCost(level) { return level >= MAX_LV ? null : { exp: LV_EXP[level - 1], gold: LV_GOLD[level - 1] }; }
  function ascendCost(asc) { return asc >= MAX_ASC ? null : { salinan: ASC_COPY[asc], crystal: ASC_CRY[asc], gold: ASC_GOLD[asc] }; }
  function levelUp(key) {
    return tx(s => {
      const u = s.unit[key]; if (!u || !u.dimiliki || u.level >= MAX_LV) return { ok: false, msg: 'Tidak bisa dinaikkan' };
      const c = levelCost(u.level);
      if (u.exp + s.wallet.expUmum < c.exp) return { ok: false, msg: 'Exp tidak cukup' };
      if (s.wallet.gold < c.gold) return { ok: false, msg: 'Gold tidak cukup' };
      const dariUnit = Math.min(u.exp, c.exp);                    // exp unit dipakai lebih dulu
      u.exp -= dariUnit; s.wallet.expUmum -= c.exp - dariUnit; s.wallet.gold -= c.gold; u.level++;
      return { ok: true, level: u.level };
    });
  }
  function ascend(key) {
    return tx(s => {
      const u = s.unit[key]; if (!u || !u.dimiliki || u.level < MAX_LV || u.ascend >= MAX_ASC) return { ok: false, msg: 'Tidak bisa Ascend' };
      const c = ascendCost(u.ascend);
      if (u.salinan < c.salinan) return { ok: false, msg: 'Salinan tidak cukup' };
      if (s.wallet.crystal < c.crystal) return { ok: false, msg: 'Crystal tidak cukup' };
      if (s.wallet.gold < c.gold) return { ok: false, msg: 'Gold tidak cukup' };
      u.salinan -= c.salinan; s.wallet.crystal -= c.crystal; s.wallet.gold -= c.gold; u.ascend++;
      return { ok: true, ascend: u.ascend };
    });
  }

  // ---------- Kode (Bagian 11.2-11.3) ----------
  const grant = (s, r) => { for (const k in r) s.wallet[k] += r[k]; return r; };
  function redeem(text) {
    const code = String(text || '').trim().toLowerCase();
    return tx(s => {
      if (code === 'tacticaldomination') {
        if (s.kode.kode1Dipakai) return { ok: false, msg: 'Kode sudah digunakan' };
        s.kode.kode1Dipakai = true; return { ok: true, rewards: grant(s, { expUmum: 5200, gold: 143700, crystal: 420, gem: 50000 }) };
      }
      if (code === '123taktis456') {
        if (s.kode.kode2Dipakai) return { ok: false, msg: 'Kode sudah digunakan' };
        s.kode.kode2Dipakai = true; return { ok: true, rewards: grant(s, { gem: 5000 }) };
      }
      if (code === 'hidupfate123') {                              // "kode menipu": setiap masukan dihitung, termasuk yang ditolak
        s.kode.kode3Percobaan++;
        const n = s.kode.kode3Percobaan;
        if (n === 1) return { ok: true, rewards: grant(s, { expUmum: 10000, crystal: 100, gold: 10000, gem: 1000 }) };
        if (n <= 4) return { ok: true, tolak: true, msg: 'Kode sudah digunakan' };   // ok:true agar hitungan tersimpan
        return { ok: true, rewards: grant(s, { gem: 10000 }) };
      }
      return { ok: false, msg: 'Kode tidak valid' };
    });
  }

  // ---------- Konversi (Bagian 11.4) ----------
  function convert(kind, amount) {
    amount = nn(amount);
    return tx(s => {
      if (amount < 100 || amount % 100 !== 0) return { ok: false, msg: 'Jumlah minimal 100 dan kelipatan 100' };
      if (s.wallet.gem < amount) return { ok: false, msg: 'Gem tidak cukup' };
      s.wallet.gem -= amount;
      if (kind === 'exp') { s.wallet.expUmum += amount; return { ok: true, got: amount }; }
      s.wallet.gold += amount * 5; return { ok: true, got: amount * 5 };
    });
  }

  // ---------- Peti (Bagian 9) ----------
  function harianStatus() {                                       // pengaman jam dimundurkan
    const now = Date.now();
    if (S.peti.harianSiapSejak - now > PETI_HARIAN_MS) { S.peti.harianSiapSejak = now + PETI_HARIAN_MS; save(); }
    const sisa = Math.max(0, S.peti.harianSiapSejak - now);
    return { siap: sisa === 0, sisaMs: sisa };
  }
  function openHarian() {
    return tx(s => {
      const now = Date.now();
      if (s.peti.harianSiapSejak - now > PETI_HARIAN_MS) s.peti.harianSiapSejak = now + PETI_HARIAN_MS;
      if (s.peti.harianSiapSejak > now) return { ok: false, msg: 'Peti harian belum siap' };
      s.peti.harianSiapSejak = now + PETI_HARIAN_MS;
      return { ok: true, rewards: grant(s, { expUmum: 100, gold: 500, crystal: 1, gem: 50 }) };
    });
  }
  const pick3 = a => a[Math.floor(Math.random() * 3)];
  function rollMatchChest() { return { expUmum: pick3([10, 50, 100]), gold: pick3([100, 250, 500]), crystal: pick3([0, 1, 2]), gem: pick3([10, 25, 50]) }; }
  function openMatchChests(count) {
    return tx(s => {
      count = Math.min(count, s.peti.pertandinganMenunggu);
      if (count < 1) return { ok: false, msg: 'Tidak ada peti' };
      const total = { expUmum: 0, gold: 0, crystal: 0, gem: 0 };
      for (let i = 0; i < count; i++) { const r = rollMatchChest(); for (const k in r) total[k] += r[k]; }
      s.peti.pertandinganMenunggu -= count;
      return { ok: true, count, rewards: grant(s, total) };
    });
  }
  // Dipanggil Tahap 3 setiap pertandingan berhadiah selesai: tiap 2 pertandingan = 1 peti
  function addMatchCount() {
    return tx(s => { s.peti.hitungPertandingan++; if (s.peti.hitungPertandingan >= 2) { s.peti.hitungPertandingan = 0; s.peti.pertandinganMenunggu++; return { ok: true, baru: true }; } return { ok: true, baru: false }; });
  }


  // ---------- Hadiah pertandingan (Bagian 8) — Tahap 3 ----------
  // Pengali hadiah per mode (8.1): semua 1 sekarang; diubah di sini tanpa menyentuh rumus. Berlaku untuk Exp, Gold, Gem.
  const MATCH_MULT = { mudah: 1, sedang: 1, sulit: 1, mp: 1 };
  const CRYSTAL_HARIAN_MAX = 5;
  // Hitungan murni (tidak menyentuh akun). info = { deployed:{jenis:n}, alive, lost, hpRatio (0..1), won }
  function calcMatchReward(info, mode) {
    const m = MATCH_MULT[mode] != null ? MATCH_MULT[mode] : 1, exp = {};
    for (const k in (info.deployed || {})) { const n = nn(info.deployed[k]); if (n > 0 && UNIT_KEYS.includes(k)) exp[k] = Math.round(10 * n * m); }
    const total = nn(info.alive) + nn(info.lost), pct = total > 0 ? nn(info.alive) / total : 0;
    const hp = Math.max(0, Math.min(1, Number(info.hpRatio) || 0));
    return { exp, gold: Math.round(1000 * pct * m), gem: Math.round(200 * hp * m), crystalEligible: !!info.won && hp >= 0.999999 };
  }
  // Kreditkan hadiah sekali (atomik): exp unit per jenis, gold, gem, crystal (maks 5/hari), dan hitungan peti pertandingan.
  function grantMatchReward(info, mode) {
    const r = calcMatchReward(info, mode);
    return tx(s => {
      const expGot = {};
      for (const k in r.exp) if (s.unit[k] && s.unit[k].dimiliki) { s.unit[k].exp += r.exp[k]; expGot[k] = r.exp[k]; }   // hanya unit yang dimiliki
      s.wallet.gold += r.gold; s.wallet.gem += r.gem;
      const t = today();
      if (s.crystalHarian.tanggal !== t) s.crystalHarian = { tanggal: t, jumlah: 0 };    // hari baru 00:00 lokal
      const cry = { eligible: r.crystalEligible, got: 0, hariIni: s.crystalHarian.jumlah, batas: false };
      if (r.crystalEligible) {
        if (s.crystalHarian.jumlah < CRYSTAL_HARIAN_MAX) { s.crystalHarian.jumlah++; s.wallet.crystal += 1; cry.got = 1; cry.hariIni = s.crystalHarian.jumlah; }
        else cry.batas = true;
      }
      s.peti.hitungPertandingan++;                                                         // tiap 2 pertandingan berhadiah = 1 peti
      let baru = false;
      if (s.peti.hitungPertandingan >= 2) { s.peti.hitungPertandingan = 0; s.peti.pertandinganMenunggu++; baru = true; }
      return { ok: true, exp: expGot, gold: r.gold, gem: r.gem, crystal: cry, peti: { baru, hitung: s.peti.hitungPertandingan } };
    });
  }

  // ---------- Spin (Bagian 10) — Tahap 4 ----------
  let rnd = Math.random;                                          // dapat diganti untuk uji (setRandom)
  const setRandom = f => { rnd = typeof f === 'function' ? f : Math.random; };
  const SPIN_CFG = {
    advKendaraan: { kind: 'unit', p1: 75, p10: 700 }, advInfantry: { kind: 'unit', p1: 75, p10: 700 },
    advSupport: { kind: 'unit', p1: 75, p10: 700 }, common: { kind: 'unit', p1: 50, p10: 450 },
    kAdvPenyerang: { kind: 'abil', p1: 75, p10: 700 }, kAdvBertahan: { kind: 'abil', p1: 75, p10: 700 },
    kAdvEkonomi: { kind: 'abil', p1: 75, p10: 700 }, kCommon: { kind: 'abil', p1: 50, p10: 450 },
  };
  const SPIN_UNIT_BANNERS = ['advKendaraan', 'advInfantry', 'advSupport', 'common'];
  const SPIN_ABIL_BANNERS = ['kAdvPenyerang', 'kAdvBertahan', 'kAdvEkonomi', 'kCommon'];
  const mainPool = b => SPIN_CFG[b].kind === 'unit' ? BANNER_UNITS[b].slice() : ABIL_LIST.filter(a => a.banner === b).map(a => a.name);
  // 10.2: bobot kategori (total 3.000); 10.3: nilai & bobot di dalam kategori
  const CAT_W = [['utama', 3], ['fragmen', 30], ['crystal', 239], ['gunpowder', 239], ['steelJade', 239], ['gold', 750], ['exp', 750], ['gem', 750]];
  const TIER1 = ['utama', 'fragmen'], TIER2 = ['crystal', 'gunpowder', 'steelJade'];
  const eq = a => a.map(v => [v, 1]);
  const VAL_W = {
    gold: [[100, 25], [200, 25], [500, 20], [700, 20], [1000, 10]],
    exp: [[50, 9], [100, 9], [150, 9], [200, 9], [500, 4]],
    gem: eq([5, 10, 15, 20, 25]),
    crystal: [[1, 3], [2, 3], [3, 3], [5, 1]],
    gunpowder: eq([5, 10, 15, 20, 25, 30]),
    steelJade: eq([20, 30, 40, 50]),
    fragmen: eq([1, 2, 3, 4, 5]),
  };
  function wpick(list) {                                           // undian bobot bilangan bulat
    let total = 0; list.forEach(x => { total += x[1]; });
    let x = Math.floor(rnd() * total);
    for (const [v, w] of list) { if (x < w) return v; x -= w; }
    return list[list.length - 1][0];
  }
  const pityInfo = b => { const p = S.pity[b]; return { t1: Math.max(0, 90 - p.c1), t2: Math.max(0, 10 - p.c2) }; };
  const chanceEach = b => 0.1 / mainPool(b).length;               // persen per hadiah utama (tabel 10.1)

  // Beri satu hadiah (10.5) ke s; mengembalikan {type, ...} untuk tampilan.
  function rollPrize(s, banner, cat) {
    const cfg = SPIN_CFG[banner];
    if (cat === 'utama') {
      const pool = mainPool(banner), pick = pool[Math.floor(rnd() * pool.length)];
      if (cfg.kind === 'unit') {
        const u = s.unit[pick];
        if (!u.dimiliki) { u.dimiliki = true; u.level = 1; u.ascend = 0; return { type: 'unit', key: pick, label: 'BARU', isNew: true }; }
        if (u.ascend >= MAX_ASC) { s.fragmen[banner] += 5; return { type: 'unit', key: pick, frag: 5, label: '+5 Fragmen, unit sudah maksimal' }; }
        u.salinan++; return { type: 'unit', key: pick, label: '+1 Salinan', salinan: 1 };
      }
      const a = s.kemampuan[pick];
      if (!a.dimiliki) { a.dimiliki = true; return { type: 'abil', name: pick, label: 'BARU', isNew: true }; }
      s.fragmen[banner] += 5; return { type: 'abil', name: pick, frag: 5, label: 'Kemampuan sudah dimiliki, +5 Fragmen' };
    }
    const n = wpick(VAL_W[cat]);
    if (cat === 'fragmen') { s.fragmen[banner] += n; return { type: 'fragmen', amount: n, banner }; }
    const wk = cat === 'exp' ? 'expUmum' : cat;                    // crystal, gunpowder, steelJade, gold, gem -> wallet
    s.wallet[wk] += n;
    return { type: cat, amount: n };
  }
  // Satu spin: atomik (bayar Gem, pity, undian, hadiah, simpan) — alur 10.4
  function spinOnce(banner, price) {
    return tx(s => {
      if (s.wallet.gem < price) return { ok: false, msg: 'Gem tidak cukup' };
      s.wallet.gem -= price;
      const p = s.pity[banner]; p.c1++; p.c2++;
      let cat, tier;
      if (p.c1 >= 90) { tier = 1; cat = wpick([['utama', 3], ['fragmen', 30]]); }          // Tier 1 dijamin (lebih dulu)
      else if (p.c2 >= 10) { tier = 2; cat = wpick(eq(TIER2)); }                            // Tier 2 dijamin
      else { cat = wpick(CAT_W); tier = TIER1.includes(cat) ? 1 : TIER2.includes(cat) ? 2 : 3; }
      if (tier === 1) p.c1 = 0; else if (tier === 2) p.c2 = 0;                              // penghitung tier lain tidak berubah
      return { ok: true, item: rollPrize(s, banner, cat), tier };
    });
  }
  // times 1 atau 10. 10x = sepuluh spin berurutan, tiap spin menyimpan data (harga 10x dibagi sepuluh). Tanpa jaminan tambahan.
  function spin(banner, times) {
    const cfg = SPIN_CFG[banner];
    if (!cfg || (times !== 1 && times !== 10)) return { ok: false, msg: 'Banner tidak dikenal' };
    load();
    const price = times === 10 ? cfg.p10 : cfg.p1;
    if (S.wallet.gem < price) return { ok: false, msg: 'Gem tidak cukup', kurangGem: true };
    const per = price / times, items = [];
    for (let i = 0; i < times; i++) { const r = spinOnce(banner, per); if (!r.ok) break; items.push(r.item); }
    if (!items.length) return { ok: false, msg: 'Gem tidak cukup', kurangGem: true };
    return { ok: true, banner, times, items, partial: items.length < times };
  }

  // ---------- Tukar 5 Fragmen (10.5) ----------
  // Keadaan satu pilihan di banner: 'baru' (membuka), 'salinan' (+1 salinan), 'maks' (unit 5 bintang), 'dimiliki' (kemampuan sudah dimiliki)
  function exchangeState(banner, pick) {
    if (SPIN_CFG[banner].kind === 'unit') { const u = S.unit[pick]; return !u.dimiliki ? 'baru' : u.ascend >= MAX_ASC ? 'maks' : 'salinan'; }
    return S.kemampuan[pick].dimiliki ? 'dimiliki' : 'baru';
  }
  function exchangeFragments(banner, pick) {
    return tx(s => {
      const cfg = SPIN_CFG[banner];
      if (!cfg || !mainPool(banner).includes(pick)) return { ok: false, msg: 'Pilihan tidak sah' };
      if (s.fragmen[banner] < 5) return { ok: false, msg: 'Fragmen tidak cukup' };
      let label;
      if (cfg.kind === 'unit') {
        const u = s.unit[pick];
        if (!u.dimiliki) { u.dimiliki = true; u.level = 1; u.ascend = 0; label = 'BARU'; }
        else if (u.ascend >= MAX_ASC) return { ok: false, msg: 'Unit sudah bintang 5' };
        else { u.salinan++; label = '+1 Salinan'; }
      } else {
        if (s.kemampuan[pick].dimiliki) return { ok: false, msg: 'Kemampuan sudah dimiliki' };
        s.kemampuan[pick].dimiliki = true; label = 'BARU';
      }
      s.fragmen[banner] -= 5;
      return { ok: true, label, pick, kind: cfg.kind };
    });
  }

  // ---------- Surat ----------
  const suratKey = n => 's' + n;
  function suratBaca(n) { if (!S.surat[suratKey(n)]) { S.surat[suratKey(n)] = true; save(); } }
  const suratSudahDipakai = n => n === 1 ? S.kode.kode1Dipakai : n === 2 ? S.kode.kode2Dipakai : false;   // surat 3 tidak pernah bertanda
  function adaDot() {
    return harianStatus().siap || S.peti.pertandinganMenunggu > 0 || !(S.surat.s1 && S.surat.s2 && S.surat.s3);
  }

  // ---------- Pilihan terakhir Pilih Unit ----------
  const getLoadout = mode => (S.loadoutTerakhir[mode] || []).filter(k => S.unit[k] && S.unit[k].dimiliki);
  function saveLoadout(mode, list) { tx(s => { s.loadoutTerakhir[mode] = list.filter(k => UNIT_KEYS.includes(k)).slice(0, 10); return { ok: true }; }); }

  // ---------- Multiplayer (Bagian 6.6) ----------
  function exportMatchProg(types) {
    const u = {}, ab = [];
    (types || []).forEach(k => { if (S.unit[k]) { u[k] = [S.unit[k].level, S.unit[k].ascend]; ABIL[k].forEach(([n]) => { if (S.kemampuan[n].dimiliki) ab.push(n); }); } });
    return { unit: u, abil: ab };
  }
  function sanitizeMatchProg(raw) {                                // data lawan: jepit rentang, abaikan jenis tak dikenal
    const out = { unit: {}, abil: [] };
    if (!raw || typeof raw !== 'object') return out;
    const un = raw.unit || {};
    for (const k of Object.keys(un)) {
      if (!UNIT_KEYS.includes(k) || !Array.isArray(un[k])) continue;
      let lv = Math.min(MAX_LV, Math.max(1, nn(un[k][0]) || 1)), as = Math.min(MAX_ASC, nn(un[k][1]));
      if (lv < MAX_LV) as = 0;
      out.unit[k] = [lv, as];
    }
    if (Array.isArray(raw.abil)) out.abil = raw.abil.filter(n => ABIL_BY_NAME[n]).slice(0, 40);
    return out;
  }
  const localInfo = type => { const u = S.unit[type]; return u ? { level: u.level, asc: u.ascend } : null; };

  load();
  return { KEY, UNIT_KEYS, COMMON_UNITS, BANNER_UNITS, BANNER_NAME, BANNERS, ABIL, ABIL_LIST, ABIL_BY_NAME, LV_EXP, LV_GOLD, ASC_COPY, ASC_CRY, ASC_GOLD, MAX_LV, MAX_ASC,
    get data() { return S; }, load, save, tx, onChange, fmt, fmt1, statsOf, starsOf, slotOpen, abilityActive, levelCost, ascendCost, levelUp, ascend, redeem, convert,
    MATCH_MULT, CRYSTAL_HARIAN_MAX, calcMatchReward, grantMatchReward,
    SPIN_CFG, SPIN_UNIT_BANNERS, SPIN_ABIL_BANNERS, mainPool, CAT_W, VAL_W, TIER1, TIER2, pityInfo, chanceEach, spin, setRandom, exchangeState, exchangeFragments,
    harianStatus, openHarian, openMatchChests, addMatchCount, suratBaca, suratSudahDipakai, adaDot, getLoadout, saveLoadout, exportMatchProg, sanitizeMatchProg, localInfo, isAdvanced, today };
})();

// ====================================================================
// Pengali progresi untuk aturan pertandingan (Bagian 6.2). Netral bila PROG_AKTIF salah,
// bila pemilik adalah BOT di mode bot, atau jenis tidak dikenal.
// ====================================================================
function progInfo(owner, type) {
  if (typeof PROG_AKTIF === 'undefined' || !PROG_AKTIF) return null;
  if (MPM) {
    if (owner === HUMAN) return Prog.localInfo(type);
    const o = MPM.oppProg && MPM.oppProg.unit && MPM.oppProg.unit[type];
    return o ? { level: o[0], asc: o[1] } : null;
  }
  return owner === HUMAN ? Prog.localInfo(type) : null;
}
function progStats(owner, type) { const i = progInfo(owner, type); return i ? Prog.statsOf(type, i.level, i.asc) : null; }
function progHpScale(owner, type, hp) { const s = progStats(owner, type); return s ? Math.floor(hp * s.mul + 0.5 + 1e-9) : hp; }
function progAtkMul(owner, type) { const s = progStats(owner, type); return s ? s.mul : 1; }
function progDefMul(owner, type) { const s = progStats(owner, type); return s ? s.mul : 1; }
// SPD/RNG: ganti nilai dasar dengan nilai progresi (bilangan bulat); dasar 0 tetap 0
function progSpd(owner, type, base) { const s = progStats(owner, type); return s ? s.spd : base; }
function progRng(owner, type, base) { const s = progStats(owner, type); return s ? (base > 0 ? s.rng : 0) : base; }
