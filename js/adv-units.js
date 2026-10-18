// ====================================================================
// adv-units.js — v9.7 (batch B): logika unit Advanced nomor 14, 16, 17, 18, 19, 20
//   14 Advanced Anti-Tank   : Kebocoran Minyak, Penembusan
//   16 Advanced Montir      : Perubahan Model (muat APC — lihat rules-supply.js), Peluru Pembakar
//   17 Advanced Tank Lapis  : Tembok Berjalan (rules-abilities.js), Tak Terkalahkan
//   18 Advanced Tank Crusher: Laras Kedua (rules-auto.js autoAttack), Pasukan Berani Mati (rules-abilities.js)
//   19 Advanced APC         : Kelebihan Muatan (rules-abilities/supply), Pantang Menyerah
//   20 Advanced Corps       : Percepatan Pembangunan (rules-supply.js), Semangat Kerja (rules-abilities.js)
// File ini hanya berisi kait (hook) yang dipanggil dari modul aturan lain. Semua angka mengikuti
// dokumen "Spesifikasi Penambahan Unit v9.6" Bagian 3, 5 dan 6.
// Dimuat setelah rules-win.js (hanya butuh fungsi global saat dipanggil, bukan saat dimuat).
// ====================================================================

// ---------- Tak Terkalahkan (Advanced Tank Lapis Baja) ----------
// Dipanggil saat HP ≤ 0. Mengembalikan true bila kematian ditahan (unit masuk mode gugur).
function advTryDowned(u) {
  if (u.type !== 'advtanklapis' || u.reviveUsed) return false;
  u.reviveUsed = true;           // kemampuan habis sejak dipakai; HP ≤ 0 berikutnya = gugur biasa
  u.downed = true;               // tak bisa bertindak, tak bisa ditarget; tile tetap ditempati
  u.hp = 0; u.mp = 0; u.attacked = true;
  u.target = null; u.lane = null;
  logAction(`${unitName(u)} #${u.id} masuk mode gugur (Tak Terkalahkan)`, 'combat');
  return true;
}
// Awal giliran pemilik: hidup lagi dengan HP 30% HP maks dan ATK −50% permanen (pengali ×0,5, lihat atkFinalMultiplier).
function advRevive(u) {
  u.downed = false;
  u.hp = specialRound(maxHpOf(u, unitDef(u.type)) * 0.3);   // v11: HP maks nyata (buff HP World War)
  u.weakened = true;
  logAction(`${unitName(u)} #${u.id} hidup kembali: HP ${u.hp}, ATK −50%`, 'combat');
}

// ---------- Efek pasca-serang (target SELAMAT) ----------
// attacker = unit penyerang; target = deskriptor describeTarget(); isSplash = kena percikan (Perusak Formasi).
function advOnHitSurvive(attacker, target, isSplash) {
  if (target.kind === 'unit') {
    const u = target.obj;
    // Pantang Menyerah (Advanced APC): terkena serangan & selamat -> DEF +20% & SPD +2 selama 2 giliran;
    // serangan baru saat aktif tidak mengulang hitungan; setelah habis ada cooldown 2 giliran (toughCd).
    if (u.type === 'advapc' && !(u.toughTurns > 0) && !(u.toughCd > 0)) u.toughTurns = 2;
    if (isSplash) return;
    if (attacker.type === 'advantitank' && target.vehicle) {
      // Kebocoran Minyak: +1 tumpukan (maks 4), durasi diperbarui ke 3
      u.leakStacks = Math.min(MAX_ADV_FUEL_LEAK_STACKS, (u.leakStacks || 0) + 1);
      u.leakTurns = 3;
      // Penembusan: DEF akhir −20% selama 2 giliran (tidak menumpuk sesama Penembusan -> hanya perbarui durasi)
      u.pierceTurns = 2;
    }
  } else if (target.kind === 'building' && attacker.type === 'advmontir') {
    // Peluru Pembakar: +1 tumpukan (maks 4), durasi 5 giliran. Damage per tumpukan = 5% ATK Advanced Montir (45 -> 2,25 -> specialRound = 2)
    const b = target.obj;
    b.burnStacks = Math.min(MAX_BURN_STACKS, (b.burnStacks || 0) + 1);
    b.burnTurns = 5;
    b.burnPerStack = specialRound(unitDef('advmontir').atk * 0.05);
    b.burnOwner = attacker.owner;
  }
}

// ---------- Awal giliran pemilik unit (dipanggil dari startTurn) ----------
// Setelah pemakaian Fuel normal: Kebocoran Minyak (−2 Fuel per tumpukan, tambahan), lalu hitung mundur durasi.
function advTickUnit(u, def) {
  if (u.leakTurns > 0 && u.leakStacks > 0 && def.hasFuel) u.fuel = Math.max(0, u.fuel - 2 * u.leakStacks);
  if (u.leakTurns > 0) { u.leakTurns--; if (u.leakTurns <= 0) u.leakStacks = 0; }
  if (u.pierceTurns > 0) u.pierceTurns--;
}
// Setelah MP awal giliran dihitung: Pantang Menyerah (bonus SPD dihitung dulu lewat effectiveSpeed, baru penghitung dikurangi).
function advPostSpeed(u) {
  if (u.type !== 'advapc') return;
  if (u.toughCd > 0) u.toughCd--;
  if (u.toughTurns > 0) { u.toughTurns--; if (u.toughTurns <= 0) u.toughCd = 2; }
}

// Peluru Pembakar: tiap giliran pemilik bangunan, damage tetap (mengabaikan DEF) = per tumpukan × jumlah tumpukan.
function advBurnTick(pIdx) {
  const p = players[pIdx];
  for (const b of p.buildings.slice()) {
    if (!(b.burnTurns > 0)) continue;
    const dmg = (b.burnPerStack || 0) * (b.burnStacks || 0);
    if (dmg > 0 && b.hp !== Infinity) {
      const before = b.hp;
      b.hp -= dmg;
      if (b.burnOwner != null) Stats.dmg(b.burnOwner, 'advmontir', 'building', Math.min(dmg, before));
      logAction(`${BUILDING_TYPES[b.type].name} terbakar: −${dmg} HP`, 'combat');
      if (b.hp <= 0) {                                           // hancur karena bakar: aturan hancur biasa
        Stats.bldLost(pIdx, b.type);
        p.buildings = p.buildings.filter(x => x !== b);
        checkWinCondition();
        continue;
      }
    }
    b.burnTurns--;
    if (b.burnTurns <= 0) b.burnStacks = 0;
  }
}

// ---------- Percepatan Pembangunan (Advanced Corps) ----------
// Sekali per pertandingan per pemain: bangunan pertama yang mulai dibangun Advanced Corps hanya 1 giliran. Renov tidak dihitung.
function advRushAvailable(corps, buildType) {
  return corps.type === 'advcorps' && buildType !== 'renov' && !players[corps.owner].rushUsed;
}
