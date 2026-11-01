import { TEAM, TILE, TILES } from '../constants.js';
import { BOSSES, BOSS_BY_KEY } from '../boss-registry.js';
import { HAZ } from '../entity-types.js';
import { leadAngle, approachAngle, explodeAt, chainFrom } from './combat.js';

const DEG = Math.PI / 180;

function tanksNear(world, x, y, r) {
  const out = [];
  for (const e of world.ents) if (!e.dead && e.type === 'tank' && Math.hypot(e.x - x, e.y - y) <= r) out.push(e);
  return out;
}

export const BOSS_HP_SCALE = 0.25;

export function spawnBoss(world, which, x, y, opts = {}) {
  const def = typeof which === 'number' ? BOSSES[which] : BOSS_BY_KEY[which] || BOSSES[0];
  const near = tanksNear(world, x, y, 1900).length;
  const n = Math.max(1, opts.players || near);
  const hpMul = Math.min(2.6, 1 + 0.38 * (n - 1)) * (opts.hpMul || 1) * BOSS_HP_SCALE;
  let r = def.r;
  if (world.map.kind === 'labyrinth') r = def.move === 'chase' ? Math.min(r, 56) : Math.min(r, 92);
  const b = world.add({
    type: 'boss', def, key: def.key, bossIdx: def.index, x, y, r, hp: def.hp * hpMul, maxHp: def.hp * hpMul, team: TEAM.BOSS,
    phase: 0, cds: {}, channel: null, targetId: 0, contrib: new Map(), parts: [], mobs: new Set(), disabled: new Set(),
    home: { x, y }, nextAttack: world.time + 2.5, invulnUntil: world.time + 2.5, mass: 30, scaleN: n,
    lastMoveCheck: { t: world.time, x, y }, lastSeen: world.time, lastAttackAt: world.time, mode: null, adaptAt: world.time + 6,
    recent: new Map(), mirrorUntil: 0, armorUntil: 0, armorOverride: 0, regen: null, trailUntil: 0, formation: null, swarmCount: 0,
    rotOffset: 0, spawnedAt: world.time, source: opts.source || 'timed'
  });
  for (const k of Object.keys(def.attacks)) b.cds[k] = world.time + 2 + world.rng.range(0, def.attacks[k].cd);
  for (const spec of def.parts || []) {
    const part = world.add({ type: 'part', bossId: b.id, spec, x, y, r: spec.r * (r / def.r + 0.2) / 1.2, hp: spec.hp * (spec.invulnPart ? 1 : hpMul), maxHp: spec.hp * (spec.invulnPart ? 1 : hpMul), team: TEAM.BOSS, static: true, mass: 999, down: false, angOff: spec.ang * DEG });
    b.parts.push(part.id);
  }
  world.addFx('bossSpawn', Math.round(x), Math.round(y), Math.round(r));
  world.emit({ k: 'boss', name: def.name, title: def.title, idx: def.index, x: Math.round(x), y: Math.round(y), id: b.id });
  return b;
}

function currentPhase(b) {
  const frac = b.hp / b.maxHp;
  let idx = 0;
  for (let i = 0; i < b.def.phases.length; i++) if (frac <= b.def.phases[i].at) idx = i;
  return idx;
}

function aliveParts(world, b) {
  return b.parts.map(id => world.get(id)).filter(p => p && !p.down);
}

