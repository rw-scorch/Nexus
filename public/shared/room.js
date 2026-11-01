import { World } from './sim/world.js';
import { DT, SNAPSHOT_EVERY, MODES, DEFAULT_SETTINGS, THEMES, MAX_PLAYERS, PROTOCOL_VERSION } from './constants.js';
import { sanitizeInput, welcomeMessage, snapshotFor, sharedExtras, filterMinimap, CLIENT_TYPES } from './protocol.js';
import { hashString } from './rng.js';
import { TANKS_BY_ID, registerCustomTank, CUSTOM_BASE } from './tank-registry.js';
import { cleanDesign } from './custom-tanks.js';
import { cosmeticIndex } from './cosmetics.js';

let customCounter = 0;

const BOT_NAMES = ['Rook', 'Vexa', 'Cinder', 'Halberd', 'Quill', 'Mosaic', 'Tundra', 'Sable', 'Pylon', 'Orrin', 'Kestrel', 'Brine', 'Lumen', 'Gale', 'Juniper', 'Fathom', 'Ember', 'Vane', 'Talon', 'Nimbus'];

function cleanSettings(s = {}, mode) {
  const d = DEFAULT_SETTINGS;
  const num = (v, lo, hi, def) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : def);
  return {
    friendlyFire: !!s.friendlyFire,
    fog: s.fog === undefined ? d.fog : !!s.fog,
    bots: num(s.bots, 0, 16, mode === 'sandbox' ? 2 : d.bots),
    botDifficulty: ['easy', 'normal', 'hard'].includes(s.botDifficulty) ? s.botDifficulty : d.botDifficulty,
    deathRule: ['reset', 'keepThird', 'keepHalf'].includes(s.deathRule) ? s.deathRule : d.deathRule,
    theme: THEMES.includes(s.theme) ? s.theme : d.theme,
    bossInterval: num(s.bossInterval, 60, 900, d.bossInterval),
    maxBosses: num(s.maxBosses, 0, 4, d.maxBosses),
    nexusShield: num(s.nexusShield, 1000, 30000, d.nexusShield),
    nexusHp: num(s.nexusHp, 2000, 80000, d.nexusHp),
    customMap: s.customMap && typeof s.customMap === 'object' && typeof s.customMap.tiles === 'string' ? { w: num(s.customMap.w, 24, 120, 72), h: num(s.customMap.h, 24, 120, 72), tiles: s.customMap.tiles.slice(0, 14400), spawns: Array.isArray(s.customMap.spawns) ? s.customMap.spawns.slice(0, 64) : [] } : null
  };
}

export function modeFromCode(code) {
  const m = /^pub-([a-z_]+)-\d+$/.exec(code);
  if (m && MODES[m[1]]) return m[1];
  return null;
}

export class Room {
  constructor({ code, log = () => {}, seed, game = null, services = null } = {}) {
    this.code = code;
    this.game = game;
    this.services = services;
    this.cdefs = [];
    this.log = log;
    this.clients = new Map();
    this.nextCid = 1;
    this.world = null;
    this.mode = modeFromCode(code);
    this.settings = null;
    this.seedBase = seed !== undefined ? seed : (hashString(code) ^ (Date.now() & 0xffffff)) >>> 0;
    this.evBuf = []; this.fxBuf = []; this.tcBuf = [];
    this.timer = null;
    this.lastBotCheck = 0;
    this.createdAt = Date.now();
    this.emptySince = Date.now();
  }

  configure(mode, settings) {
    if (this.world) return;
    if (this.game) { mode = this.game.mode; settings = this.game.settings; }
    this.mode = MODES[mode] ? mode : (this.mode || 'ffa');
    this.settings = cleanSettings(settings || {}, this.mode);
    this.newWorld();
  }

  newWorld() {
    this.seedBase = (Math.imul(this.seedBase ^ 0x5bd1e995, 2654435761) + 12345) >>> 0;
    this.world = new World({ mode: this.mode, seed: this.seedBase, settings: this.settings });
  }

  humans() { return [...this.clients.values()].filter(c => c.pid && this.world && this.world.players.get(c.pid)); }

