// ====================================================================
// input.js — Input pengguna. Model interaksi (fase rencana):
//   - Ketuk tile -> ikon "i" (info) + ikon entitas (rincian/aksi).
//   - TAHAN LAMA unit sendiri -> mode pilih target (ketuk entitas musuh
//     atau hex di map; ketuk unit itu lagi = kembali default).
//   - TAHAN LAMA hex lain -> menu: Bangun / Tempati.
//       Bangun : pilih bangunan, Corps nganggur terdekat otomatis berangkat.
//       Tempati: mode pilih terbalik — hex sudah dipilih, ketuk unit sendiri
//                yang akan dikirim ke hex itu.
//   - Saat fase eksekusi, ketukan pada peta diabaikan (geser/zoom tetap bisa).
// ====================================================================

let dragging = false, lastX = 0, lastY = 0, dragMoved = false;
let pinchStartDist = 0, pinchStartScale = 1;
let attackMode = false;          // tidak dipakai lagi (serangan otomatis); dipertahankan untuk render.js
let attackable = [];
let specialMode = null;          // 'recovery' | 'supplyFuel' | 'supplyMedical'
let specialActor = null;
let specialTargets = [];
let pendingTile = null;
let iconHitboxes = { info: null, entity: null };
let lpTimer = null, suppressClickUntil = 0;
const LONG_PRESS_MS = 550;

function armLongPress(x, y) {
  clearLongPress();
  lpTimer = setTimeout(() => {
    lpTimer = null;
    if (dragMoved || phase !== 'plan' || gameOver) return;
    suppressClickUntil = Date.now() + 700;
    onLongPress(x, y);
  }, LONG_PRESS_MS);
}
function clearLongPress() { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }

function initInput() {
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('mousedown', e => {
    dragging = true; dragMoved = false;
    lastX = e.clientX; lastY = e.clientY;
    canvas.classList.add('dragging');
    armLongPress(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', () => { dragging = false; clearLongPress(); canvas.classList.remove('dragging'); });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) { dragMoved = true; clearLongPress(); }
    camX += dx; camY += dy; lastX = e.clientX; lastY = e.clientY; draw();
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const mx = e.clientX, my = e.clientY;
    const wx = (mx - camX) / scale, wy = (my - camY) / scale;
    scale = Math.min(4, Math.max(0.25, scale * zoomFactor));
    camX = mx - wx * scale; camY = my - wy * scale; draw();
  }, { passive: false });

  canvas.addEventListener('click', onCanvasClick);
  document.getElementById('endturn').addEventListener('click', onEndTurnClick);
  document.getElementById('cancelBtn').addEventListener('click', cancelActionMode);
  document.getElementById('restartBtn').addEventListener('click', () => location.reload());

  // ---------- Touch: pan 1 jari, pinch-zoom 2 jari, tahan lama ----------
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      dragging = true; dragMoved = false;
      lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
      canvas.classList.add('dragging');
      armLongPress(lastX, lastY);
    } else if (e.touches.length === 2) {
      dragging = false; clearLongPress();
      pinchStartDist = touchDist(e.touches[0], e.touches[1]);
      pinchStartScale = scale;
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', e => {
    if (e.touches.length === 1 && dragging) {
      const t = e.touches[0];
      const dx = t.clientX - lastX, dy = t.clientY - lastY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) { dragMoved = true; clearLongPress(); }
      if (dragMoved) {
        camX += dx; camY += dy;
        lastX = t.clientX; lastY = t.clientY;
        draw();
      }
      e.preventDefault();
    } else if (e.touches.length === 2) {
      clearLongPress();
      const dist = touchDist(e.touches[0], e.touches[1]);
      const mid = touchMid(e.touches[0], e.touches[1]);
      const newScale = Math.min(4, Math.max(0.25, pinchStartScale * (dist / pinchStartDist)));
      const wx = (mid.x - camX) / scale, wy = (mid.y - camY) / scale;
      scale = newScale;
      camX = mid.x - wx * scale;
      camY = mid.y - wy * scale;
      draw();
      e.preventDefault();
    }
  }, { passive: false });

  const endTouch = () => { dragging = false; clearLongPress(); canvas.classList.remove('dragging'); };
  canvas.addEventListener('touchend', endTouch, { passive: true });
  canvas.addEventListener('touchcancel', endTouch, { passive: true });
}

function touchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}
function touchMid(t1, t2) {
  return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
}

function tileFromScreen(clientX, clientY) {
  const wx = (clientX - camX) / scale, wy = (clientY - camY) / scale;
  let best = null, bestDist = Infinity;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const { x, y } = hexCenter(r, c);
    const d = (x - wx) ** 2 + (y - wy) ** 2;
    if (d < bestDist) { bestDist = d; best = { r, c }; }
  }
  return (best && bestDist < HEX_SIZE * HEX_SIZE * 1.2) ? best : null;
}

function hitTestIcon(mx, my, box) {
  if (!box) return false;
  const dx = mx - box.x, dy = my - box.y;
  return dx * dx + dy * dy <= box.r * box.r;
}

function closeAllPanels() {
  document.getElementById('info').style.display = 'none';
  document.getElementById('entitypanel').style.display = 'none';
  document.getElementById('deploy').style.display = 'none';
}

// ---------- Tahan lama ----------
function onLongPress(x, y) {
  const tile = tileFromScreen(x, y);
  if (!tile) return;
  if (targetActor || occupyHex || specialMode) return;
  pendingTile = null;
  closeAllPanels();
  const own = units.find(u => u.r === tile.r && u.c === tile.c && u.owner === currentPlayerIdx);
  if (own) {
    if (own.isBuilding) { draw(); alert('Corps ini sedang membangun.'); return; }
    startTargetMode(own);
  } else {
    draw();
    openHexMenu(tile.r, tile.c);
  }
}

function startTargetMode(unit) {
  cancelActionMode();
  targetActor = unit;
  selectedUnit = unit; // untuk sorotan sprite
  pendingTile = null;
  closeAllPanels();
  updateActionPanel();
  draw();
}
function startOccupyMode(r, c) {
  cancelActionMode();
  occupyHex = { r, c };
  pendingTile = null;
  closeAllPanels();
  updateActionPanel();
  draw();
}
function finishTargetMode() {
  targetActor = null; selectedUnit = null;
  updateActionPanel();
  renderTargetPanel();
  draw();
}

function handleTargetPick(r, c) {
  const actor = targetActor;
  const own = units.find(u => u.r === r && u.c === c && u.owner === actor.owner);
  if (own) {
    if (own === actor) { resetUnit(actor); logAction(`${unitName(actor)} #${actor.id}: target default`); }
    finishTargetMode();
    return;
  }
  const eu = units.find(u => u.r === r && u.c === c && u.owner !== actor.owner && isVisibleToCurrentPlayer(u));
  if (eu) {
    setUnitTarget(actor, { kind: 'unit', id: eu.id });
    logAction(`${unitName(actor)} #${actor.id} → ${unitName(eu)} #${eu.id} (musuh)`);
    finishTargetMode();
    return;
  }
  const eb = players[1 - actor.owner].buildings.find(b => b.r === r && b.c === c);
  if (eb && eb.type !== 'garnisun') {
    setUnitTarget(actor, { kind: 'building', ref: eb });
    logAction(`${unitName(actor)} #${actor.id} → ${BUILDING_TYPES[eb.type].name} musuh`);
    finishTargetMode();
    return;
  }
  // hex biasa
  if (tileMoveCost(r, c, defOf(actor)) === Infinity) { alert('Hex ini tidak bisa dijangkau unit ini.'); return; }
  if (isTileBlocked(r, c)) { alert('Hex ini sudah terisi.'); return; }
  setUnitTarget(actor, { kind: 'hex', r, c });
  logAction(`${unitName(actor)} #${actor.id} → hex (${r},${c})`);
  finishTargetMode();
}

function handleOccupyPick(r, c) {
  const u = units.find(uu => uu.r === r && uu.c === c && uu.owner === currentPlayerIdx);
  if (!u) return; // mode tetap aktif sampai "Selesai"
  if (u.isBuilding) { alert('Corps ini sedang membangun.'); return; }
  if (tileMoveCost(occupyHex.r, occupyHex.c, defOf(u)) === Infinity) { alert('Unit ini tidak bisa menjangkau hex itu.'); return; }
  setUnitTarget(u, { kind: 'hex', r: occupyHex.r, c: occupyHex.c });
  logAction(`${unitName(u)} #${u.id} → tempati hex (${occupyHex.r},${occupyHex.c})`);
  renderTargetPanel();
  draw();
}

