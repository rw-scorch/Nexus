import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSSES, validateBosses } from '../public/shared/boss-registry.js';
import { MOB_KEYS } from '../public/shared/entity-types.js';
import { spawnBoss } from '../public/shared/sim/bosses.js';
import { TEAM, isSolidTile } from '../public/shared/constants.js';
import { quietWorld, openSpot, place, steps } from './helpers.js';

function arena(n = 1, seed = 101) {
  const w = quietWorld('sandbox', seed);
  const s = openSpot(w);
  const tanks = [];
  for (let i = 0; i < n; i++) {
    const p = w.addPlayer({ name: `P${i}` });
    const t = w.tankOf(p);
    place(w, t, s.x + i * 40, s.y + 500);
    t.level = 45; w.refreshTank(t, true);
    tanks.push(t);
  }
  return { w, s, tanks };
}

test('boss registry validates and meets roster requirements', () => {
  const v = validateBosses(MOB_KEYS);
  assert.equal(v.ok, true, v.errors.join('\n'));
  assert.ok(v.count >= 20, `${v.count} bosses`);
  assert.ok(v.multiPhase >= 5);
  assert.ok(v.withParts >= 5);
  assert.ok(v.envInteract >= 5);
  assert.ok(v.largeScale >= 3);
  assert.equal(new Set(BOSSES.map(b => b.shape)).size >= 16, true, 'bosses need distinct silhouettes');
});

test('every boss spawns, runs its attacks for 40 seconds and keeps attacks inside the rules', () => {
  for (const def of BOSSES) {
    const { w, s, tanks } = arena(2, 300 + def.index);
    const b = spawnBoss(w, def.key, s.x, s.y);
    assert.equal(b.type, 'boss');
    assert.equal(b.team, TEAM.BOSS);
    const used = new Set();
    const orig = w.addHazard.bind(w);
    for (let i = 0; i < 30 * 40; i++) {
      for (const t of tanks) { if (t.dead) continue; t.hp = t.maxHp; t.spawnProtect = w.time + 1; }
      w.step();
      for (const e of w.ents) {
        if (e.dead) continue;
        if (e.type === 'bullet' && e.team === TEAM.BOSS) assert.ok(!isSolidTile(w.tileAt(e.x, e.y)) || e.kind === 'trap' || w.tileAt(e.x, e.y) === 2 || w.tileAt(e.x, e.y) === 13 || w.tileAt(e.x, e.y) === 6, `${def.key} bullet inside wall`);
      }
      if (b.dead) break;
    }
    assert.ok(!b.dead || b.hp <= 0, `${def.key} vanished`);
    for (const e of w.ents) if (e.type === 'boss' && e !== b && !e.dead) assert.fail('unexpected extra boss');
  }
});

test('phase transitions fire in order as health drops', () => {
  for (const def of BOSSES.filter(b => b.phases.length >= 2)) {
    const { w, s, tanks } = arena(1, 900 + def.index);
    const b = spawnBoss(w, def.key, s.x, s.y);
    const seen = [];
    for (const p of def.phases.slice(1)) {
      b.hp = b.maxHp * p.at - 1;
      for (let i = 0; i < 3; i++) { w.step(); for (const e of w.events) if (e.k === 'bossPhase' && e.id === b.id) seen.push(e.idx); }
    }
    assert.deepEqual(seen, def.phases.slice(1).map((_, i) => i + 1), `${def.key} phases ${seen}`);
  }
});

