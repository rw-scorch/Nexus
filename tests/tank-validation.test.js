import test from 'node:test';
import assert from 'node:assert/strict';
import { TANKS, TANKS_BY_ID, TANK_FAMILIES, validateRegistry, ABILITIES } from '../public/shared/tank-registry.js';
import { PROJECTILE_KINDS } from '../public/shared/projectile-types.js';
import { MAX_LEVEL } from '../public/shared/constants.js';
import { quietWorld, openSpot, place, steps } from './helpers.js';

const T = id => TANKS_BY_ID.get(id);
const firing = d => d.guns.filter(g => !g.deco && !g.auto);

test('registry validates with no errors and every tank is reachable from Basic', () => {
  const v = validateRegistry();
  assert.equal(v.ok, true, v.errors.slice(0, 10).join('\n'));
  assert.equal(v.reachableInNormalPlay, TANKS.length);
  assert.ok(v.arras >= 120, `arras tanks ${v.arras}`);
  assert.ok(v.armsRace >= 80, `arms race tanks ${v.armsRace}`);
  assert.ok(v.nexus >= 20, `nexus tanks ${v.nexus}`);
});

test('the first tiers match the arras.io class tree', () => {
  const kids = id => T(id).next;
  for (const id of ['twin', 'sniper', 'machineGun', 'flankGuard', 'director', 'pounder', 'trapper', 'desmos', 'smasher']) assert.ok(kids('basic').includes(id), `basic -> ${id}`);
  for (const id of ['doubleTwin', 'tripleShot', 'gunner', 'hexaTank', 'helix']) assert.ok(kids('twin').includes(id), `twin -> ${id}`);
  for (const id of ['assassin', 'hunter', 'minigun', 'rifle']) assert.ok(kids('sniper').includes(id), `sniper -> ${id}`);
  for (const id of ['overseer', 'cruiser', 'underseer', 'spawner']) assert.ok(kids('director').includes(id), `director -> ${id}`);
  for (const id of ['destroyer', 'builder', 'artillery', 'launcher']) assert.ok(kids('pounder').includes(id), `pounder -> ${id}`);
  for (const id of ['hexaTank', 'triAngle', 'auto3', 'trapGuard', 'triTrapper']) assert.ok(kids('flankGuard').includes(id), `flankGuard -> ${id}`);
  for (const id of ['megaSmasher', 'spike', 'autoSmasher', 'landmine']) assert.ok(kids('smasher').includes(id), `smasher -> ${id}`);
  assert.equal(T('twin').level, 15);
  assert.equal(T('tripleShot').level, 30);
  assert.equal(T('pentaShot').level, 45);
  assert.equal(T('smasher').level, 30);
});

test('barrel layouts are the real ones', () => {
  assert.equal(firing(T('basic')).length, 1);
  assert.equal(firing(T('twin')).length, 2);
  assert.deepEqual(firing(T('twin')).map(g => Math.sign(g.y)).sort(), [-1, 1]);
  assert.equal(firing(T('tripleShot')).length, 3);
  assert.equal(firing(T('octoTank')).length, 8);
  assert.equal(firing(T('flankGuard')).length, 3);
  assert.equal(T('auto3').turrets.length, 3);
  assert.equal(T('overseer').guns.filter(g => g.k === 'drone').length, 2);
  assert.ok(T('trapper').guns.some(g => g.k === 'trap'));
  assert.ok(T('trapper').guns.some(g => g.deco));
  assert.equal(T('necromancer').body, 'square');
  assert.ok(T('smasher').smasher && firing(T('smasher')).length === 0);
  assert.ok(T('stalker').stealth && T('landmine').stealth);
  assert.ok(T('triAngle').guns.filter(g => Math.abs(g.a) > 140).length >= 2, 'tri-angle has thrusters');
  assert.ok(firing(T('machineGun'))[0].asp > 1, 'machine gun barrel flares out');
});

