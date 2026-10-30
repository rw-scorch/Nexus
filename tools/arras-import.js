import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

const SRC = process.argv[2] || '/home/claude/open-source-arras/open-source-arras/server/lib/definitions';
const OUT = process.argv[3] || 'tools/arras-raw.json';

const Class = {};
const origin = {};
let currentFile = '';
let loopDepth = 0;

const clone = v => JSON.parse(JSON.stringify(v));
const ensure = t => (typeof t === 'string' ? Class[t] : t);
const deref = t => {
  const o = clone(ensure(t) || {});
  for (const k of Object.keys(o)) if (k.startsWith('UPGRADES_TIER_')) delete o[k];
  return o;
};

function combineStats(stats) {
  const keys = ['reload', 'recoil', 'shudder', 'size', 'health', 'damage', 'pen', 'speed', 'maxSpeed', 'range', 'density', 'spray', 'resist'];
  const d = Object.fromEntries(keys.map(k => [k, 1]));
  for (let s of stats) {
    if (!s) continue;
    if (Array.isArray(s)) s = Object.fromEntries(keys.map((k, i) => [k, s[i]]));
    for (const k of keys) d[k] *= s[k] ?? 1;
  }
  return d;
}

const posKeysGun = ['LENGTH', 'WIDTH', 'ASPECT', 'X', 'Y', 'ANGLE', 'DELAY'];
const posKeysTur = ['SIZE', 'X', 'Y', 'ANGLE', 'ARC', 'LAYER'];
function posKey(w, name) {
  if (!Array.isArray(w.POSITION)) return name;
  const keys = w.TYPE !== undefined ? posKeysTur : posKeysGun;
  return keys.indexOf(name);
}

function weaponArray(weapons, count, o = {}) {
  if (!Array.isArray(weapons)) weapons = [weapons];
  const out = [];
  for (const w of weapons) for (let i = 0; i < count; i++) {
    const n = clone(w);
    const ak = posKey(n, 'ANGLE'), dk = posKey(n, 'DELAY');
    n.POSITION[ak] = (n.POSITION[ak] ?? 0) + 360 / count * i + (o.startAngle ?? 0);
    if (w.TYPE === undefined) {
      n.POSITION[dk] = (n.POSITION[dk] ?? 0) + (o.delayIncrement ?? 0) * i;
      if (!o.delayOverflow) n.POSITION[dk] %= 1;
    }
    out.push(n);
  }
  return out;
}

function weaponMirror(weapons, o = {}) {
  if (!Array.isArray(weapons)) weapons = [weapons];
  const out = [];
  for (const w of weapons) {
    const n = clone(w);
    const yk = posKey(n, 'Y'), ak = posKey(n, 'ANGLE'), dk = posKey(n, 'DELAY');
    n.POSITION[yk] = -(n.POSITION[yk] ?? 0);
    n.POSITION[ak] = -(n.POSITION[ak] ?? 0);
    if (w.TYPE === undefined || !Array.isArray(n.POSITION)) {
      n.POSITION[dk] = (n.POSITION[dk] ?? 0) + (o.delayIncrement ?? 0);
      if (!o.delayOverflow) n.POSITION[dk] %= 1;
    }
    out.push(w, n);
  }
  return out;
}

function weaponStack(weapons, count, o = {}) {
  if (!Array.isArray(weapons)) weapons = [weapons];
  const out = [];
  for (const w of weapons) for (let i = 0; i < count; i++) {
    const n = clone(w);
    const lk = posKey(n, 'LENGTH'), xk = posKey(n, 'X'), dk = posKey(n, 'DELAY');
    n.POSITION[lk] = (n.POSITION[lk] ?? 0) - i * (o.lengthOffset ?? 0);
    n.POSITION[xk] = (n.POSITION[xk] ?? 0) - i * (o.xPosOffset ?? 0);
    n.POSITION[dk] = (n.POSITION[dk] ?? 0) + (o.delayIncrement ?? 0) * i;
    if (!o.delayOverflow) n.POSITION[dk] %= 1;
    out.push(n);
  }
  return out;
}

