import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/sim/game.js';
import { clone, hashState } from '../src/sim/core.js';

const TEAMS = [
  { name: 'Home', abbr: 'HOM', c1: '#d62828', c2: '#ffffff' },
  { name: 'Away', abbr: 'AWY', c1: '#1d4ed8', c2: '#ffd23f' },
];

function runCpuGame(seed, maxFrames = 60 * 60 * 40) {
  const st = createGame({ seed, qlen: 120, cpu: [true, true], teams: TEAMS });
  const phases = new Set();
  let f = 0;
  while (st.ph !== 'OVER' && f < maxFrames) { step(st, [null, null]); phases.add(st.ph); f++; }
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
