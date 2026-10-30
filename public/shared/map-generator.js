import { makeRng } from './rng.js';
import { TILES, TILE, isSolidTile, THEMES } from './constants.js';

const T = TILES;

function blank(w, h, fill) {
  const tiles = new Uint8Array(w * h);
  tiles.fill(fill);
  return tiles;
}

function border(map) {
  const { w, h, tiles } = map;
  for (let x = 0; x < w; x++) { tiles[x] = T.WALL; tiles[(h - 1) * w + x] = T.WALL; }
  for (let y = 0; y < h; y++) { tiles[y * w] = T.WALL; tiles[y * w + w - 1] = T.WALL; }
}

function rect(map, x, y, w, h, val) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    if (i > 0 && j > 0 && i < map.w - 1 && j < map.h - 1) map.tiles[j * map.w + i] = val;
  }
}

function roomCenter(r) {
  return { x: (r.x + r.w / 2) * TILE, y: (r.y + r.h / 2) * TILE };
}

export function floodFill(map, startIdx, passable) {
  const seen = new Uint8Array(map.w * map.h);
  const q = [startIdx];
  seen[startIdx] = 1;
  const tele = map.teleIndex || new Map();
  while (q.length) {
    const i = q.pop();
    const x = i % map.w, y = (i / map.w) | 0;
    const nb = [i - 1, i + 1, i - map.w, i + map.w];
    if (tele.has(i)) nb.push(tele.get(i));
    for (const n of nb) {
      if (n < 0 || n >= seen.length || seen[n]) continue;
      const nx = n % map.w, ny = (n / map.w) | 0;
      if (!tele.has(i) && Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
      if (!passable(map.tiles[n])) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  return seen;
}

const mandatoryPass = t => !isSolidTile(t) || t === T.DOOR;
const secretPass = t => mandatoryPass(t) || t === T.BREAK || t === T.VINE;

export function validateMap(map) {
  const errors = [];
  const sp = map.spawns[0];
  if (!sp) return { ok: false, errors: ['no spawn'] };
  const startIdx = tileIndexAt(map, sp.x, sp.y);
  if (isSolidTile(map.tiles[startIdx])) errors.push('spawn inside wall');
  const reach = floodFill(map, startIdx, mandatoryPass);
  const reachSecret = floodFill(map, startIdx, secretPass);
  for (const r of map.rooms) {
    const c = roomCenter(r);
    const idx = tileIndexAt(map, c.x, c.y);
    if (r.type === 'secret') {
      if (!reachSecret[idx]) errors.push(`secret room unreachable at ${r.x},${r.y}`);
      if (reach[idx]) errors.push(`secret room not sealed at ${r.x},${r.y}`);
    } else if (r.mandatory && !reach[idx]) errors.push(`${r.type} room unreachable at ${r.x},${r.y}`);
  }
  for (const s of map.spawns) {
    const idx = tileIndexAt(map, s.x, s.y);
    if (isSolidTile(map.tiles[idx])) errors.push('spawn inside wall');
    if (!reach[idx]) errors.push('spawn unreachable');
  }
  let floor = 0, reached = 0;
  for (let i = 0; i < map.tiles.length; i++) {
    if (mandatoryPass(map.tiles[i])) { floor++; if (reach[i]) reached++; }
  }
  if (reached / floor < 0.9) errors.push(`only ${Math.round(100 * reached / floor)}% of floor connected`);
  return { ok: errors.length === 0, errors, connectivity: reached / floor };
}

export function tileIndexAt(map, x, y) {
  const tx = Math.max(0, Math.min(map.w - 1, Math.floor(x / TILE)));
  const ty = Math.max(0, Math.min(map.h - 1, Math.floor(y / TILE)));
  return ty * map.w + tx;
}

function carveMaze(rng, cw, ch, reserved) {
  const visited = new Uint8Array(cw * ch);
  const links = [];
  for (const r of reserved) for (let y = r.cy; y < r.cy + r.ch; y++) for (let x = r.cx; x < r.cx + r.cw; x++) visited[y * cw + x] = 2;
  let start = 0;
  while (visited[start]) start++;
  const stack = [start];
  visited[start] = 1;
  while (stack.length) {
    const c = stack[stack.length - 1];
    const cx = c % cw, cy = (c / cw) | 0;
    const opts = [];
    if (cx > 0 && !visited[c - 1]) opts.push(c - 1);
    if (cx < cw - 1 && !visited[c + 1]) opts.push(c + 1);
    if (cy > 0 && !visited[c - cw]) opts.push(c - cw);
    if (cy < ch - 1 && !visited[c + cw]) opts.push(c + cw);
    if (!opts.length) { stack.pop(); continue; }
    const n = rng.pick(opts);
    visited[n] = 1;
    links.push([c, n]);
    stack.push(n);
  }
  for (let c = 0; c < cw * ch; c++) if (!visited[c]) visited[c] = 3;
  return { links, visited };
}

function openLink(map, cw, a, b, val = T.FLOOR) {
  const ax = a % cw, ay = (a / cw) | 0, bx = b % cw, by = (b / cw) | 0;
  if (ax !== bx) {
    const wx = Math.max(ax, bx) * 3;
    for (let k = 1; k <= 2; k++) map.tiles[(ay * 3 + k) * map.w + wx] = val;
    return [(ay * 3 + 1) * map.w + wx, (ay * 3 + 2) * map.w + wx];
  }
  const wy = Math.max(ay, by) * 3;
  for (let k = 1; k <= 2; k++) map.tiles[wy * map.w + ax * 3 + k] = val;
  return [wy * map.w + ax * 3 + 1, wy * map.w + ax * 3 + 2];
}

function cellRoomToTiles(r) {
  return { x: r.cx * 3 + 1, y: r.cy * 3 + 1, w: r.cw * 3 - 1, h: r.ch * 3 - 1 };
}

function overlaps(a, list, pad = 1) {
  return list.some(b => a.cx < b.cx + b.cw + pad && a.cx + a.cw + pad > b.cx && a.cy < b.cy + b.ch + pad && a.cy + a.ch + pad > b.cy);
}

function placeRoom(rng, cw, ch, size, list, tries = 60, region = null) {
  for (let t = 0; t < tries; t++) {
    const w = size[0] + rng.int(0, size[1] - size[0]);
    const h = size[0] + rng.int(0, size[1] - size[0]);
    const x0 = region ? region.x0 : 0, x1 = region ? region.x1 : cw;
    const y0 = region ? region.y0 : 0, y1 = region ? region.y1 : ch;
    const r = { cx: rng.int(x0, Math.max(x0, x1 - w)), cy: rng.int(y0, Math.max(y0, y1 - h)), cw: w, ch: h };
    if (r.cx + r.cw > cw || r.cy + r.ch > ch) continue;
    if (!overlaps(r, list)) return r;
  }
  return null;
}

export function generateLabyrinth(seed, theme = 'classic') {
  for (let attempt = 0; attempt < 12; attempt++) {
    const map = tryLabyrinth(seed + attempt * 7919, theme);
    const v = validateMap(map);
    if (v.ok) { map.validation = v; map.attempts = attempt + 1; return map; }
    if (attempt === 11) { map.validation = v; map.attempts = attempt + 1; return map; }
  }
}

function tryLabyrinth(seed, theme) {
  const rng = makeRng(seed);
  const big = theme === 'endless';
  const cw = big ? 26 : 16, ch = big ? 26 : 16;
  const w = cw * 3 + 1, h = ch * 3 + 1;
  const map = { w, h, tiles: blank(w, h, T.WALL), theme, seed, kind: 'labyrinth', rooms: [], spawns: [], teleporters: [], doors: [], conveyors: new Map(), regions: [], mobSpots: [], features: [] };
  const regions = big
    ? [
      { x0: 0, x1: 13, y0: 0, y1: 13, theme: 'crystal' }, { x0: 13, x1: 26, y0: 0, y1: 13, theme: 'industrial' },
      { x0: 0, x1: 13, y0: 13, y1: 26, theme: 'overgrown' }, { x0: 13, x1: 26, y0: 13, y1: 26, theme: 'void' }
    ]
    : [{ x0: 0, x1: cw, y0: 0, y1: ch, theme }];
  map.regions = regions.map(r => ({ x: r.x0 * 3 * TILE, y: r.y0 * 3 * TILE, w: (r.x1 - r.x0) * 3 * TILE, h: (r.y1 - r.y0) * 3 * TILE, theme: r.theme }));

  const secrets = [];
  const nSecret = big ? 5 : 3;
  for (let i = 0; i < nSecret; i++) {
    const r = placeRoom(rng, cw, ch, [1, 2], secrets, 80);
    if (r) { r.type = 'secret'; secrets.push(r); }
  }
  const { links, visited } = carveMaze(rng, cw, ch, secrets);
  for (let c = 0; c < cw * ch; c++) {
    if (visited[c] !== 1) continue;
    const x = c % cw, y = (c / cw) | 0;
    rect(map, x * 3 + 1, y * 3 + 1, 2, 2, T.FLOOR);
  }
  for (const [a, b] of links) openLink(map, cw, a, b);

  const deg = new Uint8Array(cw * ch);
  for (const [a, b] of links) { deg[a]++; deg[b]++; }
  const extra = [];
  for (let c = 0; c < cw * ch; c++) {
    if (visited[c] !== 1) continue;
    const x = c % cw, y = (c / cw) | 0;
    const isDead = deg[c] === 1;
    if (isDead && rng.chance(0.18) || rng.chance(0.025)) {
      const nb = [];
      if (x > 0 && visited[c - 1] === 1) nb.push(c - 1);
      if (x < cw - 1 && visited[c + 1] === 1) nb.push(c + 1);
      if (y > 0 && visited[c - cw] === 1) nb.push(c - cw);
      if (y < ch - 1 && visited[c + cw] === 1) nb.push(c + cw);
      if (nb.length) extra.push([c, rng.pick(nb)]);
    }
  }
  const passages = [];
  for (const [a, b] of extra) passages.push({ t: openLink(map, cw, a, b), braid: true });
  for (const [a, b] of links) if (rng.chance(0.08)) passages.push({ t: openLink(map, cw, a, b), braid: false });

  const rooms = [...secrets];
  const spawnCorners = big
    ? [[1, 1], [cw - 4, 1], [1, ch - 4], [cw - 4, ch - 4]]
    : [[0, 0], [cw - 3, 0], [0, ch - 3], [cw - 3, ch - 3]];
  for (const [sx, sy] of spawnCorners) {
    const r = { cx: sx, cy: sy, cw: 3, ch: 3, type: 'spawn', mandatory: true };
    if (!overlaps(r, rooms, 0)) rooms.push(r);
  }
  const mid = { cx: Math.floor(cw / 2) - 2, cy: Math.floor(ch / 2) - 2, cw: 4, ch: 4, type: 'plaza', mandatory: true };
  const hasPlaza = !overlaps(mid, rooms, 0);
  if (hasPlaza) rooms.push(mid);
  const nBoss = big ? 4 : 2;
  for (let i = 0; i < nBoss; i++) {
    const r = placeRoom(rng, cw, ch, [3, 4], rooms, 80, big ? regions[i % regions.length] : null);
    if (r) { r.type = 'boss'; r.mandatory = true; rooms.push(r); }
  }
  const nRes = big ? 6 : 3;
  for (let i = 0; i < nRes; i++) {
    const r = placeRoom(rng, cw, ch, [2, 3], rooms, 60);
    if (r) { r.type = 'resource'; r.mandatory = true; rooms.push(r); }
  }
  const nSmall = big ? 14 : 6;
  for (let i = 0; i < nSmall; i++) {
    const r = placeRoom(rng, cw, ch, [1, 2], rooms, 40);
    if (r) { r.type = 'chamber'; rooms.push(r); }
  }
  for (const r of rooms) {
    if (r.type === 'secret') continue;
    const t = cellRoomToTiles(r);
    rect(map, t.x, t.y, t.w, t.h, T.FLOOR);
  }
  if (hasPlaza) {
    const t = cellRoomToTiles(mid);
    for (const [px, py] of [[2, 2], [t.w - 3, 2], [2, t.h - 3], [t.w - 3, t.h - 3]]) map.tiles[(t.y + py) * w + t.x + px] = T.WALL;
    map.features.push({ type: 'landmark', x: (t.x + t.w / 2) * TILE, y: (t.y + t.h / 2) * TILE });
  }
  for (const s of secrets) {
    const t = cellRoomToTiles(s);
    rect(map, t.x, t.y, t.w, t.h, T.FLOOR);
    const edges = [];
    if (s.cx > 0) edges.push({ i: t.x - 1, j: t.y + (t.h >> 1), dx: -1, dy: 0 });
    if (s.cx + s.cw < cw) edges.push({ i: t.x + t.w, j: t.y + (t.h >> 1), dx: 1, dy: 0 });
    if (s.cy > 0) edges.push({ i: t.x + (t.w >> 1), j: t.y - 1, dx: 0, dy: -1 });
    if (s.cy + s.ch < ch) edges.push({ i: t.x + (t.w >> 1), j: t.y + t.h, dx: 0, dy: 1 });
    rng.shuffle(edges);
    let opened = false;
    for (const e of edges) {
      const outside = (e.j + e.dy) * w + e.i + e.dx;
      if (outside >= 0 && outside < map.tiles.length && !isSolidTile(map.tiles[outside])) {
        map.tiles[e.j * w + e.i] = T.BREAK;
        opened = true;
        break;
      }
    }
    if (!opened && edges.length) {
      const e = edges[0];
      map.tiles[e.j * w + e.i] = T.BREAK;
      map.tiles[(e.j + e.dy) * w + e.i + e.dx] = T.FLOOR;
    }
  }
  map.rooms = rooms.map(r => ({ ...cellRoomToTiles(r), type: r.type, mandatory: !!r.mandatory }));

  const isFloor = i => map.tiles[i] === T.FLOOR;
  const inSecretBorder = (x, y) => map.rooms.some(r => r.type === 'secret' && x >= r.x - 1 && x <= r.x + r.w && y >= r.y - 1 && y <= r.y + r.h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (map.tiles[i] !== T.WALL || inSecretBorder(x, y)) continue;
    const thinH = isFloor(i - 1) && isFloor(i + 1);
    const thinV = isFloor(i - w) && isFloor(i + w);
    if ((thinH || thinV) && rng.chance(0.07)) map.tiles[i] = T.BREAK;
  }

  const themeAt = (x, y) => {
    for (const r of regions) if (x >= r.x0 * 3 && x < r.x1 * 3 + 1 && y >= r.y0 * 3 && y < r.y1 * 3 + 1) return r.theme;
    return theme;
  };
  const protectedTile = (x, y) => map.rooms.some(r => (r.type === 'spawn' || r.type === 'secret') && x >= r.x - 1 && x <= r.x + r.w && y >= r.y - 1 && y <= r.y + r.h);
  const density = big ? 0.6 : 1;

  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const th = themeAt(x, y);
    const t = map.tiles[i];
    if (th === 'crystal' && t === T.WALL && rng.chance(0.3 * density)) {
      const touches = isFloor(i - 1) || isFloor(i + 1) || isFloor(i - w) || isFloor(i + w);
      if (touches && !inSecretBorder(x, y)) map.tiles[i] = T.CRYSTAL;
    }
    if (t === T.FLOOR && !protectedTile(x, y)) {
      if (th === 'overgrown' && rng.chance(0.06 * density)) map.tiles[i] = T.MOSS;
      if (th === 'crystal' && rng.chance(0.012 * density)) {
        for (const k of [i, i + 1, i + w, i + w + 1]) if (map.tiles[k] === T.FLOOR) map.tiles[k] = T.ENERGY;
      }
    }
  }
  for (const p of passages) {
    const [a, b] = p.t;
    const x = a % w, y = (a / w) | 0;
    if (protectedTile(x, y)) continue;
    const th = themeAt(x, y);
    if (th === 'industrial' && rng.chance(0.35 * density)) {
      map.tiles[a] = T.DOOR; map.tiles[b] = T.DOOR;
      map.doors.push({ tiles: [a, b], phase: rng.range(0, 6), period: rng.pick([4, 5, 6]) });
    } else if (th === 'void' && rng.chance(0.3 * density)) {
      map.tiles[a] = T.DOOR; map.tiles[b] = T.DOOR;
      map.doors.push({ tiles: [a, b], phase: rng.range(0, 8), period: rng.pick([3, 7, 9]), unstable: true });
    } else if (th === 'overgrown' && p.braid && rng.chance(0.95 * density)) {
      map.tiles[a] = T.VINE; map.tiles[b] = T.VINE;
    }
  }
  for (const [a, b] of links) {
    const ax = a % cw, ay = (a / cw) | 0;
    const th = themeAt(ax * 3 + 1, ay * 3 + 1);
    if (th !== 'industrial' || !rng.chance(0.12 * density)) continue;
    const bx = b % cw, by = (b / cw) | 0;
    const dir = bx > ax ? 0 : bx < ax ? 2 : by > ay ? 1 : 3;
    for (const c of [a, b]) {
      const cx = c % cw, cy = (c / cw) | 0;
      for (let k = 0; k < 4; k++) {
        const ti = (cy * 3 + 1 + (k >> 1)) * w + cx * 3 + 1 + (k & 1);
        if (map.tiles[ti] === T.FLOOR && !protectedTile(cx * 3 + 1, cy * 3 + 1)) { map.tiles[ti] = T.CONVEYOR; map.conveyors.set(ti, dir); }
      }
    }
  }
  const voidRegions = regions.filter(r => r.theme === 'void');
  for (const vr of voidRegions) {
    const pads = [];
    const candidates = map.rooms.filter(r => r.type === 'chamber' || r.type === 'resource').filter(r => r.x >= vr.x0 * 3 && r.x < vr.x1 * 3 && r.y >= vr.y0 * 3 && r.y < vr.y1 * 3);
    const pool = candidates.length >= 2 ? candidates : map.rooms.filter(r => r.type === 'chamber' || r.type === 'resource');
    rng.shuffle(pool);
    for (const r of pool.slice(0, 6)) {
      const idx = (r.y + (r.h >> 1)) * w + r.x + (r.w >> 1);
      if (map.tiles[idx] === T.FLOOR) { map.tiles[idx] = T.TELEPORT; pads.push(idx); }
    }
    for (let i = 0; i + 1 < pads.length; i += 2) map.teleporters.push([pads[i], pads[i + 1]]);
  }
  map.teleIndex = new Map();
  for (const [a, b] of map.teleporters) { map.teleIndex.set(a, b); map.teleIndex.set(b, a); }

  for (const r of map.rooms) {
    if (r.type === 'spawn') {
      for (let k = 0; k < 2; k++) map.spawns.push({ x: (r.x + 1 + rng.range(0, r.w - 2)) * TILE, y: (r.y + 1 + rng.range(0, r.h - 2)) * TILE });
    }
    if (r.type === 'chamber' || r.type === 'resource') {
      const th = themeAt(r.x, r.y);
      map.mobSpots.push({ x: (r.x + r.w / 2) * TILE, y: (r.y + r.h / 2) * TILE, theme: th, elite: r.type === 'resource' });
    }
  }
  if (theme === 'industrial' || big) {
    for (const r of map.rooms.filter(r => r.type === 'chamber' && themeAt(r.x, r.y) === 'industrial')) {
      map.features.push({ type: 'wallTurret', x: (r.x + 0.6) * TILE, y: (r.y + 0.6) * TILE });
    }
  }
  return map;
}

function tryNexusMap(seed) {
  const rng = makeRng(seed);
  const w = 84, h = 46;
  const map = { w, h, tiles: blank(w, h, T.FLOOR), theme: 'nexus', seed, kind: 'nexus', rooms: [], spawns: [], teleporters: [], doors: [], conveyors: new Map(), regions: [], mobSpots: [], features: [], teleIndex: new Map() };
  border(map);
  const mirror = (x, y, wd, ht, val) => { rect(map, x, y, wd, ht, val); rect(map, w - x - wd, y, wd, ht, val); };
  rect(map, 1, 1, 12, h - 2, T.BASE_BLUE);
  rect(map, w - 13, 1, 12, h - 2, T.BASE_RED);
  mirror(14, 13, 2, 7, T.WALL);
  mirror(14, 26, 2, 7, T.WALL);
  mirror(22, 1, 2, 9, T.WALL);
  mirror(22, h - 10, 2, 9, T.WALL);
  mirror(26, 15, 6, 2, T.WALL);
  mirror(26, 29, 6, 2, T.WALL);
  for (let i = 0; i < 6; i++) {
    const bx = rng.int(17, 34), by = rng.int(3, h - 6), bw = rng.int(1, 3), bh = rng.int(1, 3);
    if (Math.abs(by + bh / 2 - h / 2) < 5) continue;
    if ([[30, 6], [30, h - 7]].some(([rx, ry]) => bx < rx + 4 && bx + bw > rx - 4 && by < ry + 4 && by + bh > ry - 4)) continue;
    mirror(bx, by, bw, bh, T.WALL);
    if (rng.chance(0.4)) mirror(bx, by + bh, bw, 1, T.BREAK);
  }
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d < 8 && map.tiles[y * w + x] === T.WALL && x > 0 && y > 0 && x < w - 1 && y < h - 1) map.tiles[y * w + x] = T.FLOOR;
    if (d > 9 && d < 9.8 && (Math.atan2(y - cy, x - cx) * 4 / Math.PI) % 1 > 0.55) map.tiles[y * w + x] = T.WALL;
  }
  map.rooms.push({ x: cx - 8, y: cy - 8, w: 16, h: 16, type: 'boss', mandatory: true });
  map.rooms.push({ x: 1, y: 1, w: 12, h: h - 2, type: 'base_blue', mandatory: true });
  map.rooms.push({ x: w - 13, y: 1, w: 12, h: h - 2, type: 'base_red', mandatory: true });
  for (const [lx, ly] of [[30, 6], [30, h - 7], [w - 31, 6], [w - 31, h - 7]]) map.rooms.push({ x: lx - 2, y: ly - 2, w: 4, h: 4, type: 'resource', mandatory: true });
  const T2 = TILE;
  map.nexus = [
    { team: 0, x: 5.5 * T2, y: cy * T2 },
    { team: 1, x: (w - 5.5) * T2, y: cy * T2 }
  ];
  map.generators = [
    { team: 0, x: 11 * T2, y: 10 * T2 }, { team: 0, x: 11 * T2, y: (h - 10) * T2 },
    { team: 1, x: (w - 11) * T2, y: 10 * T2 }, { team: 1, x: (w - 11) * T2, y: (h - 10) * T2 }
  ];
  map.turrets = [
    { team: 0, x: 10 * T2, y: cy * T2 }, { team: 0, x: 8 * T2, y: (cy - 7) * T2 }, { team: 0, x: 8 * T2, y: (cy + 7) * T2 },
    { team: 1, x: (w - 10) * T2, y: cy * T2 }, { team: 1, x: (w - 8) * T2, y: (cy - 7) * T2 }, { team: 1, x: (w - 8) * T2, y: (cy + 7) * T2 }
  ];
  for (let k = 0; k < 6; k++) {
    map.spawns.push({ team: 0, x: rng.range(2, 6) * T2, y: rng.range(4, h - 4) * T2 });
    map.spawns.push({ team: 1, x: (w - rng.range(2, 6)) * T2, y: rng.range(4, h - 4) * T2 });
  }
  for (const s of map.spawns) {
    const near = map.nexus.some(n => Math.hypot(n.x - s.x, n.y - s.y) < 200);
    if (near) s.y = s.y < cy * T2 ? (cy - 6) * T2 : (cy + 6) * T2;
  }
  map.features.push({ type: 'shrine', x: cx * T2, y: cy * T2 });
  return map;
}

