// Boot, resize/DPR handling, fixed-timestep game loop, layer composition.
import { roundedRectPath, TAU as TAU_ } from './util.js';
import { computeLayout, renderBackground } from './scene.js';
import { Water } from './water.js';
import { createSchool } from './fish.js';
import { Food } from './food.js';
import { Dog } from './dog.js';
import { Ambient } from './ambient.js';
import { AudioEngine } from './audio.js';
import { setupInput } from './input.js';
import { PixelRenderer } from './pixel/renderer.js';
import { bayer } from './pixel/palette.js';
import { setupStyleUI } from './styleui.js';

const DT = 1 / 60;
const MAX_STEPS = 5;

const canvas = document.getElementById('pond');
const ctx = canvas.getContext('2d');
const bgCanvas = document.createElement('canvas');

// Style-swap dissolve state: the incoming style renders to swapCanvas and is
// revealed through cached ordered-dither masks, chunkiest possible crossfade.
let styleSwap = null; // { from, to, t }
const swapCanvas = document.createElement('canvas');
const swapCtx = swapCanvas.getContext('2d');
const maskCache = [];
let moon = null; // cached moonlight geometry + gradient, rebuilt on resize

function maskFor(step) {
  if (!maskCache[step]) {
    const S = game.pixel.S;
    const w = Math.ceil(game.layout.vw / S);
    const h = Math.ceil(game.layout.vh / S);
    const mc = document.createElement('canvas');
    mc.width = w;
    mc.height = h;
    const mctx = mc.getContext('2d');
    const img = mctx.createImageData(w, h);
    const p = step / 16;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        img.data[(y * w + x) * 4 + 3] = bayer(x, y) < p ? 255 : 0;
      }
    }
    mctx.putImageData(img, 0, 0);
    maskCache[step] = mc;
  }
  return maskCache[step];
}

const DEBUG = new URLSearchParams(location.search).has('debug');

let storedStyle = null;
try { storedStyle = localStorage.getItem('pondStyle'); } catch (e) { /* storage blocked */ }

const game = {
  layout: null,
  water: new Water(),
  audio: new AudioEngine(),
  pixel: new PixelRenderer(),
  styleMode: storedStyle === 'pixel' ? 'pixel' : 'painted',
  fishes: [],
  food: null,
  dog: null,
  ambient: null,
  time: 0,
  night: false,
  nightT: 0, // 0 day → 1 night, eased over ~3s

  // Costume change: same garden, different rendering language. The swap is
  // an ordered-dither dissolve — the transition itself speaks pixel.
  setStyle(s) {
    if (s === this.styleMode || styleSwap) return;
    try { localStorage.setItem('pondStyle', s); } catch (e) { /* storage blocked */ }
    styleSwap = { from: this.styleMode, to: s, t: 0 };
    this.styleMode = s;
    this.audio.setChip(s === 'pixel');
  },

  poke(x, y) {
    this.water.disturb(x, y, 2.2, 2.2);
    this.audio.splash(1);
    for (const f of this.fishes) f.startle(x, y);
  },

  petDog() {
    this.dog.pet();
  },
};

// Gentle nudges toward the interactions, cycling forever (~7.5s per hint:
// 4.5s visible, 3s quiet). Hints that don't apply right now are skipped, and
// urgent contextual hints (like the sleeping pup) jump the queue.
const HINTS = [
  { text: 'tap anywhere to hear the garden', need: () => game.audio.enabled && !game.audio.unlocked, urgent: true },
  { text: 'poke the water' },
  { text: 'the little cup by the pond holds fish food' },
  { text: 'the pup loves a little pat', need: () => game.dog.state !== 'offscreen' && !game.dog.asleep },
  { text: 'does the frog have anything to say?', need: () => !!game.ambient.frog },
  { text: 'shh… listen to the garden', need: () => game.audio.unlocked && game.audio.enabled },
  { text: 'a little tab on the left hides another world' },
  { text: 'a gentle pat will send the sleepy pup home', need: () => game.dog.asleep, urgent: true },
];
const hintEl = document.getElementById('actionHint');
let hintIdx = -1;
let hintVisible = false;
let hintAt = 8; // first hint fades in at t=8s

