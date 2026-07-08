// Scene layout + one-shot painterly background rendering.
import { PALETTE, rand, randInt, pick, roundedRectPath, TAU } from './util.js';

// Compute all scene geometry from the viewport size (CSS pixels).
export function computeLayout(vw, vh) {
  const portrait = vh > vw;
  // Pond margins: leave room at bottom for the dog path, top for foliage.
  const marginX = portrait ? vw * 0.14 : vw * 0.2;
  const marginTop = portrait ? vh * 0.16 : vh * 0.18;
  const marginBottom = portrait ? vh * 0.24 : vh * 0.26;

  const pond = {
    x: marginX,
    y: marginTop,
    w: vw - marginX * 2,
    h: vh - marginTop - marginBottom,
  };
  const pondRadius = Math.min(pond.w, pond.h) * 0.08;
  const copingW = Math.max(14, Math.min(vw, vh) * 0.03);

  const coping = {
    x: pond.x - copingW,
    y: pond.y - copingW,
    w: pond.w + copingW * 2,
    h: pond.h + copingW * 2,
  };

  // Dog walks a horizontal path along the bottom gravel.
  const dogPathY = pond.y + pond.h + copingW + (vh - (pond.y + pond.h + copingW)) * 0.52;
  // Full dog scale factor (Dog.scale returns this directly).
  const dogScale = Math.max(1.1, Math.min(2.6, Math.min(vw, vh) / 300));

  // Food cup perched on the bottom-right coping.
  const cup = {
    x: pond.x + pond.w - pondRadius * 1.6,
    y: pond.y + pond.h + copingW * 0.5,
    r: Math.max(17, Math.min(vw, vh) * 0.031),
  };

  return { vw, vh, portrait, pond, pondRadius, coping, copingW, dogPathY, dogScale, cup };
}

// Render the full static background into an offscreen canvas. Called on resize only.
export function renderBackground(bg, layout, dpr) {
  const { vw, vh, pond, pondRadius, coping, copingW } = layout;
  bg.width = Math.round(vw * dpr);
  bg.height = Math.round(vh * dpr);
  const ctx = bg.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  drawGravel(ctx, vw, vh);
  drawFoliageBorder(ctx, layout);
  drawCoping(ctx, coping, copingW, pondRadius);
  drawPondBase(ctx, pond, pondRadius);
}

