import type { AudioEngine, AudioVolumes, CreateAudioEngine } from './api';

/**
 * 100% synthesized audio (Web Audio API). Recipes:
 *  - bat crack: high-passed noise click + band-passed noise body + short
 *    inharmonic "wood ring" partials; weak contact swaps to a low-passed thock
 *  - crowd: looping pink-noise layers through formant-ish band-passes with slow
 *    amplitude drift; reactions are filtered swells with characteristic envelopes
 *  - organ: additive drawbar voice (8', 4', 2⅔', 2') with tremolo
 *  - brass jingle: detuned sawtooths through an enveloped low-pass
 * Every method is a safe no-op until unlock() succeeds (autoplay policy) and
 * when Web Audio is unavailable (tests, old browsers).
 */
type Ctx = AudioContext;

const MAX_VOICES = 28;

class Engine implements AudioEngine {
  private ctx: Ctx | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private crowd!: GainNode;
  private crowdBed!: GainNode;
  private white!: AudioBuffer;
  private pink!: AudioBuffer;
  private voices = 0;
  private volumes: AudioVolumes = { master: 0.8, sfx: 0.9, music: 0.6, crowd: 0.7 };
  private crowdLevel = 0.3;

  get unlocked(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  async unlock(): Promise<void> {
    const AC: typeof AudioContext | undefined =
      typeof window !== 'undefined' ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;
    if (!AC) return;
    if (!this.ctx) {
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      this.build(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* ignored: will retry on the next gesture */
      }
    }
  }

  private build(ctx: Ctx): void {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    this.crowd = ctx.createGain();
    this.sfx.connect(this.master);
    this.music.connect(this.master);
    this.crowd.connect(this.master);

    // Noise buffers, generated once.
    const len = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;
    const plen = ctx.sampleRate * 4;
    this.pink = ctx.createBuffer(1, plen, ctx.sampleRate);
    const p = this.pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < plen; i++) {
      const x = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + x * 0.0555179;
      b1 = 0.99332 * b1 + x * 0.0750759;
      b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856;
      b4 = 0.55 * b4 + x * 0.5329522;
      b5 = -0.7616 * b5 - x * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
      b6 = x * 0.115926;
    }

    // Ambient crowd bed: two band-limited layers with slow drift.
    this.crowdBed = ctx.createGain();
    this.crowdBed.gain.value = 0;
    this.crowdBed.connect(this.crowd);
    for (const [f, q, g, rate] of [
      [520, 0.6, 0.9, 0.11],
      [1450, 0.9, 0.45, 0.17],
    ] as const) {
      const src = ctx.createBufferSource();
      src.buffer = this.pink;
      src.loop = true;
      src.playbackRate.value = 0.9 + Math.random() * 0.2;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const amp = ctx.createGain();
      amp.gain.value = g;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const depth = ctx.createGain();
      depth.gain.value = g * 0.35;
      lfo.connect(depth).connect(amp.gain);
      src.connect(bp).connect(amp).connect(this.crowdBed);
      src.start();
      lfo.start();
    }
    this.applyVolumes();
    this.setCrowdLevel(this.crowdLevel);
  }

  setVolumes(v: AudioVolumes): void {
    this.volumes = { ...v };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const sq = (x: number): number => Math.max(0, Math.min(1, x)) ** 2;
    this.master.gain.setTargetAtTime(sq(this.volumes.master), t, 0.05);
    this.sfx.gain.setTargetAtTime(sq(this.volumes.sfx), t, 0.05);
    this.music.gain.setTargetAtTime(sq(this.volumes.music) * 0.8, t, 0.05);
    this.crowd.gain.setTargetAtTime(sq(this.volumes.crowd), t, 0.05);
  }

  setSuspended(suspended: boolean): void {
    if (!this.ctx) return;
    if (suspended && this.ctx.state === 'running') void this.ctx.suspend();
    if (!suspended && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  // ── Building blocks ──

  private ready(): Ctx | null {
    return this.ctx && this.ctx.state === 'running' ? this.ctx : null;
  }

  private claim(): boolean {
    if (this.voices >= MAX_VOICES) return false;
    this.voices++;
    return true;
  }

  private release = (): void => {
    this.voices = Math.max(0, this.voices - 1);
  };

  /** Filtered noise burst with an attack/decay envelope. */
  private noise(dest: AudioNode, at: number, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, attack = 0.001, pink = false, freqEnd?: number): void {
    const ctx = this.ctx!;
    if (!this.claim()) return;
    const src = ctx.createBufferSource();
    src.buffer = pink ? this.pink : this.white;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, at);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), at + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(dest);
    const offset = Math.random() * (src.buffer.duration - dur - 0.05);
    src.start(at, Math.max(0, offset), dur + 0.05);
    src.onended = this.release;
  }

