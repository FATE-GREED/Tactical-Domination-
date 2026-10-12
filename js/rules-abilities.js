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
  const def = unitDef(unit.type);
  let spd = def.spd;
  if (unit.type === 'apc' && unit.cargo && unit.cargo.type === 'corps') spd = def.spd + 5; // Dikejar Waktu (bonus tetap +5 dari SPD dasar)
  if (unit.type === 'corps' && !unit.cargo) spd += 2;                             // Jangan Menganggur
  if (unit.type === 'assault' && isUnitUnseen(unit)) {                            // Serangan Kejut: SPD+2 saat unseen
    const enemyWithin5 = units.some(e => e.owner !== unit.owner && hexDistance(unit.r, unit.c, e.r, e.c) <= 5);
    if (!enemyWithin5) spd += 2; // hilang seketika kalau ada musuh dalam radius 5 tile
  }
  // ---- v9.7 Advanced (batch B) ----
  if (unit.type === 'advcorps') spd += unit.cargo ? 3 : -3;                        // Semangat Kerja: 7 tanpa muatan, 13 membawa muatan
  if (unit.type === 'advapc') {
    if (advApcOverloaded(unit)) spd -= 3;                                          // Kelebihan Muatan
    if (unit.toughTurns > 0) spd += 2;                                             // Pantang Menyerah (dikurangi 1 di startTurn setelah SPD dihitung)
  }
  if (unit.type === 'advtankcrusher' && isBeraniMati(unit)) spd += 2;              // Pasukan Berani Mati
  return spd;
}

// ---------- v9.7 Advanced: helper kondisi (Bagian 5) ----------
// Kelebihan Muatan: SPD −3 selama muatan > 70% kapasitas DASAR (Fuel > 70, Medical > 35; Corps/Montir = 100% -> selalu).
function advApcOverloaded(unit) {
  if (!unit.cargo) return false;
  if (unit.cargo.type === 'corps' || unit.cargo.type === 'montir') return true;
  const baseCap = unit.cargo.type === 'fuel' ? 100 : 50;
  return unit.cargo.amount > baseCap * 0.7;
}
// Pasukan Berani Mati: aktif selama HP < 40% HP maks (dievaluasi terus-menerus)
function isBeraniMati(unit) { return unit.type === 'advtankcrusher' && unit.hp < unitDef(unit.type).hp * 0.4; }
// ATK dasar efektif: Tembok Berjalan mengubah 60% ATK dasar menjadi DEF -> ATK efektif 63 × 0,4 = 25,2
function baseATKOf(unit) {
  const def = unitDef(unit.type);
  return unit.type === 'advtanklapis' ? def.atk * 0.4 : def.atk;
}
// Pengali ATK akhir setelah semua modifier persen: Tak Terkalahkan (setelah hidup lagi: ATK ×0,5 permanen)
function atkFinalMultiplier(unit) { return unit.weakened ? 0.5 : 1; }
// DEF dasar efektif target unit: Tembok Berjalan (45 + 63×0,6÷2 = 63,9) dan Pasukan Berani Mati (DEF dasar 0)
function baseDEFOfUnit(unit) {
  const def = unitDef(unit.type);
  if (isBeraniMati(unit)) return 0;
  if (unit.type === 'advtanklapis') return def.def + (def.atk * 0.6) / 2;
  return def.def;
}

// ---------- Anti-Tank: Semangat Besi (+2 MP sekali/giliran jika ada kendaraan dalam jarak 2 tile) ----------
// Dipanggil dari input.js saat unit mulai dipilih untuk bergerak (startMoveMode).
function applySemangatBesi(unit) {
  if (unit.type !== 'antitank' || unit.semangatBesiUsed) return;
  // Ada kendaraan (sekutu MAUPUN musuh) dalam jarak 2 tile
  const nearVehicle = units.some(o => {
    if (o.id === unit.id || o.type === 'corps') return false;
    if (hexDistance(unit.r, unit.c, o.r, o.c) > 2) return false;
    return !!UNITS[o.type].vehicle;
  });
  if (nearVehicle) {
    unit.mp += 2;
    unit.semangatBesiUsed = true;
  }
}

// ---------- Infantry: Moral Persatuan (v9.5: ada unit sekutu apapun dalam jarak 2 tile) ----------
function hasAllyNearby(unit, range) {
  return units.some(o => o.id !== unit.id && o.owner === unit.owner && hexDistance(unit.r, unit.c, o.r, o.c) <= range);
}

// ---------- Tank Lapis Baja: Sang Pelindung (proteksi ke SEKUTU dalam jangkauan 2 tile, bukan diri sendiri) ----------
function hasAdjacentAllyProtector(unit) {   // nama lama dipertahankan; jangkauan kini 2 tile
  return units.some(other => other.id !== unit.id && other.owner === unit.owner && other.type === 'tanklapis' &&
    hexDistance(unit.r, unit.c, other.r, other.c) <= 2);
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

  // v9.7 Advanced Tank Crusher: Laras Kedua (ATK tiap tembakan −45%) & Pasukan Berani Mati (ATK +10% saat HP < 40%)
  if (attackerUnit.type === 'advtankcrusher') {
    pct -= 45;
    if (isBeraniMati(attackerUnit)) pct += 10;
  }

  return pct;
}

