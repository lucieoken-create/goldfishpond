// Goldfish: heading-based steering (wander, containment, separation,
// seek food, startle) and procedural top-down drawing with a swaying spine.
import { PALETTE, TAU, rand, pick, clamp, angleDiff, roundedRectSDF, gauss } from './util.js';

const SPINE = 5;

const SCHEMES = [
  { body: '#e8853a', belly: '#f2a45e', fins: 'rgba(240, 150, 80, 0.55)', patch: null },
  { body: '#e8853a', belly: '#f2a45e', fins: 'rgba(240, 150, 80, 0.55)', patch: null },
  { body: '#d46a25', belly: '#e8853a', fins: 'rgba(220, 130, 60, 0.55)', patch: null },
  { body: '#f2ede2', belly: '#faf6ee', fins: 'rgba(250, 240, 225, 0.5)', patch: '#e8853a' },
  { body: '#f2ede2', belly: '#faf6ee', fins: 'rgba(250, 240, 225, 0.5)', patch: '#d9482f' },
  { body: '#e89b4f', belly: '#f2b877', fins: 'rgba(240, 170, 100, 0.55)', patch: '#f2ede2' },
];

export class Fish {
  constructor(layout, i) {
    const { pond } = layout;
    this.sizeFactor = rand(0.8, 1.25);
    this.size = this.sizeFactor * Math.min(pond.w, pond.h) / 16;
    this.x = rand(pond.x + pond.w * 0.25, pond.x + pond.w * 0.75);
    this.y = rand(pond.y + pond.h * 0.25, pond.y + pond.h * 0.75);
    this.heading = rand(0, TAU);
    this.cruise = rand(14, 24);           // px/s
    this.speed = this.cruise;
    this.burst = 0;                       // startle boost, decays
    this.swayPhase = rand(0, TAU);
    this.wanderPhase = rand(0, TAU);
    this.wanderPhase2 = rand(0, TAU);
    this.wanderRate = rand(0.2, 0.45);
    this.scheme = SCHEMES[i % SCHEMES.length];
    this.patchSeed = rand(0, TAU);
    this.eatCooldown = 0;
    this.gulpTimer = 0;
    this.target = null;                   // pellet being chased
  }

  // Re-derive size for a new pond and carry position across proportionally.
  resize(pond, prevPond) {
    this.size = this.sizeFactor * Math.min(pond.w, pond.h) / 16;
    this.x = pond.x + (this.x - prevPond.x) / prevPond.w * pond.w;
    this.y = pond.y + (this.y - prevPond.y) / prevPond.h * pond.h;
  }

