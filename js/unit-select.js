// ====================================================================
// unit-select.js — v9.8: pemilihan tepat 10 jenis unit sebelum game.
// Pilihan membatasi unit yang dapat di-deploy pemain manusia dari Barak.
// Bot tidak dibatasi (Garnisun bot meniru pilihan Corps pemain). Corps & Advanced Corps
// tidak dibeli di Barak: Garnisun memproduksinya (v10, lihat rules-economy.js).
// v10.1 (P4): wajib memilih minimal satu jenis Corps (Corps atau Advanced Corps).
// v13 (Bagian 7): mode bot/mp/event memilih 1-10 jenis dari unit yang DIMILIKI (unit lain redup 'Terkunci'), wajib min. 1 Corps + 1 non-Corps.
// Mode World War tidak berubah (tepat 10 unit faksi, tanpa kepemilikan).
// ====================================================================

let unitSelectPendingOpts = null;
let unitSelectSelected = [];
const unitSelectProgMode = () => !!unitSelectPendingOpts && ['bot', 'mp', 'event'].includes(unitSelectPendingOpts.mode);   // v13: pilihan 1-10 sesuai kepemilikan
const unitSelectIsCorps = k => k === 'corps' || k === 'advcorps';
const unitSelectHasNonCorps = () => unitSelectSelected.some(k => !unitSelectIsCorps(k));

