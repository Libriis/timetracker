// Deterministic client colors. No stored field: the color is derived from the client name,
// so renaming a client changes its color and nothing has to be migrated.
// 12 hues tuned to read as small dots and chart series on both light and dark surfaces.
// Red, orange and violet are left out on purpose: they mean danger, brand and AI.
export const CLIENT_PALETTE = [
  '#0588F0', // blue
  '#3E63DD', // indigo
  '#05A2C2', // cyan
  '#12A594', // teal
  '#46A758', // grass
  '#86A818', // lime
  '#DB9A1A', // gold
  '#A87556', // bronze
  '#D6409F', // pink
  '#E93D82', // crimson
  '#AB4ABA', // plum
  '#5B5BD6', // iris
];

const cache = new Map();

// FNV-1a hash of the normalised name -> palette slot.
export function clientColor(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return '#8B8B94';
  if (cache.has(key)) return cache.get(key);
  let h = 0x811ca395; // seed picked so typical client lists get distinct hues
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const color = CLIENT_PALETTE[(h >>> 0) % CLIENT_PALETTE.length];
  cache.set(key, color);
  return color;
}
