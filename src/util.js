// Shared math helpers, palette, and a seeded RNG.

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function rand(lo = 0, hi = 1) {
  return lo + Math.random() * (hi - lo);
}

export function randInt(lo, hi) {
  return Math.floor(rand(lo, hi + 1));
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Approximate Gaussian via central limit.
export function gauss(mean = 0, sd = 1) {
  let s = 0;
  for (let i = 0; i < 4; i++) s += Math.random();
  return mean + (s - 2) * sd;
}

// Shortest signed angular difference a→b, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// Signed distance to a rounded rectangle (negative inside).
export function roundedRectSDF(px, py, rect, radius) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const qx = Math.abs(px - cx) - (rect.w / 2 - radius);
  const qy = Math.abs(py - cy) - (rect.h / 2 - radius);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - radius;
}

export function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Warm garden palette.
export const PALETTE = {
  gravel: '#c4b49a',
  gravelSpeckles: ['#d8cab2', '#b0a087', '#cbbda4', '#a8977c', '#e0d4bd'],
  stone: '#8d8d8b',
  stoneLight: '#a5a5a1',
  stoneDark: '#6e6e6c',
  waterDeep: '#26485a',
  waterMid: '#33596a',
  waterEdge: '#3f6774',
  waterShallow: '#4b7379',
  foliage: ['#4a6741', '#5b7a4a', '#3d5636', '#6b8a55', '#526e44'],
  foliageDark: '#2f4229',
  plum: ['#5c3a44', '#6e4550', '#4a2f38'],
  lilyPad: '#5d8a4f',
  lilyPadDark: '#456e3a',
  lilyPadLight: '#74a163',
  goldfishOrange: '#e8853a',
  goldfishDeep: '#d46a25',
  goldfishWhite: '#f2ede2',
  doxieRed: '#b5713a',
  doxieDeep: '#96562a',
  doxieCream: '#d9a86c',
  bone: '#ece4d0',
  boneShade: '#cfc5ab',
};
