// Food cup + pellet lifecycle. Tap the cup to arm feeding, tap water to
// scatter; or drag the cup over the water and release.
import { TAU, rand, gauss, clamp, roundedRectSDF } from './util.js';

const MAX_PELLETS = 30;
const PELLET_LIFE = 30;

export class Food {
  constructor(layout) {
    this.layout = layout;
    this.pellets = [];
    this.armed = false;
    this.dragging = false;
    this.dragX = 0;
    this.dragY = 0;
    this.returnT = 1;       // 0→1 cup flying back to its perch
    this.returnFrom = null;
    this.wobble = 0;
  }

  resize(layout) {
    this.layout = layout;
  }

  cupPos() {
    const { cup } = this.layout;
    if (this.dragging) return { x: this.dragX, y: this.dragY };
    if (this.returnT < 1 && this.returnFrom) {
      const t = 1 - Math.pow(1 - this.returnT, 3); // ease-out
      return {
        x: this.returnFrom.x + (cup.x - this.returnFrom.x) * t,
        y: this.returnFrom.y + (cup.y - this.returnFrom.y) * t,
      };
    }
    return { x: cup.x, y: cup.y };
  }

  hitsCup(x, y) {
    const p = this.cupPos();
    return Math.hypot(x - p.x, y - p.y) < this.layout.cup.r * 1.6;
  }

  overWater(x, y) {
    return roundedRectSDF(x, y, this.layout.pond, this.layout.pondRadius) < -4;
  }

  startDrag(x, y) {
    this.dragging = true;
    this.armed = true;
    this.dragX = x;
    this.dragY = y;
  }

  moveDrag(x, y) {
    if (!this.dragging) return;
    this.dragX = x;
    this.dragY = y;
  }

  // Returns true if food was scattered.
  endDrag(water, audio) {
    if (!this.dragging) return false;
    this.dragging = false;
    this.returnFrom = { x: this.dragX, y: this.dragY };
    this.returnT = 0;
    if (this.overWater(this.dragX, this.dragY)) {
      this.scatter(this.dragX, this.dragY, water, audio);
      this.armed = false;
      return true;
    }
    // Dropped on land: stay armed if it barely moved (treat as a tap).
    const { cup } = this.layout;
    const moved = Math.hypot(this.dragX - cup.x, this.dragY - cup.y);
    this.armed = moved < cup.r * 1.5;
    return false;
  }

  // Tap on water while armed.
  feedAt(x, y, water, audio) {
    if (!this.armed || !this.overWater(x, y)) return false;
    this.scatter(x, y, water, audio);
    this.armed = false;
    return true;
  }

  scatter(x, y, water, audio) {
    const n = Math.round(rand(6, 10));
    const { pond, pondRadius } = this.layout;
    // Keep pellets on water the fish can actually reach: inset far enough
    // from the wall for the biggest fish (head clamped size*1.1 away, eat
    // radius size*0.55) and inside the rounded-corner arcs.
    const inset = Math.max(12, Math.min(pond.w, pond.h) * 0.06, pondRadius * 0.35);
    for (let i = 0; i < n; i++) {
      if (this.pellets.length >= MAX_PELLETS) break;
      const px = clamp(x + gauss(0, 22), pond.x + inset, pond.x + pond.w - inset);
      const py = clamp(y + gauss(0, 22), pond.y + inset, pond.y + pond.h - inset);
      const delay = i * rand(0.04, 0.1);
      this.pellets.push({
        x: px, y: py,
        age: -delay,             // negative age = still falling
        phase: rand(0, TAU),
        driftA: rand(0, TAU),
        eaten: false,
        splashed: false,
      });
    }
    this.wobble = 1;
    audio.plipCluster(n);
  }

  update(dt, water) {
    this.returnT = Math.min(1, this.returnT + dt * 2.2);
    this.wobble *= Math.exp(-dt * 4);

    for (const p of this.pellets) {
      p.age += dt;
      if (p.age >= 0 && !p.splashed) {
        p.splashed = true;
        water.disturb(p.x, p.y, 0.3, 1.3);
      }
      if (p.age > 0) {
        // Slow drift.
        p.driftA += gauss(0, 0.4) * dt;
        p.x += Math.cos(p.driftA) * 2.4 * dt;
        p.y += Math.sin(p.driftA) * 2.4 * dt;
      }
    }
    this.pellets = this.pellets.filter(p => !p.eaten && p.age < PELLET_LIFE);
  }

  drawPellets(ctx, time) {
    for (const p of this.pellets) {
      if (p.age < 0) continue;
      const bob = Math.sin(time * 2.2 * TAU * 0.35 + p.phase);
      const r = 2.2 + bob * 0.35;
      const fade = p.age > PELLET_LIFE - 3 ? (PELLET_LIFE - p.age) / 3 : 1;
      const appear = clamp(p.age * 5, 0, 1);
      ctx.globalAlpha = 0.9 * fade * appear;
      ctx.fillStyle = '#c9a05a';
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob * 0.4, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 235, 190, 0.55)';
      ctx.beginPath();
      ctx.arc(p.x - r * 0.3, p.y + bob * 0.4 - r * 0.3, r * 0.4, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawCup(ctx, time) {
    const { cup } = this.layout;
    const p = this.cupPos();
    const r = cup.r;
    const lift = this.armed || this.dragging ? 1 : 0;
    const tilt = (this.armed && !this.dragging ? Math.sin(time * TAU * 0.5) * 0.06 : 0)
      + this.wobble * Math.sin(time * TAU * 3) * 0.15
      + (this.dragging ? 0.35 : 0);

    ctx.save();
    ctx.translate(p.x, p.y - lift * 6);
    ctx.rotate(tilt);

    // Shadow.
    ctx.fillStyle = 'rgba(60, 50, 30, 0.28)';
    ctx.beginPath();
    ctx.ellipse(2, r * 0.75 + lift * 6, r * 0.95, r * 0.4, 0, 0, TAU);
    ctx.fill();

    // Terracotta cup body (viewed from a soft top-down angle).
    const body = ctx.createLinearGradient(-r, 0, r, 0);
    body.addColorStop(0, '#b56a45');
    body.addColorStop(0.5, '#cc8258');
    body.addColorStop(1, '#a05c3c');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-r * 0.85, -r * 0.35);
    ctx.lineTo(r * 0.85, -r * 0.35);
    ctx.lineTo(r * 0.62, r * 0.72);
    ctx.quadraticCurveTo(0, r * 0.92, -r * 0.62, r * 0.72);
    ctx.closePath();
    ctx.fill();

    // Rim.
    ctx.fillStyle = '#8f4f33';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.35, r * 0.85, r * 0.34, 0, 0, TAU);
    ctx.fill();
    // Food inside.
    ctx.fillStyle = '#c9a05a';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.35, r * 0.68, r * 0.26, 0, 0, TAU);
    ctx.fill();
    // A few pellet dots on top.
    ctx.fillStyle = '#a87f42';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.7;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.34, -r * 0.35 + Math.sin(a) * r * 0.13, r * 0.07, 0, TAU);
      ctx.fill();
    }

    // Armed glow ring.
    if (this.armed && !this.dragging) {
      ctx.strokeStyle = `rgba(255, 245, 210, ${0.4 + 0.25 * Math.sin(time * TAU * 0.9)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0.1 * r, r * 1.25, r * 1.05, 0, 0, TAU);
      ctx.stroke();
    }

    ctx.restore();
  }
}
