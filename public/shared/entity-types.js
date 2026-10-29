import { gun, ring, fan, pair } from './weapon-registry.js';

export const SHAPES = {
  square: { sides: 4, r: 15, hp: 12, xp: 10, color: '#ffd84d', speed: 6 },
  triangle: { sides: 3, r: 16, hp: 30, xp: 25, color: '#ff7a6b', speed: 9 },
  pentagon: { sides: 5, r: 26, hp: 110, xp: 130, color: '#7f8cff', speed: 4 },
  alpha: { sides: 5, r: 70, hp: 2600, xp: 3000, color: '#7f8cff', speed: 1 },
  hexagon: { sides: 6, r: 32, hp: 360, xp: 420, color: '#3fe0c5', speed: 2 },
  crystal: { sides: 4, r: 22, hp: 160, xp: 220, color: '#b6f3ff', speed: 0, rotate: true }
};
export const SHAPE_KEYS = Object.keys(SHAPES);

export const MOBS = {
  crasher: { name: 'Crasher', sides: 3, r: 14, hp: 45, speed: 250, ai: 'chase', bodyDmg: 1.4, xp: 18, color: '#ff5fb0', guns: [] },
  sentry: { name: 'Sentry', sides: 4, r: 26, hp: 320, speed: 0, ai: 'turret', bodyDmg: 1, xp: 140, color: '#ff9a3d', range: 700, guns: [gun({ len: 1.9, w: 0.45, r: 2.2, dm: 1, sp: 0.9 })] },
  elite: { name: 'Elite Pentagon', sides: 5, r: 54, hp: 2000, speed: 45, ai: 'wander', bodyDmg: 2, xp: 950, color: '#b06bff', drop: 1, range: 800, armor: 0.2, guns: ring(5, { len: 1.3, w: 0.35, r: 2, dm: 1, sp: 0.8 }) },
  eliteGunner: { name: 'Elite Gunner', sides: 6, r: 46, hp: 1600, speed: 70, ai: 'kite', bodyDmg: 1.5, xp: 800, color: '#b06bff', drop: 1, range: 900, armor: 0.15, guns: pair(0.35, { len: 1.8, w: 0.3, r: 0.8, dm: 0.7, sp: 1.1 }) },
  hiveling: { name: 'Hiveling', sides: 6, r: 12, hp: 32, speed: 270, ai: 'chase', bodyDmg: 1, xp: 8, color: '#ffc23d', guns: [] },
  bossDrone: { name: 'Warden Drone', sides: 3, r: 16, hp: 90, speed: 290, ai: 'orbit', bodyDmg: 1, xp: 20, color: '#ff4d61', range: 600, guns: [gun({ len: 1.5, r: 2.6, dm: 0.6 })] },
  wallTurret: { name: 'Wall Turret', sides: 4, r: 22, hp: 420, speed: 0, ai: 'turret', bodyDmg: 1, xp: 90, color: '#a0a8b8', range: 620, armor: 0.3, guns: [gun({ len: 1.8, r: 1.4, dm: 0.7, sp: 1.1 })] },
  bloomPod: { name: 'Bloom Pod', sides: 0, r: 24, hp: 300, speed: 0, ai: 'turret', bodyDmg: 1, xp: 95, color: '#6fe36b', range: 650, guns: [gun({ k: 'swarm', len: 1.2, w: 0.5, r: 3, dm: 0.6, sp: 0.55 })] },
  crystalMite: { name: 'Crystal Mite', sides: 4, r: 16, hp: 130, speed: 190, ai: 'chase', bodyDmg: 1.2, xp: 45, color: '#b6f3ff', reflect: 0.5, guns: [gun({ len: 1.4, r: 2.4, dm: 0.5, fx: { bounce: 2 } })] },
  voidWisp: { name: 'Void Wisp', sides: 0, r: 14, hp: 95, speed: 160, ai: 'blink', bodyDmg: 1.3, xp: 55, color: '#9b6bff', range: 500, guns: [gun({ len: 1.3, r: 2.2, dm: 0.6, fx: { reverse: 1 } })] },
  guardian: { name: 'Fortress Guardian', sides: 4, r: 34, hp: 950, speed: 0, ai: 'turret', bodyDmg: 1.5, xp: 320, color: '#ffb23d', range: 760, armor: 0.25, drop: 1, guns: pair(0.4, { len: 1.8, r: 1.1, dm: 0.8 }) },
  cannonTurret: { name: 'Siege Turret', sides: 4, r: 24, hp: 520, speed: 0, ai: 'turret', bodyDmg: 1, xp: 60, color: '#ff4d61', range: 760, guns: [gun({ k: 'shell', len: 1.8, w: 0.55, r: 3.2, dm: 1.2, sp: 0.7, fx: { explode: 0.7 } })] },
  swarmling: { name: 'Swarmling', sides: 3, r: 10, hp: 22, speed: 320, ai: 'formation', bodyDmg: 0.8, xp: 4, color: '#ff8fd8', guns: [] },
  kingShard: { name: 'Royal Shard', sides: 5, r: 40, hp: 2600, speed: 120, ai: 'kite', bodyDmg: 2, xp: 600, color: '#ffd84d', range: 800, armor: 0.2, guns: fan(3, 40, { len: 1.6, r: 1.6, dm: 0.9 }) },
  defenseDrone: { name: 'Defense Drone', sides: 3, r: 14, hp: 140, speed: 300, ai: 'guard', bodyDmg: 1, xp: 15, color: '#ffffff', range: 650, guns: [gun({ len: 1.5, r: 1.6, dm: 0.6 })] },
  playerTurret: { name: 'Deployed Turret', sides: 0, r: 20, hp: 260, speed: 0, ai: 'turret', bodyDmg: 1, xp: 30, color: '#ffffff', range: 700, guns: [gun({ len: 1.8, r: 0.9, dm: 0.55, sp: 1.1 })] },
  emberImp: { name: 'Ember Imp', sides: 3, r: 15, hp: 70, speed: 240, ai: 'chase', bodyDmg: 1.2, xp: 20, color: '#ff8a3d', guns: [] },
  icicle: { name: 'Icicle Sentry', sides: 6, r: 22, hp: 340, speed: 0, ai: 'turret', bodyDmg: 1, xp: 70, color: '#9fe8ff', range: 700, guns: [gun({ len: 1.8, r: 2.4, dm: 0.7, fx: { pierce: 2 } })] }
};
export const MOB_KEYS = Object.keys(MOBS);

