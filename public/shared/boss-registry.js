export const ATTACK_PRIMITIVES = [
  'radial', 'spiral', 'aimed', 'zones', 'charge', 'summon', 'laser', 'shock', 'mines', 'teleport',
  'shield', 'gravity', 'walls', 'remote', 'regen', 'trail', 'bolt', 'mirror', 'corrupt', 'envOff',
  'convert', 'doors', 'formation', 'darkness', 'vines', 'plating'
];

const A = (k, cd, o = {}) => ({ k, cd, ...o });

export const BOSSES = [
  {
    key: 'nexus_warden', name: 'The Nexus Warden', title: 'Guardian Engine', shape: 'fortress', sides: 8, r: 110, hp: 26000, armor: 0.35,
    color: '#ff5a5a', speed: 40, move: 'anchor', xp: 9000, cores: 3, largeScale: false,
    attacks: {
      array: A('radial', 2.2, { n: 16, sp: 300, dm: 14, rot: 11 }),
      barrage: A('radial', 6, { n: 28, sp: 220, dm: 12, waves: 3, gap: 0.35 }),
      cannon: A('aimed', 3.5, { n: 1, sp: 520, dm: 60, sz: 26, tele: 0.8, pn: 6 }),
      drones: A('summon', 9, { mob: 'bossDrone', n: 4, max: 8 }),
      zones: A('zones', 5, { n: 5, r: 110, delay: 1.4, dm: 70 }),
      eshield: A('shield', 16, { dur: 4, armor: 0.92 })
    },
    parts: [
      { key: 'coilN', ang: 45, dist: 0.95, r: 26, hp: 2400, link: 0.4, overloadLink: 1.4 },
      { key: 'coilE', ang: 135, dist: 0.95, r: 26, hp: 2400, link: 0.4, overloadLink: 1.4 },
      { key: 'coilS', ang: 225, dist: 0.95, r: 26, hp: 2400, link: 0.4, overloadLink: 1.4 },
      { key: 'coilW', ang: 315, dist: 0.95, r: 26, hp: 2400, link: 0.4, overloadLink: 1.4, disables: ['eshield'] }
    ],
    phases: [
      { at: 1, name: 'Defensive Bombardment', attacks: ['array', 'cannon', 'zones'] },
      { at: 0.75, name: 'Drone Deployment', attacks: ['array', 'cannon', 'drones', 'eshield'] },
      { at: 0.5, name: 'Shield Overload', attacks: ['barrage', 'zones'], armor: 0, vuln: 1.8, overload: true, onEnter: ['barrage'] },
      { at: 0.25, name: 'Final Assault', attacks: ['array', 'barrage', 'cannon', 'drones', 'zones'], cdMul: 0.7 }
    ]
  },
  {
    key: 'devourer', name: 'The Labyrinth Devourer', title: 'Maze Hunter', shape: 'worm', sides: 0, r: 78, hp: 22000, armor: 0.2,
    color: '#c44dff', speed: 150, move: 'chase', breaksWalls: true, xp: 8000, cores: 3,
    attacks: {
      charge: A('charge', 5, { sp: 820, dur: 0.9, tele: 0.9, dm: 90 }),
      sweep: A('aimed', 3, { n: 9, spread: 110, sp: 330, dm: 14 }),
      block: A('walls', 11, { len: 5, dur: 9, tele: 1.2 }),
      brood: A('summon', 8, { mob: 'crasher', n: 6, max: 14 }),
      mark: A('zones', 6, { n: 3, r: 130, delay: 1.5, dm: 80, around: 'targets' }),
      shell: A('shield', 14, { dur: 3, armor: 0.85, regen: 0.03 })
    },
    phases: [
      { at: 1, name: 'Stalking', attacks: ['charge', 'sweep', 'brood'] },
      { at: 0.6, name: 'Feeding Frenzy', attacks: ['charge', 'sweep', 'block', 'mark', 'shell'], speedMul: 1.2 },
      { at: 0.3, name: 'Starving', attacks: ['charge', 'mark', 'brood', 'block'], cdMul: 0.65, speedMul: 1.35 }
    ]
  },
  {
    key: 'prismatic_overmind', name: 'The Prismatic Overmind', title: 'Lattice Mind', shape: 'diamond', sides: 4, r: 86, hp: 20000, armor: 0.85,
    color: '#7df0ff', speed: 70, move: 'hover', xp: 8500, cores: 3,
    attacks: {
      lasers: A('laser', 7, { arms: 2, len: 900, turn: 40, dur: 4, tele: 1.2, dps: 120 }),
      formation: A('summon', 10, { mob: 'bossDrone', n: 6, max: 10 }),
      reflect: A('radial', 3, { n: 12, sp: 340, dm: 14, bounce: 3 }),
      multi: A('radial', 4.5, { n: 10, sp: 260, dm: 13, waves: 4, gap: 0.25, rot: 9 }),
      burst: A('aimed', 2.4, { n: 5, spread: 30, sp: 520, dm: 16 })
    },
    parts: [
      { key: 'weak', ang: 0, dist: 1.05, r: 28, hp: 99999, link: 1.25, relocate: 6, orbit: 0.4, invulnPart: true }
    ],
    phases: [
      { at: 1, name: 'Refraction', attacks: ['reflect', 'burst', 'formation'] },
      { at: 0.65, name: 'Laser Lattice', attacks: ['lasers', 'reflect', 'burst'] },
      { at: 0.3, name: 'Overmind', attacks: ['lasers', 'multi', 'formation', 'burst'], cdMul: 0.75 }
    ]
  },
  {
    key: 'siege_colossus', name: 'The Siege Colossus', title: 'Walking Fortress', shape: 'tank', sides: 4, r: 100, hp: 30000, armor: 0.25,
    color: '#ffb23d', speed: 55, move: 'hover', frontArmor: 0.7, rearBonus: 1.5, breaksWalls: true, xp: 10000, cores: 4,
    attacks: {
      shells: A('aimed', 3, { n: 3, spread: 40, sp: 240, dm: 30, sz: 22, kind: 'shell', explode: 1.4, split: 6 }),
      cannons: A('aimed', 2, { n: 1, sp: 600, dm: 40, burst: 3, gap: 0.2 }),
      turrets: A('summon', 12, { mob: 'cannonTurret', n: 2, max: 4 }),
      quake: A('shock', 7, { sp: 420, max: 700, dm: 55, tele: 1 }),
      plating: A('plating', 15, { dur: 5, armor: 0.75 })
    },
    phases: [
      { at: 1, name: 'Bombardment', attacks: ['shells', 'cannons'] },
      { at: 0.6, name: 'Entrench', attacks: ['shells', 'cannons', 'turrets', 'plating'] },
      { at: 0.3, name: 'Earthbreaker', attacks: ['shells', 'quake', 'turrets', 'cannons'], cdMul: 0.75 }
    ]
  },
  {
    key: 'hive_sovereign', name: 'The Hive Sovereign', title: 'Brood Mother', shape: 'hive', sides: 6, r: 90, hp: 21000, armor: 0.2,
    color: '#ffc23d', speed: 45, move: 'hover', xp: 9000, cores: 3, largeScale: true,
    attacks: {
      brood: A('summon', 4, { mob: 'hiveling', n: 8, max: 40 }),
      drones: A('summon', 9, { mob: 'bossDrone', n: 4, max: 8 }),
      swarm: A('aimed', 3, { n: 8, spread: 120, sp: 260, dm: 10, kind: 'swarm', home: 1 }),
      spiral: A('spiral', 9, { arms: 4, dur: 4, rate: 6, sp: 260, dm: 11, turn: 70 }),
      regen: A('regen', 18, { frac: 0.08, dur: 5 })
    },
    phases: [
      { at: 1, name: 'Hatching', attacks: ['brood', 'swarm'] },
      { at: 0.6, name: 'Swarm Tide', attacks: ['brood', 'drones', 'swarm', 'spiral'] },
      { at: 0.3, name: 'Royal Fury', attacks: ['brood', 'drones', 'spiral', 'regen', 'swarm'], cdMul: 0.7 }
    ]
  },
  {
    key: 'void_architect', name: 'The Void Architect', title: 'Space Folder', shape: 'star', sides: 5, r: 75, hp: 19000, armor: 0.25,
    color: '#9b6bff', speed: 0, move: 'teleport', xp: 9000, cores: 3,
    attacks: {
      fold: A('teleport', 6, { tele: 1.3, range: 700 }),
      portals: A('remote', 5, { n: 3, ringN: 10, sp: 260, dm: 13, tele: 1.3 }),
      barriers: A('walls', 10, { len: 6, dur: 8, tele: 1.5 }),
      gravity: A('gravity', 9, { r: 320, str: 520, dur: 4, tele: 1 }),
      dimension: A('radial', 3, { n: 14, sp: 300, dm: 12, reverse: 1 })
    },
    phases: [
      { at: 1, name: 'Folding', attacks: ['fold', 'portals', 'dimension'] },
      { at: 0.6, name: 'Rebuilding', attacks: ['fold', 'portals', 'barriers', 'gravity'] },
      { at: 0.3, name: 'Collapse', attacks: ['fold', 'portals', 'barriers', 'gravity', 'dimension'], cdMul: 0.7 }
    ]
  },
  {
    key: 'ancient_gunner', name: 'The Ancient Gunner', title: 'Adaptive Warmachine', shape: 'tank', sides: 0, r: 72, hp: 24000, armor: 0.3,
    color: '#d9d9d9', speed: 110, move: 'hover', adaptive: true, xp: 9500, cores: 4,
    attacks: {
      snipe: A('aimed', 1.6, { n: 1, sp: 900, dm: 55, tele: 0.6, pn: 4 }),
      artillery: A('zones', 3, { n: 4, r: 120, delay: 1.3, dm: 70, around: 'targets' }),
      rapid: A('aimed', 0.25, { n: 1, spread: 20, sp: 560, dm: 9 }),
      drones: A('summon', 6, { mob: 'bossDrone', n: 4, max: 8 }),
      guard: A('shield', 9, { dur: 3, armor: 0.85 }),
      overdrive: A('radial', 1.2, { n: 18, sp: 380, dm: 13, rot: 13 }),
      close: A('shock', 4, { sp: 500, max: 420, dm: 50, tele: 0.6 })
    },
    modes: {
      sniper: ['snipe', 'drones'],
      artillery: ['artillery', 'snipe'],
      rapid: ['rapid', 'close'],
      drone: ['drones', 'rapid'],
      defensive: ['guard', 'close', 'rapid'],
      overdrive: ['overdrive', 'rapid', 'artillery', 'snipe']
    },
    phases: [
      { at: 1, name: 'Assessment', attacks: ['snipe', 'rapid'] },
      { at: 0.7, name: 'Adaptation', attacks: [], adaptive: true },
      { at: 0.2, name: 'Final Overdrive', attacks: ['overdrive', 'rapid', 'artillery', 'snipe'], cdMul: 0.8, speedMul: 1.3 }
    ]
  },
  {
    key: 'fractured_king', name: 'The Fractured King', title: 'Broken Monarch', shape: 'crown', sides: 6, r: 96, hp: 32000, armor: 0.2,
    color: '#ffd84d', speed: 50, move: 'hover', xp: 12000, cores: 5,
    attacks: {
      lance: A('laser', 6, { arms: 1, len: 1000, turn: 25, dur: 2.5, tele: 1.1, dps: 160 }),
      missiles: A('aimed', 4, { n: 6, spread: 140, sp: 280, dm: 18, home: 1.2 }),
      mortar: A('zones', 5, { n: 4, r: 120, delay: 1.4, dm: 75, around: 'targets' }),
      royal: A('radial', 3, { n: 20, sp: 300, dm: 12, rot: 9 }),
      split: A('summon', 30, { mob: 'kingShard', n: 2, max: 2 }),
      desperation: A('spiral', 6, { arms: 5, dur: 4, rate: 7, sp: 300, dm: 12, turn: -90 }),
      quake: A('shock', 6, { sp: 450, max: 650, dm: 50, tele: 0.9 })
    },
    parts: [
      { key: 'plateA', ang: 0, dist: 0.9, r: 30, hp: 3000, shieldsCore: true, stage: 0 },
      { key: 'plateB', ang: 90, dist: 0.9, r: 30, hp: 3000, shieldsCore: true, stage: 0 },
      { key: 'plateC', ang: 180, dist: 0.9, r: 30, hp: 3000, shieldsCore: true, stage: 0 },
      { key: 'plateD', ang: 270, dist: 0.9, r: 30, hp: 3000, shieldsCore: true, stage: 0 },
      { key: 'lanceGun', ang: 45, dist: 1.15, r: 24, hp: 2600, disables: ['lance'] },
      { key: 'missilePod', ang: 165, dist: 1.15, r: 24, hp: 2600, disables: ['missiles'] },
      { key: 'mortarBay', ang: 285, dist: 1.15, r: 24, hp: 2600, disables: ['mortar'] }
    ],
    phases: [
      { at: 1, name: 'Outer Armor', attacks: ['royal', 'lance', 'missiles', 'mortar'] },
      { at: 0.8, name: 'Weapon Systems', attacks: ['lance', 'missiles', 'mortar', 'royal'] },
      { at: 0.6, name: 'Core Exposed', attacks: ['royal', 'lance', 'missiles', 'mortar', 'quake'], vuln: 1.5 },
      { at: 0.4, name: 'Split Core', attacks: ['royal', 'split'], onEnter: ['split'], shieldWhileMinions: 'kingShard' },
      { at: 0.15, name: 'Desperation', attacks: ['desperation', 'royal', 'quake', 'missiles'], cdMul: 0.6 }
    ]
  },
  {
    key: 'infinite_swarm', name: 'The Infinite Swarm', title: 'Hundredfold Queen', shape: 'swarmqueen', sides: 3, r: 60, hp: 15000, armor: 0.1,
    color: '#ff8fd8', speed: 90, move: 'hover', xp: 9000, cores: 3, largeScale: true, swarmCap: 140,
    attacks: {
      spawn: A('summon', 2, { mob: 'swarmling', n: 20, max: 140 }),
      ring: A('formation', 8, { shape: 'ring', dur: 4 }),
      wedge: A('formation', 9, { shape: 'wedge', dur: 3 }),
      spiralF: A('formation', 10, { shape: 'spiral', dur: 4 }),
      sting: A('aimed', 2, { n: 3, spread: 20, sp: 480, dm: 15 })
    },
    phases: [
      { at: 1, name: 'Gathering', attacks: ['spawn', 'ring', 'sting'] },
      { at: 0.6, name: 'Hunting Pack', attacks: ['spawn', 'wedge', 'ring', 'sting'] },
      { at: 0.3, name: 'Endless Tide', attacks: ['spawn', 'wedge', 'spiralF', 'ring', 'sting'], cdMul: 0.7 }
    ]
  },
  {
    key: 'null_nexus', name: 'The Null Nexus', title: 'World Eater', shape: 'nullcore', sides: 12, r: 120, hp: 40000, armor: 0.3,
    color: '#e0e0ff', speed: 30, move: 'anchor', rare: true, xp: 20000, cores: 8, largeScale: true,
    attacks: {
      corrupt: A('corrupt', 10, { r: 1400, dur: 15 }),
      hazards: A('zones', 4, { n: 6, r: 140, delay: 1.5, dm: 60, field: 6 }),
      elites: A('summon', 16, { mob: 'elite', n: 2, max: 4 }),
      nullify: A('envOff', 25, { dur: 15 }),
      convert: A('convert', 8, { r: 420 }),
      nova: A('radial', 2.5, { n: 30, sp: 260, dm: 14, rot: 6 }),
      lattice: A('laser', 8, { arms: 4, len: 1100, turn: 30, dur: 4, tele: 1.3, dps: 140 })
    },
    phases: [
      { at: 1, name: 'Arrival', attacks: ['corrupt', 'hazards', 'nova'] },
      { at: 0.7, name: 'Erosion', attacks: ['corrupt', 'hazards', 'elites', 'nullify', 'convert'] },
      { at: 0.4, name: 'Singularity', attacks: ['lattice', 'nova', 'hazards', 'convert', 'elites'] },
      { at: 0.15, name: 'Null Escalation', attacks: ['lattice', 'nova', 'hazards', 'convert'], cdMul: 0.55 }
    ]
  },
  {
    key: 'ember_leviathan', name: 'The Ember Leviathan', title: 'Burning Tide', shape: 'serpent', sides: 0, r: 84, hp: 20000, armor: 0.2,
    color: '#ff7a2d', speed: 120, move: 'orbit', xp: 8000, cores: 3,
    attacks: {
      trail: A('trail', 10, { dur: 6 }),
      spiral: A('spiral', 8, { arms: 3, dur: 3, rate: 8, sp: 280, dm: 11, turn: 120 }),
      lunge: A('charge', 6, { sp: 760, dur: 0.8, tele: 0.9, dm: 80 }),
      imps: A('summon', 9, { mob: 'emberImp', n: 5, max: 12 }),
      flare: A('zones', 5, { n: 5, r: 100, delay: 1.2, dm: 60, field: 4 })
    },
    phases: [
      { at: 1, name: 'Smoulder', attacks: ['trail', 'spiral', 'imps'] },
      { at: 0.5, name: 'Inferno', attacks: ['trail', 'spiral', 'lunge', 'flare', 'imps'], cdMul: 0.8, speedMul: 1.25 }
    ]
  },
  {
    key: 'glacier_bastion', name: 'The Glacier Bastion', title: 'Frozen Rampart', shape: 'shard', sides: 6, r: 100, hp: 26000, armor: 0.4,
    color: '#9fe8ff', speed: 35, move: 'anchor', xp: 9000, cores: 3,
    attacks: {
      shards: A('aimed', 2.5, { n: 7, spread: 60, sp: 420, dm: 14, chill: 2 }),
      walls: A('walls', 9, { len: 7, dur: 10, tele: 1.4, tile: 3 }),
      quake: A('shock', 7, { sp: 380, max: 650, dm: 45, tele: 1, chill: 3 }),
      icicles: A('summon', 12, { mob: 'icicle', n: 3, max: 6 }),
      blizzard: A('radial', 4, { n: 24, sp: 240, dm: 10, waves: 2, gap: 0.4, chill: 1.5 })
    },
    phases: [
      { at: 1, name: 'Permafrost', attacks: ['shards', 'walls', 'icicles'] },
      { at: 0.5, name: 'Blizzard', attacks: ['shards', 'walls', 'quake', 'blizzard', 'icicles'], cdMul: 0.8 }
    ]
  },
  {
    key: 'storm_herald', name: 'The Storm Herald', title: 'Thunder Caller', shape: 'bolt', sides: 3, r: 72, hp: 18000, armor: 0.2,
    color: '#ffe85a', speed: 150, move: 'hover', xp: 8000, cores: 3,
    attacks: {
      bolt: A('bolt', 2.6, { n: 3, dm: 45, tele: 0.8, chain: 2 }),
      lasers: A('laser', 7, { arms: 3, len: 800, turn: 60, dur: 3, tele: 1, dps: 110 }),
      hop: A('teleport', 7, { tele: 0.9, range: 500 }),
      static: A('radial', 2, { n: 12, sp: 420, dm: 11 })
    },
    phases: [
      { at: 1, name: 'Gathering Clouds', attacks: ['bolt', 'static', 'hop'] },
      { at: 0.5, name: 'Tempest', attacks: ['bolt', 'lasers', 'static', 'hop'], cdMul: 0.75 }
    ]
  },
  {
    key: 'mirror_duelist', name: 'The Mirror Duelist', title: 'Reflection Knight', shape: 'blade', sides: 4, r: 60, hp: 16000, armor: 0.15,
    color: '#e8e8ff', speed: 170, move: 'hover', xp: 7500, cores: 3,
    attacks: {
      stance: A('mirror', 8, { dur: 3 }),
      riposte: A('aimed', 1.4, { n: 3, spread: 16, sp: 640, dm: 15 }),
      lunge: A('charge', 5, { sp: 900, dur: 0.5, tele: 0.7, dm: 70 }),
      fan: A('radial', 5, { n: 16, sp: 360, dm: 12 })
    },
    phases: [
      { at: 1, name: 'En Garde', attacks: ['stance', 'riposte', 'lunge'] },
      { at: 0.5, name: 'Mirror Dance', attacks: ['stance', 'riposte', 'lunge', 'fan'], cdMul: 0.7 }
    ]
  },
  {
    key: 'clockwork_tyrant', name: 'The Clockwork Tyrant', title: 'Gear Despot', shape: 'gear', sides: 12, r: 92, hp: 24000, armor: 0.3,
    color: '#d9a85a', speed: 40, move: 'anchor', xp: 9000, cores: 4,
    attacks: {
      hands: A('laser', 6, { arms: 2, len: 950, turn: 30, dur: 5, tele: 1.2, dps: 130 }),
      tick: A('radial', 1.5, { n: 12, sp: 300, dm: 12, rot: 30 }),
      doors: A('doors', 7, {}),
      chime: A('shock', 8, { sp: 400, max: 700, dm: 50, tele: 1 }),
      cogs: A('aimed', 3, { n: 4, spread: 60, sp: 300, dm: 18, sz: 18, bounce: 4 })
    },
    parts: [
      { key: 'gearA', ang: 0, dist: 1.2, r: 30, hp: 3200, orbit: 0.6, disables: ['hands'] },
      { key: 'gearB', ang: 120, dist: 1.2, r: 30, hp: 3200, orbit: 0.6, disables: ['chime'] },
      { key: 'gearC', ang: 240, dist: 1.2, r: 30, hp: 3200, orbit: 0.6, disables: ['cogs'] }
    ],
    phases: [
      { at: 1, name: 'Wind Up', attacks: ['tick', 'doors', 'cogs'] },
      { at: 0.6, name: 'Clockwork', attacks: ['hands', 'tick', 'doors', 'chime', 'cogs'] },
      { at: 0.25, name: 'Midnight', attacks: ['hands', 'tick', 'chime', 'cogs'], cdMul: 0.6 }
    ]
  },
  {
    key: 'bloom_matriarch', name: 'The Bloom Matriarch', title: 'Rootmother', shape: 'flower', sides: 7, r: 92, hp: 22000, armor: 0.2,
    color: '#6fe36b', speed: 20, move: 'anchor', xp: 8500, cores: 3,
    attacks: {
      vines: A('vines', 7, { n: 10, dur: 14, tele: 1.2 }),
      pods: A('summon', 10, { mob: 'bloomPod', n: 3, max: 8 }),
      spores: A('aimed', 2.5, { n: 6, spread: 360, sp: 200, dm: 13, kind: 'swarm', home: 1 }),
      bloom: A('regen', 15, { frac: 0.06, dur: 6 }),
      pollen: A('zones', 6, { n: 4, r: 150, delay: 1.5, dm: 40, field: 6 })
    },
    phases: [
      { at: 1, name: 'Sprouting', attacks: ['vines', 'spores', 'pods'] },
      { at: 0.5, name: 'Full Bloom', attacks: ['vines', 'spores', 'pods', 'bloom', 'pollen'], cdMul: 0.8 }
    ]
  },
  {
    key: 'riftstalker', name: 'The Riftstalker', title: 'Ambush Predator', shape: 'claw', sides: 3, r: 56, hp: 15000, armor: 0.1,
    color: '#7a5aff', speed: 220, move: 'chase', cloaks: true, xp: 7500, cores: 3,
    attacks: {
      blink: A('teleport', 5, { tele: 0.7, range: 420, behind: true }),
      pounce: A('charge', 4, { sp: 950, dur: 0.45, tele: 0.6, dm: 75 }),
      mines: A('mines', 7, { n: 6, dm: 40 }),
      slash: A('aimed', 1.8, { n: 5, spread: 70, sp: 460, dm: 13 })
    },
    phases: [
      { at: 1, name: 'Hunting', attacks: ['blink', 'pounce', 'slash'] },
      { at: 0.5, name: 'Frenzy', attacks: ['blink', 'pounce', 'mines', 'slash'], cdMul: 0.7, speedMul: 1.2 }
    ]
  },
  {
    key: 'iron_choir', name: 'The Iron Choir', title: 'Chorus of Cannons', shape: 'choir', sides: 4, r: 80, hp: 23000, armor: 0.3,
    color: '#b8c4d4', speed: 30, move: 'anchor', xp: 9000, cores: 4, largeScale: true,
    attacks: {
      verse: A('radial', 2.4, { n: 14, sp: 300, dm: 12, rot: 13 }),
      chorus: A('shock', 6, { sp: 420, max: 720, dm: 45, tele: 0.9 }),
      solo: A('aimed', 1.8, { n: 3, spread: 18, sp: 560, dm: 18 }),
      crescendo: A('spiral', 9, { arms: 4, dur: 4, rate: 6, sp: 300, dm: 11, turn: 90 })
    },
    parts: [
      { key: 'tenor', ang: 0, dist: 1.6, r: 34, hp: 3600, shieldsCore: true, fires: 'radial' },
      { key: 'alto', ang: 90, dist: 1.6, r: 34, hp: 3600, shieldsCore: true, fires: 'aimed' },
      { key: 'bass', ang: 180, dist: 1.6, r: 34, hp: 3600, shieldsCore: true, fires: 'radial' },
      { key: 'soprano', ang: 270, dist: 1.6, r: 34, hp: 3600, shieldsCore: true, fires: 'aimed' }
    ],
    phases: [
      { at: 1, name: 'Overture', attacks: ['verse', 'solo'] },
      { at: 0.5, name: 'Crescendo', attacks: ['verse', 'chorus', 'solo', 'crescendo'], cdMul: 0.8 }
    ]
  },
  {
    key: 'abyssal_lantern', name: 'The Abyssal Lantern', title: 'Light in the Deep', shape: 'lantern', sides: 0, r: 70, hp: 18000, armor: 0.6,
    color: '#5affd0', speed: 80, move: 'hover', xp: 8000, cores: 3,
    attacks: {
      dark: A('darkness', 14, { dur: 7, r: 900 }),
      lures: A('aimed', 3, { n: 5, spread: 360, sp: 160, dm: 20, sz: 18, home: 0.8 }),
      gaze: A('laser', 7, { arms: 1, len: 900, turn: 50, dur: 3, tele: 1, dps: 140 }),
      flicker: A('radial', 3, { n: 18, sp: 280, dm: 12 })
    },
    parts: [
      { key: 'flame', ang: 0, dist: 1.05, r: 26, hp: 99999, link: 1.6, invulnPart: true, orbit: 0.9 }
    ],
    phases: [
      { at: 1, name: 'Glimmer', attacks: ['lures', 'flicker', 'dark'] },
      { at: 0.5, name: 'Abyss', attacks: ['lures', 'gaze', 'flicker', 'dark'], cdMul: 0.8 }
    ]
  },
  {
    key: 'shard_hydra', name: 'The Shard Hydra', title: 'Many-Headed Prism', shape: 'hydra', sides: 5, r: 82, hp: 21000, armor: 0.75,
    color: '#ff6bb5', speed: 50, move: 'hover', xp: 9000, cores: 4,
    attacks: {
      bite: A('aimed', 1.8, { n: 3, spread: 30, sp: 500, dm: 15 }),
      breath: A('spiral', 8, { arms: 3, dur: 3, rate: 7, sp: 300, dm: 11, turn: 50 }),
      roar: A('shock', 9, { sp: 400, max: 600, dm: 45, tele: 0.9 })
    },
    parts: [
      { key: 'head1', ang: -40, dist: 1.25, r: 30, hp: 3000, regrow: 14, fires: 'aimed', heads: true },
      { key: 'head2', ang: 0, dist: 1.35, r: 30, hp: 3000, regrow: 14, fires: 'aimed', heads: true },
      { key: 'head3', ang: 40, dist: 1.25, r: 30, hp: 3000, regrow: 14, fires: 'aimed', heads: true }
    ],
    headsExpose: 0.05,
    phases: [
      { at: 1, name: 'Three Heads', attacks: ['bite', 'breath'] },
      { at: 0.5, name: 'Regrowth', attacks: ['bite', 'breath', 'roar'], cdMul: 0.8 }
    ]
  }
];