function tryArena(seed, teams) {
  const rng = makeRng(seed);
  const w = 72, h = 72;
  const map = { w, h, tiles: blank(w, h, T.FLOOR), theme: 'arena', seed, kind: 'arena', rooms: [], spawns: [], teleporters: [], doors: [], conveyors: new Map(), regions: [], mobSpots: [], features: [], teleIndex: new Map() };
  border(map);
  if (teams) { rect(map, 1, 1, 7, h - 2, T.BASE_BLUE); rect(map, w - 8, 1, 7, h - 2, T.BASE_RED); }
  for (let i = 0; i < 16; i++) {
    const bx = rng.int(10, w - 13), by = rng.int(4, h - 7);
    if (Math.hypot(bx - w / 2, by - h / 2) < 10) continue;
    const horiz = rng.chance(0.5);
    rect(map, bx, by, horiz ? rng.int(3, 6) : 1, horiz ? 1 : rng.int(3, 6), rng.chance(0.25) ? T.BREAK : T.WALL);
  }
  map.rooms.push({ x: w / 2 - 6, y: h / 2 - 6, w: 12, h: 12, type: 'boss', mandatory: true });
  map.rooms.push({ x: w / 2 - 3, y: h / 2 - 3, w: 6, h: 6, type: 'resource', mandatory: true });
  for (let k = 0; k < 12; k++) {
    if (teams) {
      map.spawns.push({ team: 0, x: rng.range(2, 6) * TILE, y: rng.range(4, h - 4) * TILE });
      map.spawns.push({ team: 1, x: (w - rng.range(2, 6)) * TILE, y: rng.range(4, h - 4) * TILE });
    } else {
      let x, y, tries = 0;
      do { x = rng.range(3, w - 3); y = rng.range(3, h - 3); tries++; } while (tries < 50 && (isSolidTile(map.tiles[Math.floor(y) * w + Math.floor(x)]) || Math.hypot(x - w / 2, y - h / 2) < 12));
      map.spawns.push({ x: x * TILE, y: y * TILE });
    }
  }
  return map;
}

