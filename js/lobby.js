// ====================================================================
// lobby.js — Layar lobby sebelum game dimulai.
//  - Tile / Unit / Bangunan: katalog, dibaca langsung dari state.js
//    (TERRAIN, UNITS, CORPS_DEF, BUILDING_TYPES) jadi otomatis ikut
//    berubah kalau angka di state.js diubah.
//  - Mulai: modal tegak 4 mode (Klasik, Campaign, Perang Dunia, Multiplayer); Klasik -> 3 bot (Mudah, Sedang, Sulit — semua aktif sejak v10.2).
//  - Tombol lain: "Dalam tahap pengembangan".
//  - Musik lobby (bgm-battle) + auto-start untuk 'Main Lagi'.
// Meminta unit-select.js menampilkan pemilihan roster sebelum startGame() (main.js).
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
    modal.classList.remove('tall');
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
  window.canvasURL = canvasURL;   // v13: dipakai Inventory (progress-ui.js)
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

  window.unitImg = unitImg;       // v13
  // Ikon skill: data & fungsi ada di js/skill-icons.js (dipakai juga di dalam pertandingan)
  const skillIcon = skillIconHTML;

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
        <div class="card-head">${unitImg(key)}<h3>${u.name}</h3><div class="tags">${tags.join('')}</div></div>
        <div class="stats">
          ${stat('Harga', u.price == null ? null : u.price)}
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
    const cards = Object.entries(UNITS).map(([k, u]) => unitCard(k, u, false)).join('') + unitCard('corps', CORPS_DEF, true) + unitCard('advcorps', ADV_CORPS_DEF, true);
    return `<p class="note">SPD = poin gerak per giliran · JPD = jarak pandang deteksi</p><div class="grid g-unit">${cards}</div>`;
  }

  // ---------- Katalog: Kemampuan unik unit ----------
  function abilityHTML() {
    const entries = [...Object.entries(UNITS), ['corps', CORPS_DEF], ['advcorps', ADV_CORPS_DEF]];
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
    const bItems = Object.entries(BUILDING_BUFFS).map(([n, d]) => `<li>${skillIcon(n)}<div><b>${n}</b><span>${d}</span></div></li>`).join('');
    const bCard = `
      <article class="card unit">
        <div class="card-head">${buildingImg('markas')}<h3>Efek Bangunan</h3></div>
        <ul class="ab-list">${bItems}</ul>
      </article>`;
    return `<p class="note">Kemampuan unik tiap unit. Buff dari kemampuan yang sama tidak menumpuk walau sumbernya berbeda unit.</p><div class="grid g-abil">${cards}${bCard}</div>`;
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

  // ---------- Modal Mulai (v9.3): 4 mode -> (Klasik) 3 bot ----------
  const IC = {
    klasik:   '<svg viewBox="0 0 48 48"><path d="M24 5l15 8.5v17L24 39 9 30.5v-17z"/><path d="M24 14l7 4v8l-7 4-7-4v-8z"/></svg>',
    campaign: '<svg viewBox="0 0 48 48"><path d="M12 6v37"/><path d="M12 8h26l-6 8 6 8H12"/></svg>',
    perang:   '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="17"/><path d="M7 24h34M24 7c-8 9-8 25 0 34M24 7c8 9 8 25 0 34"/></svg>',
    multi:    '<svg viewBox="0 0 48 48"><circle cx="16" cy="17" r="6"/><circle cx="33" cy="19" r="5"/><path d="M5 40c0-8 5-13 11-13s11 5 11 13M28 40c0-6 3-10 8-10s8 4 8 10"/></svg>',
    bot:      '<svg viewBox="0 0 48 48"><rect x="10" y="14" width="28" height="22" rx="4"/><path d="M24 14V7M18 25h.01M30 25h.01M18 31h12"/></svg>',
  };
  const pick = (attr, key, icon, name, sub, ready) =>
    `<button class="pick${ready ? ' ready' : ''}" ${attr}="${key}"><span class="pk-ic">${icon}</span><b>${name}</b><small>${sub}</small>${ready ? '' : '<i>Segera</i>'}</button>`;
  function startHTML() {
    return `<div class="picks">
      ${pick('data-start', 'klasik',   IC.klasik,   'Permainan Klasik', 'Lawan bot di medan tile hex', true)}
      ${pick('data-start', 'campaign', IC.campaign, 'Campaign',         'Kisah para komandan', true)}
      ${pick('data-start', 'ww',       IC.perang,   'World War',        'Rebut 6 ibukota benua', true)}
      ${pick('data-start', 'multi',    IC.multi,    'Multiplayer',      'Room chat global & tantangan', true)}
    </div>`;
  }
  function botHTML() {
    return `<button class="pk-back" data-back>‹ Kembali</button>
    <div class="picks">
      ${pick('data-mode', 'mudah',  IC.bot, 'Bot Mudah',  'Pasif, stat musuh 80%', true)}
      ${pick('data-mode', 'sedang', IC.bot, 'Bot Sedang', 'Seimbang, rajin menyerang', true)}
      ${pick('data-mode', 'sulit',  IC.bot, 'Bot Sulit',  'Agresif, stat musuh 120%', true)}
    </div>`;
  }
  function openStart() { openModal('Pilih mode', startHTML(), false); modal.classList.add('tall'); }
  function openBots()  { openModal('Permainan Klasik', botHTML(), false); modal.classList.add('tall'); }

  // ---------- Loading screen singkat sebelum game dimulai ----------
  // startGame() sinkron & berat (generate peta), jadi garis dijalankan lewat transisi CSS
  // lebih dulu, baru startGame() dipanggil. Tampil minimal MIN ms supaya terlihat.
  const loading = $('loading'), ldFill = $('ldFill');
  // v10.1 (P1): `after` (opsional) dijalankan SETELAH Loading benar-benar tersembunyi (loading.hidden = true),
  // supaya layar Pilih Unit (z-index 2000) tidak terlihat saat Loading masih tampil.
  function showLoading(work, after) {
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
          setTimeout(() => {
            loading.hidden = true;
            if (after) { try { after(); } catch (err) { console.warn('after-loading gagal:', err); } }
          }, 450);
        }, 300);
      }, Math.max(0, MIN - (performance.now() - t0)));
    }, 40)));
  }

  function enterGame(opts) {
    closeModal();
    showLoading(() => { lobby.style.display = 'none'; }, () => showUnitSelectScreen(opts));   // v10.1 (P1): Pilih Unit baru muncul setelah Loading hilang
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

    if (e.target.closest('#lbStartBtn')) { openStart(); return; }

    const st = e.target.closest('[data-start]');
    if (st) {
      if (st.dataset.start === 'klasik') openBots();
      else if (st.dataset.start === 'campaign') { closeModal(); Campaign.enter(); }   // v9.7: Chapter 1 / peta Vanderick
      else if (st.dataset.start === 'ww') { closeModal(); showLoading(() => { lobby.style.display = 'none'; }, () => WorldWar.enter()); }   // v11
      else if (st.dataset.start === 'multi') { closeModal(); showLoading(() => { lobby.style.display = 'none'; }, () => MP.enter()); }   // v12
      else showDev();
      return;
    }
    if (e.target.closest('[data-back]')) { openStart(); return; }

    const mode = e.target.closest('[data-mode]');
    if (mode) {
      if (['mudah', 'sedang', 'sulit'].includes(mode.dataset.mode)) enterGame({ mode: 'bot', level: mode.dataset.mode });
      else showDev();
      return;
    }

    if (e.target === modal || e.target.closest('#lbModalClose')) closeModal();
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  // ---------- Masuk lobby: musik lobby, atau langsung main (tombol 'Main Lagi') ----------
  Campaign.bind({ lobby, showLoading });
  WorldWar.bind({ lobby, showLoading });
  MP.bind({ lobby, showLoading });
  let auto = '', openAfter = '';
  try {
    auto = sessionStorage.getItem('td-autostart') || ''; sessionStorage.removeItem('td-autostart');
    openAfter = sessionStorage.getItem('td-open') || ''; sessionStorage.removeItem('td-open');
  } catch (e) {}
  if (auto === 'campaign') {                 // "Ulangi" setelah kalah: langsung ke pertempuran Chapter 1
    lobby.style.display = 'none';
    Campaign.startBattle();
  } else if (auto) {
    lobby.style.display = 'none';
    showLoading(() => { lobby.style.display = 'none'; }, () => showUnitSelectScreen({ mode: 'bot', level: ['mudah', 'sedang', 'sulit'].includes(auto) ? auto : 'sedang' }));   // v10.1 (P1); v10.2: tingkat bot dipertahankan saat Main Lagi
  } else {
    Sfx.music('lobby'); // mulai terdengar setelah sentuhan pertama (aturan autoplay browser)
    if (openAfter === 'campaign') Campaign.enter();   // selesai Chapter 1: tampilkan peta Vanderick
    if (openAfter === 'ww') WorldWar.enter();         // v11: selesai pertandingan World War: kembali ke peta benua
    if (openAfter === 'mp') { lobby.style.display = 'none'; MP.enter(); }   // v12: selesai/keluar pertandingan Multiplayer: kembali ke room
  }
})();
