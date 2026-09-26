// ====================================================================
// render.js — Menggambar canvas berdasarkan state saat ini. Tidak ada
// logika aturan di sini, murni "gambarkan apa yang ada di state".
// ====================================================================

const hexW = Math.sqrt(3) * HEX_SIZE, hexH = 2 * HEX_SIZE, vertSpacing = hexH * 0.75;

function hexCenter(row, col) {
  return { x: col * hexW + (row % 2 === 1 ? hexW / 2 : 0), y: row * vertSpacing };
}
function hexCorners(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]); }
  return pts;
}

let canvas, ctx;

function initCanvas() {
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext('2d');
  buildTerrainSprites();
  window.addEventListener('resize', resize);
  resize();
}
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; draw(); }

function drawIconCircle(x, y, r, color, label) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y);
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#12140f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(camX, camY);
  ctx.scale(scale, scale);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const { x, y } = hexCenter(r, c);
      const sx = x * scale + camX, sy = y * scale + camY;
      if (sx < -40 || sx > canvas.width + 40 || sy < -40 || sy > canvas.height + 40) continue;

      const terr = TERRAIN[mapData[r][c]];
      const sprite = terrainSprites[mapData[r][c]];
      if (sprite) {
        ctx.drawImage(sprite.canvas, x - sprite.size / 2, y - sprite.size / 2, sprite.size, sprite.size);
      } else {
        const pts = hexCorners(x, y, HEX_SIZE - 0.6);
        ctx.beginPath();
        pts.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
        ctx.closePath();
        ctx.fillStyle = terr.color;
        ctx.fill();
      }

      // overlay (territory/highlight) tetap pakai bentuk hex asli
      const hexPts = hexCorners(x, y, HEX_SIZE - 0.6);
      const pathHex = () => {
        ctx.beginPath();
        hexPts.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
        ctx.closePath();
      };

      pathHex();
      for (const p of players) if (inTerritory(p, r, c)) { ctx.fillStyle = p.color + '33'; ctx.fill(); break; }

      const rk = r + ',' + c;
      pathHex();
      if (reachable.has(rk)) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill(); }
      pathHex();
      if (attackMode && attackable.some(t => t.r === r && t.c === c)) { ctx.fillStyle = 'rgba(255,60,60,0.45)'; ctx.fill(); }
      pathHex();
      if (specialMode && specialTargets.some(t => t.r === r && t.c === c)) { ctx.fillStyle = 'rgba(80,180,255,0.45)'; ctx.fill(); }

      pathHex();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1 / scale;
      ctx.stroke();

      // bangunan
      for (const p of players) {
        const b = p.buildings.find(bb => bb.r === r && bb.c === c);
        if (b) drawBuildingSprite(b, p.color, x, y);
      }
      // unit (hanya digambar kalau terlihat oleh pemain yang sedang giliran, dan bukan yang sedang animasi gerak)
      const u = units.find(uu => uu.r === r && uu.c === c);
      if (u && isVisibleToCurrentPlayer(u) && !(moveAnim && moveAnim.unitId === u.id)) {
        drawUnitSprite(u, x, y);
      }
    }
  }

  const midX = HALF_COLS * hexW;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5 / scale;
  ctx.beginPath(); ctx.moveTo(midX, -50); ctx.lineTo(midX, ROWS * vertSpacing + 50); ctx.stroke();
  ctx.setLineDash([]);

  const fxNeedsMore = renderFx();
  ctx.restore();
  if (fxNeedsMore) requestAnimationFrame(draw);

  // ---------- Ikon interaksi (screen-space, ukuran tetap walau zoom) ----------
  iconHitboxes.info = null;
  iconHitboxes.entity = null;
  if (pendingTile) {
    const { x, y } = hexCenter(pendingTile.r, pendingTile.c);
    const screenX = x * scale + camX, screenY = y * scale + camY;
    const occupant0 = occupantAt(pendingTile.r, pendingTile.c);
    const occupant = (occupant0 && units.includes(occupant0) && !isVisibleToCurrentPlayer(occupant0)) ? null : occupant0;
    const iconR = 12;

    ctx.beginPath();
    ctx.arc(screenX, screenY, HEX_SIZE * scale * 0.8, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();

    const infoX = occupant ? screenX - 16 : screenX;
    const infoY = screenY - 28;
    drawIconCircle(infoX, infoY, iconR, '#4a90c4', 'i');
    iconHitboxes.info = { x: infoX, y: infoY, r: iconR };

    if (occupant) {
      const isUnit = units.includes(occupant);
      const label = isUnit ? (occupant.type === 'corps' ? 'C' : occupant.type.slice(0, 2).toUpperCase()) : BUILDING_TYPES[occupant.type].label;
      const entX = screenX + 16, entY = screenY - 28;
      drawIconCircle(entX, entY, iconR, isUnit ? '#d7b56d' : '#9b7a3f', label);
      iconHitboxes.entity = { x: entX, y: entY, r: iconR };
    }
  }
}

