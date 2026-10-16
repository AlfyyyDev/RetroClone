import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/sim/game.js';
import { clone, hashState } from '../src/sim/core.js';
import { setupScrim, stepPlay, I } from '../src/sim/live.js';
import { OFF_BY_ID, DEF_BY_ID } from '../src/sim/plays.js';

const TEAMS = [
  { name: 'Home', abbr: 'HOM', c1: '#d62828', c2: '#ffffff' },
  { name: 'Away', abbr: 'AWY', c1: '#1d4ed8', c2: '#ffd23f' },
];

function runCpuGame(seed, maxFrames = 60 * 60 * 40) {
  const st = createGame({ seed, qlen: 120, cpu: [true, true], teams: TEAMS });
  const phases = new Set();
  let f = 0;
  while (st.ph !== 'OVER' && f < maxFrames) {
    step(st, [null, null]); phases.add(st.ph); f++;
    if (st.g && !(Number.isInteger(st.g.spot) && Number.isInteger(st.g.togo))) throw new Error(`non-integer spot ${st.g.spot} / togo ${st.g.togo} in ${st.ph}`);
    if (st.g && st.g.clock < 0) throw new Error('negative clock');
  }
  return { st, f, phases };
}

test('CPU vs CPU game runs to completion', () => {
  for (const seed of [1, 42, 1337]) {
    const { st, f, phases } = runCpuGame(seed);
    assert.equal(st.ph, 'OVER', `seed ${seed} did not finish (phase ${st.ph} after ${f} frames)`);
    assert.notEqual(st.teams[0].score, st.teams[1].score);
    for (const p of ['DRAFT', 'CALL', 'PLAY', 'KICK', 'RESULT', 'HALF']) assert.ok(phases.has(p), `missing ${p}`);
    console.log(`seed ${seed}: ${st.teams[0].score}-${st.teams[1].score} in ${(f / 3600).toFixed(1)} min`, JSON.stringify(st.stats));
  }
});

test('simulation is deterministic and survives rollback (snapshot/restore)', () => {
  const a = createGame({ seed: 7, qlen: 120, cpu: [true, true], teams: TEAMS });
  const b = createGame({ seed: 7, qlen: 120, cpu: [true, true], teams: TEAMS });
  const snaps = [];
  for (let f = 0; f < 20000; f++) {
    step(a, [null, null]);
    if (f % 500 === 0) snaps.push([f, clone(a), hashState(a)]);
  }
  // b: replay with periodic restores from its own snapshots (like a rollback would).
  let bb = b;
  for (let f = 0; f < 20000; f++) {
    step(bb, [null, null]);
    if (f % 777 === 0 && f > 0) { const s = clone(bb); step(bb, [null, null]); bb = s; }
  }
  assert.equal(hashState(a), hashState(bb));
  // Restoring a snapshot and re-simulating reproduces the same future.
  const [f0, s0] = snaps[10];
  const r = clone(s0);
  for (let f = f0 + 1; f < 20000; f++) step(r, [null, null]);
  assert.equal(hashState(r), hashState(a));
});

test('after a human throw the QB keeps control; A takes over the receiver mid-air', () => {
  const st = createGame({ seed: 4, cpu: [true, true], teams: TEAMS });
  while (st.ph === 'DRAFT') step(st, [null, null]);
  const pl = setupScrim(st, 0, 1, 35, OFF_BY_ID.verts, DEF_BY_ID.c3);
  const idle = { mx: 0, my: 0 }, none = { a: false, b: false, rel: false, menu: 0 };
  while (pl.ph === 'pre' || pl.t < 30) stepPlay(st, pl, [idle, idle], [none, none], [false, true]);
  const wr = pl.e[I.WR1];
  stepPlay(st, pl, [idle, idle], [{ ...none, rel: true, ax: wr.x + 12, ay: wr.y }, none], [false, true]);
  assert.equal(pl.b.st, 'air');
  assert.equal(pl.ctrl[0], I.QB, 'control should stay on the QB after the throw');
  // Right after the throw he is still running his route; he bends toward the ball once he reads it.
  const before = pl.e[pl.b.to].vx;
  stepPlay(st, pl, [idle, idle], [none, none], [false, true]);
  assert.ok(before > 3, 'receiver should still be running his route');
  stepPlay(st, pl, [idle, idle], [{ ...none, a: true }, none], [false, true]);
  assert.equal(pl.ctrl[0], pl.b.to, 'pressing A should hand control to the intended receiver');
  // Hand control back to the AI and let the ball fly: the receiver should finish near the landing spot.
  pl.ctrl[0] = I.QB;
  const r = pl.e[pl.b.to];
  let near = 99;
  while (pl.b.st === 'air') { near = Math.hypot(r.x - pl.b.tx, r.y - pl.b.ty); stepPlay(st, pl, [idle, idle], [none, none], [false, true]); }
  assert.ok(near < 3, `receiver ended ${near.toFixed(1)} yds from the ball`);
});