// ====================================================================
// settings.js — Pengaturan pemain (disimpan di localStorage) + layar Pengaturan.
// Dipakai lobby (tombol roda gigi) dan menu pause. Nilai dibaca lewat Settings.get(kunci).
// ====================================================================
const Settings = (() => {
  const DEF = {
    volMusic: 100, volFx: 100, volStep: 100,            // 0..150 (%)
    panelAlpha: 60,                                      // 15..100 (%) kepekatan latar panel
    showHp: true, showDmgLog: true, showActLog: true, showKill: true,
    laneColor: '#5aa9ff', lockColor: '#ff8c3c',
    musicMode: 'fase',                                   // fase | single | urut | acak
    musicSingle: 'bgm-plan',
    musicOrder: ['bgm-plan', 'bgm-battle'],
    musicShuffle: { 'bgm-plan': true, 'bgm-battle': true },
    panSens: 100,                                        // 40..250 (%)
    enemyDelay: 2,                                       // detik jeda sebelum eksekusi musuh (0..3)
    fast: false,                                         // tombol kecepatan 2x
  };
  const TRACKS = { 'bgm-plan': 'Musik Rencana', 'bgm-battle': 'Musik Pertempuran' };
  let S = JSON.parse(JSON.stringify(DEF));
  try { Object.assign(S, JSON.parse(localStorage.getItem('td-settings') || '{}')); } catch (e) {}
  const listeners = [];
  const get = k => S[k];
  function save() { try { localStorage.setItem('td-settings', JSON.stringify(S)); } catch (e) {} }
  function set(k, v) { S[k] = v; save(); apply(); listeners.forEach(f => f(k, v)); }
  function onChange(f) { listeners.push(f); }
  // Normal = 2x lebih lambat dari kecepatan v8.8; tombol 2x mengembalikan ke kecepatan lama.
  const timeScale = () => (S.fast ? 1 : 2);
  function hexA(hex, a) {
    const h = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    const n = h ? parseInt(h[1], 16) : 0x5aa9ff;
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function apply() {
    const r = document.documentElement, b = document.body;
    r.style.setProperty('--panel-a', (S.panelAlpha / 100).toFixed(2));
    if (!b) return;
    b.classList.toggle('hide-dmg', !S.showDmgLog);
    b.classList.toggle('hide-act', !S.showActLog);
    b.classList.toggle('hide-kill', !S.showKill);
    const sb = document.getElementById('speedBtn');
    if (sb) { sb.textContent = S.fast ? '⏩ 2x' : '▶ 1x'; sb.classList.toggle('on', S.fast); }
    if (typeof draw === 'function' && typeof ctx !== 'undefined' && ctx) { try { draw(); } catch (e) {} }
  }
  function reset() { S = JSON.parse(JSON.stringify(DEF)); save(); apply(); listeners.forEach(f => f('*', null)); }

  // ---------- Layar Pengaturan ----------
  let root = null;
  const $ = (t, cls, html) => { const e = document.createElement(t); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  function slider(label, key, min, max, step, fmt) {
    const row = $('div', 'st-row'), val = $('b', 'st-val'), inp = $('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = S[key];
    const show = () => { val.textContent = fmt ? fmt(+inp.value) : inp.value + '%'; };
    inp.addEventListener('input', () => { show(); set(key, +inp.value); });
    row.append($('span', 'st-l', label), inp, val); show(); return row;
  }
  function toggle(label, key) {
    const row = $('label', 'st-row st-tg'), cb = $('input');
    cb.type = 'checkbox'; cb.checked = !!S[key];
    cb.addEventListener('change', () => set(key, cb.checked));
    row.append($('span', 'st-l', label), cb); return row;
  }
  function color(label, key) {
    const row = $('div', 'st-row'), inp = $('input');
    inp.type = 'color'; inp.value = S[key];
    inp.addEventListener('input', () => set(key, inp.value));
    row.append($('span', 'st-l', label), inp); return row;
  }
  function select(label, key, opts, num) {
    const row = $('div', 'st-row'), sel = $('select');
    opts.forEach(([v, t]) => { const o = $('option', null, t); o.value = v; sel.appendChild(o); });
    sel.value = String(S[key]);
    sel.addEventListener('change', () => { set(key, num ? +sel.value : sel.value); if (key === 'musicMode') build(); });
    row.append($('span', 'st-l', label), sel); return row;
  }
  function musicList() {
    const box = $('div', 'st-music');
    const mode = S.musicMode;
    if (mode === 'fase') { box.append($('small', 'st-note', 'Musik rencana & pertempuran berganti otomatis sesuai fase.')); return box; }
    const hint = { single: 'Pilih satu lagu yang diputar terus.', urut: 'Centang lagu yang ikut, atur urutan dengan ▲▼.', acak: 'Centang lagu yang ikut diacak.' }[mode];
    box.append($('small', 'st-note', hint));
    const order = S.musicOrder.slice();
    order.forEach((t, i) => {
      const r = $('div', 'st-track');
      if (mode === 'single') {
        const rd = $('input'); rd.type = 'radio'; rd.name = 'trk'; rd.checked = S.musicSingle === t;
        rd.addEventListener('change', () => set('musicSingle', t)); r.append(rd);
      } else {
        const cb = $('input'); cb.type = 'checkbox'; cb.checked = !!S.musicShuffle[t];
        cb.addEventListener('change', () => { const m = Object.assign({}, S.musicShuffle); m[t] = cb.checked; set('musicShuffle', m); });
        r.append(cb);
      }
      r.append($('span', 'st-l', TRACKS[t] || t));
      if (mode === 'urut') {
        const up = $('button', 'st-mv', '▲'), dn = $('button', 'st-mv', '▼');
        const mv = d => { const o = S.musicOrder.slice(), j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; set('musicOrder', o); build(); };
        up.addEventListener('click', () => mv(-1)); dn.addEventListener('click', () => mv(1));
        r.append(up, dn);
      }
      box.append(r);
    });
    return box;
  }
  function build() {
    const body = root.querySelector('.st-body'); body.innerHTML = '';
    const sec = t => body.appendChild($('h4', null, t));
    sec('🔊 Suara');
    body.append(slider('Musik', 'volMusic', 0, 150, 5), slider('Efek tempur', 'volFx', 0, 150, 5), slider('Langkah unit', 'volStep', 0, 150, 5));
    sec('🎵 Musik');
    body.append(select('Mode', 'musicMode', [['fase', 'Sesuai fase (bawaan)'], ['single', 'Satu lagu saja'], ['urut', 'Urut'], ['acak', 'Acak']]), musicList());
    sec('🖥 Tampilan');
    body.append(slider('Kepekatan panel', 'panelAlpha', 15, 100, 5), toggle('Tampilkan bar HP', 'showHp'),
      toggle('Tampilkan log damage', 'showDmgLog'), toggle('Tampilkan log aktivitas non-combat', 'showActLog'),
      toggle('Tampilkan notifikasi kill', 'showKill'), color('Warna Jalur', 'laneColor'), color('Warna Baris Kunci', 'lockColor'));
    sec('🎮 Permainan');
    body.append(slider('Sensitivitas geser layar', 'panSens', 40, 250, 10),
      select('Jeda sebelum eksekusi musuh', 'enemyDelay', [[0, 'Tanpa jeda'], [1, '1 detik'], [2, '2 detik'], [3, '3 detik']], true),
      select('Kecepatan eksekusi', 'fast', [['false', 'Normal (1x)'], ['true', 'Cepat (2x)']]));
    const fastSel = body.querySelectorAll('select'); const last = fastSel[fastSel.length - 1];
    last.addEventListener('change', () => set('fast', last.value === 'true'));
  }
  function open() {
    if (!root) {
      root = $('div'); root.id = 'settings'; root.hidden = true;
      root.innerHTML = '<div class="st-box"><div class="st-head"><h3>Pengaturan</h3><button class="st-x" aria-label="Tutup">✕</button></div><div class="st-body"></div><div class="st-foot"><button class="st-reset">Atur ulang</button><button class="st-close">Selesai</button></div></div>';
      document.body.appendChild(root);
      const close = () => { root.hidden = true; };
      root.querySelector('.st-x').addEventListener('click', close);
      root.querySelector('.st-close').addEventListener('click', close);
      root.querySelector('.st-reset').addEventListener('click', () => { reset(); build(); });
      root.addEventListener('click', e => { if (e.target === root) close(); });
    }
    build(); root.hidden = false;
  }
  window.addEventListener('DOMContentLoaded', apply);
  return { get, set, onChange, timeScale, hexA, open, apply, TRACKS };
})();
