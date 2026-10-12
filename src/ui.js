// DOM overlay UI. Everything is derived from the (deterministic) sim state each frame;
// clicks only queue menu inputs, which go through the netcode like any other input.
import { SLOTS, SLOT_POS, POS_LIST, POS_NAME, POS_KEYS, KEY_NAME, PERKS } from './sim/data.js';
import { OFF_CARDS, DEF_CARDS, CAT_NAME, FORMS, ROUTES, DEF_ALIGN_BASE } from './sim/plays.js';
import { DRAFT_T, CALL_T, PAT_T, HALF_T, MENU_PUNT, MENU_FG, fgDistance, fgRange, openSlot } from './sim/game.js';
import { canThrow, I } from './sim/live.js';
import { MID } from './sim/core.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
const ORD = ['', '1ST', '2ND', '3RD', '4TH'];
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const clockText = (tenths) => { const s = Math.max(0, Math.ceil(tenths / 10)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function spotText(st, spot, ti) {
  const s = Math.round(spot);
  if (s === 50) return 'MIDFIELD';
  const own = st.teams[ti], opp = st.teams[1 - ti];
  return s < 50 ? `${own.abbr} ${s}` : `${opp.abbr} ${100 - s}`;
}

// ---------------------------------------------------------------------------
// Play card diagrams (small pixel canvases, cached as data URLs).
const diagCache = new Map();
function diagram(card, off) {
  const key = (off ? 'o' : 'd') + card.id;
  if (diagCache.has(key)) return diagCache.get(key);
  const W = 72, Hh = 48, cv = document.createElement('canvas');
  cv.width = W; cv.height = Hh;
  const c = cv.getContext('2d');
  const px = (x) => Math.round((x + 9) * 2), py = (y) => Math.round(y + 24);
  c.fillStyle = '#12351d'; c.fillRect(0, 0, W, Hh);
  c.fillStyle = '#3b82f6'; c.fillRect(px(0), 0, 1, Hh);
  const line = (pts, col, dash) => {
    c.strokeStyle = col; c.lineWidth = 1; c.setLineDash(dash ? [2, 2] : []);
    c.beginPath(); c.moveTo(px(pts[0][0]) + 0.5, py(pts[0][1]) + 0.5);
    for (let i = 1; i < pts.length; i++) c.lineTo(px(pts[i][0]) + 0.5, py(pts[i][1]) + 0.5);
    c.stroke(); c.setLineDash([]);
    const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]];
    c.fillStyle = col; c.fillRect(px(b[0]) - 1, py(b[1]) - 1, 3, 3);
    void a;
  };
  const F = FORMS[off ? card.form : 'gun'];
  if (off) {
    for (const [r, asg] of Object.entries({ WR1: card.rec.WR1, WR2: card.rec.WR2, TE: card.rec.TE || 'block', RB: card.rec.RB || (card.lane ? 'run' : 'block') })) {
      const [sx, sy] = F[r];
      if (asg === 'run' && card.lane) line([[sx, sy], ...card.lane.map(([x, y]) => [x, y])], '#4ade80');
      else if (ROUTES[asg] && asg !== 'stalk') {
        const sd = sy > 0.01 ? 1 : sy < -0.01 ? -1 : 1;
        const R = ROUTES[asg];
        let pts = [[sx, sy], ...R.p.map(([dx, dy]) => [sx + dx, sy + dy * sd])];
        if (R.e === 'c') { const [a, b] = pts.slice(-2); const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; pts.push([b[0] + ((b[0] - a[0]) / l) * 5, b[1] + ((b[1] - a[1]) / l) * 5]); }
        pts = pts.map(([x, y]) => [Math.min(26, x), Math.max(-23, Math.min(23, y))]);
        line(pts, '#fde047');
      }
    }
    if (card.qb.t === 'speed') line([[F.QB[0], 0], [0, card.qb.dir * 12]], '#fb923c');
    if (card.qb.t === 'pa' && card.qb.roll) line([[F.QB[0], 0], [F.QB[0] - 2, card.qb.roll]], '#c084fc', true);
    c.fillStyle = '#fff';
    for (const r of Object.keys(F)) { const [x, y] = F[r]; c.fillRect(px(x) - 1, py(y) - 1, 2, 2); }
  } else {
    const al = (r) => {
      if (DEF_ALIGN_BASE[r]) return DEF_ALIGN_BASE[r];
      const [d, lat] = card.al[r];
      return [d, typeof lat === 'string' ? F[lat][1] : lat];
    };
    for (const r of ['LB1', 'LB2', 'CB1', 'CB2', 'S']) {
      const a = card.a[r], [x, y] = al(r);
      if (a.t === 'zone') { c.strokeStyle = 'rgba(34,211,238,0.8)'; c.beginPath(); c.ellipse(px(a.x), py(a.y), a.r * 2 * 0.6, a.r * 0.6, 0, 0, Math.PI * 2); c.stroke(); line([[x, y], [a.x, a.y]], 'rgba(34,211,238,0.8)', true); }
      else if (a.t === 'man') { const t = F[a.m]; line([[x, y], [t[0] + 4, t[1]]], '#facc15', true); }
      else if (a.t === 'blitz') line([[x, y], [0.2, a.g], [-3, a.g * 0.5]], '#f87171');
      else if (a.t === 'spy') line([[x, y], [3.5, 0]], '#fb923c', true);
      else if (a.t === 'fit') line([[x, y], [1, y * 0.8]], '#f87171', true);
    }
    c.fillStyle = '#9ca3af';
    for (const r of Object.keys(F)) { const [x, y] = F[r]; c.fillRect(px(x) - 1, py(y) - 1, 2, 2); }
    c.fillStyle = '#ef4444';
    for (const r of ['DL1', 'DL2', 'DL3', 'LB1', 'LB2', 'CB1', 'CB2', 'S']) {
      const [x, y] = al(r);
      const X = px(x), Y = py(y);
      c.fillRect(X - 1, Y - 1, 1, 1); c.fillRect(X + 1, Y - 1, 1, 1); c.fillRect(X, Y, 1, 1); c.fillRect(X - 1, Y + 1, 1, 1); c.fillRect(X + 1, Y + 1, 1, 1);
    }
    if (card.zdl) { c.strokeStyle = 'rgba(34,211,238,0.8)'; c.strokeRect(px(5) - 4, py(0) - 3, 8, 6); }
  }
  const url = cv.toDataURL();
  diagCache.set(key, url);
  return url;
}

