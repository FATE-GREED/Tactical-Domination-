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


  // ---------- v9.5: gambar asli (tile, unit, bangunan) & ikon skill ----------
  // Memakai fungsi gambar game yang sama (terrainSprites, UNIT_RENDERERS, BUILDING_ART) ke canvas kecil -> data URL.
  const imgCache = {};
  function canvasURL(id, w, h, draw) {
    if (imgCache[id]) return imgCache[id];
    const dpr = 2, cv = document.createElement('canvas');
    cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    try { draw(c, w, h); } catch (e) { /* gambar gagal -> kartu tetap tampil tanpa gambar */ }
    return (imgCache[id] = cv.toDataURL());
  }
  function terrainBase(c, key, cx, cy, size) {
    if (!terrainSprites[key]) buildTerrainSprites();
    const sp = terrainSprites[key];
    if (sp) c.drawImage(sp.canvas, cx - size / 2, cy - size / 2, size, size);
  }
  const tileImg = key => `<img class="gfx gfx-tile" alt="${TERRAIN[key].name}" src="${canvasURL('t-' + key, 56, 56, c => terrainBase(c, key, 28, 28, 56))}">`;
  const unitImg = key => `<img class="gfx gfx-unit" alt="${key}" src="${canvasURL('u-' + key, 78, 72, (c, w, h) => {
    terrainBase(c, 'grass', w / 2, h / 2, 78);
    UNIT_RENDERERS[key](c, w / 2, h / 2 + 6, 42);
  })}">`;
  function bridgeArt(c) {                     // Jembatan & Renov tidak punya BUILDING_ART — digambar sederhana
    c.save(); c.rotate(-0.35);
    c.fillStyle = '#6b5233'; c.fillRect(-0.95, -0.2, 1.9, 0.4);
    c.strokeStyle = '#3e2f1c'; c.lineWidth = 0.03;
    for (let x = -0.85; x < 0.95; x += 0.17) { c.beginPath(); c.moveTo(x, -0.2); c.lineTo(x, 0.2); c.stroke(); }
    c.strokeStyle = '#8a6c44'; c.lineWidth = 0.05;
    c.beginPath(); c.moveTo(-0.95, -0.2); c.lineTo(0.95, -0.2); c.moveTo(-0.95, 0.2); c.lineTo(0.95, 0.2); c.stroke();
    c.restore();
  }
  const buildingImg = key => `<img class="gfx gfx-bld" alt="${BUILDING_TYPES[key].name}" src="${canvasURL('b-' + key, 100, 88, (c, w, h) => {
    if (key === 'jembatan') { terrainBase(c, 'river', w / 2, h / 2, 92); c.save(); c.translate(w / 2, h / 2); c.scale(36, 36); bridgeArt(c); c.restore(); return; }
    if (key === 'renov') {                    // 3 tile menjadi Grass
      terrainBase(c, 'grass', w / 2 - 22, h / 2 + 12, 52); terrainBase(c, 'grass', w / 2 + 22, h / 2 + 12, 52); terrainBase(c, 'grass', w / 2, h / 2 - 14, 52);
      return;
    }
    terrainBase(c, 'grass', w / 2, h / 2, 92);
    const art = BUILDING_ART[key]; if (!art) return;
    c.save(); c.translate(w / 2, h / 2 + 4); c.scale(36, 36);
    art(c, PLAYER_COLORS[0], { n: 3 });
    c.restore();
  })}">`;

  // Ikon skill: 24x24, putih di atas lingkaran berwarna menurut jenis (merah=serang, biru=bertahan, hijau=gerak, ungu=intel, oranye=hancur, kuning=kerja)
  const SK = {
    red: ['#e0574f', '#7d1f1a'], blue: ['#4f8fe0', '#1b3f7d'], green: ['#5fb760', '#1f5a21'],
    purple: ['#a06ad8', '#43237a'], orange: ['#e8923a', '#7d4210'], yellow: ['#e3c445', '#6e5a0a'],
  };
  const SKILL_ICONS = {
    'Moral Persatuan':     ['blue',   '<circle cx="8" cy="8" r="2.6"/><circle cx="16" cy="8" r="2.6"/><path d="M3.5 18c0-3.2 2-5 4.5-5s4.5 1.8 4.5 5zM11.5 18c0-3.2 2-5 4.5-5s4.5 1.8 4.5 5z"/>'],
    'Semangat Perjuangan': ['red',    '<path d="M12 2.5c.8 3-1.3 4.2-2.6 6.2C8.2 10.5 8 12 9 13c-2.4-.4-3.5-2.5-3.2-4.6C4.2 10 3.5 12 3.5 14a8.5 8.5 0 0 0 17 0c0-4.2-3-6.2-4.3-8.8-.6 1.3-1.2 2-2.2 2.6C14.3 5.8 13.3 4 12 2.5z"/>'],
    'Serangan Kejut':      ['red',    '<path d="M12 1.8l2.2 6.2 6.5-.4-5.2 4 2 6.3L12 14.2 6.5 18l2-6.3-5.2-4 6.5.4z"/>'],
    'Yang Tersembunyi':    ['purple', '<path d="M2 12c2.5-4.5 6-6.5 10-6.5s7.5 2 10 6.5c-2.5 4.5-6 6.5-10 6.5S4.5 16.5 2 12z" opacity=".95"/><circle cx="12" cy="12" r="3.2" fill="#43237a"/><path d="M4 20L20 4" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/>'],
    'Konsentrasi Tinggi':  ['red',    '<circle cx="12" cy="12" r="7" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="1.8"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"/>'],
    'Sang Pengamat':       ['purple', '<path d="M2 12c2.5-4.5 6-6.5 10-6.5s7.5 2 10 6.5c-2.5 4.5-6 6.5-10 6.5S4.5 16.5 2 12z"/><circle cx="12" cy="12" r="3.6" fill="#43237a"/><circle cx="13" cy="11" r="1.1"/>'],
    'Semangat Besi':       ['green',  '<path d="M10.4 2h3.2l.5 2.6 1.8.8 2.2-1.5 2.3 2.3-1.5 2.2.8 1.8L22 10.4v3.2l-2.6.5-.8 1.8 1.5 2.2-2.3 2.3-2.2-1.5-1.8.8-.5 2.6h-3.2l-.5-2.6-1.8-.8-2.2 1.5-2.3-2.3 1.5-2.2-.8-1.8L2 13.6v-3.2l2.6-.5.8-1.8-1.5-2.2 2.3-2.3 2.2 1.5 1.8-.8z"/><circle cx="12" cy="12" r="3.4" fill="#1f5a21"/>'],
    'Ayo Ledakkan':        ['orange', '<path d="M12 1.5l2 4.5 4.6-2-1.6 4.8 4.9.700-3.8 3.3 3 3.8-4.8-.6.3 4.9L12 17.8l-4.6 3.1.3-4.9-4.8.6 3-3.8L2.1 9.5 7 8.8 5.4 4l4.6 2z"/><circle cx="12" cy="11.5" r="3" fill="#7d4210"/>'],
    'Sang Pelindung':      ['blue',   '<path d="M12 2.2l8 3v6c0 5-3.4 8.6-8 10.6-4.6-2-8-5.6-8-10.6v-6z"/><path d="M12 6.5v11" stroke="#1b3f7d" stroke-width="1.8" fill="none"/>'],
    'Pejuang Bertahan':    ['blue',   '<path d="M12 21s-8-5-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 6-8 11-8 11z"/>'],
    'Penggila Perang':     ['red',    '<path d="M12 2.5c-4.7 0-8 3-8 7.2 0 2.6 1.3 4.3 3 5.3V19h3v-2h4v2h3v-4c1.7-1 3-2.7 3-5.3 0-4.2-3.3-7.2-8-7.2z"/><circle cx="8.8" cy="10.5" r="2" fill="#7d1f1a"/><circle cx="15.2" cy="10.5" r="2" fill="#7d1f1a"/><path d="M12 13l-1 2h2z" fill="#7d1f1a"/>'],
    'Intimidasi':          ['purple', '<path d="M12 2.5L22 20H2z"/><path d="M12 9v5.5" stroke="#43237a" stroke-width="2.2" stroke-linecap="round" fill="none"/><circle cx="12" cy="17.2" r="1.3" fill="#43237a"/>'],
    'Penghancur Bangunan': ['orange', '<path d="M14.5 2.5l7 7-3 3-2-2-8.5 8.5a2 2 0 0 1-2.8-2.8L13.7 7.7l-2-2z"/>'],
    'Perusak Formasi':     ['orange', '<circle cx="12" cy="12" r="3"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/>'],
    'Dikejar Waktu':       ['green',  '<path d="M3 5l8 7-8 7zM12 5l8 7-8 7z"/>'],
    'Kurir Setia':         ['yellow', '<path d="M3 8l9-5 9 5v9l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v9" stroke="#6e5a0a" stroke-width="1.6" fill="none"/>'],
    'Jangan Menganggur':   ['green',  '<path d="M6 3h5v8c0 .8.4 1.2 1 1.5L18 15c2 1 2.5 2 2.5 3.5V20H3.5V3z"/>'],
    'Kerja Sampai Tuntas': ['yellow', '<path d="M3.5 17a8.5 8.5 0 0 1 17 0z"/><rect x="2" y="17" width="20" height="3" rx="1.2"/><rect x="10.5" y="4" width="3" height="6" rx="1" fill="#6e5a0a"/>'],
  };
  function skillIcon(name) {
    const d = SKILL_ICONS[name]; if (!d) return '';
    const [light, dark] = SK[d[0]];
    return `<i class="sk" style="background:radial-gradient(circle at 35% 30%, ${light}, ${dark})"><svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true">${d[1]}</svg></i>`;
  }

  // ---------- Katalog: Tile ----------
  function tileHTML() {
    const rows = Object.values(TERRAIN).map(t => `
      <article class="card">
        ${tileImg(Object.keys(TERRAIN).find(k => TERRAIN[k] === t))}
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
        <div class="card-head">${unitImg(key)}<h3>${isCorps ? 'Corps' : u.name}</h3><div class="tags">${tags.join('')}</div></div>
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
      const items = UNIT_ABILITIES[k].map(([n, d]) => `<li>${skillIcon(n)}<div><b>${n}</b><span>${d}</span></div></li>`).join('');
      return `
      <article class="card unit">
        <div class="card-head">${unitImg(k)}<h3>${u.name}</h3></div>
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
        <div class="card-head">${buildingImg(k)}<h3>${b.name}</h3><div class="tags">${tags.join('')}</div></div>
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

  // ---------- Katalog: Komandan (v9.3) ----------
  // Belum berpengaruh ke permainan; efek hanya ditampilkan sebagai info.
  function commanderCard(c) {
    const fx = c.effect
      ? `<div class="cm-fx"><b>${c.effect.name}</b><span>${c.effect.text}</span>${c.effect.active ? '' : '<i>Belum aktif</i>'}</div>`
      : '';
    return `
      <article class="card cm">
        <div class="cm-pic"><img src="${c.img}" alt="${c.name}" loading="lazy" decoding="async" draggable="false"></div>
        <div class="cm-info">
          <h3>${c.name}</h3>
          <div class="tags">${tag(c.rank)}${tag(c.sex)}${tag('Seragam ' + c.uniform)}</div>
          <p>${c.desc}</p>
          ${fx}
        </div>
      </article>`;
  }
  function commanderHTML() {
    return `<p class="note">Komandan belum memengaruhi permainan.</p><div class="grid g-cmd">${COMMANDERS.map(commanderCard).join('')}</div>`;
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
      if (k === 'komandan') openModal('Komandan', commanderHTML(), true);
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
