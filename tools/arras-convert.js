import fs from 'node:fs';

const RAW = process.argv[2] || 'tools/arras-raw.json';
const OUT = process.argv[3] || 'public/shared/data/arras-tanks.js';
const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const C = raw.classes;
const BASE = { ACCEL: 1.6, SPEED: 5.25, HEALTH: 20, DAMAGE: 3, FOV: 1.02, SHIELD: 5.75, REGEN: 0.01 };
const R3 = v => Math.round(v * 1000) / 1000;
const DEG = Math.PI / 180;

function resolve(name) {
  let c = typeof name === 'string' ? C[name] : name;
  if (!c) return null;
  const chain = [];
  const seen = new Set();
  while (c && !seen.has(c)) { seen.add(c); chain.unshift(c); c = c.PARENT ? C[c.PARENT] : null; }
  const out = {};
  for (const part of chain) {
    for (const [k, v] of Object.entries(part)) {
      if (k === 'BODY') out.BODY = { ...(out.BODY || {}), ...v };
      else out[k] = v;
    }
  }
  return out;
}

const gpos = p => Array.isArray(p)
  ? { LENGTH: p[0] ?? 18, WIDTH: p[1] ?? 8, ASPECT: p[2] ?? 1, X: p[3] ?? 0, Y: p[4] ?? 0, ANGLE: p[5] ?? 0, DELAY: p[6] ?? 0 }
  : { LENGTH: 18, WIDTH: 8, ASPECT: 1, X: 0, Y: 0, ANGLE: 0, DELAY: 0, ...p };
const tpos = p => Array.isArray(p)
  ? { SIZE: p[0] ?? 10, X: p[1] ?? 0, Y: p[2] ?? 0, ANGLE: p[3] ?? 0, ARC: p[4] ?? 360, LAYER: p[5] ?? 0 }
  : { SIZE: 10, X: 0, Y: 0, ANGLE: 0, ARC: 360, LAYER: 0, ...p };

function kindOf(type) {
  const n = String(Array.isArray(type) ? type[0] : type || 'bullet');
  const l = n.toLowerCase();
  const fx = {};
  let k = 'bullet';
  if (l.includes('minion')) k = 'minion';
  else if (l.includes('drone') || l.includes('chip') || l.includes('satellite')) k = 'drone';
  if (l.includes('satellite')) fx.orbit = 1;
  else if (l.includes('swarm') || l === 'bee' || l === 'hive') k = 'swarm';
  else if (l.includes('trap') || l === 'boomerang' || l === 'assemblent' || l === 'pillbox') k = 'trap';
  else if (l.includes('missile') || l === 'twister') { k = 'shell'; fx.missile = l === 'spinmissile' || l === 'twister' ? 2 : 1; }
  if (l === 'boomerang') fx.reverse = 1;
  if (l === 'snake') fx.wave = 1;
  if (l === 'splitterbullet') fx.split = 3;
  if (l.includes('healer')) fx.heal = 1;
  if (l === 'settrap' || l === 'unsettrap' || l === 'assemblent') fx.block = 1;
  if (l === 'autotrap' || l === 'pillbox' || l === 'autodrone' || l === 'autosunchip' || l === 'autominion') fx.armed = 1;
  if (Array.isArray(type) && type[1] && JSON.stringify(type[1]).includes('snake')) fx.wave = 1;
  if (l === 'hive') fx.split = 4;
  return { k, fx, name: n };
}

function convGun(raw, scale, maxShare) {
  const p = gpos(raw.POSITION || {});
  const a = p.ANGLE * DEG;
  const g = {
    a: R3(p.ANGLE),
    x: R3(((p.X * Math.cos(a) - p.Y * Math.sin(a)) / 10) * scale),
    y: R3(((p.X * Math.sin(a) + p.Y * Math.cos(a)) / 10) * scale),
    len: R3(p.LENGTH / 10 * scale),
    w: R3(p.WIDTH / 20 * scale),
    asp: R3(p.ASPECT || 1),
    d: R3(((p.DELAY % 1) + 1) % 1)
  };
  const pr = raw.PROPERTIES;
  if (!pr || !pr.SHOOT_SETTINGS || pr.TYPE === undefined) { g.deco = true; return g; }
  const s = pr.SHOOT_SETTINGS;
  const { k, fx } = kindOf(pr.TYPE);
  g.k = k;
  g.fx = fx;
  g.r = R3((s.reload / 10.5) / (k === 'drone' || k === 'minion' ? 1.6 : 1));
  g.dm = R3(Math.max(0.03, s.damage / 0.75));
  g.pn = R3(Math.min(8, Math.max(0.15, Math.pow(Math.max(0.05, s.health * s.pen), 0.75))));
  const spdBase = k === 'drone' ? 1.5 : k === 'minion' ? 3 : 4;
  g.sp = R3(Math.min(3.2, Math.max(0.2, s.speed / spdBase)));
  g.lf = R3(Math.min(4, Math.max(0.2, s.range)));
  g.sz = R3(Math.min(3, Math.max(0.2, s.size)));
  g.s = R3(Math.min(0.6, s.spray * s.shudder * 1.5 * DEG));
  g.rec = R3(s.recoil / 1.4);
  g.n = 1;
  if (k === 'drone' || k === 'minion' || (pr.MAX_CHILDREN && k !== 'bullet')) g.max = pr.MAX_CHILDREN || maxShare || 4;
  if (pr.AUTOFIRE && (k === 'trap' || k === 'swarm' || k === 'bullet')) g.af = 1;
  if (fx.block) g.sz = R3(g.sz * 1.25);
  return g;
}

