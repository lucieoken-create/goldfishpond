// Chunky pixel-art draw routines for every pond inhabitant. All functions
// draw onto the LOW-RES art canvas: world css coords divide by S and land on
// integer cells. No anti-aliasing, no gradients — palette colors only.
import { TAU, clamp } from '../util.js';
import { css } from './palette.js';

function px(c, color, x, y, w = 1, h = 1) {
  c.fillStyle = css(color);
  c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

// Filled circle out of scanline rects (the classic way).
function disc(c, color, cx, cy, r) {
  c.fillStyle = css(color);
  const ri = Math.max(1, Math.round(r));
  for (let dy = -ri; dy <= ri; dy++) {
    const half = Math.floor(Math.sqrt(ri * ri - dy * dy));
    c.fillRect(Math.round(cx) - half, Math.round(cy) + dy, half * 2 + 1, 1);
  }
}

// --- Food ------------------------------------------------------------------

export function drawPelletsPx(c, food, S, pal) {
  for (const p of food.pellets) {
    if (p.age < 0) continue;
    px(c, pal.pellet[1], p.x / S, p.y / S);
    if (((p.x + p.y) | 0) % 3 === 0) px(c, pal.pellet[2], p.x / S - 1, p.y / S);
  }
}

export function drawCupPx(c, food, S, pal, time) {
  const p = food.cupPos();
  const r = food.layout.cup.r / S;
  const x = p.x / S, y = p.y / S;
  const lift = food.armed || food.dragging ? 1 : 0;
  // Shadow, body, rim, food.
  px(c, pal.ink, x - r * 0.7, y + r * 0.55, r * 1.5, 1);
  disc(c, pal.cup[1], x, y - lift, r * 0.8);
  px(c, pal.cup[0], x - r * 0.8, y - lift - r * 0.4, r * 1.6, 1);
  px(c, pal.cup[2], x - r * 0.5, y - lift - r * 0.15, r, 1);
  px(c, pal.pellet[1], x - r * 0.4, y - lift - r * 0.3, r * 0.8, 1);
  // Armed: blinking pixel ring corners.
  if (food.armed && !food.dragging && Math.floor(time * 2.5) % 2 === 0) {
    const g = pal.lotus[2];
    px(c, g, x - r * 1.3, y - r * 0.9); px(c, g, x + r * 1.3, y - r * 0.9);
    px(c, g, x - r * 1.3, y + r * 0.7); px(c, g, x + r * 1.3, y + r * 0.7);
  }
}

// --- Fish ------------------------------------------------------------------

const SEG_D = [0, 0.34, 0.66, 0.95, 1.2];       // spine offsets × size
const SEG_W = [0.46, 0.52, 0.4, 0.24, 0.12];    // half-widths × size

function fishRamp(f, pal) {
  if (f.scheme.body === '#f2ede2') return { body: pal.fishWhite[1], deep: pal.fishWhite[0] };
  if (f.scheme.body === '#d46a25') return { body: pal.fishOrange[0], deep: pal.fishOrange[0] };
  return { body: pal.fishOrange[1], deep: pal.fishOrange[0] };
}

function patchColor(f, pal) {
  if (!f.scheme.patch) return null;
  if (f.scheme.patch === '#d9482f') return pal.fishPatch;
  if (f.scheme.patch === '#f2ede2') return pal.fishWhite[1];
  return pal.fishOrange[1];
}

export function drawFishPx(c, f, S, pal) {
  const cosH = Math.cos(f.heading), sinH = Math.sin(f.heading);
  const ramp = fishRamp(f, pal);
  const patch = patchColor(f, pal);
  for (let i = SEG_D.length - 1; i >= 0; i--) {
    const d = SEG_D[i] * f.size;
    const sway = Math.sin(f.swayPhase - i * 0.9) * f.size * 0.13 * (0.25 + i / 4);
    const sx = (f.x - cosH * d - sinH * sway) / S;
    const sy = (f.y - sinH * d + cosH * sway) / S;
    const w = Math.max(1, Math.round((SEG_W[i] * f.size * 2) / S));
    const color = i >= 3 ? ramp.deep : ramp.body;
    px(c, color, sx - w / 2, sy - w / 2, w, w);
    if (i === 1 && patch) px(c, patch, sx - w / 4, sy - w / 4, Math.max(1, w / 2), Math.max(1, w / 2));
  }
  // Belly glint at the head; tail flick pixel.
  const hx = (f.x + cosH * f.size * 0.18) / S, hy = (f.y + sinH * f.size * 0.18) / S;
  px(c, pal.fishOrange[2], hx, hy);
  if (f.gulpTimer > 0) px(c, pal.fishWhite[1], (f.x + cosH * f.size * 0.5) / S, (f.y + sinH * f.size * 0.5) / S);
}

// --- Ambient ---------------------------------------------------------------

export function drawPadsPx(c, ambient, S, pal, time) {
  for (const p of ambient.pads) {
    const r = p.r / S;
    const x = p.x / S, y = p.y / S;
    // Dark rim disc, lit body, top-left crescent, and a notch bite.
    disc(c, pal.pad[0], x + 1, y + 1, r);
    disc(c, pal.pad[1], x, y, r);
    disc(c, p.tone > 0 ? pal.pad[2] : pal.pad[1], x - r * 0.3, y - r * 0.3, Math.max(1, r * 0.45));
    px(c, pal.water[1], x + Math.cos(p.notch) * r * 0.85, y + Math.sin(p.notch) * r * 0.85, 2, 2);
    if (p.flower) {
      const fr = Math.max(2, r * 0.42);
      disc(c, pal.lotus[0], x, y, fr);
      disc(c, pal.lotus[1], x, y - 1, fr * 0.6);
      px(c, pal.lotus[2], x, y);
    }
  }
  drawFrogPx(c, ambient.frog, S, pal, time);
}

function drawFrogPx(c, f, S, pal, time) {
  if (!f) return;
  const s = f.size / S;
  const hop = f.hopT >= 0 ? Math.sin(Math.min(1, f.hopT) * Math.PI) : 0;
  const x = f.x / S, y = f.y / S;
  const r = Math.max(2, s * (1 + hop * 0.35));
  const ca = Math.cos(f.angle), sa = Math.sin(f.angle);
  // Legs, body, stripe, eyes.
  px(c, pal.frog[0], x - ca * r, y - sa * r + r * 0.5, 2, 1);
  px(c, pal.frog[0], x - ca * r, y - sa * r - r * 0.5, 2, 1);
  disc(c, pal.frog[2], x, y, r);
  disc(c, pal.frog[1], x - ca * r * 0.4, y - sa * r * 0.4, Math.max(1, r * 0.5));
  if (f.throatT > 0) px(c, pal.frogThroat, x + ca * r * 0.8 - 1, y + sa * r * 0.8 - 1, 2, 2);
  const ex = x + ca * r * 0.7, ey = y + sa * r * 0.7;
  const pxp = -sa, pyp = ca;
  if (f.blinkT <= 0) {
    px(c, pal.ink, ex + pxp * r * 0.5, ey + pyp * r * 0.5);
    px(c, pal.ink, ex - pxp * r * 0.5, ey - pyp * r * 0.5);
  }
}

export function drawFlyersPx(c, ambient, S, pal, time) {
  for (const leaf of ambient.leaves) {
    const tone = leaf.tone === '#a8793a' ? pal.leaf[0] : leaf.tone === '#d4b06a' ? pal.leaf[2] : pal.leaf[1];
    px(c, tone, leaf.x / S - 1, leaf.y / S, 3, 1);
    px(c, tone, leaf.x / S, leaf.y / S - 1, 1, 1);
  }
  const d = ambient.dragonfly;
  if (d) {
    const x = d.x / S, y = d.y / S;
    px(c, pal.dragonfly[1], x - 2, y, 3, 1);
    px(c, pal.dragonfly[0], x + 1, y);
    if (!d.settled) {
      // Whirring wings: alternate cells each frame-ish.
      const fl = Math.floor(time * 30) % 2 === 0;
      px(c, pal.dragonfly[2], x - 1, y - (fl ? 1 : 2), 2, 1);
      px(c, pal.dragonfly[2], x - 1, y + (fl ? 1 : 2), 2, 1);
    } else {
      px(c, pal.dragonfly[2], x - 3, y - 1, 2, 1);
      px(c, pal.dragonfly[2], x - 3, y + 1, 2, 1);
    }
  }
}

export function drawFirefliesPx(c, ambient, S, pal, time, nightT) {
  for (const f of ambient.fireflies) {
    const x = (f.ax + Math.sin(time * f.sx * TAU + f.phase) * f.r) / S;
    const y = (f.ay + Math.cos(time * f.sy * TAU + f.phase * 1.7) * f.r * 0.6) / S;
    const glow = Math.pow(Math.sin(time * f.pulse * TAU + f.phase) * 0.5 + 0.5, 2.2) * nightT;
    if (glow < 0.1) continue;
    // Glow level walks the cycling firefly ramp — palette-cycled twinkle.
    const lvl = clamp(Math.floor(glow * 6), 0, 5);
    px(c, pal.firefly[lvl], x, y);
    if (lvl >= 4) {
      px(c, pal.firefly[2], x - 1, y);
      px(c, pal.firefly[2], x + 1, y);
      px(c, pal.firefly[2], x, y - 1);
      px(c, pal.firefly[2], x, y + 1);
    }
  }
}

// --- The doxie --------------------------------------------------------------

export function drawDogPx(c, dog, S, pal, time) {
  if (dog.state === 'offscreen') { drawHeartsZzz(c, dog, S, pal); return; }
  const u = dog.scale / S;              // art px per dog unit
  const dir = dog.dir;
  const gy = (dog.layout.dogPathY + dog.yOff) / S + dog.bob / S;
  const x = dog.x / S;
  const lie = dog.lie;
  const legH = 14 * u * (1 - lie * 0.82);
  const bodyH = 22 * u * (1 - lie * 0.25);
  const bodyW = 74 * u;
  const bodyBot = gy;
  const bodyTop = bodyBot - legH - bodyH;

  const COAT = pal.dog[1], DEEP = pal.dog[0], CREAM = pal.dog[2], INK = pal.dogInk;

  // Legs (or sploot limbs).
  if (lie < 0.55) {
    const stride = Math.sin(dog.walkPhase) * 3 * u;
    px(c, DEEP, x - bodyW * 0.36 - stride, bodyBot - legH, 3 * u, legH);
    px(c, COAT, x - bodyW * 0.2 + stride, bodyBot - legH, 3 * u, legH);
    px(c, COAT, x + bodyW * 0.16 - stride, bodyBot - legH, 3 * u, legH);
    px(c, DEEP, x + bodyW * 0.32 + stride, bodyBot - legH, 3 * u, legH);
  } else {
    px(c, DEEP, x - dir * bodyW * 0.52, bodyBot - 2 * u, 10 * u, 2 * u);
    px(c, COAT, x + dir * bodyW * 0.42, bodyBot - 2 * u, 8 * u, 2 * u);
  }

  // Long body + cream belly strip.
  px(c, COAT, x - bodyW / 2, bodyTop, bodyW, bodyH);
  px(c, DEEP, x - bodyW / 2, bodyTop, bodyW, 2 * u);
  px(c, CREAM, x - bodyW * 0.42, bodyBot - legH - 3 * u, bodyW * 0.84, 3 * u);

  // Tail: wagging stub of pixels at the rear.
  const wag = Math.sin(time * (3 + dog.tailWag * 14)) * (2 + dog.tailWag * 3) * u;
  px(c, DEEP, x - dir * (bodyW / 2 + 3 * u), bodyTop - 2 * u + wag, 4 * u, 2 * u);

  // Head: forward and up, dropped low while drinking/sleeping.
  const headDrop = dog.state === 'drink' ? 8 * u : dog.asleep ? bodyH * 0.8 : 0;
  const hx = x + dir * (bodyW / 2 + 2 * u);
  const hy = bodyTop - 4 * u + headDrop + dog.headRoll * 3 * u;
  px(c, COAT, hx - 7 * u, hy, 14 * u, 11 * u);                 // skull
  px(c, COAT, hx + dir * 7 * u, hy + 4 * u, 8 * u, 5 * u);     // muzzle
  px(c, INK, hx + dir * 13 * u, hy + 4 * u, 2 * u, 2 * u);     // nose
  px(c, DEEP, hx - dir * 5 * u, hy - 2 * u, 6 * u, 10 * u);    // ear flap
  if (dog.asleep || dog.state === 'sleep') {
    px(c, INK, hx + dir * 2 * u, hy + 4 * u, 3 * u, 1);        // closed eye
  } else {
    px(c, INK, hx + dir * 3 * u, hy + 3 * u, 2 * u, 2 * u);    // eye
  }
  // Panting tongue.
  if (dog.mouthOpen > 0.3 || dog.tongueT > 0) {
    px(c, pal.lotus[0], hx + dir * 10 * u, hy + 9 * u, 2 * u, 3 * u);
  }

  drawHeartsZzz(c, dog, S, pal);
}

function drawHeartsZzz(c, dog, S, pal) {
  for (const h of dog.hearts) {
    const x = h.x / S, y = h.y / S;
    px(c, pal.heart, x - 1, y - 1); px(c, pal.heart, x + 1, y - 1);
    px(c, pal.heart, x - 1, y, 3, 1); px(c, pal.heart, x, y + 1);
  }
  for (const z of dog.zzz) {
    const x = z.x / S, y = z.y / S;
    px(c, pal.hintInk, x, y, 3, 1);
    px(c, pal.hintInk, x + 1, y + 1);
    px(c, pal.hintInk, x, y + 2, 3, 1);
  }
}