export function updateBoss(world, b, dt) {
  const def = b.def;
  const now = world.time;
  const ph = currentPhase(b);
  if (ph !== b.phase) {
    b.phase = ph;
    const P = def.phases[ph];
    b.invulnUntil = now + 1.4;
    b.channel = null;
    world.addFx('phase', Math.round(b.x), Math.round(b.y), Math.round(b.r));
    world.emit({ k: 'bossPhase', id: b.id, name: def.name, phase: P.name, idx: ph });
    for (const a of P.onEnter || []) world.after(1.5, () => { if (!b.dead) runAttack(world, b, a); });
  }
  const P = def.phases[b.phase];
  if (world.tick % 30 === b.id % 30) {
    let best = null, bd = 1e12;
    for (const t of world.ents) {
      if (t.dead || t.type !== 'tank') continue;
      if (t.status.cloakUntil > now && Math.hypot(t.x - b.x, t.y - b.y) > 300) continue;
      let d = Math.hypot(t.x - b.x, t.y - b.y);
      if (d > 1700) continue;
      if (!world.los(b.x, b.y, t.x, t.y)) d += 700;
      const rec = b.recent.get(t.id);
      if (rec && now - rec.t < 6) d -= 250;
      if (d < bd) { bd = d; best = t; }
    }
    b.targetId = best ? best.id : 0;
    if (best) b.lastSeen = now;
    b.scaleN = Math.max(1, tanksNear(world, b.x, b.y, 1800).length);
    if (b.def.key === 'infinite_swarm' || b.mobs.size) {
      let c = 0;
      for (const id of b.mobs) { const m = world.get(id); if (m) { m.slot = c++; } else b.mobs.delete(id); }
      b.swarmCount = c;
    }
  }
  if (now - b.lastSeen > 75) {
    world.emit({ k: 'announce', text: `${def.name} has withdrawn`, tone: 'warn' });
    despawnBoss(world, b);
    return;
  }
  const tg = b.targetId ? world.get(b.targetId) : null;
  for (const id of b.parts) {
    const part = world.byId.get(id);
    if (!part) continue;
    const spec = part.spec;
    if (part.down && spec.regrow && now >= part.regrowAt) {
      part.down = false; part.hp = part.maxHp;
      world.addFx('phase', Math.round(part.x), Math.round(part.y), Math.round(part.r));
      for (const d of spec.disables || []) b.disabled.delete(d);
    }
    if (spec.relocate) {
      part.nextMove = part.nextMove || now + spec.relocate;
      if (now >= part.nextMove) { part.angOff = world.rng.range(0, Math.PI * 2); part.nextMove = now + spec.relocate; world.addFx('tele', Math.round(part.x), Math.round(part.y), Math.round(b.x), Math.round(b.y)); }
    }
    const ang = part.angOff + (spec.orbit || 0) * now + (spec.heads ? b.angle : 0);
    part.x = b.x + Math.cos(ang) * spec.dist * b.r;
    part.y = b.y + Math.sin(ang) * spec.dist * b.r;
    part.vx = b.vx; part.vy = b.vy;
    part.overload = !!P.overload;
    if (spec.fires && !part.down && tg) {
      part.fireAt = part.fireAt || now + 1 + world.rng.range(0, 1.5);
      if (now >= part.fireAt) {
        part.fireAt = now + 2.4;
        if (spec.fires === 'radial') for (let i = 0; i < 8; i++) bossBullet(world, b, i * Math.PI / 4 + now, 280, 11, 10, {}, part.x, part.y);
        else bossBullet(world, b, leadAngle(part.x, part.y, tg, 480), 480, 14, 11, {}, part.x, part.y);
      }
    }
  }
  if (def.adaptive && P.adaptive && now >= b.adaptAt) adapt(world, b);
  if (b.regen && b.regen.until > now) b.hp = Math.min(b.maxHp, b.hp + b.regen.rate * dt);
  if (b.trailUntil > now && world.tick % 8 === 0) world.addHazard(HAZ.BURN, b.x, b.y, { r: 70, dur: 5, dps: 45, src: b.id });
  if (world.global.darkness && world.global.darkness.bossId === b.id) { world.global.darkness.x = b.x; world.global.darkness.y = b.y; }
  moveBoss(world, b, tg, dt, P);
  if (b.charging) {
    const c = b.charging;
    if (now >= c.until || Math.hypot(b.vx, b.vy) < 60) { b.charging = null; b.vx *= 0.2; b.vy *= 0.2; }
    else {
      b.vx = Math.cos(c.dir) * c.sp; b.vy = Math.sin(c.dir) * c.sp;
      if (def.breaksWalls) world.bossBreak(b);
      for (const t of world.ents) {
        if (t.dead || t.type !== 'tank' || c.hit.has(t.id)) continue;
        if (Math.hypot(t.x - b.x, t.y - b.y) < b.r + t.r + 6) { c.hit.add(t.id); world.damage(t, c.dm, b, {}); const d = Math.atan2(t.y - b.y, t.x - b.x); t.vx += Math.cos(d) * 700; t.vy += Math.sin(d) * 700; }
      }
    }
  }
  if (b.channel && b.channel.until <= now) b.channel = null;
  if (b.channel && b.channel.tick) b.channel.tick(dt);
  b.cloaked = !!def.cloaks && now - b.lastAttackAt > 1.6 && !b.charging;
  if (!tg || b.channel || now < b.nextAttack || now < b.invulnUntil - 0.6) return;
  const list = (def.adaptive && P.adaptive && b.mode ? def.modes[b.mode] : P.attacks).filter(k => !b.disabled.has(k));
  const cdMul = (P.cdMul || 1) * Math.max(0.7, 1 - 0.05 * (b.scaleN - 1));
  const ready = list.filter(k => b.cds[k] <= now);
  if (!ready.length) return;
  const key = ready[Math.floor(world.rng.next() * ready.length)];
  b.cds[key] = now + def.attacks[key].cd * cdMul;
  b.nextAttack = now + 0.55 * cdMul;
  b.lastAttackAt = now;
  runAttack(world, b, key);
}

