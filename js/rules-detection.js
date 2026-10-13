// ====================================================================
// rules-detection.js — Status unseen & deteksi (Bagian 9).
// Game ini 2 pemain, jadi "musuh" dari sebuah unit selalu pemain lain
// — makanya isUnitUnseen() bisa langsung dipakai sebagai "apakah unit
// ini tersembunyi dari lawannya" tanpa perlu tahu siapa yang sedang
// melihat.
// ====================================================================

// Range efektif di tile (r,c): Mountain memberi Rng +30%, dibulatkan KE ATAS.
function rangeAtTile(def, r, c) {
  if (!def.range) return 0;
  let rng = def.range;
  if (mapData[r][c] === 'mountain') rng *= 1.3;
  return Math.ceil(rng - 1e-9);
}
function effectiveRange(unit) {
  const def = unitDef(unit.type);
  const scaled = statMul(unit.owner) === 1 ? def : { ...def, range: scaleStat(def.range, unit.owner) };   // v9.7: stat bot Campaign = 70%
  let rng = rangeAtTile(scaled, unit.r, unit.c);
  if (unit.type === 'advsniper') rng += Math.min(5, unit.focusTurns || 0);   // Titik Fokus: ceil(Rng x Mountain) + focusTurns
  return rng;
}

function effectiveJPD(unit) {
  const def = unitDef(unit.type);
  const terr = mapData[unit.r][unit.c];
  let jpd = scaleStat(def.jpd, unit.owner);            // JPD dasar (non-combat tetap 5); v9.7: bot Campaign 70%
  if (def.combat && terr === 'mountain') jpd = effectiveRange(unit); // di Mountain: JPD = Rng saat ini
  if (unit.type === 'sniper') {
    const noAlliesNear = !units.some(e => e !== unit && e.owner === unit.owner && hexDistance(unit.r, unit.c, e.r, e.c) <= 5);
    if (noAlliesNear) jpd = Math.ceil(jpd * 1.5 - 1e-9);   // Sang Pengamat: JPD +50%
  }
  if (unit.type === 'advsniper') {                      // Mata Elang: +2 JPD per giliran diam, maks Rng efektif + 5
    const cap = effectiveRange(unit) + 5;
    jpd = Math.max(jpd, Math.min(jpd + 2 * (unit.eagerTurns || 0), cap));
  }
  return jpd;
}

// Default tersembunyi berdasarkan terrain yang dipijak (sebelum cek deteksi aktif)
function isHiddenByTerrain(unit) {
  const def = unitDef(unit.type);
  const terr = mapData[unit.r][unit.c];
  if (terr === 'forest') return true;                       // semua unit unseen
  if (terr === 'tallgrass' && !def.vehicle) return true;     // non-kendaraan unseen
  return false;
}

// Status unseen unit terhadap musuhnya: gugur otomatis jika ada unit musuh
// yang jarak sebenarnya ke tile ini <= JPD efektif unit musuh tsb.
// Assault "Yang Tersembunyi": jika baru saja masuk radius musuh, tetap
// unseen 1 giliran ekstra (assaultExtend) — kecuali musuh sudah tepat
// bersebelahan (dianggap "tahu tile pasti").
// v9.7 Teknik Kamuflase: mode camo hilang bila ada musuh dalam JPD efektif musuh + 3 tile.
// Setelah hilang, unit harus diam 1 giliran penuh lagi (flag camo dimatikan permanen sampai syarat terpenuhi lagi).
function camoRevealed(unit) {
  return units.some(e => e.owner !== unit.owner && hexDistance(unit.r, unit.c, e.r, e.c) <= effectiveJPD(e) + 3);
}
function refreshCamo() {
  for (const u of units) if (u.camo && camoRevealed(u)) u.camo = false;
}
function isUnitUnseen(unit) {
  if (unit.camo) {
    if (!camoRevealed(unit)) return true;
    unit.camo = false;
  }
  if (!isHiddenByTerrain(unit)) return false;
  const revealed = units.some(e => e.owner !== unit.owner && !e.downed && hexDistance(unit.r, unit.c, e.r, e.c) <= effectiveJPD(e));
  if (!revealed) return true;
  if (unit.type === 'assault' && unit.assaultExtend > 0) return true;
  return false;
}

// Apakah unit ini boleh terlihat/diinteraksi oleh pemain yang sedang giliran
function isVisibleToCurrentPlayer(unit) {
  // v9.0: tombol Mata ditahan -> unit sekutu yang tak terlihat musuh (unseen) ikut disembunyikan
  if (unit.owner === HUMAN) return !(enemyView && isUnitUnseen(unit)); // mode lawan bot: sudut pandang selalu pemain manusia
  return !isUnitUnseen(unit);
}
