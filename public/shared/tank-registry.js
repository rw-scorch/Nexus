import { gun, pair, fan, ring, stack, auto, thrusters, validateGun, BASE } from './weapon-registry.js';
import { DOCTRINES, BODY_DOCTRINES } from './projectile-types.js';

export const ABILITIES = {
  none: { name: 'None', cd: 0, desc: 'No active ability' },
  dash: { name: 'Dash', cd: 7, dur: 0.25, desc: 'Burst of speed toward your movement direction' },
  blink: { name: 'Blink', cd: 9, desc: 'Teleport a short distance toward your aim' },
  bubble: { name: 'Bubble Shield', cd: 14, dur: 3, desc: 'Absorb 70% of incoming damage for 3s' },
  cloak: { name: 'Cloak', cd: 13, dur: 5, desc: 'Become invisible to distant enemies until you fire' },
  turret: { name: 'Deploy Turret', cd: 16, dur: 14, desc: 'Place an auto turret that fights for you' },
  barrier: { name: 'Barrier', cd: 14, dur: 7, desc: 'Raise a temporary wall in front of you' },
  pulse: { name: 'Mend Pulse', cd: 10, desc: 'Heal nearby allies and sting nearby enemies' },
  shieldAlly: { name: 'Aegis Field', cd: 16, dur: 3, desc: 'Give nearby allies a bubble shield' },
  rally: { name: 'Rally', cd: 18, dur: 5, desc: 'Nearby allies reload 30% faster' },
  overdrive: { name: 'Overdrive', cd: 14, dur: 4, desc: 'Reload twice as fast, but take damage over time' },
  reclaim: { name: 'Reclaim', cd: 12, desc: 'Convert nearby squares into your drones' },
  swap: { name: 'Transform', cd: 1.5, desc: 'Switch between two weapon configurations' },
  emp: { name: 'EMP', cd: 16, dur: 3, desc: 'Erase nearby enemy projectiles and stun structures' }
};

const C = (hp = 1, speed = 1, size = 1, bodyDmg = 1, fov = 1) => ({ hp, speed, size, bodyDmg, fov });

