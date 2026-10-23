// ====================================================================
// mp.js — Mode Multiplayer (v12): room chat global, tantangan, dan pertandingan antar manusia.
//
// Pertandingan = klasik 45x30; pemain BERGILIRAN (sama seperti lawan bot): hanya pemain yang sedang
// giliran menjalankan rencana + eksekusi. Di akhir eksekusi ia mengirim SNAPSHOT seluruh state ke lawan;
// lawan menerapkannya lalu menyusun rencana. Jadi tidak ada simulasi ganda dan tidak ada acak yang harus sinkron.
//   - Tuan rumah (penantang) = indeks 0 "absolut"; tamu = indeks 1. Di tiap perangkat pemain lokal SELALU HUMAN (0):
//     snapshot ditukar (swap) milik tamu saat dikirim/diterima, jadi seluruh UI game lama tetap berlaku.
//   - Selama eksekusi lawan, 'frame' ringan (posisi/HP) dikirim ~1,4x per detik agar lawan bisa menonton.
//   - Keluar / putus >25 detik = KALAH. Snapshot terakhir dikirim ulang bila lawan meminta (resync).
// Pola modul sama dengan Campaign/WorldWar: IIFE global MP; titik sambung di main.js, rules-auto.js, render.js,
// unit-select.js, lobby.js (semuanya dikunci `if (MPM)`).
// ====================================================================
const MP = (() => {
  let host = null;                                       // { lobby, showLoading } dari lobby.js
  const NAME_KEY = 'td-mp-name';
  const S = { me: null, users: [], chat: [], pending: null, phase: 'idle', match: null, root: null, ui: {}, joined: false, lastChat: 0, timers: {} };

  // ---------------- util ----------------
  const rid = () => { let s = ''; for (let i = 0; i < 8; i++) s += Math.floor(Math.random() * 16).toString(16); return s; };
  const cleanName = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  const $ = (sel, el) => (el || S.root).querySelector(sel);
  const safeLS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; };
  function toast(msg) { if (typeof showToast === 'function') showToast(msg); else console.log('[MP]', msg); }
  function tag(u) { return S.users.filter(x => x.name === u.name).length > 1 ? ' #' + String(u.id).slice(-4) : ''; }

  // ================================================================
  //  SNAPSHOT (bagian murni; dipakai uji headless)
  // ================================================================
  const enc = o => JSON.parse(JSON.stringify(o, (k, v) => (v === Infinity ? '__INF__' : v === -Infinity ? '__NINF__' : v)));
  const dec = o => JSON.parse(JSON.stringify(o), (k, v) => (v === '__INF__' ? Infinity : v === '__NINF__' ? -Infinity : v));
  const TKEYS = () => Object.keys(TERRAIN);
  const encodeMap = g => g.map(row => row.map(t => { const i = TKEYS().indexOf(t); if (i < 0) throw new Error('terrain tak dikenal: ' + t); return i.toString(36); }).join(''));
  const decodeMap = rows => rows.map(s => [...s].map(ch => TKEYS()[parseInt(ch, 36)]));

  function rawSnapshot() {                               // keadaan lokal (label lokal) siap kirim
    return enc({
      v: 1, map: encodeMap(mapData), players: players.map(p => { const { id, color, name, ...rest } = p; return rest; }), units, bombs, markasSites,   // id/warna/nama ditentukan sisi penerima
      ctr: { uid: uidCounter, bomb: bombSeq, bld: buildingSeq, site: siteSeq },
      turn: turnNumber, cur: currentPlayerIdx, stats: Stats.dump(),
    });
  }
  // Tukar sisi 0 <-> 1 (involusi). Dipakai tamu saat kirim dan saat terima, sehingga wire = label tuan rumah.
  function swapSnap(s) {
    const o = dec(s);
    o.players.reverse();
    const f = x => { if (x && typeof x.owner === 'number') x.owner = 1 - x.owner; };
    for (const u of o.units) { f(u); if (u.cargo && u.cargo.unit) f(u.cargo.unit); }
    for (const b of o.bombs) f(b);
    for (const m of o.markasSites) f(m);
    for (const p of o.players) for (const b of p.buildings) f(b);
    if (Array.isArray(o.stats)) o.stats.reverse();
    o.cur = 1 - o.cur;
    return o;
  }
  const guest = () => !!(MPM && MPM.role === 'guest');
  const toWire = () => { const r = rawSnapshot(); return guest() ? enc(swapSnap(r)) : r; };
  const fromWire = w => (guest() ? swapSnap(w) : dec(w));

  function applySnapshot(s) {                            // s = label lokal
    mapData = decodeMap(s.map);
    players = s.players;
    players.forEach((p, i) => { p.id = i + 1; p.color = PLAYER_COLORS[i]; p.name = i === HUMAN ? MPM.myName : MPM.oppName; });
    units = s.units; bombs = s.bombs; markasSites = s.markasSites;
    uidCounter = s.ctr.uid; bombSeq = s.ctr.bomb; buildingSeq = s.ctr.bld; siteSeq = s.ctr.site;
    turnNumber = s.turn; currentPlayerIdx = s.cur;
    Stats.load(s.stats);
    selectedUnit = null; targetActor = null; occupyHex = null; reachable = new Map();
    try { if (typeof cancelActionMode === 'function') cancelActionMode(); if (typeof closeAllPanels === 'function') closeAllPanels(); } catch (e) {}
    try { if (typeof refreshCamo === 'function') refreshCamo(); } catch (e) {}
  }
  function refreshUI() {
    try {
      if (typeof updateTurnBar === 'function') updateTurnBar();
      if (typeof renderResourcePanels === 'function') renderResourcePanels();
      if (typeof renderTargetPanel === 'function') renderTargetPanel();
      if (typeof draw === 'function') draw();
    } catch (e) { console.warn('refreshUI', e); }
  }

  // frame ringan untuk ditonton lawan (label tuan rumah di wire)
  const bKey = b => b.r + ',' + b.c + ',' + b.type;
  function makeFrame() {
    const g = guest();
    return { u: units.map(u => [u.id, g ? 1 - u.owner : u.owner, u.type, u.r, u.c, u.hp, u.fuel]),
      b: players.map((p, i) => p.buildings.map(b => [bKey(b), b.hp === Infinity ? -1 : b.hp])).map((arr, i) => ({ p: g ? 1 - i : i, a: arr })) };
  }
  function applyFrame(f) {
    const g = guest(), ids = new Set();
    for (const [id, ow, type, r, c, hp, fuel] of f.u) {
      ids.add(id);
      const u = units.find(x => x.id === id);
      if (u) { u.r = r; u.c = c; u.hp = hp; u.fuel = fuel; }
    }
    units = units.filter(u => ids.has(u.id));
    for (const { p, a } of f.b) {
      const pi = g ? 1 - p : p, pl = players[pi]; if (!pl) continue;
      const keys = new Map(a);
      pl.buildings = pl.buildings.filter(b => keys.has(bKey(b)));
      for (const b of pl.buildings) { const hp = keys.get(bKey(b)); if (hp >= 0) b.hp = hp; }
    }
    refreshUI();
  }

  // ================================================================
  //  PERTANDINGAN
  // ================================================================
  function matchSend(obj) { S.lastOut = Date.now(); return MPNet.matchSend(Object.assign({ from: S.me.id }, obj)); }

  async function openMatch(cid, role, peer) {
    S.phase = 'prematch';
    S.match = { cid, role, peer, myLoadout: null, oppLoadout: null, helloAck: false, seq: 0, lastIn: 0, started: false, remoteOver: false, lastSent: null, left: false };
    setBusy(true);
    showWait('Menghubungkan ke ' + peer.name + '…');
    await MPNet.joinMatch(cid, S.me, {
      onMsg: onMatchMsg,
      onPeerJoin: id => { if (id !== S.me.id) { clearTimeout(S.timers.drop); resendHandshake(); } },
      onPeerLeave: id => { if (id !== S.me.id) onPeerGone(); },
    });
    matchSend({ t: 'hello' });
    showUnitSelect();
  }
  function showUnitSelect() {
    hideWait();
    if (S.root) S.root.style.display = 'none';
    showUnitSelectScreen({ mode: 'mp', level: 'sedang' });
  }
  function resendHandshake() { if (!S.match) return; matchSend({ t: 'hello' }); if (S.match.myLoadout) matchSend({ t: 'ready', loadout: S.match.myLoadout }); }

  function onLoadout(list) {                             // dipanggil unit-select.js
    if (!S.match) return;
    S.match.myLoadout = list;
    matchSend({ t: 'ready', loadout: list });
    if (S.root) S.root.style.display = '';
    showWait('Menunggu ' + S.match.peer.name + ' memilih unit…');
    maybeStart();
  }
  function maybeStart() {
    const m = S.match;
    if (!m || m.started || !m.myLoadout || !m.oppLoadout || m.role !== 'host') return;
    m.started = true;
    startMatch({ role: 'host' });
  }
  function startMatch(extra) {
    const m = S.match;
    hideWait();
    if (S.root) S.root.style.display = 'none';
    S.phase = 'match';
    const mpm = { role: m.role, myName: S.me.name, oppName: m.peer.name, oppLoadout: m.oppLoadout, matchId: m.cid };
    startGame(Object.assign({ mode: 'mp', level: 'sedang', mpm }, extra));
    startFrames(); startWatchdog();
  }

  function sendStart() {                                 // dipanggil main.js (tuan rumah) setelah giliran pertama siap
    players[HUMAN].name = MPM.myName; players[BOT].name = MPM.oppName;
    const snap = toWire();
    S.match.lastSent = { t: 'start', snap, loadout: S.match.myLoadout };
    matchSend(S.match.lastSent);
  }
  function applyStart(wire) {                            // dipanggil main.js (tamu) menggantikan startTurn
    applySnapshot(fromWire(wire));
  }

  function waitTurn() {
    phase = 'plan';
    showBanner('Giliran ' + MPM.oppName + '… menunggu');
  }
  function passTurn() {                                  // akhir eksekusi giliran saya: kirim snapshot
    const m = S.match; if (!m) return;
    m.seq++;
    m.lastSent = { t: 'snap', seq: m.seq, snap: toWire() };
    matchSend(m.lastSent);
  }
  function myTurnBegin() {
    hideBanner();
    phase = 'plan';
    beginPlanning();
    toast('Giliran Anda');
  }

  function onMatchMsg(msg) {
    const m = S.match; if (!m || !msg || msg.from === S.me.id) return;
    m.lastIn = Date.now();
    switch (msg.t) {
      case 'hello': if (!m.helloAck) { m.helloAck = true; matchSend({ t: 'hello' }); } if (m.myLoadout) matchSend({ t: 'ready', loadout: m.myLoadout }); break;
      case 'ready': m.oppLoadout = msg.loadout; maybeStart(); break;
      case 'start':
        if (m.role !== 'guest' || m.started) break;
        m.started = true; m.oppLoadout = msg.loadout || m.oppLoadout;
        startMatch({ snap: msg.snap });
        break;
      case 'snap': {
        if (!MPM || msg.seq <= m.seq) break;             // duplikat / usang
        m.seq = msg.seq;
        applySnapshot(fromWire(msg.snap));
        refreshUI();
        if (currentPlayerIdx === HUMAN && !gameOver) myTurnBegin();
        break;
      }
      case 'frame': if (MPM && phase === 'plan' && currentPlayerIdx !== HUMAN && !gameOver) applyFrame(msg.f); break;
      case 'over':
        if (!MPM || gameOver) break;
        m.remoteOver = true;
        applySnapshot(fromWire(msg.snap));
        gameOver = true; winner = guest() ? 1 - msg.winner : msg.winner;
        hideBanner(); refreshUI(); showGameOver();
        break;
      case 'leave': onPeerGone(true); break;
      case 'resync': if (m.lastSent && currentPlayerIdx !== HUMAN && !gameOver) matchSend(m.lastSent); break;
    }
  }
  function onPeerGone(explicit) {
    const m = S.match; if (!m) return;
    if (!MPM) { if (!m.left) { toast('Lawan keluar sebelum pertandingan dimulai.'); setTimeout(leaveNow, 1200); } return; }
    if (gameOver) return;
    if (explicit) return forfeitOpp('Lawan keluar dari pertandingan.');
    clearTimeout(S.timers.drop);
    toast('Lawan terputus… menunggu 25 detik');
    S.timers.drop = setTimeout(() => forfeitOpp('Lawan terputus.'), 25000);
  }
  function forfeitOpp(why) {
    if (!MPM || gameOver) return;
    gameOver = true; winner = HUMAN; S.match.remoteOver = true;
    toast(why + ' Anda menang.');
    hideBanner(); refreshUI(); showGameOver();
  }
  function onGameOver() {                                // dipanggil showGameOver() (render.js)
    const m = S.match; if (!m) return;
    stopFrames(); stopWatchdog(); hideBanner();
    document.body.classList.add('mp');
    if (!m.remoteOver && !m.overSent) {
      m.overSent = true;
      matchSend({ t: 'over', snap: toWire(), winner: guest() ? 1 - winner : winner });
    }
    S.phase = 'over';
  }
  function confirmLeave() {
    let ok = true;
    try { ok = window.confirm ? window.confirm('Keluar dihitung KALAH. Lanjutkan?') : true; } catch (e) {}
    if (!ok) return;
    leaveNow();
  }
  function leaveNow() {
    try { if (S.match && !S.match.left) { S.match.left = true; matchSend({ t: 'leave' }); } } catch (e) {}
    try { sessionStorage.setItem('td-open', 'mp'); } catch (e) {}
    setTimeout(() => { try { location.reload(); } catch (e) {} }, 250);
  }

  // frame (menonton) & watchdog
  function startFrames() {
    stopFrames();
    S.timers.frame = setInterval(() => {
      if (!MPM || gameOver || phase !== 'exec' || currentPlayerIdx !== HUMAN) return;
      matchSend({ t: 'frame', f: makeFrame() });
    }, 700);
  }
  function stopFrames() { clearInterval(S.timers.frame); }
  function startWatchdog() {                             // menunggu terlalu lama tanpa kabar -> minta kirim ulang snapshot terakhir
    stopWatchdog();
    S.timers.dog = setInterval(() => {
      const m = S.match; if (!m || !MPM || gameOver) return;
      if (currentPlayerIdx !== HUMAN && Date.now() - Math.max(m.lastIn, S.lastOut || 0) > 45000) matchSend({ t: 'resync' });
    }, 15000);
  }
  function stopWatchdog() { clearInterval(S.timers.dog); }

  // ================================================================
  //  ROOM GLOBAL + TANTANGAN
  // ================================================================
  function setBusy(b) { if (!S.me) return; S.me.status = b ? 'busy' : 'idle'; MPNet.setPresence(S.me); }

  function challenge(peerId) {
    const peer = S.users.find(u => u.id === peerId);
    if (!peer || peer.id === S.me.id || S.phase !== 'idle' || peer.status === 'busy') return;
    const cid = rid() + rid();
    S.pending = { cid, dir: 'out', peer: { id: peer.id, name: peer.name } };
    S.phase = 'challenge';
    MPNet.lobbySend('challenge', { cid, to: peer.id, from: { id: S.me.id, name: S.me.name } });
    showDialog(`Menunggu ${peer.name}…`, [['Batal', cancelChallenge]]);
    S.timers.chal = setTimeout(() => { if (S.pending && S.pending.cid === cid) { cancelChallenge(); toast('Tantangan tidak dijawab.'); } }, 30000);
  }
  function cancelChallenge() {
    const p = S.pending; clearTimeout(S.timers.chal);
    if (p && p.dir === 'out') MPNet.lobbySend('cancel', { cid: p.cid, to: p.peer.id });
    S.pending = null; S.phase = 'idle'; hideDialog();
  }
  function replyChallenge(accept) {
    const p = S.pending; clearTimeout(S.timers.chal);
    if (!p || p.dir !== 'in') return;
    S.pending = null; hideDialog();
    if (!accept) { S.phase = 'idle'; MPNet.lobbySend('reply', { cid: p.cid, to: p.peer.id, from: { id: S.me.id, name: S.me.name }, accept: false }); return; }
    S.phase = 'prematch';
    openMatch(p.cid, 'guest', p.peer).then(() => MPNet.lobbySend('reply', { cid: p.cid, to: p.peer.id, from: { id: S.me.id, name: S.me.name }, accept: true }))
      .catch(err => { S.phase = 'idle'; setBusy(false); toast(err.message); });
  }
  const lobbyHandlers = {
    onPresence(list) { S.users = list.filter(u => u && u.id).map(u => ({ id: u.id, name: cleanName(u.name) || 'Tanpa nama', status: u.status === 'busy' ? 'busy' : 'idle' })); renderUsers(); },
    on_chat(m) { addChat(m); },
    on_challenge(m) {
      if (!m || m.to !== S.me.id || !m.from) return;
      if (S.phase !== 'idle') { MPNet.lobbySend('reply', { cid: m.cid, to: m.from.id, from: { id: S.me.id, name: S.me.name }, accept: false, busy: true }); return; }
      const name = cleanName(m.from.name) || 'Seseorang';
      S.pending = { cid: m.cid, dir: 'in', peer: { id: m.from.id, name } };
      S.phase = 'challenge';
      showDialog(`${name} menantang Anda!`, [['Terima', () => replyChallenge(true)], ['Tolak', () => replyChallenge(false)]]);
      S.timers.chal = setTimeout(() => { if (S.pending && S.pending.cid === m.cid) replyChallenge(false); }, 30000);
    },
    on_reply(m) {
      const p = S.pending;
      if (!m || !p || p.dir !== 'out' || m.cid !== p.cid || m.to !== S.me.id) return;
      clearTimeout(S.timers.chal); S.pending = null; hideDialog();
      if (!m.accept) { S.phase = 'idle'; toast(m.busy ? `${p.peer.name} sedang sibuk.` : `${p.peer.name} menolak tantangan.`); return; }
      S.phase = 'prematch';
      openMatch(p.cid, 'host', p.peer).catch(err => { S.phase = 'idle'; setBusy(false); toast(err.message); });
    },
    on_cancel(m) { if (S.pending && S.pending.dir === 'in' && m && m.cid === S.pending.cid) { clearTimeout(S.timers.chal); S.pending = null; S.phase = 'idle'; hideDialog(); toast('Tantangan dibatalkan.'); } },
  };
  function sendChat(text) {
    const raw = String(text == null ? '' : text).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 200);
    if (!raw) return false;
    const now = Date.now();
    if (now - S.lastChat < 800) { toast('Pelan-pelan, jangan spam.'); return false; }
    S.lastChat = now;
    const msg = { id: S.me.id, name: S.me.name, text: raw, ts: now };
    addChat(msg);
    MPNet.lobbySend('chat', msg);
    return true;
  }
  function addChat(m) {
    if (!m || typeof m.text !== 'string') return;
    S.chat.push({ name: cleanName(m.name) || '?', text: m.text.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200), me: m.id === (S.me && S.me.id) });
    if (S.chat.length > 100) S.chat.shift();
    renderChat();
  }

  // ================================================================
  //  ANTARMUKA
  // ================================================================
  function build() {
    if (S.root) return;
    const r = document.createElement('div');
    r.id = 'mpscreen';
    r.innerHTML = `
      <div class="mp-top"><button class="mp-back" type="button">← Lobby</button><b class="mp-title">MULTIPLAYER</b><span class="mp-stat"><i class="mp-dot"></i><span class="mp-count">0 online</span></span></div>
      <div class="mp-body">
        <div class="mp-entry"><div class="mp-card">
          <h3>Masuk ke Room Global</h3>
          <p>Cukup isi nama sebagai tanda pengenal (2–16 karakter). Tanpa akun.</p>
          <input class="mp-name" maxlength="16" placeholder="Nama kamu" autocomplete="off">
          <button class="mp-enter" type="button">Masuk</button>
          <div class="mp-msg"></div>
        </div></div>
        <div class="mp-room" hidden>
          <section class="mp-chat"><div class="mp-h">ROOM CHAT</div><div class="mp-log"></div>
            <div class="mp-send"><input class="mp-text" maxlength="200" placeholder="Tulis pesan…" autocomplete="off"><button class="mp-sendbtn" type="button">Kirim</button></div></section>
          <section class="mp-users"><div class="mp-h">PEMAIN ONLINE</div><div class="mp-list"></div></section>
        </div>
      </div>
      <div class="mp-dlg" hidden><div class="mp-dbox"><div class="mp-dtext"></div><div class="mp-dbtns"></div></div></div>
      <div class="mp-wait" hidden><div class="mp-dbox"><div class="mp-wtext"></div></div></div>`;
    document.body.appendChild(r);
    S.root = r;
    r.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('.mp-back')) return leaveRoom();
      if (t.closest('.mp-enter')) return doEnter();
      if (t.closest('.mp-sendbtn')) return doSend();
      const b = t.closest('[data-chal]'); if (b) return challenge(b.dataset.chal);
    });
    r.addEventListener('keydown', e => { if (e.key !== 'Enter') return; if (e.target.classList.contains('mp-name')) doEnter(); else if (e.target.classList.contains('mp-text')) doSend(); });
  }
  function doSend() { const i = $('.mp-text'); if (sendChat(i.value || '')) i.value = ''; }
  async function doEnter() {
    const msg = $('.mp-msg'), name = cleanName($('.mp-name').value);
    if (name.length < 2) { msg.textContent = 'Nama minimal 2 karakter.'; return; }
    msg.textContent = 'Menghubungkan…';
    safeLS(NAME_KEY, name);
    try { await joinRoom(name); msg.textContent = ''; }
    catch (err) { msg.textContent = err.message || 'Gagal terhubung.'; }
  }
  async function joinRoom(name) {
    if (!MPNet.configured()) throw new Error('Multiplayer belum dikonfigurasi. Isi url dan anonKey di js/mp-config.js (petunjuk ada di berkas itu).');
    S.me = { id: rid() + rid(), name, status: 'idle' };
    S.chat = []; S.users = [];
    await MPNet.joinLobby(S.me, lobbyHandlers);
    S.joined = true; S.phase = 'idle';
    if (S.root) { $('.mp-entry').hidden = true; $('.mp-room').hidden = false; S.root.classList.add('inroom'); }
    addChat({ id: '', name: 'Sistem', text: `Selamat datang, ${name}! Pilih pemain online lalu tekan Tantang.` });
  }
  function renderChat() {
    if (!S.root) return;
    const log = $('.mp-log'); if (!log) return;
    log.textContent = '';
    for (const m of S.chat) {
      const d = document.createElement('div'); d.className = 'mp-line' + (m.me ? ' me' : '');
      const n = document.createElement('b'); n.textContent = m.name + ': ';
      const t = document.createElement('span'); t.textContent = m.text;
      d.appendChild(n); d.appendChild(t); log.appendChild(d);
    }
    log.scrollTop = log.scrollHeight;
  }
  function renderUsers() {
    if (!S.root) return;
    const cnt = $('.mp-count'); if (cnt) cnt.textContent = S.users.length + ' online';
    const list = $('.mp-list'); if (!list) return;
    list.textContent = '';
    const sorted = S.users.slice().sort((a, b) => (a.id === S.me.id ? -1 : b.id === S.me.id ? 1 : a.name.localeCompare(b.name)));
    for (const u of sorted) {
      const row = document.createElement('div'); row.className = 'mp-user';
      const n = document.createElement('span'); n.className = 'mp-uname'; n.textContent = u.name + tag(u) + (u.id === S.me.id ? ' (Anda)' : '');
      row.appendChild(n);
      if (u.id !== S.me.id) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = u.status === 'busy' ? 'Sibuk' : 'Tantang';
        b.disabled = u.status === 'busy' || S.phase !== 'idle'; b.dataset.chal = u.id; row.appendChild(b);
      } else { const s = document.createElement('small'); s.textContent = u.status === 'busy' ? 'sibuk' : 'siap'; row.appendChild(s); }
      list.appendChild(row);
    }
  }
  function showDialog(text, btns) {
    if (!S.root) return;
    const d = $('.mp-dlg'); $('.mp-dtext').textContent = text;
    const box = $('.mp-dbtns'); box.textContent = '';
    for (const [label, fn] of btns) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', fn); box.appendChild(b); }
    d.hidden = false;
  }
  function hideDialog() { if (S.root) $('.mp-dlg').hidden = true; renderUsers(); }
  function showWait(t) { if (!S.root) return; $('.mp-wtext').textContent = t; $('.mp-wait').hidden = false; }
  function hideWait() { if (S.root) $('.mp-wait').hidden = true; }
  function showBanner(t) { let b = document.getElementById('mpbanner'); if (!b) { b = document.createElement('div'); b.id = 'mpbanner'; document.body.appendChild(b); } b.textContent = t; b.style.display = 'block'; }
  function hideBanner() { const b = document.getElementById('mpbanner'); if (b) b.style.display = 'none'; }

  // ================================================================
  //  PINTU MASUK
  // ================================================================
  function bind(h) {
    host = h;
    const back = document.getElementById('mpBackBtn');
    if (back) back.addEventListener('click', leaveNow);
    window.addEventListener('pagehide', () => { try { if (S.match && !S.match.left && MPM && !gameOver) { S.match.left = true; matchSend({ t: 'leave' }); } } catch (e) {} });
  }
  function enter() {
    build();
    S.root.style.display = '';
    S.root.classList.add('open');
    if (S.joined) return;
    const saved = safeLS(NAME_KEY) || '';
    if (saved) $('.mp-name').value = saved;
    if (!MPNet.configured()) $('.mp-msg').textContent = 'Multiplayer belum dikonfigurasi: isi url dan anonKey di js/mp-config.js (lihat petunjuk di berkas itu).';
  }
  async function leaveRoom() {
    if (S.phase === 'challenge') { if (S.pending && S.pending.dir === 'out') cancelChallenge(); else replyChallenge(false); }
    await MPNet.leaveLobby();
    S.joined = false; S.me = null; S.users = []; S.phase = 'idle';
    if (S.root) { S.root.remove(); S.root = null; }
    if (host && host.lobby) host.lobby.style.display = '';
  }

  return { bind, enter, leaveRoom, onLoadout, sendStart, applyStart, waitTurn, passTurn, onGameOver, confirmLeave,
    _t: { S, rawSnapshot, swapSnap, applySnapshot, toWire, fromWire, enc, dec, makeFrame, applyFrame, joinRoom, challenge, replyChallenge, lobbyHandlers, sendChat, cleanName, onMatchMsg, openMatch, onLoadout, leaveNow, forfeitOpp, encodeMap, decodeMap } };
})();