test('tanks are unique: at most a couple of arras tanks share a layout, originals never copy one', () => {
  const sig = t => JSON.stringify([t.guns.map(g => [g.a, g.x, g.y, g.len, g.w, g.asp, g.k, g.auto, g.deco]), t.turrets, t.body, t.smasher, t.decos]);
  const seen = new Map();
  let dup = 0;
  for (const t of TANKS) {
    const s = sig(t);
    if (seen.has(s)) { dup++; assert.notEqual(t.src, 'nexus', `${t.id} copies ${seen.get(s)}`); }
    else seen.set(s, t.id);
  }
  assert.ok(dup <= 3, `${dup} duplicate layouts`);
  assert.equal(new Set(TANKS.map(t => t.id)).size, TANKS.length);
});

test('levels: each upgrade raises the level, Arms Race sits at 60, cap is 60', () => {
  assert.equal(MAX_LEVEL, 60);
  for (const t of TANKS) {
    assert.ok([1, 15, 30, 45, 60].includes(t.level), `${t.id} level ${t.level}`);
    for (const n of t.next) assert.ok(T(n).level > t.level, `${t.id} -> ${n}`);
  }
  for (const t of TANKS.filter(t => t.src === 'ar')) assert.ok(t.level >= 30, `${t.id} at ${t.level}`);
  assert.ok(TANKS.filter(t => t.src === 'ar' && t.level === 60).length >= 50);
});

test('every gun uses a registered projectile kind, stats are sane, abilities exist', () => {
  for (const t of TANKS) {
    for (const g of t.guns) assert.ok(PROJECTILE_KINDS[g.k], `${t.id} uses ${g.k}`);
    assert.ok(ABILITIES[t.ability], `${t.id} ability ${t.ability}`);
    for (const [k, v] of Object.entries(t.stats)) assert.ok(Number.isFinite(v) && v > 0 && v < 6, `${t.id}.${k}=${v}`);
  }
  assert.ok(TANK_FAMILIES.length >= 8);
});

test('every tank can be selected and fires in the simulation', () => {
  const w = quietWorld('sandbox');
  const p = w.addPlayer({ name: 'tester' });
  const foe = w.addPlayer({ name: 'dummy' });
  const t = w.tankOf(p);
  const spot = openSpot(w);
  const silent = [];
  for (const def of TANKS) {
    if (!def.guns.some(g => !g.deco)) continue;
    assert.ok(w.logic.sandboxCommand(p, { t: 'p', idx: def.index }), `select ${def.id}`);
    assert.equal(t.defIdx, def.index);
    place(w, t, spot.x, spot.y);
    t.level = 30; w.refreshTank(t, true);
    p.input = { mx: 0, my: 0, ax: 300, ay: 0, fire: true, alt: false, ability: false, seq: 0 };
    const before = w.nextId;
    let fx = 0;
    steps(w, 60, () => {
      const ft = w.tankOf(foe);
      if (ft) { place(w, ft, spot.x + 330, spot.y); ft.hp = ft.maxHp; }
      else w.spawnTank(foe);
    });
    for (const f of w.fx) if (f[0] === 'beam' || f[0] === 'muzzle') fx++;
    if (!(w.nextId > before || fx > 0)) silent.push(def.id);
    for (const e of w.ents) if (e.type === 'bullet') w.remove(e);
    t.droneCount = t.droneCount.map(() => 0);
    w.compact();
  }
  assert.deepEqual(silent, [], `tanks that never fired: ${silent.slice(0, 10).join(', ')}`);
});

test('battle mode: spawn at max level with the chosen tank, no leveling or bosses', () => {
  const w = quietWorld('battle', 77, { bots: 0 });
  const pick = T('overlord');
  const p = w.addPlayer({ name: 'b' });
  assert.ok(w.logic.pickTank(p, { idx: pick.index }));
  const t = w.tankOf(p);
  assert.equal(t.level, MAX_LEVEL);
  assert.equal(t.def.id, 'overlord');
  assert.equal(t.statPts, 42);
  assert.ok(w.logic.state.nextBossAt > 1e11);
  w.time += 30;
  assert.ok(w.logic.pickTank(p, { idx: T('ranger').index }));
  assert.equal(t.def.id, 'overlord', 'mid-fight swap is queued for respawn');
  w.kill(t, null);
  w.time += 5;
  w.spawnTank(p);
  assert.equal(w.tankOf(p).def.id, 'ranger');
});
