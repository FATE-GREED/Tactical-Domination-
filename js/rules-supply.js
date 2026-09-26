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
function startBuild(corps, type) {
  if (corps.type !== 'corps') return { ok: false, message: 'Hanya Corps yang bisa membangun.' };
  if (corps.isBuilding) return { ok: false, message: 'Corps ini sudah sedang membangun.' };
  if (corps.attacked) return { ok: false, message: 'Corps ini sudah memakai Action giliran ini.' };
  const spec = BUILDING_TYPES[type];
  if (!spec || spec.corpsRequired !== 1) return { ok: false, message: 'Bangunan ini belum didukung sistem Build (butuh >1 Corps).' };

  const owner = players[corps.owner];
  const existingCount = owner.buildings.filter(b => b.type === type).length;
  if (existingCount >= spec.maxCount) return { ok: false, message: `Sudah mencapai batas maksimal ${spec.name} (${spec.maxCount}).` };

  const terr = mapData[corps.r][corps.c];
  if (type === 'jembatan') {
    if (terr !== 'river') return { ok: false, message: 'Jembatan wajib dibangun di atas tile River.' };
  } else if (terr !== 'grass') {
    return { ok: false, message: 'Bangunan ini wajib dibangun di tile Grass.' };
  }

  corps.isBuilding = true;
  corps.buildType = type;
  corps.buildTurnsRemaining = spec.turnsRequired;
  corps.attacked = true; // Build = 1 Action, menghanguskan sisa MP
  corps.mp = 0;
  return { ok: true, message: `Mulai membangun ${spec.name} (${spec.turnsRequired} giliran).` };
}

// Dipanggil dari rules-economy.js startTurn(): proses konstruksi yang sedang berjalan.
// Jika Corps mati di tengah proses, project otomatis gugur (Corps sudah tidak ada di units).
function processBuildProgress(pIdx) {
  const p = players[pIdx];
  for (const u of units.filter(u => u.owner === pIdx && u.isBuilding)) {
    u.buildTurnsRemaining--;
    if (u.buildTurnsRemaining <= 0) {
      const spec = BUILDING_TYPES[u.buildType];
      p.buildings.push({ r: u.r, c: u.c, type: u.buildType, hp: spec.hp, defDebuffTurns: 0 });
      units = units.filter(uu => uu.id !== u.id); // Corps terpakai habis jadi bangunan
    }
  }
}

// ---------- Cargo: muat / bongkar ----------
function cargoCapacity(unit, cargoType) {
  if (unit.type === 'apc') return cargoType === 'fuel' ? 100 : cargoType === 'medical' ? 20 : 1;
  if (unit.type === 'corps') return cargoType === 'fuel' ? 50 : cargoType === 'medical' ? 10 : 0;
  return 0;
}

// Muat Fuel/Medical dari pool pemain ke unit (APC atau Corps), maksimal kapasitas. 1 Action.
function loadCargo(unit, cargoType) {
  if (unit.type !== 'apc' && unit.type !== 'corps') return { ok: false, message: 'Hanya APC/Corps yang bisa membawa muatan.' };
  if (unit.cargo) return { ok: false, message: 'Unit ini sudah membawa muatan (1 jenis saja).' };
  if (unit.attacked) return { ok: false, message: 'Unit ini sudah memakai Action giliran ini.' };
  const p = players[unit.owner];
  const cap = cargoCapacity(unit, cargoType);
  const amount = Math.min(cap, p.resources[cargoType]);
  if (amount <= 0) return { ok: false, message: `Tidak ada ${cargoType} tersisa di pool.` };
  p.resources[cargoType] -= amount;
  unit.cargo = { type: cargoType, amount };
  unit.attacked = true; unit.mp = 0;
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
  return { ok: true, message: 'Corps naik ke APC.' };
}

// Turunkan Corps dari APC ke tile kosong bersebelahan. 1 Action.
function unloadCorpsFromAPC(apc) {
  if (!apc.cargo || apc.cargo.type !== 'corps') return { ok: false, message: 'APC tidak membawa Corps.' };
  if (apc.attacked) return { ok: false, message: 'APC sudah memakai Action giliran ini.' };
  const spot = emptyAdjacent(apc.r, apc.c, CORPS_DEF);
  if (!spot) return { ok: false, message: 'Tidak ada tile kosong di sekitar APC untuk menurunkan Corps.' };
  const corpsUnit = apc.cargo.unit;
  corpsUnit.r = spot.r; corpsUnit.c = spot.c;
  corpsUnit.mp = 0; corpsUnit.attacked = true;
  units.push(corpsUnit);
  apc.cargo = null;
  apc.attacked = true; apc.mp = 0;
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
  healer.attacked = true; healer.mp = 0;
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
  unit.attacked = true; unit.mp = 0;
  return { ok: true, message: `Isi ulang +${given} Fuel.` };
}
