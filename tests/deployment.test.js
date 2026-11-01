import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../server/node-server.js';
import { PROTOCOL_VERSION } from '../public/shared/constants.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
}

test('every client module import resolves to a real file inside public/', () => {
  const files = walk(path.join(root, 'public')).filter(f => f.endsWith('.js'));
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s+['"](\.[^'"]+)['"]/g)) {
      const target = path.resolve(path.dirname(f), m[1]);
      assert.ok(fs.existsSync(target), `${path.relative(root, f)} imports missing ${m[1]}`);
      assert.ok(target.startsWith(path.join(root, 'public')), `${path.relative(root, f)} imports outside public/ (would break Netlify)`);
    }
  }
});

test('static client is served and loads its entry module', async () => {
  const server = await createServer({ port: 0, host: '127.0.0.1', quiet: true, dataFile: null });
  const port = server.address().port;
  try {
    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.match(html, /<script type="module" src="client\/main\.js">/);
    for (const p of ['client/main.js', 'styles.css', 'config.js', 'favicon.svg', 'shared/room.js']) {
      const r = await fetch(`http://127.0.0.1:${port}/${p}`);
      assert.equal(r.status, 200, p);
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/../package.json`)).status, 404);
    const h = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.equal(h.protocol, PROTOCOL_VERSION, 'client and server protocol versions differ');
  } finally { server.close(); }
});

test('Cloudflare worker answers health checks and routes rooms to Durable Objects', async () => {
  const worker = (await import('../server/worker.js')).default;
  const h = await (await worker.fetch(new Request('https://x.test/health'), {})).json();
  assert.equal(h.ok, true);
  assert.equal(h.protocol, PROTOCOL_VERSION);
  let routed = null;
  const env = { ROOMS: { idFromName: n => `id:${n}`, get: id => ({ fetch: async () => { routed = id; return new Response('ok'); } }) }, ACCOUNTS: { idFromName: n => n, get: () => ({ fetch: async () => new Response(JSON.stringify({ game: { mode: 'ffa', settings: {} } })) }) }, ASSETS: { fetch: async () => new Response('asset') } };
  await worker.fetch(new Request('https://x.test/ws?room=pub-ffa-1'), env);
  assert.equal(routed, 'id:pub-ffa-1');
  const bad = await worker.fetch(new Request('https://x.test/ws?room=../../x'), env);
  assert.equal(bad.status, 400);
  assert.equal(await (await worker.fetch(new Request('https://x.test/index.html'), env)).text(), 'asset');
});

test('wrangler.toml declares the worker, assets and Durable Object migration', () => {
  const t = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
  assert.match(t, /main = "server\/worker\.js"/);
  assert.match(t, /directory = "\.\/public"/);
  assert.match(t, /class_name = "GameRoom"/);
  assert.match(t, /new_sqlite_classes = \["GameRoom"\]/);
});

test('netlify.toml publishes only the static client', () => {
  const t = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8');
  assert.match(t, /publish = "public"/);
});

test('server address is configurable and a missing address is reported, not faked', async () => {
  globalThis.localStorage = undefined;
  globalThis.window = { NEXUS_CONFIG: { server: '' } };
  globalThis.location = { protocol: 'file:', origin: 'null' };
  const net = await import('../public/client/net.js');
  assert.equal(net.serverBase(), '');
  const h = await net.checkHealth('');
  assert.equal(h.ok, false);
  assert.match(h.reason, /No server address/);
  globalThis.window.NEXUS_CONFIG.server = 'https://nexus.example.workers.dev/';
  assert.equal(net.serverBase(), 'https://nexus.example.workers.dev');
  assert.equal(net.wsUrl('https://nexus.example.workers.dev', 'pub-ffa-1'), 'wss://nexus.example.workers.dev/ws?room=pub-ffa-1');
  assert.equal(net.wsUrl('http://localhost:8080', 'abc'), 'ws://localhost:8080/ws?room=abc');
  const down = await net.checkHealth('http://127.0.0.1:9', 1500);
  assert.equal(down.ok, false);
});
