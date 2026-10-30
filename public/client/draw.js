const DEG = Math.PI / 180;
const BARREL = '#999999', BARREL_EDGE = '#727272';

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function poly(ctx, x, y, r, sides, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

export function star(ctx, x, y, r, points, inner, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i / (points * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * inner : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function fillStroke(ctx, fill, stroke, lw) {
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke();
}

function bodyPath(ctx, kind, r, rot) {
  switch (kind) {
    case 'square': ctx.beginPath(); ctx.rect(-r * 0.88, -r * 0.88, r * 1.76, r * 1.76); break;
    case 'hex': poly(ctx, 0, 0, r * 1.02, 6, rot); break;
    case 'tri': poly(ctx, 0, 0, r * 1.15, 3, 0); break;
    case 'pent': poly(ctx, 0, 0, r * 1.05, 5, 0); break;
    case 'octagon': poly(ctx, 0, 0, r * 1.02, 8, Math.PI / 8); break;
    case 'star': star(ctx, 0, 0, r * 1.12, 6, 0.78, 0); break;
    default: ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
}

function drawBarrel(ctx, g, r, ang, mx, my) {
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(ang);
  const L = g.len * r, W = g.w * r;
  const asp = g.asp || 1;
  const wb = asp < 0 ? W * -asp : W;
  const wm = asp > 0 ? W * asp : W;
  ctx.beginPath();
  ctx.moveTo(0, -wb); ctx.lineTo(L, -wm); ctx.lineTo(L, wm); ctx.lineTo(0, wb);
  ctx.closePath();
  ctx.lineJoin = 'round';
  fillStroke(ctx, BARREL, BARREL_EDGE, Math.max(1.2, r * 0.075));
  if (g.k === 'beam') { ctx.fillStyle = '#7fe3ff'; ctx.fillRect(L * 0.8, -wm * 0.5, L * 0.2, wm); }
  const fx = g.fx || {};
  const tip = fx.heal ? '#5fd36b' : fx.explode ? '#ff9a3d' : fx.chain ? '#5cc8ff' : fx.pull ? '#9b6bff' : fx.bounce ? '#f2c230' : fx.intercept ? '#4fd1a5' : fx.pierce && g.k !== 'beam' ? '#ffffff' : null;
  if (tip && !g.deco) { ctx.fillStyle = tip; ctx.fillRect(L * 0.82, -wm * 0.85, L * 0.12, wm * 1.7); }
  ctx.restore();
}

function polyPath(ctx, sides, rad, rot) {
  if (!sides) { ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); return; }
  poly(ctx, 0, 0, rad, sides, rot);
}

function drawDecos(ctx, def, r, rot, time, layer, color) {
  for (const dc of def.decos || []) {
    if ((dc.layer || 0) !== layer) continue;
    ctx.save();
    const cx = (dc.x * Math.cos(rot) - dc.y * Math.sin(rot)) * r, cy = (dc.x * Math.sin(rot) + dc.y * Math.cos(rot)) * r;
    ctx.translate(cx, cy);
    polyPath(ctx, dc.sides, dc.s * r * (dc.sides === 3 ? 1.5 : dc.sides === 4 ? 1.2 : 1), rot + (dc.a || 0) * DEG + time * (dc.spin || 0));
    const fill = dc.dark ? '#5a5a5f' : layer ? BARREL : shade(color, -0.12);
    fillStroke(ctx, fill, dc.dark ? '#3f3f44' : BARREL_EDGE, Math.max(1.2, r * 0.075));
    ctx.restore();
  }
}

function drawTurret(ctx, def, ti, r, rot, aim, guns) {
  const u = def.turrets[ti];
  const cx = (u.x * Math.cos(rot) - u.y * Math.sin(rot)) * r, cy = (u.x * Math.sin(rot) + u.y * Math.cos(rot)) * r;
  for (const g of guns) {
    if (g.t !== ti) continue;
    const gx = cx + (g.x * Math.cos(aim) - g.y * Math.sin(aim)) * r, gy = cy + (g.x * Math.sin(aim) + g.y * Math.cos(aim)) * r;
    drawBarrel(ctx, g, r, aim + g.a * DEG, gx, gy);
  }
  ctx.beginPath(); ctx.arc(cx, cy, u.s * r, 0, Math.PI * 2);
  fillStroke(ctx, BARREL, BARREL_EDGE, Math.max(1.2, r * 0.075));
}

export function drawTank(ctx, def, o) {
  const { x, y, angle, r, color, time = 0 } = o;
  const guns = o.swapped && def.alt ? def.alt : def.guns;
  ctx.save();
  ctx.translate(x, y);
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  const rot = angle + (def.spin ? def.spin * time : 0);
  const ca = Math.cos(rot), sa = Math.sin(rot);
  const tAng = i => (o.turretAngles && o.turretAngles[i] !== undefined ? o.turretAngles[i] : rot + def.turrets[i].a * DEG + (o.idleSpin ? time * 0.8 : 0));
  drawDecos(ctx, def, r, rot, time, 0, color);
  for (let i = 0; i < def.turrets.length; i++) if (!def.turrets[i].layer) drawTurret(ctx, def, i, r, rot, tAng(i), guns);
  for (const g of guns) {
    if (g.auto && g.t >= 0) continue;
    const mx = (g.x * ca - g.y * sa) * r, my = (g.x * sa + g.y * ca) * r;
    drawBarrel(ctx, g, r, g.auto ? rot : rot + g.a * DEG, mx, my);
  }
  ctx.save();
  ctx.rotate(def.body === 'circle' ? 0 : rot);
  bodyPath(ctx, def.body, r, 0);
  const fill = o.flash ? shade(color, 0.55) : color;
  fillStroke(ctx, fill, shade(color, -0.3), Math.max(1.8, r * 0.1));
  ctx.restore();
  for (let i = 0; i < def.turrets.length; i++) if (def.turrets[i].layer) drawTurret(ctx, def, i, r, rot, tAng(i), guns);
  drawDecos(ctx, def, r, rot, time, 1, color);
  if (def.bodyFx && def.bodyFx.armor) {
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1.5, r * 0.1); ctx.strokeStyle = shade(color, -0.25); ctx.stroke();
  }
  ctx.restore();
}

export function drawShape(ctx, s, x, y, r, angle, flash) {
  ctx.save();
  if (s.kind === 'crystal') {
    poly(ctx, x, y, r, 4, angle);
    ctx.globalAlpha *= 0.9;
    fillStroke(ctx, flash ? '#ffffff' : '#b6f3ff', '#5fb7d0', 2.5);
  } else {
    poly(ctx, x, y, r, s.sides, angle);
    fillStroke(ctx, flash ? shade(s.color, 0.5) : s.color, shade(s.color, -0.35), s.kind === 'alpha' ? 5 : 2.5);
  }
  ctx.restore();
}

export function drawMob(ctx, m, x, y, r, angle, color, flash) {
  ctx.save();
  ctx.translate(x, y);
  const ca = Math.cos(angle), sa = Math.sin(angle);
  for (const g of m.guns) {
    drawBarrel(ctx, g, r, angle + g.a * DEG, (g.x * ca - g.y * sa) * r, (g.x * sa + g.y * ca) * r);
  }
  const fill = flash ? shade(color, 0.5) : color;
  if (m.sides >= 3) poly(ctx, 0, 0, r * (m.sides === 3 ? 1.15 : 1), m.sides, m.sides === 3 ? angle : angle * 0.2);
  else { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); }
  fillStroke(ctx, fill, shade(color, -0.4), Math.max(2, r * 0.12));
  ctx.restore();
}

export function drawBoss(ctx, def, x, y, r, angle, time, flags, trail) {
  const c = def.color;
  const dark = shade(c, -0.45), mid = shade(c, -0.2), light = shade(c, 0.35);
  const lw = Math.max(3, r * 0.06);
  ctx.save();
  if (flags & 4) ctx.globalAlpha *= 0.16;
  if (trail && trail.length) {
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i];
      const rr = r * (0.78 - i * 0.05);
      if (rr < r * 0.25) continue;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
      fillStroke(ctx, i % 2 ? mid : shade(c, -0.1), dark, lw * 0.8);
      if (def.shape === 'serpent') { poly(ctx, p.x, p.y, rr * 1.25, 3, p.a + Math.PI / 2); ctx.fillStyle = 'rgba(255,190,80,0.25)'; ctx.fill(); }
    }
  }
  ctx.translate(x, y);
  const t = time;
  switch (def.shape) {
    case 'fortress':
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + t * 0.1; ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.rect(r * 0.75, -r * 0.18, r * 0.42, r * 0.36); fillStroke(ctx, BARREL, BARREL_EDGE, lw * 0.7); ctx.restore(); }
      poly(ctx, 0, 0, r, 8, Math.PI / 8 + t * 0.1); fillStroke(ctx, c, dark, lw);
      poly(ctx, 0, 0, r * 0.55, 8, -t * 0.3); fillStroke(ctx, mid, dark, lw * 0.7);
      break;
    case 'worm': case 'serpent':
      ctx.rotate(angle);
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(r * 0.5, s * r * 0.4); ctx.quadraticCurveTo(r * 1.35, s * r * (0.5 + 0.2 * Math.sin(t * 6)), r * 1.1, s * r * 0.05); ctx.lineWidth = lw * 1.4; ctx.strokeStyle = light; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); fillStroke(ctx, c, dark, lw);
      ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.3, r * 0.12, 0, Math.PI * 2); ctx.arc(r * 0.35, r * 0.3, r * 0.12, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      break;
    case 'diamond':
      poly(ctx, 0, 0, r * 1.1, 4, t * 0.5); fillStroke(ctx, c, dark, lw);
      poly(ctx, 0, 0, r * 0.6, 3, -t * 1.1); fillStroke(ctx, light, dark, lw * 0.6);
      break;
    case 'tank':
      ctx.rotate(angle);
      for (const yy of [-0.45, 0, 0.45]) { ctx.beginPath(); ctx.rect(0, r * yy - r * 0.13, r * 1.55, r * 0.26); fillStroke(ctx, BARREL, BARREL_EDGE, lw * 0.6); }
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.rect(-r * 0.3, s * r * 0.75, r * 0.6, s * r * 0.5); fillStroke(ctx, BARREL, BARREL_EDGE, lw * 0.6); }
      ctx.beginPath(); ctx.rect(-r * 0.9, -r * 0.9, r * 1.8, r * 1.8); fillStroke(ctx, c, dark, lw);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); fillStroke(ctx, mid, dark, lw * 0.6);
      if (def.frontArmor) { ctx.beginPath(); ctx.arc(0, 0, r * 1.05, -Math.PI / 3, Math.PI / 3); ctx.lineWidth = lw * 2; ctx.strokeStyle = '#d0d4dc'; ctx.stroke(); }
      break;
    case 'hive':
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + t * 0.15; poly(ctx, Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, r * 0.36, 6, 0); fillStroke(ctx, i % 2 ? mid : c, dark, lw * 0.6); }
      poly(ctx, 0, 0, r * 0.5, 6, 0); fillStroke(ctx, light, dark, lw * 0.7);
      break;
    case 'star':
      star(ctx, 0, 0, r * 1.15, 5, 0.45, t * 0.6); fillStroke(ctx, c, dark, lw);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fillStyle = light; ctx.fill();
      break;
    case 'crown':
      ctx.rotate(angle - Math.PI / 2);
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.42; ctx.save(); ctx.rotate(a + Math.PI / 2); ctx.beginPath(); ctx.moveTo(-r * 0.16, -r * 0.8); ctx.lineTo(0, -r * 1.45); ctx.lineTo(r * 0.16, -r * 0.8); fillStroke(ctx, light, dark, lw * 0.6); ctx.restore(); }
      poly(ctx, 0, 0, r, 6, 0); fillStroke(ctx, c, dark, lw);
      poly(ctx, 0, 0, r * 0.45, 6, t); fillStroke(ctx, mid, dark, lw * 0.6);
      break;
    case 'swarmqueen':
      ctx.rotate(angle);
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-r * 0.2, 0); ctx.lineTo(-r * 0.9, s * r * (1.2 + 0.15 * Math.sin(t * 10))); ctx.lineTo(r * 0.3, s * r * 0.4); ctx.closePath(); ctx.fillStyle = 'rgba(255,170,230,0.45)'; ctx.fill(); }
      poly(ctx, 0, 0, r * 1.1, 3, 0); fillStroke(ctx, c, dark, lw);
      break;
    case 'nullcore':
      for (let k = 3; k >= 1; k--) { ctx.beginPath(); ctx.arc(0, 0, r * (0.4 + k * 0.28), t * (k % 2 ? 1 : -1) * 0.6, t * (k % 2 ? 1 : -1) * 0.6 + Math.PI * 1.5); ctx.lineWidth = lw; ctx.strokeStyle = `rgba(224,224,255,${0.25 + k * 0.15})`; ctx.stroke(); }
      poly(ctx, 0, 0, r * 0.75, 12, t * 0.2); fillStroke(ctx, '#12121e', c, lw);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      break;
    case 'shard':
      for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + t * 0.2; ctx.save(); ctx.rotate(a); poly(ctx, r * 0.42, 0, r * 0.62, 4, 0); fillStroke(ctx, i ? mid : c, dark, lw * 0.7); ctx.restore(); }
      break;
    case 'bolt':
      poly(ctx, 0, 0, r * 1.15, 3, angle); fillStroke(ctx, c, dark, lw);
      ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.6); ctx.lineTo(r * 0.15, -r * 0.05); ctx.lineTo(-r * 0.15, 0.05 * r); ctx.lineTo(r * 0.2, r * 0.6); ctx.lineWidth = lw; ctx.strokeStyle = '#fff'; ctx.stroke();
      break;
    case 'blade':
      ctx.rotate(angle);
      ctx.beginPath(); ctx.moveTo(r * 1.5, 0); ctx.lineTo(0, r * 0.55); ctx.lineTo(-r * 0.9, 0); ctx.lineTo(0, -r * 0.55); ctx.closePath(); fillStroke(ctx, c, dark, lw);
      ctx.beginPath(); ctx.rect(-r * 0.15, -r * 0.95, r * 0.3, r * 1.9); fillStroke(ctx, mid, dark, lw * 0.6);
      break;
    case 'gear':
      ctx.rotate(t * 0.5);
      star(ctx, 0, 0, r * 1.08, 12, 0.84, 0); fillStroke(ctx, c, dark, lw);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2); fillStroke(ctx, mid, dark, lw * 0.7);
      ctx.rotate(-t * 1.5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.38, 0); ctx.lineWidth = lw; ctx.strokeStyle = '#2a2016'; ctx.stroke();
      break;
    case 'flower':
      for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7 + t * 0.2; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.42, 0, Math.PI * 2); fillStroke(ctx, i % 2 ? mid : c, dark, lw * 0.6); }
      ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); fillStroke(ctx, '#ffe27a', '#a88a20', lw * 0.6);
      break;
    case 'claw':
      ctx.rotate(angle);
      for (const s of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(r * 0.4, s * r * 0.45); ctx.quadraticCurveTo(r * 1.4, s * r * 0.7, r * 1.25, s * r * 0.1); ctx.lineWidth = lw * 1.2; ctx.strokeStyle = light; ctx.stroke(); }
      poly(ctx, 0, 0, r, 3, Math.PI); fillStroke(ctx, c, dark, lw);
      break;
    case 'choir':
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.rect(-r * 0.75 + i * r * 0.32, -r * (1.1 + (i % 2) * 0.25), r * 0.22, r * 0.6); fillStroke(ctx, BARREL, BARREL_EDGE, lw * 0.5); }
      ctx.beginPath(); ctx.rect(-r * 0.85, -r * 0.7, r * 1.7, r * 1.5); fillStroke(ctx, c, dark, lw);
      break;
    case 'lantern':
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); fillStroke(ctx, '#0c2a24', c, lw);
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(0, 0, r * (0.25 + i * 0.22), r, 0, 0, Math.PI * 2); ctx.lineWidth = lw * 0.4; ctx.strokeStyle = 'rgba(90,255,208,0.4)'; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(0, 0, r * (0.3 + 0.04 * Math.sin(t * 5)), 0, Math.PI * 2); ctx.fillStyle = light; ctx.fill();
      break;
    case 'hydra':
      poly(ctx, 0, 0, r, 5, angle); fillStroke(ctx, c, dark, lw);
      poly(ctx, 0, 0, r * 0.5, 5, -angle); fillStroke(ctx, mid, dark, lw * 0.6);
      break;
    default:
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); fillStroke(ctx, c, dark, lw);
  }
  ctx.restore();
  if (flags & 2) { ctx.beginPath(); ctx.arc(x, y, r * 1.22, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = `rgba(230,236,255,${0.5 + 0.3 * Math.sin(time * 12)})`; ctx.stroke(); }
  if (flags & 8) { poly(ctx, x, y, r * 1.18, 6, time); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(200,210,225,0.75)'; ctx.stroke(); }
  if (flags & 1) { ctx.beginPath(); ctx.arc(x, y, r * 1.12, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.sin(time * 14)})`; ctx.stroke(); }
  if (flags & 64) { ctx.beginPath(); ctx.arc(x, y, r * (1.1 + 0.1 * Math.sin(time * 6)), 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(111,227,107,0.6)'; ctx.stroke(); }
  if (flags & 32) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill(); }
}

export function drawStruct(ctx, kind, x, y, r, angle, color, hpFrac, shieldFrac, flags, time, gens) {
  const dark = shade(color, -0.45);
  ctx.save();
  ctx.translate(x, y);
  if (kind === 'nexus') {
    poly(ctx, 0, 0, r, 8, Math.PI / 8);
    fillStroke(ctx, shade(color, -0.15), dark, 6);
    poly(ctx, 0, 0, r * 0.62, 8, Math.PI / 8 + time * 0.2);
    fillStroke(ctx, shade(color, -0.3), dark, 4);
    poly(ctx, 0, 0, r * 0.32, 4, time * 0.8);
    fillStroke(ctx, shade(color, 0.45), '#fff', 3);
    if (hpFrac < 0.75) {
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 3;
      const n = Math.floor((1 - hpFrac) * 10);
      for (let i = 0; i < n; i++) { const a = i * 2.39; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3); ctx.lineTo(Math.cos(a + 0.3) * r * 0.65, Math.sin(a + 0.3) * r * 0.65); ctx.lineTo(Math.cos(a - 0.1) * r * 0.95, Math.sin(a - 0.1) * r * 0.95); ctx.stroke(); }
    }
    if (shieldFrac > 0) {
      ctx.beginPath(); ctx.arc(0, 0, r * 1.25, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(150,210,255,${0.05 + 0.12 * shieldFrac})`; ctx.fill();
      ctx.lineWidth = 3 + shieldFrac * 3; ctx.strokeStyle = `rgba(160,215,255,${0.35 + 0.4 * shieldFrac})`; ctx.stroke();
    }
    if (flags & 2) { ctx.beginPath(); ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.strokeStyle = `rgba(255,216,77,${0.6 + 0.3 * Math.sin(time * 8)})`; ctx.stroke(); }
  } else if (kind === 'generator') {
    poly(ctx, 0, 0, r, 6, time * 0.3);
    fillStroke(ctx, color, dark, 4);
    ctx.beginPath(); ctx.arc(0, 0, r * (0.35 + 0.06 * Math.sin(time * 4)), 0, Math.PI * 2); ctx.fillStyle = '#d8f0ff'; ctx.fill();
  } else if (kind === 'turret') {
    ctx.save(); ctx.rotate(angle); ctx.beginPath(); ctx.rect(0, -r * 0.32, r * 1.55, r * 0.64); fillStroke(ctx, BARREL, BARREL_EDGE, 3); ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); fillStroke(ctx, color, dark, 4);
    poly(ctx, 0, 0, r * 0.5, 4, angle); ctx.fillStyle = dark; ctx.fill();
  } else if (kind === 'cache') {
    poly(ctx, 0, 0, r * 1.1, 4, Math.PI / 4);
    fillStroke(ctx, '#d9a73a', '#7a5a14', 4);
    poly(ctx, 0, 0, r * 0.5, 4, Math.PI / 4 + time); ctx.fillStyle = '#fff3c2'; ctx.fill();
  } else if (kind === 'shrine') {
    poly(ctx, 0, 0, r, 8, time * 0.15);
    fillStroke(ctx, '#3a2456', '#b06bff', 4);
    ctx.lineWidth = 2; ctx.strokeStyle = `rgba(200,150,255,${0.4 + 0.3 * Math.sin(time * 2)})`;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - time * 0.4; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.1, 0, Math.PI * 2); ctx.stroke(); }
  } else {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); fillStroke(ctx, color, dark, 3);
  }
  if (flags & 1) { ctx.beginPath(); ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(176,107,255,0.8)'; ctx.stroke(); }
  if (flags & 8) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill(); }
  ctx.restore();
}

