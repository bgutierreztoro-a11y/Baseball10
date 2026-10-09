/**
 * Shared contracts between modules. This file is the single source of truth
 * for data shapes that cross module boundaries (sim ↔ render ↔ ui ↔ audio).
 * Changing a shape here is an architectural change: update docs/03-system-design.md.
 */

// ───────────────────────────── Generic ─────────────────────────────

export type Lang = 'es' | 'en';
export type LocalizedText = Record<Lang, string>;
export type Hand = 'R' | 'L';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ───────────────────────────── Settings & quality ─────────────────────────────

export type QualityTier = 'low' | 'medium' | 'high';

export interface Settings {
  lang: Lang;
  /** pro = aim the PCI + time the swing; casual = timing only (PCI auto-aims). */
  controlMode: 'pro' | 'casual';
  handedness: Hand;
  quality: 'auto' | QualityTier;
  units: 'imperial' | 'metric';
  volume: { master: number; sfx: number; music: number; crowd: number };
  /** Added to every swing timestamp to compensate display/input latency. */
  latencyMs: number;
  reducedMotion: boolean;
  /** Faint trail behind the pitched ball for readability. */
  pitchTrail: boolean;
  showTimingMs: boolean;
  /** Reveals the pitch type while the ball is in flight (assist). */
  showPitchType: boolean;
  /** Shows an approximate (jittered) area where the pitch will cross (assist). */
  pitchHint: boolean;
  /** Pulls near-miss swings toward the ball in pro mode (assist). */
  aimAssist: boolean;
}

export interface QualitySettings {
  tier: QualityTier;
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  bloom: boolean;
  msaa: number;
  crowdCount: number;
  /** Multiplier for particle counts (1 = full). */
  particles: number;
}

// ───────────────────────────── Content definitions ─────────────────────────────

export type StadiumId = 'solar' | 'malecon' | 'metro' | 'cumbre' | 'final';
export type TimeOfDay = 'day' | 'sunset' | 'night';

/** Fence distances (ft) and wall heights (ft) at LF line, LCF, CF, RCF, RF line. */
export interface FenceProfile {
  distancesFt: [number, number, number, number, number];
  heightsFt: [number, number, number, number, number];
}

export interface StadiumPalette {
  grass: string;
  grassAlt: string;
  dirt: string;
  wall: string;
  wallTrim: string;
  seats: string[];
  crowd: string[];
  accent: string;
}

export interface StadiumDef {
  id: StadiumId;
  name: LocalizedText;
  subtitle: LocalizedText;
  timeOfDay: TimeOfDay;
  altitudeM: number;
  /** kg/m³ — drives ball-flight physics (thin air = longer home runs). */
  airDensity: number;
  fence: FenceProfile;
  palette: StadiumPalette;
  /** Visual set pieces the stadium builder should add. */
  features: {
    lightTowers: boolean;
    fireworks: boolean;
    sea: boolean;
    mountains: boolean;
    skyline: boolean;
    /** Sandlot look: chain-link fence, no upper deck. */
    sandlot: boolean;
  };
  /** 0..1 how full the stands are. */
  crowdDensity: number;
}

export type PitchTypeId = 'FF' | 'SI' | 'FC' | 'SL' | 'ST' | 'CU' | 'CH' | 'FS';

export interface PitchTypeDef {
  id: PitchTypeId;
  name: LocalizedText;
  /** Typical speed range (mph) before pitcher/stage modifiers. */
  speedMph: [number, number];
  /** Induced vertical break over the whole flight (in), + = "rises" vs gravity-only path. */
  ivbIn: number;
  /** Horizontal break over the whole flight (in), + = toward the pitcher's arm side. */
  hbIn: number;
  spinRpm: number;
  /** Probability this pitch is aimed below the zone (chase pitch) when out of zone. */
  chaseLow: number;
  color: string;
}

export interface PitcherArsenalEntry {
  type: PitchTypeId;
  weight: number;
  /** Speed offset for this pitcher (mph). */
  speedOffset?: number;
}

export interface CharacterLook {
  skin: string;
  jersey: string;
  jerseyTrim: string;
  pants: string;
  cap: string;
  /** 0.9..1.15 */
  build: number;
}

export interface PitcherDef {
  id: string;
  name: string;
  nickname: LocalizedText;
  hand: Hand;
  arsenal: PitcherArsenalEntry[];
  /** 0..1, how tightly pitches hit the intended target. */
  command: number;
  /** 0..1, probability the intended target is inside the strike zone. */
  zoneRate: number;
  /** Seconds between the end of one pitch and the next windup. */
  tempo: number;
  look: CharacterLook;
}

/** Outfield / stands target used by "targets" missions. */
export interface TargetDef {
  position: Vec3;
  radius: number;
  kind: 'ring' | 'billboard';
}

export type GoalDef =
  | { type: 'hits'; n: number }
  | { type: 'homeRuns'; n: number }
  | { type: 'distance'; ft: number }
  | { type: 'targets'; n: number }
  | { type: 'streak'; n: number };

export type LimitDef = { type: 'outs'; n: number } | { type: 'time'; seconds: number };

export type StarCondition =
  | { type: 'outsLeft'; n: number }
  | { type: 'timeLeft'; seconds: number }
  | { type: 'longestHR'; ft: number }
  | { type: 'barrels'; n: number }
  | { type: 'maxEV'; mph: number }
  | { type: 'homeRuns'; n: number }
  | { type: 'noWhiffs' };

