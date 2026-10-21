// ====================================================================
// mp-net.js — Lapisan jaringan Multiplayer (v12): Supabase Realtime (Broadcast + Presence).
//   Tanpa tabel database. Dua jenis channel:
//     - 'td-lobby-v1'  : room global (presence = daftar online; broadcast chat/challenge/reply/cancel)
//     - 'td-m-<id>'    : satu pertandingan (broadcast 'm' berisi pesan permainan; presence = deteksi lawan putus)
//   MPNet.setClientFactory(fn) menggantikan Supabase (dipakai uji otomatis dengan hub tiruan).
// ====================================================================
const MPNet = (() => {
  const SUPABASE_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';   // versi dipatok
  let client = null, factory = null, lobbyCh = null, matchCh = null;

  const configured = () => !!(factory || (typeof MP_CONFIG !== 'undefined' && MP_CONFIG.url && MP_CONFIG.anonKey));
  function setClientFactory(fn) { factory = fn; client = null; }

  function loadLib() {
    return new Promise((res, rej) => {
      if (window.supabase && window.supabase.createClient) return res();
      const s = document.createElement('script');
      s.src = SUPABASE_SRC; s.async = true;
      s.onload = () => res();
      s.onerror = () => rej(new Error('Gagal memuat pustaka Supabase. Periksa koneksi internet.'));
      document.head.appendChild(s);
    });
  }
  async function getClient() {
    if (client) return client;
    if (factory) { client = factory(); return client; }
    await loadLib();
    client = window.supabase.createClient(MP_CONFIG.url, MP_CONFIG.anonKey, { realtime: { params: { eventsPerSecond: 10 } } });
    return client;
  }
  function subscribe(ch) {
    return new Promise((res, rej) => {
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; rej(new Error('Koneksi ke room kehabisan waktu.')); } }, 12000);
      ch.subscribe(status => {
        if (done) return;
        if (status === 'SUBSCRIBED') { done = true; clearTimeout(timer); res(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { done = true; clearTimeout(timer); rej(new Error('Koneksi room gagal (' + status + ').')); }
      });
    });
  }
  const flatten = st => Object.values(st || {}).map(a => a[a.length - 1]).filter(Boolean);

  // ---------- Room global ----------
  async function joinLobby(me, cb) {
    const c = await getClient();
    const ch = c.channel('td-lobby-v1', { config: { broadcast: { self: false }, presence: { key: me.id } } });
    for (const ev of ['chat', 'challenge', 'reply', 'cancel']) ch.on('broadcast', { event: ev }, m => cb['on_' + ev] && cb['on_' + ev](m.payload));
    ch.on('presence', { event: 'sync' }, () => cb.onPresence && cb.onPresence(flatten(ch.presenceState())));
    await subscribe(ch);
    await ch.track(me);
    lobbyCh = ch;
  }
  function lobbySend(event, payload) { return lobbyCh ? lobbyCh.send({ type: 'broadcast', event, payload }) : Promise.resolve(); }
  function setPresence(meta) { return lobbyCh ? lobbyCh.track(meta) : Promise.resolve(); }
  async function leaveLobby() { if (lobbyCh && client) { try { await client.removeChannel(lobbyCh); } catch (e) {} } lobbyCh = null; }

  // ---------- Pertandingan ----------
  async function joinMatch(matchId, me, cb) {
    const c = await getClient();
    const ch = c.channel('td-m-' + matchId, { config: { broadcast: { self: false, ack: true }, presence: { key: me.id } } });
    ch.on('broadcast', { event: 'm' }, m => cb.onMsg && cb.onMsg(m.payload));
    ch.on('presence', { event: 'join' }, p => cb.onPeerJoin && cb.onPeerJoin(p.key));
    ch.on('presence', { event: 'leave' }, p => cb.onPeerLeave && cb.onPeerLeave(p.key));
    await subscribe(ch);
    await ch.track({ id: me.id, name: me.name });
    matchCh = ch;
  }
  async function matchSend(obj) {
    if (!matchCh) return false;
    for (let i = 0; i < 3; i++) {                        // ack:true -> ulangi bila gagal
      try { const r = await matchCh.send({ type: 'broadcast', event: 'm', payload: obj }); if (r === 'ok' || r === undefined) return true; }
      catch (e) { /* coba lagi */ }
      await new Promise(r => setTimeout(r, 250 * (i + 1)));
    }
    return false;
  }
  async function leaveMatch() { if (matchCh && client) { try { await client.removeChannel(matchCh); } catch (e) {} } matchCh = null; }

  return { configured, setClientFactory, joinLobby, lobbySend, setPresence, leaveLobby, joinMatch, matchSend, leaveMatch };
})();
