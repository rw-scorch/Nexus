import { barrel } from './nexus-tanks.js';

export const PART_KINDS = ['bullet', 'drone', 'trap', 'swarm', 'minion', 'beam', 'shell', 'deco'];
export const BODIES = ['circle', 'square', 'tri', 'pent', 'hex', 'octagon'];
export const MAX_GUNS = 24;

const clamp = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

export function cleanDesign(d = {}) {
  const parts = (Array.isArray(d.parts) ? d.parts : []).slice(0, 16).map(p => ({
    k: PART_KINDS.includes(p.k) ? p.k : 'bullet',
    L: clamp(p.L, 3, 40, 18), W: clamp(p.W, 3, 24, 8), asp: clamp(p.asp, -2, 2.5, 1),
    X: clamp(p.X, -10, 24, 0), Y: clamp(p.Y, -20, 20, 0), A: clamp(p.A, -180, 180, 0), D: clamp(p.D, 0, 0.99, 0),
    r: clamp(p.r, 0.3, 5, 1), dm: clamp(p.dm, 0.2, 4, 1), sp: clamp(p.sp, 0.4, 2.5, 1),
    n: Math.round(clamp(p.n, 1, 8, 1)), m: !!p.m
  }));
  return {
    name: String(d.name || 'Custom Tank').replace(/[^\w \-.']/g, '').trim().slice(0, 20) || 'Custom Tank',
    body: BODIES.includes(d.body) ? d.body : 'circle',
    spin: clamp(d.spin, 0, 3, 0),
    parts
  };
}

export function buildCustomRaw(design) {
  const d = cleanDesign(design);
  const guns = [];
  let drones = 0;
  for (const p of d.parts) {
    const copies = [];
    for (let i = 0; i < p.n; i++) {
      const A = p.A + (360 / p.n) * i;
      copies.push({ Y: p.Y, A, D: (p.D + (p.n > 1 ? i / p.n : 0)) % 1 });
      if (p.m && (p.Y !== 0 || (A % 180) !== 0)) copies.push({ Y: -p.Y, A: -A, D: (p.D + 0.5) % 1 });
    }
    for (const c of copies) {
      if (guns.length >= MAX_GUNS) break;
      if (p.k === 'deco') { guns.push(barrel(p.L, p.W, p.asp, p.X, c.Y, c.A, 0)); continue; }
      const props = { k: p.k, r: p.r, dm: p.dm, sp: p.sp, s: p.k === 'beam' ? 0 : 0.04, rec: p.k === 'beam' ? 0.5 : 1 };
      if (p.k === 'drone' || p.k === 'minion') {
        if (drones >= 16) continue;
        props.max = Math.min(4, 16 - drones);
        drones += props.max;
        props.sz = 0.6;
        props.r = p.r * 1.6;
      }
      if (p.k === 'trap') { props.sz = 0.75; props.r = p.r * 2; }
      if (p.k === 'beam') props.r = Math.max(1.2, p.r * 1.8);
      if (p.k === 'shell') props.r = p.r * 2;
      guns.push(barrel(p.L, p.W, p.asp, p.X, c.Y, c.A, c.D, props));
    }
  }
  if (!guns.some(g => !g.deco)) guns.push(barrel(18, 8, 1, 0, 0, 0, 0, {}));
  const live = guns.filter(g => !g.deco).length;
  return {
    id: 'custom', name: d.name, level: 60, body: d.body, spin: d.spin, guns,
    stats: { hp: 1, speed: Math.max(0.72, 1 - 0.012 * Math.max(0, live - 4)), fov: 1.1 }
  };
}

export const STARTER_DESIGN = {
  name: 'My Tank', body: 'circle', spin: 0,
  parts: [{ k: 'bullet', L: 20, W: 8, asp: 1, X: 0, Y: 5.5, A: 0, D: 0, r: 1, dm: 0.8, sp: 1, n: 1, m: true }]
};
