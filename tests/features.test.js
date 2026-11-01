import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountStore, memoryKV, featuredMode } from '../server/accounts.js';
import { World } from '../public/shared/sim/world.js';
import { Room } from '../public/shared/room.js';
import { TANKS_BY_ID, tankByIndex, CUSTOM_BASE } from '../public/shared/tank-registry.js';
import { BOSSES } from '../public/shared/boss-registry.js';
import { spawnBoss } from '../public/shared/sim/bosses.js';
import { PROTOCOL_VERSION, MODES } from '../public/shared/constants.js';
import { quietWorld, openSpot, place, steps } from './helpers.js';

test('accounts: sign up, log in, admin code, shop, awards', async () => {
  const s = new AccountStore(memoryKV());
  const { token, user } = await s.signup('Tester', 'hunter22');
  assert.equal(user.coins, 200);
  await assert.rejects(s.signup('tester', 'whatever1'), /taken/);
  await assert.rejects(s.login('Tester', 'nope123'), /Wrong/);
  const again = await s.login('TESTER', 'hunter22');
  assert.ok(again.token);
  const u = await s.session(token);
  assert.equal(u.name, 'Tester');
  await assert.rejects(s.redeem(u, 'rwscorch'), /does not exist/);
  const r = await s.redeem(u, 'rwscorch0987654321rwscorch123');
  assert.equal(r.user.admin, true);
  await s.award('Tester', { xp: 400, coins: 900, kills: 3, unlock: 'scorch' });
  const u2 = await s.session(token);
  assert.equal(u2.coins, 200 + 800, 'coin award is capped per call');
  assert.ok(u2.unlocks.includes('scorch'));
  const bought = await s.buy(u2, 'skin:gold');
  assert.ok(bought.owned.includes('skin:gold'));
  assert.equal(bought.equip.skin, 'gold');
  await assert.rejects(s.buy(await s.session(token), 'skin:gold'), /already/);
  await s.createCode({ code: 'free50', coins: 50, max: 1 });
  const red = await s.redeem(await s.session(token), 'FREE50');
  assert.match(red.message, /50 coins/);
  await assert.rejects(s.redeem(await s.session(token), 'free50'), /already/);
});

test('game directory: only Battle, the featured mode and admin games can be joined', async () => {
  const s = new AccountStore(memoryKV());
  const feat = featuredMode();
  assert.ok(MODES[feat] && feat !== 'battle');
  assert.deepEqual((await s.gameFor('pub-battle-1')).mode, 'battle');
  assert.equal((await s.gameFor(`pub-${feat}-2`)).mode, feat);
  const other = Object.keys(MODES).find(k => k !== 'battle' && k !== feat && k !== featuredMode(Date.now(), -1));
  assert.equal(await s.gameFor(`pub-${other}-1`), null);
  assert.equal(await s.gameFor('random-room'), null);
  const { user } = await s.signup('Admin1', 'admin123');
  const u = await s.user('Admin1');
  u.admin = true;
  const map = await s.saveMap(u, { name: 'Arena', w: 30, h: 30, tiles: '0'.repeat(900), spawns: [{ x: 4, y: 4 }] });
  const g = await s.createGame(u, { name: 'Event', mode: 'bosshunt', mapId: map.id, code: 'event1' });
  const got = await s.gameFor('event1');
  assert.equal(got.mode, 'bosshunt');
  assert.equal(got.settings.customMap.w, 30);
  assert.ok((await s.games()).games.some(x => x.code === g.code));
});

test('rooms enforce the server-chosen mode and custom maps load', () => {
  const room = new Room({ code: 'event1', game: { mode: 'battle', settings: { bots: 0, customMap: { w: 30, h: 30, tiles: '0'.repeat(900), spawns: [{ x: 5, y: 5 }] } } } });
  const sent = [];
  const c = room.attach({ send: s => sent.push(JSON.parse(s)), close: () => {} });
  room.message(c, JSON.stringify({ t: 'j', protocol: PROTOCOL_VERSION, name: 'x', mode: 'sandbox' }));
  assert.equal(room.world.mode, 'battle');
  assert.equal(room.world.w, 30);
  assert.ok(room.world.map.custom);
});

