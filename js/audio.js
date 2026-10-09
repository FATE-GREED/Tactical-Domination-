// Audio game (Web Audio). File ada di folder audio/ — timpa saja dengan file milikmu
// (nama sama). Varian yang file-nya tidak ada akan dilewati tanpa error. Lihat audio/README.txt.
const Sfx = (() => {
  const COUNT = {
    'move-foot': 3, 'move-vehicle': 2, 'shoot-rifle': 3, 'shoot-auto': 2, 'shoot-sniper': 2,
    'shoot-rocket': 2, 'shoot-cannon': 3, 'shoot-mortar': 2, 'hit': 3,
    'explosion-small': 2, 'explosion-big': 2, 'execute-start': 1, 'win': 1, 'lose': 1,
  };
  const MUSIC = { plan: 'bgm-plan', battle: 'bgm-battle', lobby: 'bgm-battle' }; // lobby memakai backsound pertandingan
  const SHOOT = { infantry: 'rifle', assault: 'auto', sniper: 'sniper', antitank: 'rocket',
    tanklapis: 'cannon', tankcrusher: 'cannon', montir: 'mortar' };
  const MODES = [['🔊', 'Semua suara', 1, 1], ['🎵', 'Musik saja', 1, 0], ['🔔', 'Efek saja', 0, 1], ['🔇', 'Senyap', 0, 0]];
  const MUS_VOL = 0.6, SFX_VOL = 1.3;           // v8.9: dasar dinaikkan (sebelumnya terlalu kecil); pengguna bisa 0–150%
  const vol = k => (Settings.get(k) / 100);
  let ctx, sfxG, buf = {}, last = {}, lastStep = 0;
  let mode = 0, wantTrack = null, cur = null, ducked = false, plIdx = 0, lastPick = null;
  try { mode = Math.min(3, Math.max(0, +localStorage.getItem('td-audio') || 0)); } catch (e) {}

  async function load(name) {
    try {
      const r = await fetch(`audio/${name}.mp3`);
      if (!r.ok) return null;
      return await ctx.decodeAudioData(await r.arrayBuffer());
    } catch (e) { return null; }
  }
  async function loadAll() {
    for (const [base, n] of Object.entries(COUNT)) {
      const names = n > 1 ? Array.from({ length: n }, (_, i) => `${base}-${i + 1}`) : [base];
      buf[base] = (await Promise.all(names.map(load))).filter(Boolean);
    }
    for (const t of new Set(Object.values(MUSIC))) buf[t] = [await load(t)].filter(Boolean);
    if (wantTrack) music(wantTrack);
  }
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      sfxG = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();      // cegah pecah saat volume > 100%
      sfxG.connect(comp); comp.connect(ctx.destination);
      applyMode(); loadAll();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  function play(base, vol = 1, rate = 1, cat = 'volFx') {
    if (!ctx || !MODES[mode][3]) return;
    const list = buf[base]; if (!list || !list.length) return;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === last[base]) i = (i + 1) % list.length;
    last[base] = i;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = list[i]; s.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    g.gain.value = vol * SFX_VOL * (Settings.get(cat) / 100); s.connect(g); g.connect(sfxG); s.start();
  }
  function after(ms, fn) { setTimeout(fn, ms * Settings.timeScale()); }   // ikut kecepatan eksekusi
  function audible(u, targetOwner) {
    if (u.owner === HUMAN || targetOwner === HUMAN) return true;
    return typeof isUnitUnseen !== 'function' || !isUnitUnseen(u);
  }
  // ---------- Musik: sesuai fase (bawaan) / satu lagu / urut / acak ----------
  function playTrack(name, loop, which, pl) {
    const b = (buf[name] || [])[0];
    if (!b) return false;
    const old = cur, t = ctx.currentTime;
    const g = ctx.createGain(), s = ctx.createBufferSource();
    s.buffer = b; s.loop = loop; s.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level(), t + 1.2); s.start();
    cur = { which, name, pl, g, s };
    if (!loop) s.onended = () => { if (cur && cur.s === s) nextInPlaylist(); };
    if (old) { old.g.gain.cancelScheduledValues(t); old.g.gain.setValueAtTime(old.g.gain.value, t);
      old.g.gain.linearRampToValueAtTime(0, t + 1.2); old.s.stop(t + 1.3); }
    return true;
  }
  function nextInPlaylist() {
    const m = Settings.get('musicMode');
    if (m === 'single') { playTrack(Settings.get('musicSingle'), true, null, true); return; }
    const on = Settings.get('musicShuffle');
    const pool = Settings.get('musicOrder').filter(t => on[t] && buf[t] && buf[t].length);
    if (!pool.length) return;
    let t;
    if (m === 'urut') { t = pool[plIdx % pool.length]; plIdx++; }
    else { t = pool[Math.floor(Math.random() * pool.length)]; if (pool.length > 1 && t === lastPick) t = pool[(pool.indexOf(t) + 1) % pool.length]; lastPick = t; }
    playTrack(t, pool.length === 1, null, true);   // 1 lagu saja -> loop
  }
  function music(which) {
    wantTrack = which;
    if (!ctx) return;
    if (Settings.get('musicMode') === 'fase') {
      if (cur && !cur.pl && cur.which === which) return;
      playTrack(MUSIC[which], true, which, false);
    } else if (!(cur && cur.pl)) {
      nextInPlaylist();                                   // playlist sudah jalan -> tidak diulang tiap ganti fase
    }
  }
  // Dipanggil saat pengaturan musik/volume berubah
  function refresh(restart) {
    if (!ctx) return;
    applyMode();
    if (restart) {
      if (cur) { const o = cur; cur = null; const t = ctx.currentTime; o.g.gain.cancelScheduledValues(t); o.g.gain.setTargetAtTime(0, t, 0.15); o.s.onended = null; o.s.stop(t + 0.6); }
      plIdx = 0; lastPick = null;
      if (wantTrack) music(wantTrack);
    }
  }
  function level() { return MODES[mode][2] ? MUS_VOL * vol('volMusic') * (ducked ? 0.3 : 1) : 0; }
  function applyMode() {
    if (cur) cur.g.gain.setTargetAtTime(level(), ctx.currentTime, 0.1);
    const b = document.getElementById('sndBtn');
    if (b) { b.textContent = MODES[mode][0]; b.title = MODES[mode][1]; }
  }
  function cycle() {
    mode = (mode + 1) % 4;
    try { localStorage.setItem('td-audio', mode); } catch (e) {}
    unlock(); applyMode();
  }
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });
  ['pointerdown', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { passive: true }));
  window.addEventListener('DOMContentLoaded', () => {
    const b = document.getElementById('sndBtn');
    if (b) { b.addEventListener('click', cycle); applyMode(); }
  });

  return {
    music, refresh,
    duck(on) { ducked = on; if (ctx) applyMode(); },
    executeStart() { play('execute-start', 0.8); },
    move(u) {
      const now = performance.now();
      if (now - lastStep < 150 || !audible(u)) return;
      lastStep = now;
      play(UNITS[u.type] && UNITS[u.type].vehicle ? 'move-vehicle' : 'move-foot', 0.5, 1, 'volStep');
    },
    shoot(u, targetOwner, res) {
      if (!audible(u, targetOwner)) return;
      const kind = SHOOT[u.type] || 'rifle';
      play(`shoot-${kind}`, 1);
      after(kind === 'mortar' ? 450 : 140, () => play('hit', 0.8));
      if (res && res.destroyed) after(kind === 'mortar' ? 600 : 260, () => play(res.targetKind === 'building' ? 'explosion-big' : 'explosion-small', 1));
      if (res && res.splashResults) res.splashResults.forEach((s, i) => { if (s.destroyed) after(350 + i * 150, () => play('explosion-small', 0.8)); });
    },
    end(humanWon) { if (cur) cur.g.gain.setTargetAtTime(0.1, ctx.currentTime, 0.4); play(humanWon ? 'win' : 'lose', 1); },
  };
})();

Settings.onChange(k => { if (k === '*' || /^vol/.test(k)) Sfx.refresh(false); if (k === '*' || /^music/.test(k)) Sfx.refresh(true); });
