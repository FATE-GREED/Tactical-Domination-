// ====================================================================
// story.js — Mesin cerita Campaign (v9.7).
// Memutar "naskah" berupa array langkah: latar, narasi, dialog (potret + kotak
// percakapan), transisi awan, animasi mobil di peta benua, judul chapter, dan
// animasi hadiah "terlepas dari gembok". Tidak ada aturan game di sini.
//
// Langkah yang dikenali (lihat campaign.js untuk contoh):
//   { bg:'nama' }                   ganti latar (crossfade)
//   { narr:'teks' }                 narasi tanpa potret
//   { say, n, pose, side, text }    dialog; n = nomor perwira, pose = nomor pose cerita
//   { clouds:'open'|'close' }       transisi awan
//   { mapOpen:true } / { mapHide }  peta benua (turun perlahan) / sembunyikan
//   { route:true }                  mobil militer melintas dari ibu kota ke selatan
//   { sfx:'gavel' }, { wait:ms }
//   { title:'teks', stop:true }     judul besar
//   { rewards:[...], stop:true }    animasi hadiah
// Langkah dengan stop:true tidak ikut terlewati oleh tombol "Lewati".
// ====================================================================
const Story = (() => {
  const IMG = n => `img/campaign/${n}.webp`;
  const MAP = {
    w: 2212, h: 1659,
    route: [[1000, 620], [850, 760], [800, 900], [850, 1060], [920, 1160], [965, 1235]],   // ibu kota (tengah) -> pos pengasingan (selatan)
  };
  const NS = 'http://www.w3.org/2000/svg';
  const el = {};
  let root = null, built = false, skipping = false, tapResolve = null, typing = null, typeTimer = null;
  let bgFront = 0, curPortrait = null;

  const wait = ms => new Promise(r => setTimeout(r, skipping ? 0 : ms));
  const mk = (tag, cls, parent, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  };

  function build() {
    if (built) return;
    built = true;
    root = mk('div', 'st-root', document.body);
    root.id = 'story'; root.hidden = true;
    el.bgs = [mk('div', 'st-bg', root), mk('div', 'st-bg', root)];
    el.map = mk('div', 'st-map', root);
    el.dim = mk('div', 'st-dim', root);
    el.portrait = mk('img', 'st-portrait', root); el.portrait.alt = ''; el.portrait.draggable = false;
    el.narr = mk('div', 'st-narr', root); el.narrText = mk('p', '', el.narr);
    el.box = mk('div', 'st-box', root);
    el.boxImg = mk('img', 'st-boxbg', el.box); el.boxImg.src = IMG('kotak'); el.boxImg.alt = ''; el.boxImg.draggable = false;
    el.name = mk('span', 'st-name', el.box);
    el.text = mk('p', 'st-text', el.box);
    el.title = mk('div', 'st-title', root);
    el.reward = mk('div', 'st-reward', root);
    el.clouds = mk('div', 'st-clouds', root); mk('i', 'cl cl-l', el.clouds); mk('i', 'cl cl-r', el.clouds);
    el.hint = mk('div', 'st-hint', root, 'ketuk untuk lanjut');
    el.skip = mk('button', 'st-skip', root, 'Lewati');
    root.addEventListener('pointerdown', onTap);
    el.skip.addEventListener('pointerdown', e => e.stopPropagation());
    el.skip.addEventListener('click', e => { e.stopPropagation(); doSkip(); });
  }

  // ---------- Ketuk & ketik ----------
  function onTap(e) {
    if (e.target === el.skip || e.target.closest('.st-reward .rw-next')) return;
    if (typing) { typing.finish(); return; }
    if (tapResolve) { const r = tapResolve; tapResolve = null; el.hint.classList.remove('on'); r(); }
  }
  function tap() {
    if (skipping) return Promise.resolve();
    return new Promise(res => { tapResolve = res; el.hint.classList.add('on'); });
  }
  function typeText(node, text) {
    return new Promise(res => {
      clearInterval(typeTimer);
      node.textContent = '';
      let i = 0;
      const done = () => { clearInterval(typeTimer); node.textContent = text; typing = null; res(); };
      typing = { finish: done };
      if (skipping) { done(); return; }
      const step = text.length > 140 ? 2 : 1;
      typeTimer = setInterval(() => { i += step; node.textContent = text.slice(0, i); if (i >= text.length) done(); }, 24);
    });
  }
  function doSkip() {
    skipping = true;
    if (typing) typing.finish();
    el.clouds.classList.add('open');
    hideMap();
    if (tapResolve) { const r = tapResolve; tapResolve = null; r(); }
  }

  // ---------- Latar, potret ----------
  function setBg(name, ms) {
    ms = ms == null ? 700 : ms;
    return new Promise(res => {
      const im = new Image();
      im.onload = im.onerror = () => {
        const front = el.bgs[bgFront], back = el.bgs[1 - bgFront];
        const tr = skipping ? 'none' : `opacity ${ms}ms ease`;
        back.style.zIndex = 2; front.style.zIndex = 1;
        back.style.transition = tr;
        back.style.backgroundImage = `url(${IMG(name)})`;
        void back.offsetWidth;
        back.classList.add('on');
        bgFront = 1 - bgFront;
        setTimeout(() => { front.classList.remove('on'); res(); }, skipping ? 0 : ms);
      };
      im.src = IMG(name);
    });
  }
  function setPortrait(src, side) {
    if (!src) { el.portrait.classList.remove('on'); curPortrait = null; return; }
    const key = src + side;
    if (key === curPortrait) return;
    curPortrait = key;
    el.portrait.classList.remove('on');
    const im = new Image();
    im.onload = () => {
      if (curPortrait !== key) return;
      el.portrait.src = src;
      el.portrait.className = 'st-portrait ' + (side === 'l' ? 'l' : 'r') + ' on';
    };
    im.src = src;
  }
  function showText(mode) {          // 'say' | 'narr' | 'none'
    el.box.classList.toggle('on', mode === 'say');
    el.narr.classList.toggle('on', mode === 'narr');
    el.dim.classList.toggle('on', mode === 'narr');
    if (mode !== 'say') setPortrait(null);
  }

  // ---------- Langkah dasar ----------
  async function doNarr(s) {
    showText('narr');
    await typeText(el.narrText, s.narr);
    await tap();
  }
  async function doSay(s) {
    showText('say');
    el.name.textContent = s.say || '';
    el.name.style.display = s.say ? '' : 'none';
    setPortrait(s.n ? STORY_IMG(s.n, s.pose || 5) : null, s.side || 'r');
    await typeText(el.text, s.text);
    await tap();
  }
  async function doClouds(state) {
    el.clouds.classList.toggle('open', state === 'open');
    await wait(1900);
  }

  // ---------- Peta benua ----------
  function hideMap() { el.map.classList.remove('on'); el.map.innerHTML = ''; }
  function mountMap() {
    const W = innerWidth, H = innerHeight, sc = Math.max(W / MAP.w, H / MAP.h);   // menutupi layar
    const w = MAP.w * sc, h = MAP.h * sc;
    el.map.innerHTML = `<svg class="st-svg" viewBox="0 0 ${MAP.w} ${MAP.h}" width="${w}" height="${h}" style="left:${(W - w) / 2}px"><image href="${IMG('peta-benua')}" width="${MAP.w}" height="${MAP.h}"/><g class="st-rt"></g></svg>`;
    el.map.classList.add('on');
    return { svg: el.map.firstChild, sc, W, H, w, h };
  }
  function doMapOpen() {             // awan terbuka, lalu layar turun perlahan menyusuri peta
    const m = mountMap();
    if (!skipping && m.h > m.H) m.svg.animate(
      [{ transform: 'translateY(0)' }, { transform: `translateY(${m.H - m.h}px)` }],
      { duration: 11000, easing: 'ease-in-out', fill: 'forwards' });
    return doClouds('open');
  }
  const smooth = pts => {            // Catmull-Rom -> Bezier
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
    }
    return d;
  };
  const svgEl = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  async function doRoute() {
    if (skipping) return;
    showText('none');
    await doClouds('close');
    const m = mountMap();
    const g = m.svg.querySelector('.st-rt');
    const midY = 930 * m.sc;         // pusatkan rute di layar
    m.svg.style.transform = `translateY(${Math.min(0, Math.max(m.H - m.h, m.H / 2 - midY))}px)`;
    const pts = MAP.route;
    const path = svgEl('path', { d: smooth(pts), fill: 'none', stroke: 'none' }, g);
    const L = path.getTotalLength();
    const dashes = [];
    for (let s = 0; s < L; s += 46) {
      const a = path.getPointAtLength(s), b = path.getPointAtLength(Math.min(L, s + 26));
      dashes.push({ s, e: svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#7a2a1c', 'stroke-width': 9, 'stroke-linecap': 'round', opacity: 0 }, g) });
    }
    const label = (p, txt, dy) => svgEl('text', { x: p[0], y: p[1] + dy, 'text-anchor': 'middle', 'font-size': 46, 'font-style': 'italic', fill: '#3a2a16', 'font-family': 'Georgia,serif', 'paint-order': 'stroke', stroke: '#f1e4c1', 'stroke-width': 9 }, g);
    const cap = pts[0], ext = pts[pts.length - 1];
    svgEl('circle', { cx: cap[0], cy: cap[1], r: 20, fill: '#d7b56d', stroke: '#5a3a14', 'stroke-width': 7 }, g);
    label(cap, '', -42).textContent = 'Ibu kota';
    const exitMark = svgEl('g', { opacity: 0 }, g);
    svgEl('path', { d: `M${ext[0]},${ext[1]} v-70 l52,18 l-52,18`, fill: '#b3322f', stroke: '#3a1410', 'stroke-width': 6, 'stroke-linejoin': 'round' }, exitMark);
    const lb = label(ext, '', 62); lb.textContent = 'Pos pengasingan'; exitMark.appendChild(lb);
    const car = svgEl('g', {}, g);
    svgEl('rect', { x: -44, y: -20, width: 88, height: 40, rx: 9, fill: '#4d5a3a', stroke: '#1d2016', 'stroke-width': 5 }, car);
    svgEl('rect', { x: 8, y: -14, width: 24, height: 28, rx: 5, fill: '#9fb4c4', stroke: '#1d2016', 'stroke-width': 4 }, car);
    [[-28, -24], [22, -24], [-28, 24], [22, 24]].forEach(([x, y]) => svgEl('rect', { x: x - 10, y: y - 6, width: 20, height: 12, rx: 3, fill: '#1a1a18' }, car));
    const pose = t => {
      const s = L * t, p = path.getPointAtLength(s), q = path.getPointAtLength(Math.min(L, s + 6));
      const ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
      car.setAttribute('transform', `translate(${p.x},${p.y}) rotate(${ang})`);
      for (const d of dashes) if (d.s <= s) d.e.setAttribute('opacity', 0.9);
    };
    pose(0);
    await doClouds('open');          // awan terbuka, peta dengan rute terlihat
    await wait(500);
    await new Promise(res => {
      const t0 = performance.now(), dur = 5200;
      const frame = now => {
        const t = Math.min(1, (now - t0) / dur), k = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        pose(k);
        if (t < 1 && !skipping) requestAnimationFrame(frame); else { pose(1); res(); }
      };
      requestAnimationFrame(frame);
    });
    exitMark.setAttribute('opacity', 1);
    await wait(1400);
    await doClouds('close');         // awan menutup; langkah berikut membuka latar baru
    hideMap();
  }

  // ---------- Judul & hadiah ----------
  async function doTitle(s) {
    showText('none');
    el.title.textContent = s.title;
    el.title.classList.add('on');
    await wait(900);
    await tap();
    el.title.classList.remove('on');
    await wait(500);
  }
  function itemPic(it) {
    if (it.img) { const i = new Image(); i.src = it.img; i.className = 'rw-img'; i.alt = it.label || ''; return i; }
    const w = 150, h = 140, dpr = 2, cv = document.createElement('canvas');
    cv.width = w * dpr; cv.height = h * dpr; cv.className = 'rw-cv';
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    try {
      if (!terrainSprites.grass) buildTerrainSprites();
      const sp = terrainSprites.grass;
      if (sp) c.drawImage(sp.canvas, w / 2 - 70, h / 2 - 70, 140, 140);
      if (it.unit) UNIT_RENDERERS[it.unit](c, w / 2, h / 2 + 12, 80);
      if (it.bld) { c.save(); c.translate(w / 2, h / 2 + 8); c.scale(56, 56); BUILDING_ART[it.bld](c, PLAYER_COLORS[0], { n: 3 }); c.restore(); }
    } catch (e) { /* gambar gagal -> kartu tetap tampil dengan label */ }
    return cv;
  }
  const LOCK_SVG = '<svg viewBox="0 0 64 80" aria-hidden="true"><path class="shackle" d="M18 36V24a14 14 0 0 1 28 0v12" fill="none" stroke="#c9cfbf" stroke-width="7" stroke-linecap="round"/><rect x="8" y="34" width="48" height="38" rx="7" fill="#d7b56d" stroke="#8c7137" stroke-width="3"/><circle cx="32" cy="50" r="5" fill="#2a2210"/><rect x="30" y="52" width="4" height="12" rx="2" fill="#2a2210"/></svg>';
  async function doRewards(list) {
    showText('none');
    skipping = false;
    el.dim.classList.add('on');
    for (const rw of list) {
      el.reward.innerHTML = `<div class="rw-card"><h3>${rw.head}</h3><div class="rw-items"></div><button class="rw-next" disabled>Lanjut</button></div>`;
      const row = el.reward.querySelector('.rw-items'), btn = el.reward.querySelector('.rw-next');
      const cards = rw.items.map(it => {
        const c = mk('div', 'rw-item', row);
        const pic = mk('div', 'rw-pic', c); pic.appendChild(itemPic(it));
        mk('div', 'rw-lock', pic, LOCK_SVG);
        mk('b', '', c, it.label);
        return c;
      });
      el.reward.classList.add('on');
      await wait(900);
      cards.forEach(c => c.classList.add('open'));          // gembok terbuka
      Sfx.fx('hit', 0.5);
      await wait(650);
      cards.forEach(c => c.classList.add('drop'));          // gembok terlepas
      await wait(900);
      cards.forEach(c => c.classList.add('got'));
      btn.disabled = false;
      await new Promise(res => btn.addEventListener('click', res, { once: true }));
      el.reward.classList.remove('on');
      await wait(450);
    }
    el.dim.classList.remove('on');
  }

  // ---------- Pemutar ----------
  async function exec(s) {
    if (s.bg) return setBg(s.bg, s.ms);
    if (s.mapHide) { hideMap(); return; }
    if (s.title) return doTitle(s);
    if (s.rewards) return doRewards(s.rewards);
    if (skipping) return;                                   // selain langkah di atas, lewati saat "Lewati"
    if (s.narr) return doNarr(s);
    if (s.say !== undefined) return doSay(s);
    if (s.clouds) return doClouds(s.clouds);
    if (s.mapOpen) return doMapOpen();
    if (s.route) return doRoute();
    if (s.sfx === 'gavel') { Sfx.fx('hit', 1); setTimeout(() => Sfx.fx('hit', 1), 420); return wait(900); }
    if (s.wait) return wait(s.wait);
  }
  function reset() {
    skipping = false; tapResolve = null; typing = null; clearInterval(typeTimer);
    el.bgs.forEach(b => { b.classList.remove('on'); b.style.backgroundImage = ''; b.style.transition = 'none'; });
    bgFront = 0; curPortrait = null;
    hideMap(); showText('none');
    el.title.classList.remove('on'); el.reward.classList.remove('on'); el.reward.innerHTML = '';
    el.clouds.style.transition = 'none'; el.clouds.classList.remove('open'); void el.clouds.offsetWidth; el.clouds.style.transition = '';
    el.hint.classList.remove('on');
  }
  async function play(script) {
    build(); reset();
    root.hidden = false;
    for (const s of script) {
      if (skipping && s.stop) skipping = false;
      await exec(s);
    }
    skipping = false;
  }
  function hide() { if (root) root.hidden = true; }

  return { play, hide };
})();
