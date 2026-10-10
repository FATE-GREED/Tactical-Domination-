// ====================================================================
// rules-abilities.js — Kemampuan Unik (Bagian 5). Modul ini menghitung
// modifier ATK/DEF/Speed/JPD dari kemampuan unit; efek yang mengubah
// state permanen saat serangan (Intimidasi, Penghancur Bangunan,
// Semangat Perjuangan, Perusak Formasi) dieksekusi di rules-combat.js
// applyAttack() karena memang bagian dari resolusi serangan.
//
// Aturan stacking (Bagian 5): buff dari kemampuan YANG SAMA tidak
// ditumpuk meski sumbernya beda unit — semua fungsi di bawah ini
// mengecek KEBERADAAN kondisi (bukan menjumlah per sumber), kecuali
// Penggila Perang yang memang didesain naik bertahap sampai cap.
// ====================================================================

// ---------- Speed efektif (dipakai rules-economy.js saat set MP awal giliran) ----------
function effectiveSpeed(unit) {
  const def = unit.type === 'corps' ? CORPS_DEF : UNITS[unit.type];
  let spd = def.spd;
  if (unit.type === 'apc' && unit.cargo && unit.cargo.type === 'corps') spd = def.spd + 4; // Dikejar Waktu (bonus tetap +4 dari SPD dasar)
  if (unit.type === 'corps' && !unit.cargo) spd += 2;                             // Jangan Menganggur
  if (unit.type === 'assault' && isUnitUnseen(unit)) {                            // Serangan Kejut: SPD+2 saat unseen
    const enemyWithin5 = units.some(e => e.owner !== unit.owner && hexDistance(unit.r, unit.c, e.r, e.c) <= 5);
    if (!enemyWithin5) spd += 2; // hilang seketika kalau ada musuh dalam radius 5 tile
  }
  return spd;
}

// ---------- Anti-Tank: Semangat Besi (+2 MP sekali/giliran jika bersebelahan kendaraan) ----------
// Dipanggil dari input.js saat unit mulai dipilih untuk bergerak (startMoveMode).
function applySemangatBesi(unit) {
  if (unit.type !== 'antitank' || unit.semangatBesiUsed) return;
  const adjacentVehicle = neighborsOf(unit.r, unit.c).some(([nr, nc]) => {
    const o = units.find(u => u.r === nr && u.c === nc);
    if (!o) return false;
    const d = o.type === 'corps' ? CORPS_DEF : UNITS[o.type];
    return d.vehicle;
  });
  if (adjacentVehicle) {
    unit.mp += 2;
    unit.semangatBesiUsed = true;
  }
}

// ---------- Infantry: Moral Persatuan (>=3 Infantry sekutu saling terhubung adjacency) ----------
function infantryGroupSize(unit) {
  const visited = new Set([unit.id]);
  const stack = [unit];
  while (stack.length) {
    const cur = stack.pop();
    for (const [nr, nc] of neighborsOf(cur.r, cur.c)) {
      const other = units.find(u => u.r === nr && u.c === nc && u.type === 'infantry' && u.owner === unit.owner);
      if (other && !visited.has(other.id)) { visited.add(other.id); stack.push(other); }
    }
  }
  return visited.size;
}

// ---------- Tank Lapis Baja: Sang Pelindung (proteksi ke SEKUTU adjacent, bukan diri sendiri) ----------
function hasAdjacentAllyProtector(unit) {
  return neighborsOf(unit.r, unit.c).some(([nr, nc]) => {
    const other = units.find(u => u.r === nr && u.c === nc);
    return other && other.id !== unit.id && other.owner === unit.owner && other.type === 'tanklapis';
  });
}

// ---------- Kontribusi % ATK dari kemampuan unik milik attacker ----------
function attackerAbilityATKPct(attackerUnit, targetInfo) {
  let pct = 0;
  const owner = players[attackerUnit.owner];

  // Infantry: Semangat Perjuangan (buff seluruh Infantry pemilik selama 2 giliran usai 1 gugur)
  if (attackerUnit.type === 'infantry' && owner.infantrySpiritTurns > 0) pct += 20;

  // Assault: Serangan Kejut — +20% ATK selama unit "dalam status penyergapan":
  // aktif kalau sedang unseen, dan tetap bertahan 2 giliran SEJAK kehilangan
  // status unseen (jadi kalau terus unseen, bonusnya terus menyala tanpa luntur).
  if (attackerUnit.type === 'assault' && attackerUnit.ambushAtkTimer > 0) pct += 20;

  // Sniper: Konsentrasi Tinggi (bonus berdasar jarak tembak vs Range)
  if (attackerUnit.type === 'sniper') {
    const dist = targetInfo.kind === 'building' ? distToBuilding(attackerUnit.r, attackerUnit.c, targetInfo.obj) : hexDistance(attackerUnit.r, attackerUnit.c, targetInfo.obj.r, targetInfo.obj.c);
    const range = effectiveRange(attackerUnit);
    if (dist === range) pct += 30;
    else if (dist === range - 1) pct += 20;
    else if (dist === range - 2) pct += 10;
  }

  // Tank Crusher: Penggila Perang (+5%/musuh dalam jangkauan, maks +20% pada 4 musuh — BOLEH bertahap)
  if (attackerUnit.type === 'tankcrusher') {
    const range = effectiveRange(attackerUnit);
    let enemyCount = 0;
    for (const u of units) {
      if (u.owner === attackerUnit.owner) continue;
      if (hexDistance(attackerUnit.r, attackerUnit.c, u.r, u.c) <= range) enemyCount++;
    }
    pct += Math.min(4, enemyCount) * 5;
  }

  return pct;
}

// ---------- Kontribusi % DEF dari kemampuan unik milik target (bisa unit atau bangunan) ----------
function defenderAbilityDEFPct(targetInfo) {
  let pct = 0;

  if (targetInfo.kind === 'unit') {
    const u = targetInfo.obj;
    const def = targetInfo.def;

    if (u.type === 'infantry' && infantryGroupSize(u) >= 3) pct += 20;        // Moral Persatuan
    if (u.type === 'tanklapis' && u.hp < def.hp * 0.5) pct += 50;              // Pejuang Bertahan
    if (hasAdjacentAllyProtector(u)) pct += 20;                                // Sang Pelindung (dari sekutu)
    if (u.type === 'apc' && u.cargo) pct += 20;                                // Kurir Setia
    if (u.type === 'corps' && u.isBuilding) pct += 20;                         // Kerja Sampai Tuntas
    if (u.intimidatedTurns > 0) pct -= 20;                                     // kena Intimidasi (Tank Crusher)
  } else if (targetInfo.kind === 'building') {
    const b = targetInfo.obj;
    if (b.defDebuffTurns > 0) pct -= 20;                                       // kena Penghancur Bangunan (Montir)
  }

  return pct;
}
