// ====================================================================
// progress-ui.js — v13 Tahap 1-4: pill mata uang, Top Up (kode + konversi), Inventory
// (Unit, Kemampuan, Bahan, Peti, Surat), kartu detail unit (Naikkan Level, Ascend), toast.
// Tahap 4: layar Spin (8 banner, hasil, Info Peluang) dan penukaran 5 fragmen di tab Bahan.
// Memakai wadah #pgModal / #pgToast di dalam #lobby (gaya .lb-modal / .lb-box dari lobby.css).
// Gambar unit: window.unitImg (diekspor lobby.js). Teks: Lampiran C & D dokumen rancangan.
// ====================================================================
(function () {
  const $ = id => document.getElementById(id);
  const lobby = $('lobby'), modal = $('pgModal'), body = $('pgBody'), titleEl = $('pgTitle'), toastEl = $('pgToast');
  if (!lobby || !modal) return;
  const D = () => Prog.data, F = Prog.fmt;
  let view = null, toastTimer = null, tick = null;

  // ---------- Toast & modal ----------
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }
  function open(v) {
    view = v; modal.hidden = false; render(); const sc = body; if (sc) sc.scrollTop = 0;
    clearInterval(tick); tick = setInterval(updateLive, 1000);
  }
  function close() { modal.hidden = true; body.innerHTML = ''; view = null; clearInterval(tick); }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Pill header & titik merah ----------
  function refreshHeader() {
    const w = D().wallet;
    [['pgGold', w.gold], ['pgGem', w.gem], ['pgCry', w.crystal]].forEach(([id, v]) => { const e = $(id); if (e) e.textContent = F(v); });
    const dot = $('pgInvDot'); if (dot) dot.style.display = Prog.adaDot() ? '' : 'none';
  }
  const hms = ms => { const s = Math.ceil(ms / 1000), p = n => String(n).padStart(2, '0'); return p(Math.floor(s / 3600)) + ':' + p(Math.floor(s % 3600 / 60)) + ':' + p(s % 60); };
  function updateLive() {
    refreshHeader();
    const e = $('pgHarianCd'); if (!e) return;
    const st = Prog.harianStatus();
    if (st.siap && e.dataset.siap !== '1') render(); else if (!st.siap) e.textContent = 'Tersedia dalam ' + hms(st.sisaMs);
  }

  // ---------- Util tampilan ----------
  const uimg = k => (window.unitImg ? window.unitImg(k) : '');
  const uname = k => unitDef(k).name;
  function stars(asc, adv) {
    const n = Prog.starsOf(asc); let h = '';
    for (let i = 1; i <= 5; i++) h += `<i class="pg-star ${n >= i ? 'full' : n >= i - 0.5 ? 'half' : 'empty'}">★</i>`;
    return `<span class="pg-stars ${adv ? 'gold' : 'silver'}" aria-label="${n} bintang">${h}</span>`;
  }
  const rewardLine = r => {
    const N = { expUmum: 'Exp umum', gold: 'Gold', gem: 'Gem', crystal: 'Crystal' }, out = [];
    for (const k of ['expUmum', 'gold', 'crystal', 'gem']) if (r[k]) out.push(`<li><b>+${F(r[k])}</b> ${N[k]}</li>`);
    return out.length ? `<ul class="pg-rw">${out.join('')}</ul>` : '<p class="note">Tidak ada hadiah.</p>';
  };
  const cost = (txt, ok) => `<span class="${ok ? '' : 'pg-lack'}">${txt}</span>`;

  // ---------- Top Up ----------
  function topupHTML() {
    return `<label class="pg-lbl" for="pgCode">Masukkan Kode</label>
      <div class="pg-row"><input id="pgCode" class="pg-in" type="text" placeholder="Masukkan kode" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="pg-btn main" data-act="redeem" id="pgRedeem" disabled>Tukar</button></div>
      <p class="pg-msg" id="pgMsg" aria-live="polite"></p>
      <button class="pg-btn wide" data-act="goconvert">Konversi Gem</button>`;
  }
  function doRedeem() {
    const inp = $('pgCode'), msg = $('pgMsg'); if (!inp || !inp.value.trim()) return;
    const r = Prog.redeem(inp.value);
    if (r.ok && !r.tolak) { msg.className = 'pg-msg ok'; msg.innerHTML = 'Kode berhasil ditukar!' + rewardLine(r.rewards); inp.value = ''; }
    else { msg.className = 'pg-msg bad'; msg.textContent = r.msg; }
    $('pgRedeem').disabled = !inp.value.trim();
  }

  // ---------- Konversi ----------
  function convHTML() {
    const gem = D().wallet.gem, card = (kind, nm, rate, unit, mul) => {
      const a = view['amt_' + kind]; const bad = gem < 100 || a > gem;
      return `<div class="pg-card" data-kind="${kind}"><h3>${nm}</h3><p class="note">${rate}</p>
        <div class="pg-row ctr"><button class="pg-btn sq" data-act="amt" data-kind="${kind}" data-d="-100" aria-label="Kurangi 100">−</button><b class="pg-amt">${F(a)}</b><button class="pg-btn sq" data-act="amt" data-kind="${kind}" data-d="100" aria-label="Tambah 100">+</button></div>
        <div class="pg-chips">${[100, 500, 1000, 5000].map(n => `<button class="pg-chip" data-act="amt" data-kind="${kind}" data-set="${n}">${F(n)}</button>`).join('')}<button class="pg-chip" data-act="amt" data-kind="${kind}" data-set="max">Maks</button></div>
        <p class="pg-prev">Dapat: ${F(a * mul)} ${unit}</p>
        <button class="pg-btn main wide" data-act="convert" data-kind="${kind}" ${bad ? 'disabled' : ''}>Konversi</button></div>`;
    };
    return `<button class="pk-back" data-act="gotopup">‹ Kembali</button><p class="note">Saldo Gem: <b>${F(gem)}</b></p>
      <div class="pg-two">${card('exp', 'Gem ke Exp', '1 Gem = 1 Exp', 'Exp', 1)}${card('gold', 'Gem ke Gold', '1 Gem = 5 Gold', 'Gold', 5)}</div>`;
  }

  // ---------- Inventory ----------
  const TABS = [['unit', 'Unit'], ['abil', 'Kemampuan'], ['bahan', 'Bahan'], ['peti', 'Peti'], ['surat', 'Surat']];
  function invHTML() {
    const tabs = `<div class="pg-tabs" role="tablist">${TABS.map(([k, n]) => `<button class="pg-tab${view.tab === k ? ' on' : ''}" role="tab" data-act="tab" data-tab="${k}">${n}${k === 'peti' && (Prog.harianStatus().siap || D().peti.pertandinganMenunggu) ? '<i class="lb-dot"></i>' : ''}${k === 'surat' && !(D().surat.s1 && D().surat.s2 && D().surat.s3) ? '<i class="lb-dot"></i>' : ''}</button>`).join('')}</div>`;
    if (view.res) return resultHTML();
    const inner = view.tab === 'unit' ? (view.unit ? detailHTML(view.unit) : unitListHTML()) : view.tab === 'abil' ? abilHTML() : view.tab === 'bahan' ? (view.exch ? exchHTML() : bahanHTML()) : view.tab === 'peti' ? petiHTML() : suratHTML();
    return tabs + inner;
  }
  function unitListHTML() {
    const own = Prog.UNIT_KEYS.filter(k => D().unit[k].dimiliki), lock = Prog.UNIT_KEYS.filter(k => !D().unit[k].dimiliki);
    const card = k => { const u = D().unit[k], adv = Prog.isAdvanced(k);
      return u.dimiliki
        ? `<button class="pg-ucard" data-act="unit" data-k="${k}">${uimg(k)}<b>${uname(k)}</b><span>Lv ${u.level}</span>${stars(u.ascend, adv)}</button>`
        : `<div class="pg-ucard lock">${uimg(k)}<b>${uname(k)}</b><span>Terkunci</span></div>`; };
    return `<div class="pg-ugrid">${own.map(card).join('')}${lock.map(card).join('')}</div>`;
  }
  function slotRow(k, i) {
    const u = D().unit[k], [name] = Prog.ABIL[k][i], open = Prog.slotOpen(u, i + 1), have = D().kemampuan[name].dimiliki;
    if (!open) return `<li class="pg-slot lock"><b>Slot ${i + 1}</b><span>${i === 0 ? 'Terbuka di Level 10' : 'Terbuka saat Ascend maksimal'}</span></li>`;
    const desc = (UNIT_ABILITIES[k].find(a => a[0] === name) || ['', ''])[1];
    if (!have) return `<li class="pg-slot dim">${skillIconHTML(name)}<div><b>${name}</b><span>Belum dimiliki. Didapat dari Spin Kemampuan Unik</span></div></li>`;
    return `<li class="pg-slot">${skillIconHTML(name)}<div><b>${name}</b><span>${desc}</span></div></li>`;
  }
  function detailHTML(k) {
    const u = D().unit[k], d = unitDef(k), s = Prog.statsOf(k, u.level, u.ascend), adv = Prog.isAdvanced(k);
    const st = (n, v) => `<div class="st"><span>${n}</span><b>${v}</b></div>`;
    let act;
    if (u.level < Prog.MAX_LV) {
      const c = Prog.levelCost(u.level), expOk = u.exp + D().wallet.expUmum >= c.exp, goldOk = D().wallet.gold >= c.gold;
      act = `<button class="pg-btn main wide" data-act="lvup" data-k="${k}" ${expOk && goldOk ? '' : 'disabled'}>Naikkan Level</button><p class="pg-need">Butuh: ${cost('Exp ' + F(c.exp), expOk)} · ${cost('Gold ' + F(c.gold), goldOk)}</p>`;
    } else if (u.ascend < Prog.MAX_ASC) {
      const c = Prog.ascendCost(u.ascend), a = u.salinan >= c.salinan, b = D().wallet.crystal >= c.crystal, g = D().wallet.gold >= c.gold;
      act = `<button class="pg-btn main wide" data-act="asc" data-k="${k}" ${a && b && g ? '' : 'disabled'}>Ascend</button><p class="pg-need">Butuh: ${cost('Salinan ' + c.salinan, a)} · ${cost('Crystal ' + F(c.crystal), b)} · ${cost('Gold ' + F(c.gold), g)}</p>`;
    } else act = '<p class="pg-max">Maksimal</p>';
    return `<button class="pk-back" data-act="unitback">‹ Kembali</button>
      <div class="pg-detail"><div class="pg-dleft"><span class="pg-lv">Level ${u.level}</span>${uimg(k)}${stars(u.ascend, adv)}</div>
      <div class="pg-dright"><h3>${d.name}</h3>
        <div class="pg-stats">${st('HP', F(s.hp))}${st('DEF', Prog.fmt1(s.def))}${st('ATK', s.atk === null ? '-' : Prog.fmt1(s.atk))}</div>
        <div class="pg-stats">${st('JPD', s.jpd)}${st('RNG', d.combat ? s.rng : '-')}${st('SPD', s.spd)}</div>
        ${d.hasFuel ? `<div class="pg-stats">${st('Fuel', d.fuelMax)}</div>` : ''}</div></div>
      <ul class="pg-slots">${slotRow(k, 0)}${slotRow(k, 1)}</ul>
      <p class="pg-mat">Exp unit: <b>${F(u.exp)}</b> · Salinan: <b>${F(u.salinan)}</b></p>${act}`;
  }
  function abilHTML() {
    const filters = [['all', 'Semua'], ['kAdvPenyerang', 'Advanced Penyerang'], ['kAdvBertahan', 'Advanced Bertahan'], ['kAdvEkonomi', 'Advanced Ekonomi'], ['kCommon', 'Common']];
    const f = view.filter || 'all';
    const list = Prog.ABIL_LIST.filter(a => f === 'all' || a.banner === f);
    const items = list.map(a => {
      const have = D().kemampuan[a.name].dimiliki, desc = (UNIT_ABILITIES[a.unit].find(x => x[0] === a.name) || ['', ''])[1];
      return `<article class="pg-ab${have ? '' : ' dim'}">${skillIconHTML(a.name)}<div><b>${a.name}</b> <em class="${have ? 'own' : ''}">${have ? 'Dimiliki' : 'Belum dimiliki'}</em><small>${uname(a.unit)} · Slot ${a.slot} · ${Prog.BANNER_NAME[a.banner]}</small><span>${desc}</span></div></article>`;
    }).join('');
    return `<div class="pg-chips">${filters.map(([k, n]) => `<button class="pg-chip${f === k ? ' on' : ''}" data-act="filter" data-f="${k}">${n}</button>`).join('')}</div><div class="pg-ablist">${items}</div>`;
  }
  function bahanHTML() {
    const w = D().wallet, row = (n, v, note) => `<div class="pg-brow"><span>${n}${note ? `<small>${note}</small>` : ''}</span><b>${F(v)}</b></div>`;
    const fr = Prog.BANNERS.map(b => `<div class="pg-frow">${row('Fragmen ' + (b[0] === 'k' ? 'Kemampuan ' : 'Unit ') + Prog.BANNER_NAME[b], D().fragmen[b])}<button class="pg-btn wide pg-xbtn" data-act="exch" data-b="${b}">Tukar 5 Fragmen</button></div>`).join('');
    return row('Exp umum', w.expUmum) + row('Gunpowder', w.gunpowder, 'Belum ada kegunaan') + row('Steel Jade', w.steelJade, 'Belum ada kegunaan') + `<h4 class="pg-h">Fragmen</h4>` + fr;
  }
  function petiHTML() {
    const st = Prog.harianStatus(), p = D().peti;
    return `<div class="pg-card"><h3>Peti Harian</h3><p class="note">100 Exp · 500 Gold · 1 Crystal · 50 Gem, tiap 22 jam</p>
      <p class="pg-cd" id="pgHarianCd" data-siap="${st.siap ? 1 : 0}">${st.siap ? 'Siap dibuka' : 'Tersedia dalam ' + hms(st.sisaMs)}</p>
      <button class="pg-btn main wide" data-act="openharian" ${st.siap ? '' : 'disabled'}>Buka</button></div>
      <div class="pg-card"><h3>Peti Pertandingan</h3><p class="pg-cnt">${F(p.pertandinganMenunggu)} peti</p><p class="note">${p.hitungPertandingan}/2 pertandingan menuju peti berikutnya</p>
      <div class="pg-row"><button class="pg-btn main" data-act="openmatch" data-n="1" ${p.pertandinganMenunggu ? '' : 'disabled'}>Buka</button>${p.pertandinganMenunggu > 1 ? '<button class="pg-btn" data-act="openmatch" data-n="all">Buka Semua</button>' : ''}</div></div>`;
  }
  function resultHTML() {
    return `<h3 class="pg-h">${view.res.title}</h3>${rewardLine(view.res.rewards)}<button class="pg-btn main wide" data-act="resclose">Tutup</button>`;
  }

  // ---------- Spin (Bagian 10.7) ----------
  const pctTxt = v => String(Math.round(v * 10000) / 10000).replace('.', ',') + '%';
  const badge = (txt, cls) => `<i class="pg-badge ${cls}">${txt}</i>`;
  function prizeCard(it) {                                         // satu kartu hadiah (layar hasil)
    let ico = '', name = '', sub = '', cls = '';
    if (it.type === 'unit') { ico = uimg(it.key); name = uname(it.key); sub = it.label; cls = it.isNew ? 'hl new' : ''; }
    else if (it.type === 'abil') { ico = skillIconHTML(it.name); name = it.name; sub = it.label; cls = it.isNew ? 'hl new' : ''; }
    else if (it.type === 'fragmen') { ico = badge('F', 'frag'); name = 'Fragmen'; sub = '+' + it.amount; cls = 'hl'; }
    else if (it.type === 'gold') { ico = '<i class="lb-coin"></i>'; name = 'Gold'; sub = '+' + F(it.amount); }
    else if (it.type === 'gem') { ico = '<i class="lb-gem lb-gem-p"></i>'; name = 'Gem'; sub = '+' + F(it.amount); }
    else if (it.type === 'crystal') { ico = '<i class="lb-gem lb-gem-b"></i>'; name = 'Crystal'; sub = '+' + F(it.amount); }
    else if (it.type === 'exp') { ico = badge('XP', 'exp'); name = 'Exp'; sub = '+' + F(it.amount); }
    else if (it.type === 'gunpowder') { ico = badge('GP', 'gp'); name = 'Gunpowder'; sub = '+' + F(it.amount); }
    else if (it.type === 'steelJade') { ico = badge('SJ', 'sj'); name = 'Steel Jade'; sub = '+' + F(it.amount); }
    return `<div class="pg-pc ${cls}"><span class="pg-ico">${ico}</span><b>${name}</b><small>${sub}</small></div>`;
  }
  function spinHTML() {
    if (view.res) return spinResultHTML();
    if (view.info) return spinInfoHTML();
    const cfg = Prog.SPIN_CFG, g = view.group, b = view.banner, banners = g === 'unit' ? Prog.SPIN_UNIT_BANNERS : Prog.SPIN_ABIL_BANNERS;
    const tabs = `<div class="pg-tabs" role="tablist">${[['unit', 'Unit'], ['abil', 'Kemampuan Unik']].map(([k, n]) => `<button class="pg-tab${g === k ? ' on' : ''}" role="tab" data-act="sgroup" data-g="${k}">${n}</button>`).join('')}</div>`;
    const chips = `<div class="pg-chips">${banners.map(x => `<button class="pg-chip${b === x ? ' on' : ''}" data-act="sbanner" data-b="${x}">${Prog.BANNER_NAME[x]}</button>`).join('')}</div>`;
    const pool = Prog.mainPool(b);
    const prizes = cfg[b].kind === 'unit'
      ? pool.map(k => `<div class="pg-pz">${uimg(k)}<b>${uname(k)}</b></div>`).join('')
      : pool.map(n => `<div class="pg-pz">${skillIconHTML(n)}<b>${n}</b><small>${uname(Prog.ABIL_BY_NAME[n].unit)}</small></div>`).join('');
    const pi = Prog.pityInfo(b);
    const gem = D().wallet.gem, c = cfg[b];
    return `${tabs}${chips}
      <h3 class="pg-bn">${Prog.BANNER_NAME[b]} <small>${cfg[b].kind === 'unit' ? 'Spin Unit' : 'Spin Kemampuan Unik'}</small></h3>
      <div class="pg-prize">${prizes}</div>
      <p class="note">Peluang tiap hadiah utama: <b>${pctTxt(Prog.chanceEach(b))}</b></p>
      <ul class="pg-pity"><li>Tier 1 dijamin dalam <b>${pi.t1}</b> spin</li><li>${pi.t2 > 0 ? `Tier 2 dijamin dalam <b>${pi.t2}</b> spin` : 'Tier 2 dijamin <b>pada spin berikutnya</b>'}</li></ul>
      <p class="note">Saldo Gem: <b>${F(gem)}</b></p>
      <div class="pg-row"><button class="pg-btn main" style="flex:1" data-act="spin" data-n="1">Spin x1 (${F(c.p1)})</button><button class="pg-btn main" style="flex:1" data-act="spin" data-n="10">Spin x10 (${F(c.p10)})</button></div>
      <div class="pg-row"><button class="pg-btn" style="flex:1" data-act="sinfo">Info Peluang</button>${view.needTopup ? '<button class="pg-btn" style="flex:1" data-act="gotopup">Top Up</button>' : ''}</div>`;
  }
  function spinResultHTML() {
    const r = view.res, gem = D().wallet.gem;
    const hl = r.items.filter(i => i.isNew).length, fr = r.items.filter(i => i.type === 'fragmen').reduce((a, i) => a + i.amount, 0);
    const note = r.partial ? '<p class="pg-msg bad">Gem habis di tengah rangkaian; hasil yang sudah didapat tetap tersimpan.</p>' : '';
    const sum = r.times === 10 ? `<p class="note">${hl ? `Baru: <b>${hl}</b> · ` : ''}${fr ? `Fragmen: <b>+${fr}</b>` : ''}</p>` : '';
    return `<h3 class="pg-h">${Prog.BANNER_NAME[r.banner]} · Spin x${r.times}</h3>${note}${sum}
      <div class="pg-res">${r.items.map(prizeCard).join('')}</div>
      <p class="note">Saldo Gem: <b>${F(gem)}</b></p>
      <div class="pg-row"><button class="pg-btn main" style="flex:1" data-act="again">Spin Lagi</button><button class="pg-btn" style="flex:1" data-act="sclose">Tutup</button></div>`;
  }
  function spinInfoHTML() {                                        // tabel 10.2 dan 10.3 (dihitung dari data yang dipakai undian)
    const totalW = Prog.CAT_W.reduce((a, x) => a + x[1], 0), b = view.banner;
    const catName = { utama: 'Hadiah utama', fragmen: 'Fragmen', crystal: 'Crystal', gunpowder: 'Gunpowder', steelJade: 'Steel Jade', gold: 'Gold', exp: 'Exp', gem: 'Gem' };
    const tier = k => Prog.TIER1.includes(k) ? 1 : Prog.TIER2.includes(k) ? 2 : 3;
    const cats = Prog.CAT_W.map(([k, w]) => `<tr><td>Tier ${tier(k)}</td><td>${catName[k]}</td><td>${pctTxt(w / totalW * 100)}</td></tr>`).join('');
    const vals = Object.keys(Prog.VAL_W).map(k => {
      const w = Prog.CAT_W.find(x => x[0] === k)[1], vt = Prog.VAL_W[k].reduce((a, x) => a + x[1], 0);
      return `<tr><td>${catName[k]}</td><td>${Prog.VAL_W[k].map(([v, vw]) => `${F(v)} (${pctTxt(w / totalW * vw / vt * 100)})`).join(', ')}</td></tr>`;
    }).join('');
    return `<button class="pk-back" data-act="sinfoback">‹ Kembali</button>
      <h3 class="pg-h">Info Peluang · ${Prog.BANNER_NAME[b]}</h3>
      <p class="note">Hadiah utama: ${Prog.mainPool(b).length} pilihan sama rata, <b>${pctTxt(Prog.chanceEach(b))}</b> per hadiah. Tier 1 dijamin paling lambat spin ke-90 dan Tier 2 paling lambat spin ke-10, dihitung per banner.</p>
      <div class="pg-tblw"><table class="pg-tbl"><thead><tr><th>Tier</th><th>Kategori</th><th>Peluang per spin</th></tr></thead><tbody>${cats}</tbody></table></div>
      <div class="pg-tblw"><table class="pg-tbl"><thead><tr><th>Kategori</th><th>Nilai (peluang per spin)</th></tr></thead><tbody>${vals}</tbody></table></div>`;
  }
  function doSpin(n) {
    const r = Prog.spin(view.banner, n);
    if (!r.ok) { toast(r.msg); view.needTopup = !!r.kurangGem; view.res = null; render(); return false; }
    view.needTopup = false; view.res = r; render(); body.scrollTop = 0; return true;
  }

  // ---------- Tukar 5 Fragmen (10.5) ----------
  function exchHTML() {
    const b = view.exch, n = D().fragmen[b], pool = Prog.mainPool(b), isUnit = Prog.SPIN_CFG[b].kind === 'unit';
    const items = pool.map(p => {
      const st = Prog.exchangeState(b, p), off = n < 5 || st === 'maks' || st === 'dimiliki';
      const label = st === 'baru' ? (isUnit ? 'Buka unit' : 'Buka kemampuan') : st === 'salinan' ? `+1 Salinan (punya ${D().unit[p].salinan})` : st === 'maks' ? 'Maksimal (bintang 5)' : 'Dimiliki';
      const ico = isUnit ? uimg(p) : skillIconHTML(p), name = isUnit ? uname(p) : p, sub = isUnit ? '' : `<small>${uname(Prog.ABIL_BY_NAME[p].unit)} · Slot ${Prog.ABIL_BY_NAME[p].slot}</small>`;
      return `<button class="pg-xp" data-act="exchdo" data-b="${b}" data-p="${esc(p)}" ${off ? 'disabled' : ''}><span class="pg-ico">${ico}</span><span class="pg-xt"><b>${name}</b>${sub}</span><em>${label}</em></button>`;
    }).join('');
    const allOwned = !isUnit && pool.every(p => Prog.exchangeState(b, p) === 'dimiliki');
    return `<button class="pk-back" data-act="exchback">‹ Kembali</button>
      <h3 class="pg-h">Tukar 5 Fragmen · ${Prog.BANNER_NAME[b]}</h3>
      <p class="note">Fragmen ${isUnit ? 'unit' : 'kemampuan'}: <b>${F(n)}</b>${n < 5 ? ' (butuh 5)' : ''}. Pilih satu ${isUnit ? 'unit' : 'kemampuan'} dari banner ini.</p>
      ${allOwned ? '<p class="note">Semua kemampuan banner ini sudah dimiliki.</p>' : ''}
      <div class="pg-xlist">${items}</div>`;
  }

  // ---------- Surat (Lampiran D) ----------
  const LETTERS = [
    { n: 1, from: 'Jenderal John', title: 'Bekal dari Jenderal', code: 'TacticalDomination', sign: 'Jenderal John', open: 'Kepada Komandan yang kupercaya,',
      body: ['Aku sudah lama belajar bahwa perang tidak dimenangkan oleh pidato, tetapi oleh perbekalan dan orang-orang yang mau bertahan. Aku tidak punya banyak lagi di sini, di perbatasan selatan, tapi sedikit yang tersisa kukirimkan semuanya padamu.', 'Gunakan untuk membentuk satu pasukan yang tak tergoyahkan, dari prajurit baru sampai ke puncaknya. Jangan kecewakan mereka, dan jangan kecewakan dirimu sendiri.'], codeLabel: 'Kode ini hanya untukmu:' },
    { n: 2, from: 'Perusahaan Logistik Vanderick', title: 'Dukungan Kerja Sama', code: '123taktis456', sign: 'Hormat kami, Perusahaan Logistik Vanderick', open: 'Yth. Komandan,',
      body: ['Kami dari Perusahaan Logistik Vanderick mengikuti perkembangan pasukan Anda dengan penuh hormat. Di saat banyak pihak ragu, Anda tetap berdiri dan memimpin.', 'Sebagai tanda kerja sama dan kepercayaan kami, bersama surat ini kami sertakan dukungan untuk kebutuhan operasi Anda. Semoga ini membantu setiap keputusan Anda di medan tempur.'], codeLabel: 'Kode dukungan:' },
    { n: 3, from: 'Sahabat yang jauh', title: 'Kabar dari Kawan Lama', code: 'HidupFate123', sign: 'Sahabatmu yang jauh', open: 'Hei, kawan lama,',
      body: ['Sudah berapa musim sejak terakhir kita bicara? Kabarmu sampai juga ke tempatku, dan aku tersenyum membacanya. Kau memang tidak pernah berubah, selalu keras kepala di saat yang tepat.', 'Aku tidak bisa datang, jadi kutitipkan sedikit bekal lewat surat ini. Semoga berguna di medan yang keras itu, dan semoga kita bisa bertemu lagi suatu hari nanti.'], codeLabel: 'Kodenya:' },
  ];
  function suratHTML() {
    if (view.letter) {
      const L = LETTERS[view.letter - 1], used = Prog.suratSudahDipakai(L.n);
      return `<button class="pk-back" data-act="letterback">‹ Kembali</button>
        <article class="pg-paper"><p>${L.open}</p>${L.body.map(p => `<p>${p}</p>`).join('')}<p>${L.codeLabel} <b class="pg-code">${L.code}</b>${used ? ' <em class="pg-used">Sudah digunakan</em>' : ''}</p><p class="pg-sign">${L.sign}</p></article>
        <div class="pg-row"><button class="pg-btn main" data-act="copy" data-code="${L.code}">Salin Kode</button><button class="pg-btn" data-act="letterback">Tutup</button></div>`;
    }
    return `<ul class="pg-letters">${LETTERS.map(L => `<li><button class="pg-letter" data-act="letter" data-n="${L.n}"><span><b>${L.title}</b><small>${L.from}</small></span>${D().surat['s' + L.n] ? '' : '<i class="lb-dot"></i>'}</button></li>`).join('')}</ul>`;
  }

  // ---------- Render ----------
  function render() {
    if (!view) return;
    titleEl.textContent = view.kind === 'inv' ? 'Inventory' : view.kind === 'conv' ? 'Konversi Gem' : view.kind === 'spin' ? 'Spin' : 'Top Up';
    body.innerHTML = view.kind === 'inv' ? invHTML() : view.kind === 'conv' ? convHTML() : view.kind === 'spin' ? spinHTML() : topupHTML();
    modal.classList.toggle('wide', view.kind === 'inv' || view.kind === 'spin');
    refreshHeader();
  }
  const openTopup = () => open({ kind: 'topup' });
  const openSpin = () => { Prog.load(); open({ kind: 'spin', group: 'unit', banner: 'advKendaraan', res: null, info: false, needTopup: false }); };
  const openInv = () => { Prog.load(); open({ kind: 'inv', tab: 'unit', unit: null, letter: null, filter: 'all', res: null }); };

  // ---------- Event ----------
  function copyText(t) {
    const done = () => toast('Kode disalin');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => fallback());
    else fallback();
    function fallback() { const a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) {} a.remove(); done(); }
  }
  body.addEventListener('input', e => { if (e.target.id === 'pgCode') $('pgRedeem').disabled = !e.target.value.trim(); });
  body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'pgCode') doRedeem(); });
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const a = b.dataset.act, k = b.dataset.k;
    if (a === 'redeem') doRedeem();
    else if (a === 'goconvert') { Prog.load(); open({ kind: 'conv', amt_exp: 100, amt_gold: 100 }); }
    else if (a === 'gotopup') openTopup();
    else if (a === 'amt') {
      const key = 'amt_' + b.dataset.kind, gem = D().wallet.gem, max = Math.floor(gem / 100) * 100;
      let v = view[key]; if (b.dataset.set) v = b.dataset.set === 'max' ? Math.max(100, max) : +b.dataset.set; else v += +b.dataset.d;
      view[key] = Math.max(100, v); render();
    } else if (a === 'convert') {
      const key = 'amt_' + b.dataset.kind, r = Prog.convert(b.dataset.kind, view[key]);
      if (r.ok) { toast('Konversi berhasil'); view.amt_exp = view.amt_gold = 100; } else toast(r.msg);
      render();
    }
    else if (a === 'tab') { view.tab = b.dataset.tab; view.unit = null; view.letter = null; view.res = null; view.exch = null; render(); }
    else if (a === 'sgroup') { view.group = b.dataset.g; view.banner = (b.dataset.g === 'unit' ? Prog.SPIN_UNIT_BANNERS : Prog.SPIN_ABIL_BANNERS)[0]; view.needTopup = false; render(); }
    else if (a === 'sbanner') { view.banner = b.dataset.b; view.needTopup = false; render(); }
    else if (a === 'spin') doSpin(+b.dataset.n);
    else if (a === 'again') { if (view.res) doSpin(view.res.times); }
    else if (a === 'sclose') { view.res = null; render(); }
    else if (a === 'sinfo') { view.info = true; render(); body.scrollTop = 0; }
    else if (a === 'sinfoback') { view.info = false; render(); }
    else if (a === 'exch') { Prog.load(); view.exch = b.dataset.b; render(); body.scrollTop = 0; }
    else if (a === 'exchback') { view.exch = null; render(); }
    else if (a === 'exchdo') {
      const bn = b.dataset.b, pk = b.dataset.p, r = Prog.exchangeFragments(bn, pk);
      if (r.ok) toast((r.kind === 'unit' ? uname(pk) : pk) + (r.label === 'BARU' ? (r.kind === 'unit' ? ' terbuka' : ' dimiliki') : ' ' + r.label)); else toast(r.msg);
      render();
    }
    else if (a === 'unit') { view.unit = k; render(); body.scrollTop = 0; }
    else if (a === 'unitback') { view.unit = null; render(); }
    else if (a === 'lvup') { const r = Prog.levelUp(k); toast(r.ok ? 'Naik ke Level ' + r.level : r.msg); render(); }
    else if (a === 'asc') { const r = Prog.ascend(k); toast(r.ok ? 'Ascend ' + r.ascend + ' berhasil' : r.msg); render(); }
    else if (a === 'filter') { view.filter = b.dataset.f; render(); }
    else if (a === 'openharian') { const r = Prog.openHarian(); if (r.ok) view.res = { title: 'Peti Harian', rewards: r.rewards }; else toast(r.msg); render(); }
    else if (a === 'openmatch') { const r = Prog.openMatchChests(b.dataset.n === 'all' ? Infinity : 1); if (r.ok) view.res = { title: r.count > 1 ? 'Total ' + r.count + ' Peti' : 'Peti Pertandingan', rewards: r.rewards }; else toast(r.msg); render(); }
    else if (a === 'resclose') { view.res = null; render(); }
    else if (a === 'letter') { view.letter = +b.dataset.n; Prog.suratBaca(view.letter); render(); }
    else if (a === 'letterback') { view.letter = null; render(); }
    else if (a === 'copy') copyText(b.dataset.code);
  });
  modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('#pgClose')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) close(); });
  lobby.addEventListener('click', e => {
    if (e.target.closest('[data-pg="topup"]')) { Prog.load(); openTopup(); }
    else if (e.target.closest('#pgInvBtn')) openInv();
    else if (e.target.closest('#pgSpinBtn')) openSpin();
  });
  Prog.onChange(refreshHeader);
  refreshHeader();
  setInterval(refreshHeader, 30000);
  window.PgUI = { toast, refreshHeader };
})();