const FAMILIES = [
  { key: 'twin', name: 'Twin', role: 'Sustained DPS', root: true, body: 'circle', ab: 'dash', ch: C(), forms: [
    { name: 'Twin', guns: pair(0.5, { r: 1.05, dm: 0.7 }) },
    { name: 'Double Twin', guns: [...pair(0.5, { r: 1.05, dm: 0.7 }), ...pair(0.5, { a: 180, r: 1.05, dm: 0.7 })] },
    { name: 'Triplet', guns: [gun({ len: 2.1, r: 1, dm: 0.65 }), ...pair(0.55, { len: 1.7, r: 1, dm: 0.65, d: 0.33 })] },
    { name: 'Cascade', guns: [...pair(0.5, { len: 2.2, r: 1, dm: 0.7 }), ...pair(0.5, { len: 1.6, r: 1, dm: 0.7, d: 0.25 }), gun({ len: 2.5, w: 0.3, r: 1.3, dm: 0.8, sp: 1.2 })] }
  ]},
  { key: 'triple', name: 'Triple', role: 'Area Coverage', parent: 'twin', body: 'circle', ab: 'dash', ch: C(), forms: [
    { name: 'Triple Shot', guns: fan(3, 90, { r: 1.1, dm: 0.7 }) },
    { name: 'Penta Shot', guns: fan(5, 100, { r: 1.25, dm: 0.6 }) },
    { name: 'Hexa Volley', guns: [...fan(5, 80, { r: 1.25, dm: 0.6 }), gun({ a: 90, dm: 0.5 }), gun({ a: -90, dm: 0.5 })] },
    { name: 'Arc Spread', guns: fan(7, 70, { r: 1.4, dm: 0.48, len: 1.7 }) }
  ]},
  { key: 'quad', name: 'Quad', role: 'All-Round Defense', parent: 'twin', body: 'circle', ab: 'bubble', ch: C(1.05, 0.96), forms: [
    { name: 'Quad Tank', guns: ring(4, { dm: 0.8 }) },
    { name: 'Quad Twin', guns: [0, 90, 180, 270].flatMap(a => pair(0.45, { a, dm: 0.55, r: 1.1, sp: 1.2 })) },
    { name: 'Octo Tank', guns: ring(8, { dm: 0.65, r: 1.1, lf: 1.2, pn: 1.2 }) },
    { name: 'Rotor', spin: 1.6, guns: ring(6, { dm: 0.75, r: 0.9, len: 2.1 }) }
  ]},
  { key: 'spread', name: 'Spread', role: 'Frontal Suppression', parent: 'twin', body: 'circle', ab: 'dash', ch: C(), forms: [
    { name: 'Fanner', guns: [gun({ len: 2.2, dm: 1 }), ...fan(4, 70, { len: 1.4, w: 0.3, dm: 0.45, r: 0.8 })] },
    { name: 'Spreadshot', guns: [gun({ len: 2.3, dm: 1 }), ...fan(6, 110, { len: 1.3, w: 0.28, dm: 0.4, r: 0.7 })] },
    { name: 'Torrent', guns: [gun({ len: 2.3, dm: 1 }), ...fan(10, 150, { len: 1.2, w: 0.24, dm: 0.33, r: 0.65 })] },
    { name: 'Scattergun', guns: [gun({ len: 1.6, w: 0.7, n: 7, s: 0.38, r: 2.2, dm: 0.6, lf: 0.6, rec: 3 })] }
  ]},

  { key: 'sniper', name: 'Sniper', role: 'Long-Range Pick', root: true, body: 'circle', ab: 'blink', ch: C(0.92, 0.95, 1, 1, 1.25), forms: [
    { name: 'Sniper', guns: [gun({ len: 2.5, r: 1.6, sp: 1.5, dm: 1.45, pn: 1.3, lf: 1.1, s: 0.02 })] },
    { name: 'Marksman', guns: [gun({ len: 2.8, r: 1.8, sp: 1.8, dm: 1.7, pn: 1.5, lf: 1.15, s: 0.01 })] },
    { name: 'Ranger', fov: 1.45, guns: [gun({ len: 3, w: 0.36, r: 2.1, sp: 1.9, dm: 2, pn: 1.6, lf: 1.2, s: 0.01 })] },
    { name: 'Deadeye', fov: 1.5, guns: [gun({ len: 3.1, r: 2.2, sp: 2, dm: 2.1, pn: 1.8, lf: 1.25, s: 0 }), gun({ len: 2.4, w: 0.5, r: 2.2, d: 0.5, sp: 1.7, dm: 1.4, lf: 1.1 })] }
  ]},
  { key: 'assassin', name: 'Assassin', role: 'Stealth Sniper', parent: 'sniper', body: 'circle', ab: 'cloak', ch: C(0.85, 1, 1, 1, 1.4), forms: [
    { name: 'Assassin', speed: 1.08, guns: [gun({ len: 2.9, r: 2, sp: 1.9, dm: 1.9, pn: 1.5, lf: 1.2, s: 0.01 })] },
    { name: 'Stalker', guns: [gun({ len: 3, w: 0.5, r: 2.2, sp: 2, dm: 2.2, pn: 1.6, lf: 1.2, s: 0.01 })] },
    { name: 'Phantom', fov: 1.55, guns: [gun({ len: 3.2, r: 2.4, sp: 2.2, dm: 2.6, pn: 2, lf: 1.2 })] },
    { name: 'Shade', guns: [gun({ len: 2.8, r: 1.6, sp: 1.9, dm: 1.6, pn: 1.4, lf: 1.1 }), ...pair(0.6, { a: 180, len: 1.3, dm: 0.3, rec: 2.5, lf: 0.5 })] }
  ]},
  { key: 'hunter', name: 'Hunter', role: 'Burst Pick', parent: 'sniper', body: 'circle', ab: 'dash', ch: C(0.95, 1, 1, 1, 1.25), forms: [
    { name: 'Hunter', guns: [gun({ len: 2.6, w: 0.3, r: 1.5, sp: 1.6, dm: 0.95 }), gun({ len: 2.1, w: 0.46, r: 1.5, d: 0.25, sp: 1.5, dm: 0.95 })] },
    { name: 'Predator', guns: [gun({ len: 2.7, w: 0.26, r: 1.6, sp: 1.7, dm: 0.85 }), gun({ len: 2.3, w: 0.38, r: 1.6, d: 0.2, sp: 1.6, dm: 0.85 }), gun({ len: 1.9, w: 0.5, r: 1.6, d: 0.4, sp: 1.5, dm: 0.85 })] },
    { name: 'Raptor', guns: [gun({ len: 2.6, w: 0.3, r: 1.5, sp: 1.7, dm: 0.95 }), gun({ len: 2.1, w: 0.46, r: 1.5, d: 0.25, sp: 1.6, dm: 0.95 }), ...thrusters(1, { rec: 4 })] },
    { name: 'Harrier', guns: [gun({ len: 2.6, w: 0.3, r: 1.5, sp: 1.6, dm: 0.95 }), gun({ len: 2.1, w: 0.46, r: 1.5, d: 0.25, sp: 1.5, dm: 0.95 }), gun({ a: 70, len: 1.4, dm: 0.4 }), gun({ a: -70, len: 1.4, dm: 0.4 })] }
  ]},
  { key: 'artillery', name: 'Artillery', role: 'Area Denial', parent: 'sniper', body: 'circle', ab: 'barrier', ch: C(1, 0.9, 1.05, 1, 1.35), forms: [
    { name: 'Mortar', guns: [gun({ k: 'shell', len: 2.1, w: 0.62, r: 2.6, sp: 0.75, dm: 1.6, lf: 1, fx: { explode: 1 } })] },
    { name: 'Howitzer', guns: [gun({ k: 'shell', len: 2.2, w: 0.62, r: 2.6, sp: 0.75, dm: 1.6, fx: { explode: 1 } }), ...pair(0.75, { len: 1.5, w: 0.3, dm: 0.4, r: 0.8 })] },
    { name: 'Bombard', guns: pair(0.45, { k: 'shell', len: 2.1, w: 0.55, r: 2.8, sp: 0.7, dm: 1.4, fx: { explode: 1.3 } }) },
    { name: 'Barrage', guns: fan(4, 50, { k: 'shell', len: 1.9, w: 0.45, r: 3.2, sp: 0.7, dm: 1.1, fx: { explode: 1 } }) }
  ]},

  { key: 'mgun', name: 'Machine Gun', role: 'Bullet Hose', root: true, body: 'circle', ab: 'overdrive', ch: C(), forms: [
    { name: 'Machine Gun', guns: [gun({ len: 1.8, w: 0.6, r: 0.5, s: 0.26, dm: 0.7 })] },
    { name: 'Sprayer', guns: [gun({ len: 1.8, w: 0.62, r: 0.5, s: 0.26, dm: 0.65 }), gun({ len: 2.3, w: 0.3, r: 0.55, s: 0.05, dm: 0.5, d: 0.5 })] },
    { name: 'Gatling', guns: [gun({ len: 2, w: 0.55, r: 0.32, s: 0.18, dm: 0.5, sp: 1.15 })] },
    { name: 'Maelstrom', guns: pair(0.45, { len: 1.9, w: 0.5, r: 0.45, s: 0.24, dm: 0.55 }) }
  ]},
  { key: 'gunner', name: 'Gunner', role: 'Penetrating Stream', parent: 'mgun', body: 'circle', ab: 'overdrive', ch: C(), forms: [
    { name: 'Gunner', guns: [...pair(0.5, { len: 1.6, w: 0.24, r: 0.65, dm: 0.4 }), ...pair(0.22, { len: 2.1, w: 0.24, r: 0.65, dm: 0.4, d: 0.25 })] },
    { name: 'Auto Gunner', guns: [...pair(0.4, { len: 1.8, w: 0.24, r: 0.6, dm: 0.4 }), auto(0, 0, { dm: 0.5 })] },
    { name: 'Streamliner', hp: 1.1, guns: stack(5, { len: 2.6, w: 0.3, r: 0.62, dm: 0.58, sp: 1.3 }) },
    { name: 'Nailgun', guns: [gun({ len: 2.1, w: 0.22, r: 0.4, dm: 0.38, sp: 1.6, pn: 1.3 }), ...pair(0.32, { len: 1.8, w: 0.22, r: 0.4, dm: 0.38, sp: 1.6, pn: 1.3, d: 0.33 })] }
  ]},
  { key: 'destroyer', name: 'Destroyer', role: 'Heavy Burst', parent: 'mgun', body: 'circle', ab: 'bubble', ch: C(1.08, 0.94, 1.05), forms: [
    { name: 'Destroyer', guns: [gun({ len: 1.9, w: 0.76, r: 3.3, sp: 0.75, dm: 3.4, pn: 2.4, rec: 5, sz: 1 })] },
    { name: 'Breacher', guns: [gun({ len: 1.9, w: 0.76, r: 3.3, sp: 0.75, dm: 3.2, pn: 2.4, rec: 5, fx: { siege: 1 } }), ...pair(0.85, { len: 1.3, w: 0.3, dm: 0.4 })] },
    { name: 'Annihilator', guns: [gun({ len: 1.9, w: 0.98, r: 4.2, sp: 0.7, dm: 5, pn: 3, rec: 8 })] },
    { name: 'Hybrid', guns: [gun({ len: 1.9, w: 0.76, r: 3.3, sp: 0.75, dm: 3.2, pn: 2.4, rec: 5 }), gun({ a: 180, k: 'drone', len: 1.4, w: 0.55, max: 3, r: 1.6, dm: 0.8 })] }
  ]},
  { key: 'energy', name: 'Energy', role: 'Hitscan Lancer', parent: 'mgun', body: 'octagon', ab: 'bubble', ch: C(0.95, 1), forms: [
    { name: 'Lancer', guns: [gun({ k: 'beam', len: 2.2, w: 0.3, r: 1.7, dm: 1.6, sp: 1.2 })] },
    { name: 'Arcwright', guns: [gun({ k: 'beam', len: 2, w: 0.34, r: 1.8, dm: 1.3, sp: 1, fx: { chain: 2 } })] },
    { name: 'Prism Lance', guns: [gun({ k: 'beam', a: 8, len: 2.1, w: 0.26, r: 1.8, dm: 1.2, sp: 1.2 }), gun({ k: 'beam', a: -8, len: 2.1, w: 0.26, r: 1.8, d: 0.5, dm: 1.2, sp: 1.2 })] },
    { name: 'Tesla Coil', guns: fan(3, 50, { k: 'beam', len: 1.5, w: 0.3, r: 1.5, dm: 0.8, sp: 0.6, fx: { chain: 2 } }) }
  ]},

  { key: 'flank', name: 'Flank Guard', role: 'Rear Coverage', root: true, body: 'circle', ab: 'dash', ch: C(), forms: [
    { name: 'Flank Guard', guns: [gun(), gun({ a: 180, len: 1.6 })] },
    { name: 'Tri-Angle', guns: [gun({ dm: 1.05 }), ...thrusters(2)] },
    { name: 'Tri-Guard', guns: ring(3, { dm: 0.85 }) },
    { name: 'Booster', guns: [gun({ dm: 1.05 }), ...thrusters(2), ...thrusters(2, { len: 1.25, d: 0.5 })] }
  ]},
  { key: 'autos', name: 'Auto', role: 'Hands-Free Coverage', parent: 'flank', body: 'circle', ab: 'overdrive', ch: C(), forms: [
    { name: 'Auto-3', guns: [auto(0.55, 0, { dm: 0.75 }), auto(-0.28, 0.48, { dm: 0.75 }), auto(-0.28, -0.48, { dm: 0.75 })] },
    { name: 'Auto-Flank', guns: [gun(), gun({ a: 180, len: 1.6 }), auto(0, 0)] },
    { name: 'Auto-5', guns: [0, 72, 144, 216, 288].map(a => auto(Math.cos(a * Math.PI / 180) * 0.58, Math.sin(a * Math.PI / 180) * 0.58, { dm: 0.62 })) },
    { name: 'Overgunner', guns: [...pair(0.4, { dm: 0.6, sp: 1.3, lf: 1.1 }), auto(-0.3, 0.6), auto(-0.3, -0.6)] }
  ]},
  { key: 'mobility', name: 'Mobility', role: 'Skirmisher', parent: 'flank', body: 'tri', ab: 'dash', ch: C(0.82, 1.22, 0.94), forms: [
    { name: 'Skimmer', guns: [gun({ dm: 0.9 }), ...thrusters(2)] },
    { name: 'Phaser', ab: 'blink', guns: [gun({ dm: 1, sp: 1.2 }), ...thrusters(1)] },
    { name: 'Fighter', guns: [gun({ dm: 0.9 }), gun({ a: 90, dm: 0.6 }), gun({ a: -90, dm: 0.6 }), ...thrusters(2)] },
    { name: 'Comet', speed: 1.12, guns: [gun({ dm: 0.95, sp: 1.25 }), ...thrusters(3, { rec: 3.5 })] }
  ]},
  { key: 'bastion', name: 'Bastion', role: 'Defender', parent: 'flank', body: 'square', ab: 'bubble', ch: C(1.3, 0.84, 1.12, 1.2), forms: [
    { name: 'Bastion', guns: ring(3, { dm: 0.9, r: 1.15 }) },
    { name: 'Rampart', guns: [gun(), gun({ a: 120, k: 'trap', len: 1.4, w: 0.5, r: 1.6 }), gun({ a: -120, k: 'trap', len: 1.4, w: 0.5, r: 1.6 })] },
    { name: 'Citadel', guns: ring(4, { dm: 0.95, r: 1.1, len: 1.7, w: 0.5 }) },
    { name: 'Aegis', guns: [gun({ dm: 1 }), ...ring(4, { len: 1.3, w: 0.3, r: 0.6, dm: 0.35, sp: 1.4, lf: 0.6, fx: { intercept: 1 } }, 45)] }
  ]},

  { key: 'overseer', name: 'Overseer', role: 'Drone Control', root: true, body: 'circle', ab: 'rally', ch: C(0.95, 0.92, 1, 1, 1.1), forms: [
    { name: 'Overseer', guns: [gun({ a: 90, k: 'drone', len: 1.4, w: 0.55, max: 4, r: 1.6 }), gun({ a: -90, k: 'drone', len: 1.4, w: 0.55, max: 4, r: 1.6 })] },
    { name: 'Overlord', guns: ring(4, { k: 'drone', len: 1.4, w: 0.55, max: 2, r: 1.6 }) },
    { name: 'Commander', guns: ring(3, { k: 'drone', len: 1.4, w: 0.55, max: 3, r: 1.5, dm: 1.05 }) },
    { name: 'Sovereign', guns: ring(6, { k: 'drone', len: 1.35, w: 0.5, max: 2, r: 1.5, dm: 1.05 }) }
  ]},
  { key: 'reclaimer', name: 'Reclaimer', role: 'Converter', parent: 'overseer', body: 'square', ab: 'reclaim', ch: C(0.95, 0.9, 1, 1, 1.1), forms: [
    { name: 'Reclaimer', guns: [gun({ a: 90, k: 'drone', len: 1.2, w: 0.6, max: 6, r: 2, dm: 0.9 }), gun({ a: -90, k: 'drone', len: 1.2, w: 0.6, max: 6, r: 2, dm: 0.9 })] },
    { name: 'Thrall', guns: [gun({ k: 'drone', len: 1.2, w: 0.6, max: 8, r: 1.8, dm: 0.85 })] },
    { name: 'Lich', guns: ring(4, { k: 'drone', len: 1.2, w: 0.6, max: 4, r: 1.9, dm: 0.85 }) },
    { name: 'Grave Warden', guns: [...ring(2, { k: 'drone', len: 1.2, w: 0.6, max: 6, r: 1.9, dm: 0.85 }, 90), gun({ len: 1.8, dm: 0.8 })] }
  ]},
  { key: 'factory', name: 'Factory', role: 'Minion Producer', parent: 'overseer', body: 'square', ab: 'turret', ch: C(1, 0.9, 1.05), forms: [
    { name: 'Factory', guns: [gun({ k: 'minion', len: 1.3, w: 0.75, max: 3, r: 2.6, dm: 0.6 })] },
    { name: 'Foundry', hp: 1.12, guns: [gun({ k: 'minion', len: 1.3, w: 0.7, max: 4, r: 2.4, dm: 0.55 }), gun({ a: 180, len: 1.5, dm: 0.6 })] },
    { name: 'Assembly', guns: [gun({ a: 60, k: 'minion', len: 1.2, w: 0.6, max: 3, r: 2.4, dm: 0.5 }), gun({ a: -60, k: 'minion', len: 1.2, w: 0.6, max: 3, r: 2.4, dm: 0.5 })] },
    { name: 'Battlecarrier', hp: 1.1, guns: [gun({ k: 'minion', len: 1.3, w: 0.75, max: 4, r: 2.4, dm: 0.6 }), ...pair(0.8, { a: 180, k: 'swarm', len: 1.1, w: 0.4, r: 1.2, dm: 0.4 })] }
  ]},
  { key: 'swarmer', name: 'Swarm', role: 'Swarm Pressure', parent: 'overseer', body: 'circle', ab: 'rally', ch: C(0.95, 0.96), forms: [
    { name: 'Swarmer', guns: pair(0.45, { k: 'swarm', len: 1.3, w: 0.42, r: 0.9, dm: 0.5 }) },
    { name: 'Carrier', guns: [90, -90].flatMap(a => pair(0.4, { a, k: 'swarm', len: 1.2, w: 0.38, r: 1, dm: 0.45 })) },
    { name: 'Battleship', guns: [...pair(0.4, { a: 90, k: 'swarm', len: 1.2, w: 0.38, r: 1, dm: 0.45 }), ...pair(0.4, { a: -90, k: 'drone', len: 1.2, w: 0.45, max: 2, r: 1.5, dm: 0.8 })] },
    { name: 'Locust', guns: ring(6, { k: 'swarm', len: 1.15, w: 0.36, r: 1.1, dm: 0.42 }) }
  ]},

  { key: 'trapper', name: 'Trapper', role: 'Zone Control', root: true, body: 'circle', ab: 'barrier', ch: C(1.05, 0.92), forms: [
    { name: 'Trapper', guns: [gun({ k: 'trap', len: 1.5, w: 0.52, r: 1.4, dm: 0.9, pn: 1.6 })] },
    { name: 'Tri-Trapper', guns: ring(3, { k: 'trap', len: 1.45, w: 0.5, r: 1.5, dm: 0.8, pn: 1.5 }) },
    { name: 'Gunner Trapper', guns: [...pair(0.25, { len: 1.9, w: 0.22, r: 0.6, dm: 0.4 }), gun({ a: 180, k: 'trap', len: 1.5, w: 0.6, r: 1.5, dm: 1, pn: 1.8 })] },
    { name: 'Fortress', guns: [...ring(3, { k: 'trap', len: 1.4, w: 0.48, r: 1.4, dm: 0.8, pn: 1.5 }), ...ring(3, { len: 1.6, w: 0.3, r: 0.9, dm: 0.5 }, 60)] }
  ]},
  { key: 'siege', name: 'Siege', role: 'Structure Breaker', parent: 'trapper', body: 'square', ab: 'emp', ch: C(1.12, 0.86, 1.1), forms: [
    { name: 'Breaker', guns: [gun({ k: 'shell', len: 2, w: 0.66, r: 2.4, sp: 0.8, dm: 1.8, pn: 2, fx: { siege: 1, explode: 0.6 } })] },
    { name: 'Ram Cannon', guns: [gun({ len: 1.7, w: 0.85, r: 2.8, sp: 0.9, dm: 2.6, pn: 3, rec: 6, fx: { siege: 1 } })] },
    { name: 'Demolisher', guns: pair(0.5, { k: 'shell', len: 2, w: 0.6, r: 2.6, sp: 0.8, dm: 1.6, pn: 2, fx: { siege: 1, explode: 0.8 } }) },
    { name: 'Shieldbreaker', guns: [gun({ len: 2.3, w: 0.5, r: 1.5, sp: 1.3, dm: 1.2, fx: { disrupt: 1, siege: 1 } }), ...pair(0.75, { len: 1.6, w: 0.3, r: 0.9, dm: 0.4, fx: { disrupt: 1 } })] }
  ]},
  { key: 'minelayer', name: 'Minelayer', role: 'Ambush', parent: 'trapper', body: 'circle', ab: 'cloak', ch: C(1, 0.95), forms: [
    { name: 'Minelayer', guns: [gun({ a: 180, k: 'trap', len: 1.4, w: 0.55, r: 1.8, dm: 1.2, lf: 1.4, fx: { explode: 0.9 } }), gun({ len: 1.8, dm: 0.6 })] },
    { name: 'Sapper', guns: [gun({ k: 'trap', len: 1.5, w: 0.6, r: 2, dm: 1.4, lf: 1.4, fx: { explode: 1.1 } })] },
    { name: 'Field Marshal', guns: ring(4, { k: 'trap', len: 1.3, w: 0.45, r: 2, dm: 0.9, lf: 1.3, fx: { explode: 0.8 } }, 45) },
    { name: 'Claymore', guns: fan(3, 40, { k: 'trap', len: 1.4, w: 0.5, r: 2.2, dm: 1, lf: 1.2, fx: { explode: 1, split: 3 } }) }
  ]},
  { key: 'constructor', name: 'Constructor', role: 'Fortification', parent: 'trapper', body: 'hex', ab: 'barrier', ch: C(1.15, 0.88, 1.08), forms: [
    { name: 'Constructor', guns: [gun({ k: 'trap', len: 1.3, w: 0.75, r: 2.4, dm: 0.6, pn: 4, lf: 1.5, sz: 1.5 })] },
    { name: 'Mason', guns: [gun({ k: 'trap', len: 1.3, w: 0.7, r: 2.2, dm: 0.6, pn: 4, lf: 1.5, sz: 1.4 }), gun({ a: 180, len: 1.6, dm: 0.6 })] },
    { name: 'Engineer Prime', guns: [...pair(0.5, { k: 'trap', len: 1.3, w: 0.55, r: 2.2, dm: 0.55, pn: 3.5, lf: 1.4, sz: 1.3 }), auto(-0.4, 0)] },
    { name: 'Bulwark', guns: ring(3, { k: 'trap', len: 1.3, w: 0.65, r: 2.4, dm: 0.55, pn: 4, lf: 1.6, sz: 1.5 }) }
  ]},

  { key: 'smasher', name: 'Smasher', role: 'Melee Rammer', root: true, body: 'spike', ab: 'dash', ch: C(1.45, 1.08, 1.05, 2.4, 1), forms: [
    { name: 'Smasher', guns: [] },
    { name: 'Landmine', ab: 'cloak', guns: [] },
    { name: 'Spike', bodyDmg: 1.35, guns: [] },
    { name: 'Juggernaut', hp: 1.35, speed: 0.9, ab: 'bubble', guns: [] }
  ]},
  { key: 'assault', name: 'Assault', role: 'Close-Quarters Burst', parent: 'smasher', body: 'hex', ab: 'dash', ch: C(1.45, 1, 1.05, 1.6), forms: [
    { name: 'Assault', guns: [gun({ len: 1.4, w: 0.7, n: 5, s: 0.4, r: 2, dm: 0.55, lf: 0.45 })] },
    { name: 'Vanguard', guns: [gun({ len: 1.5, w: 0.75, r: 2.2, dm: 2.4, lf: 0.5, rec: 4, pn: 2 })] },
    { name: 'Warhound', guns: [gun({ len: 1.4, w: 0.7, n: 6, s: 0.45, r: 2, dm: 0.55, lf: 0.45, fx: { siege: 1 } }), ...thrusters(1)] },
    { name: 'Ironclad', hp: 1.25, guns: [...pair(0.55, { len: 1.4, w: 0.55, n: 3, s: 0.3, r: 1.9, dm: 0.6, lf: 0.45 })] }
  ]},
  { key: 'thornback', name: 'Thornback', role: 'Ram Hybrid', parent: 'smasher', body: 'spike', ab: 'dash', ch: C(1.35, 1.04, 1.05, 1.9), forms: [
    { name: 'Thornback', guns: [auto(0, 0, { dm: 0.7 })] },
    { name: 'Bramble', speed: 1.06, guns: [auto(0.3, 0.3, { dm: 0.55 }), auto(0.3, -0.3, { dm: 0.55 })] },
    { name: 'Briar King', guns: [auto(0, 0, { dm: 0.9, len: 1.3 })], ab: 'bubble' },
    { name: 'Hedgehog', guns: ring(8, { len: 1.15, w: 0.25, r: 1.5, dm: 0.35, lf: 0.4 }) }
  ]},
  { key: 'tempest', name: 'Tempest', role: 'Spinning Brawler', parent: 'smasher', body: 'hex', ab: 'pulse', ch: C(1.3, 1.05, 1.05, 1.8), forms: [
    { name: 'Whirl', spin: 3, guns: ring(3, { len: 1.3, w: 0.35, r: 0.9, dm: 0.5, lf: 0.6 }) },
    { name: 'Cyclone', spin: 3.5, guns: ring(4, { len: 1.3, w: 0.35, r: 0.9, dm: 0.45, lf: 0.6 }) },
    { name: 'Hurricane', spin: 4, guns: ring(6, { len: 1.25, w: 0.32, r: 0.95, dm: 0.4, lf: 0.6 }) },
    { name: 'Eye of Storm', spin: 2.5, guns: ring(3, { k: 'beam', len: 1.3, w: 0.28, r: 1.6, dm: 0.6, sp: 0.5 }) }
  ]},

  { key: 'engineer', name: 'Engineer', role: 'Builder', root: true, body: 'square', ab: 'turret', ch: C(1, 0.95), forms: [
    { name: 'Engineer', guns: [gun({ dm: 0.9 })] },
    { name: 'Mechanic', guns: [gun({ dm: 0.85 }), gun({ a: 180, k: 'drone', len: 1.2, w: 0.5, max: 2, r: 2, dm: 0.5, fx: { heal: 1.2 } })] },
    { name: 'Architect', ab: 'barrier', guns: [gun({ dm: 0.9 }), auto(-0.35, 0, { dm: 0.5 })] },
    { name: 'Chief Engineer', guns: [...pair(0.4, { dm: 0.65 }), auto(-0.4, 0.45, { dm: 0.5 }), auto(-0.4, -0.45, { dm: 0.5 })] }
  ]},
  { key: 'support', name: 'Support', role: 'Healer', parent: 'engineer', body: 'circle', ab: 'pulse', ch: C(1.05, 1), forms: [
    { name: 'Medic', guns: [gun({ dm: 0.55, fx: { heal: 1.6 } })] },
    { name: 'Shieldbearer', ab: 'shieldAlly', guns: [gun({ dm: 0.6, fx: { heal: 1 } }), gun({ a: 180, len: 1.5, dm: 0.4 })] },
    { name: 'Sanctuary', guns: ring(3, { dm: 0.45, r: 1.2, fx: { heal: 1.4 } }) },
    { name: 'Herald', ab: 'rally', guns: [...pair(0.45, { dm: 0.55, fx: { heal: 1.1 } }), gun({ a: 180, k: 'drone', len: 1.2, w: 0.5, max: 2, r: 2.2, dm: 0.4 })] }
  ]},
  { key: 'experimental', name: 'Experimental', role: 'High-Risk Oddity', parent: 'engineer', body: 'octagon', ab: 'swap', ch: C(0.95, 1.02), req: { cores: 2 }, forms: [
    { name: 'Morph', guns: [gun({ len: 2.5, r: 1.6, sp: 1.6, dm: 1.4 })], alt: [gun({ len: 1.8, w: 0.6, r: 0.5, s: 0.26, dm: 0.6 })] },
    { name: 'Gravitas', ab: 'emp', guns: [gun({ len: 2, w: 0.55, r: 1.5, dm: 0.9, sp: 0.8, fx: { pull: 1 } })] },
    { name: 'Paradox', ab: 'blink', guns: fan(3, 30, { r: 1.1, dm: 0.6, lf: 1.6, fx: { reverse: 1 } }) },
    { name: 'Overclock', ab: 'overdrive', guns: [gun({ k: 'beam', len: 2, w: 0.35, r: 1.3, dm: 1.1 })], alt: ring(4, { k: 'beam', len: 1.6, w: 0.3, r: 1.6, dm: 0.7 }) }
  ]},
  { key: 'relic', name: 'Relic', role: 'Boss-Derived', parent: 'engineer', body: 'star', ab: 'pulse', ch: C(1.1, 0.95, 1.08), req: { bossKill: 1 }, forms: [
    { name: "Warden's Echo", spin: 1, guns: ring(8, { len: 1.25, w: 0.3, r: 1.6, dm: 0.45 }) },
    { name: 'Devourer Maw', ab: 'dash', guns: fan(3, 60, { len: 1.3, w: 0.75, r: 1.8, dm: 1.2, lf: 0.45, n: 2, s: 0.2 }) },
    { name: 'Prism Crown', spin: 1.2, guns: ring(3, { k: 'beam', len: 1.6, w: 0.28, r: 1.6, dm: 0.9 }) },
    { name: 'Colossus Core', guns: [gun({ k: 'shell', len: 2, w: 0.7, r: 3, sp: 0.7, dm: 1.5, fx: { explode: 1, split: 5 } })] }
  ]}
];

