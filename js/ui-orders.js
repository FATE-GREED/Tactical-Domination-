// ====================================================================
// ui-orders.js — UI untuk sistem rencana/eksekusi: panel "Tujuan Unit",
// menu hex (Bangun / Tempati), pilihan bangunan, penanda target di map,
// dan tampilan timer. Tidak ada aturan game di sini.
// ====================================================================

function updateTimerUI() {
  const t = document.getElementById('timer');
  const b = document.getElementById('endturn');
  const pb = document.getElementById('pauseBtn');
  if (pb) pb.textContent = paused ? '▶ Lanjut' : '⏸ Pause';
  if (paused) { t.textContent = '⏸ DIJEDA'; b.disabled = true; return; }
  if (phase === 'plan' && currentPlayerIdx === HUMAN) {
    t.textContent = `⏱ ${planTimeLeft}s`;
    b.textContent = 'Eksekusi ▶';
    b.disabled = false;
  } else if (phase === 'plan') {
    t.textContent = 'Bot menyusun...';
    b.textContent = 'Menunggu...';
    b.disabled = true;
  } else {
    t.textContent = 'Eksekusi...';
    b.textContent = 'Berjalan...';
    b.disabled = true;
  }
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  Sfx.duck(paused);
  if (paused) { cancelActionMode(); closeAllPanels(); }
  updateTimerUI();
  renderTargetPanel();
  draw();
}

// ---------- Log damage eksekusi (kanan atas, teks tanpa latar) ----------
let dmgFeed = { lines: [], total: 0 };
const DMG_COL = { ally: '#5aa9ff', foe: '#ff5f5f', dmg: '#c58cff' };
function dmgFeedReset() { dmgFeed = { lines: [], total: 0 }; renderDmgFeed(); }
function dmgFeedAdd(attacker, targetName, targetOwner, dmg) {
  dmgFeed.lines.push({ a: unitName(attacker), aOwn: attacker.owner, t: targetName, tOwn: targetOwner, dmg });
  dmgFeed.total += dmg;
  renderDmgFeed();
}
// Notifikasi kill ala MOBA: "Infantry → Assault destroy!" (nama sekutu biru, musuh merah)
function killFeedAdd(a, aOwn, t, tOwn) {
  const el = document.getElementById('killfeed');
  if (!el) return;
  const col = o => (o === HUMAN ? DMG_COL.ally : DMG_COL.foe);
  const d = document.createElement('div');
  d.className = 'kill';
  d.innerHTML = `<span style="color:${col(aOwn)}">${a}</span> → <span style="color:${col(tOwn)}">${t}</span> destroy!`;
  el.appendChild(d);
  while (el.children.length > 3) el.firstChild.remove();
  setTimeout(() => d.remove(), 3200);
}
function renderDmgFeed() {
  const el = document.getElementById('dmgfeed');
  if (!el) return;
  if (!dmgFeed.lines.length) { el.innerHTML = ''; return; }
  const col = o => (o === HUMAN ? DMG_COL.ally : DMG_COL.foe);
  const rows = dmgFeed.lines.slice(-14).map(l =>
    `<div><span style="color:${col(l.aOwn)}">${l.a}</span> → <span style="color:${col(l.tOwn)}">${l.t}</span> <span style="color:${DMG_COL.dmg}">${l.dmg}</span></div>`).join('');
  el.innerHTML = rows + `<div class="dtotal">Total dmg<br><span style="color:${DMG_COL.dmg}">${dmgFeed.total}</span></div>`;
}

// ---------- Panel "Tujuan Unit" ----------
function targetLabel(u) {
  return targetLabelBase(u) + (u.locked ? ' 🔒' : '');
}
function targetLabelBase(u) {
  const def = defOf(u);
  if (u.buildOrder) return `Bangun ${BUILDING_TYPES[u.buildOrder.type].name} di (${u.buildOrder.r},${u.buildOrder.c})`;
  if (u.isBuilding) return `Membangun ${BUILDING_TYPES[u.buildType].name} (${u.buildTurnsRemaining} gil.)`;
  if (!def.combat) {
    if (u.job === 'fuel') return 'Job: Isi Fuel';
    if (u.job === 'medical') return 'Job: Isi Medical';
    if (!u.target) return 'Nganggur';
  }
  const t = u.target;
  if (!t) return 'Markas musuh terdekat (default)';
  if (t.kind === 'hex') return `Hex (${t.r},${t.c})`;
  if (t.kind === 'unit') {
    const e = units.find(x => x.id === t.id);
    return e ? `${unitName(e)} musuh #${e.id}` : 'Default';
  }
  if (t.kind === 'building') return `${BUILDING_TYPES[t.ref.type].name} musuh`;
  return 'Default';
}

function focusOnTile(r, c) {
  const { x, y } = hexCenter(r, c);
  camX = canvas.width / 2 - x * scale;
  camY = canvas.height / 2 - y * scale;
  pendingTile = { r, c };
  draw();
}