// ---------- Panel UI ----------
function updateTurnBar() {
  const p = players[currentPlayerIdx];
  document.getElementById('turntext').textContent = `Giliran ${p.name}`;
  document.getElementById('turnnum').textContent = turnNumber;
  document.getElementById('turndot').style.background = p.color;
}

function renderLegend() {
  const legend = document.getElementById('legend');
  legend.classList.add('collapsed'); // default terlipat, hemat ruang layar
  legend.innerHTML = `
    <div class="panel-header"><b style="color:#a8d08d">Legenda</b><button class="collapse-btn" onclick="togglePanel('legend')">▾</button></div>
    <div class="panel-body">` +
    Object.values(TERRAIN).map(t => `<div class="row"><div class="swatch" style="background:${t.color}"></div>${t.name}</div>`).join('') +
    `<br><div class="row"><div class="swatch" style="background:${PLAYER_COLORS[0]}"></div>Pemain 1 (Kiri)</div>` +
    `<div class="row"><div class="swatch" style="background:${PLAYER_COLORS[1]}"></div>Pemain 2 (Kanan)</div>
    </div>`;
}

// Lipat/buka panel manapun yang punya struktur .panel-header + .panel-body
function togglePanel(id) {
  const el = document.getElementById(id);
  el.classList.toggle('collapsed');
  const btn = el.querySelector('.collapse-btn');
  if (btn) btn.textContent = el.classList.contains('collapsed') ? '▾' : '▴';
}

function resourceHtml(p) {
  return `<b style="color:${p.color}">${p.name}</b><br>
    Kredit: ${p.resources.kredit} &nbsp; Fuel: ${p.resources.fuel} &nbsp; Medical: ${p.resources.medical}<br>
    <small style="color:#999">Corps: ${p.corps.count}/10 ${p.corps.timer ? '(next in ' + p.corps.timer + ' turn)' : ''} • Slot Barak: ${p.barakSlots}/2</small>`;
}
function renderResourcePanels() {
  document.getElementById('resLeft').innerHTML = resourceHtml(players[0]);
  document.getElementById('resRight').innerHTML = resourceHtml(players[1]);
}

// Panel info tile (dari ikon "i") — hanya terrain, tidak lagi mencampur unit/bangunan
function showInfo(r, c) {
  const terr = TERRAIN[mapData[r][c]];
  const info = document.getElementById('info');
  info.style.display = 'block';
  info.innerHTML = `<b>${terr.name}</b><br>Tile (${r}, ${c})<br><br>${terr.effect}`;
}

function showAttackResult(result) {
  const info = document.getElementById('info');
  info.style.display = 'block';
  let html = `<b style="color:#e06c6c">Serangan!</b><br>Target: ${result.targetName}<br>Damage: ${result.damage}` +
    (result.destroyed ? '<br><b style="color:#ff5555">HANCUR!</b>' : '');
  if (result.splashResults && result.splashResults.length > 0) {
    html += '<br><br><i>Perusak Formasi (splash):</i>';
    result.splashResults.forEach(s => {
      html += `<br>Tile (${s.r},${s.c}): ${s.damage} dmg${s.destroyed ? ' — HANCUR!' : ''}`;
    });
  }
  info.innerHTML = html;
}

