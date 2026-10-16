// Live play engine: one scrimmage play or kick return, simulated deterministically.
// Field frame: side 0 always attacks +x (goal line at x=100), side 1 defends it and
// scores by carrying the ball back past x=0 (interception / kick returns).
import { DT, FIELD_W, MID, rand, clamp, len, dist, sign } from './core.js';
import { FORMS, ROUTES, OFF_CARDS, DEF_CARDS, ADV, DEF_ALIGN_BASE } from './plays.js';

export const PRE_FRAMES = 66;
export const BTN_A = 1, BTN_B = 2, BTN_AIM = 4;
// Fixed entity indices for scrimmage plays.
export const I = { QB: 0, RB: 1, WR1: 2, WR2: 3, TE: 4, OL1: 5, OL2: 6, OL3: 7, DL1: 8, DL2: 9, DL3: 10, LB1: 11, LB2: 12, CB1: 13, CB2: 14, S: 15 };
const OFF_ROLES = ['QB', 'RB', 'WR1', 'WR2', 'TE', 'OL1', 'OL2', 'OL3'];
const DEF_ROLES = ['DL1', 'DL2', 'DL3', 'LB1', 'LB2', 'CB1', 'CB2', 'S'];
const ELIG = { RB: 1, WR1: 1, WR2: 1, TE: 1 };
const ACCEL = 24;
const NO_THROW = { hand: 1, toss: 1, draw: 1, sneak: 1, read: 1, speed: 1 };

const spdOf = (r, big) => (5.7 + (r - 40) * 0.064) * (big ? 0.86 : 1);

function mkEnt(s, r, tm, p, x, y, big) {
  return {
    s, r, tm, num: p.num, x, y, vx: 0, vy: 0, dvx: 0, dvy: 0, fx: s === 0 ? 1 : -1,
    spd: spdOf(p.spd, big), sr: p.spd, str: p.str, hnd: p.hnd, tkl: p.tkl, cov: p.cov, arm: p.arm, acc: p.acc,
    jkB: p.jk | 0, rte: p.rte | 0, ff: p.ff | 0, pu: 0, drv: 0, key: 0, tg: -1,
    st: 0, stT: 0, eng: -1, ecd: 0, tcd: 0, jk: 0, jcd: 0, rcd: 0, slow: 0, jam: 0,
    a: null, rp: null, ri: 0, re: 's', ux: 1, uy: 0, pvx: 0, pvy: 0, rd: 10, blk: 0, sx: x, sy: y, anim: 0,
  };
}

function routePts(ent, name, los) {
  const R = ROUTES[name];
  const sd = ent.sy >= MID + 0.01 ? 1 : ent.sy <= MID - 0.01 ? -1 : 1;
  ent.rp = R.p.map(([dx, dy]) => [ent.sx + dx, clamp(ent.sy + dy * sd, 1.2, FIELD_W - 1.2)]);
  ent.re = R.e;
  ent.ri = 0;
}

function lanePts(ent, lane, los) {
  ent.rp = lane.map(([dx, dy, w]) => (w ? [los + dx, MID + dy, w] : [los + dx, MID + dy]));
  ent.re = 'c';
  ent.ri = 0;
}

function basePlay(k, off, def, los) {
  return {
    k, off, def, los, oc: -1, dc: -1, adv: 0, e: [], t: 0, ph: 'pre', car: -1, pm: false, pmT: 0,
    thrown: false, throwT: 0, handed: false, given: false, kept: false, tgt: -1, out: null, deadT: 0,
    ctrl: [0, 0], touch: [false, false], comp: false, fake: 0, qbt: '', sack: false, cpuScr: 0, turn: false, punt: 0, key: -1, keyT: 9999,
    b: { st: 'held', h: -1, x: los, y: MID, z: 0.4, sx: 0, sy: 0, tx: 0, ty: 0, f: 0, F: 1, pk: 0, to: -1 },
  };
}

export function setupScrim(st, offT, defT, los, oc, dc) {
  const O = st.teams[offT].ro, D = st.teams[defT].ro;
  const card = OFF_CARDS[oc], dcard = DEF_CARDS[dc];
  const F = FORMS[card.form];
  const pl = basePlay('scrim', offT, defT, los);
  pl.oc = oc; pl.dc = dc;
  pl.adv = ADV[card.cat][dcard.cat];
  pl.qbt = card.qb.t;
  const e = pl.e;
  const runLook = card.cat === 'RUN' || card.cat === 'OPTION';

  for (const r of OFF_ROLES) {
    const [fx, fy] = F[r];
    const isOL = r[0] === 'O';
    const ent = mkEnt(0, r, offT, isOL ? O.OL : O[r], los + fx, MID + fy, isOL);
    if (isOL) ent.num = 60 + ((O.OL.num - 60 + (r === 'OL1' ? 0 : r === 'OL2' ? 7 : 13)) % 20);
    e.push(ent);
  }
  for (const r of DEF_ROLES) {
    const isDL = r[0] === 'D';
    const src = isDL ? D.DL : r === 'LB1' ? D.LB : r === 'LB2' ? D.LB2 : r === 'CB1' ? D.CB : r === 'CB2' ? D.CB2 : D.S;
    let ax, ay;
    if (isDL) { [ax, ay] = DEF_ALIGN_BASE[r]; ay += MID; }
    else {
      const [depth, lat] = dcard.al[r];
      ax = depth;
      if (typeof lat === 'string') {
        const m = e[I[lat]];
        ay = m.y + (m.y > MID ? -0.9 : 0.9);
      } else ay = MID + lat;
    }
    const ent = mkEnt(1, r, defT, src, los + ax, clamp(ay, 1.5, FIELD_W - 1.5), isDL);
    if (isDL) ent.num = 90 + ((D.DL.num - 90 + (r === 'DL1' ? 0 : r === 'DL2' ? 3 : 7)) % 10);
    e.push(ent);
  }

  // Offensive assignments.
  const qb = e[I.QB];
  qb.a = { t: 'qb' };
  if (card.qb.t === 'sneak') qb.str = Math.min(99, qb.str + 18);
  for (const r of ['RB', 'WR1', 'WR2', 'TE']) {
    const ent = e[I[r]];
    let asg = card.rec[r];
    if (!asg) asg = r === 'RB' ? (card.lane ? 'run' : 'block') : 'block';
    if (r === 'RB' && card.qb.t === 'speed') asg = 'pitchman';
    ent.a = { t: asg };
    if (asg === 'run') lanePts(ent, card.lane, los);
    else if (ROUTES[asg]) routePts(ent, asg, los);
    if (card.bonus && card.bonus.hnd && r !== 'RB') ent.hnd = Math.min(99, ent.hnd + card.bonus.hnd);
  }
  for (const r of ['OL1', 'OL2', 'OL3']) e[I[r]].a = { t: runLook ? 'rblock' : 'pblock', scr: card.screen | 0 };

  // Defensive assignments with reaction delays (adv shifts who reads the play first).
  const advMul = pl.adv < 0 ? 0.6 : pl.adv > 0 ? 1.55 : 1;
  for (const r of DEF_ROLES) {
    const ent = e[I[r]];
    let asg;
    if (r[0] === 'D') {
      asg = { t: 'rush', c: dcard.dl === 'contain' && r !== 'DL2' ? (r === 'DL1' ? -1 : 1) : 0 };
      if (dcard.zdl && r === 'DL2') asg = { t: 'zone', x: 5, y: 0, r: 6 };
    } else asg = { ...dcard.a[r] };
    if (asg.t === 'man') asg.mi = I[asg.m];
    ent.a = asg;
    const base = { fit: 7, blitz: 2, man: 13, zone: 15, spy: 9, rush: 4 }[asg.t];
    ent.rd = Math.max(2, Math.round((base - (ent.cov - 40) * 0.09) * advMul));
    if (dcard.bonus && dcard.bonus.cov && r[0] !== 'D' && r[0] !== 'L') ent.cov = Math.min(99, ent.cov + dcard.bonus.cov);
    if (dcard.press && (r === 'CB1' || r === 'CB2')) {
      const m = e[I[asg.m || (r === 'CB1' ? 'WR1' : 'WR2')]];
      if (ent.cov + rand(st) * 30 > m.str + 15) m.jam = 14;
    }
  }
  // Option plays leave the play-side end unblocked as the read key: he crashes or contains.
  if (card.qb.t === 'read' || card.qb.t === 'rpo' || card.qb.t === 'speed') {
    // Zone read / RPO: the key is the backside end (the back runs away from him). Speed: play-side end.
    const side = card.qb.t === 'speed' ? card.qb.dir : -sign(card.lane[1][1] || 1);
    const k = e[side < 0 ? I.DL1 : I.DL3];
    k.key = 1;
    k.a = { t: 'key', crash: rand(st) < 0.5 ? 1 : 0 };
    pl.key = side < 0 ? I.DL1 : I.DL3;
  }
  pl.ctrl = [I.QB, I[dcard.ctrl] ?? I.S];
  pl.fake = card.qb.t === 'pa' ? card.qb.fake + (pl.adv > 0 ? 12 : pl.adv < 0 ? -8 : 4) : 0;
  pl.b.x = los; pl.b.y = MID;
  return pl;
}