const BASIC_FORM = { name: 'Basic', guns: [gun()] };

function rarityFor(tier, docIdx, family) {
  if (family && (family.key === 'relic' || family.key === 'experimental')) return tier >= 4 ? 'mythic' : 'legendary';
  if (tier >= 4) return docIdx ? 'legendary' : 'epic';
  if (tier === 3) return docIdx ? 'epic' : 'rare';
  if (tier === 2) return docIdx ? 'rare' : 'uncommon';
  return docIdx ? 'uncommon' : 'common';
}

function applyDoctrine(guns, doc) {
  return guns.map(g => {
    const ng = { ...g, fx: { ...g.fx } };
    for (const [k, v] of Object.entries(doc.mods)) ng[k] = +(ng[k] * v).toFixed(3);
    for (const [k, v] of Object.entries(doc.flags)) ng.fx[k] = ng.fx[k] ? ng.fx[k] + v : v;
    if (ng.k === 'beam' && doc.flags.bounce) ng.fx.bounce = 1;
    return ng;
  });
}

export function powerProfile(def) {
  let dps = 0, range = 0, control = 0;
  for (const g of def.guns) {
    const shots = g.n / (BASE.reload * g.r);
    let dmg = BASE.damage * g.dm * shots;
    if (g.k === 'drone' || g.k === 'minion') dmg = BASE.damage * g.dm * g.max * 0.6;
    dps += dmg;
    range = Math.max(range, (g.k === 'beam' ? 650 * g.sp : BASE.speed * g.sp * BASE.life * g.lf));
    control += Object.keys(g.fx).length + (g.k === 'trap' ? 1.5 : 0) + (g.k === 'drone' ? 1 : 0);
  }
  if (!def.guns.length) dps = def.stats.bodyDmg * 30;
  const buckets = new Set();
  for (const g of def.guns) {
    if (g.auto || g.k === 'drone' || g.k === 'minion' || g.k === 'swarm') { for (let b = 0; b < 12; b += 3) buckets.add(b); continue; }
    const spread = Math.max(g.s * 180 / Math.PI * (g.n > 1 ? 2 : 1), 0);
    for (let d = -spread; d <= spread; d += 15) buckets.add(((Math.round((g.a + d) / 30) % 12) + 12) % 12);
  }
  if (def.spin) for (let b = 0; b < 12; b++) buckets.add(b);
  let focus = 0;
  for (const g of def.guns) {
    const shots = g.n / (BASE.reload * g.r);
    const d = g.k === 'drone' || g.k === 'minion' ? BASE.damage * g.dm * g.max * 0.6 : BASE.damage * g.dm * shots;
    if (g.auto || g.k === 'drone' || g.k === 'minion' || g.k === 'swarm' || Math.abs(((g.a + 540) % 360) - 180) <= 30) focus += d;
  }
  let burst = 0;
  for (const g of def.guns) burst = Math.max(burst, BASE.damage * g.dm * (g.n > 1 ? g.n * 0.6 : 1) * (g.k === 'beam' ? 1.25 : 1));
  if (!def.guns.length) burst = def.stats.bodyDmg * 20;
  return {
    burst: Math.round(burst),
    focus: Math.round(focus),
    coverage: buckets.size,
    dps: Math.round(dps),
    range: Math.round(range),
    mobility: +(def.stats.speed * 100).toFixed(0),
    durability: +(def.stats.hp * 100).toFixed(0),
    control: +control.toFixed(1)
  };
}