function spawnerSet(type, name, o, cfg) {
  const src = ensure(type);
  const out = deref(type);
  const ang = 180 - (o.angle ?? 125);
  const count = o.count ?? 2;
  const sp = [];
  if (count % 2 === 1) sp.push(...cfg.single());
  for (let i = 2; i <= count - count % 2; i += 2) sp.push(...cfg.pair(ang * i / 2));
  out.GUNS = src.GUNS == null ? sp : (o.renderBehind ? sp.concat(clone(src.GUNS)) : clone(src.GUNS).concat(sp));
  if (o.drive) out.TURRETS = [...(src.TURRETS || []), { TYPE: ['squareHat', {}], POSITION: { SIZE: 9, LAYER: 1 } }];
  out.LABEL = name === -1 ? cfg.prefix + src.LABEL.toLowerCase() + (o.drive ? 'drive' : '') : name;
  return out;
}

const G = () => scope.g;
const helpers = {
  combineStats,
  weaponArray, weaponMirror, weaponStack,
  dereference: deref,
  makeOver(type, name = -1, o = {}) {
    const props = { SHOOT_SETTINGS: combineStats([G().drone, G().overseer, ...(o.extraStats || [])]), TYPE: o.drive ? 'autoDrone' : 'drone', AUTOFIRE: true, MAX_CHILDREN: o.maxDrones ?? 3 };
    const sp = a => ({ POSITION: { LENGTH: 6, WIDTH: 11 + (o.widthOffset ?? 0), ASPECT: 1.2, X: 8, ANGLE: a }, PROPERTIES: { ...props } });
    return spawnerSet(type, name, o, { prefix: 'Over', single: () => [sp(180)], pair: a => weaponMirror(sp(180 - a)) });
  },
  makeBattle(type, name = -1, o = {}) {
    const w = 7.2 + (o.widthOffset ?? 0);
    const guided = { SHOOT_SETTINGS: combineStats([G().swarm, G().battleship, ...(o.extraStats || [])]), TYPE: 'swarm' };
    const autoP = { SHOOT_SETTINGS: combineStats([G().swarm, ...(o.extraStats || [])]), TYPE: 'autoswarm' };
    const sp = (a, p) => ({ POSITION: { LENGTH: 9, WIDTH: w, ASPECT: 0.6, X: 5, Y: 4, ANGLE: a }, PROPERTIES: { ...p } });
    return spawnerSet(type, name, o, { prefix: 'Battle', single: () => weaponMirror(sp(180, autoP), { delayIncrement: 0.5 }), pair: a => [...weaponMirror(sp(180 - a, guided), { delayIncrement: 0.5 }), ...weaponMirror(sp(180 + a, autoP), { delayIncrement: 0.5 })] });
  },
  makeCap(type, name = -1, o = {}) {
    const wo = o.widthOffset ?? 0;
    const props = { SHOOT_SETTINGS: combineStats([G().minion, G().spawner]), TYPE: 'minion', AUTOFIRE: true, MAX_CHILDREN: o.maxDrones ?? 3 };
    const set = a => [
      { POSITION: { LENGTH: 4.5, WIDTH: 9 + wo, X: 10.5, ANGLE: a } },
      { POSITION: { LENGTH: 1, WIDTH: 11 + wo, X: 15, ANGLE: a }, PROPERTIES: { ...props } },
      { POSITION: { LENGTH: 11.5, WIDTH: 11 + wo, ANGLE: a } }
    ];
    return spawnerSet(type, name, o, { prefix: 'Cap', single: () => set(180), pair: a => weaponMirror(set(180 - a)) });
  },
  makeFore(type, name = -1, o = {}) {
    const props = m => ({ SHOOT_SETTINGS: combineStats([G().drone, G().honcho, ...(o.extraStats || [])]), TYPE: o.drive ? 'autoDrone' : 'drone', AUTOFIRE: true, MAX_CHILDREN: m });
    const mx = o.maxDrones ?? 1;
    const sp = (a, m) => ({ POSITION: { LENGTH: 12 + (o.heightOffset ?? 0), WIDTH: 14 + (o.widthOffset ?? 0), ASPECT: 1.3, X: 2, ANGLE: a }, PROPERTIES: props(m) });
    return spawnerSet(type, name, o, { prefix: 'Fore', single: () => [sp(180, mx)], pair: a => [sp(180 - a, mx + 1), sp(180 + a, mx)] });
  },
  makeBird(type, name = -1, o = {}) {
    const src = ensure(type);
    const out = deref(type);
    const tp = { SHOOT_SETTINGS: combineStats([G().basic, G().flankGuard, G().triAngle, G().thruster, { recoil: 0.5 * (o.frontRecoil ?? 1) }]), TYPE: 'bullet', LABEL: 'thruster' };
    const th = [...weaponMirror({ POSITION: { LENGTH: 16, WIDTH: 8, ANGLE: 153, DELAY: 0.1 }, PROPERTIES: tp }), { POSITION: { LENGTH: 18, WIDTH: 8, ANGLE: 180, DELAY: 0.6 }, PROPERTIES: { ...tp } }];
    if (o.super) th.unshift(...weaponMirror({ POSITION: { LENGTH: 14, WIDTH: 8, ANGLE: 130, DELAY: 0.6 }, PROPERTIES: tp }));
    for (const gun of out.GUNS || []) if (gun.PROPERTIES && gun.PROPERTIES.SHOOT_SETTINGS) gun.PROPERTIES.SHOOT_SETTINGS = combineStats([gun.PROPERTIES.SHOOT_SETTINGS, G().flankGuard, G().triAngle, G().triAngleFront, { recoil: o.frontRecoil ?? 1 }]);
    out.GUNS = src.GUNS == null ? clone(th) : [...out.GUNS, ...clone(th)];
    out.LABEL = name === -1 ? 'Bird ' + src.LABEL : name;
    return out;
  },
  makeFlank(type, count, name = -1, o = {}) {
    const src = ensure(type);
    const out = deref(type);
    for (const gun of out.GUNS || []) if (gun.PROPERTIES && gun.PROPERTIES.SHOOT_SETTINGS) gun.PROPERTIES.SHOOT_SETTINGS = combineStats([gun.PROPERTIES.SHOOT_SETTINGS, ...(o.extraStats || [])]);
    out.GUNS = weaponArray(out.GUNS || [], count ?? 3, { delayIncrement: o.delayIncrement ?? 0, delayOverflow: o.delayOverflow, startAngle: o.startAngle ?? 0 });
    out.LABEL = name === -1 ? src.LABEL : name;
    return out;
  },
  makeGuard(type, name = -1, o = {}) {
    const src = ensure(type);
    const out = deref(type);
    let tr = { GUNS: [{ POSITION: { LENGTH: 13, WIDTH: 8 } }, { POSITION: { LENGTH: 4, WIDTH: 8, ASPECT: 1.7, X: 13 }, PROPERTIES: { SHOOT_SETTINGS: combineStats([G().trap]), TYPE: 'trap' } }] };
    if (o.type) tr = deref(o.type);
    for (const gun of tr.GUNS) if (gun.POSITION) gun.POSITION.ANGLE = (gun.POSITION.ANGLE || 0) + 180;
    if (o.triple) tr.GUNS.push(...weaponArray(tr.GUNS, 2, { startAngle: 90 }));
    for (const gun of out.GUNS || []) if (gun.PROPERTIES && gun.PROPERTIES.SHOOT_SETTINGS) gun.PROPERTIES.SHOOT_SETTINGS = combineStats([gun.PROPERTIES.SHOOT_SETTINGS, G().flankGuard, G().flankGuard]);
    out.GUNS = src.GUNS == null ? tr.GUNS : [...out.GUNS, ...tr.GUNS];
    out.LABEL = name === -1 ? src.LABEL + ' Guard' : name;
    return out;
  },
  makeGunner(type, name = -1, o = {}) {
    const src = ensure(type);
    const out = deref(type);
    const gn = weaponMirror({ POSITION: { LENGTH: o.gunLength ?? 19, WIDTH: 2, Y: -2.5, ANGLE: 180 }, PROPERTIES: { SHOOT_SETTINGS: combineStats([G().basic, G().pelleter, G().power, G().twin, { recoil: 4 }, { recoil: 1.8 }]), TYPE: 'bullet' } }, { delayIncrement: 0.5 });
    if (!o.noDeco) gn.push({ POSITION: { LENGTH: 12, WIDTH: 11, ANGLE: 180 } });
    out.GUNS = src.GUNS == null ? gn : (o.renderBehind ? gn.concat(out.GUNS) : out.GUNS.concat(gn));
    out.LABEL = name === -1 ? 'Gunner ' + src.LABEL : name;
    return out;
  },
  makeAuto(type, name = -1, o = {}) {
    const src = ensure(type);
    const out = deref(type);
    const ag = weaponArray({ POSITION: { SIZE: o.size ?? 10, ANGLE: o.angle ?? 180, X: o.x ?? 0, Y: o.y ?? 0, ARC: o.arc ?? 360, LAYER: o.layer ?? 1 }, TYPE: [o.type ?? 'autoTurret', {}] }, o.total ?? 1);
    if (src.GUNS) out.GUNS = clone(src.GUNS);
    out.TURRETS = !src.TURRETS || o.clearTurrets ? ag : [...clone(src.TURRETS), ...ag];
    out.LABEL = name === -1 ? 'Auto-' + src.LABEL : name;
    return out;
  },
  makeRadialAuto(type, o = {}) {
    const count = o.count ?? 3;
    let id = type;
    let label;
    if (!(o.isTurret ?? false)) {
      const t = deref(type);
      label = t.LABEL;
      let extra = o.extraStats ?? [];
      if (!Array.isArray(extra)) extra = [extra];
      id = o.turretIdentifier ?? `auto${t.LABEL}Gun`;
      const guns = clone(t.GUNS || []);
      for (const gun of guns) if (gun.PROPERTIES && gun.PROPERTIES.SHOOT_SETTINGS) gun.PROPERTIES.SHOOT_SETTINGS = combineStats([gun.PROPERTIES.SHOOT_SETTINGS, G().autoTurret, ...extra]);
      Class[id] = { LABEL: '', GUNS: guns, TURRETS: t.TURRETS, __turret: true };
    } else label = (ensure(type) || {}).LABEL;
    return {
      LABEL: o.label ?? (label + '-' + count),
      FACING_TYPE: ['spin', { speed: o.rotation ?? 0.02 }],
      BODY: o.body,
      GUNS: [],
      TURRETS: weaponArray({ TYPE: id, POSITION: { SIZE: o.size ?? 11, X: o.x ?? 8, ANGLE: o.angle ?? 0, ARC: o.arc ?? 190, LAYER: o.layer ?? 0 } }, count)
    };
  },
  makeTurret(type, o = {}) {
    const t = deref(type);
    let extra = o.extraStats ?? [G().autoTurret];
    if (!Array.isArray(extra)) extra = [extra];
    const guns = t.GUNS || [];
    for (const gun of guns) if (gun.PROPERTIES && gun.PROPERTIES.SHOOT_SETTINGS) gun.PROPERTIES.SHOOT_SETTINGS = combineStats([gun.PROPERTIES.SHOOT_SETTINGS, ...extra]);
    return { LABEL: o.label ?? '', SHAPE: o.shape ?? 0, GUNS: guns, TURRETS: t.TURRETS, __turret: true };
  },
  makeWhirlwind(type, o = {}) {
    const src = ensure(type);
    const out = deref(type);
    const n = o.satellites ?? 4;
    const sats = [];
    for (let i = 0; i < n; i++) sats.push({ POSITION: { WIDTH: o.satelliteSize ?? 8, LENGTH: 1, DELAY: i * 0.25 }, PROPERTIES: { SHOOT_SETTINGS: combineStats([G().satellite, ...(o.extraStats || [{}]), { recoil: 0 }]), TYPE: 'satellite', MAX_CHILDREN: 1, AUTOFIRE: true } });
    out.GUNS = src.GUNS == null ? sats : [...clone(src.GUNS), ...sats];
    out.LABEL = o.label === -1 || o.label === undefined ? 'Whirl ' + src.LABEL : o.label;
    out.__whirl = n;
    return out;
  },
  makeHat(shape = 0) { return { LABEL: '', SHAPE: shape, __hat: true }; },
  makeAura() { return { LABEL: 'aura', __aura: true }; },
  addUpgrades(type, tier, ups = [], o = {}) {
    const c = ensure(type);
    if (!c) return;
    const k = `UPGRADES_TIER_${tier}`;
    const list = ups.map(x => x + (o.suffix ?? ''));
    (c.__ar = c.__ar || {})[k] = [...((c.__ar || {})[k] || []), ...list];
    if (!c[k]) c[k] = list;
    else if (o.start !== undefined && o.start !== -1) c[k].splice(o.start, 0, ...list);
    else c[k].push(...list);
  },
  removeUpgrades(type, tier, ups = []) {
    const c = ensure(type);
    if (!c) return;
    const k = `UPGRADES_TIER_${tier}`;
    if (!c[k]) return;
    const drop = new Set(ups);
    c[k] = c[k].filter(x => !drop.has(x));
    (c.__removed = c.__removed || []).push(...ups);
  },
  setTurretProjectileRecoil() {},
  makeMenu(name = -1) { return { LABEL: name, __menu: true }; },
  skillSet() { return []; },
  setBuild() { return []; }
};

