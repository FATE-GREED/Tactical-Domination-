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
  const spd0 = progSpd(unit.owner, unit.type, def.spd);   // v13: SPD dasar = SPD progresi (netral di luar mode progresi)
  let spd = spd0;
  if (unit.type === 'apc' && unit.cargo && unit.cargo.type === 'corps' && skillOn(unit, 'Dikejar Waktu')) spd = spd0 + 5; // Dikejar Waktu (bonus tetap +5 dari SPD dasar)
  if (unit.type === 'corps' && !unit.cargo && skillOn(unit, 'Jangan Menganggur')) spd += 2;                             // Jangan Menganggur
  if (unit.type === 'assault' && skillOn(unit, 'Serangan Kejut') && isUnitUnseen(unit)) {                            // Serangan Kejut: SPD+2 saat unseen
    const enemyWithin5 = units.some(e => e.owner !== unit.owner && hexDistance(unit.r, unit.c, e.r, e.c) <= 5);
    if (!enemyWithin5) spd += 2; // hilang seketika kalau ada musuh dalam radius 5 tile
  }
  // ---- v9.7 Advanced (batch B) ----
  if (unit.type === 'advcorps' && skillOn(unit, 'Semangat Kerja')) spd += unit.cargo ? 3 : -3;                        // Semangat Kerja: 7 tanpa muatan, 13 membawa muatan
  if (unit.type === 'advapc') {
    if (advApcOverloaded(unit)) spd -= 3;                                          // Kelebihan Muatan
    if (unit.toughTurns > 0 && skillOn(unit, 'Pantang Menyerah')) spd += 2;                                             // Pantang Menyerah (dikurangi 1 di startTurn setelah SPD dihitung)
  }
  if (unit.type === 'advtankcrusher' && isBeraniMati(unit)) spd += 2;              // Pasukan Berani Mati
  // ---- v9.7 unit Advanced ----
  if (unit.type === 'advassault' && skillOn(unit, 'Lompatan Seketika')) {          // Lompatan Seketika: siklus 3 giliran
    spd = (unit.jumpCycle || 0) === 3 ? spd0 + 6 : spd0 - 3;
  }
  if (unit.type === 'advinfantry' && unit.sacrificeState === 2 && skillOn(unit, 'Pengorbanan Terakhir')) spd *= 2;         // Pengorbanan Terakhir (giliran bertindak)
  return scaleStat(spd, unit.owner);   // v9.7: stat bot Campaign = 70%
}

// ---------- v9.7 Advanced: helper kondisi (Bagian 5) ----------
// Kelebihan Muatan: SPD −3 selama muatan > 70% kapasitas DASAR (Fuel > 70, Medical > 35; Corps/Montir = 100% -> selalu).
function advApcOverloaded(unit) {
  if (!unit.cargo || !skillOn(unit, 'Kelebihan Muatan')) return false;   // v13 Tahap 5: penjaga slot
  if (unit.cargo.type === 'corps' || unit.cargo.type === 'montir') return true;
  const baseCap = unit.cargo.type === 'fuel' ? 100 : 50;
  return unit.cargo.amount > baseCap * 0.7;
}
// Pasukan Berani Mati: aktif selama HP < 40% HP maks (dievaluasi terus-menerus)
function isBeraniMati(unit) { return unit.type === 'advtankcrusher' && skillOn(unit, 'Pasukan Berani Mati') && unit.hp < maxHpOf(unit, unitDef(unit.type)) * 0.4; }
// ATK dasar efektif: Tembok Berjalan mengubah 60% ATK dasar menjadi DEF -> ATK efektif 63 × 0,4 = 25,2
function baseATKOf(unit) {
  const def = unitDef(unit.type);
  return (unit.type === 'advtanklapis' && skillOn(unit, 'Tembok Berjalan')) ? def.atk * 0.4 : def.atk;
}
// Pengali ATK akhir setelah semua modifier persen: Tak Terkalahkan (setelah hidup lagi: ATK ×0,5 permanen)
function atkFinalMultiplier(unit) { return (unit.weakened ? 0.5 : 1) * (unit.sacrificeState === 2 ? 2 : 1); }   // Tak Terkalahkan ×0,5; Pengorbanan Terakhir ×2
// DEF dasar efektif target unit: Tembok Berjalan (45 + 63×0,6÷2 = 63,9) dan Pasukan Berani Mati (DEF dasar 0)
function baseDEFOfUnit(unit) {
  const def = unitDef(unit.type);
  if (isBeraniMati(unit)) return 0;
  if (unit.type === 'advtanklapis' && skillOn(unit, 'Tembok Berjalan')) return def.def + (def.atk * 0.6) / 2;
  return def.def;
}