  attach(conn) {
    const c = { cid: this.nextCid++, conn, pid: 0, tokens: 90, last: Date.now(), bad: 0, joinedAt: Date.now(), cdSent: 0 };
    this.clients.set(c.cid, c);
    return c;
  }

  send(c, obj) {
    try { c.conn.send(JSON.stringify(obj)); } catch (e) { }
  }

  message(c, raw) {
    const now = Date.now();
    c.tokens = Math.min(90, c.tokens + (now - c.last) * 0.075);
    c.last = now;
    if (c.tokens < 1) { c.bad++; if (c.bad > 400) this.kick(c, 'rate limit'); return; }
    c.tokens--;
    if (typeof raw !== 'string' || raw.length > 6000) { c.bad++; return; }
    let m;
    try { m = JSON.parse(raw); } catch { c.bad++; return; }
    if (!m || typeof m !== 'object' || !CLIENT_TYPES.has(m.t)) { c.bad++; if (c.bad > 400) this.kick(c, 'invalid messages'); return; }
    if (m.t === 'ping') return this.send(c, { t: 'pong', c: m.c });
    if (m.t === 'j') return this.join(c, m);
    if (!c.pid || !this.world) return;
    const w = this.world;
    const p = w.players.get(c.pid);
    if (!p) return;
    const t = w.tankOf(p);
    switch (m.t) {
      case 'i': p.input = sanitizeInput(m); break;
      case 'u': if (t) w.upgradeStat(t, m.s | 0); break;
      case 'e': if (t && Number.isInteger(m.idx)) w.evolve(t, m.idx); break;
      case 'p': case 'lvl': case 'sb': w.logic.sandboxCommand(p, m); break;
      case 'tu': if (typeof m.k === 'string') w.logic.teamUpgrade(p, m.k); break;
      case 'don': w.logic.donate(p); break;
      case 'r': if (!p.tankId && w.time >= p.respawnAt && !w.matchOver) w.spawnTank(p); break;
      case 'ct': this.customTank(c, p, m.d); break;
    }
  }

  customTank(c, p, design) {
    const w = this.world;
    if (!w.logic.customTank || !design || typeof design !== 'object') return;
    if ((p.lastCustomAt || 0) > Date.now() - 1500) return;
    p.lastCustomAt = Date.now();
    const clean = cleanDesign(design);
    const idx = CUSTOM_BASE + (++customCounter) * 64 + (hashString(this.code) & 63);
    const def = registerCustomTank(idx, clean);
    if (!w.logic.customTank(p, def)) return;
    this.cdTotal = (this.cdTotal || 0) + 1;
    this.cdefs.push([this.cdTotal, idx, clean]);
    if (this.cdefs.length > 200) this.cdefs.shift();
  }

  async attachAccount(p, session, wantTank) {
    if (!this.services || typeof session !== 'string') return;
    let acc = null;
    try { acc = await this.services.verify(session); } catch (e) { acc = null; }
    if (!acc || !this.world || this.world.players.get(p.pid) !== p) return;
    p.account = acc.name;
    p.admin = !!acc.admin;
    p.accLevel = acc.level || 1;
    p.name = acc.name;
    const t = this.world.tankOf(p);
    if (t) t.name = acc.name;
    for (const u of acc.unlocks || []) p.unlocks.add(u);
    const eq = acc.equip || {};
    p.cos = { skin: cosmeticIndex('skin', eq.skin), trail: cosmeticIndex('trail', eq.trail), kill: cosmeticIndex('kill', eq.kill) };
    p.awarded = { score: p.score, kills: p.kills, bossKills: p.bossKills };
    if (Number.isInteger(wantTank) && this.world.logic.pickTank) this.world.logic.pickTank(p, { idx: wantTank });
  }

  awardPlayer(p) {
    if (!this.services || !p.account || !p.awarded) return;
    const a = p.awarded;
    const ds = Math.max(0, p.score - a.score), dk = Math.max(0, p.kills - a.kills), db = Math.max(0, p.bossKills - a.bossKills);
    if (p.score < a.score) a.score = p.score;
    if (!ds && !dk && !db) return;
    p.awarded = { score: Math.max(p.score, a.score), kills: p.kills, bossKills: p.bossKills };
    const d = { xp: Math.min(5000, ds * 0.04 + dk * 30 + db * 150), coins: Math.min(800, dk * 8 + Math.floor(ds / 600) + db * 60), kills: dk };
    Promise.resolve(this.services.award(p.account, d)).catch(() => {});
  }

