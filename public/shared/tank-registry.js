import { validateGun, BASE } from './weapon-registry.js';
import ARRAS from './data/arras-tanks.js';
import { NEXUS_TANKS } from './nexus-tanks.js';

export const ABILITIES = {
  none: { name: 'None', cd: 0, desc: 'No active ability' },
  dash: { name: 'Dash', cd: 7, dur: 0.25, desc: 'Burst of speed toward your movement direction' },
  blink: { name: 'Blink', cd: 9, desc: 'Teleport a short distance toward your aim' },
  bubble: { name: 'Bubble Shield', cd: 14, dur: 3, desc: 'Absorb 70% of incoming damage for 3s' },
  cloak: { name: 'Cloak', cd: 13, dur: 5, desc: 'Become invisible to distant enemies until you fire' },
  turret: { name: 'Deploy Turret', cd: 16, dur: 14, desc: 'Place an auto turret that fights for you' },
  barrier: { name: 'Barrier', cd: 14, dur: 7, desc: 'Raise a temporary wall in front of you' },
  pulse: { name: 'Mend Pulse', cd: 10, desc: 'Heal nearby allies and sting nearby enemies' },
  shieldAlly: { name: 'Aegis Field', cd: 16, dur: 3, desc: 'Give nearby allies a bubble shield' },
  rally: { name: 'Rally', cd: 18, dur: 5, desc: 'Nearby allies reload 30% faster' },
  overdrive: { name: 'Overdrive', cd: 14, dur: 4, desc: 'Reload twice as fast, but take damage over time' },
  reclaim: { name: 'Reclaim', cd: 12, desc: 'Convert nearby squares into your drones' },
  swap: { name: 'Transform', cd: 1.5, desc: 'Switch between two weapon configurations' },
  emp: { name: 'EMP', cd: 16, dur: 3, desc: 'Erase nearby enemy projectiles and stun structures' }
};

const GUN_DEFAULTS = { a: 0, x: 0, y: 0, len: 1.8, w: 0.4, asp: 1, d: 0, k: 'bullet', r: 1, dm: 1, pn: 1, sp: 1, lf: 1, sz: 1, s: 0.04, rec: 1, n: 1, max: 0, auto: false };
const DEFAULT_STATS = { hp: 1, speed: 1, size: 1, bodyDmg: 1, fov: 1, accel: 1, shield: 1, density: 1 };
const RARITY_BY_LEVEL = { 1: 'common', 15: 'common', 30: 'uncommon', 45: 'rare', 60: 'epic' };
export const TIER_OF_LEVEL = { 1: 1, 15: 2, 30: 3, 45: 4, 60: 5 };

function normGun(g) {
  const out = { ...GUN_DEFAULTS, ...g, fx: { ...(g.fx || {}) } };
  if (out.deco) { out.k = 'bullet'; out.dm = 1; out.r = 1; }
  if ((out.k === 'drone' || out.k === 'minion') && !out.max) out.max = 3;
  return out;
}

function roleOf(d) {
  const live = d.guns.filter(g => !g.deco);
  if (!live.length) return d.smasher ? 'Rammer' : 'Support';
  const count = k => live.filter(g => g.k === k).length;
  if (live.some(g => g.fx.heal)) return 'Healer';
  if (count('beam')) return 'Energy';
  if (count('drone') || count('minion')) return count('minion') ? 'Factory' : 'Drones';
  if (count('trap') >= live.length / 2) return 'Traps';
  if (count('swarm')) return 'Swarms';
  if (live.filter(g => g.auto).length >= live.length / 2) return 'Auto Turrets';
  if (count('shell') || live.some(g => g.fx.missile)) return 'Artillery';
  if (d.stats.fov >= 1.12 && live.some(g => g.sp >= 1.3)) return 'Sniper';
  const front = live.some(g => !g.auto && Math.abs(((g.a + 540) % 360) - 180) > 150);
  const thrust = live.filter(g => !g.auto && Math.abs(((g.a + 540) % 360) - 180) < 50 && g.rec >= 1.2).length;
  if (front && thrust >= 2) return 'Skirmisher';
  const angles = new Set(live.map(g => Math.round((((g.a % 360) + 360) % 360) / 30)));
  if (angles.size >= 4) return 'All-Round';
  if (live.length >= 3 && live.every(g => g.r <= 0.8)) return 'Bullet Hose';
  if (live.some(g => g.dm >= 2)) return 'Heavy';
  return 'Assault';
}