const DPS_BUDGET = { 1: 16, 2: 26, 3: 34, 4: 42 };
const ROLE_DPS = { 'Long-Range Pick': 0.8, 'Stealth Sniper': 0.75, 'Area Denial': 0.8, 'Healer': 0.6, 'Drone Control': 0.9, 'Converter': 0.9, 'Zone Control': 0.85, 'Fortification': 0.7, 'Defender': 0.85, 'Builder': 0.85, 'Melee Rammer': 1, 'Ram Hybrid': 0.7 };

function budgetScale(form, tier, family) {
  if (!form.guns.length) return 1;
  const probe = { guns: form.guns, stats: { speed: 1, hp: 1, bodyDmg: 1 } };
  const raw = powerProfile(probe).dps;
  const target = DPS_BUDGET[tier] * (family ? (ROLE_DPS[family.role] || 1) : 1);
  const lo = target * 0.75, hi = target * 1.12;
  if (raw > hi) return hi / raw;
  if (raw < lo) return lo / raw;
  return 1;
}

function scaleGuns(guns, k) {
  if (k === 1) return guns;
  return guns.map(g => ({ ...g, dm: +(g.dm * k).toFixed(3), fx: { ...g.fx } }));
}

function buildTank(idParts, family, form, tier, docIdx) {
  const k = budgetScale(form, tier, family);
  form = { ...form, guns: scaleGuns(form.guns, k), alt: form.alt ? scaleGuns(form.alt, budgetScale({ guns: form.alt }, tier, family)) : null };
  const doc = DOCTRINES[docIdx];
  const ch = family ? family.ch : C();
  const gunless = form.guns.length === 0;
  const bodyDoc = gunless ? BODY_DOCTRINES[doc.key] : null;
  const stats = {
    hp: ch.hp * (form.hp || 1),
    speed: ch.speed * (form.speed || 1),
    size: ch.size,
    bodyDmg: ch.bodyDmg * (form.bodyDmg || 1),
    fov: form.fov || ch.fov,
    accel: (ch.speed * (form.speed || 1)) > 1.1 ? 1.25 : (ch.hp > 1.2 ? 0.8 : 1),
    turn: 1
  };
  const barrels = form.guns.filter(g => !g.auto && g.a > -100 && Math.abs(g.a) < 170).length + form.guns.filter(g => Math.abs(g.a) >= 170).length;
  if (barrels > 3) stats.speed *= Math.max(0.86, 1 - 0.018 * (barrels - 3));
  if (form.guns.some(g => g.k === 'beam')) stats.hp *= 0.92;
  if (tier >= 4 && family && family.root) stats.size *= 1.06;
  const body = bodyDoc ? { ...bodyDoc.body } : {};
  if (body.speed) stats.speed *= body.speed;
  if (body.leech) stats.hp *= 0.9;
  if (body.blast || body.shards || body.staticArc) stats.bodyDmg *= 0.85;
  const guns = gunless ? [] : applyDoctrine(form.guns, doc);
  const alt = form.alt ? applyDoctrine(form.alt, doc) : null;
  const name = gunless
    ? (doc.key === 'std' ? form.name : `${bodyDoc.name} ${form.name}`)
    : (doc.prefix ? `${doc.prefix} ${form.name}` : form.name);
  const def = {
    id: idParts.join('.'),
    name,
    formName: form.name,
    family: family ? family.key : 'basic',
    familyName: family ? family.name : 'Basic',
    role: family ? family.role : 'Starter',
    tier,
    doctrine: doc.key,
    doctrineName: gunless ? bodyDoc.name : doc.name,
    body: family ? family.body : 'circle',
    bodyFx: body,
    spin: form.spin || 0,
    ability: form.ab || (family ? family.ab : 'none'),
    stats,
    guns,
    alt,
    passive: gunless ? bodyDoc.passive : doc.passive,
    weakness: gunless ? bodyDoc.weakness : doc.weakness,
    rarity: rarityFor(tier, docIdx, family),
    req: { level: [1, 1, 15, 30, 45][tier], cores: docIdx ? 1 : 0, ...(family && family.req ? family.req : {}) },
    next: []
  };
  def.profile = powerProfile(def);
  return def;
}