// Kick return (kickoff or punt). Side 0 = kicking team, side 1 = receiving team.
export function setupReturn(st, kickT, recvT, kickX, landX, landY, flightF, isPunt) {
  const K = st.teams[kickT].ro, R = st.teams[recvT].ro;
  const pl = basePlay('ret', kickT, recvT, kickX);
  pl.ph = 'live';
  const e = pl.e;
  const cov = [K.LB, K.LB2, K.CB, K.CB2, K.S, K.TE, K.RB];
  const startX = isPunt ? kickX + 12 : kickX - 1;
  e.push(mkEnt(0, 'K', kickT, K.K, kickX - (isPunt ? 0 : 3), MID, false));
  for (let i = 0; i < 7; i++) {
    const ent = mkEnt(0, 'COV', kickT, cov[i], startX, 5 + i * ((FIELD_W - 10) / 6), false);
    ent.a = { t: 'cover', safe: i === 3 ? 1 : 0 }; // the middle man trails as a safety
    ent.rd = 0;
    e.push(ent);
  }
  // Returner: fastest of RB / WR1 / WR2.
  let ret = R.RB;
  for (const p of [R.WR1, R.WR2]) if (p.spd > ret.spd) ret = p;
  const rx = Math.min(landX, 108), ry = clamp(landY, 3, FIELD_W - 3);
  const rent = mkEnt(1, 'KR', recvT, ret, rx, ry, false);
  rent.a = { t: 'ret' };
  e.push(rent);
  const blk = [R.TE, R.LB, R.LB2, R.CB2, R.S, ret === R.WR1 ? R.WR2 : R.WR1, R.CB];
  for (let i = 0; i < 7; i++) {
    // Punts: the return team has already peeled back from the line to build a wall.
    const bx = isPunt ? kickX + 20 + (i % 2) * 5 : Math.min(landX, 100) - 16 - (i % 3) * 4;
    const ent = mkEnt(1, 'BLK', recvT, blk[i], bx, 6 + i * ((FIELD_W - 12) / 6), false);
    ent.a = { t: 'wall' };
    ent.blk = 1;
    e.push(ent);
  }
  const b = pl.b;
  b.st = 'kick'; b.sx = kickX; b.sy = MID; b.x = kickX; b.y = MID; b.tx = landX; b.ty = landY;
  b.f = 0; b.F = flightF; b.pk = isPunt ? 22 : 18; b.to = 8;
  pl.ctrl = [1, 8];
  pl.punt = isPunt ? 1 : 0;
  return pl;
}

// ---------------------------------------------------------------------------

