// Collects keyboard / mouse / touch / gamepad into one compact per-frame input.
import { canThrow, BTN_A, BTN_B, BTN_AIM } from './sim/live.js';

const KEY_MENU = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, Digit6: 6, Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4, Numpad5: 5, Numpad6: 6, KeyP: 7, KeyF: 8 };

export class Input {
  constructor(canvas, renderer, ui) {
    this.cv = canvas;
    this.r = renderer;
    this.ui = ui;
    this.keys = new Set();
    this.menuQ = [];
    this.aim = { on: false, x: 0, y: 0, px: 0, py: 0 };
    this.mouseA = false;
    this.stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this.touchA = false; this.touchB = false;
    this.aimTouch = -1;
    this.isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    this.st = null; this.local = 0;
    this.enabled = false;
    this.bind();
  }

  setContext(st, local) { this.st = st; this.local = local; }
  queueMenu(v) { this.menuQ.push(v); }

  localCanThrow() {
    const st = this.st;
    return !!(st && st.ph === 'PLAY' && st.pl && st.pl.off === this.local && st.pl.ph === 'live' && canThrow(st.pl));
  }

  toWorld(clientX, clientY) {
    const rect = this.cv.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * this.r.W;
    const py = ((clientY - rect.top) / rect.height) * this.cv.height;
    return this.r.toWorld(px, py);
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || e.target.tagName === 'INPUT') return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      const st = this.st;
      if (!st) return;
      let m = KEY_MENU[e.code] || 0;
      if (st.ph === 'PLAY' && m >= 1 && m <= 4) m += 20; // quick throw to receiver 1-4
      else if (st.ph === 'PLAY') m = 0;
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && (st.ph === 'PAT' || st.ph === 'OVER')) m = 1;
      if (st.ph === 'DRAFT') m = 0; // draft is mouse/touch driven
      if (e.code === 'KeyT' && st.ph === 'CALL') m = 9; // timeout
      if (m) this.queueMenu(m);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseA = false; this.aim.on = false; });

    const cv = this.cv;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'touch') { this.isTouch = true; this.ui.showTouch(true); }
      const rect = cv.getBoundingClientRect();
      const leftZone = e.pointerType === 'touch' && e.clientX - rect.left < rect.width * 0.42;
      if (leftZone && this.stick.id < 0) {
        this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
        this.ui.stickAt(e.clientX, e.clientY, 0, 0, true);
      } else if (this.localCanThrow()) {
        const [wx, wy] = this.toWorld(e.clientX, e.clientY);
        this.aim = { on: true, x: wx, y: wy };
        this.aimTouch = e.pointerId;
      } else if (e.button === 0 || e.pointerType === 'touch') {
        this.mouseA = true; this.aimTouch = e.pointerId;
      }
      cv.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    cv.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stick.id) {
        const dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
        const R = 46, l = Math.hypot(dx, dy) || 1, k = Math.min(1, l / R);
        this.stick.x = (dx / l) * k; this.stick.y = (dy / l) * k;
        this.ui.stickAt(this.stick.ox, this.stick.oy, this.stick.x * R, this.stick.y * R, true);
      } else if (this.aim.on && e.pointerId === this.aimTouch) {
        const [wx, wy] = this.toWorld(e.clientX, e.clientY);
        this.aim.x = wx; this.aim.y = wy;
      }
    });
    const up = (e) => {
      if (e.pointerId === this.stick.id) { this.stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 }; this.ui.stickAt(0, 0, 0, 0, false); }
      if (e.pointerId === this.aimTouch) {
        if (this.aim.on) { const [wx, wy] = this.toWorld(e.clientX, e.clientY); this.aim.x = wx; this.aim.y = wy; this.aimRelease = true; }
        this.aim.on = false; this.mouseA = false; this.aimTouch = -1;
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  }

  // Touch buttons call these.
  setTouchButton(which, down) { if (which === 'A') this.touchA = down; else this.touchB = down; }

  sample() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    let a = k.has('Space') || k.has('KeyJ') || this.mouseA || this.touchA;
    let b = k.has('KeyE') || k.has('KeyK') || k.has('ShiftLeft') || k.has('ShiftRight') || this.touchB;
    if (this.stick.id >= 0) { x = this.stick.x; y = this.stick.y; }
    // Gamepad.
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.2) { x = ax; y = ay; }
      const bt = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      if (bt(14)) x = -1; if (bt(15)) x = 1; if (bt(12)) y = -1; if (bt(13)) y = 1;
      a = a || bt(0); b = b || bt(1);
      const st = this.st;
      if (st && this.padPrev) {
        [2, 3, 4, 5].forEach((bi, n) => { if (bt(bi) && !this.padPrev[bi]) this.queueMenu(st.ph === 'PLAY' ? 21 + n : n + 1); });
        if (bt(9) && !this.padPrev[9] && (st.ph === 'PAT' || st.ph === 'OVER')) this.queueMenu(1);
      }
      this.padPrev = gp.buttons.map((q) => q.pressed);
      break;
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    const aimHeld = this.aim.on;
    let btn = (a ? BTN_A : 0) | (b ? BTN_B : 0) | (aimHeld ? BTN_AIM : 0);
    // A quick press+release between two frames still registers as one aim frame then release.
    if (this.aimRelease && !this.aimHeldSent) { btn |= BTN_AIM; this.aimHeldSent = true; }
    else if (this.aimRelease) { this.aimRelease = false; this.aimHeldSent = false; }
    else this.aimHeldSent = aimHeld;
    const menu = this.menuQ.length ? this.menuQ.shift() : 0;
    const clamp16 = (v) => Math.max(-32000, Math.min(32000, Math.round(v * 10)));
    return {
      mx: Math.round(x * 100), my: Math.round(y * 100), btn, menu,
      ax: clamp16(this.aim.x || 0), ay: clamp16(this.aim.y || 0),
    };
  }
}
