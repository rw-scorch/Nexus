const DEG = Math.PI / 180;
const R3 = v => Math.round(v * 1000) / 1000;

export function barrel(L, W, asp = 1, X = 0, Y = 0, A = 0, D = 0, p = null) {
  const a = A * DEG;
  const g = {
    a: A, x: R3((X * Math.cos(a) - Y * Math.sin(a)) / 10), y: R3((X * Math.sin(a) + Y * Math.cos(a)) / 10),
    len: R3(L / 10), w: R3(W / 20), asp, d: D % 1
  };
  if (!p) { g.deco = true; return g; }
  return { ...g, k: 'bullet', r: 1, dm: 1, pn: 1, sp: 1, lf: 1, sz: 1, s: 0.04, rec: 1, n: 1, fx: {}, ...p };
}

const mirror = (L, W, asp, X, Y, A, D, p) => [barrel(L, W, asp, X, Y, A, D, p), barrel(L, W, asp, X, -Y, -A, (D + 0.5) % 1, p)];
const ring = (n, L, W, asp, X, p, start = 0) => Array.from({ length: n }, (_, i) => barrel(L, W, asp, X, 0, start + 360 / n * i, (i % 2) * 0.5, p));
const beam = (o = {}) => ({ k: 'beam', r: 2.2, dm: 1.6, sp: 1, s: 0, rec: 0.6, ...o });
const trapLauncher = (A, p, Y = 0) => [barrel(14, 8, 1, 0, Y, A), barrel(3, 8, 1.7, 14, Y, A, 0, { k: 'trap', r: 2.2, dm: 1, sp: 0.8, pn: 1.4, lf: 1, sz: 0.7, s: 0, rec: 0.3, ...p })];
const spawner = (A, p) => barrel(6, 11, 1.2, 8, 0, A, 0, { k: 'drone', r: 1.7, dm: 1.2, sp: 1, pn: 0.8, sz: 0.55, s: 0, rec: 0.2, max: 3, ...p });

