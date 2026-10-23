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
    const def = unitDef(u.type);
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

// ---------- v9.7: SATU pintu kematian unit ----------
// Semua jalur gugur (serangan, splash, bom, racun, bakar, Pengorbanan Terakhir) HARUS lewat sini
// agar Semangat Perjuangan, Penerus Tekad (batch A) dan statistik konsisten.
function killUnit(unit) {
  if (!unit || !units.includes(unit)) return;
  if (unit.type === 'infantry') players[unit.owner].infantrySpiritTurns = 2;   // Semangat Perjuangan
  units = units.filter(u => u.id !== unit.id);
  Stats.unitLost(unit.owner, unit.type);
  if (unit.cargo && unit.cargo.type === 'montir' && unit.cargo.unit) Stats.unitLost(unit.owner, unit.cargo.unit.type);   // Montir yang sedang diangkut ikut gugur
  if (typeof onUnitKilled === 'function') onUnitKilled(unit);                  // kait: Penerus Tekad (Advanced Infantry, batch A)
}
// Penerus Tekad (Advanced Infantry): tiap sekutu apa pun yang gugur memberi +1 tumpukan (maks 10) pada Advanced Infantry pemiliknya.
function onUnitKilled(unit) {
  for (const a of units)
    if (a.owner === unit.owner && a.type === 'advinfantry' && (a.legacyStacks || 0) < 10) a.legacyStacks = (a.legacyStacks || 0) + 1;
}
// HP ≤ 0: Tak Terkalahkan (Advanced Tank Lapis Baja) bisa menahan kematian sekali -> mode gugur ('downed'); selain itu gugur biasa.
function resolveUnitLethal(unit) {
  if (typeof advTryDowned === 'function' && advTryDowned(unit)) return 'downed';
  killUnit(unit);
  return 'dead';
}

// ---------- v10.1 (P6): bonus DEF Markas di awal permainan ----------
// +300% di giliran 1, berkurang tetap tiap giliran (300/19 ≈ 15,79 poin) hingga habis di giliran 20 (v10: 200% / giliran 15). Tidak berlaku di Campaign.
// Rumus: 300 × (20 − t) ÷ 19, t = turnNumber dijepit 1..20 → giliran 1 = 300%, 2 = 284,2%, 10 = 157,9%, 19 = 15,8%, ≥20 = 0%.
const MARKAS_BONUS_START = 300, MARKAS_BONUS_END_TURN = 20;
function markasDefBonusPct() {
  if (CAMPAIGN) return 0;
  const t = Math.min(Math.max(turnNumber, 1), MARKAS_BONUS_END_TURN);
  return MARKAS_BONUS_START * (MARKAS_BONUS_END_TURN - t) / (MARKAS_BONUS_END_TURN - 1);
}