function abilityOf(d) {
  if (d.ability) return d.ability;
  if (d.healer || d.guns.some(g => g.fx && g.fx.heal)) return 'pulse';
  if (d.necro) return 'reclaim';
  return 'none';
}

function build() {
  const list = [];
  const byId = new Map();
  const add = raw => {
    const d = {
      id: raw.id,
      name: raw.name,
      src: raw.src || 'nexus',
      level: raw.level,
      tier: TIER_OF_LEVEL[raw.level] || 5,
      body: raw.body || 'circle',
      spin: raw.spin || 0,
      stats: { ...DEFAULT_STATS, ...(raw.stats || {}) },
      guns: [],
      turrets: [],
      decos: raw.decos || [],
      bodyFx: raw.bodyFx || {},
      smasher: raw.smasher ? 1 : 0,
      stealth: raw.stealth ? 1 : 0,
      necro: raw.necro ? 1 : 0,
      healer: raw.healer ? 1 : 0,
      tip: raw.tip || '',
      next: [...(raw.next || [])],
      alt: null
    };
    d.guns = (raw.guns || []).map(normGun);
    d.turrets = (raw.turrets || []).map(t => ({ x: t.x || 0, y: t.y || 0, s: t.s || 0.5, a: t.a || 0, arc: t.arc ?? 360, layer: t.layer ?? 1 }));
    (raw.turrets || []).forEach((t, ti) => {
      for (const g of t.guns || []) {
        const ng = normGun(g);
        for (const k of ['x', 'y', 'len', 'w']) ng[k] = Math.round(ng[k] * d.turrets[ti].s * 1000) / 1000;
        ng.auto = true; ng.t = ti;
        d.guns.push(ng);
      }
    });
    for (const g of d.guns) if (g.auto && g.t === undefined) g.t = -1;
    d.ability = abilityOf({ ...d, ability: raw.ability });
    d.role = roleOf(d);
    d.rarity = d.src === 'nexus' ? (d.level >= 60 ? 'legendary' : 'epic') : RARITY_BY_LEVEL[d.level] || 'epic';
    d.req = { level: d.level };
    d.index = list.length;
    list.push(d);
    byId.set(d.id, d);
  };
  for (const raw of ARRAS) add(raw);
  for (const raw of NEXUS_TANKS) add({ ...raw, src: 'nexus', next: [] });
  for (const raw of NEXUS_TANKS) {
    for (const p of raw.parents) {
      const pd = byId.get(p);
      if (pd && !pd.next.includes(raw.id)) pd.next.push(raw.id);
    }
  }
  for (const d of list) d.next = d.next.filter(id => byId.has(id) && byId.get(id).level > d.level);

  const parents = new Map();
  for (const d of list) for (const n of d.next) { if (!parents.has(n)) parents.set(n, []); parents.get(n).push(d); }
  const primary = new Map([['basic', null]]);
  for (const d of list) {
    if (d.id === 'basic') continue;
    const ps = (parents.get(d.id) || []).filter(p => p.level < d.level);
    let best = null;
    for (const p of ps) if (!best || p.level > best.level) best = p;
    primary.set(d.id, best ? best.id : 'basic');
  }
  for (const d of list) {
    let cur = d.id;
    const seen = new Set();
    while (primary.get(cur) && primary.get(cur) !== 'basic' && !seen.has(cur)) { seen.add(cur); cur = primary.get(cur); }
    d.family = d.id === 'basic' ? 'basic' : cur;
    d.parent = primary.get(d.id) || null;
    d.parents = (parents.get(d.id) || []).map(p => p.id);
  }
  for (const d of list) d.familyName = byId.get(d.family) ? byId.get(d.family).name : d.family;
  for (const d of list) d.profile = powerProfile(d);
  const families = byId.get('basic').next.filter(id => list.some(t => t.family === id)).map(id => ({ key: id, name: byId.get(id).name, root: true }));
  return { list, byId, families };
}

