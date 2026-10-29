import { World } from './sim/world.js';
import { DT, SNAPSHOT_EVERY, MODES, DEFAULT_SETTINGS, THEMES, MAX_PLAYERS, PROTOCOL_VERSION } from './constants.js';
import { sanitizeInput, welcomeMessage, snapshotFor, sharedExtras, filterMinimap, CLIENT_TYPES } from './protocol.js';
import { hashString } from './rng.js';

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
    nexusHp: num(s.nexusHp, 2000, 80000, d.nexusHp)
  };
}

export function modeFromCode(code) {
  const m = /^pub-([a-z_]+)-\d+$/.exec(code);
  if (m && MODES[m[1]]) return m[1];
  return null;
}

export class Room {
  constructor({ code, log = () => {}, seed } = {}) {
    this.code = code;
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
    const c = { cid: this.nextCid++, conn, pid: 0, tokens: 90, last: Date.now(), bad: 0, joinedAt: Date.now() };
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
    if (typeof raw !== 'string' || raw.length > 2048) { c.bad++; return; }
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
      case 'd': if (t && typeof m.k === 'string') w.logic.applyDoctrine(t, m.k); break;
      case 'p': case 'lvl': case 'sb': w.logic.sandboxCommand(p, m); break;
      case 'tu': if (typeof m.k === 'string') w.logic.teamUpgrade(p, m.k); break;
      case 'don': w.logic.donate(p); break;
      case 'r': if (!p.tankId && w.time >= p.respawnAt && !w.matchOver) w.spawnTank(p); break;
    }
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
      if (shared.mm) extras.mm = filterMinimap(w, p, shared.mm);
      if (ev.length) extras.ev = ev;
      if (w.matchOver) extras.mo = { winner: w.matchOver.winner, in: Math.max(0, Math.round(w.matchOver.restartAt - w.time)), stats: w.matchOver.stats };
      this.send(c, snapshotFor(w, p, extras));
    }
    this.evBuf = []; this.fxBuf = []; this.tcBuf = [];
  }

  restartMatch() {
    const old = this.world;
    const keep = [...old.players.values()];
    this.newWorld();
    const w = this.world;
    const map = new Map();
    for (const p of keep) {
      if (p.isBot) continue;
      const np = w.addPlayer({ name: p.name, token: p.token, isBot: false });
      np.connected = p.connected;
      np.disconnectedAt = p.disconnectedAt ? w.time : 0;
      map.set(p.pid, np);
    }
    for (const c of this.clients.values()) {
      const np = map.get(c.pid);
      if (np) { c.pid = np.pid; this.send(c, welcomeMessage(w, np, this)); }
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