function showGenericResult(message) {
  const info = document.getElementById('info');
  info.style.display = 'block';
  info.innerHTML = `<b style="color:#7ec4e8">${message}</b>`;
}

// ---------- Log Aksi ----------
function logAction(msg) {
  actionLog.unshift({ turn: turnNumber, player: currentPlayerIdx, msg });
  if (actionLog.length > 20) actionLog.pop();
  renderLog();
}
function renderLog() {
  const el = document.getElementById('actionlog');
  if (!el.dataset.initialized) { el.classList.add('collapsed'); el.dataset.initialized = '1'; }
  const p = players;
  const bodyHtml = actionLog.map(e =>
    `<div class="entry"><span style="color:${p[e.player].color}">T${e.turn} ${p[e.player].name}</span>: ${e.msg}</div>`
  ).join('');
  el.innerHTML = `<div class="panel-header"><b>Log Aksi</b><button class="collapse-btn" onclick="togglePanel('actionlog')">▾</button></div><div class="panel-body">${bodyHtml}</div>`;
  const btn = el.querySelector('.collapse-btn');
  if (btn) btn.textContent = el.classList.contains('collapsed') ? '▾' : '▴';
}

// ---------- Win Condition ----------
function showGameOver() {
  document.getElementById('winnerText').textContent = `${players[winner].name} Menang!`;
  document.getElementById('gameover').style.display = 'flex';
}

// Panel aksi bawah: muncul saat unit sedang menunggu tujuan gerak / target serang / target supply
function updateActionPanel() {
  const el = document.getElementById('actionpanel');
  if (!selectedUnit && !specialActor) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  if (specialMode) {
    const labels = { recovery: 'Pilih target Recovery (tile biru)...', supplyFuel: 'Pilih target Supply Fuel (tile biru)...', supplyMedical: 'Pilih target Supply Medical (tile biru)...' };
    document.getElementById('actioninfo').textContent = labels[specialMode] || 'Pilih target...';
  } else {
    document.getElementById('actioninfo').textContent = attackMode
      ? 'Pilih target serang (tile merah)...'
      : 'Pilih tile tujuan (tile putih)...';
  }
}

