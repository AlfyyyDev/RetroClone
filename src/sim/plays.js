// Playbook: formations, routes, offense + defense cards, and the matchup matrix.
// Coordinates are relative to the line of scrimmage (x, + = downfield) and field
// center (y, + = toward the bottom sideline on screen).

export const OFF_CATS = ['RUN', 'PASS', 'PA', 'OPTION'];
export const DEF_CATS = ['RUN_STOP', 'BLITZ', 'ZONE', 'MAN'];
export const CAT_NAME = {
  RUN: 'Run', PASS: 'Pass', PA: 'Play Action', OPTION: 'Option',
  RUN_STOP: 'Run Stop', BLITZ: 'Blitz', ZONE: 'Zone', MAN: 'Man',
};

// +1 = offense favored, -1 = defense favored. Every row and column has exactly one
// win, one loss and two even matchups, so no category is strictly dominant.
export const ADV = {
  RUN: { RUN_STOP: -1, BLITZ: 0, ZONE: 1, MAN: 0 },
  PASS: { RUN_STOP: 0, BLITZ: 0, ZONE: -1, MAN: 1 },
  PA: { RUN_STOP: 1, BLITZ: -1, ZONE: 0, MAN: 0 },
  OPTION: { RUN_STOP: 0, BLITZ: 1, ZONE: 0, MAN: -1 },
};

const OL = { OL1: [-0.6, -1.7], OL2: [-0.6, 0], OL3: [-0.6, 1.7] };
export const FORMS = {
  uc: { ...OL, QB: [-1.2, 0], RB: [-6, 0], WR1: [-0.6, -17], WR2: [-0.6, 17], TE: [-0.8, 3.6] },
  gun: { ...OL, QB: [-5, 0], RB: [-5, 2.2], WR1: [-0.6, -18], WR2: [-0.6, 18], TE: [-0.8, 3.6] },
  pistol: { ...OL, QB: [-4, 0], RB: [-7, 0], WR1: [-0.6, -17], WR2: [-0.6, 17], TE: [-0.8, 3.6] },
  trips: { ...OL, QB: [-5, 0], RB: [-5, -2.2], WR1: [-0.6, -18], WR2: [-0.6, 19], TE: [-1, 12] },
  heavy: { ...OL, QB: [-1.2, 0], RB: [-6.5, 0], WR1: [-0.6, -14], WR2: [-0.8, 6.5], TE: [-0.8, 3.6] },
};

// Route waypoints relative to the receiver's start; y + = toward that receiver's sideline.
// e: 'c' keeps running along the last leg, 's' settles at the last point.
export const ROUTES = {
  go: { p: [[30, 0]], e: 'c' },
  fade: { p: [[24, 2.5]], e: 'c' },
  post: { p: [[11, 0], [24, -9]], e: 'c' },
  corner: { p: [[11, 0], [20, 9]], e: 'c' },
  slant: { p: [[2, 0], [9, -7]], e: 'c' },
  out: { p: [[9, 0], [9, 7]], e: 'c' },
  deepout: { p: [[16, 0], [16, 8]], e: 'c' },
  in: { p: [[11, 0], [11, -12]], e: 'c' },
  curl: { p: [[12, 0], [10, -1.5]], e: 's' },
  hitch: { p: [[6, 0], [5, 0]], e: 's' },
  comeback: { p: [[15, 0], [12, 3]], e: 's' },
  seam: { p: [[25, -1]], e: 'c' },
  flat: { p: [[1.5, 4], [4, 10]], e: 'c' },
  drag: { p: [[3, -2], [5, -25]], e: 'c' },
  dragdeep: { p: [[6, -2], [8, -25]], e: 'c' },
  wheel: { p: [[0, 6], [5, 11], [25, 11]], e: 'c' },
  screen: { p: [[-2.5, 5], [-2, 8]], e: 's' },
  bubble: { p: [[-1.5, 2.5], [-0.5, 5]], e: 's' },
  swing: { p: [[-1.5, 4], [1, 9]], e: 'c' },
  sit: { p: [[5, -1]], e: 's' },
  stalk: { p: [[4, 0]], e: 's' }, // release then block the nearest defender
};

