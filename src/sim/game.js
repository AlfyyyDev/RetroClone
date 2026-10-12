// Top-level deterministic game state machine. Both peers run step() with the same
// inputs each frame; everything that matters (draft, play calls, kicks, clock) lives here.
import { FPS, MID, FIELD_W, rand, randInt, clamp, clone, tri, shuffle } from './core.js';
import { makePool, makePlayer, SLOTS, SLOT_POS, PERKS, overall } from './data.js';
import { OFF_CARDS, DEF_CARDS, OFF_CATS, DEF_CATS } from './plays.js';
import { setupScrim, setupReturn, setupScene, stepPlay, BTN_A, BTN_B, BTN_AIM, I } from './live.js';

export const DRAFT_T = 9 * FPS;
export const CALL_T = 15 * FPS;
export const PAT_T = 8 * FPS;
export const HALF_T = 14 * FPS;
export const RESULT_T = 150;
export const MENU_PUNT = 7, MENU_FG = 8;

const mkStats = () => ({ py: 0, ry: 0, cmp: 0, att: 0, int: 0, sk: 0, fum: 0, td: 0 });

export function createGame(opts) {
  const st = {
    v: 1, frame: 0, rng: (opts.seed >>> 0) || 1, pid: 0, ph: 'DRAFT', t: 0,
    cfg: { qlen: opts.qlen || 180, cpu: opts.cpu ? opts.cpu.slice() : [false, false] },
    teams: opts.teams.map((t) => ({ name: t.name, abbr: t.abbr, c1: t.c1, c2: t.c2, score: 0, ro: {}, cool: {}, perks: [] })),
    draft: null, g: null, call: null, pl: null, kick: null, res: null, half: null, over: null, pat: null,
    prev: [0, 0], stats: [mkStats(), mkStats()], ev: [],
  };
  const first = randInt(st, 2);
  const order = [];
  for (let r = 0; r < SLOTS.length; r++) order.push(r % 2 === 0 ? first : 1 - first, r % 2 === 0 ? 1 - first : first);
  st.draft = { pool: makePool(st), taken: [], order, i: 0, last: -1 };
  st.draft.taken = st.draft.pool.map(() => -1);
  return st;
}

// ---------------------------------------------------------------------------
// Draft

export function openSlot(team, pos) {
  for (const s of SLOTS) if (SLOT_POS[s] === pos && !team.ro[s]) return s;
  return null;
}

const POS_W = { QB: 1.25, RB: 1.05, WR: 1.1, TE: 0.95, OL: 1.02, DL: 1.02, LB: 0.96, CB: 1.0, S: 0.95, K: 0.72 };
function autoPick(st, ti) {
  const d = st.draft, team = st.teams[ti];
  let best = -1, bs = -1e9;
  for (let i = 0; i < d.pool.length; i++) {
    if (d.taken[i] >= 0) continue;
    const p = d.pool[i];
    if (!openSlot(team, p.pos)) continue;
    const s = overall(p) * POS_W[p.pos] + rand(st) * 6;
    if (s > bs) { bs = s; best = i; }
  }
  return best;
}

function doPick(st, ti, idx) {
  const d = st.draft, team = st.teams[ti];
  if (idx < 0 || idx >= d.pool.length || d.taken[idx] >= 0) return false;
  const p = d.pool[idx];
  const slot = openSlot(team, p.pos);
  if (!slot) return false;
  d.taken[idx] = ti;
  team.ro[slot] = clone(p);
  d.last = idx;
  d.i++;
  st.t = 0;
  st.ev.push({ k: 'pick', team: ti });
  return true;
}

function stepDraft(st, inp, press) {
  const d = st.draft;
  if (d.i >= d.order.length) return;
  const ti = d.order[d.i];
  const cpu = st.cfg.cpu[ti];
  let done = false;
  if (!cpu && press[ti].menu > 0) done = doPick(st, ti, press[ti].menu - 1);
  if (!done && ((cpu && st.t >= 40 + (d.i % 3) * 12) || st.t >= DRAFT_T)) doPick(st, ti, autoPick(st, ti));
  if (d.i >= d.order.length) finishDraft(st);
}

