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
  if (unit.type === 'apc' && unit.cargo && unit.cargo.type === 'corps') spd = def.spd + 5; // Dikejar Waktu (bonus tetap +5 dari SPD dasar)
  if (unit.type === 'corps' && !unit.cargo) spd += 2;                             // Jangan Menganggur
  if (unit.type === 'assault' && isUnitUnseen(unit)) {                            // Serangan Kejut: SPD+2 saat unseen
    const enemyWithin5 = units.some(e => e.owner !== unit.owner && hexDistance(unit.r, unit.c, e.r, e.c) <= 5);
    if (!enemyWithin5) spd += 2; // hilang seketika kalau ada musuh dalam radius 5 tile
  }
  // ---- v9.7 unit Advanced ----
  if (unit.type === 'advassault') {                                               // Lompatan Seketika: siklus 3 giliran
    spd = (unit.jumpCycle || 0) === 3 ? def.spd + 6 : def.spd - 3;
  }
  if (unit.type === 'advinfantry' && unit.sacrificeState === 2) spd *= 2;         // Pengorbanan Terakhir (giliran bertindak)
  return spd;
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
    if (u.type === 'advinfantry') pct += 2 * Math.min(10, u.legacyStacks || 0); // Penerus Tekad: +2% per tumpukan (maks 10)
  } else if (targetInfo.kind === 'building') {
    const b = targetInfo.obj;
    if (b.defDebuffTurns > 0) pct -= 30;                                       // kena Penghancur Bangunan (Montir)
    if (b.bombDefTurns > 0) pct -= 30;                                         // kena Pembuat Onar (bom Trapper) — medan terpisah
    if (b.toxinTurns > 0) pct -= 20;                                           // kena Bom Beracun (bom Advanced Trapper)
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
    // ---- v9.7: hanya efek yang sedang aktif (berbasis keadaan) ----
    case 'trapper':
      if (bombs.some(b => b.trapperId === u.id && b.special)) out.push('Keberuntungan');
      break;
    case 'advinfantry':
      if ((u.legacyStacks || 0) > 0) out.push('Penerus Tekad');
      if (u.sacrificeState > 0) out.push('Pengorbanan Terakhir');
      break;
    case 'advassault':
      if (u.jumpCycle === 3) out.push('Lompatan Seketika');
      if (u.camo) out.push('Teknik Kamuflase');
      break;
    case 'advsniper':
      if (u.eagerTurns > 0) out.push('Mata Elang');
      if (u.focusTurns > 0) out.push('Titik Fokus');
      break;
    case 'advtrapper':
      if (bombs.some(b => b.trapperId === u.id && b.active)) out.push('Hadiah Kejutan');
      break;
  }
  if (u.toxinTurns > 0) out.push('Bom Beracun');                        // korban Advanced Trapper
  if (hasAdjacentAllyProtector(u)) out.push('Sang Pelindung');          // diterima dari Tank Lapis Baja sekutu
  if (u.intimidatedTurns > 0) out.push('Intimidasi');                   // kena Tank Crusher
  if (owner && inTerritory(owner, u.r, u.c)) out.push('Wilayah Markas'); // efek bangunan (Markas): ATK/DEF +20%
  return out;
}

// Ikon efek aktif pada sebuah bangunan
function buildingStatusIcons(b) {
  const out = [];
  if (b.defDebuffTurns > 0) out.push('Penghancur Bangunan');
  if (b.bombDefTurns > 0) out.push('Pembuat Onar');
  if (b.toxinTurns > 0) out.push('Bom Beracun');
  return out;
}
