// 8-bit palette for pixel mode. Living Worlds rules: day and night are two
// tables with the same slot layout (night mode is a palette swap, crossfaded
// during dusk like Ferrari's time-of-day interpolation), and shimmer comes
// from ROTATING ramp entries, not from moving pixels. Colors are [r,g,b]
// triples so the water renderer can write ImageData without parsing.

// 4x4 ordered-dither matrix, thresholds in 0..1.
const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
].map(v => (v + 0.5) / 16);

export function bayer(x, y) {
  return BAYER4[((y & 3) << 2) + (x & 3)];
}

function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export function css(c) {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// The full day table. Ramps are ordered dark → light; `water` and `firefly`
// are cycling ramps (the renderer rotates an offset through them).
const DAY = {
  water: ['#1e3d4e', '#26485a', '#2f5566', '#396371', '#44717c', '#528088', '#699795', '#8fb8ac'].map(hex),
  gravel: ['#a08f74', '#b3a186', '#c4b49a', '#d3c5a9'].map(hex),
  stone: ['#6e6e6c', '#8d8d8b', '#a5a5a1'].map(hex),
  foliage: ['#2f4229', '#4a6741', '#5b7a4a', '#6b8a55'].map(hex),
  plum: ['#4a2f38', '#6e4550'].map(hex),
  blossom: ['#e8a7b8', '#f5d7de'].map(hex),
  pad: ['#456e3a', '#5d8a4f', '#74a163'].map(hex),
  lotus: ['#e8a7b8', '#f0bccb', '#f5d76e'].map(hex),
  fishOrange: ['#d46a25', '#e8853a', '#f2a45e'].map(hex),
  fishWhite: ['#d9cdb8', '#f2ede2'].map(hex),
  fishPatch: hex('#d9482f'),
  fishShadow: hex('#16303f'),
  dog: ['#96562a', '#b5713a', '#d9a86c'].map(hex),
  dogInk: hex('#4a2c14'),
  frog: ['#4f7a38', '#6fa344', '#a8cf68'].map(hex),
  frogThroat: hex('#ebe8c3'),
  pellet: ['#a87f42', '#c9a05a', '#e8cf8f'].map(hex),
  dragonfly: ['#2d5570', '#3a6a8a', '#cfe3ee'].map(hex),
  heart: hex('#d9482f'),
  cup: ['#8f4f33', '#b56a45', '#cc8258'].map(hex),
  firefly: ['#3a3f1e', '#5c6423', '#84902c', '#aebc3a', '#d3e15a', '#f2f7a0'].map(hex),
  ink: hex('#26160e'),
  hintInk: hex('#5a4f3a'),
};

// Night: derived with the painterly night multiply (toward deep blue) so the
// two styles agree on what "night" means — except the ramps where night has
// its own story: moonlit water sparkle and glowing fireflies.
function nightify(c) {
  return [
    Math.round(c[0] * 0.41 + 8),
    Math.round(c[1] * 0.50 + 10),
    Math.round(c[2] * 0.73 + 26),
  ];
}

function mapSlots(table, fn) {
  const out = {};
  for (const k of Object.keys(table)) {
    out[k] = Array.isArray(table[k][0]) ? table[k].map(fn) : fn(table[k]);
  }
  return out;
}

const NIGHT = mapSlots(DAY, nightify);
NIGHT.water = ['#0c1630', '#101d3c', '#152648', '#1b3054', '#223b62', '#2c4a74', '#4a6f9e', '#9fb9d8'].map(hex);
NIGHT.firefly = DAY.firefly; // glow cuts through the dark untouched
NIGHT.heart = DAY.heart;

// Palette interpolation for the 3s dusk/dawn ease, quantized to 16 steps so
// the crossfade itself feels like stepping through palettes, not a video fade.
const STEPS = 16;
const cache = new Array(STEPS + 1);
cache[0] = DAY;
cache[STEPS] = NIGHT;

export function paletteAt(nightT) {
  const q = Math.round(Math.max(0, Math.min(1, nightT)) * STEPS);
  if (!cache[q]) {
    const t = q / STEPS;
    const mix = (a, b) => [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
    const table = {};
    for (const k of Object.keys(DAY)) {
      table[k] = Array.isArray(DAY[k][0])
        ? DAY[k].map((c, i) => mix(c, NIGHT[k][i]))
        : mix(DAY[k], NIGHT[k]);
    }
    cache[q] = table;
  }
  return cache[q];
}
