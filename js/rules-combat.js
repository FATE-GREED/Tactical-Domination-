// ====================================================================
// rules-combat.js — Formula damage (Bagian 8), modifier terrain &
// territory, dan eksekusi serangan (mengubah HP, hapus unit/bangunan
// yang hancur, memicu efek speed debuff untuk unit Non-Combat).
// Belum termasuk Kemampuan Unik (Bagian 5) — itu Fase 6.
// ====================================================================

// ---------- Jarak hex (offset odd-r -> cube) ----------
function offsetToCube(row, col) {
  const x = col - (row - (row & 1)) / 2;
  const z = row;
  const y = -x - z;
  return { x, y, z };
}
function hexDistance(r1, c1, r2, c2) {
  const a = offsetToCube(r1, c1), b = offsetToCube(r2, c2);
  return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)) / 2;
}

// ---------- Deskriptor target seragam (unit ATAU bangunan) ----------
function describeTarget(r, c) {
  const u = units.find(uu => uu.r === r && uu.c === c);
  if (u) {
    const def = u.type === 'corps' ? CORPS_DEF : UNITS[u.type];
    return { kind: 'unit', obj: u, def, ownerIdx: u.owner, vehicle: def.vehicle, tank: def.tank };
  }
  for (let pi = 0; pi < players.length; pi++) {
    const b = buildingAt(r, c, pi);
    if (b) {
      const def = BUILDING_TYPES[b.type];
      return { kind: 'building', obj: b, def, ownerIdx: pi, vehicle: false, tank: false };
    }
  }
  return null;
}

// ---------- Modifier terrain terhadap DEF (Bagian 2, diterapkan sebagai pengurangan DEF) ----------
function terrainDefModifierPct(terrainKey, isVehicle, isTank) {
  let pct = 0;
  if (terrainKey === 'ruins' && !isVehicle) pct += 10;
  if (terrainKey === 'city') pct += 20;
  if (terrainKey === 'mountain' && isVehicle) pct -= 20;
  if (terrainKey === 'swamp' && isTank) pct -= 20;
  return pct;
}

// ---------- Modifier Territory (Bagian 8) ----------
function territoryATKBonusPct(ownerIdx, r, c) {
  return inTerritory(players[ownerIdx], r, c) ? 20 : 0;
}
function territoryDefModifierPct(ownerIdx, r, c) {
  const own = players[ownerIdx], enemy = players[1 - ownerIdx];
  if (inTerritory(own, r, c)) return 20;
  if (inTerritory(enemy, r, c)) return -20;
  return 0;
}

// Pembulatan khusus (Bagian 8): 0,5 ke bawah -> turun; 0,6 ke atas -> naik
function specialRound(x) {
  const floor = Math.floor(x);
  const frac = x - floor;
  return frac <= 0.5 ? floor : Math.ceil(x);
}

// ---------- Formula Damage (Bagian 8) + kontribusi Kemampuan Unik (Bagian 5) ----------
// Damage = FinalATK * 100 / (100 + FinalDEF)
// Semua modifier % dikumpulkan dulu (dijumlahkan), baru dikalikan sekali ke stat dasar.
// v9.7: dipecah agar bom (bombs.js) memakai rumus & perhitungan DEF target yang sama persis.
function damageFormula(baseATK, atkPct, targetInfo, atkMult) {
  const baseDEF = targetInfo.def.def;
  const finalATK = baseATK * (1 + atkPct / 100) * (atkMult || 1);

  const targetTerrain = mapData[targetInfo.obj.r][targetInfo.obj.c];
  let defPct = terrainDefModifierPct(targetTerrain, targetInfo.vehicle, targetInfo.tank);
  defPct += territoryDefModifierPct(targetInfo.ownerIdx, targetInfo.obj.r, targetInfo.obj.c);
  defPct += defenderAbilityDEFPct(targetInfo);
  const defFloor = (targetInfo.kind === 'building' && targetInfo.def.destructible !== false) ? 10 : 0;   // v9.5: DEF bangunan minimal 10
  const finalDEF = Math.max(defFloor, baseDEF * (1 + defPct / 100));

  return specialRound(finalATK * 100 / (100 + finalDEF));
}

function computeDamage(attackerUnit, targetInfo) {
  const atkDef = attackerUnit.type === 'corps' ? CORPS_DEF : UNITS[attackerUnit.type];
  let atkPct = territoryATKBonusPct(attackerUnit.owner, attackerUnit.r, attackerUnit.c);
  atkPct += attackerAbilityATKPct(attackerUnit, targetInfo);
  const mult = attackerUnit.sacrificeState === 2 ? 2 : 1;      // v9.7 Pengorbanan Terakhir: ATK x2 (pengali pada nilai akhir)
  let damage = damageFormula(atkDef.atk, atkPct, targetInfo, mult);

  // Anti-Tank: Ayo Ledakkan (serangan tambahan saat menyerang kendaraan -> total 2x)
  if (attackerUnit.type === 'antitank' && targetInfo.vehicle) damage *= 2;

  return damage;
}

