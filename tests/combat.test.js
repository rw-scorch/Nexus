import test from 'node:test';
import assert from 'node:assert/strict';
import { quietWorld, openSpot, place, steps, tankByName } from './helpers.js';
import { Room } from '../public/shared/room.js';
import { PROTOCOL_VERSION, TILE, isSolidTile } from '../public/shared/constants.js';
import { BASE } from '../public/shared/weapon-registry.js';

function duel(defName = 'Basic') {
  const w = quietWorld('sandbox', 77);
  const a = w.addPlayer({ name: 'A' }), b = w.addPlayer({ name: 'B' });
  const ta = w.tankOf(a), tb = w.tankOf(b);
  const def = tankByName(defName);
  w.setTankDef(ta, def);
  const s = openSpot(w);
  place(w, ta, s.x, s.y);
  place(w, tb, s.x + 300, s.y);
  return { w, a, b, ta, tb };
}

test('projectiles deal their configured damage on the server', () => {
  const { w, a, ta, tb } = duel();
  const hp0 = tb.hp;
  a.input = { mx: 0, my: 0, ax: 300, ay: 0, fire: true, alt: false, ability: false, seq: 1 };
  let hits = 0;
  steps(w, 60, () => { tb.x = ta.x + 300; tb.y = ta.y; tb.vx = 0; tb.vy = 0; tb.regen = 0; tb.lastHurt = w.time; });
  const lost = hp0 - tb.hp;
  const perShot = BASE.damage * ta.def.guns[0].dm * ta.bDmg;
  assert.ok(lost > 0, 'target took no damage');
  const shots = Math.round(lost / perShot);
  assert.ok(Math.abs(lost - shots * perShot) < 0.01 * perShot + 1e-6 || lost >= perShot, `damage ${lost} not a multiple of ${perShot}`);
  assert.ok(shots >= 2 && shots <= 5, `unexpected hit count ${shots}`);
});

test('reload cooldown limits fire rate', () => {
  const { w, a, ta } = duel();
  a.input = { mx: 0, my: 0, ax: 300, ay: 0, fire: true, alt: false, ability: false, seq: 1 };
  let fired = 0;
  const seconds = 3;
  steps(w, 30 * seconds, () => {});
  fired = a.stats.shots;
  const expected = seconds / (BASE.reload * ta.def.guns[0].r * ta.bReload);
  assert.ok(Math.abs(fired - expected) <= 2, `fired ${fired}, expected about ${expected.toFixed(1)}`);
});

test('tanks collide with walls and cannot pass through them', () => {
  const w = quietWorld('labyrinth', 5);
  const p = w.addPlayer({ name: 'A' });
  const t = w.tankOf(p);
  p.input = { mx: 1, my: 0, ax: 1, ay: 0, fire: false, alt: false, ability: false, seq: 1 };
  for (let i = 0; i < 300; i++) {
    w.step();
    const tx0 = Math.floor((t.x - t.r + 1) / TILE), tx1 = Math.floor((t.x + t.r - 1) / TILE);
    const ty0 = Math.floor((t.y - t.r + 1) / TILE), ty1 = Math.floor((t.y + t.r - 1) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const cx = Math.max(tx * TILE, Math.min(t.x, tx * TILE + TILE)), cy = Math.max(ty * TILE, Math.min(t.y, ty * TILE + TILE));
      if (isSolidTile(w.tiles[ty * w.w + tx])) assert.ok(Math.hypot(t.x - cx, t.y - cy) >= t.r - 2, `tank overlapped wall at tick ${i}`);
    }
  }
});

test('bullets stop at walls', () => {
  const w = quietWorld('labyrinth', 9);
  const p = w.addPlayer({ name: 'A' });
  const t = w.tankOf(p);
  p.input = { mx: 0, my: 0, ax: 1, ay: 0, fire: true, alt: false, ability: false, seq: 1 };
  steps(w, 90);
  for (const b of w.ents) if (b.type === 'bullet' && !b.dead) assert.ok(!isSolidTile(w.tileAt(b.x, b.y)) || w.tileAt(b.x, b.y) === 2, 'bullet inside wall');
});

