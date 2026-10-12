// Balance report: simulates every offense card vs every defense card with CPU control.
// Usage: node test/balance.mjs [playsPerMatchup]
import { createGame, step } from '../src/sim/game.js';
import { setupScrim, stepPlay } from '../src/sim/live.js';
import { OFF_CARDS, DEF_CARDS, OFF_CATS, DEF_CATS } from '../src/sim/plays.js';

const N = +process.argv[2] || 40;
const st = createGame({ seed: 99, qlen: 120, cpu: [true, true], teams: [{ name: 'A' }, { name: 'B' }] });
while (st.ph === 'DRAFT') step(st, [null, null]);

const cell = {};
const byOff = {}, byDef = {};
const add = (m, k, y, o) => {
  const c = (m[k] ||= { n: 0, y: 0, td: 0, to: 0, inc: 0, sack: 0, big: 0 });
  c.n++; c.y += y; if (o.type === 'td' && o.side === 0) c.td++; if (o.side === 1 || o.turn) c.to++;
  if (o.type === 'inc') c.inc++; if (o.sack) c.sack++; if (y >= 15) c.big++;
};
let frames = 0;
for (let oc = 0; oc < OFF_CARDS.length; oc++) {
  for (let dc = 0; dc < DEF_CARDS.length; dc++) {
    for (let k = 0; k < N; k++) {
      const pl = setupScrim(st, 0, 1, 35, oc, dc);
      while (pl.ph !== 'dead') { stepPlay(st, pl, [null, null], [{}, {}], [true, true]); frames++; }
      const o = pl.out;
      const y = o.type === 'inc' ? 0 : o.side === 1 ? -20 : Math.round(o.x - 35);
      const rec = { ...o, sack: pl.sack, turn: pl.turn };
      add(cell, OFF_CARDS[oc].cat + '|' + DEF_CARDS[dc].cat, y, rec);
      add(byOff, OFF_CARDS[oc].id, y, rec);
      add(byDef, DEF_CARDS[dc].id, y, rec);
    }
  }
}
const f = (c) => `${(c.y / c.n).toFixed(1).padStart(5)}y td${((100 * c.td) / c.n).toFixed(0).padStart(3)}% to${((100 * c.to) / c.n).toFixed(0).padStart(3)}% inc${((100 * c.inc) / c.n).toFixed(0).padStart(3)}% sk${((100 * c.sack) / c.n).toFixed(0).padStart(3)}% big${((100 * c.big) / c.n).toFixed(0).padStart(3)}%`;
console.log('Matchup grid (avg yards, turnover counted as -20):');
console.log('            ' + DEF_CATS.map((d) => d.padEnd(10)).join(''));
for (const o of OFF_CATS) console.log(o.padEnd(12) + DEF_CATS.map((d) => (cell[o + '|' + d].y / cell[o + '|' + d].n).toFixed(1).padEnd(10)).join(''));
console.log('\nOffense cards:');
for (const c of OFF_CARDS) console.log(c.id.padEnd(10), c.cat.padEnd(7), f(byOff[c.id]));
console.log('\nDefense cards (yards allowed):');
for (const c of DEF_CARDS) console.log(c.id.padEnd(10), c.cat.padEnd(9), f(byDef[c.id]));
console.log(`\n${frames} frames simulated`);
