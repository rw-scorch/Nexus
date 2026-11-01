import { TILE, TEAM, TILES, isSolidTile } from '../constants.js';
import { BASE } from '../weapon-registry.js';

const DEG = Math.PI / 180;
const RESIST = { tank: 10, shape: 6, mob: 9, boss: 999, part: 999, struct: 999 };

export function gunStatsFor(e) {
  if (e.type === 'tank') return { R: e.r, bSpeed: e.bSpeed, bPen: e.bPen, bDmg: e.bDmg, team: e.team, ownerId: e.id, fov: e.fov };
  return { R: e.r, bSpeed: 0.85, bPen: 1, bDmg: e.dmgMul || 1, team: e.team, ownerId: e.id, fov: 1 };
}

export function fireGun(world, owner, g, gi, ang, sx, sy, st) {
  const rng = world.rng;
  if (g.k === 'beam') return fireBeam(world, owner, g, ang, sx, sy, st);
  for (let p = 0; p < g.n; p++) {
    const a = ang + rng.range(-g.s, g.s) * (g.n > 1 ? 1 : 0.6);
    const ca = Math.cos(a), sa = Math.sin(a);
    const kind = g.k;
    let speed = BASE.speed * g.sp * st.bSpeed;
    let life = BASE.life * g.lf;
    let r = st.R * g.w * g.sz;
    let hp = BASE.pen * g.pn * st.bPen;
    let dmg = BASE.damage * g.dm * st.bDmg;
    if (kind === 'drone' || kind === 'minion') { speed = 330 * Math.min(1.6, g.sp * st.bSpeed); life = 1e9; r = st.R * g.w * 0.72; hp *= 2.6; }
    else if (kind === 'trap') { speed *= 0.95; life = 7 * g.lf; r = st.R * g.w * 0.85 * g.sz; hp *= 2.2; }
    else if (kind === 'swarm') { speed = 380 * g.sp * st.bSpeed; life = 3.2 * g.lf; r = st.R * g.w * 0.62; hp *= 1.2; }
    else if (kind === 'shell') { speed *= 0.9; life = 2.2 * g.lf; r = st.R * g.w * 0.9; hp *= 1.4; }
    if (g.n > 1) { r *= 0.7; }
    const inherit = kind === 'trap' ? 0.1 : 0.25;
    world.addBullet({
      kind, x: sx + ca * 2, y: sy + sa * 2, vx: ca * speed + (owner.vx || 0) * inherit, vy: sa * speed + (owner.vy || 0) * inherit,
      r: Math.max(3, r), dmg, hp, life, team: st.team, ownerId: st.ownerId, fx: g.fx, gunIdx: gi, maxSpeed: speed, angle: a,
      minionGun: kind === 'minion' ? { cd: 0.6, dmg: dmg * 0.6 } : null, chill: g.chill || 0, trail: owner.player && owner.player.cos ? owner.player.cos.trail : 0
    });
  }
  return true;
}

