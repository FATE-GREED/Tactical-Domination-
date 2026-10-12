// ====================================================================
// state.js — Sumber data & state tunggal untuk seluruh game.
// Tidak ada logika aturan di sini, cuma definisi data & variabel state.
// Semua modul lain membaca/mengubah objek-objek di file ini.
// ====================================================================

// ---------- Konfigurasi Peta ----------
const HUMAN = 0, BOT = 1; // mode lawan bot: Pemain 1 = manusia (kiri), Pemain 2 = bot (kanan)
const ROWS = 30, COLS = 45, HALF_COLS = COLS / 2, HEX_SIZE = 18;
const PLAN_SECONDS = Infinity; // v8.5: fase rencana tanpa batas waktu (berakhir saat tombol Eksekusi ditekan)

// ---------- Terrain (Bagian 2 dokumen desain) ----------
const TERRAIN = {
  grass:     { name: "Grass",      pct: 38, color: "#6b9b3f", effect: "Normal." },
  forest:    { name: "Forest",     pct: 30, color: "#2f5233", effect: "Unit unseen (default). Kendaraan slow (2 MP)." },
  rocks:     { name: "Rocks",      pct: 2,  color: "#8d8d85", effect: "Slow untuk semua kendaraan (2 MP)." },
  swamp:     { name: "Swamp",      pct: 2,  color: "#5b4a36", effect: "Tank: normal. Non-Tank: slow (2 MP)." },
  tallgrass: { name: "Tall Grass", pct: 2,  color: "#9db85c", effect: "Non-kendaraan unseen (default)." },
  valley:    { name: "Valley",     pct: 7,  color: "#2a2d36", effect: "Tidak bisa dilewati sama sekali." },
  river:     { name: "River",      pct: 7,  color: "#4a90c4", effect: "Kendaraan wajib lewat Jembatan (belum ada)." },
  mountain:  { name: "Mountain",   pct: 4,  color: "#7a6a58", effect: "Movement selalu 1 MP. Range/JPD +30%." },
  sand:      { name: "Sand",       pct: 2,  color: "#c9b070", effect: "2 MP/tile." },
  road:      { name: "Road",       pct: 2,  color: "#6e6a63", effect: "Tidak makan MP." },
  ruins:     { name: "Ruins",      pct: 2,  color: "#a08f7d", effect: "+10% DEF non-kendaraan." },
  city:      { name: "City",       pct: 2,  color: "#c9a227", effect: "+20% DEF. Kendaraan tidak bisa masuk." },
};

