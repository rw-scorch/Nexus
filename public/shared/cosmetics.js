export const COSMETICS = {
  skin: [
    { id: 'none', name: 'Default', price: 0, desc: 'Normal tank colours' },
    { id: 'gold', name: 'Gold', price: 400, color: '#ffc83d' },
    { id: 'mint', name: 'Mint', price: 300, color: '#3fd9a8' },
    { id: 'violet', name: 'Violet', price: 300, color: '#a874ef' },
    { id: 'rose', name: 'Rose', price: 300, color: '#ff7ab8' },
    { id: 'midnight', name: 'Midnight', price: 500, color: '#3c4566' },
    { id: 'snow', name: 'Snow', price: 500, color: '#f4f6fa' },
    { id: 'lava', name: 'Lava', price: 900, color: '#ff6a2b', anim: 'pulse' },
    { id: 'rainbow', name: 'Rainbow', price: 1500, color: '#ff4f6a', anim: 'rainbow' }
  ],
  trail: [
    { id: 'basic', name: 'Basic', price: 0, desc: 'Faint team trail' },
    { id: 'flame', name: 'Flame', price: 250 },
    { id: 'neon', name: 'Neon', price: 250 },
    { id: 'frost', name: 'Frost', price: 350 },
    { id: 'smoke', name: 'Smoke', price: 350 },
    { id: 'sparkle', name: 'Sparkle', price: 600 },
    { id: 'rainbow', name: 'Rainbow', price: 1000 }
  ],
  kill: [
    { id: 'burst', name: 'Burst', price: 0, desc: 'Shards in your colour' },
    { id: 'confetti', name: 'Confetti', price: 300 },
    { id: 'shockwave', name: 'Shockwave', price: 300 },
    { id: 'lightning', name: 'Lightning', price: 500 },
    { id: 'skull', name: 'Skull', price: 500 },
    { id: 'fireworks', name: 'Fireworks', price: 800 },
    { id: 'blackhole', name: 'Black Hole', price: 1200 }
  ]
};

export const SLOTS = ['skin', 'trail', 'kill'];

export function cosmeticIndex(slot, id) {
  const i = (COSMETICS[slot] || []).findIndex(c => c.id === id);
  return i < 0 ? 0 : i;
}

export function findCosmetic(itemId) {
  const [slot, id] = String(itemId).split(':');
  const item = (COSMETICS[slot] || []).find(c => c.id === id);
  return item ? { slot, item } : null;
}

export function accountLevel(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
}

export function xpForAccountLevel(l) {
  return 50 * (l - 1) * (l - 1);
}
