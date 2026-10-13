// ====================================================================
// bombs.js (v9.7) — Seluruh logika bom Trapper & Advanced Trapper.
// Bom BUKAN entitas: tidak ada di units/buildings, tidak memblokir tile,
// tidak bisa ditarget, dan tidak terlihat musuh. Disimpan di array global
// `bombs`: { id, owner, r, c, special, active, atk, trapperId, trapperType }.
// ====================================================================

const BOMB_MAX_PER_TRAPPER = 3;

function bombsOf(u) { return bombs.filter(b => b.trapperId === u.id); }
function bombRadius(b) { return b.special ? 2 : 1; }               // radius pemicu = radius ledakan
function bombsAtTile(r, c, owner) { return bombs.filter(b => b.r === r && b.c === c && (owner === undefined || b.owner === owner)); }

// Aktivasi: mulai awal giliran pemilik berikutnya setelah dipasang (dipanggil dari startTurn)
function activateBombs(owner) { for (const b of bombs) if (b.owner === owner) b.active = true; }

// Tile pasang: bisa dipijak infanteri, bukan tile bangunan, bukan Valley. Boleh ditempati unit.
function bombTileOK(r, c) {
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
  if (mapData[r][c] === 'valley') return false;
  if (tileMoveCost(r, c, UNITS.infantry) === Infinity) return false;
  if (buildingAt(r, c)) return false;
  return true;
}

