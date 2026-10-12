// Tiny 3x5 pixel font for crisp in-canvas text (yard numbers, end zones, labels).
const G = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', ' ': '000000000000000', '-': '000000111000000', '!': '010010010000010', '.': '000000000000010',
  "'": '010010000000000', '&': '010101010101011', '?': '110001010000010', ':': '000010000010000', '/': '001001010100100',
};

export function textWidth(s, scale = 1) { return s.length * 4 * scale - scale; }

export function drawText(ctx, s, x, y, color, scale = 1) {
  ctx.fillStyle = color;
  s = String(s).toUpperCase();
  for (let i = 0; i < s.length; i++) {
    const g = G[s[i]] || G[' '];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (g[r * 3 + c] === '1') ctx.fillRect(x + (i * 4 + c) * scale, y + r * scale, scale, scale);
    }
  }
}

// Vertical text (one letter per row), used for end zone names.
export function drawTextV(ctx, s, x, y, color, scale = 1, gap = 1) {
  s = String(s).toUpperCase();
  for (let i = 0; i < s.length; i++) drawText(ctx, s[i], x, y + i * (5 + gap) * scale, color, scale);
}
