// Ambient life: drifting lily pads, an occasional dragonfly, falling leaves.
import { PALETTE, TAU, rand, pick, clamp } from './util.js';

export class Ambient {
  constructor(layout) {
    this.resize(layout);
    this.dragonfly = null;
    this.dragonflyTimer = rand(8, 25);
    this.leaves = [];
    this.leafTimer = rand(6, 20);
  }

  resize(layout) {
    this.layout = layout;
    const { pond } = layout;
    // Two clusters of lily pads (like the reference photo: one corner cluster,
    // one small mid-pond group).
    this.pads = [];
    const clusters = [
      { cx: pond.x + pond.w * 0.16, cy: pond.y + pond.h * 0.78, n: 4, r: pond.w * 0.1 },
      { cx: pond.x + pond.w * 0.58, cy: pond.y + pond.h * 0.3, n: 2, r: pond.w * 0.06 },
    ];
    for (const c of clusters) {
      for (let i = 0; i < c.n; i++) {
        const a = rand(0, TAU);
        const d = rand(0, c.r);
        this.pads.push({
          ax: c.cx + Math.cos(a) * d,
          ay: c.cy + Math.sin(a) * d,
          x: 0, y: 0,
          r: rand(0.55, 1) * Math.min(pond.w, pond.h) * 0.055,
          rot: rand(0, TAU),
          rotSpeed: rand(-0.02, 0.02),
          notch: rand(0, TAU),
          phase: rand(0, TAU),
          driftR: rand(2, 6),
          nudgeX: 0, nudgeY: 0,
          tone: rand(-1, 1),
          flower: false,
        });
      }
    }
    // One pink lotus on a random pad in the big cluster.
    if (this.pads.length) this.pads[Math.floor(rand(0, 3.99))].flower = true;
  }

  update(dt, time, fishes, water, audio) {
    const { pond } = this.layout;

    // Lily pads: slow orbit around anchor + spring back from nudges.
    for (const p of this.pads) {
      p.rot += p.rotSpeed * dt;
      p.nudgeX *= Math.exp(-dt * 1.6);
      p.nudgeY *= Math.exp(-dt * 1.6);
      // Fish passing beneath nudges the pad.
      for (const f of fishes) {
        const d = Math.hypot(f.x - p.ax, f.y - p.ay);
        if (d < p.r && f.speed > 5) {
          p.nudgeX += (p.ax - f.x) / (d + 1) * dt * 14;
          p.nudgeY += (p.ay - f.y) / (d + 1) * dt * 14;
        }
      }
      // Ripples rock the pad slightly.
      const h = water.heightAt(p.ax, p.ay);
      p.x = p.ax + Math.sin(time * 0.13 * TAU + p.phase) * p.driftR + p.nudgeX + h * 2;
      p.y = p.ay + Math.cos(time * 0.09 * TAU + p.phase * 1.6) * p.driftR * 0.8 + p.nudgeY + h * 2;
    }

    // Dragonfly.
    this.dragonflyTimer -= dt;
    if (!this.dragonfly && this.dragonflyTimer <= 0) {
      this.dragonfly = {
        x: pond.x - 40, y: pond.y + rand(0.2, 0.8) * pond.h,
        tx: pond.x + rand(0.2, 0.8) * pond.w, ty: pond.y + rand(0.2, 0.8) * pond.h,
        state: 'dash', hoverT: 0, dashes: Math.floor(rand(2, 5)), landed: 0,
      };
    }
    if (this.dragonfly) this.updateDragonfly(dt);

    // Falling leaves.
    this.leafTimer -= dt;
    if (this.leafTimer <= 0) {
      this.leafTimer = rand(20, 60);
      this.leaves.push({
        x: pond.x + rand(0.1, 0.9) * pond.w,
        y: this.layout.pond.y - rand(60, 140),
        vy: rand(18, 26),
        swayA: rand(0, TAU),
        swayR: rand(14, 26),
        rot: rand(0, TAU),
        age: 0,
        floating: false,
        tone: pick(['#c9a05a', '#b58a45', '#d4b06a', '#a8793a']),
      });
    }
    for (const leaf of this.leaves) {
      leaf.age += dt;
      if (!leaf.floating) {
        leaf.swayA += dt * 1.8;
        leaf.x += Math.cos(leaf.swayA) * leaf.swayR * dt;
        leaf.y += leaf.vy * dt * (0.75 + 0.45 * Math.abs(Math.sin(leaf.swayA)));
        leaf.rot = Math.sin(leaf.swayA) * 0.6;
        if (leaf.y >= pond.y + 10 && leaf.y <= pond.y + pond.h - 6) {
          // Only "lands on water" if horizontally over the pond.
          if (leaf.x > pond.x + 6 && leaf.x < pond.x + pond.w - 6 && leaf.y > pond.y + pond.h * 0.3) {
            leaf.floating = true;
            leaf.floatAge = 0;
            water.disturb(leaf.x, leaf.y, 0.4, 2.2);
            audio.leafDrop();
          }
        }
        if (leaf.y > this.layout.vh + 30) leaf.age = 999;
      } else {
        leaf.floatAge += dt;
        leaf.x += Math.sin(leaf.age * 0.4) * 2.4 * dt;
        leaf.y += Math.cos(leaf.age * 0.3) * 1.6 * dt;
        leaf.rot += dt * 0.1;
        if (leaf.floatAge > 20) leaf.age = 999;
      }
    }
    this.leaves = this.leaves.filter(l => l.age < 900);
  }

