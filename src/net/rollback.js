// GGPO-style rollback session for two peers running the deterministic sim.
// Inputs are sent every tick over an unreliable/unordered channel with redundancy,
// the remote input is predicted, and the sim rewinds + replays on mispredictions.
import { clone, hashState } from '../sim/core.js';
import { step } from '../sim/game.js';

const BUF = 128;          // ring buffer size (frames)
const MAX_PREDICT = 14;   // frames we may run ahead of the last confirmed remote input
const REDUNDANCY = 40;    // max inputs per packet
const HASH_EVERY = 60;

export const EMPTY = Object.freeze({ mx: 0, my: 0, btn: 0, menu: 0, ax: 0, ay: 0 });
const PKT_INPUT = 1, PKT_HASH = 2, PKT_PING = 3, PKT_PONG = 4;

function writeInput(dv, o, inp) {
  dv.setInt8(o, inp.mx); dv.setInt8(o + 1, inp.my); dv.setUint8(o + 2, inp.btn); dv.setUint8(o + 3, inp.menu);
  dv.setInt16(o + 4, inp.ax); dv.setInt16(o + 6, inp.ay);
}
function readInput(dv, o) {
  return { mx: dv.getInt8(o), my: dv.getInt8(o + 1), btn: dv.getUint8(o + 2), menu: dv.getUint8(o + 3), ax: dv.getInt16(o + 4), ay: dv.getInt16(o + 6) };
}
const sameInput = (a, b) => a.mx === b.mx && a.my === b.my && a.btn === b.btn && a.menu === b.menu && a.ax === b.ax && a.ay === b.ay;
// Predicted remote input: keep held movement/buttons, never repeat one-shot menu choices.
const predictFrom = (p) => (p.menu ? { ...p, menu: 0 } : p);

export class RollbackSession {
  constructor({ state, localTeam, transport, inputDelay = 2 }) {
    this.st = state;
    this.local = localTeam;
    this.remote = 1 - localTeam;
    this.tx = transport;
    this.delay = inputDelay;
    this.f = state.frame;                 // next frame to simulate
    this.localIn = new Array(BUF);
    this.remoteIn = new Array(BUF);
    this.remoteSet = new Int32Array(BUF).fill(-1); // which frame each slot holds
    this.localSet = new Int32Array(BUF).fill(-1);
    this.used = new Array(BUF);           // remote input actually used when simulating a frame
    this.snaps = new Array(BUF);
    this.lastConf = this.f - 1;           // last contiguous confirmed remote frame
    this.remoteAck = this.f - 1;          // last local frame the remote has confirmed
    this.rollTo = -1;
    this.maxSim = this.f - 1;             // highest frame ever simulated (for one-shot events)
    this.remoteFrame = 0;
    this.remoteAdv = 0;
    this.rtt = 0;
    this.lastRecv = performance.now();
    this.lastRecvT = performance.now();
    this.skipAcc = 0;
    this.myHashes = new Map();
    this.theirHashes = new Map();
    this.lastHashed = this.f - 1;
    this.desync = -1;
    this.isHost = localTeam === 0; // the host's state wins when the peers disagree
    this.epoch = 0;                 // bumps on every resync so stale hashes are ignored
    this.resyncs = 0;
    this.lastResyncAt = -1e9;
    this.wantResync = false;
    this.rollbacks = 0;
    this.rollFrames = 0;
    this.stalled = false;
    this.events = [];
    for (let k = this.f; k < this.f + this.delay; k++) this.setLocal(k, EMPTY);
    this.sendBuf = new DataView(new ArrayBuffer(16 + REDUNDANCY * 8));
    transport.onFast = (buf) => this.onPacket(buf);
    this.pingTimer = setInterval(() => this.ping(), 500);
  }

  setLocal(k, inp) { this.localIn[k % BUF] = inp; this.localSet[k % BUF] = k; }
  getLocal(k) { return this.localSet[k % BUF] === k ? this.localIn[k % BUF] : EMPTY; }
  hasRemote(k) { return this.remoteSet[k % BUF] === k; }

  remoteFor(k) {
    if (this.hasRemote(k)) return this.remoteIn[k % BUF];
    return this.lastConf >= 0 && this.hasRemote(this.lastConf) ? predictFrom(this.remoteIn[this.lastConf % BUF]) : EMPTY;
  }

  simFrame(k) {
    this.snaps[k % BUF] = clone(this.st);
    const r = this.remoteFor(k);
    this.used[k % BUF] = r;
    const inputs = this.local === 0 ? [this.getLocal(k), r] : [r, this.getLocal(k)];
    step(this.st, inputs);
    if (k > this.maxSim) {
      this.maxSim = k;
      for (const e of this.st.ev) this.events.push(e);
    }
  }