function fireBeam(world, owner, g, ang, sx, sy, st) {
  const L = 650 * g.sp * st.bSpeed;
  const dmg = BASE.damage * g.dm * st.bDmg * 1.25;
  if (g.fx.home) {
    let best = null, bestA = 14 * DEG;
    world.queryRadius(sx, sy, L, e => {
      if (!isTarget(e) || !world.hostile(owner, e)) return;
      const da = Math.abs(wrap(Math.atan2(e.y - sy, e.x - sx) - ang));
      if (da < bestA) { bestA = da; best = e; }
    });
    if (best) ang = Math.atan2(best.y - sy, best.x - sx);
  }
  const segs = [];
  let x = sx, y = sy, a = ang, left = L, bounces = g.fx.bounce ? 1 : 0;
  let endWallIdx = -1;
  while (left > 0) {
    let cx = Math.cos(a), cy = Math.sin(a);
    let d = 0, hitWall = false, px = x, py = y;
    for (; d < left; d += 8) {
      const nx = x + cx * d, ny = y + cy * d;
      if (world.solidAt(nx, ny)) {
        hitWall = true;
        endWallIdx = Math.floor(ny / TILE) * world.w + Math.floor(nx / TILE);
        break;
      }
      px = nx; py = ny;
    }
    segs.push([x, y, px, py]);
    left -= d;
    if (!hitWall) break;
    if (bounces-- <= 0) break;
    const ptx = Math.floor(px / TILE), pty = Math.floor(py / TILE);
    const nx = x + cx * d, ny = y + cy * d;
    if (Math.floor(nx / TILE) !== ptx) cx = -cx;
    if (Math.floor(ny / TILE) !== pty) cy = -cy;
    a = Math.atan2(cy, cx);
    x = px; y = py;
    endWallIdx = -1;
  }
  const maxHits = g.fx.pierce ? 3 + g.fx.pierce : 1;
  const hits = [];
  let acc = 0;
  for (const [x0, y0, x1, y1] of segs) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, half = Math.hypot(x1 - x0, y1 - y0) / 2;
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
    world.queryRadius(mx, my, half + 30, e => {
      if (!isTarget(e) || e.id === owner.id) return;
      const ally = !world.hostile(owner, e);
      if (ally && !(g.fx.heal && (e.type === 'tank' || e.type === 'struct'))) return;
      if (e.type === 'shape' && owner.team < 0) return;
      const t = Math.max(0, Math.min(1, ((e.x - x0) * dx + (e.y - y0) * dy) / L2));
      const qx = x0 + dx * t, qy = y0 + dy * t;
      if (Math.hypot(e.x - qx, e.y - qy) < e.r + 6) hits.push({ e, d: acc + t * Math.sqrt(L2), x: qx, y: qy, ally });
    });
    acc += Math.sqrt(L2);
  }
  hits.sort((p, q) => p.d - q.d);
  const used = hits.slice(0, maxHits);
  let endX = segs[segs.length - 1][2], endY = segs[segs.length - 1][3];
  if (used.length && used.length >= maxHits) {
    const last = used[used.length - 1];
    endX = last.x; endY = last.y;
    let cut = last.d, run = 0;
    const out = [];
    for (const s of segs) {
      const sl = Math.hypot(s[2] - s[0], s[3] - s[1]);
      if (run + sl >= cut) { const f = (cut - run) / (sl || 1); out.push([s[0], s[1], s[0] + (s[2] - s[0]) * f, s[1] + (s[3] - s[1]) * f]); break; }
      out.push(s); run += sl;
    }
    segs.length = 0; segs.push(...out);
  }
  const pseudo = { type: 'bullet', team: st.team, ownerId: st.ownerId, fx: g.fx, dmg, x: endX, y: endY, r: 6, vx: 0, vy: 0 };
  for (const h of used) {
    if (h.ally) { world.heal(h.e, dmg * (g.fx.heal || 1), owner); continue; }
    world.damage(h.e, dmg, pseudo, { siege: g.fx.siege, disrupt: g.fx.disrupt });
    if (g.fx.pull) pullToward(h.e, owner, 220);
    if (g.fx.chain) chainFrom(world, pseudo, h.e, g.fx.chain);
  }
  if (endWallIdx >= 0 && !used.length) world.damageTile(endWallIdx, dmg * (g.fx.siege ? 3 : 1));
  if (g.fx.explode) explodeAt(world, endX, endY, 60 * g.fx.explode, dmg * 0.9, pseudo, { siege: g.fx.siege });
  if (g.fx.split) splitAt(world, pseudo, endX, endY, g.fx.split, st.R * 0.25);
  world.addFx('beam', segs.flat().map(v => Math.round(v)), st.team, g.fx.heal ? 1 : 0);
  return true;
}

function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

export function isTarget(e) {
  return e.type === 'tank' || e.type === 'shape' || e.type === 'mob' || e.type === 'boss' || e.type === 'part' || e.type === 'struct';
}

