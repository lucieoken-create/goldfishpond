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
  const lift = food.armed || food.dragging ? 2 : 0;
  const x = Math.round(p.x / S);
  const y = Math.round(p.y / S) - lift;
  const w = Math.max(5, Math.round(r * 1.8));
  const h = Math.max(4, Math.round(r * 1.5));
  const half = Math.floor(w / 2);

  // Steady gold ring while armed — a quiet "ready", nothing blinking.
  if (food.armed && !food.dragging) {
    c.fillStyle = css(pal.lotus[2]);
    c.fillRect(x - half - 2, y - h - 3, w + 4, 1);
    c.fillRect(x - half - 2, y + 2, w + 4, 1);
    c.fillRect(x - half - 2, y - h - 3, 1, h + 6);
    c.fillRect(x + half + 1, y - h - 3, 1, h + 6);
  }
  // A clean little flowerpot: ink silhouette, rim band, body, heaped food.
  c.fillStyle = css(pal.ink);
  c.fillRect(x - half - 1, y - h - 1, w + 2, h + 3);
  c.fillStyle = css(pal.cup[0]);
  c.fillRect(x - half, y - h, w, 2);
  c.fillStyle = css(pal.cup[1]);
  c.fillRect(x - half + 1, y - h + 2, w - 2, h - 1);
  c.fillStyle = css(pal.cup[2]);
  c.fillRect(x - half + 1, y - h + 2, 1, h - 1);
  c.fillStyle = css(pal.pellet[1]);
  c.fillRect(x - half + 1, y - h - 1, w - 2, 1);
  c.fillStyle = css(pal.pellet[2]);
  c.fillRect(x - 1, y - h - 1, 2, 1);
}

// --- Fish ------------------------------------------------------------------

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

// A koi from above: dark-rimmed tapering body flowing into a long whip of a
// tail (no forked fin — the tail IS the taper), little pectoral fins by the
// head, and two dark eye dots.
export function drawFishPx(c, f, S, pal) {
  const cosH = Math.cos(f.heading), sinH = Math.sin(f.heading);
  const ramp = fishRamp(f, pal);
  const patch = patchColor(f, pal);
  const size = f.size;
  // pos(d, s): d back along the spine, s sideways — both in units of size.
  const pos = (d, s) => ({
    x: (f.x - cosH * d * size - sinH * s * size) / S,
    y: (f.y - sinH * d * size + cosH * s * size) / S,
  });
  // Sway grows toward the tail so the whip curls like the reference koi.
  const sway = (i) => Math.sin(f.swayPhase - i * 0.9) * 0.13 * (0.25 + i / 3.2);

  const segs = [
    { d: 0, r: 0.4, color: ramp.body },
    { d: 0.38, r: 0.45, color: ramp.body },
    { d: 0.74, r: 0.3, color: ramp.body },
    { d: 1.05, r: 0.19, color: ramp.body },
    { d: 1.34, r: 0.13, color: ramp.deep },
    { d: 1.6, r: 0.09, color: ramp.deep },
  ].map((s, i) => ({ p: pos(s.d, sway(i)), r: Math.max(0.7, (s.r * size) / S), color: s.color }));

  // Pectoral fins angled out beside the front of the body.
  const finR = Math.max(0.7, (0.14 * size) / S);
  const finL = pos(0.32, 0.58), finR_ = pos(0.32, -0.58);

  // Ink rim pass, then color pass, back to front.
  for (const s of segs) disc(c, pal.fishShadow, s.p.x, s.p.y, s.r + 1);
  disc(c, pal.fishShadow, finL.x, finL.y, finR + 0.8);
  disc(c, pal.fishShadow, finR_.x, finR_.y, finR + 0.8);
  disc(c, ramp.deep, finL.x, finL.y, finR);
  disc(c, ramp.deep, finR_.x, finR_.y, finR);
  for (let i = segs.length - 1; i >= 0; i--) disc(c, segs[i].color, segs[i].p.x, segs[i].p.y, segs[i].r);
  if (patch) disc(c, patch, segs[1].p.x, segs[1].p.y - 1, Math.max(1, segs[1].r * 0.55));

  // Eyes just behind the nose, one each side.
  const eL = pos(0.02, 0.3), eR = pos(0.02, -0.3);
  px(c, pal.ink, eL.x, eL.y);
  px(c, pal.ink, eR.x, eR.y);
  if (f.gulpTimer > 0) {
    const m = pos(-0.45, 0);
    px(c, pal.fishWhite[1], m.x, m.y);
  }
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
      // A crisp little lotus: four petals + four light diagonals + gold heart.
      const fr = Math.max(1.5, r * 0.38);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        px(c, pal.lotus[0], x + dx * fr - 1, y + dy * fr - 1, 2, 2);
      }
      for (const [dx, dy] of [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
        px(c, pal.lotus[1], x + dx * fr, y + dy * fr);
      }
      px(c, pal.lotus[2], x - 1, y - 1, 2, 2);
    }
  }
  drawFrogPx(c, ambient.frog, S, pal, time);
}

