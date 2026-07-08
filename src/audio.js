// Fully synthesized ambient audio: wind bed, leaf rustle swells, water lap,
// plus one-shot plips/laps/gulps. No audio assets.
import { rand } from './util.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    let stored = null;
    try { stored = localStorage.getItem('pondSound'); } catch (e) { /* storage blocked — default on */ }
    this.enabled = stored !== 'off';
    this.unlocked = false;
    this.rustleTimer = 0;
    this.birdTimer = rand(4, 9);
    this.cricketTimer = rand(1, 4);
    this.nightT = 0;
    this.chip = false; // 8-bit mode: square/triangle timbres, stepped pitch
  }

  setChip(on) {
    this.chip = !!on;
  }

  // Called on first user gesture.
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // iOS mutes Web Audio when the ringer switch is on silent unless the
    // page is in the media-playback audio category. Ask for it via the
    // AudioSession API where available, and force it everywhere else by
    // looping a silent <audio> element (must start inside this gesture).
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) { /* not supported — the keepalive below covers it */ }
    this.startSilentKeepalive();

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

    if (this.enabled) {
      this.fadeTo(1, 1.2);
    } else {
      // Unlocked while muted: park the context suspended.
      this.ctx.suspend();
      if (this.keepalive) this.keepalive.pause();
    }
  }

  // A tiny silent looping WAV in an <audio> element. Its only job is to keep
  // iOS in "playback" mode so the Web Audio graph ignores the silent switch.
  startSilentKeepalive() {
    const samples = 4410; // 0.1s of silence, 16-bit mono 44.1kHz
    const buf = new ArrayBuffer(44 + samples * 2);
    const v = new DataView(buf);
    const tag = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    tag(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); tag(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 44100, true); v.setUint32(28, 88200, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    tag(36, 'data'); v.setUint32(40, samples * 2, true);
    const el = document.createElement('audio');
    el.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    el.loop = true;
    el.setAttribute('playsinline', '');
    el.play().catch(() => { /* fine — desktop browsers don't need it */ });
    this.keepalive = el;
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

  // Silence while the tab is hidden (and on page close) — the garden only
  // makes sound while you're actually looking at it.
  hush() {
    if (!this.ctx) return;
    clearTimeout(this._suspendTimer);
    this.ctx.suspend();
    if (this.keepalive) this.keepalive.pause();
  }

  unhush() {
    if (!this.ctx || !this.enabled) return;
    this.ctx.resume();
    if (this.keepalive) this.keepalive.play().catch(() => {});
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
    try { localStorage.setItem('pondSound', this.enabled ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
    clearTimeout(this._suspendTimer);
    if (this.ctx) {
      if (this.enabled) {
        // Resume first (mute suspends the context), then fade back in.
        this.ctx.resume();
        if (this.keepalive) this.keepalive.play().catch(() => {});
        this.fadeTo(1, 0.6);
      } else {
        this.fadeTo(0, 0.5);
        // Belt and braces: some browsers mishandle gain automation, so after
        // the fade, suspend the context outright — guaranteed silence.
        this._suspendTimer = setTimeout(() => {
          if (!this.enabled && this.ctx) {
            this.ctx.suspend();
            if (this.keepalive) this.keepalive.pause();
          }
        }, 550);
      }
    }
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
  update(dt, nightT = 0) {
    this.nightT = nightT;
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

    // A bird sings somewhere in the hedge every so often — daytime only.
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = rand(10, 28);
      if (this.nightT < 0.4) this.birdSong();
    }

    // Crickets take the night shift.
    this.cricketTimer -= dt;
    if (this.cricketTimer <= 0) {
      this.cricketTimer = rand(2.5, 7);
      if (this.nightT > 0.6) this.cricketChirp();
    }
  }

  // A cricket: a fast train of tiny high pulses.
  cricketChirp() {
    if (!this.ready()) return;
    if (this.chip) {
      const f = rand(3800, 4400);
      const pulses = 4 + Math.floor(rand(0, 4));
      for (let i = 0; i < pulses; i++) {
        this.chipBlip('triangle', [f], 0.03, 0.014, 0.05 + i * 0.06);
      }
      return;
    }
    let t = this.ctx.currentTime + 0.05;
    const pulses = 5 + Math.floor(rand(0, 5));
    const f = rand(3800, 4600);
    const level = rand(0.006, 0.012);
    for (let i = 0; i < pulses; i++) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.frequency.value = f * rand(0.98, 1.02);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.045);
      t += 0.055;
    }
  }

  // A short synthesized birdsong phrase: 2–5 quick chirps, each a small
  // frequency sweep around a randomized base pitch.
  birdSong() {
    if (!this.ready()) return;
    if (this.chip) {
      // Stepped square notes on a little pentatonic walk.
      const scale = [2349, 2637, 2960, 3520, 3951];
      let delay = 0;
      const notes = 2 + Math.floor(rand(0, 4));
      for (let i = 0; i < notes; i++) {
        const f = scale[Math.floor(rand(0, scale.length))];
        this.chipBlip('square', [f, f * rand(0.95, 1.12)], 0.045, 0.009, delay);
        delay += rand(0.1, 0.22);
      }
      return;
    }
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

  // Chip-mode voice: an oscillator stepping through quantized pitches with a
  // flat, hard-cut envelope — the whole "8-bit instrument" in one helper.
  chipBlip(type, steps, stepDur, level, delay = 0) {
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    steps.forEach((f, i) => osc.frequency.setValueAtTime(f, t0 + i * stepDur));
    const dur = steps.length * stepDur;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(level, t0);
    g.gain.setValueAtTime(level, t0 + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Water plip: sine sweep down + tiny noise burst.
  plip(volume = 1, pitchMul = 1) {
    if (!this.ready()) return;
    if (this.chip) {
      const f = 540 * pitchMul * rand(0.9, 1.1);
      this.chipBlip('square', [f, f * 0.75, f * 0.5], 0.03, 0.032 * volume);
      return;
    }
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
    if (this.chip) {
      this.chipBlip('square', [420, 300, 220, 160], 0.035, 0.022 * volume, 0.02);
    }
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
    if (this.chip) {
      this.chipBlip('triangle', [190, 130, 85], 0.04, 0.06);
      return;
    }
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
    if (this.chip) {
      this.chipBlip('square', [rand(640, 780)], 0.04, 0.018);
      return;
    }
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

  // Frog croak: low buzzy sweep with a fast amplitude wobble.
  croak() {
    if (!this.ready()) return;
    if (this.chip) {
      // A ribbit is just two gravelly square steps down, twice.
      this.chipBlip('square', [98, 78], 0.07, 0.028);
      this.chipBlip('square', [92, 72], 0.07, 0.024, 0.18);
      return;
    }
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(96, t);
    osc.frequency.linearRampToValueAtTime(80, t + 0.24);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 3;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.03);
    g.gain.setTargetAtTime(0.0001, t + 0.2, 0.05);
    const wobble = this.ctx.createOscillator();
    wobble.frequency.value = 24;
    const wobbleG = this.ctx.createGain();
    wobbleG.gain.value = 0.018;
    wobble.connect(wobbleG);
    wobbleG.connect(g.gain);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    osc.start(t); osc.stop(t + 0.4);
    wobble.start(t); wobble.stop(t + 0.4);
  }
}