const scope = {
  Class, Config: { arms_race: true, teams: 2, spawn_class: 'basic', skill_cap: 9 },
  Math, undefined, Infinity, NaN, Array: Object.assign((...a) => new Array(...a), { isArray: Array.isArray, from: Array.from }), Number, String, Object: { keys: Object.keys, values: Object.values, entries: Object.entries, assign: Object.assign }, ...helpers
};

class Ret { constructor(v) { this.v = v; } }
const BREAK = Symbol('break');
const CONT = Symbol('continue');

function evalModuleExports(file) {
  const ast = acorn.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'script' });
  for (const st of ast.body) {
    if (st.type === 'ExpressionStatement' && st.expression.type === 'AssignmentExpression' && st.expression.left.type === 'MemberExpression' && st.expression.left.object.name === 'module') {
      return ev(st.expression.right, new Env(null));
    }
  }
  return {};
}

class Env {
  constructor(parent) { this.parent = parent; this.vars = new Map(); }
  get(n) {
    if (this.vars.has(n)) return this.vars.get(n);
    if (this.parent) return this.parent.get(n);
    if (n in scope) return scope[n];
    throw new Error('unknown identifier ' + n);
  }
  has(n) { return this.vars.has(n) || (this.parent ? this.parent.has(n) : n in scope); }
  set(n, v) {
    if (this.vars.has(n)) return this.vars.set(n, v);
    if (this.parent && this.parent.has(n)) return this.parent.set(n, v);
    scope[n] = v;
  }
  def(n, v) { this.vars.set(n, v); }
}

