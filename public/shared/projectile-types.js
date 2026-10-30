export const PROJECTILE_KINDS = {
  bullet: { code: 0, life: 1.4, walls: 'die', desc: 'Straight projectile' },
  drone: { code: 1, life: 0, walls: 'slide', desc: 'Persistent drone steered by owner aim' },
  trap: { code: 2, life: 7, walls: 'stop', desc: 'Decelerating mine that holds ground' },
  beam: { code: 3, life: 0, walls: 'ray', desc: 'Instant hitscan line' },
  swarm: { code: 4, life: 3.2, walls: 'die', desc: 'Short-lived self-guided drone' },
  minion: { code: 5, life: 0, walls: 'slide', desc: 'Drone that carries its own gun' },
  shell: { code: 6, life: 2.2, walls: 'die', desc: 'Heavy slow shell' }
};

export const KIND_BY_CODE = Object.fromEntries(Object.entries(PROJECTILE_KINDS).map(([k, v]) => [v.code, k]));

export const FLAG_INFO = {
  pierce: 'Passes through up to 3 targets',
  explode: 'Explodes on impact or expiry, damaging an area',
  home: 'Steers toward the nearest enemy',
  bounce: 'Ricochets off walls',
  split: 'Breaks into fragments on impact or expiry',
  chain: 'Arcs to a nearby second target',
  heal: 'Heals allies it touches',
  siege: 'Bonus damage to structures, shields and breakable walls',
  disrupt: 'Drains shields four times faster',
  intercept: 'Hunts enemy projectiles',
  pull: 'Drags struck enemies toward the impact',
  reverse: 'Returns toward the firer halfway through its life',
  missile: 'Missile that sheds small rounds as it flies',
  wave: 'Travels in a wave pattern',
  orbit: 'Satellite that circles its owner',
  block: 'Large, durable trap block',
  armed: 'Carries a small auto gun'
};

