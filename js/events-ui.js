// ====================================================================
// events-ui.js — v13 Tahap 6: layar Event (tab Harian, Jangka Panjang, Toko), pemilihan banner / unit untuk toko,
// titik merah tombol Event. Memakai wadah #evModal di dalam #lobby (gaya .lb-modal / .lb-box dari lobby.css) dan
// kelas .pg-* dari progress.css. Logika ada di events.js. Dokumen rancangan v1.1: 16.9-16.11, Lampiran C.
// Tombol "Mulai" memanggil Ev.startHandlers[n] bila sudah didaftarkan (Tahap 7-8); bila belum: toast pengembangan.
// ====================================================================
(function () {
  const $ = id => document.getElementById(id);
  const lobby = $('lobby'), modal = $('evModal'), body = $('evBody'), titleEl = $('evTitle');
  if (!lobby || !modal || typeof Ev === 'undefined') return;
  const F = Prog.fmt;
  let view = null, tick = null, tickN = 0;
  const toast = m => { if (window.PgUI) window.PgUI.toast(m); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Waktu ----------
  function dhm(ms) {
    const m = Math.max(0, Math.floor(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mi = m % 60;
    return (d ? d + ' hari ' : '') + h + ' jam ' + mi + ' menit';
  }
  const REW = { expUmum: 'Exp', gold: 'Gold', gem: 'Gem', crystal: 'Crystal' };
  const rewText = r => Object.keys(r).filter(k => r[k]).map(k => '+' + F(r[k]) + ' ' + REW[k]).join(', ');

  // ---------- Gambar tema (SVG sederhana, tanpa berkas) ----------
  const ART = {
    1: '<svg viewBox="0 0 64 48" aria-hidden="true"><rect x="4" y="30" width="56" height="12" fill="#3a3d30" stroke="#c9c2b0" stroke-width="2"/><path d="M8 30V18h8v6h8v-6h8v6h8v-6h8v12" fill="#4a4c3a" stroke="#c9c2b0" stroke-width="2"/><path d="M6 12l22 4M6 12l22-1" stroke="#d7b56d" stroke-width="3" stroke-linecap="round"/><path d="M44 8l12 6-12 6z" fill="#d7b56d"/></svg>',
    2: '<svg viewBox="0 0 64 48" aria-hidden="true"><path d="M32 3l22 12.500v17L32 45 10 32.500v-17z" fill="#2f5233" stroke="#c9e0a0" stroke-width="2.500"/><path d="M32 13l11 4v8c0 6-5 10-11 13-6-3-11-7-11-13v-8z" fill="#3a3d30" stroke="#d7b56d" stroke-width="2"/></svg>',
    3: '<svg viewBox="0 0 64 48" aria-hidden="true"><circle cx="32" cy="22" r="15" fill="#3a3d30" stroke="#d7b56d" stroke-width="2.500"/><path d="m32 11 3.500 7 7.500 1-5.500 5.300 1.300 7.700L32 28.500 25.200 32l1.300-7.700L21 19l7.500-1z" fill="#d7b56d"/><path d="M22 36l-4 10 8-4 6 4 6-4 8 4-4-10" fill="none" stroke="#c9c2b0" stroke-width="2"/></svg>',
  };

  // ---------- Tab Harian ----------
  function harianHTML() {
    const dv = Ev.daily.view();
    const pct = Math.min(100, dv.poin);
    const nodes = dv.klaim.map(k => {
      const cls = k.diklaim ? 'done' : k.bisa ? 'can' : '';
      return `<button class="ev-node ${cls}" style="left:${k.poin}%" data-act="klaim" data-p="${k.poin}" aria-label="${k.poin} poin: ${esc(rewText(k.hadiah))}${k.diklaim ? ', sudah diklaim' : k.bisa ? ', klaim' : ''}">
        <b>${k.poin}</b></button>`;
    }).join('');
    const hint = dv.klaim.map(k => `<li class="${k.diklaim ? 'done' : k.bisa ? 'can' : ''}"><b>${k.poin}</b> ${esc(rewText(k.hadiah))}<em>${k.diklaim ? 'Sudah diklaim' : k.bisa ? 'Klaim' : ''}</em></li>`).join('');
    const rows = dv.rows.map(r => {
      const last = r.tiers[r.tiers.length - 1].syarat, cnt = Math.min(r.hitung, last);
      return `<li class="ev-m"><div class="ev-mh"><b>${r.nama}</b><span>${r.tiers.length > 1 ? cnt + '/' + last : (r.tiers[0].selesai ? 'Selesai' : '0/1')}</span></div>
        <div class="ev-tiers">${r.tiers.map(t => `<i class="ev-tier${t.selesai ? ' ok' : ''}" title="${t.syarat}">${t.syarat > 1 || r.tiers.length > 1 ? t.syarat + ' → ' : ''}+${t.poin}</i>`).join('')}</div></li>`;
    }).join('');
    return `<div class="pg-card ev-daily"><div class="ev-pt">Poin hari ini <b>${dv.poin}</b><small> / ${dv.max}</small></div>
      <div class="ev-barwrap"><div class="ev-bar"><i style="width:${pct}%"></i>${nodes}</div></div>
      <ul class="ev-rwlist">${hint}</ul></div>
      <ul class="ev-mlist">${rows}</ul>`;
  }

  // ---------- Tab Jangka Panjang ----------
  function cardHTML(n) {
    const i = Ev.info(n), m = i.meta;
    let det = '', btn;
    if (n === 1) {
      det = `<p class="note">Bangunan hancur <b>${i.hancur}/${i.total}</b> • Peti didapat ${i.petiDiambil}/${i.total}</p>`;
      btn = i.selesai ? '<button class="pg-btn wide" disabled>Selesai</button>' : startBtn(n, i);
    } else if (n === 2) {
      det = `<p class="note">Rekor skor <b>${F(i.rekor)}</b></p><p class="ev-ticks">${Ev.TONGGAK2.map(t => `<span class="${i.tonggak.includes(t) ? 'ok' : ''}">${i.tonggak.includes(t) ? '✓' : ''} Turn ${t}</span>`).join('')}</p>`;
      btn = startBtn(n, i);
    } else {
      const sel = Math.min(view.tahap, i.tahap);
      const chips = [1, 2, 3, 4, 5].map(t => `<button class="pg-chip${sel === t ? ' on' : ''}" data-act="tahap" data-t="${t}" ${t > i.tahap ? 'disabled' : ''}>${t > i.tahap ? 'Terkunci' : 'Tahap ' + t}</button>`).join('');
      det = `<p class="note">Tahap terbuka <b>${i.tahap}/5</b> • Skor tahap ${sel}: <b>${F(i.skor[sel - 1])}</b></p><div class="pg-chips">${chips}</div>
        <p class="ev-ticks">${Ev.TONGGAK3.map(t => `<span class="${i.tonggak[sel - 1].includes(t) ? 'ok' : ''}">${i.tonggak[sel - 1].includes(t) ? '✓' : ''} Turn ${t}</span>`).join('')}<span class="${i.markas[sel - 1] ? 'ok' : ''}">${i.markas[sel - 1] ? '✓' : ''} Markas musuh</span></p>`;
      btn = startBtn(n, i, sel);
    }
    return `<div class="pg-card ev-card"><div class="ev-ch"><div class="ev-art">${ART[n]}</div><div><h3>${m.nama}</h3>
      <p class="note">Berakhir dalam <span data-cd="${n}">${dhm(i.sisaMs)}</span></p></div></div>
      <div class="ev-stats"><span>Percobaan hari ini <b>${i.percobaan}/${Ev.MAX_PERCOBAAN}</b></span><span>Poin periode ini <b>${F(i.poin)}</b></span></div>
      ${det}${btn}</div>`;
  }
  function startBtn(n, i, tahap) {
    const habis = i.percobaan <= 0;
    return `<button class="pg-btn main wide" data-act="mulai" data-n="${n}" ${tahap ? 'data-t="' + tahap + '"' : ''} ${habis ? 'disabled' : ''}>${habis ? 'Percobaan habis' : 'Mulai'}</button>`;
  }
  const panjangHTML = () => Ev.NOS.map(cardHTML).join('');

  // ---------- Tab Toko ----------
  function tokoHTML() {
    const sh = view.shop, meta = Ev.EVENTS[sh], saldo = (Prog.load(), Prog.data.wallet)[meta.poin];
    const tabs = `<div class="pg-tabs ev-shops" role="tablist">${Ev.NOS.map(n => `<button class="pg-tab${sh === n ? ' on' : ''}" role="tab" data-act="shop" data-n="${n}">${Ev.EVENTS[n].toko}</button>`).join('')}</div>`;
    const head = `<p class="note ev-saldo">${meta.poinNama}: <b>${F(saldo)}</b></p>`;
    if (view.pick) return tabs + head + pickHTML(sh);
    const list = Ev.shopItems(sh).map(it => {
      const why = it.sisa <= 0 ? 'Batas pembelian habis' : !it.cukup ? 'Poin tidak cukup' : '';
      const star = it.jenis === 'utama' ? ' ev-main' : '';
      return `<li class="ev-it${star}"><div class="ev-itt"><b>${it.no === 1 ? '★ ' : ''}${esc(it.nama)}</b><small>Sisa batas ${it.sisa}/${it.maks}${why ? ' • ' + why : ''}</small></div>
        <button class="pg-btn${why ? '' : ' main'}" data-act="beli" data-no="${it.no}" ${why ? 'disabled' : ''}><span>Beli</span><em>${F(it.harga)}</em></button></li>`;
    }).join('');
    return tabs + head + `<ul class="ev-shoplist">${list}</ul>`;
  }
  function pickHTML(sh) {
    const p = view.pick, it = Ev.shopItems(sh).find(x => x.no === p.no);
    let opts;
    if (it.pilih === 'banner') {
      opts = Ev.BANNER_PILIHAN[sh].map(b => `<button class="pg-xp" data-act="pickdo" data-v="${b}"><span class="pg-xt"><b>${Prog.BANNER_NAME[b]}</b><small>Fragmen ${Prog.SPIN_CFG[b].kind === 'unit' ? 'unit' : 'kemampuan unik'}</small></span><em>+1 Fragmen</em></button>`).join('');
    } else {
      const own = Prog.UNIT_KEYS.filter(k => Prog.data.unit[k].dimiliki);
      opts = own.map(k => `<button class="pg-xp" data-act="pickdo" data-v="${k}">${window.unitImg ? window.unitImg(k) : ''}<span class="pg-xt"><b>${unitDef(k).name}</b><small>Lv ${Prog.data.unit[k].level} • Exp unit ${F(Prog.data.unit[k].exp)}</small></span><em>+${F(Ev.ITEMS[p.no - 1].exp)} Exp</em></button>`).join('');
    }
    return `<button class="pk-back" data-act="pickback">‹ Kembali</button><p class="note"><b>${esc(it.nama)}</b> • ${F(it.harga)} poin</p>
      <p class="pg-lbl">${it.pilih === 'banner' ? 'Pilih banner' : 'Pilih unit'}</p><div class="pg-xlist">${opts}</div>`;
  }

  // ---------- Render ----------
  const TABS = [['harian', 'Harian'], ['panjang', 'Jangka Panjang'], ['toko', 'Toko']];
  function render() {
    if (!view) return;
    titleEl.textContent = 'Event';
    const tabs = `<div class="pg-tabs" role="tablist">${TABS.map(([k, n]) => `<button class="pg-tab${view.tab === k ? ' on' : ''}" role="tab" data-act="tab" data-tab="${k}">${n}${k === 'harian' && Ev.daily.claimable() ? '<span class="lb-dot"></span>' : ''}</button>`).join('')}</div>`;
    const inner = view.tab === 'harian' ? harianHTML() : view.tab === 'panjang' ? panjangHTML() : tokoHTML();
    const top = body.scrollTop;
    body.innerHTML = tabs + inner;
    body.scrollTop = top;
    refreshDot();
  }
  function open(tab) {
    Prog.load(); Ev.load(); Ev.daily.touchLogin();
    view = { tab: tab || 'harian', shop: 1, tahap: 1, pick: null };
    modal.hidden = false; render(); body.scrollTop = 0;
    clearInterval(tick); tickN = 0;
    tick = setInterval(() => {
      document.querySelectorAll('#evBody [data-cd]').forEach(e => { e.textContent = dhm(Ev.info(+e.dataset.cd).sisaMs); });
      if (++tickN % 30 === 0 && !(view && view.pick)) render();      // ganti hari / periode terlihat tanpa menutup layar
    }, 1000);
  }
  function close() { modal.hidden = true; body.innerHTML = ''; view = null; clearInterval(tick); refreshDot(); }

  function refreshDot() {
    const d = $('pgEvtDot'); if (!d) return;
    let n = 0; try { n = Ev.daily.claimable(); } catch (e) {}
    d.style.display = n ? '' : 'none';
  }

  // ---------- Aksi ----------
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const a = b.dataset.act;
    if (a === 'tab') { view.tab = b.dataset.tab; view.pick = null; render(); body.scrollTop = 0; }
    else if (a === 'klaim') {
      const p = +b.dataset.p, r = Ev.daily.claim(p);
      if (r.ok) toast('Klaim: ' + rewText(r.rewards)); else toast(r.msg === 'Poin belum cukup' ? 'Butuh ' + p + ' poin' : r.msg);
      render();
    }
    else if (a === 'tahap') { view.tahap = +b.dataset.t; render(); }
    else if (a === 'mulai') {
      const n = +b.dataset.n, h = Ev.startHandlers[n];
      if (typeof h === 'function') { const t = b.dataset.t ? +b.dataset.t : undefined; close(); h({ tahap: t }); }
      else toast('Dalam tahap pengembangan');
    }
    else if (a === 'shop') { view.shop = +b.dataset.n; view.pick = null; render(); body.scrollTop = 0; }
    else if (a === 'beli') {
      const no = +b.dataset.no, it = Ev.shopItems(view.shop).find(x => x.no === no);
      if (it.pilih) { view.pick = { no }; render(); body.scrollTop = 0; return; }
      const r = Ev.buy(view.shop, no); toast(r.ok ? 'Pembelian berhasil' : r.msg); render();
    }
    else if (a === 'pickback') { view.pick = null; render(); }
    else if (a === 'pickdo') {
      const r = Ev.buy(view.shop, view.pick.no, b.dataset.v);
      toast(r.ok ? 'Pembelian berhasil' : r.msg);
      if (r.ok) view.pick = null;
      render();
    }
  });
  modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('#evClose')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) close(); });
  lobby.addEventListener('click', e => { if (e.target.closest('#pgEvtBtn')) open('harian'); });
  Prog.onChange(refreshDot); Ev.onChange(refreshDot);
  refreshDot();
  setInterval(refreshDot, 30000);
  window.EventUI = { open, close, refreshDot };
})();
