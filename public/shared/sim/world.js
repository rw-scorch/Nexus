import { MODES, TILE, DT, TEAM, TILES, isSolidTile, MAX_LEVEL, xpForLevel, levelForXp, DEFAULT_SETTINGS, MAX_BULLETS, MAX_MOBS, STAT_MAX } from '../constants.js';
import { makeRng } from '../rng.js';
import { generateMap, tileIndexAt } from '../map-generator.js';
import { TANKS, TANKS_BY_ID, tankByIndex, BASIC_INDEX, SECRET_IDS } from '../tank-registry.js';
import { SHAPES, MOBS, STRUCTURES, PICKUPS } from '../entity-types.js';
import { BASE } from '../weapon-registry.js';
import { Grid } from './grid.js';
import { updateTankWeapons, updateBullet, bulletWall, bulletHitTarget, bulletVsBullet, explodeAt, updateMobWeapons } from './combat.js';
import { updateBot, updateMob } from './ai.js';
import { updateBoss, bossDamaged, bossKilled, spawnBoss } from './bosses.js';
import { updateAbilities, useAbility } from './abilities.js';
import { createMode } from './modes.js';

const isPlayerTeam = t => t >= 0;

export class World {
  constructor({ mode = 'ffa', seed = 1, settings = {} } = {}) {
    this.mode = mode;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.seed = seed >>> 0;
    this.rng = makeRng(this.seed ^ 0x9e3779b9);
    this.map = generateMap(mode, this.seed, this.settings.theme, this.settings.customMap || null);
    this.tiles = this.map.tiles;
    this.w = this.map.w;
    this.h = this.map.h;
    this.W = this.w * TILE;
    this.H = this.h * TILE;
    this.tileHp = new Map();
    this.tileTemp = new Map();
    this.vineRegrow = new Map();
    this.ents = [];
    this.byId = new Map();
    this.nextId = 1;
    this.players = new Map();
    this.nextPid = 1;
    this.time = 0;
    this.tick = 0;
    this.events = [];
    this.fx = [];
    this.tileChanges = [];
    this.timers = [];
    this.grid = new Grid(160, this.W, this.H);
    this.stamp = 1;
    this.global = { reloadMul: 1, xpMul: 1, shapeMul: 1, envOffUntil: 0, darkness: null, overchargeUntil: 0, surgeUntil: 0, bountyId: 0, bountyUntil: 0 };
    this.counts = { bullet: 0, mob: 0, shape: 0 };
    this.pathCache = new Map();
    this.bossesDefeated = 0;
    this.matchOver = null;
    this.logic = createMode(this);
    this.logic.init();
  }

  add(e) {
    e.id = this.nextId++;
    e.dead = false;
    e.vx = e.vx || 0; e.vy = e.vy || 0;
    e.angle = e.angle || 0;
    e.born = this.time;
    this.ents.push(e);
    this.byId.set(e.id, e);
    if (this.counts[e.type] !== undefined) this.counts[e.type]++;
    return e;
  }

  get(id) {
    const e = this.byId.get(id);
    return e && !e.dead ? e : null;
  }

  remove(e) {
    if (e.dead) return;
    e.dead = true;
  }

  emit(ev) { this.events.push(ev); }
  addFx(...a) { if (this.fx.length < 400) this.fx.push(a); }
  after(delay, fn) { this.timers.push({ at: this.time + delay, fn }); }

  teamOf(player) { return player.team; }

  hostile(a, b) {
    if (a === b) return false;
    if (a.team === b.team) {
      if (!this.settings.friendlyFire || a.team < 0) return false;
      if (a.type === 'bullet' && b.type === 'tank') return a.ownerId !== b.id;
      if (b.type === 'bullet' && a.type === 'tank') return b.ownerId !== a.id;
      return false;
    }
    if (a.team < 0 && b.team < 0) return false;
    return true;
  }

  tileAt(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return TILES.WALL;
    return this.tiles[ty * this.w + tx];
  }

  solidAt(x, y) { return isSolidTile(this.tileAt(x, y)); }

  setTile(idx, val) {
    if (this.tiles[idx] === val) return;
    this.tiles[idx] = val;
    this.tileChanges.push([idx, val]);
  }

  damageTile(idx, dmg) {
    const t = this.tiles[idx];
    if (t !== TILES.BREAK && t !== TILES.VINE && t !== TILES.TEMP) return false;
    const max = t === TILES.BREAK ? 700 : t === TILES.VINE ? 260 : 400;
    const hp = (this.tileHp.has(idx) ? this.tileHp.get(idx) : max) - dmg;
    if (hp <= 0) {
      this.tileHp.delete(idx);
      const tx = idx % this.w, ty = (idx / this.w) | 0;
      this.addFx('break', (tx + 0.5) * TILE, (ty + 0.5) * TILE, t);
      const temp = this.tileTemp.get(idx);
      if (t === TILES.VINE && !temp) this.vineRegrow.set(idx, this.time + 25);
      if (temp) { this.tileTemp.delete(idx); this.setTile(idx, temp.orig); return true; }
      this.setTile(idx, TILES.FLOOR);
      return true;
    }
    this.tileHp.set(idx, hp);
    return false;
  }

  placeTempTile(idx, val, dur) {
    const t = this.tiles[idx];
    if (t !== TILES.FLOOR && t !== TILES.MOSS && t !== TILES.ENERGY) return false;
    const tx = (idx % this.w + 0.5) * TILE, ty = (((idx / this.w) | 0) + 0.5) * TILE;
    let blocked = false;
    this.queryRadius(tx, ty, TILE, e => { if (e.type !== 'hazard' && e.type !== 'bullet' && e.type !== 'pickup' && Math.abs(e.x - tx) < TILE / 2 + e.r && Math.abs(e.y - ty) < TILE / 2 + e.r) blocked = true; });
    if (blocked) return false;
    this.tileTemp.set(idx, { until: this.time + dur, orig: t });
    this.setTile(idx, val);
    return true;
  }

  queryRadius(x, y, r, fn) {
    this.stamp++;
    const st = this.stamp;
    this.grid.query(x, y, r + 140, e => {
      if (e.dead) return;
      const dx = e.x - x, dy = e.y - y, rr = r + e.r;
      if (dx * dx + dy * dy <= rr * rr) return fn(e);
    }, st);
  }