// Reference-style frog: ink outline, folded haunches, lit back, and the two
// big white googly eyes with dark pupils that make a pixel frog a frog.
function drawFrogPx(c, f, S, pal, time) {
  if (!f) return;
  const hop = f.hopT >= 0 ? Math.sin(Math.min(1, f.hopT) * Math.PI) : 0;
  const x = f.x / S, y = f.y / S;
  const r = Math.max(2.5, (f.size / S) * (1 + hop * 0.35));
  const ca = Math.cos(f.angle), sa = Math.sin(f.angle);
  const pxp = -sa, pyp = ca;

  // Ink silhouette under everything (body + haunches).
  const hxL = x - ca * r * 0.5 + pxp * r * 0.6, hyL = y - sa * r * 0.5 + pyp * r * 0.6;
  const hxR = x - ca * r * 0.5 - pxp * r * 0.6, hyR = y - sa * r * 0.5 - pyp * r * 0.6;
  disc(c, pal.ink, x, y, r + 1);
  disc(c, pal.ink, hxL, hyL, r * 0.5 + 1);
  disc(c, pal.ink, hxR, hyR, r * 0.5 + 1);

  // Haunches, body, lit back.
  disc(c, pal.frog[0], hxL, hyL, r * 0.5);
  disc(c, pal.frog[0], hxR, hyR, r * 0.5);
  disc(c, pal.frog[1], x, y, r);
  disc(c, pal.frog[2], x + ca * r * 0.2, y + sa * r * 0.2, r * 0.6);

  // Cream throat — puffs up while croaking.
  const puff = f.throatT > 0 ? 0.5 + Math.sin((0.5 - f.throatT) / 0.5 * Math.PI) * 0.35 : 0.3;
  disc(c, pal.frogThroat, x + ca * r * 0.65, y + sa * r * 0.65, Math.max(0.8, r * puff));

  // Googly eyes on top of the head.
  const eyeR = Math.max(1.2, r * 0.42);
  for (const side of [1, -1]) {
    const ex = x + ca * r * 0.55 + side * pxp * r * 0.62;
    const ey = y + sa * r * 0.55 + side * pyp * r * 0.62;
    disc(c, pal.ink, ex, ey, eyeR + 0.8);
    if (f.blinkT <= 0) {
      disc(c, pal.fishWhite[1], ex, ey, eyeR);
      px(c, pal.ink, ex + ca * eyeR * 0.5, ey + sa * eyeR * 0.5);
    } else {
      disc(c, pal.frog[1], ex, ey, eyeR);
    }
  }
}