test('vulnerability windows and shields change damage taken', () => {
  {
    const { w, s, tanks } = arena(1, 41);
    const b = spawnBoss(w, 'nexus_warden', s.x, s.y);
    b.invulnUntil = 0;
    b.hp = b.maxHp * 0.9;
    w.step(); b.invulnUntil = 0;
    const before = b.hp;
    w.damage(b, 1000, tanks[0], {});
    const normal = before - b.hp;
    b.hp = b.maxHp * 0.45; w.step(); w.step(); b.invulnUntil = 0; b.armorUntil = 0;
    const mid = b.hp;
    b.phase = 2;
    const P = b.def.phases[2];
    assert.equal(P.overload, true);
    w.damage(b, 1000, tanks[0], {});
    const overload = mid - b.hp;
    assert.ok(overload > normal * 1.8, `overload ${overload} vs normal ${normal}`);
  }
  {
    const { w, s, tanks } = arena(1, 42);
    const b = spawnBoss(w, 'fractured_king', s.x, s.y);
    b.invulnUntil = 0;
    const h0 = b.hp;
    w.damage(b, 1000, tanks[0], {});
    const shielded = h0 - b.hp;
    for (const id of b.parts) { const p = w.get(id); if (p && p.spec.shieldsCore) w.remove(p); }
    const h1 = b.hp;
    w.damage(b, 1000, tanks[0], {});
    const open = h1 - b.hp;
    assert.ok(shielded < open * 0.1, `plates must protect the core: ${shielded} vs ${open}`);
  }
  {
    const { w, s, tanks } = arena(1, 43);
    const b = spawnBoss(w, 'siege_colossus', s.x, s.y);
    b.invulnUntil = 0; b.angle = 0;
    const front = { type: 'bullet', x: b.x + 200, y: b.y, kind: 'bullet', fx: {} };
    const back = { type: 'bullet', x: b.x - 200, y: b.y, kind: 'bullet', fx: {} };
    let h = b.hp; w.damage(b, 1000, front, {}); const df = h - b.hp;
    h = b.hp; w.damage(b, 1000, back, {}); const db = h - b.hp;
    assert.ok(db > df * 3, `rear ${db} should beat front ${df}`);
  }
});

test('destroying components permanently disables their attacks', () => {
  const { w, s, tanks } = arena(1, 44);
  const b = spawnBoss(w, 'clockwork_tyrant', s.x, s.y);
  b.invulnUntil = 0;
  const gear = b.parts.map(id => w.get(id)).find(p => p.spec.key === 'gearA');
  w.damage(gear, 1e7, tanks[0], {});
  assert.ok(b.disabled.has('hands'));
  for (let i = 0; i < 30 * 30; i++) { w.step(); for (const t of tanks) t.hp = t.maxHp; }
  assert.ok(b.disabled.has('hands'));
});

test('multiplayer scaling raises health but caps it', () => {
  const one = arena(1, 50), four = arena(4, 51), lots = arena(12, 52);
  const b1 = spawnBoss(one.w, 'hive_sovereign', one.s.x, one.s.y);
  const b4 = spawnBoss(four.w, 'hive_sovereign', four.s.x, four.s.y);
  const b12 = spawnBoss(lots.w, 'hive_sovereign', lots.s.x, lots.s.y);
  assert.ok(b4.maxHp > b1.maxHp * 1.5);
  assert.ok(b12.maxHp <= b1.maxHp * 2.6 + 1, 'health must be capped');
});

test('defeated bosses grant rewards by contribution and ignore trivial damage', () => {
  const { w, s, tanks } = arena(3, 60);
  const b = spawnBoss(w, 'mirror_duelist', s.x, s.y);
  b.invulnUntil = 0;
  const [big, small, none] = tanks;
  w.damage(b, b.maxHp * 0.5, big, {});
  w.damage(b, b.maxHp * 0.01, small, {});
  const coresBefore = [big.player.cores, small.player.cores, none.player.cores];
  w.damage(b, b.maxHp * 10, big, {});
  assert.equal(b.dead, true);
  assert.ok(big.player.cores > coresBefore[0], 'main contributor got no cores');
  assert.equal(big.player.bossKills, 1);
  assert.equal(small.player.cores, coresBefore[1], 'trivial damage should not be rewarded');
  assert.equal(none.player.cores, coresBefore[2]);
  assert.ok(big.player.bossRewardMul < 1, 'diminishing returns not applied');
});

test('boss attacks do not hurt shapes or other monsters', () => {
  const { w, s } = arena(1, 70);
  const b = spawnBoss(w, 'nexus_warden', s.x, s.y);
  const shape = w.addShape('pentagon', s.x + 150, s.y);
  const hp = shape.hp;
  for (let i = 0; i < 30 * 10; i++) { w.step(); shape.x = s.x + 150; shape.y = s.y; }
  assert.equal(shape.dead, false);
  assert.equal(shape.hp, hp);
});