  // Advance by one tick. sample() returns this frame's local input.
  tick(sample) {
    // 1. Rewind and replay if a confirmed remote input contradicted our prediction.
    if (this.rollTo >= 0 && this.rollTo < this.f) {
      const from = this.rollTo;
      this.st = this.snaps[from % BUF];
      this.snaps[from % BUF] = null;
      for (let k = from; k < this.f; k++) this.simFrame(k);
      this.rollbacks++;
      this.rollFrames += this.f - from;
    }
    this.rollTo = -1;
    this.checkHashes();
    if (this.wantResync) this.sendResync();

    // 2. Time sync: if we're running ahead of the peer, occasionally hold a frame.
    const localAdv = this.f - this.estRemoteFrame();
    const adv = (localAdv - this.remoteAdv) / 2;
    this.skipAcc += adv > 0.75 ? Math.min(adv, 4) * 0.12 : 0;
    let advance = true;
    if (this.skipAcc >= 1) { this.skipAcc -= 1; advance = false; }

    // 3. Don't predict too far ahead of what we've confirmed.
    this.stalled = this.f - this.lastConf > MAX_PREDICT;
    if (this.stalled) advance = false;

    if (advance) {
      this.setLocal(this.f + this.delay, sample());
      this.simFrame(this.f);
      this.f++;
    }
    this.send();
    return advance;
  }

  estRemoteFrame() {
    const since = (performance.now() - this.lastRecvT) / (1000 / 60);
    return this.remoteFrame + Math.min(since, 30) + (this.rtt / 2) / (1000 / 60);
  }

  send() {
    const dv = this.sendBuf;
    const top = this.f + this.delay - 1; // newest local input we have
    let start = Math.max(this.remoteAck + 1, top - REDUNDANCY + 1);
    const n = Math.max(0, top - start + 1);
    dv.setUint8(0, PKT_INPUT);
    dv.setUint32(1, this.lastConf + 1); // ack: first remote frame we still need
    dv.setUint32(5, this.f);
    dv.setInt8(9, Math.max(-127, Math.min(127, Math.round(this.f - this.estRemoteFrame()))));
    dv.setUint32(10, start);
    dv.setUint8(14, n);
    for (let i = 0; i < n; i++) writeInput(dv, 15 + i * 8, this.getLocal(start + i));
    this.tx.sendFast(new Uint8Array(dv.buffer, 0, 15 + n * 8).slice());
  }