  /** Oscillator tone with exponential decay and optional pitch glide. */
  private tone(dest: AudioNode, at: number, dur: number, type: OscillatorType, f0: number, f1: number, gain: number, attack = 0.002): void {
    const ctx = this.ctx!;
    if (!this.claim()) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(dest);
    o.start(at);
    o.stop(at + dur + 0.02);
    o.onended = this.release;
  }

  // ── Game sounds ──

  batCrack(quality: number, ev01: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.001;
    const q = Math.max(0, Math.min(1, quality));
    const e = Math.max(0, Math.min(1, ev01));
    const jitter = 0.94 + Math.random() * 0.12;
    if (q < 0.4) {
      // Weak contact: dull wooden thock.
      this.noise(this.sfx, t, 0.12, 'lowpass', 900 * jitter, 0.7, 0.55 + e * 0.2);
      this.tone(this.sfx, t, 0.09, 'sine', 210 * jitter, 150, 0.35);
      this.noise(this.sfx, t, 0.02, 'highpass', 2500, 0.7, 0.18);
      return;
    }
    const loud = 0.55 + 0.45 * e;
    // Transient click.
    this.noise(this.sfx, t, 0.018, 'highpass', 3200, 0.7, 0.95 * loud);
    // Crack body.
    this.noise(this.sfx, t, 0.07 + q * 0.05, 'bandpass', (1600 + 1700 * q) * jitter, 1.3, 0.85 * loud);
    // Wood ring: inharmonic partials with a tiny pitch drop.
    const base = (880 + 520 * q) * jitter;
    for (const [ratio, g, d] of [
      [1, 0.28, 0.08],
      [2.37, 0.16, 0.06],
      [3.81, 0.1, 0.045],
    ] as const) {
      this.tone(this.sfx, t, d + q * 0.03, 'sine', base * ratio, base * ratio * 0.96, g * q * loud);
    }
    if (q > 0.85) this.noise(this.sfx, t + 0.004, 0.25, 'bandpass', 5200, 0.6, 0.18 * loud, 0.002);
  }

