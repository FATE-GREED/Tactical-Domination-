// ====================================================================
// setup.js — Penempatan Markas/Barak/Garnisun awal & inisialisasi
// objek pemain. Dipanggil sekali di main.js setelah map dibuat.
// ====================================================================

function isGrass(r, c) { return mapData[r] && mapData[r][c] === 'grass'; }
function tileDist(a, b) { return Math.abs(a.r - b.r) + Math.abs(a.c - b.c); }

// Pilih 3 titik Grass acak di separuh kiri, MAKS 30 tile dari tepi kiri peta
// (untuk Pemain 2, otomatis maks 30 tile dari tepi kanan karena dicerminkan).
// Jarak antar-bangunan >= 7 tile.
function pickBuildingSpotsLeft() {
  const candidates = [];
  const marginFromEdge = 2;
  const maxDistFromLeftEdge = 30; // aturan: tidak boleh lebih dari 30 petak dari sisi kiri/kanan
  for (let r = marginFromEdge; r < ROWS - marginFromEdge; r++) {
    for (let c = marginFromEdge; c <= maxDistFromLeftEdge; c++) {
      if (isGrass(r, c)) candidates.push({ r, c });
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const chosen = [];
  for (const cand of candidates) {
    if (chosen.every(ch => tileDist(ch, cand) >= 7)) {
      chosen.push(cand);
      if (chosen.length === 3) break;
    }
  }
  return chosen; // [markas, barak, garnisun]
}

// Buat objek players[] & tempatkan bangunan awal (Pemain 2 = cerminan Pemain 1)
function setupPlayersAndBuildings() {
  players = [
    { id: 1, name: 'Pemain 1', color: PLAYER_COLORS[0], buildings: [], resources: { kredit: 50, fuel: 0, medical: 0 }, barakSlots: 2, corps: { count: 0, timer: null }, infantrySpiritTurns: 0 },
    { id: 2, name: 'Pemain 2', color: PLAYER_COLORS[1], buildings: [], resources: { kredit: 50, fuel: 0, medical: 0 }, barakSlots: 2, corps: { count: 0, timer: null }, infantrySpiritTurns: 0 },
  ];
  const btypes = ['markas', 'barak', 'garnisun'];
  const spotsLeft = pickBuildingSpotsLeft();
  spotsLeft.forEach((s, i) => players[0].buildings.push({ r: s.r, c: s.c, type: btypes[i], hp: BUILDING_TYPES[btypes[i]].hp, defDebuffTurns: 0 }));
  spotsLeft.forEach((s, i) => players[1].buildings.push({ r: s.r, c: COLS - 1 - s.c, type: btypes[i], hp: BUILDING_TYPES[btypes[i]].hp, defDebuffTurns: 0 }));
}