// qb.t: drop | hand | toss | draw | sneak | pa | read | speed | rpo | flea
// lane: RB run path, absolute (x from LOS, y from center).
export const OFF_CARDS = [
  // RUN
  { id: 'iz', name: 'Inside Zone', cat: 'RUN', rar: 0, form: 'uc', desc: 'Downhill between the tackles.',
    qb: { t: 'hand', at: 14 }, lane: [[-2, 0.8], [1.5, 1.6], [14, 2]], rec: { WR1: 'stalk', WR2: 'stalk', TE: 'block' } },
  { id: 'sweep', name: 'Power Sweep', cat: 'RUN', rar: 0, form: 'uc', desc: 'Toss wide, TE leads the way.',
    qb: { t: 'toss', at: 8 }, lane: [[-4.5, 6], [-1.5, 14], [4, 17.5], [16, 18]], rec: { WR1: 'stalk', WR2: 'stalk', TE: 'block' } },
  { id: 'counter', name: 'Counter Trey', cat: 'RUN', rar: 0, form: 'heavy', desc: 'Jab left, cut back right.',
    qb: { t: 'hand', at: 20 }, lane: [[-6.5, -2.5], [-2.2, 1.2], [2, 3.5], [14, 4]], rec: { WR1: 'stalk', WR2: 'stalk', TE: 'block' } },
  { id: 'stretch', name: 'Outside Zone', cat: 'RUN', rar: 0, form: 'pistol', desc: 'Stretch it to the edge.',
    qb: { t: 'hand', at: 14 }, lane: [[-4, -3.5], [0.5, -9], [12, -11]], rec: { WR1: 'stalk', WR2: 'stalk', TE: 'block' } },
  { id: 'draw', name: 'Draw', cat: 'RUN', rar: 0, form: 'gun', desc: 'Sell pass, hand off late.',
    qb: { t: 'draw', at: 36, d: 2.5 }, lane: [[-6.6, 1.3, 34], [1, 0.5], [14, 0]], rec: { WR1: 'go', WR2: 'go', TE: 'block' } },
  { id: 'sneak', name: 'QB Sneak', cat: 'RUN', rar: 1, form: 'uc', desc: 'Short yardage push. +STR',
    qb: { t: 'sneak' }, lane: [[-3, 0], [-1, 0]], rec: { WR1: 'stalk', WR2: 'stalk', TE: 'block', RB: 'block' } },
  // PASS
  { id: 'verts', name: 'Four Verts', cat: 'PASS', rar: 0, form: 'gun', desc: 'Everybody goes deep.',
    qb: { t: 'drop', d: 3 }, rec: { WR1: 'go', WR2: 'go', TE: 'seam', RB: 'swing' } },
  { id: 'slantflat', name: 'Slant-Flat', cat: 'PASS', rar: 0, form: 'gun', desc: 'Quick game. Beats pressure.',
    qb: { t: 'drop', d: 1.5 }, rec: { WR1: 'slant', WR2: 'slant', TE: 'flat', RB: 'block' } },
  { id: 'mesh', name: 'Mesh', cat: 'PASS', rar: 0, form: 'gun', desc: 'Crossers rub off man coverage.',
    qb: { t: 'drop', d: 2.5 }, rec: { WR1: 'drag', WR2: 'dragdeep', TE: 'corner', RB: 'flat' } },
  { id: 'curl', name: 'Curl-Flat', cat: 'PASS', rar: 0, form: 'gun', desc: 'Sit down in the soft spots.',
    qb: { t: 'drop', d: 3 }, rec: { WR1: 'curl', WR2: 'curl', TE: 'flat', RB: 'swing' } },
  { id: 'smash', name: 'Smash', cat: 'PASS', rar: 0, form: 'trips', desc: 'Hitch + corner high-low.',
    qb: { t: 'drop', d: 3 }, rec: { WR1: 'in', WR2: 'hitch', TE: 'corner', RB: 'block' } },
  { id: 'screen', name: 'RB Screen', cat: 'PASS', rar: 0, form: 'gun', desc: 'Let them rush, dump it off.',
    qb: { t: 'drop', d: 4 }, screen: 1, rec: { WR1: 'go', WR2: 'go', TE: 'block', RB: 'screen' } },
  { id: 'hail', name: 'Hail Mary', cat: 'PASS', rar: 2, form: 'gun', desc: 'Pray. +HANDS on deep balls.',
    qb: { t: 'drop', d: 5 }, bonus: { hnd: 12 }, rec: { WR1: 'go', WR2: 'go', TE: 'go', RB: 'block' } },
  // PLAY ACTION
  { id: 'paboot', name: 'PA Bootleg', cat: 'PA', rar: 0, form: 'uc', desc: 'Fake, roll out, hit the flat.',
    qb: { t: 'pa', fake: 26, d: 1, roll: 9 }, lane: [[-3, -1.5], [1, -3]], rec: { WR1: 'post', WR2: 'comeback', TE: 'flat' } },
  { id: 'pashot', name: 'PA Deep Shot', cat: 'PA', rar: 0, form: 'uc', desc: 'Freeze the safety, go deep.',
    qb: { t: 'pa', fake: 30, d: 4, roll: 0 }, lane: [[-3, 1.2], [0.5, 2]], rec: { WR1: 'post', WR2: 'go', TE: 'block' } },
  { id: 'pacross', name: 'PA Crossers', cat: 'PA', rar: 0, form: 'pistol', desc: 'Fake run, deep crossers.',
    qb: { t: 'pa', fake: 26, d: 3, roll: 0 }, lane: [[-3.5, 1.2], [0.5, 2]], rec: { WR1: 'in', WR2: 'dragdeep', TE: 'seam' } },
  { id: 'paseam', name: 'PA Seam', cat: 'PA', rar: 0, form: 'heavy', desc: 'TE up the seam behind LBs.',
    qb: { t: 'pa', fake: 24, d: 3, roll: 0 }, lane: [[-3, -1], [0.5, -2]], rec: { WR1: 'corner', WR2: 'out', TE: 'seam' } },
  { id: 'flea', name: 'Flea Flicker', cat: 'PA', rar: 2, form: 'uc', desc: 'Hand off, pitch back, bomb.',
    qb: { t: 'flea', at: 14, back: 44 }, lane: [[-3, 0.8], [-1, 1]], rec: { WR1: 'post', WR2: 'go', TE: 'block' } },
  // OPTION
  { id: 'zread', name: 'Zone Read', cat: 'OPTION', rar: 0, form: 'gun', desc: 'Press B to give, or keep it.',
    qb: { t: 'read', w0: 6, w1: 30 }, lane: [[-4.5, -1], [1, -2], [14, -2]], rec: { WR1: 'stalk', WR2: 'stalk', TE: 'block' } },
  { id: 'speedopt', name: 'Speed Option', cat: 'OPTION', rar: 0, form: 'pistol', desc: 'Run the edge, B to pitch.',
    qb: { t: 'speed', dir: 1 }, rec: { WR1: 'stalk', WR2: 'stalk', TE: 'block' } },
  { id: 'rpo', name: 'RPO Slant', cat: 'OPTION', rar: 0, form: 'gun', desc: 'B to hand off, or throw slant.',
    qb: { t: 'rpo', w0: 6, w1: 24 }, lane: [[-4.5, -1], [1, -2], [14, -2]], rec: { WR1: 'slant', WR2: 'slant', TE: 'block' } },
  { id: 'rpobub', name: 'RPO Bubble', cat: 'OPTION', rar: 0, form: 'trips', desc: 'B to give, or flip the bubble.',
    qb: { t: 'rpo', w0: 6, w1: 22 }, lane: [[-4.5, 1], [1, 1], [14, 1]], rec: { WR1: 'stalk', WR2: 'stalk', TE: 'bubble' } },
  { id: 'pitchl', name: 'Pitch Left', cat: 'OPTION', rar: 1, form: 'pistol', desc: 'Speed option to the weak side.',
    qb: { t: 'speed', dir: -1 }, rec: { WR1: 'stalk', WR2: 'stalk', TE: 'block' } },
];

