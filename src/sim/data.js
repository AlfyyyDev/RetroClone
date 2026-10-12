// Static game data: names, positions, traits, perks, colors.
import { rand, randInt, pick, clamp } from './core.js';

export const FIRST = [
  'Ace', 'Bo', 'Cal', 'Dax', 'Eli', 'Finn', 'Gus', 'Hank', 'Ike', 'Jax', 'Kip', 'Lou', 'Max', 'Ned', 'Otis',
  'Pete', 'Quin', 'Rex', 'Sam', 'Tad', 'Ugo', 'Vic', 'Walt', 'Xav', 'Yuri', 'Zeke', 'Buck', 'Cash', 'Dex',
  'Emmitt', 'Flash', 'Gio', 'Hal', 'Jojo', 'Kurt', 'Lenny', 'Moose', 'Nash', 'Ozzie', 'Ray', 'Sly', 'Troy',
];
export const LAST = [
  'Adams', 'Banks', 'Cole', 'Dunn', 'Eaton', 'Fox', 'Grant', 'Hayes', 'Irving', 'Jett', 'Knox', 'Lane',
  'Moss', 'Nash', 'Oakes', 'Price', 'Quick', 'Reed', 'Stone', 'Tate', 'Usher', 'Vance', 'Wolfe', 'Young',
  'Zane', 'Blaze', 'Cruz', 'Drake', 'Flint', 'Gold', 'Hart', 'Jones', 'Kane', 'Lock', 'Mack', 'North',
  'Payne', 'Rhodes', 'Steel', 'Truitt', 'Webb', 'Yates',
];

// Draft order of roster slots and which pool position fills each.
export const SLOTS = ['QB', 'RB', 'WR1', 'WR2', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];
export const SLOT_POS = { QB: 'QB', RB: 'RB', WR1: 'WR', WR2: 'WR', TE: 'TE', OL: 'OL', DL: 'DL', LB: 'LB', CB: 'CB', S: 'S', K: 'K' };
export const POS_LIST = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];
export const POS_NAME = {
  QB: 'Quarterback', RB: 'Running Back', WR: 'Wide Receiver', TE: 'Tight End', OL: 'Off. Line',
  DL: 'Def. Line', LB: 'Linebacker', CB: 'Cornerback', S: 'Safety', K: 'Kicker',
};
// Which ratings matter (shown on draft cards) per position.
export const POS_KEYS = {
  QB: ['arm', 'acc', 'spd'], RB: ['spd', 'str', 'hnd'], WR: ['spd', 'hnd', 'str'], TE: ['hnd', 'str', 'spd'],
  OL: ['str', 'spd'], DL: ['str', 'spd'], LB: ['tkl', 'spd', 'cov'], CB: ['cov', 'spd', 'hnd'],
  S: ['cov', 'tkl', 'spd'], K: ['kpw', 'kac'],
};
export const KEY_NAME = { spd: 'SPD', str: 'STR', hnd: 'HND', arm: 'ARM', acc: 'ACC', tkl: 'TKL', cov: 'COV', kpw: 'PWR', kac: 'AIM' };

export const TRAITS = {
  QB: [['Cannon', { arm: 8 }], ['Surgeon', { acc: 8 }], ['Scrambler', { spd: 9 }]],
  RB: [['Bruiser', { str: 9 }], ['Burner', { spd: 6 }], ['Jitterbug', { jk: 1 }]],
  WR: [['Deep Threat', { spd: 6 }], ['Glue Hands', { hnd: 9 }], ['Route Artist', { rte: 1 }]],
  TE: [['Mismatch', { spd: 6, hnd: 4 }], ['Road Grader', { str: 10 }]],
  OL: [['The Wall', { str: 8 }], ['Maulers', { str: 5, spd: 5 }]],
  DL: [['Pass Rushers', { str: 6, spd: 5 }], ['Run Stuffers', { str: 9 }]],
  LB: [['Thumper', { tkl: 9 }], ['Sideline 2 Sideline', { spd: 7 }]],
  CB: [['Shutdown', { cov: 8 }], ['Ballhawk', { hnd: 12 }]],
  S: [['Centerfielder', { cov: 7, spd: 3 }], ['Enforcer', { tkl: 8, ff: 1 }]],
  K: [['Big Leg', { kpw: 9 }], ['Ice Veins', { kac: 9 }]],
};

const PRIMARY = {
  QB: { arm: 1, acc: 1, spd: -0.35, str: -0.4 }, RB: { spd: 1, str: 0.85, hnd: 0.2 },
  WR: { spd: 1, hnd: 1, str: -0.4 }, TE: { hnd: 0.7, str: 0.9, spd: -0.2 }, OL: { str: 1, spd: -0.7 },
  DL: { str: 1, spd: -0.3 }, LB: { tkl: 1, spd: 0.6, cov: 0.4, str: 0.4 }, CB: { cov: 1, spd: 1, hnd: 0.3, tkl: -0.2 },
  S: { cov: 0.8, tkl: 0.8, spd: 0.6, hnd: 0.2 }, K: { kpw: 1, kac: 1 },
};
const RATINGS = ['spd', 'str', 'hnd', 'arm', 'acc', 'tkl', 'cov', 'kpw', 'kac'];

const NUM_RANGES = {
  QB: [1, 19], RB: [20, 49], WR: [1, 19], TE: [80, 89], OL: [60, 79], DL: [90, 99], LB: [40, 59],
  CB: [20, 39], S: [20, 49], K: [1, 19],
};

