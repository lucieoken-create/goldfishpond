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
    // Three clusters of lily pads (like the reference photo: a big corner
    // cluster plus smaller drifting groups).
    this.pads = [];
    const clusters = [
      { cx: pond.x + pond.w * 0.16, cy: pond.y + pond.h * 0.75, n: 5, r: pond.w * 0.11 },
      { cx: pond.x + pond.w * 0.6, cy: pond.y + pond.h * 0.26, n: 3, r: pond.w * 0.07 },
      { cx: pond.x + pond.w * 0.85, cy: pond.y + pond.h * 0.66, n: 3, r: pond.w * 0.08 },
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

    // A little frog perched on the largest flowerless pad.
    let best = -1;
    for (let i = 0; i < this.pads.length; i++) {
      if (!this.pads[i].flower && (best < 0 || this.pads[i].r > this.pads[best].r)) best = i;
    }
    this.frog = best < 0 ? null : {
      padIdx: best, fromIdx: best,
      x: 0, y: 0,
      size: this.pads[best].r * 0.58,
      angle: rand(0, TAU),
      hopT: -1,
      nextHop: rand(15, 40),
      blinkT: 0,
      throatT: 0,
      croakT: rand(10, 30),
    };
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

    this.updateFrog(dt, water, audio);

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

  updateFrog(dt, water, audio) {
    const f = this.frog;
    if (!f) return;

    f.blinkT = Math.max(0, f.blinkT - dt);
    if (f.blinkT <= 0 && Math.random() < dt / 6) f.blinkT = 0.16;

    f.throatT = Math.max(0, f.throatT - dt);
    f.croakT -= dt;
    if (f.croakT <= 0) {
      f.croakT = rand(20, 55);
      f.throatT = 0.5;
      audio.croak();
    }

    if (f.hopT >= 0) {
      // Mid-hop: ease between pads.
      f.hopT += dt / 0.5;
      const from = this.pads[f.fromIdx], to = this.pads[f.padIdx];
      const t = Math.min(1, f.hopT);
      const e = t * t * (3 - 2 * t);
      f.x = from.x + (to.x - from.x) * e;
      f.y = from.y + (to.y - from.y) * e;
      if (t >= 1) {
        f.hopT = -1;
        // Landing rocks the pad and sends a soft ring out from under it.
        to.nudgeX += Math.cos(f.angle) * 3;
        to.nudgeY += Math.sin(f.angle) * 3;
        water.disturb(to.x, to.y, 0.3, 2.4);
        audio.plip(0.35, 0.8);
      }
    } else {
      const pad = this.pads[f.padIdx];
      f.x = pad.x;
      f.y = pad.y;
      f.nextHop -= dt;
      if (f.nextHop <= 0 && this.pads.length > 1) {
        f.nextHop = rand(18, 45);
        f.fromIdx = f.padIdx;
        let n;
        do { n = Math.floor(rand(0, this.pads.length)); } while (n === f.padIdx || this.pads[n].flower);
        f.padIdx = n;
        f.angle = Math.atan2(this.pads[n].y - pad.y, this.pads[n].x - pad.x);
        f.hopT = 0;
      }
    }
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

    this.drawFrog(ctx, time);
  }

  // A little top-down frog: plump body, bulgy eyes, folded back legs.
  drawFrog(ctx, time) {
    const f = this.frog;
    if (!f) return;
    const s = f.size;
    const hop = f.hopT >= 0 ? Math.sin(Math.min(1, f.hopT) * Math.PI) : 0;

    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.angle);
    ctx.scale(1 + hop * 0.35, 1 + hop * 0.35); // rises toward the camera mid-hop
    const breathe = 1 + 0.04 * Math.sin(time * TAU * 0.5);

    // Soft dark ground shadow so he pops off the pad.
    ctx.fillStyle = 'rgba(20, 40, 20, 0.3)';
    ctx.beginPath();
    ctx.ellipse(-s * 0.05, s * 0.12, s * 1.15, s * 0.8, 0, 0, TAU);
    ctx.fill();

    // Folded back legs.
    ctx.fillStyle = '#5e8f3c';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(-s * 0.5, side * s * 0.52, s * 0.52, s * 0.22, side * 0.45, 0, TAU);
      ctx.fill();
    }

    // Body — warmer, yellower green than the pads so he reads instantly.
    const g = ctx.createRadialGradient(s * 0.25, -s * 0.2, 0, 0, 0, s * 1.2);
    g.addColorStop(0, '#a8cf68');
    g.addColorStop(1, '#6fa344');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.95 * breathe, s * 0.68 * breathe, 0, 0, TAU);
    ctx.fill();

    // Dorsal stripe + mottling.
    ctx.strokeStyle = 'rgba(228, 240, 190, 0.5)';
    ctx.lineWidth = s * 0.12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 0.68, 0);
    ctx.lineTo(s * 0.5, 0);
    ctx.stroke();
    ctx.fillStyle = 'rgba(60, 92, 44, 0.5)';
    for (const [mx, my] of [[-0.3, 0.3], [0.1, -0.35], [-0.45, -0.2], [0.3, 0.28]]) {
      ctx.beginPath();
      ctx.arc(mx * s, my * s, s * 0.09, 0, TAU);
      ctx.fill();
    }

    // Throat puff while croaking.
    if (f.throatT > 0) {
      const p = Math.sin((0.5 - f.throatT) / 0.5 * Math.PI);
      ctx.fillStyle = 'rgba(235, 232, 195, 0.9)';
      ctx.beginPath();
      ctx.ellipse(s * 0.62, 0, s * 0.28 * (0.4 + p * 0.8), s * 0.24 * (0.4 + p * 0.8), 0, 0, TAU);
      ctx.fill();
    }

    // Bulgy eyes (with blink).
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#6a9a48';
      ctx.beginPath();
      ctx.arc(s * 0.6, side * s * 0.36, s * 0.26, 0, TAU);
      ctx.fill();
      if (f.blinkT <= 0) {
        ctx.fillStyle = '#1e2415';
        ctx.beginPath();
        ctx.arc(s * 0.65, side * s * 0.36, s * 0.13, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(s * 0.69, side * s * 0.31, s * 0.05, 0, TAU);
        ctx.fill();
      } else {
        ctx.strokeStyle = '#3d5c2c';
        ctx.lineWidth = s * 0.06;
        ctx.beginPath();
        ctx.arc(s * 0.65, side * s * 0.36, s * 0.12, 0.3, Math.PI - 0.3);
        ctx.stroke();
      }
    }

    // Front feet.
    ctx.fillStyle = '#4f7a38';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * 0.78, side * s * 0.5, s * 0.11, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
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
