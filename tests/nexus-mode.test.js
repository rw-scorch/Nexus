import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/shared/sim/world.js';
import { Room } from '../public/shared/room.js';
import { PROTOCOL_VERSION } from '../public/shared/constants.js';

function nexusWorld() {
  const w = new World({ mode: 'nexus', seed: 21, settings: {} });
  w.logic.state.nextEventAt = 1e12; w.logic.state.nextBossAt = 1e12;
  return w;
}
const structs = (w, team, kind) => w.ents.filter(e => !e.dead && e.type === 'struct' && e.origTeam === team && e.kind === kind);

test('each team has a Nexus, shield generators and turrets', () => {
  const w = nexusWorld();
  for (const team of [0, 1]) {
    assert.equal(structs(w, team, 'nexus').length, 1);
    assert.equal(structs(w, team, 'generator').length, 2);
    assert.equal(structs(w, team, 'turret').length, 3);
  }
});

test('the shield absorbs damage and regenerates only while generators stand', () => {
  const w = nexusWorld();
  const n = structs(w, 1, 'nexus')[0];
  w.step();
  const hp = n.hp;
  w.damage(n, 2000, null, {});
  assert.equal(n.hp, hp, 'core damaged through the shield');
  assert.ok(n.shield < n.maxShield);
  const low = n.shield;
  for (let i = 0; i < 120; i++) w.step();
  assert.ok(n.shield > low, 'shield did not regenerate');
  for (const g of structs(w, 1, 'generator')) w.damage(g, 1e7, null, {});
  w.step();
  const after = n.shield;
  for (let i = 0; i < 120; i++) w.step();
  assert.ok(n.shield <= after + 1e-6, 'shield regenerated without generators');
});

test('disruptor rounds drain shields faster, siege damage hurts the core more', () => {
  const w = nexusWorld();
  const n = structs(w, 1, 'nexus')[0];
  w.step();
  const s0 = n.shield;
  w.damage(n, 100, null, {});
  const plain = s0 - n.shield;
  const s1 = n.shield;
  w.damage(n, 100, null, { disrupt: true });
  assert.ok(s1 - n.shield >= plain * 3.9);
});

test('team upgrades cost credits and respect limits', () => {
  const w = nexusWorld();
  const p = w.addPlayer({ name: 'A', team: 0 });
  const tm = w.logic.state.teams[0];
  tm.credits = 0;
  assert.equal(w.logic.teamUpgrade(p, 'shieldCap'), false, 'upgrade bought without credits');
  tm.credits = 10000;
  assert.ok(w.logic.teamUpgrade(p, 'shieldCap'));
  assert.ok(w.logic.teamUpgrade(p, 'shieldCap'));
  assert.ok(w.logic.teamUpgrade(p, 'shieldCap'));
  assert.equal(w.logic.teamUpgrade(p, 'shieldCap'), false, 'exceeded upgrade limit');
  assert.ok(tm.credits < 10000);
  assert.ok(w.logic.teamUpgrade(p, 'emergency'));
  assert.equal(w.logic.teamUpgrade(p, 'emergency'), false, 'emergency shield ignored its cooldown');
});

test('destroying the enemy Nexus ends the match, then a new match starts', () => {
  const room = new Room({ code: 'nexmatch', seed: 5 });
  const c = room.attach({ send() {}, close() {} });
  room.message(c, JSON.stringify({ t: 'j', protocol: PROTOCOL_VERSION, name: 'Hero', mode: 'nexus', settings: { bots: 0 } }));
  const w = room.world;
  const hero = [...w.players.values()][0];
  const n = structs(w, 1 - hero.team, 'nexus')[0];
  for (const g of structs(w, 1 - hero.team, 'generator')) w.damage(g, 1e7, w.tankOf(hero), {});
  n.shield = 0;
  w.damage(n, 1e9, w.tankOf(hero), {});
  assert.ok(w.matchOver, 'match did not end');
  assert.equal(w.matchOver.winner, hero.team);
  for (let i = 0; i < 30 * 16; i++) room.tick();
  assert.notEqual(room.world, w, 'new match did not start');
  assert.equal(room.world.matchOver, null);
  assert.ok([...room.world.players.values()].some(p => p.name === 'Hero'), 'player not carried into the new match');
  room.stop();
});

test('bots fill teams without pretending to be human', () => {
  const room = new Room({ code: 'pub-nexus-9', seed: 8 });
  const c = room.attach({ send() {}, close() {} });
  room.message(c, JSON.stringify({ t: 'j', protocol: PROTOCOL_VERSION, name: 'Solo', settings: { bots: 6 } }));
  for (let i = 0; i < 30 * 8; i++) room.tick();
  const ps = [...room.world.players.values()];
  const bots = ps.filter(p => p.isBot);
  assert.ok(bots.length >= 4, `only ${bots.length} bots`);
  assert.ok(bots.every(b => b.name.startsWith('[BOT]')));
  const t0 = ps.filter(p => p.team === 0).length, t1 = ps.filter(p => p.team === 1).length;
  assert.ok(Math.abs(t0 - t1) <= 1, `unbalanced teams ${t0}/${t1}`);
  room.stop();
});