export const STRUCTURES = {
  nexus: { name: 'Nexus', r: 120, sides: 8 },
  generator: { name: 'Shield Generator', r: 46, hp: 4200, sides: 6 },
  turret: { name: 'Defense Turret', r: 36, hp: 3200, sides: 0, range: 820, guns: [gun({ len: 2, w: 0.42, r: 1.25, dm: 1.4, sp: 1.2, pn: 1.6 })] },
  cache: { name: 'Treasure Cache', r: 30, hp: 600, sides: 4 },
  barrel: { name: 'Volatile Barrel', r: 22, hp: 80, sides: 0 },
  shrine: { name: 'Boss Shrine', r: 44, hp: 1500, sides: 8 }
};

export const PICKUPS = {
  core: { code: 0, name: 'Relic Core' },
  xp: { code: 1, name: 'Experience Orb' },
  overcharge: { code: 2, name: 'Overcharge' },
  heal: { code: 3, name: 'Repair Kit' },
  speed: { code: 4, name: 'Thruster Cell' },
  credits: { code: 5, name: 'Credit Chip' }
};
export const PICKUP_BY_CODE = Object.fromEntries(Object.entries(PICKUPS).map(([k, v]) => [v.code, k]));

export const ENT = { TANK: 0, BULLET: 1, SHAPE: 2, MOB: 3, BOSS: 4, PART: 5, STRUCT: 6, PICKUP: 7, HAZARD: 8 };
export const STRUCT_CODES = { nexus: 0, generator: 1, turret: 2, cache: 3, barrel: 4, shrine: 5 };
export const STRUCT_BY_CODE = Object.fromEntries(Object.entries(STRUCT_CODES).map(([k, v]) => [v, k]));
export const HAZ = { WARN_CIRCLE: 0, WARN_LINE: 1, LASER: 2, SHOCK: 3, FIELD: 4, GRAVITY: 5, PORTAL: 6, BURN: 7, DARK: 8, BARRIER_WARN: 9 };

