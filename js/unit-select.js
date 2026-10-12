// ====================================================================
// unit-select.js — v9.8: pemilihan tepat 10 jenis unit sebelum game.
// Pilihan membatasi unit yang dapat di-deploy pemain manusia dari Barak.
// Bot tidak dibatasi. Corps biasa tetap diproduksi Garnisun untuk menjaga
// mekanisme pembangunan inti tetap berfungsi.
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

  unitSelectPendingOpts = opts || { mode: 'bot', level: 'sulit' };
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
  updateUnitSelectUI();
  screen.classList.add('is-open');
  screen.setAttribute('aria-hidden', 'false');
}

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
  const message = document.getElementById('unitselect-message');
  if (message) message.textContent = 'Pilih 10 jenis unit. Corps biasa tetap diproduksi oleh Garnisun agar pembangunan tetap berfungsi.';
  updateUnitSelectUI();
}

function updateUnitSelectUI() {
  const count = document.getElementById('selected-num');
  const confirm = document.getElementById('unitselect-confirm');
  if (count) count.textContent = String(unitSelectSelected.length);
  if (confirm) confirm.disabled = unitSelectSelected.length !== 10;
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
  const message = document.getElementById('unitselect-message');
  if (message) message.textContent = 'Pilih 10 jenis unit. Corps biasa tetap diproduksi oleh Garnisun agar pembangunan tetap berfungsi.';
  updateUnitSelectUI();
}

function isHumanUnitAllowed(unitKey) {
  // Corps biasa tidak dibeli dari Barak; ia adalah unit inti produksi Garnisun.
  if (unitKey === 'corps') return true;
  return selectedLoadoutUnits.length !== 10 || selectedLoadoutUnits.includes(unitKey);
}

function confirmUnitSelection() {
  if (unitSelectSelected.length !== 10) return;
  selectedLoadoutUnits = unitSelectSelected.slice();
  const screen = document.getElementById('unitselect-screen');
  const message = document.getElementById('unitselect-message');
  try {
    startGame(unitSelectPendingOpts || { mode: 'bot', level: 'sulit' });
    screen.classList.remove('is-open');
    screen.setAttribute('aria-hidden', 'true');
  } catch (err) {
    selectedLoadoutUnits = [];
    if (typeof gameStarted !== 'undefined') gameStarted = false;
    if (message) message.textContent = 'Permainan gagal dimulai. Coba lagi; detail error ada di console.';
    console.error('Gagal memulai Tactical Domination setelah pemilihan unit:', err);
  }
}
