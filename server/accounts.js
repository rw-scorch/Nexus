import { MODES } from '../public/shared/constants.js';
import { COSMETICS, SLOTS, findCosmetic, accountLevel } from '../public/shared/cosmetics.js';

const ADMIN_CODE_SHA256 = 'f2cb12faed072c7c326dc5af2ac1feef3346a7c2d67abb30f3e80e1c172dc8cb';
const ROTATE_MS = 2 * 60 * 60 * 1000;
const SESSION_MS = 30 * 24 * 3600 * 1000;
const CUSTOM_MAP_MODES = ['ffa', 'tdm', 'battle', 'battle_team', 'bosshunt', 'workshop', 'sandbox'];
const enc = new TextEncoder();

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
async function sha256(s) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
async function pbkdf2(pass, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256));
}
function randomToken(n = 24) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return hex(a);
}
function sameStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function featuredMode(now = Date.now(), offset = 0) {
  const pool = Object.keys(MODES).filter(k => k !== 'battle');
  let h = (Math.floor(now / ROTATE_MS) + offset) >>> 0;
  h = Math.imul(h ^ 0x9e3779b9, 2654435761) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return pool[h % pool.length];
}

export function publicUser(u) {
  return {
    name: u.name, xp: u.xp, level: accountLevel(u.xp), coins: u.coins, kills: u.kills, admin: !!u.admin,
    owned: u.owned, equip: u.equip, unlocks: u.unlocks, created: u.created
  };
}

class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (msg, status = 400) => { throw new ApiError(status, msg); };

export class AccountStore {
  constructor(kv, { openRooms = false } = {}) {
    this.kv = kv;
    this.openRooms = openRooms;
    this.fails = new Map();
  }

  async user(name) { return name ? this.kv.get(`user:${String(name).toLowerCase()}`) : null; }
  async saveUser(u) { await this.kv.put(`user:${u.name.toLowerCase()}`, u); }

  async signup(name, pass) {
    name = String(name || '').trim();
    if (!/^[A-Za-z0-9_\-]{3,16}$/.test(name)) bad('Name must be 3 to 16 letters, numbers, _ or -');
    if (typeof pass !== 'string' || pass.length < 6 || pass.length > 72) bad('Password must be 6 to 72 characters');
    if (await this.user(name)) bad('That name is taken', 409);
    const salt = randomToken(12);
    const u = {
      name, salt, hash: await pbkdf2(pass, salt), xp: 0, coins: 200, kills: 0, created: Date.now(), admin: false,
      owned: ['skin:none', 'trail:basic', 'kill:burst'], equip: { skin: 'none', trail: 'basic', kill: 'burst' }, unlocks: [], redeemed: []
    };
    await this.saveUser(u);
    return this.newSession(u);
  }

  async login(name, pass) {
    const key = String(name || '').toLowerCase();
    const f = this.fails.get(key);
    if (f && f.n >= 8 && Date.now() - f.t < 5 * 60000) bad('Too many attempts. Wait 5 minutes.', 429);
    const u = await this.user(key);
    if (!u || typeof pass !== 'string' || !sameStr(await pbkdf2(pass, u.salt), u.hash)) {
      this.fails.set(key, { n: (f && Date.now() - f.t < 5 * 60000 ? f.n : 0) + 1, t: Date.now() });
      bad('Wrong name or password', 401);
    }
    this.fails.delete(key);
    return this.newSession(u);
  }

  async newSession(u) {
    const token = randomToken();
    await this.kv.put(`sess:${token}`, { u: u.name.toLowerCase(), exp: Date.now() + SESSION_MS });
    return { token, user: publicUser(u) };
  }