// Defense assignments: man {m}, zone {x,y,r}, blitz {g}, spy, fit (run fit / hook drop).
// Alignment: [depth, lateral] where lateral can be a number or the receiver it lines up over.
export const DEF_CARDS = [
  // RUN STOP
  { id: 'stack', name: 'Goal Line Stack', cat: 'RUN_STOP', rar: 0, ctrl: 'LB1', desc: 'Load the box. Weak deep.',
    al: { LB1: [3, -2.5], LB2: [3, 2.5], CB1: [2, 'WR1'], CB2: [2, 'WR2'], S: [6, 0] },
    a: { LB1: { t: 'fit' }, LB2: { t: 'fit' }, CB1: { t: 'man', m: 'WR1' }, CB2: { t: 'man', m: 'WR2' }, S: { t: 'fit' } } },
  { id: 'runblitz', name: 'Run Blitz', cat: 'RUN_STOP', rar: 0, ctrl: 'LB2', desc: 'LB shoots the A gap.',
    al: { LB1: [3.5, -1.5], LB2: [4.5, 3], CB1: [5, 'WR1'], CB2: [5, 'WR2'], S: [13, 0] },
    a: { LB1: { t: 'blitz', g: -0.9 }, LB2: { t: 'fit' }, CB1: { t: 'man', m: 'WR1' }, CB2: { t: 'man', m: 'WR2' }, S: { t: 'zone', x: 15, y: 0, r: 14 } } },
  { id: 'bear', name: 'Bear Front', cat: 'RUN_STOP', rar: 0, ctrl: 'S', desc: 'Safety walks down to fill.',
    al: { LB1: [3.5, -4], LB2: [3.5, 4], CB1: [6, 'WR1'], CB2: [6, 'WR2'], S: [7, 1] },
    a: { LB1: { t: 'fit' }, LB2: { t: 'fit' }, CB1: { t: 'zone', x: 12, y: -16, r: 10 }, CB2: { t: 'zone', x: 12, y: 16, r: 10 }, S: { t: 'fit' } } },
  { id: 'edge', name: 'Edge Crash', cat: 'RUN_STOP', rar: 0, ctrl: 'LB1', desc: 'Ends crash, LBs scrape.',
    dl: 'contain', al: { LB1: [4, -3], LB2: [4, 3], CB1: [3, 'WR1'], CB2: [3, 'WR2'], S: [12, 0] },
    a: { LB1: { t: 'fit' }, LB2: { t: 'fit' }, CB1: { t: 'man', m: 'WR1' }, CB2: { t: 'man', m: 'WR2' }, S: { t: 'zone', x: 14, y: 0, r: 14 } } },
  // BLITZ
  { id: 'zero', name: 'Cover 0 Blitz', cat: 'BLITZ', rar: 0, ctrl: 'S', desc: 'Send everybody. No help deep.',
    al: { LB1: [3, -2], LB2: [3, 2], CB1: [2, 'WR1'], CB2: [2, 'WR2'], S: [6, -0.5] },
    a: { LB1: { t: 'blitz', g: -2.6 }, LB2: { t: 'blitz', g: 2.6 }, CB1: { t: 'man', m: 'WR1' }, CB2: { t: 'man', m: 'WR2' }, S: { t: 'blitz', g: 0.2 } } },
  { id: 'cfire', name: 'Corner Fire', cat: 'BLITZ', rar: 0, ctrl: 'LB1', desc: 'Corner off the edge.',
    al: { LB1: [4.5, -2.5], LB2: [4.5, 2.5], CB1: [6, 'WR1'], CB2: [4, 12], S: [12, 6] },
    a: { LB1: { t: 'man', m: 'TE' }, LB2: { t: 'man', m: 'RB' }, CB1: { t: 'man', m: 'WR1' }, CB2: { t: 'blitz', g: 5 }, S: { t: 'man', m: 'WR2' } } },
  { id: 'amug', name: 'A-Gap Mug', cat: 'BLITZ', rar: 0, ctrl: 'S', desc: 'Both LBs up the middle.',
    al: { LB1: [1.6, -0.9], LB2: [1.6, 0.9], CB1: [5, 'WR1'], CB2: [5, 'WR2'], S: [14, 0] },
    a: { LB1: { t: 'blitz', g: -0.9 }, LB2: { t: 'blitz', g: 0.9 }, CB1: { t: 'man', m: 'WR1' }, CB2: { t: 'man', m: 'WR2' }, S: { t: 'zone', x: 13, y: 0, r: 16 } } },
  { id: 'sblitz', name: 'Safety Blitz', cat: 'BLITZ', rar: 0, ctrl: 'LB1', desc: 'Delayed safety run-through.',
    al: { LB1: [5, -3], LB2: [5, 3], CB1: [6, 'WR1'], CB2: [6, 'WR2'], S: [8, 0] },
    a: { LB1: { t: 'zone', x: 7, y: -6, r: 7 }, LB2: { t: 'zone', x: 7, y: 6, r: 7 }, CB1: { t: 'man', m: 'WR1' }, CB2: { t: 'man', m: 'WR2' }, S: { t: 'blitz', g: 0, delay: 12 } } },
  // ZONE
  { id: 'c2', name: 'Cover 2', cat: 'ZONE', rar: 0, ctrl: 'S', desc: 'Two deep halves, squat corners.',
    al: { LB1: [5, -4], LB2: [11, 9], CB1: [4, 'WR1'], CB2: [4, 'WR2'], S: [13, -9] },
    a: { LB1: { t: 'zone', x: 7, y: -3, r: 8 }, LB2: { t: 'zone', x: 17, y: 11, r: 13 }, CB1: { t: 'zone', x: 4, y: -16, r: 7 }, CB2: { t: 'zone', x: 4, y: 16, r: 7 }, S: { t: 'zone', x: 17, y: -11, r: 13 } } },
  { id: 'c3', name: 'Cover 3', cat: 'ZONE', rar: 0, ctrl: 'S', desc: 'Three deep, four under.',
    al: { LB1: [4.5, -3.5], LB2: [4.5, 3.5], CB1: [7, 'WR1'], CB2: [7, 'WR2'], S: [13, 0] },
    a: { LB1: { t: 'zone', x: 7, y: -7, r: 7 }, LB2: { t: 'zone', x: 7, y: 7, r: 7 }, CB1: { t: 'zone', x: 15, y: -17, r: 10 }, CB2: { t: 'zone', x: 15, y: 17, r: 10 }, S: { t: 'zone', x: 18, y: 0, r: 11 } } },
  { id: 'zblitz', name: 'Zone Blitz', cat: 'ZONE', rar: 0, ctrl: 'LB2', desc: 'LB rushes, lineman drops.',
    zdl: 1, al: { LB1: [3.5, -2], LB2: [4.5, 3.5], CB1: [7, 'WR1'], CB2: [7, 'WR2'], S: [13, 0] },
    a: { LB1: { t: 'blitz', g: -2.4 }, LB2: { t: 'zone', x: 7, y: 6, r: 8 }, CB1: { t: 'zone', x: 15, y: -17, r: 10 }, CB2: { t: 'zone', x: 15, y: 17, r: 10 }, S: { t: 'zone', x: 18, y: 0, r: 11 } } },
  { id: 'tampa', name: 'Tampa 2', cat: 'ZONE', rar: 0, ctrl: 'LB1', desc: 'MLB runs the deep middle.',
    al: { LB1: [5, 0], LB2: [5, 6], CB1: [4, 'WR1'], CB2: [4, 'WR2'], S: [13, -9] },
    a: { LB1: { t: 'zone', x: 14, y: 0, r: 9 }, LB2: { t: 'zone', x: 17, y: 11, r: 12 }, CB1: { t: 'zone', x: 4, y: -16, r: 7 }, CB2: { t: 'zone', x: 4, y: 16, r: 7 }, S: { t: 'zone', x: 17, y: -11, r: 12 } } },
  { id: 'prevent', name: 'Prevent', cat: 'ZONE', rar: 1, ctrl: 'S', desc: 'Nothing deep. Gives underneath.',
    al: { LB1: [8, -5], LB2: [8, 5], CB1: [12, 'WR1'], CB2: [12, 'WR2'], S: [22, 0] },
    a: { LB1: { t: 'zone', x: 12, y: -8, r: 9 }, LB2: { t: 'zone', x: 12, y: 8, r: 9 }, CB1: { t: 'zone', x: 22, y: -15, r: 11 }, CB2: { t: 'zone', x: 22, y: 15, r: 11 }, S: { t: 'zone', x: 28, y: 0, r: 14 } } },
  // MAN
  { id: 'c1', name: 'Cover 1', cat: 'MAN', rar: 0, ctrl: 'S', desc: 'Man under, one deep safety.',
    al: { LB1: [4.5, 3], LB2: [4.5, -2], CB1: [5, 'WR1'], CB2: [5, 'WR2'], S: [14, 0] },
    a: { LB1: { t: 'man', m: 'TE' }, LB2: { t: 'man', m: 'RB' }, CB1: { t: 'man', m: 'WR1' }, CB2: { t: 'man', m: 'WR2' }, S: { t: 'zone', x: 17, y: 0, r: 15 } } },
  { id: 'press', name: 'Press Man', cat: 'MAN', rar: 0, ctrl: 'S', desc: 'Jam at the line. Risky deep.',
    press: 1, al: { LB1: [4.5, 3], LB2: [4.5, -2], CB1: [1.2, 'WR1'], CB2: [1.2, 'WR2'], S: [14, 0] },
    a: { LB1: { t: 'man', m: 'TE' }, LB2: { t: 'fit' }, CB1: { t: 'man', m: 'WR1' }, CB2: { t: 'man', m: 'WR2' }, S: { t: 'zone', x: 17, y: 0, r: 15 } } },
  { id: 'spy', name: 'QB Spy', cat: 'MAN', rar: 0, ctrl: 'LB2', desc: 'Shadow the QB. Kills options.',
    al: { LB1: [4.5, 3], LB2: [5.5, -1], CB1: [5, 'WR1'], CB2: [5, 'WR2'], S: [14, 0] },
    a: { LB1: { t: 'man', m: 'TE' }, LB2: { t: 'spy' }, CB1: { t: 'man', m: 'WR1' }, CB2: { t: 'man', m: 'WR2' }, S: { t: 'man', m: 'RB' } } },
  { id: 'robber', name: 'Robber', cat: 'MAN', rar: 0, ctrl: 'S', desc: 'Safety jumps the middle.',
    al: { LB1: [4.5, 3], LB2: [4.5, -2], CB1: [5, 'WR1'], CB2: [5, 'WR2'], S: [10, 0] },
    a: { LB1: { t: 'man', m: 'TE' }, LB2: { t: 'man', m: 'RB' }, CB1: { t: 'man', m: 'WR1' }, CB2: { t: 'man', m: 'WR2' }, S: { t: 'zone', x: 9, y: 0, r: 8 } } },
  { id: 'lock', name: 'Lockdown', cat: 'MAN', rar: 1, ctrl: 'CB1', desc: 'Elite man. +COV',
    bonus: { cov: 10 }, al: { LB1: [4.5, 3], LB2: [4.5, -2], CB1: [3, 'WR1'], CB2: [3, 'WR2'], S: [14, 0] },
    a: { LB1: { t: 'man', m: 'TE' }, LB2: { t: 'man', m: 'RB' }, CB1: { t: 'man', m: 'WR1' }, CB2: { t: 'man', m: 'WR2' }, S: { t: 'zone', x: 17, y: 0, r: 15 } } },
];

export const OFF_BY_ID = Object.fromEntries(OFF_CARDS.map((c, i) => [c.id, i]));
export const DEF_BY_ID = Object.fromEntries(DEF_CARDS.map((c, i) => [c.id, i]));
export const DEF_ALIGN_BASE = { DL1: [0.7, -2.6], DL2: [0.7, 0], DL3: [0.7, 2.6] };
