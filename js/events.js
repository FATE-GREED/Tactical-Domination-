// ====================================================================
// events.js — v13 Tahap 6: jadwal & periode event, penyimpanan 'td-event', percobaan harian, kredit poin & peti event
// (16.3), Event Harian (16.9) dan Toko Event (16.10). Modul ini TIDAK menggambar UI (lihat events-ui.js) dan TIDAK
// memuat mekanik pertempuran event (peta, Balista, Racun, void, spawner: Tahap 7-8). Tahap 7-8 cukup memanggil:
//   Ev.consumeAttempt(n)           saat tombol Mulai ditekan (memotong 1 dari 5 percobaan hari itu)
//   Ev.credit1(hpBangunan, bangunanPemain) / Ev.credit2({hpLost, turn}) / Ev.credit3(tahap, {hpLost, turn, markasHancur})
//                                  saat percobaan berakhir (atomik, sekali per periode lewat tonggak/rekor)
//   Ev.daily.matchDone('event'), Ev.daily.deploy(n)  untuk misi Event Harian
// Dokumen rancangan v1.1: Bagian 4 (data), 16.1-16.3, 16.9-16.11.
// ====================================================================
const Ev = (() => {
  const KEY = 'td-event';
  const MAX_PERCOBAAN = 5;
  const DAY = 86400000;

  // ---------- Jadwal (16.1) ----------
  // anchor = [tahun, bulan(0-11), tanggal] awal periode pertama, waktu lokal perangkat.
  const EVENTS = {
    1: { no: 1, nama: 'Terobos Benteng Musuh', panjang: 14, anchor: [2026, 9, 26], reset: 'Senin', poin: 'poinTerobos', poinNama: 'Poin Terobos', toko: 'Toko Terobos' },
    2: { no: 2, nama: 'Benteng Pertahanan Terakhir', panjang: 14, anchor: [2026, 10, 2], reset: 'Senin', poin: 'poinBertahan', poinNama: 'Poin Bertahan', toko: 'Toko Bertahan' },
    3: { no: 3, nama: 'Jendral Perang Taktis', panjang: 7, anchor: [2026, 9, 23], reset: 'Jumat', poin: 'poinTaktis', poinNama: 'Poin Taktis', toko: 'Toko Taktis' },
  };
  const NOS = [1, 2, 3];
  const nowMs = () => Prog.nowMs();
  // nomor hari kalender lokal (bebas masalah DST): hari sejak epoch menurut tanggal lokal
  const dayNum = ms => { const d = new Date(ms); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); };
  const anchorDay = n => Math.floor(Date.UTC(EVENTS[n].anchor[0], EVENTS[n].anchor[1], EVENTS[n].anchor[2]) / DAY);
  // Nomor periode: bagian bulat (hari sejak anchor / panjang), pembagian ke bawah untuk tanggal sebelum anchor
  function periodAt(n, ms) { return Math.floor((dayNum(ms === undefined ? nowMs() : ms) - anchorDay(n)) / EVENTS[n].panjang); }
  // Waktu (ms) reset berikutnya untuk periode id: 00:00 lokal hari pertama periode id+1
  function resetAt(n, id) {
    const a = EVENTS[n].anchor;
    return new Date(a[0], a[1], a[2] + (id + 1) * EVENTS[n].panjang, 0, 0, 0, 0).getTime();
  }
  const nn = v => { v = Number(v); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0; };
  const arrInt = (a, len, fill) => { const o = []; for (let i = 0; i < len; i++) o.push(Array.isArray(a) ? nn(a[i]) : fill); return o; };

  // ---------- Data (td-event) ----------
  const TONGGAK2 = [5, 10, 15, 20, 25, 30];          // Event 2: peti 400 gem
  const TONGGAK3 = [3, 6, 9, 12, 15, 18];            // Event 3: peti 100 gem per tahap
  const BANGUNAN1 = 10, HP_BANGUNAN1 = 200;
  function freshEvent(n, id) {
    const e = { id: id, tglPercobaan: '', percobaanHariIni: 0, tonggak: [], poin: 0, beli: {} };
    resetProgress(n, e);
    return e;
  }
  // Hapus progres periode (16.1): HP bangunan, rekor, tonggak, tahap, poin dikreditkan, batas toko. Percobaan harian tidak disentuh.
  function resetProgress(n, e) {
    e.tonggak = []; e.poin = 0; e.beli = {};
    if (n === 1) { e.hp = Array(BANGUNAN1).fill(HP_BANGUNAN1); e.bangunan = []; e.selesai = false; }
    if (n === 2) { e.skor = 0; }
    if (n === 3) { e.tahap = 1; e.skor = [0, 0, 0, 0, 0]; e.tonggak = [[], [], [], [], []]; e.markas = [false, false, false, false, false]; }
  }
  function normBangunan(list) {
    const out = [];
    (Array.isArray(list) ? list : []).slice(0, 60).forEach(b => {
      if (b && typeof b.jenis === 'string' && b.jenis.length < 24 && Number.isFinite(+b.r) && Number.isFinite(+b.c)) out.push({ jenis: b.jenis, r: Math.floor(+b.r), c: Math.floor(+b.c), hp: nn(b.hp), tiles: (Array.isArray(b.tiles) ? b.tiles : []).slice(0, 7).filter(t => Array.isArray(t) && Number.isFinite(+t[0]) && Number.isFinite(+t[1])).map(t => [Math.floor(+t[0]), Math.floor(+t[1])]) });
    });
    return out;
  }
  function normEvent(n, raw, idNow) {
    const e = freshEvent(n, idNow);
    if (!raw || typeof raw !== 'object') return e;
    e.id = Number.isFinite(+raw.id) ? Math.floor(+raw.id) : idNow;
    e.tglPercobaan = typeof raw.tglPercobaan === 'string' ? raw.tglPercobaan : '';
    e.percobaanHariIni = Math.min(MAX_PERCOBAAN, nn(raw.percobaanHariIni));
    e.poin = nn(raw.poin);
    const be = {}; if (raw.beli && typeof raw.beli === 'object') for (let i = 1; i <= 20; i++) { const v = nn(raw.beli[i]); if (v) be[i] = v; }
    e.beli = be;
    if (n === 1) {
      e.hp = arrInt(raw.hp, BANGUNAN1, HP_BANGUNAN1).map((v, i) => Array.isArray(raw.hp) && raw.hp[i] !== undefined ? Math.min(HP_BANGUNAN1, nn(raw.hp[i])) : HP_BANGUNAN1);
      e.bangunan = normBangunan(raw.bangunan);
      e.selesai = e.hp.every(h => h <= 0);
      e.tonggak = (Array.isArray(raw.tonggak) ? raw.tonggak : []).map(nn).filter(i => i < BANGUNAN1 && e.hp[i] <= 0).filter((v, i, a) => a.indexOf(v) === i);
    }
    if (n === 2) {
      e.skor = nn(raw.skor);
      e.tonggak = (Array.isArray(raw.tonggak) ? raw.tonggak : []).map(nn).filter(t => TONGGAK2.includes(t)).filter((v, i, a) => a.indexOf(v) === i);
    }
    if (n === 3) {
      e.tahap = Math.min(5, Math.max(1, nn(raw.tahap) || 1));
      e.skor = arrInt(raw.skor, 5, 0);
      e.tonggak = [0, 1, 2, 3, 4].map(i => (Array.isArray(raw.tonggak) && Array.isArray(raw.tonggak[i]) ? raw.tonggak[i] : []).map(nn).filter(t => TONGGAK3.includes(t)).filter((v, j, a) => a.indexOf(v) === j));
      e.markas = [0, 1, 2, 3, 4].map(i => !!(Array.isArray(raw.markas) && raw.markas[i] === true));
    }
    return e;
  }

  let D = null;
  function loadRaw() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  // Muat + terapkan reset periode. Nomor periode tertinggi yang pernah terlihat dipakai bila jam dimundurkan (16.1).
  function load() {
    const raw = loadRaw();
    const d = { versi: 1, e: {} };
    let berubah = false;
    NOS.forEach(n => {
      const idNow = periodAt(n);
      const e = normEvent(n, raw && raw.e && raw.e[n], idNow);
      if (idNow > e.id) { berubah = true; const keep = { tgl: e.tglPercobaan, hari: e.percobaanHariIni }; const f = freshEvent(n, idNow); f.tglPercobaan = keep.tgl; f.percobaanHariIni = keep.hari; d.e[n] = f; }
      else d.e[n] = e;                                    // periode sama, atau jam mundur (id tersimpan lebih tinggi dipakai)
    });
    D = d;
    if (berubah) { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* abaikan */ } }   // simpan nomor periode tertinggi yang pernah terlihat (jam mundur)
    return D;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* penuh/diblokir: abaikan */ } listeners.forEach(f => { try { f(); } catch (e) {} }); }
  const listeners = []; const onChange = f => listeners.push(f);
  const data = () => D || load();
  const ev = n => load().e[n];                            // selalu segar (dua tab) dan sudah direset periode

  // ---------- Percobaan (16.1: maks 5 per hari per event) ----------
  function todayStr() { return Prog.today(); }
  function rollAttempts(e) {                              // reset 00:00 lokal; jam mundur tidak mengembalikan percobaan
    const t = todayStr();
    if (e.tglPercobaan === t || (e.tglPercobaan && t < e.tglPercobaan)) return;
    e.tglPercobaan = t; e.percobaanHariIni = 0;
  }
  function attemptsLeft(n) { const e = ev(n); rollAttempts(e); return Math.max(0, MAX_PERCOBAAN - e.percobaanHariIni); }
  // Satu percobaan terpakai saat Mulai ditekan; keluar di tengah tetap habis.
  function consumeAttempt(n) {
    const e = ev(n); rollAttempts(e);
    if (n === 1 && e.selesai) return { ok: false, msg: 'Selesai' };
    if (e.percobaanHariIni >= MAX_PERCOBAAN) return { ok: false, msg: 'Percobaan hari ini habis' };
    e.percobaanHariIni++; save();
    return { ok: true, sisa: MAX_PERCOBAAN - e.percobaanHariIni };
  }
  // Info untuk kartu event
  function info(n) {
    const e = ev(n); rollAttempts(e);
    const id = e.id, reset = resetAt(n, id);
    const o = { no: n, meta: EVENTS[n], id, resetMs: reset, sisaMs: Math.max(0, reset - nowMs()), percobaan: Math.max(0, MAX_PERCOBAAN - e.percobaanHariIni), poin: e.poin };
    if (n === 1) { o.hancur = e.hp.filter(h => h <= 0).length; o.total = BANGUNAN1; o.selesai = e.selesai; o.petiDiambil = e.tonggak.length; }
    if (n === 2) { o.rekor = e.skor; o.tonggak = e.tonggak.slice(); }
    if (n === 3) { o.tahap = e.tahap; o.skor = e.skor.slice(); o.tonggak = e.tonggak.map(a => a.slice()); o.markas = e.markas.slice(); }
    return o;
  }

  // ---------- Kredit poin & peti (16.3). Atomik: akun dikreditkan dulu, lalu data event disimpan. ----------
  function pay(n, poin, gem) {
    return Prog.tx(s => { s.wallet[EVENTS[n].poin] += poin; s.wallet.gem += gem; return { ok: true }; });
  }
  const hasil = (n, poinBaru, e, peti) => ({ ok: true, poinBaru, total: e.poin, peti, gem: peti.reduce((a, p) => a + p.gem, 0) });
  // Event 1: hpBangunan = HP sisa 10 bangunan musuh di akhir percobaan (tersimpan antar percobaan; hanya bisa turun).
  function credit1(hpBangunan, bangunanPemain) {
    const e = ev(1);
    if (!Array.isArray(hpBangunan) || hpBangunan.length !== BANGUNAN1) return { ok: false, msg: 'Data tidak sah' };
    let poin = 0; const peti = [];
    for (let i = 0; i < BANGUNAN1; i++) {
      const baru = Math.min(e.hp[i], nn(hpBangunan[i]));
      poin += e.hp[i] - baru; e.hp[i] = baru;
      if (baru <= 0 && !e.tonggak.includes(i)) { e.tonggak.push(i); peti.push({ gem: 200, sumber: 'bangunan ' + (i + 1) }); }
    }
    e.bangunan = normBangunan(bangunanPemain);
    e.selesai = e.hp.every(h => h <= 0);
    e.poin += poin;
    const gem = peti.reduce((a, p) => a + p.gem, 0);
    if (!pay(1, poin, gem).ok) return { ok: false, msg: 'Gagal menyimpan' };
    save();
    const r = hasil(1, poin, e, peti); r.selesai = e.selesai; return r;
  }
  // Event 2: skor = HP musuh hilang / 4 (ke bawah); poin = selisih terhadap rekor; peti 400 gem di turn 5..30 (sekali per periode).
  function credit2(res) {
    const e = ev(2); res = res || {};
    const skor = Math.floor(nn(res.hpLost) / 4), turn = nn(res.turn);
    const naik = Math.max(0, skor - e.skor); e.skor = Math.max(e.skor, skor);
    const peti = [];
    TONGGAK2.forEach(t => { if (turn >= t && !e.tonggak.includes(t)) { e.tonggak.push(t); peti.push({ gem: 400, sumber: 'turn ' + t }); } });
    e.poin += naik;
    if (!pay(2, naik, peti.length * 400).ok) return { ok: false, msg: 'Gagal menyimpan' };
    save();
    const r = hasil(2, naik, e, peti); r.skor = skor; r.rekor = e.skor; return r;
  }
  // Event 3: per tahap. skor = HP musuh hilang (termasuk Markas) / 4; peti 100 gem tiap 3 turn (maks 6) + 200 gem Markas musuh hancur.
  function credit3(tahap, res) {
    const e = ev(3); res = res || {}; tahap = Math.floor(Number(tahap));
    if (!(tahap >= 1 && tahap <= 5) || tahap > e.tahap) return { ok: false, msg: 'Tahap terkunci' };
    const i = tahap - 1, skor = Math.floor(nn(res.hpLost) / 4), turn = nn(res.turn);
    const naik = Math.max(0, skor - e.skor[i]); e.skor[i] = Math.max(e.skor[i], skor);
    const peti = [];
    TONGGAK3.forEach(t => { if (turn >= t && !e.tonggak[i].includes(t)) { e.tonggak[i].push(t); peti.push({ gem: 100, sumber: 'turn ' + t }); } });
    if (res.markasHancur) {
      if (!e.markas[i]) { e.markas[i] = true; peti.push({ gem: 200, sumber: 'Markas musuh' }); }
      e.tahap = Math.min(5, Math.max(e.tahap, tahap + 1));                      // tahap berikut terbuka (periode yang sama)
    }
    e.poin += naik;
    if (!pay(3, naik, peti.reduce((a, p) => a + p.gem, 0)).ok) return { ok: false, msg: 'Gagal menyimpan' };
    save();
    const r = hasil(3, naik, e, peti); r.skor = skor; r.rekorTahap = e.skor[i]; r.tahapTerbuka = e.tahap; r.menang = !!res.markasHancur; return r;
  }

  // ---------- Event Harian (16.9) ----------
  const MISI = [
    { id: 'login', nama: 'Login', tiers: [[1, 10]], hitung: h => (h.login ? 1 : 0) },
    { id: 'pertandingan', nama: 'Selesaikan pertandingan', tiers: [[1, 10], [2, 15], [3, 20], [4, 25], [5, 30]], hitung: h => h.pertandingan },
    { id: 'deploy', nama: 'Deploy unit', tiers: [[5, 10], [10, 15], [15, 20], [20, 25]], hitung: h => h.deploy },
    { id: 'mp', nama: 'Multiplayer', tiers: [[1, 15]], hitung: h => (h.misi.mp ? 1 : 0) },
    { id: 'ww', nama: 'World War', tiers: [[1, 15]], hitung: h => (h.misi.ww ? 1 : 0) },
    { id: 'campaign', nama: 'Campaign', tiers: [[1, 10]], hitung: h => (h.misi.campaign ? 1 : 0) },
    { id: 'naikLevel', nama: 'Naikkan level', tiers: [[1, 10], [2, 15], [3, 20], [4, 25], [5, 30]], hitung: h => h.naikLevel },
    { id: 'spin', nama: 'Spin', tiers: [[1, 10], [5, 15], [10, 20], [15, 25], [20, 30]], hitung: h => h.spin },
  ];
  const KLAIM = { 20: { expUmum: 100 }, 40: { gold: 500 }, 60: { expUmum: 100, gold: 500 }, 80: { crystal: 1 }, 100: { gem: 150 } };
  const KLAIM_LIST = [20, 40, 60, 80, 100];
  const MAX_POIN_HARIAN = MISI.reduce((a, m) => a + m.tiers.reduce((b, t) => b + t[1], 0), 0);   // 420

  function harian() { Prog.load(); const s = Prog.data; Prog.dailyRoll(s); return s.harian; }   // salinan segar untuk dibaca
  function dailyView() {
    const h = harian(); let poin = 0;
    const rows = MISI.map(m => {
      const c = m.hitung(h);
      const tiers = m.tiers.map(([syarat, p]) => { const selesai = c >= syarat; if (selesai) poin += p; return { syarat, poin: p, selesai }; });
      return { id: m.id, nama: m.nama, hitung: c, tiers };
    });
    const klaim = KLAIM_LIST.map(t => ({ poin: t, hadiah: KLAIM[t], diklaim: h.klaim[t] === true, bisa: poin >= t && h.klaim[t] !== true }));
    return { poin, max: MAX_POIN_HARIAN, rows, klaim, bisaKlaim: klaim.some(k => k.bisa) };
  }
  const daily = {
    view: dailyView,
    claimable: () => dailyView().klaim.filter(k => k.bisa).length,
    // Login otomatis saat game dibuka pertama kali pada hari itu
    touchLogin() { return Prog.tx(s => { const h = Prog.dailyRoll(s); if (h.login) return { ok: false }; h.login = true; return { ok: true }; }); },
    // kind: 'bot' | 'mp' | 'campaign' | 'ww' | 'event' — pertandingan yang berakhir normal (bukan ditinggalkan)
    matchDone(kind) {
      return Prog.tx(s => {
        const h = Prog.dailyRoll(s); h.pertandingan = nn(h.pertandingan) + 1;
        if (kind === 'mp' || kind === 'ww' || kind === 'campaign') h.misi[kind] = true;
        return { ok: true };
      });
    },
    deploy(n) { return Prog.tx(s => { Prog.dailyBump(s, 'deploy', n === undefined ? 1 : n); return { ok: true }; }); },
    claim(poin) {
      return Prog.tx(s => {
        const h = Prog.dailyRoll(s);
        if (!KLAIM[poin]) return { ok: false, msg: 'Hadiah tidak dikenal' };
        // poin hari ini dihitung dari penghitung yang sama dengan tampilan
        let total = 0; MISI.forEach(m => { const c = m.hitung(h); m.tiers.forEach(([sy, p]) => { if (c >= sy) total += p; }); });
        if (total < poin) return { ok: false, msg: 'Poin belum cukup' };
        if (h.klaim[poin] === true) return { ok: false, msg: 'Sudah diklaim' };
        h.klaim[poin] = true;
        for (const k in KLAIM[poin]) s.wallet[k] += KLAIM[poin][k];
        return { ok: true, rewards: Object.assign({}, KLAIM[poin]) };
      });
    },
  };

  // ---------- Toko Event (16.10) ----------
  // Harga dasar sama di tiga toko; diskon tema 25% (dibulatkan ke 10 terdekat, setengah ke atas).
  const r10 = v => Math.floor(v / 10 + 0.5) * 10;
  const TEMA = { 1: ['exp', 'expunit'], 2: ['crystal', 'persiapan'], 3: ['gold', 'paket'] };
  const ITEMS = [
    { no: 1, jenis: 'utama', harga: 1000, maks: 2 },
    { no: 2, jenis: 'exp', exp: 150, harga: 100, maks: 5 }, { no: 3, jenis: 'exp', exp: 600, harga: 380, maks: 4 },
    { no: 4, jenis: 'exp', exp: 1500, harga: 900, maks: 2 }, { no: 5, jenis: 'exp', exp: 3500, harga: 1900, maks: 1 },
    { no: 6, jenis: 'gold', gold: 600, harga: 100, maks: 5 }, { no: 7, jenis: 'gold', gold: 2500, harga: 380, maks: 4 },
    { no: 8, jenis: 'gold', gold: 6500, harga: 900, maks: 2 }, { no: 9, jenis: 'gold', gold: 15000, harga: 1900, maks: 1 },
    { no: 10, jenis: 'crystal', crystal: 1, harga: 130, maks: 5 }, { no: 11, jenis: 'crystal', crystal: 3, harga: 360, maks: 3 },
    { no: 12, jenis: 'crystal', crystal: 8, harga: 900, maks: 2 },
    { no: 13, jenis: 'paket', expUmum: 150, gold: 900, harga: 250, maks: 4 }, { no: 14, jenis: 'paket', expUmum: 400, gold: 2400, harga: 600, maks: 3 },
    { no: 15, jenis: 'paket', expUmum: 1000, gold: 6000, harga: 1400, maks: 2 },
    { no: 16, jenis: 'expunit', exp: 200, harga: 100, maks: 5 }, { no: 17, jenis: 'expunit', exp: 800, harga: 350, maks: 3 },
    { no: 18, jenis: 'expunit', exp: 2000, harga: 800, maks: 2 },
    { no: 19, jenis: 'persiapan', expUmum: 300, gold: 1500, crystal: 2, harga: 700, maks: 2 },
    { no: 20, jenis: 'persiapan', expUmum: 800, gold: 4000, crystal: 5, harga: 1700, maks: 1 },
  ];
  // banner yang boleh dipilih untuk hadiah utama tiap toko
  const BANNER_PILIHAN = { 1: ['kAdvPenyerang', 'kAdvBertahan', 'kAdvEkonomi', 'kCommon'], 2: ['advKendaraan', 'advInfantry', 'advSupport'], 3: ['common'] };
  const UTAMA_NAMA = { 1: 'Fragmen Kemampuan Unik x1', 2: 'Fragmen Unit Advanced x1', 3: 'Fragmen Unit Common x1' };
  const priceOf = (shop, it) => (TEMA[shop].includes(it.jenis) ? r10(it.harga * 0.75) : it.harga);
  function itemName(shop, it) {
    switch (it.jenis) {
      case 'utama': return UTAMA_NAMA[shop];
      case 'exp': return 'Exp ' + Prog.fmt(it.exp);
      case 'gold': return 'Gold ' + Prog.fmt(it.gold);
      case 'crystal': return 'Crystal ' + it.crystal;
      case 'paket': return `Paket Exp+Gold: ${Prog.fmt(it.expUmum)} Exp + ${Prog.fmt(it.gold)} Gold`;
      case 'expunit': return 'Exp Unit pilihan ' + Prog.fmt(it.exp);
      default: return `Paket Persiapan: ${Prog.fmt(it.expUmum)} Exp + ${Prog.fmt(it.gold)} Gold + ${it.crystal} Crystal`;
    }
  }
  function shopItems(shop) {
    const e = ev(shop), w = (Prog.load(), Prog.data.wallet)[EVENTS[shop].poin];
    return ITEMS.map(it => {
      const harga = priceOf(shop, it), dibeli = e.beli[it.no] || 0;
      return { no: it.no, jenis: it.jenis, nama: itemName(shop, it), harga, maks: it.maks, dibeli, sisa: Math.max(0, it.maks - dibeli), cukup: w >= harga, pilih: it.jenis === 'utama' ? 'banner' : it.jenis === 'expunit' ? 'unit' : null };
    });
  }
  // choice: kunci banner (hadiah utama) atau kunci unit (Exp Unit pilihan). Atomik: batas & poin dicek dulu, lalu keduanya diubah.
  function buy(shop, no, choice) {
    const meta = EVENTS[shop], it = ITEMS.find(x => x.no === no);
    if (!meta || !it) return { ok: false, msg: 'Hadiah tidak dikenal' };
    const e = ev(shop), harga = priceOf(shop, it), dibeli = e.beli[no] || 0;
    if (dibeli >= it.maks) return { ok: false, msg: 'Batas pembelian habis' };
    if (it.jenis === 'utama' && !BANNER_PILIHAN[shop].includes(choice)) return { ok: false, msg: 'Pilih banner' };
    const r = Prog.tx(s => {
      if (it.jenis === 'expunit' && !(s.unit[choice] && s.unit[choice].dimiliki)) return { ok: false, msg: 'Pilih unit' };
      if (s.wallet[meta.poin] < harga) return { ok: false, msg: 'Poin tidak cukup' };
      s.wallet[meta.poin] -= harga;
      if (it.jenis === 'utama') s.fragmen[choice] += 1;
      else if (it.jenis === 'exp') s.wallet.expUmum += it.exp;
      else if (it.jenis === 'gold') s.wallet.gold += it.gold;
      else if (it.jenis === 'crystal') s.wallet.crystal += it.crystal;
      else if (it.jenis === 'expunit') s.unit[choice].exp += it.exp;
      else { s.wallet.expUmum += it.expUmum; s.wallet.gold += it.gold; if (it.crystal) s.wallet.crystal += it.crystal; }
      return { ok: true };
    });
    if (!r.ok) return r;
    e.beli[no] = dibeli + 1; save();
    return { ok: true, msg: 'Pembelian berhasil', nama: itemName(shop, it) };
  }

  // ---------- Mulai ----------
  // Tahap 7-8 mendaftarkan fungsi mulai tiap event: Ev.startHandlers[n] = (opsi) => ...
  const startHandlers = {};

  load();
  daily.touchLogin();                                   // login harian otomatis (10 poin)

  return { KEY, EVENTS, NOS, MAX_PERCOBAAN, TONGGAK2, TONGGAK3, ITEMS, TEMA, BANNER_PILIHAN, KLAIM, KLAIM_LIST, MAX_POIN_HARIAN, MISI,
    periodAt, resetAt, load, save, data, onChange, attemptsLeft, consumeAttempt, info, credit1, credit2, credit3, daily, shopItems, priceOf, buy, startHandlers };
})();