// ---------- Formula Damage (Bagian 8) + kontribusi Kemampuan Unik (Bagian 5) ----------
// Damage = FinalATK * 100 / (100 + FinalDEF)
// Semua modifier % dikumpulkan dulu (dijumlahkan), baru dikalikan sekali ke stat dasar.
// v9.7 urutan (Bagian 6 butir 6): (a) ATK dasar + modifier % ATK; (b) Tembok Berjalan lalu pengali revive;
// (c) DEF dasar (+konversi) + modifier % DEF; (d) rumus; (e) specialRound; (f) pengali khusus.
// Dipecah agar bom (bombs.js) memakai rumus & perhitungan DEF target yang sama persis.
// baseDEFOverride (opsional): dipakai Penembusan (DEF dasar kendaraan dianggap 0).
function damageFormula(baseATK, atkPct, targetInfo, atkMult, baseDEFOverride, attackerOwner) {   // v11: attackerOwner (opsional) = pemilik penyerang/bom, untuk buff ATK World War
  let baseDEF = targetInfo.kind === 'unit' ? baseDEFOfUnit(targetInfo.obj) : targetInfo.def.def;
  if (baseDEFOverride !== undefined && baseDEFOverride !== null) baseDEF = baseDEFOverride;
  baseDEF *= statMul(targetInfo.ownerIdx);                       // v9.7: stat bot Campaign = 70%
  if (attackerOwner !== undefined && attackerOwner !== null) atkPct += wwAtkPct(attackerOwner);   // v11 (6.6): buff ATK World War (0 di mode lain)
  const finalATK = baseATK * (1 + atkPct / 100) * (atkMult || 1);

  const targetTerrain = mapData[targetInfo.obj.r][targetInfo.obj.c];
  let defPct = terrainDefModifierPct(targetTerrain, targetInfo.vehicle, targetInfo.tank);
  defPct += territoryDefModifierPct(targetInfo.ownerIdx, targetInfo.obj.r, targetInfo.obj.c);
  defPct += defenderAbilityDEFPct(targetInfo);
  if (targetInfo.kind === 'building' && targetInfo.obj.type === 'markas') defPct += markasDefBonusPct();   // v10.1 (P6)
  defPct += wwDefPct(targetInfo);                                                                          // v11 (6.6): buff DEF World War (0 di mode lain)
  const defFloor = (targetInfo.kind === 'building' && targetInfo.def.destructible !== false) ? 10 : 0;   // v9.5: DEF bangunan minimal 10
  const finalDEF = Math.max(defFloor, baseDEF * (1 + defPct / 100));

  return specialRound(finalATK * 100 / (100 + finalDEF));
}

function computeDamage(attackerUnit, targetInfo) {
  const baseATK = baseATKOf(attackerUnit) * statMul(attackerUnit.owner);   // Tembok Berjalan: 63 -> 25,2; v9.7: stat bot Campaign = 70%
  let atkPct = territoryATKBonusPct(attackerUnit.owner, attackerUnit.r, attackerUnit.c);
  atkPct += attackerAbilityATKPct(attackerUnit, targetInfo);
  // Penembusan (Advanced Anti-Tank): DEF dasar kendaraan dianggap 0
  const pierce = (attackerUnit.type === 'advantitank' && targetInfo.kind === 'unit' && targetInfo.vehicle) ? 0 : null;
  let damage = damageFormula(baseATK, atkPct, targetInfo, atkFinalMultiplier(attackerUnit), pierce, attackerUnit.owner);

  // Anti-Tank: Ayo Ledakkan (serangan tambahan saat menyerang kendaraan -> total 2x). Hanya tipe dasar 'antitank'.
  if (attackerUnit.type === 'antitank' && targetInfo.vehicle) damage *= 2;

  return damage;
}

