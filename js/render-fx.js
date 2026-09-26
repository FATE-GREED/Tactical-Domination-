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

// ---------- Sprite terrain (gradient, dibuat sekali lalu di-cache) ----------
let terrainSprites = {};
function buildTerrainSprites() {
  const spriteSize = Math.ceil(HEX_SIZE * 2.4);
  for (const key in TERRAIN) {
    const t = TERRAIN[key];
    const off = document.createElement('canvas');
    off.width = spriteSize; off.height = spriteSize;
    const octx = off.getContext('2d');
    const cx = spriteSize / 2, cy = spriteSize / 2;
    const pts = hexCorners(cx, cy, HEX_SIZE - 0.6);
    octx.beginPath();
    pts.forEach(([px, py], i) => i === 0 ? octx.moveTo(px, py) : octx.lineTo(px, py));
    octx.closePath();
    const grad = octx.createRadialGradient(cx - HEX_SIZE * 0.3, cy - HEX_SIZE * 0.35, HEX_SIZE * 0.1, cx, cy, HEX_SIZE * 1.1);
    grad.addColorStop(0, shiftColor(t.color, 26));
    grad.addColorStop(0.6, t.color);
    grad.addColorStop(1, shiftColor(t.color, -18));
    octx.fillStyle = grad;
    octx.fill();
    terrainSprites[key] = { canvas: off, size: spriteSize };
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
function drawUnitSprite(u, x, y) {
  const owner = players[u.owner];
  ctx.beginPath();
  ctx.rect(x - HEX_SIZE * 0.45, y - HEX_SIZE * 0.45, HEX_SIZE * 0.9, HEX_SIZE * 0.9);
  ctx.fillStyle = owner.color; ctx.fill();
  ctx.strokeStyle = (selectedUnit === u) ? '#fff' : '#111';
  ctx.lineWidth = (selectedUnit === u ? 2.5 : 1.5) / scale;
  ctx.stroke();
  const iconFn = UNIT_ICONS[u.type];
  if (iconFn) drawIcon(iconFn, x, y, HEX_SIZE * 0.42);
}

// Gambar 1 bangunan lengkap (chip bulat warna pemilik + ikon) di posisi (x,y)
function drawBuildingSprite(b, ownerColor, x, y) {
  ctx.beginPath(); ctx.arc(x, y, HEX_SIZE * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = ownerColor; ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5 / scale; ctx.stroke();
  const iconFn = BUILDING_ICONS[b.type];
  if (iconFn) drawIcon(iconFn, x, y, HEX_SIZE * 0.48);
}

// ---------- Animasi: gerak unit (tween linear singkat) ----------
let moveAnim = null; // {unitId, fromR, fromC, toR, toC, startTime, duration}
function startMoveAnim(unit, fromR, fromC) {
  moveAnim = { unitId: unit.id, fromR, fromC, toR: unit.r, toC: unit.c, startTime: performance.now(), duration: 220 };
  requestAnimationFrame(draw);
}

// ---------- Animasi: efek serangan (tracer + flash + angka damage melayang) ----------
let attackFx = null; // {fromR,fromC,toR,toC,damage,startTime,duration}
function startAttackFx(fromR, fromC, toR, toC, damage) {
  attackFx = { fromR, fromC, toR, toC, damage, startTime: performance.now(), duration: 450 };
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
