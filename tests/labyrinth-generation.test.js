import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLabyrinth, validateMap, floodFill, tileIndexAt, encodeTiles, generateNexusMap, generateArena } from '../public/shared/map-generator.js';
import { THEMES, TILE, TILES, isSolidTile } from '../public/shared/constants.js';
import { World } from '../public/shared/sim/world.js';

const SEEDS = Array.from({ length: 25 }, (_, i) => 1000 + i * 37);

test('labyrinth generation completes and validates for every theme across many seeds', () => {
  for (const theme of THEMES) for (const seed of SEEDS) {
    const m = generateLabyrinth(seed, theme);
    assert.ok(m.validation.ok, `${theme}/${seed}: ${m.validation.errors.join('; ')}`);
    assert.ok(m.rooms.some(r => r.type === 'boss'), `${theme}/${seed}: no boss chamber`);
    assert.ok(m.rooms.some(r => r.type === 'resource'), `${theme}/${seed}: no resource room`);
    assert.ok(m.spawns.length >= 2);
  }
});

test('mandatory objectives are reachable without breaking walls', () => {
  for (const seed of SEEDS.slice(0, 10)) {
    const m = generateLabyrinth(seed, 'overgrown');
    const reach = floodFill(m, tileIndexAt(m, m.spawns[0].x, m.spawns[0].y), t => !isSolidTile(t) || t === TILES.DOOR);
    for (const r of m.rooms.filter(r => r.mandatory)) {
      const idx = tileIndexAt(m, (r.x + r.w / 2) * TILE, (r.y + r.h / 2) * TILE);
      assert.ok(reach[idx], `${r.type} room unreachable on seed ${seed}`);
    }
  }
});

test('secret rooms are sealed but reachable by breaking walls', () => {
  let secrets = 0;
  for (const seed of SEEDS) {
    const m = generateLabyrinth(seed, 'classic');
    const start = tileIndexAt(m, m.spawns[0].x, m.spawns[0].y);
    const normal = floodFill(m, start, t => !isSolidTile(t) || t === TILES.DOOR);
    const breaking = floodFill(m, start, t => !isSolidTile(t) || t === TILES.DOOR || t === TILES.BREAK || t === TILES.VINE);
    for (const r of m.rooms.filter(r => r.type === 'secret')) {
      const idx = tileIndexAt(m, (r.x + r.w / 2) * TILE, (r.y + r.h / 2) * TILE);
      assert.equal(normal[idx], 0, 'secret room not sealed');
      assert.equal(breaking[idx], 1, 'secret room unreachable');
      secrets++;
    }
  }
  assert.ok(secrets >= SEEDS.length, 'too few secret rooms generated');
});

test('players never spawn inside walls', () => {
  for (const theme of THEMES) {
    const w = new World({ mode: 'labyrinth', seed: 4242, settings: { theme } });
    for (let i = 0; i < 12; i++) {
      const p = w.addPlayer({ name: `p${i}`, isBot: true });
      const t = w.tankOf(p);
      assert.ok(!w.solidAt(t.x, t.y), `${theme}: spawn in wall`);
      assert.ok(!w.solidAt(t.x + t.r * 0.7, t.y) && !w.solidAt(t.x - t.r * 0.7, t.y) && !w.solidAt(t.x, t.y + t.r * 0.7) && !w.solidAt(t.x, t.y - t.r * 0.7), `${theme}: spawn overlaps wall`);
    }
  }
});

test('corridor collision: walls are solid for movement and line of sight', () => {
  const w = new World({ mode: 'labyrinth', seed: 99, settings: {} });
  let idx = -1;
  for (let i = w.w + 1; i < w.tiles.length; i++) if (w.tiles[i] === TILES.WALL && w.tiles[i - 1] === TILES.FLOOR && w.tiles[i + 1] === TILES.FLOOR) { idx = i; break; }
  assert.ok(idx > 0);
  const tx = idx % w.w, ty = (idx / w.w) | 0;
  const e = { x: (tx - 0.5) * TILE, y: (ty + 0.5) * TILE, r: 20, vx: 400, vy: 0 };
  for (let i = 0; i < 20; i++) { e.x += e.vx / 30; w.collideWalls(e); }
  assert.ok(e.x <= tx * TILE - e.r + 0.5, 'entity entered wall tile');
  assert.equal(w.los((tx - 0.5) * TILE, (ty + 0.5) * TILE, (tx + 1.5) * TILE, (ty + 0.5) * TILE), false);
});

test('generation is deterministic per seed and different seeds vary', () => {
  const a = encodeTiles(generateLabyrinth(555, 'void').tiles);
  const b = encodeTiles(generateLabyrinth(555, 'void').tiles);
  const c = encodeTiles(generateLabyrinth(556, 'void').tiles);
  assert.equal(a, b);
  assert.notEqual(a, c);
  let diff = 0;
  for (let i = 0; i < Math.min(a.length, c.length); i++) if (a[i] !== c[i]) diff++;
  assert.ok(diff / a.length > 0.1, 'seeds produce nearly identical maps');
});

test('themes change gameplay tiles, not just colours', () => {
  const count = (m, t) => m.tiles.reduce((n, v) => n + (v === t ? 1 : 0), 0);
  assert.ok(count(generateLabyrinth(7, 'crystal'), TILES.CRYSTAL) > 20);
  const ind = generateLabyrinth(7, 'industrial');
  assert.ok(ind.doors.length > 3 && ind.conveyors.size > 0);
  assert.ok(count(generateLabyrinth(7, 'overgrown'), TILES.VINE) > 4);
  assert.ok(generateLabyrinth(7, 'void').teleporters.length >= 1);
  const end = generateLabyrinth(7, 'endless');
  assert.ok(end.w > 70 && end.regions.length === 4);
});

test('nexus and arena maps validate', () => {
  for (const seed of SEEDS.slice(0, 8)) {
    assert.ok(validateMap(generateNexusMap(seed)).ok);
    assert.ok(validateMap(generateArena(seed, true)).ok);
    assert.ok(validateMap(generateArena(seed, false)).ok);
  }
});
