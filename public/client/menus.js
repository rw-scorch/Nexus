import { MODES, THEMES, STAT_NAMES, MAX_LEVEL } from '../shared/constants.js';
import { TANKS, PUBLIC_TANKS, TANK_FAMILIES, ABILITIES, TANKS_BY_ID, SECRET_IDS, validateRegistry, previewCustomTank } from '../shared/tank-registry.js';
import { COSMETICS, accountLevel, xpForAccountLevel } from '../shared/cosmetics.js';
import { PART_KINDS, BODIES, STARTER_DESIGN, cleanDesign } from '../shared/custom-tanks.js';
import { TILES } from '../shared/constants.js';
import { FLAG_INFO, PROJECTILE_KINDS } from '../shared/projectile-types.js';
import { BOSSES } from '../shared/boss-registry.js';
import { ACHIEVEMENTS, MAP_THEMES } from '../shared/entity-types.js';
import { previewTank, drawBoss } from './draw.js';
import { drawTree, hitTest, scrollToNode, TIER_COLORS } from './tree.js';
import { store, setSetting, save } from './storage.js';
import { serverBase, checkHealth, roomCounts, api } from './net.js';
import { setVolume } from './audio.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let VALID = null;
const validation = () => VALID || (VALID = validateRegistry());
const ROLES = [...new Set(TANKS.map(t => t.role))].sort();
const TIER_IX = { 1: 0, 15: 1, 30: 2, 45: 3, 60: 4 };
const tileColor = d => d.src === 'secret' ? '#3d4452' : d.src === 'custom' ? '#fc9a4a' : d.src === 'nexus' ? TIER_COLORS[5] : TIER_COLORS[TIER_IX[d.level] ?? 4];
const SRC_LABEL = { arras: 'Arras class tree', ar: 'Arms Race', nexus: 'Nexus original' };
const MODE_STYLE = {
  ffa: ['#f14e54', 'FFA'], tdm: ['#00b2e1', 'Teams'], nexus: ['#b57cf0', 'Objective'], maze: ['#e0b400', 'FFA'], maze_team: ['#e0b400', 'Teams'],
  labyrinth: ['#00c864', 'Explore'], labyrinth_team: ['#00c864', 'Teams'], battle: ['#fc9a4a', 'No leveling'], battle_team: ['#fc9a4a', 'Teams'], sandbox: ['#8b93a3', 'Creative']
};
const MODE_FILTERS = [['all', 'All'], ['ffa', 'Free for all'], ['team', 'Teams'], ['battle', 'No leveling']];
const TIPS = [
  'Upgrade at levels 15, 30, 45 and 60. Arms Race tanks unlock at 60.',
  'Drones follow your cursor while you hold fire. Right click pushes them away.',
  'In Battle and Team Battle you start at level 60. Spend your 42 points first.',
  'Stalker, Landmine and Phantom turn invisible when they stand still.',
  'Auto turrets aim by themselves. Auto-3 and its children spin while they shoot.',
  'Press N in game to open the class tree. Green outlines are upgrades you can take now.',
  'Traps stop where they land. Builders and Tri-Trappers can wall off corridors in Maze.',
  'Nexus originals use energy beams: they hit instantly and some bounce off walls.',
  'Battle and one random mode are always running. Admins can start more.',
  'Coins come from kills and boss kills while you are logged in.'
];
const CHANGES = [
  'Accounts: log in to earn XP and coins in online matches.',
  'Shop with tank skins, bullet trails and kill effects.',
  'Boss Hunt: one player is a boss, and whoever kills them becomes the next one.',
  'Tank Builder and the Workshop mode: design your own tank and drive it.',
  'Bosses now have a quarter of their old health.',
  'Somewhere there is a tank nobody has found yet.',
  'The arras.io class tree with Arms Race at level 60.'
];

