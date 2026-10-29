import { Room } from '../public/shared/room.js';
import { PROTOCOL_VERSION } from '../public/shared/constants.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.idleTimer = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('room');
    if (url.pathname.endsWith('/status')) return json(this.room ? this.room.status() : { code, idle: true });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket upgrade', { status: 426 });
    if (!this.room) this.room = new Room({ code, log: (...a) => console.log(`[${code}]`, ...a) });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const c = this.room.attach({
      send: s => { try { server.send(s); } catch (e) { } },
      close: (cc, r) => { try { server.close(cc, r); } catch (e) { } }
    });
    server.addEventListener('message', ev => this.room.message(c, typeof ev.data === 'string' ? ev.data : ''));
    const done = () => {
      this.room.close(c);
      if (this.room.clients.size === 0) this.scheduleIdle();
    };
    server.addEventListener('close', done);
    server.addEventListener('error', done);
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    this.room.start(setInterval, clearInterval);
    return new Response(null, { status: 101, webSocket: client });
  }

  scheduleIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.room && this.room.clients.size === 0) {
        this.room.stop();
        this.room = null;
      }
    }, 60000);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/health') return json({ ok: true, protocol: PROTOCOL_VERSION, platform: 'cloudflare' });
    if (url.pathname === '/ws') {
      const code = url.searchParams.get('room') || '';
      if (!/^[a-z0-9_-]{3,24}$/i.test(code)) return new Response('Invalid room code', { status: 400 });
      const id = env.ROOMS.idFromName(code);
      return env.ROOMS.get(id).fetch(request);
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  }
};
