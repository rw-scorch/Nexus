import { MODES, THEMES, STAT_NAMES, MAX_LEVEL } from '../shared/constants.js';
import { TANKS, TANK_FAMILIES, ABILITIES, TANKS_BY_ID, validateRegistry } from '../shared/tank-registry.js';
import { FLAG_INFO, PROJECTILE_KINDS } from '../shared/projectile-types.js';
import { BOSSES } from '../shared/boss-registry.js';
import { ACHIEVEMENTS, MAP_THEMES } from '../shared/entity-types.js';
import { previewTank, drawBoss } from './draw.js';
import { drawTree, hitTest, scrollToNode, TIER_COLORS } from './tree.js';
import { store, setSetting, save } from './storage.js';
import { serverBase, checkHealth, roomCounts } from './net.js';
import { setVolume } from './audio.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let VALID = null;
const validation = () => VALID || (VALID = validateRegistry());
const ROLES = [...new Set(TANKS.map(t => t.role))].sort();
const TIER_IX = { 1: 0, 15: 1, 30: 2, 45: 3, 60: 4 };
const tileColor = d => d.src === 'nexus' ? TIER_COLORS[5] : TIER_COLORS[TIER_IX[d.level] ?? 4];
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
  'Nexus originals use energy beams: they hit instantly and some bounce off walls.'
];
const CHANGES = [
  'Tanks now follow the real arras.io class tree: 131 classic tanks, every one with its own barrel layout.',
  '105 Arms Race tanks added on top, unlocked at level 60.',
  '29 Nexus originals built on energy beams, chain lightning and gravity.',
  'New Battle and Team Battle modes: no leveling, pick any tank and fight.',
  'New light look for every menu and the in-game interface.',
  'Level cap raised to 60.'
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

  modeRows() {
    const f = this.modeFilter;
    return Object.entries(MODES).filter(([k, m]) => f === 'all' || (f === 'team' ? m.teams : f === 'battle' ? m.battle : !m.teams)).map(([k, m]) => {
      const [c, tag] = MODE_STYLE[k] || ['#8b93a3', ''];
      const n = this.counts[`pub-${k}-1`];
      const cnt = n === undefined ? '' : `${n} playing`;
      return `<button class="srv ${k === this.mode ? 'on' : ''}" style="--c:${c}" data-mode="${k}"><i></i><span><b>${esc(m.name)}<span class="tag">${tag}</span></b><small>${esc(m.desc)}</small></span><span class="cnt">${cnt || '&nbsp;'}</span></button>`;
    }).join('');
  }

  screen_main() {
    const bt = this.battleTank();
    const isBattle = MODES[this.mode] && MODES[this.mode].battle;
    const explore = `
      <button class="btn blue" data-go="progression">Class Tree</button>
      <button class="btn purple" data-go="collection">All Tanks</button>
      <button class="btn orange" data-go="bosses">Bestiary</button>
      <button class="btn yellow" data-go="achievements">Achievements</button>
      <button class="btn" data-go="stats">Statistics</button>
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
          <div class="brand"><canvas id="m-logo"></canvas><div><h1>NEXUS</h1><small>Infinite Warfare</small></div></div>
          <div class="seg">${MODE_FILTERS.map(([k, n]) => `<button class="${k === this.modeFilter ? 'on' : ''}" data-mf="${k}">${n}</button>`).join('')}</div>
          <div class="server-list" id="m-list">${this.modeRows()}</div>
          ${isBattle ? `<div class="row" style="margin-top:10px;gap:10px;background:#fff7ef;border:2px solid #f6c48d;border-radius:14px;padding:8px 10px">
            <canvas id="m-bt" style="width:48px;height:48px"></canvas>
            <div style="flex:1"><b>${bt ? esc(bt.name) : 'Random tank'}</b><div class="muted" style="font-size:12px">${bt ? `${esc(bt.role)} &middot; level ${bt.level} class` : 'Pick the tank you spawn with'}</div></div>
            <button class="btn small orange" data-go="picktank">Choose</button></div>` : ''}
          <input id="m-name" class="name-input" maxlength="16" placeholder="Enter your name" value="${esc(store.settings.name)}" autocomplete="off" spellcheck="false">
          <button class="btn primary play-btn" data-act="quick">Play</button>
          <div class="menu-actions">
            <button class="btn blue" data-go="create">Create room</button>
            <button class="btn purple" data-go="join">Join code</button>
            <button class="btn orange" data-act="offline">Offline</button>
          </div>
          <div class="menu-foot"><span><span class="status-dot" id="m-dot"></span> <span id="m-status">Checking server...</span></span><span>${TANKS.length} tanks</span></div>
          <button class="opt-toggle ${this.optOpen ? 'open' : ''}" data-act="opts">view options <span>&#9662;</span></button>
          ${this.optOpen ? `<div class="opt-pane">
            <label class="chk"><input type="checkbox" data-set="autoFire" ${store.settings.autoFire ? 'checked' : ''}> Start with auto-fire on</label>
            <label class="chk"><input type="checkbox" data-set="showNet" ${store.settings.showNet ? 'checked' : ''}> Show ping and frame rate</label>
            <label class="chk"><input type="checkbox" data-set="reducedEffects" ${store.settings.reducedEffects ? 'checked' : ''}> Reduced effects</label>
            <div class="row" style="margin-top:6px"><div class="field" style="flex:1;margin:0"><label>Quality</label><select data-set="quality">${['high', 'medium', 'low'].map(q => `<option ${store.settings.quality === q ? 'selected' : ''}>${q}</option>`).join('')}</select></div>
            <div class="field" style="flex:1;margin:0"><label>Touch</label><select data-set="touch">${[['auto', 'Automatic'], ['on', 'Always on'], ['off', 'Off']].map(([v, t]) => `<option value="${v}" ${store.settings.touch === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
            <div class="row" style="margin-top:10px"><button class="btn small" data-go="settings">All settings</button><button class="btn small" data-go="credits">Credits</button></div>
          </div>` : ''}
        </div>
        <div class="menu-side">
          <div class="side-card"><h3>What's new</h3><ul class="changes">${CHANGES.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>
          <div class="side-card"><h3>Tip</h3><div class="tip" id="m-tip">${esc(TIPS[Math.floor(Math.random() * TIPS.length)])}</div></div>
        </div>
      </div>
      <div class="menu-side mobile hidden-desktop" style="max-width:520px;margin:14px auto 0"><div class="side-card"><div class="links">${explore}</div></div></div>`;
  }

  after_main() {
    const base = serverBase();
    const dot = this.root.querySelector('#m-dot'), st = this.root.querySelector('#m-status');
    checkHealth(base).then(h => {
      if (!dot || !dot.isConnected) return;
      if (h.ok) { dot.className = 'status-dot ok'; st.textContent = `Online (${h.platform || 'server'})`; }
      else { dot.className = 'status-dot bad'; st.innerHTML = `${esc(h.reason)}. <a href="#" data-go="settings">Server address</a>`; }
    });
    roomCounts(base, Object.keys(MODES).map(k => `pub-${k}-1`)).then(c => {
      this.counts = c || {};
      const list = this.root.querySelector('#m-list');
      if (list && list.isConnected) list.innerHTML = this.modeRows();
    });
    const logo = this.root.querySelector('#m-logo');
    const bt = this.root.querySelector('#m-bt');
    const cv = this.root.querySelector('#m-show'), txt = this.root.querySelector('#m-showtxt');
    const pool = TANKS.filter(t => t.level >= 30);
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
    return TANKS.filter(d =>
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

  treeScreen(title, note, back) {
    const root = this.treeRoot;
    const chips = [['basic', 'Everything'], ...TANK_FAMILIES.map(f => [f.key, f.name])].map(([k, n]) => `<button class="chip ${k === root ? 'on' : ''}" data-tree="${k}">${esc(n)}</button>`).join('');
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
    return this.treeScreen('Choose your Battle tank', `Battle modes skip leveling: you spawn at level ${MAX_LEVEL} as the tank you pick here, and you can switch from the Tanks button in game. Current choice: <b>${bt ? esc(bt.name) : 'random'}</b>.`, 'main');
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
    const md = e.target.closest('[data-mode]');
    if (md) {
      const keepName = this.root.querySelector('#m-name');
      if (keepName) setSetting('name', keepName.value.slice(0, 16));
      this.mode = md.dataset.mode; setSetting('lastMode', this.mode); return this.show('main');
    }
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