function bindPattern(p, v, env) {
  if (p.type === 'Identifier') env.def(p.name, v);
  else if (p.type === 'ObjectPattern') for (const pr of p.properties) bindPattern(pr.value, v ? v[pr.key.name] : undefined, env);
  else if (p.type === 'ArrayPattern') p.elements.forEach((e, i) => e && bindPattern(e, v ? v[i] : undefined, env));
  else if (p.type === 'AssignmentPattern') bindPattern(p.left, v === undefined ? ev(p.right, env) : v, env);
}

function run(st, env) {
  switch (st.type) {
    case 'ExpressionStatement': ev(st.expression, env); return;
    case 'EmptyStatement': return;
    case 'VariableDeclaration':
      for (const d of st.declarations) {
        if (d.init && d.init.type === 'CallExpression' && d.init.callee.name === 'require') { bindRequire(d.id, d.init.arguments[0].value, env); continue; }
        bindPattern(d.id, d.id.name === 'tier4_AR' ? 4 : (d.init ? ev(d.init, env) : undefined), env);
      }
      return;
    case 'FunctionDeclaration': env.def(st.id.name, makeFn(st, env)); return;
    case 'BlockStatement': {
      const e = new Env(env);
      for (const s of st.body) { const r = run(s, e); if (r) return r; }
      return;
    }
    case 'IfStatement':
      if (ev(st.test, env)) return run(st.consequent, env);
      if (st.alternate) return run(st.alternate, env);
      return;
    case 'ForStatement': {
      const e = new Env(env);
      if (st.init) st.init.type === 'VariableDeclaration' ? run(st.init, e) : ev(st.init, e);
      loopDepth++;
      try {
        for (let guard = 0; guard < 5000 && (!st.test || ev(st.test, e)); guard++) {
          const r = run(st.body, e);
          if (r === BREAK) break;
          if (r instanceof Ret) return r;
          if (st.update) ev(st.update, e);
        }
      } finally { loopDepth--; }
      return;
    }
    case 'ForOfStatement': {
      const it = ev(st.right, env);
      loopDepth++;
      try {
        for (const v of it) {
          const e = new Env(env);
          bindPattern(st.left.type === 'VariableDeclaration' ? st.left.declarations[0].id : st.left, v, e);
          const r = run(st.body, e);
          if (r === BREAK) break;
          if (r instanceof Ret) return r;
        }
      } finally { loopDepth--; }
      return;
    }
    case 'ForInStatement': {
      const it = ev(st.right, env);
      for (const v of Object.keys(it || {})) {
        const e = new Env(env);
        bindPattern(st.left.declarations[0].id, v, e);
        const r = run(st.body, e);
        if (r === BREAK) break;
        if (r instanceof Ret) return r;
      }
      return;
    }
    case 'ReturnStatement': return new Ret(st.argument ? ev(st.argument, env) : undefined);
    case 'BreakStatement': return BREAK;
    case 'ContinueStatement': return CONT;
    default: throw new Error('statement ' + st.type);
  }
}

