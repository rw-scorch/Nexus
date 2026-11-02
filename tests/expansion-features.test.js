import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/shared/sim/world.js';
import { MODES } from '../public/shared/constants.js';
import { EXPANSION_TANKS } from '../public/shared/expansion-tanks.js';
import { TANKS_BY_ID } from '../public/shared/tank-registry.js';

test('expansion adds exactly 100 selectable tanks, including deeper Smasher paths', () => {
  assert.equal(EXPANSION_TANKS.length, 100);
  assert.equal(new Set(EXPANSION_TANKS.map(t => t.id)).size, 100);
  assert.ok(EXPANSION_TANKS.filter(t => t.smasher).length >= 25);
  assert.ok(EXPANSION_TANKS.some(t => t.level === 45 && t.parents.includes('smasher')));
  assert.ok(EXPANSION_TANKS.every(t => TANKS_BY_ID.has(t.parents[0])));
});

test('new modes are registered and use the shared arena simulation', () => {
  assert.equal(MODES.relic_rush.teams, false);
  assert.equal(MODES.gauntlet.teams, true);
  for (const mode of ['relic_rush', 'gauntlet']) {
    const w = new World({ mode, seed: 33, settings: { bots: 0 } });
    assert.equal(w.mode, mode);
    assert.ok(w.map.kind === 'arena');
  }
});

test('timed bosses use a fixed 20-minute cadence', () => {
  const w = new World({ mode: 'ffa', seed: 7, settings: { bots: 0 } });
  assert.equal(w.logic.state.nextBossAt, 1200);
  w.addPlayer({ name: 'timer' });
  w.time = 1200;
  w.logic.timedBoss();
  assert.equal(w.logic.state.nextBossAt, 2400);
  assert.ok(w.ents.some(e => e.type === 'boss' && !e.dead));
});

test('relic forge spends cores and applies Smasher-relevant impact upgrades', () => {
  const w = new World({ mode: 'ffa', seed: 11, settings: { bots: 0 } });
  const p = w.addPlayer({ name: 'forge' });
  const t = w.tankOf(p);
  p.cores = 4;
  const before = t.bodyDmg;
  assert.equal(w.forgeRelic(p, 'impact'), true);
  assert.equal(p.cores, 0);
  assert.ok(t.bodyDmg > before);
  assert.equal(w.forgeRelic(p, 'impact'), false);
});