function adapt(world, b) {
  const now = world.time;
  b.adaptAt = now + 7;
  let n = 0, dsum = 0, drone = 0;
  for (const [id, rec] of b.recent) {
    if (now - rec.t > 10) { b.recent.delete(id); continue; }
    n++; dsum += rec.dist; drone += rec.drone;
  }
  const tanks = tanksNear(world, b.x, b.y, 1400);
  let clustered = 0;
  for (let i = 0; i < tanks.length; i++) for (let j = i + 1; j < tanks.length; j++) if (Math.hypot(tanks[i].x - tanks[j].x, tanks[i].y - tanks[j].y) < 260) clustered++;
  const avg = n ? dsum / n : 600;
  let mode = 'drone';
  if (drone > n * 0.5 && n) mode = 'rapid';
  else if (clustered >= 1) mode = 'artillery';
  else if (avg > 650) mode = 'sniper';
  else if (avg < 300) mode = 'defensive';
  if (mode === b.mode) b.sameCount = (b.sameCount || 0) + 1; else b.sameCount = 0;
  if (b.sameCount >= 2) { mode = 'overdrive'; b.sameCount = 0; }
  if (mode !== b.mode) {
    b.mode = mode;
    world.emit({ k: 'bossPhase', id: b.id, name: b.def.name, phase: `${mode[0].toUpperCase()}${mode.slice(1)} configuration`, idx: b.phase });
    world.addFx('phase', Math.round(b.x), Math.round(b.y), Math.round(b.r));
  }
}

function moveBoss(world, b, tg, dt, P) {
  if (b.charging) return;
  const def = b.def;
  const speed = def.speed * (P.speedMul || 1) * (b.channel && b.channel.slow ? 0.35 : 1);
  let dvx = 0, dvy = 0;
  if (tg) b.angle = approachAngle(b.angle, Math.atan2(tg.y - b.y, tg.x - b.x), 2.2 * dt);
  const toward = (x, y, s) => {
    const a = world.los(b.x, b.y, x, y) ? Math.atan2(y - b.y, x - b.x) : world.pathDir(b.x, b.y, x, y);
    dvx = Math.cos(a) * s; dvy = Math.sin(a) * s;
  };
  switch (def.move) {
    case 'anchor':
      if (Math.hypot(b.home.x - b.x, b.home.y - b.y) > 60) toward(b.home.x, b.home.y, speed);
      break;
    case 'hover':
      if (tg) {
        const d = Math.hypot(tg.x - b.x, tg.y - b.y);
        const want = 360 + b.r;
        const a = Math.atan2(tg.y - b.y, tg.x - b.x);
        if (!world.los(b.x, b.y, tg.x, tg.y)) toward(tg.x, tg.y, speed);
        else {
          const rad = d > want + 80 ? 1 : d < want - 80 ? -1 : 0;
          const side = Math.sin(world.time * 0.4 + b.id) > 0 ? 1 : -1;
          dvx = (Math.cos(a) * rad - Math.sin(a) * side * 0.6) * speed;
          dvy = (Math.sin(a) * rad + Math.cos(a) * side * 0.6) * speed;
        }
      }
      break;
    case 'chase':
      if (tg) toward(tg.x, tg.y, speed);
      break;
    case 'orbit': {
      const a = world.time * (speed / 520) + b.id;
      toward(b.home.x + Math.cos(a) * 520, b.home.y + Math.sin(a) * 520, speed);
      break;
    }
    default: break;
  }
  const f = Math.min(1, 3 * dt);
  b.vx += (dvx - b.vx) * f;
  b.vy += (dvy - b.vy) * f;
  const lm = b.lastMoveCheck;
  if (world.time - lm.t > 4) {
    const moved = Math.hypot(b.x - lm.x, b.y - lm.y);
    if (tg && (def.move === 'chase' || def.move === 'hover') && moved < 30 && Math.hypot(tg.x - b.x, tg.y - b.y) > b.r + 200) {
      const pos = world.floorNear(tg.x, tg.y, 350, 650) || world.floorNear(b.x, b.y, 200, 500);
      if (pos && tanksNear(world, pos.x, pos.y, 180).length === 0) {
        warnCircle(world, b, pos.x, pos.y, b.r, 1, () => { world.addFx('tele', Math.round(b.x), Math.round(b.y), Math.round(pos.x), Math.round(pos.y)); b.x = pos.x; b.y = pos.y; });
      }
    }
    b.lastMoveCheck = { t: world.time, x: b.x, y: b.y };
  }
}