// Panel rincian unit/bangunan (dari ikon entitas) + tombol aksi
function openEntityPanel(r, c) {
  const target = describeTarget(r, c);
  const el = document.getElementById('entitypanel');
  if (!target) { el.style.display = 'none'; return; }
  const owner = players[target.ownerIdx];
  let html = '<span class="close" id="entityclose">✕</span>';
  const isMine = target.ownerIdx === currentPlayerIdx;
  const buttons = []; // {id, label}

  if (target.kind === 'unit') {
    const u = target.obj;
    const name = u.type === 'corps' ? 'Corps' : target.def.name;
    html += `<h3 style="color:${owner.color}">${name} — ${owner.name}</h3>`;
    html += `HP: ${u.hp}/${target.def.hp} &nbsp; MP: ${u.mp}/${target.def.spd}<br>`;
    if (target.def.combat) html += `ATK: ${target.def.atk} &nbsp; DEF: ${target.def.def} &nbsp; Range: ${target.def.range}<br>`;
    if (target.def.hasFuel) html += `Fuel: ${u.fuel}/${target.def.fuelMax}<br>`;
    if (u.speedDebuffTurns > 0) html += `<span style="color:#e08a4a">Speed -50% (${u.speedDebuffTurns} giliran lagi)</span><br>`;
    if (u.intimidatedTurns > 0) html += `<span style="color:#e08a4a">Terkena Intimidasi (${u.intimidatedTurns} giliran lagi)</span><br>`;

    if (u.type === 'corps' && u.isBuilding) {
      html += `<br><i style="color:#d7b56d">Sedang membangun ${BUILDING_TYPES[u.buildType].name}: ${u.buildTurnsRemaining} giliran lagi</i>`;
    } else if (u.cargo) {
      const cargoLabel = u.cargo.type === 'corps' ? 'Corps (penumpang)' : `${u.cargo.type} (${u.cargo.amount})`;
      html += `<br>Muatan: ${cargoLabel}`;
    }

    if (isMine && !u.attacked) {
      if (u.mp > 0 && !(u.type === 'corps' && u.isBuilding)) buttons.push({ id: 'moveBtn', label: 'Gerak' });
      if (target.def.combat) buttons.push({ id: 'atkBtn', label: 'Serang', cls: 'atkbtn' });

      if (u.type === 'corps' && !u.isBuilding && !u.cargo) {
        buttons.push({ id: 'buildBtn', label: 'Bangun' });
      }
      if ((u.type === 'apc' || u.type === 'corps') && !u.cargo && !(u.type === 'corps' && u.isBuilding)) {
        if (owner.resources.fuel > 0) buttons.push({ id: 'loadFuelBtn', label: 'Muat Fuel' });
        if (owner.resources.medical > 0) buttons.push({ id: 'loadMedicalBtn', label: 'Muat Medical' });
      }
      if (u.type === 'apc' && !u.cargo) {
        const adjCorps = neighborsOf(u.r, u.c).some(([nr, nc]) => units.some(cc => cc.r === nr && cc.c === nc && cc.owner === u.owner && cc.type === 'corps' && !cc.cargo));
        if (adjCorps) buttons.push({ id: 'loadCorpsBtn', label: 'Muat Corps' });
      }
      if (u.type === 'apc' && u.cargo && u.cargo.type === 'corps') {
        buttons.push({ id: 'unloadCorpsBtn', label: 'Turunkan Corps' });
      }
      if (u.cargo && u.cargo.type === 'fuel') buttons.push({ id: 'supplyFuelBtn', label: 'Supply Fuel' });
      if (u.cargo && u.cargo.type === 'medical') buttons.push({ id: 'supplyMedicalBtn', label: 'Supply Medical' });

      if ((u.type === 'apc' || u.type === 'corps') && target.def.hasFuel && u.fuel < target.def.fuelMax && owner.resources.fuel > 0) {
        buttons.push({ id: 'selfRefuelBtn', label: 'Isi Ulang Sendiri' });
      }
      if (owner.resources.medical > 0 && !(u.type === 'corps' && u.isBuilding)) {
        buttons.push({ id: 'recoveryBtn', label: 'Recovery' });
      }
    }
  } else {
    const b = target.obj;
    const maxHp = target.def.hp === Infinity ? '∞' : target.def.hp;
    const defStat = target.def.def === Infinity ? '∞' : target.def.def;
    html += `<h3 style="color:${owner.color}">${target.def.name} — ${owner.name}</h3>`;
    html += `HP: ${b.hp === Infinity ? '∞' : b.hp}/${maxHp} &nbsp; DEF: ${defStat}<br>`;
    if (b.defDebuffTurns > 0) html += `<span style="color:#e08a4a">DEF -20% (Penghancur Bangunan, ${b.defDebuffTurns} giliran lagi)</span><br>`;
    if (isMine && b.type === 'barak') buttons.push({ id: 'deployBtn', label: 'Deploy Unit' });
  }

  if (buttons.length > 0) {
    html += '<div class="entityactions">' + buttons.map(b => `<button id="${b.id}" class="${b.cls || ''}">${b.label}</button>`).join('') + '</div>';
  }

  el.innerHTML = html;
  el.style.display = 'block';
  document.getElementById('entityclose').addEventListener('click', () => { el.style.display = 'none'; });

  const bind = (id, fn) => { const btn = document.getElementById(id); if (btn) btn.addEventListener('click', fn); };
  bind('moveBtn', () => startMoveMode(target.obj));
  bind('atkBtn', () => startAttackMode(target.obj));
  bind('deployBtn', () => { el.style.display = 'none'; openDeployPanel(target.obj, owner); });
  bind('buildBtn', () => { el.style.display = 'none'; openBuildPanel(target.obj, owner); });
  bind('loadFuelBtn', () => runAndRefreshEntity(target.obj, () => loadCargo(target.obj, 'fuel'), r, c));
  bind('loadMedicalBtn', () => runAndRefreshEntity(target.obj, () => loadCargo(target.obj, 'medical'), r, c));
  bind('selfRefuelBtn', () => runAndRefreshEntity(target.obj, () => selfRefuel(target.obj), r, c));
  bind('loadCorpsBtn', () => {
    const [nr, nc] = neighborsOf(target.obj.r, target.obj.c).find(([nr2, nc2]) => units.some(cc => cc.r === nr2 && cc.c === nc2 && cc.owner === target.obj.owner && cc.type === 'corps' && !cc.cargo));
    const corpsUnit = units.find(cc => cc.r === nr && cc.c === nc);
    runAndRefreshEntity(target.obj, () => loadCorpsIntoAPC(target.obj, corpsUnit), r, c);
  });
  bind('unloadCorpsBtn', () => runAndRefreshEntity(target.obj, () => unloadCorpsFromAPC(target.obj), r, c));
  bind('supplyFuelBtn', () => { el.style.display = 'none'; startSpecialMode(target.obj, 'supplyFuel'); });
  bind('supplyMedicalBtn', () => { el.style.display = 'none'; startSpecialMode(target.obj, 'supplyMedical'); });
  bind('recoveryBtn', () => { el.style.display = 'none'; startSpecialMode(target.obj, 'recovery'); });
}

