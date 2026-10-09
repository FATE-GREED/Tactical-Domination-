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
    const b = players[pi].buildings.find(bb => bb.r === r && bb.c === c);
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
function computeDamage(attackerUnit, targetInfo) {
  const atkDef = attackerUnit.type === 'corps' ? CORPS_DEF : UNITS[attackerUnit.type];
  const baseATK = atkDef.atk;
  const baseDEF = targetInfo.def.def;

  let atkPct = territoryATKBonusPct(attackerUnit.owner, attackerUnit.r, attackerUnit.c);
  atkPct += attackerAbilityATKPct(attackerUnit, targetInfo);
  const finalATK = baseATK * (1 + atkPct / 100);

  const targetTerrain = mapData[targetInfo.obj.r][targetInfo.obj.c];
  let defPct = terrainDefModifierPct(targetTerrain, targetInfo.vehicle, targetInfo.tank);
  defPct += territoryDefModifierPct(targetInfo.ownerIdx, targetInfo.obj.r, targetInfo.obj.c);
  defPct += defenderAbilityDEFPct(targetInfo);
  const finalDEF = Math.max(0, baseDEF * (1 + defPct / 100));

  const raw = finalATK * 100 / (100 + finalDEF);
  let damage = specialRound(raw);

  // Anti-Tank: Ayo Ledakkan (serangan tambahan saat menyerang kendaraan -> total 2x)
  if (attackerUnit.type === 'antitank' && targetInfo.vehicle) damage *= 2;

  return damage;
}

// ---------- Eksekusi serangan: 1 unit, 1 tile target, hasil instan ----------
function applyAttack(attackerUnit, targetR, targetC) {
  const target = describeTarget(targetR, targetC);
  if (!target) return { ok: false, message: 'Tidak ada target di tile itu.' };
  if (target.ownerIdx === attackerUnit.owner) return { ok: false, message: 'Tidak bisa menyerang unit/bangunan sendiri.' };
  if (target.kind === 'building' && target.def.destructible === false) return { ok: false, message: 'Garnisun tidak bisa dihancurkan.' };

  const damage = computeDamage(attackerUnit, target);
  const hpBefore = target.obj.hp;
  target.obj.hp -= damage;
  Stats.dmg(attackerUnit.owner, attackerUnit.type, target.kind, Math.min(damage, hpBefore));

  let destroyed = false;
  if (target.obj.hp <= 0) {
    destroyed = true;
    if (target.kind === 'unit') {
      if (target.obj.type === 'infantry') players[target.ownerIdx].infantrySpiritTurns = 2; // Semangat Perjuangan
      units = units.filter(u => u.id !== target.obj.id);
      Stats.unitLost(target.ownerIdx, target.obj.type);
    } else {
      const p = players[target.ownerIdx];
      Stats.bldLost(target.ownerIdx, target.obj.type);
      p.buildings = p.buildings.filter(b => b !== target.obj);
      checkWinCondition();
    }
  } else {
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
      const otherBefore = other.hp;
      other.hp -= splashDmg;
      Stats.dmg(attackerUnit.owner, attackerUnit.type, 'unit', Math.min(splashDmg, otherBefore));
      let otherDestroyed = false;
      if (other.hp <= 0) {
        otherDestroyed = true;
        if (other.type === 'infantry') players[other.owner].infantrySpiritTurns = 2;
        units = units.filter(u => u.id !== other.id);
        Stats.unitLost(other.owner, other.type);
      }
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