  los(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(d / (TILE / 3));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const tt = this.tileAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
      if (isSolidTile(tt) && tt !== TILES.DOOR) return false;
      if (tt === TILES.DOOR) return false;
    }
    return true;
  }

  rayLength(x, y, ang, max) {
    const cx = Math.cos(ang), cy = Math.sin(ang);
    const step = 12;
    for (let d = 0; d < max; d += step) {
      if (this.solidAt(x + cx * d, y + cy * d)) return d;
    }
    return max;
  }

  randomFloor(rng = this.rng, tries = 200, minClear = 1) {
    for (let i = 0; i < tries; i++) {
      const tx = rng.int(1, this.w - 2), ty = rng.int(1, this.h - 2);
      if (this.clearAround(tx, ty, minClear)) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
    }
    return { x: this.W / 2, y: this.H / 2 };
  }

  clearAround(tx, ty, rad) {
    for (let y = ty - rad + 1; y <= ty + rad - 1; y++) for (let x = tx - rad + 1; x <= tx + rad - 1; x++) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
      const t = this.tiles[y * this.w + x];
      if (isSolidTile(t) || t === TILES.ENERGY || t === TILES.TELEPORT) return false;
    }
    return true;
  }

  floorNear(x, y, rmin, rmax, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(rmin, rmax);
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (px < TILE || py < TILE || px > this.W - TILE || py > this.H - TILE) continue;
      if (this.clearAround(Math.floor(px / TILE), Math.floor(py / TILE), 1) && !this.solidAt(px + 20, py) && !this.solidAt(px - 20, py) && !this.solidAt(px, py + 20) && !this.solidAt(px, py - 20)) return { x: px, y: py };
    }
    return null;
  }

  addPlayer({ name = 'Tank', isBot = false, team = null, token = null } = {}) {
    const pid = this.nextPid++;
    const p = {
      pid, name: String(name).slice(0, 18) || 'Tank', isBot, token, team: 0,
      tankId: 0, kills: 0, deaths: 0, assists: 0, score: 0, best: 0, cores: 0, bossKills: 0, secrets: new Set(),
      bossRewardMul: 1, lastKills: new Map(), respawnAt: 0, carryLevel: 1, defIdx: BASIC_INDEX,
      healDone: 0, docCdUntil: 0, connected: true, disconnectedAt: 0, brain: isBot ? { difficulty: this.settings.botDifficulty } : null,
      input: { mx: 0, my: 0, ax: 1, ay: 0, fire: false, alt: false, ability: false, seq: 0 },
      deathX: 0, deathY: 0, killerId: 0, stats: { shots: 0, dmg: 0 },
      cos: { skin: 0, trail: 0, kill: 0 }, unlocks: new Set(), admin: false, account: null, accLevel: 0
    };
    p.team = team !== null ? team : this.logic.assignTeam(p);
    this.players.set(pid, p);
    this.spawnTank(p);
    return p;
  }

  removePlayer(pid) {
    const p = this.players.get(pid);
    if (!p) return;
    const t = this.get(p.tankId);
    if (t) this.remove(t);
    for (const e of this.ents) if (e.ownerId === p.tankId && e.type === 'bullet') this.remove(e);
    this.players.delete(pid);
  }

  spawnTank(p) {
    const pos = this.logic.spawnPoint(p);
    const keep = this.settings.deathRule === 'keepThird' ? Math.max(1, Math.floor(p.carryLevel / 3)) : this.settings.deathRule === 'keepHalf' ? Math.max(1, Math.floor(p.carryLevel / 2)) : 1;
    const setup = this.logic.spawnSetup ? this.logic.spawnSetup(p, keep) : null;
    const level = setup ? setup.level : keep;
    const def = setup && setup.def ? setup.def : tankByIndex(BASIC_INDEX);
    const t = this.add({
      type: 'tank', player: p, pid: p.pid, name: p.name, team: this.logic.entityTeam(p), isBot: p.isBot,
      x: pos.x, y: pos.y, r: 22, def, defIdx: def.index, level, xp: setup && setup.xp !== undefined ? setup.xp : xpForLevel(level), stats: [0, 0, 0, 0, 0, 0, 0, 0],
      reload: [], droneCount: [], abilityCd: 0, status: {}, swapped: false, lastHurt: -99, lastFire: -99,
      damageLog: new Map(), spawnProtect: this.time + 3, hp: 1, maxHp: 1, hitByBoss: new Set()
    });
    t.statPts = Math.min(42, level - 1);
    if (p.isBot) t.statPts = Math.min(42, level - 1);
    p.tankId = t.id;
    p.defIdx = def.index;
    this.refreshTank(t, true);
    return t;
  }

  refreshTank(t, fill = false) {
    const d = t.def, st = t.stats, L = t.level;
    const frac = t.maxHp > 0 ? t.hp / t.maxHp : 1;
    t.r = BASE.radius * d.stats.size * (1 + 0.009 * (L - 1));
    t.maxHp = (100 + 3.4 * (L - 1)) * d.stats.hp * (1 + 0.14 * st[1]) * (t.hpMul || 1);
    t.hp = fill ? t.maxHp : Math.max(1, frac * t.maxHp);
    t.regen = t.maxHp * (0.003 + 0.004 * st[0]);
    t.bodyDmg = d.stats.bodyDmg * (1 + 0.16 * st[2]);
    t.maxSpeed = 245 * d.stats.speed * (1 + 0.055 * st[7]) * (1 - 0.0042 * (L - 1));
    t.accel = d.stats.accel;
    t.fov = d.stats.fov * (1 + 0.004 * (L - 1));
    t.bSpeed = 1 + 0.07 * st[3];
    t.bPen = 1 + 0.12 * st[4];
    t.bDmg = (1 + 0.075 * st[5]) * (1 + 0.006 * (L - 1));
    t.bReload = 1 - 0.065 * st[6];
    t.armor = d.bodyFx.armor || 0;
    t.mass = 1 + (d.stats.hp - 1) * 0.6 + (d.stats.size - 1);
    const guns = t.swapped && d.alt ? d.alt : d.guns;
    if (t.reload.length !== guns.length) {
      t.reload = guns.map(g => g.d * BASE.reload * g.r);
      t.droneCount = guns.map(() => 0);
      t.autoAng = guns.map(() => 0);
    }
  }

  setTankDef(t, def) {
    for (const e of this.ents) if (e.type === 'bullet' && e.ownerId === t.id && (e.kind === 'drone' || e.kind === 'minion')) this.remove(e);
    t.def = def;
    t.defIdx = def.index;
    t.swapped = false;
    t.reload = [];
    t.turAng = null;
    t.hpMul = 1;
    t.player.defIdx = def.index;
    this.refreshTank(t);
    if (def.src === 'nexus' || def.level >= 60) this.emit({ k: 'personal', pid: t.pid, ev: 'rare_tank', tank: def.id });
    if (def.level >= 45) this.emit({ k: 'personal', pid: t.pid, ev: 'tier4' });
  }

  giveXp(t, amount) {
    if (!t || t.dead || t.type !== 'tank') return;
    amount = Math.max(0, amount * this.global.xpMul);
    t.xp += amount;
    t.player.score = Math.floor(t.xp);
    const newLevel = levelForXp(t.xp);
    if (newLevel > t.level) {
      const gained = Math.min(newLevel, MAX_LEVEL) - t.level;
      t.level = Math.min(newLevel, MAX_LEVEL);
      const spent = t.stats.reduce((a, b) => a + b, 0);
      t.statPts = Math.max(0, Math.min(42, t.level - 1) - spent);
      this.refreshTank(t);
      if (gained > 0) this.addFx('lvl', t.x, t.y, t.id);
    }
  }

  upgradeStat(t, s) {
    if (!t || t.dead || !Number.isInteger(s) || s < 0 || s > 7) return false;
    if (t.statPts <= 0 || t.stats[s] >= STAT_MAX) return false;
    t.stats[s]++;
    t.statPts--;
    this.refreshTank(t);
    return true;
  }

  evolve(t, idx) {
    if (!t || t.dead) return false;
    const target = TANKS[idx];
    if (!target) return false;
    const secret = target.hidden && SECRET_IDS.includes(target.id) && t.def.id === 'basic' && t.player.unlocks.has(target.id);
    if (!secret && !t.def.next.includes(target.id)) return false;
    if (!this.meetsReq(t, target, false)) return false;
    this.setTankDef(t, target);
    return true;
  }

  meetsReq(t, def) {
    return t.level >= def.req.level;
  }

  evoOptions(t) {
    const out = [];
    for (const id of t.def.next) {
      const d = TANKS_BY_ID.get(id);
      if (d && this.meetsReq(t, d, false)) out.push(d.index);
    }
    if (t.def.id === 'basic' && t.level >= 45) for (const id of SECRET_IDS) if (t.player.unlocks.has(id)) out.push(TANKS_BY_ID.get(id).index);
    return out;
  }

  addShape(kind, x, y) {
    const s = SHAPES[kind];
    return this.add({ type: 'shape', kind, sides: s.sides, x, y, r: s.r, hp: s.hp, maxHp: s.hp, team: TEAM.NEUTRAL, xp: s.xp, bodyDmg: 0.45, spin: this.rng.range(-0.5, 0.5), drift: this.rng.range(0, Math.PI * 2), mass: s.r / 15 });
  }

  addMob(kind, x, y, opts = {}) {
    const m = MOBS[kind];
    if (this.counts.mob >= MAX_MOBS && !opts.force) return null;
    const scale = opts.scale || 1;
    return this.add({
      type: 'mob', kind, x, y, r: m.r, hp: m.hp * scale, maxHp: m.hp * scale, team: opts.team !== undefined ? opts.team : TEAM.ENV,
      def: m, xp: m.xp, bodyDmg: m.bodyDmg, reload: m.guns.map(g => g.d * BASE.reload * g.r * 2), armor: m.armor || 0, mass: m.r / 18,
      ownerId: opts.ownerId || 0, leaderId: opts.leaderId || 0, bossRef: opts.bossRef || 0, static: m.speed === 0, origTeam: opts.team !== undefined ? opts.team : TEAM.ENV, slot: opts.slot || 0, expires: opts.life ? this.time + opts.life : 0,
      home: { x, y }, dmgMul: opts.dmgMul || 1, ai: { t: 0 }, status: {}, spot: opts.spot || null
    });
  }

  addStruct(kind, x, y, team, opts = {}) {
    const s = STRUCTURES[kind];
    const hp = opts.hp || s.hp || 1000;
    return this.add({
      type: 'struct', kind, x, y, r: s.r, hp, maxHp: hp, team, def: s, armor: opts.armor || 0.2, mass: 999, static: true,
      shield: opts.shield || 0, maxShield: opts.shield || 0, reload: (s.guns || []).map(() => 0), status: {}, origTeam: team, ...opts.extra
    });
  }

  addPickup(kind, x, y, extra = {}) {
    return this.add({ type: 'pickup', kind, code: PICKUPS[kind].code, x, y, r: 14, team: TEAM.NEUTRAL, life: this.time + 60, ...extra });
  }

  addHazard(kind, x, y, opts = {}) {
    return this.add({ type: 'hazard', kind, x, y, r: opts.r || 50, len: opts.len || 0, ang: opts.ang || 0, team: opts.team !== undefined ? opts.team : TEAM.BOSS, until: this.time + (opts.dur || 1), start: this.time, dps: opts.dps || 0, ownerId: opts.ownerId || 0, ...opts });
  }

  damage(target, amount, src, opts = {}) {
    if (!target || target.dead || amount <= 0) return 0;
    if (target.type === 'hazard' || target.type === 'pickup' || target.type === 'bullet') return 0;
    const attacker = src && (src.type === 'bullet' ? this.get(src.ownerId) || src : src);
    if (target.type === 'tank') {
      if (target.spawnProtect > this.time) return 0;
      if (target.status.bubbleUntil > this.time) amount *= opts.disrupt ? 0.6 : 0.3;
      amount *= 1 - target.armor;
      if (target.def.bodyFx.shards && amount > 3 && this.rng.chance(0.25)) this.emitShards(target);
      if (attacker && attacker.team === TEAM.BOSS) { target.hitByBoss.add(attacker.bossRef || attacker.id); amount *= 0.75; }
    } else if (target.type === 'struct') {
      if (target.status.emergencyUntil > this.time) return 0;
      if (opts.siege) amount *= 2.5;
      if (opts.antiBoss) amount *= 1;
      if (target.kind === 'nexus') return this.logic.damageNexus(target, amount, attacker, opts);
      amount *= 1 - target.armor;
    } else if (target.type === 'boss' || target.type === 'part') {
      return bossDamaged(this, target, amount, attacker, opts, src);
    } else if (target.type === 'mob') {
      amount *= 1 - target.armor;
      if (opts.siege && target.def.ai === 'turret') amount *= 1.5;
    }
    target.hp -= amount;
    target.lastHurt = this.time;
    if (attacker && attacker.type === 'tank') {
      const log = target.damageLog;
      if (log) log.set(attacker.id, { t: this.time, amt: ((log.get(attacker.id) || {}).amt || 0) + amount });
      attacker.player.stats.dmg += amount;
    }
    if (target.hp <= 0) this.kill(target, attacker, opts);
    return amount;
  }

  heal(target, amount, healer) {
    if (!target || target.dead || !target.maxHp) return 0;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    const done = target.hp - before;
    if (healer && healer.type === 'tank' && done > 0 && healer.id !== target.id) {
      healer.player.healDone += done;
      this.emit({ k: 'personal', pid: healer.pid, ev: 'heal', n: Math.round(done) });
      for (const b of this.ents) if (b.type === 'boss' && !b.dead && Math.hypot(b.x - target.x, b.y - target.y) < 1400) {
        b.contrib.set(healer.pid, (b.contrib.get(healer.pid) || 0) + done * 0.8);
      }
      this.addFx('heal', target.x, target.y);
    }
    return done;
  }

  emitShards(t) {
    for (let i = 0; i < 4; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      this.addBullet({ x: t.x, y: t.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, r: 6, dmg: 6 * t.bDmg, hp: 6, life: 0.6, team: t.team, ownerId: t.id, kind: 'bullet', fx: {} });
    }
  }

  addBullet(o) {
    if (this.counts.bullet >= MAX_BULLETS && o.kind !== 'drone' && o.kind !== 'minion') return null;
    const b = this.add({ type: 'bullet', kind: 'bullet', fx: {}, hits: null, life: 1.4, mass: 0.2, ...o });
    b.expire = this.time + b.life;
    if (b.fx.pierce) { b.pierceLeft = 3 + (b.fx.pierce > 3 ? 2 : 0); b.hits = new Set(); }
    if (b.fx.bounce) b.bounceLeft = b.fx.bounce;
    return b;
  }

  kill(e, killer, opts = {}) {
    if (e.dead) return;
    this.remove(e);
    const killerTank = killer && killer.type === 'tank' ? killer : killer && killer.ownerId ? this.get(killer.ownerId) : null;
    if (e.type === 'shape') {
      if (killerTank && killerTank.type === 'tank') this.giveXp(killerTank, e.xp * (this.global.surgeUntil > this.time ? 1.5 : 1));
      this.addFx('pop', e.x, e.y, e.r, e.sides);
      if (e.kind === 'alpha') this.addPickup('core', e.x, e.y);
      this.logic.onShapeKilled(e, killerTank);
    } else if (e.type === 'mob') {
      if (killerTank && killerTank.type === 'tank') {
        this.giveXp(killerTank, e.xp);
        if (e.def.drop) {
          this.addPickup('core', e.x, e.y);
          this.emit({ k: 'personal', pid: killerTank.pid, ev: 'elite' });
        }
      }
      this.addFx('pop', e.x, e.y, e.r, e.def.sides);
      this.logic.onMobKilled(e, killerTank);
    } else if (e.type === 'tank') {
      this.onTankDeath(e, killerTank, killer);
    } else if (e.type === 'struct') {
      this.addFx('boom', e.x, e.y, e.r * 2);
      this.logic.onStructDestroyed(e, killerTank);
    } else if (e.type === 'boss') {
      bossKilled(this, e, killerTank);
    } else if (e.type === 'part') {
      this.addFx('boom', e.x, e.y, e.r * 2);
    }
  }

  onTankDeath(t, killerTank, rawKiller) {
    const p = t.player;
    p.deaths++;
    p.carryLevel = t.level;
    p.deathX = t.x; p.deathY = t.y;
    p.respawnAt = this.time + (this.logic.respawnDelay ? this.logic.respawnDelay() : 3.5);
    p.tankId = 0;
    p.best = Math.max(p.best, Math.floor(t.xp));
    this.addFx('death', t.x, t.y, t.r);
    for (const e of this.ents) if (e.type === 'bullet' && e.ownerId === t.id && (e.kind === 'drone' || e.kind === 'minion')) this.remove(e);
    if (p.cores > 1) {
      const drop = Math.floor(p.cores / 2);
      p.cores -= drop;
      for (let i = 0; i < Math.min(drop, 6); i++) this.addPickup('core', t.x + this.rng.range(-30, 30), t.y + this.rng.range(-30, 30));
    }
    let killerName = rawKiller ? (rawKiller.name || (rawKiller.def && rawKiller.def.name) || 'the arena') : 'the arena';
    if (killerTank && killerTank.type === 'tank' && killerTank.id !== t.id) {
      const kp = killerTank.player;
      kp.kills++;
      killerName = kp.name;
      p.killerId = killerTank.id;
      const last = kp.lastKills.get(p.pid) || [];
      const recent = last.filter(x => this.time - x < 90);
      recent.push(this.time);
      kp.lastKills.set(p.pid, recent);
      const repeat = Math.pow(0.4, recent.length - 1);
      let reward = (MODES[this.mode] && (MODES[this.mode].battle || MODES[this.mode].workshop) ? 1000 : Math.max(40, t.xp * 0.33)) * repeat;
      if (this.global.bountyId === t.id) { reward *= 3; kp.cores++; this.emit({ k: 'announce', text: `${kp.name} claimed the bounty on ${p.name}`, tone: 'gold' }); this.global.bountyId = 0; }
      this.giveXp(killerTank, reward);
      if (killerTank.def.id === 'basic' && killerTank.level >= 45 && !kp.unlocks.has('scorch')) {
        kp.unlocks.add('scorch');
        this.emit({ k: 'personal', pid: kp.pid, ev: 'secret_tank', tank: 'scorch' });
        this.emit({ k: 'toast', pid: kp.pid, text: 'Something stirs. Look at your upgrades.', tone: 'gold' });
      }
      this.emit({ k: 'personal', pid: kp.pid, ev: 'kill' });
      if (killerTank.def.role === 'Artillery') this.emit({ k: 'personal', pid: kp.pid, ev: 'kill_artillery' });
      if (killerTank.def.guns.some(g => g.k === 'drone' || g.k === 'minion' || g.k === 'swarm')) this.emit({ k: 'personal', pid: kp.pid, ev: 'kill_drone' });
      for (const [aid, rec] of t.damageLog) {
        if (aid === killerTank.id || this.time - rec.t > 8) continue;
        const a = this.get(aid);
        if (a && a.type === 'tank' && a.team !== t.team) {
          a.player.assists++;
          this.giveXp(a, reward * 0.25);
          this.emit({ k: 'personal', pid: a.pid, ev: 'assist' });
        }
      }
      this.logic.onTankKilled(t, killerTank);
    } else if (rawKiller) {
      p.killerId = rawKiller.id || 0;
    }
    this.emit({ k: 'kill', a: killerName, b: p.name, at: killerTank ? killerTank.team : -9, bt: t.team, ad: killerTank ? killerTank.defIdx : -1, x: Math.round(t.x), y: Math.round(t.y), r: Math.round(t.r), kx: killerTank && killerTank.player ? killerTank.player.cos.kill : 0, kid: killerTank ? killerTank.id : 0 });
  }

  rewardCore(p, n = 1) { p.cores += n; }

  integrate(e, dt) {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }

  collideWalls(e) {
    const r = e.r;
    const x0 = Math.floor((e.x - r) / TILE), x1 = Math.floor((e.x + r) / TILE);
    const y0 = Math.floor((e.y - r) / TILE), y1 = Math.floor((e.y + r) / TILE);
    let hit = -1;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      let solid;
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) solid = true;
      else solid = isSolidTile(this.tiles[ty * this.w + tx]);
      if (!solid) continue;
      const rx = tx * TILE, ry = ty * TILE;
      const nx = Math.max(rx, Math.min(e.x, rx + TILE));
      const ny = Math.max(ry, Math.min(e.y, ry + TILE));
      let dx = e.x - nx, dy = e.y - ny;
      let d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      hit = ty * this.w + tx;
      if (d2 < 1e-6) {
        const cx = rx + TILE / 2, cy = ry + TILE / 2;
        dx = e.x - cx; dy = e.y - cy;
        if (Math.abs(dx) > Math.abs(dy)) { e.x = dx > 0 ? rx + TILE + r : rx - r; e.vx = 0; }
        else { e.y = dy > 0 ? ry + TILE + r : ry - r; e.vy = 0; }
        continue;
      }
      const d = Math.sqrt(d2);
      const push = r - d;
      const ux = dx / d, uy = dy / d;
      e.x += ux * push; e.y += uy * push;
      const vn = e.vx * ux + e.vy * uy;
      if (vn < 0) { e.vx -= vn * ux; e.vy -= vn * uy; }
    }
    if (e.x < r) e.x = r;
    if (e.y < r) e.y = r;
    if (e.x > this.W - r) e.x = this.W - r;
    if (e.y > this.H - r) e.y = this.H - r;
    return hit;
  }

  flowField(goalIdx) {
    const cached = this.pathCache.get(goalIdx);
    if (cached && this.time - cached.t < 0.8) return cached.f;
    const n = this.w * this.h;
    const f = new Int16Array(n).fill(-1);
    const q = new Int32Array(n);
    let qh = 0, qt = 0;
    f[goalIdx] = 0;
    q[qt++] = goalIdx;
    while (qh < qt) {
      const i = q[qh++];
      const x = i % this.w;
      const dv = f[i] + 1;
      if (dv > 400) break;
      const nb = [x > 0 ? i - 1 : -1, x < this.w - 1 ? i + 1 : -1, i - this.w, i + this.w];
      for (const j of nb) {
        if (j < 0 || j >= n || f[j] !== -1) continue;
        const t = this.tiles[j];
        if (isSolidTile(t) && t !== TILES.DOOR) continue;
        f[j] = dv;
        q[qt++] = j;
      }
    }
    if (this.pathCache.size > 60) this.pathCache.clear();
    this.pathCache.set(goalIdx, { t: this.time, f });
    return f;
  }

  pathDir(fx, fy, gx, gy) {
    if (this.los(fx, fy, gx, gy)) return Math.atan2(gy - fy, gx - fx);
    const gi = tileIndexAt(this.map, gx, gy);
    const field = this.flowField(gi);
    const fi = tileIndexAt(this.map, fx, fy);
    let best = -1, bestV = field[fi] === -1 ? 9999 : field[fi];
    const x = fi % this.w;
    const cand = [fi - 1, fi + 1, fi - this.w, fi + this.w];
    if (x > 0) { cand.push(fi - this.w - 1, fi + this.w - 1); }
    if (x < this.w - 1) { cand.push(fi - this.w + 1, fi + this.w + 1); }
    for (let k = 0; k < cand.length; k++) {
      const j = cand[k];
      if (j < 0 || j >= field.length) continue;
      const v = field[j];
      if (v < 0) continue;
      if (k >= 4) {
        const jx = j % this.w, jy = (j / this.w) | 0, ix = fi % this.w, iy = (fi / this.w) | 0;
        if (isSolidTile(this.tiles[iy * this.w + jx]) || isSolidTile(this.tiles[jy * this.w + ix])) continue;
      }
      if (v < bestV) { bestV = v; best = j; }
    }
    if (best < 0) return Math.atan2(gy - fy, gx - fx);
    const tx = (best % this.w + 0.5) * TILE, ty = (((best / this.w) | 0) + 0.5) * TILE;
    return Math.atan2(ty - fy, tx - fx);
  }

  applyTankInput(t, dt) {
    const p = t.player;
    const inp = p.input;
    let mx = inp.mx, my = inp.my;
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    const s = t.status;
    let speed = t.maxSpeed;
    if (s.chillUntil > this.time) speed *= 0.6;
    if (s.speedUntil > this.time) speed *= 1.3;
    const tile = this.tileAt(t.x, t.y);
    if (tile === TILES.MOSS) speed *= 0.65;
    const accel = speed * 6 * t.accel;
    t.vx += mx * accel * dt;
    t.vy += my * accel * dt;
    const aim = Math.atan2(inp.ay, inp.ax);
    if (Number.isFinite(aim)) t.angle = aim;
    if (inp.ability && !t._abHeld) useAbility(this, t);
    t._abHeld = inp.ability;
    t.firing = inp.fire;
    t.altFire = inp.alt;
    t.aimX = t.x + inp.ax;
    t.aimY = t.y + inp.ay;
  }

  stepMotion(e, dt, drag) {
    const k = Math.exp(-drag * dt);
    e.vx *= k; e.vy *= k;
    this.integrate(e, dt);
  }

  step() {
    const dt = DT;
    this.time += dt;
    this.tick++;
    this.events.length = 0;
    this.fx.length = 0;
    this.tileChanges.length = 0;
    if (this.timers.length) {
      const due = this.timers.filter(t => t.at <= this.time);
      if (due.length) {
        this.timers = this.timers.filter(t => t.at > this.time);
        for (const t of due) { try { t.fn(); } catch (err) { this.emit({ k: 'log', text: String(err && err.message) }); } }
      }
    }
    this.logic.preStep(dt);
    for (const p of this.players.values()) {
      if (!p.tankId && !this.matchOver && p.respawnAt && this.time >= p.respawnAt && (p.connected || p.isBot)) {
        if (p.isBot || p.autoRespawn) this.spawnTank(p);
      }
    }
    for (const e of this.ents) {
      if (e.dead) continue;
      if (e.type === 'tank') {
        if (e.isBot) updateBot(this, e, dt);
        this.applyTankInput(e, dt);
        updateAbilities(this, e, dt);
        updateTankWeapons(this, e, dt);
        const s = e.status;
        if (e.def.stealth && Math.hypot(e.vx, e.vy) < 45 && this.time - e.lastFire > 1.2) s.cloakUntil = Math.max(s.cloakUntil || 0, this.time + 0.15);
        if (this.time - e.lastHurt > 8) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.025 * dt);
        e.hp = Math.min(e.maxHp, e.hp + e.regen * dt);
        if (s.overdriveUntil > this.time) this.damage(e, e.maxHp * 0.035 * dt, null, {});
      } else if (e.type === 'mob') {
        updateMob(this, e, dt);
        updateMobWeapons(this, e, dt);
      } else if (e.type === 'boss') {
        updateBoss(this, e, dt);
      } else if (e.type === 'struct') {
        this.logic.updateStruct(e, dt);
      }
    }
    for (const e of this.ents) {
      if (e.dead) continue;
      switch (e.type) {
        case 'tank': this.stepMotion(e, dt, 6); this.envEffects(e, dt); this.collideWalls(e); break;
        case 'mob': this.stepMotion(e, dt, e.def.ai === 'formation' ? 3 : 5); this.envEffects(e, dt); this.collideWalls(e); break;
        case 'shape': {
          e.angle += e.spin * dt;
          e.vx += Math.cos(e.drift) * 6 * dt; e.vy += Math.sin(e.drift) * 6 * dt;
          if (this.rng.chance(0.004)) e.drift += this.rng.range(-1, 1);
          this.stepMotion(e, dt, 2.2);
          if (this.collideWalls(e) >= 0) e.drift += Math.PI * 0.7;
          break;
        }
        case 'boss': this.stepMotion(e, dt, e.charging ? 0.2 : 4); if (!e.def.phaseWalls) { const hit = this.collideWalls(e); if (hit >= 0 && e.def.breaksWalls) this.bossBreak(e); } break;
        case 'bullet': {
          updateBullet(this, e, dt);
          if (e.dead) break;
          const sp2 = e.vx * e.vx + e.vy * e.vy;
          const sub = sp2 > 700 * 700 ? 3 : sp2 > 400 * 400 ? 2 : 1;
          for (let i = 0; i < sub && !e.dead; i++) {
            e.px = e.x; e.py = e.y;
            e.x += e.vx * dt / sub; e.y += e.vy * dt / sub;
            bulletWall(this, e);
          }
          break;
        }
        case 'pickup': if (this.time > e.life) this.remove(e); break;
        case 'hazard': this.updateHazard(e, dt); break;
      }
    }
    this.grid.clear();
    for (const e of this.ents) if (!e.dead && e.type !== 'hazard' && !e.down) this.grid.insert(e);
    this.collisions(dt);
    this.updateTiles(dt);
    this.logic.postStep(dt);
    if (this.tick % 15 === 0) this.compact();
  }

  bossBreak(b) {
    const r = b.r + 10;
    const x0 = Math.floor((b.x - r) / TILE), x1 = Math.floor((b.x + r) / TILE), y0 = Math.floor((b.y - r) / TILE), y1 = Math.floor((b.y + r) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (tx <= 0 || ty <= 0 || tx >= this.w - 1 || ty >= this.h - 1) continue;
      const idx = ty * this.w + tx;
      const t = this.tiles[idx];
      if (t === TILES.BREAK || t === TILES.VINE || t === TILES.TEMP) this.damageTile(idx, 9999);
    }
  }

  envEffects(e, dt) {
    const idx = tileIndexAt(this.map, e.x, e.y);
    const t = this.tiles[idx];
    const envOn = this.global.envOffUntil <= this.time;
    if (t === TILES.ENERGY && e.type === 'tank') this.damage(e, 35 * dt, null, {});
    if (t === TILES.CONVEYOR && envOn) {
      const dir = this.map.conveyors.get(idx);
      const push = 260 * dt;
      if (dir === 0) e.vx += push * 2; else if (dir === 1) e.vy += push * 2; else if (dir === 2) e.vx -= push * 2; else if (dir === 3) e.vy -= push * 2;
    }
    if (t === TILES.TELEPORT && envOn && e.type === 'tank' && (!e.status.teleCd || e.status.teleCd < this.time)) {
      const dest = this.map.teleIndex.get(idx);
      if (dest !== undefined) {
        const nx = (dest % this.w + 0.5) * TILE, ny = (((dest / this.w) | 0) + 0.5) * TILE;
        this.addFx('tele', e.x, e.y, nx, ny);
        e.x = nx; e.y = ny; e.vx *= 0.3; e.vy *= 0.3;
        e.status.teleCd = this.time + 2;
      }
    }
    if ((t === TILES.BASE_BLUE || t === TILES.BASE_RED) && e.type === 'tank') {
      const owner = t === TILES.BASE_BLUE ? 0 : 1;
      if (this.logic.teamsActive && e.team !== owner && e.spawnProtect < this.time) this.damage(e, e.maxHp * 0.25 * dt, null, {});
    }
  }

  updateHazard(h, dt) {
    if (this.time >= h.until) { this.remove(h); if (h.onEnd) h.onEnd(); return; }
    if (h.follow) { const f = this.get(h.follow); if (f) { h.x = f.x; h.y = f.y; } }
    if (h.turn) h.ang += h.turn * dt;
    if (h.kind === 2) {
      const reach = this.rayLength(h.x, h.y, h.ang, h.maxLen || h.len);
      h.len = reach;
      if (h.dps) this.segmentDamage(h, h.x, h.y, h.x + Math.cos(h.ang) * reach, h.y + Math.sin(h.ang) * reach, 18, h.dps * dt);
    } else if (h.kind === 3) {
      const prog = (this.time - h.start) / (h.until - h.start);
      h.r = h.r0 + (h.maxR - h.r0) * prog;
      if (!h.hitSet) h.hitSet = new Set();
      for (const e of this.ents) {
        if (e.dead || e.type !== 'tank' || h.hitSet.has(e.id) || !this.hostile(h, e)) continue;
        const d = Math.hypot(e.x - h.x, e.y - h.y);
        if (Math.abs(d - h.r) < e.r + 16) { h.hitSet.add(e.id); this.damage(e, h.dm, h.src ? this.get(h.src) : h, {}); if (h.chill) e.status.chillUntil = this.time + h.chill; }
      }
    } else if ((h.kind === 4 || h.kind === 7) && h.dps) {
      this.queryRadius(h.x, h.y, h.r, e => { if ((e.type === 'tank' || (h.hitsMobs && e.type === 'mob')) && this.hostile(h, e)) this.damage(e, h.dps * dt, h.src ? this.get(h.src) : h, {}); });
    } else if (h.kind === 5 && h.pull) {
      for (const e of this.ents) {
        if (e.dead || (e.type !== 'tank' && e.type !== 'bullet') || !this.hostile(h, e)) continue;
        const dx = h.x - e.x, dy = h.y - e.y, d = Math.hypot(dx, dy);
        if (d < h.r && d > 1) { const f = h.pull * dt * (1 - d / h.r * 0.5); e.vx += dx / d * f; e.vy += dy / d * f; }
      }
    }
  }

  segmentDamage(src, x0, y0, x1, y1, width, amount) {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
    for (const e of this.ents) {
      if (e.dead || (e.type !== 'tank' && e.type !== 'struct' && e.type !== 'mob') || !this.hostile(src, e)) continue;
      if (e.type === 'mob' && src.team === TEAM.BOSS) continue;
      const t = Math.max(0, Math.min(1, ((e.x - x0) * dx + (e.y - y0) * dy) / L2));
      const px = x0 + dx * t, py = y0 + dy * t;
      if (Math.hypot(e.x - px, e.y - py) < e.r + width) this.damage(e, amount, src.src ? this.get(src.src) || src : src, {});
    }
  }

  collisions(dt) {
    const cells = this.grid.cells;
    for (const ci of this.grid.used) {
      const cell = cells[ci];
      const n = cell.length;
      if (n < 2) continue;
      for (let i = 0; i < n; i++) {
        const a = cell[i];
        if (a.dead) continue;
        for (let j = i + 1; j < n; j++) {
          const b = cell[j];
          if (b.dead) continue;
          const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
          if (dx * dx + dy * dy >= rr * rr) continue;
          const key = a.id < b.id ? a.id * 1048576 + b.id : b.id * 1048576 + a.id;
          if (this._pairTick === this.tick) { if (this._pairs.has(key)) continue; }
          else { this._pairTick = this.tick; this._pairs = new Set(); }
          this._pairs.add(key);
          this.resolvePair(a, b, dx, dy, dt);
          if (a.dead) break;
        }
      }
    }
  }

  resolvePair(a, b, dx, dy, dt) {
    if (a.type === 'bullet' || b.type === 'bullet') {
      if (a.type === 'bullet' && b.type === 'bullet') return bulletVsBullet(this, a, b);
      const bu = a.type === 'bullet' ? a : b, o = a.type === 'bullet' ? b : a;
      if (o.type === 'pickup') return;
      return bulletHitTarget(this, bu, o, dt);
    }
    if (a.type === 'pickup' || b.type === 'pickup') {
      const pk = a.type === 'pickup' ? a : b, o = a.type === 'pickup' ? b : a;
      if (o.type === 'tank') this.collectPickup(o, pk);
      return;
    }
    if (a.type === 'shape' && b.type === 'shape') return this.separate(a, b, dx, dy, 0.3);
    if ((a.type === 'part' || b.type === 'part')) {
      const part = a.type === 'part' ? a : b, o = a === part ? b : a;
      if (o.type === 'boss' || o.type === 'part') return;
      if (o.type === 'tank' && this.hostile(part, o)) { this.damage(o, 40 * dt, this.get(part.bossId) || part, {}); this.separate(part, o, dx, dy, 1, true); }
      return;
    }
    const sep = !(a.static && b.static);
    if (sep) this.separate(a, b, dx, dy, 1);
    if (!this.hostile(a, b)) return;
    if (a.type === 'shape' && (b.type === 'mob' || b.type === 'boss' || b.type === 'struct')) return;
    if (b.type === 'shape' && (a.type === 'mob' || a.type === 'boss' || a.type === 'struct')) return;
    if (a.type === 'mob' && b.type === 'mob') return;
    this.bodyHit(a, b, dt);
    this.bodyHit(b, a, dt);
  }

  bodyHit(src, dst, dt) {
    let bd = src.bodyDmg || 0;
    if (src.type === 'boss') bd = (src.charging ? 0 : 1.5);
    if (src.type === 'struct') bd = src.kind === 'cache' || src.kind === 'shrine' ? 0 : 0.6;
    if (bd <= 0) return;
    let amt = 55 * bd * dt;
    if (src.type === 'tank' && dst.type === 'shape') amt *= 1.4;
    const fx = src.type === 'tank' ? src.def.bodyFx : null;
    if (fx && fx.blast && (!src.status.blastCd || src.status.blastCd < this.time)) {
      src.status.blastCd = this.time + 1;
      explodeAt(this, (src.x + dst.x) / 2, (src.y + dst.y) / 2, src.r * 2.2, 30 * src.bodyDmg, src, {});
    }
    if (fx && fx.staticArc && this.tick % 6 === 0) {
      let best = null, bd2 = 1e12;
      this.queryRadius(dst.x, dst.y, 260, e => { if (e !== dst && e.type !== 'bullet' && e.type !== 'hazard' && e.type !== 'pickup' && this.hostile(src, e)) { const d = (e.x - dst.x) ** 2 + (e.y - dst.y) ** 2; if (d < bd2) { bd2 = d; best = e; } } });
      if (best) { this.damage(best, 20 * src.bodyDmg, src, {}); this.addFx('arc', dst.x, dst.y, best.x, best.y); }
    }
    if (fx && fx.knock) {
      const d = Math.hypot(dst.x - src.x, dst.y - src.y) || 1;
      dst.vx += (dst.x - src.x) / d * 40 * fx.knock * dt * 30 / (dst.mass || 1);
      dst.vy += (dst.y - src.y) / d * 40 * fx.knock * dt * 30 / (dst.mass || 1);
    }
    const done = this.damage(dst, amt, src, { body: true });
    if (fx && fx.leech && done > 0) src.hp = Math.min(src.maxHp, src.hp + done * fx.leech);
  }

  separate(a, b, dx, dy, strength, bOnly = false) {
    const d = Math.hypot(dx, dy) || 0.01;
    const overlap = a.r + b.r - d;
    if (overlap <= 0) return;
    const ma = a.static ? 1e9 : (a.mass || 1), mb = b.static ? 1e9 : (b.mass || 1);
    const tot = ma + mb;
    const ux = dx / d, uy = dy / d;
    const pa = bOnly ? 0 : overlap * (mb / tot) * strength, pb = overlap * (ma / tot) * strength;
    if (!a.static && !bOnly) { a.x -= ux * pa; a.y -= uy * pa; a.vx -= ux * pa * 3; a.vy -= uy * pa * 3; }
    if (!b.static) { b.x += ux * pb; b.y += uy * pb; b.vx += ux * pb * 3; b.vy += uy * pb * 3; }
  }

  collectPickup(t, pk) {
    if (pk.dead) return;
    this.remove(pk);
    const p = t.player;
    switch (pk.kind) {
      case 'core': p.cores++; this.addFx('rare', pk.x, pk.y); this.emit({ k: 'personal', pid: p.pid, ev: 'core' }); break;
      case 'xp': this.giveXp(t, pk.amount || 500); break;
      case 'overcharge': t.status.overchargeUntil = this.time + 15; break;
      case 'heal': this.heal(t, t.maxHp * 0.5); break;
      case 'speed': t.status.speedUntil = this.time + 10; break;
      case 'credits': this.logic.addCredits(t.team, 120); break;
    }
    this.addFx('pickup', pk.x, pk.y, pk.code);
  }

  updateTiles(dt) {
    if (this.tick % 3 === 0 && this.global.envOffUntil <= this.time) {
      for (const d of this.map.doors) {
        const cyc = (this.time + d.phase) % d.period;
        const open = cyc < d.period * 0.55;
        for (const idx of d.tiles) {
          if (this.tileTemp.has(idx)) continue;
          const want = open ? TILES.DOOR_OPEN : TILES.DOOR;
          if (this.tiles[idx] !== want) {
            if (want === TILES.DOOR) {
              const tx = (idx % this.w + 0.5) * TILE, ty = (((idx / this.w) | 0) + 0.5) * TILE;
              let occupied = false;
              this.queryRadius(tx, ty, TILE * 0.6, e => { if (e.type === 'tank' || e.type === 'mob' || e.type === 'boss') occupied = true; });
              if (occupied) continue;
            }
            this.setTile(idx, want);
          }
        }
      }
    }
    if (this.tick % 10 === 0) {
      for (const [idx, rec] of this.tileTemp) {
        if (rec.until <= this.time) { this.tileTemp.delete(idx); this.tileHp.delete(idx); this.setTile(idx, rec.orig); }
      }
      for (const [idx, at] of this.vineRegrow) {
        if (at > this.time) continue;
        const tx = (idx % this.w + 0.5) * TILE, ty = (((idx / this.w) | 0) + 0.5) * TILE;
        let occupied = false;
        this.queryRadius(tx, ty, TILE * 0.7, e => { if (e.type === 'tank' || e.type === 'mob' || e.type === 'boss') occupied = true; });
        if (occupied) { this.vineRegrow.set(idx, this.time + 3); continue; }
        this.vineRegrow.delete(idx);
        if (this.tiles[idx] === TILES.FLOOR) this.setTile(idx, TILES.VINE);
      }
    }
  }

  compact() {
    const alive = [];
    const c = { bullet: 0, mob: 0, shape: 0 };
    for (const e of this.ents) {
      if (e.dead) { this.byId.delete(e.id); continue; }
      alive.push(e);
      if (c[e.type] !== undefined) c[e.type]++;
    }
    this.ents = alive;
    this.counts = c;
  }

  tankOf(p) { return p ? this.get(p.tankId) : null; }
}
