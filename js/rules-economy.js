// ====================================================================
// rules-economy.js — Produksi Kredit/Fuel/Medical, produksi Corps dari
// Garnisun (Bagian 3), konsumsi Fuel kendaraan, dan reset di awal
// giliran tiap pemain.
// ====================================================================

function getBuilding(player, type) { return player.buildings.find(b => b.type === type); }

function inTerritory(player, r, c) {
  if (CAMPAIGN) return false;   // v9.7: Campaign tanpa area Territory
  const m = getBuilding(player, 'markas');
  if (!m) return false;
  return r >= m.r - 5 && r < m.r + 5 && c >= m.c - 5 && c < m.c + 5;   // Territory 10x10
}

// Jadwal waktu tunggu produksi Corps ke-n (n = jumlah Corps setelah produksi): 1 -> langsung, 2 -> 1, 3 -> 2, 4+ -> tetap 3
function corpsWait(n) {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  if (n === 3) return 2;
  return 3;
}
const MAX_CORPS = 10;   // maksimal Corps yang hidup bersamaan

// Jumlah Corps pemain yang masih hidup (termasuk yang sedang membangun / naik APC)
function corpsAlive(pIdx) {
  let n = 0;
  for (const u of units) {
    if (u.owner !== pIdx) continue;
    if (isCorpsType(u.type)) n++;
    else if (u.cargo && u.cargo.type === 'corps') n++;
  }
  return n;
}

// Slot deploy: tiap Barak punya 2 slot sendiri per giliran
function barakSlots(b) { return b.slots === undefined ? 2 : b.slots; }
function totalBarakSlots(p) { return p.buildings.filter(b => b.type === 'barak').reduce((a, b) => a + barakSlots(b), 0); }

// v10: jenis Corps yang diproduksi Garnisun, mengikuti pilihan 10 unit pemain (bot meniru pilihan pemain agar adil).
//  - Corps + Advanced Corps terpilih -> model ganda (2 Corps per produksi, masing-masing 1 jenis)
//  - hanya Advanced Corps terpilih  -> Garnisun memproduksi Advanced Corps (jadwal lama 1,2,3,3)
//  - hanya Corps terpilih           -> Corps biasa (jadwal lama)
//  - v10.1 (P4): tidak ada jenis Corps terpilih -> TIDAK memproduksi Corps ([]); layar Pilih Unit mewajibkan minimal satu jenis,
//    jadi cabang ini hanya pengaman. Fallback ['corps'] hanya untuk Campaign dan keadaan tanpa pilihan (selectedLoadoutUnits kosong).
function corpsKinds(pIdx) {
  if (WW && pIdx === BOT) return wwCorpsKinds(BOT);   // v11 (3.4): Corps Garnisun bot ditentukan faksinya
  let sel = (typeof selectedLoadoutUnits !== 'undefined') ? selectedLoadoutUnits : [];
  if (MPM && pIdx !== HUMAN) sel = MPM.oppLoadout || [];   // v12: Garnisun lawan manusia mengikuti pilihan unit LAWAN
  if (CAMPAIGN || !Array.isArray(sel) || sel.length < 1) return ['corps'];   // v13: loadout 1-10 jenis
  const hasC = sel.includes('corps'), hasA = sel.includes('advcorps');
  if (hasC && hasA) return ['corps', 'advcorps'];
  if (hasA) return ['advcorps'];
  if (hasC) return ['corps'];
  return [];
}
// Jeda produksi model ganda per "paket" (2 Corps): paket ke-1 langsung, ke-2 setelah 2 giliran, ke-3 setelah 4, ke-4 setelah 5, seterusnya tetap 5.
// Paket ke-k dihitung dari jumlah Corps hidup: k = floor(hidup / 2) + 1 (Corps gugur => jadwal mundur, sama seperti jadwal lama).
function dualCorpsWait(k) { return k <= 1 ? 0 : k === 2 ? 2 : k === 3 ? 4 : 5; }

