// Boot, resize/DPR handling, fixed-timestep game loop, layer composition.
import { roundedRectPath } from './util.js';
import { computeLayout, renderBackground } from './scene.js';
import { Water } from './water.js';
import { createSchool } from './fish.js';
import { Food } from './food.js';
import { Dog } from './dog.js';
import { Ambient } from './ambient.js';
import { AudioEngine } from './audio.js';
import { setupInput } from './input.js';

const DT = 1 / 60;
const MAX_STEPS = 5;

const canvas = document.getElementById('pond');
const ctx = canvas.getContext('2d');
const bgCanvas = document.createElement('canvas');

const DEBUG = new URLSearchParams(location.search).has('debug');

const game = {
  layout: null,
  water: new Water(),
  audio: new AudioEngine(),
  fishes: [],
  food: null,
  dog: null,
  ambient: null,
  time: 0,

  poke(x, y) {
    this.water.disturb(x, y, 2.2, 2.2);
    this.audio.splash(1);
    for (const f of this.fishes) f.startle(x, y);
  },

  onFeed() { /* hook for future fun */ },

  petDog() {
    this.dog.pet();
  },

  hideHint() {
    document.getElementById('soundHint').classList.add('hidden');
  },
};

// Gentle nudges toward the interactions, cycling forever (~11s per hint:
// 5.5s visible, 5.5s quiet). Hints that don't apply right now are skipped.
const HINTS = [
  { text: 'poke the water' },
  { text: 'the little cup by the pond holds fish food' },
  { text: 'the pup loves a little pat', need: () => game.dog.state !== 'offscreen' },
  { text: 'shh… listen to the garden', need: () => game.audio.unlocked && game.audio.enabled },
];
const hintEl = document.getElementById('actionHint');
let hintIdx = -1;
let hintVisible = false;
let hintAt = 8; // first hint fades in at t=8s

function updateHints(time) {
  if (time < hintAt) return;
  if (!hintVisible) {
    for (let k = 0; k < HINTS.length; k++) {
      hintIdx = (hintIdx + 1) % HINTS.length;
      const h = HINTS[hintIdx];
      if (!h.need || h.need()) {
        hintEl.textContent = h.text;
        hintEl.classList.remove('hidden');
        hintVisible = true;
        hintAt = time + 5.5;
        return;
      }
    }
    hintAt = time + 4; // nothing applicable — try again shortly
  } else {
    hintEl.classList.add('hidden');
    hintVisible = false;
    hintAt = time + 5.5;
  }
}

let dpr = 1;

function resize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw < 10 || vh < 10) return; // viewport not laid out yet — retry from the loop
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  canvas.style.width = vw + 'px';
  canvas.style.height = vh + 'px';

  game.layout = computeLayout(vw, vh);
  renderBackground(bgCanvas, game.layout, dpr);
  game.water.resize(game.layout);

  if (!game.fishes.length) {
    game.fishes = createSchool(game.layout);
    game.food = new Food(game.layout);
    game.dog = new Dog(game.layout);
    game.ambient = new Ambient(game.layout);
  } else {
    game.food.resize(game.layout);
    game.dog.resize(game.layout);
    game.ambient.resize(game.layout);
  }
}

window.addEventListener('resize', resize);
// If the page loads in a hidden/backgrounded tab the viewport can report
// 0×0 and rAF won't fire; finish booting the moment we become visible.
document.addEventListener('visibilitychange', () => {
  if (!game.layout) resize();
});
resize();
setupInput(canvas, game);

// Sound toggle button.
const soundBtn = document.getElementById('soundToggle');
const soundIcon = document.getElementById('soundIcon');
soundBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  game.audio.unlock();
  game.hideHint();
  const on = game.audio.toggle();
  soundIcon.textContent = on ? '🔊' : '🔇';
});
// Reflect stored preference (context still needs a gesture to start).
soundIcon.textContent = game.audio.enabled ? '🔊' : '🔇';

function step(dt) {
  game.time += dt;
  game.water.update();
  game.food.update(dt, game.water);
  for (const f of game.fishes) {
    f.update(dt, game.layout, game.fishes, game.food.pellets, game.water, game.audio, game.time);
  }
  game.dog.update(dt, game.water, game.audio, game.time);
  game.ambient.update(dt, game.time, game.fishes, game.water, game.audio);
  game.audio.update(dt);
  updateHints(game.time);
}

let fps = 0, fpsFrames = 0, fpsTime = 0;

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const t = game.time;

  // 1. Static painterly background.
  ctx.drawImage(bgCanvas, 0, 0, game.layout.vw, game.layout.vh);

  // 2. Fish shadows, then fish + pellets (under the ripple overlay so the
  //    water reads as *over* them). Clipped to the pond so no tail or fin
  //    ever draws across the stone coping.
  ctx.save();
  roundedRectPath(ctx, game.layout.pond.x, game.layout.pond.y, game.layout.pond.w, game.layout.pond.h, game.layout.pondRadius);
  ctx.clip();
  for (const f of game.fishes) f.drawShadow(ctx);
  game.food.drawPellets(ctx, t);
  for (const f of game.fishes) f.draw(ctx);
  ctx.restore();

  // 3. Water shimmer + ripples.
  game.water.draw(ctx, t);

  // 4. Things sitting on the water.
  game.ambient.drawPads(ctx, t);
  game.ambient.drawFlyers(ctx, t);

  // 5. The doxie and the cup. The resting cup sits behind her (she walks in
  //    front of it); it pops to the top layer only while lifted or in flight.
  const cupLifted = game.food.dragging || game.food.armed || game.food.returnT < 1;
  if (!cupLifted) game.food.drawCup(ctx, t);
  game.dog.draw(ctx, t);
  if (cupLifted) game.food.drawCup(ctx, t);

  if (DEBUG) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(8, 8, 74, 24);
    ctx.fillStyle = '#9f9';
    ctx.font = '13px monospace';
    ctx.fillText(`${fps.toFixed(0)} fps`, 14, 25);
  }
}

let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  if (!game.layout) { resize(); return; } // waiting for a real viewport
  let elapsed = (now - last) / 1000;
  last = now;
  if (elapsed > 0.25) elapsed = 0.25; // tab was hidden — don't fast-forward

  acc += elapsed;
  let steps = 0;
  while (acc >= DT && steps < MAX_STEPS) {
    step(DT);
    acc += -DT;
    steps++;
  }
  if (steps === MAX_STEPS) acc = 0;

  if (DEBUG) {
    fpsFrames++;
    fpsTime += elapsed;
    if (fpsTime >= 0.5) {
      fps = fpsFrames / fpsTime;
      fpsFrames = 0;
      fpsTime = 0;
    }
  }

  render();
}

requestAnimationFrame(frame);

window.__pond = game; // debug handle
game._resize = resize;
game._step = step;
