import { ACHIEVEMENTS } from '../shared/entity-types.js';

const KEY = 'nexus-iw-v1';

const DEFAULTS = {
  settings: {
    name: '', server: '', quality: 'high', reducedEffects: false, reducedMotion: false, shake: 0.6,
    hudScale: 1, hudSwap: false, showNet: true, autoFire: false, touch: 'auto', volume: 0.5, lastMode: 'ffa'
  },
  stats: { games: 0, kills: 0, deaths: 0, assists: 0, bosses: 0, secrets: 0, bestScore: 0, seconds: 0, elites: 0, heal: 0, bossTypes: {}, tanks: {} },
  ach: {},
  counters: {},
  seen: {},
  battleTank: '',
  session: '',
  user: null,
  designs: [],
  localUnlocks: []
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const d = JSON.parse(raw);
    return {
      settings: { ...DEFAULTS.settings, ...(d.settings || {}) },
      stats: { ...DEFAULTS.stats, ...(d.stats || {}) },
      ach: d.ach || {}, counters: d.counters || {}, seen: d.seen || {}, battleTank: d.battleTank || '', session: d.session || '', user: d.user || null, designs: Array.isArray(d.designs) ? d.designs : [], localUnlocks: Array.isArray(d.localUnlocks) ? d.localUnlocks : []
    };
  } catch (e) {
    return structuredClone(DEFAULTS);
  }
}

export const store = load();
let saveTimer = 0;

export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { }
  }, 200);
}

export function setSetting(k, v) { store.settings[k] = v; save(); }

export function record(ev, n = 1, extra) {
  const c = store.counters;
  const unlocked = [];
  if (ev === 'rare_tank') {
    store.seen.rare = store.seen.rare || {};
    if (store.seen.rare[extra]) return unlocked;
    store.seen.rare[extra] = 1;
  }
  c[ev] = (c[ev] || 0) + n;
  for (const a of ACHIEVEMENTS) {
    if (a.ev === ev && !store.ach[a.id] && c[ev] >= a.n) {
      store.ach[a.id] = Date.now();
      unlocked.push(a);
    }
  }
  save();
  return unlocked;
}

export function markTankPlayed(id) {
  store.stats.tanks[id] = (store.stats.tanks[id] || 0) + 1;
  save();
}
