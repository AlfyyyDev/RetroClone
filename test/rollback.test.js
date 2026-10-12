import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/sim/game.js';
import { RollbackSession } from '../src/net/rollback.js';
import { clone, hashState } from '../src/sim/core.js';

const TEAMS = [
  { name: 'Home', abbr: 'HOM', c1: '#d62828', c2: '#ffffff' },
  { name: 'Away', abbr: 'AWY', c1: '#1d4ed8', c2: '#ffd23f' },
];

// Fake network: per-direction delay (in ticks), jitter and loss; unordered delivery.
function makeLink(rng, delay, jitter, loss) {
  const q = [];
  const ends = [{ onFast: null, onRel: null }, { onFast: null, onRel: null }];
  const rq = [];
  ends.forEach((end, i) => {
    end.sendFast = (u8) => { if (rng() < loss) return; q.push({ to: 1 - i, at: tick + delay + Math.floor(rng() * jitter), data: u8.slice().buffer }); };
    // Reliable + ordered, serialized like the real wire.
    end.sendRel = (obj) => rq.push({ to: 1 - i, at: tick + delay * 2 + 3, data: JSON.stringify(obj) });
  });
  let tick = 0;
  return {
    ends,
    pump() {
      tick++;
      for (let i = q.length - 1; i >= 0; i--) {
        if (q[i].at <= tick) { const m = q.splice(i, 1)[0]; const e = ends[m.to]; if (e.onFast) e.onFast(m.data); }
      }
      while (rq.length && rq[0].at <= tick) { const m = rq.shift(); const e = ends[m.to]; if (e.onRel) e.onRel(JSON.parse(m.data)); }
    },
  };
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function randomInput(rng, st) {
  const menu = rng() < 0.08 ? 1 + Math.floor(rng() * (st.ph === 'DRAFT' ? 42 : 8)) : 0;
  return {
    mx: Math.round((rng() * 2 - 1) * 100), my: Math.round((rng() * 2 - 1) * 100),
    btn: (rng() < 0.15 ? 1 : 0) | (rng() < 0.1 ? 2 : 0) | (rng() < 0.3 ? 4 : 0), menu,
    ax: Math.round(300 + rng() * 400), ay: Math.round(rng() * 530),
  };
}

for (const [delay, jitter, loss] of [[0, 1, 0], [5, 4, 0.1], [9, 8, 0.25]]) {
  test(`rollback peers stay in sync (delay ${delay}, jitter ${jitter}, loss ${loss})`, () => {
    const rng = mulberry(delay * 31 + 7);
    const link = makeLink(rng, delay, jitter, loss);
    const sA = new RollbackSession({ state: createGame({ seed: 99, teams: TEAMS }), localTeam: 0, transport: link.ends[0] });
    const sB = new RollbackSession({ state: createGame({ seed: 99, teams: TEAMS }), localTeam: 1, transport: link.ends[1] });
    const inA = mulberry(1), inB = mulberry(2);
    const TICKS = 9000;
    for (let t = 0; t < TICKS; t++) {
      sA.tick(() => randomInput(inA, sA.state));
      if (t % 7 !== 3) sB.tick(() => randomInput(inB, sB.state)); // B runs slightly slower
      link.pump();
    }
    sA.destroy(); sB.destroy();
    assert.equal(sA.desync, -1, 'A detected a desync');
    assert.equal(sB.desync, -1, 'B detected a desync');
    // Compare the final confirmed frame directly.
    const common = [...sA.myHashes.keys()].filter((k) => sB.myHashes.has(k));
    assert.ok(common.length > 20, `too few common hashes (${common.length})`);
    for (const k of common) assert.equal(sA.myHashes.get(k), sB.myHashes.get(k), `hash mismatch at ${k}`);
    console.log(`delay ${delay}: frames A=${sA.f} B=${sB.f} rollbacks A=${sA.rollbacks}/${sA.rollFrames}f B=${sB.rollbacks}/${sB.rollFrames}f, ${common.length} hashes matched, phase ${sA.state.ph}`);
  });
}

for (const who of ['guest', 'host']) {
  test(`desync on the ${who} is detected and repaired by a resync`, () => {
    const rng = mulberry(who === 'host' ? 11 : 12);
    const link = makeLink(rng, 4, 3, 0.05);
    const sA = new RollbackSession({ state: createGame({ seed: 3, teams: TEAMS }), localTeam: 0, transport: link.ends[0] });
    const sB = new RollbackSession({ state: createGame({ seed: 3, teams: TEAMS }), localTeam: 1, transport: link.ends[1] });
    link.ends[0].onRel = (m) => sA.handleRel(m);
    link.ends[1].onRel = (m) => sB.handleRel(m);
    const inA = mulberry(5), inB = mulberry(6);
    let detected = false;
    for (let t = 0; t < 9000; t++) {
      if (t === 3000) {
        // Simulate a nondeterminism bug: corrupt the live state and every snapshot so rollback can't hide it.
        const s = who === 'host' ? sA : sB;
        s.state.teams[1].score += 7;
        for (const snap of s.snaps) if (snap) snap.teams[1].score += 7;
      }
      sA.tick(() => randomInput(inA, sA.state));
      sB.tick(() => randomInput(inB, sB.state));
      link.pump();
      if (sA.desync >= 0 || sB.desync >= 0 || sA.resyncs || sB.resyncs) detected = true;
    }
    sA.destroy(); sB.destroy();
    assert.ok(detected, 'desync never detected');
    assert.ok(sA.resyncs >= 1 && sB.resyncs >= 1, `resyncs A=${sA.resyncs} B=${sB.resyncs}`);
    assert.equal(sA.desync, -1); assert.equal(sB.desync, -1);
    const late = [...sA.myHashes.keys()].filter((k) => k > 6000 && sB.myHashes.has(k));
    assert.ok(late.length > 10, `too few hashes after recovery (${late.length})`);
    for (const k of late) assert.equal(sA.myHashes.get(k), sB.myHashes.get(k), `still out of sync at ${k}`);
    assert.equal(sA.state.teams[1].score, sB.state.teams[1].score);
    console.log(`${who} corruption: resyncs A=${sA.resyncs} B=${sB.resyncs}, ${late.length} matching hashes after recovery`);
  });
}

test('per-frame cost (step + snapshot) stays tiny', () => {
  const st = createGame({ seed: 5, cpu: [true, true], teams: TEAMS });
  let n = 0;
  while (st.ph !== 'PLAY' || st.pl.ph !== 'live') { step(st, [null, null]); n++; }
  const t0 = performance.now();
  const N = 3000;
  let s = st;
  for (let i = 0; i < N; i++) { const snap = clone(s); step(s, [null, null]); if (i % 500 === 0) hashState(snap); }
  const us = ((performance.now() - t0) / N) * 1000;
  console.log(`step+clone: ${us.toFixed(1)} us/frame (a 14-frame rollback costs ~${((us * 14) / 1000).toFixed(2)} ms)`);
  assert.ok(us < 500);
});