const modules = {};
function bindRequire(pattern, spec, env) {
  const name = path.basename(spec, '.js');
  const mod = modules[name] || {};
  bindPattern(pattern, mod, env);
}

function makeFn(node, env) {
  return (...args) => {
    const e = new Env(env);
    node.params.forEach((p, i) => bindPattern(p, args[i], e));
    if (node.expression) return ev(node.body, e);
    const r = run(node.body, e);
    return r instanceof Ret ? r.v : undefined;
  };
}

function key(prop, computed, env) { return computed ? ev(prop, env) : (prop.type === 'Identifier' ? prop.name : prop.value); }

function assignTo(target, value, env) {
  if (target.type === 'Identifier') { env.set(target.name, value); return value; }
  const obj = ev(target.object, env);
  const k = key(target.property, target.computed, env);
  obj[k] = value;
  if (obj === Class && value && typeof value === 'object') {
    origin[k] = { file: currentFile, generated: loopDepth > 0 };
  }
  return value;
}

const STR_METHODS = new Set(['charAt', 'slice', 'toUpperCase', 'toLowerCase', 'replace', 'split', 'includes', 'startsWith', 'endsWith', 'trim', 'substring', 'indexOf', 'concat', 'repeat']);
const ARR_METHODS = new Set(['map', 'fill', 'push', 'concat', 'slice', 'filter', 'includes', 'indexOf', 'join', 'forEach', 'splice', 'reverse', 'flat', 'unshift', 'some', 'find']);

