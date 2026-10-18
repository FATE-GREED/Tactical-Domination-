// ====================================================================
// unit-select.js — v9.8: pemilihan tepat 10 jenis unit sebelum game.
// Pilihan membatasi unit yang dapat di-deploy pemain manusia dari Barak.
// Bot tidak dibatasi (Garnisun bot meniru pilihan Corps pemain). Corps & Advanced Corps
// tidak dibeli di Barak: Garnisun memproduksinya (v10, lihat rules-economy.js).
// v10.1 (P4): wajib memilih minimal satu jenis Corps (Corps atau Advanced Corps).
// ====================================================================

let unitSelectPendingOpts = null;
let unitSelectSelected = [];

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
    category: (key === 'corps' || key === 'advcorps') ? 'Corps'
      : key.startsWith('adv') ? 'Advanced'
      : def.vehicle ? 'Kendaraan' : 'Infanteri'
  }));
}

function showUnitSelectScreen(opts) {
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
        <label class="unitselect-option">
          <input type="checkbox" value="${item.key}" data-unit-select="${item.key}">
          <span class="unitselect-name">${item.name}</span>
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
  updateUnitSelectUI();
  screen.classList.add('is-open');
  screen.setAttribute('aria-hidden', 'false');
}

const UNITSELECT_HINT = 'Pilih 10 jenis unit. Wajib memilih minimal satu jenis Corps. Corps & Advanced Corps tidak dibeli di Barak: keduanya datang dari Garnisun. Jika keduanya dipilih, Garnisun mengirim 2 Corps per paket (1 per jenis).';
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
  if (confirm) confirm.disabled = unitSelectSelected.length !== 10 || !unitSelectHasCorps();   // v10.1 (P4)
  const message = document.getElementById('unitselect-message');
  if (message) message.textContent = (unitSelectSelected.length === 10 && !unitSelectHasCorps()) ? UNITSELECT_NEED_CORPS : UNITSELECT_HINT;
  document.querySelectorAll('#unitselect-list input[data-unit-select]').forEach(input => {
    input.disabled = !input.checked && unitSelectSelected.length >= 10;
  });
}

function resetUnitSelection() {
  unitSelectSelected = [];
  document.querySelectorAll('#unitselect-list input[data-unit-select]').forEach(input => {
    input.checked = false;
    input.disabled = false;
  });
  updateUnitSelectUI();
}

function isHumanUnitAllowed(unitKey) {
  // Corps & Advanced Corps tidak dibeli dari Barak; keduanya produksi Garnisun.
  if (unitKey === 'corps' || unitKey === 'advcorps') return true;
  return selectedLoadoutUnits.length !== 10 || selectedLoadoutUnits.includes(unitKey);
}

function confirmUnitSelection() {
  if (unitSelectSelected.length !== 10) return;
  if (!unitSelectHasCorps()) {   // v10.1 (P4): minimal satu jenis Corps wajib
    const msg = document.getElementById('unitselect-message');
    if (msg) msg.textContent = UNITSELECT_NEED_CORPS;
    return;
  }
  selectedLoadoutUnits = unitSelectSelected.slice();
  const screen = document.getElementById('unitselect-screen');
  const message = document.getElementById('unitselect-message');
  const wwOpts = unitSelectPendingOpts && unitSelectPendingOpts.mode === 'ww' ? unitSelectPendingOpts : null;
  try {
    if (wwOpts) { WorldWar.saveLoadout(unitSelectSelected); WorldWar.beginBattle(wwOpts.target, wwOpts.role); }   // v11: pending tersimpan sebelum startGame (K9)
    startGame(unitSelectPendingOpts || { mode: 'bot', level: 'sedang' });
    screen.classList.remove('is-open');
    screen.setAttribute('aria-hidden', 'true');
  } catch (err) {
    selectedLoadoutUnits = [];
    if (wwOpts) WorldWar.cancelBattle();
    if (typeof gameStarted !== 'undefined') gameStarted = false;
    if (message) message.textContent = 'Permainan gagal dimulai. Coba lagi; detail error ada di console.';
    console.error('Gagal memulai Tactical Domination setelah pemilihan unit:', err);
  }
}
