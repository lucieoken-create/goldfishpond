// The long-haired dachshund: procedural side-profile rig, walk cycle,
// and a visit state machine with pant/drink/shake/tilt variations.
import { TAU, rand, clamp, lerp } from './util.js';

const COAT = '#b5713a';
const COAT_DEEP = '#96562a';
const COAT_LIGHT = '#cf8f52';
const CREAM = '#d9a86c';
const TONGUE = '#e8798a';

// States
const OFFSCREEN = 'offscreen';
const ENTER = 'enter';
const LOOK_WATER = 'look';
const PANT = 'pant';
const DRINK = 'drink';
const TILT = 'tilt';
const PET = 'pet';
const EXIT = 'exit';

export class Dog {
  constructor(layout) {
    this.layout = layout;
    this.state = OFFSCREEN;
    this.timer = rand(4, 8); // first visit comes fairly quickly
    this.x = -999;
    this.dir = 1;
    this.walkPhase = 0;
    this.bob = 0;

    // Rig parameters (eased toward targets by states).
    this.headPitch = 0;      // + = muzzle raised toward the pond
    this.headPitchT = 0;
    this.faceBlend = 0;      // 0 side profile → 1 facing viewer
    this.faceBlendT = 0;
    this.headRoll = 0;       // tilt variation
    this.headRollT = 0;
    this.yOff = 0;           // shift up toward pond edge (drinking)
    this.yOffT = 0;
    this.tailWag = 0;        // wag speed multiplier
    this.tailWagT = 0.3;
    this.mouthOpen = 0;
    this.mouthOpenT = 0;
    this.jump = 0;
    this.hearts = [];
    this.visitT = 0;

    // Ear spring followers (angle offset, velocity).
    this.earA = 0; this.earV = 0;

    this.tongueT = 0;
    this.lapTimer = 0;
    this.pantChaser = false;
    this.stateT = 0;         // time in current state
    this.happyExit = false;
  }

  resize(layout) {
    this.layout = layout;
  }

  get scale() {
    return this.layout.dogScale;
  }

  setState(s, duration) {
    this.state = s;
    this.stateT = 0;
    this.timer = duration;
  }