function bossBullet(world, b, ang, sp, dm, sz, o = {}, x = b.x, y = b.y) {
  const ox = x + Math.cos(ang) * (x === b.x ? b.r * 0.9 : 0), oy = y + Math.sin(ang) * (y === b.y ? b.r * 0.9 : 0);
  const fx = {};
  if (o.bounce) fx.bounce = o.bounce;
  if (o.home) fx.home = o.home;
  if (o.split) fx.split = o.split;
  if (o.explode) fx.explode = o.explode;
  if (o.reverse) fx.reverse = 1;
  return world.addBullet({ kind: o.kind || 'bullet', x: ox, y: oy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: sz || 11, dmg: dm, hp: (o.pn || 1) * 40, life: o.life || Math.min(4.5, 1500 / sp), team: TEAM.BOSS, ownerId: b.id, fx, maxSpeed: sp, angle: ang, chill: o.chill || 0 });
}

function warnCircle(world, b, x, y, r, dur, fn) {
  world.addHazard(HAZ.WARN_CIRCLE, x, y, { r, dur, src: b.id });
  world.after(dur, () => { if (!b.dead) fn(); });
}

function targetsOf(world, b, n, range = 1300) {
  const list = tanksNear(world, b.x, b.y, range).filter(t => !(t.status.cloakUntil > world.time));
  list.sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y));
  return list.slice(0, n);
}

