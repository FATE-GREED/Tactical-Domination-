// ====================================================================
// rules-supply.js — Resource lanjutan, konstruksi, dan logistik:
//   - Build: Corps membangun Pom/Pos Pemulihan/Jembatan/Barak/Benteng
//     di tempat ia berdiri (Markas butuh 2 Corps, belum didukung).
//   - Cargo: APC & Corps membawa Fuel/Medical/Corps (APC saja).
//   - Recovery (pakai Medical pool), Supply Fuel/Medical (pakai cargo),
//     dan isi ulang bahan bakar sendiri (APC/Corps).
// Semua fungsi di sini mengembalikan {ok, message} agar UI (input.js)
// bisa menampilkan alasan kalau aksi ditolak.
// ====================================================================

// ---------- Build ----------
// Corps mulai membangun bangunan `type` di tile-nya sendiri. 1 Action.
function startBuild(corps, type, tiles) {
  if (corps.type !== 'corps') return { ok: false, message: 'Hanya Corps yang bisa membangun.' };
  if (corps.isBuilding) return { ok: false, message: 'Corps ini sudah sedang membangun.' };
  if (corps.attacked) return { ok: false, message: 'Corps ini sudah memakai Action giliran ini.' };
  const spec = BUILDING_TYPES[type];
  if (!spec || spec.corpsRequired !== 1) return { ok: false, message: 'Bangunan ini belum didukung sistem Build (butuh >1 Corps).' };

  const owner = players[corps.owner];
  const existingCount = owner.buildings.filter(b => b.type === type).length;
  if (existingCount >= spec.maxCount) return { ok: false, message: `Sudah mencapai batas maksimal ${spec.name} (${spec.maxCount}).` };

  tiles = tiles || [[corps.r, corps.c]];
  if (tiles[0][0] !== corps.r || tiles[0][1] !== corps.c) return { ok: false, message: 'Corps belum berada di tile tengah lokasi.' };
  const why = footprintReason(corps.owner, type, tiles, [corps]);       // terrain, tile kosong, cadangan (footprint.js)
  if (why) return { ok: false, message: `Tidak bisa membangun: ${why}.` };

  corps.isBuilding = true;
  corps.buildType = type;
  corps.buildTiles = tiles;
  corps.buildTurnsRemaining = spec.turnsRequired;
  corps.attacked = true; // Build = 1 Action, menghanguskan sisa MP
  corps.mp = 0;
  actAdd(corps.owner, type === 'renov'
    ? [['Corps', 'unit'], [' merenov 3 tile']]
    : [['Corps', 'unit'], [' membangun '], [spec.name, 'bld']]);
  const what = type === 'renov' ? 'merenov 3 tile' : `membangun ${spec.name} (${tiles.length} tile)`;
  return { ok: true, message: `Mulai ${what} (${spec.turnsRequired} giliran).` };
}

