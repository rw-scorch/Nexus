import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from '../public/shared/room.js';
import { PROTOCOL_VERSION } from '../public/shared/constants.js';
import { AccountStore, handleApi, roomServices, memoryKV } from './accounts.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(here, '..', 'public');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const ALLOWED = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 40);
const started = Date.now();
const DATA_DIR = process.env.DATA_DIR || path.resolve(here, '..', 'data');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

export const rooms = new Map();

export function validRoomCode(code) {
  return typeof code === 'string' && /^[a-z0-9_-]{3,24}$/i.test(code);
}

function originOk(origin) {
  if (ALLOWED.includes('*') || !origin) return true;
  return ALLOWED.includes(origin);
}

function cors(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED.includes('*') ? '*' : (originOk(origin) ? origin : 'null'));
  res.setHeader('Vary', 'Origin');
}

function health() {
  return { ok: true, protocol: PROTOCOL_VERSION, platform: 'node', uptime: Math.round((Date.now() - started) / 1000), rooms: [...rooms.values()].map(r => r.status()) };
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.resolve(PUBLIC, '.' + urlPath);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

function readBody(req, limit = 120000) {
  return new Promise(resolve => {
    let size = 0, chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { req.destroy(); resolve(null); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve(null));
  });
}

export function createServer({ port = PORT, host = HOST, quiet = false, openRooms = process.env.OPEN_ROOMS === '1', dataFile } = {}) {
  let file = dataFile === undefined ? path.join(DATA_DIR, 'accounts.json') : dataFile;
  if (file) { try { fs.mkdirSync(path.dirname(file), { recursive: true }); } catch (e) { file = null; } }
  const store = new AccountStore(memoryKV(file, file ? fs : null), { openRooms });
  const services = roomServices(store);
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (req.url.startsWith('/api/')) {
      cors(res, origin);
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      const body = req.method === 'POST' ? await readBody(req) : {};
      if (body === null) { res.writeHead(413); return res.end('{"error":"Too large"}'); }
      const auth = req.headers.authorization || '';
      const r = await handleApi(store, { method: req.method, path: new URL(req.url, 'http://x').pathname, body, token: auth.startsWith('Bearer ') ? auth.slice(7) : null });
      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(r.json));
    }
    if (req.url.startsWith('/health')) {
      cors(res, origin);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(health()));
    }
    if (req.url.startsWith('/rooms')) {
      const u = new URL(req.url, 'http://x');
      const out = {};
      for (const code of (u.searchParams.get('codes') || '').split(',').filter(validRoomCode).slice(0, 12)) {
        const r = rooms.get(code);
        out[code] = r ? r.status().players : 0;
      }
      cors(res, origin);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(out));
    }
    if (req.method === 'OPTIONS') { cors(res, origin); res.writeHead(204); return res.end(); }
    serveStatic(req, res);
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    const code = url.searchParams.get('room');
    if (url.pathname !== '/ws' || !validRoomCode(code) || !originOk(req.headers.origin)) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      return socket.destroy();
    }
    if (!rooms.has(code) && rooms.size >= MAX_ROOMS) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, async ws => {
      let room = rooms.get(code);
      if (!room) {
        const game = await store.gameFor(code);
        if (!game) {
          ws.send(JSON.stringify({ t: 'err', code: 'notfound', msg: 'This game is not running. Only Battle, the featured mode and games started by an admin are open.' }));
          return ws.close(4004, 'not running');
        }
        room = rooms.get(code);
        if (!room) {
          room = new Room({ code, game: game.open ? null : game, services, log: (...a) => console.error(`[${code}]`, ...a) });
          rooms.set(code, room);
          room.start();
          if (!quiet) console.log(`room ${code} opened`);
        }
      }
      const c = room.attach({ send: s => { if (ws.readyState === 1) ws.send(s); }, close: (cc, r) => ws.close(cc, r) });
      ws.on('message', data => room.message(c, data.toString()));
      ws.on('close', () => room.close(c));
      ws.on('error', () => room.close(c));
    });
  });
  const sweeper = setInterval(() => {
    for (const [code, room] of rooms) {
      if (room.clients.size === 0 && room.emptySince && Date.now() - room.emptySince > 60000) {
        room.stop();
        rooms.delete(code);
        if (!quiet) console.log(`room ${code} closed`);
      }
    }
  }, 10000);
  server.store = store;
  server.on('close', () => { clearInterval(sweeper); for (const r of rooms.values()) r.stop(); rooms.clear(); });
  return new Promise(resolve => server.listen(port, host, () => {
    if (!quiet) console.log(`Nexus: Infinite Warfare server on http://localhost:${server.address().port} (protocol ${PROTOCOL_VERSION})`);
    resolve(server);
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer();
}