export interface StageDef {
  id: string;
  chapter: number;
  index: number;
  name: LocalizedText;
  stadium: StadiumId;
  pitcher: string;
  goal: GoalDef;
  limit: LimitDef;
  /** Conditions for the 2nd and 3rd star (1st star = goal met). */
  stars: [StarCondition, StarCondition];
  /** Restrict the pitcher's arsenal for this stage (teaching curve). */
  arsenal?: PitchTypeId[];
  speedOffsetMph?: number;
  /** Override the pitcher's zone rate (early stages throw mostly strikes). */
  zoneRate?: number;
  targets?: TargetDef[];
  tip?: LocalizedText;
  boss?: boolean;
}

// ───────────────────────────── Simulation outputs ─────────────────────────────

export interface PitchPlan {
  type: PitchTypeId;
  hand: Hand;
  speedMph: number;
  spinRpm: number;
  /** Release position (m). */
  p0: Vec3;
  /** Initial velocity (m/s). */
  v0: Vec3;
  /** Constant acceleration (m/s²) — gravity + drag + spin-induced movement. */
  a: Vec3;
  /** Seconds from release until the ball reaches the contact plane. */
  flightTime: number;
  /** Where the ball crosses the contact plane. */
  plateCross: Vec3;
  isStrike: boolean;
}

export type SwingKind = 'contact' | 'power';

export type TimingLabel = 'early' | 'late' | 'perfect' | 'good';

export type ContactQuality = 'barrel' | 'solid' | 'flare' | 'weak' | 'topped' | 'under';

export type BattedOutcome = 'homeRun' | 'hit' | 'out' | 'foul';

export interface TrajectorySample {
  t: number;
  x: number;
  y: number;
  z: number;
}

export interface BattedBall {
  exitVelocity: number; // m/s
  launchAngleDeg: number;
  sprayAngleDeg: number; // + toward right field
  spinRpm: number;
  quality: ContactQuality;
  isBarrel: boolean;
  outcome: BattedOutcome;
  /** Horizontal distance from home to where the ball first lands / hits the wall / leaves the park (m). */
  distance: number;
  /** Projected carry distance (m) as if the ball flew unobstructed to the ground. Used for HR distances. */
  projectedDistance: number;
  hangTime: number;
  apex: number;
  /** Index in `trajectory` where the ball crosses the fence line (HR) or hits the wall, else -1. */
  fenceIndex: number;
  hitWall: boolean;
  landing: Vec3;
  trajectory: TrajectorySample[];
  /** Indices of mission targets this ball hit. */
  targetsHit: number[];
}

export type SwingEvaluation =
  | { kind: 'whiff'; timingMs: number; timing: TimingLabel | null; missedBy: 'timing' | 'location' }
  | { kind: 'contact'; timingMs: number; timing: TimingLabel; ball: BattedBall };

export type PitchEndReason = 'ball' | 'calledStrike' | 'whiff' | 'contact';

// ───────────────────────────── Persistence ─────────────────────────────

export interface StageProgress {
  stars: number;
  completed: boolean;
  bestLongestFt: number;
}

export interface LifetimeStats {
  swings: number;
  homeRuns: number;
  barrels: number;
  longestHRft: number;
  maxEVmph: number;
}

export interface SaveData {
  version: number;
  settings: Settings;
  stages: Record<string, StageProgress>;
  stats: LifetimeStats;
  derbyBest: number;
  selectedBat: string;
  selectedCharacter: CharacterId;
  seenTips: string[];
}

// ───────────────────────────── Cosmetics ─────────────────────────────

export interface BatDef {
  id: string;
  name: LocalizedText;
  starsRequired: number;
  wood: string;
  grip: string;
  trail: string;
}

// ───────────────────────────── Playable characters ─────────────────────────────

export type CharacterId = 'moro' | 'mati' | 'arturek' | 'chamo';

/** Multipliers applied to a swing profile (1 = base batter). */
export interface SwingMods {
  /** PCI size (both axes) for each swing kind. */
  pci: Record<SwingKind, number>;
  /** Bat speed for each swing kind (drives exit velocity). */
  bat: Record<SwingKind, number>;
}

/** Visual build of a batter; consumed by the character renderer. */
export interface BatterLook {
  skin: string;
  /** Hair colour, or null for none visible under the helmet. */
  hair: string | null;
  /** Standing height in metres (base model ≈ 1.85 m). */
  heightM: number;
  /** Torso/hip width multiplier (1 = base). */
  build: number;
  /** Belly size 0..1 (0 = flat). */
  belly: number;
  /** Muscle definition 0..1: broader shoulders, bigger arms, narrower waist. */
  muscle: number;
  /** A second pair of arms (decorative; they mirror the batting arms). */
  extraArms: boolean;
  beard: boolean;
  /** Long curved villain horns on the head (through the helmet). */
  horns: boolean;
  /** Bats with a giant horn instead of a wooden bat. */
  hornBat: boolean;
  jersey: string;
  trim: string;
  number: string;
}

export interface CharacterAbility {
  /** Activated by the player (key E, touch button). */
  kind: 'peak';
  name: LocalizedText;
  description: LocalizedText;
  /** Pitches the boost lasts once activated. */
  pitches: number;
  /** Activations per match. */
  uses: number;
  mods: SwingMods;
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  /** Short tagline, e.g. "El Gigante de Bratislava". */
  title: LocalizedText;
  bio: LocalizedText;
  look: BatterLook;
  mods: SwingMods;
  ability: CharacterAbility | null;
}