export function drawPickup(ctx, code, x, y, time) {
  const bob = Math.sin(time * 4 + x) * 3;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.shadowBlur = 14;
  switch (code) {
    case 0: ctx.shadowColor = '#b06bff'; poly(ctx, 0, 0, 13, 4, time); fillStroke(ctx, '#c690ff', '#6a2fb8', 2.5); break;
    case 1: ctx.shadowColor = '#47d97c'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); fillStroke(ctx, '#7ff0a6', '#2c8a4e', 2.5); break;
    case 2: ctx.shadowColor = '#ff9a3d'; ctx.beginPath(); ctx.moveTo(3, -13); ctx.lineTo(-7, 2); ctx.lineTo(0, 2); ctx.lineTo(-3, 13); ctx.lineTo(8, -2); ctx.lineTo(1, -2); ctx.closePath(); fillStroke(ctx, '#ffb86b', '#a85a16', 2); break;
    case 3: ctx.shadowColor = '#47d97c'; ctx.beginPath(); ctx.rect(-4, -12, 8, 24); ctx.rect(-12, -4, 24, 8); fillStroke(ctx, '#7ff0a6', '#2c8a4e', 2); break;
    case 4: ctx.shadowColor = '#38a3ff'; ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(2, 0); ctx.lineTo(-10, 8); ctx.moveTo(0, -8); ctx.lineTo(12, 0); ctx.lineTo(0, 8); ctx.lineWidth = 4; ctx.strokeStyle = '#7cc4ff'; ctx.stroke(); break;
    case 5: ctx.shadowColor = '#ffd84d'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); fillStroke(ctx, '#ffd84d', '#a88a20', 2.5); break;
  }
  ctx.restore();
}

export function previewTank(canvas, def, color = '#38a3ff', time = 0) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = canvas.clientWidth || 96, h = canvas.clientHeight || 96;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const r = Math.min(w, h) / 2 / tankReach(def) * 0.9;
  drawTank(ctx, def, { x: w / 2, y: h / 2, angle: -Math.PI / 4, r, color, time, idleSpin: false });
}

export function tankReach(def) {
  if (def._reach) return def._reach;
  let reach = 1.15;
  for (const g of def.guns) {
    if (g.auto && g.t >= 0) {
      const u = def.turrets[g.t];
      reach = Math.max(reach, Math.hypot(u.x, u.y) + Math.hypot(g.x, g.y) + g.len + 0.1);
    } else reach = Math.max(reach, Math.hypot(g.x, g.y) + g.len + 0.1);
  }
  for (const d of def.decos || []) reach = Math.max(reach, Math.hypot(d.x, d.y) + d.s * 1.2);
  def._reach = reach;
  return reach;
}
