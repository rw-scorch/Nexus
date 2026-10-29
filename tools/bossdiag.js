import { BOSSES } from '../public/shared/boss-registry.js';
import { spawnBoss } from '../public/shared/sim/bosses.js';
import { quietWorld, openSpot, place } from '../tests/helpers.js';
for (const def of BOSSES) {
  const w = quietWorld('sandbox', 500 + def.index);
  const s = openSpot(w);
  const tanks = [0, 1].map(i => { const p = w.addPlayer({ name: 'P' + i }); const t = w.tankOf(p); place(w, t, s.x + i * 60, s.y + 450); t.level = 45; w.refreshTank(t, true); return t; });
  const b = spawnBoss(w, def.key, s.x, s.y);
  let dmg = 0, attacks = 0, last = b.lastAttackAt, hz = new Set(), bul = 0;
  for (let i = 0; i < 30 * 40; i++) {
    for (const t of tanks) { if (!t.dead) { dmg += t.maxHp - t.hp; t.hp = t.maxHp; } }
    w.step();
    if (b.lastAttackAt !== last) { attacks++; last = b.lastAttackAt; }
    for (const e of w.ents) { if (e.type === 'hazard') hz.add(e.kind); if (e.type === 'bullet' && e.team === -2) bul++; }
  }
  const mobs = w.ents.filter(e => e.type === 'mob' && !e.dead).length;
  console.log(def.key.padEnd(20), 'attacks', String(attacks).padStart(3), 'dmgToTanks', Math.round(dmg).toString().padStart(6), 'hazards', [...hz].join(','), 'mobs', mobs, 'bulletTicks', bul, 'dist', Math.round(Math.hypot(b.x - tanks[0].x, b.y - tanks[0].y)));
}
