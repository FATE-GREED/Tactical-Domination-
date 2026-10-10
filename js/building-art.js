// ====================================================================
// building-art.js — Grafik bangunan (v9.0), setara gaya grafis unit:
// bangunan digambar langsung berdiri di atas tile (bayangan, gradasi
// cahaya, tanpa lencana bulat). Pemilik ditandai bendera/aksen warna
// pemilik + bar HP. Dimuat setelah unit-art.js.
//
// Ukuran bangunan (jumlah tile) dibaca dari b.tiles = [[r,c], ...].
// Kalau b.tiles belum ada, dipakai 1 tile di b.r,b.c — jadi aman dipakai
// sebelum tim lain selesai mengubah ukuran bangunan:
//   Markas 7 tile (bunga heksagon) • bangunan lain 3 tile (segitiga)
//   Jembatan 2 tile (garis lurus) atau 3 tile (segitiga) di atas sungai.
// Memakai (menimpa) drawBuildingSprite lama; tidak mengubah aturan game.
// ====================================================================

// ---------- Footprint ----------
function buildingTiles(b) {
  return (b.tiles && b.tiles.length) ? b.tiles : [[b.r, b.c]];
}
function fpInfo(tiles) {
  const centers = tiles.map(([r, c]) => hexCenter(r, c));
  let sx = 0, sy = 0;
  centers.forEach(p => { sx += p.x; sy += p.y; });
  return { tiles, centers, n: centers.length, cx: sx / centers.length, cy: sy / centers.length };
}
// Satuan gambar: 1 unit ≈ setengah lebar footprint
function fpUnit(n) { return HEX_SIZE * (n >= 7 ? 2.55 : n >= 3 ? 1.7 : n === 2 ? 1.25 : 0.9); }

// Alas tanah di bawah bangunan (gabungan hex footprint; garis hanya di sisi luar)
const BUILDING_PAD = {
  markas: '#6d7076', barak: '#7b6d52', garnisun: '#77705f',
  pom: '#5f5f5a', pospemulihan: '#7d8174', benteng: '#76705f',
};
function drawFootprintPad(c, fp, col) {
  const S = HEX_SIZE - 0.8;
  c.save();
  fp.centers.forEach((p, idx) => {
    const pts = hexCorners(p.x, p.y, S);
    c.beginPath(); pts.forEach(([x, y], i) => i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)); c.closePath();
    const g = c.createLinearGradient(p.x - S, p.y - S, p.x + S, p.y + S);
    g.addColorStop(0, shiftColor(col, 14 + (idx % 2) * 4)); g.addColorStop(1, shiftColor(col, -14));
    c.globalAlpha = 0.92; c.fillStyle = g; c.fill();
  });
  c.globalAlpha = 1;
  c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1.1; c.lineCap = 'round';
  fp.centers.forEach(p => {
    const pts = hexCorners(p.x, p.y, S);
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i);
      const nx = p.x + hexW * Math.cos(a), ny = p.y + hexW * Math.sin(a);
      if (fp.centers.some(q => Math.abs(q.x - nx) < 1.5 && Math.abs(q.y - ny) < 1.5)) continue;
      c.beginPath(); c.moveTo(pts[i][0], pts[i][1]); c.lineTo(pts[(i + 1) % 6][0], pts[(i + 1) % 6][1]); c.stroke();
    }
  });
  c.restore();
}