function finishDraft(st) {
  for (const team of st.teams) {
    team.ro.LB2 = makePlayer(st, 'LB', 2, false);
    team.ro.CB2 = makePlayer(st, 'CB', 2, false);
  }
  const recv = randInt(st, 2);
  st.g = { q: 1, clock: st.cfg.qlen * 10, poss: recv, spot: 25, down: 1, togo: 10, recv1: recv, ot: false, tp: false };
  st.ph = 'DRAFT_DONE';
  st.t = 0;
}

// ---------------------------------------------------------------------------
// Play calling

const RAR_W = [1, 0.35, 0.16];
function weightedPick(st, list, wf) {
  let tot = 0;
  for (const x of list) tot += wf(x);
  let r = rand(st) * tot;
  for (const x of list) { r -= wf(x); if (r <= 0) return x; }
  return list[list.length - 1];
}

export function dealHand(st, ti, offense) {
  const team = st.teams[ti];
  const lib = offense ? OFF_CARDS : DEF_CARDS;
  const cats = offense ? OFF_CATS : DEF_CATS;
  const rm = team.perks.includes('tricks') ? 3 : 1;
  const wf = (i) => RAR_W[lib[i].rar] * (lib[i].rar ? rm : 1);
  const ok = (i) => !(team.cool[lib[i].id] > 0);
  const hand = [];
  // One guaranteed card per category, then two wildcards.
  for (const cat of cats) {
    let pool = [];
    for (let i = 0; i < lib.length; i++) if (lib[i].cat === cat && ok(i)) pool.push(i);
    if (!pool.length) for (let i = 0; i < lib.length; i++) if (lib[i].cat === cat) pool.push(i);
    hand.push(weightedPick(st, pool, wf));
  }
  for (let k = 0; k < 2; k++) {
    const pool = [];
    for (let i = 0; i < lib.length; i++) if (ok(i) && !hand.includes(i)) pool.push(i);
    if (pool.length) hand.push(weightedPick(st, pool, wf));
  }
  return hand;
}

export function fgDistance(spot) { return 100 - spot + 17; }
export function fgRange(k) { return 42 + (k.kpw - 40) * 0.33; }

function startCall(st) {
  const g = st.g, off = g.poss, def = 1 - off;
  for (const team of st.teams) for (const id in team.cool) if (team.cool[id] > 0) team.cool[id]--;
  const h = [null, null];
  h[off] = dealHand(st, off, true);
  h[def] = dealHand(st, def, false);
  st.call = { h, pk: [-1, -1], sp: 0, go: 0, cpuT: [40 + randInt(st, 70), 40 + randInt(st, 70)] };
  st.pl = null;
  st.ph = 'CALL';
  st.t = 0;
}

function cpuCall(st, ti) {
  const g = st.g, c = st.call, hand = c.h[ti];
  const off = ti === g.poss;
  if (off && g.down === 4 && !g.tp) {
    const behindLate = g.q >= 4 && g.clock < 900 && st.teams[ti].score < st.teams[1 - ti].score;
    const goFor = (g.togo <= 2 && g.spot >= 45) || (g.togo <= 1 && g.spot >= 30) || behindLate;
    if (!goFor) {
      const k = st.teams[ti].ro.K;
      if (fgDistance(g.spot) <= fgRange(k) - 2) return { sp: MENU_FG };
      if (g.spot < 62) return { sp: MENU_PUNT };
    }
  }
  const long = g.togo >= 8, short = g.togo <= 3;
  const W = off
    ? (long ? { PASS: 3, PA: 2, OPTION: 1, RUN: 0.8 } : short ? { RUN: 3, OPTION: 2, PA: 1.4, PASS: 1 } : { RUN: 2, PASS: 2, PA: 1.5, OPTION: 1.4 })
    : (long ? { ZONE: 3, MAN: 2, BLITZ: 1.4, RUN_STOP: 0.5 } : short ? { RUN_STOP: 3, BLITZ: 2, MAN: 1, ZONE: 1 } : { RUN_STOP: 1.5, BLITZ: 1.3, ZONE: 1.6, MAN: 1.6 });
  const lib = off ? OFF_CARDS : DEF_CARDS;
  const idx = weightedPick(st, [0, 1, 2, 3, 4, 5].slice(0, hand.length), (k) => W[lib[hand[k]].cat] || 1);
  return { pk: idx };
}