  onPacket(buf) {
    const dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, buf.byteLength);
    const type = dv.getUint8(0);
    this.lastRecv = performance.now();
    if (type === PKT_INPUT) {
      const ack = dv.getUint32(1) - 1;
      if (ack > this.remoteAck) this.remoteAck = ack;
      const rf = dv.getUint32(5);
      if (rf >= this.remoteFrame) { this.remoteFrame = rf; this.lastRecvT = performance.now(); this.remoteAdv = dv.getInt8(9); }
      const start = dv.getUint32(10), n = dv.getUint8(14);
      for (let i = 0; i < n; i++) {
        const k = start + i;
        if (k <= this.lastConf || this.hasRemote(k)) continue;
        if (k - this.lastConf > BUF - 8) break;
        const inp = readInput(dv, 15 + i * 8);
        this.remoteIn[k % BUF] = inp; this.remoteSet[k % BUF] = k;
        if (k < this.f && !sameInput(this.used[k % BUF], inp)) {
          if (this.rollTo < 0 || k < this.rollTo) this.rollTo = k;
        }
      }
      while (this.hasRemote(this.lastConf + 1)) this.lastConf++;
    } else if (type === PKT_HASH) {
      const k = dv.getUint32(1), h = dv.getUint32(5);
      if (dv.byteLength < 10 || dv.getUint8(9) !== (this.epoch & 255)) return; // from before a resync
      this.theirHashes.set(k, h);
      this.compareHash(k);
    } else if (type === PKT_PING) {
      const out = new DataView(new ArrayBuffer(9));
      out.setUint8(0, PKT_PONG); out.setFloat64(1, dv.getFloat64(1));
      this.tx.sendFast(new Uint8Array(out.buffer));
    } else if (type === PKT_PONG) {
      const rtt = performance.now() - dv.getFloat64(1);
      this.rtt = this.rtt ? this.rtt * 0.8 + rtt * 0.2 : rtt;
    }
  }

  ping() {
    const dv = new DataView(new ArrayBuffer(9));
    dv.setUint8(0, PKT_PING); dv.setFloat64(1, performance.now());
    this.tx.sendFast(new Uint8Array(dv.buffer));
  }

  // Frames whose inputs are fully confirmed (and already replayed) are final: hash them.
  checkHashes() {
    const finalTop = Math.min(this.lastConf, this.f - 2);
    for (let k = this.lastHashed + 1; k <= finalTop; k++) {
      if (k % HASH_EVERY === 0) {
        const s = this.snaps[(k + 1) % BUF];
        if (!s || s.frame !== k + 1) continue;
        const h = hashState(s);
        this.myHashes.set(k, h);
        const dv = new DataView(new ArrayBuffer(10));
        dv.setUint8(0, PKT_HASH); dv.setUint32(1, k); dv.setUint32(5, h); dv.setUint8(9, this.epoch & 255);
        this.tx.sendFast(new Uint8Array(dv.buffer));
        this.compareHash(k);
      }
    }
    if (finalTop > this.lastHashed) this.lastHashed = finalTop;
    if (this.myHashes.size > 64) for (const k of this.myHashes.keys()) { if (k < this.lastHashed - 3000) this.myHashes.delete(k); else break; }
  }

  compareHash(k) {
    const a = this.myHashes.get(k), b = this.theirHashes.get(k);
    if (a === undefined || b === undefined) return;
    this.theirHashes.delete(k);
    if (a !== b && this.desync < 0) {
      this.desync = k;
      console.warn('DESYNC at frame', k, a, b, this.isHost ? '- sending resync' : '- requesting resync');
      if (this.isHost) this.sendResync();
      else this.requestResync();
    }
  }

  // ---- Desync recovery: the host ships its latest final state; the guest replays from it. ----

  requestResync() {
    const now = performance.now();
    if (now - this.lastResyncAt < 1000) return;
    this.lastResyncAt = now;
    if (this.tx.sendRel) this.tx.sendRel({ t: 'rs-req' });
  }

  sendResync() {
    const now = performance.now();
    if (now - this.lastResyncAt < 500 && !this.wantResync) return;
    // Newest snapshot whose inputs are all confirmed: identical on both peers if they were in sync.
    const K = Math.min(this.lastConf, this.f - 2) + 1;
    const s = this.snaps[K % BUF];
    if (!s || s.frame !== K) { this.wantResync = true; return; }
    this.wantResync = false;
    this.lastResyncAt = now;
    this.epoch++;
    this.theirHashes.clear();
    this.desync = -1;
    this.resyncs++;
    if (this.tx.sendRel) this.tx.sendRel({ t: 'rs', epoch: this.epoch, frame: K, state: JSON.stringify(s) });
  }

  applyResync(K, S, epoch) {
    if (this.f - K >= BUF - 4) { this.lastResyncAt = -1e9; this.requestResync(); return; } // too old to replay
    this.epoch = epoch;
    if (K <= this.f) {
      this.st = S;
      for (let k = K; k < this.f; k++) this.simFrame(k);
    } else {
      // The host is ahead of us: jump forward (inputs we never sampled count as idle).
      for (let k = this.f + this.delay; k < K + this.delay; k++) if (this.localSet[k % BUF] !== k) this.setLocal(k, EMPTY);
      this.st = S;
      this.f = K;
    }
    this.rollTo = -1;
    for (const k of [...this.myHashes.keys()]) if (k >= K - 1) this.myHashes.delete(k);
    this.theirHashes.clear();
    this.lastHashed = Math.min(this.lastHashed, K - 2);
    this.desync = -1;
    this.resyncs++;
  }

  // Reliable lobby-channel messages addressed to the session.
  handleRel(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'rs-req' && this.isHost) { this.lastResyncAt = -1e9; this.sendResync(); }
    else if (msg.t === 'rs' && !this.isHost && Number.isInteger(msg.frame) && typeof msg.state === 'string') {
      let S;
      try { S = JSON.parse(msg.state); } catch { return; }
      if (!S || S.frame !== msg.frame) return;
      this.applyResync(msg.frame, S, msg.epoch | 0);
    }
  }

  takeEvents() { const e = this.events; this.events = []; return e; }
  get state() { return this.st; }
  get silenceMs() { return performance.now() - this.lastRecv; }
  destroy() { clearInterval(this.pingTimer); this.tx.onFast = null; }
}

// Single-player session (vs CPU): no network, no rollback.
export class LocalSession {
  constructor({ state, localTeam }) {
    this.st = state; this.local = localTeam; this.events = [];
    this.rtt = 0; this.desync = -1; this.resyncs = 0; this.stalled = false; this.rollbacks = 0; this.rollFrames = 0; this.silenceMs = 0;
  }
  tick(sample) {
    const inp = sample();
    step(this.st, this.local === 0 ? [inp, EMPTY] : [EMPTY, inp]);
    for (const e of this.st.ev) this.events.push(e);
    return true;
  }
  takeEvents() { const e = this.events; this.events = []; return e; }
  get state() { return this.st; }
  handleRel() {}
  destroy() {}
}
