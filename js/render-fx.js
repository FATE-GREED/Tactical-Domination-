// ====================================================================
// render-fx.js — Lapisan visual tambahan: sprite terrain (gradient,
// di-cache biar ringan), ikon vektor unit/bangunan (gambar vektor,
// bukan huruf), dan animasi singkat untuk gerak & serangan.
// Semua digambar pakai Canvas API murni — tidak ada aset gambar/font
// dari luar, supaya tetap 100% jalan offline.
// ====================================================================

// ---------- Helper warna ----------
function shiftColor(hex, amt) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + amt, g = ((num >> 8) & 0xff) + amt, b = (num & 0xff) + amt;
  r = Math.min(255, Math.max(0, r)); g = Math.min(255, Math.max(0, g)); b = Math.min(255, Math.max(0, b));
  return `rgb(${r},${g},${b})`;
}

// ---------- Sprite terrain: gradient + grain + elemen representatif + bayangan ----------
// Di-cache sekali per terrain (bukan per tile) supaya tetap ringan meski 4000 tile.
// Render di resolusi 3x lalu diperkecil (supersampling) biar tajam di layar HP.
let terrainSprites = {};
const TERRAIN_SEED = { valley:13, grass:1, forest:9, rocks:4, swamp:6, tallgrass:7, river:3, mountain:2, sand:8, road:10, ruins:11, city:12 };

function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function drawPineTree(o, x, y, s) {
  o.fillStyle = 'rgba(0,0,0,0.22)';
  o.beginPath(); o.ellipse(x, y + s * 0.42, s * 0.32, s * 0.1, 0, 0, Math.PI * 2); o.fill();
  o.fillStyle = 'rgba(60,45,30,0.8)';
  o.fillRect(x - s * 0.05, y + s * 0.3, s * 0.1, s * 0.15);
  o.fillStyle = '#3a5c34';
  o.beginPath(); o.moveTo(x, y - s * 0.55); o.lineTo(x + s * 0.4, y - s * 0.05); o.lineTo(x - s * 0.4, y - s * 0.05); o.closePath(); o.fill();
  o.fillStyle = '#4a7040';
  o.beginPath(); o.moveTo(x, y - s * 0.28); o.lineTo(x + s * 0.32, y + s * 0.18); o.lineTo(x - s * 0.32, y + s * 0.18); o.closePath(); o.fill();
  o.fillStyle = '#57814a';
  o.beginPath(); o.moveTo(x, y - s * 0.02); o.lineTo(x + s * 0.25, y + s * 0.32); o.lineTo(x - s * 0.25, y + s * 0.32); o.closePath(); o.fill();
}
function drawGrassClump(o, x, y, s) {
  o.fillStyle = 'rgba(0,0,0,0.22)';
  o.beginPath(); o.ellipse(x, y + s * 0.35, s * 0.28, s * 0.08, 0, 0, Math.PI * 2); o.fill();
  for (let i = 0; i < 5; i++) {
    const t = i / 4 - 0.5;
    const sx = x + t * s * 0.35, topx = x + t * s * 0.6;
    o.strokeStyle = 'rgba(110,130,60,0.85)'; o.lineWidth = s * 0.05;
    o.beginPath(); o.moveTo(sx, y + s * 0.3); o.quadraticCurveTo(sx + t * s * 0.12, y - s * 0.15, topx, y - s * 0.6); o.stroke();
  }
}
function drawWall(o, x, y, w, h, tilt, shade) {
  o.save(); o.translate(x, y); o.rotate(tilt);
  o.fillStyle = 'rgba(0,0,0,0.2)'; o.fillRect(-w / 2 + 2, h * 0.42, w, h * 0.14);
  o.fillStyle = shade;
  o.beginPath();
  o.moveTo(-w / 2, h / 2); o.lineTo(-w / 2, -h / 2 + h * 0.15); o.lineTo(-w / 4, -h / 2); o.lineTo(0, -h / 2 + h * 0.22);
  o.lineTo(w / 4, -h / 2 + h * 0.05); o.lineTo(w / 2, -h / 2 + h * 0.28); o.lineTo(w / 2, h / 2);
  o.closePath(); o.fill();
  o.strokeStyle = 'rgba(0,0,0,0.25)'; o.lineWidth = 1.5;
  o.beginPath(); o.moveTo(-w / 2, 0); o.lineTo(w / 2, -h * 0.05); o.moveTo(-w / 3, -h / 2 + h * 0.3); o.lineTo(-w / 3, h / 2); o.stroke();
  o.restore();
}