  flushAwards() {
    if (!this.world) return;
    for (const p of this.world.players.values()) this.awardPlayer(p);
  }

  join(c, m) {
    if (c.pid) return;
    if (m.protocol !== PROTOCOL_VERSION) {
      this.send(c, { t: 'err', code: 'protocol', msg: `Client protocol ${m.protocol} does not match server protocol ${PROTOCOL_VERSION}. Refresh the page.` });
      return this.kick(c, 'protocol');
    }
    if (!this.world) this.configure(m.mode, m.settings);
    const w = this.world;
    const token = typeof m.token === 'string' ? m.token.slice(0, 40) : null;
    if (token) {
      for (const p of w.players.values()) {
        if (p.token === token && !p.isBot) {
          for (const other of this.clients.values()) if (other !== c && other.pid === p.pid) this.kick(other, 'replaced');
          p.connected = true; p.disconnectedAt = 0;
          c.pid = p.pid;
          c.cdSent = 0;
          this.send(c, welcomeMessage(w, p, this));
          return;
        }
      }
    }
    const humans = [...w.players.values()].filter(p => !p.isBot).length;
    if (humans >= MAX_PLAYERS) {
      this.send(c, { t: 'err', code: 'full', msg: 'This room is full.' });
      return this.kick(c, 'full');
    }
    const name = String(m.name || 'Tank').replace(/[^\w \-.]/g, '').trim().slice(0, 16) || 'Tank';
    const bot = [...w.players.values()].find(p => p.isBot);
    if (bot && w.players.size >= Math.max(this.settings.bots, 1)) w.removePlayer(bot.pid);
    const p = w.addPlayer({ name, token: token || `t${Math.random().toString(36).slice(2, 12)}`, isBot: false });
    c.pid = p.pid;
    if (Number.isInteger(m.tank) && w.logic.pickTank) w.logic.pickTank(p, { idx: m.tank });
    if (typeof m.session === 'string') this.attachAccount(p, m.session.slice(0, 64), m.tank);
    this.emptySince = 0;
    this.send(c, welcomeMessage(w, p, this));
    w.emit({ k: 'announce', text: `${p.name} joined`, tone: 'info' });
  }

  kick(c, reason) {
    try { c.conn.close(4000, reason); } catch (e) { }
    this.close(c);
  }

  close(c) {
    if (!this.clients.has(c.cid)) return;
    this.clients.delete(c.cid);
    if (c.pid && this.world) {
      const p = this.world.players.get(c.pid);
      if (p) { p.connected = false; p.disconnectedAt = this.world.time; p.input = { mx: 0, my: 0, ax: 1, ay: 0, fire: false, alt: false, ability: false, seq: 0 }; }
    }
    if (!this.clients.size) this.emptySince = Date.now();
  }

  manageBots() {
    const w = this.world;
    const players = [...w.players.values()];
    for (const p of players) {
      if (!p.isBot && !p.connected && w.time - p.disconnectedAt > 25) {
        this.awardPlayer(p);
        w.removePlayer(p.pid);
        w.emit({ k: 'announce', text: `${p.name} left`, tone: 'info' });
      }
      if (!p.isBot && p.connected && !p.tankId && w.time - p.respawnAt > 10 && !w.matchOver) w.spawnTank(p);
    }
    const humans = [...w.players.values()].filter(p => !p.isBot).length;
    const bots = [...w.players.values()].filter(p => p.isBot);
    const want = humans === 0 ? 0 : Math.max(0, this.settings.bots - humans);
    if (bots.length > want) {
      const teamCount = t => [...w.players.values()].filter(p => p.team === t).length;
      const pick = w.logic.teamsActive ? (bots.find(b => b.team === (teamCount(0) > teamCount(1) ? 0 : 1)) || bots[0]) : bots[0];
      w.removePlayer(pick.pid);
    } else if (bots.length < want) {
      const used = new Set(bots.map(b => b.name));
      const nm = BOT_NAMES.find(n => !used.has(`[BOT] ${n}`)) || `Unit ${bots.length + 1}`;
      w.addPlayer({ name: `[BOT] ${nm}`, isBot: true });
    }
  }