function applyCall(st, ti, ch) {
  const c = st.call;
  if (c.pk[ti] >= 0 || (ti === st.g.poss && c.sp)) return;
  if (ch.sp) {
    if (ti !== st.g.poss || st.g.down !== 4 || st.g.tp) return;
    c.sp = ch.sp;
  } else {
    if (ch.pk < 0 || ch.pk >= c.h[ti].length) return;
    c.pk[ti] = ch.pk;
  }
  st.ev.push({ k: 'select', team: ti });
}

function stepCall(st, inp, press) {
  const g = st.g, c = st.call, off = g.poss, def = 1 - off;
  for (const ti of [off, def]) {
    const done = c.pk[ti] >= 0 || (ti === off && c.sp);
    if (done) continue;
    if (st.cfg.cpu[ti]) { if (st.t >= c.cpuT[ti]) applyCall(st, ti, cpuCall(st, ti)); continue; }
    const m = press[ti].menu;
    if (m >= 1 && m <= 6) applyCall(st, ti, { pk: m - 1 });
    else if (m === MENU_PUNT || m === MENU_FG) applyCall(st, ti, { sp: m });
    if (st.t >= CALL_T && !(c.pk[ti] >= 0 || (ti === off && c.sp))) applyCall(st, ti, cpuCall(st, ti));
  }
  const offDone = c.pk[off] >= 0 || c.sp;
  // Special teams don't need the defense to pick.
  if (c.sp) {
    if (++c.go > 25) startKick(st, c.sp === MENU_PUNT ? 'PUNT' : 'FG', off, g.spot);
    return;
  }
  if (offDone && c.pk[def] >= 0 && ++c.go > 25) {
    const oc = c.h[off][c.pk[off]], dc = c.h[def][c.pk[def]];
    st.teams[off].cool[OFF_CARDS[oc].id] = 2;
    st.teams[def].cool[DEF_CARDS[dc].id] = 2;
    st.pl = setupScrim(st, off, def, g.spot, oc, dc);
    st.ph = 'PLAY';
    st.t = 0;
  }
}

// ---------------------------------------------------------------------------
// Kicking

function startKick(st, ty, team, spot) {
  const kx = ty === 'KO' ? spot : spot;
  st.kick = { ty, tm: team, sg: 0, t: 0, pw: 0, ac: -1, kx, good: false, fl: null, res: '' };
  st.pl = setupScene(st, team, 1 - team, kx, ty === 'PAT' ? 'FG' : ty);
  st.call = null;
  st.ph = 'KICK';
  st.t = 0;
}

export const powerAt = (t) => tri(t / 38);
export const needlePer = (kac) => 18 + (kac - 40) * 0.18;
export const needleAt = (t, kac) => tri(t / needlePer(kac)) * 2 - 1;

function cpuKickLock(st, k, K) {
  if (k.sg === 0) {
    let want = 0.93;
    if (k.ty === 'FG' || k.ty === 'PAT') want = clamp(fgDistance(st.g.spot) / (fgRange(K) * 1.06) + 0.06, 0.5, 0.97);
    return k.t > 30 && k.pw >= want - 0.03 && k.pw <= want + 0.05 && rand(st) < 0.5;
  }
  return k.t > 12 && Math.abs(k.ac) < 0.1 + rand(st) * 0.1 && rand(st) < 0.55;
}

function stepKick(st, inp, press) {
  const k = st.kick, K = st.teams[k.tm].ro.K;
  k.t++;
  const cpu = st.cfg.cpu[k.tm];
  if (k.sg < 2) {
    if (k.sg === 0) k.pw = powerAt(k.t); else k.ac = needleAt(k.t, K.kac);
    const lock = cpu ? cpuKickLock(st, k, K) : (press[k.tm].a || press[k.tm].menu === 1) && k.t > 6;
    if (lock || k.t > 330) {
      k.sg++; k.t = 0;
      st.ev.push({ k: 'lock' });
      if (k.sg === 2) launchKick(st, k, K);
    }
    return;
  }
  if (k.fl) {
    k.fl.f++;
    if (k.fl.f >= k.fl.F + 30) finishFG(st);
  }
}