// ---------- Anti-Tank: Semangat Besi (+2 MP sekali/giliran jika ada kendaraan dalam jarak 2 tile) ----------
// Dipanggil dari input.js saat unit mulai dipilih untuk bergerak (startMoveMode).
function applySemangatBesi(unit) {
  if (unit.type !== 'antitank' || unit.semangatBesiUsed || !skillOn(unit, 'Semangat Besi')) return;
  // Ada kendaraan (sekutu MAUPUN musuh) dalam jarak 2 tile
  const nearVehicle = units.some(o => {
    if (o.id === unit.id || o.type === 'corps') return false;
    if (hexDistance(unit.r, unit.c, o.r, o.c) > 2) return false;
    const od = unitDef(o.type);   // v12: perbaikan — Advanced Corps tidak ada di UNITS (sebelumnya melempar error)
    return !!(od && od.vehicle);
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
  return units.some(other => other.id !== unit.id && other.owner === unit.owner && other.type === 'tanklapis' && skillOn(other, 'Sang Pelindung') &&
    hexDistance(unit.r, unit.c, other.r, other.c) <= 2);
}

// ---------- Kontribusi % ATK dari kemampuan unik milik attacker ----------
function attackerAbilityATKPct(attackerUnit, targetInfo) {
  if (CAMPAIGN) return 0;   // v9.7: tanpa kemampuan unik di Campaign
  let pct = 0;
  const owner = players[attackerUnit.owner];

  // Infantry: Semangat Perjuangan (buff seluruh Infantry pemilik selama 2 giliran usai 1 gugur)
  if (attackerUnit.type === 'infantry' && owner.infantrySpiritTurns > 0 && skillOn(attackerUnit, 'Semangat Perjuangan')) pct += 20;

  // Assault: Serangan Kejut — +20% ATK selama unit "dalam status penyergapan":
  // aktif kalau sedang unseen, dan tetap bertahan 2 giliran SEJAK kehilangan
  // status unseen (jadi kalau terus unseen, bonusnya terus menyala tanpa luntur).
  if (attackerUnit.type === 'assault' && attackerUnit.ambushAtkTimer > 0 && skillOn(attackerUnit, 'Serangan Kejut')) pct += 20;

  // Sniper: Konsentrasi Tinggi (bonus berdasar jarak tembak vs Range)
  if (attackerUnit.type === 'sniper' && skillOn(attackerUnit, 'Konsentrasi Tinggi')) {
    const dist = targetInfo.kind === 'building' ? distToBuilding(attackerUnit.r, attackerUnit.c, targetInfo.obj) : hexDistance(attackerUnit.r, attackerUnit.c, targetInfo.obj.r, targetInfo.obj.c);
    const range = effectiveRange(attackerUnit);
    if (dist === range) pct += 30;
    else if (dist === range - 1) pct += 20;
    else if (dist === range - 2) pct += 10;
  }

  // Tank Crusher: Penggila Perang (+5%/musuh dalam jangkauan, maks +20% pada 4 musuh — BOLEH bertahap)
  if (attackerUnit.type === 'tankcrusher' && skillOn(attackerUnit, 'Penggila Perang')) {
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
    if (skillOn(attackerUnit, 'Laras Kedua')) pct -= 45;
    if (isBeraniMati(attackerUnit)) pct += 10;
  }

  return pct;
}

// ---------- Kontribusi % DEF dari kemampuan unik milik target (bisa unit atau bangunan) ----------
function defenderAbilityDEFPct(targetInfo) {
  if (CAMPAIGN) return 0;
  let pct = 0;

  if (targetInfo.kind === 'unit') {
    const u = targetInfo.obj;
    const def = targetInfo.def;

    if (u.type === 'infantry' && skillOn(u, 'Moral Persatuan') && hasAllyNearby(u, 2)) pct += 20;        // Moral Persatuan
    if (u.type === 'tanklapis' && skillOn(u, 'Pejuang Bertahan') && u.hp < maxHpOf(u, def) * 0.5) pct += 50;              // Pejuang Bertahan
    if (hasAdjacentAllyProtector(u)) pct += 20;                                // Sang Pelindung (dari sekutu)
    if (u.type === 'apc' && u.cargo && skillOn(u, 'Kurir Setia')) pct += 20;                                // Kurir Setia
    if (u.type === 'corps' && u.isBuilding && skillOn(u, 'Kerja Sampai Tuntas')) pct += 20;                         // Kerja Sampai Tuntas
    if (u.intimidatedTurns > 0) pct -= 20;                                     // kena Intimidasi (Tank Crusher)
    if (u.type === 'advapc' && u.toughTurns > 0 && skillOn(u, 'Pantang Menyerah')) pct += 20;                    // Pantang Menyerah (Advanced APC)
    if (u.pierceTurns > 0) pct -= 20;                                          // kena Penembusan (Advanced Anti-Tank); menjumlah dengan debuff lain
    if (u.type === 'advinfantry' && skillOn(u, 'Penerus Tekad')) pct += 2 * Math.min(10, u.legacyStacks || 0); // Penerus Tekad: +2% per tumpukan (maks 10)
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
  if (CAMPAIGN) return [];
  let out = [];
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
      if (u.hp < maxHpOf(u, UNITS.tanklapis) * 0.5) out.push('Pejuang Bertahan');
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
  out = out.filter(n => skillOn(u, n));                                  // v13 Tahap 5: hanya kemampuan aktif (slot terbuka & dimiliki)
  if (u.leakTurns > 0 && u.leakStacks > 0) out.push('Kebocoran Minyak');          // kena Advanced Anti-Tank
  if (u.pierceTurns > 0) out.push('Penembusan');
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
  if (b.burnTurns > 0 && b.burnStacks > 0) out.push('Peluru Pembakar');            // v9.7: terbakar (Advanced Montir)
  if (b.bombDefTurns > 0) out.push('Pembuat Onar');
  if (b.toxinTurns > 0) out.push('Bom Beracun');
  return out;
}
