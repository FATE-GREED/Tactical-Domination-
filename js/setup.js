// ====================================================================
// setup.js — Penempatan bangunan awal & inisialisasi pemain.
//  - Markas: di tengah atas-bawah, 10 tile dari sisi samping.
//  - Garnisun: sudut atas/bawah, pemain 2 di sudut yang berlawanan.
//  - Barak: 10 tile di atas ATAU di bawah Markas (acak).
// Tile bangunan dipaksa jadi Grass.
// ====================================================================

function setupPlayersAndBuildings() {
  players = [
    { id: 1, name: 'Pemain', color: PLAYER_COLORS[0], buildings: [], resources: { kredit: 200, fuel: 0, medical: 0 }, barakSlots: 2, corps: { count: 0, timer: null }, infantrySpiritTurns: 0 },
    { id: 2, name: 'Bot', color: PLAYER_COLORS[1], buildings: [], resources: { kredit: 200, fuel: 0, medical: 0 }, barakSlots: 2, corps: { count: 0, timer: null }, infantrySpiritTurns: 0 },
  ];
  const place = (pIdx, type, r, c) => {
    mapData[r][c] = 'grass';
    for (const [nr, nc] of neighborsOf(r, c)) if (mapData[nr][nc] === 'valley') mapData[nr][nc] = 'grass'; // jangan terkurung Valley
    players[pIdx].buildings.push({ r, c, type, hp: BUILDING_TYPES[type].hp, defDebuffTurns: 0, seq: buildingSeq++ });
  };
  const midR = Math.floor(ROWS / 2);
  const cols = [10, COLS - 1 - 10];
  const p1Top = Math.random() < 0.5;
  for (let i = 0; i < 2; i++) {
    const c = cols[i];
    place(i, 'markas', midR, c);
    place(i, 'barak', midR + (Math.random() < 0.5 ? -10 : 10), c);
    const top = i === 0 ? p1Top : !p1Top;   // musuh di sudut berlawanan
    place(i, 'garnisun', top ? 1 : ROWS - 2, i === 0 ? 1 : COLS - 2);
  }
}
