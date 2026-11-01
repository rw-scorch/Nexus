import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createServer, rooms } from '../server/node-server.js';
import { PROTOCOL_VERSION } from '../public/shared/constants.js';

function client(port, room, join) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?room=${room}`);
  const c = { ws, msgs: [], snaps: [], welcome: null, closed: false };
  c.ready = new Promise((res, rej) => {
    ws.on('open', () => ws.send(JSON.stringify({ t: 'j', protocol: PROTOCOL_VERSION, ...join })));
    ws.on('message', d => {
      const m = JSON.parse(d.toString());
      c.msgs.push(m);
      if (m.t === 'w') { c.welcome = m; res(c); }
      if (m.t === 's') { c.snaps.push(m); if (c.snaps.length > 60) c.snaps.shift(); }
      if (m.t === 'err') res(c);
    });
    ws.on('close', () => { c.closed = true; });
    ws.on('error', rej);
  });
  c.send = o => ws.send(JSON.stringify(o));
  c.last = () => c.snaps[c.snaps.length - 1];
  return c;
}

const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await wait(30); }
  return false;
}

test('real multiplayer over WebSockets', async t => {
  const server = await createServer({ port: 0, host: '127.0.0.1', quiet: true, openRooms: true, dataFile: null });
  const port = server.address().port;
  try {
    const code = 'mp-test';
    const a = await client(port, code, { name: 'Alpha', mode: 'sandbox', settings: { bots: 0 }, token: 'tokA' }).ready;
    const b = await client(port, code, { name: 'Bravo', token: 'tokB' }).ready;

    await t.test('multiple clients connect to the same room', async () => {
      assert.ok(a.welcome && b.welcome);
      assert.equal(a.welcome.room, code);
      assert.equal(b.welcome.mode, 'sandbox');
      assert.notEqual(a.welcome.pid, b.welcome.pid);
    });

    const room = rooms.get(code);
    const w = room.world;
    const pa = w.players.get(a.welcome.pid), pb = w.players.get(b.welcome.pid);
    const ta = w.tankOf(pa), tb = w.tankOf(pb);
    for (const e of w.ents) if (e.type === 'shape' || e.type === 'mob' || e.type === 'struct') w.remove(e);
    w.logic.state.shrines.length = 0;
    const sx = ta.x, sy = ta.y;
    tb.x = sx + 320; tb.y = sy; ta.spawnProtect = 0; tb.spawnProtect = 0;

    await t.test('players see one another', async () => {
      const ok = await until(() => a.last() && a.last().e.some(e => e[0] === 0 && e[1] === tb.id));
      assert.ok(ok, 'Alpha never saw Bravo');
      const ok2 = await until(() => b.last() && b.last().e.some(e => e[0] === 0 && e[1] === ta.id));
      assert.ok(ok2, 'Bravo never saw Alpha');
      await until(() => a.last().pl);
      const names = (a.snaps.find(s => s.pl) || {}).pl || [];
      assert.ok(await until(() => a.snaps.some(s => s.pl && s.pl.some(p => p[1] === 'Bravo'))), 'player list missing Bravo');
    });

    await t.test('tank movement synchronises from inputs', async () => {
      const seen = () => { const e = a.last().e.find(e => e[0] === 0 && e[1] === tb.id); return e ? e[2] : null; };
      const x0 = seen();
      for (let i = 0; i < 20; i++) { b.send({ t: 'i', mx: 0, my: 1, ax: 1, ay: 0, f: 0, s: i }); await wait(30); }
      b.send({ t: 'i', mx: 0, my: 0, ax: 1, ay: 0, f: 0, s: 99 });
      await wait(150);
      const e = a.last().e.find(e => e[0] === 0 && e[1] === tb.id);
      assert.ok(e, 'lost sight of Bravo');
      assert.ok(e[3] > sy + 40, `Bravo did not move down in Alpha's view (${e[3]} vs ${sy})`);
      assert.ok(Math.abs(e[3] - tb.y) < 80, 'replicated position disagrees with server');
    });

    await t.test('projectile damage is computed by the server and synchronised', async () => {
      tb.x = ta.x + 300; tb.y = ta.y; tb.vx = tb.vy = 0;
      const hp0 = tb.hp;
      for (let i = 0; i < 40; i++) {
        tb.x = ta.x + 300; tb.y = ta.y; tb.vx = tb.vy = 0; tb.lastHurt = w.time;
        a.send({ t: 'i', mx: 0, my: 0, ax: tb.x - ta.x, ay: tb.y - ta.y, f: 1, s: 100 + i });
        await wait(30);
      }
      a.send({ t: 'i', mx: 0, my: 0, ax: 1, ay: 0, f: 0, s: 999 });
      assert.ok(tb.hp < hp0, 'server applied no damage');
      const ok = await until(() => { const s = b.last(); return s.y && s.y.hp < hp0 - 1; });
      assert.ok(ok, "Bravo's own snapshot never showed the damage");
      const ok2 = await until(() => { const e = a.last().e.find(e => e[0] === 0 && e[1] === tb.id); return e && e[7] < 100; });
      assert.ok(ok2, "Alpha's view never showed Bravo damaged");
    });

    await t.test('match state stays authoritative against forged messages', async () => {
      const hp = tb.hp;
      a.send({ t: 'dmg', id: tb.id, amount: 1e6 });
      a.send({ t: 'kill', id: tb.id });
      a.send({ t: 'e', idx: 1031 });
      await wait(200);
      assert.equal(tb.dead, false);
      assert.ok(tb.hp >= hp - 1);
      assert.equal(ta.defIdx, 0);
    });

    await t.test('disconnects are handled and reconnection does not duplicate players', async () => {
      const before = w.players.size;
      b.ws.close();
      assert.ok(await until(() => pb.connected === false), 'server did not notice the disconnect');
      assert.equal(w.players.size, before, 'player removed too early (no reconnect window)');
      const b2 = await client(port, code, { name: 'Bravo', token: 'tokB' }).ready;
      assert.equal(b2.welcome.pid, pb.pid, 'reconnect created a new player');
      assert.equal(w.players.size, before, 'duplicate player after reconnect');
      assert.equal(pb.connected, true);
      b2.ws.close();
    });

    await t.test('health endpoint reports protocol', async () => {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      const j = await r.json();
      assert.equal(j.ok, true);
      assert.equal(j.protocol, PROTOCOL_VERSION);
      assert.ok(j.rooms.some(r => r.code === code));
    });

    a.ws.close();
  } finally {
    server.close();
    await wait(50);
  }
});

test('invalid room codes are rejected at the HTTP upgrade', async () => {
  const server = await createServer({ port: 0, host: '127.0.0.1', quiet: true, openRooms: true, dataFile: null });
  const port = server.address().port;
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?room=${encodeURIComponent('../../etc')}`);
    const res = await new Promise(r => { ws.on('error', () => r('error')); ws.on('open', () => r('open')); });
    assert.equal(res, 'error');
  } finally { server.close(); }
});
