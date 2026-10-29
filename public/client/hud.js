import { STAT_NAMES, STAT_MAX, MODES, TEAM_COLORS } from '../shared/constants.js';
import { TANKS, tankByIndex, ABILITIES, doctrineVariant } from '../shared/tank-registry.js';
import { DOCTRINES } from '../shared/projectile-types.js';
import { BOSSES } from '../shared/boss-registry.js';
import { UPGRADES } from '../shared/entity-types.js';
import { previewTank } from './draw.js';
import { EVO_KEYS } from './input.js';
import { store } from './storage.js';

const STAT_COLORS = ['#ff9a6b', '#ff6bb5', '#c46bff', '#6b8dff', '#ffd84d', '#ff4d61', '#47d97c', '#38e0ff'];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Hud {
  constructor(root, touchRoot, actions) {
    this.root = root;
    this.touchRoot = touchRoot;
    this.actions = actions;
    this.names = new Map();
    this.players = [];
    this.feed = [];
    this.drawer = null;
    this.cache = {};
    this.mode = 'ffa';
    this.fps = 60;
    this.build();
  }

  build() {
    this.root.innerHTML = `
      <div class="hud-tl">
        <div class="hbox" id="h-lb"></div>
        <div class="hbox p hidden" id="h-evo"></div>
        <div class="hbox p hidden" id="h-doc"></div>
      </div>
      <div class="hud-tc">
        <div id="h-offline" class="offline-banner hidden">Offline practice. Bots only, nothing here is online.</div>
        <div id="h-nexus" class="nexusbars hidden"></div>
        <div id="h-bosses" style="display:grid;gap:6px;width:100%"></div>
        <div id="h-events" class="row" style="justify-content:center"></div>
        <div id="h-obj" class="objective"></div>
      </div>
      <div class="hud-tr">
        <canvas id="minimap"></canvas>
        <div class="net" id="h-net"></div>
        <div class="hud-btns p">
          <button class="btn" data-a="players">Players</button>
          <button class="btn hidden" data-a="team" id="h-teambtn">Team</button>
          <button class="btn hidden" data-a="sandbox" id="h-sbbtn">Sandbox</button>
          <button class="btn" data-a="pause">Menu</button>
        </div>
        <div class="feed" id="h-feed"></div>
      </div>
      <div class="hud-bl p" id="h-stats"></div>
      <div class="hud-bc">
        <div class="tankname" id="h-name"></div>
        <div class="statline" id="h-line"></div>
        <div class="hpbar"><i id="h-hp"></i></div>
        <div class="xpbar"><i id="h-xp"></i><span id="h-xpt"></span></div>
      </div>
      <div id="h-overlay"></div>`;
    this.touchRoot.innerHTML = `
      <div class="stick hidden" id="t-move"><i></i></div>
      <div class="stick hidden" id="t-aim"><i></i></div>
      <button class="tbtn ability" id="t-ab">ABILITY</button>
      <button class="tbtn auto" id="t-auto">AUTO<br>FIRE</button>
      <div class="rotate">Rotate to landscape for the full view</div>`;
    this.el = id => this.root.querySelector('#' + id) || this.touchRoot.querySelector('#' + id);
    this.mm = this.el('minimap');
    this.root.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'players' || a === 'team' || a === 'sandbox' || a === 'pause' || a === 'doctrine') this.toggle(a);
      else this.actions.onAction(a, b.dataset);
    });
    const ab = this.el('t-ab');
    ab.addEventListener('touchstart', e => { e.preventDefault(); this.actions.onAbility(true); }, { passive: false });
    ab.addEventListener('touchend', e => { e.preventDefault(); this.actions.onAbility(false); }, { passive: false });
    const af = this.el('t-auto');
    af.addEventListener('touchstart', e => { e.preventDefault(); this.actions.onAutoFire(); }, { passive: false });
    af.addEventListener('click', () => this.actions.onAutoFire());
    this.applyLayout();
  }

  applyLayout() {
    document.documentElement.style.setProperty('--hud-scale', store.settings.hudScale);
    this.root.classList.toggle('hud-swap', !!store.settings.hudSwap);
  }

  setMode(mode, offline, settings) {
    this.mode = mode;
    this.offline = offline;
    this.settings = settings;
    this.el('h-offline').classList.toggle('hidden', !offline);
    this.el('h-teambtn').classList.toggle('hidden', mode !== 'nexus');
    this.el('h-sbbtn').classList.toggle('hidden', mode !== 'sandbox');
    this.el('h-nexus').classList.toggle('hidden', mode !== 'nexus');
    this.feed = [];
    this.drawer = null;
    this.cache = {};
    this.el('h-overlay').innerHTML = '';
    this.names.clear();
  }

  setTouch(on) { this.touchRoot.classList.toggle('hidden', !on); }

  sticks(move, aim) {
    const m = this.el('t-move'), a = this.el('t-aim');
    const place = (el, s) => {
      if (!s) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      el.style.left = s.ox + 'px'; el.style.top = s.oy + 'px';
      const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy), k = d > 50 ? 50 / d : 1;
      el.firstElementChild.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    };
    place(m, move); place(a, aim);
  }

  autoFire(on) {
    this.el('t-auto').classList.toggle('on', on);
    this.toast(on ? 'Auto-fire on' : 'Auto-fire off', 'info', 1200);
  }

  toggle(name) {
    this.drawer = this.drawer === name ? null : name;
    this.renderDrawer();
  }

  closeDrawer() { this.drawer = null; this.renderDrawer(); }

  toast(text, tone = 'info', ms = 3200) {
    const box = document.getElementById('toasts');
    const d = document.createElement('div');
    d.className = `toast ${tone}`;
    d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 5) box.firstChild.remove();
    setTimeout(() => d.remove(), ms);
  }

  addFeed(html) {
    this.feed.unshift({ html, t: performance.now() });
    this.feed = this.feed.slice(0, 6);
    this.renderFeed();
  }

  renderFeed() {
    const now = performance.now();
    this.feed = this.feed.filter(f => now - f.t < 9000);
    this.el('h-feed').innerHTML = this.feed.map(f => `<div>${f.html}</div>`).join('');
  }

  teamName(t) { return t === 0 ? 'Blue' : 'Red'; }

  update(s, ctx) {
    this.last = s;
    if (s.pl) {
      this.players = s.pl;
      this.names.clear();
      for (const p of s.pl) if (p[7]) this.names.set(p[7], p[1]);
      this.renderLeaderboard();
      if (this.drawer === 'players') this.renderDrawer();
    }
    const y = s.y || {};
    const me = s.me || {};
    this.you = y; this.meStats = me; this.mi = s.mi || {};
    if (!y.dead) {
      const def = tankByIndex(y.def);
      this.def = def;
      this.set('h-name', `${esc(def.name)} <span class="muted" style="font-size:0.7em">Lv ${y.lv}</span>`);
      const ab = ABILITIES[y.ab];
      const abTxt = y.ab && y.ab !== 'none' ? (y.abcd > 0 ? `${ab.name} ${y.abcd.toFixed(1)}s` : `${ab.name} ready [Space]`) : '';
      const buffs = ['Overcharged', 'Boosted', 'Rallied', 'Overdrive', 'Chilled', 'Cloaked'].filter((_, i) => y.buffs && y.buffs[i]);
      this.set('h-line', `Score ${me.sc} &middot; K ${me.k} / D ${me.d} / A ${me.as} &middot; Cores ${me.co}${y.sh ? ` &middot; Shield ${y.sh}s` : ''}${abTxt ? ` &middot; ${esc(abTxt)}` : ''}${buffs.length ? ` &middot; ${buffs.join(', ')}` : ''}`);
      this.el('h-hp').style.width = `${Math.max(0, Math.min(100, y.hp / y.mhp * 100))}%`;
      this.el('h-hp').style.background = y.hp / y.mhp < 0.3 ? '#ff4d61' : '#47d97c';
      const xpFrac = y.xb > y.xa ? (y.xp - y.xa) / (y.xb - y.xa) : 1;
      this.el('h-xp').style.width = `${Math.max(0, Math.min(100, xpFrac * 100))}%`;
      this.el('h-xpt').textContent = y.lv >= 45 ? `Level 45  ${y.xp}` : `Level ${y.lv}  ${y.xp} / ${y.xb}`;
      this.renderStats(y);
      this.renderEvo(y, me);
      const tab = this.el('t-ab');
      if (y.ab && y.ab !== 'none') {
        tab.classList.remove('hidden');
        tab.classList.toggle('cd', y.abcd > 0);
        tab.innerHTML = y.abcd > 0 ? `${esc(ABILITIES[y.ab].name)}<br>${Math.ceil(y.abcd)}s` : esc(ABILITIES[y.ab].name).replace(' ', '<br>');
      } else tab.classList.add('hidden');
    }
    this.renderDeath(y, me);
    this.renderTop(s);
    if (s.mo) this.renderMatchEnd(s.mo);
    else if (this.cache.mo) { this.cache.mo = null; this.el('h-overlay').innerHTML = ''; }
    if (this.drawer === 'team' || this.drawer === 'doctrine') this.renderDrawer();
    this.set('h-net', ctx.offline ? `Offline &middot; ${this.fps | 0} fps` : (store.settings.showNet ? `Ping ${ctx.rtt | 0} ms &middot; ${this.fps | 0} fps${ctx.rtt > 250 ? ' &middot; poor connection' : ''}` : ''));
    if (performance.now() - (this.feedAt || 0) > 1000) { this.feedAt = performance.now(); this.renderFeed(); }
  }

  set(id, html) {
    if (this.cache[id] === html) return;
    this.cache[id] = html;
    this.el(id).innerHTML = html;
  }

  renderLeaderboard() {
    const myTeam = this.meStats ? this.meStats.team : -1;
    const myTank = this.you ? this.you.id : 0;
    const rows = [...this.players].sort((a, b) => b[4] - a[4]).slice(0, 10).map((p, i) => {
      const color = MODES[this.mode] && MODES[this.mode].teams ? TEAM_COLORS[p[2]] : (p[7] && p[7] === myTank ? '#38a3ff' : '#c7d0dd');
      return `<div class="lb-row ${p[7] && p[7] === myTank ? 'me' : ''}"><span class="muted">${i + 1}</span><span style="color:${color};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p[1])}</span><span>${p[4] >= 1000 ? (p[4] / 1000).toFixed(1) + 'k' : p[4]}</span></div>`;
    }).join('');
    this.set('h-lb', `<div style="font-family:var(--display);font-weight:600;margin-bottom:4px">${esc(MODES[this.mode] ? MODES[this.mode].name : '')}</div>${rows}`);
  }

  renderStats(y) {
    const key = JSON.stringify([y.st, y.pts]);
    if (this.cache.stats === key) return;
    this.cache.stats = key;
    const box = this.el('h-stats');
    if (!y.pts && !this.statsPinned) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="statline" style="font-family:var(--display)">${y.pts} upgrade point${y.pts === 1 ? '' : 's'} &middot; keys 1-8</div>` + STAT_NAMES.map((n, i) => `
      <div class="stat-row" style="--c:${STAT_COLORS[i]}">
        <div><div>${i + 1}. ${n}</div><div class="pips">${Array.from({ length: STAT_MAX }, (_, k) => `<i class="${k < y.st[i] ? 'on' : ''}"></i>`).join('')}</div></div>
        <button data-a="stat" data-i="${i}" ${y.pts > 0 && y.st[i] < STAT_MAX ? '' : 'disabled'}>+</button>
      </div>`).join('');
  }

  renderEvo(y, me) {
    const key = JSON.stringify([y.evo, y.def, me.co]);
    if (this.cache.evo === key) return;
    this.cache.evo = key;
    const box = this.el('h-evo');
    if (!y.evo || !y.evo.length) box.classList.add('hidden');
    else {
      box.classList.remove('hidden');
      box.innerHTML = `<div style="font-family:var(--display);font-weight:600;margin-bottom:6px">Evolve</div><div class="evo">${y.evo.slice(0, 8).map((idx, i) => {
        const d = TANKS[idx];
        return `<button data-a="evolve" data-i="${idx}" title="${esc(d.name)}: ${esc(d.role)}"><canvas data-prev="${idx}"></canvas><span>${esc(d.formName)}</span><span class="muted">[${EVO_KEYS[i].toUpperCase()}]</span></button>`;
      }).join('')}</div>`;
      box.querySelectorAll('canvas[data-prev]').forEach(c => previewTank(c, TANKS[Number(c.dataset.prev)]));
    }
    const doc = this.el('h-doc');
    const def = tankByIndex(y.def);
    if (def.tier >= 2 && (me.co >= 1 || this.mode === 'sandbox')) {
      doc.classList.remove('hidden');
      doc.innerHTML = `<button class="btn small block" data-a="doctrine">Change doctrine [G] &middot; ${me.co} core${me.co === 1 ? '' : 's'}</button>`;
    } else doc.classList.add('hidden');
  }

  renderTop(s) {
    const mi = s.mi || {};
    if (this.mode === 'nexus' && mi.nx) {
      const key = JSON.stringify(mi.nx);
      if (this.cache.nx !== key) {
        this.cache.nx = key;
        this.el('h-nexus').innerHTML = mi.nx.map((n, t) => `
          <div class="hbox" style="border-color:${TEAM_COLORS[t]}66">
            <div class="row" style="justify-content:space-between;font-size:0.8em"><b style="color:${TEAM_COLORS[t]}">${this.teamName(t)} Nexus</b><span>${n[4] ? 'EMERGENCY SHIELD' : `Gen ${n[2]}/2 &middot; Tur ${n[3]}`}</span></div>
            <div class="bar"><i style="width:${n[1]}%;background:#9fd8ff"></i></div>
            <div class="bar"><i style="width:${n[0]}%;background:${TEAM_COLORS[t]}"></i></div>
          </div>`).join('');
      }
    }
    const bosses = s.b || [];
    const bkey = JSON.stringify(bosses.map(b => [b[0], b[2], b[3], b[6]]));
    if (this.cache.b !== bkey) {
      this.cache.b = bkey;
      this.el('h-bosses').innerHTML = bosses.slice(0, 3).map(b => {
        const def = BOSSES[b[1]];
        const ph = def.phases[b[3]];
        return `<div class="bossbar"><div class="nm"><span>${esc(def.name)}</span><span class="muted">${esc(b[6] ? b[6] : ph ? ph.name : '')}</span></div><div class="bar"><i style="width:${b[2]}%"></i></div></div>`;
      }).join('');
    }
    const ev = mi.ev || [];
    const ekey = JSON.stringify(ev.map(e => [e[0], Math.ceil(e[1] / 5)]));
    if (this.cache.ev !== ekey) { this.cache.ev = ekey; this.el('h-events').innerHTML = ev.map(e => `<span class="event-chip">${esc(e[0])} &middot; ${e[1]}s</span>`).join(''); }
    this.set('h-obj', this.objective(s));
  }

  objective(s) {
    const y = s.y || {}, mi = s.mi || {};
    if (y.evo && y.evo.length) return 'Evolution available. Choose a new tank on the left.';
    if (y.pts > 0 && y.lv < 4) return 'Spend upgrade points with keys 1-8 or the + buttons.';
    switch (this.mode) {
      case 'nexus': {
        const enemy = (s.me && s.me.team === 0) ? 1 : 0;
        const n = mi.nx ? mi.nx[enemy] : null;
        if (n && n[2] > 0) return `Destroy the ${this.teamName(enemy)} shield generators (${n[2]} left). Team credits: ${mi.cr ?? 0} [T]`;
        if (n) return `Generators down. Break the ${this.teamName(enemy)} Nexus shield and core. Credits: ${mi.cr ?? 0} [T]`;
        return 'Defend your Nexus.';
      }
      case 'labyrinth': case 'labyrinth_team':
        return `Explore the maze. Secrets ${mi.sec ? mi.sec[0] : 0}/${mi.sec ? mi.sec[1] : 0}. Stay in a boss chamber or break its shrine to wake a guardian.`;
      case 'sandbox': return 'Press B to pick any tank, jump to level 45, or summon bosses.';
      case 'tdm': return 'Fight for your team. Break the central shrine to summon a boss.';
      default: return 'Destroy shapes to level up. Evolve at levels 15, 30 and 45.';
    }
  }

  renderDeath(y, me) {
    const ov = this.el('h-overlay');
    if (y.dead && !this.last.mo) {
      const killer = y.killer ? this.names.get(y.killer) : null;
      const key = `dead${Math.ceil(y.respawn)}${killer}`;
      if (this.cache.death === key) return;
      this.cache.death = key;
      ov.innerHTML = `<div class="death"><div class="panel">
        <h2 class="title">Destroyed</h2>
        <p class="muted">${killer ? `By ${esc(killer)}` : 'Your tank was destroyed'}</p>
        <div class="kv" style="justify-content:center;margin:10px 0"><dt>Score</dt><dd>${me.sc}</dd><dt>Kills</dt><dd>${me.k}</dd><dt>Relic cores</dt><dd>${me.co}</dd></div>
        <button class="btn primary block" data-a="respawn" ${y.respawn > 0 ? 'disabled' : ''}>${y.respawn > 0 ? `Respawn in ${Math.ceil(y.respawn)}` : 'Respawn [R]'}</button>
        <div style="height:8px"></div>
        <button class="btn block" data-a="leave">Leave match</button>
      </div></div>`;
    } else if (this.cache.death) {
      this.cache.death = null;
      if (!this.last.mo) ov.innerHTML = '';
    }
  }

  renderMatchEnd(mo) {
    const key = `mo${mo.in}`;
    if (this.cache.mo === key) return;
    this.cache.mo = key;
    const st = mo.stats;
    this.el('h-overlay').innerHTML = `<div class="death"><div class="panel" style="max-width:640px;width:94vw;text-align:left">
      <h2 class="title" style="color:${TEAM_COLORS[mo.winner]}">${this.teamName(mo.winner)} team wins</h2>
      <p class="muted">Next match in ${mo.in}s</p>
      <div style="max-height:46vh;overflow:auto"><table><tr><th>Player</th><th>Team</th><th>K</th><th>D</th><th>A</th><th>Score</th></tr>
      ${st.players.map(p => `<tr><td>${esc(p.name)}</td><td style="color:${TEAM_COLORS[p.team]}">${this.teamName(p.team)}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.assists}</td><td>${p.score}</td></tr>`).join('')}</table></div>
      <p class="muted">${st.teams.map(t => `${this.teamName(t.team)}: ${t.kills} kills, ${t.damage} Nexus damage`).join(' &middot; ')}</p>
      <button class="btn block" data-a="leave">Leave</button>
    </div></div>`;
  }

  renderDrawer() {
    let box = this.root.querySelector('.drawer');
    if (!this.drawer) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.className = 'drawer panel p'; this.root.appendChild(box); }
    const close = '<button class="btn small" data-a="close" style="float:right">Close</button>';
    if (this.drawer === 'players') {
      const teams = MODES[this.mode] && MODES[this.mode].teams;
      box.innerHTML = `${close}<h2 class="title">Players</h2><table><tr><th>Name</th>${teams ? '<th>Team</th>' : ''}<th>Tank</th><th>K</th><th>D</th><th>Score</th></tr>${[...this.players].sort((a, b) => b[4] - a[4]).map(p => `<tr><td>${esc(p[1])}${p[9] ? '' : ' <span class="muted">(reconnecting)</span>'}</td>${teams ? `<td style="color:${TEAM_COLORS[p[2]]}">${this.teamName(p[2])}</td>` : ''}<td>${p[8] >= 0 ? esc(TANKS[p[8]].name) : '<span class="muted">dead</span>'}</td><td>${p[5]}</td><td>${p[6]}</td><td>${p[4]}</td></tr>`).join('')}</table>`;
    } else if (this.drawer === 'team') {
      const mi = this.mi || {};
      const key = JSON.stringify([mi.cr, mi.up, mi.ecd, this.meStats && this.meStats.co]);
      if (this.cache.team === key && box.dataset.k === 'team') return;
      this.cache.team = key; box.dataset.k = 'team';
      const up = mi.up || {};
      box.innerHTML = `${close}<h2 class="title">Team Upgrades</h2><p>Team credits: <b>${mi.cr ?? 0}</b>. Earned from kills, shapes, structures and Nexus damage. Losing teams earn 30% more.</p>
        ${Object.entries(UPGRADES).map(([k, u]) => {
          const lvl = up[k] || 0;
          const cost = Math.round(u.cost[Math.min(lvl, u.cost.length - 1)] * (k === 'rebuild' || k === 'emergency' ? 1 + 0.25 * lvl : 1));
          const maxed = lvl >= u.max;
          const cd = k === 'emergency' && mi.ecd > 0;
          return `<div class="up-row"><div><b>${esc(u.name)}</b> ${u.max < 50 ? `<span class="muted">${lvl}/${u.max}</span>` : ''}<div class="muted" style="font-size:13px">${esc(u.desc)}</div></div><button class="btn small" data-a="tu" data-k="${k}" ${maxed || cd || (mi.cr ?? 0) < cost ? 'disabled' : ''}>${maxed ? 'Max' : cd ? `${mi.ecd}s` : cost}</button></div>`;
        }).join('')}
        <div class="up-row"><div><b>Donate a relic core</b><div class="muted" style="font-size:13px">Convert 1 of your cores into 150 team credits</div></div><button class="btn small" data-a="donate" ${this.meStats && this.meStats.co > 0 ? '' : 'disabled'}>Donate</button></div>`;
    } else if (this.drawer === 'sandbox') {
      if (box.dataset.k === 'sandbox') return;
      box.dataset.k = 'sandbox';
      box.innerHTML = `${close}<h2 class="title">Sandbox</h2>
        <div class="row"><button class="btn" data-a="sbpick">Pick a tank from the collection</button><button class="btn" data-a="sblvl">Jump to level 45</button></div>
        <h3>Summon a boss</h3><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr))">${BOSSES.map((b, i) => `<button class="btn small" data-a="summon" data-i="${i}">${esc(b.name.replace('The ', ''))}</button>`).join('')}</div>`;
    } else if (this.drawer === 'doctrine') {
      const y = this.you || {}, me = this.meStats || {};
      const def = tankByIndex(y.def);
      const key = JSON.stringify([y.def, me.co, me.doc]);
      if (this.cache.doc === key && box.dataset.k === 'doctrine') return;
      this.cache.doc = key; box.dataset.k = 'doctrine';
      box.innerHTML = `${close}<h2 class="title">Doctrine</h2><p class="muted">A doctrine changes how every barrel on ${esc(def.formName)} behaves. Switching costs 1 relic core (free to return to Standard). Cooldown 20s${me.doc ? `, ready in ${me.doc}s` : ''}. You have ${me.co} core${me.co === 1 ? '' : 's'}.</p>
        <div class="evo" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">${DOCTRINES.map(d => {
          const v = doctrineVariant(def, d.key);
          if (!v) return '';
          const cur = v.index === def.index;
          return `<button data-a="doc" data-k="${d.key}" ${cur || def.tier < 2 ? 'disabled' : ''} title="${esc(v.passive)}. Weakness: ${esc(v.weakness)}"><canvas data-prev="${v.index}"></canvas><span>${esc(v.doctrineName)}</span><span class="muted">${esc(v.passive)}</span></button>`;
        }).join('')}</div>`;
      box.querySelectorAll('canvas[data-prev]').forEach(c => previewTank(c, TANKS[Number(c.dataset.prev)]));
    } else if (this.drawer === 'pause') {
      if (box.dataset.k === 'pause') return;
      box.dataset.k = 'pause';
      box.innerHTML = `${close}<h2 class="title">Menu</h2>
        <p class="muted">Room <b>${esc(this.roomCode || '')}</b>${this.roomCode && !this.roomCode.startsWith('pub-') && !this.offline ? ' &middot; share this code so friends can join' : ''}</p>
        <div class="grid">
          <button class="btn" data-a="statspin">${this.statsPinned ? 'Hide' : 'Always show'} stat panel</button>
          <button class="btn" data-a="settings">Settings</button>
          <button class="btn" data-a="help">Controls and help</button>
          <button class="btn danger" data-a="leave">Leave match</button>
        </div>`;
    }
  }
}