export class Menus {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.mode = MODES[store.settings.lastMode] ? store.settings.lastMode : 'ffa';
    this.modeFilter = 'all';
    this.col = { q: '', family: '', role: '', level: '', src: '', played: '', page: 0, sel: 0 };
    this.treeRoot = 'basic';
    this.counts = {};
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
    const cls = name === 'main' ? ' main-screen' : opts.clear ? ' clear' : '';
    this.root.innerHTML = `<div class="screen${cls}"><div class="wrap">${fn.call(this, opts)}</div></div>`;
    const after = this['after_' + name];
    if (after) after.call(this, opts);
  }

  backBtn(to = 'main') { return `<button class="btn small back" data-go="${to}">&larr; Back</button>`; }

  battleTank() { return (store.battleTank && TANKS_BY_ID.get(store.battleTank)) || null; }

  gameRows() {
    const f = this.modeFilter;
    if (!this.games) return `<div class="muted" style="padding:14px">Loading games...</div>`;
    if (!this.games.length) return `<div class="muted" style="padding:14px">Could not load the game list. The server may be offline. Offline practice still works.</div>`;
    const rows = this.games.filter(g => { const m = MODES[g.mode]; return m && (f === 'all' || (f === 'team' ? m.teams : f === 'battle' ? m.battle : !m.teams)); });
    if (!rows.length) return `<div class="muted" style="padding:14px">No running games of this kind. Admins can start one.</div>`;
    return rows.map(g => {
      const m = MODES[g.mode];
      const [c, tag] = MODE_STYLE[g.mode] || ['#8b93a3', ''];
      const n = this.counts[g.code];
      const label = g.official ? (g.featured ? 'Featured' : tag) : 'Event';
      const sub = g.official ? (g.featured ? `Random mode, changes in ${Math.max(1, Math.round((this.rotatesIn || 0) / 60))} min. ${m.desc}` : m.desc) : `${m.name}${g.map ? ` on ${g.map}` : ''}. Started by ${g.by}.`;
      return `<button class="srv ${g.code === this.selCode ? 'on' : ''}" style="--c:${c}" data-game="${esc(g.code)}"><i></i><span><b>${esc(g.name)}<span class="tag">${esc(label)}</span></b><small>${esc(sub)}</small></span><span class="cnt">${n === undefined ? '&nbsp;' : `${n} playing`}</span></button>`;
    }).join('');
  }

  selectedGame() { return (this.games || []).find(g => g.code === this.selCode) || (this.games || [])[0] || null; }

  acctChip() {
    const u = store.user;
    if (!u || !store.session) return `<button class="acct" data-go="account"><span class="acct-av">?</span><span><b>Guest</b><small>Log in to earn XP and coins</small></span></button>`;
    const pct = Math.round((u.xp - xpForAccountLevel(u.level)) / Math.max(1, xpForAccountLevel(u.level + 1) - xpForAccountLevel(u.level)) * 100);
    return `<button class="acct" data-go="account"><span class="acct-av">${u.level}</span><span><b>${u.admin ? '&#9733; ' : ''}${esc(u.name)}</b><small>${u.coins} coins &middot; ${u.xp} XP</small><em><i style="width:${pct}%"></i></em></span></button>`;
  }

  screen_main() {
    const bt = this.battleTank();
    const g = this.selectedGame();
    const mode = g ? g.mode : this.mode;
    const isBattle = MODES[mode] && MODES[mode].battle;
    const explore = `
      <button class="btn blue" data-go="progression">Class Tree</button>
      <button class="btn purple" data-go="collection">All Tanks</button>
      <button class="btn green" data-go="shop">Shop</button>
      <button class="btn orange" data-go="builder">Tank Builder</button>
      <button class="btn yellow" data-go="redeem">Redeem</button>
      <button class="btn" data-go="bosses">Bestiary</button>
      <button class="btn" data-go="achievements">Achievements</button>
      <button class="btn" data-go="help">Help</button>`;
    return `
      <div class="menu-shell">
        <div class="menu-side">
          <div class="side-card">
            <h3>Tank spotlight</h3>
            <div class="showcase"><canvas id="m-show"></canvas><div id="m-showtxt"></div></div>
          </div>
          <div class="side-card"><h3>Explore</h3><div class="links">${explore}</div></div>
        </div>
        <div class="menu-card">
          <div class="brand"><canvas id="m-logo"></canvas><div style="flex:1"><h1>NEXUS</h1><small>Infinite Warfare</small></div></div>
          <div id="m-acct">${this.acctChip()}</div>
          <div class="seg">${MODE_FILTERS.map(([k, n]) => `<button class="${k === this.modeFilter ? 'on' : ''}" data-mf="${k}">${n}</button>`).join('')}</div>
          <div class="server-list" id="m-list">${this.gameRows()}</div>
          ${isBattle ? `<div class="row" style="margin-top:10px;gap:10px;background:#fff7ef;border:2px solid #f6c48d;border-radius:14px;padding:8px 10px">
            <canvas id="m-bt" style="width:48px;height:48px"></canvas>
            <div style="flex:1"><b>${bt ? esc(bt.name) : 'Random tank'}</b><div class="muted" style="font-size:12px">${bt ? `${esc(bt.role)} &middot; level ${bt.level} class` : 'Pick the tank you spawn with'}</div></div>
            <button class="btn small orange" data-go="picktank">Choose</button></div>` : ''}
          <input id="m-name" class="name-input" maxlength="16" placeholder="${store.user && store.session ? esc(store.user.name) : 'Enter your name'}" value="${store.user && store.session ? esc(store.user.name) : esc(store.settings.name)}" ${store.user && store.session ? 'disabled' : ''} autocomplete="off" spellcheck="false">
          <button class="btn primary play-btn" data-act="quick">Play</button>
          <div class="menu-actions">
            <button class="btn blue" data-go="${store.user && store.user.admin ? 'admin' : 'account'}">${store.user && store.user.admin ? 'Admin' : store.session ? 'Account' : 'Log in'}</button>
            <button class="btn purple" data-go="join">Join code</button>
            <button class="btn orange" data-act="offline">Offline</button>
          </div>
          <div class="menu-foot"><span><span class="status-dot" id="m-dot"></span> <span id="m-status">Checking server...</span></span><span>${PUBLIC_TANKS.length} tanks</span></div>
          <button class="opt-toggle ${this.optOpen ? 'open' : ''}" data-act="opts">view options <span>&#9662;</span></button>
          ${this.optOpen ? `<div class="opt-pane">
            <label class="chk"><input type="checkbox" data-set="autoFire" ${store.settings.autoFire ? 'checked' : ''}> Start with auto-fire on</label>
            <label class="chk"><input type="checkbox" data-set="showNet" ${store.settings.showNet ? 'checked' : ''}> Show ping and frame rate</label>
            <label class="chk"><input type="checkbox" data-set="reducedEffects" ${store.settings.reducedEffects ? 'checked' : ''}> Reduced effects</label>
            <div class="row" style="margin-top:6px"><div class="field" style="flex:1;margin:0"><label>Quality</label><select data-set="quality">${['high', 'medium', 'low'].map(q => `<option ${store.settings.quality === q ? 'selected' : ''}>${q}</option>`).join('')}</select></div>
            <div class="field" style="flex:1;margin:0"><label>Touch</label><select data-set="touch">${[['auto', 'Automatic'], ['on', 'Always on'], ['off', 'Off']].map(([v, t]) => `<option value="${v}" ${store.settings.touch === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
            <div class="row" style="margin-top:10px"><button class="btn small" data-go="settings">All settings</button><button class="btn small" data-go="stats">Statistics</button><button class="btn small" data-go="credits">Credits</button></div>
          </div>` : ''}
        </div>
        <div class="menu-side">
          <div class="side-card"><h3>What's new</h3><ul class="changes">${CHANGES.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>
          <div class="side-card"><h3>Tip</h3><div class="tip" id="m-tip">${esc(TIPS[Math.floor(Math.random() * TIPS.length)])}</div></div>
        </div>
      </div>
      <div class="menu-side mobile hidden-desktop" style="max-width:520px;margin:14px auto 0"><div class="side-card"><div class="links">${explore}</div></div></div>`;
  }

  refreshMain() {
    const list = this.root.querySelector('#m-list');
    if (list && list.isConnected) list.innerHTML = this.gameRows();
    const ac = this.root.querySelector('#m-acct');
    if (ac && ac.isConnected) ac.innerHTML = this.acctChip();
  }

  after_main() {
    const base = serverBase();
    const dot = this.root.querySelector('#m-dot'), st = this.root.querySelector('#m-status');
    checkHealth(base).then(h => {
      if (!dot || !dot.isConnected) return;
      if (h.ok) { dot.className = 'status-dot ok'; st.textContent = `Online (${h.platform || 'server'})`; }
      else { dot.className = 'status-dot bad'; st.innerHTML = `${esc(h.reason)}. <a href="#" data-go="settings">Server address</a>`; }
    });
    api('/api/games').then(r => {
      const had = !!this.games;
      this.games = r.games || [];
      this.rotatesIn = r.rotatesIn || 0;
      if (!this.selCode || !this.games.some(g => g.code === this.selCode)) this.selCode = (this.games.find(g => g.mode === this.mode) || this.games[0] || {}).code;
      if (!had && this.current === 'main') return this.show('main');
      this.refreshMain();
      return roomCounts(base, this.games.map(g => g.code)).then(c => { this.counts = c || {}; this.refreshMain(); });
    });
    if (store.session) api('/api/me').then(() => this.refreshMain());
    const logo = this.root.querySelector('#m-logo');
    const bt = this.root.querySelector('#m-bt');
    const cv = this.root.querySelector('#m-show'), txt = this.root.querySelector('#m-showtxt');
    const pool = PUBLIC_TANKS.filter(t => t.level >= 30);
    let d = pool[Math.floor(Math.random() * pool.length)], last = -1e9, t0 = performance.now();
    const loop = ts => {
      if (!logo || !logo.isConnected) return;
      const time = (ts - t0) / 1000;
      previewTank(logo, TANKS_BY_ID.get('basic'), '#00b2e1', time);
      if (bt) previewTank(bt, this.battleTank() || TANKS_BY_ID.get('basic'), '#00b2e1', time);
      if (cv && cv.offsetParent) {
        if (ts - last > 4000) {
          d = pool[Math.floor(Math.random() * pool.length)]; last = ts;
          txt.innerHTML = `<b>${esc(d.name)}</b><div class="muted" style="font-size:12px">${esc(d.role)} &middot; level ${d.level}</div><div style="font-size:12px;margin-top:4px">${esc(d.tip || SRC_LABEL[d.src])}</div><a href="#" data-tank="${d.index}" style="font-size:12px">Details</a>`;
        }
        previewTank(cv, d, '#00b2e1', time);
      }
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
    return PUBLIC_TANKS.filter(d =>
      (!q || d.name.toLowerCase().includes(q) || d.familyName.toLowerCase().includes(q) || d.role.toLowerCase().includes(q)) &&
      (!c.family || d.family === c.family) && (!c.role || d.role === c.role) && (!c.level || d.level === Number(c.level)) &&
      (!c.src || d.src === c.src) && (!c.played || (c.played === 'yes') === !!store.stats.tanks[d.id]));
  }

  screen_collection(o) {
    const c = this.col;
    const sel = (id, label, opts, val) => `<div class="field"><label>${label}</label><select data-col="${id}"><option value="">All</option>${opts.map(([v, t]) => `<option value="${v}" ${String(val) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
    const list = this.filtered();
    const per = 60;
    const pages = Math.max(1, Math.ceil(list.length / per));
    c.page = Math.min(c.page, pages - 1);
    const pageItems = list.slice(c.page * per, c.page * per + per);
    const v = validation();
    return `${this.backBtn(o.back || 'main')}<h2 class="title">All Tanks</h2>
      <p class="muted">${v.count} tanks: ${v.arras} from the arras.io class tree, ${v.armsRace} from Arms Race and ${v.nexus} Nexus originals. ${v.ok ? 'Every tank is reachable from Basic.' : `Validation found ${v.errors.length} issues.`} ${o.pick ? '<b style="color:var(--orange-d)">Sandbox: tap a tank, then Spawn as this tank.</b>' : ''}</p>
      <div class="collection"><div>
        <div class="filters">
          <div class="field"><label>Search</label><input data-col="q" value="${esc(c.q)}" placeholder="Name or role"></div>
          ${sel('family', 'Branch', TANK_FAMILIES.map(f => [f.key, f.name]), c.family)}
          ${sel('role', 'Role', ROLES.map(r => [r, r]), c.role)}
          ${sel('level', 'Level', [[1, 'Level 1'], [15, 'Level 15'], [30, 'Level 30'], [45, 'Level 45'], [60, 'Level 60']], c.level)}
          ${sel('src', 'Source', Object.entries(SRC_LABEL), c.src)}
          ${sel('played', 'Played', [['yes', 'Played'], ['no', 'Not played yet']], c.played)}
        </div>
        <div class="cards">${pageItems.map(d => `<button class="card ${d.index === c.sel ? 'on' : ''}" data-tank="${d.index}" style="--tile:${tileColor(d)}"><canvas data-prev="${d.index}"></canvas><b>${esc(d.name)}</b><span>Lv ${d.level} &middot; ${esc(d.role)}</span></button>`).join('') || '<p class="muted">No tanks match these filters.</p>'}</div>
        <div class="pager"><button class="btn small" data-page="-1" ${c.page === 0 ? 'disabled' : ''}>Prev</button><span class="muted">Page ${c.page + 1} of ${pages} &middot; ${list.length} tanks</span><button class="btn small" data-page="1" ${c.page >= pages - 1 ? 'disabled' : ''}>Next</button></div>
      </div>
      <div class="panel" id="col-detail" style="align-self:start;position:sticky;top:0"></div></div>`;
  }

  after_collection(o) {
    this.root.querySelectorAll('canvas[data-prev]').forEach(cv => previewTank(cv, TANKS[Number(cv.dataset.prev)], '#00b2e1'));
    this.renderDetail(o);
  }

  renderDetail(o = this.opts || {}) {
    const box = this.root.querySelector('#col-detail');
    if (!box) return;
    const d = TANKS[this.col.sel] || TANKS[0];
    const p = d.profile;
    const bar = (label, v, max, col) => `<div style="display:grid;grid-template-columns:90px 1fr 46px;gap:8px;align-items:center;font-size:13px;margin:3px 0"><span class="muted">${label}</span><div class="bar"><i style="width:${Math.min(100, v / max * 100)}%;background:${col}"></i></div><span>${v}</span></div>`;
    const kinds = {};
    for (const g of d.guns) if (!g.deco) kinds[g.k] = (kinds[g.k] || 0) + 1;
    const flags = [...new Set(d.guns.filter(g => !g.deco).flatMap(g => Object.keys(g.fx)))];
    const from = (d.parents || []).map(id => TANKS_BY_ID.get(id)).filter(Boolean);
    const link = t => `<a href="#" data-tank="${t.index}">${esc(t.name)}</a>`;
    box.innerHTML = `
      <canvas id="col-big" style="width:100%;height:190px;border-radius:14px;background:${tileColor(d)}"></canvas>
      <h3 style="margin:10px 0 2px;font-size:22px">${esc(d.name)}</h3>
      <p class="muted" style="margin:0 0 8px">${esc(d.role)} &middot; level ${d.level} &middot; ${SRC_LABEL[d.src]}</p>
      ${d.tip ? `<p style="margin:0 0 8px">${esc(d.tip)}</p>` : ''}
      ${bar('Damage/s', p.dps, 150, '#f14e54')}${bar('Range', p.range, 1600, '#00b2e1')}${bar('Speed', p.mobility, 140, '#00c864')}${bar('Health', p.durability, 180, '#b57cf0')}${bar('Burst', p.burst, 60, '#fc9a4a')}
      <dl class="kv" style="margin-top:10px">
        <dt>Weapons</dt><dd>${Object.entries(kinds).map(([k, n]) => `${n} ${k === 'shell' ? 'missile' : k}${n > 1 ? 's' : ''}`).join(', ') || 'Body only (rammer)'}${d.turrets.length ? `, ${d.turrets.length} auto turret${d.turrets.length > 1 ? 's' : ''}` : ''}</dd>
        <dt>Effects</dt><dd>${flags.map(f => esc(FLAG_INFO[f])).join('; ') || 'None'}${d.stealth ? '; invisible when still' : ''}</dd>
        <dt>Ability</dt><dd>${esc(ABILITIES[d.ability].name)}${d.ability !== 'none' ? `: ${esc(ABILITIES[d.ability].desc)}` : ''}</dd>
        <dt>Branch</dt><dd>${esc(d.familyName)}</dd>
        <dt>From</dt><dd>${from.length ? from.map(link).join(', ') : 'Start'}</dd>
        <dt>Into</dt><dd>${d.next.length ? d.next.map(id => TANKS_BY_ID.get(id)).map(link).join(', ') : 'Final form'}</dd>
      </dl>
      ${o.pick ? `<button class="btn primary block" data-act="sbspawn" data-i="${d.index}" style="margin-top:12px">Spawn as this tank</button>` : `<button class="btn small" data-act="treeof" data-i="${d.index}" style="margin-top:12px">Show in class tree</button>`}`;
    const cv = box.querySelector('#col-big');
    const t0 = performance.now();
    cancelAnimationFrame(this.anim);
    const loop = ts => {
      if (!cv.isConnected) return;
      previewTank(cv, d, '#00b2e1', (ts - t0) / 1000);
      this.anim = requestAnimationFrame(loop);
    };
    this.anim = requestAnimationFrame(loop);
  }

  treeScreen(title, note, back, extra = []) {
    const root = this.treeRoot;
    const chips = [['basic', 'Everything'], ...TANK_FAMILIES.map(f => [f.key, f.name]), ...extra].map(([k, n]) => `<button class="chip ${k === root ? 'on' : ''}" data-tree="${k}">${esc(n)}</button>`).join('');
    const legend = [['Level 1', 0], ['Level 15', 1], ['Level 30', 2], ['Level 45', 3], ['Level 60', 4], ['Nexus original', 5]].map(([n, i]) => `<span><i style="background:${TIER_COLORS[i]}"></i>${n}</span>`).join('');
    return `${this.backBtn(back)}<h2 class="title">${title}</h2>
      <div class="panel">
      <p style="margin-top:0">${note}</p>
      <div class="chips tree-chips">${chips}</div>
      <div class="legend">${legend}</div>
      <div class="tree-scroll"><canvas id="p-tree"></canvas></div>
      </div>`;
  }

  screen_progression() {
    return this.treeScreen('Class Tree', `Every tank starts as <b>Basic</b> and upgrades at levels 15, 30, 45 and 60. This is the arras.io class tree, with Arms Race tanks at level 60 and Nexus originals in orange. Pick a branch to zoom in, then tap a tank for details.`, 'main');
  }

  after_progression() {
    const cv = this.root.querySelector('#p-tree');
    const hits = drawTree(cv, { root: this.treeRoot, highlight: this.col.sel });
    scrollToNode(cv, hits, this.treeRoot === 'basic' ? -1 : this.col.sel);
    cv.onclick = ev => { const h = hitTest(hits, cv, ev); if (h) { this.col.sel = h.idx; this.show('collection', { back: 'progression' }); } };
  }

  screen_picktank() {
    const bt = this.battleTank();
    return this.treeScreen('Choose your Battle tank', `Battle modes skip leveling: you spawn at level ${MAX_LEVEL} as the tank you pick here, and you can switch from the Tanks button in game. Current choice: <b>${bt ? esc(bt.name) : 'random'}</b>.`, 'main', SECRET_IDS.filter(id => (store.localUnlocks || []).includes(id) || (store.user && store.session && (store.user.unlocks.includes(id) || store.user.admin))).map(id => [id, '???']));
  }

  after_picktank() {
    const cv = this.root.querySelector('#p-tree');
    const bt = this.battleTank();
    const hits = drawTree(cv, { root: this.treeRoot, highlight: bt ? bt.index : -1 });
    scrollToNode(cv, hits, -1);
    cv.onclick = ev => {
      const h = hitTest(hits, cv, ev);
      if (!h) return;
      store.battleTank = TANKS[h.idx].id;
      save();
      this.show('main');
    };
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
          <dt>Upgrade stats</dt><dd>1 to 8</dd><dt>Upgrade tank</dt><dd>Y U I O H J K L, or click</dd>
          <dt>Class tree</dt><dd>N</dd><dt>Choose tank</dt><dd>B (Battle and Sandbox)</dd><dt>Players</dt><dd>Tab</dd><dt>Team upgrades</dt><dd>T (Nexus Siege)</dd><dt>Sandbox panel</dt><dd>B</dd><dt>Respawn</dt><dd>R</dd><dt>Menu</dt><dd>Esc</dd></dl></div>
        <div class="panel"><h3 style="margin-top:0">Touch (phone and iPad)</h3><p>Left side of the screen: drag to move. Right side: drag to aim and fire. The round button shows your ability and its cooldown. Toggle auto-fire with the AUTO FIRE button. Landscape is recommended.</p></div>
        <div class="panel"><h3 style="margin-top:0">Modes</h3>${Object.values(MODES).map(m => `<p><b>${m.name}.</b> ${m.desc}</p>`).join('')}</div>
        <div class="panel"><h3 style="margin-top:0">Nexus Siege</h3><p>Each Nexus is protected by a regenerating shield while its two shield generators stand. Destroy the generators to stop regeneration and weaken the shield, then break the shield and the core. Team credits buy shared upgrades. Destroyed defenses rebuild over time or with credits.</p></div>
        <div class="panel"><h3 style="margin-top:0">Labyrinth</h3><p>Every map is generated from a seed and validated so spawns and objectives are reachable. Cracked walls can be broken, and some hide sealed secret rooms with treasure caches. Stand in a boss chamber, or break its shrine, to wake its guardian. Deeper chambers hold tougher bosses. Themes change the rules: crystal walls reflect bullets, industrial doors cycle, vines regrow, void gates teleport.</p></div>
        <div class="panel"><h3 style="margin-top:0">Bosses</h3><p>Red markers on the ground and red lines show where an attack will land. Each boss has phases, and many have components: shields that protect the core, weak points that move, weapon systems that switch off when destroyed. Rewards are shared by contribution, including healing and shielding allies.</p></div>
      </div>`;
  }

  screen_credits() {
    return `${this.backBtn()}<h2 class="title">Credits</h2><div class="panel">
      <p><b>Nexus: Infinite Warfare</b> is a fan-made arena tank game. Everything is drawn in code at runtime.</p>
      <p>The tank class tree, barrel layouts and weapon numbers are converted from <a href="https://github.com/open-source-arras/open-source-arras" target="_blank" rel="noopener">Open Source Arras</a> (MIT License, Copyright (c) 2026 Open Source Arras), which recreates the arras.io class tree and the Arms Race expansion. The conversion is done by <code>tools/arras-import.js</code> and <code>tools/arras-convert.js</code> in this project.</p>
      <p>arras.io and diep.io belong to their creators. This project is not affiliated with them.</p>
      <p>Built with HTML Canvas 2D, plain JavaScript modules and WebSockets. The server runs on Node.js (ws) or Cloudflare Durable Objects. Font: Ubuntu via Google Fonts.</p>
      <p class="muted">${TANKS.length} tanks, ${BOSSES.length} bosses, ${Object.keys(PROJECTILE_KINDS).length} projectile kinds, ${STAT_NAMES.length} stats.</p></div>`;
  }

  screen_account() {
    const u = store.user;
    if (!store.session || !u) {
      return `${this.backBtn()}<h2 class="title">Account</h2>
        <div class="panel" style="max-width:440px">
          <p style="margin-top:0">Log in to keep your XP, coins, shop items and unlocks. Playing as a guest still works, but nothing is saved.</p>
          <div class="field"><label>Name</label><input id="a-name" maxlength="16" autocomplete="username" autocapitalize="off" spellcheck="false" value="${esc(store.settings.name)}"></div>
          <div class="field"><label>Password</label><input id="a-pass" type="password" maxlength="72" autocomplete="current-password"></div>
          <div class="row"><button class="btn primary" data-act="login" style="flex:1">Log in</button><button class="btn blue" data-act="signup" style="flex:1">Create account</button></div>
          <p class="muted" id="a-msg" style="font-size:13px;min-height:1.5em"></p>
          <p class="muted" style="font-size:12px">Names: 3 to 16 letters, numbers, _ or -. Passwords: at least 6 characters. Passwords are stored hashed on your game server.</p>
        </div>`;
    }
    const nx = xpForAccountLevel(u.level + 1), cur = xpForAccountLevel(u.level);
    return `${this.backBtn()}<h2 class="title">Account</h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
        <div class="panel">
          <div class="row" style="gap:14px"><div class="acct-av big">${u.level}</div><div><h3 style="margin:0">${u.admin ? '&#9733; ' : ''}${esc(u.name)}</h3><div class="muted">Level ${u.level}${u.admin ? ' &middot; Admin' : ''}</div></div></div>
          <div class="bar" style="height:12px;margin:14px 0 4px"><i style="width:${Math.round((u.xp - cur) / Math.max(1, nx - cur) * 100)}%;background:var(--yellow)"></i></div>
          <div class="muted" style="font-size:13px">${u.xp} XP &middot; ${nx - u.xp} to level ${u.level + 1}</div>
          <dl class="kv" style="margin-top:12px"><dt>Coins</dt><dd><b>${u.coins}</b></dd><dt>Kills</dt><dd>${u.kills}</dd><dt>Items owned</dt><dd>${u.owned.length}</dd><dt>Secrets found</dt><dd>${u.unlocks.length}</dd></dl>
          <p class="muted" style="font-size:12px">XP and coins come from kills, score and boss kills in online matches.</p>
        </div>
        <div class="panel"><h3 style="margin-top:0">Go to</h3><div class="links">
          <button class="btn green" data-go="shop">Shop</button>
          <button class="btn yellow" data-go="redeem">Redeem code</button>
          <button class="btn orange" data-go="builder">Tank Builder</button>
          ${u.admin ? '<button class="btn blue" data-go="admin">Admin panel</button>' : ''}
          <button class="btn danger" data-act="logout">Log out</button>
        </div></div>
      </div>`;
  }

  async authAct(kind) {
    const name = this.root.querySelector('#a-name').value.trim(), password = this.root.querySelector('#a-pass').value;
    const msg = this.root.querySelector('#a-msg');
    msg.textContent = kind === 'signup' ? 'Creating account...' : 'Logging in...';
    const r = await api(kind === 'signup' ? '/api/signup' : '/api/login', { name, password });
    if (r.error) { msg.textContent = r.error; return; }
    store.session = r.token; store.user = r.user; setSetting('name', r.user.name); save();
    this.show('account');
  }

  screen_shop() {
    const u = store.session ? store.user : null;
    const tab = this.shopTab || 'skin';
    const tabs = [['skin', 'Tank skins'], ['trail', 'Bullet trails'], ['kill', 'Kill effects']];
    const cards = COSMETICS[tab].map(it => {
      const id = `${tab}:${it.id}`;
      const owned = u && u.owned.includes(id), eq = u && u.equip[tab] === it.id;
      const btn = !u ? `<button class="btn small" data-go="account">Log in</button>` : eq ? `<button class="btn small" disabled>Equipped</button>` : owned ? `<button class="btn small blue" data-act="equip" data-item="${id}">Equip</button>` : `<button class="btn small green" data-act="buy" data-item="${id}" ${u.coins < it.price ? 'disabled' : ''}>${it.price} coins</button>`;
      return `<div class="shop-card ${eq ? 'on' : ''}"><canvas data-shop="${tab}:${it.id}"></canvas><b>${esc(it.name)}</b><span class="muted">${it.price ? `${it.price} coins` : 'Free'}</span>${btn}</div>`;
    }).join('');
    return `${this.backBtn()}<h2 class="title">Shop</h2>
      <div class="panel">
        <div class="row" style="justify-content:space-between"><div class="seg" style="margin:0;flex:1;max-width:520px">${tabs.map(([k, n]) => `<button class="${k === tab ? 'on' : ''}" data-shoptab="${k}">${n}</button>`).join('')}</div>
        <div class="coins">${u ? `${u.coins} coins` : 'Log in to buy'}</div></div>
        <p class="muted" style="font-size:13px">${tab === 'skin' ? 'Skins change your tank colour in free-for-all modes. Team modes keep team colours.' : tab === 'trail' ? 'Trails follow every bullet you fire. Everyone can see them.' : 'Kill effects play where your victim explodes.'}</p>
        <div class="shop-grid">${cards}</div>
        <p class="muted" id="s-msg" style="font-size:13px;min-height:1.5em"></p>
      </div>`;
  }

  after_shop() {
    const cvs = [...this.root.querySelectorAll('canvas[data-shop]')];
    const t0 = performance.now();
    const basic = TANKS_BY_ID.get('twin');
    const loop = ts => {
      if (!cvs.length || !cvs[0].isConnected) return;
      const time = (ts - t0) / 1000;
      for (const cv of cvs) {
        const [slot, id] = cv.dataset.shop.split(':');
        const item = COSMETICS[slot].find(c => c.id === id);
        if (slot === 'skin') {
          const col = item.anim === 'rainbow' ? `hsl(${(time * 90) % 360},80%,58%)` : item.color || '#00b2e1';
          previewTank(cv, basic, col.startsWith('hsl') ? hslToHex((time * 90) % 360) : col, time);
        } else drawShopPreview(cv, slot, COSMETICS[slot].indexOf(item), time);
      }
      this.anim = requestAnimationFrame(loop);
    };
    this.anim = requestAnimationFrame(loop);
  }

  async shopAct(kind, item) {
    const msg = this.root.querySelector('#s-msg');
    const r = await api(kind === 'buy' ? '/api/shop/buy' : '/api/shop/equip', { item });
    if (r.error) { if (msg) msg.textContent = r.error; return; }
    save();
    this.show('shop');
  }

  screen_redeem() {
    return `${this.backBtn()}<h2 class="title">Redeem a code</h2>
      <div class="panel" style="max-width:460px">
        ${store.session ? '' : '<p>You need to <a href="#" data-go="account">log in</a> to redeem codes.</p>'}
        <div class="field"><label>Code</label><input id="r-code" maxlength="64" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="Enter a code"></div>
        <button class="btn yellow block" data-act="redeem" ${store.session ? '' : 'disabled'}>Redeem</button>
        <p id="r-msg" style="min-height:1.5em"></p>
      </div>`;
  }

  async redeemAct() {
    const msg = this.root.querySelector('#r-msg');
    const code = this.root.querySelector('#r-code').value.trim();
    if (!code) return;
    msg.textContent = 'Checking...';
    const r = await api('/api/redeem', { code });
    if (r.error) { msg.textContent = r.error; return; }
    save();
    msg.innerHTML = `<b>${esc(r.message)}</b>${r.user && r.user.admin ? ' <a href="#" data-go="admin">Open the admin panel</a>' : ''}`;
  }

  screen_admin() {
    if (!store.user || !store.user.admin) return `${this.backBtn()}<h2 class="title">Admin</h2><div class="panel">Admins only. Redeem the admin code first.</div>`;
    const modes = Object.entries(MODES).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('');
    return `${this.backBtn()}<h2 class="title">Admin panel</h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(340px,1fr))">
        <div class="panel"><h3 style="margin-top:0">Running games</h3><div id="ad-games" class="muted">Loading...</div></div>
        <div class="panel"><h3 style="margin-top:0">Start a game</h3>
          <div class="field"><label>Name</label><input id="ad-name" maxlength="32" placeholder="Friday Boss Hunt"></div>
          <div class="row"><div class="field" style="flex:1"><label>Mode</label><select id="ad-mode">${modes}</select></div><div class="field" style="flex:1"><label>Room code (optional)</label><input id="ad-code" maxlength="24" placeholder="auto"></div></div>
          <div class="row"><div class="field" style="flex:1"><label>Map</label><select id="ad-map"><option value="">Generated map</option></select></div><div class="field" style="width:90px"><label>Bots</label><input id="ad-bots" type="number" min="0" max="16" value="6"></div></div>
          <div class="row"><div class="field" style="flex:1"><label>Bot difficulty</label><select id="ad-diff"><option>easy</option><option selected>normal</option><option>hard</option></select></div><div class="field" style="flex:1"><label>Labyrinth theme</label><select id="ad-theme">${THEMES.map(t => `<option value="${t}">${MAP_THEMES[t].name}</option>`).join('')}</select></div></div>
          <label class="chk"><input type="checkbox" id="ad-ff"> Friendly fire</label>
          <button class="btn green block" data-act="adstart" style="margin-top:10px">Start game</button>
          <p class="muted" id="ad-msg" style="font-size:13px;min-height:1.4em"></p>
        </div>
        <div class="panel"><h3 style="margin-top:0">Maps</h3><div id="ad-maps" class="muted">Loading...</div><button class="btn blue" data-act="newmap" style="margin-top:10px">New map</button></div>
        <div class="panel"><h3 style="margin-top:0">Redeem codes</h3>
          <div class="row"><div class="field" style="flex:2"><label>Code</label><input id="ad-ccode" maxlength="32" placeholder="SUMMER500"></div><div class="field" style="flex:1"><label>Coins</label><input id="ad-ccoins" type="number" min="0" value="500"></div></div>
          <div class="row"><div class="field" style="flex:1"><label>XP</label><input id="ad-cxp" type="number" min="0" value="0"></div><div class="field" style="flex:1"><label>Max uses (0 = unlimited)</label><input id="ad-cmax" type="number" min="0" value="0"></div></div>
          <button class="btn yellow" data-act="adcode">Create code</button>
          <div id="ad-codes" class="muted" style="margin-top:10px"></div>
        </div>
      </div>`;
  }

  async after_admin() {
    if (!store.user || !store.user.admin) return;
    const [g, m, c] = await Promise.all([api('/api/games'), api('/api/admin/maps'), api('/api/admin/codes')]);
    const gEl = this.root.querySelector('#ad-games');
    if (!gEl) return;
    gEl.innerHTML = (g.games || []).map(x => `<div class="up-row"><div><b>${esc(x.name)}</b><div class="muted" style="font-size:12px">${esc(MODES[x.mode] ? MODES[x.mode].name : x.mode)} &middot; code <code>${esc(x.code)}</code>${x.map ? ` &middot; ${esc(x.map)}` : ''}${x.official ? ' &middot; always on' : ''}</div></div>${x.official ? '' : `<div class="row"><button class="btn small green" data-act="adjoin" data-code="${esc(x.code)}" data-gmode="${esc(x.mode)}">Join</button><button class="btn small danger" data-act="adstop" data-code="${esc(x.code)}">Stop</button></div>`}</div>`).join('') || (g.error ? esc(g.error) : 'None');
    const maps = m.maps || [];
    this.root.querySelector('#ad-maps').innerHTML = maps.map(x => `<div class="up-row"><div><b>${esc(x.name)}</b><div class="muted" style="font-size:12px">${x.w} x ${x.h} &middot; by ${esc(x.by)}</div></div><div class="row"><button class="btn small blue" data-act="editmap" data-id="${x.id}">Edit</button><button class="btn small danger" data-act="delmap" data-id="${x.id}">Delete</button></div></div>`).join('') || 'No maps yet.';
    const sel = this.root.querySelector('#ad-map');
    for (const x of maps) sel.insertAdjacentHTML('beforeend', `<option value="${x.id}">${esc(x.name)}</option>`);
    this.root.querySelector('#ad-codes').innerHTML = (c.codes || []).map(x => `<div class="up-row"><div><code>${esc(x.code)}</code> <span class="muted" style="font-size:12px">${x.coins} coins${x.xp ? `, ${x.xp} XP` : ''} &middot; used ${x.uses}${x.max ? `/${x.max}` : ''}</span></div><button class="btn small danger" data-act="delcode" data-code="${esc(x.code)}">Delete</button></div>`).join('');
  }

  async adminAct(a, el) {
    const v = id => this.root.querySelector(id);
    const msg = v('#ad-msg');
    if (a === 'adstart') {
      const body = { name: v('#ad-name').value, mode: v('#ad-mode').value, code: v('#ad-code').value, mapId: v('#ad-map').value || undefined, settings: { bots: Number(v('#ad-bots').value), botDifficulty: v('#ad-diff').value, theme: v('#ad-theme').value, friendlyFire: v('#ad-ff').checked } };
      const r = await api('/api/admin/game', body);
      if (r.error) { msg.textContent = r.error; return; }
      msg.textContent = `Started ${r.game.name} (code ${r.game.code}). It is now on everyone's game list.`;
      return this.after_admin();
    }
    if (a === 'adstop') { await api('/api/admin/game/stop', { code: el.dataset.code }); return this.after_admin(); }
    if (a === 'adjoin') return this.app.quickPlay(el.dataset.gmode, (store.user && store.user.name) || 'Admin', el.dataset.code);
    if (a === 'adcode') {
      const r = await api('/api/admin/code', { code: v('#ad-ccode').value, coins: Number(v('#ad-ccoins').value), xp: Number(v('#ad-cxp').value), max: Number(v('#ad-cmax').value) });
      if (r.error) { v('#ad-codes').insertAdjacentHTML('afterbegin', `<p>${esc(r.error)}</p>`); return; }
      return this.after_admin();
    }
    if (a === 'delcode') { await api('/api/admin/code/delete', { code: el.dataset.code }); return this.after_admin(); }
    if (a === 'delmap') { if (confirm('Delete this map?')) { await api('/api/admin/map/delete', { id: el.dataset.id }); return this.after_admin(); } return; }
    if (a === 'newmap') { this.medit = newMapEdit(64, 64); return this.show('mapedit'); }
    if (a === 'editmap') {
      const r = await api('/api/admin/map/get', { id: el.dataset.id });
      if (r.map) { this.medit = mapEditFrom(r.map); this.show('mapedit'); }
    }
  }

  screen_mapedit() {
    const m = this.medit || (this.medit = newMapEdit(64, 64));
    const tools = MAP_TOOLS.map(([k, n, c]) => `<button class="tool ${k === m.tool ? 'on' : ''}" data-tool="${k}"><i style="background:${c}"></i>${n}</button>`).join('');
    return `${this.backBtn('admin')}<h2 class="title">Map builder</h2>
      <div class="panel">
        <div class="row" style="align-items:flex-end">
          <div class="field" style="flex:2;min-width:180px;margin:0"><label>Name</label><input id="me-name" maxlength="32" value="${esc(m.name)}"></div>
          <div class="field" style="width:90px;margin:0"><label>Width</label><input id="me-w" type="number" min="24" max="120" value="${m.w}"></div>
          <div class="field" style="width:90px;margin:0"><label>Height</label><input id="me-h" type="number" min="24" max="120" value="${m.h}"></div>
          <button class="btn small" data-act="meresize">Resize</button>
          <div class="field" style="width:120px;margin:0"><label>Brush</label><select id="me-brush">${[1, 2, 3, 5].map(b => `<option ${b === m.brush ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
          <div class="field" style="width:150px;margin:0"><label>Mirror</label><select id="me-mirror">${[['none', 'Off'], ['x', 'Left/right'], ['y', 'Top/bottom'], ['xy', 'Four ways']].map(([k, n]) => `<option value="${k}" ${k === m.mirror ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        </div>
        <div class="tools">${tools}</div>
        <div class="map-wrap"><canvas id="me-cv"></canvas></div>
        <div class="row" style="margin-top:10px"><button class="btn green" data-act="mesave">Save map</button><button class="btn" data-act="meclear">Clear</button><button class="btn" data-act="meborder">Random pillars</button><span class="muted" id="me-msg" style="font-size:13px"></span></div>
        <p class="muted" style="font-size:12px">Drag to paint. Spawns: blue and red are for team modes, white for free-for-all. Maps work in Arena, Team Arena, Battle, Team Battle, Boss Hunt, Workshop and Sandbox. The outer edge is always a wall.</p>
      </div>`;
  }

  after_mapedit() {
    const m = this.medit;
    const cv = this.root.querySelector('#me-cv');
    const wrap = cv.parentElement;
    const cell = Math.max(4, Math.floor(Math.min(wrap.clientWidth - 4, 1100) / m.w));
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.style.width = `${cell * m.w}px`; cv.style.height = `${cell * m.h}px`;
    cv.width = cell * m.w * dpr; cv.height = cell * m.h * dpr;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const paint = () => drawMapEdit(ctx, m, cell);
    paint();
    let down = false;
    const at = ev => { const r = cv.getBoundingClientRect(); return [Math.floor((ev.clientX - r.left) / r.width * m.w), Math.floor((ev.clientY - r.top) / r.height * m.h)]; };
    const apply = ev => { const [x, y] = at(ev); mapPaint(m, x, y); paint(); };
    cv.onpointerdown = ev => { down = true; cv.setPointerCapture(ev.pointerId); apply(ev); };
    cv.onpointermove = ev => { if (down && !m.tool.startsWith('sp')) apply(ev); };
    cv.onpointerup = cv.onpointercancel = () => { down = false; };
  }

  async mapAct(a) {
    const m = this.medit;
    const msg = this.root.querySelector('#me-msg');
    m.name = this.root.querySelector('#me-name').value;
    if (a === 'meresize') {
      const w = Math.max(24, Math.min(120, Number(this.root.querySelector('#me-w').value) | 0)), h = Math.max(24, Math.min(120, Number(this.root.querySelector('#me-h').value) | 0));
      const old = m;
      const n = newMapEdit(w, h);
      for (let y = 0; y < Math.min(h, old.h); y++) for (let x = 0; x < Math.min(w, old.w); x++) n.tiles[y * w + x] = old.tiles[y * old.w + x];
      n.spawns = old.spawns.filter(s => s.x < w - 1 && s.y < h - 1);
      Object.assign(n, { id: old.id, name: old.name, tool: old.tool, brush: old.brush, mirror: old.mirror });
      this.medit = n;
      return this.show('mapedit');
    }
    if (a === 'meclear') { m.tiles.fill(0); m.spawns = []; return this.show('mapedit'); }
    if (a === 'meborder') {
      for (let k = 0; k < Math.round(m.w * m.h / 260); k++) {
        const x = 3 + Math.floor(Math.random() * (m.w - 6)), y = 3 + Math.floor(Math.random() * (m.h - 6));
        const tool = m.tool; m.tool = Math.random() < 0.25 ? 'break' : 'wall';
        const b = m.brush; m.brush = 2; mapPaint(m, x, y); m.brush = b; m.tool = tool;
      }
      return this.show('mapedit');
    }
    if (a === 'mesave') {
      msg.textContent = 'Saving...';
      const r = await api('/api/admin/map', { id: m.id, name: m.name, w: m.w, h: m.h, tiles: [...m.tiles].map(t => t.toString(16)).join(''), spawns: m.spawns });
      if (r.error) { msg.textContent = r.error; return; }
      m.id = r.map.id;
      msg.textContent = `Saved "${r.map.name}". Pick it under Start a game.`;
    }
  }

  screen_builder(o) {
    if (!this.design) this.design = cleanDesign(store.designs[0] || STARTER_DESIGN);
    const d = this.design;
    const opt = (list, val) => list.map(k => `<option ${k === val ? 'selected' : ''}>${k}</option>`).join('');
    const sl = (i, f, label, min, max, step, val) => `<label class="sl"><span>${label} <b data-v="${i}:${f}">${val}</b></span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-bp="${i}:${f}"></label>`;
    const parts = d.parts.map((p, i) => `
      <div class="part">
        <div class="row" style="justify-content:space-between"><b>Barrel ${i + 1}</b><div class="row" style="gap:6px"><select data-bp="${i}:k">${opt(PART_KINDS, p.k)}</select><button class="btn small" data-act="bdup" data-i="${i}">Copy</button><button class="btn small danger" data-act="bdel" data-i="${i}">Delete</button></div></div>
        <div class="sl-grid">
          ${sl(i, 'L', 'Length', 3, 40, 0.5, p.L)}${sl(i, 'W', 'Width', 3, 24, 0.5, p.W)}${sl(i, 'asp', 'Flare', -2, 2.5, 0.1, p.asp)}
          ${sl(i, 'A', 'Angle', -180, 180, 1, p.A)}${sl(i, 'Y', 'Side offset', -20, 20, 0.5, p.Y)}${sl(i, 'X', 'Forward offset', -10, 24, 0.5, p.X)}
          ${p.k === 'deco' ? '' : `${sl(i, 'r', 'Reload time', 0.3, 5, 0.05, p.r)}${sl(i, 'dm', 'Damage', 0.2, 4, 0.05, p.dm)}${sl(i, 'sp', 'Speed', 0.4, 2.5, 0.05, p.sp)}${sl(i, 'D', 'Delay', 0, 0.99, 0.01, p.D)}`}
          ${sl(i, 'n', 'Copies around', 1, 8, 1, p.n)}
          <label class="chk"><input type="checkbox" data-bp="${i}:m" ${p.m ? 'checked' : ''}> Mirror</label>
        </div>
      </div>`).join('');
    return `${this.backBtn(o.back || 'main')}<h2 class="title">Tank Builder</h2>
      <div class="builder">
        <div class="panel" style="align-self:start;position:sticky;top:0">
          <canvas id="b-prev" style="width:100%;height:240px;border-radius:14px;background:#e9ebef"></canvas>
          <div class="field" style="margin-top:10px"><label>Name</label><input data-bd="name" maxlength="20" value="${esc(d.name)}"></div>
          <div class="row"><div class="field" style="flex:1"><label>Body</label><select data-bd="body">${opt(BODIES, d.body)}</select></div>
          <label class="sl" style="flex:1"><span>Spin <b data-v="spin">${d.spin}</b></span><input type="range" min="0" max="3" step="0.1" value="${d.spin}" data-bd="spin"></label></div>
          <div id="b-stats" class="muted" style="font-size:13px;margin-bottom:10px"></div>
          ${o.ingame ? '<button class="btn primary block" data-act="bspawn">Spawn as this tank</button>' : '<button class="btn primary block" data-act="btest">Test in Workshop (offline)</button>'}
          <div class="row" style="margin-top:8px"><button class="btn green" data-act="bsave" style="flex:1">Save design</button><button class="btn" data-act="bnew" style="flex:1">New</button></div>
          ${store.designs.length ? `<h3>Saved designs</h3>${store.designs.map((x, i) => `<div class="up-row"><span>${esc(x.name)}</span><div class="row" style="gap:6px"><button class="btn small blue" data-act="bload" data-i="${i}">Load</button><button class="btn small danger" data-act="bdrop" data-i="${i}">Delete</button></div></div>`).join('')}` : ''}
          <p class="muted" style="font-size:12px">Custom tanks are playable in Workshop and Sandbox games, at level 60. Very strong designs are toned down automatically: up to 24 barrels and 16 drones.</p>
        </div>
        <div>
          <div class="row" style="margin-bottom:10px">${['bullet', 'drone', 'trap', 'swarm', 'beam', 'shell', 'deco'].map(k => `<button class="btn small" data-act="badd" data-k="${k}">+ ${k === 'shell' ? 'missile' : k}</button>`).join('')}</div>
          ${parts || '<p class="muted">No barrels yet. Add one above.</p>'}
        </div>
      </div>`;
  }

  after_builder() {
    const cv = this.root.querySelector('#b-prev');
    const t0 = performance.now();
    this.builderDef = previewCustomTank(this.design);
    this.builderStats();
    const loop = ts => {
      if (!cv.isConnected) return;
      previewTank(cv, this.builderDef, '#00b2e1', (ts - t0) / 1000);
      this.anim = requestAnimationFrame(loop);
    };
    this.anim = requestAnimationFrame(loop);
  }

  builderStats() {
    const el = this.root.querySelector('#b-stats');
    if (!el) return;
    const def = this.builderDef;
    const live = def.guns.filter(g => !g.deco).length;
    el.innerHTML = `${def.guns.length} barrels (${live} firing) &middot; about ${Math.min(90, def.profile.dps)} damage per second &middot; speed ${def.profile.mobility}%${def.profile.dps > 90 ? ' &middot; <b style="color:var(--orange-d)">damage will be capped</b>' : ''}`;
  }

  builderInput(t) {
    const d = this.design;
    if (t.dataset.bd) {
      const k = t.dataset.bd;
      d[k] = k === 'spin' ? Number(t.value) : t.value;
      const lbl = this.root.querySelector(`[data-v="${k}"]`);
      if (lbl) lbl.textContent = t.value;
    } else {
      const [i, f] = t.dataset.bp.split(':');
      const p = d.parts[Number(i)];
      if (!p) return;
      if (f === 'k') { p.k = t.value; this.design = cleanDesign(d); return this.show('builder', this.opts); }
      p[f] = f === 'm' ? t.checked : Number(t.value);
      const lbl = this.root.querySelector(`[data-v="${i}:${f}"]`);
      if (lbl) lbl.textContent = t.value;
    }
    this.builderDef = previewCustomTank(this.design);
    this.builderStats();
  }

  builderAct(a, el) {
    const d = this.design;
    const i = Number(el.dataset.i);
    switch (a) {
      case 'badd': {
        if (d.parts.length >= 16) break;
        const k = el.dataset.k, side = k === 'drone' || k === 'swarm';
        d.parts.push({ k, L: k === 'trap' ? 14 : k === 'drone' ? 6 : 18, W: k === 'drone' ? 11 : 8, asp: k === 'drone' ? 1.2 : k === 'trap' ? 1.6 : 1, X: k === 'drone' ? 8 : 0, Y: 0, A: side ? 90 : k === 'trap' ? 180 : 0, D: 0, r: 1, dm: 1, sp: 1, n: 1, m: side });
        break;
      }
      case 'bdup': if (d.parts.length < 16) d.parts.splice(i + 1, 0, { ...d.parts[i] }); break;
      case 'bdel': d.parts.splice(i, 1); break;
      case 'bnew': this.design = cleanDesign(STARTER_DESIGN); break;
      case 'bload': this.design = cleanDesign(store.designs[i]); break;
      case 'bdrop': store.designs.splice(i, 1); save(); break;
      case 'bsave': {
        const clean = cleanDesign(d);
        const at = store.designs.findIndex(x => x.name === clean.name);
        if (at >= 0) store.designs[at] = clean; else store.designs.unshift(clean);
        store.designs = store.designs.slice(0, 20);
        save();
        break;
      }
      case 'bspawn': return this.app.spawnCustom(cleanDesign(d));
      case 'btest': {
        store.pendingDesign = cleanDesign(d);
        return this.app.offline('workshop', { bots: 2, botDifficulty: 'easy' }, (store.user && store.session && store.user.name) || (store.settings.name || 'Builder'));
      }
    }
    this.show('builder', this.opts);
  }

  onInput(e) {
    const t = e.target;
    if (t.id === 'm-name') { setSetting('name', t.value.slice(0, 16)); return; }
    if (t.dataset.bd || t.dataset.bp) { if (e.type === 'input' || t.tagName === 'SELECT' || t.type === 'checkbox') this.builderInput(t); return; }
    if (t.id === 'me-brush' && this.medit) { this.medit.brush = Number(t.value); return; }
    if (t.id === 'me-mirror' && this.medit) { this.medit.mirror = t.value; return; }
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
      if (e.type === 'change' && (t.type === 'range') && this.current === 'settings') this.show('settings', this.opts);
      this.app.onSettingsChanged(k);
    }
  }

  onClick(e) {
    const go = e.target.closest('[data-go]');
    if (go && go.dataset.go === 'game') { e.preventDefault(); return this.app.closeOverlay(); }
    if (go) { e.preventDefault(); return this.show(go.dataset.go, go.dataset.go === 'settings' || go.dataset.go === 'help' ? { back: this.current === 'error' ? 'main' : (this.opts && this.opts.back) || 'main' } : {}); }
    const tr = e.target.closest('[data-tree]');
    if (tr) { this.treeRoot = tr.dataset.tree; return this.show(this.current, this.opts); }
    const mf = e.target.closest('[data-mf]');
    if (mf) { this.modeFilter = mf.dataset.mf; return this.show('main'); }
    const gm = e.target.closest('[data-game]');
    if (gm) {
      this.selCode = gm.dataset.game;
      const g = this.selectedGame();
      if (g) { this.mode = g.mode; setSetting('lastMode', g.mode); }
      return this.show('main');
    }
    const st = e.target.closest('[data-shoptab]');
    if (st) { this.shopTab = st.dataset.shoptab; return this.show('shop'); }
    const tl = e.target.closest('[data-tool]');
    if (tl && this.medit) { this.medit.tool = tl.dataset.tool; this.root.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b === tl)); return; }
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
    if (a === 'quick') {
      const g = this.selectedGame();
      const nm = store.session && store.user ? store.user.name : name();
      if (g) this.app.quickPlay(g.mode, nm, g.code);
      else this.app.quickPlay('battle', nm, 'pub-battle-1');
    }
    else if (a === 'login' || a === 'signup') this.authAct(a);
    else if (a === 'logout') { api('/api/logout', {}); store.session = ''; store.user = null; save(); this.show('account'); }
    else if (a === 'buy' || a === 'equip') this.shopAct(a, act.dataset.item);
    else if (a === 'redeem') this.redeemAct();
    else if (a.startsWith('ad') || a === 'newmap' || a === 'editmap' || a === 'delmap' || a === 'delcode') this.adminAct(a, act);
    else if (a.startsWith('me')) this.mapAct(a);
    else if (a.startsWith('b') && this.current === 'builder') this.builderAct(a, act);
    else if (a === 'opts') { this.optOpen = !this.optOpen; this.show('main'); }
    else if (a === 'treeof') { const d = TANKS[Number(act.dataset.i)]; this.treeRoot = d.family === 'basic' ? 'basic' : d.family; this.show('progression'); }
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

const MAP_TOOLS = [['wall', 'Wall', '#a5a5ad'], ['break', 'Breakable', '#b8a690'], ['crystal', 'Crystal', '#82cdeb'], ['vine', 'Vines', '#7fb070'], ['blue', 'Blue base', '#9fd0ef'], ['red', 'Red base', '#f3a9ad'], ['floor', 'Eraser', '#dcdcdc'], ['spffa', 'Spawn', '#ffffff'], ['sp0', 'Blue spawn', '#00b2e1'], ['sp1', 'Red spawn', '#f14e54'], ['spdel', 'Remove spawn', '#3d4452']];
const TOOL_TILE = { wall: TILES.WALL, break: TILES.BREAK, crystal: TILES.CRYSTAL, vine: TILES.VINE, blue: TILES.BASE_BLUE, red: TILES.BASE_RED, floor: TILES.FLOOR };
const TILE_COLORS = { [TILES.FLOOR]: '#dcdcdc', [TILES.WALL]: '#a5a5ad', [TILES.BREAK]: '#b8a690', [TILES.CRYSTAL]: '#82cdeb', [TILES.VINE]: '#7fb070', [TILES.BASE_BLUE]: '#c3e2f3', [TILES.BASE_RED]: '#f6cfd1' };

function newMapEdit(w, h) {
  return { id: null, name: 'New map', w, h, tiles: new Uint8Array(w * h), spawns: [], tool: 'wall', brush: 1, mirror: 'none' };
}

function mapEditFrom(map) {
  const m = newMapEdit(map.w, map.h);
  m.id = map.id; m.name = map.name;
  for (let i = 0; i < map.w * map.h; i++) m.tiles[i] = parseInt(map.tiles[i], 16) || 0;
  m.spawns = map.spawns || [];
  return m;
}

function mapPaint(m, x, y) {
  const pts = [[x, y, 0]];
  if (m.mirror === 'x' || m.mirror === 'xy') pts.push([m.w - 1 - x, y, 1]);
  if (m.mirror === 'y' || m.mirror === 'xy') pts.push([x, m.h - 1 - y, 0]);
  if (m.mirror === 'xy') pts.push([m.w - 1 - x, m.h - 1 - y, 1]);
  for (const [px, py, flip] of pts) {
    if (m.tool.startsWith('sp')) {
      if (px < 1 || py < 1 || px >= m.w - 1 || py >= m.h - 1) continue;
      m.spawns = m.spawns.filter(s => Math.abs(s.x - px) > 1 || Math.abs(s.y - py) > 1);
      const team = m.tool === 'sp0' ? 0 : m.tool === 'sp1' ? 1 : undefined;
      if (m.tool !== 'spdel' && m.spawns.length < 64) m.spawns.push({ x: px, y: py, team: team === undefined ? undefined : flip ? 1 - team : team });
      continue;
    }
    const t = TOOL_TILE[m.tool];
    const b = m.brush, o = Math.floor((b - 1) / 2);
    for (let yy = py - o; yy < py - o + b; yy++) for (let xx = px - o; xx < px - o + b; xx++) {
      if (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h) continue;
      m.tiles[yy * m.w + xx] = t;
    }
  }
}

function drawMapEdit(ctx, m, cell) {
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const edge = x === 0 || y === 0 || x === m.w - 1 || y === m.h - 1;
    ctx.fillStyle = edge ? '#8b8f99' : TILE_COLORS[m.tiles[y * m.w + x]] || '#dcdcdc';
    ctx.fillRect(x * cell, y * cell, cell, cell);
  }
  if (cell >= 7) {
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= m.w; x++) { ctx.moveTo(x * cell + 0.5, 0); ctx.lineTo(x * cell + 0.5, m.h * cell); }
    for (let y = 0; y <= m.h; y++) { ctx.moveTo(0, y * cell + 0.5); ctx.lineTo(m.w * cell, y * cell + 0.5); }
    ctx.stroke();
  }
  for (const s of m.spawns) {
    ctx.beginPath(); ctx.arc((s.x + 0.5) * cell, (s.y + 0.5) * cell, Math.max(3, cell * 0.8), 0, Math.PI * 2);
    ctx.fillStyle = s.team === 0 ? '#00b2e1' : s.team === 1 ? '#f14e54' : '#ffffff'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#1d2433'; ctx.stroke();
  }
}

function hslToHex(h) {
  const f = n => { const k = (n + h / 30) % 12; const c = 0.58 - 0.42 * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function drawShopPreview(cv, slot, idx, time) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = cv.clientWidth || 120, h = cv.clientHeight || 90;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  if (slot === 'trail') {
    const cols = [null, ['#ff6a2b', '#ffd23f'], ['#38f2ff', '#38f2ff'], ['#bfe9ff', '#ffffff'], ['#8b919c', '#b4b8c0'], ['#ffd23f', '#fff3b0'], null];
    const ph = (time * 0.6) % 1;
    const hx = 10 + ph * (w - 20), hy = h / 2 + Math.sin(ph * 6.28) * h * 0.2;
    c.lineCap = 'round';
    for (let i = 1; i < 14; i++) {
      const q = Math.max(0, ph - i * 0.02);
      const x = 10 + q * (w - 20), y = h / 2 + Math.sin(q * 6.28) * h * 0.2;
      const q2 = Math.max(0, ph - (i - 1) * 0.02);
      const x2 = 10 + q2 * (w - 20), y2 = h / 2 + Math.sin(q2 * 6.28) * h * 0.2;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2);
      c.strokeStyle = idx === 0 ? '#00b2e1' : idx === 6 ? `hsl(${(time * 240 + i * 28) % 360},90%,60%)` : (i < 6 ? cols[idx][1] : cols[idx][0]);
      c.globalAlpha = (1 - i / 14) * (idx === 0 ? 0.35 : 0.85); c.lineWidth = 9 * (1 - i / 18); c.stroke();
    }
    c.globalAlpha = 1;
    c.beginPath(); c.arc(hx, hy, 6, 0, Math.PI * 2); c.fillStyle = '#00b2e1'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#0088ad'; c.stroke();
    return;
  }
  const cx = w / 2, cy = h / 2, t = time % 1.6;
  const k = Math.min(1, t / 1.0);
  c.lineWidth = 3;
  switch (idx) {
    case 0: for (let i = 0; i < 10; i++) { const a = i * 0.63; c.fillStyle = '#00b2e1'; c.globalAlpha = 1 - k; c.fillRect(cx + Math.cos(a) * k * 36 - 3, cy + Math.sin(a) * k * 36 - 3, 6, 6); } break;
    case 1: for (let i = 0; i < 18; i++) { const a = i * 0.35; c.fillStyle = ['#ff4f6a', '#ffd23f', '#00c864', '#00b2e1', '#b57cf0'][i % 5]; c.globalAlpha = 1 - k * 0.8; c.fillRect(cx + Math.cos(a) * k * 40, cy + Math.sin(a) * k * 30 + k * k * 20, 6, 3); } break;
    case 2: for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(cx, cy, Math.max(1, (k * 40) - i * 9), 0, Math.PI * 2); c.strokeStyle = i === 1 ? '#3d4452' : '#00b2e1'; c.globalAlpha = 1 - k; c.stroke(); } break;
    case 3: c.strokeStyle = '#38c4ff'; c.globalAlpha = 1 - k; c.beginPath(); c.moveTo(cx + 8, 0); for (let i = 1; i < 6; i++) c.lineTo(cx + (Math.random() - 0.5) * 16, i * h / 6); c.lineTo(cx, cy + 10); c.stroke(); break;
    case 4: c.globalAlpha = Math.min(1, (1.6 - t) * 2); c.fillStyle = '#f4f6fa'; c.strokeStyle = '#1d2433'; c.beginPath(); c.arc(cx, cy - 4 - k * 8, 16, Math.PI, 0); c.lineTo(cx + 11, cy + 10 - k * 8); c.lineTo(cx - 11, cy + 10 - k * 8); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#1d2433'; c.beginPath(); c.arc(cx - 6, cy - 4 - k * 8, 3.5, 0, 7); c.arc(cx + 6, cy - 4 - k * 8, 3.5, 0, 7); c.fill(); break;
    case 5: for (let j = 0; j < 3; j++) { const kk = Math.max(0, Math.min(1, (t - j * 0.25) / 0.8)); const ox = cx + (j - 1) * 28, oy = cy - 8 + (j % 2) * 14; for (let i = 0; i < 10; i++) { const a = i * 0.63; c.fillStyle = ['#ff4f6a', '#ffd23f', '#38f2ff'][j]; c.globalAlpha = kk > 0 ? 1 - kk : 0; c.beginPath(); c.arc(ox + Math.cos(a) * kk * 18, oy + Math.sin(a) * kk * 18, 2, 0, 7); c.fill(); } } break;
    case 6: { const g = c.createRadialGradient(cx, cy, 0, cx, cy, 30); g.addColorStop(0, '#0a0814'); g.addColorStop(0.6, 'rgba(70,40,120,0.6)'); g.addColorStop(1, 'rgba(70,40,120,0)'); c.fillStyle = g; c.globalAlpha = 1 - k * 0.5; c.beginPath(); c.arc(cx, cy, 30, 0, 7); c.fill(); c.strokeStyle = '#b57cf0'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(cx, cy, 10 + i * 7, time * 4 + i * 2, time * 4 + i * 2 + 2); c.stroke(); } break; }
  }
  c.globalAlpha = 1;
}