// Dipanggil dari rules-economy.js startTurn(): proses konstruksi yang sedang berjalan.
// Jika Corps mati di tengah proses, project otomatis gugur (Corps sudah tidak ada di units).
// Begitu selesai, Corps dipindah ke tile kosong bersebelahan (bangunan butuh tile itu
// sendiri); kalau tidak ada tile kosong sama sekali, penyelesaian ditunda ke giliran
// berikutnya (dicoba lagi tiap startTurn sampai ada ruang).
function processBuildProgress(pIdx) {
  const p = players[pIdx];

  // --- Markas (2 Corps berdiri di samping tile Markas) ---
  // Pesanan yang belum mulai tapi salah satu Corps gugur -> batal, tile dibebaskan.
  for (const site of markasSites.filter(s => !s.started)) {
    if (site.corpsIds.every(id => units.some(x => x.id === id))) continue;
    markasSites = markasSites.filter(s => s !== site);
    for (const id of site.corpsIds) {
      const x = units.find(y => y.id === id);
      if (x && x.buildOrder && x.buildOrder.site === site.id) { x.buildOrder = null; x.target = null; }
    }
  }
  for (const site of markasSites.filter(s => s.owner === pIdx && s.started)) {
    const mates = site.corpsIds.map(id => units.find(x => x.id === id));
    const free = m => { m.isBuilding = false; m.buildType = null; m.buildTurnsRemaining = 0; m.buildSite = null; };
    if (mates.some(m => !m)) {                       // salah satu Corps gugur -> proyek gugur
      mates.forEach(m => { if (m) free(m); });
      markasSites = markasSites.filter(s => s !== site);
      continue;
    }
    if (site.turnsRemaining > 0) site.turnsRemaining--;
    mates.forEach(m => { m.buildTurnsRemaining = site.turnsRemaining; });
    if (site.turnsRemaining <= 0) {
      const spots = outsideSpots(site.tiles, CORPS_DEF, mates.length);   // Corps berdiri di dalam footprint -> pindah ke luar
      if (spots.length < mates.length) continue;                          // belum ada tempat keluar, coba lagi giliran depan
      markasSites = markasSites.filter(s => s !== site);
      p.buildings.push({ r: site.r, c: site.c, tiles: site.tiles, type: 'markas', hp: BUILDING_TYPES.markas.hp, defDebuffTurns: 0, seq: buildingSeq++ });
      mates.forEach((m, i) => { m.r = spots[i][0]; m.c = spots[i][1]; free(m); });
      logAction(`Markas selesai dibangun di (${site.r},${site.c}).`);
      actAdd(pIdx, [['Markas', 'bld'], [' selesai di bangun']]);
    }
  }

  for (const u of units.filter(u => u.owner === pIdx && u.isBuilding && u.buildType !== 'markas')) {
    if (u.buildTurnsRemaining > 0) u.buildTurnsRemaining--;
    if (u.buildTurnsRemaining > 0) continue;
    const spec = BUILDING_TYPES[u.buildType], tiles = u.buildTiles || [[u.r, u.c]];
    if (u.buildType === 'renov') {                      // Renov: tile yang bisa direnov menjadi Grass, Corps langsung bebas
      let n = 0;
      for (const [r, c] of tiles) if (canRenovTile(mapData[r][c])) { mapData[r][c] = 'grass'; n++; }
      u.isBuilding = false; u.buildType = null; u.buildTiles = null; u.buildTurnsRemaining = 0;
      logAction(`Renov selesai: ${n} tile menjadi Grass.`);
      actAdd(pIdx, [['Renov', 'bld'], [` selesai: ${n} tile menjadi Grass`]]);
      continue;
    }
    const spot = outsideSpots(tiles, CORPS_DEF, 1)[0];   // Corps berdiri di footprint -> pindah ke luar
    if (!spot) continue;                                 // belum ada tempat, coba lagi giliran depan (turnsRemaining tetap 0)
    p.buildings.push({ r: tiles[0][0], c: tiles[0][1], tiles, type: u.buildType, hp: spec.hp, defDebuffTurns: 0, seq: buildingSeq++ });
    actAdd(pIdx, [[spec.name, 'bld'], [' selesai di bangun']]);
    u.r = spot[0]; u.c = spot[1];
    u.isBuilding = false; u.buildType = null; u.buildTiles = null; u.buildTurnsRemaining = 0;
  }
}

// ---------- Cargo: muat / bongkar ----------
function cargoCapacity(unit, cargoType) {
  if (unit.type === 'apc') return cargoType === 'fuel' ? 100 : cargoType === 'medical' ? 20 : 1;
  if (unit.type === 'corps') return cargoType === 'fuel' ? 50 : cargoType === 'medical' ? 10 : 0;
  return 0;
}

