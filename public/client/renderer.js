import { TILE, TILES, VIEW_RADIUS, TEAM, TEAM_COLORS, MODES } from '../shared/constants.js';
import { tankByIndex, TANKS, PUBLIC_TANKS } from '../shared/tank-registry.js';
import { COSMETICS } from '../shared/cosmetics.js';
import { BOSS_BY_KEY } from '../shared/boss-registry.js';
import { SHAPES, SHAPE_KEYS, MOBS, MOB_KEYS, STRUCT_BY_CODE, HAZ, MAP_THEMES } from '../shared/entity-types.js';
import { BOSSES } from '../shared/boss-registry.js';
import { decodeTiles } from '../shared/map-generator.js';
import { drawTank, drawShape, drawMob, drawBoss, drawStruct, drawPickup, poly, shade, star } from './draw.js';
import { sfx } from './audio.js';
import { store } from './storage.js';

const LIGHT = {
  arena: { floor: '#dcdcdc', wall: '#a5a5ad', out: '#c2c2c7' },
  nexus: { floor: '#dcdcdc', wall: '#a5a5ad', out: '#c2c2c7' },
  maze: { floor: '#dcdcdc', wall: '#a5a5ad', out: '#c2c2c7' },
  classic: { floor: '#dadada', wall: '#a2a2aa', out: '#c0c0c5' },
  crystal: { floor: '#d7e5ec', wall: '#8eb0c3', out: '#bccdd6' },
  industrial: { floor: '#dad7d2', wall: '#a39c91', out: '#c4c0b9' },
  overgrown: { floor: '#d6e4d2', wall: '#8ea887', out: '#bfcdbb' },
  void: { floor: '#dcd7e9', wall: '#9d93ba', out: '#c4bfd3' },
  endless: { floor: '#d9d9df', wall: '#a3a0ae', out: '#c1c0c8' }
};

