import { PROTOCOL_VERSION, VIEW_RADIUS, xpForLevel, MAX_LEVEL } from './constants.js';
import { SHAPE_KEYS, MOB_KEYS, STRUCT_CODES, ENT } from './entity-types.js';
import { PROJECTILE_KINDS } from './projectile-types.js';
import { encodeTiles } from './map-generator.js';
import { ABILITIES, TANKS } from './tank-registry.js';

export { PROTOCOL_VERSION };

const SHAPE_IDX = Object.fromEntries(SHAPE_KEYS.map((k, i) => [k, i]));
const MOB_IDX = Object.fromEntries(MOB_KEYS.map((k, i) => [k, i]));
const r1 = v => Math.round(v);
const ang = v => Math.round((v || 0) * 100);
const pct = (a, b) => Math.max(0, Math.min(100, Math.round((a / (b || 1)) * 100)));

export const CLIENT_TYPES = new Set(['j', 'i', 'u', 'e', 'd', 'p', 'lvl', 'sb', 'tu', 'don', 'ping', 'r']);

export function sanitizeInput(m) {
  const num = (v, lo, hi, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  return {
    mx: num(m.mx, -1, 1), my: num(m.my, -1, 1),
    ax: num(m.ax, -5000, 5000, 1), ay: num(m.ay, -5000, 5000, 0),
    fire: !!m.f, alt: !!m.a2, ability: !!m.ab, seq: num(m.s, 0, 1e9) | 0
  };
}

export function welcomeMessage(world, p, room) {
  return {
    t: 'w', protocol: PROTOCOL_VERSION, pid: p.pid, room: room.code, mode: world.mode, settings: world.settings,
    map: { w: world.w, h: world.h, tiles: encodeTiles(world.tiles), theme: world.map.theme, kind: world.map.kind, regions: world.map.regions, seed: world.seed, conveyors: [...world.map.conveyors.entries()] },
    token: p.token, team: p.team
  };
}

function encodeEnt(e, world, viewer) {
  switch (e.type) {
    case 'tank': {
      const s = e.status, now = world.time;
      let f = 0;
      if (s.cloakUntil > now) f |= 1;
      if (s.bubbleUntil > now) f |= 2;
      if (e.spawnProtect > now) f |= 4;
      if (world.global.bountyId === e.id) f |= 8;
      if (s.chillUntil > now) f |= 16;
      if (s.overdriveUntil > now) f |= 32;
      if (s.dashUntil > now) f |= 64;
      if (now - e.lastHurt < 0.12) f |= 128;
      return [ENT.TANK, e.id, r1(e.x), r1(e.y), ang(e.angle), r1(e.r), e.team, pct(e.hp, e.maxHp), e.defIdx, f, e.level, e.swapped ? 1 : 0, r1(e.vx), r1(e.vy)];
    }
    case 'bullet':
      return [ENT.BULLET, e.id, r1(e.x), r1(e.y), r1(e.r), e.team, PROJECTILE_KINDS[e.kind] ? PROJECTILE_KINDS[e.kind].code : 0, ang(e.angle !== undefined ? e.angle : Math.atan2(e.vy, e.vx)), e.fx.heal ? 1 : e.fx.explode ? 2 : e.fx.home ? 3 : e.fx.chain ? 4 : e.fx.bounce ? 5 : 0, e.shapeDrone ? 1 : 0];
    case 'shape':
      return [ENT.SHAPE, e.id, r1(e.x), r1(e.y), ang(e.angle), r1(e.r), SHAPE_IDX[e.kind], pct(e.hp, e.maxHp), world.time - e.lastHurt < 0.12 ? 1 : 0];
    case 'mob':
      return [ENT.MOB, e.id, r1(e.x), r1(e.y), ang(e.angle), r1(e.r), e.team, pct(e.hp, e.maxHp), MOB_IDX[e.kind], world.time - (e.lastHurt || -9) < 0.12 ? 1 : 0, e.status.corruptUntil > world.time ? 1 : 0];
    case 'boss': {
      const now = world.time;
      let f = 0;
      if (now < e.invulnUntil) f |= 1;
      if (e.mirrorUntil > now) f |= 2;
      if (e.cloaked) f |= 4;
      if (e.armorUntil > now) f |= 8;
      if (e.charging) f |= 16;
      if (now - (e.lastHurt || -9) < 0.12) f |= 32;
      if (e.regen && e.regen.until > now) f |= 64;
      return [ENT.BOSS, e.id, r1(e.x), r1(e.y), ang(e.angle), r1(e.r), pct(e.hp, e.maxHp), e.bossIdx, e.phase, f];
    }
    case 'part': {
      const b = world.get(e.bossId);
      let f = 0;
      if (e.spec.invulnPart) f |= 1;
      if (e.overload) f |= 2;
      if (e.spec.shieldsCore) f |= 4;
      if (world.time - (e.lastHurt || -9) < 0.12) f |= 8;
      return [ENT.PART, e.id, r1(e.x), r1(e.y), r1(e.r), e.spec.invulnPart ? 100 : pct(e.hp, e.maxHp), f, b ? b.bossIdx : 0];
    }
    case 'struct': {
      let f = 0;
      if (e.status.corruptUntil > world.time) f |= 1;
      if (e.status.emergencyUntil > world.time) f |= 2;
      if (e.status.stunUntil > world.time) f |= 4;
      if (world.time - (e.lastHurt || -9) < 0.12) f |= 8;
      return [ENT.STRUCT, e.id, r1(e.x), r1(e.y), ang(e.angle), r1(e.r), e.team, pct(e.hp, e.maxHp), STRUCT_CODES[e.kind], e.maxShield ? pct(e.shield, e.maxShield) : -1, f, e.gens || 0];
    }
    case 'pickup':
      return [ENT.PICKUP, e.id, r1(e.x), r1(e.y), e.code];
    case 'hazard': {
      const prog = Math.round(Math.min(1, (world.time - e.start) / Math.max(0.01, e.until - e.start)) * 100);
      return [ENT.HAZARD, e.id, r1(e.x), r1(e.y), e.kind, r1(e.r), ang(e.ang), r1(e.len), prog, r1(e.w || 0), e.team === -3 ? 1 : 0];
    }
  }
  return null;
}

export function snapshotFor(world, p, extras) {
  const t = world.tankOf(p);
  const now = world.time;
  let cx, cy, fov = 1;
  if (t) { cx = t.x; cy = t.y; fov = t.fov; }
  else {
    const k = p.killerId ? world.get(p.killerId) : null;
    if (k) { cx = k.x; cy = k.y; } else { cx = p.deathX || world.W / 2; cy = p.deathY || world.H / 2; }
  }
  let radius = VIEW_RADIUS * fov;
  const dk = world.global.darkness;
  if (dk && Math.hypot(cx - dk.x, cy - dk.y) < dk.r) radius = Math.min(radius, 520);
  const ents = [];
  world.stamp++;
  const st = world.stamp;
  world.grid.query(cx, cy, radius, e => {
    if (e.dead || e.down) return;
    if (Math.abs(e.x - cx) > radius + e.r || Math.abs(e.y - cy) > radius * 0.8 + e.r) return;
    if (e.type === 'tank' && e !== t && e.status.cloakUntil > now && e.team !== (t ? t.team : -99) && Math.hypot(e.x - cx, e.y - cy) > 260) return;
    const enc = encodeEnt(e, world, p);
    if (enc) ents.push(enc);
  }, st);
  for (const e of world.ents) {
    if (e.type !== 'hazard' || e.dead) continue;
    const reach = Math.max(e.r, e.len || 0, e.maxR || 0) + radius;
    if (Math.abs(e.x - cx) < reach && Math.abs(e.y - cy) < reach) ents.push(encodeEnt(e, world, p));
  }
  for (const e of world.ents) {
    if (e.type === 'boss' && !e.dead && (Math.abs(e.x - cx) > radius + e.r || Math.abs(e.y - cy) > radius * 0.8 + e.r)) {
      if (Math.hypot(e.x - cx, e.y - cy) < radius * 1.6) ents.push(encodeEnt(e, world, p));
    }
  }
  const darkened = radius < VIEW_RADIUS * fov;
  const msg = { t: 's', dk: darkened ? 1 : 0, tk: world.tick, tm: Math.round(now * 1000) / 1000, e: ents, cx: r1(cx), cy: r1(cy) };
  if (t) {
    const lvlXp = xpForLevel(t.level), nextXp = t.level >= MAX_LEVEL ? lvlXp : xpForLevel(t.level + 1);
    const ab = ABILITIES[t.def.ability];
    msg.y = {
      id: t.id, hp: r1(t.hp), mhp: r1(t.maxHp), lv: t.level, xp: Math.floor(t.xp), xa: lvlXp, xb: nextXp, pts: t.statPts, st: t.stats,
      def: t.defIdx, ab: t.def.ability, abcd: Math.max(0, Math.round((t.abilityCd - now) * 10) / 10), abmax: ab ? ab.cd : 0,
      evo: world.evoOptions(t), sw: t.swapped ? 1 : 0, team: t.team, seq: p.input.seq, spd: r1(t.maxSpeed),
      sh: t.status.bubbleUntil > now ? Math.round((t.status.bubbleUntil - now) * 10) / 10 : 0,
      buffs: [t.status.overchargeUntil > now ? 1 : 0, t.status.speedUntil > now ? 1 : 0, t.status.rallyUntil > now ? 1 : 0, t.status.overdriveUntil > now ? 1 : 0, t.status.chillUntil > now ? 1 : 0, t.status.cloakUntil > now ? 1 : 0]
    };
  } else {
    msg.y = { dead: 1, respawn: Math.max(0, Math.round((p.respawnAt - now) * 10) / 10), killer: p.killerId };
  }
  msg.me = { k: p.kills, d: p.deaths, as: p.assists, sc: p.score, co: p.cores, bk: p.bossKills, sec: p.secrets.size, team: p.team, doc: Math.max(0, Math.round(p.docCdUntil - now)) };
  if (extras) Object.assign(msg, extras);
  return msg;
}

export function sharedExtras(world, tickOnce) {
  const out = {};
  const bosses = [];
  for (const e of world.ents) if (e.type === 'boss' && !e.dead) bosses.push([e.id, e.bossIdx, pct(e.hp, e.maxHp), e.phase, r1(e.x), r1(e.y), e.mode || '']);
  out.b = bosses;
  if (world.tileChanges.length) out.tc = world.tileChanges.slice();
  if (world.fx.length) out.fx = world.fx.slice();
  if (tickOnce) {
    const players = [...world.players.values()];
    out.pl = players.map(p => [p.pid, p.name, p.team, p.isBot ? 1 : 0, p.score, p.kills, p.deaths, p.tankId || 0, (world.tankOf(p) || {}).defIdx ?? -1, p.connected ? 1 : 0, p.bossKills]);
    const mm = [];
    for (const e of world.ents) {
      if (e.dead) continue;
      if (e.type === 'tank') mm.push([0, r1(e.x), r1(e.y), e.team, e.id]);
      else if (e.type === 'boss') mm.push([1, r1(e.x), r1(e.y), -2, e.id]);
      else if (e.type === 'struct' && (e.kind === 'nexus' || e.kind === 'generator' || e.kind === 'turret' || e.kind === 'shrine')) mm.push([2, r1(e.x), r1(e.y), e.team, STRUCT_CODES[e.kind]]);
    }
    out.mm = mm;
  }
  return out;
}

export function filterMinimap(world, p, mm) {
  if (!mm) return mm;
  const t = world.tankOf(p);
  const team = t ? t.team : (world.logic.teamsActive ? p.team : 100 + p.pid);
  const radar = world.logic.state.teams && world.logic.state.teams[p.team] && world.logic.state.teams[p.team].upgrades.radar;
  return mm.filter(m => m[0] !== 0 || m[3] === team || radar || (world.global.bountyId === m[4]));
}