function ev(n, env) {
  switch (n.type) {
    case 'Literal': return n.regex ? new RegExp(n.regex.pattern, n.regex.flags) : n.value;
    case 'Identifier': return env.get(n.name);
    case 'TemplateLiteral': {
      let s = '';
      n.quasis.forEach((q, i) => { s += q.value.cooked; if (i < n.expressions.length) s += ev(n.expressions[i], env); });
      return s;
    }
    case 'ArrayExpression': {
      const out = [];
      for (const el of n.elements) {
        if (!el) out.push(undefined);
        else if (el.type === 'SpreadElement') out.push(...(ev(el.argument, env) || []));
        else out.push(ev(el, env));
      }
      return out;
    }
    case 'ObjectExpression': {
      const out = {};
      for (const p of n.properties) {
        if (p.type === 'SpreadElement') Object.assign(out, ev(p.argument, env));
        else out[key(p.key, p.computed, env)] = ev(p.value, env);
      }
      return out;
    }
    case 'MemberExpression': {
      const obj = ev(n.object, env);
      if (obj == null) { if (n.optional) return undefined; throw new Error('member of null'); }
      return obj[key(n.property, n.computed, env)];
    }
    case 'ChainExpression': try { return ev(n.expression, env); } catch { return undefined; }
    case 'CallExpression': {
      if (n.callee.type === 'MemberExpression') {
        const obj = ev(n.callee.object, env);
        const m = key(n.callee.property, n.callee.computed, env);
        const args = evArgs(n.arguments, env);
        if (typeof obj === 'string' && STR_METHODS.has(m)) return obj[m](...args);
        if (Array.isArray(obj) && ARR_METHODS.has(m)) return obj[m](...args);
        if (obj === Math) return Math[m](...args);
        if (obj === scope.Array) return obj[m](...args);
        if (obj === scope.Object) return scope.Object[m](...args);
        if (typeof obj === 'number' && m === 'toFixed') return obj.toFixed(...args);
        throw new Error('method ' + m);
      }
      const f = ev(n.callee, env);
      if (typeof f !== 'function') throw new Error('not callable');
      return f(...evArgs(n.arguments, env));
    }
    case 'NewExpression': {
      if (n.callee.name === 'Array') return new Array(...evArgs(n.arguments, env));
      throw new Error('new ' + n.callee.name);
    }
    case 'ArrowFunctionExpression':
    case 'FunctionExpression': return makeFn(n, env);
    case 'UnaryExpression': {
      if (n.operator === 'typeof') { try { return typeof ev(n.argument, env); } catch { return 'undefined'; } }
      const v = ev(n.argument, env);
      return { '-': -v, '+': +v, '!': !v, '~': ~v, 'void': undefined }[n.operator];
    }
    case 'BinaryExpression': {
      const a = ev(n.left, env), b = ev(n.right, env);
      switch (n.operator) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return a / b; case '%': return a % b; case '**': return a ** b;
        case '==': return a == b; case '!=': return a != b; case '===': return a === b; case '!==': return a !== b;
        case '<': return a < b; case '>': return a > b; case '<=': return a <= b; case '>=': return a >= b;
        case 'in': return a in b; case '&': return a & b; case '|': return a | b;
      }
      throw new Error('op ' + n.operator);
    }
    case 'LogicalExpression': {
      const a = ev(n.left, env);
      if (n.operator === '&&') return a && ev(n.right, env);
      if (n.operator === '||') return a || ev(n.right, env);
      return a ?? ev(n.right, env);
    }
    case 'ConditionalExpression': return ev(n.test, env) ? ev(n.consequent, env) : ev(n.alternate, env);
    case 'AssignmentExpression': {
      if (n.operator === '=') return assignTo(n.left, ev(n.right, env), env);
      const cur = (() => { try { return ev(n.left, env); } catch { return undefined; } })();
      if (n.operator === '??=') return cur ?? assignTo(n.left, ev(n.right, env), env);
      if (n.operator === '||=') return cur || assignTo(n.left, ev(n.right, env), env);
      const r = ev(n.right, env);
      const v = { '+=': cur + r, '-=': cur - r, '*=': cur * r, '/=': cur / r }[n.operator];
      return assignTo(n.left, v, env);
    }
    case 'UpdateExpression': {
      const cur = ev(n.argument, env);
      const v = n.operator === '++' ? cur + 1 : cur - 1;
      assignTo(n.argument, v, env);
      return n.prefix ? v : cur;
    }
    case 'SequenceExpression': { let v; for (const e of n.expressions) v = ev(e, env); return v; }
    default: throw new Error('expr ' + n.type);
  }
}

