// Canvas renderer: low internal resolution, nearest-neighbor upscaled for crisp pixels.
import { FIELD_W, MID } from '../sim/core.js';
import { I, canThrow } from '../sim/live.js';
import { drawText, drawTextV, textWidth } from './font.js';
import { teamSprites, skinFor, SW, SH } from './sprites.js';

export const H = 248;
export const TOP = 24;          // screen y of the far sideline
export const SX = 8, SY = 4;    // pixels per yard (x squashed view in y)
const FX0 = -20, FX1 = 120;     // pre-rendered field extent in yards

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.W = 426;
    this.camX = 50;
    this.camTarget = 50;
    this.field = this.buildField();
    this.blink = 0;
    this.shake = 0; this.shakeMag = 0;
    this.parts = [];   // world-space particles (dust, confetti)
    this.texts = [];   // floating callouts
    this.trail = [];   // recent ball positions while in flight
    this.lastT = performance.now();
    this.resize();
  }

  resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const aspect = vw / vh;
    this.W = Math.max(300, Math.min(600, Math.round(H * aspect)));
    this.cv.width = this.W;
    this.cv.height = H;
    this.ctx.imageSmoothingEnabled = false;
    this.cssScale = Math.min(vw / this.W, vh / H);
  }

  // Screen <-> world helpers (screen = internal canvas pixels).
  toScreen(x, y) { return [Math.round((x - this.camX) * SX + this.W / 2), Math.round(TOP + y * SY)]; }
  toWorld(px, py) { return [this.camX + (px - this.W / 2) / SX, (py - TOP) / SY]; }

  buildField() {
    const w = (FX1 - FX0) * SX, cv = document.createElement('canvas');
    cv.width = w; cv.height = H;
    const c = cv.getContext('2d');
    const px = (x) => Math.round((x - FX0) * SX);
    c.fillStyle = '#1d5e2c'; c.fillRect(0, 0, w, H);
    // Crowd/sideline bands.
    c.fillStyle = '#163f22'; c.fillRect(0, 0, w, TOP - 2); c.fillRect(0, TOP + FIELD_W * SY + 2, w, H);
    for (let x = 0; x < w; x += 3) {
      for (let y = 2; y < TOP - 8; y += 3) {
        const v = (x * 13 + y * 7) % 11;
        c.fillStyle = v < 3 ? '#2a5a3a' : v < 5 ? '#3b6e4a' : v < 6 ? '#7a8f6a' : '#1f4a2d';
        c.fillRect(x, y, 2, 2);
      }
    }
    // Grass stripes every 5 yards.
    for (let x = -10; x < 110; x += 5) {
      c.fillStyle = ((x + 10) / 5) % 2 ? '#2f8a3e' : '#2a7f39';
      c.fillRect(px(x), TOP, 5 * SX, Math.round(FIELD_W * SY));
    }
    c.fillStyle = '#ffffff';
    const fy0 = TOP, fy1 = TOP + Math.round(FIELD_W * SY);
    c.fillRect(px(-10), fy0 - 1, 120 * SX, 1); c.fillRect(px(-10), fy1, 120 * SX, 1);
    for (let x = 0; x <= 100; x += 5) c.fillRect(px(x), fy0, 1, fy1 - fy0);
    c.fillRect(px(-10), fy0, 1, fy1 - fy0); c.fillRect(px(110), fy0, 1, fy1 - fy0);
    // Hash marks every yard.
    c.fillStyle = 'rgba(255,255,255,0.75)';
    for (let x = 1; x < 100; x++) {
      if (x % 5 === 0) continue;
      const sx = px(x);
      c.fillRect(sx, fy0, 1, 2); c.fillRect(sx, fy1 - 2, 1, 2);
      c.fillRect(sx, TOP + Math.round((MID - 3.1) * SY), 1, 2); c.fillRect(sx, TOP + Math.round((MID + 3.1) * SY) - 1, 1, 2);
    }
    // Yard numbers.
    for (let x = 10; x <= 90; x += 10) {
      const n = String(x <= 50 ? x : 100 - x);
      const tw = textWidth(n, 2);
      drawText(c, n, px(x) - tw / 2, fy0 + 12, 'rgba(255,255,255,0.85)', 2);
      drawText(c, n, px(x) - tw / 2, fy1 - 22, 'rgba(255,255,255,0.85)', 2);
    }
    return cv;
  }

  updateCamera(st) {
    const pl = st.pl;
    let t = this.camTarget;
    if (st.ph === 'PLAY' && pl) {
      const b = pl.b;
      t = b.x + (pl.ph === 'pre' ? 10 : pl.k === 'ret' ? 0 : 6);
      // Look ahead of a ball carrier in the open field.
      if (pl.car >= 0 && (pl.pm || pl.k === 'ret')) { const c = pl.e[pl.car]; t = c.x + c.vx * 0.6 + (c.s === 0 ? 5 : -5); }
    } else if (st.ph === 'KICK' && st.kick) {
      const k = st.kick;
      t = k.fl ? k.fl.sx + (k.fl.tx - k.fl.sx) * Math.min(1, k.fl.f / k.fl.F) : k.ty === 'KO' ? k.kx + 10 : k.kx + 4;
    } else if ((st.ph === 'CALL' || st.ph === 'PAT') && st.g) t = (st.g.tp || st.ph === 'PAT' ? 97 : st.g.spot) + 10;
    else if (st.ph === 'DRAFT' || st.ph === 'DRAFT_DONE' || st.ph === 'HALF' || st.ph === 'OVER') t = 50;
    const half = this.W / 2 / SX;
    t = Math.max(-14 + half, Math.min(114 - half, t));
    this.camTarget = t;
    this.camX += (t - this.camX) * 0.12;
  }

  draw(st, view) {
    const ctx = this.ctx, W = this.W;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    this.blink++;
    this.updateCamera(st);
    // Screen shake after big hits.
    let ox = 0, oy = 0;
    if (this.shake > 0) {
      this.shake -= dt;
      const m = this.shakeMag * Math.min(1, this.shake * 8);
      ox = Math.round((Math.random() * 2 - 1) * m); oy = Math.round((Math.random() * 2 - 1) * m);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#163f22'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(1, 0, 0, 1, ox, oy);
    // Field.
    const sx0 = Math.round((this.camX - FX0) * SX - W / 2);
    ctx.drawImage(this.field, sx0, 0, W, H, 0, 0, W, H);

    const offT = st.pl ? st.pl.off : st.kick ? st.kick.tm : st.pat ? st.pat.team : st.g ? st.g.poss : 0;
    this.drawEndZones(st, offT);

    if (st.g && (st.ph === 'CALL' || (st.ph === 'PLAY' && st.pl && st.pl.k === 'scrim') || st.ph === 'PAT')) {
      const los = st.pl ? st.pl.los : st.g.spot;
      this.vline(los, '#3b82f6');
      const fd = st.g.spot + st.g.togo;
      if (!st.g.tp && fd < 100) this.vline(fd, '#facc15');
    }
    this.drawPosts();

    if (st.pl) this.drawPlay(st, view);
    if (st.ph === 'KICK' && st.kick && st.kick.fl) this.drawFGBall(st.kick.fl);
    this.drawFx(dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---- Juice: called once per newly simulated sim event. ----
  event(e, st) {
    const has = e.x !== undefined;
    const hit = (mag, sec) => { if (mag >= this.shakeMag || this.shake <= 0) { this.shakeMag = mag; this.shake = sec; } };
    switch (e.k) {
      case 'tackle': this.dust(e.x, e.y, 7); hit(1.5, 0.12); if (e.sack) this.say(e.x, e.y, 'SACK!', '#f87171'); break;
      case 'bigtackle': this.dust(e.x, e.y, 14); hit(3, 0.25); this.say(e.x, e.y, e.sack ? 'SACK!' : 'BOOM!', '#f87171'); break;
      case 'broken': this.dust(e.x, e.y, 4); this.say(e.x, e.y, 'BROKEN TACKLE!', '#fde047'); break;
      case 'juke': this.say(e.x, e.y, 'JUKE!', '#fde047'); break;
      case 'int': this.say(e.x, e.y, 'PICKED!', '#f87171'); hit(2, 0.2); break;
      case 'pbu': this.dust(e.x, e.y, 4); this.say(e.x, e.y, 'SWATTED!', '#93c5fd'); break;
      case 'drop': this.say(e.x, e.y, 'DROPPED!', '#cbd5e1'); break;
      case 'fumble': this.dust(e.x, e.y, 10); this.say(e.x, e.y, 'FUMBLE!', '#f87171'); hit(3, 0.25); break;
      case 'dive': if (has) this.dust(e.x, e.y, 3); break;
      case 'td': if (has) { const t = st.teams[e.tm]; this.confetti(e.x, e.y, t ? [t.c1, t.c2, '#fde047'] : ['#fde047']); hit(2, 0.3); } break;
    }
  }

  dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = 1.5 + Math.random() * 3;
      this.parts.push({ x, y, z: 0.2, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: 2 + Math.random() * 3, g: 14, life: 0.45 + Math.random() * 0.3, col: Math.random() < 0.5 ? '#b9a27a' : '#5f8f4a' });
    }
  }

  confetti(x, y, cols) {
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * 6.283, s = 2 + Math.random() * 7;
      this.parts.push({ x, y, z: 1, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: 6 + Math.random() * 8, g: 9, life: 1.4 + Math.random() * 1.2, col: cols[i % cols.length], drift: 1 });
    }
  }

  say(x, y, text, col) {
    if (this.texts.length > 3) this.texts.shift();
    this.texts.push({ x, y, text, col, life: 1.0 });
  }

  drawFx(dt) {
    const c = this.ctx;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.g * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
      if (p.drift) { p.vx *= 0.985; p.vy *= 0.985; if (p.vz < -1.5) p.vz = -1.5; }
      const [sx, sy] = this.toScreen(p.x, p.y);
      c.fillStyle = p.col;
      c.fillRect(sx, sy - Math.round(p.z * SY * 1.6), p.drift ? 2 : 1, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) { this.texts.splice(i, 1); continue; }
      const [sx, sy] = this.toScreen(t.x, t.y);
      const rise = Math.round((1 - t.life) * 14);
      const w = textWidth(t.text);
      const x = Math.max(2, Math.min(this.W - w - 2, Math.round(sx - w / 2))), y = Math.max(TOP + 8, sy - SH - 14 - rise);
      if (t.life < 0.25 && (this.blink & 2)) continue;
      drawText(c, t.text, x + 1, y + 1, 'rgba(0,0,0,0.7)');
      drawText(c, t.text, x, y, t.col);
    }
  }

  vline(x, col) {
    const [sx] = this.toScreen(x, 0);
    if (sx < -2 || sx > this.W + 2) return;
    this.ctx.fillStyle = col;
    this.ctx.fillRect(sx, TOP, 1, Math.round(FIELD_W * SY));
  }

  drawEndZones(st, offT) {
    const ctx = this.ctx;
    const teams = st.teams;
    for (const [x0, ti] of [[-10, offT], [100, 1 - offT]]) {
      const [a] = this.toScreen(x0, 0), [b] = this.toScreen(x0 + 10, 0);
      if (b < 0 || a > this.W) continue;
      const t = teams[ti];
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = t.c1;
      ctx.fillRect(a + 1, TOP, b - a - 1, Math.round(FIELD_W * SY));
      ctx.globalAlpha = 1;
      const name = (t.abbr || t.name || '').slice(0, 10);
      const scale = 2;
      const hgt = name.length * 6 * scale;
      drawTextV(ctx, name, Math.round((a + b) / 2 - 3), Math.round(TOP + (FIELD_W * SY - hgt) / 2), t.c2, scale);
    }
  }

  drawPosts() {
    const ctx = this.ctx;
    for (const gx of [-10, 110]) {
      const [x, y1] = this.toScreen(gx, MID - 3.1), [, y2] = this.toScreen(gx, MID + 3.1);
      if (x < -5 || x > this.W + 5) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 2, y1, 2, y2 - y1);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(x, y1 - 26, 1, 26); ctx.fillRect(x, y2 - 26, 1, 26);
      ctx.fillRect(x, y1 - 10, 1, y2 - y1);
      ctx.fillRect(x, Math.round((y1 + y2) / 2) - 10, 1, 10);
    }
  }

  drawPlay(st, view) {
    const ctx = this.ctx, pl = st.pl, e = pl.e;
    const local = view.local;
    const order = e.map((_, i) => i).sort((a, b) => e[a].y - e[b].y);
    // Shadows.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (const p of e) {
      const [x, y] = this.toScreen(p.x, p.y);
      if (x < -10 || x > this.W + 10) continue;
      ctx.fillRect(x - 3, y - 1, 7, 2);
    }
    const b = pl.b;
    if ((b.st !== 'held' || b.h < 0) && b.st !== 'gone') {
      const [bx, by] = this.toScreen(b.x, b.y);
      ctx.fillRect(bx - 1, by - 1, 3, 1);
    }
    const localSide = pl.off === local ? 0 : pl.def === local ? 1 : -1;
    const ctrl = localSide >= 0 ? pl.ctrl[localSide] : -1;
    // Ring under the player you control.
    if (ctrl >= 0 && pl.ph !== 'dead' && pl.ph !== 'scene' && e[ctrl]) {
      const [x, y] = this.toScreen(e[ctrl].x, e[ctrl].y);
      ctx.fillStyle = 'rgba(253,224,71,0.85)';
      ctx.fillRect(x - 3, y - 2, 7, 1); ctx.fillRect(x - 3, y + 1, 7, 1); ctx.fillRect(x - 5, y - 1, 2, 2); ctx.fillRect(x + 4, y - 1, 2, 2);
    }
    const throwing = localSide === 0 && pl.k === 'scrim' && pl.ph === 'live' && canThrow(pl);
    for (const i of order) {
      const p = e[i];
      const [x, y] = this.toScreen(p.x, p.y);
      if (x < -12 || x > this.W + 12) continue;
      const t = st.teams[p.tm];
      const spr = teamSprites(t.c1, t.c2);
      const skin = skinFor(p.num, p.tm);
      const mirror = p.fx < 0;
      if (p.st === 2) {
        const [sx, sy, w, h] = spr.down(mirror, skin);
        ctx.drawImage(spr.canvas, sx, sy, w, h, x - 6, y - 5, w, h);
      } else {
        const moving = Math.abs(p.vx) + Math.abs(p.vy) > 0.6;
        const f = moving ? Math.floor(p.anim * 2.2) % 4 : 0;
        const [sx, sy] = spr.frame(f, mirror, skin);
        const lean = p.st === 4 ? 3 : 0;
        ctx.drawImage(spr.canvas, sx, sy, SW, SH, x - 4, y - SH + lean, SW, SH);
      }
      if (i === ctrl && pl.ph !== 'dead' && pl.ph !== 'scene') {
        ctx.fillStyle = this.blink % 30 < 22 ? '#fde047' : '#ffffff';
        const ty = y - SH - 5;
        ctx.fillRect(x - 2, ty, 5, 1); ctx.fillRect(x - 1, ty + 1, 3, 1); ctx.fillRect(x, ty + 2, 1, 1);
      }
      if (b.st === 'held' && b.h === i) this.drawBall(p.x + p.fx * 0.35, p.y, 0.9);
    }
    if (b.st === 'held' && b.h < 0) this.drawBall(b.x, b.y, 0.2); // on the ground before the snap
    // Fading trail behind a ball in flight.
    if (b.st === 'air' || b.st === 'kick' || b.st === 'pitch') {
      const [tx, ty] = this.toScreen(b.x, b.y);
      this.trail.push([tx, ty - Math.round(b.z * SY * 1.6) - 2]);
      if (this.trail.length > 9) this.trail.shift();
      for (let k = 0; k < this.trail.length - 1; k++) {
        ctx.fillStyle = `rgba(255,255,255,${(0.08 + (k / this.trail.length) * 0.4).toFixed(2)})`;
        ctx.fillRect(this.trail[k][0], this.trail[k][1], 2, 1);
      }
    } else if (this.trail.length) this.trail.length = 0;
    if (b.st !== 'held' && b.st !== 'dead' && b.st !== 'gone') this.drawBall(b.x, b.y, b.z);
    if (b.st === 'dead' && pl.car < 0) this.drawBall(b.x, b.y, 0.2);

    // Passing aids for the local quarterback.
    if (throwing) {
      if (view.showLabels) {
        [['1', I.WR1], ['2', I.WR2], ['3', I.TE], ['4', I.RB]].forEach(([n, idx]) => {
          const r = e[idx];
          if (r.a && (r.a.t === 'block' || r.a.t === 'rblock')) return;
          const [x, y] = this.toScreen(r.x, r.y);
          ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 3, y - SH - 9, 7, 7);
          drawText(ctx, n, x - 1, y - SH - 8, '#fde047');
        });
      }
      if (view.aim && view.aim.on) this.drawAim(e[I.QB], view.aim.x, view.aim.y);
    }
    // Ball in the air: landing marker for everyone.
    if (b.st === 'air' || b.st === 'kick') {
      const [x, y] = this.toScreen(b.tx, b.ty);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.strokeRect(x - 3, y - 2, 7, 4);
    }
  }

  drawBall(x, y, z) {
    const [sx, sy] = this.toScreen(x, y);
    const zy = sy - Math.round(z * SY * 1.6) - 3;
    const c = this.ctx;
    c.fillStyle = '#7c3f12'; c.fillRect(sx - 1, zy, 4, 2);
    c.fillStyle = '#a0522d'; c.fillRect(sx, zy - 1, 2, 1); c.fillRect(sx, zy + 2, 2, 1);
    c.fillStyle = '#fff'; c.fillRect(sx + 1, zy, 1, 1);
  }

  drawAim(qb, ax, ay) {
    const c = this.ctx;
    const [x0, y0] = this.toScreen(qb.x, qb.y);
    const [x1, y1] = this.toScreen(ax, ay);
    const n = Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0) / 6));
    const d = Math.hypot(ax - qb.x, ay - qb.y);
    const pk = Math.min(1.5 + d * 0.12, 9) * SY * 1.6;
    c.fillStyle = '#fde047';
    for (let k = 1; k < n; k++) {
      const u = k / n;
      const px = x0 + (x1 - x0) * u, py = y0 + (y1 - y0) * u - 4 * pk * u * (1 - u) - 6 * (1 - u);
      if ((k + (this.blink >> 2)) % 2 === 0) c.fillRect(Math.round(px), Math.round(py), 2, 2);
    }
    c.strokeStyle = '#fde047';
    c.strokeRect(x1 - 4, y1 - 2, 9, 5);
  }

  drawFGBall(fl) {
    const u = Math.min(1, fl.f / fl.F);
    const x = fl.sx + (fl.tx - fl.sx) * u, y = fl.sy + (fl.ty - fl.sy) * u;
    const z = 4 * fl.pk * u * (1 - u) * (fl.f > fl.F ? 0 : 1) + (fl.f > fl.F ? 0.2 : 0);
    const [sx, sy] = this.toScreen(x, y);
    this.ctx.fillStyle = 'rgba(0,0,0,0.28)';
    this.ctx.fillRect(sx - 1, sy - 1, 3, 1);
    this.drawBall(x, y, z);
  }
}