export function runAttack(world, b, key) {
  const a = b.def.attacks[key];
  if (!a) return;
  const now = world.time;
  const tg = world.get(b.targetId);
  const scale = b.def.largeScale ? Math.min(2, 1 + 0.25 * (b.scaleN - 1)) : 1;
  switch (a.k) {
    case 'radial': {
      const waves = a.waves || 1;
      for (let w = 0; w < waves; w++) {
        world.after(w * (a.gap || 0.3), () => {
          if (b.dead) return;
          b.rotOffset += (a.rot || 0) * DEG;
          for (let i = 0; i < a.n; i++) bossBullet(world, b, b.rotOffset + i * Math.PI * 2 / a.n + w * 0.12, a.sp * (1 + w * 0.12), a.dm, a.sz, a);
        });
      }
      break;
    }
    case 'spiral': {
      let acc = 0, ang = b.angle;
      b.channel = { k: 'spiral', until: now + a.dur, slow: true, tick: dt => {
        acc += dt * a.rate;
        ang += (a.turn || 60) * DEG * dt;
        while (acc >= 1) { acc -= 1; for (let i = 0; i < a.arms; i++) bossBullet(world, b, ang + i * Math.PI * 2 / a.arms, a.sp, a.dm, a.sz, a); }
      } };
      break;
    }
    case 'aimed': {
      if (!tg) break;
      const fire = baseAng => {
        const bursts = a.burst || 1;
        for (let k = 0; k < bursts; k++) world.after(k * (a.gap || 0.15), () => {
          if (b.dead) return;
          const n = a.n;
          for (let i = 0; i < n; i++) {
            const spread = (a.spread || 0) * DEG;
            const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread;
            bossBullet(world, b, baseAng + off, a.sp, a.dm, a.sz, a);
          }
        });
      };
      const ang = leadAngle(b.x, b.y, tg, a.sp);
      if (a.tele) {
        world.addHazard(HAZ.WARN_LINE, b.x, b.y, { ang, len: Math.min(1400, a.sp * 2), dur: a.tele, follow: b.id, w: a.sz || 14 });
        world.after(a.tele, () => { if (!b.dead) fire(ang); });
      } else if ((a.spread || 0) >= 360) {
        for (let i = 0; i < a.n; i++) bossBullet(world, b, i * Math.PI * 2 / a.n + now, a.sp, a.dm, a.sz, a);
      } else fire(ang);
      break;
    }
    case 'zones': {
      const pts = [];
      for (const t of targetsOf(world, b, a.n)) pts.push({ x: t.x + world.rng.range(-50, 50), y: t.y + world.rng.range(-50, 50) });
      while (pts.length < a.n) { const p = world.floorNear(b.x, b.y, 150, 650); if (!p) break; pts.push(p); }
      for (const p of pts) warnCircle(world, b, p.x, p.y, a.r, a.delay, () => {
        for (const t of tanksNear(world, p.x, p.y, a.r)) world.damage(t, a.dm, b, {});
        world.addFx('boom', Math.round(p.x), Math.round(p.y), a.r);
        if (a.field) world.addHazard(HAZ.FIELD, p.x, p.y, { r: a.r * 0.8, dur: a.field, dps: 32, src: b.id });
      });
      break;
    }
    case 'charge': {
      if (!tg) break;
      const dir = Math.atan2(tg.y - b.y, tg.x - b.x);
      world.addHazard(HAZ.WARN_LINE, b.x, b.y, { ang: dir, len: a.sp * a.dur + b.r, dur: a.tele, w: b.r, follow: b.id });
      b.channel = { k: 'charge', until: now + a.tele + a.dur, slow: true };
      world.after(a.tele, () => { if (!b.dead) b.charging = { until: world.time + a.dur, dir, sp: a.sp, dm: a.dm, hit: new Set() }; });
      break;
    }
    case 'summon': {
      let have = 0;
      for (const id of b.mobs) { const m = world.get(id); if (m && m.kind === a.mob) have++; }
      const count = Math.min(Math.round(a.n * scale), (a.max || 10) * (b.def.largeScale ? scale : 1) - have);
      for (let i = 0; i < count; i++) {
        const pos = world.floorNear(b.x, b.y, b.r + 30, b.r + 200) || { x: b.x, y: b.y };
        const m = world.addMob(a.mob, pos.x, pos.y, { team: TEAM.BOSS, leaderId: b.id, slot: b.mobs.size, bossRef: b.id, force: a.mob === 'swarmling' && have + i < (b.def.swarmCap || 60) });
        if (m) b.mobs.add(m.id);
      }
      if (count > 0) world.addFx('summon', Math.round(b.x), Math.round(b.y), count);
      break;
    }
    case 'laser': {
      const base = tg ? Math.atan2(tg.y - b.y, tg.x - b.x) : b.angle;
      const turn = a.turn * DEG * (world.rng.chance(0.5) ? 1 : -1);
      for (let i = 0; i < a.arms; i++) {
        const ang = base + i * Math.PI * 2 / a.arms;
        world.addHazard(HAZ.WARN_LINE, b.x, b.y, { ang, len: a.len, dur: a.tele, follow: b.id, w: 22 });
        world.after(a.tele, () => { if (!b.dead) world.addHazard(HAZ.LASER, b.x, b.y, { ang, len: a.len, maxLen: a.len, turn, dur: a.dur, dps: a.dps, follow: b.id, src: b.id, w: 22 }); });
      }
      b.channel = { k: 'laser', until: now + a.tele + a.dur, slow: true };
      break;
    }
    case 'shock': {
      world.addHazard(HAZ.WARN_CIRCLE, b.x, b.y, { r: b.r + 50, dur: a.tele, follow: b.id, ring: 1 });
      world.after(a.tele, () => {
        if (b.dead) return;
        const dur = (a.max - b.r) / a.sp;
        world.addHazard(HAZ.SHOCK, b.x, b.y, { r: b.r, r0: b.r, maxR: a.max, dur, dm: a.dm, chill: a.chill || 0, src: b.id });
      });
      break;
    }
    case 'mines':
      for (let i = 0; i < a.n; i++) {
        const ang = world.rng.range(0, Math.PI * 2);
        world.addBullet({ kind: 'trap', x: b.x, y: b.y, vx: Math.cos(ang) * 520, vy: Math.sin(ang) * 520, r: 14, dmg: a.dm, hp: 60, life: 10, team: TEAM.BOSS, ownerId: b.id, fx: { explode: 0.8 } });
      }
      break;
    case 'teleport': {
      let pos = null;
      if (a.behind && tg) {
        const back = tg.angle + Math.PI;
        const px = tg.x + Math.cos(back) * (b.r + 200), py = tg.y + Math.sin(back) * (b.r + 200);
        if (!world.solidAt(px, py) && world.clearAround(Math.floor(px / TILE), Math.floor(py / TILE), 1)) pos = { x: px, y: py };
      }
      if (!pos) pos = world.floorNear(tg ? tg.x : b.x, tg ? tg.y : b.y, a.range * 0.45, a.range);
      if (!pos) break;
      if (tanksNear(world, pos.x, pos.y, b.r + 140).length) {
        pos = world.floorNear(b.x, b.y, 200, a.range);
        if (!pos || tanksNear(world, pos.x, pos.y, b.r + 140).length) break;
      }
      world.addHazard(HAZ.PORTAL, pos.x, pos.y, { r: b.r, dur: a.tele });
      warnCircle(world, b, pos.x, pos.y, b.r, a.tele, () => {
        if (tanksNear(world, pos.x, pos.y, b.r + 30).length) return;
        world.addFx('tele', Math.round(b.x), Math.round(b.y), Math.round(pos.x), Math.round(pos.y));
        b.x = pos.x; b.y = pos.y; b.vx = 0; b.vy = 0;
        if (b.def.move === 'teleport' || b.def.move === 'anchor') b.home = { x: pos.x, y: pos.y };
      });
      break;
    }
    case 'shield': case 'plating':
      b.armorOverride = a.armor; b.armorUntil = now + a.dur; b.plating = a.k === 'plating';
      if (a.regen) b.regen = { rate: a.regen * b.maxHp / a.dur, until: now + a.dur };
      world.addFx('shield', b.id, Math.round(a.dur * 10));
      break;
    case 'gravity': {
      const p = tg ? { x: tg.x, y: tg.y } : { x: b.x, y: b.y };
      warnCircle(world, b, p.x, p.y, a.r, a.tele, () => world.addHazard(HAZ.GRAVITY, p.x, p.y, { r: a.r, dur: a.dur, pull: a.str }));
      break;
    }
    case 'walls': {
      if (!tg) break;
      const dir = Math.atan2(tg.y - b.y, tg.x - b.x);
      const d = Math.min(Math.hypot(tg.x - b.x, tg.y - b.y) * 0.6, 420);
      const cx = b.x + Math.cos(dir) * d, cy = b.y + Math.sin(dir) * d;
      const px = -Math.sin(dir), py = Math.cos(dir);
      const len = a.len * TILE;
      world.addHazard(HAZ.WARN_LINE, cx - px * len / 2, cy - py * len / 2, { ang: Math.atan2(py, px), len, dur: a.tele, w: TILE / 2, barrier: 1 });
      world.after(a.tele, () => {
        if (b.dead) return;
        for (let k = 0; k < a.len; k++) {
          const x = cx + px * (k - a.len / 2 + 0.5) * TILE, y = cy + py * (k - a.len / 2 + 0.5) * TILE;
          const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
          if (tx <= 0 || ty <= 0 || tx >= world.w - 1 || ty >= world.h - 1) continue;
          world.placeTempTile(ty * world.w + tx, a.tile || TILES.TEMP, a.dur);
        }
      });
      break;
    }
    case 'remote': {
      const pts = targetsOf(world, b, a.n).map(t => { const ang = world.rng.range(0, Math.PI * 2); return { x: t.x + Math.cos(ang) * 200, y: t.y + Math.sin(ang) * 200 }; });
      for (const p of pts) {
        world.addHazard(HAZ.PORTAL, p.x, p.y, { r: 40, dur: a.tele + 0.6 });
        world.after(a.tele, () => { if (!b.dead) for (let i = 0; i < a.ringN; i++) bossBullet(world, b, i * Math.PI * 2 / a.ringN, a.sp, a.dm, 10, {}, p.x, p.y); });
      }
      break;
    }
    case 'regen':
      b.regen = { rate: a.frac * b.maxHp / a.dur, until: now + a.dur };
      world.addFx('heal', Math.round(b.x), Math.round(b.y));
      break;
    case 'trail': b.trailUntil = now + a.dur; break;
    case 'bolt': {
      for (const t of targetsOf(world, b, a.n)) {
        const p = { x: t.x, y: t.y };
        warnCircle(world, b, p.x, p.y, 75, a.tele, () => {
          world.addFx('bolt', Math.round(p.x), Math.round(p.y));
          const hit = tanksNear(world, p.x, p.y, 75 + 20);
          const pseudo = { type: 'bullet', team: TEAM.BOSS, ownerId: b.id, fx: {}, dmg: a.dm, x: p.x, y: p.y };
          for (const h of hit) { world.damage(h, a.dm, b, {}); if (a.chain) chainFrom(world, pseudo, h, a.chain); }
        });
      }
      break;
    }
    case 'mirror':
      b.mirrorUntil = now + a.dur;
      b.channel = { k: 'mirror', until: now + a.dur, slow: true };
      break;
    case 'corrupt': {
      let n = 0;
      for (const e of world.ents) {
        if (e.dead || Math.hypot(e.x - b.x, e.y - b.y) > a.r) continue;
        if ((e.type === 'struct' && e.kind === 'turret') || (e.type === 'mob' && e.team >= 0)) {
          if (e.team !== TEAM.BOSS) { e.origTeam = e.origTeam !== undefined ? e.origTeam : e.team; e.team = TEAM.BOSS; e.status.corruptUntil = now + a.dur; n++; }
        } else if (e.type === 'shape' && n < 10 && world.rng.chance(0.3)) {
          world.remove(e);
          const m = world.addMob('crasher', e.x, e.y, { team: TEAM.BOSS, bossRef: b.id });
          if (m) b.mobs.add(m.id);
          n++;
        }
      }
      world.emit({ k: 'announce', text: `${b.def.name} corrupts the surrounding structures`, tone: 'bad' });
      world.addFx('emp', Math.round(b.x), Math.round(b.y), Math.round(a.r));
      break;
    }
    case 'envOff':
      world.global.envOffUntil = now + a.dur;
      world.emit({ k: 'announce', text: 'Environmental systems offline', tone: 'bad' });
      break;
    case 'convert': {
      let n = 0;
      world.queryRadius(b.x, b.y, a.r, e => {
        if (e.type !== 'bullet' || e.team < 0 || e.kind === 'drone' || e.kind === 'minion' || n > 40) return;
        const o = world.get(e.ownerId);
        e.team = TEAM.BOSS; e.ownerId = b.id; e.fx = {}; e.hits = null;
        if (o) { const ang = Math.atan2(o.y - e.y, o.x - e.x); const sp = Math.hypot(e.vx, e.vy); e.vx = Math.cos(ang) * sp; e.vy = Math.sin(ang) * sp; }
        e.expire = world.time + 1.5;
        n++;
      });
      world.addFx('emp', Math.round(b.x), Math.round(b.y), Math.round(a.r));
      break;
    }
    case 'doors': {
      const near = world.map.doors.filter(d => d.tiles.some(i => Math.hypot((i % world.w + 0.5) * TILE - b.x, (((i / world.w) | 0) + 0.5) * TILE - b.y) < 1500));
      if (near.length) {
        for (const d of near) for (const idx of d.tiles) {
          if (world.tiles[idx] === TILES.DOOR_OPEN) {
            const tx = (idx % world.w + 0.5) * TILE, ty = (((idx / world.w) | 0) + 0.5) * TILE;
            if (tanksNear(world, tx, ty, TILE).length) continue;
            world.tileTemp.set(idx, { until: now + 4, orig: TILES.DOOR_OPEN });
            world.setTile(idx, TILES.DOOR);
          }
        }
        world.emit({ k: 'announce', text: 'The Clockwork Tyrant seals the doors', tone: 'warn' });
      } else if (tg) {
        for (let k = 0; k < 4; k++) {
          const ang = k * Math.PI / 2 + Math.PI / 4;
          const cx = tg.x + Math.cos(ang) * TILE * 2.2, cy = tg.y + Math.sin(ang) * TILE * 2.2;
          world.addHazard(HAZ.WARN_CIRCLE, cx, cy, { r: TILE * 0.6, dur: 1.2 });
          world.after(1.2, () => { const tx = Math.floor(cx / TILE), ty = Math.floor(cy / TILE); if (tx > 0 && ty > 0 && tx < world.w - 1 && ty < world.h - 1) world.placeTempTile(ty * world.w + tx, TILES.TEMP, 6); });
        }
      }
      break;
    }
    case 'formation':
      b.formation = { shape: a.shape, until: now + a.dur, start: now, tx: tg ? tg.x : b.x, ty: tg ? tg.y : b.y };
      break;
    case 'darkness':
      world.global.darkness = { until: now + a.dur, x: b.x, y: b.y, r: a.r, bossId: b.id };
      world.emit({ k: 'announce', text: 'Darkness falls around the Lantern', tone: 'warn' });
      break;
    case 'vines': {
      const tgs = targetsOf(world, b, 3);
      let placed = 0;
      for (const t of tgs) {
        for (let k = 0; k < Math.ceil(a.n / Math.max(1, tgs.length)); k++) {
          const ang = world.rng.range(0, Math.PI * 2), d = world.rng.range(TILE * 1.5, TILE * 3.5);
          const x = t.x + Math.cos(ang) * d, y = t.y + Math.sin(ang) * d;
          const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
          if (tx <= 0 || ty <= 0 || tx >= world.w - 1 || ty >= world.h - 1) continue;
          world.addHazard(HAZ.WARN_CIRCLE, (tx + 0.5) * TILE, (ty + 0.5) * TILE, { r: TILE * 0.5, dur: a.tele });
          world.after(a.tele, () => world.placeTempTile(ty * world.w + tx, TILES.VINE, a.dur));
          placed++;
        }
      }
      break;
    }
    default: break;
  }
}