  update(dt, water, audio, time) {
    const L = this.layout;
    const s = this.scale;
    const walkSpeed = 105 * s;
    this.stateT += dt;
    this.timer -= dt;

    // Watchdog: no visit should ever last more than ~30s. If a state machine
    // hiccup leaves the dog stranded, walk her off gracefully.
    if (this.state === OFFSCREEN) {
      this.visitT = 0;
    } else if (this.state !== EXIT) {
      this.visitT += dt;
      if (this.visitT > 30) {
        this.faceBlendT = 0;
        this.mouthOpenT = 0;
        this.yOffT = 0;
        this.jump = 0;
        this.setState(EXIT, 30);
      }
    }

    // Hearts float up and fade.
    for (const h of this.hearts) {
      h.age += dt;
      h.y -= 30 * s * dt;
      h.x += Math.sin(h.age * 5) * 7 * dt;
    }
    this.hearts = this.hearts.filter(h => h.age < 1.6);

    switch (this.state) {
      case OFFSCREEN:
        if (this.timer <= 0) {
          this.dir = Math.random() < 0.5 ? 1 : -1;
          this.x = this.dir === 1 ? -80 * s : L.vw + 80 * s;
          // Stop somewhere along the middle stretch of the pond.
          this.stopX = L.pond.x + L.pond.w * rand(0.3, 0.7);
          this.setState(ENTER, 30);
          this.headPitchT = 0;
          this.faceBlendT = 0;
          this.mouthOpenT = 0;
          this.tailWagT = 0.5;
          this.pantChaser = false;
        }
        break;

      case ENTER: {
        this.x += this.dir * walkSpeed * dt;
        this.walkPhase += walkSpeed * dt / (14 * s);
        const arrived = this.dir === 1 ? this.x >= this.stopX : this.x <= this.stopX;
        if (arrived) {
          this.setState(LOOK_WATER, rand(1.2, 2));
          this.headPitchT = 0.5; // muzzle up toward the water
          this.tailWagT = 0.8;
        }
        break;
      }

      case LOOK_WATER:
        if (this.timer <= 0) this.chooseVariation();
        break;

      case PANT:
        this.faceBlendT = 1;
        this.headPitchT = 0.1;
        this.mouthOpenT = 1;
        this.tailWagT = 3.2;
        this.tongueT = time;
        if (this.timer <= 0) {
          this.happyExit = true;
          this.mouthOpenT = 0;
          this.faceBlendT = 0;
          this.setState(EXIT, 30);
          // Usually leave the way it came? Random.
          this.dir = Math.random() < 0.5 ? this.dir : -this.dir;
        }
        break;

      case DRINK: {
        // Paws on the gravel right at the coping's outer edge; only the
        // head stretches over the stones to the water.
        this.yOffT = (L.pond.y + L.pond.h + L.copingW + 2 * s) - L.dogPathY;
        this.faceBlendT = 0;
        this.headPitchT = 1.15; // head stretched over the coping, down to water
        this.tailWagT = 1.6;
        // Rhythmic lapping.
        this.lapTimer -= dt;
        if (this.stateT > 0.7 && this.lapTimer <= 0) {
          this.lapTimer = rand(0.28, 0.38);
          const hx = this.x + this.dir * 50 * s;
          water.disturb(hx, L.pond.y + L.pond.h - 6, 0.35, 1.6);
          audio.lap();
        }
        if (this.timer <= 0) {
          this.yOffT = 0;
          this.headPitchT = 0.2;
          this.afterVariation();
        }
        break;
      }

      case PET: {
        // Two happy hops, hearts drift up.
        this.jump = Math.abs(Math.sin(clamp(this.stateT / 1.2, 0, 1) * TAU)) * 13 * s;
        this.faceBlendT = 1;
        this.mouthOpenT = 1;
        this.tailWagT = 3.6;
        if (this.timer <= 0) {
          this.jump = 0;
          // A pat always earns a happy pant before anything else.
          this.pantChaser = true;
          this.setState(PANT, rand(1.5, 2.5));
          this.tongueT = time;
        }
        break;
      }

      case TILT: {
        this.faceBlendT = 1;
        // One or two tilts with a beat between.
        const t = this.stateT;
        if (t < 0.5) this.headRollT = 0.28;
        else if (t < 1.1) this.headRollT = 0.28;
        else if (t < 1.5) this.headRollT = 0;
        else if (t < 2.1 && this.doubleTilt) this.headRollT = -0.28;
        else this.headRollT = 0;
        if (this.timer <= 0) {
          this.headRollT = 0;
          this.afterVariation();
        }
        break;
      }

      case EXIT: {
        this.x += this.dir * walkSpeed * dt;
        this.walkPhase += walkSpeed * dt / (14 * s);
        this.tailWagT = this.happyExit ? 2.2 : 0.8;
        const gone = this.dir === 1 ? this.x > L.vw + 90 * s : this.x < -90 * s;
        if (gone) {
          this.setState(OFFSCREEN, rand(14, 26));
          this.happyExit = false;
        }
        break;
      }
    }

    // --- Ease rig params toward targets ---------------------------------
    const ease = clamp(dt * 5, 0, 1);
    this.headPitch = lerp(this.headPitch, this.headPitchT, ease);
    this.faceBlend = lerp(this.faceBlend, this.faceBlendT, clamp(dt * 6, 0, 1));
    this.headRoll = lerp(this.headRoll, this.headRollT, clamp(dt * 7, 0, 1));
    this.yOff = lerp(this.yOff, this.yOffT, clamp(dt * 3.5, 0, 1));
    this.tailWag = lerp(this.tailWag, this.tailWagT, ease);
    this.mouthOpen = lerp(this.mouthOpen, this.mouthOpenT, clamp(dt * 6, 0, 1));

    // Body bob from walking.
    const walking = this.state === ENTER || this.state === EXIT;
    const bobT = walking ? Math.sin(this.walkPhase * 2) * 1.6 * s : 0;
    this.bob = lerp(this.bob, bobT, clamp(dt * 8, 0, 1));

    // Ear spring: follows -(body bob + head motion) with lag & overshoot.
    const earTarget = -this.bob * 0.12 - this.headPitch * 0.25 - this.jump * 0.02;
    const k = 60, d = 7;
    this.earV += (k * (earTarget - this.earA) - d * this.earV) * dt;
    this.earA += this.earV * dt;
    this.earA = clamp(this.earA, -0.9, 0.9);
  }