// Muat Fuel/Medical dari pool pemain ke unit (APC atau Corps), maksimal kapasitas.
// WAJIB bersebelahan dengan bangunan sumbernya (Pom untuk Fuel, Pos Pemulihan
// untuk Medical) — tidak bisa muat sembarang tempat. 1 Action.
function loadCargo(unit, cargoType) {
  if (unit.type !== 'apc' && unit.type !== 'corps') return { ok: false, message: 'Hanya APC/Corps yang bisa membawa muatan.' };
  if (unit.cargo) return { ok: false, message: 'Unit ini sudah membawa muatan (1 jenis saja).' };
  if (unit.attacked) return { ok: false, message: 'Unit ini sudah memakai Action giliran ini.' };

  const sourceType = cargoType === 'fuel' ? 'pom' : 'pospemulihan';
  const sourceName = cargoType === 'fuel' ? 'Pom' : 'Pos Pemulihan';
  const p = players[unit.owner];
  const nearSource = !!adjacentBuildingOfType(unit, sourceType);
  if (!nearSource) return { ok: false, message: `Harus bersebelahan dengan ${sourceName} untuk memuat ${cargoType}.` };

  const cap = cargoCapacity(unit, cargoType);
  const amount = Math.min(cap, p.resources[cargoType]);
  if (amount <= 0) return { ok: false, message: `Tidak ada ${cargoType} tersisa di pool.` };
  p.resources[cargoType] -= amount;
  Stats.use(p, cargoType, amount);
  unit.cargo = { type: cargoType, amount };
  unit.attacked = true; unit.mp = 0;
  actAdd(unit.owner, [[unitName(unit), 'unit'], [' isi ulang '], [`${cargoType} ${amount}`, cargoType === 'fuel' ? 'fuel' : 'rec']]);
  return { ok: true, message: `Memuat ${amount} ${cargoType}.` };
}

// APC memuat Corps sekutu yang bersebelahan sebagai penumpang. 1 Action.
function loadCorpsIntoAPC(apc, corpsUnit) {
  if (apc.type !== 'apc') return { ok: false, message: 'Hanya APC yang bisa membawa Corps.' };
  if (apc.cargo) return { ok: false, message: 'APC sudah membawa muatan.' };
  if (corpsUnit.type !== 'corps' || corpsUnit.owner !== apc.owner) return { ok: false, message: 'Target bukan Corps sekutu.' };
  if (corpsUnit.cargo) return { ok: false, message: 'Corps yang sedang membawa muatan tidak bisa diangkut APC.' };
  if (hexDistance(apc.r, apc.c, corpsUnit.r, corpsUnit.c) !== 1) return { ok: false, message: 'Corps harus bersebelahan dengan APC.' };
  if (apc.attacked) return { ok: false, message: 'APC sudah memakai Action giliran ini.' };

  apc.cargo = { type: 'corps', unit: corpsUnit };
  units = units.filter(u => u.id !== corpsUnit.id); // Corps "naik", hilang dari papan sementara
  apc.attacked = true; apc.mp = 0;
  actAdd(apc.owner, [['APC', 'unit'], [' mengangkut '], ['Corps', 'unit']]);
  return { ok: true, message: 'Corps naik ke APC.' };
}

// Turunkan Corps dari APC ke tile kosong bersebelahan. 1 Action.
// `prefer` (opsional {r,c}): tile tujuan; Corps diturunkan di tile kosong sebelah APC yang paling dekat dengannya.
function unloadCorpsFromAPC(apc, prefer) {
  if (!apc.cargo || apc.cargo.type !== 'corps') return { ok: false, message: 'APC tidak membawa Corps.' };
  if (apc.attacked) return { ok: false, message: 'APC sudah memakai Action giliran ini.' };
  let spot = null;
  if (prefer) {
    spot = neighborsOf(apc.r, apc.c)
      .filter(([nr, nc]) => !isTileBlocked(nr, nc) && tileMoveCost(nr, nc, CORPS_DEF) !== Infinity)
      .sort((a, b) => hexDistance(a[0], a[1], prefer.r, prefer.c) - hexDistance(b[0], b[1], prefer.r, prefer.c))
      .map(([nr, nc]) => ({ r: nr, c: nc }))[0] || null;
  }
  if (!spot) spot = emptyAdjacent(apc.r, apc.c, CORPS_DEF);
  if (!spot) return { ok: false, message: 'Tidak ada tile kosong di sekitar APC untuk menurunkan Corps.' };
  const corpsUnit = apc.cargo.unit;
  corpsUnit.r = spot.r; corpsUnit.c = spot.c;
  corpsUnit.mp = 0; corpsUnit.attacked = true;
  units.push(corpsUnit);
  apc.cargo = null;
  apc.attacked = true; apc.mp = 0;
  actAdd(apc.owner, [['APC', 'unit'], [' menurunkan '], ['Corps', 'unit']]);
  return { ok: true, message: 'Corps diturunkan dari APC.' };
}