export function starsFor(p) {
  const keys = POS_KEYS[p.pos].slice(0, 2);
  const ovr = keys.reduce((s, k) => s + p[k], 0) / keys.length;
  return ovr >= 88 ? 5 : ovr >= 80 ? 4 : ovr >= 72 ? 3 : ovr >= 64 ? 2 : 1;
}
export function overall(p) {
  const keys = POS_KEYS[p.pos].slice(0, 2);
  return Math.round(keys.reduce((s, k) => s + p[k], 0) / keys.length);
}

export function makePlayer(st, pos, stars, withTrait) {
  const base = 47 + stars * 8.5;
  const w = PRIMARY[pos];
  const p = { id: 0, n: '', pos, num: 0, st: stars, tr: '', jk: 0, rte: 0, ff: 0 };
  for (const k of RATINGS) {
    const wt = w[k] ?? 0;
    const v = wt > 0 ? base + (rand(st) - 0.5) * 9 : 58 + wt * 18 + (rand(st) - 0.5) * 16 + stars * 2;
    p[k] = Math.round(clamp(v, 35, 99));
  }
  if (withTrait) {
    const [name, bonus] = pick(st, TRAITS[pos]);
    p.tr = name;
    for (const k in bonus) p[k] = k in p && RATINGS.includes(k) ? Math.min(99, p[k] + bonus[k]) : bonus[k];
  }
  p.st = starsFor(p);
  const [lo, hi] = NUM_RANGES[pos];
  p.num = lo + randInt(st, hi - lo + 1);
  p.n = pick(st, FIRST)[0] + '. ' + pick(st, LAST);
  p.id = st.pid = (st.pid || 0) + 1;
  return p;
}

// Pool counts per position for a 2-team draft (needed*2 + extras for real choices).
const POOL = { QB: 4, RB: 4, WR: 7, TE: 4, OL: 4, DL: 4, LB: 4, CB: 4, S: 4, K: 3 };
const STAR_WEIGHTS = [0, 0.06, 0.24, 0.36, 0.24, 0.10];

function rollStars(st) {
  let r = rand(st);
  for (let s = 1; s <= 5; s++) { r -= STAR_WEIGHTS[s]; if (r <= 0) return s; }
  return 3;
}

export function makePool(st) {
  const pool = [];
  for (const pos of POS_LIST) {
    const n = POOL[pos];
    for (let i = 0; i < n; i++) {
      // Guarantee one standout per position so the first picks feel meaningful.
      const stars = i === 0 ? 4 + randInt(st, 2) : rollStars(st);
      pool.push(makePlayer(st, pos, stars, stars >= 4 ? rand(st) < 0.85 : rand(st) < 0.3));
    }
  }
  return pool;
}

export const PERKS = [
  { id: 'air', name: 'Air Raid', desc: 'QB +7 ARM, +7 ACC', fx: { QB: { arm: 7, acc: 7 } } },
  { id: 'ground', name: 'Ground & Pound', desc: 'RB +6 SPD/STR, OL +5', fx: { RB: { spd: 6, str: 6 }, OL: { str: 5 } } },
  { id: 'glue', name: 'Glue Factory', desc: 'WR/TE +9 HANDS', fx: { WR1: { hnd: 9 }, WR2: { hnd: 9 }, TE: { hnd: 9 } } },
  { id: 'wall', name: 'Iron Wall', desc: 'Off. Line +10 STR', fx: { OL: { str: 10 } } },
  { id: 'sack', name: 'Sack Party', desc: 'Def. Line +10 STR', fx: { DL: { str: 10 } } },
  { id: 'nofly', name: 'No Fly Zone', desc: 'CB/S +7 COV, +5 HND', fx: { CB: { cov: 7, hnd: 5 }, S: { cov: 7, hnd: 5 } } },
  { id: 'hit', name: 'Hit Squad', desc: 'Defense +7 TKL', fx: { LB: { tkl: 7 }, CB: { tkl: 7 }, S: { tkl: 7 } } },
  { id: 'leg', name: 'Big Leg', desc: 'Kicker +10 PWR, +6 AIM', fx: { K: { kpw: 10, kac: 6 } } },
  { id: 'legs', name: 'Fresh Legs', desc: 'Everyone +4 SPD', fx: { '*': { spd: 4 } } },
  { id: 'tricks', name: 'Trick Bag', desc: 'Rare plays show up 3x as often', fx: {} },
];

export const COLORS = [
  ['#d62828', '#ffffff'], ['#1d4ed8', '#ffd23f'], ['#15803d', '#f5f5f5'], ['#f77f00', '#1b1b1b'],
  ['#7b2cbf', '#ffd23f'], ['#0f172a', '#e5e7eb'], ['#0891b2', '#0f172a'], ['#facc15', '#7c2d12'],
  ['#be185d', '#fde68a'], ['#64748b', '#0f172a'],
];
export const CITIES = ['Bay City', 'Iron Falls', 'Neon Coast', 'Pine Ridge', 'Rust Valley', 'Sun Harbor', 'Cobalt', 'Thunder Bay', 'Dust Flats', 'Glacier'];
export const MASCOTS = ['Comets', 'Bandits', 'Gators', 'Rams', 'Hornets', 'Knights', 'Mustangs', 'Pilots', 'Raptors', 'Vipers'];