  chooseVariation() {
    const r = Math.random();
    if (r < 0.55) {
      this.setState(PANT, rand(2.5, 4));
    } else if (r < 0.8) {
      this.setState(DRINK, rand(3, 5));
    } else {
      this.doubleTilt = Math.random() < 0.5;
      this.setState(TILT, this.doubleTilt ? 2.4 : 1.6);
    }
  }

  // Rough hit box for petting.
  hitTest(x, y) {
    if (this.state === OFFSCREEN) return false;
    const s = this.scale;
    const groundY = this.layout.dogPathY + this.yOff;
    return Math.abs(x - this.x) < 48 * s && y > groundY - 60 * s && y < groundY + 14 * s;
  }

  pet() {
    if (this.state === OFFSCREEN || this.state === PET) return false;
    const s = this.scale;
    this.yOffT = 0;
    this.headRollT = 0;
    this.setState(PET, 1.3);
    this.hearts.push({ x: this.x + rand(-6, 6) * s, y: this.layout.dogPathY - 66 * s, age: 0 });
    return true;
  }

  // After a non-pant variation: 30% chance of a pant chaser — always leave happy.
  afterVariation() {
    if (!this.pantChaser && Math.random() < 0.3) {
      this.pantChaser = true;
      this.setState(PANT, rand(2, 3));
    } else {
      this.happyExit = true;
      this.faceBlendT = 0;
      this.mouthOpenT = 0;
      this.setState(EXIT, 30);
      this.dir = Math.random() < 0.5 ? this.dir : -this.dir;
    }
  }

  draw(ctx, time) {
    const L = this.layout;
    const s = this.scale;

    // Hearts live in screen space and outlast the visit.
    for (const h of this.hearts) {
      const a = h.age < 1.2 ? 1 : (1.6 - h.age) / 0.4;
      ctx.globalAlpha = clamp(a, 0, 1) * 0.9;
      drawHeart(ctx, h.x, h.y, (6 + h.age * 3) * s, '#e06a7a');
    }
    ctx.globalAlpha = 1;

    if (this.state === OFFSCREEN) return;
    const dir = this.dir;
    const groundY = L.dogPathY + this.yOff;

    ctx.save();
    ctx.translate(this.x, groundY - this.jump);
    ctx.scale(dir, 1);

    const legH = 15 * s;
    const bodyH = 24 * s;
    const bodyLen = 62 * s;
    const cy = -(legH + bodyH * 0.5) + this.bob; // body center y

    // Shadow stays on the gravel while the body hops.
    ctx.fillStyle = 'rgba(60, 50, 30, 0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 2 * s + this.jump, bodyLen * 0.62 * (1 - this.jump / (90 * s)), 7 * s, 0, 0, TAU);
    ctx.fill();

    const walking = this.state === ENTER || this.state === EXIT;

    // --- Far legs (darker) ---
    this.drawLegPair(ctx, s, legH, cy, bodyH, bodyLen, walking, true);

    // --- Tail: feathered, wagging ---
    const wag = Math.sin(time * TAU * this.tailWag) * (0.2 + this.tailWag * 0.09);
    const tailBaseX = -bodyLen * 0.48;
    const tailBaseY = cy - bodyH * 0.25;
    ctx.save();
    ctx.translate(tailBaseX, tailBaseY);
    ctx.rotate(-0.7 + wag);
    // Feathered plume: a filled fan that tapers to the tip.
    ctx.fillStyle = COAT_DEEP;
    ctx.beginPath();
    ctx.moveTo(0, 2 * s);
    ctx.quadraticCurveTo(-9 * s, -4 * s, -17 * s, -15 * s);   // top edge to tip
    ctx.quadraticCurveTo(-14 * s, -6 * s, -10.5 * s, -1 * s); // scalloped underside
    ctx.quadraticCurveTo(-9 * s, 3 * s, -6 * s, 4.5 * s);
    ctx.quadraticCurveTo(-4 * s, 6 * s, -1 * s, 5 * s);
    ctx.closePath();
    ctx.fill();
    // A lighter core stroke to give it direction.
    ctx.strokeStyle = COAT;
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.moveTo(-1 * s, 1 * s);
    ctx.quadraticCurveTo(-9 * s, -5 * s, -15.5 * s, -13 * s);
    ctx.stroke();
    ctx.restore();

    // --- Body: long capsule, deeper chest ---
    const grad = ctx.createLinearGradient(0, cy - bodyH * 0.5, 0, cy + bodyH * 0.6);
    grad.addColorStop(0, COAT_LIGHT);
    grad.addColorStop(0.55, COAT);
    grad.addColorStop(1, COAT_DEEP);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-bodyLen * 0.5, cy - bodyH * 0.32);
    ctx.quadraticCurveTo(-bodyLen * 0.52, cy - bodyH * 0.55, -bodyLen * 0.32, cy - bodyH * 0.52);
    ctx.lineTo(bodyLen * 0.3, cy - bodyH * 0.5);
    ctx.quadraticCurveTo(bodyLen * 0.52, cy - bodyH * 0.48, bodyLen * 0.5, cy - bodyH * 0.05);
    // Chest dips a little deeper at the front.
    ctx.quadraticCurveTo(bodyLen * 0.48, cy + bodyH * 0.62, bodyLen * 0.26, cy + bodyH * 0.55);
    ctx.lineTo(-bodyLen * 0.3, cy + bodyH * 0.42);
    ctx.quadraticCurveTo(-bodyLen * 0.52, cy + bodyH * 0.35, -bodyLen * 0.5, cy - bodyH * 0.32);
    ctx.closePath();
    ctx.fill();