function build() {
  const list = [];
  const byId = new Map();
  const add = d => { d.index = list.length; list.push(d); byId.set(d.id, d); };
  for (let di = 0; di < DOCTRINES.length; di++) add(buildTank(['basic', DOCTRINES[di].key], null, BASIC_FORM, 1, di));
  for (const fam of FAMILIES) {
    fam.forms.forEach((form, fi) => {
      const tier = fam.root ? [2, 3, 3, 4][fi] : [3, 3, 4, 4][fi];
      for (let di = 0; di < DOCTRINES.length; di++) add(buildTank([fam.key, fi, DOCTRINES[di].key], fam, form, tier, di));
    });
  }
  const famByKey = Object.fromEntries(FAMILIES.map(f => [f.key, f]));
  const children = k => FAMILIES.filter(f => f.parent === k);
  const id = (fk, fi, dk) => `${fk}.${fi}.${dk}`;
  for (const d of list) {
    const dk = d.doctrine;
    if (d.family === 'basic') {
      d.next = FAMILIES.filter(f => f.root).map(f => id(f.key, 0, dk));
      continue;
    }
    const fam = famByKey[d.family];
    const fi = Number(d.id.split('.')[1]);
    if (fam.root) {
      const kids = children(fam.key);
      if (fi === 0) d.next = [id(fam.key, 1, dk), id(fam.key, 2, dk), ...kids.flatMap(k => [id(k.key, 0, dk), id(k.key, 1, dk)])];
      else if (fi === 1) d.next = [id(fam.key, 3, dk), id(kids[0].key, 2, dk)];
      else if (fi === 2) d.next = [id(fam.key, 3, dk), id(kids[1 % kids.length].key, 3, dk)];
    } else {
      if (fi === 0 || fi === 1) d.next = [id(fam.key, 2, dk), id(fam.key, 3, dk)];
    }
  }
  return { list, byId, families: FAMILIES };
}

