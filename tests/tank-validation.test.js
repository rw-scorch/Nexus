import test from 'node:test';
import assert from 'node:assert/strict';
import { TANKS, TANKS_BY_ID, TANK_FAMILIES, validateRegistry, ABILITIES } from '../public/shared/tank-registry.js';
import { PROJECTILE_KINDS } from '../public/shared/projectile-types.js';
import { quietWorld, openSpot, place, steps } from './helpers.js';

test('registry validates with no errors', () => {
  const v = validateRegistry();
  assert.equal(v.ok, true, v.errors.slice(0, 10).join('\n'));
});

test('at least 1,000 distinct tanks with unique ids', () => {
  assert.ok(TANKS.length >= 1000, `only ${TANKS.length}`);
  assert.equal(new Set(TANKS.map(t => t.id)).size, TANKS.length);
  const sigs = new Set(TANKS.map(t => JSON.stringify([t.guns, t.alt, t.stats, t.bodyFx, t.ability, t.spin])));
  assert.equal(sigs.size, TANKS.length, 'some tanks are mechanically identical');
});

test('at least 30 families', () => {
  assert.ok(TANK_FAMILIES.length >= 30);
});

test('every gun uses a registered projectile kind and every ability exists', () => {
  for (const t of TANKS) {
    for (const g of [...t.guns, ...(t.alt || [])]) assert.ok(PROJECTILE_KINDS[g.k], `${t.id} uses ${g.k}`);
    assert.ok(ABILITIES[t.ability], `${t.id} ability ${t.ability}`);
  }
});

test('stats are finite and in range', () => {
  for (const t of TANKS) for (const [k, v] of Object.entries(t.stats)) assert.ok(Number.isFinite(v) && v > 0 && v < 5, `${t.id}.${k}=${v}`);
});

test('evolution paths reference real tanks of a higher tier and every tank is reachable', () => {
  const v = validateRegistry();
  assert.equal(v.reachableInNormalPlay, TANKS.length);
  for (const t of TANKS) for (const n of t.next) {
    const d = TANKS_BY_ID.get(n);
    assert.ok(d, `${t.id} -> ${n}`);
    assert.ok(d.tier > t.tier);
    assert.equal(d.doctrine, t.doctrine);
  }
});

test('high tiers are not just bigger numbers: tier 4 tanks differ in layout from their tier 2 roots', () => {
  for (const f of TANK_FAMILIES.filter(f => f.root)) {
    const t2 = TANKS_BY_ID.get(`${f.key}.0.std`), t4 = TANKS_BY_ID.get(`${f.key}.3.std`);
    const sig = t => JSON.stringify([t.guns.map(g => [g.a, g.k, g.n, g.auto]), t.ability, t.spin]);
    assert.notEqual(sig(t2), sig(t4), `${f.key} tier 4 only changes numbers`);

  }
});

test('balance framework: damage follows a tier budget and no form strictly dominates a sibling form of the same tier', () => {
  const std = TANKS.filter(t => t.doctrine === 'std' && t.guns.length);
  for (const t of std) {
    const budget = { 1: 16, 2: 26, 3: 34, 4: 42 }[t.tier];
    assert.ok(t.profile.dps <= budget * 1.15 + 1, `${t.id} dps ${t.profile.dps} over budget ${budget}`);
  }
  const axes = t => [t.profile.dps, t.profile.range, t.profile.mobility, t.profile.durability, t.profile.control, t.profile.coverage, t.profile.burst, t.profile.focus];
  const bad = [];
  for (const a of std) for (const b of std) {
    if (a === b || a.tier !== b.tier || a.ability !== b.ability || a.family !== b.family) continue;
    const A = axes(a), B = axes(b);
    const strictly = A.every((v, i) => v >= B[i]) && A.some((v, i) => v > B[i] * 1.15);
    if (strictly) bad.push(`${a.id} > ${b.id}: ${A} vs ${B}`);
  }
  assert.deepEqual(bad, []);
});

test('every registered tank is selectable and its weapons work in the simulation', () => {
  const w = quietWorld('sandbox');
  const p = w.addPlayer({ name: 'tester' });
  const t = w.tankOf(p);
  const spot = openSpot(w);
  let silent = [];
  for (const def of TANKS) {
    assert.ok(w.logic.sandboxCommand(p, { t: 'p', idx: def.index }), `select ${def.id}`);
    assert.equal(t.defIdx, def.index);
    place(w, t, spot.x, spot.y);
    t.level = 30; w.refreshTank(t, true);
    p.input = { mx: 0, my: 0, ax: 300, ay: 0, fire: true, alt: false, ability: false, seq: 0 };
    const before = w.nextId;
    const beamsBefore = 0;
    let fx = 0;
    steps(w, 50, () => {});
    for (const f of w.fx) if (f[0] === 'beam' || f[0] === 'muzzle') fx++;
    const fired = w.nextId > before || fx > 0;
    if (!fired && def.guns.length) silent.push(def.id);
    for (const e of w.ents) if (e.type === 'bullet') w.remove(e);
    for (const e of w.ents) if (e.type === 'mob' && e.ownerId === t.id) w.remove(e);
    t.droneCount = t.droneCount.map(() => 0);
    w.compact();
  }
  assert.deepEqual(silent, [], `tanks that never fired: ${silent.slice(0, 10).join(', ')}`);
});
