// ====================================================================
// campaign.js — Mode Campaign (v9.7), Chapter 1: Prolog.
//   - Naskah cerita (sebelum & sesudah pertempuran), dimainkan oleh story.js
//   - Aturan pertempuran Chapter 1 (peta 15x25 grass, hanya Markas + Barak, bot 70%, dst.)
//   - Tutorial Jenderal John di dalam pertempuran
//   - Layar peta Kekaisaran Vanderick (muncul setelah Chapter 1 selesai)
//   - Progres disimpan di localStorage; Campaign belum memengaruhi isi lobby.
// Aturan inti game hanya mengecek variabel global CAMPAIGN (state.js).
// ====================================================================
const Campaign = (() => {
  const KEY = 'td-campaign';
  let api = null;                       // dari lobby.js: { lobby, showLoading }
  let tutTimer = null, tutEl = null;

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* penyimpanan penuh/diblokir */ }  };
  const cleared = n => !!load()['ch' + n];

  // ---------- Tokoh ----------
  // n = nomor perwira (img/story/cNN_pPP.webp). Pose: 4 bicara, 5 netral, 7 tegas/cemas, 8 kaget, 10 lega.
  const CAST = {
    john:  { say: 'Jenderal John',  n: 18, side: 'l' },
    nevla: { say: 'Sersan Nevla',   n: 12, side: 'r' },
    gurk:  { say: 'Kopral Gurk',    n: 5,  side: 'r' },
    lead:  { say: 'Pemimpin Musuh', n: 7,  side: 'r' },
    ray:   { say: 'Raymond',        n: 7,  side: 'r' },
    hakim: { say: 'Hakim' },
  };
  const S = (who, pose, text) => Object.assign({ pose, text }, CAST[who]);
  const N = text => ({ narr: text });

  // ---------- Naskah Chapter 1 ----------
  const CH1_PRE = [
    { mapOpen: true },
    N('Awan yang menutupi layar terbuka. Terlihatlah benua Arcantez. Di dalamnya ada sebuah negara besar yang dikelilingi oleh 5 negara lainnya. Perang besar-besaran.'),
    { clouds: 'close' },
    { mapHide: true }, { bg: 'kantor-tinggi', ms: 0 }, { clouds: 'open' },
    N('Jenderal John, jenderal tertinggi di Kekaisaran, terlihat duduk di ruangannya. Kemudian terdengar suara ketukan pintu.'),
    S('john', 5, 'Masuklah...'),
    N('Sersan Nevla memasuki ruangan.'),
    S('nevla', 4, 'Lapor, Jenderal...!'),
    S('john', 5, 'Sersan Nevla, ada apa?'),
    S('nevla', 7, 'Anda dipanggil oleh anggota parlemen ke ruang pengadilan.'),
    S('john', 5, 'Baiklah. Aku segera ke sana.'),
    S('nevla', 7, 'Jenderal, berhati-hatilah. Firasatku tidak baik.'),
    S('john', 7, 'Tenanglah. Aku sudah menduga hal ini. Kekaisaran busuk ini sudah tidak memiliki harapan.'),

    { bg: 'pengadilan' },
    N('Di ruang pengadilan, Jenderal John berdiri di tengah. Di depannya ada hakim. Di kiri dan kanan hakim, masing-masing ada 3 anggota parlemen. Wajah mereka tidak terlihat, gelap. Hanya ada siluet hitam dari leher ke atas.'),
    S('hakim', 0, 'Dengan ini diputuskan.'),
    { sfx: 'gavel' },
    N('Terdengar 2 kali pukulan palu pengadilan.'),
    S('hakim', 0, 'Jenderal John, dilengserkan dari jabatan jenderal tertinggi, dan akan menjalani tugas pengasingan.'),
    { bg: 'pengadilan-jahat' },
    N('Jenderal John berbalik membelakangi. Ketujuh orang tadi menampakkan siluet senyum menyeramkan berwarna merah. Terdengar suara tawa.'),

    { route: true },                                        // mobil militer melintas di atas peta; awan menutup di akhir
    { bg: 'kantor-menengah', ms: 0 }, { clouds: 'open' },
    N('Beberapa waktu kemudian, Jenderal John duduk di ruang barunya yang sederhana, di ujung selatan perbatasan. Kemudian terdengar suara ketukan pintu.'),
    S('john', 5, 'Masuklah...'),
    N('Kopral Gurk memasuki ruangan.'),
    S('gurk', 4, 'Lapor, Jenderal...!'),
    S('john', 5, 'Ada apa, Kopral Gurk?'),
    S('gurk', 8, 'Ada musuh, Jenderal!'),
    S('john', 7, 'Jelaskan detailnya!'),
    S('gurk', 5, 'Pengintai kita menemukan 1 peleton pasukan musuh. Sepertinya bukan pasukan terafiliasi, mungkin tentara yang kabur dari perang.'),
    S('john', 7, 'Segera siapkan pasukan.'),
  ];

  const CH1_POST = [
    { bg: 'lapangan-senja', ms: 0 }, { clouds: 'open' },   // awan membuka latar setelah pertempuran
    S('lead', 8, 'Menyerah! Kami menyerah!'),
    S('john', 7, 'Tahan serangan!'),
    S('lead', 4, 'Kami mohon, ampuni kami.'),
    S('john', 8, 'Kau... Kenapa kau... Tidak. Siapa namamu?'),
    S('lead', 5, 'Raymond. Namaku Raymond.'),
    S('john', 5, 'Baiklah, Raymond. Kenapa kau dan pasukanmu menyerang kami?'),
    S('ray', 7, 'Itu... sebenarnya kami tidak ingin melakukannya. Tapi kami terpaksa.'),
    S('john', 5, 'Terpaksa? Apa maksudmu?'),
    S('ray', 4, 'Desa kami dulu berada di wilayah Kekaisaran. Setelah kekalahan kecil Kekaisaran, batas wilayah bergeser beberapa mil.'),
    S('ray', 7, 'Tapi hal itu membuat desa kami berada di wilayah Kerajaan Armaen. Kami jadi kehilangan naungan. Tidak ada yang peduli dengan desa kecil kami.'),
    S('ray', 7, 'Tidak ada yang mau menerima kami. Setelah beberapa bulan, desa kami diambang batas, dan akhirnya kami membuat keputusan nekat.'),
    S('ray', 4, 'Kami semua melakukan migrasi kembali ke Kekaisaran. Setelah perjalanan sulit itu, kami juga ditolak oleh Kekaisaran.'),
    S('ray', 7, 'Akhirnya kami menjadi kelompok kriminal. Satu-satunya cara kami bertahan hidup adalah dengan menjarah desa setempat.'),
    S('john', 5, 'Sudah berapa desa yang kalian jarah?'),
    S('ray', 4, 'Belum ada. Ini yang pertama... Tuan, aku mohon terima kami. Kami pasti akan berguna.'),
    S('ray', 4, 'Demi anak-anak kami yang kelaparan, kami akan melakukan tugas apa pun.'),
    S('john', 5, 'Hmm... Berapa jumlah kalian?'),
    S('ray', 5, 'Itu... sekitar 37 orang. 18 pria, 12 wanita, sisanya anak-anak.'),
    S('john', 5, 'Untuk sekarang, kumpulkan orang-orangmu. Nanti akan kupertimbangkan.'),
    S('ray', 4, 'Terima kasih. Terima kasih banyak, Tuan.'),
    S('john', 5, 'Kopral Gurk, bawa orang-orangmu dan awasi mereka.'),
    S('gurk', 5, 'Baik!'),
    { bg: 'lapangan-malam' },
    N('Seminggu setelahnya, setelah melalui berbagai pertimbangan, pada akhirnya Jenderal John menerima Raymond beserta orang-orangnya.'),
    { title: 'END OF CHAPTER I', stop: true },
    { rewards: [
      { head: 'Selamat, Anda mendapatkan unit baru', items: [{ unit: 'infantry', label: 'Infantry' }] },
      { head: 'Anda mendapatkan bangunan baru', items: [{ bld: 'markas', label: 'Markas' }, { bld: 'barak', label: 'Barak' }] },
      { head: 'Anda mendapatkan komandan baru', items: [{ img: STORY_IMG(18, 5), label: 'Jenderal John' }] },
    ], stop: true },
  ];

  // ---------- Alur dari lobby ----------
  function bind(a) { api = a; }
  function enter() { if (cleared(1)) showMap(); else playChapter(); }

  function playChapter() {
    closeMap();
    Story.play(CH1_PRE).then(() => startBattle());
  }
  function startBattle() {            // dipakai juga oleh "Ulangi" (lobby.js)
    api.showLoading(() => {
      Story.hide();
      api.lobby.style.display = 'none';
      startGame({ mode: 'campaign', chapter: 1 });
    });
  }

  // ---------- Pertempuran Chapter 1 ----------
  function prepareBattle(opts) {
    CAMPAIGN = { chapter: (opts && opts.chapter) || 1, botMul: 0.7, units: ['infantry'], markasIncome: 20, barakIncome: 10 };
    ROWS = 15; COLS = 25;
    BUILDING_TYPES.markas.hp = 100;              // Markas HP 100, DEF tidak berubah
    BUILDING_TYPES.barak.destructible = false;   // Barak tidak bisa diserang
    document.body.classList.add('campaign');   // menyembunyikan radar, mata, jalur, baris, rincian (css/story.css)
  }
  const battleMap = () => Array.from({ length: ROWS }, () => new Array(COLS).fill('grass'));

  function fitView() {                 // seluruh peta 15x25 muat di layar (di luar sidebar kiri & bar atas)
    const mw = COLS * hexW + hexW / 2, mh = (ROWS - 1) * vertSpacing + hexH;
    const x0 = 84, y0 = 36, aw = canvas.width - x0 - 8, ah = canvas.height - y0 - 8;
    scale = Math.max(0.5, Math.min(aw / mw, ah / mh));
    camX = x0 + (aw - mw * scale) / 2 + hexW / 2 * scale;
    camY = y0 + (ah - mh * scale) / 2 + hexH / 2 * scale;
    draw();
  }

  function onBattleEnd(win) {
    stopTutorial();
    Sfx.end(win);
    if (win) {                         // menang -> cerita lanjut, lalu hadiah, lalu peta Campaign
      setTimeout(() => Story.play(CH1_POST).then(finishChapter), 1800);
      return;
    }
    const go = document.getElementById('gameover');
    document.getElementById('winnerText').textContent = 'Pasukanmu Kalah';
    go.querySelector('p').textContent = 'Markas kita hancur. Ulangi pertempuran ini sampai menang.';
    document.getElementById('goRincianBtn').style.display = 'none';
    document.getElementById('restartBtn').textContent = 'Ulangi';
    go.style.display = 'flex';
  }
  function finishChapter() {
    const p = load(); p.ch1 = true; save(p);
    try { sessionStorage.setItem('td-open', 'campaign'); sessionStorage.removeItem('td-autostart'); } catch (e) { /* abaikan */ }
    location.reload();                 // kembali ke lobby, langsung membuka peta Campaign
  }

  // ---------- Tutorial John ----------
  const humanUnits = () => units.filter(u => u.owner === HUMAN);
  const TUT = [
    { text: 'Pasukan, dengarkan. Hancurkan Markas musuh di sisi kanan, dan jaga Markas kita tetap berdiri. Ketuk untuk lanjut.', tap: true },
    { text: 'Markas dan Barak memberi Kredit tiap giliran. Ketuk tombol + di panel kiri untuk membuka menu deploy.', until: () => humanUnits().length > 0 || document.getElementById('deploy').style.display === 'block' },
    { text: 'Pilih Infantry lalu ketuk Deploy. Pasukan muncul di dekat Barak, dan Barak tidak bisa diserang.', until: () => humanUnits().length > 0 },
    { text: 'Tahan lama pada unitmu untuk memilih target, lalu ketuk Markas musuh atau tile tujuan.', until: () => humanUnits().some(u => u.target) },
    { text: 'Sekarang tekan tombol ▶ di kanan bawah untuk menjalankan giliran.', until: () => phase === 'exec' || currentPlayerIdx !== HUMAN || turnNumber > 1 },   // eksekusi unit baru deploy bisa instan
    { text: 'Bagus. Setelah semua unit selesai bergerak, giliran kembali ke kita. Deploy lagi, dan lanjutkan sampai Markas musuh hancur!', ms: 7000 },
  ];
  function startTutorial() {
    stopTutorial();
    tutEl = document.createElement('div');
    tutEl.id = 'tut';
    tutEl.innerHTML = `<img src="${STORY_IMG(18, 5)}" alt=""><p></p><button aria-label="Tutup tutorial">✕</button>`;
    document.body.appendChild(tutEl);
    tutEl.querySelector('button').addEventListener('click', stopTutorial);
    let i = 0, since = 0;
    const show = () => { tutEl.querySelector('p').textContent = TUT[i].text; tutEl.classList.add('on'); since = Date.now(); };
    show();
    tutEl.addEventListener('pointerdown', () => { if (TUT[i] && TUT[i].tap) next(); });
    const next = () => { i++; if (i >= TUT.length) { stopTutorial(); return; } show(); };
    tutTimer = setInterval(() => {
      if (gameOver) { stopTutorial(); return; }
      const t = TUT[i];
      if (t.until && t.until()) next();
      else if (t.ms && Date.now() - since > t.ms) next();
    }, 300);
  }
  function stopTutorial() {
    clearInterval(tutTimer); tutTimer = null;
    if (tutEl) { tutEl.remove(); tutEl = null; }
  }

  // ---------- Layar peta Kekaisaran Vanderick ----------
  let mapRoot = null;
  function showMap() {
    if (!mapRoot) {
      mapRoot = document.createElement('div');
      mapRoot.id = 'cmap';
      mapRoot.innerHTML = `
        <div class="cm-stage"><img src="img/campaign/peta-vanderick.webp" alt="Peta Kekaisaran Vanderick" draggable="false">
          <button class="cm-pin" aria-label="Chapter 1"><span>1</span></button></div>
        <button class="cm-back">‹ Kembali</button>
        <h2 class="cm-title">Kekaisaran Vanderick</h2>
        <div class="cm-modal" hidden><div class="cm-card" role="dialog" aria-modal="true">
          <h3>Chapter 1 — Prolog</h3>
          <p>Jenderal John dilengserkan dari jabatannya dan diasingkan ke perbatasan selatan. Di pos barunya, satu peleton asing mendekat.</p>
          <p class="cm-done">Selesai</p>
          <div class="cm-btns"><button class="cm-close">Tutup</button><button class="cm-play">Mainkan ulang</button></div>
        </div></div>`;
      document.body.appendChild(mapRoot);
      const q = s => mapRoot.querySelector(s), modal = q('.cm-modal');
      q('.cm-pin').addEventListener('click', () => { modal.hidden = false; });
      q('.cm-close').addEventListener('click', () => { modal.hidden = true; });
      modal.addEventListener('pointerdown', e => { if (e.target === modal) modal.hidden = true; });
      q('.cm-back').addEventListener('click', closeMap);
      q('.cm-play').addEventListener('click', () => { modal.hidden = true; playChapter(); });
    }
    mapRoot.querySelector('.cm-modal').hidden = true;
    mapRoot.classList.add('on');
  }
  function closeMap() { if (mapRoot) mapRoot.classList.remove('on'); }

  return { bind, enter, startBattle, prepareBattle, battleMap, fitView, onBattleEnd, startTutorial, cleared };
})();
