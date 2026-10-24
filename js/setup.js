// ====================================================================
// setup.js — Penempatan bangunan awal & inisialisasi pemain.
//  - Markas: di tengah atas-bawah, 5 tile dari sisi samping (v10.1; sebelumnya 10).
//  - Garnisun: sudut atas/bawah, pemain 2 di sudut yang berlawanan.
//  - Barak: 10 tile di atas ATAU di bawah Markas, selalu di sisi berlawanan dengan Garnisun pemilik yang sama (v10.1).
// Tile bangunan dipaksa jadi Grass.
// ====================================================================

function setupPlayersAndBuildings() {   // v9.7: dipakai juga oleh Campaign (cabang di bawah)
  if (typeof EVENT !== 'undefined' && EVENT) { EventBattle.setupPlayers(); return; }   // v13 Tahap 7-8: pangkalan Event 1/2/3
  players = [
    { id: 1, name: 'Pemain', color: PLAYER_COLORS[0], buildings: [], resources: { kredit: 200, fuel: 0, medical: 0 }, corps: { count: 0, timer: null }, infantrySpiritTurns: 0, rushUsed: false },
    { id: 2, name: 'Bot', color: PLAYER_COLORS[1], buildings: [], resources: { kredit: 200, fuel: 0, medical: 0 }, corps: { count: 0, timer: null }, infantrySpiritTurns: 0, rushUsed: false },
  ];
  const place = (pIdx, type, r, c) => {
    const tiles = footprintShapes(type, r, c)[0] || [[r, c]];           // Markas 7 tile, bangunan lain 3 tile (footprint.js)
    for (const [tr, tc] of tiles) mapData[tr][tc] = 'grass';
    for (const [tr, tc] of tiles) for (const [nr, nc] of neighborsOf(tr, tc)) if (mapData[nr][nc] === 'valley' && !(WW && WW.mapType === 5 && nc >= 7 && nc <= COLS - 8)) mapData[nr][nc] = 'grass'; // jangan terkurung Valley (v11: Labirin menjaga dinding kolom 7-37)
    const hp = bldHpOf(scaleStat(BUILDING_TYPES[type].hp, pIdx), pIdx);   // v9.7: bot Campaign 70%; v11: x buff HP bangunan World War
    players[pIdx].buildings.push({ r, c, tiles, type, hp, maxHp: hp, defDebuffTurns: 0, seq: buildingSeq++ });
  };
  if (CAMPAIGN) {   // v9.7: Campaign — hanya Markas + Barak, tanpa Garnisun
    const mr = Math.floor(ROWS / 2);
    place(0, 'markas', mr, 3);              place(0, 'barak', mr - 4, 3);
    place(1, 'markas', mr, COLS - 4);       place(1, 'barak', mr + 4, COLS - 4);
    return;
  }
  const midR = Math.floor(ROWS / 2);
  const cols = (WW && WW.mapType === 6) ? [8, COLS - 1 - 8] : [5, COLS - 1 - 5];   // v10.1 (P5): Markas 5 tile dari pinggir (kolom 5 dan 39); v11 K14: Lapangan Tembak kolom 8 dan 36
  const p1Top = Math.random() < 0.5;
  for (let i = 0; i < 2; i++) {
    const c = cols[i];
    const top = i === 0 ? p1Top : !p1Top;   // musuh di sudut berlawanan
    place(i, 'markas', midR, c);
    // v10.1 (P5): sisi Barak berlawanan dengan sisi Garnisun milik pemain yang sama (Garnisun atas -> Barak bawah, dan sebaliknya)
    place(i, 'barak', midR + (top ? 10 : -10), c);
    place(i, 'garnisun', top ? 3 : ROWS - 4, i === 0 ? 3 : COLS - 4);   // v9.0: footprint 3 tile digeser sedikit dari sudut agar Corps tidak terkurung
  }
}

