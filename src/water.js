// Height-field water ripple simulation (classic two-buffer algorithm),
// rendered as a soft highlight/shadow overlay, plus drifting caustic shimmer.
import { roundedRectPath, clamp, TAU, rand } from './util.js';

const DAMP = 0.975;
const MAX_GRID_W = 210;

export class Water {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.gw = 0;
    this.gh = 0;
    this.prev = null;
    this.cur = null;
    this.img = null;
    this.tick = 0;
    // Caustic shimmer blobs (screen-space, slow drift).
    this.shimmer = [];
  }

  resize(layout) {
    const { pond } = layout;
    this.layout = layout;
    const aspect = pond.w > 0 && Number.isFinite(pond.h / pond.w) ? pond.h / pond.w : 0.6;
    this.gw = Math.min(MAX_GRID_W, Math.max(60, Math.round(pond.w / 4.5) || 60));
    this.gh = Math.min(200, Math.max(40, Math.round(this.gw * aspect)));
    this.prev = new Float32Array(this.gw * this.gh);
    this.cur = new Float32Array(this.gw * this.gh);
    // Absorption map: extra damping near the walls so ripples fade out at the
    // edges instead of reflecting and sloshing around the whole pond.
    this.absorb = new Float32Array(this.gw * this.gh);
    const band = 6;
    for (let y = 0; y < this.gh; y++) {
      for (let x = 0; x < this.gw; x++) {
        const edge = Math.min(x, y, this.gw - 1 - x, this.gh - 1 - y);
        const f = edge >= band ? 1 : 0.8 + 0.2 * (edge / band);
        this.absorb[y * this.gw + x] = f;
      }
    }
    this.canvas.width = this.gw;
    this.canvas.height = this.gh;
    this.imgCtx = this.canvas.getContext('2d');
    this.img = this.imgCtx.createImageData(this.gw, this.gh);

    // Blurred upscale cache: the 2px blur runs once per field update (half
    // the frame rate) instead of on every drawn frame.
    this.blurCanvas = this.blurCanvas || document.createElement('canvas');
    this.blurCanvas.width = Math.max(1, Math.round(pond.w));
    this.blurCanvas.height = Math.max(1, Math.round(pond.h));
    this.blurCtx = this.blurCanvas.getContext('2d');

    // One shared caustic blob sprite; the four shimmer blobs draw it scaled
    // instead of building a fresh radial gradient each frame.
    this.blobSprite = this.blobSprite || (() => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      const c = cv.getContext('2d');
      const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, 'rgba(220, 235, 210, 0.5)');
      g.addColorStop(1, 'rgba(220, 235, 210, 0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 256);
      return cv;
    })();

    this.shimmer = [];
    for (let i = 0; i < 4; i++) {
      this.shimmer.push({
        ox: rand(0.15, 0.85), oy: rand(0.15, 0.85),
        r: rand(0.18, 0.35),
        sx: rand(0.02, 0.05) * (Math.random() < 0.5 ? -1 : 1),
        sy: rand(0.015, 0.04) * (Math.random() < 0.5 ? -1 : 1),
        phase: rand(0, TAU),
      });
    }
  }

  // Convert scene coords to grid coords.
  toGrid(x, y) {
    const { pond } = this.layout;
    return {
      gx: ((x - pond.x) / pond.w) * this.gw,
      gy: ((y - pond.y) / pond.h) * this.gh,
    };
  }

  // Add a disturbance at scene coords. strength ~ 0.1 (subtle) to 3 (big poke).
  disturb(x, y, strength, radius = 1.6) {
    const { gx, gy } = this.toGrid(x, y);
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const px = Math.round(gx + dx);
        const py = Math.round(gy + dy);
        if (px < 1 || px >= this.gw - 1 || py < 1 || py >= this.gh - 1) continue;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > radius) continue;
        const falloff = Math.cos((d / radius) * Math.PI * 0.5);
        this.cur[py * this.gw + px] -= strength * falloff;
      }
    }
  }

  // Amplitude at scene coords, used for e.g. bobbing lily pads.
  heightAt(x, y) {
    const { gx, gy } = this.toGrid(x, y);
    const px = clamp(Math.round(gx), 1, this.gw - 2);
    const py = clamp(Math.round(gy), 1, this.gh - 2);
    return this.cur[py * this.gw + px];
  }

  update() {
    // Sim every other tick — cheaper, and slows the wave speed pleasantly.
    this.tick++;
    if (this.tick % 2 !== 0) return;

    const { prev, cur, gw, gh, absorb } = this;
    for (let y = 1; y < gh - 1; y++) {
      const row = y * gw;
      for (let x = 1; x < gw - 1; x++) {
        const i = row + x;
        prev[i] = ((cur[i - 1] + cur[i + 1] + cur[i - gw] + cur[i + gw]) / 2 - prev[i]) * DAMP * absorb[i];
      }
    }
    const t = this.prev; this.prev = this.cur; this.cur = t;
    this.renderField();
  }

  renderField() {
    const { cur, gw, gh, img } = this;
    const data = img.data;
    for (let y = 1; y < gh - 1; y++) {
      const row = y * gw;
      for (let x = 1; x < gw - 1; x++) {
        const i = row + x;
        // Horizontal + a touch of vertical gradient for lighting.
        const dx = cur[i + 1] - cur[i - 1];
        const dyv = cur[i + gw] - cur[i - gw];
        const s = dx + dyv * 0.5;
        const o = i * 4;
        if (s > 0.005) {
          // Highlight: warm-white.
          const a = clamp(s * 520, 0, 200);
          data[o] = 228; data[o + 1] = 242; data[o + 2] = 248; data[o + 3] = a;
        } else if (s < -0.005) {
          // Shadow: deep blue-green.
          const a = clamp(-s * 440, 0, 160);
          data[o] = 10; data[o + 1] = 28; data[o + 2] = 40; data[o + 3] = a;
        } else {
          data[o + 3] = 0;
        }
      }
    }
    this.imgCtx.putImageData(img, 0, 0);

    // Refresh the blurred pond-sized cache (runs at sim rate, not draw rate).
    const bc = this.blurCtx;
    bc.clearRect(0, 0, this.blurCanvas.width, this.blurCanvas.height);
    bc.imageSmoothingEnabled = true;
    bc.filter = 'blur(2px)';
    bc.drawImage(this.canvas, 0, 0, this.blurCanvas.width, this.blurCanvas.height);
    bc.filter = 'none';
  }

  // Draw shimmer + ripple overlay, clipped to the pond.
  draw(ctx, time) {
    const { pond, pondRadius } = this.layout;
    ctx.save();
    roundedRectPath(ctx, pond.x, pond.y, pond.w, pond.h, pondRadius);
    ctx.clip();

    // Caustic shimmer: large soft radial blobs drifting on slow sines,
    // stamped from the shared pre-rendered sprite.
    ctx.globalCompositeOperation = 'soft-light';
    for (const b of this.shimmer) {
      const bx = pond.x + (b.ox + Math.sin(time * b.sx * TAU + b.phase) * 0.09) * pond.w;
      const by = pond.y + (b.oy + Math.cos(time * b.sy * TAU + b.phase * 1.7) * 0.07) * pond.h;
      const br = b.r * Math.min(pond.w, pond.h) * (1 + 0.12 * Math.sin(time * 0.11 * TAU + b.phase));
      ctx.drawImage(this.blobSprite, bx - br, by - br, br * 2, br * 2);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Ripple field: pre-blurred at sim rate in renderField.
    ctx.drawImage(this.blurCanvas, pond.x, pond.y, pond.w, pond.h);

    ctx.restore();
  }
}