export function bossDamaged(world, target, amount, attacker, opts, src) {
  const now = world.time;
  let boss = target;
  if (target.type === 'part') {
    boss = world.get(target.bossId);
    if (!boss) return 0;
    const spec = target.spec;
    if (now < boss.invulnUntil) return 0;
    let link = target.overload && spec.overloadLink ? spec.overloadLink : (spec.link || 0);
    if (!spec.invulnPart) {
      target.hp -= amount * (opts.siege ? 1.8 : 1);
      target.lastHurt = now;
      if (target.hp <= 0) {
        world.addFx('boom', Math.round(target.x), Math.round(target.y), Math.round(target.r * 2.4));
        for (const d of spec.disables || []) boss.disabled.add(d);
        world.emit({ k: 'bossPart', id: boss.id, name: boss.def.name, part: spec.key });
        if (spec.regrow) { target.down = true; target.regrowAt = now + spec.regrow; }
        else world.remove(target);
      }
    }
    if (link > 0) applyCore(world, boss, amount * link, attacker, opts, src, true);
    trackContrib(world, boss, attacker, amount, src);
    return amount;
  }
  return applyCore(world, boss, amount, attacker, opts, src, false);
}

function trackContrib(world, b, attacker, amount, src) {
  if (!attacker || attacker.type !== 'tank') return;
  b.contrib.set(attacker.pid, (b.contrib.get(attacker.pid) || 0) + amount);
  const drone = src && (src.kind === 'drone' || src.kind === 'minion' || src.kind === 'swarm') ? 1 : 0;
  b.recent.set(attacker.id, { t: world.time, dist: Math.hypot(attacker.x - b.x, attacker.y - b.y), drone });
}