function showHint(h, time) {
  h.lastAt = time;
  hintEl.textContent = h.text;
  hintEl.classList.remove('hidden');
  hintVisible = true;
  hintAt = time + 4.5;
}

function updateHints(time) {
  if (time < hintAt) return;
  if (!hintVisible) {
    // Urgent hints first (unless shown within the last 20s).
    for (const h of HINTS) {
      if (h.urgent && h.need() && (h.lastAt === undefined || time - h.lastAt > 20)) {
        return showHint(h, time);
      }
    }
    for (let k = 0; k < HINTS.length; k++) {
      hintIdx = (hintIdx + 1) % HINTS.length;
      const h = HINTS[hintIdx];
      if ((!h.need || h.need()) && (h.lastAt === undefined || time - h.lastAt > 20)) {
        return showHint(h, time);
      }
    }
    hintAt = time + 3; // nothing applicable — try again shortly
  } else {
    hintEl.classList.add('hidden');
    hintVisible = false;
    hintAt = time + 3;
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

  const prev = game.layout;
  game.layout = computeLayout(vw, vh);
  renderBackground(bgCanvas, game.layout, dpr);
  game.water.resize(game.layout);
  game.pixel.resize(game.layout);
  swapCanvas.width = canvas.width;
  swapCanvas.height = canvas.height;
  maskCache.length = 0;

  // Moonlight glow: geometry is layout-fixed, so build the gradient once and
  // scale its brightness with globalAlpha at draw time.
  const mp = game.layout.pond;
  moon = {
    x: mp.x + mp.w * 0.72,
    y: mp.y + mp.h * 0.3,
    r: Math.min(mp.w, mp.h) * 0.34,
  };
  moon.grad = ctx.createRadialGradient(moon.x, moon.y, 0, moon.x, moon.y, moon.r);
  moon.grad.addColorStop(0, 'rgba(190, 210, 250, 0.34)');
  moon.grad.addColorStop(0.5, 'rgba(170, 195, 245, 0.12)');
  moon.grad.addColorStop(1, 'rgba(170, 195, 245, 0)');

  if (!game.fishes.length) {
    game.fishes = createSchool(game.layout);
    game.food = new Food(game.layout);
    game.dog = new Dog(game.layout);
    game.ambient = new Ambient(game.layout);
  } else {
    game.food.resize(game.layout);
    game.dog.resize(game.layout);
    game.ambient.resize(game.layout);
    for (const f of game.fishes) f.resize(game.layout.pond, prev.pond);
  }
}

window.addEventListener('resize', resize);
// If the page loads in a hidden/backgrounded tab the viewport can report
// 0×0 and rAF won't fire; finish booting the moment we become visible.
// Also hush all audio while the tab is hidden — a background pond should
// be a silent pond.
document.addEventListener('visibilitychange', () => {
  if (!game.layout) resize();
  if (document.hidden) game.audio.hush();
  else game.audio.unhush();
});
window.addEventListener('pagehide', () => game.audio.hush());
// Back/forward-cache restores don't reliably fire visibilitychange.
window.addEventListener('pageshow', () => {
  if (!document.hidden) game.audio.unhush();
});
resize();
setupInput(canvas, game);
setupStyleUI(game);
document.body.classList.toggle('pixel-mode', game.styleMode === 'pixel');
game.audio.setChip(game.styleMode === 'pixel');

// Sound toggle button.
const soundBtn = document.getElementById('soundToggle');
const soundIcon = document.getElementById('soundIcon');
soundBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  // If this click is the first gesture and sound is already preferred on,
  // unlock() alone starts the ambience — toggling too would mute it again.
  const firstGestureStartsSound = !game.audio.unlocked && game.audio.enabled;
  game.audio.unlock();
  const on = firstGestureStartsSound ? true : game.audio.toggle();
  soundIcon.textContent = on ? '🔊' : '🔇';
});
// Reflect stored preference (context still needs a gesture to start).
soundIcon.textContent = game.audio.enabled ? '🔊' : '🔇';

