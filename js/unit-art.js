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
};

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

// Gambar 1 unit lengkap di (x,y): sosok unit + cincin pilihan + bar HP (bisa dimatikan di Pengaturan) + tanda (!)
function drawUnitSprite(u, x, y) {
  const def = u.type === 'corps' ? CORPS_DEF : UNITS[u.type];
  const unitScale = HEX_SIZE * 1.05;
  if (selectedUnit === u) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2 / scale;
    ctx.beginPath(); ctx.ellipse(x, y + unitScale * 0.42, unitScale * 0.5, unitScale * 0.14, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  const renderFn = UNIT_RENDERERS[u.type];
  if (renderFn) renderFn(ctx, x, y, unitScale);
  drawHpBar(x, y - unitScale * 0.5, u.hp, def.hp, u.owner === HUMAN);
  if (u.owner === HUMAN && typeof supplyIdle === 'function' && supplyIdle(u)) drawIdleBadge(x, y, unitScale);
}
