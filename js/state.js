// ====================================================================
// state.js — Sumber data & state tunggal untuk seluruh game.
// Tidak ada logika aturan di sini, cuma definisi data & variabel state.
// Semua modul lain membaca/mengubah objek-objek di file ini.
// ====================================================================

// ---------- Konfigurasi Peta ----------
const HUMAN = 0, BOT = 1; // mode lawan bot: Pemain 1 = manusia (kiri), Pemain 2 = bot (kanan)
const ROWS = 40, COLS = 60, HALF_COLS = COLS / 2, HEX_SIZE = 18;
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
  infantry:    { name: 'Infantry',        price: 15, spd: 7,  range: 5,  atk: 33, def: 15,  hp: 100, jpd: 3, vehicle: false, tank: false, combat: true,  hasFuel: false },
  assault:     { name: 'Assault',         price: 30, spd: 10,  range: 3,  atk: 48, def: 20,  hp: 150, jpd: 2, vehicle: false, tank: false, combat: true,  hasFuel: false },
  sniper:      { name: 'Sniper',          price: 30, spd: 6,  range: 8, atk: 48, def: 10,  hp: 80,  jpd: 4, vehicle: false, tank: false, combat: true,  hasFuel: false },
  antitank:    { name: 'Anti-Tank',       price: 40, spd: 7,  range: 6,  atk: 48, def: 25,  hp: 150, jpd: 3, vehicle: false, tank: false, combat: true,  hasFuel: true, fuelMax: 30, fuelUse: 3 },
  tanklapis:   { name: 'Tank Lapis Baja', price: 70, spd: 8,  range: 5,  atk: 63, def: 45, hp: 300, jpd: 3, vehicle: true,  tank: true,  combat: true,  hasFuel: true, fuelMax: 40, fuelUse: 5 },
  tankcrusher: { name: 'Tank Crusher',    price: 70, spd: 8,  range: 6,  atk: 84, def: 35,  hp: 250, jpd: 3, vehicle: true,  tank: true,  combat: true,  hasFuel: true, fuelMax: 40, fuelUse: 4 },
  montir:      { name: 'Montir',          price: 50, spd: 5,  range: 15, atk: 45, def: 25,  hp: 100, jpd: 5, vehicle: true,  tank: false, combat: true,  hasFuel: true, fuelMax: 20, fuelUse: 2 },
  apc:         { name: 'APC',             price: 20, spd: 12, range: 0,  atk: 0,  def: 25,  hp: 200, jpd: 5, vehicle: true,  tank: false, combat: false, hasFuel: true, fuelMax: 40, fuelUse: 2 },
};
const CORPS_DEF = { name: 'Corps', spd: 9, range: 0, atk: 0, def: 15, hp: 100, jpd: 5, vehicle: false, tank: false, combat: false, hasFuel: false };

// ---------- Bangunan (Bagian 3) ----------
// destructible:false untuk Garnisun (tidak bisa hancur, bukan objective).
// corpsRequired/turnsRequired/maxCount dipakai sistem Build (Fase 7).
// Markas butuh 2 Corps sekaligus untuk dibangun — belum didukung sistem
// Build otomatis saat ini (hanya bisa didapat lewat setup awal); bangunan
// lain semuanya cukup 1 Corps jadi sudah didukung penuh.
const BUILDING_TYPES = {
  markas:       { label: 'M', name: 'Markas',        hp: 500, def: 50, destructible: true,  corpsRequired: 2, turnsRequired: 4, maxCount: 5 },
  garnisun:     { label: 'G', name: 'Garnisun',       hp: Infinity, def: Infinity, destructible: false, corpsRequired: 0, turnsRequired: 0, maxCount: 1 },
  barak:        { label: 'B', name: 'Barak',          hp: 350,  def: 25,  destructible: true,  corpsRequired: 1, turnsRequired: 3, maxCount: 5 },
  pom:          { label: 'P', name: 'Pom',            hp: 250,  def: 10,  destructible: true,  corpsRequired: 1, turnsRequired: 2, maxCount: 3 },
  pospemulihan: { label: 'H', name: 'Pos Pemulihan',  hp: 350,  def: 15,  destructible: true,  corpsRequired: 1, turnsRequired: 2, maxCount: 5 },
  benteng:      { label: 'F', name: 'Benteng',        hp: 400,  def: 50, destructible: true,  corpsRequired: 1, turnsRequired: 3, maxCount: 8 },
  jembatan:     { label: 'J', name: 'Jembatan',       hp: 150,  def: 10,  destructible: true,  corpsRequired: 1, turnsRequired: 1, maxCount: 5 },
};

const PLAYER_COLORS = ['#6fa8dc', '#e06c6c'];

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
let markasSites = [];        // lokasi Markas yang sedang dipesan/dibangun {id, owner, r, c, corpsIds, started, turnsRemaining}
let siteSeq = 1;
let reachable = new Map();   // "r,c" -> sisa MP yang dipakai untuk sampai situ

let gameOver = false;
let winner = null;           // index pemain yang menang
let actionLog = [];          // {turn, player, msg} — log aksi terbaru di atas

// ---------- Kamera canvas (dipakai render.js & input.js) ----------
let camX = 40, camY = 40, scale = 1;