  tick() {
    if (!this.world) return;
    const w = this.world;
    w.step();
    this.evBuf.push(...w.events);
    if (this.fxBuf.length < 600) this.fxBuf.push(...w.fx);
    this.tcBuf.push(...w.tileChanges);
    if (w.tick % 30 === 0) this.manageBots();
    if (w.tick % 600 === 0) this.flushAwards();
    if (this.services) for (const e of w.events) if (e.k === 'personal' && e.ev === 'secret_tank') {
      const p = w.players.get(e.pid);
      if (p && p.account) Promise.resolve(this.services.award(p.account, { unlock: e.tank })).catch(() => {});
    }
    if (w.matchOver && w.time >= w.matchOver.restartAt) return this.restartMatch();
    if (w.tick % SNAPSHOT_EVERY !== 0) return;
    const once = w.tick % 30 === 0;
    const shared = sharedExtras(w, once);
    shared.fx = this.fxBuf; shared.tc = this.tcBuf.length ? this.tcBuf : undefined;
    const globalEv = this.evBuf.filter(e => e.k !== 'personal' && e.k !== 'toast' && e.k !== 'log');
    for (const c of this.clients.values()) {
      if (!c.pid) continue;
      const p = w.players.get(c.pid);
      if (!p) continue;
      const personal = this.evBuf.filter(e => (e.k === 'personal' || e.k === 'toast') && e.pid === p.pid);
      const ev = globalEv.concat(personal);
      const extras = { ...shared, mi: w.logic.info(p) };
      if (c.cdSent < (this.cdTotal || 0)) { extras.cd = this.cdefs.filter(e => e[0] > c.cdSent).map(e => [e[1], e[2]]); c.cdSent = this.cdTotal; }
      if (shared.mm) extras.mm = filterMinimap(w, p, shared.mm);
      if (ev.length) extras.ev = ev;
      if (w.matchOver) extras.mo = { winner: w.matchOver.winner, in: Math.max(0, Math.round(w.matchOver.restartAt - w.time)), stats: w.matchOver.stats };
      this.send(c, snapshotFor(w, p, extras));
    }
    this.evBuf = []; this.fxBuf = []; this.tcBuf = [];
  }

  restartMatch() {
    this.flushAwards();
    const old = this.world;
    const keep = [...old.players.values()];
    this.newWorld();
    const w = this.world;
    const map = new Map();
    for (const p of keep) {
      if (p.isBot) continue;
      const np = w.addPlayer({ name: p.name, token: p.token, isBot: false });
      for (const k of ['account', 'admin', 'accLevel', 'cos', 'unlocks', 'battleDef']) np[k] = p[k];
      if (np.account) np.awarded = { score: np.score, kills: np.kills, bossKills: np.bossKills };
      np.connected = p.connected;
      np.disconnectedAt = p.disconnectedAt ? w.time : 0;
      map.set(p.pid, np);
    }
    for (const c of this.clients.values()) {
      const np = map.get(c.pid);
      if (np) { c.pid = np.pid; c.cdSent = 0; this.send(c, welcomeMessage(w, np, this)); }
      else c.pid = 0;
    }
  }

  start(setI = setInterval, clearI = clearInterval) {
    if (this.timer) return;
    this.clearI = clearI;
    this.timer = setI(() => {
      try { this.tick(); } catch (err) { this.log('tick error', err && err.stack || err); }
    }, DT * 1000);
  }

  stop() {
    if (this.timer) { (this.clearI || clearInterval)(this.timer); this.timer = null; }
  }

  status() {
    return {
      code: this.code, mode: this.mode, clients: this.clients.size,
      players: this.world ? [...this.world.players.values()].filter(p => !p.isBot).length : 0,
      bots: this.world ? [...this.world.players.values()].filter(p => p.isBot).length : 0,
      entities: this.world ? this.world.ents.length : 0
    };
  }
}