const REG = build();
export const TANKS = REG.list;
export const TANKS_BY_ID = REG.byId;
export const TANK_FAMILIES = REG.families;
export const BASIC_INDEX = 0;

export function tankByIndex(i) { return TANKS[i] || TANKS[0]; }

export function doctrineVariant(def, docKey) {
  const parts = def.id.split('.');
  parts[parts.length - 1] = docKey;
  return TANKS_BY_ID.get(parts.join('.')) || null;
}

export function validateRegistry() {
  const errors = [];
  const ids = new Set();
  const sig = new Set();
  for (const d of TANKS) {
    if (ids.has(d.id)) errors.push(`duplicate id ${d.id}`);
    ids.add(d.id);
    const s = d.stats;
    for (const k of ['hp', 'speed', 'size', 'bodyDmg', 'fov', 'accel']) {
      if (!Number.isFinite(s[k]) || s[k] <= 0 || s[k] > 5) errors.push(`${d.id}: bad stat ${k}=${s[k]}`);
    }
    if (!d.guns.length && s.bodyDmg < 1.5) errors.push(`${d.id}: gunless tank needs body damage`);
    for (const g of d.guns) for (const e of validateGun(g)) errors.push(`${d.id}: ${e}`);
    if (d.alt) for (const g of d.alt) for (const e of validateGun(g)) errors.push(`${d.id} alt: ${e}`);
    if (!ABILITIES[d.ability]) errors.push(`${d.id}: unknown ability ${d.ability}`);
    for (const n of d.next) {
      const t = TANKS_BY_ID.get(n);
      if (!t) errors.push(`${d.id}: broken evolution ${n}`);
      else if (t.tier <= d.tier) errors.push(`${d.id}: evolution ${n} does not raise tier`);
    }
    if (d.req.level > 45) errors.push(`${d.id}: impossible level requirement`);
    const signature = JSON.stringify([d.guns, d.alt, d.stats, d.bodyFx, d.ability, d.spin]);
    if (sig.has(signature)) errors.push(`${d.id}: mechanically identical to another tank`);
    sig.add(signature);
  }
  const reachable = new Set();
  const stack = TANKS.filter(t => t.family === 'basic').map(t => t.id);
  while (stack.length) {
    const id = stack.pop();
    if (reachable.has(id)) continue;
    reachable.add(id);
    stack.push(...TANKS_BY_ID.get(id).next);
  }
  return { ok: errors.length === 0, errors, count: TANKS.length, families: FAMILIES.length + 1, reachableInNormalPlay: reachable.size };
}
