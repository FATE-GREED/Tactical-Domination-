// ====================================================================
// unit-art.js — Grafik unit (dibawa dari v7): regu tentara / tank / APC digambar
// langsung di atas tile, bukan kotak berikon. Dimuat setelah render-fx.js.
// ====================================================================
// ====================================================================
// Render unit "nyata" (bukan ikon flat di kotak lagi): regu tentara /
// tank / APC digambar langsung berdiri di atas tile, tanpa kotak/garis
// tepi warna pemilik. Identitas pemilik ditunjukkan lewat bar HP di atas
// unit (bukan warna badan unit itu sendiri, yang tetap warna seragam asli).
// ====================================================================

// ---------- 1 tentara (dipakai berulang 2-3x per unit infanteri) ----------
function drawSoldier(c, x, y, s, opt) {
  opt = opt || {};
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = s * 0.15; c.shadowOffsetY = s * 0.04;
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath(); c.ellipse(x, y + s * 0.46, s * 0.17, s * 0.05, 0, 0, Math.PI * 2); c.fill();
  c.restore();

  const bodyColor = opt.bodyColor || '#5c6b4a';
  const pantsColor = opt.pantsColor || bodyColor;
  const skinColor = opt.skinColor || '#d8b48a';

  c.strokeStyle = pantsColor; c.lineWidth = s * 0.08; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x - s * 0.06, y + s * 0.18); c.lineTo(x - s * 0.1, y + s * 0.44); c.stroke();
  c.strokeStyle = shiftColor(pantsColor, -30);
  c.beginPath(); c.moveTo(x + s * 0.06, y + s * 0.18); c.lineTo(x + s * 0.1, y + s * 0.44); c.stroke();
  c.fillStyle = '#1c1c1c';
  c.beginPath(); c.ellipse(x - s * 0.1, y + s * 0.46, s * 0.05, s * 0.025, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(x + s * 0.1, y + s * 0.46, s * 0.05, s * 0.025, 0, 0, Math.PI * 2); c.fill();

  const bodyGrad = c.createLinearGradient(x - s * 0.14, y, x + s * 0.14, y);
  bodyGrad.addColorStop(0, shiftColor(bodyColor, 20));
  bodyGrad.addColorStop(1, shiftColor(bodyColor, -25));
  c.fillStyle = bodyGrad;
  c.beginPath();
  c.moveTo(x - s * 0.14, y + s * 0.2); c.lineTo(x - s * 0.1, y - s * 0.1); c.lineTo(x + s * 0.1, y - s * 0.1); c.lineTo(x + s * 0.14, y + s * 0.2);
  c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = s * 0.012;
  c.beginPath(); c.moveTo(x - s * 0.13, y + s * 0.17); c.lineTo(x - s * 0.1, y - s * 0.08); c.stroke();

  if (opt.backpack) {
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(x - s * 0.17, y - s * 0.08, s * 0.09, s * 0.2);
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(x - s * 0.17, y - s * 0.08, s * 0.02, s * 0.2);
  }
  if (opt.armor) {
    const ag = c.createLinearGradient(x - s * 0.08, y, x + s * 0.08, y);
    ag.addColorStop(0, '#9aa0a6'); ag.addColorStop(1, '#5a6065');
    c.fillStyle = ag;
    c.fillRect(x - s * 0.08, y - s * 0.02, s * 0.16, s * 0.1);
    c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = s * 0.01; c.strokeRect(x - s * 0.08, y - s * 0.02, s * 0.16, s * 0.1);
  }

  c.strokeStyle = opt.ninja ? '#262822' : skinColor; c.lineWidth = s * 0.045; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x - s * 0.09, y - s * 0.04); c.lineTo(x - s * 0.2, y + s * 0.06); c.stroke();
  c.beginPath(); c.moveTo(x + s * 0.09, y - s * 0.04); c.lineTo(x + s * 0.2, y + s * 0.06); c.stroke();

  if (opt.ninja) {
    const hg = c.createRadialGradient(x - s * 0.03, y - s * 0.23, s * 0.02, x, y - s * 0.2, s * 0.13);
    hg.addColorStop(0, '#2e2e2a'); hg.addColorStop(1, '#111110');
    c.fillStyle = hg;
    c.beginPath(); c.arc(x, y - s * 0.2, s * 0.11, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#eee';
    c.beginPath(); c.ellipse(x - s * 0.035, y - s * 0.21, s * 0.025, s * 0.015, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(x + s * 0.035, y - s * 0.21, s * 0.025, s * 0.015, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#111';
    c.beginPath(); c.arc(x - s * 0.035, y - s * 0.21, s * 0.01, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + s * 0.035, y - s * 0.21, s * 0.01, 0, Math.PI * 2); c.fill();
  } else if (opt.covered) {
    const hg = c.createRadialGradient(x - s * 0.03, y - s * 0.23, s * 0.02, x, y - s * 0.2, s * 0.14);
    hg.addColorStop(0, '#555c4e'); hg.addColorStop(1, '#272b22');
    c.fillStyle = hg;
    c.beginPath(); c.ellipse(x, y - s * 0.2, s * 0.1, s * 0.12, 0, 0, Math.PI * 2); c.fill();
    if (opt.eyes) {
      c.fillStyle = '#fff';
      c.beginPath(); c.ellipse(x - s * 0.035, y - s * 0.21, s * 0.022, s * 0.013, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(x + s * 0.035, y - s * 0.21, s * 0.022, s * 0.013, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1a1a1a';
      c.beginPath(); c.arc(x - s * 0.035, y - s * 0.21, s * 0.008, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + s * 0.035, y - s * 0.21, s * 0.008, 0, Math.PI * 2); c.fill();
    }
  } else {
    const hg = c.createRadialGradient(x - s * 0.03, y - s * 0.23, s * 0.02, x, y - s * 0.2, s * 0.12);
    hg.addColorStop(0, shiftColor(skinColor, 15)); hg.addColorStop(1, shiftColor(skinColor, -20));
    c.fillStyle = hg;
    c.beginPath(); c.arc(x, y - s * 0.2, s * 0.1, 0, Math.PI * 2); c.fill();
    if (opt.mask) {
      c.fillStyle = '#2a2a2a';
      c.beginPath(); c.moveTo(x - s * 0.09, y - s * 0.17); c.lineTo(x + s * 0.09, y - s * 0.17); c.lineTo(x, y - s * 0.04); c.closePath(); c.fill();
      c.fillStyle = '#1a1a1a';
      c.beginPath(); c.arc(x - s * 0.04, y - s * 0.22, s * 0.014, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + s * 0.04, y - s * 0.22, s * 0.014, 0, Math.PI * 2); c.fill();
    }
  }

  if (opt.weapon && opt.weapon !== 'none') {
    c.fillStyle = opt.ninja ? '#262822' : skinColor;
    c.beginPath(); c.arc(x - s * 0.2, y + s * 0.06, s * 0.03, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + s * 0.2, y + s * 0.06, s * 0.03, 0, Math.PI * 2); c.fill();
  }

  c.strokeStyle = '#1c1c1a'; c.lineWidth = s * 0.045; c.lineCap = 'round';
  if (opt.weapon === 'rifle') {
    c.beginPath(); c.moveTo(x + s * 0.1, y - s * 0.02); c.lineTo(x + s * 0.32, y + s * 0.1); c.stroke();
    c.fillStyle = '#1c1c1a'; c.beginPath(); c.moveTo(x + s * 0.22, y + s * 0.03); c.lineTo(x + s * 0.27, y + s * 0.16); c.lineTo(x + s * 0.2, y + s * 0.1); c.closePath(); c.fill();
  } else if (opt.weapon === 'pistols') {
    c.lineWidth = s * 0.035;
    c.beginPath(); c.moveTo(x + s * 0.2, y + s * 0.06); c.lineTo(x + s * 0.3, y + s * 0.12); c.stroke();
    c.beginPath(); c.moveTo(x - s * 0.2, y + s * 0.06); c.lineTo(x - s * 0.3, y + s * 0.12); c.stroke();
  } else if (opt.weapon === 'sniperRifle') {
    c.lineWidth = s * 0.04;
    c.beginPath(); c.moveTo(x + s * 0.1, y - s * 0.08); c.lineTo(x + s * 0.48, y + s * 0.1); c.stroke();
    c.fillStyle = '#1c1c1a'; c.beginPath(); c.arc(x + s * 0.3, y, s * 0.03, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(120,160,200,0.6)'; c.lineWidth = s * 0.012;
    c.beginPath(); c.arc(x + s * 0.3, y, s * 0.025, 0, Math.PI * 2); c.stroke();
  } else if (opt.weapon === 'bazooka') {
    const bg = c.createLinearGradient(x, y - s * 0.3, x + s * 0.3, y);
    bg.addColorStop(0, '#5a5a50'); bg.addColorStop(1, '#333330');
    c.strokeStyle = bg; c.lineWidth = s * 0.13;
    c.beginPath(); c.moveTo(x - s * 0.05, y - s * 0.22); c.lineTo(x + s * 0.35, y - s * 0.05); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = s * 0.02;
    c.beginPath(); c.moveTo(x - s * 0.05, y - s * 0.26); c.lineTo(x + s * 0.35, y - s * 0.09); c.stroke();
  }
}

// ---------- Tank (Tank Lapis Baja & Tank Crusher, beda proporsi via opt) ----------
function drawTank(c, x, y, s, opt) {
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = s * 0.15;
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath(); c.ellipse(x, y + s * 0.3, s * opt.hullW * 0.55, s * 0.07, 0, 0, Math.PI * 2); c.fill();
  c.restore();

  const g = c.createLinearGradient(x, y - s * opt.hullH * 0.5, x, y + s * opt.hullH * 0.5);
  g.addColorStop(0, '#7a8268'); g.addColorStop(0.5, '#565d47'); g.addColorStop(1, '#333a28');

  c.fillStyle = '#1c1c1a';
  c.fillRect(x - s * opt.hullW * 0.5, y + s * 0.1, s * opt.hullW, s * 0.16);
  const wheelCount = Math.round(opt.hullW * 4);
  for (let i = 0; i < wheelCount; i++) {
    const wx = x - s * opt.hullW * 0.5 + s * opt.hullW * (i + 0.5) / wheelCount;
    c.fillStyle = '#3a3a36';
    c.beginPath(); c.arc(wx, y + s * 0.18, s * 0.06, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#161614';
    c.beginPath(); c.arc(wx, y + s * 0.18, s * 0.025, 0, Math.PI * 2); c.fill();
  }

  c.fillStyle = g;
  c.fillRect(x - s * opt.hullW * 0.5, y - s * opt.hullH * 0.5, s * opt.hullW, s * opt.hullH);
  c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = s * 0.012;
  for (let i = 1; i < 4; i++) {
    const px = x - s * opt.hullW * 0.5 + s * opt.hullW * i / 4;
    c.beginPath(); c.moveTo(px, y - s * opt.hullH * 0.5); c.lineTo(px, y + s * 0.1); c.stroke();
  }
  c.strokeStyle = 'rgba(255,255,255,0.15)'; c.lineWidth = s * 0.015;
  c.beginPath(); c.moveTo(x - s * opt.hullW * 0.5, y - s * opt.hullH * 0.45); c.lineTo(x + s * opt.hullW * 0.5, y - s * opt.hullH * 0.45); c.stroke();

  const tg = c.createRadialGradient(x + opt.turretX * s - s * 0.05, y - s * opt.hullH * 0.5 - s * 0.05, s * 0.02, x + opt.turretX * s, y - s * opt.hullH * 0.5, s * opt.turretR);
  tg.addColorStop(0, '#8a9278'); tg.addColorStop(1, '#454c38');
  c.fillStyle = tg;
  c.beginPath(); c.ellipse(x + opt.turretX * s, y - s * opt.hullH * 0.5, s * opt.turretR, s * opt.turretR * 0.7, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = s * 0.012;
  c.beginPath(); c.ellipse(x + opt.turretX * s, y - s * opt.hullH * 0.5, s * opt.turretR, s * opt.turretR * 0.7, 0, 0, Math.PI * 2); c.stroke();

  opt.barrels.forEach((dy) => {
    const bg = c.createLinearGradient(x, y, x + s * opt.barrelLen, y);
    bg.addColorStop(0, '#6a7258'); bg.addColorStop(1, '#2e3324');
    c.strokeStyle = bg; c.lineCap = 'round';
    c.lineWidth = s * opt.barrelW;
    c.beginPath(); c.moveTo(x + opt.turretX * s, y - s * opt.hullH * 0.5 + dy * s);
    c.lineTo(x + opt.turretX * s + s * opt.barrelLen, y - s * opt.hullH * 0.5 + dy * s); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = s * opt.barrelW * 0.25;
    c.beginPath(); c.moveTo(x + opt.turretX * s, y - s * opt.hullH * 0.5 + dy * s - s * opt.barrelW * 0.3);
    c.lineTo(x + opt.turretX * s + s * opt.barrelLen, y - s * opt.hullH * 0.5 + dy * s - s * opt.barrelW * 0.3); c.stroke();
  });
}

// ---------- APC (tampak samping, V-hull) ----------
function drawAPCUnit(c, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 0.1;
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath(); c.ellipse(0, 0.42, 0.62, 0.08, 0, 0, Math.PI * 2); c.fill();
  c.restore();
  const bodyGrad = c.createLinearGradient(-0.5, -0.3, 0.5, 0.2);
  bodyGrad.addColorStop(0, '#7e866c'); bodyGrad.addColorStop(0.5, '#565d47'); bodyGrad.addColorStop(1, '#333a28');
  c.fillStyle = bodyGrad;
  c.beginPath();
  c.moveTo(-0.58, 0.05); c.lineTo(-0.58, -0.18); c.lineTo(-0.28, -0.34); c.lineTo(0.12, -0.34);
  c.lineTo(0.32, -0.16); c.lineTo(0.5, 0.0); c.lineTo(0.62, 0.16); c.lineTo(0.52, 0.22); c.lineTo(-0.58, 0.22);
  c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = 0.012;
  c.beginPath(); c.moveTo(-0.56, -0.15); c.lineTo(-0.26, -0.3); c.stroke();
  c.fillStyle = 'rgba(10,18,22,0.9)';
  c.fillRect(-0.22, -0.26, 0.14, 0.1); c.fillRect(-0.02, -0.26, 0.14, 0.1);
  c.fillStyle = 'rgba(180,210,230,0.3)';
  c.fillRect(-0.22, -0.26, 0.14, 0.025); c.fillRect(-0.02, -0.26, 0.14, 0.025);
  c.fillStyle = 'rgba(255,220,150,0.95)';
  c.beginPath(); c.arc(-0.34, 0.45, 0.045, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(0.34, 0.45, 0.045, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#161614';
  [-0.42, -0.14, 0.14, 0.42].forEach(wx => { c.beginPath(); c.arc(wx, 0.3, 0.14, 0, Math.PI * 2); c.fill(); });
  c.fillStyle = '#4a4a46';
  [-0.42, -0.14, 0.14, 0.42].forEach(wx => { c.beginPath(); c.arc(wx, 0.3, 0.065, 0, Math.PI * 2); c.fill(); });
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.02;
  c.beginPath(); c.moveTo(0, -0.02); c.lineTo(0, 0.55); c.stroke();
  c.restore();
}

// ---------- Alat Montir (dipegang 2 tentara) ----------
function drawMontirRig(c, x, y, s) {
  c.save(); c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = s * 0.1;
  const g = c.createLinearGradient(x - s * 0.1, y, x + s * 0.1, y);
  g.addColorStop(0, '#5a5a4e'); g.addColorStop(1, '#333330');
  c.fillStyle = g;
  c.fillRect(x - s * 0.06, y - s * 0.3, s * 0.12, s * 0.4);
  c.beginPath(); c.moveTo(x - s * 0.1, y - s * 0.3); c.lineTo(x + s * 0.1, y - s * 0.3); c.lineTo(x, y - s * 0.45); c.closePath(); c.fill();
  c.fillStyle = '#1c1c1a'; c.fillRect(x - s * 0.14, y + s * 0.08, s * 0.28, s * 0.08);
  c.restore();
}

// ---------- Dispatch per tipe unit: gambar unit LENGKAP (bukan 1 ikon) di (x,y) ----------
// ---------- v9.7: Trapper (2 tentara: pembawa tas bom + penekan pemicu) ----------
function drawBombBagCarrier(c, x, y, s) {
  drawSoldier(c, x, y, s, { weapon: 'none', bodyColor: '#7a5238', pantsColor: '#3b3226' });
  // tali tas melintang di dada
  c.strokeStyle = '#4a3420'; c.lineWidth = s * 0.03; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x + s * 0.08, y - s * 0.09); c.lineTo(x - s * 0.12, y + s * 0.12); c.stroke();
  // tas bom di sisi kiri badan
  const bx = x - s * 0.31, by = y - s * 0.1, bw = s * 0.22, bh = s * 0.3;
  const bg = c.createLinearGradient(bx, by, bx + bw, by + bh);
  bg.addColorStop(0, '#a98450'); bg.addColorStop(1, '#6e5128');
  c.fillStyle = bg;
  c.beginPath();
  if (c.roundRect) c.roundRect(bx, by, bw, bh, s * 0.04); else c.rect(bx, by, bw, bh);
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = s * 0.012; c.stroke();
  c.fillStyle = '#5a4020';                                    // tutup tas
  c.fillRect(bx, by, bw, bh * 0.28);
  c.fillStyle = '#c0352b';                                    // pita merah penanda bahan peledak
  c.fillRect(bx, by + bh * 0.55, bw, bh * 0.14);
  // dua bom menyembul dari tas (+ sumbu)
  for (const [ox, oy] of [[0.3, -0.03], [0.68, -0.07]]) {
    const cx = bx + bw * ox, cy = by + oy * bh;
    c.fillStyle = '#1f2226'; c.beginPath(); c.arc(cx, cy, s * 0.062, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(cx - s * 0.02, cy - s * 0.02, s * 0.018, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#d6c08f'; c.lineWidth = s * 0.014;
    c.beginPath(); c.moveTo(cx + s * 0.01, cy - s * 0.06); c.quadraticCurveTo(cx + s * 0.05, cy - s * 0.12, cx + s * 0.08, cy - s * 0.09); c.stroke();
    c.fillStyle = '#ff7a3a'; c.beginPath(); c.arc(cx + s * 0.08, cy - s * 0.09, s * 0.014, 0, Math.PI * 2); c.fill();
  }
}
function drawDetonatorOperator(c, x, y, s) {
  const skin = '#d8b48a';
  drawSoldier(c, x, y, s, { weapon: 'none', bodyColor: '#7a5238', pantsColor: '#3b3226' });
  // kotak pemicu merah di depan badan
  const bw = s * 0.4, bh = s * 0.17, bx = x - bw / 2, by = y + s * 0.3;
  const rg = c.createLinearGradient(bx, by, bx, by + bh);
  rg.addColorStop(0, '#e24336'); rg.addColorStop(1, '#8e1d16');
  c.fillStyle = rg; c.fillRect(bx, by, bw, bh);
  c.strokeStyle = '#4d0e0a'; c.lineWidth = s * 0.014; c.strokeRect(bx, by, bw, bh);
  c.fillStyle = 'rgba(255,255,255,0.28)'; c.fillRect(bx + s * 0.01, by + s * 0.01, bw - s * 0.02, s * 0.025);
  c.fillStyle = '#ffd24a'; c.fillRect(bx + bw * 0.08, by + bh * 0.45, s * 0.04, s * 0.04);    // lampu indikator
  // tuas (batang) + stir di atasnya, sedang ditekan ke bawah
  const topY = y + s * 0.19;
  c.strokeStyle = '#3a3a3a'; c.lineWidth = s * 0.04; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x, by); c.lineTo(x, topY + s * 0.02); c.stroke();
  c.strokeStyle = '#1f1f1f'; c.lineWidth = s * 0.03;
  c.beginPath(); c.ellipse(x, topY, s * 0.15, s * 0.05, 0, 0, Math.PI * 2); c.stroke();      // lingkar stir
  c.lineWidth = s * 0.02;
  c.beginPath(); c.moveTo(x - s * 0.15, topY); c.lineTo(x + s * 0.15, topY); c.stroke();    // jari-jari stir
  c.beginPath(); c.moveTo(x, topY - s * 0.05); c.lineTo(x, topY + s * 0.05); c.stroke();
  c.fillStyle = '#c0c4c9'; c.beginPath(); c.arc(x, topY, s * 0.025, 0, Math.PI * 2); c.fill();
  // lengan menekan stir ke bawah + tangan
  c.strokeStyle = skin; c.lineWidth = s * 0.045; c.lineCap = 'round';
  for (const sg of [-1, 1]) {
    c.beginPath(); c.moveTo(x + sg * s * 0.09, y - s * 0.04); c.lineTo(x + sg * s * 0.13, y + s * 0.08); c.lineTo(x + sg * s * 0.14, topY - s * 0.01); c.stroke();
    c.fillStyle = skin; c.beginPath(); c.arc(x + sg * s * 0.14, topY - s * 0.01, s * 0.032, 0, Math.PI * 2); c.fill();
  }
  // panah kecil: stir ditekan ke bawah
  c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = s * 0.014;
  c.beginPath(); c.moveTo(x + s * 0.26, topY - s * 0.1); c.lineTo(x + s * 0.26, topY + s * 0.02);
  c.moveTo(x + s * 0.23, topY - s * 0.02); c.lineTo(x + s * 0.26, topY + s * 0.025); c.lineTo(x + s * 0.29, topY - s * 0.02); c.stroke();
}
function drawTrapperUnit(c, x, y, s) {
  const lx = x - s * 0.3, rx = x + s * 0.3, ly = y + s * 0.05, ry = y + s * 0.05, s1 = s * 0.95;
  drawBombBagCarrier(c, lx, ly, s1);
  // kabel dari kotak pemicu ke tas bom
  c.strokeStyle = '#1c1c1c'; c.lineWidth = s * 0.022; c.lineCap = 'round';
  c.beginPath(); c.moveTo(rx - s1 * 0.2, ry + s1 * 0.4); c.quadraticCurveTo(x, y + s * 0.66, lx - s1 * 0.2, ly + s1 * 0.2); c.stroke();
  c.strokeStyle = '#c0352b'; c.lineWidth = s * 0.008;
  c.beginPath(); c.moveTo(rx - s1 * 0.2, ry + s1 * 0.4); c.quadraticCurveTo(x, y + s * 0.66, lx - s1 * 0.2, ly + s1 * 0.2); c.stroke();
  drawDetonatorOperator(c, rx, ry, s1);
}

// ---------- v9.7: varian Advanced = sprite dasar + garis emas + selubung cahaya emas ----------
// Dirender sekali ke canvas offscreen (cache) lalu digambar ulang, jadi murah di tiap frame.
const ADV_S0 = 96, ADV_CACHE = {};
function advancedSprite(key, baseFn) {
  if (ADV_CACHE[key]) return ADV_CACHE[key];
  const W = Math.round(ADV_S0 * 2.4), H = Math.round(ADV_S0 * 1.9);
  const ox = W / 2, oy = Math.round(ADV_S0 * 1.02);
  const mk = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; return cv; };
  const base = mk(); baseFn(base.getContext('2d'), ox, oy, ADV_S0);
  const sil = mk(); { const sc = sil.getContext('2d'); sc.drawImage(base, 0, 0); sc.globalCompositeOperation = 'source-in'; sc.fillStyle = '#ffd24a'; sc.fillRect(0, 0, W, H); }
  const out = mk(), c = out.getContext('2d');
  // halo cahaya emas lembut di belakang unit
  const hg = c.createRadialGradient(ox, oy - ADV_S0 * 0.05, ADV_S0 * 0.1, ox, oy - ADV_S0 * 0.05, ADV_S0 * 0.95);
  hg.addColorStop(0, 'rgba(255,225,120,0.38)'); hg.addColorStop(0.6, 'rgba(255,200,70,0.16)'); hg.addColorStop(1, 'rgba(255,190,60,0)');
  c.fillStyle = hg; c.fillRect(0, 0, W, H);
  // pendar emas mengikuti siluet
  c.save(); c.shadowColor = 'rgba(255,205,70,0.95)'; c.shadowBlur = ADV_S0 * 0.14; c.drawImage(sil, 0, 0); c.restore();
  // garis tepi emas
  const R = ADV_S0 * 0.026;
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; c.drawImage(sil, Math.cos(a) * R, Math.sin(a) * R); }
  // sprite dasar di atas
  c.drawImage(base, 0, 0);
  // lapisan kilau emas tipis di atas sprite (hanya pada area unit)
  const sh = mk(); { const sc = sh.getContext('2d'); sc.drawImage(base, 0, 0); sc.globalCompositeOperation = 'source-atop';
    const g = sc.createLinearGradient(0, oy - ADV_S0 * 0.6, W, oy + ADV_S0 * 0.6);
    g.addColorStop(0, 'rgba(255,230,140,0.38)'); g.addColorStop(0.5, 'rgba(255,200,70,0.10)'); g.addColorStop(1, 'rgba(255,225,130,0.34)');
    sc.fillStyle = g; sc.fillRect(0, 0, W, H); }
  c.drawImage(sh, 0, 0);
  // kilatan bintang kecil
  c.fillStyle = 'rgba(255,248,210,0.95)';
  for (const [dx, dy, r] of [[-0.62, -0.5, 0.05], [0.58, -0.38, 0.04], [0.05, -0.68, 0.045]]) {
    const px = ox + dx * ADV_S0, py = oy + dy * ADV_S0, rr = r * ADV_S0;
    c.beginPath(); c.moveTo(px, py - rr * 1.8); c.lineTo(px + rr * 0.4, py - rr * 0.4); c.lineTo(px + rr * 1.8, py); c.lineTo(px + rr * 0.4, py + rr * 0.4);
    c.lineTo(px, py + rr * 1.8); c.lineTo(px - rr * 0.4, py + rr * 0.4); c.lineTo(px - rr * 1.8, py); c.lineTo(px - rr * 0.4, py - rr * 0.4); c.closePath(); c.fill();
  }
  out.ox = ox; out.oy = oy;
  ADV_CACHE[key] = out;
  return out;
}
function drawAdvanced(c, x, y, s, key, baseFn) {
  const cv = advancedSprite(key, baseFn), k = s / ADV_S0;
  c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(cv, x - cv.ox * k, y - cv.oy * k, cv.width * k, cv.height * k);
  c.restore();
}

const UNIT_RENDERERS = {
  infantry(c, x, y, s) {
    drawSoldier(c, x - s * 0.28, y + s * 0.12, s * 0.8, { weapon: 'rifle', bodyColor: '#7a9c52', pantsColor: '#5e7a40' });
    drawSoldier(c, x + s * 0.28, y + s * 0.12, s * 0.8, { weapon: 'rifle', bodyColor: '#7a9c52', pantsColor: '#5e7a40' });
    drawSoldier(c, x, y - s * 0.18, s * 0.88, { weapon: 'rifle', bodyColor: '#7a9c52', pantsColor: '#5e7a40' });
  },
  assault(c, x, y, s) {
    const opt = { weapon: 'pistols', mask: true, bodyColor: '#3a4232', pantsColor: '#4a5240' };
    drawSoldier(c, x - s * 0.28, y + s * 0.12, s * 0.8, opt);
    drawSoldier(c, x + s * 0.28, y + s * 0.12, s * 0.8, opt);
    drawSoldier(c, x, y - s * 0.18, s * 0.88, opt);
  },
  sniper(c, x, y, s) {
    const opt = { weapon: 'sniperRifle', covered: true, eyes: true, bodyColor: '#3a3f35' };
    drawSoldier(c, x - s * 0.28, y + s * 0.12, s * 0.8, opt);
    drawSoldier(c, x + s * 0.28, y + s * 0.12, s * 0.8, opt);
    drawSoldier(c, x, y - s * 0.18, s * 0.88, opt);
  },
  antitank(c, x, y, s) {
    const opt = { weapon: 'bazooka', armor: true, bodyColor: '#5a5a52' };
    drawSoldier(c, x - s * 0.28, y + s * 0.12, s * 0.8, opt);
    drawSoldier(c, x + s * 0.28, y + s * 0.12, s * 0.8, opt);
    drawSoldier(c, x, y - s * 0.18, s * 0.88, opt);
  },
  tanklapis(c, x, y, s) {
    drawTank(c, x, y, s, { hullW: 1.1, hullH: 0.5, turretR: 0.3, turretX: -0.05, barrels: [0], barrelW: 0.14, barrelLen: 0.35 });
  },
  tankcrusher(c, x, y, s) {
    drawTank(c, x, y, s, { hullW: 0.85, hullH: 0.42, turretR: 0.26, turretX: 0.1, barrels: [-0.08, 0.08], barrelW: 0.09, barrelLen: 0.45 });
  },
  montir(c, x, y, s) {
    drawSoldier(c, x - s * 0.3, y + s * 0.08, s * 0.78, { weapon: 'none', bodyColor: '#5c6b4a' });
    drawMontirRig(c, x, y, s);
    drawSoldier(c, x + s * 0.3, y + s * 0.08, s * 0.78, { weapon: 'none', bodyColor: '#5c6b4a' });
  },
  corps(c, x, y, s) {
    const opt = { weapon: 'none', backpack: true, bodyColor: '#7a6b52', pantsColor: '#3f4538' };
    drawSoldier(c, x - s * 0.28, y + s * 0.12, s * 0.8, opt);
    drawSoldier(c, x + s * 0.28, y + s * 0.12, s * 0.8, opt);
    drawSoldier(c, x, y - s * 0.18, s * 0.88, opt);
  },
  apc(c, x, y, s) {
    drawAPCUnit(c, x, y, s * 0.95);
  },
  // ---- v9.7 ----
  trapper(c, x, y, s) { drawTrapperUnit(c, x, y, s); },
  advinfantry(c, x, y, s) { drawAdvanced(c, x, y, s, 'advinfantry', UNIT_RENDERERS.infantry); },
  advassault(c, x, y, s) { drawAdvanced(c, x, y, s, 'advassault', UNIT_RENDERERS.assault); },
  advsniper(c, x, y, s) { drawAdvanced(c, x, y, s, 'advsniper', UNIT_RENDERERS.sniper); },
  advtrapper(c, x, y, s) { drawAdvanced(c, x, y, s, 'advtrapper', UNIT_RENDERERS.trapper); },
};

// ---------- v9.7: varian Advanced = tampilan unit dasar + garis emas + lapisan cahaya emas ----------
// Sprite dasar digambar sekali ke kanvas luar-layar, dibuatkan siluet emas (outline 16 arah) + cahaya emas lembut di belakangnya,
// lalu di-cache per tipe dasar. Tidak mengubah renderer unit dasar. Batch A memakai fungsi yang sama untuk unit Advanced mereka.
const GOLD_CACHE = {};
function goldVariant(baseKey) {
  const R = 72;                                   // piksel per skala unit pada kanvas luar-layar
  return function (c, x, y, s) {
    let e = GOLD_CACHE[baseKey];
    if (!e) {
      const W = Math.ceil(R * 3.0), H = Math.ceil(R * 2.6);
      const mk = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; return cv; };
      const sp = mk();                            // 1) sprite dasar
      UNIT_RENDERERS[baseKey](sp.getContext('2d'), W / 2, H / 2, R);
      const gold = mk(), gc = gold.getContext('2d');   // 2) siluet emas
      gc.drawImage(sp, 0, 0); gc.globalCompositeOperation = 'source-in'; gc.fillStyle = '#ffd24a'; gc.fillRect(0, 0, W, H);
      const out = mk(), oc = out.getContext('2d');     // 3) cahaya + garis emas + sprite + kilau
      const g = oc.createRadialGradient(W / 2, H / 2, R * 0.15, W / 2, H / 2, R * 1.15);
      g.addColorStop(0, 'rgba(255,214,90,0.55)'); g.addColorStop(0.6, 'rgba(255,200,60,0.22)'); g.addColorStop(1, 'rgba(255,200,60,0)');
      oc.fillStyle = g; oc.beginPath(); oc.ellipse(W / 2, H / 2, R * 1.3, R * 1.1, 0, 0, Math.PI * 2); oc.fill();
      const o = Math.max(2, R * 0.045);
      for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; oc.drawImage(gold, Math.cos(a) * o, Math.sin(a) * o); }
      oc.drawImage(sp, 0, 0);
      oc.globalAlpha = 0.2; oc.drawImage(gold, 0, 0); oc.globalAlpha = 1;
      e = GOLD_CACHE[baseKey] = { cv: out, W, H };
    }
    const k = s / R;
    c.drawImage(e.cv, x - e.W * k / 2, y - e.H * k / 2, e.W * k, e.H * k);
  };
}
// Daftarkan varian emas untuk setiap unit dasar yang punya renderer (yang sudah punya renderer sendiri tidak ditimpa).
['infantry', 'assault', 'sniper', 'antitank', 'trapper', 'montir', 'tanklapis', 'tankcrusher', 'apc', 'corps'].forEach(b => {
  const k = 'adv' + b;
  if (UNIT_RENDERERS[b] && !UNIT_RENDERERS[k]) UNIT_RENDERERS[k] = goldVariant(b);
});

// ---------- Tanda (!) : Corps/APC ber-job isi fuel/medical yang sedang menganggur ----------
function drawIdleBadge(x, y, unitScale) {
  const r = unitScale * 0.17, bx = x + unitScale * 0.42, by = y - unitScale * 0.46;
  ctx.save();
  ctx.fillStyle = '#ffcc00'; ctx.strokeStyle = '#222'; ctx.lineWidth = 1.2 / scale;
  ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#222'; ctx.font = `bold ${r * 1.6}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('!', bx, by + r * 0.08);
  ctx.restore();
}

// v9.6: deretan ikon kecil kemampuan/efek aktif, rata tengah di atas bar HP. bottomY = batas bawah ikon.
function drawStatusIcons(names, cx, bottomY) {
  if (!names || !names.length || typeof SkillGfx === 'undefined') return;
  const n = Math.min(4, names.length);
  const sz = Math.min(HEX_SIZE * 0.8, Math.max(HEX_SIZE * 0.4, 8 / scale)), gap = sz * 0.1;
  const x0 = cx - (n * sz + (n - 1) * gap) / 2, y0 = bottomY - sz;
  for (let i = 0; i < n; i++) {
    const img = SkillGfx.get(names[i]);
    if (img) ctx.drawImage(img, x0 + i * (sz + gap), y0, sz, sz);
  }
}

// Gambar 1 unit lengkap di (x,y): sosok unit + cincin pilihan + bar HP (bisa dimatikan di Pengaturan) + tanda (!)
function drawUnitSprite(u, x, y) {
  const def = unitDef(u.type);
  const unitScale = HEX_SIZE * 1.05;
  if (selectedUnit === u) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2 / scale;
    ctx.beginPath(); ctx.ellipse(x, y + unitScale * 0.42, unitScale * 0.5, unitScale * 0.14, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  const renderFn = UNIT_RENDERERS[u.type];
  if (u.downed) ctx.globalAlpha = 0.38;                                          // v9.7: mode gugur (Tak Terkalahkan) digambar pudar
  if (renderFn) renderFn(ctx, x, y, unitScale);
  if (u.downed) {
    ctx.globalAlpha = 1;
    ctx.save(); ctx.strokeStyle = '#e3c445'; ctx.lineWidth = 2.2 / scale; ctx.lineCap = 'round';
    const d = unitScale * 0.22;
    ctx.beginPath(); ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d); ctx.moveTo(x + d, y - d); ctx.lineTo(x - d, y + d); ctx.stroke();
    ctx.restore();
  }
  drawHpBar(x, y - unitScale * 0.5, u.hp, maxHpOf(u, def), u.owner === HUMAN);
  if (Settings.get('showIcons') && typeof activeAbilityIcons === 'function') {   // v9.6: ikon efek aktif di atas bar HP
    const barH = Settings.get('showHp') ? Math.max(HEX_SIZE * 0.16, 3 / scale) + 3 / scale : 1 / scale;
    drawStatusIcons(activeAbilityIcons(u), x, y - unitScale * 0.5 - barH);
  }
  if (typeof needsOrders === 'function' && needsOrders(u)) drawIdleBadge(x, y, unitScale);   // v9.4: ! = APC/Corps nganggur (tanpa job)
}