function applyCore(world, b, amount, attacker, opts, src, viaPart) {
  const now = world.time;
  if (now < b.invulnUntil) return 0;
  if (b.mirrorUntil > now && !viaPart && src && src.type === 'bullet' && src.kind === undefined) { world.addFx('reflect', Math.round(b.x), Math.round(b.y)); return 0; }
  const def = b.def, P = def.phases[b.phase];
  let mul = 1;
  const parts = aliveParts(world, b);
  if (parts.some(p => p.spec.shieldsCore)) mul *= 0.05;
  if (P.shieldWhileMinions) {
    for (const id of b.mobs) { const m = world.get(id); if (m && m.kind === P.shieldWhileMinions) { mul *= 0.05; break; } }
  }
  let armor = b.armorUntil > now ? b.armorOverride : (P.armor !== undefined ? P.armor : def.armor);
  if (def.headsExpose) {
    const heads = b.parts.map(id => world.byId.get(id)).filter(p => p && p.spec.heads);
    if (heads.length && heads.every(h => h.down)) { armor = def.headsExpose; mul *= 2; }
  }
  if (viaPart) armor = Math.min(armor, 0.2);
  if (def.frontArmor && src && !viaPart) {
    const dir = Math.atan2(src.y - b.y, src.x - b.x);
    let diff = Math.abs(((dir - b.angle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    if (diff < Math.PI / 3) mul *= 1 - def.frontArmor;
    else if (diff > Math.PI * 2 / 3) mul *= def.rearBonus || 1.4;
  }
  if (opts.disrupt && b.armorUntil > now) armor *= 0.4;
  if (opts.siege) mul *= 1.25;
  if (opts.antiBoss) mul *= 2;
  const dealt = amount * (1 - armor) * mul * (P.vuln || 1);
  b.hp -= dealt;
  b.lastHurt = now;
  trackContrib(world, b, attacker, dealt, src);
  if (b.hp <= 0) world.kill(b, attacker);
  return dealt;
}

function despawnBoss(world, b) {
  world.remove(b);
  for (const id of b.parts) { const p = world.byId.get(id); if (p) world.remove(p); }
  for (const id of b.mobs) { const m = world.get(id); if (m) world.remove(m); }
  if (world.global.darkness && world.global.darkness.bossId === b.id) world.global.darkness = null;
  world.logic.onBossGone(b, false);
}

export function bossKilled(world, b, killerTank) {
  for (const id of b.parts) { const p = world.byId.get(id); if (p) world.remove(p); }
  for (const id of b.mobs) { const m = world.get(id); if (m) { world.addFx('pop', Math.round(m.x), Math.round(m.y), m.r, 3); world.remove(m); } }
  if (world.global.darkness && world.global.darkness.bossId === b.id) world.global.darkness = null;
  world.addFx('bossDeath', Math.round(b.x), Math.round(b.y), Math.round(b.r));
  world.bossesDefeated++;
  let total = 0;
  for (const v of b.contrib.values()) total += v;
  const duration = world.time - b.spawnedAt;
  const rewarded = [];
  for (const [pid, pts] of b.contrib) {
    const share = total > 0 ? pts / total : 0;
    if (share < 0.03) continue;
    const p = world.players.get(pid);
    if (!p) continue;
    const mul = p.bossRewardMul;
    const t = world.tankOf(p);
    if (t) world.giveXp(t, b.def.xp * (b.maxHp / b.def.hp) * (0.35 + 0.65 * share) * mul);
    const cores = Math.max(1, Math.round((share >= 0.15 ? b.def.cores : share >= 0.06 ? Math.ceil(b.def.cores / 2) : 1) * mul));
    p.cores += cores;
    p.bossKills++;
    p.bossRewardMul = Math.max(0.25, p.bossRewardMul * 0.7);
    rewarded.push({ name: p.name, share: Math.round(share * 100), cores });
    world.emit({ k: 'personal', pid, ev: 'boss', boss: b.def.key, cores });
    if (t && !t.hitByBoss.has(b.id) && duration > 25 && share >= 0.05) world.emit({ k: 'personal', pid, ev: 'dodge' });
  }
  for (let i = 0; i < 3; i++) world.addPickup(i === 0 ? 'overcharge' : 'heal', b.x + world.rng.range(-80, 80), b.y + world.rng.range(-80, 80));
  world.emit({ k: 'bossDown', name: b.def.name, idx: b.def.index, by: killerTank ? killerTank.name : null, rewarded: rewarded.sort((p, q) => q.share - p.share).slice(0, 6) });
  world.logic.onBossGone(b, true);
}

export { BOSSES };