function hslHex(h) {
  const f = n => { const k = (n + h / 30) % 12; const a = 0.85 * Math.min(0.55, 1 - 0.55); const c = 0.55 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.snaps = [];
    this.offset = null;
    this.parts = [];
    this.beams = [];
    this.shake = 0;
    this.cam = { x: 0, y: 0, scale: 1 };
    this.trails = new Map();
    this.time = 0;
    this.me = { id: 0, team: -99 };
    this.minimap = null;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const q = store.settings.quality;
    this.dpr = Math.min(q === 'low' ? 1 : q === 'medium' ? 1.5 : 2, devicePixelRatio || 1);
    this.canvas.width = Math.floor(innerWidth * this.dpr);
    this.canvas.height = Math.floor(innerHeight * this.dpr);
  }

  setMap(m, mode, settings) {
    this.map = { w: m.w, h: m.h, tiles: decodeTiles(m.tiles), theme: m.theme, kind: m.kind, regions: m.regions || [], conveyors: new Map(m.conveyors || []) };
    this.mode = mode;
    this.fog = !!settings.fog && (m.kind === 'labyrinth');
    this.teams = !!(MODES[mode] && MODES[mode].teams);
    this.explored = new Uint8Array(m.w * m.h);
    this.snaps = [];
    this.offset = null;
    this.parts.length = 0;
    this.beams.length = 0;
    this.trails.clear();
    this.buildMinimap();
  }

  buildMinimap() {
    const { w, h } = this.map;
    const base = document.createElement('canvas');
    base.width = w; base.height = h;
    this.mmBase = base;
    const fog = document.createElement('canvas');
    fog.width = w; fog.height = h;
    const fc = fog.getContext('2d');
    fc.fillStyle = '#8c8c94';
    fc.fillRect(0, 0, w, h);
    this.mmFog = fog;
    this.paintMinimapBase();
  }

  paintMinimapBase() {
    const { w, h, tiles } = this.map;
    const c = this.mmBase.getContext('2d');
    const img = c.createImageData(w, h);
    const col = t => {
      switch (t) {
        case TILES.WALL: return [150, 150, 158];
        case TILES.BREAK: return [175, 150, 125];
        case TILES.CRYSTAL: return [110, 190, 230];
        case TILES.DOOR: return [200, 170, 60];
        case TILES.VINE: return [70, 150, 70];
        case TILES.ENERGY: return [140, 40, 50];
        case TILES.TELEPORT: return [170, 100, 255];
        case TILES.BASE_BLUE: return [160, 205, 228];
        case TILES.BASE_RED: return [232, 175, 178];
        case TILES.TEMP: return [180, 180, 200];
        default: return [214, 214, 216];
      }
    };
    for (let i = 0; i < tiles.length; i++) {
      const [r, g, b] = col(tiles[i]);
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    this.mmDirty = false;
  }

  applyTiles(tc) {
    if (!this.map || !tc) return;
    for (const [i, v] of tc) this.map.tiles[i] = v;
    this.mmDirty = true;
  }

  pushSnapshot(s) {
    const now = performance.now() / 1000;
    const off = now - s.tm;
    if (this.offset === null || Math.abs(off - this.offset) > 1) this.offset = off;
    else this.offset += (off - this.offset) * 0.06;
    const ents = new Map();
    for (const e of s.e) ents.set(e[1], e);
    this.snaps.push({ tm: s.tm, ents, cx: s.cx, cy: s.cy });
    if (this.snaps.length > 6) this.snaps.shift();
    if (s.me) this.me.team = s.me.team;
    this.me.id = s.y && s.y.id ? s.y.id : 0;
    if (s.fx) this.handleFx(s.fx);
  }

  colorFor(team) {
    if (team === TEAM.BOSS) return '#ff4d61';
    if (team === TEAM.ENV || team === TEAM.NEUTRAL) return '#ff9a3d';
    if (team === this.me.team) return TEAM_COLORS[0];
    if (this.teams && team >= 0 && team < 4) return team === this.me.team ? TEAM_COLORS[0] : TEAM_COLORS[1];
    return TEAM_COLORS[1];
  }

  teamColor(team) {
    if (this.teams && team >= 0 && team < 4) return TEAM_COLORS[team];
    return this.colorFor(team);
  }

  addParticle(p) {
    const max = store.settings.reducedEffects ? 160 : store.settings.quality === 'low' ? 260 : 700;
    if (this.parts.length >= max) this.parts.shift();
    p.t = 0;
    this.parts.push(p);
  }

  burst(x, y, n, color, speed = 160, size = 3, life = 0.5) {
    if (store.settings.reducedEffects) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
      this.addParticle({ k: 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.6), size, color });
    }
  }

  ring(x, y, r, color, life = 0.45, width = 4) { this.addParticle({ k: 'ring', x, y, r, life, color, width }); }

  addShake(amount, x, y) {
    if (store.settings.reducedMotion) return;
    const d = x === undefined ? 0 : Math.hypot(x - this.cam.x, y - this.cam.y);
    const f = Math.max(0, 1 - d / 1400);
    this.shake = Math.min(18, this.shake + amount * f * store.settings.shake);
  }

  handleFx(list) {
    for (const f of list) {
      const k = f[0];
      switch (k) {
        case 'muzzle': if (f[3] === this.me.id) sfx.shoot(); if (!store.settings.reducedEffects) this.addParticle({ k: 'dot', x: f[1], y: f[2], vx: 0, vy: 0, life: 0.07, size: 7, color: 'rgba(255,240,200,0.9)' }); break;
        case 'hit': this.burst(f[1], f[2], 3, f[3] ? '#ffffff' : '#ffe2a0', 140, 2, 0.25); if (f[3]) sfx.hit(); break;
        case 'pop': this.burst(f[1], f[2], Math.min(14, 4 + (f[3] / 6) | 0), '#ffd84d', 120, 4, 0.5); this.addParticle({ k: 'frag', x: f[1], y: f[2], r: f[3], sides: f[4] || 4, life: 0.3 }); break;
        case 'boom': this.ring(f[1], f[2], f[3], 'rgba(255,170,80,0.9)', 0.4, 5); this.burst(f[1], f[2], 10, '#ffb86b', 260, 4, 0.45); this.addShake(f[3] / 25, f[1], f[2]); sfx.boom(f[3] > 140); break;
        case 'death': this.ring(f[1], f[2], f[3] * 3, 'rgba(80,80,90,0.8)', 0.5, 4); this.burst(f[1], f[2], 24, '#6a6f7a', 300, 4, 0.7); this.addShake(6, f[1], f[2]); break;
        case 'beam': this.beams.push({ pts: f[1], team: f[2], heal: f[3], life: 0.14, t: 0 }); if (this.beams.length > 80) this.beams.shift(); break;
        case 'arc': this.addParticle({ k: 'bolt', x: f[1], y: f[2], x2: f[3], y2: f[4], life: 0.18, color: '#9ee8ff' }); break;
        case 'tele': this.ring(f[1], f[2], 50, 'rgba(176,107,255,0.9)', 0.4, 4); this.ring(f[3], f[4], 50, 'rgba(176,107,255,0.9)', 0.5, 4); break;
        case 'bossSpawn': this.ring(f[1], f[2], f[3] * 4, 'rgba(255,77,97,0.9)', 1.1, 8); this.ring(f[1], f[2], f[3] * 2, 'rgba(255,255,255,0.8)', 0.7, 5); this.addShake(14, f[1], f[2]); sfx.boss(); break;
        case 'bossDeath': for (let i = 0; i < 4; i++) this.ring(f[1], f[2], f[3] * (1.5 + i), 'rgba(255,216,77,0.9)', 0.6 + i * 0.25, 6); this.burst(f[1], f[2], 60, '#ffd84d', 500, 5, 1.2); this.addShake(18, f[1], f[2]); sfx.boom(true); break;
        case 'phase': this.ring(f[1], f[2], f[3] * 2.4, 'rgba(60,60,70,0.7)', 0.7, 6); this.addShake(5, f[1], f[2]); break;
        case 'heal': for (let i = 0; i < 3; i++) this.addParticle({ k: 'plus', x: f[1] + (Math.random() - 0.5) * 30, y: f[2] + (Math.random() - 0.5) * 30, vx: 0, vy: -40, life: 0.6, color: '#6fe36b' }); break;
        case 'reflect': case 'spark': this.burst(f[1], f[2], 4, '#dff6ff', 180, 2, 0.25); break;
        case 'rare': for (let i = 0; i < 10; i++) this.addParticle({ k: 'dot', x: f[1] + (Math.random() - 0.5) * 40, y: f[2] + (Math.random() - 0.5) * 40, vx: 0, vy: -60, life: 0.9, size: 3, color: '#c690ff' }); break;
        case 'pickup': sfx.pickup(); this.ring(f[1], f[2], 30, 'rgba(255,255,255,0.7)', 0.3, 3); break;
        case 'pulse': this.ring(f[1], f[2], f[3], 'rgba(111,227,107,0.85)', 0.5, 5); break;
        case 'emp': this.ring(f[1], f[2], f[3], 'rgba(120,200,255,0.9)', 0.5, 6); break;
        case 'dash': this.ring(f[1], f[2], 40, 'rgba(255,255,255,0.6)', 0.3, 3); break;
        case 'summon': this.ring(f[1], f[2], 160, 'rgba(255,200,80,0.7)', 0.5, 4); break;
        case 'meteor': this.addParticle({ k: 'line', x: f[1] - 140, y: f[2] - 260, x2: f[1], y2: f[2], life: 0.25, color: '#ffb86b' }); this.ring(f[1], f[2], 90, 'rgba(255,150,60,0.9)', 0.5, 6); this.burst(f[1], f[2], 14, '#ff9a3d', 260, 4, 0.6); this.addShake(5, f[1], f[2]); sfx.boom(false); break;
        case 'lvl': if (f[3] === this.me.id) { sfx.level(); this.ring(f[1], f[2], 70, 'rgba(255,216,77,0.9)', 0.6, 4); } break;
        case 'shieldHit': if (Math.random() < 0.3) this.addParticle({ k: 'hex', x: f[1], y: f[2], r: 150, life: 0.3, color: 'rgba(160,215,255,0.6)' }); break;
        case 'bolt': this.addParticle({ k: 'bolt', x: f[1] + 30, y: f[2] - 500, x2: f[1], y2: f[2], life: 0.25, color: '#fff7a0' }); this.ring(f[1], f[2], 80, 'rgba(255,247,160,0.9)', 0.35, 5); this.addShake(4, f[1], f[2]); break;
        case 'break': this.burst(f[1], f[2], 10, f[3] === TILES.VINE ? '#5fbf5a' : '#9a8670', 200, 4, 0.6); break;
        case 'ability': if (f[1] === this.me.id) sfx.ability(); break;
      }
    }
  }

  frameEntities(now) {
    const s = this.snaps;
    if (!s.length) return { list: [], alpha: 0, a: null, b: null };
    const rt = now - this.offset - 0.1;
    let a = s[s.length - 1], b = a;
    for (let i = s.length - 2; i >= 0; i--) {
      if (s[i].tm <= rt) { a = s[i]; b = s[i + 1]; break; }
      a = s[i]; b = s[i + 1] || s[i];
    }
    const span = b.tm - a.tm;
    const alpha = span > 0 ? Math.max(0, Math.min(1.2, (rt - a.tm) / span)) : 1;
    return { a, b, alpha };
  }

  render(dt, local, hudState) {
    const ctx = this.ctx;
    this.time += dt;
    const now = performance.now() / 1000;
    const W = this.canvas.width, H = this.canvas.height;
    if (!this.map || !this.snaps.length) { ctx.fillStyle = '#dcdcdc'; ctx.fillRect(0, 0, W, H); return null; }
    const latest = this.snaps[this.snaps.length - 1];
    const { a, b, alpha } = this.frameEntities(now);
    const lerp = (p, q, t) => p + (q - p) * t;
    const lerpA = (p, q, t) => { let d = q - p; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return p + d * t; };
    this.serverT = lerp(a.tm, b.tm, Math.min(1, alpha));
    const out = [];
    for (const [id, eb] of b.ents) {
      const ea = a.ents.get(id);
      const e = eb.slice();
      if (ea && ea[0] === eb[0] && eb[0] !== 8) {
        e[2] = lerp(ea[2], eb[2], alpha); e[3] = lerp(ea[3], eb[3], alpha);
        if (eb[0] === 0 || eb[0] === 2 || eb[0] === 3 || eb[0] === 4 || eb[0] === 6) e[4] = lerpA(ea[4] / 100, eb[4] / 100, alpha) * 100;
        if (eb[0] === 1) e[7] = lerpA(ea[7] / 100, eb[7] / 100, alpha) * 100;
        if (eb[0] === 0 && Array.isArray(ea[14]) && Array.isArray(eb[14]) && ea[14].length === eb[14].length) e[14] = eb[14].map((v, i) => lerpA(ea[14][i] / 100, v / 100, alpha) * 100);
      }
      out.push(e);
    }
    let me = null;
    const lt = latest.ents.get(this.me.id);
    if (lt) {
      const ext = Math.min(0.12, Math.max(0, now - this.offset - latest.tm));
      me = lt.slice();
      me[2] = lt[2] + lt[12] * ext;
      me[3] = lt[3] + lt[13] * ext;
      const prev = this.mePos;
      if (prev) { me[2] = prev.x + (me[2] - prev.x) * Math.min(1, dt * 18); me[3] = prev.y + (me[3] - prev.y) * Math.min(1, dt * 18); }
      this.mePos = { x: me[2], y: me[3] };
      if (local) me[4] = Math.atan2(local.ay, local.ax) * 100;
      for (let i = 0; i < out.length; i++) if (out[i][1] === this.me.id) out[i] = me;
    } else this.mePos = null;
    const fov = hudState && hudState.fov ? hudState.fov : 1;
    const cx = me ? me[2] : lerp(a.cx, b.cx, Math.min(1, alpha));
    const cy = me ? me[3] : lerp(a.cy, b.cy, Math.min(1, alpha));
    const R = 760 * fov * (hudState && hudState.dark ? 0.5 : 1);
    const scale = Math.max(Math.sqrt(W * H) / (2 * R * 0.8), W / (2 * VIEW_RADIUS * 0.98), H / (2 * VIEW_RADIUS * 0.78));
    this.cam.x = cx; this.cam.y = cy; this.cam.scale = scale;
    let sx = 0, sy = 0;
    if (this.shake > 0.1) { sx = (Math.random() - 0.5) * this.shake * this.dpr; sy = (Math.random() - 0.5) * this.shake * this.dpr; this.shake *= Math.exp(-dt * 9); } else this.shake = 0;
    const theme = LIGHT[this.map.theme] || LIGHT.arena;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.out;
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(scale, 0, 0, scale, W / 2 - cx * scale + sx, H / 2 - cy * scale + sy);
    const vx0 = cx - W / 2 / scale, vy0 = cy - H / 2 / scale, vx1 = cx + W / 2 / scale, vy1 = cy + H / 2 / scale;
    this.drawTiles(ctx, vx0, vy0, vx1, vy1, theme);
    if (this.fog) this.markExplored(cx, cy, R);
    const byType = [[], [], [], [], [], [], [], [], []];
    for (const e of out) byType[e[0]].push(e);
    for (const h of byType[8]) this.drawHazard(ctx, h, false);
    for (const e of byType[7]) drawPickup(ctx, e[4], e[2], e[3], this.time);
    for (const e of byType[2]) drawShape(ctx, SHAPES[SHAPE_KEYS[e[6]]] && { ...SHAPES[SHAPE_KEYS[e[6]]], kind: SHAPE_KEYS[e[6]] }, e[2], e[3], e[5], e[4] / 100, e[8]);
    for (const e of byType[2]) if (e[7] < 100) this.hpBar(ctx, e[2], e[3] + e[5] + 8, e[5] * 1.6, e[7] / 100, '#7fe08a');
    this.drawTrails(ctx, byType[1], dt);
    for (const e of byType[1]) this.drawBullet(ctx, e);
    for (const e of byType[6]) this.drawStructE(ctx, e);
    for (const e of byType[3]) {
      const m = MOBS[MOB_KEYS[e[8]]];
      if (!m) continue;
      const own = e[6] >= 0;
      const color = e[10] ? '#9b6bff' : own ? this.teamColor(e[6]) : (e[6] === TEAM.BOSS ? shade(m.color, 0) : m.color);
      drawMob(ctx, m, e[2], e[3], e[5], e[4] / 100, color, e[9]);
      if (e[7] < 100) this.hpBar(ctx, e[2], e[3] + e[5] + 8, e[5] * 1.8, e[7] / 100, '#ff9a6b');
    }
    for (const e of byType[0]) this.drawTankE(ctx, e, byType);
    for (const e of byType[4]) {
      const def = BOSSES[e[7]];
      if (!def) continue;
      let trail = null;
      if (def.shape === 'worm' || def.shape === 'serpent') {
        let tr = this.trails.get(e[1]);
        if (!tr) { tr = []; this.trails.set(e[1], tr); }
        const head = tr[0];
        if (!head || Math.hypot(head.x - e[2], head.y - e[3]) > e[5] * 0.55) { tr.unshift({ x: e[2], y: e[3], a: e[4] / 100 }); if (tr.length > 9) tr.pop(); }
        trail = tr;
      }
      drawBoss(ctx, def, e[2], e[3], e[5], e[4] / 100, this.time, e[9], trail);
    }
    for (const e of byType[5]) {
      const f = e[6];
      const def = BOSSES[e[7]] || { color: '#ff4d61' };
      ctx.beginPath(); ctx.arc(e[2], e[3], e[4], 0, Math.PI * 2);
      if (f & 1) {
        const g = 0.6 + 0.4 * Math.sin(this.time * 8);
        ctx.fillStyle = `rgba(255,236,120,${0.55 + 0.3 * g})`; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
      } else {
        ctx.fillStyle = f & 8 ? '#ffffff' : (f & 2 ? shade(def.color, 0.45 + 0.2 * Math.sin(this.time * 10)) : shade(def.color, -0.15)); ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = f & 4 ? '#9fd8ff' : shade(def.color, -0.5); ctx.stroke();
        if (e[5] < 100) this.hpBar(ctx, e[2], e[3] + e[4] + 7, e[4] * 2, e[5] / 100, '#ff6b7a');
      }
    }
    for (const h of byType[8]) this.drawHazard(ctx, h, true);
    this.drawBeams(ctx, dt);
    this.drawParticles(ctx, dt);
    for (const e of byType[0]) this.tankLabels(ctx, e, hudState);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (hudState && hudState.dark) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.18, W / 2, H / 2, Math.max(W, H) * 0.62);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    return { cx, cy, scale: scale / this.dpr, me, ents: out };
  }

  drawBackdrop(dt) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height, d = this.dpr || 1;
    if (!this.bd) {
      const rnd = (a, b) => a + Math.random() * (b - a);
      const shapes = [];
      for (let i = 0; i < 46; i++) shapes.push({ x: rnd(0, 1), y: rnd(0, 1), r: [11, 14, 22][i % 3], sides: [4, 3, 5][i % 3], a: rnd(0, 6.28), va: rnd(-0.4, 0.4), vx: rnd(-6, 6), vy: rnd(-6, 6) });
      const pool = PUBLIC_TANKS.filter(t => t.level >= 30);
      const tanks = [];
      const cols = ['#00b2e1', '#f14e54', '#00c864', '#b57cf0'];
      for (let i = 0; i < 7; i++) tanks.push({ def: pool[Math.floor(Math.random() * pool.length)], x: rnd(0.05, 0.95), y: rnd(0.05, 0.95), a: rnd(0, 6.28), heading: rnd(0, 6.28), color: cols[i % cols.length], swapAt: rnd(6, 14) });
      this.bd = { t: 0, shapes, tanks };
    }
    const bd = this.bd;
    bd.t += dt;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#cdcdcd';
    ctx.fillRect(0, 0, W, H);
    const gs = 30 * d, off = (bd.t * 8 * d) % gs;
    ctx.strokeStyle = 'rgba(0,0,0,0.075)';
    ctx.lineWidth = 1 * d;
    ctx.beginPath();
    for (let x = -off; x < W; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = -off; y < H; y += gs) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    const SC = { 4: ['#ffe869', '#bfae4e'], 3: ['#fc7677', '#bd585a'], 5: ['#768dfc', '#5869bd'] };
    for (const sh of bd.shapes) {
      sh.x = (sh.x + sh.vx * dt / (W / d) + 1) % 1; sh.y = (sh.y + sh.vy * dt / (H / d) + 1) % 1; sh.a += sh.va * dt;
      ctx.save();
      ctx.translate(sh.x * W, sh.y * H);
      poly(ctx, 0, 0, sh.r * d * 1.4, sh.sides, sh.a);
      ctx.fillStyle = SC[sh.sides][0]; ctx.fill();
      ctx.lineWidth = 3 * d; ctx.lineJoin = 'round'; ctx.strokeStyle = SC[sh.sides][1]; ctx.stroke();
      ctx.restore();
    }
    for (const tk of bd.tanks) {
      tk.heading += Math.sin(bd.t * 0.7 + tk.x * 10) * 0.6 * dt;
      tk.x = (tk.x + Math.cos(tk.heading) * 24 * dt / (W / d) + 1) % 1;
      tk.y = (tk.y + Math.sin(tk.heading) * 24 * dt / (H / d) + 1) % 1;
      tk.a += Math.sin(bd.t * 0.9 + tk.y * 7) * 0.8 * dt;
      tk.swapAt -= dt;
      if (tk.swapAt <= 0) { const pool = PUBLIC_TANKS.filter(t => t.level >= 30); tk.def = pool[Math.floor(Math.random() * pool.length)]; tk.swapAt = 8 + Math.random() * 8; }
      drawTank(ctx, tk.def, { x: tk.x * W, y: tk.y * H, angle: tk.a, r: 20 * d, color: tk.color, time: bd.t, idleSpin: true });
    }
    ctx.fillStyle = 'rgba(228,230,234,0.18)';
    ctx.fillRect(0, 0, W, H);
  }

  markExplored(cx, cy, R) {
    const { w, h } = this.map;
    const r = Math.ceil(R * 0.9 / TILE);
    const tx = Math.floor(cx / TILE), ty = Math.floor(cy / TILE);
    const fc = this.mmFog.getContext('2d');
    let changed = false;
    for (let y = Math.max(0, ty - r); y <= Math.min(h - 1, ty + r); y++) {
      for (let x = Math.max(0, tx - r); x <= Math.min(w - 1, tx + r); x++) {
        const i = y * w + x;
        if (!this.explored[i] && (x - tx) ** 2 + (y - ty) ** 2 <= r * r) { this.explored[i] = 1; fc.clearRect(x, y, 1, 1); changed = true; }
      }
    }
    return changed;
  }

  drawTiles(ctx, x0, y0, x1, y1, theme) {
    const { w, h, tiles } = this.map;
    const tx0 = Math.max(0, Math.floor(x0 / TILE)), ty0 = Math.max(0, Math.floor(y0 / TILE));
    const tx1 = Math.min(w - 1, Math.floor(x1 / TILE)), ty1 = Math.min(h - 1, Math.floor(y1 / TILE));
    ctx.fillStyle = theme.floor;
    ctx.fillRect(Math.max(0, x0), Math.max(0, y0), Math.min(w * TILE, x1) - Math.max(0, x0), Math.min(h * TILE, y1) - Math.max(0, y0));
    ctx.beginPath();
    const gs = 32;
    for (let x = Math.ceil(Math.max(0, x0) / gs) * gs; x <= Math.min(w * TILE, x1); x += gs) { ctx.moveTo(x, Math.max(0, y0)); ctx.lineTo(x, Math.min(h * TILE, y1)); }
    for (let y = Math.ceil(Math.max(0, y0) / gs) * gs; y <= Math.min(h * TILE, y1); y += gs) { ctx.moveTo(Math.max(0, x0), y); ctx.lineTo(Math.min(w * TILE, x1), y); }
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.stroke();
    const paths = {};
    const add = (k, x, y) => { (paths[k] = paths[k] || []).push(x, y); };
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const t = tiles[ty * w + tx];
      if (t !== TILES.FLOOR) add(t, tx * TILE, ty * TILE);
    }
    const t = this.time;
    const rects = (list, fill, stroke, inset = 0) => {
      if (!list) return;
      ctx.beginPath();
      for (let i = 0; i < list.length; i += 2) ctx.rect(list[i] + inset, list[i + 1] + inset, TILE - inset * 2, TILE - inset * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke(); }
    };
    rects(paths[TILES.BASE_BLUE], 'rgba(60,167,216,0.28)');
    rects(paths[TILES.BASE_RED], 'rgba(232,70,79,0.22)');
    rects(paths[TILES.MOSS], 'rgba(90,150,70,0.3)');
    rects(paths[TILES.ENERGY], `rgba(255,60,80,${0.18 + 0.1 * Math.sin(t * 4)})`);
    rects(paths[TILES.DOOR_OPEN], null, 'rgba(170,130,30,0.45)', 4);
    if (paths[TILES.CONVEYOR]) {
      const list = paths[TILES.CONVEYOR];
      rects(list, 'rgba(0,0,0,0.05)');
      ctx.beginPath();
      for (let i = 0; i < list.length; i += 2) {
        const idx = (list[i + 1] / TILE) * w + list[i] / TILE;
        const dir = this.map.conveyors.get(idx) || 0;
        const a = [0, Math.PI / 2, Math.PI, -Math.PI / 2][dir];
        const off = (t * 40) % 32;
        for (let k = -1; k < 2; k++) {
          const cx = list[i] + 32 + Math.cos(a) * (k * 32 + off - 16), cy = list[i + 1] + 32 + Math.sin(a) * (k * 32 + off - 16);
          ctx.moveTo(cx - Math.cos(a - 0.7) * 10, cy - Math.sin(a - 0.7) * 10); ctx.lineTo(cx, cy); ctx.lineTo(cx - Math.cos(a + 0.7) * 10, cy - Math.sin(a + 0.7) * 10);
        }
      }
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(160,120,20,0.5)'; ctx.stroke();
    }
    if (paths[TILES.TELEPORT]) {
      for (let i = 0; i < paths[TILES.TELEPORT].length; i += 2) {
        const x = paths[TILES.TELEPORT][i] + 32, y = paths[TILES.TELEPORT][i + 1] + 32;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x, y, 10 + k * 8, t * (2 + k) , t * (2 + k) + 4.2); ctx.lineWidth = 3; ctx.strokeStyle = `rgba(176,107,255,${0.8 - k * 0.2})`; ctx.stroke(); }
      }
    }
    rects(paths[TILES.WALL], theme.wall, shade(theme.wall, -0.22));
    if (paths[TILES.BREAK]) {
      rects(paths[TILES.BREAK], '#b8a690', '#8c7860');
      ctx.beginPath();
      const l = paths[TILES.BREAK];
      for (let i = 0; i < l.length; i += 2) { const x = l[i], y = l[i + 1]; ctx.moveTo(x + 14, y + 10); ctx.lineTo(x + 30, y + 30); ctx.lineTo(x + 24, y + 50); ctx.moveTo(x + 30, y + 30); ctx.lineTo(x + 50, y + 22); }
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(70,50,30,0.6)'; ctx.stroke();
    }
    if (paths[TILES.CRYSTAL]) rects(paths[TILES.CRYSTAL], `rgba(130,205,235,${0.8 + 0.1 * Math.sin(t * 2)})`, '#5aa6c8', 2);
    if (paths[TILES.DOOR]) {
      rects(paths[TILES.DOOR], this.map.theme === 'void' ? '#a88fd6' : '#d8b84a', this.map.theme === 'void' ? '#6b4fa8' : '#9a7c1c', 2);
    }
    if (paths[TILES.VINE]) {
      const l = paths[TILES.VINE];
      rects(l, '#7fb070', '#4f8045');
      ctx.beginPath();
      for (let i = 0; i < l.length; i += 2) for (let k = 0; k < 3; k++) { ctx.moveTo(l[i] + 18 + k * 14, l[i + 1] + 16 + (k % 2) * 20); ctx.arc(l[i] + 14 + k * 14, l[i + 1] + 16 + (k % 2) * 20, 5, 0, Math.PI * 2); }
      ctx.fillStyle = '#4e9a45'; ctx.fill();
    }
    if (paths[TILES.TEMP]) {
      rects(paths[TILES.TEMP], 'rgba(150,155,170,0.85)', '#6d7080', 3);
    }
  }

  hpBar(ctx, x, y, w, frac, color) {
    ctx.fillStyle = 'rgba(10,12,18,0.75)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y, w * Math.max(0, frac), 4);
  }

  drawTrails(ctx, bullets, dt) {
    if (!this.btr) this.btr = new Map();
    const tr = this.btr;
    const reduced = store.settings.reducedEffects;
    const now = this.time;
    for (const e of bullets) {
      const kind = e[6];
      if (kind === 1 || kind === 2 || kind === 3 || kind === 5) continue;
      let t = tr.get(e[1]);
      if (!t) { t = { pts: [], style: e[10] || 0, color: this.colorFor(e[5]), r: e[4] }; tr.set(e[1], t); }
      t.seen = now; t.r = e[4];
      const last = t.pts[t.pts.length - 1];
      if (!last || Math.hypot(last[0] - e[2], last[1] - e[3]) > 3) t.pts.push([e[2], e[3], now]);
      const maxLen = reduced ? 4 : t.style ? 12 : 8;
      while (t.pts.length > maxLen) t.pts.shift();
      if (!reduced && t.style && Math.random() < 0.35) this.trailParticle(t, e[2], e[3]);
    }
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [id, t] of tr) {
      if (now - t.seen > 0.25) { tr.delete(id); continue; }
      const fade = now - t.seen > 0.02 ? Math.max(0, 1 - (now - t.seen) / 0.25) : 1;
      const pts = t.pts;
      if (pts.length < 2) continue;
      for (let i = 1; i < pts.length; i++) {
        const f = i / pts.length;
        let col = t.color, w = t.r * (0.35 + 0.75 * f), alpha = 0.28 * f * fade;
        switch (t.style) {
          case 1: col = i > pts.length * 0.6 ? '#ffd23f' : '#ff6a2b'; alpha = 0.6 * f * fade; w *= 1.2; break;
          case 2: col = '#38f2ff'; alpha = 0.75 * f * fade; w *= 0.7; break;
          case 3: col = '#bfe9ff'; alpha = 0.6 * f * fade; break;
          case 4: col = '#8b919c'; alpha = 0.4 * f * fade; w *= 1.4; break;
          case 5: col = '#ffe680'; alpha = 0.55 * f * fade; w *= 0.8; break;
          case 6: col = `hsl(${(now * 240 + i * 28) % 360},90%,60%)`; alpha = 0.7 * f * fade; break;
        }
        ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
        if (t.style === 2) { ctx.globalAlpha = alpha * 0.35; ctx.lineWidth = w * 2.4; ctx.stroke(); }
      }
    }
    ctx.restore();
  }

  trailParticle(t, x, y) {
    const r = t.r;
    switch (t.style) {
      case 1: this.addParticle({ k: 'dot', x, y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40 - 20, life: 0.35, size: r * 0.45, color: Math.random() < 0.5 ? '#ff9a3d' : '#ffd23f' }); break;
      case 3: this.addParticle({ k: 'spark', x: x + (Math.random() - 0.5) * r, y: y + (Math.random() - 0.5) * r, life: 0.5, size: r * 0.5, color: '#e6f8ff' }); break;
      case 4: this.addParticle({ k: 'puff', x, y, life: 0.7, size: r * 0.7, color: '#9aa0aa' }); break;
      case 5: this.addParticle({ k: 'spark', x: x + (Math.random() - 0.5) * r * 2, y: y + (Math.random() - 0.5) * r * 2, life: 0.55, size: r * 0.6, color: '#ffd23f' }); break;
      case 6: this.addParticle({ k: 'dot', x, y, vx: 0, vy: 0, life: 0.4, size: r * 0.4, color: `hsl(${(this.time * 300) % 360},90%,60%)` }); break;
    }
  }

  killEffect(kx, x, y, r, color) {
    const rnd = (a, b) => a + Math.random() * (b - a);
    r = Math.max(14, r || 22);
    switch (kx) {
      case 1: {
        const cols = ['#ff4f6a', '#ffd23f', '#00c864', '#00b2e1', '#b57cf0', '#fc9a4a'];
        for (let i = 0; i < 46; i++) { const a = rnd(0, 6.28), s = rnd(120, 420); this.addParticle({ k: 'conf', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, rot: rnd(0, 6), vr: rnd(-12, 12), life: rnd(0.9, 1.5), size: rnd(4, 8), color: cols[i % cols.length] }); }
        break;
      }
      case 2: for (let i = 0; i < 3; i++) this.ring(x, y, r * (4 + i * 2.2), i === 1 ? 'rgba(255,255,255,0.9)' : color, 0.5 + i * 0.18, 8 - i * 2); this.addShake(6, x, y); break;
      case 3:
        for (let i = 0; i < 4; i++) { const ox = rnd(-r * 2, r * 2); this.addParticle({ k: 'bolt', x: x + ox + rnd(-60, 60), y: y - 520, x2: x + ox * 0.3, y2: y, life: 0.35 + i * 0.05, color: i % 2 ? '#fff7a0' : '#9ee8ff' }); }
        this.addParticle({ k: 'flash', x, y, r: r * 5, life: 0.25, color: 'rgba(255,255,220,0.8)' }); this.addShake(8, x, y); break;
      case 4: this.addParticle({ k: 'skull', x, y, vx: 0, vy: -45, life: 1.4, size: r * 1.3 }); this.burst(x, y, 14, '#3d4452', 220, 4, 0.6); break;
      case 5:
        for (let k = 0; k < 4; k++) {
          const fx = x + rnd(-r * 3, r * 3), fy = y + rnd(-r * 3, r);
          const col = ['#ff4f6a', '#ffd23f', '#38f2ff', '#b57cf0'][k];
          setTimeout(() => { for (let i = 0; i < 22; i++) { const a = i / 22 * 6.28, s = rnd(180, 260); this.addParticle({ k: 'dot', x: fx, y: fy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.8, size: 3.5, color: col }); } this.ring(fx, fy, 60, col, 0.4, 3); }, k * 160);
        }
        break;
      case 6:
        this.addParticle({ k: 'hole', x, y, r: r * 2.4, life: 1.3 });
        for (let i = 0; i < 30; i++) { const a = rnd(0, 6.28), d = rnd(r * 2, r * 6); this.addParticle({ k: 'suck', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, cx: x, cy: y, life: rnd(0.6, 1.1), size: rnd(2, 5), color: i % 3 ? '#6b4fa8' : '#1d2433' }); }
        this.addShake(5, x, y); break;
      default:
        this.ring(x, y, r * 3.2, color, 0.45, 5);
        for (let i = 0; i < 16; i++) { const a = rnd(0, 6.28), s = rnd(150, 380); this.addParticle({ k: 'shard', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, rot: rnd(0, 6), vr: rnd(-10, 10), life: rnd(0.5, 0.9), size: rnd(4, 8), color }); }
    }
  }

  drawBullet(ctx, e) {
    const [, , x, y, r, team, kind, ang, fx, shapeDrone] = e;
    const color = this.colorFor(team);
    const a = ang / 100;
    ctx.save();
    const fill = fx === 1 ? '#6fe36b' : color;
    const stroke = shade(fill.startsWith('#') ? fill : '#38a3ff', -0.4);
    const lw = Math.max(1.5, r * 0.22);
    if (kind === 1 || kind === 4) {
      if (shapeDrone) { poly(ctx, x, y, r, 4, a); }
      else poly(ctx, x, y, r * 1.15, 3, a);
    } else if (kind === 2) {
      star(ctx, x, y, r * 1.25, 3, 0.45, a);
    } else if (kind === 5) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = '#9aa3b0'; ctx.fillRect(0, -r * 0.3, r * 1.6, r * 0.6); ctx.restore();
      poly(ctx, x, y, r, 4, a);
    } else {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke();
    if (fx === 2) { ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.fillStyle = '#ffd08a'; ctx.fill(); }
    if (fx === 4) { ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(158,232,255,0.8)'; ctx.stroke(); }
    if (kind === 6) { ctx.beginPath(); ctx.arc(x, y, r * 1.3, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,200,120,0.5)'; ctx.stroke(); }
    ctx.restore();
  }

  drawStructE(ctx, e) {
    const [, , x, y, ang, r, team, hp, code, shield, flags, gens] = e;
    const kind = STRUCT_BY_CODE[code];
    const color = team >= 0 ? this.teamColor(team) : team === TEAM.BOSS ? '#9b6bff' : '#9aa3b0';
    drawStruct(ctx, kind, x, y, r, ang / 100, color, hp / 100, shield >= 0 ? shield / 100 : 0, flags, this.time, gens);
    if (hp < 100) this.hpBar(ctx, x, y + r * (kind === 'nexus' ? 1.45 : 1.2) + 6, r * 2, hp / 100, team === this.me.team ? '#5fd38b' : '#ff6b7a');
    if (kind === 'nexus' && shield > 0) this.hpBar(ctx, x, y + r * 1.45 + 14, r * 2, shield / 100, '#9fd8ff');
  }

  drawTankE(ctx, e, byType) {
    const [, id, x, y, ang, r, team, hp, defIdx, flags, level, swapped] = e;
    const def = tankByIndex(defIdx);
    const isMe = id === this.me.id;
    let color = isMe ? TEAM_COLORS[0] : this.colorFor(team);
    const skin = COSMETICS.skin[e[15] || 0];
    if (skin && skin.color && !this.teams) {
      color = skin.anim === 'rainbow' ? hslHex((this.time * 90 + id * 37) % 360) : skin.anim === 'pulse' ? shade(skin.color, 0.18 * Math.sin(this.time * 6)) : skin.color;
    }
    if (def.bossKey && BOSS_BY_KEY[def.bossKey]) {
      const bd = BOSS_BY_KEY[def.bossKey];
      let alpha2 = flags & 1 ? 0.35 : 1;
      ctx.save(); ctx.globalAlpha = alpha2;
      ctx.beginPath(); ctx.arc(x, y, r * 1.25, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = isMe ? 'rgba(0,178,225,0.8)' : 'rgba(241,78,84,0.75)'; ctx.setLineDash([14, 10]); ctx.lineDashOffset = -this.time * 40; ctx.stroke(); ctx.setLineDash([]);
      drawBoss(ctx, bd, x, y, r, ang / 100, this.serverT || this.time, flags & 128 ? 32 : 0, null);
      ctx.restore();
      star(ctx, x, y - r * 1.35 - 26, 16, 5, 0.45, -Math.PI / 2); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#c79f1d'; ctx.stroke();
      return;
    }
    let alpha = 1;
    if (flags & 1) alpha = isMe || team === this.me.team ? 0.35 : 0.2;
    if (flags & 4) alpha *= 0.55 + 0.45 * Math.abs(Math.sin(this.time * 8));
    if (flags & 16) color = '#9fd8ff';
    const turretAngles = Array.isArray(e[14]) ? e[14].map(v => v / 100) : null;
    if (flags & 32) { ctx.beginPath(); ctx.arc(x, y, r * 1.5, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,80,60,${0.15 + 0.1 * Math.sin(this.time * 12)})`; ctx.fill(); }
    if (flags & 64 && !store.settings.reducedEffects) this.addParticle({ k: 'dot', x, y, vx: 0, vy: 0, life: 0.2, size: r * 0.7, color: 'rgba(255,255,255,0.15)' });
    drawTank(ctx, def, { x, y, angle: ang / 100, r, color, time: this.serverT || this.time, alpha, swapped: !!swapped, flash: flags & 128, turretAngles });
    if (flags & 2) { ctx.beginPath(); ctx.arc(x, y, r * 1.55, 0, Math.PI * 2); ctx.fillStyle = 'rgba(120,200,255,0.12)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(160,220,255,0.7)'; ctx.stroke(); }
    if (flags & 8) { star(ctx, x, y - r - 30, 10, 5, 0.45, -Math.PI / 2); ctx.fillStyle = '#ffd84d'; ctx.fill(); }
  }

  tankLabels(ctx, e, hud) {
    const [, id, x, y, , r, team, hp, , flags, level] = e;
    if ((flags & 1) && id !== this.me.id && team !== this.me.team) return;
    const name = hud && hud.names ? hud.names.get(id) : null;
    if (id !== this.me.id && name) {
      ctx.font = '700 14px Ubuntu, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      const label = `${name}  ${level}`;
      ctx.strokeText(label, x, y - r - 12);
      ctx.fillStyle = '#ffffff'; ctx.fillText(label, x, y - r - 12);
    }
    if (hp < 100) this.hpBar(ctx, x, y + r + 9, r * 2, hp / 100, team === this.me.team || id === this.me.id ? '#5fd38b' : '#ff6b7a');
  }

  drawHazard(ctx, e, top) {
    const [, , x, y, kind, r, ang100, len, prog, w, env] = e;
    const a = ang100 / 100;
    const p = prog / 100;
    const warnColor = env ? '255,154,61' : '255,77,97';
    if (!top) {
      if (kind === HAZ.WARN_CIRCLE) {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${warnColor},${0.1 + 0.08 * p})`; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = `rgba(${warnColor},0.75)`; ctx.setLineDash([12, 8]); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(x, y, r * p, 0, Math.PI * 2); ctx.fillStyle = `rgba(${warnColor},0.22)`; ctx.fill();
      } else if (kind === HAZ.WARN_LINE) {
        const ww = Math.max(10, w || 16);
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.fillStyle = `rgba(${warnColor},0.12)`; ctx.fillRect(0, -ww, len, ww * 2);
        ctx.fillStyle = `rgba(${warnColor},0.28)`; ctx.fillRect(0, -ww, len * p, ww * 2);
        ctx.lineWidth = 2; ctx.strokeStyle = `rgba(${warnColor},0.8)`; ctx.setLineDash([14, 8]); ctx.strokeRect(0, -ww, len, ww * 2); ctx.setLineDash([]);
        ctx.restore();
      } else if (kind === HAZ.FIELD) {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = `rgba(200,60,255,${0.14 + 0.06 * Math.sin(this.time * 6)})`; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(220,120,255,0.6)'; ctx.stroke();
      } else if (kind === HAZ.BURN) {
        ctx.beginPath(); ctx.arc(x, y, r * (0.9 + 0.1 * Math.sin(this.time * 9 + x)), 0, Math.PI * 2); ctx.fillStyle = `rgba(255,110,40,${0.18 * (1 - p) + 0.06})`; ctx.fill();
      } else if (kind === HAZ.GRAVITY) {
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x, y, r * (1 - ((this.time * 0.6 + k / 4) % 1)), 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(176,107,255,0.45)'; ctx.stroke(); }
      } else if (kind === HAZ.PORTAL) {
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x, y, r * (0.4 + k * 0.3), this.time * 3 * (k % 2 ? 1 : -1), this.time * 3 * (k % 2 ? 1 : -1) + 4); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(176,107,255,0.8)'; ctx.stroke(); }
      }
    } else {
      if (kind === HAZ.LASER) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        const ww = w || 22;
        ctx.fillStyle = 'rgba(255,77,97,0.35)'; ctx.fillRect(0, -ww * 1.4, len, ww * 2.8);
        ctx.fillStyle = 'rgba(255,200,210,0.95)'; ctx.fillRect(0, -ww * 0.45, len, ww * 0.9);
        ctx.restore();
      } else if (kind === HAZ.SHOCK) {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.lineWidth = 16; ctx.strokeStyle = 'rgba(255,120,90,0.55)'; ctx.stroke();
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,240,220,0.9)'; ctx.stroke();
      }
    }
  }

  drawBeams(ctx, dt) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      if (b.t >= b.life) { this.beams.splice(i, 1); continue; }
      const al = 1 - b.t / b.life;
      const color = b.heal ? '111,227,107' : b.team === this.me.team ? '120,200,255' : b.team === TEAM.BOSS ? '255,90,110' : '255,120,130';
      ctx.beginPath();
      for (let k = 0; k < b.pts.length; k += 4) { ctx.moveTo(b.pts[k], b.pts[k + 1]); ctx.lineTo(b.pts[k + 2], b.pts[k + 3]); }
      ctx.lineCap = 'round';
      ctx.lineWidth = 12; ctx.strokeStyle = `rgba(${color},${0.25 * al})`; ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = `rgba(255,255,255,${0.9 * al})`; ctx.stroke();
    }
  }

  drawParticles(ctx, dt) {
    const ps = this.parts;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      ps[w++] = p;
      const f = 1 - p.t / p.life;
      switch (p.k) {
        case 'dot':
          p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92;
          ctx.globalAlpha = f; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + f * 0.5), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
          break;
        case 'ring':
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - f * 0.7), 0, Math.PI * 2); ctx.lineWidth = p.width * f + 0.5; ctx.strokeStyle = p.color; ctx.globalAlpha = f; ctx.stroke(); ctx.globalAlpha = 1;
          break;
        case 'hex':
          poly(ctx, p.x, p.y, p.r * (1.1 - f * 0.1), 6, 0); ctx.lineWidth = 3; ctx.strokeStyle = p.color; ctx.globalAlpha = f; ctx.stroke(); ctx.globalAlpha = 1;
          break;
        case 'frag':
          poly(ctx, p.x, p.y, p.r * (1 + (1 - f) * 0.6), p.sides, 0); ctx.globalAlpha = f * 0.5; ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.globalAlpha = 1;
          break;
        case 'plus':
          p.y += p.vy * dt; ctx.globalAlpha = f; ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 7, 4, 14); ctx.fillRect(p.x - 7, p.y - 2, 14, 4); ctx.globalAlpha = 1;
          break;
        case 'line':
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.lineWidth = 6 * f; ctx.strokeStyle = p.color; ctx.globalAlpha = f; ctx.stroke(); ctx.globalAlpha = 1;
          break;
        case 'conf': case 'shard':
          p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.95; p.vy = p.vy * 0.95 + (p.k === 'conf' ? 260 * dt : 0); p.rot += p.vr * dt;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, f * 1.5); ctx.fillStyle = p.color;
          if (p.k === 'conf') ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          else { ctx.beginPath(); ctx.moveTo(p.size, 0); ctx.lineTo(-p.size * 0.6, p.size * 0.5); ctx.lineTo(-p.size * 0.6, -p.size * 0.5); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke(); }
          ctx.restore();
          break;
        case 'spark':
          ctx.globalAlpha = f; ctx.fillStyle = p.color; ctx.beginPath();
          for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + this.time * 3; ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * p.size * 1.6 * f, p.y + Math.sin(a) * p.size * 1.6 * f); }
          ctx.lineWidth = 1.5; ctx.strokeStyle = p.color; ctx.stroke(); ctx.globalAlpha = 1;
          break;
        case 'puff':
          ctx.globalAlpha = f * 0.35; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.8 - f), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
          break;
        case 'flash':
          ctx.globalAlpha = f; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.2 - f * 0.4), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
          break;
        case 'skull': {
          p.y += p.vy * dt;
          const s2 = p.size;
          ctx.save(); ctx.translate(p.x, p.y); ctx.globalAlpha = Math.min(1, f * 2);
          ctx.fillStyle = '#f4f6fa'; ctx.strokeStyle = '#1d2433'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, -s2 * 0.15, s2 * 0.55, Math.PI, 0); ctx.lineTo(s2 * 0.4, s2 * 0.35); ctx.lineTo(-s2 * 0.4, s2 * 0.35); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#1d2433';
          ctx.beginPath(); ctx.arc(-s2 * 0.2, -s2 * 0.1, s2 * 0.13, 0, Math.PI * 2); ctx.arc(s2 * 0.2, -s2 * 0.1, s2 * 0.13, 0, Math.PI * 2); ctx.fill();
          ctx.fillRect(-s2 * 0.18, s2 * 0.18, s2 * 0.08, s2 * 0.17); ctx.fillRect(s2 * 0.1, s2 * 0.18, s2 * 0.08, s2 * 0.17);
          ctx.restore();
          break;
        }
        case 'hole': {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          g.addColorStop(0, `rgba(10,8,20,${0.95 * f})`); g.addColorStop(0.6, `rgba(70,40,120,${0.6 * f})`); g.addColorStop(1, 'rgba(70,40,120,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + 0.4 * Math.sin(Math.min(1, (1 - f) * 3) * 1.57)), 0, Math.PI * 2); ctx.fill();
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(this.time * 4); ctx.strokeStyle = `rgba(181,124,240,${f})`; ctx.lineWidth = 3;
          for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0, 0, p.r * (0.3 + k * 0.2), k * 2, k * 2 + 2.2); ctx.stroke(); }
          ctx.restore();
          break;
        }
        case 'suck': {
          const k2 = Math.min(1, 6 * dt);
          p.x += (p.cx - p.x) * k2; p.y += (p.cy - p.y) * k2;
          ctx.globalAlpha = f; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
          break;
        }
        case 'bolt': {
          ctx.beginPath(); ctx.moveTo(p.x, p.y);
          const n = 6;
          for (let k = 1; k < n; k++) { const t = k / n; ctx.lineTo(p.x + (p.x2 - p.x) * t + (Math.random() - 0.5) * 24, p.y + (p.y2 - p.y) * t + (Math.random() - 0.5) * 24); }
          ctx.lineTo(p.x2, p.y2);
          ctx.lineWidth = 3; ctx.strokeStyle = p.color; ctx.globalAlpha = f; ctx.stroke(); ctx.globalAlpha = 1;
          break;
        }
      }
    }
    ps.length = w;
  }

  drawMinimap(mc, mm, extras) {
    if (!this.map || !mc) return;
    if (this.mmDirty && performance.now() - (this.mmPainted || 0) > 500) { this.paintMinimapBase(); this.mmPainted = performance.now(); }
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = mc.clientWidth, H = mc.clientHeight;
    if (mc.width !== W * dpr) { mc.width = W * dpr; mc.height = H * dpr; }
    const c = mc.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const { w, h } = this.map;
    const s = Math.min(W / w, H / h);
    const ox = (W - w * s) / 2, oy = (H - h * s) / 2;
    c.imageSmoothingEnabled = false;
    c.globalAlpha = 0.9;
    c.drawImage(this.mmBase, ox, oy, w * s, h * s);
    c.globalAlpha = 1;
    if (this.fog) c.drawImage(this.mmFog, ox, oy, w * s, h * s);
    const toM = (x, y) => [ox + x / TILE * s, oy + y / TILE * s];
    if (extras && extras.ch) for (const [x, y, st] of extras.ch) {
      const [px, py] = toM(x, y);
      if (this.fog && !this.explored[Math.floor(y / TILE) * w + Math.floor(x / TILE)]) continue;
      c.beginPath(); c.arc(px, py, 4, 0, Math.PI * 2); c.lineWidth = 2; c.strokeStyle = st === 1 ? '#ff4d61' : st === 2 ? '#6b7385' : '#b06bff'; c.stroke();
    }
    if (mm) for (const m of mm) {
      const [px, py] = toM(m[1], m[2]);
      if (m[0] === 2) { c.fillStyle = m[3] >= 0 ? this.teamColor(m[3]) : '#b06bff'; c.fillRect(px - 2.5, py - 2.5, 5, 5); }
      else if (m[0] === 1) { poly(c, px, py, 5, 4, 0); c.fillStyle = '#ff4d61'; c.fill(); c.lineWidth = 1; c.strokeStyle = '#fff'; c.stroke(); }
      else {
        if (m[4] === this.me.id) continue;
        c.beginPath(); c.arc(px, py, 2.2, 0, Math.PI * 2); c.fillStyle = m[3] === this.me.team ? '#7cc4ff' : '#ff6b7a'; c.fill();
      }
    }
    const [mx, my] = toM(this.cam.x, this.cam.y);
    c.beginPath(); c.arc(mx, my, 3.4, 0, Math.PI * 2); c.fillStyle = '#1b1f27'; c.fill();
  }
}
