import { store } from './storage.js';

export const EVO_KEYS = ['y', 'u', 'i', 'o', 'h', 'j', 'k', 'l'];

export class Input {
  constructor(canvas, touchLayer, hooks) {
    this.canvas = canvas;
    this.touchLayer = touchLayer;
    this.hooks = hooks;
    this.keys = new Set();
    this.mouse = { x: innerWidth / 2 + 100, y: innerHeight / 2, down: false, right: false };
    this.autoFire = false;
    this.abilityHeld = false;
    this.touchMode = false;
    this.move = null;
    this.aim = null;
    this.touchAim = { x: 1, y: 0, active: false };
    this.enabled = false;
    this.bind();
  }

  bind() {
    addEventListener('keydown', e => {
      if (!this.enabled) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault();
      if (e.repeat) { this.keys.add(k); return; }
      this.keys.add(k);
      if (k === 'e') this.autoFire = !this.autoFire, this.hooks.onAutoFire(this.autoFire);
      if (k === ' ' || k === 'shift' || k === 'q') this.abilityHeld = true;
      if (k >= '1' && k <= '8') this.hooks.onStat(Number(k) - 1);
      const ei = EVO_KEYS.indexOf(k);
      if (ei >= 0) this.hooks.onEvolve(ei);
      if (k === 'tab') this.hooks.onToggle('players');
      if (k === 'escape') this.hooks.onToggle('pause');
      if (k === 't') this.hooks.onToggle('team');
      if (k === 'b') this.hooks.onToggle('sandbox');
      if (k === 'g') this.hooks.onToggle('doctrine');
      if (k === 'r') this.hooks.onRespawn();
      if (k === 'm') this.hooks.onToggle('minimap');
      if (k === 'n') this.hooks.onToggle('tree');
    });
    addEventListener('keyup', e => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === ' ' || k === 'shift' || k === 'q') this.abilityHeld = false;
    });
    addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; this.mouse.right = false; this.abilityHeld = false; });
    const c = this.canvas;
    c.addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.touchMode = false; });
    c.addEventListener('mousedown', e => {
      this.hooks.onGesture();
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) this.mouse.right = true;
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.mouse.down = false; if (e.button === 2) this.mouse.right = false; });
    c.addEventListener('contextmenu', e => e.preventDefault());
    const opts = { passive: false };
    c.addEventListener('touchstart', e => this.onTouch(e, 'start'), opts);
    c.addEventListener('touchmove', e => this.onTouch(e, 'move'), opts);
    c.addEventListener('touchend', e => this.onTouch(e, 'end'), opts);
    c.addEventListener('touchcancel', e => this.onTouch(e, 'end'), opts);
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('dblclick', e => e.preventDefault());
  }

  onTouch(e, phase) {
    if (!this.enabled) return;
    e.preventDefault();
    this.hooks.onGesture();
    this.touchMode = true;
    this.hooks.onTouchMode();
    for (const t of e.changedTouches) {
      if (phase === 'start') {
        const left = t.clientX < innerWidth * 0.45;
        if (left && !this.move) this.move = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
        else if (!left && !this.aim) this.aim = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
      } else if (phase === 'move') {
        if (this.move && t.identifier === this.move.id) { this.move.x = t.clientX; this.move.y = t.clientY; }
        if (this.aim && t.identifier === this.aim.id) { this.aim.x = t.clientX; this.aim.y = t.clientY; }
      } else {
        if (this.move && t.identifier === this.move.id) this.move = null;
        if (this.aim && t.identifier === this.aim.id) this.aim = null;
      }
    }
    this.hooks.onSticks(this.move, this.aim);
  }

  state(tankScreen, scale) {
    let mx = 0, my = 0;
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) my -= 1;
    if (k.has('s') || k.has('arrowdown')) my += 1;
    if (k.has('a') || k.has('arrowleft')) mx -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1;
    let ax, ay, fire = this.mouse.down || this.autoFire, alt = this.mouse.right;
    if (this.touchMode) {
      if (this.move) {
        const dx = this.move.x - this.move.ox, dy = this.move.y - this.move.oy, d = Math.hypot(dx, dy);
        if (d > 8) { const m = Math.min(1, d / 55); mx = dx / d * m; my = dy / d * m; }
      }
      if (this.aim) {
        const dx = this.aim.x - this.aim.ox, dy = this.aim.y - this.aim.oy, d = Math.hypot(dx, dy);
        if (d > 10) { this.touchAim = { x: dx / d, y: dy / d, active: true }; }
        fire = this.autoFire || d > 10 || !!this.aim;
      } else fire = this.autoFire && this.touchAim.active;
      const reach = Math.min(innerWidth, innerHeight) * 0.42 / scale;
      ax = this.touchAim.x * reach; ay = this.touchAim.y * reach;
    } else {
      ax = (this.mouse.x - tankScreen.x) / scale;
      ay = (this.mouse.y - tankScreen.y) / scale;
    }
    return { mx, my, ax, ay, fire, alt, ability: this.abilityHeld };
  }
}

export function touchPreferred() {
  const pref = store.settings.touch;
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}