function updateTurrets(world, t, dt, rot) {
  const d = t.def;
  if (!d.turrets.length) return;
  if (!t.turAng || t.turAng.length !== d.turrets.length) { t.turAng = d.turrets.map(u => rot + u.a * DEG); t.turTgt = d.turrets.map(() => 0); t.turOn = d.turrets.map(() => false); }
  const ca = Math.cos(rot), sa = Math.sin(rot);
  for (let i = 0; i < d.turrets.length; i++) {
    const u = d.turrets[i];
    const cx = t.x + (u.x * ca - u.y * sa) * t.r, cy = t.y + (u.x * sa + u.y * ca) * t.r;
    const baseA = rot + u.a * DEG;
    if (world.tick % 6 === (t.id + i) % 6) {
      const id = nearestTarget(world, t, cx, cy, 640 * t.fov, true);
      const tg = id ? world.get(id) : null;
      t.turTgt[i] = tg && (u.arc >= 360 || Math.abs(wrap(Math.atan2(tg.y - cy, tg.x - cx) - baseA)) <= u.arc * DEG / 2) ? id : 0;
    }
    const tg = t.turTgt[i] ? world.get(t.turTgt[i]) : null;
    if (tg) {
      t.turAng[i] = approachAngle(t.turAng[i], leadAngle(cx, cy, tg, BASE.speed), 9 * dt);
      t.turOn[i] = true;
    } else if (t.firing && u.arc >= 360) {
      t.turAng[i] = approachAngle(t.turAng[i], Math.atan2(t.aimY - cy, t.aimX - cx), 9 * dt);
      t.turOn[i] = true;
    } else {
      t.turAng[i] = approachAngle(t.turAng[i], baseA, 4 * dt);
      t.turOn[i] = false;
    }
    u._cx = cx; u._cy = cy;
  }
}

export function updateTankWeapons(world, t, dt) {
  const d = t.def;
  const guns = t.swapped && d.alt ? d.alt : d.guns;
  if (t.reload.length !== guns.length) world.refreshTank(t);
  const now = world.time, s = t.status;
  let mul = t.bReload;
  if (s.overdriveUntil > now) mul *= 0.5;
  if (s.rallyUntil > now) mul *= 0.7;
  if (s.overchargeUntil > now) mul *= 0.7;
  if (world.global.overchargeUntil > now) mul *= 0.75;
  const st = gunStatsFor(t);
  const rot = t.angle + (d.spin ? d.spin * now : 0);
  updateTurrets(world, t, dt, rot);
  const ca = Math.cos(rot), sa = Math.sin(rot);
  const stunned = s.stunUntil > now;
  let fired = false;
  for (let i = 0; i < guns.length; i++) {
    const g = guns[i];
    if (g.deco) continue;
    const base = BASE.reload * g.r * mul;
    if (g.k === 'drone' || g.k === 'minion') {
      if (t.droneCount[i] < g.max + (t.reclaimBonus && i === firstDroneGun(guns) ? t.reclaimBonus : 0)) {
        t.reload[i] -= dt;
        if (t.reload[i] <= 0) {
          const ang = rot + g.a * DEG;
          const mxp = t.x + (g.x * ca - g.y * sa) * t.r, myp = t.y + (g.x * sa + g.y * ca) * t.r;
          fireGun(world, t, g, i, ang, mxp + Math.cos(ang) * g.len * t.r, myp + Math.sin(ang) * g.len * t.r, st);
          t.droneCount[i]++;
          t.reload[i] = base * 1.6;
        }
      }
      continue;
    }
    let ang, mx, my, shooting;
    if (g.auto && g.t >= 0 && d.turrets[g.t]) {
      const u = d.turrets[g.t];
      const ta = t.turAng[g.t];
      const tc = Math.cos(ta), ts = Math.sin(ta);
      mx = u._cx + (g.x * tc - g.y * ts) * t.r;
      my = u._cy + (g.x * ts + g.y * tc) * t.r;
      ang = ta + g.a * DEG;
      shooting = t.turOn[g.t];
    } else {
      mx = t.x + (g.x * ca - g.y * sa) * t.r;
      my = t.y + (g.x * sa + g.y * ca) * t.r;
      ang = rot + g.a * DEG;
      shooting = t.firing || !!g.af;
    }
    if (shooting && !stunned) {
      t.reload[i] -= dt;
      let guard = 0;
      while (t.reload[i] <= 0 && guard++ < 3) {
        const sx = mx + Math.cos(ang) * g.len * t.r, sy = my + Math.sin(ang) * g.len * t.r;
        if (world.solidAt(sx, sy)) { t.reload[i] += base; break; }
        fireGun(world, t, g, i, ang, sx, sy, st);
        t.reload[i] += base;
        const kick = g.rec * 16 / (t.mass || 1);
        t.vx -= Math.cos(ang) * kick;
        t.vy -= Math.sin(ang) * kick;
        if (!g.auto) { fired = true; world.addFx('muzzle', Math.round(sx), Math.round(sy), t.id); }
      }
    } else {
      t.reload[i] = Math.max(t.reload[i] - dt, g.d * base);
    }
  }
  if (fired) {
    t.lastFire = now;
    t.player.stats.shots++;
    if (s.cloakUntil > now) s.cloakUntil = now + 0.1;
  }
}

