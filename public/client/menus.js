import { MODES, THEMES, STAT_NAMES } from '../shared/constants.js';
import { TANKS, TANK_FAMILIES, ABILITIES, TANKS_BY_ID, validateRegistry } from '../shared/tank-registry.js';
import { FLAG_INFO, DOCTRINES, PROJECTILE_KINDS } from '../shared/projectile-types.js';
import { BOSSES } from '../shared/boss-registry.js';
import { ACHIEVEMENTS, MAP_THEMES } from '../shared/entity-types.js';
import { previewTank, drawBoss } from './draw.js';
import { store, setSetting, save } from './storage.js';
import { serverBase, checkHealth } from './net.js';
import { setVolume } from './audio.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let VALID = null;
const validation = () => VALID || (VALID = validateRegistry());
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const ROLES = [...new Set(TANKS.map(t => t.role))].sort();

function availability(d) {
  if (d.req.bossKill) return 'boss';
  if (d.family === 'experimental') return 'cores';
  if (d.doctrine !== 'std') return 'cores';
  return 'tree';
}
const AVAIL_LABEL = { tree: 'Evolution tree', cores: 'Needs relic cores', boss: 'Needs a boss victory' };

export class Menus {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.mode = store.settings.lastMode || 'ffa';
    this.col = { q: '', family: '', role: '', rarity: '', tier: '', played: '', ability: '', avail: '', page: 0, sel: 0 };
    this.anim = 0;
    this.root.addEventListener('click', e => this.onClick(e));
    this.root.addEventListener('input', e => this.onInput(e));
    this.root.addEventListener('change', e => this.onInput(e));
  }

  hide() { this.root.innerHTML = ''; this.current = null; cancelAnimationFrame(this.anim); }

  show(name, opts = {}) {
    cancelAnimationFrame(this.anim);
    this.current = name;
    this.opts = opts;
    const fn = this['screen_' + name];
    this.root.innerHTML = `<div class="screen${opts.clear ? ' clear' : ''}"><div class="wrap">${fn.call(this, opts)}</div></div>`;
    const after = this['after_' + name];
    if (after) after.call(this, opts);
  }

  backBtn(to = 'main') { return `<button class="btn small back" data-go="${to}">Back</button>`; }

  screen_main() {
    const modes = Object.entries(MODES).map(([k, m]) => `<button class="mode-card ${k === this.mode ? 'on' : ''}" data-mode="${k}"><b>${m.name}</b><small>${m.desc}</small></button>`).join('');
    return `
      <div class="menu-grid">
        <div>
          <div class="logo">NEXUS<br><span>INFINITE</span> <em>WARFARE</em></div>
          <p class="tag">Multiplayer tank combat. ${TANKS.length.toLocaleString()} tanks, ${BOSSES.length} bosses, procedural labyrinths.</p>
          <div class="panel">
            <div class="field"><label for="m-name">Callsign</label><input id="m-name" maxlength="16" placeholder="Your name" value="${esc(store.settings.name)}"></div>
            <button class="btn primary block" data-act="quick" style="min-height:52px;font-size:16px">Play ${esc(MODES[this.mode].name)}</button>
            <div style="height:10px"></div>
            <div class="row"><button class="btn" data-go="create" style="flex:1">Create Room</button><button class="btn" data-go="join" style="flex:1">Join Room</button></div>
            <div style="height:10px"></div>
            <button class="btn block" data-act="offline">Offline Practice</button>
            <p class="muted" style="font-size:13px;margin:10px 0 0"><span class="status-dot" id="m-dot"></span> <span id="m-status">Checking server...</span></p>
          </div>
        </div>
        <div>
          <h3>Game mode</h3>
          <div class="modes">${modes}</div>
          <h3>Explore</h3>
          <div class="nav">
            <button class="btn" data-go="collection">Tank Collection</button>
            <button class="btn" data-go="progression">Tank Progression</button>
            <button class="btn" data-go="bosses">Bestiary</button>
            <button class="btn" data-go="achievements">Achievements</button>
            <button class="btn" data-go="stats">Statistics</button>
            <button class="btn" data-go="settings">Settings</button>
            <button class="btn" data-go="help">Help</button>
            <button class="btn" data-go="credits">Credits</button>
          </div>
          <div class="panel" style="margin-top:14px;display:grid;grid-template-columns:120px 1fr;gap:14px;align-items:center">
            <canvas id="m-show" style="width:120px;height:120px"></canvas>
            <div id="m-showtxt"></div>
          </div>
        </div>
      </div>`;
  }

  after_main() {
    const base = serverBase();
    const dot = this.root.querySelector('#m-dot'), st = this.root.querySelector('#m-status');
    checkHealth(base).then(h => {
      if (!dot) return;
      if (h.ok) { dot.className = 'status-dot ok'; st.textContent = `Server online (${h.platform || 'game server'}) at ${base.replace(/^https?:\/\//, '')}`; }
      else { dot.className = 'status-dot bad'; st.innerHTML = `${esc(h.reason)}${base ? ` at ${esc(base.replace(/^https?:\/\//, ''))}` : ''}. Online play needs a deployed game server. <a href="#" data-go="settings" style="color:#7cc4ff">Set server address</a>`; }
    });
    const cv = this.root.querySelector('#m-show'), txt = this.root.querySelector('#m-showtxt');
    let idx = Math.floor(Math.random() * TANKS.length), last = 0, t0 = performance.now();
    const loop = ts => {
      if (!cv.isConnected) return;
      if (ts - last > 3500) {
        idx = Math.floor(Math.random() * TANKS.length); last = ts;
        const d = TANKS[idx];
        txt.innerHTML = `<b class="r-${d.rarity}">${esc(d.name)}</b><div class="muted" style="font-size:13px">${esc(d.familyName)} &middot; ${esc(d.role)} &middot; Tier ${d.tier}</div><div style="font-size:13px;margin-top:4px">${esc(ABILITIES[d.ability].name)}: ${esc(ABILITIES[d.ability].desc)}</div>`;
      }
      previewTank(cv, TANKS[idx], '#38a3ff', (ts - t0) / 1000);
      this.anim = requestAnimationFrame(loop);
    };
    this.anim = requestAnimationFrame(loop);
  }

  settingsForm(prefix) {
    const themes = THEMES.map(t => `<option value="${t}">${MAP_THEMES[t].name}: ${MAP_THEMES[t].desc}</option>`).join('');
    return `
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
        <div class="field"><label>Mode</label><select id="${prefix}-mode">${Object.entries(MODES).map(([k, m]) => `<option value="${k}" ${k === this.mode ? 'selected' : ''}>${m.name}</option>`).join('')}</select></div>
        <div class="field"><label>Labyrinth theme</label><select id="${prefix}-theme">${themes}</select></div>
        <div class="field"><label>Bots</label><input id="${prefix}-bots" type="number" min="0" max="16" value="8"></div>
        <div class="field"><label>Bot difficulty</label><select id="${prefix}-diff"><option>easy</option><option selected>normal</option><option>hard</option></select></div>
        <div class="field"><label>Death rule</label><select id="${prefix}-death"><option value="keepThird" selected>Keep a third of your level</option><option value="keepHalf">Keep half of your level</option><option value="reset">Restart at level 1</option></select></div>
        <div class="field"><label>Boss interval (seconds)</label><input id="${prefix}-bint" type="number" min="60" max="900" value="150"></div>
        <div class="field"><label>Max active bosses</label><input id="${prefix}-bmax" type="number" min="0" max="4" value="2"></div>
        <div class="field"><label>Nexus shield</label><input id="${prefix}-nsh" type="number" min="1000" max="30000" step="500" value="6000"></div>
        <div class="field"><label>Nexus health</label><input id="${prefix}-nhp" type="number" min="2000" max="80000" step="1000" value="20000"></div>
        <div class="field"><label>Options</label><label style="text-transform:none;letter-spacing:0;color:var(--text)"><input type="checkbox" id="${prefix}-ff"> Friendly fire</label><label style="text-transform:none;letter-spacing:0;color:var(--text)"><input type="checkbox" id="${prefix}-fog" checked> Labyrinth fog of war</label></div>
      </div>`;
  }

  readSettings(prefix) {
    const v = id => this.root.querySelector(`#${prefix}-${id}`);
    return {
      mode: v('mode').value,
      settings: {
        theme: v('theme').value, bots: Number(v('bots').value), botDifficulty: v('diff').value, deathRule: v('death').value,
        bossInterval: Number(v('bint').value), maxBosses: Number(v('bmax').value), nexusShield: Number(v('nsh').value), nexusHp: Number(v('nhp').value),
        friendlyFire: v('ff').checked, fog: v('fog').checked
      }
    };
  }

  screen_create() {
    return `${this.backBtn()}<h2 class="title">Create Room</h2><div class="panel">
      <p class="muted">Creates a private room on the game server. Share the code so others can join. The first player to join a code sets its rules.</p>
      ${this.settingsForm('c')}
      <button class="btn primary" data-act="create">Create and join</button></div>`;
  }

  screen_join() {
    return `${this.backBtn()}<h2 class="title">Join Room</h2><div class="panel">
      <div class="field"><label>Room code</label><input id="j-code" maxlength="24" placeholder="e.g. k7qzp" autocapitalize="off"></div>
      <button class="btn primary" data-act="join">Join</button>
      <p class="muted">Public rooms use codes like <code>pub-nexus-1</code>.</p></div>`;
  }

  screen_offline() {
    return `${this.backBtn()}<h2 class="title">Offline Practice</h2><div class="panel">
      <div class="offline-banner" style="margin-bottom:12px">Offline practice runs the same game simulation inside your browser against bots. It is not online multiplayer and no other players can join.</div>
      ${this.settingsForm('o')}
      <button class="btn primary" data-act="offlinego">Start practice</button></div>`;
  }

  screen_connecting(o) {
    return `<div class="panel" style="max-width:460px;margin:20vh auto;text-align:center"><h2 class="title">Connecting</h2><p class="muted">${esc(o.text || '')}</p><button class="btn" data-act="cancel">Cancel</button></div>`;
  }

  screen_error(o) {
    return `<div class="panel" style="max-width:560px;margin:14vh auto">
      <h2 class="title">Could not connect</h2>
      <p>${esc(o.message)}</p>
      <p class="muted" style="font-size:13px">Server: ${esc(o.server || 'none configured')}</p>
      <p class="muted" style="font-size:13px">Online play needs the separate game server to be deployed and reachable. The client never pretends to be online when it is not.</p>
      <div class="row"><button class="btn primary" data-act="retry">Retry</button><button class="btn" data-go="settings">Change server</button><button class="btn" data-go="offline">Offline practice</button><button class="btn" data-go="main">Main menu</button></div>
    </div>`;
  }

  filtered() {
    const c = this.col;
    const q = c.q.trim().toLowerCase();
    return TANKS.filter(d =>
      (!q || d.name.toLowerCase().includes(q) || d.familyName.toLowerCase().includes(q) || d.role.toLowerCase().includes(q)) &&
      (!c.family || d.family === c.family) && (!c.role || d.role === c.role) && (!c.rarity || d.rarity === c.rarity) &&
      (!c.tier || d.tier === Number(c.tier)) && (!c.ability || d.ability === c.ability) && (!c.avail || availability(d) === c.avail) &&
      (!c.played || (c.played === 'yes') === !!store.stats.tanks[d.id]));
  }

  screen_collection(o) {
    const c = this.col;
    const sel = (id, label, opts, val) => `<div class="field"><label>${label}</label><select data-col="${id}"><option value="">All</option>${opts.map(([v, t]) => `<option value="${v}" ${String(val) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
    const list = this.filtered();
    const per = 48;
    const pages = Math.max(1, Math.ceil(list.length / per));
    c.page = Math.min(c.page, pages - 1);
    const pageItems = list.slice(c.page * per, c.page * per + per);
    const v = validation();
    return `${this.backBtn(o.back || 'main')}<h2 class="title">Tank Collection</h2>
      <p class="muted">${v.count.toLocaleString()} registered tanks across ${v.families} families, all generated from the live registry. ${v.ok ? 'Registry validation passed.' : `Registry validation found ${v.errors.length} issues.`} ${o.pick ? '<b style="color:#ffd84d">Sandbox: tap a tank, then Spawn as this tank.</b>' : ''}</p>
      <div class="collection"><div>
        <div class="filters">
          <div class="field"><label>Search</label><input data-col="q" value="${esc(c.q)}" placeholder="Name, family or role"></div>
          ${sel('family', 'Family', [['basic', 'Basic'], ...TANK_FAMILIES.map(f => [f.key, f.name])], c.family)}
          ${sel('role', 'Role', ROLES.map(r => [r, r]), c.role)}
          ${sel('rarity', 'Rarity', RARITIES.map(r => [r, r]), c.rarity)}
          ${sel('tier', 'Tier', [[1, 'Tier 1'], [2, 'Tier 2'], [3, 'Tier 3'], [4, 'Tier 4']], c.tier)}
          ${sel('ability', 'Ability', Object.entries(ABILITIES).filter(([k]) => k !== 'none').map(([k, a]) => [k, a.name]), c.ability)}
          ${sel('avail', 'Availability', Object.entries(AVAIL_LABEL), c.avail)}
          ${sel('played', 'Unlocked', [['yes', 'Played'], ['no', 'Not played yet']], c.played)}
        </div>
        <div class="cards">${pageItems.map(d => `<button class="card ${d.index === c.sel ? 'on' : ''}" data-tank="${d.index}"><canvas data-prev="${d.index}"></canvas><b class="r-${d.rarity}">${esc(d.name)}</b><span class="muted">T${d.tier} &middot; ${esc(d.familyName)}</span></button>`).join('') || '<p class="muted">No tanks match these filters.</p>'}</div>
        <div class="pager"><button class="btn small" data-page="-1" ${c.page === 0 ? 'disabled' : ''}>Prev</button><span class="muted">Page ${c.page + 1} of ${pages} &middot; ${list.length} tanks</span><button class="btn small" data-page="1" ${c.page >= pages - 1 ? 'disabled' : ''}>Next</button></div>
      </div>
      <div class="panel" id="col-detail" style="align-self:start;position:sticky;top:0"></div></div>`;
  }

  after_collection(o) {
    this.root.querySelectorAll('canvas[data-prev]').forEach(cv => previewTank(cv, TANKS[Number(cv.dataset.prev)]));
    this.renderDetail(o);
  }

  renderDetail(o = this.opts || {}) {
    const box = this.root.querySelector('#col-detail');
    if (!box) return;
    const d = TANKS[this.col.sel] || TANKS[0];
    const p = d.profile;
    const bar = (label, v, max) => `<div style="display:grid;grid-template-columns:90px 1fr 50px;gap:8px;align-items:center;font-size:13px"><span class="muted">${label}</span><div class="bar"><i style="width:${Math.min(100, v / max * 100)}%"></i></div><span>${v}</span></div>`;
    const kinds = {};
    for (const g of d.guns) kinds[g.k] = (kinds[g.k] || 0) + g.n;
    const flags = [...new Set(d.guns.flatMap(g => Object.keys(g.fx)))];
    const from = TANKS.filter(t => t.next.includes(d.id));
    const req = [`Level ${d.req.level}`];
    if (d.doctrine !== 'std' && d.tier >= 2) req.push('1 relic core to adopt the doctrine');
    if (d.family === 'experimental') req.push('2 relic cores held');
    if (d.req.bossKill) req.push('Take part in a boss victory');
    if (d.tier === 1 && d.doctrine !== 'std') req.push('Doctrine variants become usable from tier 2');
    box.innerHTML = `
      <canvas id="col-big" style="width:100%;height:200px"></canvas>
      <h3 class="r-${d.rarity}" style="margin-top:6px">${esc(d.name)}</h3>
      <p class="muted" style="margin:0 0 8px">${esc(d.familyName)} family &middot; ${esc(d.role)} &middot; Tier ${d.tier} &middot; <span class="r-${d.rarity}">${d.rarity}</span></p>
      ${bar('Damage/s', p.dps, 120)}${bar('Range', p.range, 1500)}${bar('Mobility', p.mobility, 140)}${bar('Durability', p.durability, 160)}${bar('Control', p.control, 12)}${bar('Coverage', p.coverage, 12)}${bar('Burst', p.burst, 60)}
      <dl class="kv" style="margin-top:10px">
        <dt>Weapons</dt><dd>${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ') || 'Body only (ram)'}</dd>
        <dt>Effects</dt><dd>${flags.map(f => esc(FLAG_INFO[f])).join('; ') || 'None'}</dd>
        <dt>Ability</dt><dd>${esc(ABILITIES[d.ability].name)}${d.ability !== 'none' ? `: ${esc(ABILITIES[d.ability].desc)}` : ''}</dd>
        <dt>Passive</dt><dd>${esc(d.passive)}</dd>
        <dt>Weakness</dt><dd>${esc(d.weakness)}</dd>
        <dt>Requires</dt><dd>${req.map(esc).join(', ')}</dd>
        <dt>Availability</dt><dd>${AVAIL_LABEL[availability(d)]}; any tank is selectable in Sandbox</dd>
        <dt>Evolves from</dt><dd>${from.length ? from.slice(0, 6).map(t => `<a href="#" data-tank="${t.index}" style="color:#7cc4ff">${esc(t.name)}</a>`).join(', ') : 'Start'}</dd>
        <dt>Evolves into</dt><dd>${d.next.length ? d.next.map(id => TANKS_BY_ID.get(id)).map(t => `<a href="#" data-tank="${t.index}" style="color:#7cc4ff">${esc(t.name)}</a>`).join(', ') : 'Final form'}</dd>
        <dt>ID</dt><dd><code>${esc(d.id)}</code></dd>
      </dl>
      ${o.pick ? `<button class="btn primary block" data-act="sbspawn" data-i="${d.index}">Spawn as this tank</button>` : ''}`;
    const cv = box.querySelector('#col-big');
    const t0 = performance.now();
    cancelAnimationFrame(this.anim);
    const loop = ts => {
      if (!cv.isConnected) return;
      previewTank(cv, d, '#38a3ff', (ts - t0) / 1000);
      this.anim = requestAnimationFrame(loop);
    };
    this.anim = requestAnimationFrame(loop);
  }

  screen_progression() {
    const roots = TANK_FAMILIES.filter(f => f.root);
    const id = (f, i) => TANKS_BY_ID.get(`${f.key}.${i}.std`);
    const link = d => `<a href="#" data-tank="${d.index}" data-go2="collection" style="color:#7cc4ff">${esc(d.name)}</a>`;
    return `${this.backBtn()}<h2 class="title">Tank Progression</h2>
      <div class="panel tree">
      <p>Every tank starts as <b>Basic</b>. Evolve at level 15 (tier 2), 30 (tier 3) and 45 (tier 4). Each choice keeps your current doctrine. Branches marked as children fork off their parent family at tier 3.</p>
      <p><b>Doctrines</b> are a second axis: ${DOCTRINES.length} ammunition styles that change how every barrel behaves. Adopting one costs a relic core, dropped by elite enemies, alpha pentagons, secret caches and bosses. Combining ${TANK_FAMILIES.length + 1} families, 4 forms each and ${DOCTRINES.length} doctrines gives ${TANKS.length} distinct tanks.</p>
      <ul class="muted">${DOCTRINES.map(d => `<li><b style="color:var(--text)">${d.name}</b>: ${esc(d.passive)}. ${esc(d.weakness)}.</li>`).join('')}</ul>
      <p><b>Hidden paths:</b> the Relic family needs a boss victory, and the Experimental family needs 2 relic cores held.</p>
      ${roots.map(f => {
        const kids = TANK_FAMILIES.filter(k => k.parent === f.key);
        return `<details open><summary><b>${esc(f.name)}</b> <span class="muted">${esc(f.role)}</span></summary>
          <div>Tier 2: ${link(id(f, 0))}</div>
          <div>Tier 3: ${link(id(f, 1))}, ${link(id(f, 2))}</div>
          <div>Tier 4: ${link(id(f, 3))}</div>
          ${kids.map(k => `<details><summary>${esc(k.name)} branch <span class="muted">${esc(k.role)}</span></summary><div>Tier 3: ${link(id(k, 0))}, ${link(id(k, 1))}</div><div>Tier 4: ${link(id(k, 2))}, ${link(id(k, 3))}</div></details>`).join('')}
        </details>`;
      }).join('')}
      </div>`;
  }

  screen_bosses() {
    return `${this.backBtn()}<h2 class="title">Bestiary</h2><p class="muted">${BOSSES.length} boss definitions. Bosses scale with the number of nearby players by adding health (capped) and attacking faster.</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${BOSSES.map((b, i) => `
        <div class="panel"><canvas data-boss="${i}" style="width:100%;height:120px"></canvas>
          <h3 style="margin-top:4px">${esc(b.name)}</h3><p class="muted" style="margin:0">${esc(b.title)}${b.rare ? ' &middot; rare world boss' : ''}${b.largeScale ? ' &middot; large-scale' : ''}</p>
          <p style="font-size:13px;margin:6px 0"><b>Phases:</b> ${b.phases.map(p => esc(p.name)).join(' &rarr; ')}</p>
          <p style="font-size:13px;margin:6px 0"><b>Attacks:</b> ${Object.keys(b.attacks).join(', ')}</p>
          ${b.parts ? `<p style="font-size:13px;margin:6px 0"><b>Components:</b> ${b.parts.length} (${[...new Set(b.parts.map(p => p.shieldsCore ? 'shield' : p.invulnPart ? 'weak point' : p.regrow ? 'regrowing head' : p.disables ? 'weapon system' : 'linked'))].join(', ')})</p>` : ''}
          <p class="muted" style="font-size:12px;margin:0">Defeated by you: ${store.stats.bossTypes[b.key] || 0}</p>
        </div>`).join('')}</div>`;
  }

  after_bosses() {
    const t0 = performance.now();
    const cvs = [...this.root.querySelectorAll('canvas[data-boss]')];
    const loop = ts => {
      if (!cvs.length || !cvs[0].isConnected) return;
      for (const cv of cvs) {
        const dpr = Math.min(2, devicePixelRatio || 1);
        const w = cv.clientWidth, h = cv.clientHeight;
        if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
        const c = cv.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, w, h);
        const b = BOSSES[Number(cv.dataset.boss)];
        drawBoss(c, b, w / 2, h / 2, Math.min(h, w) * 0.3, (ts - t0) / 2000, (ts - t0) / 1000, 0, null);
      }
      this.anim = requestAnimationFrame(loop);
    };
    this.anim = requestAnimationFrame(loop);
  }

  screen_achievements() {
    const c = store.counters;
    return `${this.backBtn()}<h2 class="title">Achievements</h2><p class="muted">Tracked from real game events your server reports. Stored on this device.</p>
      <div class="grid">${ACHIEVEMENTS.map(a => {
        const done = !!store.ach[a.id];
        const prog = Math.min(a.n, c[a.ev] || 0);
        return `<div class="ach ${done ? 'done' : ''}"><div><b>${esc(a.name)}</b><div class="muted" style="font-size:13px">${esc(a.desc)}</div></div><div style="text-align:right">${done ? '<b style="color:#ffd84d">Unlocked</b>' : `${prog} / ${a.n}`}</div></div>`;
      }).join('')}</div>`;
  }

  screen_stats() {
    const s = store.stats;
    const top = Object.entries(s.tanks).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const kd = s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills;
    return `${this.backBtn()}<h2 class="title">Statistics</h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">
        <div class="panel"><h3 style="margin-top:0">Career</h3><dl class="kv">
          <dt>Matches</dt><dd>${s.games}</dd><dt>Time played</dt><dd>${Math.round(s.seconds / 60)} min</dd>
          <dt>Kills</dt><dd>${s.kills}</dd><dt>Deaths</dt><dd>${s.deaths}</dd><dt>K/D</dt><dd>${kd}</dd><dt>Assists</dt><dd>${s.assists}</dd>
          <dt>Best score</dt><dd>${s.bestScore}</dd><dt>Elites</dt><dd>${s.elites}</dd><dt>Healing</dt><dd>${Math.round(s.heal)}</dd></dl></div>
        <div class="panel"><h3 style="margin-top:0">Boss records</h3><dl class="kv">${BOSSES.filter(b => s.bossTypes[b.key]).map(b => `<dt>${esc(b.name.replace('The ', ''))}</dt><dd>${s.bossTypes[b.key]}</dd>`).join('') || '<dt>None yet</dt><dd></dd>'}</dl></div>
        <div class="panel"><h3 style="margin-top:0">Exploration</h3><dl class="kv"><dt>Secret rooms</dt><dd>${s.secrets}</dd><dt>Tanks played</dt><dd>${Object.keys(s.tanks).length} / ${TANKS.length}</dd></dl>
          <h3>Most played</h3><dl class="kv">${top.map(([id, n]) => `<dt>${esc((TANKS_BY_ID.get(id) || { name: id }).name)}</dt><dd>${n}</dd>`).join('') || '<dt>None yet</dt><dd></dd>'}</dl></div>
      </div>
      <p class="muted" style="font-size:13px">Stored only on this device. Match results and health are always decided by the server.</p>
      <button class="btn small danger" data-act="resetstats">Reset local stats and achievements</button>`;
  }

  screen_settings() {
    const s = store.settings;
    const cfg = (window.NEXUS_CONFIG && window.NEXUS_CONFIG.server) || '';
    return `${this.backBtn(this.opts && this.opts.back || 'main')}<h2 class="title">Settings</h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
        <div class="panel"><h3 style="margin-top:0">Connection</h3>
          <div class="field"><label>Game server address</label><input data-set="server" value="${esc(s.server)}" placeholder="${esc(cfg || location.origin)}" autocapitalize="off" spellcheck="false"></div>
          <p class="muted" style="font-size:13px">Leave blank to use ${cfg ? `the address in config.js (${esc(cfg)})` : 'this page\'s own address'}. Example: <code>https://nexus-infinite-warfare.yourname.workers.dev</code></p>
          <button class="btn small" data-act="testserver">Test connection</button> <span id="s-test" class="muted" style="font-size:13px"></span>
        </div>
        <div class="panel"><h3 style="margin-top:0">Graphics</h3>
          <div class="field"><label>Quality</label><select data-set="quality">${['high', 'medium', 'low'].map(q => `<option ${s.quality === q ? 'selected' : ''}>${q}</option>`).join('')}</select></div>
          <label><input type="checkbox" data-set="reducedEffects" ${s.reducedEffects ? 'checked' : ''}> Reduced effects</label><br>
          <label><input type="checkbox" data-set="reducedMotion" ${s.reducedMotion ? 'checked' : ''}> Reduced motion (no screen shake)</label>
          <div class="field" style="margin-top:10px"><label>Screen shake ${Math.round(s.shake * 100)}%</label><input type="range" min="0" max="1" step="0.05" data-set="shake" value="${s.shake}"></div>
        </div>
        <div class="panel"><h3 style="margin-top:0">Interface</h3>
          <div class="field"><label>HUD scale ${Math.round(s.hudScale * 100)}%</label><input type="range" min="0.7" max="1.4" step="0.05" data-set="hudScale" value="${s.hudScale}"></div>
          <label><input type="checkbox" data-set="hudSwap" ${s.hudSwap ? 'checked' : ''}> Swap leaderboard and minimap sides</label><br>
          <label><input type="checkbox" data-set="showNet" ${s.showNet ? 'checked' : ''}> Show ping and frame rate</label>
        </div>
        <div class="panel"><h3 style="margin-top:0">Touch controls</h3>
          <div class="field"><label>Touch controls</label><select data-set="touch">${[['auto', 'Automatic'], ['on', 'Always on'], ['off', 'Off']].map(([v, t]) => `<option value="${v}" ${s.touch === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <label><input type="checkbox" data-set="autoFire" ${s.autoFire ? 'checked' : ''}> Start with auto-fire on</label>
        </div>
        <div class="panel"><h3 style="margin-top:0">Audio</h3>
          <div class="field"><label>Volume ${Math.round(s.volume * 100)}%</label><input type="range" min="0" max="1" step="0.05" data-set="volume" value="${s.volume}"></div>
        </div>
      </div>`;
  }

  screen_help() {
    return `${this.backBtn(this.opts && this.opts.back || 'main')}<h2 class="title">Help</h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
        <div class="panel"><h3 style="margin-top:0">Keyboard and mouse</h3><dl class="kv">
          <dt>Move</dt><dd>WASD or arrow keys</dd><dt>Aim</dt><dd>Mouse</dd><dt>Fire</dt><dd>Left mouse (drones follow the cursor)</dd>
          <dt>Repel drones</dt><dd>Right mouse</dd><dt>Ability</dt><dd>Space, Shift or Q</dd><dt>Auto-fire</dt><dd>E</dd>
          <dt>Upgrade stats</dt><dd>1 to 8</dd><dt>Evolve</dt><dd>Y U I O H J K L, or click</dd><dt>Doctrine</dt><dd>G</dd>
          <dt>Players</dt><dd>Tab</dd><dt>Team upgrades</dt><dd>T (Nexus Siege)</dd><dt>Sandbox panel</dt><dd>B</dd><dt>Respawn</dt><dd>R</dd><dt>Menu</dt><dd>Esc</dd></dl></div>
        <div class="panel"><h3 style="margin-top:0">Touch (phone and iPad)</h3><p>Left side of the screen: drag to move. Right side: drag to aim and fire. The round button shows your ability and its cooldown. Toggle auto-fire with the AUTO FIRE button. Landscape is recommended.</p></div>
        <div class="panel"><h3 style="margin-top:0">Modes</h3>${Object.values(MODES).map(m => `<p><b>${m.name}.</b> ${m.desc}</p>`).join('')}</div>
        <div class="panel"><h3 style="margin-top:0">Nexus Siege</h3><p>Each Nexus is protected by a regenerating shield while its two shield generators stand. Destroy the generators to stop regeneration and weaken the shield, then break the shield and the core. Team credits buy shared upgrades. Destroyed defenses rebuild over time or with credits.</p></div>
        <div class="panel"><h3 style="margin-top:0">Labyrinth</h3><p>Every map is generated from a seed and validated so spawns and objectives are reachable. Cracked walls can be broken, and some hide sealed secret rooms with treasure caches. Stand in a boss chamber, or break its shrine, to wake its guardian. Deeper chambers hold tougher bosses. Themes change the rules: crystal walls reflect bullets, industrial doors cycle, vines regrow, void gates teleport.</p></div>
        <div class="panel"><h3 style="margin-top:0">Bosses</h3><p>Red markers on the ground and red lines show where an attack will land. Each boss has phases, and many have components: shields that protect the core, weak points that move, weapon systems that switch off when destroyed. Rewards are shared by contribution, including healing and shielding allies.</p></div>
      </div>`;
  }

  screen_credits() {
    return `${this.backBtn()}<h2 class="title">Credits</h2><div class="panel">
      <p><b>Nexus: Infinite Warfare</b> is an original game inspired by the arena tank genre. All tanks, bosses, maps and effects are drawn in code at runtime.</p>
      <p>Built with HTML Canvas 2D, plain JavaScript modules and WebSockets. The authoritative server runs on Node.js (ws) or Cloudflare Durable Objects.</p>
      <p>Fonts: Chakra Petch and IBM Plex Sans via Google Fonts.</p>
      <p class="muted">Registry: ${TANKS.length} tanks, ${TANK_FAMILIES.length + 1} families, ${BOSSES.length} bosses, ${Object.keys(PROJECTILE_KINDS).length} projectile kinds, ${STAT_NAMES.length} stats.</p></div>`;
  }

  onInput(e) {
    const t = e.target;
    if (t.id === 'm-name') { setSetting('name', t.value.slice(0, 16)); return; }
    if (t.dataset.col) {
      this.col[t.dataset.col] = t.value;
      this.col.page = 0;
      if (e.type === 'change' || t.dataset.col !== 'q') { this.show('collection', this.opts); }
      else { clearTimeout(this.qt); this.qt = setTimeout(() => { const pos = t.selectionStart; this.show('collection', this.opts); const n = this.root.querySelector('[data-col="q"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250); }
      return;
    }
    if (t.dataset.set) {
      const k = t.dataset.set;
      let v = t.type === 'checkbox' ? t.checked : t.type === 'range' ? Number(t.value) : t.value;
      setSetting(k, v);
      if (k === 'volume') setVolume(v);
      if (e.type === 'change' && (t.type === 'range')) this.show('settings', this.opts);
      this.app.onSettingsChanged(k);
    }
  }

  onClick(e) {
    const go = e.target.closest('[data-go]');
    if (go && go.dataset.go === 'game') { e.preventDefault(); return this.app.closeOverlay(); }
    if (go) { e.preventDefault(); return this.show(go.dataset.go, go.dataset.go === 'settings' || go.dataset.go === 'help' ? { back: this.current === 'error' ? 'main' : (this.opts && this.opts.back) || 'main' } : {}); }
    const md = e.target.closest('[data-mode]');
    if (md) { this.mode = md.dataset.mode; setSetting('lastMode', this.mode); return this.show('main'); }
    const tk = e.target.closest('[data-tank]');
    if (tk) {
      e.preventDefault();
      this.col.sel = Number(tk.dataset.tank);
      if (this.current !== 'collection') return this.show('collection', { back: this.current });
      this.root.querySelectorAll('.card.on').forEach(c => c.classList.remove('on'));
      const card = this.root.querySelector(`.card[data-tank="${this.col.sel}"]`);
      if (card) card.classList.add('on');
      return this.renderDetail();
    }
    const pg = e.target.closest('[data-page]');
    if (pg) { this.col.page += Number(pg.dataset.page); return this.show('collection', this.opts); }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    const name = () => (store.settings.name || '').trim() || 'Tank';
    if (a === 'quick') this.app.quickPlay(this.mode, name());
    else if (a === 'offline') this.show('offline');
    else if (a === 'offlinego') { const r = this.readSettings('o'); this.app.offline(r.mode, r.settings, name()); }
    else if (a === 'create') { const r = this.readSettings('c'); this.app.createRoom(r.mode, r.settings, name()); }
    else if (a === 'join') { const code = this.root.querySelector('#j-code').value.trim(); if (code) this.app.joinRoom(code, name()); }
    else if (a === 'cancel') this.app.leave();
    else if (a === 'retry') this.app.retry();
    else if (a === 'sbspawn') this.app.sandboxPick(Number(act.dataset.i));
    else if (a === 'testserver') {
      const out = this.root.querySelector('#s-test');
      out.textContent = 'Testing...';
      checkHealth(serverBase()).then(h => { out.textContent = h.ok ? `Online, protocol ${h.protocol}, ${h.platform}` : h.reason; });
    } else if (a === 'resetstats') {
      if (confirm('Reset local statistics and achievements on this device?')) {
        store.stats = { games: 0, kills: 0, deaths: 0, assists: 0, bosses: 0, secrets: 0, bestScore: 0, seconds: 0, elites: 0, heal: 0, bossTypes: {}, tanks: {} };
        store.ach = {}; store.counters = {}; store.seen = {};
        save();
        this.show('stats');
      }
    }
  }
}