// ---------- Unit (Bagian 4 & 5 dokumen desain) ----------
// combat: bisa menyerang. vehicle/tank: dipakai rules-movement & rules-combat.
// atk/def/hp/range/jpd kosong (null) untuk unit Non-Combat (tidak relevan/tidak menyerang).
const UNITS = {
  infantry   : { name: 'Infantry',        price: 15, spd: 8,  range: 6,  atk: 33, def: 15,  hp: 100, jpd: 3, vehicle: false, tank: false, combat: true,  hasFuel: false },
  assault    : { name: 'Assault',         price: 30, spd: 11, range: 4,  atk: 48, def: 20,  hp: 150, jpd: 2, vehicle: false, tank: false, combat: true,  hasFuel: false },
  sniper     : { name: 'Sniper',          price: 30, spd: 7,  range: 9,  atk: 48, def: 10,  hp: 80,  jpd: 4, vehicle: false, tank: false, combat: true,  hasFuel: false },
  antitank   : { name: 'Anti-Tank',       price: 40, spd: 8,  range: 7,  atk: 48, def: 25,  hp: 150, jpd: 3, vehicle: false, tank: false, combat: true,  hasFuel: false },
  tanklapis  : { name: 'Tank Lapis Baja', price: 70, spd: 9,  range: 6,  atk: 63, def: 45, hp: 300, jpd: 3, vehicle: true,  tank: true,  combat: true,  hasFuel: true, fuelMax: 40, fuelUse: 5 },
  tankcrusher: { name: 'Tank Crusher',    price: 70, spd: 9,  range: 7,  atk: 84, def: 35,  hp: 250, jpd: 3, vehicle: true,  tank: true,  combat: true,  hasFuel: true, fuelMax: 40, fuelUse: 4 },
  montir     : { name: 'Montir',          price: 50, spd: 6,  range: 16, atk: 45, def: 25,  hp: 100, jpd: 5, vehicle: true,  tank: false, combat: true,  hasFuel: true, fuelMax: 20, fuelUse: 2 },
  apc        : { name: 'APC',             price: 20, spd: 13, range: 0,  atk: 0,  def: 25,  hp: 200, jpd: 5, vehicle: true,  tank: false, combat: false, hasFuel: true, fuelMax: 40, fuelUse: 2 },

  // ---- v9.7 Advanced (Bagian 3 spesifikasi). Urutan entri = nomor unit 11-20. ----
  // Batch B (file ini): 14, 16, 17, 18, 19. Unit 11, 12, 13, 15 (dan Trapper) dikerjakan batch A dan
  // disisipkan sesuai urutan nomornya: advinfantry, advassault, advsniper, [advantitank], advtrapper, [advmontir], ...
  advantitank : { name: 'Advanced Anti-Tank',       price: 45, spd: 8,  range: 7,  atk: 48, def: 30,  hp: 150, jpd: 3, vehicle: false, tank: false, combat: true,  hasFuel: false },
  advmontir   : { name: 'Advanced Montir',          price: 55, spd: 1,  range: 16, atk: 45, def: 25,  hp: 100, jpd: 5, vehicle: true,  tank: false, combat: true,  hasFuel: true, fuelMax: 23, fuelUse: 2 },
  advtanklapis: { name: 'Advanced Tank Lapis Baja', price: 75, spd: 9,  range: 6,  atk: 63, def: 45,  hp: 300, jpd: 3, vehicle: true,  tank: true,  combat: true,  hasFuel: true, fuelMax: 44, fuelUse: 5 },
  advtankcrusher: { name: 'Advanced Tank Crusher', price: 75, spd: 9,  range: 7,  atk: 84, def: 35,  hp: 250, jpd: 3, vehicle: true,  tank: true,  combat: true,  hasFuel: true, fuelMax: 45, fuelUse: 4 },
  advapc      : { name: 'Advanced APC',             price: 25, spd: 13, range: 0,  atk: 0,  def: 25,  hp: 200, jpd: 5, vehicle: true,  tank: false, combat: false, hasFuel: true, fuelMax: 42, fuelUse: 2 },
};
const CORPS_DEF = { name: 'Corps', spd: 10, range: 0, atk: 0, def: 15, hp: 100, jpd: 5, vehicle: false, tank: false, combat: false, hasFuel: false };
// v9.7 unit 20: Advanced Corps bukan entri UNITS (dibeli lewat entri khusus di modal Deploy, harga 25 — keputusan sementara Bagian 6 butir 1)
const ADV_CORPS_DEF = { name: 'Advanced Corps', price: 25, spd: 10, range: 0, atk: 0, def: 25, hp: 100, jpd: 5, vehicle: false, tank: false, combat: false, hasFuel: false };

// ---------- v9.7: helper tipe unit (dipakai di semua modul; jangan lagi memakai `type === 'corps' ? CORPS_DEF : UNITS[type]`) ----------
function unitDef(type) { return type === 'corps' ? CORPS_DEF : type === 'advcorps' ? ADV_CORPS_DEF : UNITS[type]; }
function isCorpsType(type) { return type === 'corps' || type === 'advcorps'; }   // Corps biasa + Advanced Corps
function isApcType(type) { return type === 'apc' || type === 'advapc'; }         // APC biasa + Advanced APC
const MAX_ADV_FUEL_LEAK_STACKS = 4, MAX_BURN_STACKS = 4;

