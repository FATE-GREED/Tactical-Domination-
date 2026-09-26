// ====================================================================
// map-gen.js — Menghasilkan mapData: peta hex dengan terrain berpola.
// Strategi: generate hanya separuh kiri (HALF_COLS), lalu cerminkan ke
// kanan supaya kedua pemain punya kualitas area yang identik.
// ====================================================================

const HR = ROWS, HC = HALF_COLS;

function emptyHalfGrid() {
  return Array.from({ length: HR }, () => new Array(HC).fill(null));
}

// Tetangga hex untuk grid setengah (dipakai khusus saat generate terrain)
function genNeighbors(r, c) {
  const offsets = (r % 2 === 0)
    ? [[-1,-1],[-1,0],[0,-1],[0,1],[1,-1],[1,0]]
    : [[-1,0],[-1,1],[0,-1],[0,1],[1,0],[1,1]];
  const out = [];
  for (const [dr, dc] of offsets) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < HR && nc >= 0 && nc < HC) out.push([nr, nc]);
  }
  return out;
}

function randomUnassignedCell(grid) {
  const empties = [];
  for (let r = 0; r < HR; r++) for (let c = 0; c < HC; c++) if (grid[r][c] === null) empties.push([r, c]);
  if (empties.length === 0) return null;
  return empties[Math.floor(Math.random() * empties.length)];
}

// Tumbuhkan 1 gerombol (blob) terrain dari titik acak, target ukuran `size`
function growCluster(grid, size, type) {
  const seed = randomUnassignedCell(grid);
  if (!seed) return 0;
  const [sr, sc] = seed;
  grid[sr][sc] = type;
  let count = 1;
  let frontier = genNeighbors(sr, sc).filter(([r, c]) => grid[r][c] === null);
  while (count < size && frontier.length > 0) {
    const idx = Math.floor(Math.random() * frontier.length);
    const [r, c] = frontier.splice(idx, 1)[0];
    if (grid[r][c] !== null) continue;
    grid[r][c] = type;
    count++;
    for (const n of genNeighbors(r, c)) if (grid[n[0]][n[1]] === null) frontier.push(n);
  }
  return count;
}

// Isi quota terrain dengan beberapa gerombol, tiap gerombol minimal minSize tile
function placeClusters(grid, quota, minSize, maxSize, type) {
  let placed = 0, guard = 0;
  while (placed < quota && guard < 4000) {
    guard++;
    const remaining = quota - placed;
    let size = minSize + Math.floor(Math.random() * (maxSize - minSize + 1));
    if (remaining < minSize) size = minSize; // tetap jaga minimal gerombol
    const got = growCluster(grid, size, type);
    if (got === 0) break; // tidak ada ruang kosong lagi
    placed += got;
  }
  return placed;
}

// Sebar terrain di sekitar terrain lain yang sudah ada (mis. Rocks di sekitar Mountain)
function placeScatterAround(grid, quota, aroundType, type) {
  const collectCandidates = (srcType) => {
    const set = new Map();
    for (let r = 0; r < HR; r++) for (let c = 0; c < HC; c++) {
      if (grid[r][c] === srcType) {
        for (const [nr, nc] of genNeighbors(r, c)) if (grid[nr][nc] === null) set.set(nr + ',' + nc, [nr, nc]);
      }
    }
    return Array.from(set.values());
  };
  let candidates = collectCandidates(aroundType);
  let placed = 0, guard = 0;
  while (placed < quota && guard < 6000) {
    guard++;
    if (candidates.length === 0) {
      candidates = collectCandidates(type); // perluas cincin dari tile scatter yang sudah ditaruh
      if (candidates.length === 0) break;
    }
    const idx = Math.floor(Math.random() * candidates.length);
    const [r, c] = candidates.splice(idx, 1)[0];
    if (grid[r][c] !== null) continue;
    grid[r][c] = type;
    placed++;
    for (const n of genNeighbors(r, c)) if (grid[n[0]][n[1]] === null) candidates.push(n);
  }
  return placed;
}

// Garis memanjang berkelok (River top->bottom, Road left->right)
function placeLine(grid, quota, type, orientation) {
  let r, c;
  if (orientation === 'vertical') { r = 0; c = Math.floor(Math.random() * HC); }
  else { r = Math.floor(Math.random() * HR); c = 0; }
  let placed = 0, guard = 0;
  while (placed < quota && guard < quota * 12) {
    guard++;
    if (grid[r][c] === null) { grid[r][c] = type; placed++; }
    const neigh = genNeighbors(r, c);
    const preferred = orientation === 'vertical' ? neigh.filter(([nr]) => nr > r) : neigh.filter(([, nc]) => nc > c);
    const pool = (Math.random() < 0.75 && preferred.length > 0) ? preferred : neigh;
    if (pool.length === 0) break;
    const [nr, nc] = pool[Math.floor(Math.random() * pool.length)];
    r = nr; c = nc;
  }
  return placed;
}

// Fungsi utama: hasilkan mapData penuh (ROWS x COLS), simetris cermin kiri-kanan
function generateMap() {
  const grid = emptyHalfGrid();
  const totalHalf = HR * HC;

  const quotas = {};
  Object.keys(TERRAIN).forEach(k => quotas[k] = Math.round(TERRAIN[k].pct / 100 * totalHalf));
  const sum = Object.values(quotas).reduce((a, b) => a + b, 0);
  quotas.grass += (totalHalf - sum); // sisa pembulatan diserap Grass

  // 1. Garis memanjang dulu (butuh ruang leluasa)
  placeLine(grid, quotas.river, 'river', 'vertical');
  placeLine(grid, quotas.road, 'road', 'horizontal');

  // 2. Gerombol besar, minimal 7 tile
  placeClusters(grid, quotas.mountain, 7, 18, 'mountain');
  placeClusters(grid, quotas.forest, 7, 22, 'forest');
  placeClusters(grid, quotas.city, 7, 14, 'city');
  placeClusters(grid, quotas.ruins, 7, 14, 'ruins');

  // 3. Tersebar di sekitar gerombol terkait
  placeScatterAround(grid, quotas.rocks, 'mountain', 'rocks');
  placeScatterAround(grid, quotas.tallgrass, 'forest', 'tallgrass');

  // 4. Gerombol kecil, minimal 3 tile
  placeClusters(grid, quotas.sand, 3, 8, 'sand');
  placeClusters(grid, quotas.swamp, 3, 8, 'swamp');

  // 5. Sisanya Grass acak (tile kosong yang tersisa)
  for (let r = 0; r < HR; r++) for (let c = 0; c < HC; c++) if (grid[r][c] === null) grid[r][c] = 'grass';

  // Cerminkan ke separuh kanan
  const map = Array.from({ length: ROWS }, () => new Array(COLS));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < HALF_COLS; c++) {
      map[r][c] = grid[r][c];
      map[r][COLS - 1 - c] = grid[r][c];
    }
  }
  return map;
}
