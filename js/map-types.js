// ====================================================================
// map-types.js — Tujuh jenis map pertempuran Mode World War (v11, Rancangan Bagian 7).
//   generateMapByType(type) (type 1-7) mengembalikan grid ROWS x COLS dengan kunci terrain yang sudah ada.
//   1 Normal (generateMap lama) · 2 Gurun Tandus · 3 Hutan Lebat · 4 Padang Rumput · 5 Labirin · 6 Lapangan Tembak · 7 Jalur Premium.
//   Validasi tipe 2-5 dan 7: Markas kiri harus terjangkau Markas kanan (mapConnected, kolom 5/39); gagal -> buat ulang,
//   maksimal 60 percobaan, lalu pakai tipe 1. Tipe 4 juga memeriksa rute kendaraan. Tipe 6 memakai validasi khusus (K14).
//   Skrip global tanpa modul; hanya butuh ROWS, COLS, neighborsOf, hexDistance, generateMap, mapConnected saat dipanggil.
// ====================================================================
const MAP_TYPE_NAMES = { 1: 'Normal', 2: 'Gurun Tandus', 3: 'Hutan Lebat', 4: 'Padang Rumput', 5: 'Labirin', 6: 'Lapangan Tembak', 7: 'Jalur Premium' };

function mtFill(terr) { return Array.from({ length: ROWS }, () => new Array(COLS).fill(terr)); }
function mtRand(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
function mtPick(a) { return a[Math.floor(Math.random() * a.length)]; }
function mtShuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function mtAllTiles() { const t = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) t.push([r, c]); return t; }

// ---------- 2. Gurun Tandus: seluruh tile = sand ----------
function mapDesert() { return mtFill('sand'); }

// ---------- 3. Hutan Lebat: tepat 40% forest, 60% tallgrass, disebar acak (Fisher-Yates) ----------
function mapDenseForest() {
  const grid = mtFill('tallgrass'), tiles = mtShuffle(mtAllTiles());
  const nForest = Math.round(ROWS * COLS * 0.4);
  for (let i = 0; i < nForest; i++) grid[tiles[i][0]][tiles[i][1]] = 'forest';
  return grid;
}

// ---------- 4. Padang Rumput: 80% grass, 10% river (gugusan 3-12 tile, tidak saling menempel), 10% tallgrass di dekat sungai ----------
function mtClusterSizes(total) {                       // pecah total menjadi ukuran 3..12; sisa tidak boleh 1 atau 2
  const sizes = [];
  let rem = total;
  while (rem > 0) {
    let s = mtRand(3, 12);
    if (s > rem) s = rem;
    const left = rem - s;
    if (left > 0 && left < 3) s = (rem <= 12) ? rem : s - (3 - left);
    if (s < 3) { sizes[sizes.length - 1] += s; rem -= s; continue; }   // sisa kecil digabung ke gugusan sebelumnya (hanya terjadi bila total tidak bisa dipecah)
    sizes.push(s); rem -= s;
  }
  return sizes;
}
function mapMeadow() {
  const total = ROWS * COLS, nRiver = Math.round(total * 0.1), nTall = Math.round(total * 0.1);
  for (let attempt = 0; attempt < 200; attempt++) {
    const grid = mtFill('grass');
    const owner = new Map();                            // "r,c" -> id gugusan
    const key = (r, c) => r * COLS + c;
    let ok = true;
    const sizes = mtClusterSizes(nRiver);
    if (sizes.some(s => s < 3 || s > 12) || sizes.reduce((a, b) => a + b, 0) !== nRiver) continue;
    for (let id = 0; id < sizes.length && ok; id++) {
      // titik awal: tile bukan sungai dan tidak bersebelahan dengan gugusan lain
      const free = (r, c, me) => !owner.has(key(r, c)) && neighborsOf(r, c).every(([a, b]) => !owner.has(key(a, b)) || owner.get(key(a, b)) === me);
      const starts = mtAllTiles().filter(([r, c]) => free(r, c, id));
      if (!starts.length) { ok = false; break; }
      const [sr, sc] = mtPick(starts);
      const tiles = [[sr, sc]]; owner.set(key(sr, sc), id);
      while (tiles.length < sizes[id]) {
        const cand = [];
        for (const [r, c] of tiles) for (const [a, b] of neighborsOf(r, c)) if (free(a, b, id) && !cand.some(x => x[0] === a && x[1] === b)) cand.push([a, b]);
        if (!cand.length) { ok = false; break; }
        const [a, b] = mtPick(cand);
        tiles.push([a, b]); owner.set(key(a, b), id);
      }
    }
    if (!ok) continue;
    for (const k of owner.keys()) grid[Math.floor(k / COLS)][k % COLS] = 'river';
    // rumput tinggi: nRiver tile grass terdekat ke sungai (cincin tetangga 1, lalu 2, dst.; acak di dalam cincin)
    const dist = new Map(); let ring = [];
    for (const k of owner.keys()) { dist.set(k, 0); ring.push([Math.floor(k / COLS), k % COLS]); }
    let placed = 0;
    while (ring.length && placed < nTall) {
      const next = [];
      for (const [r, c] of ring) for (const [a, b] of neighborsOf(r, c)) if (!dist.has(key(a, b))) { dist.set(key(a, b), 1); next.push([a, b]); }
      mtShuffle(next);
      for (const [a, b] of next) { if (placed >= nTall) break; grid[a][b] = 'tallgrass'; placed++; }
      ring = next;
    }
    if (placed !== nTall) continue;
    return grid;
  }
  return null;
}