export function powerProfile(def) {
  let dps = 0, range = 0, control = 0, burst = 0;
  const live = def.guns.filter(g => !g.deco);
  for (const g of live) {
    const shots = g.n / (BASE.reload * g.r);
    let dmg = BASE.damage * g.dm * shots;
    if (g.k === 'drone' || g.k === 'minion') dmg = BASE.damage * g.dm * g.max * 0.6;
    dps += dmg;
    range = Math.max(range, g.k === 'beam' ? 650 * g.sp : BASE.speed * g.sp * BASE.life * g.lf);
    control += Object.keys(g.fx).length + (g.k === 'trap' ? 1 : 0) + (g.k === 'drone' ? 1 : 0);
    burst = Math.max(burst, BASE.damage * g.dm * (g.k === 'beam' ? 1.25 : 1));
  }
  if (!live.length) { dps = def.stats.bodyDmg * 30; burst = def.stats.bodyDmg * 20; }
  return {
    dps: Math.round(dps),
    burst: Math.round(burst),
    range: Math.round(range),
    mobility: Math.round(def.stats.speed * 100),
    durability: Math.round(def.stats.hp * 100),
    control: Math.round(control * 10) / 10
  };
}

const REG = build();
export const TANKS = REG.list;
export const TANKS_BY_ID = REG.byId;
export const TANK_FAMILIES = REG.families;
export const BASIC_INDEX = 0;

export function tankByIndex(i) { return TANKS[i] || TANKS[0]; }

export function validateRegistry() {
  const errors = [];
  const ids = new Set();
  for (const d of TANKS) {
    if (ids.has(d.id)) errors.push(`duplicate id ${d.id}`);
    ids.add(d.id);
    for (const k of ['hp', 'speed', 'size', 'bodyDmg', 'fov', 'accel']) {
      const v = d.stats[k];
      if (!Number.isFinite(v) || v <= 0 || v > 6) errors.push(`${d.id}: bad stat ${k}=${v}`);
    }
    if (!d.guns.some(g => !g.deco) && !d.smasher) errors.push(`${d.id}: no weapon and not a smasher`);
    for (const g of d.guns) if (!g.deco) for (const e of validateGun(g)) errors.push(`${d.id}: ${e}`);
    if (!ABILITIES[d.ability]) errors.push(`${d.id}: unknown ability ${d.ability}`);
    for (const n of d.next) {
      const t = TANKS_BY_ID.get(n);
      if (!t) errors.push(`${d.id}: broken evolution ${n}`);
      else if (t.level <= d.level) errors.push(`${d.id}: evolution ${n} does not raise level`);
    }
    if (![1, 15, 30, 45, 60].includes(d.level)) errors.push(`${d.id}: odd level ${d.level}`);
  }
  for (const raw of NEXUS_TANKS) for (const p of raw.parents) if (!TANKS_BY_ID.has(p)) errors.push(`${raw.id}: unknown parent ${p}`);
  const reachable = new Set();
  const stack = ['basic'];
  while (stack.length) {
    const id = stack.pop();
    if (reachable.has(id)) continue;
    reachable.add(id);
    stack.push(...TANKS_BY_ID.get(id).next);
  }
  for (const d of TANKS) if (!reachable.has(d.id)) errors.push(`${d.id}: unreachable`);
  return {
    ok: errors.length === 0, errors, count: TANKS.length,
    arras: TANKS.filter(t => t.src === 'arras').length, armsRace: TANKS.filter(t => t.src === 'ar').length, nexus: TANKS.filter(t => t.src === 'nexus').length,
    families: TANK_FAMILIES.length, reachableInNormalPlay: reachable.size
  };
}