function unitSelectOptions() {
  const entries = [...Object.entries(UNITS), ['corps', CORPS_DEF], ['advcorps', ADV_CORPS_DEF]];
  const seen = new Set();
  return entries.filter(([key, def]) => {
    if (!key || !def || !def.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(([key, def]) => ({
    key,
    name: def.name,
    price: def.price == null ? null : def.price,
    owned: !unitSelectProgMode() || (Prog.data.unit[key] && Prog.data.unit[key].dimiliki),
    lv: Prog.data.unit[key] ? Prog.data.unit[key].level : 1, asc: Prog.data.unit[key] ? Prog.data.unit[key].ascend : 0,
    category: (key === 'corps' || key === 'advcorps') ? 'Corps'
      : key.startsWith('adv') ? 'Advanced'
      : def.vehicle ? 'Kendaraan' : 'Infanteri'
  }));
}

function unitSelectStars(item) {
  const n = 2 + item.asc / 2; let h = '';
  for (let i = 1; i <= 5; i++) h += `<i class="pg-star ${n >= i ? 'full' : n >= i - 0.5 ? 'half' : 'empty'}">★</i>`;
  return `<span class="pg-stars ${item.key.startsWith('adv') ? 'gold' : 'silver'}">${h}</span>`;
}

function showUnitSelectScreen(opts) {
  Prog.load();   // v13: kepemilikan terbaru (dua tab)
  const screen = document.getElementById('unitselect-screen');
  const list = document.getElementById('unitselect-list');
  if (!screen || !list) throw new Error('Elemen layar pemilihan unit v9.8 tidak ditemukan.');

  unitSelectPendingOpts = opts || { mode: 'bot', level: 'sedang' };
  unitSelectSelected = [];
  const options = unitSelectOptions();
  const categoryOrder = ['Infanteri', 'Kendaraan', 'Advanced', 'Corps'];
  list.innerHTML = categoryOrder.map(category => {
    const items = options.filter(item => item.category === category);
    if (!items.length) return '';
    return `<section class="unitselect-group" aria-label="${category}">
      <h3>${category}</h3>
      <div class="unitselect-grid">${items.map(item => `
        <label class="unitselect-option${item.owned ? '' : ' locked'}">
          <input type="checkbox" value="${item.key}" data-unit-select="${item.key}"${item.owned ? '' : ' disabled'}>
          <span class="unitselect-name">${item.name}</span>
          ${unitSelectProgMode() ? (item.owned ? `<span class="us-lv">Lv ${item.lv}</span>${unitSelectStars(item)}` : '<span class="unitselect-price">Terkunci</span>') : ''}
          <span class="unitselect-price">${item.price == null ? 'Pendukung' : item.price + ' Kredit'}</span>
        </label>`).join('')}
      </div>
    </section>`;
  }).join('');

  list.querySelectorAll('input[data-unit-select]').forEach(input => {
    input.addEventListener('change', () => toggleUnitSelection(input.value, input.checked));
  });
  document.getElementById('unitselect-reset').onclick = resetUnitSelection;
  document.getElementById('unitselect-confirm').onclick = confirmUnitSelection;
  if (unitSelectPendingOpts.mode === 'ww') {   // v11: pilihan terakhir terisi otomatis (stats.loadout)
    for (const k of WorldWar.loadout()) {
      const inp = list.querySelector(`input[data-unit-select="${k}"]`);
      if (inp && unitSelectSelected.length < 10) { inp.checked = true; unitSelectSelected.push(k); }
    }
  }
  if (unitSelectProgMode()) {   // v13: pilihan terakhir terisi otomatis (hanya unit yang masih dimiliki)
    for (const k of Prog.getLoadout(unitSelectPendingOpts.mode)) {
      const inp = list.querySelector(`input[data-unit-select="${k}"]`);
      if (inp && !inp.disabled && unitSelectSelected.length < 10) { inp.checked = true; unitSelectSelected.push(k); }
    }
  }
  updateUnitSelectUI();
  screen.classList.add('is-open');
  screen.setAttribute('aria-hidden', 'false');
}

const UNITSELECT_HINT = 'Pilih 10 jenis unit. Wajib memilih minimal satu jenis Corps. Corps & Advanced Corps tidak dibeli di Barak: keduanya datang dari Garnisun. Jika keduanya dipilih, Garnisun mengirim 2 Corps per paket (1 per jenis).';
const UNITSELECT_HINT_PROG = 'Pilih 1 sampai 10 jenis unit. Wajib minimal satu jenis Corps dan satu unit non-Corps. Corps dan Advanced Corps tidak dibeli di Barak: keduanya datang dari Garnisun.';
const UNITSELECT_NEED_NONCORPS = 'Pilih juga minimal satu unit non-Corps.';
const UNITSELECT_NEED_CORPS = 'Pilih minimal satu jenis Corps (Corps atau Advanced Corps).';
function unitSelectHasCorps() { return unitSelectSelected.includes('corps') || unitSelectSelected.includes('advcorps'); }

function toggleUnitSelection(unitKey, checked) {
  if (checked) {
    if (unitSelectSelected.length >= 10) {
      const input = document.querySelector(`#unitselect-list input[data-unit-select="${unitKey}"]`);
      if (input) input.checked = false;
      const message = document.getElementById('unitselect-message');
      if (message) message.textContent = 'Maksimal 10 jenis unit. Batalkan pilihan lain untuk menggantinya.';
      return;
    }
    if (!unitSelectSelected.includes(unitKey)) unitSelectSelected.push(unitKey);
  } else {
    unitSelectSelected = unitSelectSelected.filter(key => key !== unitKey);
  }
  updateUnitSelectUI();
}

function updateUnitSelectUI() {
  const count = document.getElementById('selected-num');
  const confirm = document.getElementById('unitselect-confirm');
  if (count) count.textContent = String(unitSelectSelected.length);
  const prog = unitSelectProgMode();
  if (confirm) confirm.disabled = prog ? !(unitSelectSelected.length >= 1 && unitSelectHasCorps() && unitSelectHasNonCorps()) : (unitSelectSelected.length !== 10 || !unitSelectHasCorps());   // v10.1 (P4); v13: 1-10 + non-Corps
  const message = document.getElementById('unitselect-message');
  if (message) message.textContent = prog ? (unitSelectSelected.length >= 1 && !unitSelectHasCorps() ? UNITSELECT_NEED_CORPS : unitSelectSelected.length >= 1 && !unitSelectHasNonCorps() ? UNITSELECT_NEED_NONCORPS : UNITSELECT_HINT_PROG)
    : ((unitSelectSelected.length === 10 && !unitSelectHasCorps()) ? UNITSELECT_NEED_CORPS : UNITSELECT_HINT);
  const head = document.getElementById('unitselect-title'); if (head) head.textContent = prog ? 'Pilih Unit untuk Bertempur' : 'Pilih 10 Unit untuk Bertempur';
  document.querySelectorAll('#unitselect-list input[data-unit-select]').forEach(input => {
    const locked = input.closest('.unitselect-option').classList.contains('locked');
    input.disabled = locked || (!input.checked && unitSelectSelected.length >= 10);
  });
}

function resetUnitSelection() {
  unitSelectSelected = [];
  document.querySelectorAll('#unitselect-list input[data-unit-select]').forEach(input => {
    input.checked = false;
    input.disabled = input.closest('.unitselect-option').classList.contains('locked');
  });
  updateUnitSelectUI();
}

function isHumanUnitAllowed(unitKey) {
  // Corps & Advanced Corps tidak dibeli dari Barak; keduanya produksi Garnisun.
  if (unitKey === 'corps' || unitKey === 'advcorps') return true;
  return !selectedLoadoutAktif || selectedLoadoutUnits.includes(unitKey);   // v13: penanda eksplisit (loadout boleh < 10)
}

function confirmUnitSelection() {
  const prog = unitSelectProgMode();
  if (prog ? (unitSelectSelected.length < 1 || !unitSelectHasNonCorps()) : unitSelectSelected.length !== 10) return;
  if (!unitSelectHasCorps()) {   // v10.1 (P4): minimal satu jenis Corps wajib
    const msg = document.getElementById('unitselect-message');
    if (msg) msg.textContent = UNITSELECT_NEED_CORPS;
    return;
  }
  selectedLoadoutUnits = unitSelectSelected.slice();
  selectedLoadoutAktif = true;                       // v13
  if (prog) Prog.saveLoadout(unitSelectPendingOpts.mode, unitSelectSelected);   // v13: loadoutTerakhir
  const screen = document.getElementById('unitselect-screen');
  const message = document.getElementById('unitselect-message');
  const wwOpts = unitSelectPendingOpts && unitSelectPendingOpts.mode === 'ww' ? unitSelectPendingOpts : null;
  if (unitSelectPendingOpts && unitSelectPendingOpts.mode === 'mp') {   // v12: Multiplayer — kirim pilihan ke lawan, game dimulai tuan rumah
    screen.classList.remove('is-open'); screen.setAttribute('aria-hidden', 'true');
    MP.onLoadout(unitSelectSelected.slice());
    return;
  }
  try {
    if (wwOpts) { WorldWar.saveLoadout(unitSelectSelected); WorldWar.beginBattle(wwOpts.target, wwOpts.role); }   // v11: pending tersimpan sebelum startGame (K9)
    startGame(unitSelectPendingOpts || { mode: 'bot', level: 'sedang' });
    screen.classList.remove('is-open');
    screen.setAttribute('aria-hidden', 'true');
  } catch (err) {
    selectedLoadoutUnits = []; selectedLoadoutAktif = false;
    if (wwOpts) WorldWar.cancelBattle();
    if (typeof gameStarted !== 'undefined') gameStarted = false;
    if (message) message.textContent = 'Permainan gagal dimulai. Coba lagi; detail error ada di console.';
    console.error('Gagal memulai Tactical Domination setelah pemilihan unit:', err);
  }
}
