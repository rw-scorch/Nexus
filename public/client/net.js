import { Room } from '../shared/room.js';
import { store } from './storage.js';

export function serverBase() {
  const s = (store.settings.server || (window.NEXUS_CONFIG && window.NEXUS_CONFIG.server) || '').trim();
  if (s) return s.replace(/\/+$/, '').replace(/\/ws$/, '');
  if (location.protocol === 'file:') return '';
  return location.origin;
}

export function wsUrl(base, room) {
  const u = base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  const full = /^wss?:/.test(u) ? u : `wss://${u}`;
  return `${full}/ws?room=${encodeURIComponent(room)}`;
}

export function httpUrl(base) {
  const u = base.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
  return /^https?:/.test(u) ? u : `https://${u}`;
}

export async function checkHealth(base, timeout = 5000) {
  if (!base) return { ok: false, reason: 'No server address configured' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`${httpUrl(base)}/health`, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) return { ok: false, reason: `Health check returned HTTP ${r.status}` };
    const j = await r.json();
    if (!j || !j.ok) return { ok: false, reason: 'Unexpected health response' };
    return { ok: true, ...j };
  } catch (e) {
    return { ok: false, reason: e.name === 'AbortError' ? 'Server did not respond in time' : 'Server unreachable' };
  } finally { clearTimeout(timer); }
}

export class NetClient {
  constructor(url, h) {
    this.url = url;
    this.h = h;
    this.ws = null;
    this.rtt = 0;
    this.opened = false;
    this.online = true;
  }

  connect() {
    let ws;
    try { ws = new WebSocket(this.url); } catch (e) { this.h.onClose(0, 'Invalid server address', false); return; }
    this.ws = ws;
    const timeout = setTimeout(() => { if (!this.opened) { try { ws.close(); } catch (e) { } this.h.onClose(0, 'Connection timed out', false); this.h = { onOpen() { }, onMessage() { }, onClose() { } }; } }, 9000);
    ws.onopen = () => {
      clearTimeout(timeout);
      this.opened = true;
      this.h.onOpen();
      this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
    };
    ws.onmessage = ev => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'pong') { this.rtt = performance.now() - m.c; return; }
      this.h.onMessage(m);
    };
    ws.onclose = ev => {
      clearTimeout(timeout);
      clearInterval(this.pingTimer);
      this.h.onClose(ev.code, ev.reason, this.opened);
    };
    ws.onerror = () => { };
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  close() {
    clearInterval(this.pingTimer);
    this.h = { onOpen() { }, onMessage() { }, onClose() { } };
    if (this.ws) try { this.ws.close(1000, 'leave'); } catch (e) { }
  }
}

export class LocalClient {
  constructor(code, h) {
    this.h = h;
    this.rtt = 0;
    this.online = false;
    this.room = new Room({ code, log: (...a) => console.warn(...a), seed: (Math.random() * 1e9) >>> 0 });
  }

  connect() {
    const conn = {
      send: s => { const m = JSON.parse(s); this.h.onMessage(m); },
      close: () => { }
    };
    this.c = this.room.attach(conn);
    this.room.start(setInterval, clearInterval);
    setTimeout(() => this.h.onOpen(), 0);
  }

  send(obj) { if (obj.t !== 'ping') this.room.message(this.c, JSON.stringify(obj)); }

  close() {
    this.room.stop();
    this.h = { onOpen() { }, onMessage() { }, onClose() { } };
  }
}