  update(dt, layout, fishes, pellets, water, audio, time) {
    const { pond, pondRadius } = layout;

    // --- Desired heading -------------------------------------------------
    // Wander: two slow sines + jitter.
    this.wanderPhase += dt * this.wanderRate * TAU * 0.16;
    this.wanderPhase2 += dt * this.wanderRate * TAU * 0.07;
    let desired = this.heading
      + Math.sin(this.wanderPhase) * 0.5 * dt * TAU * 0.2
      + Math.sin(this.wanderPhase2) * 0.9 * dt * TAU * 0.13
      + gauss(0, 0.25) * dt;

    let urgency = 1; // turn-rate multiplier

    // Seek food (skip while startled).
    this.eatCooldown = Math.max(0, this.eatCooldown - dt);
    this.gulpTimer = Math.max(0, this.gulpTimer - dt);
    if (this.burst < 6 && this.eatCooldown <= 0 && pellets.length) {
      let best = null, bestD = Math.min(pond.w, pond.h) * 0.55;
      for (const p of pellets) {
        if (p.eaten) continue;
        const d = Math.hypot(p.x - this.x, p.y - this.y);
        if (d < bestD) { bestD = d; best = p; }
      }
      this.target = best;
      if (best) {
        desired = Math.atan2(best.y - this.y, best.x - this.x);
        urgency = 2.2;
        // Eat when close.
        if (bestD < this.size * 0.55) {
          best.eaten = true;
          this.eatCooldown = rand(1.2, 2.8);
          this.gulpTimer = 0.5;
          water.disturb(best.x, best.y, 0.35, 1.4);
          audio.gulp();
        }
      }
    } else {
      this.target = null;
    }

    // Separation from other fish.
    for (const other of fishes) {
      if (other === this) continue;
      const dx = this.x - other.x, dy = this.y - other.y;
      const d = Math.hypot(dx, dy);
      const minD = (this.size + other.size) * 1.4;
      if (d < minD && d > 0.001) {
        const away = Math.atan2(dy, dx);
        const w = (1 - d / minD) * 1.6;
        desired += angleDiff(desired, away) * clamp(w, 0, 0.8);
      }
    }

    // Containment: steer toward center when near the pond wall. The margin
    // is generous because pos is the HEAD — body and tail trail well behind.
    const margin = this.size * 2.6;
    const sdf = roundedRectSDF(this.x, this.y, pond, pondRadius);
    if (sdf > -margin) {
      const cx = pond.x + pond.w / 2, cy = pond.y + pond.h / 2;
      const toCenter = Math.atan2(cy - this.y, cx - this.x);
      const pen = clamp((sdf + margin) / margin, 0, 1);
      desired += angleDiff(desired, toCenter) * pen * 0.9;
      urgency = Math.max(urgency, 1 + pen * 2.5);
    }

    // --- Integrate --------------------------------------------------------
    this.burst *= Math.exp(-dt * 2.6);
    if (this.burst < 0.3) this.burst = 0;

    const targetSpeed = this.target ? this.cruise * 2.4 : this.cruise;
    this.speed += (targetSpeed + this.burst * 18 - this.speed) * clamp(dt * 3, 0, 1);

    const maxTurn = (this.burst > 3 ? 9 : 2.4) * urgency * dt;
    this.heading += clamp(angleDiff(this.heading, desired), -maxTurn, maxTurn);

    const px = this.x, py = this.y;
    this.x += Math.cos(this.heading) * this.speed * dt;
    this.y += Math.sin(this.heading) * this.speed * dt;

    // Hard safety clamp inside pond.
    const pad = this.size * 1.1;
    this.x = clamp(this.x, pond.x + pad, pond.x + pond.w - pad);
    this.y = clamp(this.y, pond.y + pad, pond.y + pond.h - pad);

    // Sway advances with distance traveled; amplitude with speed.
    const moved = Math.hypot(this.x - px, this.y - py);
    this.swayPhase += moved / (this.size * 0.5);

    // Wake ripples when moving fast.
    if (this.speed > this.cruise * 1.8 && Math.random() < dt * 14) {
      const tailX = this.x - Math.cos(this.heading) * this.size;
      const tailY = this.y - Math.sin(this.heading) * this.size;
      water.disturb(tailX, tailY, 0.12, 1.2);
    }
  }

  startle(x, y) {
    const d = Math.hypot(this.x - x, this.y - y);
    const radius = this.size * 8;
    if (d > radius) return;
    const away = Math.atan2(this.y - y, this.x - x);
    this.heading = away + gauss(0, 0.3);
    this.burst = 8 * (1 - d / radius) + 3;
    this.target = null;
    this.eatCooldown = Math.max(this.eatCooldown, 1);
  }

  // Spine points trail behind the head with sinusoidal sway.
  spinePoints() {
    const pts = [];
    const swayAmp = 0.10 + clamp(this.speed / 90, 0, 0.3);
    const segLen = this.size * 0.42;
    let px = this.x, py = this.y;
    for (let i = 0; i < SPINE; i++) {
      const a = this.heading + Math.PI + Math.sin(this.swayPhase - i * 0.9) * swayAmp * (0.4 + i * 0.45);
      pts.push({ x: px, y: py, a });
      px += Math.cos(a) * segLen;
      py += Math.sin(a) * segLen;
    }
    return pts;
  }

