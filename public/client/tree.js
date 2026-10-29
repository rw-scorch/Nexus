import { TANKS_BY_ID, TANK_FAMILIES } from '../shared/tank-registry.js';
import { drawTank } from './draw.js';

const ROW_COLORS = ['#f0c84a', '#3ca7d8', '#8bc34a', '#e04848', '#d462a6', '#f0c84a', '#e8865a', '#8f6ad6', '#5fd3b3'];
const S = 42, G = 5;

function shadeHex(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgb(${(r * (1 + f)) | 0},${(g * (1 + f)) | 0},${(b * (1 + f)) | 0})`;
}

export function buildTree(doc = 'std') {
  const get = (f, i) => TANKS_BY_ID.get(`${f}.${i}.${doc}`);
  const basic = TANKS_BY_ID.get(`basic.${doc}`);
  const nodes = [], edges = [];
  const add = (def, col, row) => { const n = { def, col, row }; nodes.push(n); return n; };
  const root = add(basic, 0, 0);
  let col = 0;
  for (const fam of TANK_FAMILIES.filter(f => f.root)) {
    const t2 = get(fam.key, 0);
    const kids = t2.next.map(id => TANKS_BY_ID.get(id));
    const n2 = add(t2, col, 1);
    edges.push({ from: root, to: n2, bus: 0 });
    kids.forEach((k, i) => {
      const n3 = add(k, col + i, 2);
      edges.push({ from: n2, to: n3, bus: 1 });
      let prev = n3;
      k.next.forEach((id, j) => {
        const n4 = add(TANKS_BY_ID.get(id), col + i, 3 + j);
        edges.push({ from: prev, to: n4, stack: true });
        prev = n4;
      });
    });
    col += Math.max(1, kids.length) + 0.6;
  }
  return { nodes, edges, cols: col, rows: Math.max(...nodes.map(n => n.row)) + 1 };
}

export function drawTree(canvas, { doc = 'std', current = -1, available = [], time = 0 } = {}) {
  const t = buildTree(doc);
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = Math.ceil(t.cols * (S + G) + 20), H = Math.ceil(t.rows * (S + G * 4) + 20);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width = W * dpr; canvas.height = H * dpr;
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  const px = n => 10 + n.col * (S + G);
  const py = n => 10 + n.row * (S + G * 4);
  c.strokeStyle = 'rgba(90,95,110,0.75)';
  c.lineWidth = 1.5;
  const buses = new Map();
  for (const e of t.edges) {
    if (e.stack) {
      c.beginPath(); c.moveTo(px(e.from) + S / 2, py(e.from) + S); c.lineTo(px(e.to) + S / 2, py(e.to)); c.stroke();
      continue;
    }
    const key = e.from;
    if (!buses.has(key)) buses.set(key, []);
    buses.get(key).push(e.to);
  }
  for (const [from, kids] of buses) {
    const yb = py(from) + S + G * 1.5;
    const xs = kids.map(k => px(k) + S / 2);
    c.beginPath();
    c.moveTo(px(from) + S / 2, py(from) + S); c.lineTo(px(from) + S / 2, yb);
    c.moveTo(Math.min(px(from) + S / 2, ...xs), yb); c.lineTo(Math.max(px(from) + S / 2, ...xs), yb);
    for (const k of kids) { c.moveTo(px(k) + S / 2, yb); c.lineTo(px(k) + S / 2, py(k)); }
    c.stroke();
  }
  const hits = [];
  const avail = new Set(available);
  for (const n of t.nodes) {
    const x = px(n), y = py(n);
    const col = ROW_COLORS[n.row % ROW_COLORS.length];
    c.fillStyle = col;
    c.fillRect(x, y, S, S);
    c.fillStyle = shadeHex(col, -0.18);
    c.fillRect(x, y + S * 0.62, S, S * 0.38);
    const isCur = n.def.index === current, isAv = avail.has(n.def.index);
    c.lineWidth = isCur || isAv ? 3 : 1.5;
    c.strokeStyle = isCur ? '#ffffff' : isAv ? '#ffe680' : 'rgba(40,40,50,0.55)';
    c.strokeRect(x + 0.75, y + 0.75, S - 1.5, S - 1.5);
    let reach = 1.3;
    for (const g of n.def.guns) reach = Math.max(reach, Math.hypot(g.x, g.y) + g.len + 0.2);
    const r = S / 2 / reach * 0.86;
    drawTank(c, n.def, { x: x + S / 2, y: y + S / 2, angle: -Math.PI / 4, r, color: '#3ca7d8', time });
    hits.push({ x, y, s: S, idx: n.def.index, name: n.def.name });
  }
  return hits;
}

export function hitTest(hits, canvas, ev) {
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (parseFloat(canvas.style.width) / rect.width);
  const y = (ev.clientY - rect.top) * (parseFloat(canvas.style.height) / rect.height);
  return hits.find(h => x >= h.x && x <= h.x + h.s && y >= h.y && y <= h.y + h.s) || null;
}
