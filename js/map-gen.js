// ====================================================================
// map-gen.js — Menghasilkan mapData 40x60 (TANPA simetri).
// Sungai: garis berkelok yang membelah map dari titik dekat tengah
// (bisa bergeser sampai 20 tile) ke pinggir map, arah acak (vertikal,
// horizontal, serong), kadang terputus. Sisa kuota River dibuat sungai
// baru sampai habis.
// ====================================================================

function emptyGrid() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
}

function randomUnassignedCell(grid) {
  const empties = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] === null) empties.push([r, c]);
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
  let frontier = neighborsOf(sr, sc).filter(([r, c]) => grid[r][c] === null);
  while (count < size && frontier.length > 0) {
    const idx = Math.floor(Math.random() * frontier.length);
    const [r, c] = frontier.splice(idx, 1)[0];
    if (grid[r][c] !== null) continue;
    grid[r][c] = type;
    count++;
    for (const n of neighborsOf(r, c)) if (grid[n[0]][n[1]] === null) frontier.push(n);
  }
  return count;
}

function placeClusters(grid, quota, minSize, maxSize, type) {
  let placed = 0, guard = 0;
  while (placed < quota && guard < 4000) {
    guard++;
    const remaining = quota - placed;
    let size = minSize + Math.floor(Math.random() * (maxSize - minSize + 1));
    if (remaining < size) size = Math.max(1, remaining);
    const got = growCluster(grid, size, type);
    if (got === 0) break;
    placed += got;
  }
  return placed;
}

// Sebar terrain di sekitar terrain lain (mis. Rocks di sekitar Mountain)
function placeScatterAround(grid, quota, aroundType, type) {
  const collect = (srcType) => {
    const set = new Map();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === srcType) {
        for (const [nr, nc] of neighborsOf(r, c)) if (grid[nr][nc] === null) set.set(nr + ',' + nc, [nr, nc]);
      }
    }
    return Array.from(set.values());
  };
  let candidates = collect(aroundType);
  let placed = 0, guard = 0;
  while (placed < quota && guard < 6000) {
    guard++;
    if (candidates.length === 0) {
      candidates = collect(type);
      if (candidates.length === 0) break;
    }
    const idx = Math.floor(Math.random() * candidates.length);
    const [r, c] = candidates.splice(idx, 1)[0];
    if (grid[r][c] !== null) continue;
    grid[r][c] = type;
    placed++;
    for (const n of neighborsOf(r, c)) if (grid[n[0]][n[1]] === null) candidates.push(n);
  }
  return placed;
}

// Garis memanjang berkelok kiri->kanan (Road)
function placeLine(grid, quota, type) {
  let r = Math.floor(Math.random() * ROWS), c = 0;
  let placed = 0, guard = 0;
  while (placed < quota && guard < quota * 12) {
    guard++;
    if (grid[r][c] === null) { grid[r][c] = type; placed++; }
    const neigh = neighborsOf(r, c);
    const preferred = neigh.filter(([, nc]) => nc > c);
    const pool = (Math.random() < 0.75 && preferred.length > 0) ? preferred : neigh;
    if (pool.length === 0) break;
    const [nr, nc] = pool[Math.floor(Math.random() * pool.length)];
    r = nr; c = nc;
  }
  return placed;
}

// ---------- Sungai ----------
// Titik dunia (x,y) -> tile hex terdekat, atau null kalau di luar map
function worldToTile(x, y) {
  const r0 = Math.round(y / vertSpacing);
  let best = null, bd = Infinity;
  for (let rr = r0 - 1; rr <= r0 + 1; rr++) {
    if (rr < 0 || rr >= ROWS) continue;
    const c0 = Math.round((x - (rr % 2 === 1 ? hexW / 2 : 0)) / hexW);
    for (let cc = c0 - 1; cc <= c0 + 1; cc++) {
      if (cc < 0 || cc >= COLS) continue;
      const p = hexCenter(rr, cc);
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = [rr, cc]; }
    }
  }
  return (best && bd < (hexW * 0.75) ** 2) ? best : null;
}

// Jalan dari (x,y) ke arah `heading` sampai keluar map / kuota habis.
// Arah berayun acak (berkelok); sesekali 1-2 tile dilewati (sungai terputus).
function walkRiver(grid, x, y, heading, budget) {
  const base = heading;
  let h = heading, gapLeft = 0, gaps = 0, count = 0;
  const step = hexW * 0.8;
  for (let i = 0; i < 500 && count < budget; i++) {
    const t = worldToTile(x, y);
    if (!t) break;
    const [r, c] = t;
    if (gapLeft > 0) gapLeft--;
    else if (grid[r][c] === null) { grid[r][c] = 'river'; count++; }
    if (gapLeft === 0 && gaps < 3 && Math.random() < 0.03) { gapLeft = 1 + Math.floor(Math.random() * 2); gaps++; }
    h += (Math.random() - 0.5) * 0.9 + (base - h) * 0.12;
    x += Math.cos(h) * step; y += Math.sin(h) * step;
  }
  return count;
}

function placeRivers(grid, quota) {
  const bases = [0, Math.PI / 2, Math.PI / 4, 3 * Math.PI / 4]; // horizontal, vertikal, 2 serong
  const cx = (COLS - 1) * hexW / 2, cy = (ROWS - 1) * vertSpacing / 2;
  let placed = 0;
  for (let k = 0; k < 14 && placed < quota; k++) {
    const dist = Math.random() * 20, ang = Math.random() * Math.PI * 2;
    let x = cx + Math.cos(ang) * dist * hexW;
    let y = cy + Math.sin(ang) * dist * vertSpacing;
    y = Math.max(2 * vertSpacing, Math.min((ROWS - 3) * vertSpacing, y));
    const heading = bases[Math.floor(Math.random() * bases.length)] + (Math.random() - 0.5) * 0.3;
    placed += walkRiver(grid, x, y, heading, quota - placed);
    if (placed < quota) placed += walkRiver(grid, x, y, heading + Math.PI, quota - placed);
  }
  return placed;
}

function generateMap() {
  const grid = emptyGrid();
  const total = ROWS * COLS;
  const quotas = {};
  Object.keys(TERRAIN).forEach(k => quotas[k] = Math.round(TERRAIN[k].pct / 100 * total));

  placeRivers(grid, quotas.river);
  placeLine(grid, quotas.road, 'road');

  placeClusters(grid, quotas.mountain, 7, 18, 'mountain');
  placeClusters(grid, quotas.forest, 7, 30, 'forest');
  placeClusters(grid, quotas.city, 7, 14, 'city');
  placeClusters(grid, quotas.ruins, 7, 14, 'ruins');

  placeScatterAround(grid, quotas.rocks, 'mountain', 'rocks');
  placeScatterAround(grid, quotas.tallgrass, 'forest', 'tallgrass');

  placeClusters(grid, quotas.sand, 3, 8, 'sand');
  placeClusters(grid, quotas.swamp, 3, 8, 'swamp');

  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] === null) grid[r][c] = 'grass';
  return grid;
}
