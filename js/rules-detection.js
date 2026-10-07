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
  const def = unit.type === 'corps' ? CORPS_DEF : UNITS[unit.type];
  return rangeAtTile(def, unit.r, unit.c);
}

function effectiveJPD(unit) {
  const def = unit.type === 'corps' ? CORPS_DEF : UNITS[unit.type];
  const terr = mapData[unit.r][unit.c];
  let jpd = def.jpd;                                   // JPD dasar (non-combat tetap 5)
  if (def.combat && terr === 'mountain') jpd = effectiveRange(unit); // di Mountain: JPD = Rng saat ini
  if (unit.type === 'sniper') {
    const noAlliesNear = !units.some(e => e !== unit && e.owner === unit.owner && hexDistance(unit.r, unit.c, e.r, e.c) <= 5);
    if (noAlliesNear) jpd += 3;
  }
  return jpd;
}

// Default tersembunyi berdasarkan terrain yang dipijak (sebelum cek deteksi aktif)
function isHiddenByTerrain(unit) {
  const def = unit.type === 'corps' ? CORPS_DEF : UNITS[unit.type];
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
function isUnitUnseen(unit) {
  if (!isHiddenByTerrain(unit)) return false;
  const revealed = units.some(e => e.owner !== unit.owner && hexDistance(unit.r, unit.c, e.r, e.c) <= effectiveJPD(e));
  if (!revealed) return true;
  if (unit.type === 'assault' && unit.assaultExtend > 0) return true;
  return false;
}

// Apakah unit ini boleh terlihat/diinteraksi oleh pemain yang sedang giliran
function isVisibleToCurrentPlayer(unit) {
  if (unit.owner === HUMAN) return true; // mode lawan bot: sudut pandang selalu pemain manusia
  return !isUnitUnseen(unit);
}