export const NEXUS_TANKS = [
  { id: 'lancer', name: 'Lancer', level: 15, parents: ['basic'], tip: 'Fires an instant energy beam.', guns: [barrel(21, 7, 1, 0, 0, 0, 0, beam()), barrel(10, 11, -0.6, 4)] },
  { id: 'prism', name: 'Prism', level: 30, parents: ['lancer'], tip: 'Its beam bounces once off walls.', guns: [barrel(22, 8, 1, 0, 0, 0, 0, beam({ fx: { bounce: 1 }, dm: 1.9 })), barrel(10, 12, -0.6, 4)] },
  { id: 'arcLancer', name: 'Arc Lancer', level: 30, parents: ['lancer'], tip: 'Beam hits arc to a second target.', guns: [barrel(21, 8, 1, 0, 0, 0, 0, beam({ fx: { chain: 1 }, dm: 1.7 })), barrel(8, 13, -0.5, 6)] },
  { id: 'tractor', name: 'Tractor', level: 30, parents: ['lancer'], tip: 'Beam drags enemies toward you.', stats: { hp: 1.1 }, guns: [barrel(19, 10, 1, 0, 0, 0, 0, beam({ fx: { pull: 1 }, dm: 1.4, sp: 0.85 })), barrel(10, 14, -0.6, 4)] },
  { id: 'twinLance', name: 'Twin Lance', level: 30, parents: ['lancer', 'twin'], tip: 'Two alternating beams.', guns: mirror(20, 7, 1, 0, 5.5, 0, 0, beam({ r: 2, dm: 1.1 })) },
  { id: 'spectrum', name: 'Spectrum', level: 45, parents: ['prism'], tip: 'Three bouncing beams in a fan.', guns: [barrel(22, 7, 1, 0, 0, 0, 0, beam({ fx: { bounce: 1 }, dm: 1.4, r: 2.4 })), ...mirror(19, 7, 1, 0, 2, 20, 0.33, beam({ fx: { bounce: 1 }, dm: 1, r: 2.4 }))] },
  { id: 'tesla', name: 'Tesla', level: 45, parents: ['arcLancer'], tip: 'Chaining beam that bursts on impact.', guns: [barrel(22, 9, 1, 0, 0, 0, 0, beam({ fx: { chain: 2, explode: 0.6 }, dm: 1.6, r: 2.6 })), barrel(8, 15, -0.5, 6)] },
  { id: 'gravityWell', name: 'Gravity Well', level: 45, parents: ['tractor'], tip: 'Pulls enemies in, then detonates.', stats: { hp: 1.15, speed: 0.92 }, guns: [barrel(20, 12, 1, 0, 0, 0, 0, beam({ fx: { pull: 1.4, explode: 0.8 }, dm: 1.3, sp: 0.8, r: 2.8 })), barrel(11, 16, -0.6, 4)] },
  { id: 'ionCannon', name: 'Ion Cannon', level: 45, parents: ['prism', 'arcLancer'], tip: 'Long piercing beam, slow to recharge.', stats: { fov: 1.2 }, guns: [barrel(27, 9, 1, 0, 0, 0, 0, beam({ fx: { pierce: 3, siege: 1 }, dm: 3.6, sp: 1.35, r: 4.4, rec: 2 })), barrel(12, 13, -0.6, 4)] },
  { id: 'lumen', name: 'Lumen', level: 45, parents: ['lancer', 'healer'], tip: 'Beam heals allies and burns enemies.', ability: 'pulse', guns: [barrel(20, 9, 1, 0, 0, 0, 0, beam({ fx: { heal: 1.2 }, dm: 1.2, r: 1.9 })), barrel(10, 12, -0.6, 4)] },
  { id: 'quadLance', name: 'Quad Lance', level: 45, parents: ['twinLance'], tip: 'Beams in four directions.', spin: 0, guns: ring(4, 20, 7, 1, 0, beam({ r: 2.2, dm: 0.9 })) },
  { id: 'supernova', name: 'Supernova', level: 60, parents: ['spectrum', 'tesla'], tip: 'Five beams that bounce and burst.', guns: [barrel(23, 8, 1, 0, 0, 0, 0, beam({ fx: { bounce: 1, explode: 0.5 }, dm: 1.5, r: 2.8 })), ...mirror(20, 7, 1, 0, 2, 18, 0.25, beam({ fx: { bounce: 1 }, dm: 0.9, r: 2.8 })), ...mirror(17, 7, 1, 0, 2, 36, 0.5, beam({ fx: { bounce: 1 }, dm: 0.8, r: 2.8 }))] },
  { id: 'stormcaller', name: 'Stormcaller', level: 60, parents: ['tesla'], tip: 'Arcs leap between whole crowds.', guns: [barrel(22, 10, 1, 0, 0, 0, 0, beam({ fx: { chain: 3 }, dm: 1.7, r: 2.5 })), ...mirror(14, 6, 1, 0, 7, 0, 0.5, beam({ fx: { chain: 1 }, dm: 0.7, r: 2.2, sp: 0.7 }))] },
  { id: 'eventHorizon', name: 'Event Horizon', level: 60, parents: ['gravityWell'], tip: 'Ring of pulling beams around the hull.', stats: { hp: 1.2, speed: 0.88 }, spin: 0.7, guns: ring(6, 18, 8, 1, 0, beam({ fx: { pull: 0.8 }, dm: 0.8, r: 2.6, sp: 0.7 })) },
  { id: 'railstorm', name: 'Railstorm', level: 60, parents: ['ionCannon'], tip: 'Twin piercing rails.', stats: { fov: 1.25 }, guns: mirror(27, 7, 1, 0, 5, 0, 0, beam({ fx: { pierce: 2, siege: 1 }, dm: 2.4, sp: 1.3, r: 3.6, rec: 1.5 })) },
  { id: 'aurora', name: 'Aurora', level: 60, parents: ['lumen', 'medic'], tip: 'Healing beam arcs between allies.', ability: 'shieldAlly', guns: [barrel(21, 10, 1, 0, 0, 0, 0, beam({ fx: { heal: 1.4, chain: 1 }, dm: 1.2, r: 1.8 })), ...mirror(12, 6, 1, 0, 8, 25, 0.5, { fx: { heal: 1 }, dm: 0.5, r: 1.2 })] },

  { id: 'phantom', name: 'Phantom', level: 60, parents: ['ranger', 'stalker'], tip: 'Invisible while still. Piercing rounds.', stealth: 1, stats: { fov: 1.45, speed: 0.95 }, guns: [barrel(32, 8.5, 1, 0, 0, 0, 0, { r: 2.6, dm: 2.4, pn: 2.2, sp: 2.1, lf: 1.25, s: 0.005, fx: { pierce: 2 } }), barrel(5, 8.5, -1.6, 8)] },
  { id: 'howitzer', name: 'Howitzer', level: 60, parents: ['mortar', 'ordnance'], tip: 'Lobs shells that blast walls and crowds.', stats: { fov: 1.2 }, guns: [barrel(19, 14, 1, 0, 0, 0, 0, { k: 'shell', r: 2.8, dm: 2.2, sp: 0.75, pn: 1.6, fx: { explode: 1, siege: 1 }, rec: 2 }), ...mirror(17, 4, 1, 0, 7, 7, 0.5, { r: 1.2, dm: 0.5, sp: 1.1 })] },
  { id: 'obliterator', name: 'Obliterator', level: 60, parents: ['annihilator'], tip: 'One enormous explosive round.', stats: { speed: 0.9, hp: 1.1 }, guns: [barrel(20.5, 21, 1, 0, 0, 0, 0, { k: 'shell', r: 4, dm: 4.4, sp: 0.65, pn: 3, sz: 1, fx: { explode: 1.4 }, rec: 4 })] },
  { id: 'firehose', name: 'Firehose', level: 60, parents: ['sprayer', 'redistributor'], tip: 'A piercing stream of small rounds.', guns: [...mirror(17, 5, 1, 0, 6, 6, 0.25, { r: 0.6, dm: 0.3, sp: 1.1, s: 0.1 }), barrel(23, 7, 1, 0, 0, 0, 0, { r: 0.5, dm: 0.42, pn: 1, sp: 1.15, s: 0.08, fx: { pierce: 1 } }), barrel(12, 10, 1.4, 8, 0, 0, 0.5, { r: 0.5, dm: 0.5, sp: 1, s: 0.18 })] },
  { id: 'ricochet', name: 'Ricochet', level: 60, parents: ['streamliner', 'triplet'], tip: 'Rounds bounce off walls three times.', guns: [barrel(25, 8, 1, 0, 0, 0, 0, { r: 0.45, dm: 0.5, sp: 1.2, lf: 1.4, fx: { bounce: 3 } }), barrel(21, 8, 1, 0, 0, 0, 0.33, { r: 0.45, dm: 0.5, sp: 1.2, lf: 1.4, fx: { bounce: 3 } }), barrel(17, 8, 1, 0, 0, 0, 0.66, { r: 0.45, dm: 0.5, sp: 1.2, lf: 1.4, fx: { bounce: 3 } })] },
  { id: 'interceptor', name: 'Interceptor', level: 60, parents: ['predator', 'barricade'], tip: 'Flak rounds hunt enemy projectiles.', guns: [barrel(24, 8, 1, 0, 0, 0, 0, { r: 1.4, dm: 1.4, sp: 1.6, pn: 1.3 }), ...mirror(14, 5, 1, 0, 7, 30, 0.5, { r: 0.8, dm: 0.6, sp: 1.3, lf: 0.8, fx: { intercept: 1 } })] },
  { id: 'seekerPod', name: 'Seeker Pod', level: 60, parents: ['skimmer', 'sidewinder'], tip: 'Homing missiles that shed sparks.', guns: [...mirror(9, 9, -0.5, 9, 5, 0, 0), ...mirror(16, 10, 1, 0, 5, 0, 0, { k: 'shell', r: 2.6, dm: 1, sp: 0.8, pn: 1.4, fx: { home: 1, missile: 1 }, rec: 0.9 })] },
  { id: 'hivemind', name: 'Hivemind', level: 60, parents: ['overlord', 'overdrive'], tip: 'Eight drones whose hits arc onward.', guns: [0, 90, 180, 270].map(a => spawner(a, { max: 2, fx: { chain: 1 }, dm: 1 })) },
  { id: 'lich', name: 'Lich', level: 60, parents: ['necromancer'], body: 'square', ability: 'reclaim', tip: 'Turns squares into a large drone army.', guns: [0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => barrel(i % 2 ? 4.5 : 6, i % 2 ? 9 : 12, 1.2, 7.4, 0, a, 0, { k: 'drone', r: 1.8, dm: 0.55, pn: 0.5, sz: 0.6, sp: 1, s: 0, rec: 0.1, max: 3 })) },
  { id: 'foundry', name: 'Foundry', level: 60, parents: ['factory'], body: 'square', tip: 'Three bays of armed minions.', guns: [-30, 0, 30].flatMap((a, i) => [barrel(4.5, 9, 1, 10.5, 0, a), barrel(1, 10, 1, 15, 0, a, i / 3, { k: 'minion', r: 3, dm: 0.9, pn: 1.2, sz: 0.65, sp: 1, s: 0, rec: 0.1, max: 2 }), barrel(11.5, 10, 1, 0, 0, a)]) },
  { id: 'citadel', name: 'Citadel', level: 60, parents: ['fortress', 'architect'], body: 'hex', ability: 'barrier', tip: 'Six trap walls and a central turret.', stats: { hp: 1.15, speed: 0.9 }, guns: [0, 60, 120, 180, 240, 300].flatMap(a => trapLauncher(a + 30, { fx: { block: 1 }, r: 2.6, sz: 0.9 })), turrets: [{ x: 0, y: 0, s: 0.55, a: 0, arc: 360, layer: 1, guns: [barrel(22, 10, 1, 0, 0, 0, 0, { r: 1.1, dm: 0.6, sp: 1.1, lf: 0.8 })] }] },
  { id: 'thornback', name: 'Thornback', level: 60, parents: ['spike', 'megaSmasher'], smasher: 1, tip: 'Sheds shards when struck. No guns.', bodyFx: { shards: 1 }, stats: { hp: 1.1, bodyDmg: 1.7, speed: 1.05 }, decos: [{ sides: 3, s: 1.08, a: 0, x: 0, y: 0, layer: 0, spin: 1, dark: 1 }, { sides: 3, s: 1.08, a: 60, x: 0, y: 0, layer: 0, spin: 1, dark: 1 }, { sides: 3, s: 1.08, a: 30, x: 0, y: 0, layer: 0, spin: 1, dark: 1 }], guns: [] },
  { id: 'afterburner', name: 'Afterburner', level: 60, parents: ['booster', 'fighter'], body: 'circle', ability: 'dash', tip: 'Extra thrusters and a dash.', stats: { speed: 1.08 }, guns: [barrel(18, 8, 1, 0, 0, 0, 0, { r: 0.9, dm: 0.7 }), ...mirror(14, 8, 1, 0, 0, 135, 0.25, { r: 1, dm: 0.4, pn: 0.6, rec: 2.8, lf: 0.6 }), ...mirror(16, 8, 1, 0, 0, 155, 0.1, { r: 1, dm: 0.4, pn: 0.6, rec: 2.8, lf: 0.6 }), barrel(18, 8, 1, 0, 0, 180, 0.6, { r: 1, dm: 0.4, pn: 0.6, rec: 2.8, lf: 0.6 })] }
];