// ---------------------------------------------------------------------------

export class UI {
  constructor(input, handlers) {
    this.input = input;
    this.h = handlers;
    this.el = {
      hud: $('hud'), score: $('score'), down: $('down'), panel: $('panel'), banner: $('banner'), hint: $('hint'),
      net: $('net'), km: $('kickmeter'), kmPower: $('km-power'), kmTarget: $('km-target'), kmNeedle: $('km-needle'),
      kmZone: $('km-zone'), kmLabel: $('km-label'), kmTip: $('km-tip'), touch: $('touch'), stickBase: $('stick-base'),
      stickKnob: $('stick-knob'), top: $('topbtns'),
    };
    this.panelKey = '';
    this.bannerKey = '';
    this.scoreKey = '';
    this.hintText = '';
    this.frame = 0;
    this.el.panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-menu]');
      if (!b || b.disabled) return;
      this.h.click();
      this.input.queueMenu(+b.dataset.menu);
    });
    for (const id of ['btnA', 'btnB']) {
      const b = $(id);
      const which = id === 'btnA' ? 'A' : 'B';
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); this.input.setTouchButton(which, true); });
      const up = () => this.input.setTouchButton(which, false);
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    }
  }

  showTouch(on) {
    this.el.touch.classList.toggle('hidden', !on);
    document.body.classList.toggle('touch-on', on);
  }
  stickAt(x, y, dx, dy, show) {
    const b = this.el.stickBase;
    b.style.display = show ? 'block' : 'none';
    if (!show) return;
    b.style.left = x + 'px'; b.style.top = y + 'px';
    this.el.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  hideAll() {
    for (const k of ['hud', 'panel', 'banner', 'hint', 'net', 'km', 'touch', 'top']) this.el[k].classList.add('hidden');
    this.panelKey = ''; this.bannerKey = ''; this.scoreKey = '';
  }

  setPanel(key, cls, html) {
    const p = this.el.panel;
    if (key === this.panelKey) return false;
    this.panelKey = key;
    if (!key) { p.classList.add('hidden'); p.innerHTML = ''; return true; }
    p.className = cls;
    p.innerHTML = html;
    return true;
  }

  setBanner(key, tone, html) {
    if (key === this.bannerKey) return;
    this.bannerKey = key;
    const b = this.el.banner;
    if (!key) { b.classList.add('hidden'); return; }
    b.className = tone;
    b.innerHTML = html;
  }

  setHint(t) {
    if (t === this.hintText) return;
    this.hintText = t;
    this.el.hint.textContent = t;
    this.el.hint.classList.toggle('hidden', !t);
  }

  update(st, local, sess) {
    this.frame++;
    this.el.hud.classList.remove('hidden');
    this.el.top.classList.remove('hidden');
    this.updateScore(st, local);
    this.updateNet(sess);
    const touch = this.input.isTouch;
    switch (st.ph) {
      case 'DRAFT': this.draftPanel(st, local); break;
      case 'DRAFT_DONE': this.draftDone(st, local); break;
      case 'CALL': this.callPanel(st, local); break;
      case 'PAT': this.patPanel(st, local); break;
      case 'HALF': this.halfPanel(st, local); break;
      case 'OVER': this.overPanel(st, local); break;
      default: this.setPanel('', '', '');
    }
    this.kickMeter(st, local);
    if (st.ph === 'RESULT' && st.res) {
      const r = st.res;
      let reveal = '';
      if (r.oc >= 0) {
        const oc = OFF_CARDS[r.oc], dc = DEF_CARDS[r.dc];
        const edge = r.adv > 0 ? '<span class="edge-o">OFFENSE EDGE</span>' : r.adv < 0 ? '<span class="edge-d">DEFENSE EDGE</span>' : '<span class="edge-n">EVEN MATCHUP</span>';
        reveal = `<div class="r">${esc(oc.name)} (${CAT_NAME[oc.cat]}) vs ${esc(dc.name)} (${CAT_NAME[dc.cat]})<br>${edge}</div>`;
      }
      this.setBanner('res' + (st.frame - st.t), r.tone, `<div class="t">${esc(r.title)}</div>${r.sub ? `<div class="s">${esc(r.sub)}</div>` : ''}${reveal}`);
    } else if (st.ph === 'DRAFT_DONE') {
      const rt = st.teams[st.g.recv1];
      this.setBanner('dd', 'big', `<div class="t">DRAFT COMPLETE</div><div class="s">${esc(rt.name)} ${st.g.recv1 === local ? '(YOU)' : ''} RECEIVE THE KICKOFF</div>`);
    } else this.setBanner('', '', '');
    this.setHint(this.hintFor(st, local, touch));
  }

  updateScore(st, local) {
    const g = st.g;
    const poss = st.pl ? (st.pl.k === 'ret' ? st.pl.def : st.pl.off) : g ? g.poss : -1;
    let clock = g ? g.clock : st.cfg.qlen * 10;
    if (st.ph === 'PLAY' && st.pl && st.pl.ph === 'live' && g) clock -= Math.round(st.pl.t / 6);
    const q = g ? (g.q > 4 ? 'OT' : 'Q' + g.q) : 'PRE';
    const key = `${st.teams[0].score}|${st.teams[1].score}|${poss}|${Math.ceil(clock / 10)}|${q}`;
    if (key !== this.scoreKey) {
      this.scoreKey = key;
      const tm = (i) => {
        const t = st.teams[i];
        return `<div class="tm" style="background:${t.c1};color:${t.c2}"><span class="${poss === i ? 'poss' : ''}">${esc(t.abbr)}${i === local ? '*' : ''}</span><span class="pts">${t.score}</span></div>`;
      };
      this.el.score.innerHTML = `${tm(0)}<div class="clk">${clockText(clock)}<small>${q}</small></div>${tm(1)}`;
    }
    let down = '';
    if (g && (st.ph === 'CALL' || st.ph === 'PLAY' || st.ph === 'RESULT') && !(st.pl && st.pl.k === 'ret') && !(st.ph === 'RESULT' && !st.pl)) {
      down = g.tp ? 'TWO-POINT TRY' : `${ORD[Math.min(4, g.down)]} & ${g.spot + g.togo >= 100 ? 'GOAL' : Math.max(1, Math.round(g.togo))} · ${spotText(st, g.spot, g.poss)}`;
    }
    if (this.el.down.textContent !== down) this.el.down.textContent = down;
  }

  updateNet(sess) {
    if (!sess || !sess.tx) { this.el.net.classList.add('hidden'); return; }
    if (this.frame % 15) return;
    this.el.net.classList.remove('hidden');
    const silent = sess.silenceMs;
    let t = `PING ${Math.round(sess.rtt)}MS · RB ${sess.rollbacks}`;
    let warn = false;
    if (sess.desync >= 0) { t = 'DESYNC DETECTED'; warn = true; }
    else if (silent > 4000) { t = 'CONNECTION LOST...'; warn = true; }
    else if (sess.stalled && silent > 300) { t = 'WAITING FOR OPPONENT...'; warn = true; }
    this.el.net.textContent = t;
    this.el.net.classList.toggle('warn', warn);
  }

  hintFor(st, local, touch) {
    if (st.ph === 'KICK' && st.kick) {
      if (st.kick.tm !== local) return st.kick.ty === 'KO' || st.kick.ty === 'PUNT' ? 'GET READY TO RETURN THE KICK' : 'OPPONENT IS KICKING...';
      return '';
    }
    if (st.ph !== 'PLAY' || !st.pl) return '';
    const pl = st.pl;
    const side = pl.off === local ? 0 : 1;
    if (pl.ph === 'dead') return '';
    const A = touch ? 'A' : 'SPACE', B = touch ? 'B' : 'E', MOVE = touch ? 'STICK' : 'WASD';
    if (pl.ph === 'pre') return side === 1 ? `PRE-SNAP: ${MOVE} SHIFT DEFENDER · ${B} CYCLE` : 'READ THE DEFENSE...';
    const ci = pl.ctrl[side], c = pl.e[ci];
    if (pl.k === 'ret' && pl.car < 0) return side === 1 ? ": GET UNDER THE KICK" : ": COVER THE KICK \u00b7 : SWITCH";
    if (pl.car === ci) {
      if (side === 0 && pl.k === 'scrim' && ci === I.QB && canThrow(pl)) return touch ? 'DRAG FIELD TO AIM · RELEASE TO THROW' : `CLICK/DRAG TO THROW · 1-4 QUICK THROW · ${MOVE} SCRAMBLE`;
      if (side === 0 && pl.k === 'scrim' && ci === I.QB && !pl.given && (pl.qbt === 'read' || pl.qbt === 'rpo')) return `${B}: HAND OFF · OR KEEP IT`;
      if (side === 0 && pl.k === 'scrim' && ci === I.QB && !pl.given && pl.qbt === 'speed') return `${B}: PITCH · ${A}: JUKE`;
      return `${MOVE}: RUN · ${A}: JUKE`;
    }
    if (pl.b.st === 'air' && pl.b.to === ci) return 'GET UNDER THE BALL!';
    if (c && c.st === 1) return `${A}: RIP OFF THE BLOCK · ${B}: SWITCH`;
    const carSide = pl.car >= 0 ? pl.e[pl.car].s : -1;
    if (carSide >= 0 && carSide !== side) return `${MOVE}: CHASE · ${A}: DIVE · ${B}: SWITCH`;
    if (side === 1) return `${MOVE}: COVER · ${B}: SWITCH TO BALL`;
    return '';
  }

  // ---------------- draft ----------------
  draftPanel(st, local) {
    const d = st.draft;
    const turn = d.order[d.i];
    const mine = turn === local && !st.cfg.cpu[local];
    const me = st.teams[local], them = st.teams[1 - local];
    const key = `draft${d.i}`;
    const timeLeft = Math.max(0, DRAFT_T - st.t) / 60;
    const html = () => {
      const groups = POS_LIST.map((pos) => {
        const items = d.pool.map((p, i) => [p, i]).filter(([p]) => p.pos === pos).map(([p, i]) => {
          const taken = d.taken[i];
          const need = taken < 0 && openSlot(me, pos);
          const dis = !mine || taken >= 0 || !need;
          const keys = POS_KEYS[pos].map((k) => `${KEY_NAME[k]} ${p[k]}`).join(' ');
          return `<button class="pl ${taken >= 0 ? 'taken' : ''} ${need && mine ? 'need' : ''}" data-menu="${i + 1}" ${dis ? 'disabled' : ''}>
            <div class="nm"><span>${esc(p.n)}</span><span>#${p.num}</span></div>
            <div><span class="stars">${stars(p.st)}</span> ${pos}</div>
            <div class="rt">${keys}</div>
            ${p.tr ? `<div class="tr">${esc(p.tr)}</div>` : ''}
            ${taken >= 0 ? `<div style="color:${st.teams[taken].c1}">${esc(st.teams[taken].abbr)}</div>` : ''}
          </button>`;
        }).join('');
        return `<div class="posgrp"><h4>${POS_NAME[pos].toUpperCase()}</h4><div class="plist">${items}</div></div>`;
      }).join('');
      const roster = (t, cls) => `<div class="roster ${cls}"><h4><span class="tdot" style="background:${t.c1}"></span>${esc(t.abbr)}</h4>${SLOTS.map((s) => `<div class="slot"><span>${s}</span>${t.ro[s] ? `<span>${esc(t.ro[s].n)} ${stars(t.ro[s].st).slice(0, t.ro[s].st)}</span>` : '<span class="empty">---</span>'}</div>`).join('')}</div>`;
      return `<div class="pbox" style="display:flex;flex-direction:column;min-height:0;flex:1">
        <div class="ptitle"><span>DRAFT · PICK ${d.i + 1}/${d.order.length}</span><span class="who">${mine ? 'YOUR PICK!' : `${esc(st.teams[turn].name)} PICKING...`}</span><span id="dtime"></span></div>
        <div class="timer"><div id="dbar"></div></div>
        <div class="draft">${roster(me, 'mine')}<div class="board">${groups}</div>${roster(them, '')}</div>
      </div>`;
    };
    let scroll = 0;
    const board = this.el.panel.querySelector('.board');
    if (board) scroll = board.scrollTop;
    if (this.setPanel(key, 'full', html())) {
      const nb = this.el.panel.querySelector('.board');
      if (nb) nb.scrollTop = scroll;
    }
    const bar = $('dbar'), tm = $('dtime');
    if (bar) bar.style.width = (100 * timeLeft / (DRAFT_T / 60)) + '%';
    if (tm) tm.textContent = Math.ceil(timeLeft) + 's';
  }

  draftDone(st, local) {
    this.setPanel('', '', '');
  }

  // ---------------- play call ----------------
  callPanel(st, local) {
    const c = st.call, g = st.g;
    const off = g.poss === local;
    const hand = c.h[local];
    const lib = off ? OFF_CARDS : DEF_CARDS;
    const picked = c.pk[local];
    const spec = off ? c.sp : 0;
    const done = picked >= 0 || spec;
    const oppDone = off ? c.pk[1 - local] >= 0 : c.pk[1 - local] >= 0 || c.sp;
    const key = `call${st.frame - st.t}|${picked}|${spec}|${oppDone}`;
    const html = () => {
      const cards = hand.map((ci, k) => {
        const cd = lib[ci];
        const col = `var(--${cd.cat.toLowerCase()})`;
        return `<button class="card rar${cd.rar} ${picked === k ? 'picked' : ''}" style="--cc:${col}" data-menu="${k + 1}" ${done ? 'disabled' : ''}>
          <div class="ccat"><span>${CAT_NAME[cd.cat].toUpperCase()}</span><span>${k + 1}</span></div>
          <div class="cname">${esc(cd.name)}</div>
          <img alt="" src="${diagram(cd, off)}">
          <div class="cdesc">${esc(cd.desc)}</div>
        </button>`;
      }).join('');
      let specials = '';
      if (off && g.down === 4 && !g.tp) {
        const K = st.teams[local].ro.K;
        const dist = fgDistance(g.spot), max = Math.round(fgRange(K) * 1.06);
        specials = `<div class="specials">
          <button data-menu="${MENU_PUNT}" class="alt" ${done ? 'disabled' : ''}>PUNT (P)</button>
          <button data-menu="${MENU_FG}" class="alt" ${done ? 'disabled' : ''}>FIELD GOAL ${dist}YD ${dist > max ? '(OUT OF RANGE)' : ''} (F)</button>
        </div>`;
      }
      const status = done
        ? `<span class="who">LOCKED IN · ${oppDone ? 'SNAPPING...' : 'WAITING FOR OPPONENT'}</span>`
        : `<span class="who">${off ? 'CALL YOUR PLAY' : 'CALL YOUR DEFENSE'} (1-6)</span>`;
      return `<div class="pbox"><div class="ptitle">${status}<span>${oppDone && !done ? 'OPPONENT READY' : ''}</span><span id="ctime"></span></div>
        <div class="timer"><div id="cbar"></div></div><div class="cards">${cards}</div>${specials}</div>`;
    };
    this.setPanel(key, 'bottom', html());
    const left = Math.max(0, CALL_T - st.t) / 60;
    const bar = $('cbar'), tm = $('ctime');
    if (bar) bar.style.width = (100 * left / (CALL_T / 60)) + '%';
    if (tm) tm.textContent = Math.ceil(left) + 's';
  }

  patPanel(st, local) {
    const p = st.pat;
    const mine = p.team === local;
    const key = 'pat' + (st.frame - st.t);
    this.setPanel(key, 'center', `<div class="pbox" style="text-align:center"><div class="ptitle" style="justify-content:center"><span class="who">${mine ? 'TOUCHDOWN! GO FOR...' : 'OPPONENT DECIDING...'}</span></div>
      ${mine ? `<div class="row"><button class="big" data-menu="1">KICK XP (1)</button><button class="big alt" data-menu="2">GO FOR 2 (2)</button></div>` : ''}
      <div class="timer"><div id="pbar"></div></div></div>`);
    const bar = $('pbar');
    if (bar) bar.style.width = (100 * Math.max(0, PAT_T - st.t) / PAT_T) + '%';
  }

  halfPanel(st, local) {
    const h = st.half;
    const pk = h.pk[local];
    const key = `half${pk}`;
    const offers = h.offers[local];
    this.setPanel(key, 'center', `<div class="pbox"><div class="ptitle"><span>HALFTIME · ${st.teams[0].abbr} ${st.teams[0].score} - ${st.teams[1].score} ${st.teams[1].abbr}</span><span class="who">${pk >= 0 ? 'WAITING FOR OPPONENT...' : 'PICK A TEAM PERK'}</span></div>
      <div class="choices">${offers.map((pi, k) => { const pr = PERKS[pi]; return `<button class="choice ${pk === k ? 'picked' : ''}" data-menu="${k + 1}" ${pk >= 0 ? 'disabled' : ''}><b>${esc(pr.name)}</b><small>${esc(pr.desc)}</small></button>`; }).join('')}</div>
      <div class="timer" style="margin-top:10px"><div id="hbar"></div></div></div>`);
    const bar = $('hbar');
    if (bar) bar.style.width = (100 * Math.max(0, HALF_T - st.t) / HALF_T) + '%';
  }

  overPanel(st, local) {
    const o = st.over;
    const key = `over${o.votes[0]}${o.votes[1]}`;
    const [a, b] = st.teams;
    const win = a.score > b.score ? 0 : 1;
    const s = st.stats;
    const row = (label, f) => `<div>${label}</div><div>${f(s[0])}</div><div>${f(s[1])}</div>`;
    this.setPanel(key, 'center', `<div class="pbox final">
      <div class="ptitle" style="justify-content:center"><span class="who">FINAL</span></div>
      <div class="big"><span style="color:${a.c1}">${esc(a.abbr)}</span> ${a.score} - ${b.score} <span style="color:${b.c1}">${esc(b.abbr)}</span></div>
      <div>${win === local ? 'YOU WIN!' : 'YOU LOSE'}</div>
      <div class="stats"><div></div><div>${esc(a.abbr)}</div><div>${esc(b.abbr)}</div>
        ${row('PASS', (t) => `${t.cmp}/${t.att} ${t.py}`)}${row('RUSH YDS', (t) => t.ry)}${row('TDS', (t) => t.td)}${row('INTS THROWN', (t) => t.int)}${row('SACKS', (t) => t.sk)}</div>
      <div class="row"><button class="big" data-menu="1" ${o.votes[local] ? 'disabled' : ''}>${o.votes[local] ? 'WAITING...' : 'REMATCH'}</button></div>
      ${o.votes[1 - local] && !o.votes[local] ? '<div class="who">OPPONENT WANTS A REMATCH</div>' : ''}
    </div>`);
  }

  kickMeter(st, local) {
    const km = this.el.km;
    const k = st.kick;
    const show = st.ph === 'KICK' && k && k.tm === local && k.sg < 2 && !st.cfg.cpu[local];
    km.classList.toggle('hidden', !show);
    if (!show) return;
    const K = st.teams[k.tm].ro.K;
    const label = { KO: 'KICKOFF', PUNT: 'PUNT', FG: 'FIELD GOAL', PAT: 'EXTRA POINT' }[k.ty];
    this.el.kmLabel.textContent = `${label} · ${k.sg === 0 ? 'SET POWER' : 'SET AIM'}`;
    this.el.kmPower.style.width = (k.pw * 100).toFixed(1) + '%';
    if (k.ty === 'FG' || k.ty === 'PAT') {
      const need = fgDistance(st.g.spot) / (fgRange(K) * 1.06);
      this.el.kmTarget.style.display = 'block';
      this.el.kmTarget.style.left = Math.min(100, need * 100) + '%';
      const win = Math.max(0.06, 0.2 + (K.kac - 40) * 0.0028 - fgDistance(st.g.spot) * 0.0022);
      this.el.kmZone.style.left = (50 - win * 50) + '%';
      this.el.kmZone.style.width = (win * 100) + '%';
    } else {
      this.el.kmTarget.style.display = 'none';
      this.el.kmZone.style.left = '35%'; this.el.kmZone.style.width = '30%';
    }
    this.el.kmNeedle.style.left = (((k.sg === 0 ? 0 : k.ac) + 1) * 50).toFixed(1) + '%';
    this.el.kmNeedle.style.opacity = k.sg === 0 ? 0.3 : 1;
    this.el.kmTip.textContent = this.input.isTouch ? 'TAP A' : 'SPACE / CLICK';
  }
}