// ---------- Primitif gambar (ruang satuan, y ke bawah) ----------
function bShadow(c, x, y, rx, ry, a) {
  c.fillStyle = 'rgba(0,0,0,' + (a || 0.32) + ')';
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
}
// Balok: x tengah, y dasar muka depan, w lebar, h tinggi, d kedalaman atap
function bBlock(c, x, y, w, h, d, col, top) {
  const l = x - w / 2, r = x + w / 2, t = y - h, dx = d * 0.6;
  c.fillStyle = shiftColor(col, -38);
  c.beginPath(); c.moveTo(r, t); c.lineTo(r + dx, t - d); c.lineTo(r + dx, y - d); c.lineTo(r, y); c.closePath(); c.fill();
  const g = c.createLinearGradient(l, 0, r, 0);
  g.addColorStop(0, shiftColor(col, 14)); g.addColorStop(1, shiftColor(col, -14));
  c.fillStyle = g; c.fillRect(l, t, w, h);
  c.fillStyle = top || shiftColor(col, 30);
  c.beginPath(); c.moveTo(l, t); c.lineTo(r, t); c.lineTo(r + dx, t - d); c.lineTo(l + dx, t - d); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.38)'; c.lineWidth = 0.014; c.lineJoin = 'round';
  c.strokeRect(l, t, w, h);
  c.beginPath(); c.moveTo(r, t); c.lineTo(r + dx, t - d); c.lineTo(l + dx, t - d); c.lineTo(l, t); c.stroke();
  c.beginPath(); c.moveTo(r + dx, t - d); c.lineTo(r + dx, y - d); c.lineTo(r, y); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.22)';
  c.beginPath(); c.moveTo(l + 0.01, y - 0.01); c.lineTo(l + 0.01, t + 0.01); c.stroke();
}
function bStripe(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x - w / 2, y, w, h); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x - w / 2, y + h - 0.012, w, 0.012); }
function bWindows(c, x, y, w, h, cols, rows) {
  const cw = w / cols, rh = h / rows, ww = cw * 0.55, wh = rh * 0.55;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const wx = x - w / 2 + i * cw + (cw - ww) / 2, wy = y - h + j * rh + (rh - wh) / 2;
    c.fillStyle = ((i + j * 2) % 3 === 0) ? '#e6c866' : '#26323f'; c.fillRect(wx, wy, ww, wh);
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 0.01; c.strokeRect(wx, wy, ww, wh);
  }
}
function bDoor(c, x, y, w, h) {
  c.fillStyle = '#1e2124'; c.fillRect(x - w / 2, y - h, w, h);
  c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 0.014; c.strokeRect(x - w / 2, y - h, w, h);
}
function bFlag(c, x, y, h, col) {
  c.strokeStyle = '#d9d9d0'; c.lineWidth = 0.03; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h); c.stroke();
  c.fillStyle = col;
  c.beginPath(); c.moveTo(x, y - h); c.quadraticCurveTo(x + 0.14, y - h - 0.05, x + 0.28, y - h + 0.02);
  c.lineTo(x + 0.28, y - h + 0.17); c.quadraticCurveTo(x + 0.14, y - h + 0.12, x, y - h + 0.2); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 0.012; c.stroke();
}
function bSandbags(c, x, y, w, rows) {
  const n = Math.max(2, Math.floor(w / 0.1));
  for (let k = 0; k < rows; k++) for (let i = 0; i < n; i++) {
    const bx = x + i * (w / n) + (k % 2) * 0.05, by = y - k * 0.06;
    c.fillStyle = (i + k) % 2 ? '#b5a37b' : '#a39269';
    c.beginPath(); c.ellipse(bx, by, 0.062, 0.034, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.01; c.stroke();
  }
}
function bTent(c, x, y, w, h, col) {
  c.fillStyle = shiftColor(col, 18);
  c.beginPath(); c.moveTo(x - w / 2, y); c.lineTo(x, y - h); c.lineTo(x, y); c.closePath(); c.fill();
  c.fillStyle = shiftColor(col, -26);
  c.beginPath(); c.moveTo(x, y - h); c.lineTo(x + w / 2, y); c.lineTo(x, y); c.closePath(); c.fill();
  c.fillStyle = '#1e2124';
  c.beginPath(); c.moveTo(x - w * 0.1, y); c.lineTo(x, y - h * 0.52); c.lineTo(x + w * 0.1, y); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 0.012;
  c.beginPath(); c.moveTo(x - w / 2, y); c.lineTo(x, y - h); c.lineTo(x + w / 2, y); c.closePath(); c.stroke();
}
function bTankH(c, x, y, w, r, col, band) {
  c.beginPath();
  c.moveTo(x - w / 2 + r, y - r); c.lineTo(x + w / 2 - r, y - r);
  c.arc(x + w / 2 - r, y, r, -Math.PI / 2, Math.PI / 2); c.lineTo(x - w / 2 + r, y + r);
  c.arc(x - w / 2 + r, y, r, Math.PI / 2, Math.PI * 1.5); c.closePath();
  const g = c.createLinearGradient(0, y - r, 0, y + r);
  g.addColorStop(0, shiftColor(col, 40)); g.addColorStop(0.5, col); g.addColorStop(1, shiftColor(col, -45));
  c.fillStyle = g; c.fill();
  c.save(); c.clip();
  c.fillStyle = band; c.fillRect(x - w * 0.08, y - r, w * 0.16, r * 2);
  c.restore();
  c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 0.012; c.stroke();
}
function bTankV(c, x, y, w, h, col, band) {
  const rx = w / 2, ry = w * 0.2;
  const g = c.createLinearGradient(x - rx, 0, x + rx, 0);
  g.addColorStop(0, shiftColor(col, 30)); g.addColorStop(0.55, col); g.addColorStop(1, shiftColor(col, -45));
  c.fillStyle = g;
  c.beginPath(); c.moveTo(x - rx, y - h); c.lineTo(x - rx, y); c.ellipse(x, y, rx, ry, 0, Math.PI, 0, true);
  c.lineTo(x + rx, y - h); c.closePath(); c.fill();
  if (band) { c.fillStyle = band; c.fillRect(x - rx, y - h * 0.62, w, h * 0.12); }
  c.fillStyle = shiftColor(col, 38);
  c.beginPath(); c.ellipse(x, y - h, rx, ry, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 0.012; c.stroke();
}
function bBarrel(c, x, y, s, col) {
  c.fillStyle = col; c.fillRect(x - s * 0.5, y - s, s, s);
  c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x - s * 0.5, y - s, s * 0.22, s);
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x - s * 0.5, y - s * 0.62, s, s * 0.08);
  c.fillStyle = shiftColor(col, 30); c.beginPath(); c.ellipse(x, y - s, s * 0.5, s * 0.16, 0, 0, Math.PI * 2); c.fill();
}
function bCrate(c, x, y, s) { bBlock(c, x, y, s, s * 0.8, s * 0.5, '#8b6b43'); }
function bCross(c, x, y, s) {
  c.fillStyle = '#f0f0ea'; c.fillRect(x - s * 0.62, y - s * 0.62, s * 1.24, s * 1.24);
  c.fillStyle = '#c8312b'; c.fillRect(x - s * 0.18, y - s * 0.5, s * 0.36, s); c.fillRect(x - s * 0.5, y - s * 0.18, s, s * 0.36);
}
function bCone(c, x, yBase, w, h, col) {
  c.fillStyle = shiftColor(col, 16);
  c.beginPath(); c.moveTo(x - w / 2, yBase); c.lineTo(x, yBase - h); c.lineTo(x, yBase); c.closePath(); c.fill();
  c.fillStyle = shiftColor(col, -30);
  c.beginPath(); c.moveTo(x, yBase - h); c.lineTo(x + w / 2, yBase); c.lineTo(x, yBase); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 0.012;
  c.beginPath(); c.moveTo(x - w / 2, yBase); c.lineTo(x, yBase - h); c.lineTo(x + w / 2, yBase); c.closePath(); c.stroke();
}