// ---------- Target valid untuk mode Recovery/Supply (unit sekutu adjacent yang memenuhi syarat) ----------
function computeSupplyTargets(actor, mode) {
  const out = [];
  for (const [nr, nc] of neighborsOf(actor.r, actor.c)) {
    const u = units.find(uu => uu.r === nr && uu.c === nc && uu.owner === actor.owner && uu.id !== actor.id);
    if (!u) continue;
    const def = u.type === 'corps' ? CORPS_DEF : UNITS[u.type];
    if (mode === 'recovery' || mode === 'supplyMedical') {
      if (u.hp < def.hp) out.push({ r: nr, c: nc });
    } else if (mode === 'supplyFuel') {
      if (def.hasFuel && u.fuel < def.fuelMax) out.push({ r: nr, c: nc });
    }
  }
  return out;
}

// ---------- Supply & Recovery (Bagian 10) ----------
// Recovery: pakai Medical POOL pemain langsung (bukan cargo), sembuhkan unit sekutu adjacent. 1 Action.
function performRecovery(healer, targetUnit) {
  if (healer.attacked) return { ok: false, message: 'Unit ini sudah memakai Action giliran ini.' };
  if (targetUnit.owner !== healer.owner) return { ok: false, message: 'Hanya bisa merawat unit sekutu.' };
  if (hexDistance(healer.r, healer.c, targetUnit.r, targetUnit.c) !== 1) return { ok: false, message: 'Target harus bersebelahan.' };
  const targetDef = targetUnit.type === 'corps' ? CORPS_DEF : UNITS[targetUnit.type];
  const missing = targetDef.hp - targetUnit.hp;
  if (missing <= 0) return { ok: false, message: 'Unit target sudah full HP.' };
  const p = players[healer.owner];
  const healed = Math.min(missing, p.resources.medical);
  if (healed <= 0) return { ok: false, message: 'Medical pool habis.' };
  targetUnit.hp += healed;
  p.resources.medical -= healed;
  Stats.use(p, 'medical', healed);
  healer.attacked = true; healer.mp = 0;
  actAdd(healer.owner, [[unitName(healer), 'unit'], [' '], ['recovery', 'rec'], [' '], [unitName(targetUnit), 'unit'], [' '], [String(healed), 'rec']]);
  return { ok: true, message: `Recovery +${healed} HP.` };
}

