import { TEAM, TILE } from '../constants.js';
import { TANKS } from '../tank-registry.js';
import { BASE } from '../weapon-registry.js';
import { leadAngle, nearestTarget, approachAngle, isTarget } from './combat.js';
import { HAZ } from '../entity-types.js';

const DIFF = {
  easy: { react: 0.7, err: 0.3, fireP: 0.65, dodge: 0.3 },
  normal: { react: 0.4, err: 0.14, fireP: 0.85, dodge: 0.65 },
  hard: { react: 0.22, err: 0.06, fireP: 1, dodge: 0.9 }
};

const BUILDS = {
  ram: [1, 2, 7, 0, 1, 2, 7, 0],
  drone: [5, 6, 3, 4, 7, 1, 0, 5],
  sniper: [5, 4, 3, 6, 7, 1, 5, 4],
  default: [6, 5, 4, 7, 3, 1, 0, 5]
};

function roleOf(def) {
  if (def.smasher || !def.guns.some(g => !g.deco)) return 'ram';
  if (def.role === 'Drones' || def.role === 'Factory') return 'drone';
  if (def.role === 'Sniper' || def.role === 'Artillery' || def.role === 'Energy') return 'sniper';
  return 'default';
}

function preferredRange(def) {
  const r = roleOf(def);
  if (r === 'ram') return 0;
  if (r === 'sniper') return 620;
  if (r === 'drone') return 380;
  if (def.role === 'Traps') return 300;
  return 400;
}

export function updateBot(world, t, dt) {
  const p = t.player;
  const b = p.brain;
  const D = DIFF[b.difficulty] || DIFF.normal;
  const now = world.time;
  const inp = p.input;
  if (!b.seed) { b.seed = (p.pid * 2654435761) >>> 0; b.strafe = 1; b.strafeAt = 0; b.errA = 0; }
  if (!b.nextThink || now >= b.nextThink) {
    b.nextThink = now + 0.25;
    think(world, t, b, D);
  }
  const tg = b.targetId ? world.get(b.targetId) : null;
  let mx = 0, my = 0, aimX = t.x + Math.cos(t.angle) * 200, aimY = t.y + Math.sin(t.angle) * 200, fire = false;
  const hpFrac = t.hp / t.maxHp;
  if (tg) {
    const dx = tg.x - t.x, dy = tg.y - t.y, dist = Math.hypot(dx, dy) || 1;
    const want = preferredRange(t.def);
    const visible = world.los(t.x, t.y, tg.x, tg.y);
    if (now > b.strafeAt) { b.strafe = -b.strafe; b.strafeAt = now + 1.5 + ((b.seed + world.tick) % 30) / 10; }
    if (b.retreat) {
      const a = Math.atan2(-dy, -dx);
      const away = visible ? a : world.pathDir(t.x, t.y, b.homeX || t.x - dx, b.homeY || t.y - dy);
      mx = Math.cos(away); my = Math.sin(away);
    } else if (!visible) {
      const a = world.pathDir(t.x, t.y, tg.x, tg.y);
      mx = Math.cos(a); my = Math.sin(a);
    } else {
      const radial = dist > want + 60 ? 1 : dist < want - 60 ? -1 : 0;
      mx = dx / dist * radial + (-dy / dist) * b.strafe * 0.7;
      my = dy / dist * radial + (dx / dist) * b.strafe * 0.7;
      if (want === 0) { mx = dx / dist; my = dy / dist; }
    }
    if (now - b.errAt > 0.6 || !b.errAt) { b.errAt = now; b.errA = (((b.seed ^ world.tick * 7919) % 1000) / 1000 - 0.5) * 2 * D.err; }
    const g = t.def.guns[0];
    const sp = g ? BASE.speed * g.sp * t.bSpeed : 500;
    const ang = leadAngle(t.x, t.y, tg, sp, b.errA);
    aimX = t.x + Math.cos(ang) * dist; aimY = t.y + Math.sin(ang) * dist;
    const range = 700 * t.fov * (roleOf(t.def) === 'sniper' ? 1.3 : 1);
    fire = visible && dist < range && now >= b.reactAt && ((b.seed + world.tick) % 100) / 100 < D.fireP + 0.1;
    if (fire && world.settings.friendlyFire && allyInLine(world, t, ang, dist)) fire = false;
    if (roleOf(t.def) === 'drone') { fire = visible && dist < 700; }
  } else if (b.goal) {
    const a = world.pathDir(t.x, t.y, b.goal.x, b.goal.y);
    mx = Math.cos(a); my = Math.sin(a);
    if (Math.hypot(b.goal.x - t.x, b.goal.y - t.y) < 120) b.goal = null;
  }
  const dodge = dodgeVector(world, t);
  if (dodge && ((b.seed + world.tick) % 100) / 100 < D.dodge + 0.05) { mx = mx * 0.3 + dodge.x; my = my * 0.3 + dodge.y; }
  inp.mx = mx; inp.my = my;
  inp.ax = aimX - t.x; inp.ay = aimY - t.y;
  inp.fire = fire;
  inp.alt = false;
  inp.ability = shouldUseAbility(world, t, b, tg, hpFrac);
}