// Jalankan aksi 1-shot (tak butuh pilih target di peta), tampilkan hasil, refresh panel + resource
function runAndRefreshEntity(unit, actionFn, r, c) {
  const result = actionFn();
  renderResourcePanels();
  draw();
  if (result.ok) { showGenericResult(result.message); logAction(result.message); } else alert(result.message);
  openEntityPanel(r, c); // refresh isi panel (cargo/MP/status berubah)
}

// Panel pilihan bangunan yang bisa dibangun Corps di tile-nya sendiri
function openBuildPanel(corps, player) {
  const el = document.getElementById('deploy');
  el.style.display = 'block';
  const buildable = ['pom', 'pospemulihan', 'jembatan', 'barak', 'benteng'];
  const terr = mapData[corps.r][corps.c];
  let html = '<span class="close" id="deployclose">✕</span><h3>Bangun di tile ini</h3>';
  html += buildable.map(type => {
    const spec = BUILDING_TYPES[type];
    const count = player.buildings.filter(b => b.type === type).length;
    const terrainOk = type === 'jembatan' ? terr === 'river' : terr === 'grass';
    const maxedOut = count >= spec.maxCount;
    const disabled = (!terrainOk || maxedOut) ? 'disabled' : '';
    const reason = !terrainOk ? (type === 'jembatan' ? '(butuh tile River)' : '(butuh tile Grass)') : maxedOut ? '(maks tercapai)' : `(${spec.turnsRequired} giliran)`;
    return `<div class="unitrow"><span>${spec.name} ${reason}</span><button data-build="${type}" ${disabled}>Bangun</button></div>`;
  }).join('');
  el.innerHTML = html;
  document.getElementById('deployclose').addEventListener('click', () => { el.style.display = 'none'; });
  el.querySelectorAll('button[data-build]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-build');
      const result = startBuild(corps, type);
      el.style.display = 'none';
      draw();
      if (result.ok) { showGenericResult(result.message); logAction(result.message); } else alert(result.message);
    });
  });
}

function openDeployPanel(barak, player) {
  const el = document.getElementById('deploy');
  el.style.display = 'block';
  let html = '<span class="close" id="deployclose">✕</span><h3>Deploy dari Barak — slot tersisa: ' + player.barakSlots + '</h3>';
  html += Object.entries(UNITS).map(([key, def]) => {
    const disabled = (player.barakSlots <= 0 || player.resources.kredit < def.price) ? 'disabled' : '';
    return `<div class="unitrow"><span>${def.name} (${def.price} Kredit)</span><button data-unit="${key}" ${disabled}>Deploy</button></div>`;
  }).join('');
  el.innerHTML = html;
  document.getElementById('deployclose').addEventListener('click', () => { el.style.display = 'none'; });
  el.querySelectorAll('button[data-unit]').forEach(btn => {
    btn.addEventListener('click', () => onDeployClick(btn.getAttribute('data-unit'), barak, player));
  });
}