const HAT_SIDES = { circle: 0, triangle: 3, square: 4, diamond: 4, pentagon: 5, hexagon: 6, octagon: 8, decagon: 10 };

function convTurrets(def, list, out, decos) {
  for (const t of list || []) {
    const name = Array.isArray(t.TYPE) ? t.TYPE[0] : t.TYPE;
    const opts = Array.isArray(t.TYPE) ? t.TYPE[1] || {} : {};
    const p = tpos(t.POSITION || {});
    const hatMatch = typeof name === 'string' && name.match(/^([a-z]+)Hat(_.*)?$/);
    if (hatMatch) {
      const sides = HAT_SIDES[hatMatch[1]] ?? 0;
      const spin = (hatMatch[2] || '').includes('spin') ? ((hatMatch[2].includes('Fast') ? 2.2 : 1) * ((hatMatch[2] || '').includes('Reverse') ? -1 : 1)) : 0;
      decos.push({ sides, s: R3(p.SIZE / 20), a: R3(p.ANGLE), x: R3(p.X / 10), y: R3(p.Y / 10), layer: p.LAYER ? 1 : 0, spin, dark: opts.COLOR === 'black' ? 1 : 0 });
      continue;
    }
    const tc = resolve(typeof name === 'string' ? name : name);
    if (!tc) continue;
    const scale = p.SIZE / 20;
    let guns = tc.GUNS || [];
    if (!guns.length && tc.TURRETS) {
      for (const inner of tc.TURRETS) {
        const ic = resolve(Array.isArray(inner.TYPE) ? inner.TYPE[0] : inner.TYPE);
        if (ic && ic.GUNS) { guns = ic.GUNS; break; }
      }
    }
    if (!guns.length) continue;
    const idx = def.turrets.length;
    def.turrets.push({ x: R3(p.X / 10), y: R3(p.Y / 10), s: R3(scale), a: R3(p.ANGLE), arc: R3(p.ARC), layer: p.LAYER ? 1 : 0 });
    for (const rg of guns) {
      const g = convGun(rg, scale, 0);
      g.auto = true;
      g.t = idx;
      out.push(g);
    }
  }
}

function shapeName(shape) {
  if (typeof shape !== 'number') return 'circle';
  return { 0: 'circle', 3: 'tri', 4: 'square', 5: 'pent', 6: 'hex', 8: 'octagon' }[Math.abs(shape)] || 'circle';
}

