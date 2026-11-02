const smasherRaw = (i, level, parent) => ({
  id: `smasherApex${String(i).padStart(2, '0')}`,
  name: `Smasher ${['Apex', 'Ravager', 'Bulwark', 'Comet', 'Rift'][i % 5]} ${i}`,
  level, parents: [parent], smasher: 1,
  tip: 'A close-range upgrade focused on impact, survivability and contact control.',
  stats: { hp: 1 + (i % 4) * 0.06, bodyDmg: 1.65 + (i % 5) * 0.12, speed: 0.94 + (i % 4) * 0.04, size: 1 + (i % 3) * 0.04 },
  bodyFx: { blast: i % 3 === 0 ? 1 : 0, knock: 1 + (i % 4) * 0.2, leech: i % 5 === 0 ? 0.08 : 0 },
  decos: [
    { sides: 3 + (i % 4), s: 1.08 + (i % 3) * 0.05, a: i * 17, x: 0, y: 0, layer: 0, spin: (i % 2 ? 1 : -1) * 0.8, dark: 1 },
    { sides: 6, s: 0.35 + (i % 4) * 0.08, a: i * 29, x: 0, y: 0, layer: 1, spin: 1.4, dark: 1 }
  ],
  guns: []
});

const gunTankRaw = (i, level, parent) => {
  const count = 1 + (i % 4);
  const kind = ['bullet', 'shell', 'trap', 'swarm'][i % 4];
  const guns = Array.from({ length: count }, (_, n) => ({
    a: (360 / count) * n + (i * 13) % 35,
    x: 0, y: (n % 2 ? 0.42 : -0.42) * (i % 3),
    len: 1.5 + (i % 5) * 0.15, w: 0.28 + (i % 3) * 0.08,
    asp: 1 + (i % 3) * 0.2, d: (n / count) % 1, k: kind,
    r: 0.7 + (i % 5) * 0.18, dm: 0.55 + (i % 6) * 0.16,
    pn: 0.7 + (i % 4) * 0.3, sp: 0.85 + (i % 5) * 0.12,
    lf: 0.8 + (i % 4) * 0.16, sz: 0.65 + (i % 3) * 0.12,
    s: kind === 'trap' ? 0 : 0.025 + (i % 4) * 0.018, rec: 0.5 + (i % 4) * 0.3,
    n: 1 + (i % 3), max: kind === 'swarm' ? 3 + (i % 4) : 0,
    fx: kind === 'shell' ? { explode: 0.35 + (i % 3) * 0.2 } : kind === 'trap' ? { block: 1 } : {}
  }));
  return {
    id: `frontier${String(i).padStart(3, '0')}`,
    name: `Frontier ${['Striker', 'Bastion', 'Raptor', 'Oracle', 'Vortex'][i % 5]} ${i}`,
    level, parents: [parent],
    tip: 'A new frontier design built for a distinct weapon rhythm.',
    stats: { hp: 0.94 + (i % 5) * 0.05, speed: 0.92 + (i % 6) * 0.035, fov: 1 + (i % 4) * 0.06 },
    ability: ['none', 'dash', 'blink', 'overdrive', 'barrier'][i % 5],
    guns
  };
};

const EXPANSION_TANKS = [];
for (let i = 1; i <= 10; i++) EXPANSION_TANKS.push(smasherRaw(i, 45, 'smasher'));
for (let i = 11; i <= 25; i++) EXPANSION_TANKS.push(smasherRaw(i, 60, `smasherApex${String(((i - 11) % 10) + 1).padStart(2, '0')}`));
for (let i = 26; i <= 100; i++) {
  const parents = ['destroyer', 'artillery', 'launcher', 'overseer', 'cruiser', 'trapper', 'assassin', 'machineGun'];
  EXPANSION_TANKS.push(gunTankRaw(i, 60, parents[(i - 26) % parents.length]));
}

export { EXPANSION_TANKS };