    // Cream belly fringe (long-haired coat): a soft scalloped skirt along
    // the belly line rather than individual dangling strands.
    ctx.fillStyle = CREAM;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(-bodyLen * 0.3, cy + bodyH * 0.4);
    for (let i = 0; i < 6; i++) {
      const t0 = i / 6, t1 = (i + 1) / 6;
      const x0 = -bodyLen * 0.3 + t0 * bodyLen * 0.56;
      const x1 = -bodyLen * 0.3 + t1 * bodyLen * 0.56;
      const yb = cy + bodyH * 0.48;
      const sway = Math.sin(time * TAU * 0.4 + i) * 0.6 * s;
      ctx.quadraticCurveTo((x0 + x1) / 2 + sway, yb + 2.6 * s, x1, yb);
    }
    ctx.lineTo(bodyLen * 0.26, cy + bodyH * 0.52);
    ctx.quadraticCurveTo(0, cy + bodyH * 0.34, -bodyLen * 0.3, cy + bodyH * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // --- Near legs ---
    this.drawLegPair(ctx, s, legH, cy, bodyH, bodyLen, walking, false);

    // --- Head ---
    const neckX = bodyLen * 0.42;
    const neckY = cy - bodyH * 0.35;
    const sideAlpha = 1 - this.faceBlend;
    if (sideAlpha > 0.02) {
      ctx.save();
      ctx.globalAlpha = sideAlpha;
      this.drawSideHead(ctx, s, neckX, neckY, time);
      ctx.restore();
    }
    if (this.faceBlend > 0.02) {
      ctx.save();
      ctx.globalAlpha = this.faceBlend;
      this.drawFrontHead(ctx, s, neckX, neckY, time, dir);
      ctx.restore();
    }

    ctx.restore();
  }

