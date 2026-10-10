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
let focusActor = null;           // Corps/APC supplier yang sedang memilih unit/hex fokus
let haulActor = null;            // APC yang sedang diatur job Angkut Corps
let haulCorps = null;            // Corps yang sudah dipilih (langkah 2: pilih tujuan)
let pendingTile = null;
let iconHitboxes = { info: null, entity: null };
let lpTimer = null, suppressClickUntil = 0;
const LONG_PRESS_MS = 550;

function armLongPress(x, y) {
  clearLongPress();
  lpTimer = setTimeout(() => {
    lpTimer = null;
    if (dragMoved || !canAct()) return;
    suppressClickUntil = Date.now() + 700;
    onLongPress(x, y);
  }, LONG_PRESS_MS);
}
function clearLongPress() { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }

function initInput() {
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('mousedown', e => {
    if (laneMode && canAct()) { laneStart(e.clientX, e.clientY); return; }
    if (lockMode && canAct()) { lockStart(e.clientX, e.clientY); return; }
    dragging = true; dragMoved = false;
    lastX = e.clientX; lastY = e.clientY;
    canvas.classList.add('dragging');
    armLongPress(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', () => { laneEnd(); lockEnd(); dragging = false; clearLongPress(); canvas.classList.remove('dragging'); });
  window.addEventListener('mousemove', e => {
    if (laneDraft) { laneMove(e.clientX, e.clientY); return; }
    if (lockDraft) { lockMove(e.clientX, e.clientY); return; }
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) { dragMoved = true; clearLongPress(); }
    const k = Settings.get('panSens') / 100;      // sensitivitas geser layar (Pengaturan)
    camX += dx * k; camY += dy * k; lastX = e.clientX; lastY = e.clientY; draw();
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
  document.getElementById('laneBtn').addEventListener('click', toggleLaneMode);
  document.getElementById('lockLineBtn').addEventListener('click', toggleLockMode);
  // Main Lagi: muat ulang lalu langsung mulai ronde baru (lewati lobby). Lobby: muat ulang biasa.
  document.getElementById('restartBtn').addEventListener('click', () => {
    try { sessionStorage.setItem('td-autostart', '1'); } catch (e) {}
    location.reload();
  });
  document.getElementById('lobbyBtn').addEventListener('click', () => {
    try { sessionStorage.removeItem('td-autostart'); } catch (e) {}
    location.reload();
  });

  // ---------- Touch: pan 1 jari, pinch-zoom 2 jari, tahan lama ----------
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 1 && laneMode && canAct()) { laneStart(e.touches[0].clientX, e.touches[0].clientY); return; }
    if (e.touches.length === 1 && lockMode && canAct()) { lockStart(e.touches[0].clientX, e.touches[0].clientY); return; }
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
    if (laneDraft && e.touches.length === 1) { laneMove(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); return; }
    if (lockDraft && e.touches.length === 1) { lockMove(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); return; }
    if (e.touches.length === 1 && dragging) {
      const t = e.touches[0];
      const dx = t.clientX - lastX, dy = t.clientY - lastY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) { dragMoved = true; clearLongPress(); }
      if (dragMoved) {
        const k = Settings.get('panSens') / 100;
        camX += dx * k; camY += dy * k;
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

  const endTouch = () => { laneEnd(); lockEnd(); dragging = false; clearLongPress(); canvas.classList.remove('dragging'); };
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
  if (targetActor || occupyHex || specialMode || haulActor || focusActor) return;
  pendingTile = null;
  closeAllPanels();
  const own = units.find(u => u.r === tile.r && u.c === tile.c && u.owner === HUMAN);
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
// ---------- Fokus supply (Corps/APC job isi fuel/medical): ketuk unit sekutu / hex fokus ----------
function startFocusMode(u) {
  cancelActionMode();
  focusActor = u; selectedUnit = u; pendingTile = null;
  closeAllPanels(); updateActionPanel(); draw();
}
function handleFocusPick(r, c) {
  const u = focusActor;
  if (r === u.r && c === u.c) { u.focus = null; logAction(`${unitName(u)} #${u.id}: fokus supply dilepas`); }
  else {
    const t = units.find(x => x.r === r && x.c === c && x.owner === u.owner);
    u.focus = t ? { unitId: t.id } : { r, c };
    logAction(`${unitName(u)} #${u.id}: fokus supply ke ${t ? unitName(t) + ' #' + t.id : 'hex (' + r + ',' + c + ')'}`);
  }
  focusActor = null; selectedUnit = null;
  updateActionPanel(); renderTargetPanel(); draw();
}

// ---------- Job Angkut Corps (APC): 1) pilih Corps, 2) (opsional) pilih tujuan ----------
function startHaulMode(apc) {
  cancelActionMode();
  if (apc.cargo && apc.cargo.type !== 'corps') { alert('APC sedang membawa Fuel/Medical, tidak bisa mengangkut Corps.'); return; }
  haulActor = apc; haulCorps = null; selectedUnit = apc; pendingTile = null;
  if (apc.cargo) {                              // sudah membawa Corps -> langsung pilih tujuan
    haulCorps = apc.cargo.unit;
    setHaulJob(apc, haulCorps.id, null);
    renderTargetPanel();
  }
  closeAllPanels();
  updateActionPanel();
  draw();
}
function finishHaul() {
  haulActor = null; haulCorps = null; selectedUnit = null;
  updateActionPanel(); renderTargetPanel(); draw();
}
function handleHaulPick(r, c) {
  const apc = haulActor;
  if (!haulCorps) {                             // langkah 1: pilih Corps sekutu
    const cu = units.find(u => u.r === r && u.c === c && u.owner === apc.owner && u.type === 'corps');
    if (!cu) return;
    if (cu.isBuilding) { alert('Corps ini sedang membangun.'); return; }
    if (cu.cargo) { alert('Corps yang sedang membawa muatan tidak bisa diangkut.'); return; }
    resetUnit(cu);                              // Corps berhenti dan menunggu dijemput
    setHaulJob(apc, cu.id, null);
    haulCorps = cu;
    logAction(`APC #${apc.id} → angkut Corps #${cu.id}`);
    updateActionPanel(); renderTargetPanel(); draw();
    return;
  }
  if (r === apc.r && c === apc.c) { finishHaul(); return; }   // ketuk APC = tanpa tujuan
  if (tileMoveCost(r, c, CORPS_DEF) === Infinity) { alert('Corps tidak bisa diturunkan di hex ini.'); return; }
  apc.haul.dest = { r, c };
  logAction(`APC #${apc.id}: antar Corps #${haulCorps.id} ke (${r},${c})`);
  finishHaul();
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
  const eb = buildingAt(r, c, 1 - actor.owner);
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
  const u = units.find(uu => uu.r === r && uu.c === c && uu.owner === HUMAN);
  if (!u) return; // mode tetap aktif sampai "Selesai"
  if (u.isBuilding) { alert('Corps ini sedang membangun.'); return; }
  if (tileMoveCost(occupyHex.r, occupyHex.c, defOf(u)) === Infinity) { alert('Unit ini tidak bisa menjangkau hex itu.'); return; }
  setUnitTarget(u, { kind: 'hex', r: occupyHex.r, c: occupyHex.c });
  logAction(`${unitName(u)} #${u.id} → tempati hex (${occupyHex.r},${occupyHex.c})`);
  renderTargetPanel();
  draw();
}

function onCanvasClick(e) {
  if (gameOver || laneMode || lockMode) return;
  if (dragMoved) return;
  if (Date.now() < suppressClickUntil) return;
  if (!canAct()) return;
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
  if (haulActor) { handleHaulPick(r, c); return; }
  if (focusActor) { handleFocusPick(r, c); return; }
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
  targetActor = null; occupyHex = null; haulActor = null; haulCorps = null; focusActor = null;
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
  if (!canAct()) return;
  const def = UNITS[key];
  if (player.barakSlots <= 0 || player.resources.kredit < def.price) return;
  if (!doDeploy(key, barak, player)) { alert('Tidak ada tile kosong di sekitar Barak untuk deploy.'); return; }
  renderResourcePanels();
  renderTargetPanel();
  openDeployPanel(barak, player); // refresh panel (slot & kredit terupdate)
  draw();
  logAction(`Deploy ${def.name}`);
}

// Tombol "Eksekusi" = percepat: langsung jalankan fase eksekusi
function onEndTurnClick() {
  if (!canAct()) return;
  pendingTile = null;
  runExecution();
}
