// ====================================================================
// input.js — Menangani semua input pengguna. Model interaksi baru:
//   1) Klik tile kosong dari mode apapun -> tampilkan ikon "i" (info)
//      di atas tile itu; jika tile berisi unit/bangunan, tampilkan
//      juga ikon entitas di sampingnya.
//   2) Klik ikon "i" -> panel info terrain.
//   3) Klik ikon entitas -> panel rincian unit/bangunan + tombol aksi
//      (Gerak/Serang untuk unit sendiri, Deploy untuk Barak sendiri).
//   4) Tombol "Gerak"/"Serang" mengaktifkan mode pilih-tile-tujuan;
//      klik tile highlight untuk menyelesaikan aksi, atau "Batal".
// ====================================================================

let dragging = false, lastX = 0, lastY = 0, dragMoved = false;
let pinchStartDist = 0, pinchStartScale = 1;
let attackMode = false;
let attackable = [];
let specialMode = null;    // 'recovery' | 'supplyFuel' | 'supplyMedical'
let specialActor = null;
let specialTargets = [];
let pendingTile = null;                          // tile yang baru diklik, menunggu klik ikon
let iconHitboxes = { info: null, entity: null };  // posisi ikon di layar (screen-space)

function initInput() {
  canvas.addEventListener('mousedown', e => {
    dragging = true; dragMoved = false;
    lastX = e.clientX; lastY = e.clientY;
    canvas.classList.add('dragging');
  });
  window.addEventListener('mouseup', () => { dragging = false; canvas.classList.remove('dragging'); });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
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

  // ---------- Touch: pan 1 jari, pinch-zoom 2 jari ----------
  // Tidak preventDefault() di touchstart/touchend supaya tap tunggal tetap
  // memicu event 'click' bawaan browser (dipakai onCanvasClick di atas).
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      dragging = true; dragMoved = false;
      lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
      canvas.classList.add('dragging');
    } else if (e.touches.length === 2) {
      dragging = false;
      pinchStartDist = touchDist(e.touches[0], e.touches[1]);
      pinchStartScale = scale;
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', e => {
    if (e.touches.length === 1 && dragging) {
      const t = e.touches[0];
      const dx = t.clientX - lastX, dy = t.clientY - lastY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
      camX += dx; camY += dy;
      lastX = t.clientX; lastY = t.clientY;
      draw();
      e.preventDefault(); // cegah scroll halaman saat geser peta
    } else if (e.touches.length === 2) {
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

  canvas.addEventListener('touchend', () => {
    dragging = false;
    canvas.classList.remove('dragging');
  }, { passive: true });
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

function onCanvasClick(e) {
  if (gameOver) return;
  if (dragMoved) return;
  const mx = e.clientX, my = e.clientY;

  // 0) Klik ikon "i" -> panel info terrain
  if (hitTestIcon(mx, my, iconHitboxes.info)) {
    const t = pendingTile;
    pendingTile = null;
    draw();
    showInfo(t.r, t.c);
    return;
  }
  // 0b) Klik ikon entitas -> panel rincian unit/bangunan
  if (hitTestIcon(mx, my, iconHitboxes.entity)) {
    const t = pendingTile;
    pendingTile = null;
    draw();
    openEntityPanel(t.r, t.c);
    return;
  }

  const tile = tileFromScreen(mx, my);
  if (!tile) return;
  const { r, c } = tile;
  const rk = r + ',' + c;

  // 1) Mode Supply aktif (Recovery/Supply Fuel/Supply Medical) -> klik target valid mengeksekusi
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

  // 2) Mode Serang aktif -> klik target valid mengeksekusi serangan
  if (attackMode && selectedUnit) {
    const isTarget = attackable.some(t => t.r === r && t.c === c);
    if (isTarget) {
      const attackerFromR = selectedUnit.r, attackerFromC = selectedUnit.c;
      const result = applyAttack(selectedUnit, r, c);
      attackMode = false; attackable = []; selectedUnit = null; reachable.clear();
      pendingTile = null;
      updateActionPanel();
      renderResourcePanels();
      if (result.ok) startAttackFx(attackerFromR, attackerFromC, r, c, result.damage);
      draw();
      if (result.ok) {
        showAttackResult(result);
        logAction(`Serang ${result.targetName}: ${result.damage} dmg${result.destroyed ? ' (HANCUR)' : ''}`);
        if (gameOver) { showGameOver(); return; }
      } else {
        alert(result.message);
      }
      return;
    }
    attackMode = false; attackable = []; selectedUnit = null;
    updateActionPanel();
    draw();
    return;
  }

  // 3) Mode Gerak aktif -> klik tile terjangkau memindahkan unit
  if (selectedUnit && reachable.has(rk)) {
    const movedUnitLabel = selectedUnit.type === 'corps' ? 'Corps' : UNITS[selectedUnit.type].name;
    const movedUnit = selectedUnit;
    const fromR = selectedUnit.r, fromC = selectedUnit.c;
    selectedUnit.r = r; selectedUnit.c = c;
    selectedUnit.mp -= reachable.get(rk);
    selectedUnit = null; reachable.clear();
    pendingTile = null;
    updateActionPanel();
    startMoveAnim(movedUnit, fromR, fromC);
    draw();
    logAction(`${movedUnitLabel} bergerak ke (${r},${c})`);
    return;
  }
  if (selectedUnit) { // klik di luar jangkauan -> batalkan mode gerak
    selectedUnit = null; reachable.clear();
    updateActionPanel();
  }

  // 3) Klik tile biasa -> tampilkan ikon "i" (dan ikon entitas jika berisi sesuatu)
  pendingTile = { r, c };
  closeAllPanels();
  draw();
}

function cancelActionMode() {
  selectedUnit = null; reachable.clear(); attackMode = false; attackable = [];
  specialMode = null; specialActor = null; specialTargets = [];
  updateActionPanel();
  draw();
}

// Dipanggil dari tombol Recovery/Supply Fuel/Supply Medical di panel entitas
function startSpecialMode(actor, mode) {
  selectedUnit = null; reachable.clear(); attackMode = false; attackable = [];
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

// Dipanggil dari tombol "Gerak" di panel entitas
function startMoveMode(unit) {
  selectedUnit = unit;
  applySemangatBesi(unit); // Anti-Tank: +2 MP sekali/giliran jika bersebelahan kendaraan
  reachable = unit.mp > 0 ? computeReachable(unit) : new Map();
  attackMode = false; attackable = [];
  pendingTile = null;
  closeAllPanels();
  updateActionPanel();
  draw();
}
// Dipanggil dari tombol "Serang" di panel entitas
function startAttackMode(unit) {
  selectedUnit = unit;
  attackMode = true;
  attackable = computeAttackable(unit);
  reachable.clear();
  pendingTile = null;
  closeAllPanels();
  updateActionPanel();
  draw();
}

// Dipanggil dari tombol "Deploy" di panel deploy (render.js)
function onDeployClick(key, barak, player) {
  const def = UNITS[key];
  if (player.barakSlots <= 0 || player.resources.kredit < def.price) return;
  const spot = emptyAdjacent(barak.r, barak.c, def);
  if (!spot) { alert('Tidak ada tile kosong di sekitar Barak untuk deploy.'); return; }
  player.resources.kredit -= def.price;
  player.barakSlots--;
  units.push({ id: uidCounter++, owner: player.id - 1, type: key, r: spot.r, c: spot.c, mp: 0, fuel: def.hasFuel ? def.fuelMax : 0, hp: def.hp, attacked: false, speedDebuffTurns: 0, cargo: null, isBuilding: false, assaultExtend: 0, assaultGraceUsed: false, ambushAtkTimer: 0, ambushWasUnseen: false, intimidatedTurns: 0, semangatBesiUsed: false });
  renderResourcePanels();
  openDeployPanel(barak, player); // refresh panel (slot & kredit terupdate)
  draw();
  logAction(`Deploy ${def.name}`);
}

function onEndTurnClick() {
  if (gameOver) return;
  selectedUnit = null; reachable.clear(); attackMode = false; attackable = [];
  specialMode = null; specialActor = null; specialTargets = [];
  pendingTile = null;
  closeAllPanels();
  updateActionPanel();
  currentPlayerIdx = 1 - currentPlayerIdx;
  if (currentPlayerIdx === 0) turnNumber++;
  startTurn(currentPlayerIdx);
  updateTurnBar();
  renderResourcePanels();
  draw();
}