  async session(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{48}$/.test(token)) return null;
    const s = await this.kv.get(`sess:${token}`);
    if (!s || s.exp < Date.now()) return null;
    return this.user(s.u);
  }

  async logout(token) { if (typeof token === 'string') await this.kv.delete(`sess:${token}`); }

  async award(name, d = {}) {
    const u = await this.user(name);
    if (!u) return null;
    u.xp += Math.max(0, Math.min(5000, Math.round(d.xp || 0)));
    u.coins += Math.max(0, Math.min(800, Math.round(d.coins || 0)));
    u.kills += Math.max(0, Math.min(200, Math.round(d.kills || 0)));
    if (typeof d.unlock === 'string' && /^[a-z0-9_]{2,24}$/i.test(d.unlock) && !u.unlocks.includes(d.unlock)) u.unlocks.push(d.unlock);
    await this.saveUser(u);
    return publicUser(u);
  }

  async buy(u, itemId) {
    const f = findCosmetic(itemId);
    if (!f) bad('Unknown item');
    if (u.owned.includes(itemId)) bad('You already own this');
    if (u.coins < f.item.price) bad('Not enough coins');
    u.coins -= f.item.price;
    u.owned.push(itemId);
    u.equip[f.slot] = f.item.id;
    await this.saveUser(u);
    return publicUser(u);
  }

  async equip(u, itemId) {
    const f = findCosmetic(itemId);
    if (!f || !u.owned.includes(itemId)) bad('You do not own this');
    u.equip[f.slot] = f.item.id;
    await this.saveUser(u);
    return publicUser(u);
  }

  async redeem(u, code) {
    code = String(code || '').trim();
    if (!code || code.length > 64) bad('Enter a code');
    if (sameStr(await sha256(code), ADMIN_CODE_SHA256)) {
      if (u.admin) return { user: publicUser(u), message: 'You are already an admin.' };
      u.admin = true;
      await this.saveUser(u);
      return { user: publicUser(u), message: 'Admin access granted.' };
    }
    const key = code.toUpperCase();
    const c = await this.kv.get(`code:${key}`);
    if (!c) bad('That code does not exist', 404);
    if (u.redeemed.includes(key)) bad('You already redeemed this code');
    if (c.max && c.uses >= c.max) bad('This code has been used up');
    c.uses++;
    u.redeemed.push(key);
    u.coins += c.coins || 0;
    u.xp += c.xp || 0;
    await this.kv.put(`code:${key}`, c);
    await this.saveUser(u);
    return { user: publicUser(u), message: `Redeemed: ${c.coins ? `${c.coins} coins` : ''}${c.coins && c.xp ? ' and ' : ''}${c.xp ? `${c.xp} XP` : ''}.` };
  }

  async games() {
    const now = Date.now();
    const feat = featuredMode(now);
    const list = [
      { code: 'pub-battle-1', name: 'Battle', mode: 'battle', official: true },
      { code: `pub-${feat}-1`, name: MODES[feat].name, mode: feat, official: true, featured: true }
    ];
    const admin = await this.kv.list('game:');
    for (const g of Object.values(admin).sort((a, b) => a.created - b.created)) list.push({ code: g.code, name: g.name, mode: g.mode, by: g.by, map: g.mapName || null });
    return { games: list, featured: feat, rotatesIn: Math.round((ROTATE_MS - (now % ROTATE_MS)) / 1000) };
  }

  async gameFor(code) {
    if (typeof code !== 'string') return null;
    const m = /^pub-([a-z_]+)-([1-6])$/.exec(code);
    if (m && MODES[m[1]]) {
      const now = Date.now();
      if (m[1] === 'battle' || m[1] === featuredMode(now) || m[1] === featuredMode(now, -1)) return { mode: m[1], settings: {} };
    }
    const g = await this.kv.get(`game:${code}`);
    if (g) {
      const settings = { ...g.settings };
      if (g.mapId) {
        const map = await this.kv.get(`map:${g.mapId}`);
        if (map) settings.customMap = { w: map.w, h: map.h, tiles: map.tiles, spawns: map.spawns };
      }
      return { mode: g.mode, settings };
    }
    if (this.openRooms) return { mode: null, settings: null, open: true };
    return null;
  }

  async createGame(u, b) {
    const mode = String(b.mode || '');
    if (!MODES[mode]) bad('Unknown mode');
    let code = String(b.code || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
    if (!code) code = `g-${randomToken(3)}`;
    if (code.length < 3 || code.startsWith('pub-')) bad('Room code must be 3 to 24 characters and not start with pub-');
    const name = String(b.name || MODES[mode].name).replace(/[<>]/g, '').trim().slice(0, 32) || MODES[mode].name;
    let mapName = null, mapId = null;
    if (b.mapId) {
      if (!CUSTOM_MAP_MODES.includes(mode)) bad(`Custom maps work with: ${CUSTOM_MAP_MODES.map(k => MODES[k].name).join(', ')}`);
      const map = await this.kv.get(`map:${b.mapId}`);
      if (!map) bad('Map not found');
      mapId = map.id; mapName = map.name;
    }
    const s = b.settings && typeof b.settings === 'object' ? b.settings : {};
    const settings = {};
    for (const k of ['bots', 'botDifficulty', 'deathRule', 'theme', 'bossInterval', 'maxBosses', 'friendlyFire', 'fog', 'nexusShield', 'nexusHp']) if (s[k] !== undefined) settings[k] = s[k];
    const g = { code, name, mode, settings, mapId, mapName, by: u.name, created: Date.now() };
    await this.kv.put(`game:${code}`, g);
    return g;
  }

  async stopGame(code) { await this.kv.delete(`game:${code}`); }

  async listMaps() {
    const all = await this.kv.list('map:');
    return Object.values(all).map(m => ({ id: m.id, name: m.name, w: m.w, h: m.h, by: m.by, updated: m.updated }));
  }

  async saveMap(u, b) {
    const w = Math.round(Number(b.w)), h = Math.round(Number(b.h));
    if (!(w >= 24 && w <= 120 && h >= 24 && h <= 120)) bad('Map size must be 24 to 120 tiles');
    const tiles = String(b.tiles || '');
    if (tiles.length !== w * h || !/^[0-9a-d]+$/.test(tiles)) bad('Bad tile data');
    const spawns = (Array.isArray(b.spawns) ? b.spawns : []).slice(0, 64).map(s => ({ x: Math.max(1, Math.min(w - 2, Math.round(s.x))), y: Math.max(1, Math.min(h - 2, Math.round(s.y))), team: s.team === 0 || s.team === 1 ? s.team : undefined }));
    const id = /^[a-z0-9]{6,16}$/.test(b.id || '') ? b.id : randomToken(5);
    const name = String(b.name || 'Untitled').replace(/[<>]/g, '').trim().slice(0, 32) || 'Untitled';
    const map = { id, name, w, h, tiles, spawns, by: u.name, updated: Date.now() };
    await this.kv.put(`map:${id}`, map);
    return map;
  }

  async createCode(b) {
    const code = String(b.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{4,32}$/.test(code)) bad('Codes are 4 to 32 letters, numbers, _ or -');
    const c = { code, coins: Math.max(0, Math.min(100000, Math.round(Number(b.coins) || 0))), xp: Math.max(0, Math.min(1000000, Math.round(Number(b.xp) || 0))), max: Math.max(0, Math.round(Number(b.max) || 0)), uses: 0, created: Date.now() };
    if (!c.coins && !c.xp) bad('A code needs coins or XP');
    await this.kv.put(`code:${code}`, c);
    return c;
  }
}