// ---------- Desain tiap bangunan (ruang satuan; dasar ≈ y 0.3–0.6) ----------
const BUILDING_ART = {
  markas(c, own) {
    bShadow(c, 0, 0.52, 1.05, 0.2);
    bBlock(c, -0.72, 0.36, 0.5, 0.3, 0.2, '#777d85'); bWindows(c, -0.72, 0.36, 0.4, 0.2, 2, 1);
    bBlock(c, 0.68, 0.36, 0.5, 0.3, 0.2, '#777d85'); bWindows(c, 0.68, 0.36, 0.4, 0.2, 2, 1);
    bBlock(c, -0.05, 0.34, 0.86, 0.58, 0.32, '#8a939c');
    bStripe(c, -0.05, -0.24, 0.86, 0.05, own);
    bWindows(c, -0.05, 0.3, 0.72, 0.3, 4, 2);
    bDoor(c, -0.05, 0.34, 0.15, 0.2);
    bStripe(c, -0.05, 0.1, 0.24, 0.04, own);
    // piringan radar di atap
    c.strokeStyle = '#555b61'; c.lineWidth = 0.03; c.beginPath(); c.moveTo(-0.32, -0.36); c.lineTo(-0.32, -0.5); c.stroke();
    c.fillStyle = '#d4d8d9'; c.beginPath(); c.ellipse(-0.32, -0.54, 0.17, 0.09, -0.5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 0.012; c.stroke();
    // antena
    c.strokeStyle = '#3d4247'; c.lineWidth = 0.025; c.beginPath(); c.moveTo(0.3, -0.34); c.lineTo(0.3, -0.92); c.stroke();
    c.lineWidth = 0.012; c.beginPath(); c.moveTo(0.22, -0.7); c.lineTo(0.38, -0.7); c.moveTo(0.24, -0.8); c.lineTo(0.36, -0.8); c.stroke();
    c.fillStyle = '#ff4a3d'; c.beginPath(); c.arc(0.3, -0.94, 0.028, 0, Math.PI * 2); c.fill();
    bSandbags(c, -0.55, 0.6, 0.45, 2); bSandbags(c, 0.2, 0.6, 0.45, 2);
    bCrate(c, 0.95, 0.62, 0.12);
    bFlag(c, 0.88, 0.5, 0.95, own);
  },
  barak(c, own) {
    bShadow(c, 0, 0.52, 1.0, 0.2);
    bBlock(c, -0.15, 0.34, 1.1, 0.38, 0.3, '#66704e', '#4d563b');
    c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 0.014;
    c.beginPath(); c.moveTo(-0.7 + 0.09, 0.34 - 0.38 - 0.15); c.lineTo(0.4 + 0.09, 0.34 - 0.38 - 0.15); c.stroke();
    bStripe(c, -0.15, -0.04, 1.1, 0.05, own);
    bWindows(c, -0.32, 0.3, 0.7, 0.2, 4, 1);
    bDoor(c, 0.28, 0.34, 0.15, 0.22);
    bTent(c, 0.74, 0.56, 0.5, 0.34, '#5d6945'); bTent(c, 0.5, 0.64, 0.34, 0.24, '#566240');
    bCrate(c, -0.78, 0.58, 0.14); bCrate(c, -0.62, 0.6, 0.11);
    bSandbags(c, -0.45, 0.66, 0.6, 1);
    bFlag(c, -0.66, 0.26, 0.82, own);
  },
  garnisun(c, own) {
    bShadow(c, 0, 0.55, 1.0, 0.2);
    bBlock(c, -0.62, 0.4, 0.56, 0.2, 0.18, '#8b8678'); bBlock(c, 0.62, 0.4, 0.56, 0.2, 0.18, '#8b8678');
    for (let i = 0; i < 4; i++) { c.fillStyle = '#7c786b'; c.fillRect(-0.84 + i * 0.12, 0.17, 0.07, 0.06); c.fillRect(0.4 + i * 0.12, 0.17, 0.07, 0.06); }
    bBlock(c, 0, 0.42, 0.46, 0.84, 0.24, '#938e80');
    c.fillStyle = '#1b1d1c'; c.beginPath(); c.moveTo(-0.1, 0.42); c.lineTo(-0.1, 0.3); c.arc(0, 0.3, 0.1, Math.PI, 0); c.lineTo(0.1, 0.42); c.closePath(); c.fill();
    c.fillStyle = '#1b1d1c'; c.fillRect(-0.05, -0.02, 0.04, 0.12); c.fillRect(0.03, -0.02, 0.04, 0.12);
    bStripe(c, 0, -0.18, 0.46, 0.06, own);
    bBlock(c, 0, -0.42, 0.62, 0.1, 0.32, '#6f6b60');
    for (let i = -2; i <= 2; i++) { c.fillStyle = '#85816f'; c.fillRect(i * 0.13 - 0.04, -0.58, 0.08, 0.08); }
    bBlock(c, 0, -0.52, 0.3, 0.16, 0.16, '#5f6650', '#454b39');
    bFlag(c, 0.04, -0.7, 0.42, own);
    bSandbags(c, -0.9, 0.62, 0.5, 1); bSandbags(c, 0.45, 0.62, 0.5, 1);
  },
  pom(c, own) {
    bShadow(c, 0, 0.55, 1.0, 0.2);
    bTankH(c, -0.42, 0.06, 0.7, 0.17, '#b9bcbf', own);
    bTankH(c, -0.28, 0.4, 0.7, 0.17, '#b9bcbf', own);
    bTankV(c, 0.55, 0.44, 0.36, 0.72, '#c5c8ca', own);
    c.strokeStyle = '#6d7276'; c.lineWidth = 0.03;
    c.beginPath(); c.moveTo(0.2, 0.4); c.lineTo(0.38, 0.5); c.stroke();
    // pompa
    bBlock(c, 0.08, 0.66, 0.2, 0.26, 0.1, '#c8442f');
    c.fillStyle = '#f0f0ea'; c.fillRect(-0.0, 0.46, 0.16, 0.07);
    c.strokeStyle = '#222'; c.lineWidth = 0.014; c.beginPath(); c.moveTo(0.18, 0.56); c.quadraticCurveTo(0.3, 0.62, 0.26, 0.7); c.stroke();
    bBarrel(c, -0.78, 0.62, 0.14, '#d4742a'); bBarrel(c, -0.62, 0.66, 0.14, '#d4742a'); bBarrel(c, -0.7, 0.72, 0.14, '#b5532a');
    bFlag(c, 0.88, 0.42, 0.7, own);
  },
  pospemulihan(c, own) {
    bShadow(c, 0, 0.55, 1.0, 0.2);
    bBlock(c, -0.3, 0.36, 0.8, 0.44, 0.28, '#d9dad4', '#aeb3a6');
    bStripe(c, -0.3, -0.08, 0.8, 0.05, own);
    bCross(c, -0.3, 0.14, 0.12);
    bDoor(c, -0.58, 0.36, 0.12, 0.18);
    bWindows(c, -0.02, 0.3, 0.2, 0.14, 1, 1);
    bTent(c, 0.6, 0.54, 0.56, 0.42, '#e6e6dd');
    bCross(c, 0.6, 0.38, 0.09);
    bBlock(c, 0.1, 0.68, 0.34, 0.15, 0.1, '#e2e2dc');
    bCross(c, 0.1, 0.62, 0.05);
    c.fillStyle = '#222'; c.beginPath(); c.arc(-0.02, 0.69, 0.025, 0, Math.PI * 2); c.arc(0.22, 0.69, 0.025, 0, Math.PI * 2); c.fill();
    bFlag(c, -0.76, 0.32, 0.8, own);
  },
  benteng(c, own) {
    bShadow(c, 0, 0.58, 1.1, 0.2);
    bBlock(c, 0, 0.42, 1.3, 0.4, 0.26, '#8d8878');
    for (let i = -5; i <= 5; i++) { c.fillStyle = '#9d9887'; c.fillRect(i * 0.12 - 0.04, -0.07, 0.08, 0.08); }
    c.fillStyle = '#1b1d1c'; c.beginPath(); c.moveTo(-0.14, 0.42); c.lineTo(-0.14, 0.2); c.arc(0, 0.2, 0.14, Math.PI, 0); c.lineTo(0.14, 0.42); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(190,190,180,0.4)'; c.lineWidth = 0.012;
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 0.05, 0.42); c.lineTo(i * 0.05, 0.12); c.stroke(); }
    bStripe(c, 0, 0.0, 1.3, 0.05, own);
    [-0.74, 0.74].forEach(tx => {
      bTankV(c, tx, 0.48, 0.4, 0.86, '#9a9585');
      c.fillStyle = '#1b1d1c'; c.fillRect(tx - 0.03, 0.0, 0.06, 0.12);
      bCone(c, tx, -0.38, 0.5, 0.36, own);
    });
    bFlag(c, 0, 0.0, 0.62, own);
    bSandbags(c, -0.5, 0.68, 0.35, 1); bSandbags(c, 0.2, 0.68, 0.35, 1);
  },
};
// Tinggi (ruang satuan, relatif ke pusat) tempat bar HP dipasang
const BUILDING_HP_TOP = { markas: -0.95, barak: -0.5, garnisun: -0.78, pom: -0.5, pospemulihan: -0.5, benteng: -0.8 };