export function drawFlyersPx(c, ambient, S, pal, time) {
  // Blossoms: a plus of pink petals with a gold heart.
  for (const leaf of ambient.leaves) {
    if (leaf.age < 0.3) continue; // pops in once clear of the trees
    const bx = leaf.x / S, by = leaf.y / S;
    const tone = leaf.tone === '#f0bccb' || leaf.tone === '#f2c7d4' ? pal.blossom[1] : pal.blossom[0];
    px(c, tone, bx - 1, by, 3, 1);
    px(c, tone, bx, by - 1, 1, 3);
    px(c, pal.lotus[2], bx, by);
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

// Proper sprite-work dachshund: long low body, short sturdy legs with cream
// paws, a real stepped tail, defined skull + snout + drop ear — everything
// ink-outlined in two passes so the silhouette reads crisply.
export function drawDogPx(c, dog, S, pal, time) {
  if (dog.state === 'offscreen') { drawHeartsZzz(c, dog, S, pal); return; }
  const u = dog.scale / S;
  const dir = dog.dir;
  const x = dog.x / S;
  const gy = (dog.layout.dogPathY + dog.yOff + dog.bob) / S;
  const lie = dog.lie;
  const COAT = pal.dog[1], DEEP = pal.dog[0], CREAM = pal.dog[2], INK = pal.dogInk;

  const legH = Math.max(2, 9 * u * (1 - lie * 0.85));
  const bodyW = 62 * u;
  const bodyH = 17 * u * (1 - lie * 0.15);
  const bodyBot = gy - legH;
  const bodyTop = bodyBot - bodyH;

  const sil = [];  // silhouette parts — get the ink outline
  const det = [];  // details on top — no outline
  const add = (list, color, px_, py_, w, h) =>
    list.push([color, Math.round(px_), Math.round(py_), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))]);

  // Short sturdy legs with cream paws (or sploot limbs when lying).
  if (lie < 0.55) {
    const lw = 5 * u;
    for (const [ox, phase] of [[-0.36, 1], [-0.22, -1], [0.16, -1], [0.3, 1]]) {
      const stride = Math.sin(dog.walkPhase) * 2.5 * u * phase;
      add(sil, COAT, x + bodyW * ox + stride - lw / 2, bodyBot - 1, lw, legH + 1);
      add(det, CREAM, x + bodyW * ox + stride - lw / 2, gy - 2 * u, lw, 2 * u);
    }
  } else {
    add(sil, COAT, x - dir * (bodyW * 0.5 + 6 * u), gy - 3 * u, 9 * u, 3 * u);
    add(sil, COAT, x + dir * bodyW * 0.42, gy - 3 * u, 8 * u, 3 * u);
  }

  // Tail: four centered segments arcing up and back, tip wagging. Centered
  // on their anchors so the rump mirrors cleanly facing either way.
  const wag = Math.sin(time * (3 + dog.tailWag * 14)) * 1.6 * u;
  const tailSegs = [
    [COAT, 2, 2 * u, 5 * u, 3 * u, 0],
    [COAT, 6.5, -1.5 * u, 5 * u, 3 * u, 1],
    [DEEP, 10.5, -4.5 * u, 4 * u, 2.5 * u, 1.4],
    [DEEP, 14, -7.5 * u, 3.5 * u, 2.5 * u, 1.8],
  ];
  for (const [col, dist, yo, w, h, wagMul] of tailSegs) {
    add(sil, col, x - dir * (bodyW / 2 + dist * u) - w / 2, bodyTop + yo + wag * wagMul, w, h);
  }

  // Long low body: dark saddle on top, cream chest under.
  add(sil, COAT, x - bodyW / 2, bodyTop, bodyW, bodyH);
  add(det, DEEP, x - bodyW / 2 + 2 * u, bodyTop, bodyW - 4 * u, 2.5 * u);
  add(det, CREAM, x - bodyW * 0.42, bodyBot - 3 * u, bodyW * 0.62, 3 * u);

  // Head: skull, snout with cream underside, nose, long drop ear.
  const headDrop = dog.state === 'drink' ? 10 * u
    : (dog.asleep || dog.state === 'sleep') ? bodyH + 2 * u : 0;
  const hcx = x + dir * (bodyW / 2 + 3 * u);
  const hy = bodyTop - 7 * u + headDrop + dog.headRoll * 3 * u;
  add(sil, COAT, hcx - 6.5 * u, hy, 13 * u, 12 * u);
  add(sil, COAT, hcx + dir * 9 * u - 4.5 * u, hy + 5 * u, 9 * u, 5 * u);
  add(det, CREAM, hcx + dir * 9 * u - 4.5 * u, hy + 8 * u, 9 * u, 2 * u);
  add(det, INK, hcx + dir * 12.5 * u - u, hy + 5 * u, 2.5 * u, 2.5 * u);
  add(sil, DEEP, hcx - dir * 6 * u - 2.5 * u, hy + u, 5 * u, 10 * u);
  if (dog.asleep || dog.state === 'sleep') {
    add(det, INK, hcx + dir * 2 * u, hy + 5 * u, 3 * u, 1);
  } else {
    add(det, INK, hcx + dir * 3 * u, hy + 4 * u, 2 * u, 2 * u);
  }
  if (dog.mouthOpen > 0.3 || dog.tongueT > 0) {
    add(det, pal.lotus[0], hcx + dir * 9 * u, hy + 10 * u, 2.5 * u, 3.5 * u);
  }

  // Two passes: expanded ink under everything, then the colored parts.
  c.fillStyle = css(INK);
  for (const [, px_, py_, w, h] of sil) c.fillRect(px_ - 1, py_ - 1, w + 2, h + 2);
  for (const [col, px_, py_, w, h] of sil) { c.fillStyle = css(col); c.fillRect(px_, py_, w, h); }
  for (const [col, px_, py_, w, h] of det) { c.fillStyle = css(col); c.fillRect(px_, py_, w, h); }

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