function tryMaze(seed, teams) {
  const rng = makeRng(seed);
  const cw = 22, ch = 22;
  const w = cw * 3 + 1, h = ch * 3 + 1;
  const map = { w, h, tiles: blank(w, h, T.WALL), theme: 'maze', seed, kind: 'maze', rooms: [], spawns: [], teleporters: [], doors: [], conveyors: new Map(), regions: [], mobSpots: [], features: [], teleIndex: new Map() };
  const mid = { cx: 9, cy: 9, cw: 4, ch: 4 };
  const reserved = [];
  const visited = new Uint8Array(cw * ch);
  const links = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const stack = [{ c: 0, d: -1 }];
  visited[0] = 1;
  while (stack.length) {
    const top = stack[stack.length - 1];
    const cx = top.c % cw, cy = (top.c / cw) | 0;
    const opts = [];
    for (let d = 0; d < 4; d++) {
      const nx = cx + dirs[d][0], ny = cy + dirs[d][1];
      if (nx < 0 || ny < 0 || nx >= cw || ny >= ch || visited[ny * cw + nx]) continue;
      opts.push(d);
    }
    if (!opts.length) { stack.pop(); continue; }
    let d = opts.includes(top.d) && rng.chance(0.72) ? top.d : rng.pick(opts);
    const n = (cy + dirs[d][1]) * cw + cx + dirs[d][0];
    visited[n] = 1;
    links.push([top.c, n]);
    stack.push({ c: n, d });
  }
  for (let c = 0; c < cw * ch; c++) rect(map, (c % cw) * 3 + 1, ((c / cw) | 0) * 3 + 1, 2, 2, T.FLOOR);
  for (const [a, b] of links) openLink(map, cw, a, b);
  const deg = new Uint8Array(cw * ch);
  for (const [a, b] of links) { deg[a]++; deg[b]++; }
  for (let c = 0; c < cw * ch; c++) {
    if (deg[c] !== 1 || !rng.chance(0.08)) continue;
    const x = c % cw, y = (c / cw) | 0;
    const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < cw && b < ch);
    const [nx, ny] = rng.pick(nb);
    openLink(map, cw, c, ny * cw + nx);
  }
  const open = (r, type, mandatory, fill = T.FLOOR) => {
    const t = cellRoomToTiles(r);
    rect(map, t.x, t.y, t.w, t.h, fill);
    map.rooms.push({ ...t, type, mandatory });
    return t;
  };
  const plaza = open(mid, 'boss', true);
  for (const [px, py] of [[1, 1], [plaza.w - 2, 1], [1, plaza.h - 2], [plaza.w - 2, plaza.h - 2]]) map.tiles[(plaza.y + py) * w + plaza.x + px] = T.WALL;
  map.features.push({ type: 'landmark', x: (plaza.x + plaza.w / 2) * TILE, y: (plaza.y + plaza.h / 2) * TILE });
  for (let i = 0; i < 5; i++) {
    const r = placeRoom(rng, cw, ch, [1, 2], [mid, ...reserved], 60);
    if (r) { reserved.push(r); open(r, 'resource', true); }
  }
  if (teams) {
    const a = open({ cx: 0, cy: 0, cw: 3, ch: 3 }, 'base_blue', true, T.BASE_BLUE);
    const b = open({ cx: cw - 3, cy: ch - 3, cw: 3, ch: 3 }, 'base_red', true, T.BASE_RED);
    for (let k = 0; k < 6; k++) {
      map.spawns.push({ team: 0, x: (a.x + 1 + rng.range(0, a.w - 2)) * TILE, y: (a.y + 1 + rng.range(0, a.h - 2)) * TILE });
      map.spawns.push({ team: 1, x: (b.x + 1 + rng.range(0, b.w - 2)) * TILE, y: (b.y + 1 + rng.range(0, b.h - 2)) * TILE });
    }
  } else {
    for (let k = 0; k < 16; k++) {
      const c = rng.int(0, cw * ch - 1);
      const x = c % cw, y = (c / cw) | 0;
      if (x >= mid.cx - 1 && x <= mid.cx + mid.cw && y >= mid.cy - 1 && y <= mid.cy + mid.ch) continue;
      map.spawns.push({ x: (x * 3 + 2) * TILE, y: (y * 3 + 2) * TILE });
    }
  }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (map.tiles[i] !== T.WALL) continue;
    const fl = (map.tiles[i - 1] === T.FLOOR && map.tiles[i + 1] === T.FLOOR) || (map.tiles[i - w] === T.FLOOR && map.tiles[i + w] === T.FLOOR);
    if (fl && rng.chance(0.03)) map.tiles[i] = T.BREAK;
  }
  border(map);
  return map;
}

function retry(fn, seed, ...args) {
  let map;
  for (let k = 0; k < 10; k++) {
    map = fn(seed + k * 104729, ...args);
    map.validation = validateMap(map);
    if (map.validation.ok) return map;
  }
  return map;
}

export function generateNexusMap(seed) { return retry(tryNexusMap, seed); }
export function generateArena(seed, teams = false) { return retry(tryArena, seed, teams); }
export function generateMaze(seed, teams = false) { return retry(tryMaze, seed, teams); }

export function generateMap(mode, seed, theme) {
  if (mode === 'nexus') return generateNexusMap(seed);
  if (mode === 'maze' || mode === 'maze_team') return generateMaze(seed, mode === 'maze_team');
  if (mode === 'labyrinth' || mode === 'labyrinth_team') return generateLabyrinth(seed, THEMES.includes(theme) ? theme : 'classic');
  return generateArena(seed, mode === 'tdm' || mode === 'battle_team');
}

export function encodeTiles(tiles) {
  let s = '';
  for (let i = 0; i < tiles.length; i++) s += tiles[i].toString(16);
  return s;
}

export function decodeTiles(str) {
  const t = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) t[i] = parseInt(str[i], 16);
  return t;
}