const TERRAIN_DETAIL = {
  valley(o, cx, cy, hs, rand) {
    // Jurang gelap: bayangan dalam + retakan bergerigi
    const g = o.createRadialGradient(cx, cy, hs * 0.1, cx, cy, hs * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0.65)'); g.addColorStop(1, 'rgba(0,0,0,0.1)');
    o.fillStyle = g; o.fillRect(cx - hs, cy - hs, hs * 2, hs * 2);
    o.strokeStyle = 'rgba(120,125,140,0.5)'; o.lineWidth = hs * 0.04;
    for (let i = 0; i < 4; i++) {
      let x = cx + (rand() - 0.5) * hs * 1.2, y = cy - hs * 0.8;
      o.beginPath(); o.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (rand() - 0.5) * hs * 0.35; y += hs * 0.35; o.lineTo(x, y); }
      o.stroke();
    }
  },
  grass(o, cx, cy, hs, rand) {
    for (let i = 0; i < 7; i++) {
      const dx = (rand() - 0.5) * hs * 1.6, dy = (rand() - 0.5) * hs * 1.6;
      o.strokeStyle = 'rgba(60,80,30,0.3)'; o.lineWidth = hs * 0.025;
      o.beginPath(); o.moveTo(cx + dx, cy + dy + hs * 0.08); o.quadraticCurveTo(cx + dx + hs * 0.03, cy + dy - hs * 0.02, cx + dx, cy + dy - hs * 0.1); o.stroke();
    }
  },
  forest(o, cx, cy, hs, rand) {
    const positions = [[-0.5,-0.35],[0.1,-0.5],[0.5,-0.15],[-0.55,0.15],[0.05,-0.1],[0.45,0.3],[-0.15,0.4],[0.3,-0.35],[-0.3,-0.05],[0.6,0.05],[-0.1,0.55],[0.2,0.1]];
    positions.forEach(([px, py]) => {
      const jx = (rand() - 0.5) * hs * 0.06, jy = (rand() - 0.5) * hs * 0.06;
      drawPineTree(o, cx + px * hs * 1.15 + jx, cy + py * hs * 1.15 + jy, hs * (0.4 + rand() * 0.14));
    });
  },
  rocks(o, cx, cy, hs, rand) {
    const boulders = [[-0.35,-0.15,0.35],[0.25,-0.3,0.28],[0.4,0.25,0.3],[-0.15,0.35,0.32],[0.02,0.0,0.22]];
    boulders.forEach(([px, py, r]) => {
      const x = cx + px * hs, y = cy + py * hs, rad = r * hs;
      o.fillStyle = 'rgba(0,0,0,0.2)'; o.beginPath(); o.ellipse(x, y + rad * 0.7, rad * 0.9, rad * 0.3, 0, 0, Math.PI * 2); o.fill();
      o.fillStyle = '#9a9a92'; o.beginPath(); o.ellipse(x, y, rad, rad * 0.8, 0.3, 0, Math.PI * 2); o.fill();
      o.fillStyle = 'rgba(255,255,255,0.25)'; o.beginPath(); o.ellipse(x - rad * 0.3, y - rad * 0.3, rad * 0.35, rad * 0.2, 0.3, 0, Math.PI * 2); o.fill();
      o.strokeStyle = 'rgba(0,0,0,0.25)'; o.lineWidth = hs * 0.02;
      o.beginPath(); o.moveTo(x - rad * 0.2, y - rad * 0.3); o.lineTo(x + rad * 0.1, y + rad * 0.2); o.stroke();
    });
  },
  swamp(o, cx, cy, hs, rand) {
    [[-0.3,-0.1,0.4,0.22],[0.3,0.2,0.35,0.18],[0.0,-0.35,0.3,0.15]].forEach(([px, py, rw, rh]) => {
      const x = cx + px * hs, y = cy + py * hs;
      o.fillStyle = 'rgba(30,40,25,0.55)'; o.beginPath(); o.ellipse(x, y, rw * hs, rh * hs, 0, 0, Math.PI * 2); o.fill();
      o.fillStyle = 'rgba(255,255,255,0.12)'; o.beginPath(); o.ellipse(x - rw * hs * 0.2, y - rh * hs * 0.2, rw * hs * 0.3, rh * hs * 0.15, 0, 0, Math.PI * 2); o.fill();
    });
    for (let i = 0; i < 8; i++) {
      const dx = (rand() - 0.5) * hs * 1.5, dy = (rand() - 0.5) * hs * 1.5;
      o.strokeStyle = 'rgba(90,100,50,0.6)'; o.lineWidth = hs * 0.03;
      o.beginPath(); o.moveTo(cx + dx, cy + dy + hs * 0.15); o.lineTo(cx + dx + hs * 0.03, cy + dy - hs * 0.2); o.stroke();
    }
  },
  tallgrass(o, cx, cy, hs, rand) {
    for (let i = 0; i < 9; i++) {
      const dx = (rand() - 0.5) * hs * 1.6, dy = (rand() - 0.5) * hs * 1.6;
      o.strokeStyle = 'rgba(70,90,40,0.35)'; o.lineWidth = hs * 0.025;
      o.beginPath(); o.moveTo(cx + dx, cy + dy + hs * 0.08); o.quadraticCurveTo(cx + dx + hs * 0.03, cy + dy - hs * 0.02, cx + dx, cy + dy - hs * 0.1); o.stroke();
    }
    const positions = [[-0.42,-0.2],[0.15,-0.4],[0.48,0.0],[-0.12,0.22],[0.35,0.38],[-0.5,0.38],[0.0,-0.02],[-0.25,0.5],[0.5,-0.35],[-0.55,-0.4]];
    positions.forEach(([px, py]) => {
      const jx = (rand() - 0.5) * hs * 0.08, jy = (rand() - 0.5) * hs * 0.08;
      drawGrassClump(o, cx + px * hs * 1.2 + jx, cy + py * hs * 1.2 + jy, hs * (0.42 + rand() * 0.14));
    });
  },
  river(o, cx, cy, hs, rand) {
    const g = o.createLinearGradient(cx, cy - hs, cx, cy + hs);
    g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(0.5, 'rgba(0,0,0,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0.05)');
    o.fillStyle = g; o.fillRect(cx - hs, cy - hs, hs * 2, hs * 2);
    o.strokeStyle = 'rgba(255,255,255,0.4)'; o.lineWidth = hs * 0.035;
    for (let i = -1; i <= 1; i++) {
      o.beginPath(); o.moveTo(cx - hs * 0.9, cy + i * hs * 0.32); o.quadraticCurveTo(cx, cy + i * hs * 0.32 + hs * 0.14, cx + hs * 0.9, cy + i * hs * 0.32); o.stroke();
    }
    o.fillStyle = 'rgba(255,255,255,0.25)'; o.beginPath(); o.ellipse(cx - hs * 0.2, cy - hs * 0.15, hs * 0.15, hs * 0.04, 0.3, 0, Math.PI * 2); o.fill();
  },
  mountain(o, cx, cy, hs, rand) {
    o.fillStyle = 'rgba(120,120,125,0.55)';
    o.beginPath(); o.moveTo(cx - hs * 0.15, cy - hs * 0.35); o.lineTo(cx + hs * 0.55, cy + hs * 0.35); o.lineTo(cx - hs * 0.75, cy + hs * 0.35); o.closePath(); o.fill();
    o.fillStyle = '#6b6459';
    o.beginPath();
    o.moveTo(cx - hs * 0.55, cy + hs * 0.45); o.lineTo(cx - hs * 0.3, cy - hs * 0.1); o.lineTo(cx - hs * 0.12, cy + hs * 0.05);
    o.lineTo(cx + hs * 0.15, cy - hs * 0.55); o.lineTo(cx + hs * 0.35, cy - hs * 0.15); o.lineTo(cx + hs * 0.55, cy - hs * 0.3);
    o.lineTo(cx + hs * 0.75, cy + hs * 0.45); o.closePath(); o.fill();
    o.fillStyle = 'rgba(35,30,26,0.55)';
    o.beginPath();
    o.moveTo(cx + hs * 0.15, cy - hs * 0.55); o.lineTo(cx + hs * 0.35, cy - hs * 0.15); o.lineTo(cx + hs * 0.55, cy - hs * 0.3);
    o.lineTo(cx + hs * 0.75, cy + hs * 0.45); o.lineTo(cx + hs * 0.15, cy + hs * 0.45); o.closePath(); o.fill();
    o.fillStyle = 'rgba(255,255,255,0.85)';
    o.beginPath(); o.moveTo(cx + hs * 0.15, cy - hs * 0.55); o.lineTo(cx + hs * 0.28, cy - hs * 0.32); o.lineTo(cx + hs * 0.06, cy - hs * 0.28); o.closePath(); o.fill();
    o.beginPath(); o.moveTo(cx - hs * 0.3, cy - hs * 0.1); o.lineTo(cx - hs * 0.22, cy + hs * 0.02); o.lineTo(cx - hs * 0.38, cy + hs * 0.02); o.closePath(); o.fill();
  },
  sand(o, cx, cy, hs, rand) {
    o.strokeStyle = 'rgba(140,110,60,0.35)'; o.lineWidth = hs * 0.03;
    for (let i = -2; i <= 2; i++) {
      o.beginPath(); o.moveTo(cx - hs * 0.9, cy + i * hs * 0.35); o.quadraticCurveTo(cx, cy + i * hs * 0.35 - hs * 0.12, cx + hs * 0.9, cy + i * hs * 0.35); o.stroke();
    }
    for (let i = 0; i < 10; i++) {
      const dx = (rand() - 0.5) * hs * 1.6, dy = (rand() - 0.5) * hs * 1.6;
      o.fillStyle = 'rgba(90,70,40,0.3)'; o.beginPath(); o.arc(cx + dx, cy + dy, hs * 0.02 + rand() * hs * 0.02, 0, Math.PI * 2); o.fill();
    }
  },
  road(o, cx, cy, hs, rand) {
    o.fillStyle = 'rgba(60,55,48,0.4)'; o.fillRect(cx - hs * 0.95, cy - hs * 0.28, hs * 1.9, hs * 0.56);
    o.fillStyle = 'rgba(0,0,0,0.15)'; o.fillRect(cx - hs * 0.95, cy - hs * 0.28, hs * 1.9, hs * 0.1);
    o.strokeStyle = 'rgba(210,200,180,0.5)'; o.lineWidth = hs * 0.03; o.setLineDash([hs * 0.15, hs * 0.1]);
    o.beginPath(); o.moveTo(cx - hs * 0.9, cy); o.lineTo(cx + hs * 0.9, cy); o.stroke(); o.setLineDash([]);
    for (let i = 0; i < 6; i++) {
      const dx = (rand() - 0.5) * hs * 1.7, dy = hs * 0.35 * (rand() > 0.5 ? 1 : -1) * rand();
      o.fillStyle = 'rgba(80,70,55,0.4)'; o.beginPath(); o.arc(cx + dx, cy + dy, hs * 0.025, 0, Math.PI * 2); o.fill();
    }
  },
  ruins(o, cx, cy, hs, rand) {
    drawWall(o, cx - hs * 0.45, cy + hs * 0.1, hs * 0.5, hs * 0.75, -0.08, '#8a7d68');
    drawWall(o, cx + hs * 0.15, cy - hs * 0.05, hs * 0.42, hs * 0.55, 0.12, '#968972');
    drawWall(o, cx + hs * 0.5, cy + hs * 0.35, hs * 0.38, hs * 0.42, -0.15, '#7d7060');
    drawWall(o, cx - hs * 0.05, cy + hs * 0.5, hs * 0.45, hs * 0.35, 0.2, '#8a7d68');
    for (let i = 0; i < 8; i++) {
      const rx = cx + (rand() - 0.5) * hs * 1.6, ry = cy + (rand() - 0.5) * hs * 1.6;
      o.fillStyle = 'rgba(90,80,68,0.6)'; o.beginPath(); o.arc(rx, ry, hs * 0.05 + rand() * hs * 0.04, 0, Math.PI * 2); o.fill();
    }
  },
  city(o, cx, cy, hs, rand) {
    const buildings = [[-0.5,-0.4,0.4,0.35],[0.05,-0.5,0.35,0.3],[0.45,-0.25,0.3,0.4],[-0.35,0.15,0.35,0.4],[0.15,0.2,0.4,0.35],[-0.55,0.5,0.3,0.25],[0.5,0.4,0.3,0.3]];
    buildings.forEach(([px, py, w, h]) => {
      const x = cx + px * hs, y = cy + py * hs, bw = w * hs, bh = h * hs;
      o.fillStyle = 'rgba(0,0,0,0.25)'; o.fillRect(x - bw / 2 + bh * 0.25, y - bh / 2 + bh * 0.25, bw, bh);
      o.fillStyle = '#a85a35'; o.fillRect(x - bw / 2, y - bh / 2, bw, bh);
      o.fillStyle = 'rgba(255,255,255,0.2)'; o.fillRect(x - bw / 2, y - bh / 2, bw, bh * 0.15);
      o.strokeStyle = 'rgba(0,0,0,0.3)'; o.lineWidth = 1; o.strokeRect(x - bw / 2, y - bh / 2, bw, bh);
    });
  },
};

