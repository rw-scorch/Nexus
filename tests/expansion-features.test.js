import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/shared/sim/world.js';
import { MODES } from '../public/shared/constants.js';
import { EXPANSION_TANKS } from '../public/shared/expansion-tanks.js';
import { TANKS_BY_ID } from '../public/shared/tank-registry.js';
import { cleanDesign, compileScript, buildCustomRaw } from '../public/shared/custom-tanks.js';

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

test('programmable builder compiles homing and tactical projectile commands', () => {
  const design = cleanDesign({ name: 'Seeker', script: 'home; missile; pierce; nonsense', parts: [{ k: 'bullet' }] });
  const fx = compileScript(design.script);
  assert.equal(fx.home, 1);
  assert.equal(fx.missile, 1);
  assert.equal(fx.pierce, 1);
  assert.equal(fx.nonsense, undefined);
  const raw = buildCustomRaw(design);
  assert.equal(raw.guns[0].fx.home, 1);
  assert.equal(raw.guns[0].fx.missile, 1);
});

test('safe invasion creates vaults, guard posts and controllable guard tanks', () => {
  const w = new World({ mode: 'safe_invasion', seed: 91, settings: { bots: 0 } });
  const p = w.addPlayer({ name: 'architect' });
  assert.equal(w.logic.state.safes.length, 2);
  assert.equal(w.ents.filter(e => e.type === 'struct' && e.kind === 'vault').length, 2);
  assert.equal(w.ents.filter(e => e.type === 'mob' && e.kind === 'guardTank').length, 6);
  assert.equal(w.logic.squadronOrder(p, 'charge'), true);
  assert.equal(w.logic.state.orders.get(p.team), 'charge');
  assert.equal(w.logic.squadronOrder(p, 'invalid'), false);
});

test('the ten new modes and four new themes are constructible', () => {
  for (const mode of ['infection', 'bounty', 'convoy', 'relay', 'arena_rumble', 'titanfall', 'blackout', 'salvage', 'safe_invasion', 'squadron']) {
    const w = new World({ mode, seed: 101, settings: { bots: 0, theme: 'neon' } });
    assert.equal(w.mode, mode);
    assert.equal(w.map.kind, 'arena');
  }
});
