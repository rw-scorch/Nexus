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

const EXPANSION_TANKS = [];
for (let i = 1; i <= 10; i++) EXPANSION_TANKS.push(smasherRaw(i, 45, 'smasher'));
for (let i = 11; i <= 25; i++) EXPANSION_TANKS.push(smasherRaw(i, 60, `smasherApex${String(((i - 11) % 10) + 1).padStart(2, '0')}`));

const signatureGun = (a, k, fx = {}, extra = {}) => ({
  a, x: extra.x || 0, y: extra.y || 0, len: extra.len || 1.8, w: extra.w || 0.4, asp: 1, d: extra.d || 0,
  k, r: extra.r || 1, dm: extra.dm || 1, pn: extra.pn || 1, sp: extra.sp || 1,
  lf: extra.lf || 1, sz: extra.sz || 1, s: extra.s || 0.03, rec: extra.rec || 1, n: extra.n || 1, fx
});

const SIGNATURE_TANKS = [
  { id: 'singularity', name: 'Singularity', parents: ['overseer'], ability: 'pulse', tip: 'Compresses enemy formations with orbiting homing shards.', stats: { hp: 0.92, speed: 0.98, fov: 1.2 }, guns: [signatureGun(0, 'swarm', { home: 2, pull: 1 }, { r: 1.5, dm: 0.8, sp: 1.1, n: 2 }), signatureGun(180, 'swarm', { home: 1, orbit: 1 }, { r: 1.7, dm: 0.65, sp: 0.9, n: 2 })] },
  { id: 'railwarden', name: 'Railwarden', parents: ['destroyer'], ability: 'barrier', tip: 'A slow precision tank that punches through targets and walls.', stats: { hp: 1.1, speed: 0.82, fov: 1.35, bodyDmg: 1.1 }, guns: [signatureGun(0, 'shell', { pierce: 2, siege: 1 }, { r: 3.2, dm: 3.2, sp: 1.5, pn: 3, lf: 1.5, w: 0.5 })] },
  { id: 'mirrorwitch', name: 'Mirrorwitch', parents: ['trapper'], ability: 'blink', tip: 'Splitting ricochet rounds make every wall a second angle.', stats: { speed: 1.08, fov: 1.1 }, guns: [signatureGun(-25, 'bullet', { bounce: 2, split: 1 }, { r: 1.2, dm: 0.9, sp: 1.2 }), signatureGun(25, 'bullet', { bounce: 2, split: 1 }, { r: 1.2, dm: 0.9, sp: 1.2 })] },
  { id: 'sunforge', name: 'Sunforge', parents: ['machineGun'], ability: 'overdrive', tip: 'Builds heat through a fan of explosive solar rounds.', stats: { hp: 1.12, speed: 0.9, bodyDmg: 1.2 }, guns: [signatureGun(0, 'bullet', { explode: 1, wave: 1 }, { r: 0.7, dm: 0.7, sp: 1.25, n: 5, w: 0.3 })] },
  { id: 'hushblade', name: 'Hushblade', parents: ['assassin'], ability: 'cloak', stealth: 1, tip: 'Silent reverse missiles punish anyone who chases.', stats: { hp: 0.82, speed: 1.25, fov: 1.25 }, guns: [signatureGun(0, 'bullet', { reverse: 2, missile: 1 }, { x: 2.4, r: 1.4, dm: 1.6, sp: 1.3, lf: 1.3 })] },
  { id: 'aegisweaver', name: 'Aegisweaver', parents: ['cruiser'], ability: 'shieldAlly', healer: 1, tip: 'Piercing repair beams and a protective escort drone.', stats: { hp: 1.18, speed: 0.88, shield: 1.3 }, guns: [signatureGun(0, 'beam', { heal: 1, pierce: 2 }, { r: 1.8, dm: 0.75, sp: 1.05 }), signatureGun(180, 'drone', { orbit: 1, heal: 1 }, { r: 2.5, dm: 0.5, sp: 0.8, max: 2 })] },
  { id: 'redline', name: 'Redline', parents: ['machineGun'], ability: 'dash', tip: 'A bullet hose that accelerates while firing.', stats: { hp: 0.86, speed: 1.18, accel: 1.25 }, guns: [signatureGun(0, 'bullet', { wave: 1 }, { r: 0.26, dm: 0.38, sp: 1.05, n: 2, w: 0.24 })] },
  { id: 'bastioncore', name: 'Bastion Core', parents: ['smasher'], smasher: 1, ability: 'bubble', tip: 'A fortress ram with an armed orbiting guard ring.', stats: { hp: 1.4, speed: 0.72, bodyDmg: 2.2, size: 1.12 }, bodyFx: { armor: 0.2 }, guns: [signatureGun(0, 'drone', { orbit: 1, armed: 1 }, { r: 2.4, dm: 0.65, sp: 0.7, max: 4 })] },
  { id: 'nullweaver', name: 'Nullweaver', parents: ['overseer'], ability: 'emp', tip: 'Intercepts hostile fire before the disabling volley arrives.', stats: { hp: 0.94, speed: 1.02, fov: 1.18 }, guns: [signatureGun(0, 'swarm', { intercept: 2, home: 1 }, { r: 1.35, dm: 0.7, sp: 1.15, n: 3 })] },
  { id: 'vaultbreaker', name: 'Vaultbreaker', parents: ['destroyer'], ability: 'overdrive', tip: 'Siege shells designed to crack structures and guard posts.', stats: { hp: 1.2, speed: 0.86, bodyDmg: 1.3 }, guns: [signatureGun(0, 'shell', { explode: 1, siege: 2 }, { r: 2.8, dm: 2.4, sp: 0.85, lf: 1.8, w: 0.6 })] },
  { id: 'starling', name: 'Starling', parents: ['assassin'], ability: 'rally', tip: 'A mobile squadron leader whose missiles fan around targets.', stats: { hp: 0.9, speed: 1.28, fov: 1.15 }, guns: [signatureGun(0, 'bullet', { home: 1, missile: 2 }, { r: 1.1, dm: 1.1, sp: 1.5, n: 2 }), signatureGun(180, 'bullet', { home: 1 }, { r: 1.1, dm: 0.8, sp: 1.4, n: 2 })] },
  { id: 'chronocannon', name: 'Chronocannon', parents: ['artillery'], ability: 'swap', tip: 'Staggered rounds arrive in waves, then return through the breach.', stats: { hp: 1.04, speed: 0.96 }, guns: [signatureGun(-18, 'bullet', { wave: 2, reverse: 1 }, { r: 1.5, dm: 1.2, sp: 1.1, d: 0 }), signatureGun(18, 'bullet', { wave: 2, reverse: 1 }, { r: 1.5, dm: 1.2, sp: 1.1, d: 0.5 })] }
].map(t => ({ ...t, level: 60, guns: t.guns || [] }));

export { EXPANSION_TANKS, SIGNATURE_TANKS };