// ---------- 5. Labirin: 7 kolom kiri/kanan = grass; kolom 7-37 = valley dikikis menjadi jalur 1 tile oleh 8 pohon ----------
const MAZE_ROOTS_L = [3, 10, 19, 26], MAZE_ROOTS_R = [6, 13, 22, 28];
function mapMaze() {
  const c0 = 7, c1 = COLS - 8;                          // kolom 7..37 (zona labirin)
  const grid = mtFill('valley');
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (c < c0 || c > c1) grid[r][c] = 'grass';
  const carved = Array.from({ length: ROWS }, () => new Array(COLS).fill(-1));   // -1 = belum; selain itu = nomor pohon
  const inZone = (r, c) => c >= c0 && c <= c1;
  const trees = [];
  MAZE_ROOTS_L.forEach(r => trees.push({ root: [r, c0], stack: [[r, c0]], tiles: [[r, c0]] }));
  MAZE_ROOTS_R.forEach(r => trees.push({ root: [r, c1], stack: [[r, c1]], tiles: [[r, c1]] }));
  trees.forEach((t, i) => { carved[t.root[0]][t.root[1]] = i; grid[t.root[0]][t.root[1]] = 'grass'; });
  const carvedNeighbors = (r, c) => neighborsOf(r, c).filter(([a, b]) => inZone(a, b) && carved[a][b] >= 0);
  // aturan kikis: kolom 7 dan 37 selain akar tidak boleh dikikis; satu-satunya tetangga terkikis = induknya
  const canCarve = (r, c, pr, pc) => carved[r][c] < 0 && c > c0 && c < c1 && grid[r][c] === 'valley'
    && carvedNeighbors(r, c).length === 1 && carvedNeighbors(r, c)[0][0] === pr && carvedNeighbors(r, c)[0][1] === pc;
  // pohon tumbuh bergiliran satu langkah masing-masing (DFS acak, tumpukan sendiri)
  let active = true, guard = 0;
  while (active && guard++ < 200000) {
    active = false;
    trees.forEach((t, i) => {
      while (t.stack.length) {
        const [pr, pc] = t.stack[t.stack.length - 1];
        const opts = neighborsOf(pr, pc).filter(([a, b]) => canCarve(a, b, pr, pc));
        if (!opts.length) { t.stack.pop(); continue; }
        const [a, b] = mtPick(opts);
        carved[a][b] = i; grid[a][b] = 'grass'; t.tiles.push([a, b]); t.stack.push([a, b]);
        active = true; break;                            // satu langkah per giliran
      }
      if (t.stack.length) active = true;
    });
  }
  // sambungkan tepat 3 pasangan (pohon kiri i, pohon kanan j; semua i dan j berbeda) lewat 1 tile valley yang menyentuh tepat dua pohon (i dan j)
  const links = {};                                      // "i,j" -> daftar tile penghubung
  for (let r = 0; r < ROWS; r++) for (let c = c0 + 1; c < c1; c++) {
    if (grid[r][c] !== 'valley') continue;
    const ids = new Set(neighborsOf(r, c).filter(([a, b]) => inZone(a, b) && carved[a][b] >= 0).map(([a, b]) => carved[a][b]));
    if (ids.size !== 2) continue;
    const [x, y] = [...ids].sort((p, q) => p - q);
    if (x < 4 && y >= 4) (links[x + ',' + y] = links[x + ',' + y] || []).push([r, c]);
  }
  const perms = [];
  const left = [0, 1, 2, 3];
  (function rec(pick, used) {                            // semua pilihan 3 pohon kiri dengan 3 pohon kanan berbeda
    if (pick.length === 3) { perms.push(pick.slice()); return; }
    const i = [0, 1, 2, 3][pick.length];
    for (let j = 4; j < 8; j++) if (!used.has(j)) { used.add(j); pick.push([i, j]); rec(pick, used); pick.pop(); used.delete(j); }
  })([], new Set());
  const combos = [];
  for (const skip of left) for (const p of perms) {
    const lefts = left.filter(x => x !== skip);
    const pp = lefts.map((i, k) => [i, p[k][1]]);
    if (pp.every(([i, j]) => links[i + ',' + j] && links[i + ',' + j].length)) combos.push(pp);
  }
  if (!combos.length) return null;
  for (const [i, j] of mtPick(combos)) { const [r, c] = mtPick(links[i + ',' + j]); grid[r][c] = 'grass'; }
  return grid;
}

