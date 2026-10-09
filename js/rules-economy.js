// ====================================================================
// rules-economy.js — Produksi Kredit/Fuel/Medical, produksi Corps dari
// Garnisun (Bagian 3), konsumsi Fuel kendaraan, dan reset di awal
// giliran tiap pemain.
// ====================================================================

function getBuilding(player, type) { return player.buildings.find(b => b.type === type); }

function inTerritory(player, r, c) {
  const m = getBuilding(player, 'markas');
  if (!m) return false;
  return r >= m.r - 10 && r < m.r + 10 && c >= m.c - 10 && c < m.c + 10;
}

// Jadwal waktu tunggu produksi Corps ke-n (Bagian 3)
function corpsWait(n) {
  if (n === 2) return 1;
  if (n === 3) return 2;
  if (n === 4) return 3;
  if (n === 5) return 4;
  if (n >= 6 && n <= 10) return 5;
  return null;
}

function spawnCorps(pIdx) {
  const p = players[pIdx];
  const g = getBuilding(p, 'garnisun');
  if (!g) return;
  const spot = emptyAdjacent(g.r, g.c, CORPS_DEF);
  if (!spot) return; // tidak ada ruang, coba lagi giliran berikutnya
  units.push({ id: uidCounter++, owner: pIdx, type: 'corps', r: spot.r, c: spot.c, mp: CORPS_DEF.spd, fuel: 0, hp: CORPS_DEF.hp, attacked: false, speedDebuffTurns: 0, cargo: null, isBuilding: false, assaultExtend: 0, assaultGraceUsed: false, ambushAtkTimer: 0, ambushWasUnseen: false, intimidatedTurns: 0, semangatBesiUsed: false, roadFreeUsesLeft: 2, target: null, job: 'idle', buildOrder: null, locked: false });
  p.corps.count++;
}

// Dipanggil setiap kali giliran berpindah ke pemain pIdx:
// - tambah Kredit dari Markas
// - reset slot deploy Barak
// - reset MP unit & kurangi Fuel kendaraan
// - jalankan timer produksi Corps
function startTurn(pIdx) {
  const p = players[pIdx];
  const markasCount = p.buildings.filter(b => b.type === 'markas').length;
  const barakCount = p.buildings.filter(b => b.type === 'barak').length;
  const pomCount = p.buildings.filter(b => b.type === 'pom').length;
  const pospemulihanCount = p.buildings.filter(b => b.type === 'pospemulihan').length;
  p.resources.kredit += 30 * markasCount + 20 * barakCount; // Markas +30, tiap Barak +20
  p.resources.fuel += 50 * pomCount;
  p.resources.medical += 50 * pospemulihanCount;
  Stats.earn(pIdx, 'kredit', 30 * markasCount + 20 * barakCount);
  Stats.earn(pIdx, 'fuel', 50 * pomCount);
  Stats.earn(pIdx, 'medical', 50 * pospemulihanCount);
  p.barakSlots = 2;

  if (p.infantrySpiritTurns > 0) p.infantrySpiritTurns--;        // Semangat Perjuangan meluruh
  for (const b of p.buildings) if (b.defDebuffTurns > 0) b.defDebuffTurns--; // Penghancur Bangunan meluruh

  processBuildProgress(pIdx); // Corps yang sedang Build maju 1 giliran / selesai jadi bangunan

  for (const u of units.filter(u => u.owner === pIdx)) {
    const def = u.type === 'corps' ? CORPS_DEF : UNITS[u.type];
    if (def.hasFuel) u.fuel = Math.max(0, u.fuel - def.fuelUse);
    u.attacked = false;
    u.semangatBesiUsed = false;
    u.roadFreeUsesLeft = 2;
    if (u.intimidatedTurns > 0) u.intimidatedTurns--;             // Intimidasi meluruh

    if (u.isBuilding) { u.mp = 0; continue; } // masih membangun, tidak bisa beraksi lain giliran ini

    // Assault: Yang Tersembunyi — perpanjang unseen 1 giliran ekstra saat baru terdeteksi
    if (u.type === 'assault') {
      const pointBlankEnemy = units.some(e => e.owner !== pIdx && hexDistance(u.r, u.c, e.r, e.c) <= 1);
      const rawRevealed = isHiddenByTerrain(u) && units.some(e => e.owner !== pIdx && hexDistance(u.r, u.c, e.r, e.c) <= effectiveJPD(e));

      // Yang Tersembunyi: grace 1 giliran HANYA SEKALI per periode ketahuan
      // (bukan berulang tiap kali dicek) — grace tersedia lagi setelah unit
      // benar-benar kembali ke kondisi tersembunyi penuh.
      if (!rawRevealed) {
        u.assaultExtend = 0;
        u.assaultGraceUsed = false;
      } else if (pointBlankEnemy) {
        u.assaultExtend = 0; // musuh tahu tile pasti -> grace tak berlaku
      } else if (!u.assaultGraceUsed) {
        u.assaultExtend = 1;
        u.assaultGraceUsed = true;
      } else {
        u.assaultExtend = 0; // grace sudah terpakai untuk periode ketahuan ini
      }

      // Serangan Kejut: timer buff ATK. Selama masih unseen (termasuk lewat
      // grace Yang Tersembunyi di atas), tetap di-refresh ke 2. Begitu BARU
      // kehilangan status unseen (transisi true->false), tetap diisi 2 supaya
      // bonus bertahan PENUH 2 giliran sejak kehilangan status — baru giliran
      // berikutnya (kalau tetap tidak unseen) mulai meluruh.
      const nowUnseen = isUnitUnseen(u);
      if (nowUnseen || u.ambushWasUnseen) {
        u.ambushAtkTimer = 2;
      } else if (u.ambushAtkTimer > 0) {
        u.ambushAtkTimer--;
      }
      u.ambushWasUnseen = nowUnseen;
    }

    let spd = effectiveSpeed(u);
    if (u.speedDebuffTurns > 0) {           // Bagian 6: efek kena serangan (Non-Combat)
      spd = Math.floor(spd / 2);
      u.speedDebuffTurns--;
    }
    u.mp = (def.hasFuel && u.fuel <= 0) ? 0 : spd;
  }

  if (p.corps.count < 10) {
    if (p.corps.timer === null) {
      spawnCorps(pIdx); // Corps pertama langsung
      if (p.corps.count < 10) p.corps.timer = corpsWait(p.corps.count + 1);
    } else {
      p.corps.timer--;
      if (p.corps.timer <= 0) {
        spawnCorps(pIdx);
        if (p.corps.count < 10) p.corps.timer = corpsWait(p.corps.count + 1);
      }
    }
  }
}