const TERRAIN_BASE_COLOR = {
  grass: '#6b9b3f', forest: '#556b45', rocks: '#8f8d84', swamp: '#5c6b4a',
  tallgrass: '#3f4f2a', river: '#4a7a8a', mountain: '#7d7568', sand: '#c9b077',
  road: '#7a7367', ruins: '#a89a83', city: '#8f8574', valley: '#2a2d36',
};

function buildTerrainSprites() {
  const SCALE = 3;
  const dispSize = Math.ceil(HEX_SIZE * 2.4);
  const size = dispSize * SCALE;
  for (const key in TERRAIN) {
    const color = TERRAIN_BASE_COLOR[key] || TERRAIN[key].color;
    const off = document.createElement('canvas');
    off.width = size; off.height = size;
    const o = off.getContext('2d');
    const cx = size / 2, cy = size / 2;
    const hs = (HEX_SIZE - 0.6) * SCALE;
    const pts = hexCorners(cx, cy, hs);
    o.beginPath(); pts.forEach(([px, py], i) => i === 0 ? o.moveTo(px, py) : o.lineTo(px, py)); o.closePath();
    o.save(); o.clip();

    const grad = o.createLinearGradient(cx - hs, cy - hs, cx + hs, cy + hs);
    grad.addColorStop(0, shiftColor(color, 16));
    grad.addColorStop(1, shiftColor(color, -10));
    o.fillStyle = grad; o.fillRect(0, 0, size, size);

    const rand = mulberry32(TERRAIN_SEED[key] || 1);
    for (let i = 0; i < 150; i++) {
      const ang = rand() * Math.PI * 2, dist = rand() * hs * 0.95;
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
      const dark = rand() > 0.45;
      o.fillStyle = dark ? `rgba(0,0,0,${0.03 + rand() * 0.04})` : `rgba(255,255,255,${0.02 + rand() * 0.03})`;
      o.fillRect(cx + dx, cy + dy, 1 + rand() * 2, 1 + rand() * 2);
    }

    const detailFn = TERRAIN_DETAIL[key];
    if (detailFn) detailFn(o, cx, cy, hs, rand);

    const vg = o.createRadialGradient(cx, cy, hs * 0.6, cx, cy, hs * 1.05);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.16)');
    o.fillStyle = vg; o.fillRect(0, 0, size, size);

    o.restore();
    o.strokeStyle = 'rgba(0,0,0,0.35)'; o.lineWidth = SCALE * 1;
    o.beginPath(); pts.forEach(([px, py], i) => i === 0 ? o.moveTo(px, py) : o.lineTo(px, py)); o.closePath(); o.stroke();

    terrainSprites[key] = { canvas: off, size: dispSize };
  }
  loadTileSprites(); // ganti sprite prosedural dengan tile gambar begitu selesai dimuat
}