function launchKick(st, k, K) {
  st.ev.push({ k: 'kick' });
  const recv = 1 - k.tm;
  if (k.ty === 'KO') {
    const d = 38 + k.pw * (20 + (K.kpw - 40) * 0.16) + (rand(st) - 0.5) * 3;
    const land = k.kx + d, ly = clamp(MID + k.ac * 13, 4, FIELD_W - 4);
    st.pl = setupReturn(st, k.tm, recv, k.kx, land, ly, Math.round(170 + k.pw * 40), false);
    st.kick = null;
    st.ph = 'PLAY'; st.t = 0;
    return;
  }
  if (k.ty === 'PUNT') {
    const d = 32 + k.pw * (14 + (K.kpw - 40) * 0.2) + (rand(st) - 0.5) * 4;
    const kx = k.kx - 12;
    const land = k.kx + d, ly = clamp(MID + k.ac * 11, 4, FIELD_W - 4);
    st.pl = setupReturn(st, k.tm, recv, kx, land, ly, Math.round(195 + k.pw * 40), true);
    st.kick = null;
    st.ph = 'PLAY'; st.t = 0;
    return;
  }
  // Field goal / PAT.
  st.pl.b.st = 'gone';
  const dist = fgDistance(st.g.spot);
  const reach = k.pw * fgRange(K) * 1.06;
  const win = Math.max(0.06, 0.2 + (K.kac - 40) * 0.0028 - dist * 0.0022);
  k.good = reach >= dist && Math.abs(k.ac) <= win;
  k.res = k.good ? 'good' : reach < dist ? 'short' : k.ac < 0 ? 'left' : 'right';
  const sx = k.kx - 7;
  const short = reach < dist;
  k.fl = { sx, sy: MID, tx: short ? sx + reach : 110, ty: MID + k.ac * (k.good ? 2.6 / win : 9) * (short ? 0.5 : 1), f: 0, F: Math.round(55 + dist * 0.9), pk: 9 + dist * 0.18 };
}

function finishFG(st) {
  const k = st.kick, g = st.g;
  const tm = k.tm;
  if (k.ty === 'PAT') {
    if (k.good) addScore(st, tm, 1);
    showResult(st, k.good ? 'EXTRA POINT GOOD' : 'EXTRA POINT NO GOOD', '', k.good ? 'good' : 'bad', { t: 'ko', team: tm });
  } else if (k.good) {
    addScore(st, tm, 3);
    showResult(st, "IT'S GOOD!", `${fgDistance(g.spot)} YARD FIELD GOAL`, 'good', { t: 'ko', team: tm });
  } else {
    const sp = Math.max(20, 100 - (g.spot - 7));
    setPoss(st, 1 - tm, sp);
    showResult(st, 'NO GOOD!', k.res === 'short' ? 'SHORT' : `WIDE ${k.res.toUpperCase()}`, 'bad', { t: 'call' });
  }
  st.kick = null;
}

// ---------------------------------------------------------------------------
// Results, clock and possession

function addScore(st, ti, pts) {
  st.teams[ti].score += pts;
  if (pts >= 6) st.stats[ti].td++;
  st.ev.push({ k: pts >= 6 ? 'crowd' : 'score', team: ti });
}

function setPoss(st, ti, spot) {
  const g = st.g;
  g.poss = ti;
  g.spot = clamp(spot, 1, 99);
  g.down = 1;
  g.togo = Math.min(10, 100 - g.spot);
}

function showResult(st, title, sub, tone, nx) {
  const pl = st.pl;
  st.res = {
    title, sub, tone, nx,
    oc: pl && pl.k === 'scrim' ? pl.oc : -1, dc: pl && pl.k === 'scrim' ? pl.dc : -1,
    adv: pl && pl.k === 'scrim' ? pl.adv : 0, off: pl ? pl.off : -1,
  };
  // In overtime the first score ends the game.
  if (st.g.ot && st.teams[0].score !== st.teams[1].score) st.res.nx = { t: 'over' };
  st.ph = 'RESULT';
  st.t = 0;
}

