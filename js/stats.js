// ====================================================================
// stats.js — Statistik pertandingan + layar Rincian (akhir game / tombol 📊).
// Tidak mengubah aturan game: hanya dipanggil dari titik-titik yang sudah ada.
// ====================================================================
const Stats = (() => {
  let s = [blank(), blank()];
  function blank() { return { dmgUnit: 0, dmgBld: 0, dmgBy: {}, kredit: { in: 0, out: 0 }, fuel: { in: 0, out: 0 }, medical: { in: 0, out: 0 }, unitLost: {}, bldLost: {} }; }
  const idx = p => (typeof p === 'number' ? p : players.indexOf(p));
  function init() {
    s = [blank(), blank()];
    players.forEach((p, i) => { ['kredit', 'fuel', 'medical'].forEach(k => { s[i][k].in = p.resources[k]; }); });
  }
  function dmg(owner, type, kind, amt) {
    if (!(amt > 0) || !s[owner]) return;
    if (kind === 'unit') s[owner].dmgUnit += amt; else s[owner].dmgBld += amt;
    s[owner].dmgBy[type] = (s[owner].dmgBy[type] || 0) + amt;
  }
  function earn(p, res, amt) { const i = idx(p); if (s[i] && amt > 0) s[i][res].in += amt; }
  function use(p, res, amt) { const i = idx(p); if (s[i] && amt > 0) s[i][res].out += amt; }
  function unitLost(owner, type) { if (s[owner]) s[owner].unitLost[type] = (s[owner].unitLost[type] || 0) + 1; }
  function bldLost(owner, type) { if (s[owner]) s[owner].bldLost[type] = (s[owner].bldLost[type] || 0) + 1; }
  return { init, dmg, earn, use, unitLost, bldLost, get data() { return s; } };
})();

// ---------- Layar Rincian ----------
const Rincian = (() => {
  let side = 0, root = null;
  const uname = t => (t === 'corps' ? 'Corps' : (UNITS[t] ? UNITS[t].name : t));
  const bname = t => (BUILDING_TYPES[t] ? BUILDING_TYPES[t].name : t);
  const sumObj = o => Object.values(o).reduce((a, b) => a + b, 0);
  function list(o, nameFn) {
    const k = Object.keys(o).filter(x => o[x] > 0);
    return k.length ? k.map(x => `<div class="rc-sub"><span>${nameFn(x)}</span><b>${o[x]}</b></div>`).join('') : '<div class="rc-sub rc-none">—</div>';
  }
  function alive(i) {
    const a = {};
    units.filter(u => u.owner === i).forEach(u => { a[u.type] = (a[u.type] || 0) + 1; });
    units.forEach(u => { if (u.owner === i && u.cargo && u.cargo.type === 'corps') a.corps = (a.corps || 0) + 1; });  // Corps yang sedang naik APC
    return a;
  }
  function html(i) {
    const d = Stats.data[i], p = players[i];
    const bIntact = {}; p.buildings.forEach(b => { bIntact[b.type] = (bIntact[b.type] || 0) + 1; });
    const uAlive = alive(i), nAlive = sumObj(uAlive), nLost = sumObj(d.unitLost);
    const nbI = sumObj(bIntact), nbL = sumObj(d.bldLost);
    const res = (label, r) => `<div class="rc-row"><span>Total ${label}</span><b>${r.in}</b></div><div class="rc-row rc-ind"><span>${label} digunakan</span><b>${r.out}</b></div>`;
    return `<div class="rc-row"><span>Total damage</span><b>${d.dmgUnit + d.dmgBld}</b></div>
      <div class="rc-row rc-ind"><span>Damage ke unit</span><b>${d.dmgUnit}</b></div>
      <div class="rc-row rc-ind"><span>Damage ke bangunan</span><b>${d.dmgBld}</b></div>
      <div class="rc-h">Damage per jenis unit</div>${list(d.dmgBy, uname)}
      <div class="rc-h">Sumber daya</div>${res('kredit', d.kredit)}${res('fuel', d.fuel)}${res('medical', d.medical)}
      <div class="rc-h">Bangunan</div>
      <div class="rc-row"><span>Total bangunan</span><b>${nbI + nbL}</b></div>
      <div class="rc-row rc-ind"><span>Bangunan utuh</span><b>${nbI}</b></div>${list(bIntact, bname)}
      <div class="rc-row rc-ind"><span>Bangunan hancur</span><b>${nbL}</b></div>${list(d.bldLost, bname)}
      <div class="rc-h">Unit</div>
      <div class="rc-row"><span>Total unit</span><b>${nAlive + nLost}</b></div>
      <div class="rc-row rc-ind"><span>Unit yang masih hidup</span><b>${nAlive}</b></div>${list(uAlive, uname)}
      <div class="rc-row rc-ind"><span>Unit yang gugur</span><b>${nLost}</b></div>${list(d.unitLost, uname)}`;
  }
  function render() {
    if (!root) return;
    const p = players[side];
    root.querySelector('.rc-title').innerHTML = `Rincian <span style="color:${p.color}">${p.name}</span>`;
    root.querySelector('.rc-swap').textContent = side === HUMAN ? 'Lihat musuh ⇄' : 'Lihat pemain ⇄';
    root.querySelector('.rc-body').innerHTML = html(side);
    const m = Math.floor((typeof matchSec === 'number' ? matchSec : 0) / 60), sec = (typeof matchSec === 'number' ? matchSec : 0) % 60;
    root.querySelector('.rc-time').textContent = `Waktu pertandingan ${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')} • Turn ${turnNumber}`;
    const w = root.querySelector('.rc-win');
    w.textContent = gameOver ? `${players[winner].name} Menang!` : '';
    w.style.display = gameOver ? 'block' : 'none';
  }
  function open() {
    if (!root) {
      root = document.createElement('div'); root.id = 'rincian';
      root.innerHTML = '<div class="rc-box"><div class="rc-head"><b class="rc-title"></b><button class="rc-swap"></button><button class="rc-x" aria-label="Tutup">✕</button></div><div class="rc-win"></div><div class="rc-time"></div><div class="rc-body"></div><div class="rc-foot"><button class="rc-close">Tutup</button></div></div>';
      document.body.appendChild(root);
      const close = () => { root.hidden = true; };
      root.querySelector('.rc-x').addEventListener('click', close);
      root.querySelector('.rc-close').addEventListener('click', close);
      root.querySelector('.rc-swap').addEventListener('click', () => { side = 1 - side; render(); });
      root.addEventListener('click', e => { if (e.target === root) close(); });
    }
    side = HUMAN; root.hidden = false; render();
  }
  return { open };
})();