function firstDroneGun(guns) {
  for (let i = 0; i < guns.length; i++) if (guns[i].k === 'drone' || guns[i].k === 'minion') return i;
  return -1;
}

export function approachAngle(cur, target, maxStep) {
  const d = wrap(target - cur);
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

export function leadAngle(x, y, tg, speed, err = 0) {
  const dx = tg.x - x, dy = tg.y - y;
  const dist = Math.hypot(dx, dy);
  const t = dist / Math.max(100, speed);
  const px = tg.x + (tg.vx || 0) * t * 0.9, py = tg.y + (tg.vy || 0) * t * 0.9;
  return Math.atan2(py - y, px - x) + err;
}

export function nearestTarget(world, self, x, y, range, includeShapes = false, losCheck = true) {
  let best = null, bd = range * range;
  world.queryRadius(x, y, range, e => {
    if (!isTarget(e) || !world.hostile(self, e)) return;
    if (e.type === 'shape' && !includeShapes) return;
    if (e.type === 'tank' && e.status.cloakUntil > world.time && Math.hypot(e.x - x, e.y - y) > 260) return;
    if (self.team < 0 && (e.type === 'shape' || e.type === 'mob')) return;
    let d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (e.type === 'shape') d *= 2.2;
    if (d < bd && (!losCheck || world.los(x, y, e.x, e.y))) { bd = d; best = e; }
  });
  return best ? best.id : 0;
}

export function updateMobWeapons(world, m, dt) {
  const guns = m.def.guns;
  if (!guns.length || !m.targetId || m.status.stunUntil > world.time) return;
  const tg = world.get(m.targetId);
  if (!tg) return;
  const st = gunStatsFor(m);
  for (let i = 0; i < guns.length; i++) {
    const g = guns[i];
    const base = BASE.reload * g.r * 1.6;
    m.reload[i] -= dt;
    if (m.reload[i] > 0) continue;
    m.reload[i] += base;
    const ang = m.angle + g.a * DEG;
    const sx = m.x + Math.cos(ang) * g.len * m.r, sy = m.y + Math.sin(ang) * g.len * m.r;
    if (world.solidAt(sx, sy)) continue;
    fireGun(world, m, g, i, ang, sx, sy, st);
  }
}

export function structFire(world, s, dt, dmgMul = 1) {
  const guns = s.def.guns || [];
  if (!guns.length || s.status.stunUntil > world.time) return;
  if (world.tick % 5 === s.id % 5) s.targetId = nearestTarget(world, s, s.x, s.y, s.def.range || 800, false, true);
  const tg = s.targetId ? world.get(s.targetId) : null;
  if (!tg) return;
  const g = guns[0];
  s.angle = approachAngle(s.angle, leadAngle(s.x, s.y, tg, BASE.speed * g.sp), 6 * dt);
  s.reload[0] -= dt;
  if (s.reload[0] > 0) return;
  s.reload[0] = BASE.reload * g.r;
  const st = { R: s.r, bSpeed: 1, bPen: 2, bDmg: dmgMul, team: s.team, ownerId: s.id, fov: 1 };
  fireGun(world, s, g, 0, s.angle, s.x + Math.cos(s.angle) * s.r * 1.4, s.y + Math.sin(s.angle) * s.r * 1.4, st);
}

export function updateBullet(world, b, dt) {
  const now = world.time;
  if (now >= b.expire) return bulletDie(world, b, b.x, b.y);
  const owner = b.ownerId ? world.get(b.ownerId) : null;
  const k = b.kind;
  if (k === 'drone' || k === 'minion') {
    if (!owner) return world.remove(b);
    let tx, ty, mode = 'orbit';
    if (owner.type === 'tank') {
      if (owner.firing) { tx = owner.aimX; ty = owner.aimY; mode = 'aim'; }
      else if (owner.altFire) { tx = b.x + (b.x - owner.aimX); ty = b.y + (b.y - owner.aimY); mode = 'repel'; }
    }
    if (mode === 'orbit') {
      if (world.tick % 8 === b.id % 8) b.autoT = nearestTarget(world, owner, owner.x, owner.y, 430, true, false);
      const tg = b.autoT ? world.get(b.autoT) : null;
      if (tg) { tx = tg.x; ty = tg.y; mode = 'hunt'; }
      else {
        const a = now * 1.6 + b.id;
        tx = owner.x + Math.cos(a) * owner.r * 3.2; ty = owner.y + Math.sin(a) * owner.r * 3.2;
      }
    }
    if (k === 'minion' && mode !== 'orbit') {
      const tg = b.autoT ? world.get(b.autoT) : null;
      const aimX = tg ? tg.x : tx, aimY = tg ? tg.y : ty;
      const d = Math.hypot(aimX - b.x, aimY - b.y);
      if (d < 260) { tx = b.x - (aimX - b.x) * 0.3; ty = b.y - (aimY - b.y) * 0.3; }
      b.angle = Math.atan2(aimY - b.y, aimX - b.x);
      b.minionGun.cd -= dt;
      if (b.minionGun.cd <= 0 && d < 520) {
        b.minionGun.cd = 0.75;
        const ca = Math.cos(b.angle), sa = Math.sin(b.angle);
        world.addBullet({ kind: 'bullet', x: b.x + ca * b.r * 1.5, y: b.y + sa * b.r * 1.5, vx: ca * 520, vy: sa * 520, r: b.r * 0.45, dmg: b.minionGun.dmg, hp: 8, life: 1.1, team: b.team, ownerId: b.ownerId, fx: b.fx });
      }
    }
    if (b.fx.orbit && owner.type === 'tank') {
      const rad = owner.r * (mode === 'aim' ? 4.2 : mode === 'repel' ? 1.8 : 2.8);
      const a = now * 2.4 + (b.gunIdx || 0) * 1.7;
      tx = owner.x + Math.cos(a) * rad; ty = owner.y + Math.sin(a) * rad;
    }
    if (b.fx.armed) armedShot(world, b, dt);
    steer(b, tx, ty, b.maxSpeed, dt, b.fx.orbit ? 10 : 7);
    if (k === 'drone') b.angle = Math.atan2(b.vy, b.vx);
    world.collideWalls(b);
    return;
  }
  if (k === 'trap') {
    const f = Math.exp(-3.4 * dt);
    b.vx *= f; b.vy *= f;
    if (b.fx.armed) armedShot(world, b, dt);
  }
  if (b.fx.wave) {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const ph = Math.cos((now - b.born) * 9) * 9 * b.fx.wave * dt;
    const nx = -b.vy / sp, ny = b.vx / sp;
    b.x += nx * ph * 60; b.y += ny * ph * 60;
  }
  if (b.fx.missile && owner) {
    b.mcd = (b.mcd ?? 0.12) - dt;
    if (b.mcd <= 0) {
      b.mcd = b.fx.missile > 1 ? 0.09 : 0.16;
      const base = Math.atan2(b.vy, b.vx);
      const sides = b.fx.missile > 1 ? [base + now * 9] : [base + Math.PI / 2, base - Math.PI / 2];
      for (const a of sides) world.addBullet({ kind: 'bullet', isFrag: true, x: b.x, y: b.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, r: Math.max(3, b.r * 0.45), dmg: b.dmg * 0.18, hp: 4, life: 0.45, team: b.team, ownerId: b.ownerId, fx: {} });
      const back = base + Math.PI;
      b.vx -= Math.cos(back) * 14; b.vy -= Math.sin(back) * 14;
    }
  }
  if (k === 'swarm') {
    if (world.tick % 5 === b.id % 5) b.autoT = nearestTarget(world, b, b.x, b.y, 380, true, false);
    const tg = b.autoT ? world.get(b.autoT) : null;
    if (tg) steer(b, tg.x, tg.y, b.maxSpeed, dt, 5);
    else if (owner && owner.firing && owner.type === 'tank') steer(b, owner.aimX, owner.aimY, b.maxSpeed, dt, 4);
  }
  if (b.fx.home && k !== 'swarm') {
    if (world.tick % 4 === b.id % 4) b.autoT = nearestTarget(world, b, b.x, b.y, 420, true, false);
    const tg = b.autoT ? world.get(b.autoT) : null;
    if (tg) turnToward(b, tg.x, tg.y, 3.2 * b.fx.home * dt);
  }
  if (b.fx.intercept) {
    if (world.tick % 3 === b.id % 3) {
      let best = null, bd = 340 * 340;
      world.queryRadius(b.x, b.y, 340, e => { if (e.type === 'bullet' && world.hostile(b, e)) { const d = (e.x - b.x) ** 2 + (e.y - b.y) ** 2; if (d < bd) { bd = d; best = e; } } });
      b.interceptT = best ? best.id : 0;
    }
    const tg = b.interceptT ? world.get(b.interceptT) : null;
    if (tg) turnToward(b, tg.x, tg.y, 7 * dt);
  }
  if (b.fx.reverse && !b.reversed && now - b.born > b.life / 2) {
    b.reversed = true;
    b.vx = -b.vx; b.vy = -b.vy;
    if (b.hits) b.hits.clear();
  }
  if (b.angle !== undefined && (k === 'swarm' || b.fx.home)) b.angle = Math.atan2(b.vy, b.vx);
}

function armedShot(world, b, dt) {
  b.acd = (b.acd ?? 0.8) - dt;
  if (b.acd > 0) return;
  b.acd = 0.9;
  if (world.tick % 1 !== 0) return;
  const id = nearestTarget(world, b, b.x, b.y, 380, true, false);
  const tg = id ? world.get(id) : null;
  if (!tg) return;
  const a = Math.atan2(tg.y - b.y, tg.x - b.x);
  world.addBullet({ kind: 'bullet', isFrag: true, x: b.x + Math.cos(a) * b.r, y: b.y + Math.sin(a) * b.r, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, r: Math.max(3, b.r * 0.4), dmg: b.dmg * 0.35, hp: 5, life: 0.8, team: b.team, ownerId: b.ownerId, fx: {} });
}

function steer(b, tx, ty, speed, dt, k) {
  const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1;
  const dvx = dx / d * speed, dvy = dy / d * speed;
  const f = Math.min(1, k * dt);
  b.vx += (dvx - b.vx) * f;
  b.vy += (dvy - b.vy) * f;
}

function turnToward(b, tx, ty, maxTurn) {
  const sp = Math.hypot(b.vx, b.vy);
  const cur = Math.atan2(b.vy, b.vx);
  const want = Math.atan2(ty - b.y, tx - b.x);
  const na = approachAngle(cur, want, maxTurn);
  b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
}

export function bulletWall(world, b) {
  if (b.kind === 'drone' || b.kind === 'minion') return;
  const tx = Math.floor(b.x / TILE), ty = Math.floor(b.y / TILE);
  let solid = tx < 0 || ty < 0 || tx >= world.w || ty >= world.h;
  const idx = ty * world.w + tx;
  const tv = solid ? TILES.WALL : world.tiles[idx];
  if (!solid) solid = isSolidTile(tv);
  if (!solid) return;
  if (!(tx < 0 || ty < 0 || tx >= world.w || ty >= world.h)) {
    const tdmg = b.dmg * (b.fx.siege ? 3.5 : 1) * (b.kind === 'shell' ? 1.6 : 1);
    if (world.damageTile(idx, tdmg)) { if (!b.fx.pierce) return bulletDie(world, b, b.x, b.y); return; }
  }
  if (tv === TILES.CRYSTAL || b.bounceLeft > 0) {
    if (tv !== TILES.CRYSTAL) b.bounceLeft--;
    const ptx = Math.floor(b.px / TILE), pty = Math.floor(b.py / TILE);
    let flipped = false;
    if (ptx !== tx) { b.vx = -b.vx; flipped = true; }
    if (pty !== ty) { b.vy = -b.vy; flipped = true; }
    if (!flipped) { b.vx = -b.vx; b.vy = -b.vy; }
    b.x = b.px; b.y = b.py;
    if (b.hits) b.hits.clear();
    if (tv === TILES.CRYSTAL) world.addFx('spark', Math.round(b.x), Math.round(b.y), 1);
    return;
  }
  if (b.kind === 'trap') { b.x = b.px; b.y = b.py; b.vx = 0; b.vy = 0; return; }
  bulletDie(world, b, b.px, b.py);
}

export function bulletDie(world, b, x, y) {
  if (b.dead) return;
  world.remove(b);
  if (b.kind === 'drone' || b.kind === 'minion') {
    const o = world.get(b.ownerId);
    if (o && o.droneCount && o.droneCount[b.gunIdx] > 0) o.droneCount[b.gunIdx]--;
  }
  if (b.fx.explode) explodeAt(world, x, y, (40 + b.r * 2.6) * b.fx.explode, b.dmg * 0.95 * Math.min(2, b.fx.explode), b, { siege: b.fx.siege });
  if (b.fx.split && !b.isFrag) splitAt(world, b, x, y, b.fx.split, b.r * 0.6);
}

export function splitAt(world, b, x, y, n, r) {
  const off = world.rng.range(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const a = off + i * Math.PI * 2 / n;
    world.addBullet({ kind: 'bullet', isFrag: true, x, y, vx: Math.cos(a) * 470, vy: Math.sin(a) * 470, r: Math.max(3, r), dmg: b.dmg * 0.42, hp: 6, life: 0.5, team: b.team, ownerId: b.ownerId, fx: {} });
  }
}

export function explodeAt(world, x, y, r, dmg, src, opts = {}) {
  world.addFx('boom', Math.round(x), Math.round(y), Math.round(r));
  const team = src ? src.team : TEAM.BOSS;
  const pseudo = src && src.type === 'bullet' ? src : { type: 'bullet', team, ownerId: src ? src.id : 0, fx: {}, x, y };
  world.queryRadius(x, y, r, e => {
    if (!isTarget(e) || e.id === pseudo.ownerId) return;
    if (!world.hostile(pseudo, e)) return;
    if (team < 0 && (e.type === 'shape' || e.type === 'mob')) return;
    world.damage(e, dmg, pseudo, { siege: opts.siege, explosion: true });
  });
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE), y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (tx <= 0 || ty <= 0 || tx >= world.w - 1 || ty >= world.h - 1) continue;
    world.damageTile(ty * world.w + tx, dmg * (opts.siege ? 3 : 1.2));
  }
}