function onCanvasClick(e) {
  if (gameOver) return;
  if (dragMoved) return;
  if (Date.now() < suppressClickUntil) return;
  if (phase !== 'plan') return;
  const mx = e.clientX, my = e.clientY;

  // 0) Ikon "i" / ikon entitas
  if (hitTestIcon(mx, my, iconHitboxes.info)) {
    const t = pendingTile; pendingTile = null; draw(); showInfo(t.r, t.c); return;
  }
  if (hitTestIcon(mx, my, iconHitboxes.entity)) {
    const t = pendingTile; pendingTile = null; draw(); openEntityPanel(t.r, t.c); return;
  }

  const tile = tileFromScreen(mx, my);
  if (!tile) return;
  const { r, c } = tile;

  // 1) Mode tempati / pilih target
  if (occupyHex) { handleOccupyPick(r, c); return; }
  if (targetActor) { handleTargetPick(r, c); return; }

  // 2) Mode Supply manual (Recovery / Supply Fuel / Supply Medical)
  if (specialMode && specialActor) {
    const isTarget = specialTargets.some(t => t.r === r && t.c === c);
    if (isTarget) {
      const targetUnit = units.find(u => u.r === r && u.c === c);
      let result;
      if (specialMode === 'recovery') result = performRecovery(specialActor, targetUnit);
      else if (specialMode === 'supplyFuel') result = performSupplyFuel(specialActor, targetUnit);
      else if (specialMode === 'supplyMedical') result = performSupplyMedical(specialActor, targetUnit);
      specialMode = null; specialTargets = []; specialActor = null; selectedUnit = null;
      pendingTile = null;
      updateActionPanel();
      renderResourcePanels();
      draw();
      if (result.ok) { showGenericResult(result.message); logAction(result.message); }
      else alert(result.message);
      return;
    }
    specialMode = null; specialTargets = []; specialActor = null; selectedUnit = null;
    updateActionPanel();
    draw();
    return;
  }

  // 3) Ketuk tile biasa -> ikon "i" (+ ikon entitas)
  pendingTile = { r, c };
  closeAllPanels();
  draw();
}

function cancelActionMode() {
  selectedUnit = null; reachable.clear(); attackMode = false; attackable = [];
  specialMode = null; specialActor = null; specialTargets = [];
  targetActor = null; occupyHex = null;
  updateActionPanel();
  draw();
}

// Dipanggil dari tombol Recovery/Supply Fuel/Supply Medical di panel entitas
function startSpecialMode(actor, mode) {
  cancelActionMode();
  specialActor = actor;
  specialMode = mode;
  specialTargets = computeSupplyTargets(actor, mode);
  pendingTile = null;
  closeAllPanels();
  updateActionPanel();
  draw();
  if (specialTargets.length === 0) {
    alert('Tidak ada target yang memenuhi syarat di sekitar unit ini.');
    cancelActionMode();
  }
}

// Dipanggil dari tombol "Deploy" di panel deploy (render.js)
function onDeployClick(key, barak, player) {
  if (phase !== 'plan') return;
  const def = UNITS[key];
  if (player.barakSlots <= 0 || player.resources.kredit < def.price) return;
  const spot = emptyAdjacent(barak.r, barak.c, def);
  if (!spot) { alert('Tidak ada tile kosong di sekitar Barak untuk deploy.'); return; }
  player.resources.kredit -= def.price;
  player.barakSlots--;
  units.push({ id: uidCounter++, owner: player.id - 1, type: key, r: spot.r, c: spot.c, mp: 0, fuel: def.hasFuel ? def.fuelMax : 0, hp: def.hp, attacked: false, speedDebuffTurns: 0, cargo: null, isBuilding: false, assaultExtend: 0, assaultGraceUsed: false, ambushAtkTimer: 0, ambushWasUnseen: false, intimidatedTurns: 0, semangatBesiUsed: false, roadFreeUsesLeft: 2, target: null, job: 'idle', buildOrder: null });
  renderResourcePanels();
  renderTargetPanel();
  openDeployPanel(barak, player); // refresh panel (slot & kredit terupdate)
  draw();
  logAction(`Deploy ${def.name}`);
}

// Tombol "Eksekusi" = percepat: langsung jalankan fase eksekusi
function onEndTurnClick() {
  if (gameOver || phase !== 'plan') return;
  pendingTile = null;
  runExecution();
}
