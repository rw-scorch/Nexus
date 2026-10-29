import { World } from '../public/shared/sim/world.js';
import { TANKS } from '../public/shared/tank-registry.js';

export function quietWorld(mode = 'sandbox', seed = 1234, settings = {}) {
  const w = new World({ mode, seed, settings: { bossInterval: 900, maxBosses: 4, ...settings } });
  w.logic.state.nextEventAt = 1e12;
  w.logic.state.nextBossAt = 1e12;
  clearAll(w);
  return w;
}

export function clearAll(w) {
  for (const e of w.ents) if (e.type === 'shape' || e.type === 'mob' || (e.type === 'struct' && (e.kind === 'shrine' || e.kind === 'cache'))) w.remove(e);
  w.logic.state.shrines.length = 0;
  w.compact();
}

export function openSpot(w) {
  for (let ty = 3; ty < w.h - 3; ty++) for (let tx = 3; tx < w.w - 12; tx++) {
    let ok = true;
    for (let y = ty - 2; y <= ty + 2 && ok; y++) for (let x = tx - 2; x <= tx + 10 && ok; x++) if (w.tiles[y * w.w + x] !== 0) ok = false;
    if (ok) return { x: (tx + 0.5) * 64, y: (ty + 0.5) * 64 };
  }
  throw new Error('no open spot');
}

export function place(w, t, x, y) {
  t.x = x; t.y = y; t.vx = 0; t.vy = 0;
  t.spawnProtect = 0;
}

export function steps(w, n, each) {
  for (let i = 0; i < n; i++) { if (each) each(i); w.step(); clearShapesNear(w); }
}

function clearShapesNear(w) {
  for (const e of w.ents) if (e.type === 'shape' || (e.type === 'mob' && e.kind === 'crasher')) w.remove(e);
}

export function tankByName(name) {
  return TANKS.find(t => t.name === name);
}