// Supply Fuel: transfer Fuel dari cargo carrier ke tangki unit target (adjacent). 1 Action.
function performSupplyFuel(carrier, targetUnit) {
  if (!carrier.cargo || carrier.cargo.type !== 'fuel') return { ok: false, message: 'Carrier tidak membawa Fuel.' };
  if (carrier.attacked) return { ok: false, message: 'Unit ini sudah memakai Action giliran ini.' };
  if (targetUnit.owner !== carrier.owner) return { ok: false, message: 'Hanya bisa mengisi unit sekutu.' };
  const targetDef = targetUnit.type === 'corps' ? CORPS_DEF : UNITS[targetUnit.type];
  if (!targetDef.hasFuel) return { ok: false, message: 'Unit target tidak memakai Fuel.' };
  if (hexDistance(carrier.r, carrier.c, targetUnit.r, targetUnit.c) !== 1) return { ok: false, message: 'Target harus bersebelahan.' };
  const missing = targetDef.fuelMax - targetUnit.fuel;
  if (missing <= 0) return { ok: false, message: 'Tangki target sudah penuh.' };
  const given = Math.min(missing, carrier.cargo.amount);
  if (given <= 0) return { ok: false, message: 'Muatan Fuel sudah habis.' };
  targetUnit.fuel += given;
  carrier.cargo.amount -= given;
  if (carrier.cargo.amount <= 0) carrier.cargo = null;
  carrier.attacked = true; carrier.mp = 0;
  actAdd(carrier.owner, [[unitName(carrier), 'unit'], [' '], ['refuel', 'fuel'], [' '], [unitName(targetUnit), 'unit'], [' '], [String(given), 'fuel']]);
  return { ok: true, message: `Supply Fuel +${given}.` };
}

// Supply Medical: transfer Medical dari cargo carrier untuk menyembuhkan unit target (adjacent). 1 Action.
function performSupplyMedical(carrier, targetUnit) {
  if (!carrier.cargo || carrier.cargo.type !== 'medical') return { ok: false, message: 'Carrier tidak membawa Medical.' };
  if (carrier.attacked) return { ok: false, message: 'Unit ini sudah memakai Action giliran ini.' };
  if (targetUnit.owner !== carrier.owner) return { ok: false, message: 'Hanya bisa merawat unit sekutu.' };
  if (hexDistance(carrier.r, carrier.c, targetUnit.r, targetUnit.c) !== 1) return { ok: false, message: 'Target harus bersebelahan.' };
  const targetDef = targetUnit.type === 'corps' ? CORPS_DEF : UNITS[targetUnit.type];
  const missing = targetDef.hp - targetUnit.hp;
  if (missing <= 0) return { ok: false, message: 'Unit target sudah full HP.' };
  const healed = Math.min(missing, carrier.cargo.amount);
  if (healed <= 0) return { ok: false, message: 'Muatan Medical sudah habis.' };
  targetUnit.hp += healed;
  carrier.cargo.amount -= healed;
  if (carrier.cargo.amount <= 0) carrier.cargo = null;
  carrier.attacked = true; carrier.mp = 0;
  actAdd(carrier.owner, [[unitName(carrier), 'unit'], [' '], ['recovery', 'rec'], [' '], [unitName(targetUnit), 'unit'], [' '], [String(healed), 'rec']]);
  return { ok: true, message: `Supply Medical +${healed} HP.` };
}

// APC/Corps mengisi ulang tangki BBM sendiri dari Fuel pool pemain. 1 Action.
function selfRefuel(unit) {
  if (unit.type !== 'apc' && unit.type !== 'corps') return { ok: false, message: 'Hanya APC/Corps yang bisa isi ulang sendiri.' };
  const def = unit.type === 'corps' ? CORPS_DEF : UNITS[unit.type];
  if (!def.hasFuel) return { ok: false, message: 'Unit ini tidak memakai Fuel.' };
  if (unit.attacked) return { ok: false, message: 'Unit ini sudah memakai Action giliran ini.' };
  const p = players[unit.owner];
  const missing = def.fuelMax - unit.fuel;
  if (missing <= 0) return { ok: false, message: 'Tangki sudah penuh.' };
  const given = Math.min(missing, p.resources.fuel);
  if (given <= 0) return { ok: false, message: 'Fuel pool habis.' };
  unit.fuel += given;
  p.resources.fuel -= given;
  Stats.use(p, 'fuel', given);
  unit.attacked = true; unit.mp = 0;
  actAdd(unit.owner, [[unitName(unit), 'unit'], [' '], ['refuel', 'fuel'], [' diri sendiri '], [String(given), 'fuel']]);
  return { ok: true, message: `Isi ulang +${given} Fuel.` };
}
