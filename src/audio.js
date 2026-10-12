// Synthesized chiptune-style sound effects (no audio files).
let ac = null, master = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('rg-muted') === '1'; } catch {}

export function unlockAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = muted ? 0 : 0.35;
  master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('rg-muted', muted ? '1' : '0'); } catch {}
  if (master) master.gain.value = muted ? 0 : 0.35;
  return muted;
}
export const isMuted = () => muted;

function tone(type, f0, f1, dur, vol = 0.5, delay = 0) {
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.5, freq = 1000, q = 1, delay = 0, type = 'bandpass') {
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

function crowd(dur, vol) {
  const t = ac.currentTime;
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; s.loop = true;
  f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t); s.stop(t + dur + 0.05);
}

const SFX = {
  hike: () => { tone('square', 220, 160, 0.09, 0.35); tone('square', 230, 170, 0.09, 0.35, 0.16); },
  throw: () => noise(0.18, 0.35, 1800, 0.8, 0, 'highpass'),
  catch: () => { tone('square', 660, 660, 0.05, 0.3); tone('square', 990, 990, 0.07, 0.3, 0.05); },
  hand: () => tone('triangle', 300, 420, 0.06, 0.4),
  pitch: () => tone('triangle', 500, 700, 0.07, 0.35),
  tackle: () => { noise(0.12, 0.6, 300, 1); tone('sine', 120, 50, 0.12, 0.5); },
  bigtackle: () => { noise(0.2, 0.9, 250, 0.8); tone('sine', 140, 40, 0.2, 0.8); },
  broken: () => { noise(0.06, 0.4, 600, 2); tone('square', 300, 500, 0.08, 0.2); },
  juke: () => tone('square', 400, 800, 0.08, 0.2),
  dive: () => noise(0.15, 0.3, 700, 1),
  whistle: () => { tone('square', 2400, 2400, 0.08, 0.12); tone('square', 2600, 2600, 0.22, 0.12, 0.09); },
  inc: () => tone('square', 400, 200, 0.18, 0.25),
  drop: () => tone('square', 500, 220, 0.2, 0.25),
  pbu: () => { noise(0.07, 0.5, 900, 2); tone('square', 600, 300, 0.12, 0.2); },
  int: () => { tone('square', 300, 150, 0.15, 0.35); tone('square', 200, 100, 0.3, 0.35, 0.15); },
  fumble: () => { tone('square', 500, 120, 0.4, 0.3); },
  td: () => { [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.14, 0.3, i * 0.12)); crowd(2.2, 0.5); },
  crowd: () => crowd(1.6, 0.35),
  score: () => { [659, 880].forEach((f, i) => tone('square', f, f, 0.12, 0.3, i * 0.1)); crowd(1.2, 0.3); },
  first: () => { tone('square', 784, 784, 0.08, 0.25); tone('square', 1046, 1046, 0.1, 0.25, 0.08); },
  kick: () => { tone('sine', 160, 60, 0.15, 0.9); noise(0.06, 0.6, 400, 1); },
  lock: () => tone('square', 880, 880, 0.04, 0.2),
  pick: () => tone('triangle', 520, 780, 0.1, 0.35),
  select: () => tone('triangle', 600, 900, 0.07, 0.3),
  switch: () => tone('square', 700, 700, 0.03, 0.15),
  block: () => noise(0.05, 0.2, 200, 1),
  click: () => tone('square', 1000, 1000, 0.025, 0.15),
  final: () => { [784, 659, 523].forEach((f, i) => tone('square', f, f, 0.25, 0.3, i * 0.22)); },
  quarter: () => tone('square', 440, 440, 0.3, 0.2),
};

export function play(k) {
  if (!ac || muted) return;
  const fn = SFX[k];
  if (fn) try { fn(); } catch {}
}