function evArgs(args, env) {
  const out = [];
  for (const a of args) a.type === 'SpreadElement' ? out.push(...ev(a.argument, env)) : out.push(ev(a, env));
  return out;
}

const failures = [];
function runFile(rel) {
  currentFile = path.basename(rel);
  const ast = acorn.parse(fs.readFileSync(path.join(SRC, rel), 'utf8'), { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  const env = new Env(null);
  for (const st of ast.body) {
    try { run(st, env); } catch (err) {
      failures.push(`${currentFile}:${st.loc ? st.loc.start.line : '?'} ${err.message}`);
    }
  }
}

acorn.parse('0', { ecmaVersion: 'latest' });
modules.gunvals = evalModuleExports(path.join(SRC, 'gunvals.js'));
modules.constants = evalModuleExports(path.join(SRC, 'constants.js'));
modules.presets = evalModuleExports(path.join(SRC, 'presets.js'));
modules.facilitators = helpers;
scope.g = modules.gunvals;
scope.base = modules.constants.base;
scope.statnames = modules.constants.statnames || {};
scope.preset = modules.presets;

for (const f of ['groups/generics.js', 'groups/hats.js', 'groups/tanks/main.js', 'groups/turrets.js']) runFile(f);
for (const c of Object.values(Class)) {
  if (!c || typeof c !== 'object') continue;
  for (let t = 1; t <= 5; t++) if (c[`UPGRADES_TIER_${t}`]) (c.__main = c.__main || {})[t] = [...c[`UPGRADES_TIER_${t}`]];
}
runFile('groups/tanks/armsRace.js');

const out = { classes: {}, origin, failures };
for (const [k, v] of Object.entries(Class)) {
  if (!v || typeof v !== 'object') continue;
  out.classes[k] = v;
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`classes ${Object.keys(out.classes).length}, failures ${failures.length}`);
for (const f of failures.slice(0, 40)) console.log('  ' + f);