export function chainFrom(world, b, from, n) {
  let cur = from;
  const used = new Set([from.id]);
  for (let k = 0; k < n; k++) {
    let best = null, bd = 260 * 260;
    world.queryRadius(cur.x, cur.y, 260, e => {
      if (!isTarget(e) || used.has(e.id) || !world.hostile(b, e)) return;
      if (b.team < 0 && (e.type === 'shape' || e.type === 'mob')) return;
      const d = (e.x - cur.x) ** 2 + (e.y - cur.y) ** 2;
      if (d < bd) { bd = d; best = e; }
    });
    if (!best) return;
    used.add(best.id);
    world.addFx('arc', Math.round(cur.x), Math.round(cur.y), Math.round(best.x), Math.round(best.y));
    world.damage(best, b.dmg * 0.6, b, {});
    cur = best;
  }
}

function pullToward(target, owner, strength) {
  if (!owner || target.static || target.type === 'boss') return;
  const dx = owner.x - target.x, dy = owner.y - target.y, d = Math.hypot(dx, dy) || 1;
  target.vx += dx / d * strength / (target.mass || 1);
  target.vy += dy / d * strength / (target.mass || 1);
}

export function bulletHitTarget(world, b, o, dt) {
  if (b.dead || o.dead) return;
  if (o.type === 'bullet' || o.type === 'hazard') return;
  if (b.fx.heal && o.team === b.team && o.id !== b.ownerId && (o.type === 'tank' || o.type === 'struct') && o.hp < o.maxHp) {
    const owner = world.get(b.ownerId);
    world.heal(o, b.dmg * b.fx.heal, owner);
    return bulletDie(world, b, b.x, b.y);
  }
  if (!world.hostile(b, o)) return;
  if (b.team < 0 && (o.type === 'shape' || o.type === 'mob')) return;
  if ((o.type === 'boss' || o.type === 'part') && b.team < 0) return;
  if (b.hits) { if (b.hits.has(o.id)) return; b.hits.add(o.id); }
  if (o.type === 'boss' && o.mirrorUntil > world.time && b.kind !== 'drone' && b.kind !== 'minion') {
    b.team = TEAM.BOSS; b.ownerId = o.id; b.vx = -b.vx * 1.1; b.vy = -b.vy * 1.1; b.fx = {}; b.hits = null;
    b.expire = world.time + 1.5;
    world.addFx('reflect', Math.round(b.x), Math.round(b.y));
    return;
  }
  const dmg = b.kind === 'drone' || b.kind === 'minion' ? b.dmg * 1.2 : b.dmg;
  world.damage(o, dmg, b, { siege: b.fx.siege, disrupt: b.fx.disrupt, antiBoss: b.antiBoss });
  world.addFx('hit', Math.round(b.x), Math.round(b.y), o.type === 'tank' ? 1 : 0);
  if (!o.static && o.type !== 'boss') {
    const m = o.mass || 1;
    o.vx += b.vx * 0.012 * (b.r / 8) / m;
    o.vy += b.vy * 0.012 * (b.r / 8) / m;
  }
  if (b.fx.pull) pullToward(o, world.get(b.ownerId), 260);
  if (b.chill && o.type === 'tank') o.status.chillUntil = world.time + b.chill;
  if (b.fx.chain && !b.isFrag) chainFrom(world, b, o, b.fx.chain);
  if (b.pierceLeft !== undefined) {
    b.pierceLeft--;
    if (b.pierceLeft <= 0) bulletDie(world, b, b.x, b.y);
    return;
  }
  b.hp -= (RESIST[o.type] || 9) * (o.type === 'tank' ? Math.max(0.6, o.bodyDmg) : 1);
  if (b.hp <= 0) bulletDie(world, b, b.x, b.y);
}

export function bulletVsBullet(world, a, b) {
  if (!world.hostile(a, b)) return;
  const intercept = a.fx.intercept || b.fx.intercept;
  if (!intercept && (a.team < 0 || b.team < 0)) return;
  const ma = b.fx.intercept ? 3 : 0.6, mb = a.fx.intercept ? 3 : 0.6;
  const da = b.dmg * ma, db = a.dmg * mb;
  a.hp -= da; b.hp -= db;
  if (a.hp <= 0) bulletDie(world, a, a.x, a.y);
  if (b.hp <= 0) bulletDie(world, b, b.x, b.y);
}