function allyInLine(world, t, ang, dist) {
  let blocked = false;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (const e of world.ents) {
    if (e.dead || e.type !== 'tank' || e === t || e.team !== t.team) continue;
    const dx = e.x - t.x, dy = e.y - t.y;
    const along = dx * ca + dy * sa;
    if (along <= 0 || along > dist) continue;
    const perp = Math.abs(-dx * sa + dy * ca);
    if (perp < e.r + 12) { blocked = true; break; }
  }
  return blocked;
}

function dodgeVector(world, t) {
  let vx = 0, vy = 0, any = false;
  for (const h of world.ents) {
    if (h.dead || h.type !== 'hazard' || h.team === t.team) continue;
    if (h.kind === HAZ.WARN_CIRCLE || h.kind === HAZ.FIELD || h.kind === HAZ.BURN) {
      const dx = t.x - h.x, dy = t.y - h.y, d = Math.hypot(dx, dy);
      if (d < h.r + t.r + 20) { vx += dx / (d || 1); vy += dy / (d || 1); any = true; }
    } else if (h.kind === HAZ.WARN_LINE || h.kind === HAZ.LASER) {
      const ca = Math.cos(h.ang), sa = Math.sin(h.ang);
      const dx = t.x - h.x, dy = t.y - h.y;
      const along = dx * ca + dy * sa;
      if (along < 0 || along > h.len) continue;
      const perp = -dx * sa + dy * ca;
      if (Math.abs(perp) < (h.w || 40) + t.r + 30) { const s = perp >= 0 ? 1 : -1; vx += -sa * s; vy += ca * s; any = true; }
    } else if (h.kind === HAZ.SHOCK) {
      const d = Math.hypot(t.x - h.x, t.y - h.y);
      if (Math.abs(d - h.r) < 120) { vx += (t.x - h.x) / (d || 1) * (d > h.r ? 1 : -1); vy += (t.y - h.y) / (d || 1) * (d > h.r ? 1 : -1); any = true; }
    }
  }
  if (!any) return null;
  const m = Math.hypot(vx, vy) || 1;
  return { x: vx / m, y: vy / m };
}

function shouldUseAbility(world, t, b, tg, hpFrac) {
  if (t.abilityCd > world.time) return false;
  const ab = t.def.ability;
  const dist = tg ? Math.hypot(tg.x - t.x, tg.y - t.y) : 9999;
  const hurt = world.time - t.lastHurt < 1.5;
  switch (ab) {
    case 'dash': case 'blink': return (b.retreat && hurt) || (roleOf(t.def) === 'ram' && tg && dist < 500 && dist > 150);
    case 'bubble': case 'shieldAlly': return hurt && hpFrac < 0.6;
    case 'cloak': return !tg && hpFrac < 0.7;
    case 'turret': case 'barrier': return !!tg && dist < 600;
    case 'pulse': return (hurt && hpFrac < 0.7) || (tg && dist < 260);
    case 'rally': case 'overdrive': return !!tg && dist < 650 && hpFrac > 0.5;
    case 'reclaim': return true;
    case 'swap': return !!tg && ((dist < 300) !== t.swapped);
    case 'emp': return hurt && !!tg && dist < 380;
    default: return false;
  }
}