// ---------- Tile gambar hex (img/tiles/<terrain>.webp, 168x192, pointy-top, transparan) ----------
// Satu tile per jenis terrain. Sprite prosedural di atas tetap jadi cadangan
// sampai gambarnya selesai dimuat (atau kalau gagal dimuat).
function loadTileSprites() {
  for (const key in TERRAIN) {
    const img = new Image();
    img.onload = () => {
      const off = document.createElement('canvas');
      off.width = img.naturalWidth; off.height = img.naturalHeight;
      off.getContext('2d').drawImage(img, 0, 0);
      // sedikit lebih besar dari hex supaya tidak ada celah tipis antar tile
      terrainSprites[key] = { canvas: off, w: hexW * 1.04, h: hexH * 1.02, isTile: true };
      draw();
    };
    img.src = 'img/tiles/' + key + '.webp';
  }
}

// ---------- Ikon vektor unit (digambar di ruang koordinat -1..1, putih) ----------
const UNIT_ICONS = {
  infantry(ctx) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, -0.38, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.26, 0.5); ctx.lineTo(-0.16, -0.05); ctx.lineTo(0.16, -0.05); ctx.lineTo(0.26, 0.5);
    ctx.closePath(); ctx.fill();
  },
  assault(ctx) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -0.5); ctx.lineTo(0.45, 0.12); ctx.lineTo(0.16, 0.12); ctx.lineTo(0.16, 0.5);
    ctx.lineTo(-0.16, 0.5); ctx.lineTo(-0.16, 0.12); ctx.lineTo(-0.45, 0.12);
    ctx.closePath(); ctx.fill();
  },
  sniper(ctx) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.11;
    ctx.beginPath(); ctx.arc(0, 0, 0.42, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -0.6); ctx.lineTo(0, -0.24); ctx.moveTo(0, 0.24); ctx.lineTo(0, 0.6);
    ctx.moveTo(-0.6, 0); ctx.lineTo(-0.24, 0); ctx.moveTo(0.24, 0); ctx.lineTo(0.6, 0);
    ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 0.07, 0, Math.PI * 2); ctx.fill();
  },
  antitank(ctx) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -0.55); ctx.lineTo(0.4, 0); ctx.lineTo(0, 0.55); ctx.lineTo(-0.4, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.arc(0, 0, 0.13, 0, Math.PI * 2); ctx.fill();
  },
  tanklapis(ctx) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-0.5, -0.16, 1.0, 0.4);
    ctx.beginPath(); ctx.arc(-0.05, -0.16, 0.27, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(0.15, -0.28, 0.5, 0.09);
  },
  tankcrusher(ctx) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-0.55, -0.22, 1.1, 0.5);
    ctx.beginPath(); ctx.arc(0.0, -0.02, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(0.15, -0.16, 0.55, 0.13);
  },
  montir(ctx) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-0.32, 0.4); ctx.lineTo(0.28, -0.28); ctx.stroke();
    ctx.beginPath(); ctx.arc(-0.4, 0.46, 0.15, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0.38, -0.38, 0.13, 0, Math.PI * 2); ctx.stroke();
  },
  apc(ctx) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-0.48, -0.24, 0.96, 0.4);
    ctx.beginPath(); ctx.arc(-0.28, 0.24, 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0.28, 0.24, 0.14, 0, Math.PI * 2); ctx.fill();
  },
  corps(ctx) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, -0.08, 0.34, Math.PI, 0); ctx.fill();
    ctx.fillRect(-0.4, -0.12, 0.8, 0.12);
  },
};

