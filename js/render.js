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

// v9.0: seluruh tile dalam jarak pandang (JPD efektif) unit sekutu mana pun
function radarTiles() {
  const set = new Set();
  for (const u of units) {
    if (u.owner !== HUMAN) continue;
    const j = effectiveJPD(u);
    for (let r = Math.max(0, u.r - j); r <= Math.min(ROWS - 1, u.r + j); r++)
      for (let c = Math.max(0, u.c - j); c <= Math.min(COLS - 1, u.c + j); c++)
        if (hexDistance(u.r, u.c, r, c) <= j) set.add(r * COLS + c);
  }
  return set;
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#12140f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(camX, camY);
  ctx.scale(scale, scale);
  const radar = radarOn ? radarTiles() : null;

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

      if (radar && radar.has(r * COLS + c)) { pathHex(); ctx.fillStyle = 'rgba(168,85,247,0.34)'; ctx.fill(); }   // v9.0 Radar: ungu seperti territory

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

      // v9.1: tint warna pemilik di tiap tile footprint bangunan.
      // Gambar bangunan & unit digambar di drawEntityLayers() (building-art.js) setelah semua tile.
      const bb = buildingAt(r, c);
      if (bb) { const bcol = players[buildingOwnerIdx(bb)].color; pathHex(); ctx.fillStyle = Settings.hexA(bcol, 0.22); ctx.fill(); }
    }
  }

  drawEntityLayers(); // bangunan + unit (building-art.js), di atas semua tile
  drawLanes();
  drawLockLines();
  drawFootprints();     // footprint.js: pratinjau + proyek bangunan berjalan
  if (phase === 'plan' && currentPlayerIdx === HUMAN) drawOrderMarkers();

  const fxNeedsMore = renderFx();
  ctx.restore();
  if (fxNeedsMore) requestAnimationFrame(draw);

  // v9.0: tombol Mata ditahan -> semburat merah + label
  if (enemyView) {
    ctx.fillStyle = 'rgba(200,40,40,0.10)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillStyle = '#ffb3ae';
    ctx.fillText('👁 Pandangan musuh terhadap unit kita', canvas.width / 2, canvas.height - 24);
    ctx.restore();
  }

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
      const label = isUnit ? (occupant.type === 'corps' ? 'C' : occupant.type === 'advcorps' ? 'AC' : occupant.type.slice(0, 2).toUpperCase()) : BUILDING_TYPES[occupant.type].label;
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
  const sbt = document.getElementById('sbTurn'); if (sbt) sbt.textContent = turnNumber;
  document.getElementById('turndot').style.background = p.color;
  updateTimerUI();
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
  const i = players.indexOf(p), r = p.resources;
  let h = `<b style="color:${p.color}">${p.name}</b> <span>💰${r.kredit}</span> <span>⛽${r.fuel}</span> <span>✚${r.medical}</span>` +
    ` <small class="rs-s">C${p.corps.count}/10${p.corps.timer ? '+' + p.corps.timer : ''} · B${totalBarakSlots(p)}/${2 * p.buildings.filter(b => b.type === 'barak').length}</small>`;
  {                                                    // v9.4: bar HP seluruh Markas — untuk semua pemain, lengkap dengan angka sisa/total
    const maxHp = BUILDING_TYPES.markas.hp, alive = p.buildings.filter(b => b.type === 'markas');
    const lost = (Stats.data[i] && Stats.data[i].bldLost.markas) || 0;
    const total = (alive.length + lost) * maxHp, cur = Math.max(0, Math.round(alive.reduce((a, b) => a + b.hp, 0)));
    h += `<div class="mk-hp" title="HP seluruh Markas">Markas ${cur}/${total}</div>` +
      `<div class="mk-bar${i === HUMAN ? ' mine' : ''}" title="HP seluruh Markas: ${cur}/${total}"><i style="width:${total ? Math.round(cur / total * 100) : 0}%"></i></div>`;
  }
  return h;
}
function renderResourcePanels() {
  document.getElementById('resLeft').innerHTML = resourceHtml(players[0]);
  document.getElementById('resRight').innerHTML = resourceHtml(players[1]);
  if (typeof renderSidebar === 'function') renderSidebar();
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
// v9.0: panel "Log Aksi" lama dihapus. Log aktivitas kini bergaya log damage (teks + angka, tanpa latar)
// dan diisi lewat actAdd() di ui-orders.js. logAction() dipertahankan sebagai no-op agar pemanggil lama tetap aman.
function logAction(msg, kind) { /* tidak ditampilkan lagi (v9.0) */ }
function renderLog() { if (typeof renderActFeed === 'function') renderActFeed(); }

// ---------- Win Condition ----------
function showGameOver() {
  Sfx.end(winner === HUMAN);
  document.getElementById('winnerText').textContent = `${players[winner].name} Menang!`;
  document.getElementById('gameover').style.display = 'flex';
  Rincian.open();                               // rincian pertandingan muncul saat game berakhir
}

// Panel aksi bawah: muncul saat unit sedang menunggu tujuan gerak / target serang / target supply
function updateActionPanel() {
  const el = document.getElementById('actionpanel');
  const cancel = document.getElementById('cancelBtn');
  if (!targetActor && !occupyHex && !specialActor && !haulActor && !focusActor) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  let text, btn = 'Batal';
  if (specialMode) {
    const labels = { recovery: 'Pilih target Recovery (tile biru)...', supplyFuel: 'Pilih target Supply Fuel (tile biru)...', supplyMedical: 'Pilih target Supply Medical (tile biru)...' };
    text = labels[specialMode] || 'Pilih target...';
  } else if (targetActor) {
    text = `Target ${unitName(targetActor)} #${targetActor.id}: ketuk musuh, bangunan musuh, atau hex. Ketuk unit ini = default.`;
  } else if (focusActor) {
    text = `Fokus supply ${unitName(focusActor)} #${focusActor.id}: ketuk unit sekutu atau hex yang diprioritaskan (radius 15 tile). Ketuk unit ini = hapus fokus.`;
  } else if (haulActor) {
    text = haulCorps
      ? `Angkut Corps #${haulCorps.id}: ketuk hex tujuan pengantaran, atau Selesai = tanpa tujuan (APC diam).`
      : `Angkut: ketuk Corps sekutu yang akan diangkut APC #${haulActor.id}.`;
    btn = haulCorps ? 'Selesai' : 'Batal';
  } else {
    text = `Tempati hex (${occupyHex.r},${occupyHex.c}): ketuk unit sendiri yang dikirim ke sana.`;
    btn = 'Selesai';
  }
  document.getElementById('actioninfo').textContent = text;
  cancel.textContent = btn;
}

// Panel rincian unit/bangunan (dari ikon entitas) + tombol aksi
function openEntityPanel(r, c) {
  const target = describeTarget(r, c);
  const el = document.getElementById('entitypanel');
  if (!target) { el.style.display = 'none'; return; }
  const owner = players[target.ownerIdx];
  let html = `<div class="panel-header"><h3 class="panel-title" style="color:${owner.color}">${target.def.name} — ${owner.name}</h3><button class="close" id="entityclose" type="button" aria-label="Tutup">✕</button></div>`;
  const isMine = target.ownerIdx === HUMAN;
  const buttons = []; // {id, label}

  if (target.kind === 'unit') {
    const u = target.obj;
    html += `HP: ${u.hp}/${target.def.hp} &nbsp; MP: ${u.mp}/${target.def.spd}<br>`;
    if (target.def.combat) html += `ATK: ${target.def.atk} &nbsp; DEF: ${target.def.def} &nbsp; Range: ${target.def.range}<br>`;
    if (target.def.hasFuel) html += `Fuel: ${u.fuel}/${target.def.fuelMax}<br>`;
    if (u.speedDebuffTurns > 0) html += `<span style="color:#e08a4a">Speed -50% (${u.speedDebuffTurns} giliran lagi)</span><br>`;
    if (u.intimidatedTurns > 0) html += `<span style="color:#e08a4a">Terkena Intimidasi (${u.intimidatedTurns} giliran lagi)</span><br>`;
    if (u.downed) html += `<span style="color:#e3c445">MODE GUGUR — hidup lagi di awal giliran pemilik (HP 30%, ATK −50%)</span><br>`;
    if (u.weakened) html += `<span style="color:#e08a4a">ATK −50% permanen (Tak Terkalahkan sudah dipakai)</span><br>`;
    if (u.leakTurns > 0 && u.leakStacks > 0) html += `<span style="color:#e08a4a">Bocor minyak ×${u.leakStacks}: −${2 * u.leakStacks} Fuel/giliran (${u.leakTurns} giliran lagi)</span><br>`;
    if (u.pierceTurns > 0) html += `<span style="color:#e08a4a">Penembusan: DEF −20% (${u.pierceTurns} giliran lagi)</span><br>`;
    if (u.type === 'advapc' && u.toughTurns > 0) html += `<span style="color:#7fb4ff">Pantang Menyerah: DEF +20%, SPD +2 (${u.toughTurns} giliran lagi)</span><br>`;
    if (u.type === 'advapc' && u.toughCd > 0) html += `<span style="color:#9aa">Pantang Menyerah cooldown ${u.toughCd} giliran</span><br>`;
    if (u.type === 'advtankcrusher' && isBeraniMati(u)) html += `<span style="color:#e0574f">Pasukan Berani Mati: DEF 0, SPD +2, ATK +10%</span><br>`;

    if (isCorpsType(u.type) && u.isBuilding) {
      html += `<br><i style="color:#d7b56d">Sedang membangun ${BUILDING_TYPES[u.buildType].name}: ${u.buildTurnsRemaining} giliran lagi</i>`;
    } else if (u.cargo) {
      const cargoLabel = u.cargo.type === 'corps' ? `${unitDef(u.cargo.unit.type).name} (penumpang)` : u.cargo.type === 'montir' ? 'Advanced Montir (penumpang)' : `${u.cargo.type} (${u.cargo.amount})`;
      html += `<br>Muatan: ${cargoLabel}`;
    }

    if (isMine) html += `<br><span style="color:#d7b56d">Tujuan: ${targetLabel(u)}</span><br>`;
    if (isMine && canAct() && !(isCorpsType(u.type) && u.isBuilding)) {
      buttons.push({ id: 'targetBtn', label: 'Atur Target' });
      buttons.push({ id: 'lockBtn', label: u.locked ? '🔓 Buka Kunci' : '🔒 Kunci Gerak' });
      if (!target.def.combat) {
        buttons.push({ id: 'jobIdleBtn', label: (u.job === 'idle' ? '✓ ' : '') + 'Nganggur' });
        buttons.push({ id: 'jobFuelBtn', label: (u.job === 'fuel' ? '✓ ' : '') + 'Isi Fuel' });
        buttons.push({ id: 'jobMedBtn', label: (u.job === 'medical' ? '✓ ' : '') + 'Isi Medical' });
        if (isApcType(u.type)) buttons.push({ id: 'jobHaulBtn', label: (u.job === 'angkut' ? '✓ ' : '') + 'Angkut Corps' });
        if (u.job === 'fuel' || u.job === 'medical') buttons.push({ id: 'focusBtn', label: u.focus ? '🎯 Ubah Fokus' : '🎯 Fokus Unit' });
      }
      if (u.target || u.buildOrder || u.job !== 'idle') buttons.push({ id: 'resetBtn', label: 'Reset Default' });
    }
    if (isMine && canAct() && !u.attacked) {
      if ((isApcType(u.type) || isCorpsType(u.type)) && !u.cargo && !(isCorpsType(u.type) && u.isBuilding)) {
        const nearPom = !!adjacentBuildingOfType(u, 'pom');
        const nearPos = !!adjacentBuildingOfType(u, 'pospemulihan');
        if (nearPom && owner.resources.fuel > 0) buttons.push({ id: 'loadFuelBtn', label: 'Muat Fuel' });
        if (nearPos && owner.resources.medical > 0) buttons.push({ id: 'loadMedicalBtn', label: 'Muat Medical' });
      }
      if (isApcType(u.type) && !u.cargo) {
        const adjCorps = neighborsOf(u.r, u.c).some(([nr, nc]) => units.some(cc => cc.r === nr && cc.c === nc && cc.owner === u.owner && isCorpsType(cc.type) && !cc.cargo));
        if (adjCorps) buttons.push({ id: 'loadCorpsBtn', label: 'Muat Corps' });
        const adjMontir = neighborsOf(u.r, u.c).some(([nr, nc]) => units.some(cc => cc.r === nr && cc.c === nc && cc.owner === u.owner && cc.type === 'advmontir'));
        if (adjMontir) buttons.push({ id: 'loadMontirBtn', label: 'Muat Montir' });        // v9.7 Perubahan Model
      }
      if (isApcType(u.type) && u.cargo && u.cargo.type === 'corps') {
        buttons.push({ id: 'unloadCorpsBtn', label: 'Turunkan Corps' });
      }
      if (isApcType(u.type) && u.cargo && u.cargo.type === 'montir') {
        buttons.push({ id: 'unloadMontirBtn', label: 'Turunkan Montir' });
      }
      if (u.cargo && u.cargo.type === 'fuel') buttons.push({ id: 'supplyFuelBtn', label: 'Supply Fuel' });
      if (u.cargo && u.cargo.type === 'medical') buttons.push({ id: 'supplyMedicalBtn', label: 'Supply Medical' });

      if ((isApcType(u.type) || isCorpsType(u.type)) && target.def.hasFuel && u.fuel < target.def.fuelMax && owner.resources.fuel > 0) {
        buttons.push({ id: 'selfRefuelBtn', label: 'Isi Ulang Sendiri' });
      }
      if (owner.resources.medical > 0 && !(isCorpsType(u.type) && u.isBuilding)) {
        buttons.push({ id: 'recoveryBtn', label: 'Recovery' });
      }
    }
  } else {
    const b = target.obj;
    const maxHp = target.def.hp === Infinity ? '∞' : target.def.hp;
    const defStat = target.def.def === Infinity ? '∞' : target.def.def;
    html += `HP: ${b.hp === Infinity ? '∞' : b.hp}/${maxHp} &nbsp; DEF: ${defStat}<br>`;
    if (b.defDebuffTurns > 0) html += `<span style="color:#e08a4a">DEF -30% (Penghancur Bangunan, ${b.defDebuffTurns} giliran lagi)</span><br>`;
    if (isMine && canAct() && b.type === 'barak') buttons.push({ id: 'deployBtn', label: 'Deploy Unit' });
  }

  if (buttons.length > 0) {
    html += '<div class="entityactions">' + buttons.map(b => `<button id="${b.id}" class="${b.cls || ''}">${b.label}</button>`).join('') + '</div>';
  }

  el.innerHTML = html;
  el.style.display = 'block';
  document.getElementById('entityclose').addEventListener('click', () => { el.style.display = 'none'; });

  const bind = (id, fn) => { const btn = document.getElementById(id); if (btn) btn.addEventListener('click', fn); };
  bind('targetBtn', () => { el.style.display = 'none'; startTargetMode(target.obj); });
  const refresh = () => { renderTargetPanel(); draw(); openEntityPanel(r, c); };
  bind('jobIdleBtn', () => { setJob(target.obj, 'idle'); refresh(); });
  bind('jobFuelBtn', () => { setJob(target.obj, 'fuel'); refresh(); });
  bind('jobMedBtn', () => { setJob(target.obj, 'medical'); refresh(); });
  bind('focusBtn', () => { el.style.display = 'none'; startFocusMode(target.obj); });
  bind('jobHaulBtn', () => { el.style.display = 'none'; startHaulMode(target.obj); });
  bind('lockBtn', () => { manualLockToggle(target.obj); refresh(); });
  bind('resetBtn', () => { resetUnit(target.obj); refresh(); });
  bind('deployBtn', () => { el.style.display = 'none'; openDeployPanel(target.obj, owner); });
  bind('loadFuelBtn', () => runAndRefreshEntity(target.obj, () => loadCargo(target.obj, 'fuel'), r, c));
  bind('loadMedicalBtn', () => runAndRefreshEntity(target.obj, () => loadCargo(target.obj, 'medical'), r, c));
  bind('selfRefuelBtn', () => runAndRefreshEntity(target.obj, () => selfRefuel(target.obj), r, c));
  bind('loadCorpsBtn', () => {
    const [nr, nc] = neighborsOf(target.obj.r, target.obj.c).find(([nr2, nc2]) => units.some(cc => cc.r === nr2 && cc.c === nc2 && cc.owner === target.obj.owner && isCorpsType(cc.type) && !cc.cargo));
    const corpsUnit = units.find(cc => cc.r === nr && cc.c === nc);
    runAndRefreshEntity(target.obj, () => loadCorpsIntoAPC(target.obj, corpsUnit), r, c);
  });
  bind('unloadCorpsBtn', () => runAndRefreshEntity(target.obj, () => unloadCorpsFromAPC(target.obj), r, c));
  bind('loadMontirBtn', () => {
    const [nr, nc] = neighborsOf(target.obj.r, target.obj.c).find(([nr2, nc2]) => units.some(cc => cc.r === nr2 && cc.c === nc2 && cc.owner === target.obj.owner && cc.type === 'advmontir'));
    const montir = units.find(cc => cc.r === nr && cc.c === nc);
    runAndRefreshEntity(target.obj, () => loadMontirIntoAPC(target.obj, montir), r, c);
  });
  bind('unloadMontirBtn', () => runAndRefreshEntity(target.obj, () => unloadMontirFromAPC(target.obj), r, c));
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

// v9.7: daftar unit yang bisa dibeli di Barak = UNITS + entri khusus Advanced Corps (batch A menyisipkan Trapper & Advanced lain lewat UNITS)
function deployEntries() { return [...Object.entries(UNITS), ['advcorps', ADV_CORPS_DEF]]; }

// v9.4: modal deploy utama (tombol + di panel kiri) — barak dipilih otomatis (terdekat musuh dulu, lalu acak)
function openDeployModal(player) {
  const el = document.getElementById('deploy');
  el.style.display = 'block';
  const baraks = player.buildings.filter(b => b.type === 'barak');
  const slots = totalBarakSlots(player);
  let html = '<div class="panel-header"><h3>Deploy Unit — slot Barak: ' + slots + '/' + (2 * baraks.length) + '</h3><button class="close" id="deployclose" type="button" aria-label="Tutup">✕</button></div>';
  html += deployEntries().map(([key, def]) => {
    const rosterBlocked = player.id - 1 === HUMAN && typeof isHumanUnitAllowed === 'function' && !isHumanUnitAllowed(key);
    const disabled = (slots <= 0 || player.resources.kredit < def.price || rosterBlocked || (key === 'advcorps' && corpsAlive(player.id - 1) >= MAX_CORPS)) ? 'disabled' : '';
    const label = rosterBlocked ? 'Tidak dipilih' : 'Deploy';
    return `<div class="unitrow"><span>${def.name} (${def.price} Kredit)</span><button data-unit="${key}" ${disabled}>${label}</button></div>`;
  }).join('');
  el.innerHTML = html;
  document.getElementById('deployclose').addEventListener('click', () => { el.style.display = 'none'; });
  el.querySelectorAll('button[data-unit]').forEach(btn => {
    btn.addEventListener('click', () => onDeployModalClick(btn.getAttribute('data-unit'), player));
  });
}

function openDeployPanel(barak, player) {
  const el = document.getElementById('deploy');
  el.style.display = 'block';
  let html = '<div class="panel-header"><h3>Deploy dari Barak — slot Barak ini: ' + barakSlots(barak) + '/2</h3><button class="close" id="deployclose" type="button" aria-label="Tutup">✕</button></div>';
  html += deployEntries().map(([key, def]) => {
    const rosterBlocked = player.id - 1 === HUMAN && typeof isHumanUnitAllowed === 'function' && !isHumanUnitAllowed(key);
    const disabled = (barakSlots(barak) <= 0 || player.resources.kredit < def.price || rosterBlocked || (key === 'advcorps' && corpsAlive(player.id - 1) >= MAX_CORPS)) ? 'disabled' : '';
    const label = rosterBlocked ? 'Tidak dipilih' : 'Deploy';
    return `<div class="unitrow"><span>${def.name} (${def.price} Kredit)</span><button data-unit="${key}" ${disabled}>${label}</button></div>`;
  }).join('');
  el.innerHTML = html;
  document.getElementById('deployclose').addEventListener('click', () => { el.style.display = 'none'; });
  el.querySelectorAll('button[data-unit]').forEach(btn => {
    btn.addEventListener('click', () => onDeployClick(btn.getAttribute('data-unit'), barak, player));
  });
}
