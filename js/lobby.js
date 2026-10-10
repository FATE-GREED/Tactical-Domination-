// ====================================================================
// lobby.js — Layar lobby sebelum game dimulai.
//  - Tile / Unit / Bangunan: katalog, dibaca langsung dari state.js
//    (TERRAIN, UNITS, CORPS_DEF, BUILDING_TYPES) jadi otomatis ikut
//    berubah kalau angka di state.js diubah.
//  - Mulai: modal 4 pilihan. Hanya Bot Sulit yang sudah jalan.
//  - Tombol lain: "Dalam tahap pengembangan".
//  - Musik lobby (bgm-battle) + auto-start untuk 'Main Lagi'.
// Tidak menyentuh aturan game; hanya memanggil startGame() (main.js).
// ====================================================================
(function () {
  const $ = id => document.getElementById(id);
  const lobby = $('lobby'), modal = $('lbModal'), body = $('lbModalBody'), title = $('lbModalTitle'), toast = $('lbToast');
  let lastFocus = null, toastTimer = null;

  // ---------- Toast "Dalam tahap pengembangan" ----------
  function showDev() {
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  // ---------- Modal ----------
  function openModal(heading, html, wide) {
    lastFocus = document.activeElement;
    title.textContent = heading;
    body.innerHTML = html;
    body.scrollTop = 0;
    modal.classList.toggle('wide', !!wide);
    modal.hidden = false;
    $('lbModalClose').focus();
  }
  function closeModal() {
    modal.hidden = true;
    body.innerHTML = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  const fmt = v => (v === Infinity ? '∞' : (v === null || v === undefined ? '—' : v));
  const stat = (k, v, cls) => `<div class="st ${cls || ''}"><span>${k}</span><b>${fmt(v)}</b></div>`;
  const tag = t => `<span class="tg">${t}</span>`;

  // ---------- Katalog: Tile ----------
  function tileHTML() {
    const rows = Object.values(TERRAIN).map(t => `
      <article class="card">
        <div class="hex" style="background:${t.color}"></div>
        <div class="card-main">
          <h3>${t.name} <small>${t.pct}% peta</small></h3>
          <p>${t.effect}</p>
        </div>
      </article>`).join('');
    return `<div class="grid g-tile">${rows}</div>`;
  }

  // ---------- Katalog: Unit ----------
  function unitCard(key, u, isCorps) {
    const w = u.name.split(/[\s-]+/);
    const code = isCorps ? 'C' : (w.length > 1 ? w[0][0] + w[1][0] : u.name.slice(0, 2)).toUpperCase();
    const tags = [];
    if (u.tank) tags.push(tag('Tank'));
    else if (u.vehicle) tags.push(tag('Kendaraan'));
    else tags.push(tag('Infanteri'));
    if (!u.combat) tags.push(tag('Non-tempur'));
    const fuel = u.hasFuel ? `${u.fuelMax} (−${u.fuelUse}/langkah)` : '—';
    return `
      <article class="card unit">
        <div class="card-head"><i class="badge">${code}</i><h3>${isCorps ? 'Corps' : u.name}</h3><div class="tags">${tags.join('')}</div></div>
        <div class="stats">
          ${stat('Harga', isCorps ? null : u.price)}
          ${stat('HP', u.hp)}
          ${stat('ATK', u.combat ? u.atk : null)}
          ${stat('DEF', u.def)}
          ${stat('Range', u.combat ? u.range : null)}
          ${stat('SPD', u.spd)}
          ${stat('JPD', u.jpd)}
          ${stat('Fuel', fuel, 'wide')}
        </div>
      </article>`;
  }
  function unitHTML() {
    const cards = Object.entries(UNITS).map(([k, u]) => unitCard(k, u, false)).join('') + unitCard('corps', CORPS_DEF, true);
    return `<p class="note">SPD = poin gerak per giliran · JPD = jarak pandang deteksi</p><div class="grid g-unit">${cards}</div>`;
  }

  // ---------- Katalog: Kemampuan unik unit ----------
  function abilityHTML() {
    const entries = [...Object.entries(UNITS), ['corps', CORPS_DEF]];
    const cards = entries.filter(([k]) => UNIT_ABILITIES[k]).map(([k, u]) => {
      const isCorps = k === 'corps';
      const w = u.name.split(/[\s-]+/);
      const code = isCorps ? 'C' : (w.length > 1 ? w[0][0] + w[1][0] : u.name.slice(0, 2)).toUpperCase();
      const items = UNIT_ABILITIES[k].map(([n, d]) => `<li><b>${n}</b><span>${d}</span></li>`).join('');
      return `
      <article class="card unit">
        <div class="card-head"><i class="badge">${code}</i><h3>${u.name}</h3></div>
        <ul class="ab-list">${items}</ul>
      </article>`;
    }).join('');
    return `<p class="note">Kemampuan unik tiap unit. Buff dari kemampuan yang sama tidak menumpuk walau sumbernya berbeda unit.</p><div class="grid g-abil">${cards}</div>`;
  }

  // ---------- Katalog: Bangunan ----------
  function buildingHTML() {
    const cards = Object.entries(BUILDING_TYPES).map(([k, b]) => {
      const tags = [tag(b.destructible ? 'Bisa dihancurkan' : 'Tidak bisa dihancurkan')];
      return `
      <article class="card unit">
        <div class="card-head"><i class="badge sq">${b.label}</i><h3>${b.name}</h3><div class="tags">${tags.join('')}</div></div>
        <div class="stats">
          ${stat('HP', b.hp)}
          ${stat('DEF', b.def)}
          ${stat('Corps', b.corpsRequired ? b.corpsRequired : null)}
          ${stat('Giliran bangun', b.turnsRequired ? b.turnsRequired : null)}
          ${stat('Maks', b.maxCount, 'wide')}
        </div>
      </article>`;
    }).join('');
    return `<div class="grid g-unit">${cards}</div>`;
  }

  // ---------- Modal Mulai ----------
  function startHTML() {
    return `
      <div class="modes">
        <button class="mode" data-mode="lokal"><b>Multiplayer lokal</b><small>2 pemain, satu perangkat</small><i>Segera</i></button>
        <button class="mode ready" data-mode="sulit"><b>Bot sulit</b><small>Lawan bot dengan taktik penuh</small></button>
        <button class="mode" data-mode="sedang"><b>Bot sedang</b><small>Lawan bot yang lebih santai</small><i>Segera</i></button>
        <button class="mode" data-mode="mudah"><b>Bot mudah</b><small>Cocok untuk belajar dasar</small><i>Segera</i></button>
      </div>`;
  }

  // ---------- Loading screen singkat sebelum game dimulai ----------
  // startGame() sinkron & berat (generate peta), jadi garis dijalankan lewat transisi CSS
  // lebih dulu, baru startGame() dipanggil. Tampil minimal MIN ms supaya terlihat.
  const loading = $('loading'), ldFill = $('ldFill');
  function showLoading(work) {
    const MIN = 1400, t0 = performance.now();
    loading.hidden = false; loading.classList.remove('hide');
    ldFill.style.transition = 'none'; ldFill.style.transform = 'scaleX(0)';
    void loading.offsetWidth;
    ldFill.style.transition = `transform ${MIN * 0.85}ms cubic-bezier(.25,.6,.35,1)`;
    ldFill.style.transform = 'scaleX(.9)';
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
      try { work(); } catch (err) { console.warn('startGame gagal:', err); }
      setTimeout(() => {
        ldFill.style.transition = 'transform .25s ease-out'; ldFill.style.transform = 'scaleX(1)';
        setTimeout(() => {
          loading.classList.add('hide');
          setTimeout(() => { loading.hidden = true; }, 450);
        }, 300);
      }, Math.max(0, MIN - (performance.now() - t0)));
    }, 40)));
  }

  function enterGame(opts) {
    closeModal();
    showLoading(() => { lobby.style.display = 'none'; startGame(opts); });
  }

  // ---------- Event ----------
  lobby.addEventListener('click', e => {
    if (e.target.closest('.lb-gear')) { Settings.open(); return; }
    const dev = e.target.closest('[data-dev]');
    if (dev) { showDev(); return; }

    const open = e.target.closest('[data-open]');
    if (open) {
      const k = open.dataset.open;
      if (k === 'tile') openModal('Tile', tileHTML(), true);
      if (k === 'unit') openModal('Unit', unitHTML(), true);
      if (k === 'kemampuan') openModal('Kemampuan', abilityHTML(), true);
      if (k === 'bangunan') openModal('Bangunan', buildingHTML(), true);
      return;
    }

    if (e.target.closest('#lbStartBtn')) { openModal('Pilih mode', startHTML(), false); return; }

    const mode = e.target.closest('.mode');
    if (mode) {
      if (mode.dataset.mode === 'sulit') enterGame({ mode: 'bot', level: 'sulit' });
      else showDev();
      return;
    }

    if (e.target === modal || e.target.closest('#lbModalClose')) closeModal();
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  // ---------- Masuk lobby: musik lobby, atau langsung main (tombol 'Main Lagi') ----------
  let auto = false;
  try { auto = sessionStorage.getItem('td-autostart') === '1'; sessionStorage.removeItem('td-autostart'); } catch (e) {}
  if (auto) {
    lobby.style.display = 'none';
    showLoading(() => startGame({ mode: 'bot', level: 'sulit' }));
  } else {
    Sfx.music('lobby'); // mulai terdengar setelah sentuhan pertama (aturan autoplay browser)
  }
})();