const BUILDING_ICONS = {
  markas(ctx) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * (2 * Math.PI / 5);
      const a2 = a + Math.PI / 5;
      const x1 = Math.cos(a) * 0.55, y1 = Math.sin(a) * 0.55;
      const x2 = Math.cos(a2) * 0.22, y2 = Math.sin(a2) * 0.22;
      if (i === 0) ctx.moveTo(x1, y1); else ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.closePath(); ctx.fill();
  },
  barak(ctx) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, -0.5); ctx.lineTo(0.5, 0.3); ctx.lineTo(-0.5, 0.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-0.08, -0.05, 0.16, 0.35);
  },
  garnisun(ctx) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -0.55); ctx.lineTo(0.4, -0.35); ctx.lineTo(0.4, 0.1); ctx.lineTo(0, 0.55); ctx.lineTo(-0.4, 0.1); ctx.lineTo(-0.4, -0.35);
    ctx.closePath(); ctx.fill();
  },
  pom(ctx) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -0.55);
    ctx.quadraticCurveTo(0.4, 0.1, 0, 0.55);
    ctx.quadraticCurveTo(-0.4, 0.1, 0, -0.55);
    ctx.closePath(); ctx.fill();
  },
  pospemulihan(ctx) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-0.14, -0.5, 0.28, 1.0);
    ctx.fillRect(-0.5, -0.14, 1.0, 0.28);
  },
  benteng(ctx) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-0.5, -0.1, 1.0, 0.6);
    for (let i = -1; i <= 1; i++) ctx.fillRect(i * 0.33 - 0.09, -0.5, 0.18, 0.4);
  },
  jembatan(ctx) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.15; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0.35, 0.5, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.5, 0.35); ctx.lineTo(-0.5, 0.58); ctx.moveTo(0.5, 0.35); ctx.lineTo(0.5, 0.58); ctx.stroke();
  },
};