// ---------- Bangunan (Bagian 3) ----------
// v9.5: HP semua bangunan 200; DEF bangunan minimal 10 (juga saat kena debuff). Benteng DEF 70.
// (v9.4: DEF x2, lalu v9.5: -20, Benteng -10 lagi.) Benteng: maks 5 total, hanya 1 yang boleh dibangun sekaligus.
// destructible:false untuk Garnisun (tidak bisa hancur, bukan objective).
// corpsRequired/turnsRequired/maxCount dipakai sistem Build (Fase 7).
// Markas butuh 2 Corps sekaligus untuk dibangun — belum didukung sistem
// Build otomatis saat ini (hanya bisa didapat lewat setup awal); bangunan
// lain semuanya cukup 1 Corps jadi sudah didukung penuh.
const BUILDING_TYPES = {
  markas:       { label: 'M', name: 'Markas',        hp: 200, def: 50, destructible: true,  corpsRequired: 2, turnsRequired: 4, maxCount: 5 },
  garnisun:     { label: 'G', name: 'Garnisun',       hp: Infinity, def: Infinity, destructible: false, corpsRequired: 0, turnsRequired: 0, maxCount: 1 },
  barak:        { label: 'B', name: 'Barak',          hp: 200,  def: 30,  destructible: true,  corpsRequired: 1, turnsRequired: 3, maxCount: 5 },
  pom:          { label: 'P', name: 'Pom',            hp: 200,  def: 10,  destructible: true,  corpsRequired: 1, turnsRequired: 2, maxCount: 3 },
  pospemulihan: { label: 'H', name: 'Pos Pemulihan',  hp: 200,  def: 10,  destructible: true,  corpsRequired: 1, turnsRequired: 2, maxCount: 5 },
  benteng:      { label: 'F', name: 'Benteng',        hp: 200,  def: 70, destructible: true,  corpsRequired: 1, turnsRequired: 3, maxCount: 5 },
  jembatan:     { label: 'J', name: 'Jembatan',       hp: 200,  def: 10,  destructible: true,  corpsRequired: 1, turnsRequired: 1, maxCount: 5 },
  // Renov = aksi (bukan bangunan): 3 tile menjadi Grass dalam 1 giliran; Valley/River/Mountain tidak bisa direnov.
  renov:        { label: 'R', name: 'Renov',          hp: null, def: null, destructible: false, corpsRequired: 1, turnsRequired: 1, maxCount: Infinity, action: true },
};

const PLAYER_COLORS = ['#6fa8dc', '#e06c6c'];

// ---------- Kemampuan unik (Bagian 5) — hanya untuk tampilan katalog lobby ----------
// Logikanya sendiri ada di rules-abilities.js / rules-combat.js / rules-economy.js.
// Urutan = urutan kartu di tombol "Kemampuan" lobby.
const UNIT_ABILITIES = {
  infantry: [
    ['Moral Persatuan', 'DEF +20% selama ada unit sekutu apapun (selain dirinya) dalam jarak 2 tile.'],
    ['Semangat Perjuangan', 'Saat 1 Infantry gugur, seluruh Infantry pemiliknya mendapat ATK +20% selama 2 giliran.'],
  ],
  assault: [
    ['Serangan Kejut', 'ATK +20% selama berstatus penyergapan (unseen), bertahan 2 giliran sejak status unseen hilang. SPD +2 saat unseen, hilang bila ada musuh dalam radius 5 tile.'],
    ['Yang Tersembunyi', 'Saat baru terdeteksi musuh, tetap unseen 1 giliran ekstra (sekali per periode ketahuan). Tidak berlaku bila musuh sudah bersebelahan.'],
  ],
  sniper: [
    ['Konsentrasi Tinggi', 'Bonus ATK menurut jarak tembak: tepat di Range +30%, Range −1 +20%, Range −2 +10%.'],
    ['Sang Pengamat', 'JPD naik 50% bila tidak ada sekutu di sekitar dalam jarak 5 tile.'],
  ],
  antitank: [
    ['Semangat Besi', 'MP +2 (sekali per giliran) bila ada kendaraan (sekutu maupun musuh) dalam jarak 2 tile.'],
    ['Ayo Ledakkan', 'Serangan ke kendaraan memberi damage 2x (serangan tambahan).'],
  ],
  tanklapis: [
    ['Sang Pelindung', 'Sekutu dalam jangkauan 2 tile dari tank ini mendapat DEF +20% (tidak berlaku untuk dirinya sendiri).'],
    ['Pejuang Bertahan', 'DEF +50% saat HP di bawah 50%.'],
  ],
  tankcrusher: [
    ['Penggila Perang', 'ATK +5% untuk setiap musuh dalam jangkauan, maksimal +20% (4 musuh).'],
    ['Intimidasi', 'Unit yang selamat dari serangannya terkena DEF −20% selama 2 giliran.'],
  ],
  montir: [
    ['Penghancur Bangunan', 'Bangunan musuh yang diserang dan selamat terkena DEF −30% selama 2 giliran.'],
    ['Perusak Formasi', 'Splash 50% damage ke unit musuh yang bersebelahan dengan target (bila target utama adalah unit).'],
  ],
  apc: [
    ['Dikejar Waktu', 'SPD +5 saat membawa Corps.'],
    ['Kurir Setia', 'DEF +20% saat membawa muatan.'],
  ],
  corps: [
    ['Jangan Menganggur', 'SPD +2 saat tidak membawa muatan.'],
    ['Kerja Sampai Tuntas', 'DEF +20% saat sedang membangun.'],
  ],
  // ---- v9.7 Advanced (batch B). Kemampuan tidak diwarisi dari unit dasar. ----
  advantitank: [
    ['Kebocoran Minyak', 'Serangan yang mengenai kendaraan yang selamat membuatnya bocor: −2 Fuel tiap giliran per tumpukan (maks 4 tumpukan = −8), 3 giliran. Tiap serangan menambah 1 tumpukan dan memperbarui durasi.'],
    ['Penembusan', 'Serangan ke kendaraan menganggap DEF dasarnya 0. Kendaraan yang selamat mendapat DEF −20% selama 2 giliran (tidak menumpuk dengan sesama Penembusan).'],
  ],
  advmontir: [
    ['Perubahan Model', 'SPD tetap 1. Sebagai kompensasi dapat diangkut semua jenis APC (APC & Advanced APC) di slot muatan (APC yang membawa Montir tidak bisa membawa muatan lain).'],
    ['Peluru Pembakar', 'Serangan yang mengenai bangunan yang selamat membakarnya: damage tetap 5% ATK per tumpukan tiap giliran pemilik bangunan (mengabaikan DEF), maks 4 tumpukan, 5 giliran.'],
  ],
  advtanklapis: [
    ['Tembok Berjalan', '60% ATK dasar diubah menjadi DEF dengan kurs 2 ATK = 1 DEF (ATK efektif 25,2; DEF efektif 63,9).'],
    ['Tak Terkalahkan', 'Sekali per unit: saat HP ≤ 0 unit masuk mode gugur (tak bisa bertindak/ditarget), lalu hidup lagi di awal giliran berikutnya dengan HP 30% dan ATK −50% permanen.'],
  ],
  advtankcrusher: [
    ['Laras Kedua', 'Tiap serangan = 2 tembakan (1 aksi), ATK tiap tembakan −45%. Tembakan kedua memilih target berbeda bila ada dalam jangkauan.'],
    ['Pasukan Berani Mati', 'Selama HP < 40% HP maks: DEF dasar menjadi 0, SPD +2, ATK +10%.'],
  ],
  advapc: [
    ['Kelebihan Muatan', 'Kapasitas maks +50% (Fuel 150, Medical 75; slot Corps/Montir tetap 1). SPD −3 selama muatan > 70% kapasitas dasar (Corps/Montir selalu).'],
    ['Pantang Menyerah', 'Saat terkena serangan (selamat): DEF +20% dan SPD +2 selama 2 giliran, lalu cooldown 2 giliran.'],
  ],
  advcorps: [
    ['Percepatan Pembangunan', 'Sekali per pertandingan per pemain: bangunan pertama yang dimulai Advanced Corps hanya butuh 1 giliran (Jembatan langsung selesai). Renov tidak dihitung.'],
    ['Semangat Kerja', 'SPD 7 (dasar −3) tanpa muatan; 13 (+3) saat membawa muatan. Menggantikan Jangan Menganggur.'],
  ],
};