  updateDragonfly(dt) {
    const d = this.dragonfly;
    const { pond, vw } = this.layout;
    if (d.state === 'dash') {
      const dx = d.tx - d.x, dy = d.ty - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 4) {
        d.dashes--;
        if (d.dashes <= 0) {
          // Fly off.
          d.tx = vw + 60; d.ty = pond.y - 40;
          d.state = 'leave';
        } else if (Math.random() < 0.3 && this.pads.length) {
          const pad = pick(this.pads);
          d.tx = pad.x; d.ty = pad.y - 2;
          d.state = 'land';
          d.landed = rand(1.5, 3.5);
        } else {
          d.state = 'hover';
          d.hoverT = rand(0.8, 2);
        }
      } else {
        const sp = 260;
        d.x += (dx / dist) * sp * dt;
        d.y += (dy / dist) * sp * dt;
      }
    } else if (d.state === 'hover') {
      d.hoverT -= dt;
      d.x += rand(-1, 1) * 30 * dt;
      d.y += rand(-1, 1) * 30 * dt;
      if (d.hoverT <= 0) {
        d.tx = pond.x + rand(0.1, 0.9) * pond.w;
        d.ty = pond.y + rand(0.1, 0.9) * pond.h;
        d.state = 'dash';
      }
    } else if (d.state === 'land') {
      const dx = d.tx - d.x, dy = d.ty - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) {
        d.landed -= dt;
        if (d.landed <= 0) {
          d.tx = pond.x + rand(0.1, 0.9) * pond.w;
          d.ty = pond.y + rand(0.1, 0.9) * pond.h;
          d.state = 'dash';
        }
      } else {
        d.x += (dx / dist) * 120 * dt;
        d.y += (dy / dist) * 120 * dt;
      }
    } else if (d.state === 'leave') {
      const dx = d.tx - d.x, dy = d.ty - d.y;
      const dist = Math.hypot(dx, dy);
      d.x += (dx / dist) * 300 * dt;
      d.y += (dy / dist) * 300 * dt;
      if (dist < 20) {
        this.dragonfly = null;
        this.dragonflyTimer = rand(30, 90);
      }
    }
  }

  drawPads(ctx, time) {
    for (const p of this.pads) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);

      // Soft shadow ring under the pad.
      ctx.fillStyle = 'rgba(15, 30, 22, 0.3)';
      ctx.beginPath();
      ctx.arc(1.5, 2.5, p.r, 0, TAU);
      ctx.fill();

      // Pad with a notch wedge.
      const g = ctx.createRadialGradient(-p.r * 0.3, -p.r * 0.3, 0, 0, 0, p.r);
      const light = p.tone > 0 ? PALETTE.lilyPadLight : PALETTE.lilyPad;
      g.addColorStop(0, light);
      g.addColorStop(1, PALETTE.lilyPadDark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, p.r, p.notch + 0.5, p.notch + TAU - 0.15);
      ctx.closePath();
      ctx.fill();

      // Rim + veins.
      ctx.strokeStyle = 'rgba(35, 60, 30, 0.4)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(35, 60, 30, 0.18)';
      for (let i = 0; i < 5; i++) {
        const a = p.notch + 0.8 + (i / 5) * (TAU - 1.3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * p.r * 0.85, Math.sin(a) * p.r * 0.85);
        ctx.stroke();
      }

      // Lotus flower.
      if (p.flower) {
        const petals = 7;
        const fr = p.r * 0.42;
        const bloom = 1 + 0.03 * Math.sin(time * 0.3 * TAU);
        for (let i = 0; i < petals; i++) {
          const a = (i / petals) * TAU + 0.3;
          ctx.fillStyle = i % 2 ? '#e8a7b8' : '#f0bccb';
          ctx.beginPath();
          ctx.ellipse(
            Math.cos(a) * fr * 0.5 * bloom, Math.sin(a) * fr * 0.5 * bloom,
            fr * 0.55, fr * 0.26, a, 0, TAU
          );
          ctx.fill();
        }
        ctx.fillStyle = '#f5d76e';
        ctx.beginPath();
        ctx.arc(0, 0, fr * 0.22, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawFlyers(ctx, time) {
    // Leaves.
    for (const leaf of this.leaves) {
      ctx.save();
      ctx.translate(leaf.x, leaf.y);
      ctx.rotate(leaf.rot);
      const fade = leaf.floating && leaf.floatAge > 17 ? (20 - leaf.floatAge) / 3 : 1;
      ctx.globalAlpha = clamp(fade, 0, 1);
      ctx.fillStyle = leaf.tone;
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 3.2, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120, 85, 40, 0.5)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.lineTo(7, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // Dragonfly.
    const d = this.dragonfly;
    if (d) {
      ctx.save();
      ctx.translate(d.x, d.y);
      const moving = d.state === 'dash' || d.state === 'leave';
      const angle = moving ? Math.atan2(d.ty - d.y, d.tx - d.x) : Math.sin(time * 2) * 0.3;
      ctx.rotate(angle);
      // Wings: blurred flickering ellipses (still when landed).
      if (d.state !== 'land' || d.landed > 3) {
        ctx.fillStyle = `rgba(220, 235, 245, ${0.25 + 0.3 * Math.abs(Math.sin(time * 60))})`;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(-1, side * 5, 8, 2.6, side * 0.5, 0, TAU);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(-4, side * 4.5, 7, 2.2, side * 0.7, 0, TAU);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = 'rgba(220, 235, 245, 0.45)';
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(-2, side * 3, 8, 2, side * 0.15, 0, TAU);
          ctx.fill();
        }
      }
      // Body: thin capsule.
      ctx.strokeStyle = '#3a6a8a';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(-9, 0);
      ctx.stroke();
      ctx.fillStyle = '#2d5570';
      ctx.beginPath();
      ctx.arc(4.5, 0, 2.2, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}
