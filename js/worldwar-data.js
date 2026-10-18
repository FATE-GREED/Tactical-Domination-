// ====================================================================
// worldwar-data.js — Data tetap Mode World War (v11, Rancangan Bagian 3 / Lampiran A).
// Skrip global tanpa modul. Koordinat memakai ruang peta 1400x1050 (img/campaign/peta-benua.webp).
// ====================================================================
const WW_COUNTRIES = {
  A: { name: 'Kekaisaran Vanderick', short: 'Vanderick', color: '#4a90e2', cap: { x: 650,  y: 520 }, buff: { kind: 'defNonCombat',    pct: 10, label: 'DEF unit non-combat +10%' } },
  B: { name: 'Republik Nologi',      short: 'Nologi',    color: '#e0583c', cap: { x: 1010, y: 420 }, buff: { kind: 'defInfantry',     pct: 10, label: 'DEF infanteri +10%' } },
  C: { name: 'Republik Persatuan',   short: 'Persatuan', color: '#3fae6a', cap: { x: 375,  y: 300 }, buff: { kind: 'defVehicle',      pct: 10, label: 'DEF kendaraan +10%' } },
  D: { name: 'Republik Nugle',       short: 'Nugle',     color: '#8e6fd6', cap: { x: 350,  y: 690 }, buff: { kind: 'defBuilding',     pct: 10, label: 'DEF bangunan +10%' } },
  E: { name: 'Kerajaan Armaen',      short: 'Armaen',    color: '#e0a43c', cap: { x: 860,  y: 760 }, buff: { kind: 'defCombat',       pct: 5,  label: 'DEF unit tempur +5%' } },
  F: { name: 'Kerajaan Ilvaro',      short: 'Ilvaro',    color: '#2fb5b9', cap: { x: 770,  y: 190 }, buff: { kind: 'defBldNonCombat', pct: 5,  label: 'DEF bangunan & non-combat +5%' } },
};

// region: negara asal kota (A = wilayah Kekaisaran: netral di awal).
// buff: atk | defUnit | hpUnit | defBld | hpBld | kredit
const WW_CITIES = {
  1:  { region: 'A', x: 780,  y: 450, buff: 'atk',     v: 8 },
  2:  { region: 'A', x: 520,  y: 420, buff: 'defUnit', v: 8 },
  3:  { region: 'A', x: 620,  y: 700, buff: 'hpUnit',  v: 8 },
  4:  { region: 'B', x: 905,  y: 470, buff: 'defBld',  v: 10 },
  5:  { region: 'B', x: 1050, y: 505, buff: 'hpBld',   v: 10 },
  6:  { region: 'B', x: 1130, y: 400, buff: 'atk',     v: 8 },
  7:  { region: 'B', x: 930,  y: 330, buff: 'kredit',  v: 5 },
  8:  { region: 'F', x: 610,  y: 235, buff: 'defUnit', v: 8 },
  9:  { region: 'F', x: 690,  y: 130, buff: 'atk',     v: 8 },
  10: { region: 'C', x: 445,  y: 225, buff: 'defBld',  v: 10 },
  11: { region: 'C', x: 310,  y: 380, buff: 'kredit',  v: 5 },
  12: { region: 'C', x: 440,  y: 415, buff: 'hpBld',   v: 10 },
  13: { region: 'F', x: 900,  y: 215, buff: 'defUnit', v: 8 },
  14: { region: 'C', x: 390,  y: 495, buff: 'hpUnit',  v: 8 },
  15: { region: 'D', x: 385,  y: 555, buff: 'defBld',  v: 10 },
  16: { region: 'D', x: 290,  y: 620, buff: 'kredit',  v: 5 },
  17: { region: 'D', x: 460,  y: 625, buff: 'hpUnit',  v: 8 },
  18: { region: 'E', x: 700,  y: 760, buff: 'atk',     v: 8 },
  19: { region: 'E', x: 770,  y: 850, buff: 'hpBld',   v: 10 },
  20: { region: 'E', x: 775,  y: 665, buff: 'defUnit', v: 8 },
  21: { region: 'E', x: 930,  y: 630, buff: 'kredit',  v: 5 },
  22: { region: 'E', x: 970,  y: 790, buff: 'hpUnit',  v: 8 },
};

// Simpul: angka = kota, 'A'..'F' = ibukota. Jalur 2 arah (38 jalur).
const WW_EDGES = [
  ['A',1],['A',2],['A',3],[1,4],[2,8],[2,12],[3,17],[3,20],
  [4,'B'],[4,5],[4,7],[5,6],[6,'B'],[7,'B'],[7,13],
  [13,'F'],['F',8],['F',9],[8,10],[9,10],
  [10,'C'],['C',11],['C',12],[11,14],[12,14],[14,15],
  [15,16],[15,17],[16,'D'],['D',17],['D',18],
  [18,19],[18,20],[19,'E'],[20,21],[20,'E'],[21,22],[22,'E'],
];

// Faksi unit (bot). Angka = nomor unit 1..20 (kunci UNITS di state.js).
const WW_UNIT_ID = { 1: 'infantry', 2: 'assault', 3: 'sniper', 4: 'antitank', 5: 'trapper', 6: 'montir', 7: 'tanklapis', 8: 'tankcrusher', 9: 'apc', 10: 'corps',
  11: 'advinfantry', 12: 'advassault', 13: 'advsniper', 14: 'advantitank', 15: 'advtrapper', 16: 'advmontir', 17: 'advtanklapis', 18: 'advtankcrusher', 19: 'advapc', 20: 'advcorps' };

const WW_FACTIONS = {
  ekonomi:     { name: 'Faksi Ekonomi',      units: [9, 19, 1, 11, 2, 12, 5, 15, 20, 8],  buff: 'Penghasilan semua sumber daya (Kredit, Fuel, Medical) +30%' },
  kendaraan:   { name: 'Faksi Kendaraan',    units: [6, 7, 8, 9, 10, 16, 17, 18, 19, 4],  buff: 'Maks Fuel semua unit +30%' },
  pejalankaki: { name: 'Faksi Pejalan Kaki', units: [1, 2, 3, 4, 5, 10, 11, 12, 13, 15],  buff: 'DEF +20%, ATK +10% (semua unit)' },
  pembangunan: { name: 'Faksi Pembangunan',  units: [10, 20, 9, 3, 13, 6, 16, 18, 4, 14], buff: 'Batas Benteng dilepas; DEF semua bangunan +20%; maks semua bangunan +1' },
  elite:       { name: 'Faksi Elite',        units: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], buff: 'Harga unit termahal diskon 30%' },
};
const WW_FACTION_IDS = ['ekonomi', 'kendaraan', 'pejalankaki', 'pembangunan', 'elite'];
const WW_BOT_LEVEL = 'sedang';   // K8: level bot untuk semua pertandingan World War
