// Deterministic primitives shared by the whole simulation.
// Rule for everything under src/sim: only + - * / Math.sqrt/abs/floor/min/max/imul.
// No Math.random, no trig, no Date — both peers must compute bit-identical results.

export const FPS = 60;
export const DT = 1 / FPS;
export const FIELD_W = 160 / 3; // 53.33 yards sideline to sideline
export const MID = FIELD_W / 2;

// mulberry32, state kept on the sim state object so rollback restores it.
export function rand(st) {
  let t = (st.rng = (st.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randInt = (st, n) => Math.floor(rand(st) * n);
export const randRange = (st, a, b) => a + rand(st) * (b - a);
export const pick = (st, arr) => arr[randInt(st, arr.length)];
export function shuffle(st, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(st, i + 1);
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const len = (x, y) => Math.sqrt(x * x + y * y);
export const dist = (a, b) => len(a.x - b.x, a.y - b.y);
export const sign = (v) => (v < 0 ? -1 : 1);
// Triangle wave 0..1..0 with period 2 in u.
export function tri(u) {
  const m = u - 2 * Math.floor(u / 2);
  return m < 1 ? m : 2 - m;
}

// Fast structural clone for plain JSON-like data (much cheaper than structuredClone).
export function clone(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const n = v.length, out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = clone(v[i]);
    return out;
  }
  const out = {};
  for (const k in v) out[k] = clone(v[k]);
  return out;
}

// FNV-1a over the state's values; used to detect desyncs between peers.
const hf = new Float64Array(1);
const hu = new Uint32Array(hf.buffer);
export function hashState(v) {
  let h = 0x811c9dc5;
  const mix = (x) => { h = Math.imul(h ^ x, 0x01000193); };
  const walk = (o) => {
    if (o === null || o === undefined) { mix(7); return; }
    const t = typeof o;
    if (t === 'number') { hf[0] = o; mix(hu[0]); mix(hu[1]); return; }
    if (t === 'boolean') { mix(o ? 3 : 5); return; }
    if (t === 'string') { for (let i = 0; i < o.length; i++) mix(o.charCodeAt(i)); mix(11); return; }
    if (Array.isArray(o)) { mix(o.length); for (let i = 0; i < o.length; i++) walk(o[i]); return; }
    for (const k in o) { if (k === 'ev') continue; walk(k); walk(o[k]); }
  };
  walk(v);
  return h >>> 0;
}