  swingWhoosh(power: boolean): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const d = power ? 0.32 : 0.24;
    this.noise(this.sfx, t, d, 'bandpass', 380, 0.9, power ? 0.42 : 0.28, d * 0.45, false, 2400);
  }

  mittPop(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(this.sfx, t, 0.08, 'sine', 150, 70, 0.75);
    this.noise(this.sfx, t, 0.035, 'bandpass', 1300, 1.1, 0.55);
  }

  thud(intensity: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const i = Math.max(0.2, Math.min(1, intensity));
    this.tone(this.sfx, t, 0.18, 'sine', 95, 48, 0.5 * i);
    this.noise(this.sfx, t, 0.15, 'lowpass', 600, 0.7, 0.35 * i);
  }

  setCrowdLevel(level: number): void {
    this.crowdLevel = level;
    if (!this.ctx) return;
    this.crowdBed.gain.setTargetAtTime(0.06 + Math.max(0, Math.min(1, level)) * 0.32, this.ctx.currentTime, 0.6);
  }

  crowdReaction(kind: 'cheer' | 'roar' | 'ooh' | 'groan'): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const swell = (dur: number, peak: number, attack: number, f0: number, f1: number, q: number, gain: number): void => {
      if (!this.claim()) return;
      const src = ctx.createBufferSource();
      src.buffer = this.pink;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q;
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.exponentialRampToValueAtTime(f1, t + dur * peak);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + attack);
      g.gain.setValueAtTime(gain, t + dur * peak);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp).connect(g).connect(this.crowd);
      src.start(t, Math.random() * 2);
      src.stop(t + dur + 0.05);
      src.onended = this.release;
    };
    switch (kind) {
      case 'roar':
        swell(4.2, 0.45, 0.35, 700, 1100, 0.5, 1.4);
        swell(3.6, 0.4, 0.45, 1800, 2400, 0.8, 0.7);
        for (let i = 0; i < 4; i++) {
          const at = t + 0.3 + Math.random() * 1.5;
          const f = 2000 + Math.random() * 900;
          this.tone(this.crowd, at, 0.45, 'sine', f, f * 1.25, 0.05, 0.08);
        }
        break;
      case 'cheer':
        swell(2.2, 0.35, 0.2, 750, 1000, 0.6, 0.8);
        break;
      case 'ooh':
        swell(1.6, 0.45, 0.35, 380, 650, 2.2, 0.9);
        swell(1.6, 0.45, 0.35, 900, 1100, 2.5, 0.35);
        break;
      case 'groan':
        swell(1.5, 0.25, 0.2, 620, 300, 2.0, 0.75);
        break;
    }
  }

  fireworks(bursts: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    for (let b = 0; b < bursts; b++) {
      const t = ctx.currentTime + b * 0.32 + Math.random() * 0.2 + 0.25;
      this.noise(this.sfx, t, 0.9, 'lowpass', 500, 0.7, 0.6);
      this.tone(this.sfx, t, 0.6, 'sine', 70, 34, 0.55);
      for (let i = 0; i < 12; i++) this.noise(this.sfx, t + 0.25 + Math.random() * 0.7, 0.02, 'highpass', 4000, 0.7, 0.12 + Math.random() * 0.1);
    }
  }

  /** Additive "drawbar" organ note with tremolo. */
  private organNote(at: number, midi: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    if (!this.claim()) return;
    const f = 440 * 2 ** ((midi - 69) / 12);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, at);
    out.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    out.gain.setValueAtTime(gain, at + dur - 0.03);
    out.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    const trem = ctx.createGain();
    trem.gain.value = 0.85;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6.2;
    const depth = ctx.createGain();
    depth.gain.value = 0.15;
    lfo.connect(depth).connect(trem.gain);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4200;
    trem.connect(lp).connect(out).connect(this.music);
    const oscs: OscillatorNode[] = [];
    for (const [mult, g] of [
      [1, 0.5],
      [2, 0.32],
      [3, 0.18],
      [4, 0.14],
    ] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = f * mult;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(trem);
      o.start(at);
      o.stop(at + dur + 0.02);
      oscs.push(o);
    }
    lfo.start(at);
    lfo.stop(at + dur + 0.02);
    oscs[0]!.onended = this.release;
  }

  organCharge(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    // Original rising call: C5 E5 G5 C6 … G5 C6 (held).
    const notes: [number, number, number][] = [
      [72, 0, 0.13],
      [76, 0.15, 0.13],
      [79, 0.3, 0.13],
      [84, 0.45, 0.3],
      [79, 0.8, 0.13],
      [84, 0.95, 0.7],
    ];
    for (const [m, at, d] of notes) this.organNote(t + at, m, d, 0.32);
  }

  /** Detuned-saw brass note through an enveloped low-pass. */
  private brass(at: number, midi: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    if (!this.claim()) return;
    const f = 440 * 2 ** ((midi - 69) / 12);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(500, at);
    lp.frequency.exponentialRampToValueAtTime(3200, at + 0.05);
    lp.frequency.exponentialRampToValueAtTime(1300, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.03);
    g.gain.setValueAtTime(gain * 0.8, at + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    lp.connect(g).connect(this.music);
    let first: OscillatorNode | null = null;
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(at);
      o.stop(at + dur + 0.02);
      first ??= o;
    }
    first!.onended = this.release;
  }

  homeRunJingle(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    const seq: [number, number, number][] = [
      [67, 0, 0.12],
      [72, 0.13, 0.12],
      [76, 0.26, 0.12],
      [79, 0.39, 0.22],
      [76, 0.63, 0.1],
      [79, 0.75, 0.6],
    ];
    for (const [m, at, d] of seq) this.brass(t + at, m, d, 0.16);
    for (const m of [72, 76]) this.brass(t + 0.75, m, 0.6, 0.09);
  }

  stageEnd(success: boolean): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    if (success) {
      const seq = [60, 64, 67, 72, 76, 79, 84];
      seq.forEach((m, i) => this.brass(t + i * 0.08, m, 0.18, 0.12));
      for (const m of [72, 76, 79, 84]) this.brass(t + 0.6, m, 1.0, 0.08);
    } else {
      [67, 66, 65, 64].forEach((m, i) => this.brass(t + i * 0.32, m, i === 3 ? 0.8 : 0.3, 0.12));
    }
  }

  uiClick(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.tone(this.sfx, ctx.currentTime, 0.05, 'sine', 1250, 900, 0.12);
  }

  uiHover(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.tone(this.sfx, ctx.currentTime, 0.03, 'sine', 1900, 1900, 0.035);
  }

  scheduleTick(atAudioTime: number, accent: boolean): void {
    if (!this.ctx) return;
    this.tone(this.sfx, atAudioTime, 0.04, 'square', accent ? 2000 : 1500, accent ? 2000 : 1500, 0.22, 0.001);
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  outputLatency(): number {
    if (!this.ctx) return 0;
    return (this.ctx as AudioContext & { outputLatency?: number }).outputLatency || this.ctx.baseLatency || 0;
  }
}

export const createAudioEngine: CreateAudioEngine = () => new Engine();
