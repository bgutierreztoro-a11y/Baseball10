/**
 * Contracts for the visual layer. Implementations live in:
 *   - src/render/stadium/   → createStadium()
 *   - src/render/characters/ → createBatter() / createPitcher() / createCatcher() / createUmpire()
 *   - src/render/fx/        → createBallView() / createEffects()
 * The game orchestrator (src/game/) only talks to these interfaces.
 *
 * Coordinate system (docs/CONVENTIONS.md): meters; +X = 1B side, +Y up,
 * +Z = toward the pitcher / center field; origin = back tip of home plate.
 */
import type * as THREE from 'three';
import type {
  CharacterLook,
  Hand,
  QualitySettings,
  StadiumDef,
  SwingKind,
  TargetDef,
  Vec3,
} from '../contracts';

// ───────────────────────────── Stadium ─────────────────────────────

export interface ScoreboardData {
  title: string;
  line1: string;
  line2: string;
  /** Big number on the jumbotron, e.g. "452 FT". */
  big: string;
  highlight: boolean;
}

export interface StadiumView {
  readonly root: THREE.Group;
  /** Main shadow-casting light (sun or stadium key light). */
  readonly keyLight: THREE.DirectionalLight;
  /** Called every frame. `excitement` 0..1 drives crowd motion. */
  update(dt: number, elapsed: number, excitement: number): void;
  setScoreboard(data: ScoreboardData): void;
  /** Shows mission targets (rings on the grass / billboards in the stands). */
  setTargets(targets: TargetDef[]): void;
  /** Visual feedback when a target is hit. */
  markTargetHit(index: number): void;
  dispose(): void;
}

/** Builds the full ballpark and sets scene background, fog and lighting. */
export type CreateStadium = (scene: THREE.Scene, def: StadiumDef, quality: QualitySettings) => StadiumView;

// ───────────────────────────── Characters ─────────────────────────────

export interface BatterRig {
  readonly root: THREE.Group;
  setHandedness(hand: Hand): void;
  setBatColors(wood: string, grip: string): void;
  /**
   * Aim point on the contact plane (world X/Y, meters). The stance and the
   * contact pose bend toward it so the bat visibly meets the ball there.
   */
  setAim(x: number, y: number): void;
  /**
   * Starts the swing. The bat must reach the contact pose exactly
   * `timeToContact` seconds after this call and finish the follow-through
   * ~0.35 s later.
   */
  swing(kind: SwingKind, timeToContact: number): void;
  /** Home-run celebration (bat flip / admire) — plays after contact. */
  celebrate(): void;
  /** Disappointed reaction after a whiff or weak out. */
  react(kind: 'whiff' | 'out'): void;
  /** Back to idle stance. */
  reset(): void;
  update(dt: number): void;
  /** World position of the bat's sweet spot (for contact particles). */
  getBatSweetSpot(target: THREE.Vector3): THREE.Vector3;
}

export interface PitcherRig {
  readonly root: THREE.Group;
  setLook(look: CharacterLook, hand: Hand): void;
  /**
   * Starts the delivery. The throwing hand must reach the release point
   * exactly `timeToRelease` seconds after this call.
   */
  startDelivery(timeToRelease: number): void;
  /** Back to the set position. */
  reset(): void;
  update(dt: number): void;
}

export interface CatcherRig {
  readonly root: THREE.Group;
  /** Mitt target on the contact plane (world X/Y). Animates smoothly. */
  setTarget(x: number, y: number): void;
  /** Pop the mitt (ball received). */
  receive(): void;
  reset(): void;
  update(dt: number): void;
}

export interface UmpireRig {
  readonly root: THREE.Group;
  callStrike(): void;
  reset(): void;
  update(dt: number): void;
}

export interface CharacterFactory {
  createBatter(quality: QualitySettings): BatterRig;
  createPitcher(quality: QualitySettings): PitcherRig;
  createCatcher(quality: QualitySettings): CatcherRig;
  createUmpire(quality: QualitySettings): UmpireRig;
}

// ───────────────────────────── Ball & effects ─────────────────────────────

export interface BallView {
  readonly root: THREE.Group;
  setVisible(v: boolean): void;
  setPosition(p: Vec3): void;
  /** Visual spin (axis in world space, revolutions per second). */
  setSpin(axis: Vec3, rps: number): void;
  /** Trail: 'off' | 'pitch' (subtle) | 'hit' (bright, colored by exit velocity 0..1). */
  setTrail(mode: 'off' | 'pitch' | 'hit', heat?: number): void;
  clearTrail(): void;
  update(dt: number): void;
}

export interface Effects {
  readonly root: THREE.Group;
  /** Contact flash + sparks. power 0..1. */
  contact(at: Vec3, power: number, barrel: boolean): void;
  /** Dust puff where the ball lands / hits the wall. */
  dust(at: Vec3, size: number): void;
  /** Fireworks burst(s) above a point. */
  fireworks(at: Vec3, bursts: number): void;
  /** Confetti rain around the camera target (stage cleared). */
  confetti(around: Vec3): void;
  /** Landing marker ring + floating label (e.g. "432 ft"). Persists until clearMarkers(). */
  landingMarker(at: Vec3, label: string, color: string): void;
  clearMarkers(): void;
  /** Mitt pop dust at the catcher. */
  mittPop(at: Vec3): void;
  update(dt: number, camera: THREE.Camera): void;
}

export type CreateBallView = (quality: QualitySettings) => BallView;
export type CreateEffects = (quality: QualitySettings) => Effects;
