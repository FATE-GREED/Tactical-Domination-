// ====================================================================
// commanders.js — Data Komandan (v9.3). Hanya data; belum ada pengaruh ke permainan.
// Dipakai lobby.js (tab Komandan). Gambar: img/cmd/cNN.webp (pose berdiri gaya klasik),
// img/cmd/lobby.webp = komandan yang tampil di lobby.
//
// effect: kemampuan komandan. active:false = BELUM dipakai di game. Saat nanti diaktifkan,
//   atkPct dijumlahkan ke kumpulan persen ATK di computeDamage (rules-combat.js) untuk
//   seluruh unit tim (scope 'team'); bot juga harus punya komandan agar adil.
// Urutan = urutan kartu: Komandan 1 dulu, sisanya menurut pangkat tertinggi lalu nomor.
// ====================================================================
const COMMANDERS = (() => {
  // [nomor gambar, jenis kelamin, pangkat, seragam, deskripsi]
  const RAW = [
    ['13', 'Pria',   'Jenderal',        'abu-abu',     'Dewasa, rambut berantakan, terlihat malas dan kesal.'],
    ['11', 'Pria',   'Jenderal',        'abu-abu',     'Tua, rambut putih panjang, berluka, berpengalaman.'],
    ['01', 'Pria',   'Kolonel',         'hijau gelap', 'Tua, rambut putih, bekas luka, percaya diri.'],
    ['06', 'Wanita', 'Kolonel',         'hitam',       'Tua, rambut beruban disanggul, berwibawa.'],
    ['14', 'Pria',   'Kolonel',         'cokelat',     'Tua, botak, berkulit gelap, banyak luka.'],
    ['02', 'Wanita', 'Letnan Kolonel',  'hijau gelap', 'Dewasa, rambut hitam panjang, tegas.'],
    ['19', 'Wanita', 'Letnan Kolonel',  'hijau pudar', 'Tua, rambut putih pendek, bijaksana.'],
    ['05', 'Pria',   'Mayor',           'hitam',       'Dewasa, botak, terlihat malas, berpengalaman.'],
    ['10', 'Wanita', 'Mayor',           'biru tua',    'Dewasa, rambut pendek hitam rapi, profesional.'],
    ['18', 'Pria',   'Mayor',           'hijau pudar', 'Dewasa, rambut hitam rapi, percaya diri.'],
    ['04', 'Wanita', 'Kapten',          'hijau gelap', 'Dewasa, rambut pendek platinum, liar, berluka.'],
    ['08', 'Pria',   'Kapten',          'biru tua',    'Dewasa, berkulit gelap, berluka, liar, percaya diri.'],
    ['15', 'Wanita', 'Kapten',          'cokelat',     'Dewasa, rambut hitam panjang, malas.'],
    ['03', 'Pria',   'Letnan Satu',     'hijau gelap', 'Muda, rambut pendek berantakan, bersemangat.'],
    ['09', 'Wanita', 'Letnan Satu',     'biru tua',    'Muda, rambut cokelat panjang, bersemangat.'],
    ['17', 'Wanita', 'Letnan Satu',     'cokelat',     'Muda, rambut pirang panjang, liar, berluka.'],
    ['20', 'Wanita', 'Letnan Satu',     'hijau pudar', 'Muda, rambut hitam panjang berantakan, ceria.'],
    ['07', 'Pria',   'Letnan Dua',      'hitam',       'Muda, rambut pendek rapi, terlihat penakut.'],
    ['12', 'Wanita', 'Letnan Dua',      'abu-abu',     'Muda, rambut pendek cokelat, penakut.'],
    ['16', 'Pria',   'Letnan Dua',      'cokelat',     'Muda, rambut pirang rapi, bersemangat.'],
  ];
  return RAW.map(([n, sex, rank, uniform, desc], i) => ({
    id: i + 1,
    name: i === 0 ? 'Jenderal John' : `Komandan ${i + 1}`,
    label: `Komandan ${i + 1}`,
    img: `img/cmd/c${n}.webp`,
    sex, rank, uniform, desc,
    effect: i === 0
      ? { name: 'Komando Tempur', text: 'ATK seluruh tim +5%.', atkPct: 5, scope: 'team', active: false }
      : null,
  }));
})();
const LOBBY_COMMANDER_IMG = 'img/cmd/lobby.webp';
const COMMANDER_IDS = COMMANDERS.map(c => c.id);
