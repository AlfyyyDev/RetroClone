// Kick return report: average return yards and outcomes. Usage: node test/returns.mjs [n]
import { createGame, step } from '../src/sim/game.js';
import { setupReturn, stepPlay } from '../src/sim/live.js';
import { MID } from '../src/sim/core.js';

const N = +process.argv[2] || 200;
const st = createGame({ seed: 21, qlen: 120, cpu: [true, true], teams: [{ name: 'A' }, { name: 'B' }] });
while (st.ph === 'DRAFT') step(st, [null, null]);

for (const [label, kickX, land, punt] of [['kickoff', 35, 95, false], ['punt', 28, 70, true]]) {
  let yards = 0, td = 0, tb = 0, n = 0, back = 0, long = 0;
  for (let k = 0; k < N; k++) {
    const ly = MID + ((k % 7) - 3) * 3;
    const kx = punt ? kickX - 12 : kickX;
    const pl = setupReturn(st, 0, 1, kx, land, ly, punt ? 215 : 190, punt);
    let catchT = -1, minBlkAhead = 0;
    while (pl.ph !== 'dead') {
      stepPlay(st, pl, [null, null], [{}, {}], [true, true]);
      if (catchT < 0 && pl.car === 8) catchT = pl.t;
      // How many receiving-team blockers drift back past the returner in the first second after the catch?
      if (catchT >= 0 && pl.t === catchT + 45) {
        const kr = pl.e[8];
        minBlkAhead = pl.e.slice(9).filter((b) => b.x > kr.x + 1).length;
      }
    }
    const o = pl.out;
    if (o.type === 'tb') { tb++; continue; }
    n++;
    const y = o.type === 'td' ? land : Math.round(land - o.x);
    if (o.type === 'td') td++;
    if (y >= 30) long++;
    yards += y;
    back += minBlkAhead;
  }
  console.log(`${label}: avg return ${(yards / n).toFixed(1)} yds, 30+ yd ${((100 * long) / n).toFixed(0)}%, TD ${((100 * td) / n).toFixed(1)}%, touchbacks ${tb}, blockers behind returner 0.75s after catch: ${(back / n).toFixed(1)}`);
}
