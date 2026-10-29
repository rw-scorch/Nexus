import { validateRegistry } from '../public/shared/tank-registry.js';
import { validateBosses } from '../public/shared/boss-registry.js';
import { MOB_KEYS } from '../public/shared/entity-types.js';
import { generateLabyrinth } from '../public/shared/map-generator.js';
import { THEMES } from '../public/shared/constants.js';

const t = validateRegistry();
console.log(`Tanks: ${t.count} registered, ${t.families} families, ${t.reachableInNormalPlay} reachable, ${t.ok ? 'OK' : t.errors.length + ' errors'}`);
for (const e of t.errors.slice(0, 20)) console.log('  ' + e);
const b = validateBosses(MOB_KEYS);
console.log(`Bosses: ${b.count} (multi-phase ${b.multiPhase}, components ${b.withParts}, environment ${b.envInteract}, large-scale ${b.largeScale}), ${b.ok ? 'OK' : b.errors.length + ' errors'}`);
for (const e of b.errors.slice(0, 20)) console.log('  ' + e);
let bad = 0;
for (const th of THEMES) for (let s = 1; s <= 20; s++) if (!generateLabyrinth(s * 977, th).validation.ok) bad++;
console.log(`Labyrinths: ${THEMES.length * 20} generated, ${bad} invalid`);
process.exit(t.ok && b.ok && !bad ? 0 : 1);
