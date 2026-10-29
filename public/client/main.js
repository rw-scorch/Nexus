import { PROTOCOL_VERSION, MODES } from '../shared/constants.js';
import { TANKS, tankByIndex } from '../shared/tank-registry.js';
import { BOSSES } from '../shared/boss-registry.js';
import { Renderer } from './renderer.js';
import { Hud } from './hud.js';
import { Menus } from './menus.js';
import { Input, touchPreferred } from './input.js';
import { NetClient, LocalClient, serverBase, wsUrl } from './net.js';
import { store, save, record, markTankPlayed } from './storage.js';
import { sfx, unlockAudio } from './audio.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class App {
  constructor() {
    this.canvas = document.getElementById('game');
    this.hudRoot = document.getElementById('hud');
    this.touchRoot = document.getElementById('touch');
    this.renderer = new Renderer(this.canvas);
    this.hud = new Hud(this.hudRoot, this.touchRoot, {
      onAction: (a, d) => this.hudAction(a, d),
      onAbility: held => { this.input.abilityHeld = held; },
      onAutoFire: () => { this.input.autoFire = !this.input.autoFire; this.hud.autoFire(this.input.autoFire); }
    });
    this.menus = new Menus(document.getElementById('ui'), this);
    this.input = new Input(this.canvas, this.touchRoot, {
      onStat: i => this.send({ t: 'u', s: i }),
      onEvolve: i => { const evo = this.hud.you && this.hud.you.evo; if (evo && evo[i] !== undefined) this.evolve(evo[i]); },
      onToggle: name => this.toggle(name),
      onRespawn: () => this.send({ t: 'r' }),
      onAutoFire: on => this.hud.autoFire(on),
      onGesture: () => unlockAudio(),
      onTouchMode: () => this.hud.setTouch(true),
      onSticks: (m, a) => this.hud.sticks(m, a)
    });
    this.state = 'menu';
    this.net = null;
    this.session = null;
    this.lastSend = 0;
    this.lastInput = '';
    this.last = performance.now();
    this.frames = 0; this.fpsT = performance.now();
    this.prev = null;
    document.addEventListener('pointerdown', () => unlockAudio(), { once: false });
    this.menus.show('main');
    requestAnimationFrame(t => this.loop(t));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.input.keys.clear(); });
  }

  send(obj) { if (this.net) this.net.send(obj); }

  tokenFor(code) {
    const k = `nexus-token-${code}`;
    let t = sessionStorage.getItem(k);
    if (!t) { t = `t${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; sessionStorage.setItem(k, t); }
    return t;
  }

  quickPlay(mode, name) {
    this.session = { kind: 'online', mode, name, pubIndex: 1, code: `pub-${mode}-1`, settings: {} };
    this.connect();
  }

  createRoom(mode, settings, name) {
    const code = Array.from({ length: 5 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');
    this.session = { kind: 'online', mode, settings, name, code };
    this.connect();
  }

  joinRoom(code, name) {
    this.session = { kind: 'online', mode: null, settings: {}, name, code: code.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) };
    this.connect();
  }

  offline(mode, settings, name) {
    this.session = { kind: 'offline', mode, settings, name, code: `offline-${mode}` };
    this.connect();
  }

  retry() { if (this.session) { this.session.reconnects = 0; this.connect(); } else this.menus.show('main'); }

  connect() {
    const s = this.session;
    if (this.net) this.net.close();
    this.welcomed = false;
    const handlers = {
      onOpen: () => this.send({ t: 'j', protocol: PROTOCOL_VERSION, name: s.name, token: this.tokenFor(s.code), mode: s.mode, settings: s.settings }),
      onMessage: m => this.onMessage(m),
      onClose: (code, reason, wasOpen) => this.onClose(code, reason, wasOpen)
    };
    if (s.kind === 'offline') {
      this.net = new LocalClient(s.code, handlers);
    } else {
      const base = serverBase();
      if (!base) return this.menus.show('error', { message: 'No game server address is configured, and this page was opened from a file. Set a server address in Settings, or use Offline Practice.', server: '' });
      s.server = base;
      this.net = new NetClient(wsUrl(base, s.code), handlers);
      if (this.state !== 'playing') this.menus.show('connecting', { text: `Joining ${s.code} on ${base.replace(/^https?:\/\//, '')}` });
    }
    this.net.connect();
  }

  onClose(code, reason, wasOpen) {
    const s = this.session;
    if (!s) return;
    if (this.state === 'playing' && wasOpen && s.kind === 'online') {
      s.reconnects = (s.reconnects || 0) + 1;
      if (s.reconnects <= 6) {
        this.hud.toast(`Connection lost. Reconnecting (${s.reconnects}/6)...`, 'warn', 2000);
        setTimeout(() => { if (this.session === s) this.connect(); }, 1200 * s.reconnects);
        return;
      }
    }
    if (this.expectedClose) { this.expectedClose = false; return; }
    this.stopPlaying();
    const msg = reason && reason !== 'leave' ? `The server closed the connection (${reason}).` : wasOpen ? 'The connection to the game server was lost.' : `Could not reach the game server${reason ? `: ${reason}` : ''}. It may not be deployed yet, may be asleep, or the address may be wrong.`;
    this.menus.show('error', { message: msg, server: s.server });
  }

  onMessage(m) {
    switch (m.t) {
      case 'w': return this.onWelcome(m);
      case 's': return this.onSnapshot(m);
      case 'err': {
        const s = this.session;
        if (m.code === 'full' && s && s.pubIndex && s.pubIndex < 6) {
          this.expectedClose = true;
          s.pubIndex++;
          s.code = `pub-${s.mode}-${s.pubIndex}`;
          return setTimeout(() => this.connect(), 100);
        }
        this.expectedClose = true;
        this.stopPlaying();
        return this.menus.show('error', { message: m.msg || 'The server refused to join.', server: s && s.server });
      }
    }
  }

  onWelcome(m) {
    const s = this.session;
    s.reconnects = 0;
    s.mode = m.mode;
    s.code = m.room;
    this.welcomed = true;
    if (m.token) sessionStorage.setItem(`nexus-token-${m.room}`, m.token);
    this.renderer.setMap(m.map, m.mode, m.settings);
    const wasPlaying = this.state === 'playing';
    this.hud.setMode(m.mode, s.kind === 'offline', m.settings);
    this.hud.roomCode = m.room;
    this.menus.hide();
    this.hudRoot.classList.remove('hidden');
    this.hud.setTouch(touchPreferred());
    this.input.enabled = true;
    if (!wasPlaying) {
      this.input.autoFire = !!store.settings.autoFire;
      this.hud.autoFire(this.input.autoFire);
      store.stats.games++;
      this.playStart = performance.now();
      this.prev = null;
      if (s.kind === 'online' && !m.room.startsWith('pub-')) this.hud.toast(`Room code: ${m.room}`, 'gold', 6000);
    } else this.hud.toast('Reconnected', 'good', 1500);
    this.state = 'playing';
  }

  onSnapshot(s) {
    if (this.state !== 'playing') return;
    if (s.tc) this.renderer.applyTiles(s.tc);
    this.renderer.pushSnapshot(s);
    this.snap = s;
    this.hud.update(s, { rtt: this.net ? this.net.rtt : 0, offline: this.session && this.session.kind === 'offline' });
    if (s.ev) for (const e of s.ev) this.onEvent(e, s);
    this.track(s);
  }

  track(s) {
    const me = s.me, y = s.y;
    const st = store.stats;
    if (this.prev) {
      if (me.k > this.prev.k) st.kills += me.k - this.prev.k;
      if (me.d > this.prev.d) { st.deaths += me.d - this.prev.d; sfx.death(); }
      if (me.as > this.prev.as) st.assists += me.as - this.prev.as;
      if (me.co > this.prev.co) this.hud.toast(`+${me.co - this.prev.co} relic core${me.co - this.prev.co > 1 ? 's' : ''}`, 'gold', 1800);
    }
    st.bestScore = Math.max(st.bestScore, me.sc);
    if (y && !y.dead && y.def !== (this.prev && this.prev.def)) {
      const d = tankByIndex(y.def);
      markTankPlayed(d.id);
      if (this.prev && this.prev.def !== undefined) sfx.evolve();
    }
    this.prev = { k: me.k, d: me.d, as: me.as, co: me.co, def: y && !y.dead ? y.def : this.prev && this.prev.def };
    save();
  }

  onEvent(e, s) {
    const mine = s.me;
    switch (e.k) {
      case 'kill': {
        const killerTeam = e.at, victimTeam = e.bt;
        const col = t => (MODES[this.session.mode] && MODES[this.session.mode].teams) ? (t === 0 ? '#38a3ff' : '#ff4d61') : '#e6edf7';
        this.hud.addFeed(`<span style="color:${col(killerTeam)}">${esc(e.a)}</span> <span class="muted">destroyed</span> <span style="color:${col(victimTeam)}">${esc(e.b)}</span>`);
        break;
      }
      case 'announce': this.hud.toast(e.text, e.tone || 'info', e.tone === 'boss' ? 5000 : 3500); if (e.tone === 'bad' || e.tone === 'warn') sfx.warn(); break;
      case 'boss': this.hud.toast(`${e.name} has awakened`, 'boss', 5000); break;
      case 'bossPhase': this.hud.toast(`${e.name}: ${e.phase}`, 'warn', 3000); break;
      case 'bossPart': this.hud.addFeed(`<span style="color:#ffd84d">${esc(e.name)}</span> <span class="muted">lost a component</span>`); break;
      case 'bossDown': this.hud.toast(`${e.name} defeated${e.rewarded && e.rewarded.length ? `. Top: ${e.rewarded.slice(0, 3).map(r => `${r.name} ${r.share}%`).join(', ')}` : ''}`, 'gold', 6000); break;
      case 'toast': this.hud.toast(e.text, e.tone || 'info'); break;
      case 'matchEnd': sfx.ach(); break;
      case 'personal': {
        const st = store.stats;
        if (e.ev === 'boss') { st.bosses++; st.bossTypes[e.boss] = (st.bossTypes[e.boss] || 0) + 1; }
        if (e.ev === 'secret') st.secrets++;
        if (e.ev === 'elite') st.elites++;
        if (e.ev === 'heal') st.heal += e.n || 0;
        if (e.ev === 'core') break;
        const unlocked = record(e.ev, e.ev === 'heal' ? (e.n || 0) : 1, e.tank);
        for (const a of unlocked) { this.hud.toast(`Achievement unlocked: ${a.name}`, 'gold', 5000); sfx.ach(); }
        break;
      }
    }
  }

  evolve(idx) { this.send({ t: 'e', idx }); }

  toggle(name) {
    if (this.state !== 'playing') return;
    if (name === 'minimap') { const mm = document.getElementById('minimap'); mm.classList.toggle('hidden'); return; }
    if (name === 'team' && this.session.mode !== 'nexus') return;
    if (name === 'sandbox' && this.session.mode !== 'sandbox') return;
    this.hud.toggle(name);
  }

  hudAction(a, d) {
    switch (a) {
      case 'stat': this.send({ t: 'u', s: Number(d.i) }); break;
      case 'evolve': this.evolve(Number(d.i)); break;
      case 'doc': this.send({ t: 'd', k: d.k }); break;
      case 'tu': this.send({ t: 'tu', k: d.k }); break;
      case 'donate': this.send({ t: 'don' }); break;
      case 'respawn': this.send({ t: 'r' }); break;
      case 'leave': this.leave(); break;
      case 'close': this.hud.closeDrawer(); break;
      case 'sbpick': this.hud.closeDrawer(); this.menus.show('collection', { pick: true, back: 'game', clear: true }); break;
      case 'sblvl': this.send({ t: 'lvl' }); break;
      case 'summon': this.send({ t: 'sb', idx: Number(d.i) }); this.hud.closeDrawer(); break;
      case 'statspin': this.hud.statsPinned = !this.hud.statsPinned; this.hud.cache.stats = null; this.hud.closeDrawer(); break;
      case 'settings': this.hud.closeDrawer(); this.menus.show('settings', { back: 'game', clear: true }); break;
      case 'help': this.hud.closeDrawer(); this.menus.show('help', { back: 'game', clear: true }); break;
    }
  }

  sandboxPick(idx) { this.send({ t: 'p', idx }); this.closeOverlay(); }

  closeOverlay() { if (this.state === 'playing') this.menus.hide(); else this.menus.show('main'); }

  onSettingsChanged(k) {
    if (k === 'quality') this.renderer.resize();
    if (k === 'hudScale' || k === 'hudSwap') this.hud.applyLayout();
    if (k === 'touch' && this.state === 'playing') this.hud.setTouch(touchPreferred());
  }

  stopPlaying() {
    if (this.state === 'playing' && this.playStart) store.stats.seconds += (performance.now() - this.playStart) / 1000;
    this.playStart = 0;
    this.state = 'menu';
    this.input.enabled = false;
    this.hudRoot.classList.add('hidden');
    this.hud.setTouch(false);
    this.hud.closeDrawer();
    document.getElementById('toasts').innerHTML = '';
    save();
  }

  leave() {
    this.expectedClose = true;
    if (this.net) this.net.close();
    this.net = null;
    this.stopPlaying();
    this.session = null;
    this.menus.show('main');
  }

  loop(t) {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.frames++;
    if (t - this.fpsT > 1000) { this.hud.fps = this.frames * 1000 / (t - this.fpsT); this.frames = 0; this.fpsT = t; }
    if (this.state === 'playing' && this.snap) {
      const scale = this.renderer.cam.scale / this.renderer.dpr || 1;
      const local = this.input.state({ x: innerWidth / 2, y: innerHeight / 2 }, scale);
      const y = this.snap.y || {};
      const fov = y.def !== undefined ? tankByIndex(y.def).stats.fov * (1 + 0.004 * ((y.lv || 1) - 1)) : 1;
      const mi = this.snap.mi || {};
      const res = this.renderer.render(dt, y.dead ? null : local, { names: this.hud.names, fov, dark: !!this.snap.dk });
      const key = `${local.mx.toFixed(2)},${local.my.toFixed(2)},${Math.round(local.ax)},${Math.round(local.ay)},${local.fire},${local.alt},${local.ability}`;
      if (t - this.lastSend > 33 && (key !== this.lastInput || t - this.lastSend > 120)) {
        this.seq = (this.seq || 0) + 1;
        this.send({ t: 'i', mx: local.mx, my: local.my, ax: local.ax, ay: local.ay, f: local.fire ? 1 : 0, a2: local.alt ? 1 : 0, ab: local.ability ? 1 : 0, s: this.seq });
        this.lastInput = key;
        this.lastSend = t;
      }
      if (this.frames % 3 === 0) this.renderer.drawMinimap(document.getElementById('minimap'), this.snap.mm || this.lastMM, mi);
      if (this.snap.mm) this.lastMM = this.snap.mm;
    } else if (this.state !== 'playing') {
      const ctx = this.renderer.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#090c12';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    requestAnimationFrame(tt => this.loop(tt));
  }
}

window.addEventListener('error', e => { console.error(e.error || e.message); });
window.nexusApp = new App();