function yardText(n) {
  return n > 0 ? `GAIN OF ${n}` : n < 0 ? `LOSS OF ${-n}` : 'NO GAIN';
}

function playResult(st) {
  const pl = st.pl, g = st.g, o = pl.out;
  const off = pl.off, def = pl.def;
  const scoreTeam = (side) => (side === 0 ? off : def);
  g.clock -= Math.round(pl.t / 6);
  if (pl.k === 'ret') {
    const tag = pl.punt ? 'PUNT' : 'KICK';
    if (o.type === 'td') { addScore(st, def, 6); return showResult(st, 'RETURN TOUCHDOWN!', `${tag} RETURN`, 'big', { t: 'pat', team: def }); }
    if (o.type === 'tb') { setPoss(st, def, pl.punt ? 20 : 25); return showResult(st, 'TOUCHBACK', '', 'neutral', { t: 'call' }); }
    if (o.side === 0) { setPoss(st, off, o.x); return showResult(st, 'FUMBLE!', 'KICKING TEAM RECOVERS', 'bad', { t: 'call' }); }
    const ret = Math.round(pl.e[8].x >= 0 ? (Math.min(pl.b.tx, 100) - o.x) : 0);
    setPoss(st, def, 100 - o.x);
    return showResult(st, `${tag} RETURN`, ret > 0 ? `${ret} YARDS` : '', 'neutral', { t: 'call' });
  }

  const los = pl.los;
  const runoff = (o.type === 'tackle' && o.side === 0 && !pl.turn) ? 250 : 0;
  g.clock -= runoff;
  if (g.clock < 0) g.clock = 0;
  const yards = Math.round(o.x - los);
  if (o.side === 0 && !pl.turn && (o.type === 'tackle' || o.type === 'oob' || o.type === 'td' || o.type === 'safety')) {
    if (pl.comp) st.stats[off].py += yards; else st.stats[off].ry += yards;
  }
  if (pl.sack) st.stats[def].sk++;

  if (g.tp) {
    g.tp = false;
    if (o.type === 'td') {
      addScore(st, scoreTeam(o.side), 2);
      return showResult(st, o.side === 0 ? 'TWO POINTS!' : 'DEFENSIVE 2!', '', o.side === 0 ? 'good' : 'bad', { t: 'ko', team: off });
    }
    return showResult(st, 'NO GOOD', 'TWO-POINT TRY FAILS', 'bad', { t: 'ko', team: off });
  }

  switch (o.type) {
    case 'td': {
      const ti = scoreTeam(o.side);
      addScore(st, ti, 6);
      const title = o.side === 0 ? 'TOUCHDOWN!' : pl.comp || pl.turn ? 'PICK SIX!' : 'DEFENSIVE TD!';
      return showResult(st, title, o.side === 0 ? `${yards} YARD ${pl.comp ? 'PASS' : 'RUN'}` : '', 'big', { t: 'pat', team: ti });
    }
    case 'safety':
      addScore(st, def, 2);
      return showResult(st, 'SAFETY!', '', 'bad', { t: 'ko', team: off, kx: 20 });
    case 'tb':
      setPoss(st, def, 20);
      return showResult(st, pl.turn ? 'INTERCEPTED!' : 'TURNOVER', 'TOUCHBACK', 'bad', { t: 'call' });
    case 'inc': {
      g.down++;
      if (g.down > 4) { setPoss(st, def, 100 - g.spot); return showResult(st, 'TURNOVER ON DOWNS', '', 'bad', { t: 'call' }); }
      return showResult(st, 'INCOMPLETE', '', 'neutral', { t: 'call' });
    }
  }
  // Tackled / out of bounds.
  if (o.side === 1) {
    setPoss(st, def, 100 - o.x);
    if (o.fum) st.stats[off].fum++;
    return showResult(st, pl.turn ? 'INTERCEPTED!' : 'FUMBLE!', 'TURNOVER', 'bad', { t: 'call' });
  }
  if (pl.turn) { setPoss(st, off, o.x); return showResult(st, 'FUMBLE!', 'OFFENSE RECOVERS', 'good', { t: 'call' }); }
  const ns = clamp(o.x, 1, 99);
  const title = pl.sack ? 'SACKED!' : yardText(yards);
  if (ns >= g.spot + g.togo - 1e-9) {
    g.spot = ns; g.down = 1; g.togo = Math.min(10, 100 - ns);
    st.ev.push({ k: 'first' });
    return showResult(st, title, 'FIRST DOWN!', 'good', { t: 'call' });
  }
  g.togo -= ns - g.spot;
  g.spot = ns;
  g.down++;
  if (g.down > 4) { setPoss(st, def, 100 - ns); return showResult(st, 'TURNOVER ON DOWNS', title, 'bad', { t: 'call' }); }
  return showResult(st, title, '', yards > 0 ? 'neutral' : 'bad', { t: 'call' });
}