function think(world, t, b, D) {
  const p = t.player;
  const role = roleOf(t.def);
  const build = BUILDS[role];
  let guard = 0;
  while (t.statPts > 0 && guard++ < 50) {
    const s = build[(t.stats.reduce((a, c) => a + c, 0)) % build.length];
    if (!world.upgradeStat(t, s)) {
      const alt = t.stats.findIndex(v => v < 7);
      if (alt < 0 || !world.upgradeStat(t, alt)) break;
    }
  }
  const opts = world.evoOptions(t);
  if (opts.length) {
    const same = opts.filter(i => TANKS[i].family === t.def.family);
    const pool = same.length && ((b.seed >> 3) & 1) ? same : opts;
    world.evolve(t, pool[(b.seed + t.level) % pool.length]);
  }
  const hpFrac = t.hp / t.maxHp;
  if (hpFrac < 0.3) b.retreat = true;
  else if (hpFrac > 0.65) b.retreat = false;
  const range = 1000 * t.fov;
  let best = 0, bestScore = -1e9;
  world.queryRadius(t.x, t.y, range, e => {
    if (!isTarget(e) || !world.hostile(t, e)) return;
    if (e.type === 'tank' && e.status.cloakUntil > world.time && Math.hypot(e.x - t.x, e.y - t.y) > 260) return;
    const d = Math.hypot(e.x - t.x, e.y - t.y);
    let score = -d;
    if (e.type === 'tank') score += 500 + (1 - e.hp / e.maxHp) * 200;
    else if (e.type === 'mob') score += 250;
    else if (e.type === 'boss') score += t.level > 25 ? 300 : -400;
    else if (e.type === 'part') score += t.level > 25 ? 320 : -400;
    else if (e.type === 'struct') score += world.logic.structPriority(t, e);
    else if (e.type === 'shape') score += e.kind === 'pentagon' ? 120 : e.kind === 'alpha' ? (t.level > 30 ? 200 : -300) : 0;
    if (e.type !== 'shape' && !world.los(t.x, t.y, e.x, e.y)) score -= 350;
    for (const a of world.ents) {
      if (a.type === 'tank' && a !== t && a.team === t.team && !a.dead && a.isBot && a.player.brain && a.player.brain.targetId === e.id) { score += 80; break; }
    }
    if (score > bestScore) { bestScore = score; best = e.id; }
  });
  if (best !== b.targetId) { b.targetId = best; b.reactAt = world.time + D.react; }
  if (!best && (!b.goal || world.rng.chance(0.05))) b.goal = world.logic.botGoal(t);
  if (b.retreat) { const home = world.logic.botHome(t); b.homeX = home.x; b.homeY = home.y; }
}

