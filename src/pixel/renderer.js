// Pixel-mode renderer: draws the same simulation onto a low-res canvas
// (1 art px ≈ 4-5 css px) and upscales with nearest-neighbor. Gradients are
// Bayer-dithered bands; water shimmer is genuine palette cycling — every
// water pixel has a fixed phase into the ramp and the ramp offset rotates.
import { clamp } from '../util.js';
import { paletteAt, bayer } from './palette.js';
import {
  drawPelletsPx, drawFishPx, drawPadsPx, drawFlyersPx,
  drawCupPx, drawDogPx, drawFirefliesPx,
} from './sprites.js';

// Deterministic per-cell noise (stable across frames — speckles must not crawl).
function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function insideRounded(x, y, w, h, r) {
  const qx = Math.min(x, w - 1 - x);
  const qy = Math.min(y, h - 1 - y);
  if (qx >= r || qy >= r) return qx >= 0 && qy >= 0;
  const dx = r - qx, dy = r - qy;
  return dx * dx + dy * dy <= r * r;
}

export class PixelRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.bg = document.createElement('canvas');
    this.waterCanvas = document.createElement('canvas');
    this.bgPal = null;
  }

  resize(layout) {
    this.layout = layout;
    this.S = Math.max(3, Math.round(Math.min(layout.vw, layout.vh) / 170));
    this.w = Math.ceil(layout.vw / this.S);
    this.h = Math.ceil(layout.vh / this.S);
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx = this.canvas.getContext('2d');
    this.bg.width = this.w;
    this.bg.height = this.h;
    this.bgCtx = this.bg.getContext('2d');

    const p = layout.pond;
    this.pond = {
      x: Math.round(p.x / this.S),
      y: Math.round(p.y / this.S),
      w: Math.round(p.w / this.S),
      h: Math.round(p.h / this.S),
    };
    this.pondR = Math.max(3, Math.round(layout.pondRadius / this.S));
    this.copingA = Math.max(2, Math.round(layout.copingW / this.S));

    // Per-pond-pixel tables: rounded-corner mask, cycling phase, depth base,
    // and moonlight falloff (used at night only).
    const { w: pw, h: ph } = this.pond;
    const n = pw * ph;
    this.waterMask = new Uint8Array(n);
    this.waterPhase = new Uint8Array(n);
    this.waterBase = new Float32Array(n);
    this.moonBoost = new Float32Array(n);
    const mx = pw * 0.72, my = ph * 0.3, mr = Math.min(pw, ph) * 0.42;
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const i = y * pw + x;
        this.waterMask[i] = insideRounded(x, y, pw, ph, this.pondR) ? 1 : 0;
        // Coherent along x+3y: sparkle reads as drifting diagonal light bands.
        this.waterPhase[i] = (x + y * 3 + Math.floor(hash2(x, y) * 2)) & 7;
        // Shallow (lighter) near the walls, deep in the middle. Keep per-pixel
        // noise gentle — Ferrari water is smooth bands, not static.
        const edge = clamp(Math.min(x, y, pw - 1 - x, ph - 1 - y) / (Math.min(pw, ph) * 0.35), 0, 1);
        this.waterBase[i] = 0.7 + (1 - edge) * 2.4 + hash2(x + 61, y + 17) * 0.2;
        const ddx = (x - mx) / (mr * 1.5), ddy = (y - my) / mr;
        this.moonBoost[i] = Math.max(0, 1 - Math.sqrt(ddx * ddx + ddy * ddy));
      }
    }
    this.waterCanvas.width = pw;
    this.waterCanvas.height = ph;
    this.waterCtx = this.waterCanvas.getContext('2d');
    this.waterImg = this.waterCtx.createImageData(pw, ph);
    this.bgPal = null; // force background rebuild
  }

  // Static background at art resolution: gravel, hedge, bushes, coping, pond
  // base. Rebuilt only when the (quantized) palette table changes.
  renderBackground(pal) {
    this.bgPal = pal;
    const ctx = this.bgCtx;
    const { w, h } = this;
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const pond = this.pond;
    const cop = {
      x: pond.x - this.copingA, y: pond.y - this.copingA,
      w: pond.w + this.copingA * 2, h: pond.h + this.copingA * 2,
    };
    const copR = this.pondR + this.copingA;
    const hedgeH = Math.round(h * 0.1);
    const put = (o, c) => { d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const hs = hash2(x, y);
        const b = bayer(x, y);

        // Gravel base with speckles.
        let c;
        const g = 1.1 + b * 1.4 + (hs - 0.5) * 0.8;
        c = pal.gravel[clamp(g | 0, 0, 3)];
        if (hs > 0.955) c = pal.gravel[3];
        else if (hs < 0.04) c = pal.gravel[0];

        // Top hedge with a ragged bottom edge.
        const rag = hedgeH + Math.floor(hash2(x >> 1, 7) * 4);
        if (y < rag) {
          const f = 1 + b * 2 + (hs - 0.5) * 1.2 - (y / rag) * 1.4;
          c = pal.foliage[clamp(f | 0, 0, 3)];
          // Plum canopies and blossoms.
          const px1 = w * 0.37, px2 = w * 0.66;
          if (Math.abs(x - px1) < w * 0.05 || Math.abs(x - px2) < w * 0.04) {
            c = pal.plum[b > 0.5 ? 1 : 0];
          }
          if (hs > 0.975) c = pal.blossom[hs > 0.99 ? 1 : 0];
        }

        // Bottom corner bushes.
        const bx1 = 0, by1 = h - 1, bx2 = w - 1;
        const r1 = Math.hypot(x - bx1, y - by1), r2 = Math.hypot(x - bx2, y - by1);
        const bushR = h * 0.14 + hash2(x >> 1, 3) * 3;
        if (r1 < bushR || r2 < bushR) {
          const f = 1 + b * 2 + (hs - 0.5) * 1.2;
          c = pal.foliage[clamp(f | 0, 0, 3)];
          if (hs > 0.97) c = pal.blossom[0];
        }

        // Stone coping ring (simple brick shading), then pond base inside.
        const inCop = insideRounded(x - cop.x, y - cop.y, cop.w, cop.h, copR)
          && x >= cop.x && y >= cop.y && x < cop.x + cop.w && y < cop.y + cop.h;
        if (inCop) {
          const brick = ((x >> 2) + (y >> 1)) & 1;
          c = pal.stone[clamp(1 + brick - (b > 0.7 ? 1 : 0), 0, 2)];
          const inPond = x >= pond.x && y >= pond.y && x < pond.x + pond.w && y < pond.y + pond.h
            && insideRounded(x - pond.x, y - pond.y, pond.w, pond.h, this.pondR);
          if (inPond) c = pal.water[0];
        }

        put(o, c);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // Per-frame water: depth base + ripple field + rotating sparkle phase +
  // Bayer dither, all resolved through the (possibly dusk-blended) ramp.
  renderWater(pal, water, time, nightT) {
    const ramp = pal.water;
    const { w: pw, h: ph } = this.pond;
    const data = this.waterImg.data;
    const cycle = Math.floor(time * 3) & 7;
    const { gw, gh, cur } = water;
    const night = nightT > 0.005;
    for (let y = 0; y < ph; y++) {
      const gy = clamp(Math.round((y / ph) * gh), 1, gh - 2) * gw;
      for (let x = 0; x < pw; x++) {
        const i = y * pw + x, o = i * 4;
        if (!this.waterMask[i]) { data[o + 3] = 0; continue; }
        const hgt = cur[gy + clamp(Math.round((x / pw) * gw), 1, gw - 2)];
        let idx = this.waterBase[i] + hgt * 2.6 + bayer(x, y) * 0.5;
        const sp = (this.waterPhase[i] + cycle) & 7;
        if (sp === 0) idx += 3.6;
        if (night) idx += this.moonBoost[i] * nightT * 2.2;
        const c = ramp[idx < 0 ? 0 : idx > 7 ? 7 : idx | 0];
        data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
      }
    }
    this.waterCtx.putImageData(this.waterImg, 0, 0);
    this.ctx.drawImage(this.waterCanvas, this.pond.x, this.pond.y);
  }

  // Draw one full frame to the low-res canvas, then blit up to the main ctx.
  render(ctx, game) {
    const pal = paletteAt(game.nightT);
    if (pal !== this.bgPal) this.renderBackground(pal);

    const c = this.ctx;
    const S = this.S;
    const t = game.time;
    c.drawImage(this.bg, 0, 0);
    this.renderWater(pal, game.water, t, game.nightT);

    // Entities, in the same layer order as the painterly renderer. Sprites
    // clip themselves to the pond where needed via the save/clip below.
    c.save();
    c.beginPath();
    c.rect(this.pond.x, this.pond.y, this.pond.w, this.pond.h);
    c.clip();
    drawPelletsPx(c, game.food, S, pal);
    for (const f of game.fishes) drawFishPx(c, f, S, pal);
    c.restore();

    drawPadsPx(c, game.ambient, S, pal, t);
    drawFlyersPx(c, game.ambient, S, pal, t);

    const cupLifted = game.food.dragging || game.food.armed || game.food.returnT < 1;
    if (!cupLifted) drawCupPx(c, game.food, S, pal, t);
    drawDogPx(c, game.dog, S, pal, t);
    if (cupLifted) drawCupPx(c, game.food, S, pal, t);

    if (game.nightT > 0.02) drawFirefliesPx(c, game.ambient, S, pal, t, game.nightT);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, 0, 0, this.w * S, this.h * S);
    ctx.imageSmoothingEnabled = true;
  }
}