function spawnCorps(pIdx, type) {
  type = type || 'corps';
  const p = players[pIdx];
  const g = getBuilding(p, 'garnisun');
  if (!g) return false;
  const def = unitDef(type);
  const spot = emptyAdjacentBuilding(g, def);
  if (!spot) return false; // tidak ada ruang, coba lagi giliran berikutnya
  const u = { id: uidCounter++, owner: pIdx, type, r: spot.r, c: spot.c, mp: progSpd(pIdx, type, def.spd), fuel: 0, hp: progHpScale(pIdx, type, corpsHpOf(def, pIdx)), maxHp: progHpScale(pIdx, type, corpsHpOf(def, pIdx)), attacked: false, speedDebuffTurns: 0, cargo: null, isBuilding: false, assaultExtend: 0, assaultGraceUsed: false, ambushAtkTimer: 0, ambushWasUnseen: false, intimidatedTurns: 0, semangatBesiUsed: false, roadFreeUsesLeft: 2, target: null, job: 'idle', buildOrder: null, locked: false };   // v11: HP x buff World War
  units.push(u);
  Stats.deploy(pIdx, type);   // v13 Tahap 3 (8.1): Corps dari Garnisun ikut dihitung
  if (type === 'advcorps') u.mp = effectiveSpeed(u);          // Semangat Kerja: 7 tanpa muatan
  p.corps.count = corpsAlive(pIdx);
  return true;
}
// Satu produksi Garnisun: model ganda = 2 Corps (1 per jenis, tidak melebihi MAX_CORPS); model tunggal = 1 Corps. Mengembalikan jumlah yang berhasil muncul.
function spawnCorpsBatch(pIdx, kinds) {
  let made = 0;
  for (const k of kinds) {
    if (corpsAlive(pIdx) >= MAX_CORPS) break;
    if (spawnCorps(pIdx, k)) made++;
  }
  return made;
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
  const incKredit = CAMPAIGN ? CAMPAIGN.markasIncome * markasCount + CAMPAIGN.barakIncome * barakCount : 30 * markasCount + 20 * barakCount;
  // v11 (6.3/6.6): World War — Kredit kota ditambahkan dulu, lalu pengali faksi Ekonomi (x1,3) untuk Kredit, Fuel, Medical. Di luar WW = nilai asli.
  const inc = wwIncome(pIdx, { kredit: incKredit, fuel: 50 * pomCount, medical: 50 * pospemulihanCount });
  p.resources.kredit += inc.kredit; // klasik: Markas +30, tiap Barak +20; Campaign: nilai dari chapter
  p.resources.fuel += inc.fuel;
  p.resources.medical += inc.medical;
  Stats.earn(pIdx, 'kredit', inc.kredit);
  Stats.earn(pIdx, 'fuel', inc.fuel);
  Stats.earn(pIdx, 'medical', inc.medical);
  for (const b of p.buildings) if (b.type === 'barak') b.slots = 2;   // 2 slot deploy PER Barak

  if (p.infantrySpiritTurns > 0) p.infantrySpiritTurns--;        // Semangat Perjuangan meluruh
  for (const b of p.buildings) if (b.defDebuffTurns > 0) b.defDebuffTurns--; // Penghancur Bangunan meluruh
  advBurnTick(pIdx);                                                         // v9.7: Peluru Pembakar (bangunan terbakar)
  if (gameOver) return;                                                      // Markas terakhir hancur karena terbakar
  activateBombs(pIdx);                                           // v9.7: bom pemilik yang dipasang giliran lalu kini aktif
  for (const b of [...p.buildings]) {                            // v9.7: debuff bom pada bangunan
    if (b.bombDefTurns > 0) b.bombDefTurns--;                    // Pembuat Onar meluruh (medan terpisah)
    if (b.toxinTurns > 0) {                                      // Bom Beracun: racun tetap (abaikan DEF), lalu durasi turun
      damageBuilding(pIdx, b, b.toxinDmg || 0, b.toxinSrcOwner, b.toxinSrcType || 'advtrapper');
      b.toxinTurns--;
    }
  }
  if (gameOver) return;

  processBuildProgress(pIdx); // Corps yang sedang Build maju 1 giliran / selesai jadi bangunan

  for (const u of units.filter(u => u.owner === pIdx)) {
    const def = unitDef(u.type);
    if (u.downed) advRevive(u);                                   // v9.7: Tak Terkalahkan — hidup lagi di awal giliran pemilik
    if (def.hasFuel) u.fuel = Math.max(0, u.fuel - def.fuelUse);
    advTickUnit(u, def);                                          // v9.7: Kebocoran Minyak (−Fuel), Penembusan meluruh
    u.attacked = false;
    u.semangatBesiUsed = false;
    u.roadFreeUsesLeft = 2;
    if (u.intimidatedTurns > 0) u.intimidatedTurns--;             // Intimidasi meluruh

    // ---- v9.7 unit Advanced / racun ----
    if (u.type === 'advinfantry') {                                // Pengorbanan Terakhir: gugur setelah giliran bertindak
      if (u.sacrificeState === 2) {
        if (pIdx === HUMAN) actAdd(pIdx, [[unitName(u), 'unit'], [' gugur (Pengorbanan Terakhir)']]);
        killUnit(u);
        continue;
      }
      if (u.sacrificeState === 1) u.sacrificeState = 2;            // giliran ini = giliran bertindak (SPD & ATK x2)
    }
    if (u.type === 'advassault') u.jumpCycle = ((u.jumpCycle || 0) % 3) + 1;   // Lompatan Seketika: 1-2-3-1-2-3
    if (u.toxinTurns > 0 && damageUnit(u, u.toxinDmg || 0, u.toxinSrcOwner, u.toxinSrcType || 'advtrapper')) continue;   // racun Bom Beracun

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
    // SPD −50% dari serangan (Non-Combat) dan Bom Beracun tidak dikalikan dua kali: pakai yang terkuat (sama-sama /2)
    const halve = u.speedDebuffTurns > 0 || u.toxinTurns > 0;
    if (halve) spd = Math.floor(spd / 2);
    if (u.speedDebuffTurns > 0) u.speedDebuffTurns--;
    if (u.toxinTurns > 0) u.toxinTurns--;
    u.mp = (def.hasFuel && u.fuel <= 0) ? 0 : spd;
    advPostSpeed(u);                                              // v9.7: Pantang Menyerah (hitung mundur setelah SPD dihitung)
  }

  if (CAMPAIGN) return;   // v9.7: Campaign tanpa Garnisun/Corps

  // Produksi Corps (Garnisun). Model tunggal: jeda 1,2,3 lalu tetap 3 giliran. Model ganda (Corps + Advanced Corps
  // sama-sama terpilih): paket 2 Corps dengan jeda 0,2,4,5 lalu tetap 5 giliran, selalu 2 per paket. Maks 10 Corps hidup.
  // Kalau Corps mati dan jumlahnya di bawah 10, hitungan giliran produksi dimulai lagi.
  const kinds = corpsKinds(pIdx);
  if (!kinds.length) { p.corps.timer = null; return; }       // v10.1 (P4): tidak ada jenis Corps terpilih -> Garnisun tidak memproduksi
  const dual = kinds.length === 2;
  const waitFor = cnt => dual ? dualCorpsWait(Math.floor(cnt / 2) + 1) : corpsWait(cnt + 1);
  const produce = () => dual ? spawnCorpsBatch(pIdx, kinds) > 0 : spawnCorps(pIdx, kinds[0]);
  p.corps.count = corpsAlive(pIdx);
  const scheduleNext = () => {
    p.corps.count = corpsAlive(pIdx);
    p.corps.timer = p.corps.count >= MAX_CORPS ? null : waitFor(p.corps.count);
  };
  if (p.corps.count >= MAX_CORPS) {
    p.corps.timer = null;
  } else if (p.corps.timer === null) {
    const w = waitFor(p.corps.count);
    if (w === 0) { if (produce()) scheduleNext(); }           // paket/Corps pertama (atau semua Corps gugur): langsung
    else p.corps.timer = w;                                   // mulai menghitung giliran dari sekarang
  } else {
    p.corps.timer--;
    if (p.corps.timer <= 0) {
      if (produce()) scheduleNext();
      else p.corps.timer = 0;                                 // belum ada ruang: coba lagi giliran depan
    }
  }
}