export function updateMob(world, m, dt) {
  const def = m.def;
  const now = world.time;
  if (m.expires && now > m.expires) { world.remove(m); return; }
  if (m.status.stunUntil > now) return;
  if (m.status.corruptUntil && m.status.corruptUntil < now) { m.team = m.origTeam; m.status.corruptUntil = 0; }
  const ai = def.ai;
  const range = def.range || 700;
  if (world.tick % 6 === m.id % 6) {
    const cx = ai === 'guard' ? m.home.x : m.x, cy = ai === 'guard' ? m.home.y : m.y;
    m.targetId = nearestTarget(world, m, cx, cy, ai === 'chase' || ai === 'formation' ? 760 : range, false, ai !== 'formation');
  }
  const tg = m.targetId ? world.get(m.targetId) : null;
  const speed = def.speed * (m.status.chillUntil > now ? 0.6 : 1);
  let dvx = 0, dvy = 0;
  const go = (x, y, s = speed) => {
    const a = world.los(m.x, m.y, x, y) ? Math.atan2(y - m.y, x - m.x) : world.pathDir(m.x, m.y, x, y);
    dvx = Math.cos(a) * s; dvy = Math.sin(a) * s;
  };
  if (ai === 'chase') {
    if (tg) go(tg.x, tg.y);
    else if (Math.hypot(m.home.x - m.x, m.home.y - m.y) > 300) go(m.home.x, m.home.y, speed * 0.5);
    else { m.ai.wa = (m.ai.wa || 0) + world.rng.range(-0.3, 0.3); dvx = Math.cos(m.ai.wa) * speed * 0.25; dvy = Math.sin(m.ai.wa) * speed * 0.25; }
    if (tg) m.angle = Math.atan2(tg.y - m.y, tg.x - m.x);
  } else if (ai === 'turret') {
    if (tg) m.angle = approachAngle(m.angle, leadAngle(m.x, m.y, tg, 480), 5 * dt);
  } else if (ai === 'wander' || ai === 'kite') {
    if (tg) {
      m.angle = approachAngle(m.angle, leadAngle(m.x, m.y, tg, 450), (ai === 'kite' ? 5 : 1.2) * dt);
      if (ai === 'kite') {
        const d = Math.hypot(tg.x - m.x, tg.y - m.y);
        const dir = d > 460 ? 1 : d < 320 ? -1 : 0;
        const a = Math.atan2(tg.y - m.y, tg.x - m.x);
        dvx = (Math.cos(a) * dir - Math.sin(a) * 0.6) * speed;
        dvy = (Math.sin(a) * dir + Math.cos(a) * 0.6) * speed;
      }
    } else {
      m.angle += 0.3 * dt;
      if (Math.hypot(m.home.x - m.x, m.home.y - m.y) > 260) go(m.home.x, m.home.y, speed);
    }
  } else if (ai === 'orbit' || ai === 'guard') {
    const leader = ai === 'guard' ? m.home : world.get(m.leaderId);
    if (!leader) { m.def = { ...def, ai: 'chase' }; return; }
    const a = now * 1.3 + m.slot * 1.7;
    const rad = ai === 'guard' ? 260 : (leader.r || 80) + 120;
    let tx = leader.x + Math.cos(a) * rad, ty = leader.y + Math.sin(a) * rad;
    if (tg && Math.hypot(tg.x - leader.x, tg.y - leader.y) < 600) { tx = tg.x + Math.cos(a) * 180; ty = tg.y + Math.sin(a) * 180; }
    go(tx, ty);
    if (tg) m.angle = approachAngle(m.angle, leadAngle(m.x, m.y, tg, 480), 6 * dt);
  } else if (ai === 'blink') {
    if (tg) {
      m.angle = Math.atan2(tg.y - m.y, tg.x - m.x);
      m.ai.blinkAt = m.ai.blinkAt || now + 3;
      if (now > m.ai.blinkAt) {
        const pos = world.floorNear(tg.x, tg.y, 160, 280);
        if (pos) { world.addFx('tele', Math.round(m.x), Math.round(m.y), Math.round(pos.x), Math.round(pos.y)); m.x = pos.x; m.y = pos.y; }
        m.ai.blinkAt = now + 3.5;
      } else go(tg.x, tg.y, speed * 0.6);
    }
  } else if (ai === 'formation') {
    const q = world.get(m.leaderId);
    if (!q) { m.def = { ...def, ai: 'chase' }; return; }
    const f = q.formation && q.formation.until > now ? q.formation : null;
    const n = Math.max(1, q.swarmCount || 1);
    const k = m.slot % n;
    let tx, ty;
    if (f && f.shape === 'ring') {
      const a = (k / n) * Math.PI * 2 + now * 0.8;
      tx = q.x + Math.cos(a) * (q.r + 160); ty = q.y + Math.sin(a) * (q.r + 160);
    } else if (f && f.shape === 'wedge' && f.tx !== undefined) {
      const row = Math.floor(Math.sqrt(k)), col = k - row * row - row;
      const dir = Math.atan2(f.ty - q.y, f.tx - q.x);
      const prog = Math.min(1, (now - f.start) / 2.2);
      const cx = q.x + (f.tx - q.x) * prog * 1.2, cy = q.y + (f.ty - q.y) * prog * 1.2;
      tx = cx - Math.cos(dir) * row * 34 - Math.sin(dir) * col * 30;
      ty = cy - Math.sin(dir) * row * 34 + Math.cos(dir) * col * 30;
    } else if (f && f.shape === 'spiral') {
      const a = k * 0.5 + now * 1.6;
      const rad = q.r + 40 + (k % 40) * 9 * (0.5 + 0.5 * Math.sin(now * 1.5));
      tx = q.x + Math.cos(a) * rad; ty = q.y + Math.sin(a) * rad;
    } else if (tg && Math.hypot(tg.x - q.x, tg.y - q.y) < 520) {
      tx = tg.x; ty = tg.y;
    } else {
      const a = k * 2.399 + now * 0.4;
      const rad = q.r + 60 + (k % 7) * 22;
      tx = q.x + Math.cos(a) * rad; ty = q.y + Math.sin(a) * rad;
    }
    const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy) || 1;
    const s = Math.min(speed, d * 4);
    dvx = dx / d * s; dvy = dy / d * s;
    m.angle = Math.atan2(dvy, dvx);
  }
  const f = Math.min(1, 6 * dt);
  m.vx += (dvx - m.vx) * f;
  m.vy += (dvy - m.vy) * f;
  if (def.speed === 0) { m.vx = 0; m.vy = 0; }
}

export { roleOf };
