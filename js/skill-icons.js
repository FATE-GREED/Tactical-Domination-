// ====================================================================
// skill-icons.js — ikon kemampuan unik & efek bangunan (v9.6)
// Dipakai bersama oleh lobby (katalog Kemampuan) dan pertandingan
// (ikon kecil di atas bar HP unit/bangunan yang sedang terkena efeknya).
// Warna lingkaran: merah=serang, biru=bertahan, hijau=gerak, ungu=intel,
// oranye=hancur, kuning=kerja, teal=efek bangunan (buff).
// ====================================================================
const SK = {
  red: ['#e0574f', '#7d1f1a'], blue: ['#4f8fe0', '#1b3f7d'], green: ['#5fb760', '#1f5a21'],
  purple: ['#a06ad8', '#43237a'], orange: ['#e8923a', '#7d4210'], yellow: ['#e3c445', '#6e5a0a'],
  teal: ['#3fb7a8', '#13544c'],                       // teal = efek bangunan (buff)
};
const SKILL_ICONS = {
  'Moral Persatuan':     ['blue',   '<circle cx="8" cy="8" r="2.6"/><circle cx="16" cy="8" r="2.6"/><path d="M3.5 18c0-3.2 2-5 4.5-5s4.5 1.8 4.5 5zM11.5 18c0-3.2 2-5 4.5-5s4.5 1.8 4.5 5z"/>'],
  'Semangat Perjuangan': ['red',    '<path d="M12 2.5c.8 3-1.3 4.2-2.6 6.2C8.2 10.5 8 12 9 13c-2.4-.4-3.5-2.5-3.2-4.6C4.2 10 3.5 12 3.5 14a8.5 8.5 0 0 0 17 0c0-4.2-3-6.2-4.3-8.8-.6 1.3-1.2 2-2.2 2.6C14.3 5.8 13.3 4 12 2.5z"/>'],
  'Serangan Kejut':      ['red',    '<path d="M12 1.8l2.2 6.2 6.5-.4-5.2 4 2 6.3L12 14.2 6.5 18l2-6.3-5.2-4 6.5.4z"/>'],
  'Yang Tersembunyi':    ['purple', '<path d="M2 12c2.5-4.5 6-6.5 10-6.5s7.5 2 10 6.5c-2.5 4.5-6 6.5-10 6.5S4.5 16.5 2 12z" opacity=".95"/><circle cx="12" cy="12" r="3.2" fill="#43237a"/><path d="M4 20L20 4" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/>'],
  'Konsentrasi Tinggi':  ['red',    '<circle cx="12" cy="12" r="7" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="1.8"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"/>'],
  'Sang Pengamat':       ['purple', '<path d="M2 12c2.5-4.5 6-6.5 10-6.5s7.5 2 10 6.5c-2.5 4.5-6 6.5-10 6.5S4.5 16.5 2 12z"/><circle cx="12" cy="12" r="3.6" fill="#43237a"/><circle cx="13" cy="11" r="1.1"/>'],
  'Semangat Besi':       ['green',  '<path d="M10.4 2h3.2l.5 2.6 1.8.8 2.2-1.5 2.3 2.3-1.5 2.2.8 1.8L22 10.4v3.2l-2.6.5-.8 1.8 1.5 2.2-2.3 2.3-2.2-1.5-1.8.8-.5 2.6h-3.2l-.5-2.6-1.8-.8-2.2 1.5-2.3-2.3 1.5-2.2-.8-1.8L2 13.6v-3.2l2.6-.5.8-1.8-1.5-2.2 2.3-2.3 2.2 1.5 1.8-.8z"/><circle cx="12" cy="12" r="3.4" fill="#1f5a21"/>'],
  'Ayo Ledakkan':        ['orange', '<circle cx="10.5" cy="14.5" r="7"/><circle cx="8" cy="12.2" r="1.9" fill="#7d4210" opacity=".55"/><path d="M15.2 9.2l2.4-2.6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M19.6 1.8l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>'],
  'Sang Pelindung':      ['blue',   '<path d="M12 2.2l8 3v6c0 5-3.4 8.6-8 10.6-4.6-2-8-5.6-8-10.6v-6z"/><path d="M12 6.5v11" stroke="#1b3f7d" stroke-width="1.8" fill="none"/>'],
  'Pejuang Bertahan':    ['blue',   '<path d="M12 21s-8-5-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 6-8 11-8 11z"/>'],
  'Penggila Perang':     ['red',    '<path d="M12 2.5c-4.7 0-8 3-8 7.2 0 2.6 1.3 4.3 3 5.3V19h3v-2h4v2h3v-4c1.7-1 3-2.7 3-5.3 0-4.2-3.3-7.2-8-7.2z"/><circle cx="8.8" cy="10.5" r="2" fill="#7d1f1a"/><circle cx="15.2" cy="10.5" r="2" fill="#7d1f1a"/><path d="M12 13l-1 2h2z" fill="#7d1f1a"/>'],
  'Intimidasi':          ['purple', '<path d="M12 2.5L22 20H2z"/><path d="M12 9v5.5" stroke="#43237a" stroke-width="2.2" stroke-linecap="round" fill="none"/><circle cx="12" cy="17.2" r="1.3" fill="#43237a"/>'],
  'Penghancur Bangunan': ['orange', '<path d="M14.5 2.5l7 7-3 3-2-2-8.5 8.5a2 2 0 0 1-2.8-2.8L13.7 7.7l-2-2z"/>'],
  'Perusak Formasi':     ['orange', '<circle cx="12" cy="12" r="3"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/>'],
  'Dikejar Waktu':       ['green',  '<path d="M3 5l8 7-8 7zM12 5l8 7-8 7z"/>'],
  'Kurir Setia':         ['yellow', '<path d="M3 8l9-5 9 5v9l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v9" stroke="#6e5a0a" stroke-width="1.6" fill="none"/>'],
  'Jangan Menganggur':   ['green',  '<path d="M6 3h5v8c0 .8.4 1.2 1 1.5L18 15c2 1 2.5 2 2.5 3.5V20H3.5V3z"/>'],
  'Wilayah Markas':      ['teal',   '<path d="M5.5 2.5h2v19h-2z"/><path d="M7.5 3.5h12l-3.2 4.2 3.2 4.3h-12z"/><rect x="3" y="19.5" width="9" height="2.4" rx="1.1"/>'],
  'Kerja Sampai Tuntas': ['yellow', '<path d="M3.5 17a8.5 8.5 0 0 1 17 0z"/><rect x="2" y="17" width="20" height="3" rx="1.2"/><rect x="10.5" y="4" width="3" height="6" rx="1" fill="#6e5a0a"/>'],
  // ---- v9.7: kemampuan unit baru ----
  'Keberuntungan':       ['red',    '<circle cx="8.3" cy="8.3" r="3.6"/><circle cx="15.7" cy="8.3" r="3.6"/><circle cx="8.3" cy="15.4" r="3.6"/><circle cx="15.7" cy="15.4" r="3.6"/><circle cx="12" cy="12" r="2" fill="#7d1f1a"/><path d="M12 14l-1 8" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"/>'],
  'Pembuat Onar':        ['orange', '<path d="M8.2 2.5h7.6l5.7 5.7v7.6l-5.7 5.7H8.2L2.5 15.8V8.2z"/><path d="M6.5 12h11" stroke="#7d4210" stroke-width="3" stroke-linecap="round" fill="none"/>'],
  'Pengorbanan Terakhir':['red',    '<path d="M12 2l2.4 3.4V14H9.6V5.4z"/><rect x="6.5" y="14" width="11" height="2.6" rx="1.2"/><rect x="10.7" y="16.6" width="2.6" height="5.2" rx="1"/>'],
  'Penerus Tekad':       ['blue',   '<path d="M12 2.8l8 6.4h-4.6L12 6.4 8.6 9.2H4z"/><path d="M12 10.8l8 6.4h-4.6L12 14.4l-3.4 2.8H4z"/>'],
  'Lompatan Seketika':   ['green',  '<path d="M3 19c1.6-9.5 8-13.5 14.5-11.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"/><path d="M15.5 3l5.8 4.6-6.6 3z"/><circle cx="3.6" cy="19.2" r="1.8"/>'],
  'Teknik Kamuflase':    ['purple', '<path d="M20.5 3.5C9.5 3.5 4 9.5 4 16.5c0 1.2.2 2.2.5 3.2 1-1.1 2.2-2 3.5-2.8C14.5 17 19 12 20.5 3.5z"/><path d="M5 20c3-6 7-9.2 11-10.8" stroke="#43237a" stroke-width="1.5" fill="none" stroke-linecap="round"/>'],
  'Mata Elang':          ['purple', '<rect x="3.5" y="4" width="4.4" height="7" rx="1.2"/><rect x="16.1" y="4" width="4.4" height="7" rx="1.2"/><circle cx="7" cy="15" r="4.6"/><circle cx="17" cy="15" r="4.6"/><rect x="9" y="11.5" width="6" height="3.6" rx="1"/><circle cx="7" cy="15" r="1.7" fill="#43237a"/><circle cx="17" cy="15" r="1.7" fill="#43237a"/>'],
  'Titik Fokus':         ['red',    '<circle cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="1.9"/>'],
  'Hadiah Kejutan':      ['green',  '<rect x="3.5" y="10" width="17" height="11" rx="1.4"/><rect x="2.5" y="6.8" width="19" height="4.2" rx="1"/><path d="M12 6.8V21" stroke="#1f5a21" stroke-width="2.2" fill="none"/><path d="M12 6.6C9 6.6 7.4 2.6 10 2.6c1.6 0 2 2.2 2 4zM12 6.6c3 0 4.6-4 2-4-1.6 0-2 2.2-2 4z"/>'],
  'Bom Beracun':         ['orange', '<path d="M12 2.4c3.6 5 6.6 8 6.6 12a6.6 6.6 0 0 1-13.2 0c0-4 3-7 6.6-12z"/><circle cx="9.6" cy="15.2" r="1.5" fill="#7d4210"/><circle cx="13.8" cy="12.6" r="1.1" fill="#7d4210"/><circle cx="14.2" cy="16.8" r="1.3" fill="#7d4210"/>'],
};

