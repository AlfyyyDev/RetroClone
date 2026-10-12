// Prints a frame-by-frame trace of one play. Usage: node test/trace.mjs <offId> <defId> [seed]
import { createGame, step } from '../src/sim/game.js';
import { setupScrim, stepPlay } from '../src/sim/live.js';
import { OFF_BY_ID, DEF_BY_ID } from '../src/sim/plays.js';

const [oid = 'verts', did = 'c3', seed = '5'] = process.argv.slice(2);
const st = createGame({ seed: +seed, qlen: 120, cpu: [true, true], teams: [{ name: 'A' }, { name: 'B' }] });
while (st.ph === 'DRAFT') step(st, [null, null]);
const want = process.argv[5];
let pl;
for (let k = 0; k < 200; k++) { const s2 = JSON.parse(JSON.stringify(st)); const p2 = setupScrim(s2, 0, 1, 35, OFF_BY_ID[oid], DEF_BY_ID[did]); while (p2.ph !== 'dead') stepPlay(s2, p2, [null, null], [{}, {}], [true, true]); if (!want || p2.out.type === want) { break; } st.rng = (st.rng + 977) | 0; }
pl = setupScrim(st, 0, 1, 35, OFF_BY_ID[oid], DEF_BY_ID[did]);
const fmt = (p) => `${p.r}(${p.x.toFixed(1)},${p.y.toFixed(1)})${p.st ? 's' + p.st : ''}`;
let ev = [];
while (pl.ph !== 'dead') {
  st.ev = [];
  stepPlay(st, pl, [null, null], [{}, {}], [true, true]);
  if (st.ev.length) ev.push(`${pl.ph === 'pre' ? 'pre' : pl.t}:${st.ev.map((e) => e.k).join(',')}`);
  if (pl.ph === 'live' && pl.t % (+process.env.EVERY || 20) === 0) {
    console.log(`t=${pl.t} ball=${pl.b.st}(${pl.b.x.toFixed(1)},${pl.b.y.toFixed(1)}) car=${pl.car >= 0 ? pl.e[pl.car].r : '-'}`);
    console.log('  O: ' + pl.e.slice(0, 8).map(fmt).join(' '));
    console.log('  D: ' + pl.e.slice(8).map(fmt).join(' '));
  }
}
console.log('events', ev.join(' | '));
console.log('out', pl.out, 'comp', pl.comp, 'sack', pl.sack, 'tgt', pl.tgt >= 0 ? pl.e[pl.tgt].r : '-');