export const UPGRADES = {
  shieldCap: { name: 'Shield Capacity', max: 3, cost: [300, 600, 1000], desc: '+25% Nexus shield capacity' },
  shieldRegen: { name: 'Shield Regeneration', max: 3, cost: [250, 500, 900], desc: '+40% shield regeneration' },
  turretDmg: { name: 'Turret Damage', max: 3, cost: [300, 650, 1100], desc: '+25% turret damage' },
  rebuild: { name: 'Rebuild Defenses', max: 99, cost: [450], desc: 'Rebuild one destroyed turret or generator' },
  emergency: { name: 'Emergency Shield', max: 99, cost: [700], desc: 'Nexus invulnerable for 15s (3 min cooldown)' },
  radar: { name: 'Expanded Radar', max: 1, cost: [500], desc: 'Team sees enemy tanks on the minimap' },
  drones: { name: 'Defense Drones', max: 2, cost: [500, 900], desc: 'Nexus launches defense drones' },
  income: { name: 'Resource Refinery', max: 2, cost: [400, 800], desc: '+15% team income' },
  antiBoss: { name: 'Anti-Boss Battery', max: 1, cost: [600], desc: 'Turrets deal double damage to bosses' }
};

export const ACHIEVEMENTS = [
  { id: 'first_blood', name: 'First Elimination', desc: 'Destroy an enemy tank', ev: 'kill', n: 1 },
  { id: 'hunter10', name: 'Tank Hunter', desc: 'Destroy 25 enemy tanks', ev: 'kill', n: 25 },
  { id: 'nexus_def', name: 'Nexus Defender', desc: 'Destroy 10 enemies near your own Nexus', ev: 'defend', n: 10 },
  { id: 'boss_slayer', name: 'Boss Slayer', desc: 'Take part in defeating a boss', ev: 'boss', n: 1 },
  { id: 'boss_10', name: 'Ancient Enemy Hunter', desc: 'Take part in defeating 10 bosses', ev: 'boss', n: 10 },
  { id: 'explorer', name: 'Labyrinth Explorer', desc: 'Discover 5 secret rooms', ev: 'secret', n: 5 },
  { id: 'dodger', name: 'Perfect Dodger', desc: 'Survive a full boss fight without taking boss damage', ev: 'dodge', n: 1 },
  { id: 'team_player', name: 'Team Player', desc: 'Earn 30 assists', ev: 'assist', n: 30 },
  { id: 'artillery', name: 'Heavy Artillery Specialist', desc: 'Get 10 kills with an Artillery or Siege tank', ev: 'kill_artillery', n: 10 },
  { id: 'drones', name: 'Drone Commander', desc: 'Get 10 kills with a drone tank', ev: 'kill_drone', n: 10 },
  { id: 'rare', name: 'Rare Tank Collector', desc: 'Play 10 different legendary or mythic tanks', ev: 'rare_tank', n: 10 },
  { id: 'tier4', name: 'Apex Form', desc: 'Reach a tier 4 tank', ev: 'tier4', n: 1 },
  { id: 'nexus_win', name: 'Siege Master', desc: 'Win a Nexus Siege match', ev: 'nexus_win', n: 1 },
  { id: 'elite', name: 'Elite Breaker', desc: 'Destroy 10 elite enemies', ev: 'elite', n: 10 },
  { id: 'healer', name: 'Field Medic', desc: 'Heal 5000 ally health', ev: 'heal', n: 5000 }
];

export const MAP_THEMES = {
  classic: { name: 'Classic', floor: '#16181f', wall: '#2c3140', mobs: ['crasher', 'sentry'], desc: 'Breakable walls and secret rooms' },
  crystal: { name: 'Crystal', floor: '#121a24', wall: '#3a5d78', mobs: ['crystalMite', 'crasher'], desc: 'Crystal walls reflect bullets; energy fields burn' },
  industrial: { name: 'Industrial', floor: '#1a1a1a', wall: '#45403a', mobs: ['wallTurret', 'sentry'], desc: 'Timed doors, conveyors and wall turrets' },
  overgrown: { name: 'Overgrown', floor: '#121c14', wall: '#2f4a2a', mobs: ['bloomPod', 'crasher'], desc: 'Regrowing vines and slowing moss' },
  void: { name: 'Void', floor: '#100c18', wall: '#36285a', mobs: ['voidWisp', 'eliteGunner'], desc: 'Teleport gates and unstable passages' },
  endless: { name: 'Endless', floor: '#141418', wall: '#3a3448', mobs: ['crasher', 'sentry', 'voidWisp', 'crystalMite'], desc: 'Huge, mixed regions, more elites' }
};
