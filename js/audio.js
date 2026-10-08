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
  const MUS_VOL = 0.45, SFX_VOL = 0.9;
  let ctx, sfxG, buf = {}, last = {}, lastStep = 0;
  let mode = 0, wantTrack = null, cur = null, ducked = false;
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
      sfxG = ctx.createGain(); sfxG.connect(ctx.destination);
      applyMode(); loadAll();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  function play(base, vol = 1, rate = 1) {
    if (!ctx || !MODES[mode][3]) return;
    const list = buf[base]; if (!list || !list.length) return;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === last[base]) i = (i + 1) % list.length;
    last[base] = i;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = list[i]; s.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    g.gain.value = vol * SFX_VOL; s.connect(g); g.connect(sfxG); s.start();
  }
  function after(ms, fn) { setTimeout(fn, ms); }
  function audible(u, targetOwner) {
    if (u.owner === HUMAN || targetOwner === HUMAN) return true;
    return typeof isUnitUnseen !== 'function' || !isUnitUnseen(u);
  }
  function music(which) {
    wantTrack = which;
    if (!ctx) return;
    const b = (buf[MUSIC[which]] || [])[0];
    if (!b || (cur && cur.which === which)) return;
    const old = cur, t = ctx.currentTime;
    const g = ctx.createGain(), s = ctx.createBufferSource();
    s.buffer = b; s.loop = true; s.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level(), t + 1.2); s.start();
    cur = { which, g, s };
    if (old) { old.g.gain.cancelScheduledValues(t); old.g.gain.setValueAtTime(old.g.gain.value, t);
      old.g.gain.linearRampToValueAtTime(0, t + 1.2); old.s.stop(t + 1.3); }
  }
  function level() { return MODES[mode][2] ? MUS_VOL * (ducked ? 0.3 : 1) : 0; }
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
    music,
    duck(on) { ducked = on; if (ctx) applyMode(); },
    executeStart() { play('execute-start', 0.8); },
    move(u) {
      const now = performance.now();
      if (now - lastStep < 150 || !audible(u)) return;
      lastStep = now;
      play(UNITS[u.type] && UNITS[u.type].vehicle ? 'move-vehicle' : 'move-foot', 0.5);
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