function drawIcon(iconFn, cx, cy, size) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size, size);
  iconFn(ctx);
  ctx.restore();
}

// Gambar 1 unit lengkap (chip warna pemilik + border + ikon) di posisi (x,y) manapun
// Bar HP di atas entitas: sekutu biru, musuh merah (panjang isi = sisa HP). Garnisun (HP tak hingga) tanpa bar.
function drawHpBar(x, top, hp, max, mine) {
  if (!Settings.get('showHp') || !isFinite(max) || max <= 0) return;
  const w = HEX_SIZE, h = Math.max(HEX_SIZE * 0.16, 3 / scale), y = top - h - 1.5 / scale;
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - w / 2 - 0.5, y - 0.5, w + 1, h + 1);
  ctx.fillStyle = mine ? '#5aa9ff' : '#ff5f5f';
  ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, hp / max)), h);
}

// drawUnitSprite(u, x, y) kini ada di unit-art.js (grafik unit dari v7).

// Gambar 1 bangunan lengkap (chip bulat warna pemilik + ikon) di posisi (x,y)
function drawBuildingSprite(b, ownerColor, x, y) {
  ctx.beginPath(); ctx.arc(x, y, HEX_SIZE * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = ownerColor; ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5 / scale; ctx.stroke();
  const iconFn = BUILDING_ICONS[b.type];
  if (iconFn) drawIcon(iconFn, x, y, HEX_SIZE * 0.48);
  drawHpBar(x, y - HEX_SIZE * 0.55, b.hp, BUILDING_TYPES[b.type].hp, players[HUMAN].buildings.includes(b));
}

// ---------- Animasi: gerak unit (tween linear singkat) ----------
let moveAnim = null; // {unitId, fromR, fromC, toR, toC, startTime, duration}
function startMoveAnim(unit, fromR, fromC, duration = 220) {
  moveAnim = { unitId: unit.id, fromR, fromC, toR: unit.r, toC: unit.c, startTime: performance.now(), duration: duration * Settings.timeScale() };
  requestAnimationFrame(draw);
}

// ---------- Animasi: efek serangan (tracer + flash + angka damage melayang) ----------
let attackFx = null; // {fromR,fromC,toR,toC,damage,startTime,duration}
function startAttackFx(fromR, fromC, toR, toC, damage) {
  attackFx = { fromR, fromC, toR, toC, damage, startTime: performance.now(), duration: 450 * Settings.timeScale() };
  requestAnimationFrame(draw);
}

// Dipanggil dari draw() (render.js), DI DALAM ctx.save()/scale() dunia peta,
// SEBELUM ctx.restore(). Mengembalikan true kalau masih perlu frame lanjutan.
function renderFx() {
  let needsMore = false;

  if (moveAnim) {
    const u = units.find(uu => uu.id === moveAnim.unitId);
    if (u) {
      const t = Math.min(1, (performance.now() - moveAnim.startTime) / moveAnim.duration);
      const from = hexCenter(moveAnim.fromR, moveAnim.fromC);
      const to = hexCenter(moveAnim.toR, moveAnim.toC);
      const ix = from.x + (to.x - from.x) * t;
      const iy = from.y + (to.y - from.y) * t;
      if (isVisibleToCurrentPlayer(u)) drawUnitSprite(u, ix, iy);
      if (t < 1) needsMore = true; else moveAnim = null;
    } else {
      moveAnim = null;
    }
  }

  if (attackFx) {
    const t = Math.min(1, (performance.now() - attackFx.startTime) / attackFx.duration);
    const from = hexCenter(attackFx.fromR, attackFx.fromC);
    const to = hexCenter(attackFx.toR, attackFx.toC);

    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t * 1.4);
    ctx.strokeStyle = '#ffdd66';
    ctx.lineWidth = 2.5 / scale;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    ctx.restore();

    const flashR = HEX_SIZE * (0.3 + t * 0.9);
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.fillStyle = '#ff8844';
    ctx.beginPath(); ctx.arc(to.x, to.y, flashR, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(11, HEX_SIZE * 0.9)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('-' + attackFx.damage, to.x, to.y - HEX_SIZE * 0.6 - t * HEX_SIZE * 1.2);
    ctx.restore();

    if (t < 1) needsMore = true; else attackFx = null;
  }

  return needsMore;
}