// ---------- Efek rusak: retakan, asap, api (berdasar sisa HP) ----------
function drawDamage(c, hpr, seed) {
  if (hpr >= 0.67) return;
  const rand = mulberry32((seed || 1) * 7919);
  c.save();
  c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 0.02; c.lineCap = 'round';
  const cracks = hpr < 0.34 ? 6 : 3;
  for (let i = 0; i < cracks; i++) {
    const x = -0.7 + rand() * 1.4, y = 0.0 + rand() * 0.5;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rand() - 0.5) * 0.18, y + 0.09); c.lineTo(x + (rand() - 0.5) * 0.2, y + 0.18); c.stroke();
  }
  for (let i = 0; i < 3; i++) {
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath(); c.ellipse(-0.6 + rand() * 1.2, 0.2 + rand() * 0.4, 0.16, 0.07, 0, 0, Math.PI * 2); c.fill();
  }
  const puffs = hpr < 0.34 ? 6 : 3;
  const sx = -0.2 + rand() * 0.4;
  for (let i = 0; i < puffs; i++) {
    c.fillStyle = 'rgba(40,40,40,' + (0.5 - i * 0.05) + ')';
    c.beginPath(); c.arc(sx + (rand() - 0.5) * 0.14 + i * 0.03, -0.35 - i * 0.14, 0.09 + i * 0.025, 0, Math.PI * 2); c.fill();
  }
  if (hpr < 0.34) {
    const g = c.createRadialGradient(sx, -0.2, 0.01, sx, -0.2, 0.22);
    g.addColorStop(0, 'rgba(255,200,80,0.95)'); g.addColorStop(0.5, 'rgba(255,100,30,0.7)'); g.addColorStop(1, 'rgba(255,60,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(sx, -0.2, 0.22, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

// ---------- Jembatan (di atas sungai): 1/2 tile garis lurus, 3 tile segitiga ----------
// Untuk jembatan 1 tile: arah dek = sumbu hex yang kedua tetangganya BUKAN sungai (tepian).
function bridgeAxisAngle(r, c) {
  const cnt = [0, 0, 0];
  const me = hexCenter(r, c);
  neighborsOf(r, c).forEach(([nr, nc]) => {
    const p = hexCenter(nr, nc);
    let k = Math.round(Math.atan2(p.y - me.y, p.x - me.x) / (Math.PI / 3));
    k = ((k % 6) + 6) % 6;
    if (mapData[nr][nc] === 'river') cnt[k % 3]++;
  });
  let best = 0;
  for (let i = 1; i < 3; i++) if (cnt[i] < cnt[best]) best = i;
  return best * Math.PI / 3;
}

function drawBridge(c, b, own, fp) {
  const S = HEX_SIZE, cs = fp.centers;
  let poly, pdx, pdy, qdx, qdy, rect = false;
  if (fp.n >= 3) {
    const mx = (cs[0].x + cs[1].x + cs[2].x) / 3, my = (cs[0].y + cs[1].y + cs[2].y) / 3;
    poly = cs.slice(0, 3).map(p => [mx + (p.x - mx) * 1.5, my + (p.y - my) * 1.5]);
    const ex = cs[1].x - cs[0].x, ey = cs[1].y - cs[0].y, el = Math.hypot(ex, ey) || 1;
    pdx = ex / el; pdy = ey / el; qdx = -pdy; qdy = pdx;
  } else {
    let ux, uy, ext;
    if (fp.n === 2) {
      const dx = cs[1].x - cs[0].x, dy = cs[1].y - cs[0].y, len = Math.hypot(dx, dy) || 1;
      ux = dx / len; uy = dy / len; ext = len / 2 + hexW * 0.48;
    } else {
      const a = bridgeAxisAngle(b.r, b.c); ux = Math.cos(a); uy = Math.sin(a); ext = hexW * 0.62;
    }
    const hw = S * 0.52, px = -uy, py = ux;
    poly = [
      [fp.cx - ux * ext - px * hw, fp.cy - uy * ext - py * hw], [fp.cx + ux * ext - px * hw, fp.cy + uy * ext - py * hw],
      [fp.cx + ux * ext + px * hw, fp.cy + uy * ext + py * hw], [fp.cx - ux * ext + px * hw, fp.cy - uy * ext + py * hw],
    ];
    pdx = px; pdy = py; qdx = ux; qdy = uy; rect = true;
  }
  const path = () => { c.beginPath(); poly.forEach(([x, y], i) => i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)); c.closePath(); };
  c.save(); c.lineJoin = 'round';
  c.translate(1.5, 4); path(); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill(); c.restore();      // bayangan di air
  c.save(); c.translate(0, 2.6); path(); c.fillStyle = '#463420'; c.fill(); c.lineWidth = 1; c.strokeStyle = '#463420'; c.stroke(); c.restore(); // tebal dek
  path();
  const g = c.createLinearGradient(fp.cx - S, fp.cy - S, fp.cx + S, fp.cy + S);
  g.addColorStop(0, '#b08b5c'); g.addColorStop(1, '#8a6a43'); c.fillStyle = g; c.fill();
  // papan dek
  c.save(); path(); c.clip();
  let qmin = Infinity, qmax = -Infinity;
  poly.forEach(([x, y]) => { const q = (x - fp.cx) * qdx + (y - fp.cy) * qdy; qmin = Math.min(qmin, q); qmax = Math.max(qmax, q); });
  c.strokeStyle = 'rgba(50,32,16,0.55)'; c.lineWidth = 0.7;
  for (let q = qmin + 1.6; q < qmax; q += 3.2) {
    const ox = fp.cx + qdx * q, oy = fp.cy + qdy * q;
    c.beginPath(); c.moveTo(ox - pdx * 80, oy - pdy * 80); c.lineTo(ox + pdx * 80, oy + pdy * 80); c.stroke();
  }
  c.restore();
  // pagar
  c.strokeStyle = '#4d3a23'; c.lineWidth = 1.5; c.lineCap = 'round';
  if (rect) {
    c.beginPath(); c.moveTo(poly[0][0], poly[0][1]); c.lineTo(poly[1][0], poly[1][1]); c.moveTo(poly[2][0], poly[2][1]); c.lineTo(poly[3][0], poly[3][1]); c.stroke();
  } else { path(); c.stroke(); }
  // tiang + aksen warna pemilik di sudut
  poly.forEach(([x, y]) => {
    c.fillStyle = '#3a2b19'; c.beginPath(); c.arc(x, y, 1.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = own; c.beginPath(); c.arc(x, y - 1.6, 1.15, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 0.4; c.stroke();
  });
}

// ---------- Gambar 1 bangunan lengkap (menimpa versi lama) ----------
function drawBuildingFull(b, p, opt) {
  opt = opt || {};
  const fp = fpInfo(buildingTiles(b)), own = p.color, def = BUILDING_TYPES[b.type];
  if (!def) return;
  const u = fpUnit(fp.n);
  const hpr = isFinite(def.hp) ? Math.max(0, Math.min(1, b.hp / def.hp)) : 1;
  ctx.save();
  if (b.type === 'jembatan') {
    drawBridge(ctx, b, own, fp);
    if (hpr < 0.67) { ctx.translate(fp.cx, fp.cy); ctx.scale(u, u); drawDamage(ctx, hpr, b.seq); }
  } else {
    drawFootprintPad(ctx, fp, BUILDING_PAD[b.type] || '#777');
    const art = BUILDING_ART[b.type];
    if (art) {
      ctx.translate(fp.cx, fp.cy + u * 0.05); ctx.scale(u, u);
      art(ctx, own, fp);
      drawDamage(ctx, hpr, b.seq);
    }
  }
  ctx.restore();
  if (opt.noBar) return;
  const top = b.type === 'jembatan' ? fp.cy - HEX_SIZE * 0.55 : fp.cy + u * 0.05 + u * (BUILDING_HP_TOP[b.type] || -0.6);
  drawHpBar(fp.cx, top, b.hp, def.hp, players[HUMAN].buildings.includes(b));
  // highlight target serang / supply di atas bangunan
  fp.tiles.forEach(([r, c]) => {
    const atk = attackMode && attackable.some(t => t.r === r && t.c === c);
    const spc = specialMode && specialTargets.some(t => t.r === r && t.c === c);
    if (!atk && !spc) return;
    const h = hexCenter(r, c), pts = hexCorners(h.x, h.y, HEX_SIZE - 0.6);
    ctx.beginPath(); pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); ctx.closePath();
    ctx.fillStyle = atk ? 'rgba(255,60,60,0.38)' : 'rgba(80,180,255,0.38)'; ctx.fill();
    ctx.strokeStyle = atk ? '#ff5252' : '#58b4ff'; ctx.lineWidth = 1.6 / scale; ctx.stroke();
  });
}
// Kompatibel dengan pemanggil lama: drawBuildingSprite(b, warna, x, y)
function drawBuildingSprite(b, ownerColor) {
  const p = players.find(pl => pl.buildings.includes(b)) || { color: ownerColor };
  drawBuildingFull(b, p);
}

// ---------- Lokasi konstruksi: bayangan bangunan + perancah + sisa giliran ----------
function drawConstructionSite(u, p) {
  const def = BUILDING_TYPES[u.buildType]; if (!def) return;
  const { x, y } = hexCenter(u.r, u.c), S = HEX_SIZE;
  ctx.save(); ctx.globalAlpha = 0.4;
  const bt = u.buildTiles || [[u.r, u.c]];
  if (u.buildType !== 'renov') drawBuildingFull({ r: bt[0][0], c: bt[0][1], tiles: bt, type: u.buildType, hp: def.hp, seq: 0 }, p, { noBar: true });   // Renov = aksi, tanpa bayangan bangunan
  ctx.restore();
  ctx.save();
  ctx.setLineDash([4 / scale, 3 / scale]); ctx.strokeStyle = p.color; ctx.lineWidth = 1.6 / scale;
  ctx.beginPath(); hexCorners(x, y, S - 1.5).forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)); ctx.closePath(); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#c9a86a'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
  const px1 = x - S * 0.55, px2 = x + S * 0.55, base = y + S * 0.35, top = y - S * 0.7;
  ctx.beginPath(); ctx.moveTo(px1, base); ctx.lineTo(px1, top); ctx.moveTo(px2, base); ctx.lineTo(px2, top);
  ctx.moveTo(px1, y - S * 0.05); ctx.lineTo(px2, y - S * 0.05); ctx.moveTo(px1, top); ctx.lineTo(px2, top);
  ctx.moveTo(px1, base); ctx.lineTo(px2, y - S * 0.05); ctx.stroke();
  const bx = x + S * 0.62, by = y - S * 0.75, r = S * 0.3;
  ctx.fillStyle = '#ffcc00'; ctx.strokeStyle = '#222'; ctx.lineWidth = 1 / scale;
  ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#222'; ctx.font = 'bold ' + (r * 1.4) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(Math.max(0, u.buildTurnsRemaining || 0)), bx, by + r * 0.06);
  ctx.restore();
}