// ---------- v9.7: jalur kematian & kerusakan terpusat ----------
// Semua penghapusan unit lewat killUnit() agar Semangat Perjuangan, Penerus Tekad, dan Stats konsisten.
function killUnit(u) {
  if (!units.includes(u)) return;
  units = units.filter(x => x.id !== u.id);
  Stats.unitLost(u.owner, u.type);
  if (u.type === 'infantry') players[u.owner].infantrySpiritTurns = 2;           // Semangat Perjuangan
  for (const a of units)                                                         // Penerus Tekad: +1 tumpukan per sekutu gugur
    if (a.owner === u.owner && a.type === 'advinfantry' && (a.legacyStacks || 0) < 10) a.legacyStacks = (a.legacyStacks || 0) + 1;
}

// Pemicu setelah unit terkena damage tapi selamat
function afterUnitDamaged(u) {
  if (u.type === 'advinfantry' && !u.sacrificeUsed && u.hp < UNITS.advinfantry.hp * 0.3) {   // Pengorbanan Terakhir
    u.sacrificeUsed = true;
    u.sacrificeState = 1;           // 1 = giliran bertindak berikutnya akan datang; 2 = sedang giliran bertindak
  }
}

// Kurangi HP unit; mengembalikan true bila unit gugur
function damageUnit(u, dmg, srcOwner, srcType) {
  const before = u.hp;
  u.hp -= dmg;
  Stats.dmg(srcOwner, srcType, 'unit', Math.min(dmg, before));
  if (u.hp <= 0) { killUnit(u); return true; }
  afterUnitDamaged(u);
  return false;
}

function destroyBuilding(ownerIdx, b) {
  Stats.bldLost(ownerIdx, b.type);
  const p = players[ownerIdx];
  p.buildings = p.buildings.filter(x => x !== b);
  checkWinCondition();
}
function damageBuilding(ownerIdx, b, dmg, srcOwner, srcType) {
  const before = b.hp;
  b.hp -= dmg;
  Stats.dmg(srcOwner, srcType, 'building', Math.min(dmg, before));
  if (b.hp <= 0) { destroyBuilding(ownerIdx, b); return true; }
  return false;
}

// ---------- Eksekusi serangan: 1 unit, 1 tile target, hasil instan ----------
function applyAttack(attackerUnit, targetR, targetC) {
  const target = describeTarget(targetR, targetC);
  if (!target) return { ok: false, message: 'Tidak ada target di tile itu.' };
  if (target.ownerIdx === attackerUnit.owner) return { ok: false, message: 'Tidak bisa menyerang unit/bangunan sendiri.' };
  if (target.kind === 'building' && target.def.destructible === false) return { ok: false, message: 'Garnisun tidak bisa dihancurkan.' };

  const damage = computeDamage(attackerUnit, target);
  let destroyed;
  if (target.kind === 'unit') destroyed = damageUnit(target.obj, damage, attackerUnit.owner, attackerUnit.type);
  else destroyed = damageBuilding(target.ownerIdx, target.obj, damage, attackerUnit.owner, attackerUnit.type);

  if (!destroyed) {
    if (target.kind === 'unit' && !target.def.combat) target.obj.speedDebuffTurns = 2;        // Bagian 6
    if (target.kind === 'unit' && attackerUnit.type === 'tankcrusher') target.obj.intimidatedTurns = 2; // Intimidasi
    if (target.kind === 'building' && attackerUnit.type === 'montir') target.obj.defDebuffTurns = 2;    // Penghancur Bangunan
  }

  // Montir: Perusak Formasi — splash 50% damage asli ke unit musuh di tile adjacent target
  // (pengecualian aturan "attack 1 tile"; hanya berlaku jika target utama adalah unit)
  const splashResults = [];
  if (attackerUnit.type === 'montir' && target.kind === 'unit') {
    const splashDmg = Math.floor(damage * 0.5);
    for (const [nr, nc] of neighborsOf(targetR, targetC)) {
      const other = units.find(u => u.r === nr && u.c === nc && u.owner !== attackerUnit.owner);
      if (!other) continue;
      const otherDestroyed = damageUnit(other, splashDmg, attackerUnit.owner, attackerUnit.type);
      splashResults.push({ r: nr, c: nc, damage: splashDmg, destroyed: otherDestroyed });
    }
  }

  attackerUnit.attacked = true;
  attackerUnit.mp = 0; // 1 Action menghanguskan sisa MP

  return {
    ok: true, damage, destroyed, splashResults, targetKind: target.kind,
    targetName: target.kind === 'unit' ? (target.obj.type === 'corps' ? 'Corps' : UNITS[target.obj.type].name) : BUILDING_TYPES[target.obj.type].name
  };
}

// ---------- Tile yang bisa diserang dari posisi unit saat ini ----------
function computeAttackable(unit) {
  const def = unit.type === 'corps' ? CORPS_DEF : UNITS[unit.type];
  if (!def.combat) return [];
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (hexDistance(unit.r, unit.c, r, c) > effectiveRange(unit)) continue;
      const target = describeTarget(r, c);
      if (!target) continue;
      if (target.ownerIdx === unit.owner) continue;
      if (target.kind === 'building' && target.def.destructible === false) continue;
      if (target.kind === 'unit' && isUnitUnseen(target.obj)) continue; // belum terdeteksi, tak bisa ditarget
      out.push({ r, c });
    }
  }
  return out;
}