// ---------- 6. Lapangan Tembak (K14): dinding valley Z tertutup penuh; Markas/Barak di kolom 8 dan 36 ----------
function mapShootingRange() {
  const grid = mtFill('mountain');
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (c <= 7 || c >= COLS - 8) grid[r][c] = 'grass';
  const wall = (r1, r2, c1, c2) => { for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) grid[r][c] = 'valley'; };
  wall(0, 16, 14, 16);       // V1: kolom 14-16, baris 0-16 (menempel ke tepi atas)
  wall(14, 16, 14, 31);      // H : baris 14-16, kolom 14-31
  wall(14, 29, 29, 31);      // V2: kolom 29-31, baris 14-29 (menempel ke tepi bawah)
  return grid;
}
// Validasi tipe 6: tiap sisi harus punya tile gunung yang terjangkau dari Markas sendiri dengan jarak <= 9 ke tile terdekat Markas lawan.
function shootingRangeValid(grid) {
  const midR = Math.floor(ROWS / 2), cols = [8, COLS - 1 - 8];
  const markas = cols.map(c => [[midR, c], ...neighborsOf(midR, c)]);
  for (let side = 0; side < 2; side++) {
    const start = [midR, cols[side]], seen = new Set([start[0] * COLS + start[1]]), q = [start];
    let ok = false;
    while (q.length && !ok) {
      const [r, c] = q.pop();
      if (grid[r][c] === 'mountain' && markas[1 - side].some(([a, b]) => hexDistance(r, c, a, b) <= 9)) ok = true;
      for (const [nr, nc] of neighborsOf(r, c)) { const k = nr * COLS + nc; if (!seen.has(k) && grid[nr][nc] !== 'valley') { seen.add(k); q.push([nr, nc]); } }
    }
    if (!ok) return false;
  }
  return true;
}

// ---------- 7. Jalur Premium: balok valley 15x13 di tengah dengan satu jalur tengah (kendaraan terblokir city) dan dua jalur rawa ----------
function mapPremiumLane() {
  const grid = mtFill('grass');
  for (let r = 8; r <= 20; r++) for (let c = 15; c <= 29; c++) grid[r][c] = 'valley';
  for (let c = 15; c <= 29; c++) { grid[14][c] = 'tallgrass'; for (const r of [10, 11, 17, 18]) grid[r][c] = 'swamp'; }
  grid[14][15] = 'city'; grid[14][29] = 'city';          // pintu masuk kiri/kanan: kendaraan tidak bisa lewat
  return grid;
}

function generateMapByType(type) {
  if (type === 6) {
    const g = mapShootingRange();
    if (shootingRangeValid(g)) return g;                 // geometri tetap: cukup diperiksa sekali
    return generateMap();
  }
  for (let i = 0; i < 60; i++) {
    let g = null;
    if (type === 2) g = mapDesert();
    else if (type === 3) g = mapDenseForest();
    else if (type === 4) g = mapMeadow();
    else if (type === 5) g = mapMaze();
    else if (type === 7) g = mapPremiumLane();
    else return generateMap();                           // tipe 1 (dan nilai tak dikenal): peta klasik v10_2 tanpa perubahan
    if (!g) continue;
    if (!mapConnected(g)) continue;
    if (type === 4 && !mapConnected(g, true)) continue;  // sungai menghalangi kendaraan: rute kendaraan juga wajib ada
    return g;
  }
  return generateMap();                                  // gagal 60 kali -> tipe 1
}
