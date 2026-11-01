import { TILE, TEAM, TILES, isSolidTile, MODES } from '../constants.js';
import { SHAPES, MOBS, UPGRADES, HAZ, MAP_THEMES } from '../entity-types.js';
import { BOSSES, BOSS_BY_KEY } from '../boss-registry.js';
import { TANKS, TANKS_BY_ID, tankByIndex, BOSS_TANK_IDS, SECRET_IDS, CUSTOM_BASE } from '../tank-registry.js';
import { MAX_LEVEL } from '../constants.js';
import { spawnBoss } from './bosses.js';
import { structFire } from './combat.js';
import { tileIndexAt } from '../map-generator.js';

const EVENTS = ['meteor', 'invasion', 'surge', 'overcharge', 'fortress', 'bounty', 'shieldFailure', 'boss'];

function inRect(r, x, y) {
  return x >= r.x * TILE && x <= (r.x + r.w) * TILE && y >= r.y * TILE && y <= (r.y + r.h) * TILE;
}

export function createMode(world) {
  const mode = world.mode;
  const isTeam = MODES[mode] ? MODES[mode].teams : false;
  const isLab = mode === 'labyrinth' || mode === 'labyrinth_team';
  const isNexus = mode === 'nexus';
  const isSandbox = mode === 'sandbox';
  const isBattle = !!(MODES[mode] && MODES[mode].battle);
  const isHunt = !!(MODES[mode] && MODES[mode].bosshunt);
  const isWorkshop = !!(MODES[mode] && MODES[mode].workshop);
  const battlePool = TANKS.filter(t => t.level >= 45 && !t.hidden).map(t => t.index);
  const map = world.map;
  const S = world.settings;
  const rng = world.rng;

  const state = {
    nextBossAt: isSandbox || isBattle || isWorkshop ? 1e12 : world.time + Math.max(60, S.bossInterval * 0.6),
    nextEventAt: world.time + rng.range(70, 110),
    activeEvents: [],
    lastNullAt: -1e9,
    chambers: [],
    secretRooms: [],
    spots: [],
    teams: [],
    alphaAt: 0,
    thresholdBoss: [false, false],
    fortress: null,
    shrines: [],
    bossPid: 0,
    bossPickAt: 6
  };

  const shapeTarget = isBattle ? 36 : isWorkshop ? 90 : isLab ? (map.theme === 'endless' ? 300 : 190) : isNexus ? 170 : 250;

  function bossesActive() { return world.ents.filter(e => !e.dead && e.type === 'boss'); }

  function announce(text, tone = 'info', extra = {}) { world.emit({ k: 'announce', text, tone, ...extra }); }

  function spawnShapeSomewhere() {
    let kind = 'square';
    const roll = rng.next();
    if (roll > 0.97) kind = 'hexagon';
    else if (roll > 0.86) kind = 'pentagon';
    else if (roll > 0.6) kind = 'triangle';
    let pos;
    if (isLab) {
      const res = map.rooms.filter(r => r.type === 'resource');
      if (res.length && rng.chance(0.35)) {
        const r = rng.pick(res);
        pos = { x: (r.x + rng.range(0.5, r.w - 0.5)) * TILE, y: (r.y + rng.range(0.5, r.h - 0.5)) * TILE };
        if (rng.chance(0.5)) kind = rng.chance(0.3) ? 'hexagon' : 'pentagon';
      } else pos = world.randomFloor(rng, 40, 1);
      const reg = map.regions.find(g => pos.x >= g.x && pos.x < g.x + g.w && pos.y >= g.y && pos.y < g.y + g.h);
      if (reg && reg.theme === 'crystal' && rng.chance(0.25)) kind = 'crystal';
    } else if (isNexus) {
      const x = rng.range(14, map.w - 14) * TILE, y = rng.range(2, map.h - 2) * TILE;
      pos = { x, y };
      const cx = world.W / 2, cy = world.H / 2;
      if (Math.hypot(x - cx, y - cy) < 600 && rng.chance(0.5)) kind = 'pentagon';
    } else {
      const cx = world.W / 2, cy = world.H / 2;
      if (rng.chance(0.18)) {
        const a = rng.range(0, Math.PI * 2), d = rng.range(0, 520);
        pos = { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
        kind = rng.chance(0.75) ? 'pentagon' : 'hexagon';
      } else pos = world.randomFloor(rng, 40, 1);
    }
    if (!pos || world.solidAt(pos.x, pos.y)) return;
    for (const e of world.ents) if (e.type === 'tank' && !e.dead && Math.hypot(e.x - pos.x, e.y - pos.y) < 220) return;
    world.addShape(kind, pos.x, pos.y);
  }

  function teamCount(team) {
    let n = 0;
    for (const p of world.players.values()) if (p.team === team) n++;
    return n;
  }

  const logic = {
    teamsActive: isTeam,
    state,

    init() {
      if (isNexus) this.initNexus();
      if (isLab) this.initLabyrinth();
      if (!isLab) for (let i = 0; i < shapeTarget * 0.8; i++) spawnShapeSomewhere();
      else for (let i = 0; i < shapeTarget * 0.8; i++) spawnShapeSomewhere();
      if (mode === 'ffa' || mode === 'tdm' || mode === 'maze' || mode === 'maze_team') {
        const c = { x: world.W / 2, y: world.H / 2 };
        world.addShape('alpha', c.x, c.y);
      }
      if (!isBattle && !isWorkshop && !map.custom && (map.kind === 'nexus' || map.kind === 'arena' || map.kind === 'maze')) {
        const shrine = world.addStruct('shrine', world.W / 2, world.H / 2, TEAM.NEUTRAL, { hp: 6000, armor: 0.3 });
        shrine.static = true;
        state.shrines.push({ id: shrine.id, x: shrine.x, y: shrine.y, respawnAt: 0, chamber: null });
      }
    },

    initNexus() {
      for (let team = 0; team < 2; team++) {
        const n = map.nexus[team];
        const nexus = world.addStruct('nexus', n.x, n.y, team, { hp: S.nexusHp, shield: S.nexusShield, armor: 0.25 });
        const gens = map.generators.filter(g => g.team === team).map(g => world.addStruct('generator', g.x, g.y, team, { armor: 0.2 }));
        const turrets = map.turrets.filter(g => g.team === team).map(g => world.addStruct('turret', g.x, g.y, team, { armor: 0.25 }));
        state.teams.push({
          team, credits: 250, upgrades: {}, nexusId: nexus.id, lastNexusHurt: -99,
          slots: [...map.generators.filter(g => g.team === team).map((g, i) => ({ kind: 'generator', x: g.x, y: g.y, id: gens[i].id, deadAt: 0 })),
            ...map.turrets.filter(g => g.team === team).map((g, i) => ({ kind: 'turret', x: g.x, y: g.y, id: turrets[i].id, deadAt: 0 }))],
          emergencyCdUntil: 0, drones: [], shieldFailUntil: 0, totalDamage: 0, kills: 0
        });
      }
    },

    initLabyrinth() {
      const cmap = map;
      cmap.rooms.forEach((r, i) => {
        if (r.type === 'boss') {
          const cx = (r.x + r.w / 2) * TILE, cy = (r.y + r.h / 2) * TILE;
          const shrine = world.addStruct('shrine', cx, cy, TEAM.NEUTRAL, { hp: 1800, armor: 0.2 });
          const sp = cmap.spawns[0] || { x: 0, y: 0 };
          const depth = Math.min(1, Math.hypot(cx - sp.x, cy - sp.y) / (world.W * 0.7));
          state.chambers.push({ room: r, x: cx, y: cy, bossId: 0, cooldownUntil: world.time + 40, lingerSince: 0, depth, shrineId: shrine.id, shrineAt: 0 });
          state.shrines.push({ id: shrine.id, x: cx, y: cy, respawnAt: 0, chamber: state.chambers.length - 1 });
        }
        if (r.type === 'secret') {
          state.secretRooms.push({ idx: i, room: r });
          const cx = (r.x + r.w / 2) * TILE, cy = (r.y + r.h / 2) * TILE;
          world.addStruct('cache', cx, cy, TEAM.NEUTRAL, { hp: 700, armor: 0 });
        }
      });
      for (const s of cmap.mobSpots) state.spots.push({ ...s, mobId: 0, respawnAt: world.time + rng.range(2, 15) });
      for (const f of cmap.features) if (f.type === 'wallTurret') world.addMob('wallTurret', f.x, f.y, { team: TEAM.ENV });
    },

    assignTeam(p) {
      if (!isTeam) return 100 + p.pid;
      return teamCount(0) <= teamCount(1) ? 0 : 1;
    },

    entityTeam(p) { return isTeam ? p.team : 100 + p.pid; },

    spawnPoint(p) {
      let cands = map.spawns;
      if (isTeam && map.spawns.some(s => s.team !== undefined)) cands = map.spawns.filter(s => s.team === p.team);
      if (isTeam && isLab) {
        const half = map.spawns.length / 2;
        cands = p.team === 0 ? map.spawns.slice(0, Math.max(1, half)) : map.spawns.slice(Math.max(1, half) - (map.spawns.length === 1 ? 1 : 0));
      }
      if (!cands.length) cands = map.spawns.length ? map.spawns : [{ x: world.W / 2, y: world.H / 2 }];
      let best = cands[0], bestScore = -1;
      for (let i = 0; i < 6; i++) {
        const c = cands[Math.floor(rng.next() * cands.length)];
        let md = 1e9;
        for (const e of world.ents) if (!e.dead && (e.type === 'tank' || e.type === 'boss') && world.hostile({ team: this.entityTeam(p) }, e)) md = Math.min(md, Math.hypot(e.x - c.x, e.y - c.y));
        if (md > bestScore) { bestScore = md; best = c; }
      }
      const jitter = () => rng.range(-40, 40);
      let x = best.x + jitter(), y = best.y + jitter();
      if (world.solidAt(x, y)) { x = best.x; y = best.y; }
      if (world.solidAt(x, y)) { const f = world.floorNear(best.x, best.y, 0, 200) || world.randomFloor(); x = f.x; y = f.y; }
      return { x, y };
    },

    preStep(dt) {
      const now = world.time;
      if (world.global.darkness && world.global.darkness.until < now) world.global.darkness = null;
      for (const p of world.players.values()) p.bossRewardMul = Math.min(1, p.bossRewardMul + 0.004 * dt);
      if (world.counts.shape < shapeTarget * (world.global.surgeUntil > now ? 1.8 : 1)) for (let i = 0; i < 2; i++) spawnShapeSomewhere();
      if ((mode === 'ffa' || mode === 'tdm' || mode === 'maze' || mode === 'maze_team') && now > state.alphaAt && !world.ents.some(e => e.type === 'shape' && e.kind === 'alpha' && !e.dead)) {
        state.alphaAt = now + 120;
        world.addShape('alpha', world.W / 2 + rng.range(-200, 200), world.H / 2 + rng.range(-200, 200));
      }
      if ((mode === 'ffa' || mode === 'tdm' || mode === 'sandbox' || mode === 'maze' || mode === 'maze_team') && world.tick % 90 === 0) {
        const crashers = world.ents.filter(e => e.type === 'mob' && !e.dead && e.kind === 'crasher').length;
        for (let i = crashers; i < 10; i++) {
          const a = rng.range(0, Math.PI * 2), d = rng.range(0, 450);
          world.addMob('crasher', world.W / 2 + Math.cos(a) * d, world.H / 2 + Math.sin(a) * d, { team: TEAM.ENV });
        }
      }
      if (isLab && world.tick % 15 === 0) this.labyrinthTick();
      if (isNexus) this.nexusTick(dt);
      if (!isSandbox && !isBattle && !isWorkshop && now >= state.nextBossAt) this.timedBoss();
      if (!isSandbox && !isBattle && !isWorkshop && now >= state.nextEventAt) this.startEvent();
      if (isHunt && world.tick % 15 === 0) this.huntTick();
      state.activeEvents = state.activeEvents.filter(e => e.until > now);
      if (world.global.bountyId && (now > world.global.bountyUntil || !world.get(world.global.bountyId))) world.global.bountyId = 0;
      for (const sh of state.shrines) {
        if (sh.respawnAt && now >= sh.respawnAt) {
          const s = world.addStruct('shrine', sh.x, sh.y, TEAM.NEUTRAL, { hp: isLab ? 1800 : 6000, armor: 0.3 });
          sh.id = s.id; sh.respawnAt = 0;
          if (sh.chamber !== null) state.chambers[sh.chamber].shrineId = s.id;
        }
      }
      if (state.fortress && state.fortress.ids.every(id => !world.get(id))) {
        announce('The fortress guardians fell. Something answers from below...', 'warn');
        const f = state.fortress;
        state.fortress = null;
        if (bossesActive().length < S.maxBosses) world.after(4, () => this.spawnBossAt(this.pickBoss(0.5), f.x, f.y, 'fortress'));
      }
    },

    postStep(dt) {
      if (world.tick % 15 !== 0) return;
      for (const t of world.ents) {
        if (t.dead || t.type !== 'tank') continue;
        for (const sr of state.secretRooms) {
          if (!t.player.secrets.has(sr.idx) && inRect(sr.room, t.x, t.y)) {
            t.player.secrets.add(sr.idx);
            world.giveXp(t, 300 + t.xp * 0.12);
            world.emit({ k: 'personal', pid: t.pid, ev: 'secret' });
            world.emit({ k: 'toast', pid: t.pid, text: 'Secret room discovered', tone: 'gold' });
          }
        }
      }
    },

    labyrinthTick() {
      const now = world.time;
      for (const s of state.spots) {
        if (s.mobId && world.get(s.mobId)) continue;
        if (s.mobId) { s.mobId = 0; s.respawnAt = now + (s.elite ? 100 : 45); continue; }
        if (now < s.respawnAt) continue;
        let near = false;
        for (const e of world.ents) if (e.type === 'tank' && !e.dead && Math.hypot(e.x - s.x, e.y - s.y) < 500) { near = true; break; }
        if (near) { s.respawnAt = now + 5; continue; }
        const th = MAP_THEMES[s.theme] || MAP_THEMES.classic;
        const kind = s.elite ? (rng.chance(0.5) ? 'elite' : 'eliteGunner') : rng.pick(th.mobs);
        const m = world.addMob(kind, s.x, s.y, { team: TEAM.ENV, spot: s });
        if (m) s.mobId = m.id;
      }
      for (let ci = 0; ci < state.chambers.length; ci++) {
        const c = state.chambers[ci];
        if (c.bossId && world.get(c.bossId)) continue;
        c.bossId = 0;
        if (now < c.cooldownUntil || bossesActive().length >= S.maxBosses) { c.lingerSince = 0; continue; }
        let inside = null;
        for (const e of world.ents) if (e.type === 'tank' && !e.dead && inRect(c.room, e.x, e.y)) { inside = e; break; }
        if (!inside) { c.lingerSince = 0; continue; }
        if (!c.lingerSince) {
          c.lingerSince = now;
          world.emit({ k: 'toast', pid: inside.pid, text: 'The chamber shrine stirs. Stay, or break it, to wake its guardian.', tone: 'warn' });
        } else if (now - c.lingerSince > 8) this.wakeChamber(ci, 'chamber');
      }
    },

    wakeChamber(ci, source) {
      const c = state.chambers[ci];
      if (!c || (c.bossId && world.get(c.bossId))) return;
      const b = this.spawnBossAt(this.pickBoss(c.depth), c.x, c.y, source);
      if (b) { c.bossId = b.id; c.lingerSince = 0; c.cooldownUntil = world.time + 140; }
    },

    pickBoss(depth) {
      const pool = BOSSES.filter(b => !b.rare);
      const sorted = [...pool].sort((a, b) => a.hp - b.hp);
      const idx = Math.min(sorted.length - 1, Math.floor((depth * 0.7 + rng.next() * 0.45) * sorted.length));
      if (world.bossesDefeated >= 3 && world.time - state.lastNullAt > 1200 && rng.chance(0.25)) { state.lastNullAt = world.time; return 'null_nexus'; }
      return sorted[idx].key;
    },

    spawnBossAt(key, x, y, source) {
      if (bossesActive().length >= S.maxBosses) return null;
      const pos = world.clearAround(Math.floor(x / TILE), Math.floor(y / TILE), 2) ? { x, y } : (world.floorNear(x, y, 0, 300) || { x, y });
      return spawnBoss(world, key, pos.x, pos.y, { source });
    },

    timedBoss() {
      state.nextBossAt = world.time + S.bossInterval * rng.range(0.8, 1.2);
      if (bossesActive().length >= S.maxBosses) return;
      let x = world.W / 2, y = world.H / 2, depth = rng.next();
      if (isLab && state.chambers.length) {
        const free = state.chambers.map((c, i) => i).filter(i => !state.chambers[i].bossId);
        if (!free.length) return;
        const ci = rng.pick(free);
        this.wakeChamber(ci, 'timed');
        return;
      }
      const near = world.ents.some(e => e.type === 'tank' && !e.dead);
      if (!near) return;
      this.spawnBossAt(this.pickBoss(depth), x, y, 'timed');
    },

    startEvent() {
      state.nextEventAt = world.time + rng.range(110, 170);
      const pool = EVENTS.filter(e => (e !== 'shieldFailure' || isNexus) && (e !== 'boss' || bossesActive().length < S.maxBosses));
      const ev = rng.pick(pool);
      const now = world.time;
      const tanks = world.ents.filter(e => e.type === 'tank' && !e.dead);
      if (!tanks.length) return;
      switch (ev) {
        case 'meteor': {
          announce('Meteor shower incoming. Watch the ground markers.', 'warn', { ev });
          state.activeEvents.push({ name: 'Meteor Shower', until: now + 12 });
          for (let i = 0; i < 24; i++) {
            world.after(i * 0.45, () => {
              const t = rng.pick(tanks);
              if (!t || t.dead) return;
              const p = world.floorNear(t.x, t.y, 0, 500);
              if (!p) return;
              world.addHazard(HAZ.WARN_CIRCLE, p.x, p.y, { r: 90, dur: 1.6, team: TEAM.ENV });
              world.after(1.6, () => {
                world.addFx('meteor', Math.round(p.x), Math.round(p.y));
                world.queryRadius(p.x, p.y, 90, e => { if (e.type === 'tank' || e.type === 'shape') world.damage(e, 45, null, {}); });
                if (rng.chance(0.3)) world.addShape(rng.chance(0.5) ? 'pentagon' : 'triangle', p.x, p.y);
              });
            });
          }
          break;
        }
        case 'invasion': {
          announce('Elite invasion. Hostile forces are converging.', 'bad', { ev });
          state.activeEvents.push({ name: 'Elite Invasion', until: now + 40 });
          for (let i = 0; i < 6; i++) {
            const t = rng.pick(tanks);
            const p = world.floorNear(t.x, t.y, 700, 1000);
            if (p) world.addMob(i % 3 === 0 ? 'elite' : i % 3 === 1 ? 'eliteGunner' : 'crasher', p.x, p.y, { team: TEAM.ENV, force: true });
          }
          break;
        }
        case 'surge':
          announce('Resource surge. Shapes are spawning faster and give 50% more experience.', 'good', { ev });
          world.global.surgeUntil = now + 35;
          state.activeEvents.push({ name: 'Resource Surge', until: now + 35 });
          break;
        case 'overcharge':
          announce('Weapon overcharge. Everyone reloads 25% faster.', 'good', { ev });
          world.global.overchargeUntil = now + 20;
          state.activeEvents.push({ name: 'Weapon Overcharge', until: now + 20 });
          break;
        case 'fortress': {
          const p = world.randomFloor(rng, 100, 2);
          announce('A neutral fortress has activated. Its guardians protect relic cores.', 'warn', { ev, x: Math.round(p.x), y: Math.round(p.y) });
          const ids = [];
          for (let i = 0; i < 3; i++) {
            const a = i * Math.PI * 2 / 3;
            const q = world.floorNear(p.x + Math.cos(a) * 130, p.y + Math.sin(a) * 130, 0, 80);
            if (q) { const m = world.addMob('guardian', q.x, q.y, { team: TEAM.ENV, force: true }); if (m) ids.push(m.id); }
          }
          world.addStruct('cache', p.x, p.y, TEAM.NEUTRAL, { hp: 900, armor: 0 });
          state.fortress = { ids, x: p.x, y: p.y };
          state.activeEvents.push({ name: 'Neutral Fortress', until: now + 90 });
          break;
        }
        case 'bounty': {
          const top = [...tanks].sort((a, b) => b.xp - a.xp)[0];
          world.global.bountyId = top.id;
          world.global.bountyUntil = now + 60;
          announce(`Bounty placed on ${top.name}. Triple experience and a relic core for the kill.`, 'gold', { ev });
          state.activeEvents.push({ name: `Bounty: ${top.name}`, until: now + 60 });
          break;
        }
        case 'shieldFailure': {
          const tm = state.teams[rng.int(0, 1)];
          const nx = world.get(tm.nexusId);
          if (!nx) break;
          nx.shield = 0;
          tm.shieldFailUntil = now + 20;
          announce(`${tm.team === 0 ? 'Blue' : 'Red'} Nexus shield failure. It regenerates in 20 seconds.`, 'bad', { ev });
          state.activeEvents.push({ name: `${tm.team === 0 ? 'Blue' : 'Red'} Shield Failure`, until: now + 20 });
          break;
        }
        case 'boss':
          this.timedBoss();
          break;
      }
    },

    nexusTick(dt) {
      const now = world.time;
      const nx = state.teams.map(t => world.get(t.nexusId));
      const health = nx.map(n => n ? (n.hp / n.maxHp + n.shield / Math.max(1, n.maxShield)) / 2 : 0);
      for (const tm of state.teams) {
        const comeback = health[tm.team] + 0.2 < health[1 - tm.team] ? 1.3 : 1;
        tm.credits += 4 * dt * (1 + 0.15 * (tm.upgrades.income || 0)) * comeback;
        for (const slot of tm.slots) {
          if (slot.id && !world.get(slot.id)) { slot.id = 0; slot.deadAt = now; }
          if (!slot.id && now - slot.deadAt > (slot.kind === 'generator' ? 150 : 200)) this.rebuildSlot(tm, slot);
        }
        const want = (tm.upgrades.drones || 0) * 3;
        tm.drones = tm.drones.filter(id => world.get(id));
        if (tm.drones.length < want && world.tick % 300 === 0 && nx[tm.team]) {
          const m = world.addMob('defenseDrone', nx[tm.team].x, nx[tm.team].y, { team: tm.team, force: true, slot: tm.drones.length });
          if (m) { m.home = { x: nx[tm.team].x, y: nx[tm.team].y, r: 120 }; tm.drones.push(m.id); }
        }
        const n = nx[tm.team];
        if (n && !state.thresholdBoss[tm.team] && n.hp < n.maxHp * 0.5) {
          state.thresholdBoss[tm.team] = true;
          announce(`${tm.team === 0 ? 'Blue' : 'Red'} Nexus is critical. The Nexus Warden answers the distress signal.`, 'boss');
          if (bossesActive().length < S.maxBosses) this.spawnBossAt('nexus_warden', world.W / 2, world.H / 2, 'threshold');
        }
      }
    },

    rebuildSlot(tm, slot) {
      const s = world.addStruct(slot.kind, slot.x, slot.y, tm.team, { armor: slot.kind === 'turret' ? 0.25 : 0.2 });
      slot.id = s.id;
      world.addFx('phase', Math.round(s.x), Math.round(s.y), Math.round(s.r));
      announce(`${tm.team === 0 ? 'Blue' : 'Red'} ${slot.kind === 'turret' ? 'turret' : 'shield generator'} rebuilt`, 'info');
    },

    updateStruct(s, dt) {
      const now = world.time;
      if (s.status.corruptUntil && s.status.corruptUntil < now) { s.team = s.origTeam; s.status.corruptUntil = 0; }
      if (s.kind === 'turret') {
        if (world.global.envOffUntil > now) return;
        const tm = state.teams[s.origTeam];
        const mul = tm ? 1 + 0.25 * (tm.upgrades.turretDmg || 0) : 1;
        structFire(world, s, dt, mul);
        if (tm && tm.upgrades.antiBoss) for (const b of world.ents) if (b.type === 'bullet' && b.ownerId === s.id && !b.antiBoss) b.antiBoss = true;
      } else if (s.kind === 'nexus') {
        const tm = state.teams[s.team] || state.teams[s.origTeam];
        if (!tm) return;
        const gens = tm.slots.filter(x => x.kind === 'generator' && x.id && world.get(x.id)).length;
        const cap = S.nexusShield * (1 + 0.25 * (tm.upgrades.shieldCap || 0));
        s.maxShield = cap;
        s.gens = gens;
        if (gens > 0 && tm.shieldFailUntil < now && now - tm.lastNexusHurt > 1.5) s.shield = Math.min(cap, s.shield + 55 * (1 + 0.4 * (tm.upgrades.shieldRegen || 0)) * gens / 2 * dt);
        if (now - tm.lastNexusHurt > 15) s.hp = Math.min(s.maxHp, s.hp + 8 * dt);
      }
    },

    damageNexus(n, amount, attacker, opts) {
      const tm = state.teams[n.team];
      if (!tm) return 0;
      if (n.status.emergencyUntil > world.time) return 0;
      tm.lastNexusHurt = world.time;
      let dealt = 0;
      const gens = n.gens || 0;
      if (n.shield > 0) {
        const sd = amount * (opts.disrupt ? 4 : 1) * (gens ? 1 : 1.6);
        n.shield = Math.max(0, n.shield - sd);
        dealt = sd;
        world.addFx('shieldHit', Math.round(n.x), Math.round(n.y));
      } else {
        dealt = amount * (1 - n.armor) * (opts.siege ? 1.6 : 1);
        n.hp -= dealt;
      }
      if (attacker && attacker.type === 'tank') { const at = state.teams[attacker.team]; if (at) { at.totalDamage += dealt; at.credits += dealt * 0.02; } }
      if (n.hp <= 0) world.kill(n, attacker);
      return dealt;
    },

    addCredits(team, n) { const tm = state.teams[team]; if (tm) tm.credits += n; },

    onShapeKilled(s, killer) { if (isNexus && killer) this.addCredits(killer.team, s.xp / 8); },

    onMobKilled(m, killer) {
      if (m.spot) m.spot.respawnAt = world.time + (m.spot.elite ? 100 : 45);
      if (isNexus && killer) this.addCredits(killer.team, m.xp / 5);
    },

    customTank(p, def) {
      if (!isSandbox && !isWorkshop) return false;
      p.customDef = def.index;
      p.sandboxDef = def.index;
      const t = world.tankOf(p);
      if (t) { world.setTankDef(t, def); if (t.level < MAX_LEVEL) world.giveXp(t, 1e7); }
      return true;
    },

    onTankKilled(victim, killer) {
      if (isHunt && victim.pid === state.bossPid) {
        state.bossPid = 0;
        state.bossPickAt = world.time + 1;
        if (killer && killer.type === 'tank' && !killer.dead && killer !== victim) {
          world.giveXp(killer, 3000);
          killer.player.bossKills++;
          world.emit({ k: 'personal', pid: killer.pid, ev: 'boss' });
          world.after(0.6, () => { if (!killer.dead) this.makeBoss(killer); });
        }
      } else if (isHunt && killer && killer.pid === state.bossPid) {
        world.giveXp(killer, 400);
      }
      if (!isNexus) return;
      this.addCredits(killer.team, 60);
      const tm = state.teams[killer.team];
      if (tm) tm.kills++;
      const own = tm && world.get(tm.nexusId);
      if (own && Math.hypot(victim.x - own.x, victim.y - own.y) < 1300) {
        world.emit({ k: 'personal', pid: killer.pid, ev: 'defend' });
        this.addCredits(killer.team, 40);
        world.giveXp(killer, 150);
      }
    },

    onStructDestroyed(s, killer) {
      if (s.kind === 'cache') {
        for (let i = 0; i < 2; i++) world.addPickup('core', s.x + rng.range(-30, 30), s.y + rng.range(-30, 30));
        world.addPickup('xp', s.x, s.y, { amount: 1500 });
        world.addPickup(rng.pick(['overcharge', 'speed', 'heal']), s.x + 30, s.y);
        world.addFx('rare', Math.round(s.x), Math.round(s.y));
        if (killer) world.giveXp(killer, 400);
        return;
      }
      if (s.kind === 'barrel') return;
      if (s.kind === 'shrine') {
        const sh = state.shrines.find(x => x.id === s.id);
        if (sh) sh.respawnAt = world.time + 300;
        if (sh && sh.chamber !== null) this.wakeChamber(sh.chamber, 'shrine');
        else if (bossesActive().length < S.maxBosses) this.spawnBossAt(this.pickBoss(rng.next()), s.x, s.y, 'shrine');
        return;
      }
      if (!isNexus) return;
      const team = s.origTeam;
      const name = team === 0 ? 'Blue' : 'Red';
      if (killer) this.addCredits(killer.team, s.kind === 'generator' ? 300 : s.kind === 'turret' ? 200 : 0);
      if (s.kind === 'generator') announce(`${name} shield generator destroyed`, team === 0 ? 'blue' : 'red');
      if (s.kind === 'turret') announce(`${name} defense turret destroyed`, team === 0 ? 'blue' : 'red');
      if (s.kind === 'nexus') {
        const winner = 1 - team;
        world.matchOver = { winner, at: world.time, restartAt: world.time + 15, stats: this.matchStats(winner) };
        announce(`${winner === 0 ? 'Blue' : 'Red'} team destroyed the ${name} Nexus and wins the match`, 'gold');
        for (const p of world.players.values()) if (p.team === winner) world.emit({ k: 'personal', pid: p.pid, ev: 'nexus_win' });
        world.emit({ k: 'matchEnd', winner, stats: world.matchOver.stats });
      }
    },

    matchStats(winner) {
      const players = [...world.players.values()].map(p => ({ name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, assists: p.assists, score: p.score, bot: p.isBot }));
      players.sort((a, b) => b.score - a.score);
      return { winner, players, teams: state.teams.map(t => ({ team: t.team, kills: t.kills, damage: Math.round(t.totalDamage), upgrades: t.upgrades })) };
    },

    onBossGone(b, killed) {
      for (const c of state.chambers) if (c.bossId === b.id) { c.bossId = 0; c.cooldownUntil = world.time + 140; }
      if (killed && isNexus) for (const tm of state.teams) tm.credits += 150;
    },

    structPriority(t, s) {
      if (s.kind === 'cache') return 200;
      if (s.kind === 'shrine') return -3000;
      if (s.kind === 'generator') return 350;
      if (s.kind === 'turret') return t.level > 20 ? 150 : -300;
      if (s.kind === 'nexus') return s.shield > 0 ? 50 : 420;
      return 0;
    },

    botGoal(t) {
      if (isNexus) {
        const enemy = state.teams[1 - t.team];
        const own = state.teams[t.team];
        const ownN = own && world.get(own.nexusId);
        const threatened = ownN && world.ents.some(e => e.type === 'tank' && !e.dead && e.team !== t.team && Math.hypot(e.x - ownN.x, e.y - ownN.y) < 900);
        if (threatened && (t.pid % 3 === 0)) return { x: ownN.x + rng.range(-200, 200), y: ownN.y + rng.range(-200, 200) };
        if (t.level < 15) { const p = world.floorNear(world.W / 2 + (t.team === 0 ? -900 : 900), world.H / 2, 0, 900); if (p) return p; }
        const gen = enemy.slots.find(s => s.kind === 'generator' && s.id && world.get(s.id));
        const target = gen ? world.get(gen.id) : world.get(enemy.nexusId);
        if (target) return { x: target.x, y: target.y };
      }
      if (isLab && rng.chance(0.4)) {
        const r = rng.pick(map.rooms.filter(r => r.type !== 'secret'));
        if (r) return { x: (r.x + r.w / 2) * TILE, y: (r.y + r.h / 2) * TILE };
      }
      return world.randomFloor(rng, 30, 1);
    },

    botHome(t) {
      if (isNexus) { const n = map.nexus[t.team]; return { x: n.x + (t.team === 0 ? 200 : -200), y: n.y }; }
      const sp = this.spawnPoint(t.player);
      return sp;
    },

    huntTick() {
      const now = world.time;
      const cur = state.bossPid ? world.players.get(state.bossPid) : null;
      const ct = cur ? world.tankOf(cur) : null;
      if (ct && ct.def.bossKey) return;
      state.bossPid = 0;
      if (now < state.bossPickAt) return;
      const alive = world.ents.filter(e => e.type === 'tank' && !e.dead);
      if (alive.length < 2) return;
      const humans = alive.filter(t => !t.isBot);
      this.makeBoss(rng.pick(humans.length && rng.chance(0.7) ? humans : alive));
    },

    makeBoss(t) {
      if (!t || t.dead) return;
      const def = TANKS_BY_ID.get(rng.pick(BOSS_TANK_IDS));
      world.setTankDef(t, def);
      const others = world.ents.filter(e => e.type === 'tank' && !e.dead && e !== t).length;
      t.hpMul = 1 + 0.45 * Math.max(0, others - 1);
      world.refreshTank(t, true);
      t.spawnProtect = world.time + 2;
      state.bossPid = t.pid;
      world.addFx('bossSpawn', Math.round(t.x), Math.round(t.y), Math.round(t.r));
      announce(`${t.player.name} has become ${def.name}. Hunt them down.`, 'boss');
      world.emit({ k: 'personal', pid: t.pid, ev: 'became_boss' });
    },

    spawnSetup(p, keep) {
      if (isWorkshop) return { level: MAX_LEVEL, xp: 0, def: p.customDef !== undefined ? tankByIndex(p.customDef) : null };
      if (isBattle) {
        let idx = p.battleDef;
        if (p.isBot || idx === undefined || !TANKS[idx]) idx = p.isBot || idx === undefined ? battlePool[rng.int(0, battlePool.length - 1)] : idx;
        return { level: MAX_LEVEL, xp: 0, def: tankByIndex(idx) };
      }
      if (isSandbox) return { level: Math.max(keep, p.sandboxLevel || 1), def: p.sandboxDef !== undefined ? tankByIndex(p.sandboxDef) : null };
      return null;
    },

    respawnDelay() { return isBattle ? 2 : 3.5; },

    pickTank(p, msg) {
      if (!Number.isInteger(msg.idx) || !TANKS[msg.idx]) return false;
      const want = TANKS[msg.idx];
      if (want.hidden && !(SECRET_IDS.includes(want.id) && (p.unlocks.has(want.id) || p.admin))) return false;
      const t = world.tankOf(p);
      if (t && t.def.bossKey) return false;
      if (isSandbox || isWorkshop) {
        p.sandboxDef = msg.idx;
        p.customDef = undefined;
        if (t) world.setTankDef(t, TANKS[msg.idx]);
        return true;
      }
      if (!isBattle) return false;
      p.battleDef = msg.idx;
      if (t && (world.time - t.born < 12 || t.spawnProtect > world.time) && t.hp >= t.maxHp * 0.98) {
        world.setTankDef(t, TANKS[msg.idx]);
      } else if (t) {
        world.emit({ k: 'toast', pid: p.pid, text: `${TANKS[msg.idx].name} will be used when you respawn`, tone: 'info' });
      }
      return true;
    },

    teamUpgrade(p, key) {
      if (!isNexus) return false;
      const tm = state.teams[p.team];
      const up = UPGRADES[key];
      if (!tm || !up) return false;
      const lvl = tm.upgrades[key] || 0;
      if (lvl >= up.max) return false;
      const cost = up.cost[Math.min(lvl, up.cost.length - 1)] * (key === 'rebuild' || key === 'emergency' ? 1 + 0.25 * lvl : 1);
      if (tm.credits < cost) return false;
      if (key === 'rebuild') {
        const slot = tm.slots.find(s => !s.id);
        if (!slot) return false;
        this.rebuildSlot(tm, slot);
      } else if (key === 'emergency') {
        const n = world.get(tm.nexusId);
        if (!n || tm.emergencyCdUntil > world.time) return false;
        n.status.emergencyUntil = world.time + 15;
        tm.emergencyCdUntil = world.time + 180;
      }
      tm.credits -= cost;
      tm.upgrades[key] = lvl + 1;
      announce(`${p.name} bought ${up.name} for ${p.team === 0 ? 'Blue' : 'Red'}`, p.team === 0 ? 'blue' : 'red', { team: p.team });
      return true;
    },

    donate(p) {
      if (!isNexus || p.cores < 1) return false;
      p.cores--;
      this.addCredits(p.team, 150);
      return true;
    },

    sandboxCommand(p, msg) {
      if (msg.t === 'p') return this.pickTank(p, msg);
      if (!isSandbox) return false;
      const t = world.tankOf(p);
      if (msg.t === 'lvl' && t) {
        p.sandboxLevel = MAX_LEVEL;
        world.giveXp(t, Math.max(0, 1e6 - t.xp));
        return true;
      }
      if (msg.t === 'sb' && Number.isInteger(msg.idx) && BOSSES[msg.idx] && t) {
        if ((p.lastSummon || -99) > world.time - 8) return false;
        if (bossesActive().length >= 3) return false;
        p.lastSummon = world.time;
        const pos = world.floorNear(t.x, t.y, 600, 900) || { x: t.x + 600, y: t.y };
        spawnBoss(world, BOSSES[msg.idx].key, pos.x, pos.y, { source: 'sandbox' });
        return true;
      }
      return false;
    },

    info(p) {
      const out = { ev: state.activeEvents.map(e => [e.name, Math.max(0, Math.round(e.until - world.time))]) };
      if (isNexus) {
        out.nx = state.teams.map(tm => {
          const n = world.get(tm.nexusId);
          const gens = tm.slots.filter(s => s.kind === 'generator' && s.id && world.get(s.id)).length;
          const turrets = tm.slots.filter(s => s.kind === 'turret' && s.id && world.get(s.id)).length;
          return [n ? Math.round(n.hp / n.maxHp * 1000) / 10 : 0, n && n.maxShield ? Math.round(n.shield / n.maxShield * 100) : 0, gens, turrets, n && n.status.emergencyUntil > world.time ? 1 : 0];
        });
        const tm = state.teams[p.team];
        if (tm) { out.cr = Math.floor(tm.credits); out.up = tm.upgrades; out.ecd = Math.max(0, Math.round(tm.emergencyCdUntil - world.time)); }
      }
      if (isLab) {
        out.sec = [p.secrets.size, state.secretRooms.length];
        out.ch = state.chambers.map(c => [Math.round(c.x), Math.round(c.y), c.bossId ? 1 : world.time < c.cooldownUntil ? 2 : 0]);
      }
      if (world.global.bountyId) out.bounty = world.global.bountyId;
      if (isBattle) out.bt = p.battleDef ?? -1;
      if (isHunt) { const bp = state.bossPid ? world.players.get(state.bossPid) : null; const bt = bp ? world.tankOf(bp) : null; out.hb = bt ? [bt.id, bp.name, bt.def.name] : 0; }
      return out;
    }
  };
  return logic;
}