// ---------- State yang berubah selama permainan ----------
let mapData = null;          // array[ROWS][COLS] berisi kunci TERRAIN
let players = [];            // diisi oleh setup.js
let units = [];              // {id, owner(0/1), type, r, c, mp, fuel, hp}
let uidCounter = 1;

let currentPlayerIdx = 0;
let turnNumber = 1;
let selectedUnit = null;
let paused = false;        // tombol pause
let buildingSeq = 1;        // urutan bangun bangunan (untuk prioritas serang otomatis)
let phase = 'plan';          // 'plan' (rencana) | 'exec' (eksekusi otomatis)
let planTimeLeft = PLAN_SECONDS, planTimer = null;
let targetActor = null;      // unit yang sedang dipilihkan target (mode pilih target)
let occupyHex = null;        // {r,c} hex untuk mode "tempati"
let markasSites = [];        // lokasi Markas yang sedang dipesan/dibangun {id, owner, r, c, tiles(7), corpsIds, started, turnsRemaining}
let siteSeq = 1;
let reachable = new Map();   // "r,c" -> sisa MP yang dipakai untuk sampai situ

let gameOver = false;
let winner = null;           // index pemain yang menang
let actionLog = [];          // {turn, player, msg} — log aksi terbaru di atas

// ---------- v9.0: tampilan khusus ----------
let radarOn = false;         // tombol Radar: seluruh jarak pandang unit sekutu diwarnai ungu
let enemyView = false;       // tombol Mata (ditahan): unit sekutu digambar sesuai apa yang terlihat oleh musuh

// ---------- Kamera canvas (dipakai render.js & input.js) ----------
let camX = 40, camY = 40, scale = 1;