function nearestOwnMarkas(u) {
  let best = null, bd = Infinity;
  for (const b of players[u.owner].buildings) {
    if (b.type !== 'markas') continue;
    const d = distToBuilding(u.r, u.c, b);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

// ---------- Pemilihan lokasi ----------
// Default: jalur terpendek unit musuh TERLIHAT terdekat (dari Trapper) menuju Markas pemilik,
// pada ~10 langkah dari unit musuh itu (toleransi 8–12). Tidak ada musuh terlihat -> null.
function defaultBombSpot(u) {
  const foes = units.filter(e => e.owner !== u.owner && !isUnitUnseen(e));
  if (!foes.length) return null;
  foes.sort((a, b) => hexDistance(u.r, u.c, a.r, a.c) - hexDistance(u.r, u.c, b.r, b.c) || a.id - b.id);
  const e = foes[0];
  const mk = nearestOwnMarkas({ r: e.r, c: e.c, owner: u.owner });   // Markas pemilik terdekat dari musuh itu
  if (!mk) return null;
  const path = findPath(e, (r, c) => distToBuilding(r, c, mk) <= 1 && !isTileBlocked(r, c), null, { r: mk.r, c: mk.c });
  if (!path || path.length < 3) return null;
  const mine = bombs.filter(b => b.owner === u.owner);
  const idx = path.map((_, i) => i).sort((a, b) => Math.abs(a + 1 - 10) - Math.abs(b + 1 - 10));
  const okTile = i => bombTileOK(path[i][0], path[i][1]) && !mine.some(b => hexDistance(b.r, b.c, path[i][0], path[i][1]) <= 1);
  let pick = idx.find(i => i + 1 >= 8 && i + 1 <= 12 && okTile(i));
  if (pick === undefined) pick = idx.find(i => i + 1 >= 3 && okTile(i));      // jalur pendek: titik valid terdekat dari 10 langkah
  if (pick === undefined) return null;
  return { r: path[pick][0], c: path[pick][1] };
}

// Manual (sistem target yang ada): hex -> di hex itu; bangunan musuh -> tile kosong menempel bangunan;
// unit musuh -> di tile unit itu (atau tile valid yang menempel).
function manualBombSpot(u) {
  const t = resolveTarget(u);
  if (!t || t.isDefault) return null;
  if (t.kind === 'hex') return bombTileOK(t.r, t.c) ? { r: t.r, c: t.c } : null;
  if (t.kind === 'unit') {
    if (bombTileOK(t.r, t.c)) return { r: t.r, c: t.c };
    const nb = neighborsOf(t.r, t.c).filter(([r, c]) => bombTileOK(r, c));
    return nb.length ? { r: nb[0][0], c: nb[0][1] } : null;
  }
  if (t.kind === 'building') {
    const b = t.obj;
    const cand = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (distToBuilding(r, c, b) !== 1 || !bombTileOK(r, c)) continue;
      cand.push({ r, c, n: bombsAtTile(r, c, u.owner).length, d: hexDistance(u.r, u.c, r, c) });
    }
    cand.sort((a, b2) => a.n - b2.n || a.d - b2.d);
    return cand.length ? { r: cand[0].r, c: cand[0].c } : null;
  }
  return null;
}

// ---------- Memasang ----------
async function placeBomb(u, spot) {
  const mine = bombsOf(u);
  if (mine.length >= BOMB_MAX_PER_TRAPPER) {                       // bom ke-4 (target manual): bom tertua meledak biasa
    const oldest = mine.sort((a, b) => a.id - b.id)[0];
    await explodeBomb(oldest);
    if (gameOver || !units.includes(u)) return;
  }
  const special = u.type === 'trapper' && Math.random() < 0.2;     // Keberuntungan (tidak untuk Advanced Trapper)
  bombs.push({ id: bombSeq++, owner: u.owner, r: spot.r, c: spot.c, special, active: false, atk: UNITS[u.type].atk, trapperId: u.id, trapperType: u.type });
  u.attacked = true;                                               // 1 aksi: MP menjadi 0, flag attacked
  u.mp = 0;
  if (u.owner === HUMAN) actAdd(u.owner, [[unitName(u), 'unit'], [' memasang bom']]);
  draw();
  await sleep(320);
}

// ---------- Pemicu ----------
// Dipanggil tiap langkah unit (moveAlongPath) dan setelah pendaratan lompatan. Mengembalikan true bila ada bom meledak.
async function checkBombTriggers(unit) {
  if (!bombs.length) return false;
  let any = false;
  const hit = bombs.filter(b => b.active && b.owner !== unit.owner && hexDistance(b.r, b.c, unit.r, unit.c) <= bombRadius(b));
  for (const b of hit) {
    if (!bombs.includes(b)) continue;
    await explodeBomb(b);
    any = true;
    if (gameOver) break;
  }
  return any;
}

// Setelah bergerak, bom Hadiah Kejutan mengecek pemicu ke semua unit musuh (termasuk yang tak terlihat)
async function checkBombSelfTrigger(b) {
  if (!bombs.includes(b) || !b.active) return false;
  if (units.some(e => e.owner !== b.owner && !e.downed && hexDistance(b.r, b.c, e.r, e.c) <= bombRadius(b))) { await explodeBomb(b); return true; }
  return false;
}

// ---------- Ledakan ----------
// Inti sinkron: hapus bom, hitung damage rumus biasa (ATK tersimpan di bom, +30 bila khusus), terapkan efek.
function explodeBombNow(bomb) {
  bombs = bombs.filter(b => b !== bomb);
  const radius = bombRadius(bomb);
  const foeIdx = 1 - bomb.owner;
  const src = { type: bomb.trapperType, owner: bomb.owner };
  const atkPct = bomb.special ? 30 : 0;
  const poison = bomb.trapperType === 'advtrapper';                // Bom Beracun | selain itu: Pembuat Onar
  const toxinDmg = specialRound(bomb.atk * 0.10);
  startBombFx(bomb.r, bomb.c, radius);
  Sfx.explode(false);

  const unitTargets = units.filter(u => u.owner === foeIdx && !u.downed && hexDistance(bomb.r, bomb.c, u.r, u.c) <= radius);
  const bldTargets = players[foeIdx].buildings.filter(b => BUILDING_TYPES[b.type].destructible !== false && distToBuilding(bomb.r, bomb.c, b) <= radius);

  for (const u of unitTargets) {
    if (!units.includes(u)) continue;
    const def = defOf(u);
    const info = { kind: 'unit', obj: u, def, ownerIdx: u.owner, vehicle: !!def.vehicle, tank: !!def.tank };
    const dmg = damageFormula(bomb.atk * statMul(bomb.owner), atkPct, info, 1);
    const destroyed = damageUnit(u, dmg, bomb.owner, bomb.trapperType);
    dmgFeedAdd(src, unitName(u), u.owner, dmg);
    if (destroyed) { killFeedAdd(UNITS[bomb.trapperType].name, bomb.owner, unitName(u), u.owner); continue; }
    if (poison) { u.toxinTurns = 3; u.toxinDmg = toxinDmg; u.toxinSrcOwner = bomb.owner; u.toxinSrcType = bomb.trapperType; }   // SPD −50% + racun, 3 giliran
    else u.mp = 0;                                                  // Pembuat Onar: gerakan terhenti seketika
  }
  for (const b of bldTargets) {
    if (!players[foeIdx].buildings.includes(b)) continue;
    const def = BUILDING_TYPES[b.type];
    const info = { kind: 'building', obj: b, def, ownerIdx: foeIdx, vehicle: false, tank: false };
    const dmg = damageFormula(bomb.atk * statMul(bomb.owner), atkPct, info, 1);
    const destroyed = damageBuilding(foeIdx, b, dmg, bomb.owner, bomb.trapperType);
    dmgFeedAdd(src, def.name, foeIdx, dmg);
    if (destroyed) { killFeedAdd(UNITS[bomb.trapperType].name, bomb.owner, def.name, foeIdx); continue; }
    if (poison) { b.toxinTurns = 3; b.toxinDmg = toxinDmg; b.toxinSrcOwner = bomb.owner; b.toxinSrcType = bomb.trapperType; }   // DEF −20% + racun
    else b.bombDefTurns = 3;                                        // Pembuat Onar: DEF −30% selama 3 giliran
  }
  renderResourcePanels();
}

async function explodeBomb(bomb) {
  explodeBombNow(bomb);
  draw();
  await sleep(480);
}

// Ledakan manual oleh pemilik pada fase rencana (aturan ledakan yang sama)
function manualDetonate(bombId) {
  if (!canAct()) return;
  const b = bombs.find(x => x.id === bombId && x.owner === HUMAN);
  if (!b) return;
  explodeBombNow(b);
  draw();
  renderTargetPanel();
  if (gameOver) showGameOver();
}

// Langkah pertama jalur terpendek (BFS) dari (r0,c0) ke (tr,tc) yang melewati tile apa pun kecuali Valley
function bombStepToward(r0, c0, tr, tc) {
  if (r0 === tr && c0 === tc) return null;
  const key = (r, c) => r * COLS + c;
  const prev = new Map([[key(r0, c0), null]]);
  const queue = [[r0, c0]];
  for (let qi = 0; qi < queue.length; qi++) {
    const [r, c] = queue[qi];
    if (r === tr && c === tc) break;
    for (const [nr, nc] of neighborsOf(r, c)) {
      const k = key(nr, nc);
      if (prev.has(k) || mapData[nr][nc] === 'valley') continue;
      prev.set(k, [r, c]);
      queue.push([nr, nc]);
    }
  }
  if (!prev.has(key(tr, tc))) return null;
  let cur = [tr, tc], p = prev.get(key(tr, tc));
  while (p && !(p[0] === r0 && p[1] === c0)) { cur = p; p = prev.get(key(p[0], p[1])); }
  return cur;
}

// ---------- Hadiah Kejutan: bom aktif Advanced Trapper bergerak 1 tile ke unit musuh terdekat ----------
async function moveBombs(pIdx) {
  const movers = bombs.filter(b => b.owner === pIdx && b.active && b.trapperType === 'advtrapper');
  if (!movers.length) return;
  for (const b of movers) {
    if (!bombs.includes(b)) continue;
    const foes = units.filter(e => e.owner !== pIdx);
    if (!foes.length) continue;
    let tgt = null, td = Infinity;
    for (const e of foes) { const d = hexDistance(b.r, b.c, e.r, e.c); if (d < td || (d === td && e.id < tgt.id)) { td = d; tgt = e; } }
    const step = bombStepToward(b.r, b.c, tgt.r, tgt.c);          // jalur terpendek menghindari Valley (satu-satunya rintangan)
    if (step) { b.r = step[0]; b.c = step[1]; }
    if (pIdx === HUMAN) { draw(); await sleep(140); }
    await checkBombSelfTrigger(b);
    if (gameOver) return;
  }
}

// ---------- Gambar bom (hanya milik pemain; tidak tampil di pandangan musuh) ----------
function drawBombs() {
  if (enemyView) return;
  const mine = bombs.filter(b => b.owner === HUMAN);
  if (!mine.length) return;
  for (const b of mine) {
    const { x, y } = hexCenter(b.r, b.c);
    const s = HEX_SIZE * 0.34;
    ctx.save();
    ctx.translate(x + HEX_SIZE * 0.32, y + HEX_SIZE * 0.34);
    ctx.globalAlpha = b.active ? 1 : 0.6;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, s * 0.95, s * 0.9, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#23262b';
    ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = b.special ? '#ffd24a' : '#8b929c'; ctx.lineWidth = Math.max(0.8, s * 0.18);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(-s * 0.35, -s * 0.35, s * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c9b48a'; ctx.lineWidth = Math.max(0.8, s * 0.16);
    ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 0.85); ctx.quadraticCurveTo(s * 0.75, -s * 1.5, s * 1.1, -s * 1.15); ctx.stroke();
    ctx.fillStyle = b.active ? '#ff4a3a' : '#ffb347';
    ctx.beginPath(); ctx.arc(s * 1.1, -s * 1.15, s * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // Lingkaran radius untuk bom di tile terpilih
  if (typeof pendingTile !== 'undefined' && pendingTile) {
    for (const b of mine) {
      if (b.r !== pendingTile.r || b.c !== pendingTile.c) continue;
      const { x, y } = hexCenter(b.r, b.c);
      const R = bombRadius(b) * hexW + HEX_SIZE * 0.87;
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,90,60,0.14)'; ctx.fill();
      ctx.strokeStyle = b.special ? '#ffd24a' : '#ff6b4a'; ctx.lineWidth = 2 / scale; ctx.setLineDash([6 / scale, 4 / scale]); ctx.stroke();
      ctx.restore();
    }
  }
}