  drawShadow(ctx) {
    ctx.save();
    ctx.translate(this.x + this.size * 0.35, this.y + this.size * 0.5);
    ctx.rotate(this.heading);
    ctx.fillStyle = 'rgba(12, 24, 18, 0.25)';
    ctx.filter = 'blur(3px)';
    ctx.beginPath();
    ctx.ellipse(-this.size * 0.5, 0, this.size * 1.05, this.size * 0.38, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  draw(ctx) {
    const pts = this.spinePoints();
    const s = this.size;
    // Half-widths along the spine: head → tail.
    const widths = [0.34, 0.42, 0.36, 0.2, 0.08].map(w => w * s);

    // Left/right outline points.
    const left = [], right = [];
    for (let i = 0; i < SPINE; i++) {
      const perp = pts[i].a + Math.PI / 2;
      left.push({ x: pts[i].x + Math.cos(perp) * widths[i], y: pts[i].y + Math.sin(perp) * widths[i] });
      right.push({ x: pts[i].x - Math.cos(perp) * widths[i], y: pts[i].y - Math.sin(perp) * widths[i] });
    }

    // Tail: two curved lobes at the last segment with extra sway.
    const tail = pts[SPINE - 1];
    const tailSway = Math.sin(this.swayPhase - SPINE * 0.9) * 0.5;
    const tailLen = s * 0.75;
    const tailA = tail.a + tailSway * 0.35;

    ctx.save();

    // Tail lobes (drawn first, under the body).
    ctx.fillStyle = this.scheme.fins;
    for (const side of [-0.45, 0.45]) {
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      const la = tailA + side + tailSway * 0.3;
      const tipX = tail.x + Math.cos(la) * tailLen;
      const tipY = tail.y + Math.sin(la) * tailLen;
      const midA = tailA + side * 0.4;
      ctx.quadraticCurveTo(
        tail.x + Math.cos(midA) * tailLen * 0.7, tail.y + Math.sin(midA) * tailLen * 0.7,
        tipX, tipY
      );
      ctx.quadraticCurveTo(
        tail.x + Math.cos(la) * tailLen * 0.5, tail.y + Math.sin(la) * tailLen * 0.5,
        tail.x, tail.y
      );
      ctx.fill();
    }

    // Pectoral fins mid-body.
    const finBase = pts[1];
    for (const side of [1, -1]) {
      const perp = finBase.a + (Math.PI / 2) * side;
      const finSway = Math.sin(this.swayPhase * 1.3 + side) * 0.15;
      ctx.beginPath();
      ctx.moveTo(finBase.x, finBase.y);
      const fx = finBase.x + Math.cos(perp + finSway) * s * 0.55;
      const fy = finBase.y + Math.sin(perp + finSway) * s * 0.55;
      ctx.quadraticCurveTo(
        finBase.x + Math.cos(perp - 0.5 * side) * s * 0.5,
        finBase.y + Math.sin(perp - 0.5 * side) * s * 0.5,
        fx, fy
      );
      ctx.quadraticCurveTo(
        finBase.x + Math.cos(perp + 0.3 * side) * s * 0.35,
        finBase.y + Math.sin(perp + 0.3 * side) * s * 0.35,
        finBase.x, finBase.y
      );
      ctx.fill();
    }

    // Body: smooth teardrop through the outline points.
    ctx.beginPath();
    const nose = {
      x: this.x + Math.cos(this.heading) * s * 0.45,
      y: this.y + Math.sin(this.heading) * s * 0.45,
    };
    ctx.moveTo(nose.x, nose.y);
    for (let i = 0; i < SPINE - 1; i++) {
      const mx = (left[i].x + left[i + 1].x) / 2, my = (left[i].y + left[i + 1].y) / 2;
      ctx.quadraticCurveTo(left[i].x, left[i].y, mx, my);
    }
    ctx.lineTo(tail.x, tail.y);
    for (let i = SPINE - 2; i >= 0; i--) {
      const mx = (right[i].x + right[i + 1].x) / 2, my = (right[i].y + right[i + 1].y) / 2;
      ctx.quadraticCurveTo(right[i + 1].x, right[i + 1].y, mx, my);
    }
    ctx.quadraticCurveTo(right[0].x, right[0].y, nose.x, nose.y);
    ctx.closePath();
    ctx.fillStyle = this.scheme.body;
    ctx.fill();

    // Patch (second clipped pass) for two-tone fish.
    if (this.scheme.patch) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = this.scheme.patch;
      const p1 = pts[Math.floor(1 + Math.abs(Math.sin(this.patchSeed)) * 2)];
      ctx.beginPath();
      ctx.ellipse(p1.x, p1.y, s * 0.5, s * 0.35, p1.a, 0, TAU);
      ctx.fill();
      // White-cap variant gets a head dot too.
      ctx.beginPath();
      ctx.ellipse(pts[0].x, pts[0].y, s * 0.28, s * 0.22, pts[0].a, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Dorsal highlight stripe — sells the top-down view.
    ctx.beginPath();
    ctx.moveTo(nose.x, nose.y);
    for (let i = 0; i < SPINE; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.strokeStyle = 'rgba(255, 245, 225, 0.35)';
    ctx.lineWidth = s * 0.13;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Gulp: little open-mouth ring when eating.
    if (this.gulpTimer > 0) {
      ctx.beginPath();
      ctx.arc(nose.x, nose.y, s * 0.12 * (1 + Math.sin(this.gulpTimer * 20)), 0, TAU);
      ctx.strokeStyle = 'rgba(80, 40, 20, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }
}

export function createSchool(layout) {
  const n = 6;
  const fishes = [];
  for (let i = 0; i < n; i++) fishes.push(new Fish(layout, i));
  return fishes;
}