export async function handleApi(store, { method, path, body, token }) {
  try {
    const out = await route(store, method, path, body || {}, token);
    return { status: 200, json: out };
  } catch (e) {
    if (e instanceof ApiError) return { status: e.status, json: { error: e.message } };
    return { status: 500, json: { error: 'Server error' } };
  }
}

async function route(store, method, path, b, token) {
  if (method === 'GET' && path === '/api/games') return store.games();
  if (method === 'POST' && path === '/api/signup') return store.signup(b.name, b.password);
  if (method === 'POST' && path === '/api/login') return store.login(b.name, b.password);
  if (method === 'POST' && path === '/api/logout') { await store.logout(token); return { ok: true }; }
  if (method === 'GET' && path === '/api/catalog') return COSMETICS;
  const u = await store.session(token);
  if (!u) bad('Please log in again', 401);
  if (method === 'GET' && path === '/api/me') return { user: publicUser(u) };
  if (method === 'POST' && path === '/api/shop/buy') return { user: await store.buy(u, b.item) };
  if (method === 'POST' && path === '/api/shop/equip') return { user: await store.equip(u, b.item) };
  if (method === 'POST' && path === '/api/redeem') return store.redeem(u, b.code);
  if (!path.startsWith('/api/admin/')) bad('Not found', 404);
  if (!u.admin) bad('Admins only', 403);
  if (method === 'POST' && path === '/api/admin/game') return { game: await store.createGame(u, b) };
  if (method === 'POST' && path === '/api/admin/game/stop') { await store.stopGame(String(b.code || '')); return { ok: true }; }
  if (method === 'GET' && path === '/api/admin/maps') return { maps: await store.listMaps() };
  if (method === 'POST' && path === '/api/admin/map/get') { const m = await store.kv.get(`map:${b.id}`); if (!m) bad('Map not found', 404); return { map: m }; }
  if (method === 'POST' && path === '/api/admin/map') return { map: await store.saveMap(u, b) };
  if (method === 'POST' && path === '/api/admin/map/delete') { await store.kv.delete(`map:${b.id}`); return { ok: true }; }
  if (method === 'POST' && path === '/api/admin/code') return { code: await store.createCode(b) };
  if (method === 'GET' && path === '/api/admin/codes') return { codes: Object.values(await store.kv.list('code:')) };
  if (method === 'POST' && path === '/api/admin/code/delete') { await store.kv.delete(`code:${String(b.code || '').toUpperCase()}`); return { ok: true }; }
  bad('Not found', 404);
}

export function roomServices(store) {
  return {
    async verify(token) {
      const u = await store.session(token);
      return u ? publicUser(u) : null;
    },
    async award(name, d) { return store.award(name, d); }
  };
}

export function memoryKV(file = null, fs = null) {
  const data = new Map();
  if (file && fs) {
    try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) data.set(k, v); } catch (e) { }
  }
  let timer = null;
  const persist = () => {
    if (!file || !fs) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const tmp = file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(data)));
        fs.renameSync(tmp, file);
      } catch (e) { console.error('account save failed', e.message); }
    }, 300);
  };
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  return {
    async get(k) { return clone(data.get(k)); },
    async put(k, v) { data.set(k, clone(v)); persist(); },
    async delete(k) { data.delete(k); persist(); },
    async list(prefix) { const o = {}; for (const [k, v] of data) if (k.startsWith(prefix)) o[k] = clone(v); return o; }
  };
}

export function durableKV(storage) {
  return {
    async get(k) { return storage.get(k); },
    async put(k, v) { await storage.put(k, v); },
    async delete(k) { await storage.delete(k); },
    async list(prefix) { return Object.fromEntries(await storage.list({ prefix })); }
  };
}
