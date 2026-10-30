import { TANKS, TANKS_BY_ID } from '../shared/tank-registry.js';
import { drawTank, tankReach } from './draw.js';

export const TIER_COLORS = ['#f2c94c', '#56b4e9', '#7ccf63', '#ef6f6c', '#c77dd6', '#f29e4c'];
const S = 44, GX = 8, GY = 26, GS = 8;
const ROW = { 1: 0, 15: 1, 30: 2, 45: 3, 60: 4 };

function kidsOf(id) {
  return TANKS.filter(t => t.parent === id);
}

export function buildTree(rootId = 'basic') {
  const nodes = [];
  const edges = [];
  let col = 0;
  const place = (def, row) => {
    const n = { def, row, col: 0 };
    nodes.push(n);
    const kids = kidsOf(def.id);
    const stackKids = row >= 3 ? kids : [];
    const treeKids = row >= 3 ? [] : kids;
    if (!treeKids.length) {
      n.col = col++;
    } else {
      const placed = treeKids.map(k => place(k, Math.max(row + 1, ROW[k.level] ?? row + 1)));
      n.col = (placed[0].col + placed[placed.length - 1].col) / 2;
      for (const p of placed) edges.push({ from: n, to: p });
    }
    let prev = n;
    stackKids.forEach((k, i) => {
      const s = { def: k, row: row + 1 + i, col: n.col, stacked: true };
      nodes.push(s);
      edges.push({ from: prev, to: s, stack: true });
      prev = s;
    });
    return n;
  };
  const root = TANKS_BY_ID.get(rootId) || TANKS_BY_ID.get('basic');
  if (rootId === 'basic') place(root, 0);
  else place(root, ROW[root.level] ?? 1);
  const minRow = Math.min(...nodes.map(n => n.row));
  for (const n of nodes) n.row -= minRow;
  return { nodes, edges, cols: col, rows: Math.max(...nodes.map(n => n.row)) + 1 };
}

export function drawTree(canvas, { root = 'basic', current = -1, available = [], highlight = null, time = 0 } = {}) {
  const t = buildTree(root);
  const W = Math.ceil(t.cols * (S + GX) + 24), H = Math.ceil(t.rows * (S + GY) + 24);
  const dpr = Math.max(1, Math.min(2, devicePixelRatio || 1, Math.sqrt(12e6 / (W * H))));
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  const px = n => 12 + n.col * (S + GX);
  const py = n => 12 + n.row * (S + GY);
  c.strokeStyle = 'rgba(70,78,96,0.55)';
  c.lineWidth = 2;
  c.lineCap = 'round';
  const buses = new Map();
  for (const e of t.edges) {
    if (e.stack) {
      c.beginPath(); c.moveTo(px(e.from) + S / 2, py(e.from) + S); c.lineTo(px(e.to) + S / 2, py(e.to)); c.stroke();
      continue;
    }
    if (!buses.has(e.from)) buses.set(e.from, []);
    buses.get(e.from).push(e.to);
  }
  for (const [from, kids] of buses) {
    const yb = py(from) + S + GY * 0.45;
    const fx = px(from) + S / 2;
    const xs = kids.map(k => px(k) + S / 2);
    c.beginPath();
    c.moveTo(fx, py(from) + S); c.lineTo(fx, yb);
    c.moveTo(Math.min(fx, ...xs), yb); c.lineTo(Math.max(fx, ...xs), yb);
    for (const k of kids) { c.moveTo(px(k) + S / 2, yb); c.lineTo(px(k) + S / 2, py(k)); }
    c.stroke();
  }
  const hits = [];
  const avail = new Set(available);
  for (const n of t.nodes) {
    const x = px(n), y = py(n);
    const tier = ROW[n.def.level] ?? 4;
    const col = n.def.src === 'nexus' ? TIER_COLORS[5] : TIER_COLORS[tier];
    const isCur = n.def.index === current, isAv = avail.has(n.def.index), isHi = highlight === n.def.index;
    c.save();
    roundRect(c, x, y, S, S, 7);
    c.fillStyle = col;
    c.fill();
    c.clip();
    c.fillStyle = 'rgba(0,0,0,0.1)';
    c.fillRect(x, y + S * 0.6, S, S * 0.4);
    c.restore();
    const r = S / 2 / tankReach(n.def) * 0.84;
    drawTank(c, n.def, { x: x + S / 2, y: y + S / 2, angle: -Math.PI / 4, r, color: '#00b2e1', time });
    roundRect(c, x + 1, y + 1, S - 2, S - 2, 7);
    c.lineWidth = isCur || isAv || isHi ? 3 : 1.5;
    c.strokeStyle = isCur ? '#1d2433' : isAv ? '#ffffff' : isHi ? '#1d2433' : 'rgba(29,36,51,0.35)';
    c.stroke();
    if (isAv) { roundRect(c, x - 2, y - 2, S + 4, S + 4, 9); c.lineWidth = 2; c.strokeStyle = '#2bb673'; c.stroke(); }
    c.font = '700 9px Ubuntu, sans-serif';
    c.textAlign = 'center';
    c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,255,255,0.9)';
    const label = n.def.name.length > 11 ? n.def.name.slice(0, 10) + '.' : n.def.name;
    c.strokeText(label, x + S / 2, y + S + 9);
    c.fillStyle = '#1d2433'; c.fillText(label, x + S / 2, y + S + 9);
    hits.push({ x, y, s: S, idx: n.def.index, name: n.def.name });
  }
  return hits;
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

export function hitTest(hits, canvas, ev) {
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (parseFloat(canvas.style.width) / rect.width);
  const y = (ev.clientY - rect.top) * (parseFloat(canvas.style.height) / rect.height);
  return hits.find(h => x >= h.x && x <= h.x + h.s && y >= h.y && y <= h.y + h.s) || null;
}

export function scrollToNode(canvas, hits, idx) {
  const box = canvas.parentElement;
  if (!box) return;
  const h = hits.find(x => x.idx === idx) || hits[0];
  if (!h) return;
  box.scrollLeft = Math.max(0, h.x + h.s / 2 - box.clientWidth / 2);
  box.scrollTop = Math.max(0, h.y - 40);
}