  drawLegPair(ctx, s, legH, cy, bodyH, bodyLen, walking, far) {
    const hipY = cy + bodyH * 0.3;
    const positions = [bodyLen * 0.36, -bodyLen * 0.36]; // front, rear
    ctx.strokeStyle = far ? COAT_DEEP : COAT;
    ctx.lineWidth = 5 * s;
    ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      // Diagonal gait: front-near pairs with rear-far.
      const phase = this.walkPhase + (i === 0 ? 0 : Math.PI) + (far ? Math.PI : 0);
      const stride = walking ? Math.sin(phase) * 7 * s : 0;
      const lift = walking ? Math.max(0, Math.cos(phase)) * 3.5 * s : 0;
      ctx.beginPath();
      ctx.moveTo(positions[i], hipY);
      ctx.lineTo(positions[i] + stride, -lift + this.bob * 0.3);
      ctx.stroke();
      // Paw.
      ctx.fillStyle = far ? COAT_DEEP : COAT;
      ctx.beginPath();
      ctx.ellipse(positions[i] + stride + 1.5 * s, -lift + this.bob * 0.3, 3.4 * s, 2.2 * s, 0, 0, TAU);
      ctx.fill();
    }
  }

  // Side-profile head, rotated by headPitch around the neck pivot.
  // Positive pitch raises the muzzle up-screen (toward the pond); the
  // DRINK pose pushes it further so the head reaches over the coping.
  drawSideHead(ctx, s, neckX, neckY, time) {
    const drink = this.state === DRINK;
    // Drinking: the head reaches forward and DIPS DOWN to the water surface
    // (like leaning over the coping). Otherwise pitch raises the muzzle.
    const pitch = drink ? this.headPitch * 0.55 : -this.headPitch * 0.45;
    const reach = drink ? this.headPitch * 10 * s : 0;

    // Head pivot in body space. The neck is a thick capsule stroked from
    // inside the chest to this pivot — drawn un-rotated, so the head stays
    // attached however far it reaches over the coping to drink.
    const hx = neckX + reach;
    const hy = neckY + reach * 0.4;
    ctx.strokeStyle = COAT;
    ctx.lineCap = 'round';
    ctx.lineWidth = 12 * s;
    ctx.beginPath();
    ctx.moveTo(neckX - 4 * s, neckY + 9 * s);
    ctx.lineTo(hx, hy - 2 * s);
    ctx.stroke();

    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(pitch);

    const hr = 10 * s; // head radius

    // Skull.
    const hg = ctx.createRadialGradient(2 * s, -hr * 0.9, 0, 2 * s, -hr * 0.6, hr * 1.4);
    hg.addColorStop(0, COAT_LIGHT);
    hg.addColorStop(1, COAT);
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(3 * s, -hr * 0.6, hr, 0, TAU);
    ctx.fill();

    // Muzzle: long round-rect forward.
    const mLen = 15 * s;
    ctx.fillStyle = COAT;
    ctx.beginPath();
    ctx.moveTo(6 * s, -hr * 1.1);
    ctx.lineTo(6 * s + mLen, -hr * 0.75);
    ctx.quadraticCurveTo(6 * s + mLen + 3 * s, -hr * 0.65, 6 * s + mLen + 2 * s, -hr * 0.35);
    ctx.lineTo(6 * s + 2 * s, -hr * 0.05);
    ctx.closePath();
    ctx.fill();

    // Nose.
    ctx.fillStyle = '#2a211a';
    ctx.beginPath();
    ctx.ellipse(6 * s + mLen + 1.5 * s, -hr * 0.55, 2.4 * s, 2 * s, 0, 0, TAU);
    ctx.fill();

    // Eye.
    ctx.fillStyle = '#2a211a';
    ctx.beginPath();
    ctx.arc(6 * s, -hr * 0.75, 1.7 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(6.5 * s, -hr * 0.85, 0.6 * s, 0, TAU);
    ctx.fill();

    // Lapping tongue while drinking.
    if (drink && this.stateT > 0.7) {
      const lapT = (time * 3.2) % 1;
      const ext = Math.sin(lapT * Math.PI) * 4 * s;
      ctx.strokeStyle = TONGUE;
      ctx.lineWidth = 2.6 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(6 * s + mLen - 2 * s, -hr * 0.25);
      ctx.lineTo(6 * s + mLen + ext * 0.4, -hr * 0.25 + ext);
      ctx.stroke();
    }

    // Ear: big teardrop hinged at the top of the skull, spring-swung.
    ctx.save();
    ctx.translate(1 * s, -hr * 1.3);
    ctx.rotate(0.25 + this.earA);
    this.drawEarShape(ctx, s, 1);
    ctx.restore();

    ctx.restore();
  }

  drawEarShape(ctx, s, flip) {
    const eg = ctx.createLinearGradient(0, 0, 0, 16 * s);
    eg.addColorStop(0, COAT_DEEP);
    eg.addColorStop(1, '#7d4520');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(7 * s * flip, 4 * s, 5.5 * s * flip, 13 * s);
    ctx.quadraticCurveTo(4 * s * flip, 17 * s, 0.5 * s * flip, 15.5 * s);
    ctx.quadraticCurveTo(-3.5 * s * flip, 12 * s, -2 * s * flip, 3 * s);
    ctx.closePath();
    ctx.fill();
    // Fringed edge wisps.
    ctx.strokeStyle = COAT_DEEP;
    ctx.lineWidth = 1.2 * s;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const t = 0.5 + i * 0.22;
      ctx.beginPath();
      ctx.moveTo(4.5 * s * flip * t, 13 * s * t);
      ctx.lineTo(5.5 * s * flip * t, 13 * s * t + 3.5 * s);
      ctx.stroke();
    }
  }

  // Front-facing head for the pant / tilt poses — looking right at you.
  drawFrontHead(ctx, s, neckX, neckY, time, dir) {
    ctx.save();
    // Undo the horizontal flip so the face isn't mirrored oddly, then
    // place at the neck position.
    ctx.translate(neckX, neckY - 4 * s);
    ctx.scale(dir, 1); // cancel outer flip: face is symmetric anyway
    ctx.rotate(this.headRoll);

    const hr = 12 * s;

    // Ears first (behind the face), hanging prominently beside it — the
    // long-haired doxie's signature silhouette.
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * hr * 1.08, -hr * 0.45);
      ctx.rotate(side * (0.32 + Math.abs(this.earA) * 0.5) + this.earA * 0.3);
      this.drawEarShape(ctx, s * 1.35, side);
      ctx.restore();
    }

    // Face.
    const fg = ctx.createRadialGradient(0, -hr * 0.3, 0, 0, 0, hr * 1.5);
    fg.addColorStop(0, COAT_LIGHT);
    fg.addColorStop(1, COAT);
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.ellipse(0, 0, hr * 0.95, hr, 0, 0, TAU);
    ctx.fill();

    // Foreshortened snout.
    ctx.fillStyle = COAT_LIGHT;
    ctx.beginPath();
    ctx.ellipse(0, hr * 0.35, hr * 0.42, hr * 0.38, 0, 0, TAU);
    ctx.fill();

    // Eyes: big, dark, slightly wide-set — the doxie look.
    ctx.fillStyle = '#231a12';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * hr * 0.42, -hr * 0.18, 2.3 * s, 2.7 * s, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * hr * 0.42 + 0.8 * s, -hr * 0.25, 0.8 * s, 0, TAU);
      ctx.fill();
    }

    // Nose.
    ctx.fillStyle = '#2a211a';
    ctx.beginPath();
    ctx.ellipse(0, hr * 0.22, 2.8 * s, 2.2 * s, 0, 0, TAU);
    ctx.fill();

    // Panting mouth + bobbing tongue.
    if (this.mouthOpen > 0.05) {
      const open = this.mouthOpen;
      ctx.fillStyle = '#3d2a20';
      ctx.beginPath();
      ctx.ellipse(0, hr * 0.62, hr * 0.3 * open, hr * 0.28 * open, 0, 0, Math.PI);
      ctx.fill();
      // Tongue bobs at ~4Hz.
      const bobT = Math.sin((time - this.tongueT) * TAU * 4) * 0.5 + 0.5;
      const tLen = (hr * 0.35 + bobT * hr * 0.28) * open;
      ctx.fillStyle = TONGUE;
      ctx.beginPath();
      ctx.moveTo(-hr * 0.16 * open, hr * 0.6);
      ctx.quadraticCurveTo(0, hr * 0.6 + tLen * 1.25, hr * 0.16 * open, hr * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 160, 175, 0.6)';
      ctx.beginPath();
      ctx.ellipse(0, hr * 0.62 + tLen * 0.5, 1.1 * s, tLen * 0.35, 0, 0, TAU);
      ctx.fill();
    } else {
      // Gentle closed mouth.
      ctx.strokeStyle = '#3d2a20';
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      ctx.arc(0, hr * 0.42, hr * 0.22, 0.3, Math.PI - 0.3);
      ctx.stroke();
    }

    ctx.restore();
  }
}

// A little floating heart.
function drawHeart(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.1, y + r * 0.15, x - r * 0.6, y - r * 0.7, x, y - r * 0.15);
  ctx.bezierCurveTo(x + r * 0.6, y - r * 0.7, x + r * 1.1, y + r * 0.15, x, y + r * 0.9);
  ctx.fill();
}