test('every boss has a quarter of its listed health', () => {
  const w = quietWorld('sandbox');
  const b = spawnBoss(w, 0, w.W / 2, w.H / 2, { players: 1 });
  assert.equal(b.maxHp, BOSSES[0].hp * 0.25);
});

test('boss hunt: a player becomes a boss and their killer becomes the next boss', () => {
  const w = quietWorld('bosshunt', 9, { bots: 0 });
  const a = w.addPlayer({ name: 'A' }), b = w.addPlayer({ name: 'B' }), c = w.addPlayer({ name: 'C' });
  w.time = 10;
  w.logic.huntTick();
  const bossPid = w.logic.state.bossPid;
  assert.ok(bossPid);
  const boss = w.tankOf(w.players.get(bossPid));
  assert.ok(boss.def.bossKey);
  assert.ok(boss.maxHp > 1000);
  const killerP = [a, b, c].find(p => p.pid !== bossPid);
  const killer = w.tankOf(killerP);
  w.kill(boss, killer);
  for (let i = 0; i < 40; i++) w.step();
  assert.equal(w.logic.state.bossPid, killerP.pid);
  assert.ok(w.tankOf(killerP).def.bossKey);
});

test('secret tank: a level 45 Basic kill unlocks it and offers it as an upgrade', () => {
  const w = quietWorld('sandbox');
  const a = w.addPlayer({ name: 'A' }), b = w.addPlayer({ name: 'B' });
  const ta = w.tankOf(a), tb = w.tankOf(b);
  ta.level = 45; w.refreshTank(ta, true);
  assert.ok(!w.evoOptions(ta).includes(TANKS_BY_ID.get('scorch').index));
  w.kill(tb, ta);
  assert.ok(a.unlocks.has('scorch'));
  assert.ok(w.evoOptions(ta).includes(TANKS_BY_ID.get('scorch').index));
  assert.ok(w.evolve(ta, TANKS_BY_ID.get('scorch').index));
  assert.equal(ta.def.id, 'scorch');
  assert.ok(!TANKS_BY_ID.get('basic').next.includes('scorch'), 'secret stays out of the public tree');
});

test('tank builder: custom designs are validated, capped and playable in Workshop', () => {
  const room = new Room({ code: 'ws-test', game: { mode: 'workshop', settings: { bots: 0 } } });
  const sent = [];
  const c = room.attach({ send: s => sent.push(JSON.parse(s)), close: () => {} });
  room.message(c, JSON.stringify({ t: 'j', protocol: PROTOCOL_VERSION, name: 'builder' }));
  const design = { name: 'Monster', body: 'hex', parts: [{ k: 'bullet', L: 999, W: 8, dm: 99, r: 0.01, n: 8, m: true }, { k: 'drone', n: 8 }] };
  room.message(c, JSON.stringify({ t: 'ct', d: design }));
  const p = room.world.players.get(c.pid);
  const t = room.world.tankOf(p);
  assert.ok(t.defIdx >= CUSTOM_BASE);
  const def = tankByIndex(t.defIdx);
  assert.equal(def.name, 'Monster');
  assert.ok(def.guns.length <= 24);
  assert.ok(def.guns.every(g => g.len <= 4.01 && g.dm <= 4));
  assert.ok(def.profile.dps <= 91, `dps ${def.profile.dps}`);
  assert.equal(t.level, 60);
  room.tick(); room.tick();
  assert.ok(sent.some(m => m.t === 's' && m.cd && m.cd.length === 1), 'custom design is broadcast to clients');
  p.input = { mx: 0, my: 0, ax: 1, ay: 0, fire: true, alt: false, ability: false, seq: 1 };
  const before = room.world.nextId;
  for (let i = 0; i < 30; i++) room.tick();
  assert.ok(room.world.nextId > before, 'custom tank fires');
});
