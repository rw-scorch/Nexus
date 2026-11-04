export const PROTOCOL_VERSION = 6;
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
  ffa: { name: 'Arena FFA', teams: false, objective: 'Earn the highest score before the arena closes.', desc: 'Open arena. Every tank for itself; the highest score wins.' },
  tdm: { name: 'Team Arena', teams: true, objective: 'Your team wins by leading the score race.', desc: 'Two teams contest a shared score race while bosses roam the centre.' },
  nexus: { name: 'Nexus Siege', teams: true, objective: 'Destroy generators, then break the enemy Nexus.', desc: 'Break the enemy shield generators, then the Nexus.' },
  maze: { name: 'Maze', teams: false, objective: 'Navigate corridors and outscore every rival.', desc: 'Arras-style maze. Long corridors, dead ends, shapes everywhere.' },
  maze_team: { name: 'Maze Teams', teams: true, objective: 'Control the maze and lead your team score.', desc: 'Two teams, bases in opposite corners of a maze.' },
  labyrinth: { name: 'Labyrinth', teams: false, objective: 'Find secrets and awaken chambers before rivals do.', desc: 'Procedural maze. Secrets, elites and boss chambers.' },
  labyrinth_team: { name: 'Labyrinth Teams', teams: true, objective: 'Secure chambers and defeat guardians for your team.', desc: 'Procedural maze, two teams.' },
  battle: { name: 'Battle', teams: false, battle: true, objective: 'Spend your max-level build and be the last tank standing.', desc: 'No leveling. Spawn at level 60 with any tank you like and fight.' },
  battle_team: { name: 'Team Battle', teams: true, battle: true, objective: 'Eliminate the opposing team with fixed max-level builds.', desc: 'No leveling, two teams. Pick any tank and fight.' },
  bosshunt: { name: 'Boss Hunt', teams: false, battle: true, bosshunt: true, objective: 'Kill the marked player-boss to inherit the crown.', desc: 'One player is a random boss. Whoever kills it becomes the next boss.' },
  relic_rush: { name: 'Relic Rush', teams: false, objective: 'Collect cores and bank the most at the centre.', desc: 'Relic cores appear in waves. Bank cores at the centre, but every deposit marks you for hunters.' },
  gauntlet: { name: 'Gauntlet', teams: true, objective: 'Survive escalating waves and win the final boss assault.', desc: 'Two teams fight through escalating elite waves and a timed boss assault.' },
  infection: { name: 'Infection', teams: true, objective: 'Spread infection or complete the cure before the timer ends.', desc: 'One infected tank spreads the outbreak; survivors build a cure by hunting it.' },
  bounty: { name: 'Bounty Circuit', teams: false, objective: 'Claim rotating bounties for multiplied rewards.', desc: 'A rotating marked target earns double rewards while every hunter gets a trail.' },
  convoy: { name: 'Convoy', teams: true, objective: 'Escort your convoy farther than the opposing team.', desc: 'Escort a moving armored convoy through hostile territory.' },
  relay: { name: 'Relay', teams: true, objective: 'Capture relays in order and push the frontline.', desc: 'Capture linked relay towers to push your team front forward.' },
  arena_rumble: { name: 'Arena Rumble', teams: false, battle: true, objective: 'Outlast the hazard mutations in a fixed max-level brawl.', desc: 'Every minute the arena mutates with a new hazard.' },
  titanfall: { name: 'Titanfall', teams: true, objective: 'Charge your titan meter and escort it to the enemy base.', desc: 'Teams charge a shared titan meter and unleash a controllable titan.' },
  blackout: { name: 'Blackout', teams: false, objective: 'Use radar and muzzle flashes to hunt unseen rivals.', desc: 'Visibility collapses outside your tank radar and shots reveal you.' },
  salvage: { name: 'Salvage Run', teams: false, objective: 'Recover wreckage, then bank it at extraction.', desc: 'Recover wreckage from dangerous zones and bank it at extraction.' },
  safe_invasion: { name: 'Safe Invasion', teams: true, safe: true, objective: 'Breach the enemy vault while defending your own.', desc: 'Build a custom safe, place guards, then command a squadron into enemy vaults.' },
  squadron: { name: 'Squadron Command', teams: true, battle: true, safe: true, objective: 'Direct guard formations to capture and destroy objectives.', desc: 'Your custom guard tanks fight under direct formation orders.' },
  workshop: { name: 'Workshop', teams: false, workshop: true, objective: 'Build, test and refine a programmable tank.', desc: 'Build your own tank and test it at level 60.' },
  sandbox: { name: 'Sandbox', teams: false, objective: 'Experiment freely with tanks, levels and bosses.', desc: 'Pick any tank, jump to max level and summon bosses.' }
};

export const THEMES = ['classic', 'crystal', 'industrial', 'overgrown', 'void', 'endless', 'sunken', 'neon', 'volcanic', 'clockwork'];

export const DEFAULT_SETTINGS = {
  friendlyFire: false,
  fog: true,
  bots: 8,
  botDifficulty: 'normal',
  deathRule: 'keepThird',
  theme: 'classic',
  bossInterval: 1200,
  maxBosses: 2,
  labyrinthWidth: 49,
  labyrinthHeight: 49,
  nexusShield: 6000,
  nexusHp: 20000
};
