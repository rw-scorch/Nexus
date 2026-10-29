# Nexus: Infinite Warfare

Browser multiplayer tank game. Authoritative server, 1,032 tanks across 33 families, 20 bosses, Nexus Siege, procedural Labyrinths in six themes, bots, touch controls.

The game is two programs:

| Part | What it is | Where it can run |
|---|---|---|
| Client | Static files in `public/` (HTML, CSS, JS modules) | Cloudflare, Netlify, any static host |
| Server | Authoritative simulation over WebSockets | Cloudflare Durable Objects (`server/worker.js`) or Node.js (`server/node-server.js`) |

Both servers run the exact same simulation code from `public/shared/`. The client never fakes multiplayer: if the server cannot be reached it shows an error with Retry, Change server and Offline Practice. Offline Practice runs the simulation in the browser against bots and is clearly labelled.

---

## Deploy option A: Cloudflare, from an iPad (recommended)

One Cloudflare Worker serves the client and runs the game server. Nothing else to host.

1. **Make a GitHub repo.** On github.com, create a new empty repository, for example `nexus-infinite-warfare`.
2. **Upload the project.** Open the repo, then Code > Codespaces > Create codespace. In the codespace, drag `nexus-infinite-warfare.zip` into the file explorer, then in the terminal run:
   ```bash
   unzip nexus-infinite-warfare.zip -d tmp && cp -r tmp/nexus-infinite-warfare/. . && rm -rf tmp nexus-infinite-warfare.zip
   npm install
   npm test
   git add . && git commit -m "Nexus: Infinite Warfare" && git push
   ```
3. **Connect Cloudflare.** On dash.cloudflare.com, open Workers & Pages, choose Create, then import a repository from GitHub and pick this repo. Leave the build command empty. The deploy command is `npx wrangler deploy`. Cloudflare reads `wrangler.toml`, which sets up the Worker, the static assets and the `GameRoom` Durable Object.
4. **Open your game.** Cloudflare gives you an address like `https://nexus-infinite-warfare.<you>.workers.dev`. Open it, press Play. Check `https://.../health` returns `{"ok":true,...,"platform":"cloudflare"}`.

Every `git push` redeploys. Durable Objects with SQLite storage work on the Workers Free plan. Each running room counts compute time while players are connected; rooms stop their game loop 60 seconds after the last player leaves.

Alternative to step 3: in the codespace, create an API token in the Cloudflare dashboard (template "Edit Cloudflare Workers"), then run:
```bash
export CLOUDFLARE_API_TOKEN=your-token
npx wrangler deploy
```

## Deploy option B: your own server (Node.js)

Any machine that can run Node.js 22+ (PC, VPS, Raspberry Pi):

```powershell
npm install
npm start
```

This serves the client and the game at `http://localhost:8080`. Environment variables: `PORT`, `HOST`, `ALLOWED_ORIGINS` (comma list, default `*`), `MAX_ROOMS`.

To make it public without opening router ports, use Cloudflare Tunnel:

```powershell
winget install Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:8080
```

It prints an `https://....trycloudflare.com` address that works for players anywhere, WebSockets included. For a permanent address, create a named tunnel in the Cloudflare dashboard under Zero Trust > Networks > Tunnels.

## Deploy option C: client on Netlify, server elsewhere

1. Drag the `public` folder onto Netlify Drop (or deploy the repo; `netlify.toml` publishes `public/`).
2. Point the client at your server either by editing `public/config.js`:
   ```js
   window.NEXUS_CONFIG = { server: 'https://nexus-infinite-warfare.you.workers.dev' };
   ```
   or by entering the address in the game under Settings > Game server address.

Netlify cannot run the game server itself. Without a server address the menu shows "Server unreachable" and only Offline Practice works.

---

## Local development

```powershell
npm install
npm start          # Node server + client on http://localhost:8080
npm test           # 54 automated tests (Node 22+)
npm run validate   # registry, boss and map validation summary
npm run cf:dev     # run the Cloudflare Worker locally on http://localhost:8787
```

Open two browser windows on the same room code to play against yourself.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "Server unreachable" on the menu | No server at that address. Check `/health` in a browser. On Netlify, set the server address in Settings or `config.js`. |
| "Client protocol does not match" | Client and server are different versions. Redeploy both, then hard refresh. |
| Connects then drops repeatedly | Proxy or tunnel not passing WebSockets. Cloudflare and trycloudflare tunnels do; some shared hosts do not. |
| Cloudflare deploy error about Durable Object migrations | Keep `[[migrations]]` in `wrangler.toml` as shipped. If you rename the class, add a new migration tag. |
| Mixed content error | An `https` page cannot use a `ws://` server. Use an `https` server address. |
| Room is full | 24 human players per room. Quick Play tries `pub-<mode>-1` to `-6` automatically. |

---

## How it works

- The client sends only inputs (movement, aim, fire, ability, upgrade and evolve requests). The server runs physics, collisions, damage, deaths, rewards, AI, bosses and match results at 30 ticks per second and sends each player a snapshot of the area around them 15 times per second (interest management).
- Remote entities are interpolated about 100 ms behind. Your own tank is extrapolated from its server velocity and your aim is applied locally, so controls feel immediate.
- Every message is validated: unknown types are dropped, numbers are clamped, evolutions and upgrades are checked against the rules, and each connection is rate limited.
- Disconnected players keep their tank for 25 seconds and reconnect into the same slot using a per-tab token.

### Content

- **Tanks** (`shared/tank-registry.js`): 33 families x 4 forms x 8 doctrines (+ Basic). Forms are barrel layouts built from reusable gun components. Doctrines change every barrel's projectile behaviour (piercing, explosive, homing, ricochet, cluster, chain, healing). Gunless rammers get body doctrines instead. A balance framework gives each tier a damage budget, charges mobility for heavy layouts, and the tests check that no form strictly dominates a sibling.
- **Progression**: levels 15, 30, 45 unlock tiers; 8 stat upgrades; doctrines cost relic cores (from elites, alpha pentagons, caches, bosses); the Relic family needs a boss victory; Experimental needs 2 cores held. Sandbox mode can select any tank.
- **Bosses** (`shared/boss-registry.js`): 20 data-defined bosses composed from 26 attack primitives, each with phases, telegraphed attacks and, for seven of them, destructible or moving components.
- **Maps** (`shared/map-generator.js`): seeded maze plus rooms, braided for alternate routes, sealed secret rooms behind breakable walls, boss chambers with shrines, validated by flood fill before use.

### Project layout

```
public/            static client (deploy this to any static host)
  client/          rendering, input, HUD, menus, networking, audio
  shared/          simulation, registries, protocol (used by client and both servers)
    sim/           world, combat, AI, bosses, abilities, game modes
server/
  node-server.js   Node.js WebSocket server and static file server
  worker.js        Cloudflare Worker + GameRoom Durable Object
tests/             node:test suites
tools/             validate.js, smoke.js (headless bot matches), bossdiag.js
wrangler.toml      Cloudflare configuration
netlify.toml       Netlify configuration (client only)
```

## Known limitations

- Prediction is extrapolation with smoothing, not full input replay and reconciliation.
- The full tile map is sent on join. Fog of war hides unexplored areas on the minimap, but a modified client could read the layout.
- Achievements and statistics are stored per device in local storage. There are no accounts.
- Balance is a first pass. Numbers live in the registries and are easy to tune.
- Load tested headlessly with bots (about 0.5 to 1 ms per tick per room with 10 bots and 2 bosses); not yet tested with dozens of real players at once.
