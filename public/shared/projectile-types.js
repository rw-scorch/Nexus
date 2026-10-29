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
  reverse: 'Returns toward the firer halfway through its life'
};

export const DOCTRINES = [
  { key: 'std', name: 'Standard', prefix: '', mods: {}, flags: {}, passive: 'Balanced ammunition', weakness: 'No special effect' },
  { key: 'prc', name: 'Piercing', prefix: 'Piercing', mods: { dm: 0.78, pn: 1.6 }, flags: { pierce: 3 }, passive: 'Rounds pass through lines of enemies', weakness: 'Lower damage per hit' },
  { key: 'vol', name: 'Volatile', prefix: 'Volatile', mods: { dm: 0.62, r: 1.18 }, flags: { explode: 1 }, passive: 'Rounds explode in an area', weakness: 'Slower reload, weak direct hits' },
  { key: 'skr', name: 'Seeker', prefix: 'Seeker', mods: { dm: 0.86, sp: 0.85 }, flags: { home: 1 }, passive: 'Rounds track nearby enemies', weakness: 'Slower projectiles are easier to block' },
  { key: 'ric', name: 'Ricochet', prefix: 'Ricochet', mods: { dm: 0.9, lf: 1.45 }, flags: { bounce: 3 }, passive: 'Rounds bounce off walls', weakness: 'Strays can be wasted in open arenas' },
  { key: 'cls', name: 'Cluster', prefix: 'Cluster', mods: { dm: 0.66, r: 1.1 }, flags: { split: 4 }, passive: 'Rounds burst into fragments', weakness: 'Fragments do little against armor' },
  { key: 'arc', name: 'Arc', prefix: 'Arc', mods: { dm: 0.8, r: 1.08 }, flags: { chain: 1 }, passive: 'Hits arc to a second target', weakness: 'Chain needs enemies grouped together' },
  { key: 'mnd', name: 'Mender', prefix: 'Mender', mods: { dm: 0.68 }, flags: { heal: 1.1 }, passive: 'Rounds heal allies they touch', weakness: 'Much lower damage' }
];

export const BODY_DOCTRINES = {
  std: { name: 'Standard', body: {}, passive: 'Plain ram plating', weakness: 'No special effect' },
  prc: { name: 'Plated', body: { armor: 0.25, speed: 0.9 }, passive: 'Takes 25% less damage', weakness: '10% slower' },
  vol: { name: 'Volatile', body: { blast: 1 }, passive: 'Contact triggers an explosion once a second', weakness: 'Lower base body damage' },
  skr: { name: 'Magnetic', body: { magnet: 1 }, passive: 'Pulls nearby enemies inward', weakness: 'Also pulls you into crowds' },
  ric: { name: 'Bouncer', body: { knock: 2.5 }, passive: 'Massive knockback on impact', weakness: 'Hard to stay in contact' },
  cls: { name: 'Shrapnel', body: { shards: 1 }, passive: 'Sheds shards when struck', weakness: 'Lower body damage' },
  arc: { name: 'Static', body: { staticArc: 1 }, passive: 'Contact damage arcs to a second enemy', weakness: 'Lower body damage' },
  mnd: { name: 'Leech', body: { leech: 0.35 }, passive: 'Body damage heals you', weakness: 'Less maximum health' }
};