export const BOSS_BY_KEY = Object.fromEntries(BOSSES.map((b, i) => [b.key, { ...b, index: i }]));
BOSSES.forEach((b, i) => { b.index = i; });

export function validateBosses(mobKeys) {
  const errors = [];
  const keys = new Set();
  for (const b of BOSSES) {
    if (keys.has(b.key)) errors.push(`duplicate boss ${b.key}`);
    keys.add(b.key);
    if (!(b.hp > 0 && b.r > 0)) errors.push(`${b.key}: bad hp/r`);
    if (!b.phases.length) errors.push(`${b.key}: no phases`);
    let last = 2;
    for (const p of b.phases) {
      if (!(p.at <= 1 && p.at > 0 && p.at < last)) errors.push(`${b.key}: phase thresholds must descend`);
      last = p.at;
      for (const a of [...p.attacks, ...(p.onEnter || [])]) if (!b.attacks[a]) errors.push(`${b.key}: phase uses missing attack ${a}`);
    }
    for (const [k, a] of Object.entries(b.attacks)) {
      if (!ATTACK_PRIMITIVES.includes(a.k)) errors.push(`${b.key}.${k}: unknown primitive ${a.k}`);
      if (!(a.cd > 0)) errors.push(`${b.key}.${k}: cooldown must be positive`);
      if (a.k === 'summon' && mobKeys && !mobKeys.includes(a.mob)) errors.push(`${b.key}.${k}: unknown mob ${a.mob}`);
      if (a.tele !== undefined && a.tele < 0.5) errors.push(`${b.key}.${k}: telegraph shorter than 0.5s`);
    }
    for (const part of b.parts || []) for (const d of part.disables || []) if (!b.attacks[d]) errors.push(`${b.key}.${part.key}: disables missing attack ${d}`);
    if (b.modes) for (const [m, list] of Object.entries(b.modes)) for (const a of list) if (!b.attacks[a]) errors.push(`${b.key} mode ${m}: missing ${a}`);
  }
  return {
    ok: errors.length === 0,
    errors,
    count: BOSSES.length,
    multiPhase: BOSSES.filter(b => b.phases.length >= 2).length,
    withParts: BOSSES.filter(b => (b.parts || []).length).length,
    envInteract: BOSSES.filter(b => b.breaksWalls || Object.values(b.attacks).some(a => ['walls', 'doors', 'vines', 'envOff', 'corrupt', 'teleport'].includes(a.k))).length,
    largeScale: BOSSES.filter(b => b.largeScale).length
  };
}