// ---------- Kerusakan & kematian terpusat (dipakai serangan, splash, bom, racun, bakar) ----------
// Pemicu setelah unit terkena damage tapi selamat: Pengorbanan Terakhir (Advanced Infantry)
function afterUnitDamaged(u) {
  if (u.type === 'advinfantry' && !u.sacrificeUsed && u.hp < maxHpOf(u, UNITS.advinfantry) * 0.3) {
    u.sacrificeUsed = true;
    u.sacrificeState = 1;           // 1 = giliran bertindak berikutnya akan datang; 2 = sedang giliran bertindak
  }
}
// Kurangi HP unit; true bila unit gugur. Unit Tak Terkalahkan yang masuk mode gugur (downed) mengembalikan false (hp = 0).
function damageUnit(u, dmg, srcOwner, srcType) {
  const before = u.hp;
  u.hp -= dmg;
  Stats.dmg(srcOwner, srcType, 'unit', Math.min(dmg, before));
  if (u.hp <= 0) return resolveUnitLethal(u) === 'dead';
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
// opts.keepAction = true -> jangan hanguskan Action/MP (dipakai tembakan pertama Laras Kedua).
function applyAttack(attackerUnit, targetR, targetC, opts) {
  opts = opts || {};
  const target = describeTarget(targetR, targetC);
  if (!target) return { ok: false, message: 'Tidak ada target di tile itu.' };
  if (target.ownerIdx === attackerUnit.owner) return { ok: false, message: 'Tidak bisa menyerang unit/bangunan sendiri.' };
  if (target.kind === 'building' && target.def.destructible === false) return { ok: false, message: 'Bangunan ini tidak bisa dihancurkan.' };
  if (target.kind === 'unit' && target.obj.downed) return { ok: false, message: 'Unit sedang dalam mode gugur, tidak bisa diserang.' };

  const damage = computeDamage(attackerUnit, target);
  let destroyed;
  if (target.kind === 'unit') destroyed = damageUnit(target.obj, damage, attackerUnit.owner, attackerUnit.type);
  else destroyed = damageBuilding(target.ownerIdx, target.obj, damage, attackerUnit.owner, attackerUnit.type);
  const downed = target.kind === 'unit' && !destroyed && target.obj.hp <= 0;     // Tak Terkalahkan: mode gugur

  if (!destroyed && !downed) {
    if (target.kind === 'unit' && !target.def.combat) target.obj.speedDebuffTurns = 2;        // Bagian 6
    if (target.kind === 'unit' && attackerUnit.type === 'tankcrusher') target.obj.intimidatedTurns = 2; // Intimidasi
    if (target.kind === 'building' && attackerUnit.type === 'montir') target.obj.defDebuffTurns = 2;    // Penghancur Bangunan
    if (typeof advOnHitSurvive === 'function') advOnHitSurvive(attackerUnit, target);                   // v9.7: Kebocoran Minyak, Penembusan, Peluru Pembakar, Pantang Menyerah
  }

  // Montir: Perusak Formasi — splash 50% damage asli ke unit musuh di tile adjacent target
  // (pengecualian aturan "attack 1 tile"; hanya berlaku jika target utama adalah unit)
  const splashResults = [];
  if (attackerUnit.type === 'montir' && target.kind === 'unit') {
    const splashDmg = Math.floor(damage * 0.5);
    for (const [nr, nc] of neighborsOf(targetR, targetC)) {
      const other = units.find(u => u.r === nr && u.c === nc && u.owner !== attackerUnit.owner && !u.downed);
      if (!other) continue;
      const otherDestroyed = damageUnit(other, splashDmg, attackerUnit.owner, attackerUnit.type);
      if (!otherDestroyed && other.hp > 0 && typeof advOnHitSurvive === 'function') {
        advOnHitSurvive(attackerUnit, { kind: 'unit', obj: other, def: unitDef(other.type), ownerIdx: other.owner, vehicle: unitDef(other.type).vehicle }, true);
      }
      splashResults.push({ r: nr, c: nc, damage: splashDmg, destroyed: otherDestroyed });
    }
  }

  if (!opts.keepAction) {
    attackerUnit.attacked = true;
    attackerUnit.mp = 0; // 1 Action menghanguskan sisa MP
  }

  return {
    ok: true, damage, destroyed, downed, splashResults, targetKind: target.kind,
    targetName: target.kind === 'unit' ? unitDef(target.obj.type).name : BUILDING_TYPES[target.obj.type].name
  };
}

// ---------- Tile yang bisa diserang dari posisi unit saat ini ----------
function computeAttackable(unit) {
  const def = unitDef(unit.type);
  if (!def.combat) return [];
  if (isTrapperType(unit.type)) return [];   // v10.1 (P2): Trapper bukan penyerang (hanya memasang bom)
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (hexDistance(unit.r, unit.c, r, c) > effectiveRange(unit)) continue;
      const target = describeTarget(r, c);
      if (!target) continue;
      if (target.ownerIdx === unit.owner) continue;
      if (target.kind === 'building' && target.def.destructible === false) continue;
      if (target.kind === 'unit' && target.obj.downed) continue;           // v9.7: mode gugur (Tak Terkalahkan) tidak bisa ditarget
      if (target.kind === 'unit' && isUnitUnseen(target.obj)) continue; // belum terdeteksi, tak bisa ditarget
      out.push({ r, c });
    }
  }
  return out;
}