// ---------- Kontribusi % DEF dari kemampuan unik milik target (bisa unit atau bangunan) ----------
function defenderAbilityDEFPct(targetInfo) {
  let pct = 0;

  if (targetInfo.kind === 'unit') {
    const u = targetInfo.obj;
    const def = targetInfo.def;

    if (u.type === 'infantry' && hasAllyNearby(u, 2)) pct += 20;        // Moral Persatuan
    if (u.type === 'tanklapis' && u.hp < def.hp * 0.5) pct += 50;              // Pejuang Bertahan
    if (hasAdjacentAllyProtector(u)) pct += 20;                                // Sang Pelindung (dari sekutu)
    if (u.type === 'apc' && u.cargo) pct += 20;                                // Kurir Setia
    if (u.type === 'corps' && u.isBuilding) pct += 20;                         // Kerja Sampai Tuntas
    if (u.intimidatedTurns > 0) pct -= 20;                                     // kena Intimidasi (Tank Crusher)
    if (u.type === 'advapc' && u.toughTurns > 0) pct += 20;                    // Pantang Menyerah (Advanced APC)
    if (u.pierceTurns > 0) pct -= 20;                                          // kena Penembusan (Advanced Anti-Tank); menjumlah dengan debuff lain
  } else if (targetInfo.kind === 'building') {
    const b = targetInfo.obj;
    if (b.defDebuffTurns > 0) pct -= 30;                                       // kena Penghancur Bangunan (Montir)
  }

  return pct;
}

// ---------- v9.6: daftar ikon efek yang SEDANG aktif pada sebuah unit (untuk ikon di atas bar HP) ----------
// Hanya efek berbasis keadaan (timer / status / posisi). Efek yang baru terhitung saat serangan
// (Konsentrasi Tinggi, Ayo Ledakkan, Perusak Formasi) tidak punya keadaan menetap, jadi tidak ditampilkan.
function activeAbilityIcons(u) {
  const out = [];
  const owner = players[u.owner];
  const seen = e => isVisibleToCurrentPlayer(e);
  switch (u.type) {
    case 'infantry':
      if (hasAllyNearby(u, 2)) out.push('Moral Persatuan');
      if (owner && owner.infantrySpiritTurns > 0) out.push('Semangat Perjuangan');
      break;
    case 'assault':
      if (u.ambushAtkTimer > 0) out.push('Serangan Kejut');
      if (u.assaultExtend > 0 && isUnitUnseen(u)) out.push('Yang Tersembunyi');
      break;
    case 'sniper':
      if (!units.some(e => e !== u && e.owner === u.owner && hexDistance(u.r, u.c, e.r, e.c) <= 5)) out.push('Sang Pengamat');
      break;
    case 'antitank':
      if (u.semangatBesiUsed) out.push('Semangat Besi');
      break;
    case 'tanklapis':
      if (u.hp < UNITS.tanklapis.hp * 0.5) out.push('Pejuang Bertahan');
      break;
    case 'tankcrusher': {
      const range = effectiveRange(u);
      if (units.some(e => e.owner !== u.owner && seen(e) && hexDistance(u.r, u.c, e.r, e.c) <= range)) out.push('Penggila Perang');
      break;
    }
    case 'apc':
      if (u.cargo && u.cargo.type === 'corps') out.push('Dikejar Waktu');
      if (u.cargo) out.push('Kurir Setia');
      break;
    case 'corps':
      if (!u.cargo) out.push('Jangan Menganggur');
      if (u.isBuilding) out.push('Kerja Sampai Tuntas');
      break;
    // ---- v9.7 Advanced (hanya efek berbasis keadaan) ----
    case 'advtanklapis':
      out.push('Tembok Berjalan');
      if (u.weakened) out.push('Tak Terkalahkan');                                // sudah dipakai: ATK −50% permanen
      break;
    case 'advtankcrusher':
      if (isBeraniMati(u)) out.push('Pasukan Berani Mati');
      break;
    case 'advapc':
      if (advApcOverloaded(u)) out.push('Kelebihan Muatan');
      if (u.toughTurns > 0) out.push('Pantang Menyerah');
      break;
    case 'advcorps':
      out.push('Semangat Kerja');
      if (players[u.owner] && !players[u.owner].rushUsed) out.push('Percepatan Pembangunan');
      break;
  }
  if (u.leakTurns > 0 && u.leakStacks > 0) out.push('Kebocoran Minyak');          // kena Advanced Anti-Tank
  if (u.pierceTurns > 0) out.push('Penembusan');
  if (hasAdjacentAllyProtector(u)) out.push('Sang Pelindung');          // diterima dari Tank Lapis Baja sekutu
  if (u.intimidatedTurns > 0) out.push('Intimidasi');                   // kena Tank Crusher
  if (owner && inTerritory(owner, u.r, u.c)) out.push('Wilayah Markas'); // efek bangunan (Markas): ATK/DEF +20%
  return out;
}

// Ikon efek aktif pada sebuah bangunan
function buildingStatusIcons(b) {
  const out = [];
  if (b.defDebuffTurns > 0) out.push('Penghancur Bangunan');
  if (b.burnTurns > 0 && b.burnStacks > 0) out.push('Peluru Pembakar');            // v9.7: terbakar (Advanced Montir)
  return out;
}
