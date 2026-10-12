// Procedurally generated pixel-art player sprites, cached per team color pair.
export const SW = 8, SH = 13;

// Legend: H helmet(c1) M facemask S skin J jersey(c1) 2 accent(c2) A arm(skin) P pants(c2) L sock(c1) B shoe
const BODY = [
  '..HHHH..',
  '.HHHHHH.',
  '.HHHHMM.',
  '.HHHSMM.',
  '..JJJJ..',
  '.JJJJJJ.',
  'AJJ22JJA',
  'AJJ22JJA',
  '.JJJJJJ.',
  '..PPPP..',
  '..PPPP..',
];
// Leg rows (2 rows) per animation frame.
const LEGS = [
  ['..L..L..', '..B..B..'],
  ['.L....L.', 'B......B'],
  ['..L..L..', '..B..B..'],
  ['...LL...', '...BB...'],
];
const DOWN = [ // lying on the ground, 13x6, facing right
  '.............',
  '...........HH',
  'BLPPJJJJJHHMM',
  'BLPPJ22JJHHMS',
  '....AA.AA....',
  '.............',
];

const SKINS = ['#f1c27d', '#c68642', '#8d5524', '#e0ac69', '#5c3a1e'];

function paint(ctx, rows, ox, oy, pal, mirror) {
  const w = rows[0].length;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < w; c++) {
      const ch = rows[r][c];
      const col = pal[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(ox + (mirror ? w - 1 - c : c), oy + r, 1, 1);
    }
  }
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const cache = new Map();

// Returns { canvas, frame(i, mirror, skin) -> [sx, sy], down(mirror, skin) -> [sx, sy, w, h] }.
export function teamSprites(c1, c2) {
  const key = c1 + c2;
  if (cache.has(key)) return cache.get(key);
  const cols = LEGS.length * 2;
  const cv = document.createElement('canvas');
  cv.width = cols * SW + 2 * 13;
  cv.height = SKINS.length * SH;
  const ctx = cv.getContext('2d');
  SKINS.forEach((skin, si) => {
    const pal = { H: c1, M: '#c9ccd1', S: skin, J: c1, 2: c2, A: skin, P: c2, L: shade(c1, 0.7), B: '#111' };
    for (let m = 0; m < 2; m++) {
      for (let f = 0; f < LEGS.length; f++) {
        const ox = (m * LEGS.length + f) * SW, oy = si * SH;
        paint(ctx, BODY.concat(LEGS[f]), ox, oy, pal, m === 1);
      }
      paint(ctx, DOWN, cols * SW + m * 13, si * SH + 4, pal, m === 1);
    }
  });
  const res = {
    canvas: cv,
    frame: (f, mirror, skin) => [((mirror ? 1 : 0) * LEGS.length + f) * SW, skin * SH],
    down: (mirror, skin) => [cols * SW + (mirror ? 13 : 0), skin * SH + 4, 13, 6],
  };
  cache.set(key, res);
  return res;
}

export const skinFor = (num, team) => (num * 7 + team * 3) % SKINS.length;
