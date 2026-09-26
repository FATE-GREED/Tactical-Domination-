// ====================================================================
// state.js — Sumber data & state tunggal untuk seluruh game.
// Tidak ada logika aturan di sini, cuma definisi data & variabel state.
// Semua modul lain membaca/mengubah objek-objek di file ini.
// ====================================================================

// ---------- Konfigurasi Peta ----------
const ROWS = 40, COLS = 100, HALF_COLS = COLS / 2, HEX_SIZE = 18;

// ---------- Terrain (Bagian 2 dokumen desain) ----------
const TERRAIN = {
  grass:     { name: "Grass",      pct: 45, color: "#6b9b3f", effect: "Normal." },
  forest:    { name: "Forest",     pct: 10, color: "#2f5233", effect: "Unit unseen (default). Kendaraan slow (2 MP)." },
  rocks:     { name: "Rocks",      pct: 8,  color: "#8d8d85", effect: "Slow untuk semua kendaraan (2 MP)." },
  swamp:     { name: "Swamp",      pct: 8,  color: "#5b4a36", effect: "Tank: normal. Non-Tank: slow (2 MP)." },
  tallgrass: { name: "Tall Grass", pct: 5,  color: "#9db85c", effect: "Non-kendaraan unseen (default)." },
  river:     { name: "River",      pct: 5,  color: "#4a90c4", effect: "Kendaraan wajib lewat Jembatan (belum ada)." },
  mountain:  { name: "Mountain",   pct: 5,  color: "#7a6a58", effect: "Movement selalu 1 MP. Range/JPD +30%." },
  sand:      { name: "Sand",       pct: 5,  color: "#c9b070", effect: "2 MP/tile." },
  road:      { name: "Road",       pct: 3,  color: "#6e6a63", effect: "Tidak makan MP." },
  ruins:     { name: "Ruins",      pct: 3,  color: "#a08f7d", effect: "+10% DEF non-kendaraan." },
  city:      { name: "City",       pct: 3,  color: "#c9a227", effect: "+20% DEF. Kendaraan tidak bisa masuk." },
};

// ---------- Unit (Bagian 4 & 5 dokumen desain) ----------
// combat: bisa menyerang. vehicle/tank: dipakai rules-movement & rules-combat.
// atk/def/hp/range/jpd kosong (null) untuk unit Non-Combat (tidak relevan/tidak menyerang).
const UNITS = {
  infantry:    { name: 'Infantry',        price: 15, spd: 5,  range: 5,  atk: 22, def: 30,  hp: 100, jpd: 10, vehicle: false, tank: false, combat: true,  hasFuel: false },
  assault:     { name: 'Assault',         price: 30, spd: 7,  range: 2,  atk: 32, def: 40,  hp: 150, jpd: 10, vehicle: false, tank: false, combat: true,  hasFuel: false },
  sniper:      { name: 'Sniper',          price: 30, spd: 5,  range: 10, atk: 32, def: 20,  hp: 80,  jpd: 40, vehicle: false, tank: false, combat: true,  hasFuel: false },
  antitank:    { name: 'Anti-Tank',       price: 40, spd: 4,  range: 7,  atk: 32, def: 50,  hp: 150, jpd: 12, vehicle: false, tank: false, combat: true,  hasFuel: true, fuelMax: 30, fuelUse: 3 },
  tanklapis:   { name: 'Tank Lapis Baja', price: 70, spd: 6,  range: 5,  atk: 42, def: 100, hp: 300, jpd: 13, vehicle: true,  tank: true,  combat: true,  hasFuel: true, fuelMax: 40, fuelUse: 5 },
  tankcrusher: { name: 'Tank Crusher',    price: 70, spd: 6,  range: 6,  atk: 56, def: 70,  hp: 250, jpd: 13, vehicle: true,  tank: true,  combat: true,  hasFuel: true, fuelMax: 40, fuelUse: 4 },
  montir:      { name: 'Montir',          price: 50, spd: 3,  range: 30, atk: 30, def: 50,  hp: 100, jpd: 10, vehicle: true,  tank: false, combat: true,  hasFuel: true, fuelMax: 20, fuelUse: 2 },
  apc:         { name: 'APC',             price: 20, spd: 10, range: 0,  atk: 0,  def: 50,  hp: 200, jpd: 10, vehicle: true,  tank: false, combat: false, hasFuel: true, fuelMax: 40, fuelUse: 2 },
};
const CORPS_DEF = { name: 'Corps', spd: 7, range: 0, atk: 0, def: 30, hp: 100, jpd: 10, vehicle: false, tank: false, combat: false, hasFuel: false };

// ---------- Bangunan (Bagian 3) ----------
// destructible:false untuk Garnisun (tidak bisa hancur, bukan objective).
// corpsRequired/turnsRequired/maxCount dipakai sistem Build (Fase 7).
// Markas butuh 2 Corps sekaligus untuk dibangun — belum didukung sistem
// Build otomatis saat ini (hanya bisa didapat lewat setup awal); bangunan
// lain semuanya cukup 1 Corps jadi sudah didukung penuh.
const BUILDING_TYPES = {
  markas:       { label: 'M', name: 'Markas',        hp: 1000, def: 100, destructible: true,  corpsRequired: 2, turnsRequired: 4, maxCount: 5 },
  garnisun:     { label: 'G', name: 'Garnisun',       hp: Infinity, def: Infinity, destructible: false, corpsRequired: 0, turnsRequired: 0, maxCount: 1 },
  barak:        { label: 'B', name: 'Barak',          hp: 700,  def: 50,  destructible: true,  corpsRequired: 1, turnsRequired: 3, maxCount: 5 },
  pom:          { label: 'P', name: 'Pom',            hp: 500,  def: 20,  destructible: true,  corpsRequired: 1, turnsRequired: 2, maxCount: 3 },
  pospemulihan: { label: 'H', name: 'Pos Pemulihan',  hp: 700,  def: 30,  destructible: true,  corpsRequired: 1, turnsRequired: 2, maxCount: 5 },
  benteng:      { label: 'F', name: 'Benteng',        hp: 800,  def: 100, destructible: true,  corpsRequired: 1, turnsRequired: 3, maxCount: 8 },
  jembatan:     { label: 'J', name: 'Jembatan',       hp: 300,  def: 20,  destructible: true,  corpsRequired: 1, turnsRequired: 1, maxCount: 5 },
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
let reachable = new Map();   // "r,c" -> sisa MP yang dipakai untuk sampai situ

let gameOver = false;
let winner = null;           // index pemain yang menang
let actionLog = [];          // {turn, player, msg} — log aksi terbaru di atas

// ---------- Kamera canvas (dipakai render.js & input.js) ----------
let camX = 40, camY = 40, scale = 1;