// ---------- Lapisan entitas: bangunan (urut y) lalu unit — dipanggil dari draw() ----------
function drawEntityLayers() {
  const margin = HEX_SIZE * 5 * scale;
  const onScreen = (wx, wy) => {
    const sx = wx * scale + camX, sy = wy * scale + camY;
    return sx > -margin && sx < canvas.width + margin && sy > -margin && sy < canvas.height + margin;
  };
  const list = [];
  players.forEach(p => p.buildings.forEach(b => list.push({ b, p, fp: fpInfo(buildingTiles(b)) })));
  units.forEach(u => {
    if (u.isBuilding && u.buildType && u.buildType !== 'markas' && isVisibleToCurrentPlayer(u)) {
      const p = players[u.owner];
      list.push({ site: u, p, fp: fpInfo(u.buildTiles || [[u.r, u.c]]), b: { type: 'zzz' } });
    }
  });
  list.sort((a, c) => ((a.b.type === 'jembatan' ? 0 : 1) - (c.b.type === 'jembatan' ? 0 : 1)) || (a.fp.cy - c.fp.cy));
  for (const e of list) {
    if (!onScreen(e.fp.cx, e.fp.cy)) continue;
    if (e.site) drawConstructionSite(e.site, e.p); else drawBuildingFull(e.b, e.p);
  }
  markasSites.forEach(s => {
    if (s.owner !== HUMAN) return;
    const h = hexCenter(s.r, s.c);
    if (onScreen(h.x, h.y)) drawSiteMarker(s, h.x, h.y);
  });

  // unit: urut baris supaya yang di depan menimpa yang di belakang; 1 unit tergambar per hex
  const seen = new Set();
  units.slice().sort((a, c) => a.r - c.r).forEach(u => {
    const k = u.r + ',' + u.c;
    if (seen.has(k)) return;
    seen.add(k);
    const { x, y } = hexCenter(u.r, u.c);
    if (!onScreen(x, y)) return;
    if (!isVisibleToCurrentPlayer(u) || (moveAnim && moveAnim.unitId === u.id)) return;
    drawUnitSprite(u, x, y);
  });
}