function convert(key) {
  const c = resolve(key);
  const body = c.BODY || {};
  const def = { id: key, name: c.LABEL || key, body: shapeName(c.SHAPE), turrets: [], decos: [], guns: [] };
  const rawGuns = c.GUNS || [];
  const droneGuns = rawGuns.filter(g => g.PROPERTIES && g.PROPERTIES.TYPE && ['drone', 'minion'].includes(kindOf(g.PROPERTIES.TYPE).k) && !g.PROPERTIES.MAX_CHILDREN).length;
  const share = c.MAX_CHILDREN && droneGuns ? Math.max(1, Math.round(c.MAX_CHILDREN / droneGuns)) : 0;
  for (const rg of rawGuns) def.guns.push(convGun(rg, 1, share));
  convTurrets(def, c.TURRETS, def.guns, def.decos);
  const spinT = Array.isArray(c.FACING_TYPE) ? c.FACING_TYPE : [c.FACING_TYPE];
  if (spinT[0] === 'spin' || spinT[0] === 'autospin' || spinT[0] === 'fastspin') def.spin = R3(((spinT[1] && spinT[1].speed) || 0.02) * 30 * (spinT[0] === 'fastspin' ? 2 : 1));
  def.stats = {
    hp: R3((body.HEALTH ?? BASE.HEALTH) / BASE.HEALTH),
    speed: R3((body.SPEED ?? BASE.SPEED) / BASE.SPEED),
    size: R3((c.SIZE ?? 12) / 12),
    bodyDmg: R3((body.DAMAGE ?? BASE.DAMAGE) / BASE.DAMAGE),
    fov: R3((body.FOV ?? BASE.FOV) / BASE.FOV),
    accel: R3((body.ACCELERATION ?? body.ACCEL ?? BASE.ACCEL) / BASE.ACCEL),
    shield: R3((body.SHIELD ?? BASE.SHIELD) / BASE.SHIELD),
    density: R3((body.DENSITY ?? 0.5) / 0.5)
  };
  if (c.IS_SMASHER || /smash|spike|landmine|bonker|banger|drifter/i.test(key)) def.smasher = 1;
  if (Array.isArray(c.INVISIBLE) && c.INVISIBLE[0] > 0) def.stealth = 1;
  if (c.NECRO) def.necro = 1;
  if (c.HEALING_TANK) def.healer = 1;
  if (c.TOOLTIP) def.tip = c.TOOLTIP;
  return def;
}

function upgradeEdges(key) {
  const c = C[key];
  const out = [];
  for (let t = 1; t <= 5; t++) {
    for (const x of (c.__main && c.__main[t]) || []) out.push({ id: x, tier: t, src: 'arras' });
    for (const x of (c.__ar && c.__ar[`UPGRADES_TIER_${t}`]) || []) out.push({ id: x, tier: t, src: 'ar' });
  }
  if (key === 'basic' && C.healer) out.push({ id: 'healer', tier: 2, src: 'arras' });
  return out;
}

const order = ['basic'];
const edges = new Map();
for (let i = 0; i < order.length; i++) {
  const k = order[i];
  const list = [];
  for (const e of upgradeEdges(k)) {
    if (!C[e.id] || (raw.origin[e.id] && raw.origin[e.id].generated) || e.id === k) continue;
    if (e.src === 'ar' && raw.origin[e.id] && raw.origin[e.id].file === 'armsRace.js' && /^(Auto-|Mega Auto-|Triple Auto-)/.test(C[e.id].LABEL || '') ) continue;
    if (list.some(x => x.id === e.id)) continue;
    list.push(e);
    if (!order.includes(e.id)) order.push(e.id);
  }
  edges.set(k, list);
}
const edgeLv = (e, pl) => { const p0 = pl <= 1 ? 0 : pl; return Math.min(75, e.src === 'ar' && e.tier >= 4 ? Math.max(60, p0 + 15) : Math.max(e.tier * 15, p0 + 15)); };
const level = new Map([['basic', 1]]);
const src = new Map([['basic', 'arras']]);
for (let changed = true, guard = 0; changed && guard < 50; guard++) {
  changed = false;
  for (const k of order) {
    if (!level.has(k)) continue;
    for (const e of edges.get(k)) {
      const lv = edgeLv(e, level.get(k));
      if (!level.has(e.id) || lv < level.get(e.id)) { level.set(e.id, lv); changed = true; }
      if (e.src === 'arras' && src.get(k) === 'arras') { if (src.get(e.id) !== 'arras') { src.set(e.id, 'arras'); changed = true; } }
      else if (!src.has(e.id)) src.set(e.id, 'ar');
    }
  }
}
order.sort((a, b) => level.get(a) - level.get(b) || order.indexOf(a) - order.indexOf(b));
const defs = order.map(k => {
  const d = convert(k);
  d.level = level.get(k);
  d.src = src.get(k);
  d.next = (edges.get(k) || []).map(e => e.id);
  return d;
});
for (const d of defs) d.next = d.next.filter(id => level.get(id) > d.level);

const header = '// Generated by tools/arras-convert.js from Open Source Arras definitions (MIT License, Copyright (c) 2026 Open Source Arras).\n';
fs.mkdirSync('public/shared/data', { recursive: true });
fs.writeFileSync(OUT, header + 'export default ' + JSON.stringify(defs) + ';\n');
const byLv = {};
for (const d of defs) byLv[d.level] = (byLv[d.level] || 0) + 1;
console.log('tanks', defs.length, 'by level', JSON.stringify(byLv), 'bytes', fs.statSync(OUT).size);
