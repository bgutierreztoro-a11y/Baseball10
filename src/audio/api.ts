/**
 * Audio contract. Everything is synthesized at runtime with the Web Audio API
 * (no audio files): see docs/adr/ADR-005-procedural-assets.md.
 */
export interface AudioVolumes {
  master: number;
  sfx: number;
  music: number;
  crowd: number;
}

export interface AudioEngine {
  /** Must be called from a user gesture (browser autoplay policy). Idempotent. */
  unlock(): Promise<void>;
  readonly unlocked: boolean;
  setVolumes(v: AudioVolumes): void;
  /** Pause/resume everything (tab hidden, pause menu). */
  setSuspended(suspended: boolean): void;

  /** Bat-ball contact. quality 0..1 (1 = barrel), exitVelocity01 0..1. */
  batCrack(quality: number, exitVelocity01: number): void;
  swingWhoosh(power: boolean): void;
  mittPop(): void;
  /** Ball hits the outfield wall / seats. */
  thud(intensity: number): void;
  /** Ambient crowd bed level 0..1 (smoothly interpolated). */
  setCrowdLevel(level: number): void;
  /** Short crowd reaction. */
  crowdReaction(kind: 'cheer' | 'roar' | 'ooh' | 'groan'): void;
  fireworks(bursts: number): void;
  /** Stadium organ riff ("charge!") at stage start. */
  organCharge(): void;
  /** Short jingle when a home run is confirmed. */
  homeRunJingle(): void;
  /** Stage cleared fanfare / failed sting. */
  stageEnd(success: boolean): void;
  uiClick(): void;
  uiHover(): void;
  /** Metronome tick for latency calibration (scheduled at an AudioContext time). */
  scheduleTick(atAudioTime: number, accent: boolean): void;
  /** Current AudioContext time + output latency estimate, for calibration. */
  now(): number;
  outputLatency(): number;
}

export type CreateAudioEngine = () => AudioEngine;