function drawGravel(ctx, vw, vh) {
  // Warm base with a soft vignette.
  const base = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.2, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
  base.addColorStop(0, '#cbbca2');
  base.addColorStop(1, '#b3a288');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, vw, vh);

  // Speckles — small soft dots in a few gravel tones.
  const count = Math.round((vw * vh) / 1400);
  for (let i = 0; i < count; i++) {
    const x = rand(0, vw), y = rand(0, vh);
    const r = rand(0.8, 2.6);
    ctx.fillStyle = pick(PALETTE.gravelSpeckles);
    ctx.globalAlpha = rand(0.25, 0.6);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  // A few larger pebbles.
  for (let i = 0; i < count / 14; i++) {
    const x = rand(0, vw), y = rand(0, vh);
    ctx.fillStyle = pick(PALETTE.gravelSpeckles);
    ctx.globalAlpha = rand(0.15, 0.35);
    ctx.beginPath();
    ctx.ellipse(x, y, rand(2.5, 5), rand(2, 4), rand(0, TAU), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Painterly hedge/foliage along the top edge, plus willow-ish clumps in corners.
function drawFoliageBorder(ctx, layout) {
  const { vw, vh } = layout;
  const hedgeH = layout.pond.y * 0.62;

  // Hedge band across the top: layered blobs.
  drawFoliageBand(ctx, 0, 0, vw, hedgeH, PALETTE.foliage, PALETTE.foliageDark);

  // A plum-leaved tree cluster peeking in, upper-right area.
  drawBlobCluster(ctx, vw * rand(0.62, 0.75), hedgeH * 0.5, vw * 0.13, PALETTE.plum, 26);

  // Willow-green corner clusters (soft, larger).
  drawBlobCluster(ctx, vw * 0.04, hedgeH * 0.55, vw * 0.11, PALETTE.foliage, 30);
  drawBlobCluster(ctx, vw * 0.96, hedgeH * 0.6, vw * 0.12, PALETTE.foliage, 30);

  // Soft shadow the hedge casts on the gravel.
  const sh = ctx.createLinearGradient(0, hedgeH * 0.8, 0, hedgeH * 1.5);
  sh.addColorStop(0, 'rgba(47, 66, 41, 0.18)');
  sh.addColorStop(1, 'rgba(47, 66, 41, 0)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, hedgeH * 0.8, vw, hedgeH * 0.7);

  // Low planting tufts at the bottom corners.
  drawBlobCluster(ctx, vw * 0.03, vh * 0.97, vw * 0.06, PALETTE.foliage, 14);
  drawBlobCluster(ctx, vw * 0.97, vh * 0.97, vw * 0.06, PALETTE.foliage, 14);
}

function drawFoliageBand(ctx, x, y, w, h, tones, darkTone) {
  ctx.fillStyle = darkTone;
  ctx.fillRect(x, y, w, h * 0.75);

  // A scalloped hedge silhouette: rounded lobes along the bottom edge.
  ctx.fillStyle = darkTone;
  const lobes = Math.max(6, Math.round(w / 90));
  for (let i = 0; i <= lobes; i++) {
    const lx = x + (i / lobes) * w;
    ctx.beginPath();
    ctx.arc(lx, y + h * 0.72, rand(h * 0.14, h * 0.24), 0, TAU);
    ctx.fill();
  }

  // Leaf clumps over the base — structured rosettes, denser near the top.
  const count = Math.round(w / 46);
  for (let i = 0; i < count; i++) {
    const bx = x + (i / count) * w + rand(-14, 14);
    const by = y + rand(h * 0.05, h * 0.7);
    drawLeafClump(ctx, bx, by, rand(h * 0.14, h * 0.26), tones, rand(0, TAU));
  }

  // Sunlit tips along the crown of the hedge.
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < count; i++) {
    const bx = x + rand(0, w);
    const by = y + rand(0, h * 0.3);
    drawLeafRosette(ctx, bx, by, rand(h * 0.05, h * 0.09), '#8aa86a', rand(0, TAU), 4);
  }
  ctx.globalAlpha = 1;
}

// A clump: dark under-shadow, mid-tone leaf rosettes, lighter crown leaves.
function drawLeafClump(ctx, cx, cy, r, tones, seed) {
  // Under-shadow.
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = 'rgba(30, 44, 26, 0.8)';
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.12, cy + r * 0.22, r * 1.05, r * 0.8, 0, 0, TAU);
  ctx.fill();

  // Two or three overlapping rosettes in the cluster's tones.
  const n = 2 + Math.floor(rand(0, 2));
  for (let i = 0; i < n; i++) {
    const a = seed + (i / n) * TAU;
    const d = rand(0.15, 0.55) * r;
    ctx.globalAlpha = rand(0.7, 0.95);
    drawLeafRosette(
      ctx,
      cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7,
      r * rand(0.45, 0.7), pick(tones), rand(0, TAU), 5 + Math.floor(rand(0, 3))
    );
  }
  // One light rosette on the upper-left (sun side).
  ctx.globalAlpha = 0.55;
  drawLeafRosette(ctx, cx - r * 0.3, cy - r * 0.35, r * 0.4, tones[tones.length - 1], rand(0, TAU), 5);
  ctx.globalAlpha = 1;
}

// A rosette of leaf-shaped ellipses radiating from a center — the same level
// of definition as the lily pads' vein structure.
function drawLeafRosette(ctx, cx, cy, r, tone, rot, leaves) {
  ctx.fillStyle = tone;
  for (let i = 0; i < leaves; i++) {
    const a = rot + (i / leaves) * TAU;
    ctx.beginPath();
    ctx.ellipse(
      cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5,
      r * 0.62, r * 0.26, a, 0, TAU
    );
    ctx.fill();
  }
  // Center fill so the rosette reads as one mass.
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.42, 0, TAU);
  ctx.fill();
}

function drawBlobCluster(ctx, cx, cy, radius, tones, n) {
  // Tree/bush: a canopy of structured leaf clumps around the center,
  // larger clumps low, smaller toward the crown.
  const clumps = Math.max(4, Math.round(n / 5));
  for (let i = 0; i < clumps; i++) {
    const a = rand(0, TAU);
    const d = rand(0.1, 0.8) * radius;
    const cyy = cy + Math.sin(a) * d * 0.6;
    const size = radius * rand(0.28, 0.45) * (1 - (cy - cyy) / (radius * 3));
    drawLeafClump(ctx, cx + Math.cos(a) * d, cyy, size, tones, rand(0, TAU));
  }
}

// Stone coping: individual rounded stones around the pond rim.
function drawCoping(ctx, coping, copingW, pondRadius) {
  // Base band.
  roundedRectPath(ctx, coping.x, coping.y, coping.w, coping.h, pondRadius + copingW);
  ctx.fillStyle = PALETTE.stone;
  ctx.fill();

  // Individual stones: walk the perimeter placing slabs with hue jitter.
  const stoneLen = copingW * 2.1;
  drawStoneRun(ctx, coping.x, coping.y, coping.w, copingW, stoneLen, true);   // top
  drawStoneRun(ctx, coping.x, coping.y + coping.h - copingW, coping.w, copingW, stoneLen, true); // bottom
  drawStoneRun(ctx, coping.x, coping.y, copingW, coping.h, stoneLen, false);  // left
  drawStoneRun(ctx, coping.x + coping.w - copingW, coping.y, copingW, coping.h, stoneLen, false); // right

  // Soft outer drop shadow onto the gravel.
  ctx.save();
  roundedRectPath(ctx, coping.x, coping.y, coping.w, coping.h, pondRadius + copingW);
  ctx.shadowColor = 'rgba(60, 50, 30, 0.35)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  ctx.strokeStyle = 'rgba(0,0,0,0.001)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawStoneRun(ctx, x, y, w, h, stoneLen, horizontal) {
  const run = horizontal ? w : h;
  const n = Math.max(3, Math.round(run / stoneLen));
  const seg = run / n;
  for (let i = 0; i < n; i++) {
    const jitter = rand(-4, 4);
    const light = rand(-14, 14);
    ctx.fillStyle = shadeStone(light);
    const gap = 1.5;
    if (horizontal) {
      roundedRectPath(ctx, x + i * seg + gap, y + gap + jitter * 0.15, seg - gap * 2, h - gap * 2, 4);
    } else {
      roundedRectPath(ctx, x + gap + jitter * 0.15, y + i * seg + gap, w - gap * 2, seg - gap * 2, 4);
    }
    ctx.fill();
    // Slight top-light on each stone.
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    if (horizontal) {
      ctx.fillRect(x + i * seg + gap, y + gap, seg - gap * 2, (h - gap * 2) * 0.3);
    } else {
      ctx.fillRect(x + gap, y + i * seg + gap, (w - gap * 2) * 0.3, seg - gap * 2);
    }
  }
}

function shadeStone(delta) {
  const base = 141; // ≈ PALETTE.stone grey level
  const v = Math.round(base + delta);
  const v2 = Math.round(v * 0.985);
  return `rgb(${v},${v},${v2})`;
}

// Pond water base: layered gradients, deep center, murky edges, depth blotches.
function drawPondBase(ctx, pond, radius) {
  ctx.save();
  roundedRectPath(ctx, pond.x, pond.y, pond.w, pond.h, radius);
  ctx.clip();

  const cx = pond.x + pond.w / 2;
  const cy = pond.y + pond.h / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(pond.w, pond.h) * 0.62);
  g.addColorStop(0, PALETTE.waterDeep);
  g.addColorStop(0.55, PALETTE.waterMid);
  g.addColorStop(0.85, PALETTE.waterEdge);
  g.addColorStop(1, PALETTE.waterShallow);
  ctx.fillStyle = g;
  ctx.fillRect(pond.x, pond.y, pond.w, pond.h);

  // Murky depth blotches.
  for (let i = 0; i < 14; i++) {
    const bx = rand(pond.x, pond.x + pond.w);
    const by = rand(pond.y, pond.y + pond.h);
    const br = rand(pond.w * 0.04, pond.w * 0.13);
    const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    const dark = i % 3 === 0;
    bg.addColorStop(0, dark ? 'rgba(16, 36, 48, 0.35)' : 'rgba(72, 102, 112, 0.18)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, TAU);
    ctx.fill();
  }

  // Inner shadow from the coping (water meets stone).
  roundedRectPath(ctx, pond.x, pond.y, pond.w, pond.h, radius);
  ctx.strokeStyle = 'rgba(10, 24, 32, 0.55)';
  ctx.lineWidth = 10;
  ctx.filter = 'blur(5px)';
  ctx.stroke();
  ctx.filter = 'none';

  // Faint sky/tree reflection wash near the top of the water.
  const refl = ctx.createLinearGradient(0, pond.y, 0, pond.y + pond.h * 0.5);
  refl.addColorStop(0, 'rgba(150, 172, 182, 0.13)');
  refl.addColorStop(1, 'rgba(150, 172, 182, 0)');
  ctx.fillStyle = refl;
  ctx.fillRect(pond.x, pond.y, pond.w, pond.h * 0.5);

  ctx.restore();
}
