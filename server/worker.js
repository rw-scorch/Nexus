import { Room } from '../public/shared/room.js';
import { PROTOCOL_VERSION } from '../public/shared/constants.js';
import { AccountStore, handleApi, durableKV, publicUser } from './accounts.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
const accountsStub = env => env.ACCOUNTS.get(env.ACCOUNTS.idFromName('accounts'));

export class Accounts {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.store = new AccountStore(durableKV(ctx.storage), { openRooms: env.OPEN_ROOMS === '1' });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    if (url.pathname === '/internal/game') return json({ game: await this.store.gameFor(url.searchParams.get('code')) });
    if (url.pathname === '/internal/verify') { const u = await this.store.session(body.token); return json({ user: u ? publicUser(u) : null }); }
    if (url.pathname === '/internal/award') return json({ user: await this.store.award(body.name, body.d) });
    const auth = request.headers.get('Authorization') || '';
    const r = await handleApi(this.store, { method: request.method, path: url.pathname, body, token: auth.startsWith('Bearer ') ? auth.slice(7) : null });
    return json(r.json, r.status);
  }
}

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.idleTimer = null;
  }

  services() {
    const env = this.env;
    const call = async (path, body) => {
      const r = await accountsStub(env).fetch(`https://accounts${path}`, { method: 'POST', body: JSON.stringify(body) });
      return (await r.json()).user || null;
    };
    return { verify: token => call('/internal/verify', { token }), award: (name, d) => call('/internal/award', { name, d }) };
  }

  async fetch(request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('room');
    if (url.pathname.endsWith('/status')) return json(this.room ? this.room.status() : { code, idle: true });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket upgrade', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    if (!this.room) {
      let game = null;
      try { game = JSON.parse(decodeURIComponent(request.headers.get('x-game') || 'null')); } catch (e) { game = null; }
      if (!game) {
        server.send(JSON.stringify({ t: 'err', code: 'notfound', msg: 'This game is not running. Only Battle, the featured mode and games started by an admin are open.' }));
        server.close(4004, 'not running');
        return new Response(null, { status: 101, webSocket: client });
      }
      this.room = new Room({ code, game: game.open ? null : game, services: this.services(), log: (...a) => console.log(`[${code}]`, ...a) });
    }
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
        this.room.flushAwards();
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
    if (url.pathname.startsWith('/api/')) return accountsStub(env).fetch(request);
    if (url.pathname === '/rooms') {
      const codes = (url.searchParams.get('codes') || '').split(',').filter(c => /^[a-z0-9_-]{3,24}$/i.test(c)).slice(0, 12);
      const out = {};
      await Promise.all(codes.map(async code => {
        try {
          const r = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(`https://room/status?room=${code}`);
          const st = await r.json();
          out[code] = st.idle ? 0 : st.players || 0;
        } catch (e) { out[code] = 0; }
      }));
      return json(out);
    }
    if (url.pathname === '/ws') {
      const code = url.searchParams.get('room') || '';
      if (!/^[a-z0-9_-]{3,24}$/i.test(code)) return new Response('Invalid room code', { status: 400 });
      const g = await (await accountsStub(env).fetch(`https://accounts/internal/game?code=${encodeURIComponent(code)}`)).json();
      const headers = new Headers(request.headers);
      headers.set('x-game', encodeURIComponent(JSON.stringify(g.game)));
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(request, { headers }));
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  }
};
