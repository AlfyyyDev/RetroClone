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
    this.blink++;
    this.updateCamera(st);
    // Field.
    const sx0 = Math.round((this.camX - FX0) * SX - W / 2);
    ctx.drawImage(this.field, sx0, 0, W, H, 0, 0, W, H);

    const offT = st.pl ? st.pl.off : st.kick ? st.kick.tm : st.g ? st.g.poss : 0;
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
    if (b.st !== 'held' && b.st !== 'gone') {
      const [bx, by] = this.toScreen(b.x, b.y);
      ctx.fillRect(bx - 1, by - 1, 3, 1);
    }
    const localSide = pl.off === local ? 0 : pl.def === local ? 1 : -1;
    const ctrl = localSide >= 0 ? pl.ctrl[localSide] : -1;
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
    if (b.st !== 'held' && b.st !== 'dead' && b.st !== 'gone') this.drawBall(b.x, b.y, b.z);
    if (b.st === 'dead' && pl.car < 0) this.drawBall(b.x, b.y, 0.2);

    // Passing aids for the local quarterback.
    if (localSide === 0 && pl.k === 'scrim' && canThrow(pl)) {
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