const opp = (pl, s) => (s === 0 ? 1 : 0);
function nearestOf(pl, s, x, y, skip, filt) {
  let best = -1, bd = 1e9;
  const e = pl.e;
  for (let i = 0; i < e.length; i++) {
    const p = e[i];
    if (p.s !== s || i === skip || p.st === 2) continue;
    if (filt && !filt(p, i)) continue;
    const d = len(p.x - x, p.y - y);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function nearestDist(pl, s, p) {
  const n = nearestOf(pl, s, p.x, p.y, -1);
  return n >= 0 ? dist(pl.e[n], p) : 99;
}

function moveTo(p, tx, ty, frac, noArrive) {
  const dx = tx - p.x, dy = ty - p.y, d = len(dx, dy);
  const sp = p.spd * frac;
  if (d < 0.05) { p.dvx = 0; p.dvy = 0; return; }
  const f = d < 0.7 && !noArrive ? sp * (d / 0.7) : sp;
  p.dvx = (dx / d) * f; p.dvy = (dy / d) * f;
}

function holder(pl) {
  return pl.b.st === 'held' ? pl.b.h : -1;
}

function setDead(st, pl, type, side, x) {
  if (pl.ph === 'dead') return;
  pl.ph = 'dead';
  pl.deadT = 0;
  pl.out = { type, side, x };
  pl.b.st = 'dead';
  st.ev.push({ k: type === 'td' ? 'td' : type === 'inc' ? 'inc' : 'whistle', x: pl.b.x, y: pl.b.y, tm: side === 0 ? pl.off : pl.def });
}

function giveBall(st, pl, i, kind) {
  const b = pl.b;
  b.st = 'held'; b.h = i;
  pl.car = i;
  const p = pl.e[i];
  if (pl.ctrl[p.s] !== i) { pl.ctrl[p.s] = i; pl.touch[p.s] = false; }
  if (kind) st.ev.push({ k: kind, x: p.x, y: p.y });
}

function launch(pl, kind, sx, sy, tx, ty, F, pk, to) {
  const b = pl.b;
  b.st = kind; b.h = -1; b.sx = sx; b.sy = sy; b.x = sx; b.y = sy; b.tx = tx; b.ty = ty;
  b.f = 0; b.F = Math.max(1, F); b.pk = pk; b.to = to;
  pl.car = -1;
}

// Where a receiver will be when a ball thrown now arrives (few fixed-point iterations).
export function leadTarget(pl, qb, r, speed) {
  let tx = r.x, ty = r.y;
  for (let k = 0; k < 4; k++) {
    const d = len(tx - qb.x, ty - qb.y);
    const T = d / speed + 0.1 + d * 0.003;
    tx = r.x + r.vx * T; ty = r.y + r.vy * T;
  }
  return [tx, clamp(ty, 0.5, FIELD_W - 0.5)];
}

export const passSpeed = (qb) => 20 + (qb.arm - 40) * 0.2;

export function canThrow(pl) {
  const qb = pl.e[I.QB];
  return pl.k === 'scrim' && holder(pl) === I.QB && !pl.thrown && qb.x <= pl.los + 0.3 && !pl.kept && !NO_THROW[pl.qbt];
}

function throwBall(st, pl, tx, ty) {
  const qb = pl.e[I.QB];
  let dx = tx - qb.x, dy = ty - qb.y, d = len(dx, dy);
  if (d < 1.5) return;
  const maxD = 38 + (qb.arm - 40) * 0.42;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; tx = qb.x + dx; ty = qb.y + dy; d = maxD; }
  // Intended receiver: closest eligible to the aim point.
  let tgt = -1, td = 1e9;
  for (const r of ['WR1', 'WR2', 'TE', 'RB']) {
    const p = pl.e[I[r]];
    if (p.st === 2) continue;
    const dd = len(p.x - tx, p.y - ty);
    if (dd < td) { td = dd; tgt = I[r]; }
  }
  let pressure = false;
  for (let i = 8; i < 16; i++) if (pl.e[i].st !== 2 && dist(pl.e[i], qb) < 2.3) pressure = true;
  const moving = len(qb.vx, qb.vy) > 3;
  const err = d * (0.012 + (99 - qb.acc) * 0.0011) * (pressure ? 1.9 : 1) * (moving ? 1.35 : 1) + (pressure ? 0.5 : 0);
  const ex = (rand(st) + rand(st) - 1) * err, ey = (rand(st) + rand(st) - 1) * err;
  const speed = passSpeed(qb);
  const T = d / speed + 0.1 + d * 0.003;
  launch(pl, 'air', qb.x, qb.y, tx + ex, clamp(ty + ey, -1, FIELD_W + 1), Math.round(T * 60), Math.min(1.5 + d * 0.12, 9), tgt);
  pl.thrown = true;
  pl.throwT = pl.t;
  pl.tgt = tgt;
  st.stats[pl.off].att++;
  st.ev.push({ k: 'throw' });
}

function pitchTo(st, pl, from, to, frames) {
  const a = pl.e[from], r = pl.e[to];
  const tx = r.x + r.vx * frames * DT, ty = r.y + r.vy * frames * DT;
  launch(pl, 'pitch', a.x, a.y, tx, ty, frames, 1.2, to);
  pl.ctrl[a.s] = to; pl.touch[a.s] = false;
  st.ev.push({ k: 'pitch' });
}

function startPursuit(pl, back) {
  if (pl.pm) return;
  if (pl.key >= 0) pl.keyT = pl.t + 15;
  pl.pm = true;
  pl.pmT = pl.t - (back | 0);
}

// ---------------------------------------------------------------------------
// Scripted QB actions: handoffs, fakes, options. Runs every live frame.

function qbScript(st, pl, cpuOff, bPress) {
  const card = OFF_CARDS[pl.oc], q = card.qb, t = pl.t;
  const e = pl.e, qb = e[I.QB], rb = e[I.RB];
  const hasBall = holder(pl) === I.QB;
  if (!hasBall) {
    if (q.t === 'flea' && pl.car === I.RB && t === q.back && rb.x < pl.los + 1.5) pitchTo(st, pl, I.RB, I.QB, 16);
    return;
  }
  switch (q.t) {
    case 'hand': case 'draw': case 'flea':
      // Hand off once the back arrives at the mesh (forced shortly after).
      if (!pl.handed && t >= q.at && rb.st !== 2 && (dist(rb, qb) < 1.7 || t >= q.at + 30)) {
        giveBall(st, pl, I.RB, 'hand'); pl.handed = true; startPursuit(pl);
      }
      break;
    case 'toss':
      if (t === q.at) { pitchTo(st, pl, I.QB, I.RB, 14); pl.handed = true; startPursuit(pl); }
      break;
    case 'sneak':
      if (!pl.pm) startPursuit(pl);
      break;
    case 'read': case 'rpo': {
      if (pl.given || pl.kept) break;
      let give = bPress && t >= q.w0 - 4 && t <= q.w1;
      if (cpuOff && t === q.w0 + 14) {
        // Read the unblocked end: if he crashes the back, keep it; if he sits on the QB, give.
        const key = e[pl.key];
        give = rand(st) < 0.85 ? !key.a.crash : !!key.a.crash;
        if (!give) { pl.kept = true; readResult(pl, false); if (q.t === 'read') { keepRoute(pl, card); startPursuit(pl); } }
      }
      if (give && rb.st !== 2) { pl.given = true; readResult(pl, true); giveBall(st, pl, I.RB, 'hand'); pl.handed = true; startPursuit(pl); }
      else if (t > q.w1) { pl.kept = q.t === 'read'; pl.given = q.t === 'rpo'; if (q.t === 'read') { readResult(pl, false); keepRoute(pl, card); startPursuit(pl); } }
      break;
    }
    case 'speed': {
      if (!pl.pm) startPursuit(pl);
      if (pl.given) break;
      let p = bPress && t > 4;
      if (cpuOff && t > 10) {
        const key = e[pl.key];
        p = (key.a.crash && dist(key, qb) < 3.4) || (!key.a.crash && t > 40 && nearestDist(pl, 1, qb) < 2.4);
      }
      if (p && rb.st !== 2) { pl.given = true; readResult(pl, true); pitchTo(st, pl, I.QB, I.RB, 13); }
      break;
    }
  }
}

// Option read: the right call leaves the key defender out of position for a moment.
function readResult(pl, gave) {
  if (pl.key < 0) return;
  const k = pl.e[pl.key];
  const speed = pl.qbt === 'speed';
  const correct = speed ? gave === !!k.a.crash : gave === !k.a.crash;
  if (correct && k.st === 0) { k.st = 3; k.stT = speed ? 22 : 28; }
}

// QB keeps on a read: bend outside to where the crashing end came from.
function keepRoute(pl, card) {
  const qb = pl.e[I.QB], ks = -sign(card.lane[1][1] || 1);
  qb.a = { t: 'run' };
  lanePts(qb, [[qb.x - pl.los + 1.5, ks * 6], [3, ks * 10.5], [16, ks * 11.5]], pl.los);
}

function qbAI(st, pl, qb) {
  const card = OFF_CARDS[pl.oc], q = card.qb, t = pl.t;
  const sx = qb.sx;
  switch (q.t) {
    case 'drop': moveTo(qb, sx - q.d, MID, t < 30 ? 0.75 : 0.4); break;
    case 'pa':
      if (t < q.fake) moveTo(qb, sx - 0.8, MID + (pl.e[I.RB].sy > MID ? 0.6 : -0.6), 0.5);
      else moveTo(qb, sx - 1.2 - q.d, MID + q.roll, 0.7);
      break;
    case 'hand': case 'flea': case 'draw': {
      if (pl.handed) { moveTo(qb, sx - 3, MID, 0.4); break; }
      // Meet the back at the mesh point (first lane waypoint), slightly on our side of it.
      const rb = pl.e[I.RB];
      const mp = rb.rp && rb.rp[0];
      if (q.t === 'draw' && pl.t < 26) moveTo(qb, sx - q.d, MID, 0.55);
      else if (mp) moveTo(qb, Math.min(mp[0] - 0.4, sx), mp[1] - (mp[1] - MID) * 0.6, 0.6);
      break;
    }
    case 'toss': moveTo(qb, sx - 1.2, MID - 1, 0.4); break;
    case 'read': case 'rpo':
      if (!pl.kept) moveTo(qb, sx - 0.4, MID, 0.4);
      else { const side = -sign(card.lane[1][1] || 1); moveTo(qb, pl.los + 6, MID + side * 9, 1); }
      break;
    case 'speed': {
      // Sprint flat to the edge, then turn upfield.
      const wide = Math.abs(qb.y - MID) > 7;
      moveTo(qb, wide ? qb.x + 6 : pl.los + 1, MID + q.dir * 12, 1, true);
      break;
    }
    case 'sneak': moveTo(qb, qb.x + 5, MID, 1); break;
    default: moveTo(qb, sx - 2, MID, 0.4);
  }
}

// CPU quarterback: pick the most open receiver after the drop, or scramble under pressure.
function cpuQB(st, pl) {
  if (!canThrow(pl)) return;
  const e = pl.e, qb = e[I.QB], t = pl.t;
  const card = OFF_CARDS[pl.oc];
  const minT = card.qb.t === 'pa' ? card.qb.fake + 18 : 22 + (card.qb.d || 2) * 7;
  if (t < minT) return;
  let pressure = 99;
  for (let i = 8; i < 16; i++) if (e[i].st !== 2) pressure = Math.min(pressure, dist(e[i], qb));
  const speed = passSpeed(qb);
  let best = -1, bs = -1e9, bt = null;
  for (const r of ['WR1', 'WR2', 'TE', 'RB']) {
    const p = e[I[r]];
    if (p.st === 2 || (p.a.t === 'block') || (p.a.t === 'stalk')) continue;
    const [tx, ty] = leadTarget(pl, qb, p, speed);
    const d = len(tx - qb.x, ty - qb.y);
    if (d > 36 + (qb.arm - 40) * 0.4) continue;
    let near = 99;
    for (let i = 8; i < 16; i++) {
      const dd = len(e[i].x - tx, e[i].y - ty);
      if (dd < near) near = dd;
    }
    const sc = near + (tx - pl.los) * 0.06 + rand(st) * 0.6;
    if (sc > bs) { bs = sc; best = I[r]; bt = [tx, ty]; }
  }
  const late = t > minT + 70;
  if (best >= 0 && (bs > 3.2 || (pressure < 2.6 && bs > 1.2) || late)) throwBall(st, pl, bt[0], bt[1]);
  else if (pressure < 1.8 || t > minT + 110) pl.cpuScr = 1;
}

// ---------------------------------------------------------------------------
// Per-entity AI: writes desired velocity dvx/dvy.

function carrierAI(pl, i) {
  const p = pl.e[i];
  const dir = p.s === 0 ? 1 : -1;
  // Follow the designed lane first if there is one.
  if (p.rp && p.ri < p.rp.length && p.a && p.a.t === 'run') {
    const [tx, ty] = p.rp[p.ri];
    if (len(tx - p.x, ty - p.y) < 1.2 || (tx - p.x) * dir < -0.5) p.ri++;
    else { moveTo(p, tx, ty, 1); avoid(pl, p, 0.35); return; }
  }
  p.dvx = dir * p.spd; p.dvy = 0;
  avoid(pl, p, 1);
}

function avoid(pl, p, w) {
  let fx = p.dvx / (p.spd || 1), fy = p.dvy / (p.spd || 1);
  const dir = p.s === 0 ? 1 : -1;
  for (const o of pl.e) {
    if (o.s === p.s || o.st === 2) continue;
    const dx = p.x - o.x, dy = p.y - o.y, d = len(dx, dy);
    if (d > 7 || d < 0.01) continue;
    if (dx * dir > 2.5) continue; // already behind the carrier
    const k = (w * 4) / (d * d + 0.5);
    fy += (dy / d) * k * 1.4 + (dy === 0 ? 0.01 : 0);
    fx += (dx / d) * k * 0.35;
  }
  if (p.y < 3) fy += (3 - p.y) * 0.35;
  if (p.y > FIELD_W - 3) fy -= (p.y - FIELD_W + 3) * 0.35;
  fx = fx * dir < 0.25 ? 0.25 * dir : fx;
  const l = len(fx, fy) || 1;
  p.dvx = (fx / l) * p.spd; p.dvy = (fy / l) * p.spd;
}

function pursue(pl, p, c, frac) {
  const d = dist(p, c);
  // Lead the carrier from distance; close straight in when near.
  const tl = d < 2 ? 0 : clamp((d / p.spd) * 0.8, 0, 1.2);
  moveTo(p, c.x + c.vx * tl, c.y + c.vy * tl, frac || 1, true);
  p.pu = d < 3 ? 1 : 0;
}

// Blocker hunting the most dangerous free opponent near the carrier (or point).
function escort(pl, p, cx, cy, range) {
  p.drv = 1;
  let best = -1, bs = 1e9;
  const e = pl.e;
  const fwd = p.s === 0 ? 1 : -1; // direction the carrier is heading
  for (let i = 0; i < e.length; i++) {
    const o = e[i];
    if (o.s === p.s || o.st === 2 || o.eng >= 0 || i === pl.car) continue;
    if ((o.x - cx) * fwd < -2) continue; // already behind the play
    const dc = len(o.x - cx, o.y - cy);
    if (dc > range) continue;
    let s = dist(p, o) + dc * 0.6;
    // Spread out: avoid a defender a teammate is already going after.
    for (const q of e) if (q !== p && q.s === p.s && q.tg === i) { s += 6; break; }
    if (s < bs) { bs = s; best = i; }
  }
  p.blk = 1;
  p.tg = best;
  if (best < 0) {
    // Nobody to block yet: hold ground ahead of the carrier instead of drifting back to him.
    const ax = fwd > 0 ? Math.max(p.x, cx + 4) : Math.min(p.x, cx - 4);
    moveTo(p, ax, p.y + (cy - p.y) * 0.25, 0.5);
    return;
  }
  const o = e[best];
  const dx = cx - o.x, dy = cy - o.y, d = len(dx, dy) || 1;
  moveTo(p, o.x + (dx / d) * 0.8, o.y + (dy / d) * 0.8, 1);
}

function followRoute(p) {
  if (p.jam > 0) { p.jam--; p.dvx *= 0.3; p.dvy *= 0.3; moveTo(p, p.x + 0.3, p.y, 0.2); return false; }
  if (!p.rp) return true;
  if (p.ri < p.rp.length) {
    const [tx, ty] = p.rp[p.ri];
    const dx = tx - p.x, dy = ty - p.y, d = len(dx, dy);
    if (d < 0.6) {
      p.ri++;
      if (d > 0.01) { p.ux = dx / d; p.uy = dy / d; }
    } else {
      p.ux = dx / d; p.uy = dy / d;
      moveTo(p, tx, ty, 0.97);
      p.dvx = p.ux * p.spd * 0.97; p.dvy = p.uy * p.spd * 0.97;
      return false;
    }
  }
  if (p.re === 'c') {
    let uy = p.uy;
    if ((p.y < 2 && uy < 0) || (p.y > FIELD_W - 2 && uy > 0)) uy = 0;
    const l = len(p.ux, uy) || 1;
    p.dvx = (p.ux / l) * p.spd * 0.95; p.dvy = (uy / l) * p.spd * 0.95;
    if (p.x > 108) { p.dvx = 0; }
    return false;
  }
  return true; // settled
}

function zoneAI(pl, p, zx, zy, zr) {
  const e = pl.e;
  const deep = zx - pl.los >= 11;
  let thr = -1, ts = 1e9;
  for (const r of ['WR1', 'WR2', 'TE', 'RB']) {
    const o = e[I[r]];
    if (o.a.t === 'block' || o.st === 2) continue;
    const d = len(o.x - zx, o.y - zy);
    if (d > zr * 1.35) continue;
    const s = deep ? d - (o.x - pl.los) * 0.8 : d;
    if (s < ts) { ts = s; thr = I[r]; }
  }
  let tx = zx, ty = zy;
  if (thr >= 0) {
    const o = e[thr];
    tx = o.x + o.vx * 0.25 + (deep ? 2.2 : 0.6); ty = o.y + o.vy * 0.25 + (zy - o.y) * 0.2;
    const dx = tx - zx, dy = ty - zy, d = len(dx, dy);
    if (d > zr) { tx = zx + (dx / d) * zr; ty = zy + (dy / d) * zr; }
  }
  moveTo(p, tx, ty, 1);
}

function manAI(pl, p, m, advK) {
  const k = (0.09 + (p.cov - 40) * 0.0026) * advK * (m.rte ? 0.68 : 1);
  p.pvx += (m.vx - p.pvx) * k; p.pvy += (m.vy - p.pvy) * k;
  // Keep a cushion over the top while the receiver is driving downfield, shrinking it as he closes.
  const gap = p.x - m.x;
  const cush = m.vx > 1.5 ? 1.0 + 1.8 * clamp((gap - 1) / 4, 0, 1) : 0.5;
  const tx = m.x + p.pvx * 0.3 + cush;
  const ty = m.y + p.pvy * 0.3 + (m.y > MID ? -0.5 : 0.5);
  moveTo(p, tx, ty, 1);
}

function think(st, pl, i, cpu) {
  const e = pl.e, p = e[i], b = pl.b, t = pl.t;
  p.blk = 0;
  p.drv = 0;
  p.pu = 0;
  if (p.st === 2) { p.dvx = 0; p.dvy = 0; return; }
  const car = pl.car >= 0 ? e[pl.car] : null;
  const advK = pl.adv < 0 ? 1.35 : pl.adv > 0 ? 0.75 : 1;

  if (i === pl.car) {
    if (pl.k === 'scrim' && i === I.QB) {
      if (pl.cpuScr && canThrow(pl)) { p.dvx = p.spd; p.dvy = 0; avoid(pl, p, 1); return; }
      if (!pl.pm || (pl.qbt === 'speed' && !pl.given) || (pl.qbt === 'flea' && canThrow(pl))) { qbAI(st, pl, p); return; }
    }
    carrierAI(pl, i);
    if (cpu[p.s] && p.jcd === 0) {
      // CPU ball carriers juke when a tackler closes in.
      const n = nearestOf(pl, 1 - p.s, p.x, p.y, -1);
      if (n >= 0 && dist(e[n], p) < 1.5 && rand(st) < 0.045) { p.jk = p.jkB ? 24 : 18; p.jcd = p.jkB ? 55 : 75; }
    }
    return;
  }
  // Ball in flight: intended target goes to it, nearby defenders break on it.
  if (b.st === 'air' || b.st === 'pitch' || b.st === 'kick') {
    const rem = (b.F - b.f) * DT;
    if (i === b.to) {
      if (b.st !== 'air') { moveTo(p, b.tx, b.ty, 1); return; } // pitches and kicks: go get it
      // Passes: after a brief read the receiver bends toward the landing spot, pacing himself to
      // arrive with the ball (keeps momentum instead of waiting for the defender to close).
      if (b.f >= 9) {
        const d = len(b.tx - p.x, b.ty - p.y);
        const need = d / Math.max(rem, DT);
        moveTo(p, b.tx, b.ty, clamp((need * 1.1) / p.spd, 0.6, 1), d > 0.8);
        return;
      }
    }
    if (b.st === 'air' && p.s === 1 && t - pl.throwT >= p.rd * 0.6) {
      const d = len(b.tx - p.x, b.ty - p.y);
      if (d <= p.spd * rem + 2.5) { moveTo(p, b.tx, b.ty, 1); return; }
    }
    if (b.st === 'kick' && pl.k === 'ret') {
      // Coverage sprints in lanes; the kicker and one safety stay deep as the last line.
      if (p.s === 0) {
        if (p.r === 'K' || (p.a && p.a.safe)) moveTo(p, Math.min(b.tx, 100) - (p.r === 'K' ? 30 : 20), lerpY(p.sy, b.ty, 0.3), 0.8);
        else moveTo(p, b.tx - 4 + (p.sy - MID) * 0.02, lerpY(p.sy, b.ty, 0.45), 0.9);
      }
      else if (p.a.t === 'ret') moveTo(p, b.tx, b.ty, 1);
      else moveTo(p, Math.min(b.tx, 100) - (pl.punt ? 9 : 12), p.sy, pl.punt ? 1 : 0.6);
      return;
    }
  }

  // Pursuit / escort mode once someone is carrying the ball downfield.
  if (car && (pl.pm || pl.k === 'ret')) {
    if (p.s === car.s) {
      if (pl.k === 'scrim' && p.a.t === 'pblock' && !p.a.scr && t - pl.pmT < 30) { olAI(pl, p, i); return; }
      escort(pl, p, car.x, car.y, pl.k === 'ret' ? 35 : 12); return;
    }
    if (t >= pl.pmT + p.rd) { pursue(pl, p, car); return; }
  }
  if (pl.k === 'ret') { // pre-catch fallbacks
    if (p.s === 0) moveTo(p, p.x + 5, p.y, 0.8); else moveTo(p, p.x, p.y, 0.2);
    return;
  }

  // Assignment behaviors (play still developing).
  const a = p.a;
  if (p.s === 0) {
    switch (a.t) {
      case 'qb': moveTo(p, p.x, p.y, 0); return;
      case 'run': if (p.ri < p.rp.length || pl.qbt !== 'pa' || t < pl.fake) {
        const w = p.ri < p.rp.length ? p.rp[p.ri][2] : 0;
        if (w && t < w) { moveTo(p, p.rp[p.ri][0], p.rp[p.ri][1], 0.5); return; }
        followRoute(p); return;
      }
        passPro(pl, p); return;
      case 'pitchman': { const qb = e[I.QB], dir = OFF_CARDS[pl.oc].qb.dir; moveTo(p, qb.x - 2, qb.y + dir * 4.5, 1, true); return; }
      case 'block': if (OFF_CARDS[pl.oc].cat === 'RUN' || OFF_CARDS[pl.oc].cat === 'OPTION') { p.a.t = 'rblock'; olAI(pl, p, i); } else passPro(pl, p); return;
      case 'pblock': case 'rblock': olAI(pl, p, i); return;
      case 'stalk': if (followRoute(p)) escort(pl, p, p.x + 3, p.y, 7); return;
      default: followRoute(p); return;
    }
  }
  // Defense.
  const hold = holder(pl);
  const h = hold >= 0 ? e[hold] : e[I.QB];
  const fooled = pl.fake > 0 && t < pl.fake;
  switch (a.t) {
    case 'rush': rushAI(pl, p, h, a.c); return;
    case 'key': {
      // Crash: attack the mesh/back (read) or the QB (speed). Contain: sit on the QB (read) or widen on the pitch (speed).
      const rb = e[I.RB], qb = e[I.QB];
      const speed = pl.qbt === 'speed';
      const tgt = speed ? (a.crash ? qb : rb) : (a.crash ? rb : qb);
      moveTo(p, tgt.x + (speed && !a.crash ? 1.5 : 0), tgt.y, a.crash ? 1 : 0.85);
      return;
    }
    case 'blitz':
      if (t < (a.delay | 0)) { moveTo(p, p.x, p.y, 0); return; }
      if (p.x > pl.los + 0.4) moveTo(p, pl.los + 0.1, MID + a.g, 1);
      else moveTo(p, h.x, h.y, 1);
      return;
    case 'man': {
      if (fooled && a.m === 'RB') { moveTo(p, e[I.RB].x + 1.5, e[I.RB].y, 0.9); return; }
      const m = e[a.mi];
      if (m.a.t === 'block' || (m.a.t === 'stalk' && m.ri >= 1)) { zoneAI(pl, p, pl.los + 5, m.sy, 6); return; }
      manAI(pl, p, m, advK); return;
    }
    case 'zone': {
      if (fooled && a.x <= 12) { moveTo(p, e[I.RB].x + 2.5, e[I.RB].y, 0.75); return; }
      zoneAI(pl, p, pl.los + a.x, MID + a.y, a.r); return;
    }
    case 'fit':
      if (fooled) { moveTo(p, e[I.RB].x + 2, e[I.RB].y, 0.85); return; }
      if (t < p.rd) { moveTo(p, p.x, lerpY(p.y, h.y, 0.15), 0.4); return; }
      zoneAI(pl, p, pl.los + 6, clamp(p.sy, MID - 7, MID + 7), 6); return;
    case 'spy': { const qb = e[I.QB]; moveTo(p, Math.max(pl.los + 3.5, qb.x + 4.5), qb.y, 1); return; }
  }
}

const lerpY = (a, b, k) => a + (b - a) * k;

function rushAI(pl, p, h, contain) {
  const d = dist(p, h);
  if (contain && d > 2.5) { moveTo(p, h.x + 1, h.y + contain * 4.5, 1); return; }
  if (d > 3) moveTo(p, h.x, h.y + (p.sy - MID) * 0.35, 1);
  else moveTo(p, h.x, h.y, 1);
}

function passPro(pl, p) {
  const qb = pl.e[I.QB];
  p.blk = 1;
  const r = nearestOf(pl, 1, qb.x, qb.y, -1, (o) => o.eng < 0);
  if (r >= 0 && dist(pl.e[r], qb) < 7) {
    const o = pl.e[r];
    const dx = qb.x - o.x, dy = qb.y - o.y, d = len(dx, dy) || 1;
    moveTo(p, o.x + (dx / d) * 0.9, o.y + (dy / d) * 0.9, 1);
  } else moveTo(p, qb.x + 1.6, qb.y + (p.sy >= MID ? 1.8 : -1.8), 0.7);
}

function olAI(pl, p, i) {
  const e = pl.e, t = pl.t, a = p.a;
  p.blk = 1;
  if (a.scr && t > 42) { const rb = e[I.RB]; escort(pl, p, rb.x + 2, rb.y, 9); return; }
  if (a.t === 'rblock') {
    p.drv = 1;
    const o = nearestOf(pl, 1, p.x + 1.5, p.y, -1, (o) => o.eng < 0 && o.x > p.x - 1 && !(o.key && pl.t < pl.keyT));
    if (o >= 0 && dist(e[o], p) < 4.5) { moveTo(p, e[o].x - 0.4, e[o].y, 1); return; }
    moveTo(p, pl.los + 2.5, p.sy, 0.7); return;
  }
  const qb = e[I.QB];
  const hx = pl.los - 1.2 - Math.min(t / 30, 1) * 0.9;
  const o = nearestOf(pl, 1, p.x, p.y, -1, (o) => o.eng < 0);
  if (o >= 0 && dist(e[o], p) < 3.2) {
    const r = e[o];
    const dx = qb.x - r.x, dy = qb.y - r.y, d = len(dx, dy) || 1;
    moveTo(p, r.x + (dx / d) * 0.9, r.y + (dy / d) * 0.9, 1);
  } else moveTo(p, hx, p.sy, 0.6);
}

// ---------------------------------------------------------------------------

function humanControl(st, pl, s, inp, pressA, pressB) {
  const e = pl.e;
  const ci = pl.ctrl[s];
  const p = e[ci];
  if (!p) return;
  const mx = inp.mx, my = inp.my, mag = len(mx, my);
  if (mag > 0.2) pl.touch[s] = true;
  if (pl.touch[s] && p.st !== 1) {
    const m = mag > 1 ? 1 / mag : 1;
    p.dvx = mx * m * p.spd; p.dvy = my * m * p.spd;
    if (pl.k === 'scrim' && ci === I.QB && !pl.pm && p.x + p.dvx * DT > pl.los + 0.3 && holder(pl) === I.QB && pl.qbt !== 'sneak') {
      // Crossing the line commits the QB to running.
      startPursuit(pl, 0);
    }
  }
  if (pressA) {
    if (s === 0 && pl.b.st === 'air' && pl.b.to >= 0 && ci !== pl.b.to) {
      // Take over the intended receiver while the pass is in the air.
      pl.ctrl[0] = pl.b.to; pl.touch[0] = false;
      st.ev.push({ k: 'switch' });
    } else if (pl.car === ci) {
      if (p.jcd === 0) { p.jk = p.jkB ? 24 : 18; p.jcd = p.jkB ? 55 : 75; st.ev.push({ k: 'juke', x: p.x, y: p.y }); }
    } else if (p.st === 1) {
      if (p.rcd === 0) { p.rcd = 40; if (rand(st) < 0.3 + (p.str - e[p.eng].str) * 0.006) shed(pl, p, e[p.eng]); }
    } else if (p.st === 0 && pl.car >= 0 && e[pl.car].s !== s) {
      const c = e[pl.car];
      let ux = mx, uy = my;
      if (len(ux, uy) < 0.2) { ux = c.x - p.x; uy = c.y - p.y; }
      const l = len(ux, uy) || 1;
      p.st = 4; p.stT = 16; p.vx = (ux / l) * p.spd * 1.35; p.vy = (uy / l) * p.spd * 1.35;
      st.ev.push({ k: 'dive', x: p.x, y: p.y });
    }
  }
  if (pressB) {
    const carSide = pl.car >= 0 ? e[pl.car].s : pl.b.st === 'air' ? 0 : -1;
    if (carSide !== s) {
      // Switch to the teammate closest to the ball.
      const bx = pl.b.st === 'air' ? pl.b.tx : pl.b.x, by = pl.b.st === 'air' ? pl.b.ty : pl.b.y;
      const n = nearestOf(pl, s, bx, by, ci, (o) => o.r !== 'K');
      if (n >= 0) { pl.ctrl[s] = n; pl.touch[s] = false; st.ev.push({ k: 'switch' }); }
    }
  }
}

function shed(pl, d, b) {
  d.st = 0; d.eng = -1; d.ecd = 40;
  b.st = 0; b.eng = -1; b.ecd = 22;
}

function engagements(st, pl) {
  const e = pl.e;
  // New engagements: blockers latch onto free opponents in reach.
  for (let i = 0; i < e.length; i++) {
    const bl = e[i];
    if (!bl.blk || bl.st !== 0 || bl.ecd > 0 || i === pl.car) continue;
    for (let j = 0; j < e.length; j++) {
      const d = e[j];
      if (d.s === bl.s || d.st !== 0 || d.ecd > 0 || j === pl.car || d.eng >= 0) continue;
      if (d.key && pl.t < pl.keyT) continue; // the read key is left unblocked on purpose
      if (dist(bl, d) < 1.05) {
        bl.eng = j; d.eng = i; bl.st = 1; d.st = 1;
        if (pl.k === 'scrim' && d.r[0] === 'D' && rand(st) < 0.5) st.ev.push({ k: 'block' });
        break;
      }
    }
  }
  const advMul = pl.adv < 0 ? 1.45 : pl.adv > 0 ? 0.65 : 1;
  for (let i = 0; i < e.length; i++) {
    const bl = e[i];
    if (bl.st !== 1 || !bl.blk || bl.eng < 0) continue;
    const d = e[bl.eng];
    let ux, uy, l, v;
    if (bl.drv) {
      // Drive block: blocker pushes the defender away from himself and downfield.
      ux = d.x - bl.x + (bl.s === 0 ? 0.6 : -0.6); uy = d.y - bl.y; l = len(ux, uy) || 1;
      ux /= l; uy /= l;
      v = clamp((bl.str - d.str) * 0.05 + 0.8, -0.6, 2.2);
      d.x += ux * v * DT; d.y += uy * v * DT;
      d.vx = ux * v; d.vy = uy * v;
      bl.x = d.x - ux * 0.9; bl.y = d.y - uy * 0.9;
    } else {
      // Pass pro: defender pushes toward where it wants to go; blocker stays between.
      ux = d.dvx; uy = d.dvy; l = len(ux, uy);
      if (l < 0.1) { ux = bl.x - d.x; uy = bl.y - d.y; l = len(ux, uy) || 1; }
      ux /= l; uy /= l;
      v = clamp((d.str - bl.str) * 0.05 + 0.45, -1.2, 2.3);
      d.x += ux * v * DT; d.y += uy * v * DT;
      d.vx = ux * v; d.vy = uy * v;
      bl.x = d.x + ux * 0.9; bl.y = d.y + uy * 0.9;
    }
    bl.vx = d.vx; bl.vy = d.vy;
    const near = pl.car >= 0 && e[pl.car].s !== d.s && dist(d, e[pl.car]) < 1.6;
    const p = (bl.drv ? 0.0055 : 0.0085) * clamp(1 + (d.str - bl.str) / 25, 0.3, 2.6) * (pl.k === 'scrim' && d.s === 1 ? advMul : 1) + (near ? (bl.drv ? 0.018 : 0.05) : 0);
    // Open-field blocks on returns don't last long.
    if (rand(st) < (pl.k === 'ret' ? p * 3.5 : p)) shed(pl, d, bl);
  }
}

function integrate(pl) {
  const e = pl.e;
  const maxA = ACCEL * DT;
  const defMul = pl.adv < 0 ? 1.03 : pl.adv > 0 ? 0.97 : 1;
  for (let i = 0; i < e.length; i++) {
    const p = e[i];
    if (p.ecd > 0) p.ecd--;
    if (p.tcd > 0) p.tcd--;
    if (p.jcd > 0) p.jcd--;
    if (p.rcd > 0) p.rcd--;
    if (p.st === 1) continue;
    if (p.st === 2 || p.st === 3) { if (--p.stT <= 0) p.st = 0; }
    if (p.st === 4) {
      if (--p.stT <= 0) { p.st = 2; p.stT = 30; p.vx *= 0.2; p.vy *= 0.2; }
      p.x += p.vx * DT; p.y += p.vy * DT;
      continue;
    }
    if (p.st === 2) { p.vx *= 0.8; p.vy *= 0.8; p.x += p.vx * DT; p.y += p.vy * DT; continue; }
    let mul = 1;
    if (i === pl.car) mul *= p.s === 0 && i === I.QB && !pl.pm ? 1 : p.r === 'RB' ? 0.96 : p.r === 'KR' ? 0.94 : 0.9;
    if (p.st === 3) mul *= 0.35;
    if (p.slow > 0) { p.slow--; mul *= 0.6; }
    if (p.jk > 0) { p.jk--; mul *= 1.12; }
    if (p.s === 1 && pl.k === 'scrim') mul *= defMul;
    if (p.pu) mul *= 1.09; // closing burst on the ball carrier
    let dvx = p.dvx * mul, dvy = p.dvy * mul;
    let ax = dvx - p.vx, ay = dvy - p.vy;
    const al = len(ax, ay);
    const lim = p.jk > 0 ? maxA * 2.2 : maxA;
    if (al > lim) { ax *= lim / al; ay *= lim / al; }
    p.vx += ax; p.vy += ay;
    p.x += p.vx * DT; p.y += p.vy * DT;
    if (p.vx > 0.4) p.fx = 1; else if (p.vx < -0.4) p.fx = -1;
    p.anim += len(p.vx, p.vy) * DT;
    if (i !== pl.car) { p.y = clamp(p.y, -2, FIELD_W + 2); p.x = clamp(p.x, -12, 112); }
  }
}

function separate(pl) {
  const e = pl.e, n = e.length;
  for (let i = 0; i < n; i++) {
    const a = e[i];
    if (a.st === 2) continue;
    for (let j = i + 1; j < n; j++) {
      const b = e[j];
      if (b.st === 2 || a.eng === j) continue;
      if (i === pl.car || j === pl.car) continue; // carrier slips through teammates; tackles handle opponents
      const dx = b.x - a.x, dy = b.y - a.y, d = len(dx, dy);
      if (d >= 0.72 || d < 1e-6) continue;
      const push = (0.72 - d) * 0.5;
      const ux = dx / d, uy = dy / d;
      const fa = a.st === 1 ? 0.2 : 1, fb = b.st === 1 ? 0.2 : 1;
      a.x -= ux * push * fa; a.y -= uy * push * fa;
      b.x += ux * push * fb; b.y += uy * push * fb;
    }
  }
}

function tackles(st, pl) {
  if (pl.car < 0 || pl.ph !== 'live') return;
  const e = pl.e, c = e[pl.car];
  const elusive = c.str * 0.6 + c.sr * 0.4 - 16;
  for (let i = 0; i < e.length; i++) {
    const d = e[i];
    if (d.s === c.s || d.tcd > 0 || d.st === 2 || d.st === 3) continue;
    const reach = d.st === 4 ? 1.5 : 1.05;
    if (dist(d, c) > reach) continue;
    let p = 0.6 + (d.tkl - elusive) * 0.012;
    if (pl.k === 'scrim') p += pl.adv < 0 ? 0.07 : pl.adv > 0 ? -0.07 : 0;
    if (c.jk > 0) p -= c.jkB ? 0.33 : 0.25;
    if ((c.r === 'RB' || (c.r === 'QB' && pl.pm)) && c.vx * (c.s === 0 ? 1 : -1) > 3.5) p -= 0.11; // downhill momentum
    if (d.st === 4) p += 0.12;
    if (d.st === 1) { if (dist(d, c) > 0.8) continue; p *= 0.3; }
    if (pl.k === 'scrim' && pl.car === I.QB && !pl.pm) p += 0.12;
    p = clamp(p, 0.12, 0.95);
    if (rand(st) < p) {
      // Fumble: rare, more likely from hard hitters on smaller carriers.
      const fum = 0.012 * (d.str / Math.max(c.str, 40)) * (d.ff ? 2.5 : 1);
      if (rand(st) < fum) {
        st.ev.push({ k: 'fumble', x: c.x, y: c.y });
        setDead(st, pl, 'tackle', d.s, c.x);
        pl.out.fum = true;
        return;
      }
      if (pl.k === 'scrim' && pl.car === I.QB && !pl.pm && c.x < pl.los) pl.sack = true;
      st.ev.push({ k: len(d.vx - c.vx, d.vy - c.vy) > 9 ? 'bigtackle' : 'tackle', x: c.x, y: c.y, sack: pl.sack });
      c.st = 2; c.stT = 60;
      const fwd = c.s === 0 ? 0.5 : -0.5;
      deadSpot(st, pl, c, c.x + (c.vx * (c.s === 0 ? 1 : -1) > 2 ? fwd : 0));
      return;
    }
    d.tcd = 18;
    if (d.st === 4) { d.st = 2; d.stT = 34; } else { d.st = 3; d.stT = 10; }
    c.slow = 10;
    st.ev.push({ k: 'broken', x: c.x, y: c.y });
  }
}

// Dead-ball at x for the current carrier: classify safety / touchback / normal.
function deadSpot(st, pl, c, x, oob) {
  if (c.s === 0 && x <= 0) return setDead(st, pl, 'safety', 0, x);
  if (c.s === 1 && x >= 100) return setDead(st, pl, 'tb', 1, x);
  setDead(st, pl, oob ? 'oob' : 'tackle', c.s, x);
}

function ballUpdate(st, pl) {
  const b = pl.b, e = pl.e;
  if (b.st === 'held') {
    const h = e[b.h];
    b.x = h.x + h.fx * 0.35; b.y = h.y; b.z = 0.9;
    return;
  }
  if (b.st !== 'air' && b.st !== 'pitch' && b.st !== 'kick') return;
  b.f++;
  const u = b.f / b.F;
  b.x = b.sx + (b.tx - b.sx) * u; b.y = b.sy + (b.ty - b.sy) * u;
  b.z = 4 * b.pk * u * (1 - u) + 1.6 * (1 - u) + 0.6 * u;
  if (b.f < b.F) return;
  if (b.st === 'pitch') {
    const r = e[b.to];
    if (r.st !== 2 && len(r.x - b.x, r.y - b.y) < 1.8) { giveBall(st, pl, b.to, 'catch'); startPursuit(pl); }
    else setDead(st, pl, 'tackle', 0, b.x);
    return;
  }
  if (b.st === 'kick') {
    if (b.tx >= 100) { setDead(st, pl, 'tb', 1, b.tx); return; }
    const r = e[b.to];
    if (len(r.x - b.x, r.y - b.y) < 2.6) { giveBall(st, pl, b.to, 'catch'); startPursuit(pl); pl.pmT = pl.t; }
    else setDead(st, pl, 'tackle', 1, b.tx);
    return;
  }
  resolveCatch(st, pl);
}

function resolveCatch(st, pl) {
  const b = pl.b, e = pl.e;
  let ri = -1, rd = 1e9, di = -1, dd = 1e9;
  for (let i = 0; i < e.length; i++) {
    const p = e[i];
    if (p.st === 2) continue;
    const d = len(p.x - b.x, p.y - b.y);
    if (p.s === 0) { if (ELIG[p.r] && d < rd) { rd = d; ri = i; } }
    else if (d < dd) { dd = d; di = i; }
  }
  const def = di >= 0 ? e[di] : null;
  const inb = b.y >= 0 && b.y <= FIELD_W && b.x <= 110;
  if (def && dd <= 1.15 && (dd < rd - 0.25 || rd > 1.35)) {
    const human = pl.ctrl[1] === di && pl.touch[1] ? 1.25 : 1;
    const pInt = (0.12 + (def.hnd - 40) * 0.005) * (1 - (dd / 1.15) * 0.45) * human;
    if (inb && rand(st) < pInt) {
      st.ev.push({ k: 'int', x: def.x, y: def.y });
      st.stats[pl.off].int++;
      pl.turn = true;
      giveBall(st, pl, di);
      pl.ctrl[1] = di; pl.touch[1] = false;
      const n = nearestOf(pl, 0, def.x, def.y, -1);
      if (n >= 0) { pl.ctrl[0] = n; pl.touch[0] = false; }
      startPursuit(pl); pl.pmT = pl.t;
      return;
    }
    st.ev.push({ k: 'pbu', x: b.x, y: b.y });
    setDead(st, pl, 'inc', 0, pl.los);
    return;
  }
  if (ri >= 0 && rd <= 1.35 && inb) {
    const r = e[ri];
    let p = 0.62 + (r.hnd - 40) * 0.0055;
    if (def && dd < 1.6) p *= 0.55 + 0.3 * (dd / 1.6);
    p *= 1 - 0.2 * (rd / 1.35);
    if (rand(st) < p) {
      pl.comp = true;
      st.stats[pl.off].cmp++;
      giveBall(st, pl, ri, 'catch');
      r.slow = 14; // secure the ball before turning upfield
      startPursuit(pl, 8);
      if (r.x >= 100) setDead(st, pl, 'td', 0, r.x);
      return;
    }
    st.ev.push({ k: 'drop', x: r.x, y: r.y });
  }
  setDead(st, pl, 'inc', 0, pl.los);
}

function boundaries(st, pl) {
  if (pl.ph !== 'live' || pl.car < 0) return;
  const c = pl.e[pl.car];
  if (c.s === 0 && c.x >= 100) return setDead(st, pl, 'td', 0, c.x);
  if (c.s === 1 && c.x <= 0) return setDead(st, pl, 'td', 1, c.x);
  if (c.y < 0 || c.y > FIELD_W || c.x > 110 || c.x < -10) deadSpot(st, pl, c, clamp(c.x, -10, 110), true);
}

// One simulated frame of a live play. inp[side] = decoded input or null (CPU / none).
export function stepPlay(st, pl, inp, press, cpu) {
  pl.t++;
  const e = pl.e;
  if (pl.ph === 'dead') {
    pl.deadT++;
    for (const p of e) { if (p.st !== 2) { p.vx *= 0.9; p.vy *= 0.9; p.x += p.vx * DT; p.y += p.vy * DT; } }
    return;
  }
  if (pl.ph === 'pre') {
    // Defense may shift its controlled defender before the snap.
    const s1 = inp[1];
    const d = e[pl.ctrl[1]];
    if (s1 && (pl.touch[1] || len(s1.mx, s1.my) > 0.2)) {
      pl.touch[1] = true;
      d.x = clamp(d.x + s1.mx * 4 * DT, pl.los + 1, pl.los + 20);
      d.y = clamp(d.y + s1.my * 4 * DT, 1, FIELD_W - 1);
      d.sx = d.x; d.sy = d.y;
    }
    if (press[1].b) {
      const n = (pl.ctrl[1] - 8 + 1) % 8 + 8;
      pl.ctrl[1] = n; pl.touch[1] = false;
    }
    if (pl.t >= PRE_FRAMES) {
      pl.ph = 'live'; pl.t = 0;
      giveBall(st, pl, I.QB);
      pl.touch[0] = false; pl.touch[1] = false;
      st.ev.push({ k: 'hike' });
    }
    return;
  }

  if (pl.k === 'scrim') {
    qbScript(st, pl, cpu[0], press[0].b);
    if (cpu[0]) cpuQB(st, pl);
  }
  for (let i = 0; i < e.length; i++) think(st, pl, i, cpu);
  for (let s = 0; s < 2; s++) {
    if (cpu[s] || !inp[s]) continue;
    humanControl(st, pl, s, inp[s], press[s].a, press[s].b && !(s === 0 && pl.k === 'scrim' && (pl.qbt === 'read' || pl.qbt === 'rpo' || pl.qbt === 'speed')));
  }
  // Throwing (offense human only).
  if (!cpu[0] && inp[0] && canThrow(pl)) {
    if (press[0].rel) throwBall(st, pl, press[0].ax, press[0].ay);
    else if (press[0].menu >= 21 && press[0].menu <= 24) {
      const r = e[[I.WR1, I.WR2, I.TE, I.RB][press[0].menu - 21]];
      const qb = e[I.QB];
      const [tx, ty] = leadTarget(pl, qb, r, passSpeed(qb));
      throwBall(st, pl, tx, ty);
    }
  }
  integrate(pl);
  engagements(st, pl);
  separate(pl);
  ballUpdate(st, pl);
  if (pl.ph === 'live') boundaries(st, pl);
  if (pl.ph === 'live') tackles(st, pl);
  // Safety valve: a play never lasts more than 25 seconds.
  if (pl.ph === 'live' && pl.t > 1500) {
    if (pl.car >= 0) deadSpot(st, pl, e[pl.car], e[pl.car].x); else setDead(st, pl, 'inc', 0, pl.los);
  }
}

// Static pre-kick lineups so the field isn't empty while the kicker uses the meter.
export function setupScene(st, kickT, recvT, kx, ty) {
  const K = st.teams[kickT].ro, R = st.teams[recvT].ro;
  const pl = basePlay('scene', kickT, recvT, kx);
  pl.ph = 'scene';
  const e = pl.e;
  const add = (s, r, tm, p, x, y, big) => { const ent = mkEnt(s, r, tm, p, x, clamp(y, 1.5, FIELD_W - 1.5), big); e.push(ent); return ent; };
  if (ty === 'KO') {
    add(0, 'K', kickT, K.K, kx - 4, MID);
    const cov = [K.LB, K.LB2, K.CB, K.CB2, K.S, K.TE, K.RB];
    for (let i = 0; i < 7; i++) add(0, 'COV', kickT, cov[i], kx - 1, 5 + i * ((FIELD_W - 10) / 6));
    add(1, 'KR', recvT, R.RB, 96, MID);
    const blk = [R.TE, R.LB, R.LB2, R.CB2, R.S, R.WR1, R.CB];
    for (let i = 0; i < 7; i++) add(1, 'BLK', recvT, blk[i], kx + 12 + (i % 2) * 8, 6 + i * ((FIELD_W - 12) / 6));
  } else if (ty === 'PUNT') {
    add(0, 'K', kickT, K.K, kx - 12, MID);
    for (let i = 0; i < 3; i++) add(0, 'OL', kickT, K.OL, kx - 0.6, MID - 1.7 + i * 1.7, true);
    add(0, 'COV', kickT, K.WR1, kx - 0.6, MID - 17); add(0, 'COV', kickT, K.WR2, kx - 0.6, MID + 17);
    add(0, 'COV', kickT, K.TE, kx - 0.8, MID + 3.6); add(0, 'COV', kickT, K.RB, kx - 5, MID + 1.5);
    for (let i = 0; i < 3; i++) add(1, 'DL', recvT, R.DL, kx + 0.7, MID - 2.6 + i * 2.6, true);
    add(1, 'BLK', recvT, R.LB, kx + 3, MID - 3); add(1, 'BLK', recvT, R.LB2, kx + 3, MID + 3);
    add(1, 'BLK', recvT, R.CB, kx + 1.5, MID - 16); add(1, 'BLK', recvT, R.CB2, kx + 1.5, MID + 16);
    add(1, 'KR', recvT, R.RB, Math.min(kx + 40, 104), MID);
  } else {
    for (let i = 0; i < 3; i++) add(0, 'OL', kickT, K.OL, kx - 0.6, MID - 1.7 + i * 1.7, true);
    add(0, 'TE', kickT, K.TE, kx - 0.8, MID + 3.6); add(0, 'TE', kickT, K.WR1, kx - 0.8, MID - 3.6);
    add(0, 'H', kickT, K.QB, kx - 7, MID - 0.6);
    add(0, 'K', kickT, K.K, kx - 9.5, MID - 1.6);
    for (let i = 0; i < 3; i++) add(1, 'DL', recvT, R.DL, kx + 0.7, MID - 2.6 + i * 2.6, true);
    add(1, 'LB', recvT, R.LB, kx + 1.2, MID - 4.5); add(1, 'LB', recvT, R.LB2, kx + 1.2, MID + 4.5);
    add(1, 'S', recvT, R.S, kx + 9, MID);
  }
  pl.b.x = ty === 'KO' ? kx : ty === 'PUNT' ? kx - 12 : kx - 7; pl.b.y = MID; pl.b.z = 0.2;
  pl.b.st = 'tee';
  return pl;
}