test('death and respawn', () => {
  const { w, b, tb, ta } = duel();
  w.damage(tb, 1e6, ta, {});
  assert.equal(tb.dead, true);
  assert.equal(b.tankId, 0);
  assert.equal(b.deaths, 1);
  assert.equal(ta.player.kills, 1);
  steps(w, 30 * 4);
  b.autoRespawn = true;
  steps(w, 5);
  assert.ok(w.tankOf(b), 'player did not respawn');
  assert.ok(w.tankOf(b).level >= 1);
});

test('owners never damage themselves and friendly fire is off by default', () => {
  const w = quietWorld('tdm', 3);
  const a = w.addPlayer({ name: 'A', team: 0 }), b = w.addPlayer({ name: 'B', team: 0 });
  const ta = w.tankOf(a), tb = w.tankOf(b);
  const s = openSpot(w);
  place(w, ta, s.x, s.y); place(w, tb, s.x + 200, s.y);
  w.setTankDef(ta, tankByName('Howitzer'));
  a.input = { mx: 0, my: 0, ax: 200, ay: 0, fire: true, alt: false, ability: false, seq: 1 };
  const hpA = ta.hp, hpB = tb.hp;
  steps(w, 60, () => { tb.x = ta.x + 200; tb.y = ta.y; });
  assert.ok(tb.hp >= hpB - 1e-6, 'ally took damage');
  assert.ok(ta.hp >= hpA - 1e-6, 'owner took damage from own explosion');
});

test('clients cannot report damage or kills; forged messages are ignored', () => {
  const room = new Room({ code: 'authtest', seed: 42 });
  const sent = [];
  const c = room.attach({ send: s => sent.push(JSON.parse(s)), close() {} });
  room.message(c, JSON.stringify({ t: 'j', protocol: PROTOCOL_VERSION, name: 'Cheater', mode: 'sandbox', settings: { bots: 0 } }));
  const c2 = room.attach({ send() {}, close() {} });
  room.message(c2, JSON.stringify({ t: 'j', protocol: PROTOCOL_VERSION, name: 'Victim' }));
  const w = room.world;
  const victim = [...w.players.values()].find(p => p.name === 'Victim');
  const vt = w.tankOf(victim);
  const hp = vt.hp;
  for (const forged of [
    { t: 'dmg', target: vt.id, amount: 9999 },
    { t: 'kill', target: vt.id },
    { t: 'bossKill', boss: 1 },
    { t: 'i', mx: 1e9, my: -1e9, ax: 1e12, ay: NaN, f: 1, s: 1 },
    { t: 'u', s: 99 },
    { t: 'e', idx: 1000 },
    { t: 'tu', k: 'shieldCap' }
  ]) room.message(c, JSON.stringify(forged));
  room.message(c, '{not json');
  room.message(c, 'x'.repeat(5000));
  for (let i = 0; i < 10; i++) room.tick();
  assert.equal(vt.hp, hp, 'forged damage applied');
  const cheater = w.tankOf([...w.players.values()].find(p => p.name === 'Cheater'));
  assert.equal(cheater.defIdx, 0, 'illegal evolution accepted');
  assert.ok(Math.abs(cheater.vx) < 2000 && Math.abs(cheater.vy) < 2000, 'unclamped input');
  assert.ok(cheater.stats.every(s => s === 0), 'illegal stat upgrade accepted');
  room.stop();
});

test('protocol mismatch is rejected with a clear error', () => {
  const room = new Room({ code: 'proto' });
  const sent = [];
  let closed = false;
  const c = room.attach({ send: s => sent.push(JSON.parse(s)), close() { closed = true; } });
  room.message(c, JSON.stringify({ t: 'j', protocol: PROTOCOL_VERSION + 99, name: 'Old' }));
  assert.equal(sent[0].t, 'err');
  assert.equal(sent[0].code, 'protocol');
  assert.equal(closed, true);
});
