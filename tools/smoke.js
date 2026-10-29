import { World } from '../public/shared/sim/world.js';
import { spawnBoss } from '../public/shared/sim/bosses.js';
import { BOSSES } from '../public/shared/boss-registry.js';
const modes = process.argv[2] ? [process.argv[2]] : ['ffa', 'tdm', 'nexus', 'labyrinth', 'labyrinth_team', 'sandbox'];
for (const mode of modes) {
  const w = new World({ mode, seed: 7, settings: { theme: process.argv[3] || 'classic', bossInterval: 60 } });
  for (let i = 0; i < 10; i++) w.addPlayer({ name: 'bot' + i, isBot: true });
  const t0 = performance.now();
  let maxTick = 0;
  const N = Number(process.argv[4] || 2700);
  for (let i = 0; i < N; i++) {
    const a = performance.now();
    w.step();
    maxTick = Math.max(maxTick, performance.now() - a);
    if (i === 300) { for (let b = 0; b < 2; b++) { const p = w.floorNear(w.W/2, w.H/2, 0, 400) || {x:w.W/2,y:w.H/2}; spawnBoss(w, (i+b*7) % BOSSES.length, p.x, p.y); } }
  }
  const dt = performance.now() - t0;
  const types = {};
  for (const e of w.ents) if (!e.dead) types[e.type] = (types[e.type] || 0) + 1;
  const lv = [...w.players.values()].map(p => { const t = w.tankOf(p); return t ? t.level + ':' + t.def.name : 'dead'; });
  console.log(mode, 'avg ms', (dt / N).toFixed(2), 'max', maxTick.toFixed(1), JSON.stringify(types), 'bossesDefeated', w.bossesDefeated);
  console.log('  ', lv.join(', '));
}