// Day/night toggle.
const nightBtn = document.getElementById('nightToggle');
const nightIcon = document.getElementById('nightIcon');
nightBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  game.audio.unlock();
  game.night = !game.night;
  nightIcon.textContent = game.night ? '☀️' : '🌙';
  document.title = game.night ? 'Goldfish Pond ☾' : 'Goldfish Pond';
});

function step(dt) {
  game.time += dt;
  game.water.update();
  game.food.update(dt, game.water);
  for (const f of game.fishes) {
    f.update(dt, game.layout, game.fishes, game.food.pellets, game.water, game.audio, game.time);
  }
  game.dog.update(dt, game.water, game.audio, game.time, game.night);
  game.ambient.update(dt, game.time, game.fishes, game.water, game.audio);
  game.audio.update(dt, game.nightT);
  updateHints(game.time);

  // Dusk/dawn: ease toward night over ~3 seconds.
  const target = game.night ? 1 : 0;
  game.nightT += Math.sign(target - game.nightT) * Math.min(dt / 3, Math.abs(target - game.nightT));

  if (styleSwap) styleSwap.t += dt / 0.6;
}

let fps = 0, fpsFrames = 0, fpsTime = 0;

function drawPainted(ctx) {
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

  // 7. Night: darken the whole scene toward deep blue, then add glow layers
  //    on top (moonlight on the water, fireflies) so they cut through.
  const nt = game.nightT;
  if (nt > 0.005) {
    const { vw, vh, pond } = game.layout;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${Math.round(255 - 150 * nt)}, ${Math.round(255 - 128 * nt)}, ${Math.round(255 - 68 * nt)})`;
    ctx.fillRect(0, 0, vw, vh);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(18, 26, 64, ${0.16 * nt})`;
    ctx.fillRect(0, 0, vw, vh);

    // Moonlight glinting on the water (cached gradient, alpha-scaled).
    ctx.save();
    roundedRectPath(ctx, pond.x, pond.y, pond.w, pond.h, game.layout.pondRadius);
    ctx.clip();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = nt;
    ctx.fillStyle = moon.grad;
    ctx.beginPath();
    ctx.ellipse(moon.x, moon.y, moon.r * 1.5, moon.r, -0.4, 0, TAU_);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // Fireflies over everything.
    game.ambient.drawFireflies(ctx, t, nt);
  }
}

function drawStyle(mode, g) {
  if (mode === 'pixel') game.pixel.render(g, game);
  else drawPainted(g);
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { vw, vh } = game.layout;

  if (!styleSwap) {
    drawStyle(game.styleMode, ctx);
  } else {
    const p = Math.min(1, styleSwap.t);
    drawStyle(styleSwap.from, ctx);
    // Incoming style, revealed cell by cell through the dither mask.
    swapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    swapCtx.clearRect(0, 0, vw, vh);
    drawStyle(styleSwap.to, swapCtx);
    const step = Math.max(1, Math.ceil(p * 16));
    swapCtx.globalCompositeOperation = 'destination-in';
    swapCtx.imageSmoothingEnabled = false;
    swapCtx.drawImage(maskFor(step), 0, 0, vw, vh);
    swapCtx.globalCompositeOperation = 'source-over';
    swapCtx.imageSmoothingEnabled = true;
    ctx.drawImage(swapCanvas, 0, 0, vw, vh);
    if (p >= 1) {
      document.body.classList.toggle('pixel-mode', styleSwap.to === 'pixel');
      game.audio.styleFlourish(styleSwap.to === 'pixel');
      styleSwap = null;
      if (game._reflectStyle) game._reflectStyle();
    }
  }

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

// A hello for anyone who peeks under the pond.
console.log(
  '%c🐟 goldfish pond',
  'font-weight: bold; font-size: 14px;',
  '\nevery fish, ripple, and ribbit here is drawn and synthesized in code — no images, no audio files.\nfeed them kindly: window.__pond'
);
