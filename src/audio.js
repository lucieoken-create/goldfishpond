// Fully synthesized ambient audio: wind bed, leaf rustle swells, water lap,
// plus one-shot plips/laps/gulps. No audio assets.
import { rand } from './util.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = localStorage.getItem('pondSound') !== 'off';
    this.unlocked = false;
    this.rustleTimer = 0;
    this.birdTimer = rand(4, 9);
  }

  // Called on first user gesture.
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    this.noiseBuf = this.makeNoiseBuffer();
    this.startWind();
    this.startWaterLap();
    this.startRustle();

    if (this.enabled) this.fadeTo(1, 1.2);
  }

  makeNoiseBuffer() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  loopNoise() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.start();
    return src;
  }

  fadeTo(v, secs) {
    if (!this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(v, t + secs);
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('pondSound', this.enabled ? 'on' : 'off');
    if (this.master) this.fadeTo(this.enabled ? 1 : 0, 0.6);
    return this.enabled;
  }

  // --- Ambient beds ------------------------------------------------------

  startWind() {
    const src = this.loopNoise();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 480;
    bp.Q.value = 0.6;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.05;

    // Slow LFO on filter frequency — the "breathing" of the breeze.
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain);
    lfoGain.connect(bp.frequency);
    lfo.start();

    // Second LFO on amplitude.
    const lfo2 = this.ctx.createOscillator();
    lfo2.frequency.value = 0.045;
    const lfo2Gain = this.ctx.createGain();
    lfo2Gain.gain.value = 0.022;
    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(gain.gain);
    lfo2.start();

    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.master);
  }

  startWaterLap() {
    // Kept very quiet — broad noise swells read as "ocean", and this is a
    // still garden pond. Just a whisper of water.
    const src = this.loopNoise();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.005;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.002;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();
    src.connect(lp);
    lp.connect(gain);
    gain.connect(this.master);
  }

  startRustle() {
    const src = this.loopNoise();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2600;
    this.rustleGain = this.ctx.createGain();
    this.rustleGain.gain.value = 0.001;
    src.connect(hp);
    hp.connect(this.rustleGain);
    this.rustleGain.connect(this.master);
  }

  // Call periodically from the game loop to schedule rustle swells.
  update(dt) {
    if (!this.ctx || !this.rustleGain) return;
    this.rustleTimer -= dt;
    if (this.rustleTimer <= 0) {
      this.rustleTimer = rand(8, 20);
      const t = this.ctx.currentTime;
      const peak = rand(0.008, 0.022);
      const rise = rand(1.5, 3);
      this.rustleGain.gain.setTargetAtTime(peak, t, rise * 0.5);
      this.rustleGain.gain.setTargetAtTime(0.001, t + rise, rise * 0.8);
    }

    // A bird sings somewhere in the hedge every so often.
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = rand(10, 28);
      this.birdSong();
    }
  }

  // A short synthesized birdsong phrase: 2–5 quick chirps, each a small
  // frequency sweep around a randomized base pitch.
  birdSong() {
    if (!this.ready()) return;
    let t = this.ctx.currentTime + 0.05;
    const notes = 2 + Math.floor(rand(0, 4));
    const base = rand(2300, 3600);
    const level = rand(0.012, 0.026);
    for (let i = 0; i < notes; i++) {
      const dur = rand(0.06, 0.15);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const f = base * rand(0.88, 1.18);
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * rand(0.72, 1.38), t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level * rand(0.7, 1.1), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur + rand(0.03, 0.14);
    }
  }

  // --- One-shots ----------------------------------------------------------

  ready() {
    return this.ctx && this.enabled;
  }

  // Water plip: sine sweep down + tiny noise burst.
  plip(volume = 1, pitchMul = 1) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f0 = 600 * pitchMul * rand(0.85, 1.15);
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.27, t + 0.09);
    g.gain.setValueAtTime(0.11 * volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.16);

    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400 * pitchMul;
    bp.Q.value = 2;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.05 * volume, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(this.master);
    n.start(t, rand(0, 1.5));
    n.stop(t + 0.06);
  }

  // Bigger poke splash.
  splash(volume = 1) {
    if (!this.ready()) return;
    this.plip(volume * 1.3, 0.7);
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 800;
    bp.Q.value = 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06 * volume, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    n.start(t, rand(0, 1.5));
    n.stop(t + 0.35);
  }

  // Staggered pellet plips.
  plipCluster(n) {
    if (!this.ready()) return;
    for (let i = 0; i < Math.min(n, 8); i++) {
      setTimeout(() => this.plip(0.5, rand(1.1, 1.6)), i * rand(45, 95));
    }
  }

  // Fish eating: quiet low gulp.
  gulp() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.11);
    g.gain.setValueAtTime(0.045, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  // Dog lapping: short wet noise tick.
  lap() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = rand(900, 1300);
    bp.Q.value = 3;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.035, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    n.start(t, rand(0, 1.5));
    n.stop(t + 0.1);
  }

  // Leaf touching down: the softest plip.
  leafDrop() {
    this.plip(0.35, 1.4);
  }
}
