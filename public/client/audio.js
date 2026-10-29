import { store } from './storage.js';

let ctx = null, master = null;
const last = {};

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.connect(ctx.destination);
    setVolume(store.settings.volume);
  } catch (e) { ctx = null; }
}

export function setVolume(v) { if (master) master.gain.value = Math.max(0, Math.min(1, v)) * 0.5; }

function tone(freq, dur, type = 'square', vol = 0.2, slide = 0) {
  if (!ctx || !store.settings.volume) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.25, freq = 800) {
  if (!ctx || !store.settings.volume) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}

function throttle(key, ms) {
  const now = performance.now();
  if (last[key] && now - last[key] < ms) return false;
  last[key] = now;
  return true;
}

export const sfx = {
  shoot() { if (throttle('shoot', 55)) tone(220 + Math.random() * 60, 0.06, 'square', 0.06, 0.5); },
  hit() { if (throttle('hit', 40)) tone(520, 0.04, 'triangle', 0.08, 0.6); },
  hurt() { if (throttle('hurt', 90)) noise(0.08, 0.12, 1200); },
  boom(big) { if (throttle('boom', 70)) noise(big ? 0.5 : 0.22, big ? 0.35 : 0.18, big ? 500 : 900); },
  level() { tone(523, 0.12, 'triangle', 0.15); setTimeout(() => tone(784, 0.18, 'triangle', 0.15), 90); },
  evolve() { tone(392, 0.12, 'sawtooth', 0.1); setTimeout(() => tone(587, 0.12, 'sawtooth', 0.1), 80); setTimeout(() => tone(880, 0.25, 'triangle', 0.14), 160); },
  boss() { tone(110, 0.9, 'sawtooth', 0.18, 0.7); setTimeout(() => tone(98, 0.9, 'sawtooth', 0.18, 0.7), 500); },
  ach() { tone(660, 0.12, 'sine', 0.18); setTimeout(() => tone(990, 0.22, 'sine', 0.18), 110); },
  ability() { if (throttle('ab', 150)) tone(300, 0.2, 'sine', 0.14, 2.2); },
  pickup() { if (throttle('pk', 60)) tone(880, 0.08, 'sine', 0.12, 1.5); },
  warn() { if (throttle('warn', 400)) tone(440, 0.15, 'square', 0.08, 0.9); },
  death() { noise(0.6, 0.3, 400); tone(180, 0.6, 'sawtooth', 0.12, 0.3); }
};
