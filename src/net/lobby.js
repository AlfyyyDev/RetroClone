// Serverless lobby: peers find each other through public Nostr relays and WebTorrent
// trackers (signaling only, a few KB), then talk directly over WebRTC.
import { joinRoom as joinNostr } from '@trystero-p2p/nostr';
import { joinRoom as joinTorrent } from '@trystero-p2p/torrent';

export const APP_ID = 'retro-gridiron-p2p-v1';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const FAST_CHANNEL_ID = 77;
// Dev: simulate a bad network with ?lag=ms&jitter=ms&loss=percent (one-way, outgoing).
const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const LAG = qs && qs.has('lag') ? { ms: +qs.get('lag') || 0, jitter: +qs.get('jitter') || 0, loss: +qs.get('loss') || 0 } : null;

export function makeCode() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('');
}
export const normalizeCode = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

// Optional TURN servers for strict NATs: set window.RG_TURN = [{urls, username, credential}] before load.
const turnConfig = () => (typeof window !== 'undefined' && window.RG_TURN) || undefined;

/**
 * Connect to the room for `code`. Resolves with a transport once the direct channel is open:
 * { sendFast(Uint8Array), onFast, sendRel(obj), onRel, onClose, close(), peerId, via }
 */
export function connect(code, isHost, onStatus = () => {}) {
  const roomId = 'rg-' + code;
  const cfg = { appId: APP_ID, password: code, turnConfig: turnConfig() };
  const strategies = [['nostr', joinNostr], ['torrent', joinTorrent]];
  const rooms = [];
  let chosen = null;
  let done = false;
  let cancel;

  const promise = new Promise((resolve, reject) => {
    cancel = (why) => {
      if (done) return;
      done = true;
      for (const r of rooms) r.room.leave().catch(() => {});
      reject(new Error(why));
    };

    const finish = (entry, peerId) => {
      if (chosen) return;
      chosen = entry;
      for (const r of rooms) if (r !== entry) r.room.leave().catch(() => {});
      onStatus(`Connected via ${entry.name}. Opening fast channel...`);
      const pc = entry.room.getPeers()[peerId];
      openTransport(entry, peerId, pc).then((t) => { done = true; resolve(t); }, (e) => cancel(e.message));
    };

    for (const [name, join] of strategies) {
      let room;
      try {
        room = join(cfg, roomId, { onJoinError: (d) => console.warn(`[${name}]`, d.error) });
      } catch (e) {
        console.warn(`[${name}] join failed`, e);
        continue;
      }
      const entry = { name, room, pick: room.makeAction('pick'), rel: room.makeAction('rel') };
      rooms.push(entry);
      room.onPeerJoin = (peerId) => {
        if (chosen) return;
        if (isHost) {
          // Host decides which signaling network wins and tells the guest.
          entry.pick.send({ ok: 1 }, { target: peerId }).catch(() => {});
          finish(entry, peerId);
        } else onStatus(`Found host via ${name}...`);
      };
      if (!isHost) entry.pick.onMessage = (_, ctx) => finish(entry, ctx.peerId);
    }
    if (!rooms.length) cancel('No signaling strategy available');
    onStatus(isHost ? 'Waiting for opponent to join...' : 'Searching for host...');
  });
  return { promise, cancel: (why = 'cancelled') => cancel && cancel(why) };
}

function openTransport(entry, peerId, pc) {
  return new Promise((resolve, reject) => {
    if (!pc) { reject(new Error('Peer connection missing')); return; }
    // Negotiated (pre-agreed id) unreliable, unordered channel: no head-of-line blocking.
    const ch = pc.createDataChannel('fast', { negotiated: true, id: FAST_CHANNEL_ID, ordered: false, maxRetransmits: 0 });
    ch.binaryType = 'arraybuffer';
    const t = {
      peerId, via: entry.name, onFast: null, onRel: null, onClose: null, closed: false,
      sendFast(u8) {
        if (ch.readyState !== 'open') return;
        if (LAG) { if (Math.random() * 100 < LAG.loss) return; setTimeout(() => { if (ch.readyState === 'open') try { ch.send(u8); } catch {} }, LAG.ms + Math.random() * LAG.jitter); return; }
        try { ch.send(u8); } catch { /* buffer full: drop, redundancy covers it */ }
      },
      sendRel(obj) { entry.rel.send(obj, { target: peerId }).catch(() => {}); },
      close() { if (t.closed) return; t.closed = true; try { ch.close(); } catch {} entry.room.leave().catch(() => {}); },
      pc,
    };
    ch.onmessage = (e) => t.onFast && t.onFast(e.data);
    entry.rel.onMessage = (data, ctx) => { if (ctx.peerId === peerId && t.onRel) t.onRel(data); };
    const lost = () => { if (!t.closed) { t.closed = true; t.onClose && t.onClose(); } };
    entry.room.onPeerLeave = (id) => { if (id === peerId) lost(); };
    ch.onclose = lost;
    const timer = setTimeout(() => reject(new Error('Fast channel did not open')), 15000);
    const opened = () => { clearTimeout(timer); resolve(t); };
    if (ch.readyState === 'open') opened(); else ch.onopen = opened;
  });
}