export const SECRET_TANKS = [
  {
    id: 'scorch', name: 'Scorch', level: 45, body: 'hex', stealth: 1, ability: 'overdrive', spin: 0.9,
    tip: 'A tank that should not exist. Three burning lances that chain between enemies, and it fades when still.',
    stats: { hp: 1.25, speed: 1.08, bodyDmg: 1.4, fov: 1.3 },
    decos: [{ sides: 3, s: 1.18, a: 0, x: 0, y: 0, layer: 0, spin: -1.6, dark: 1 }, { sides: 3, s: 1.18, a: 60, x: 0, y: 0, layer: 0, spin: -1.6, dark: 1 }, { sides: 6, s: 0.42, a: 0, x: 0, y: 0, layer: 1, spin: 2.4, dark: 1 }],
    guns: [
      ...ring(3, 22, 7, 1, 2, beam({ fx: { chain: 2, explode: 0.4 }, dm: 1.25, r: 2.1, sp: 1.1 })),
      ...ring(3, 13, 9, -1.4, 2, { k: 'shell', r: 2.8, dm: 0.6, sp: 0.85, pn: 1.2, fx: { home: 1, missile: 1 }, rec: 0.2 }, 60)
    ]
  }
];

export function bossTankRaws(bosses) {
  return bosses.map((b, i) => {
    const pattern = i % 5;
    let guns;
    if (pattern === 0) guns = ring(8, 17, 9, 1, 0, { r: 1.6, dm: 1.3, pn: 2, sp: 0.95 });
    else if (pattern === 1) guns = [barrel(21, 11, 1, 0, 0, 0, 0, { r: 1.2, dm: 1.6, pn: 2.4 }), ...mirror(19, 8, 1, 0, 0, 22, 0.5, { r: 1.2, dm: 1, pn: 1.6 }), spawner(120, { max: 4, dm: 1.4 }), spawner(-120, { max: 4, dm: 1.4 })];
    else if (pattern === 2) guns = [barrel(22, 13, 1, 0, 0, 0, 0, { k: 'shell', r: 2.4, dm: 2.6, sp: 0.8, pn: 3, fx: { explode: 0.8 } }), ...[60, 120, 180, 240, 300].flatMap(a => trapLauncher(a, { r: 2.6, dm: 1.4, sz: 0.9 }))];
    else if (pattern === 3) guns = [...ring(4, 18, 10, 1, 0, { k: 'shell', r: 2.2, dm: 1.2, sp: 0.85, pn: 1.6, fx: { home: 1, missile: 1 } }, 45), ...ring(4, 15, 8, 1, 0, { r: 1.1, dm: 0.9, pn: 1.4 })];
    else guns = [barrel(24, 10, 1, 0, 0, 0, 0, beam({ dm: 2.2, r: 2.4, fx: { pierce: 2 } })), ...ring(6, 14, 7, 1, 0, { r: 1.3, dm: 0.8, pn: 1.3 }, 30)];
    return {
      id: `boss_${b.key}`, name: b.name.replace(/^The /, ''), level: 60, bossKey: b.key, ability: 'none',
      tip: `${b.title}. Played by whoever slew the last boss.`,
      stats: { hp: 6, size: 2.6, speed: 0.72, bodyDmg: 2.6, fov: 1.5, accel: 0.8 },
      guns
    };
  });
}