// Returns true if the quarter break redirected the flow (halftime, game over, OT kickoff).
function quarterBreak(st) {
  const g = st.g;
  if (g.clock > 0) return false;
  const tied = st.teams[0].score === st.teams[1].score;
  if (g.q === 2) { startHalf(st); return true; }
  if (g.q >= 4) {
    if (!tied) { startOver(st); return true; }
    g.q++; g.ot = true; g.clock = st.cfg.qlen * 10;
    const kicker = randInt(st, 2);
    startKick(st, 'KO', kicker, 35);
    return true;
  }
  g.q++; g.clock = st.cfg.qlen * 10;
  st.ev.push({ k: 'quarter' });
  return false;
}

function goNext(st) {
  const nx = st.res.nx;
  st.res = null;
  if (nx.t === 'over') return startOver(st);
  if (nx.t === 'pat') {
    st.pat = { team: nx.team, ch: 0, cpuT: 40 + randInt(st, 40) };
    st.pl = null;
    st.ph = 'PAT'; st.t = 0;
    return;
  }
  if (quarterBreak(st)) return;
  if (nx.t === 'ko') return startKick(st, 'KO', nx.team, nx.kx || 35);
  startCall(st);
}

function stepPat(st, inp, press) {
  const p = st.pat, ti = p.team;
  let ch = 0;
  if (st.cfg.cpu[ti]) {
    if (st.t >= p.cpuT) {
      const diff = st.teams[ti].score - st.teams[1 - ti].score;
      ch = (diff === -2 || diff === -5 || diff === 1) && st.g.q >= 4 ? 2 : 1;
    }
  } else if (press[ti].menu === 1 || press[ti].menu === 2) ch = press[ti].menu;
  if (!ch && st.t >= PAT_T) ch = 1;
  if (!ch) return;
  st.pat = null;
  if (ch === 1) { st.g.spot = 98; startKick(st, 'PAT', ti, 98); return; }
  st.g.tp = true;
  st.g.poss = ti; st.g.spot = 97; st.g.down = 1; st.g.togo = 3;
  startCall(st);
}

// ---------------------------------------------------------------------------
// Halftime perks and game over

function startHalf(st) {
  const offers = [0, 1].map((ti) => {
    const owned = st.teams[ti].perks;
    const pool = [];
    for (let i = 0; i < PERKS.length; i++) if (!owned.includes(PERKS[i].id)) pool.push(i);
    return shuffle(st, pool).slice(0, 3);
  });
  st.half = { offers, pk: [-1, -1], go: 0, cpuT: [60 + randInt(st, 60), 60 + randInt(st, 60)] };
  st.pl = null; st.call = null;
  st.ph = 'HALF'; st.t = 0;
}

function applyPerk(team, perk) {
  team.perks.push(perk.id);
  for (const slot in perk.fx) {
    const targets = slot === '*' ? Object.keys(team.ro) : [slot];
    for (const s of targets) {
      const p = team.ro[s];
      if (!p) continue;
      for (const k in perk.fx[slot]) p[k] = Math.min(99, p[k] + perk.fx[slot][k]);
    }
  }
}

