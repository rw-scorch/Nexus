import { PROJECTILE_KINDS, FLAG_INFO } from './projectile-types.js';

export const BASE = {
  reload: 0.55,
  speed: 560,
  damage: 9,
  pen: 9,
  life: 1.4,
  radius: 22
};

const GUN_DEFAULTS = {
  a: 0, x: 0, y: 0, len: 1.9, w: 0.42, r: 1, d: 0, s: 0.06, rec: 1,
  k: 'bullet', sp: 1, dm: 1, pn: 1, lf: 1, sz: 1, n: 1, auto: false, max: 0, fx: null
};

export function gun(o = {}) {
  const g = { ...GUN_DEFAULTS, ...o };
  g.fx = o.fx ? { ...o.fx } : {};
  if ((g.k === 'drone' || g.k === 'minion') && !g.max) g.max = 4;
  return g;
}

export function pair(gap, o = {}) {
  return [gun({ ...o, y: gap }), gun({ ...o, y: -gap, d: (o.d || 0) + 0.5 })];
}

export function fan(n, totalDeg, o = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    out.push(gun({ ...o, a: (o.a || 0) + t * totalDeg, d: ((o.d || 0) + Math.abs(t)) % 1 }));
  }
  return out;
}

export function ring(n, o = {}, start = 0) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(gun({ ...o, a: start + (360 / n) * i, d: ((o.d || 0) + (i % 2) * 0.5) % 1 }));
  return out;
}

export function stack(n, o = {}) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(gun({ ...o, len: (o.len || 1.9) - i * 0.28, d: i / n }));
  return out;
}

export function auto(x, y, o = {}) {
  return gun({ len: 1.1, w: 0.32, r: 1.15, dm: 0.6, ...o, x, y, auto: true });
}

export function thrusters(n, o = {}) {
  return fan(n, n > 1 ? 50 : 0, { a: 180, dm: 0.4, pn: 0.6, rec: 3, len: 1.5, w: 0.38, lf: 0.6, ...o });
}

export function validateGun(g) {
  const errs = [];
  if (!PROJECTILE_KINDS[g.k]) errs.push(`unknown projectile kind ${g.k}`);
  for (const key of ['a', 'x', 'y', 'len', 'w', 'r', 'd', 's', 'rec', 'sp', 'dm', 'pn', 'lf', 'sz', 'n']) {
    if (typeof g[key] !== 'number' || !Number.isFinite(g[key])) errs.push(`gun.${key} not finite`);
  }
  if (g.r <= 0.05 || g.r > 12) errs.push('reload out of range');
  if (g.dm <= 0 || g.dm > 12) errs.push('damage out of range');
  if (g.n < 1 || g.n > 12) errs.push('pellet count out of range');
  for (const f of Object.keys(g.fx || {})) if (!FLAG_INFO[f]) errs.push(`unknown flag ${f}`);
  return errs;
}
