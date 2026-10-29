import { TILE, TILES, isSolidTile } from '../constants.js';
import { ABILITIES } from '../tank-registry.js';

export function updateAbilities(world, t, dt) {
  const s = t.status;
  if (s.dashUntil > world.time) {
    const d = s.dashDir;
    t.vx = Math.cos(d) * t.maxSpeed * 3.2;
    t.vy = Math.sin(d) * t.maxSpeed * 3.2;
  }
}

function alliesNear(world, t, r, includeSelf = true) {
  const out = [];
  for (const e of world.ents) {
    if (e.dead || e.type !== 'tank' || e.team !== t.team) continue;
    if (e === t && !includeSelf) continue;
    if (Math.hypot(e.x - t.x, e.y - t.y) <= r) out.push(e);
  }
  return out;
}

export function useAbility(world, t) {
  const key = t.def.ability;
  const ab = ABILITIES[key];
  if (!ab || key === 'none' || t.abilityCd > world.time) return false;
  const now = world.time, s = t.status, inp = t.player.input;
  let ok = true;
  switch (key) {
    case 'dash': {
      const m = Math.hypot(inp.mx, inp.my);
      s.dashDir = m > 0.1 ? Math.atan2(inp.my, inp.mx) : t.angle;
      s.dashUntil = now + ab.dur;
      world.addFx('dash', Math.round(t.x), Math.round(t.y), t.id);
      break;
    }
    case 'blink': {
      const ang = Math.atan2(inp.ay, inp.ax);
      const want = Math.min(380, Math.hypot(inp.ax, inp.ay));
      let d = 0;
      for (; d < want; d += 8) if (world.solidAt(t.x + Math.cos(ang) * (d + t.r), t.y + Math.sin(ang) * (d + t.r))) break;
      d = Math.max(0, d - 6);
      if (d < 30) { ok = false; break; }
      const nx = t.x + Math.cos(ang) * d, ny = t.y + Math.sin(ang) * d;
      world.addFx('tele', Math.round(t.x), Math.round(t.y), Math.round(nx), Math.round(ny));
      t.x = nx; t.y = ny;
      break;
    }
    case 'bubble': s.bubbleUntil = now + ab.dur; break;
    case 'cloak': s.cloakUntil = now + ab.dur; break;
    case 'turret': {
      const pos = { x: t.x + Math.cos(t.angle) * (t.r + 40), y: t.y + Math.sin(t.angle) * (t.r + 40) };
      if (world.solidAt(pos.x, pos.y)) { pos.x = t.x; pos.y = t.y; }
      const mine = world.ents.filter(e => !e.dead && e.type === 'mob' && e.ownerId === t.id && e.kind === 'playerTurret');
      if (mine.length >= 2) world.remove(mine[0]);
      world.addMob('playerTurret', pos.x, pos.y, { team: t.team, ownerId: t.id, life: ab.dur, dmgMul: t.bDmg, scale: 1 + t.level / 45, force: true });
      break;
    }
    case 'barrier': {
      const dist = t.r + TILE * 1.4;
      const cx = t.x + Math.cos(t.angle) * dist, cy = t.y + Math.sin(t.angle) * dist;
      const px = -Math.sin(t.angle), py = Math.cos(t.angle);
      let placed = 0;
      for (let k = -2; k <= 2; k++) {
        const x = cx + px * k * TILE * 0.9, y = cy + py * k * TILE * 0.9;
        const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
        if (tx <= 0 || ty <= 0 || tx >= world.w - 1 || ty >= world.h - 1) continue;
        if (world.placeTempTile(ty * world.w + tx, TILES.TEMP, ab.dur)) placed++;
      }
      ok = placed > 0;
      break;
    }
    case 'pulse': {
      for (const a of alliesNear(world, t, 320)) world.heal(a, a.maxHp * 0.22, t);
      world.queryRadius(t.x, t.y, 320, e => { if ((e.type === 'tank' || e.type === 'mob') && world.hostile(t, e)) world.damage(e, 28 * t.bDmg, t, {}); });
      world.addFx('pulse', Math.round(t.x), Math.round(t.y), 320);
      break;
    }
    case 'shieldAlly':
      for (const a of alliesNear(world, t, 360)) a.status.bubbleUntil = now + ab.dur;
      world.addFx('pulse', Math.round(t.x), Math.round(t.y), 360);
      for (const b of world.ents) if (b.type === 'boss' && !b.dead && Math.hypot(b.x - t.x, b.y - t.y) < 1400) b.contrib.set(t.pid, (b.contrib.get(t.pid) || 0) + 300);
      break;
    case 'rally':
      for (const a of alliesNear(world, t, 420)) a.status.rallyUntil = now + ab.dur;
      world.addFx('pulse', Math.round(t.x), Math.round(t.y), 420);
      break;
    case 'overdrive': s.overdriveUntil = now + ab.dur; break;
    case 'reclaim': {
      const guns = t.def.guns;
      const gi = guns.findIndex(g => g.k === 'drone' || g.k === 'minion');
      if (gi < 0) { ok = false; break; }
      let n = 0;
      world.queryRadius(t.x, t.y, 420, e => {
        if (n >= 4 || e.type !== 'shape' || e.kind !== 'square') return;
        world.remove(e);
        world.addBullet({ kind: 'drone', x: e.x, y: e.y, vx: 0, vy: 0, r: e.r, dmg: 9 * guns[gi].dm * t.bDmg, hp: 30 * t.bPen, life: 1e9, team: t.team, ownerId: t.id, fx: guns[gi].fx, gunIdx: gi, maxSpeed: 320, angle: 0, shapeDrone: true });
        t.droneCount[gi]++;
        n++;
      });
      t.reclaimBonus = Math.min(8, (t.reclaimBonus || 0) + n);
      ok = n > 0;
      break;
    }
    case 'swap':
      if (!t.def.alt) { ok = false; break; }
      t.swapped = !t.swapped;
      t.reload = [];
      world.refreshTank(t);
      break;
    case 'emp': {
      const r = 380;
      world.queryRadius(t.x, t.y, r, e => {
        if (!world.hostile(t, e)) return;
        if (e.type === 'bullet' && e.kind !== 'drone' && e.kind !== 'minion') world.remove(e);
        else if (e.type === 'struct' || e.type === 'mob') e.status.stunUntil = now + ab.dur;
        else if (e.type === 'tank') e.status.bubbleUntil = 0;
      });
      world.addFx('emp', Math.round(t.x), Math.round(t.y), r);
      break;
    }
    default: ok = false;
  }
  if (ok) {
    t.abilityCd = now + ab.cd;
    world.addFx('ability', t.id, key);
  }
  return ok;
}