function stepHalf(st, inp, press) {
  const h = st.half;
  for (const ti of [0, 1]) {
    if (h.pk[ti] >= 0) continue;
    let ch = -1;
    if (st.cfg.cpu[ti]) { if (st.t >= h.cpuT[ti]) ch = randInt(st, h.offers[ti].length); }
    else if (press[ti].menu >= 1 && press[ti].menu <= h.offers[ti].length) ch = press[ti].menu - 1;
    if (ch < 0 && st.t >= HALF_T) ch = 0;
    if (ch >= 0) {
      h.pk[ti] = ch;
      applyPerk(st.teams[ti], PERKS[h.offers[ti][ch]]);
      st.ev.push({ k: 'select', team: ti });
    }
  }
  if (h.pk[0] >= 0 && h.pk[1] >= 0 && ++h.go > 40) {
    const g = st.g;
    g.q = 3; g.clock = st.cfg.qlen * 10;
    st.half = null;
    startKick(st, 'KO', g.recv1, 35);
  }
}

function startOver(st) {
  st.over = { votes: [false, false] };
  st.pl = null; st.call = null; st.kick = null;
  st.ph = 'OVER'; st.t = 0;
  st.ev.push({ k: 'final' });
}

function stepOver(st, inp, press) {
  const o = st.over;
  for (const ti of [0, 1]) {
    if (st.cfg.cpu[ti] && st.t > 60) o.votes[ti] = true;
    if (!st.cfg.cpu[ti] && press[ti].menu === 1) o.votes[ti] = true;
  }
  if (o.votes[0] && o.votes[1]) {
    const frame = st.frame;
    const ng = createGame({
      seed: (st.rng ^ 0x9e3779b9) >>> 0, qlen: st.cfg.qlen, cpu: st.cfg.cpu,
      teams: st.teams.map((t) => ({ name: t.name, abbr: t.abbr, c1: t.c1, c2: t.c2 })),
    });
    for (const k of Object.keys(st)) delete st[k];
    Object.assign(st, ng);
    st.frame = frame;
  }
}

// ---------------------------------------------------------------------------

const NO_INPUT = { mx: 0, my: 0, btn: 0, menu: 0, ax: 0, ay: 0 };

// inputs[team] = { mx, my (-100..100), btn, menu, ax, ay (yards*10) }.
export function step(st, inputs) {
  st.frame++;
  st.t++;
  st.ev = [];
  const inp = [0, 1].map((i) => (st.cfg.cpu[i] ? NO_INPUT : inputs[i] || NO_INPUT));
  const press = inp.map((p, i) => {
    const prev = st.prev[i];
    return {
      a: !!(p.btn & BTN_A) && !(prev & BTN_A), b: !!(p.btn & BTN_B) && !(prev & BTN_B),
      rel: !(p.btn & BTN_AIM) && !!(prev & BTN_AIM), menu: p.menu, ax: p.ax / 10, ay: p.ay / 10,
    };
  });
  const dec = inp.map((p) => ({ mx: p.mx / 100, my: p.my / 100 }));

  switch (st.ph) {
    case 'DRAFT': stepDraft(st, inp, press); break;
    case 'DRAFT_DONE':
      if (st.t >= 270) startKick(st, 'KO', 1 - st.g.recv1, 35);
      break;
    case 'CALL': stepCall(st, inp, press); break;
    case 'KICK': stepKick(st, inp, press); break;
    case 'PLAY': {
      const pl = st.pl;
      // Map team inputs to field sides (side 0 = offense / kicking team).
      const sideInp = [dec[pl.off], dec[pl.def]];
      const sidePress = [press[pl.off], press[pl.def]];
      const sideCpu = [st.cfg.cpu[pl.off], st.cfg.cpu[pl.def]];
      stepPlay(st, pl, sideInp, sidePress, sideCpu);
      if (pl.ph === 'dead' && pl.deadT >= 50) playResult(st);
      break;
    }
    case 'RESULT':
      if (st.t >= RESULT_T) goNext(st);
      break;
    case 'PAT': stepPat(st, inp, press); break;
    case 'HALF': stepHalf(st, inp, press); break;
    case 'OVER': stepOver(st, inp, press); break;
  }
  st.prev[0] = inp[0].btn;
  st.prev[1] = inp[1].btn;
  return st;
}