// Deskripsi efek bangunan bertipe buff (untuk tampilan info).
const BUILDING_BUFFS = {
  'Wilayah Markas': 'ATK +20% dan DEF +20% bagi unit yang berada di Territory 10x10 sekitar Markas sendiri.',
};

// HTML (lobby): lingkaran berwarna + ikon SVG putih
function skillIconHTML(name) {
  const d = SKILL_ICONS[name]; if (!d) return '';
  const [light, dark] = SK[d[0]];
  return `<i class="sk" style="background:radial-gradient(circle at 35% 30%, ${light}, ${dark})"><svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true">${d[1]}</svg></i>`;
}

// Gambar (canvas pertandingan): SVG -> Image, di-cache. get() mengembalikan null selama belum siap.
const SkillGfx = (() => {
  const cache = {};
  let redrawTimer = null;
  function redraw() {
    if (redrawTimer) return;
    redrawTimer = setTimeout(() => {
      redrawTimer = null;
      try { if (typeof draw === 'function' && typeof ctx !== 'undefined' && ctx && players.length) draw(); } catch (e) {}
    }, 30);
  }
  function svgOf(name) {
    const d = SKILL_ICONS[name]; if (!d) return null;
    const [light, dark] = SK[d[0]];
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="64" height="64">' +
      '<defs><radialGradient id="g" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="' + light + '"/><stop offset="1" stop-color="' + dark + '"/></radialGradient></defs>' +
      '<circle cx="16" cy="16" r="14.5" fill="url(#g)" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>' +
      '<svg x="6" y="6" width="20" height="20" viewBox="0 0 24 24" fill="#fff">' + d[1] + '</svg></svg>';
  }
  function get(name) {
    let e = cache[name];
    if (!e) {
      const src = svgOf(name);
      e = cache[name] = { img: null, ready: false };
      if (!src) return null;
      const img = new Image();
      e.img = img;
      img.onload = () => { e.ready = true; redraw(); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
    }
    return e.ready ? e.img : null;
  }
  function preload() { Object.keys(SKILL_ICONS).forEach(get); }
  return { get, preload };
})();
SkillGfx.preload();
