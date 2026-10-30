export const PROTOCOL_VERSION = 4;
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const SNAPSHOT_EVERY = 2;
export const TILE = 64;
export const MAX_BULLETS = 1800;
export const MAX_MOBS = 260;
export const MAX_SHAPES = 340;
export const MAX_PLAYERS = 24;
export const VIEW_RADIUS = 1250;

export const TEAM = { NEUTRAL: -1, BOSS: -2, ENV: -3, BLUE: 0, RED: 1 };
export const TEAM_COLORS = ['#3ca7d8', '#e8464f', '#3fc77a', '#a868e0'];
export const FFA_COLOR = '#ff4d61';
export const SELF_COLOR = '#38a3ff';

export const MAX_LEVEL = 60;
export const TIER_LEVELS = [1, 15, 30, 45, 60];
export const STAT_NAMES = ['Regen', 'Max Health', 'Body Damage', 'Bullet Speed', 'Bullet Pen', 'Bullet Damage', 'Reload', 'Move Speed'];
export const STAT_MAX = 7;

export function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.floor(8.5 * Math.pow(level - 1, 2.05) + 18 * (level - 1));
}

export function levelForXp(xp) {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
}

export const TILES = {
  FLOOR: 0, WALL: 1, BREAK: 2, CRYSTAL: 3, DOOR: 4, DOOR_OPEN: 5, VINE: 6,
  ENERGY: 7, TELEPORT: 8, MOSS: 9, BASE_BLUE: 10, BASE_RED: 11, CONVEYOR: 12, TEMP: 13
};
export const TILE_CHARS = '0123456789abcd';

export function isSolidTile(t) {
  return t === 1 || t === 2 || t === 3 || t === 4 || t === 6 || t === 13;
}

export const MODES = {
  ffa: { name: 'Arena FFA', teams: false, desc: 'Open arena. Every tank for itself.' },
  tdm: { name: 'Team Arena', teams: true, desc: 'Two teams, open arena, bosses roam the centre.' },
  nexus: { name: 'Nexus Siege', teams: true, desc: 'Break the enemy shield generators, then the Nexus.' },
  maze: { name: 'Maze', teams: false, desc: 'Arras-style maze. Long corridors, dead ends, shapes everywhere.' },
  maze_team: { name: 'Maze Teams', teams: true, desc: 'Two teams, bases in opposite corners of a maze.' },
  labyrinth: { name: 'Labyrinth', teams: false, desc: 'Procedural maze. Secrets, elites and boss chambers.' },
  labyrinth_team: { name: 'Labyrinth Teams', teams: true, desc: 'Procedural maze, two teams.' },
  battle: { name: 'Battle', teams: false, battle: true, desc: 'No leveling. Spawn at level 60 with any tank you like and fight.' },
  battle_team: { name: 'Team Battle', teams: true, battle: true, desc: 'No leveling, two teams. Pick any tank and fight.' },
  sandbox: { name: 'Sandbox', teams: false, desc: 'Pick any tank, jump to max level and summon bosses.' }
};

export const THEMES = ['classic', 'crystal', 'industrial', 'overgrown', 'void', 'endless'];

export const DEFAULT_SETTINGS = {
  friendlyFire: false,
  fog: true,
  bots: 8,
  botDifficulty: 'normal',
  deathRule: 'keepThird',
  theme: 'classic',
  bossInterval: 150,
  maxBosses: 2,
  nexusShield: 6000,
  nexusHp: 20000
};