function renderTargetPanel() {
  const el = document.getElementById('targetpanel');
  if (!el) return;
  if (!el.dataset.init) { el.classList.add('collapsed'); el.dataset.init = '1'; }
  const mine = units.filter(u => u.owner === HUMAN).sort((a, b) => a.id - b.id);
  const rows = mine.map(u => {
    const explicit = u.target || u.buildOrder || u.job !== 'idle';
    return `<div class="trow" data-focus="${u.id}"><b>${unitName(u)} #${u.id}</b> → ${targetLabel(u)}` +
      (explicit && canAct() ? ` <button class="tx" data-reset="${u.id}" title="Batal / kembali default">✕</button>` : '') + `</div>`;
  }).join('');
  el.innerHTML = `<div class="panel-header"><b>Tujuan Unit (${mine.length})</b><button class="collapse-btn" onclick="togglePanel('targetpanel')">${el.classList.contains('collapsed') ? '▾' : '▴'}</button></div>` +
    `<div class="panel-body">${rows || '<i>Belum ada unit</i>'}</div>`;
  el.querySelectorAll('[data-reset]').forEach(btn => btn.addEventListener('click', ev => {
    ev.stopPropagation();
    const u = units.find(x => x.id === Number(btn.getAttribute('data-reset')));
    if (u) { resetUnit(u); renderTargetPanel(); draw(); }
  }));
  el.querySelectorAll('[data-focus]').forEach(row => row.addEventListener('click', () => {
    const u = units.find(x => x.id === Number(row.getAttribute('data-focus')));
    if (u) focusOnTile(u.r, u.c);
  }));
}

// ---------- Menu hex (tahan lama hex kosong/lain) ----------
function openHexMenu(r, c) {
  const el = document.getElementById('deploy');
  el.style.display = 'block';
  const terr = TERRAIN[mapData[r][c]].name;
  const occ = occupantAt(r, c);
  const blocked = isTileBlocked(r, c);
  let html = `<span class="close" id="deployclose">✕</span><h3>Hex (${r},${c}) — ${terr}</h3>`;
  if (blocked && occ) {
    const name = units.includes(occ) ? unitName(occ) : BUILDING_TYPES[occ.type].name;
    html += `<div class="unitrow"><span>Terisi: ${name}</span></div>`;
  } else {
    html += `<div class="unitrow"><span>Bangun bangunan di sini</span><button id="hexBuild">Bangun</button></div>`;
    html += `<div class="unitrow"><span>Kirim unit menempati hex</span><button id="hexOccupy">Tempati</button></div>`;
  }
  el.innerHTML = html;
  document.getElementById('deployclose').addEventListener('click', () => { el.style.display = 'none'; });
  const b1 = document.getElementById('hexBuild'), b2 = document.getElementById('hexOccupy');
  if (b1) b1.addEventListener('click', () => openBuildPanelAt(r, c));
  if (b2) b2.addEventListener('click', () => { el.style.display = 'none'; startOccupyMode(r, c); });
}

// Daftar bangunan yang bisa dipesan di hex (Corps nganggur terdekat otomatis berangkat)
function openBuildPanelAt(r, c) {
  const el = document.getElementById('deploy');
  el.style.display = 'block';
  const owner = HUMAN;
  const buildable = ['pom', 'pospemulihan', 'jembatan', 'barak', 'benteng'];
  let html = `<span class="close" id="deployclose">✕</span><h3>Bangun di hex (${r},${c})</h3>`;
  html += buildable.map(type => {
    const spec = BUILDING_TYPES[type];
    const why = buildOrderBlockReason(owner, type, r, c);
    return `<div class="unitrow"><span>${spec.name} ${why ? '(' + why + ')' : '(' + spec.turnsRequired + ' giliran)'}</span><button data-build="${type}" ${why ? 'disabled' : ''}>Bangun</button></div>`;
  }).join('');
  el.innerHTML = html;
  document.getElementById('deployclose').addEventListener('click', () => { el.style.display = 'none'; });
  el.querySelectorAll('button[data-build]').forEach(btn => btn.addEventListener('click', () => {
    const res = orderBuild(owner, btn.getAttribute('data-build'), r, c);
    el.style.display = 'none';
    if (res.ok) { showGenericResult(res.message); logAction(res.message); }
    else alert(res.message);
    renderTargetPanel();
    draw();
  }));
}

// ---------- Penanda target di map (fase rencana) ----------
function drawOrderMarkers() {
  ctx.save();
  ctx.lineWidth = 1.5 / scale;
  for (const u of units) {
    if (u.owner !== HUMAN || !u.target) continue;
    const t = u.target;
    let tr, tc;
    if (t.kind === 'hex') { tr = t.r; tc = t.c; }
    else if (t.kind === 'unit') { const e = units.find(x => x.id === t.id); if (!e) continue; tr = e.r; tc = e.c; }
    else if (t.kind === 'building') { tr = t.ref.r; tc = t.ref.c; }
    else continue;
    const a = hexCenter(u.r, u.c), b = hexCenter(tr, tc);
    ctx.strokeStyle = u.buildOrder ? '#7ec4e8' : 'rgba(255,230,120,0.75)';
    ctx.setLineDash([5 / scale, 5 / scale]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(b.x, b.y, HEX_SIZE * 0.7, 0, Math.PI * 2); ctx.stroke();
  }
  if (occupyHex) {
    const h = hexCenter(occupyHex.r, occupyHex.c);
    ctx.strokeStyle = '#7ec4e8'; ctx.lineWidth = 3 / scale;
    ctx.beginPath(); ctx.arc(h.x, h.y, HEX_SIZE * 0.85, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
