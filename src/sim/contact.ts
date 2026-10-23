import type {
  BattedBall,
  ContactQuality,
  Hand,
  PitchPlan,
  StadiumDef,
  SwingEvaluation,
  SwingKind,
  SwingMods,
  TargetDef,
  TimingLabel,
  Vec2,
} from '../contracts';
import { MPH } from '../config/constants';
import type { Rng } from '../core/rng';
import { fenceDistance, sprayOf } from './field';
import { simulateFlight, targetsHit } from './flight';
import { plateSpeed } from './pitch';

/**
 * Swing → contact model. Two skills are judged independently and both are
 * explained back to the player (see coachLine in game/):
 *
 *  1. WHEN — timing error Δt between the bat reaching the contact plane and
 *     the ball crossing it. Drives spray direction (early = pull) and power.
 *  2. WHERE — offset between the ball and the PCI (plate-coverage indicator)
 *     centre. Vertical offset drives launch angle (ball above centre = bat
 *     under the ball = fly ball), horizontal offset = sweet spot vs. end/handle.
 *
 * Exit velocity uses the classic collision formula EV = q·v_pitch + (1+q)·v_bat
 * (q ≈ 0.2 at the sweet spot), scaled by contact-quality factors.
 */
export interface SwingProfile {
  /** Seconds from input to the bat reaching the contact plane. */
  swingTime: number;
  batSpeed: number;
  pciHalfWidth: number;
  pciHalfHeight: number;
  perfectMs: number;
  goodMs: number;
  /** |Δt| at which spray reaches ~38° (edge of fair contact). */
  windowMs: number;
  /** Beyond this the bat misses entirely. */
  foulMs: number;
}

export const SWING_PROFILES: Record<SwingKind, SwingProfile> = {
  contact: { swingTime: 0.12, batSpeed: 29.0, pciHalfWidth: 0.17, pciHalfHeight: 0.13, perfectMs: 12, goodMs: 30, windowMs: 65, foulMs: 95 },
  power: { swingTime: 0.15, batSpeed: 34.5, pciHalfWidth: 0.125, pciHalfHeight: 0.095, perfectMs: 9, goodMs: 22, windowMs: 50, foulMs: 75 },
};

/** Launch angle at a dead-centre hit and per unit of normalized vertical offset. */
export const LA_BASE = 10;
export const LA_PER_OFFSET = 62;
/** Normalized vertical offset (ball above PCI centre) that maximizes exit velocity. */
export const IDEAL_UNDERCUT = 0.15;
/** Undercut that produces a ~27° launch — what casual mode aims for. */
export const HOME_RUN_UNDERCUT = (27 - LA_BASE) / LA_PER_OFFSET;

export interface SwingInput {
  kind: SwingKind;
  /** Seconds after release at which the bat reaches the contact plane. */
  contactTime: number;
  /** PCI centre on the contact plane (world X/Y). */
  aim: Vec2;
  batter: Hand;
  /** Character/ability multipliers (defaults to the base batter). */
  mods?: SwingMods;
}

/** The swing profile after character/ability multipliers. */
export function swingProfile(kind: SwingKind, mods?: SwingMods): SwingProfile {
  const p = SWING_PROFILES[kind];
  if (!mods) return p;
  const k = mods.pci[kind];
  return { ...p, pciHalfWidth: p.pciHalfWidth * k, pciHalfHeight: p.pciHalfHeight * k, batSpeed: p.batSpeed * mods.bat[kind] };
}

export interface ContactContext {
  stadium: StadiumDef;
  targets: readonly TargetDef[];
  rng: Rng;
}

export function timingLabel(ms: number, profile: SwingProfile): TimingLabel {
  const a = Math.abs(ms);
  if (a <= profile.perfectMs) return 'perfect';
  if (a <= profile.goodMs) return 'good';
  return ms < 0 ? 'early' : 'late';
}

/** Statcast barrel: EV ≥ 98 mph with a launch-angle window that widens with EV. */
export function isBarrel(evMph: number, la: number): boolean {
  if (evMph < 98) return false;
  const extra = Math.min(18, evMph - 98);
  const lo = Math.max(8, 26 - extra);
  const hi = Math.min(50, 30 + extra * (20 / 18));
  return la >= lo && la <= hi;
}

export function classifyQuality(evMph: number, la: number): ContactQuality {
  if (isBarrel(evMph, la)) return 'barrel';
  if (la < 8) return 'topped';
  if (la > 42) return 'under';
  if (evMph >= 85) return 'solid';
  if (evMph >= 70) return 'flare';
  return 'weak';
}

export function evaluateSwing(plan: PitchPlan, swing: SwingInput, ctx: ContactContext): SwingEvaluation {
  const profile = swingProfile(swing.kind, swing.mods);
  const dt = swing.contactTime - plan.flightTime;
  const ms = dt * 1000;
  const label = timingLabel(ms, profile);

  if (Math.abs(ms) > profile.foulMs) {
    return { kind: 'whiff', timingMs: ms, timing: label, missedBy: 'timing' };
  }

  const ball = plan.plateCross;
  const nx = (ball.x - swing.aim.x) / profile.pciHalfWidth;
  const ny = (ball.y - swing.aim.y) / profile.pciHalfHeight;
  if (nx * nx + ny * ny > 1) {
    return { kind: 'whiff', timingMs: ms, timing: label, missedBy: 'location' };
  }

  const rng = ctx.rng;
  const tN = Math.max(-1.6, Math.min(1.6, ms / profile.windowMs));
  const fTiming = Math.max(0.35, 1 - 0.42 * tN * tN);
  const u = Math.min(1, Math.abs(ny - IDEAL_UNDERCUT));
  const fVertical = 1 - 0.55 * u ** 1.7;
  const fHorizontal = 1 - 0.35 * nx * nx;

  const vp = plateSpeed(plan);
  const ev = (0.2 * vp + 1.2 * profile.batSpeed) * fTiming * fVertical * fHorizontal * (1 + rng.gaussian() * 0.012);

  let la = LA_BASE + LA_PER_OFFSET * ny + rng.gaussian() * 1.5;
  la = Math.max(-60, Math.min(85, la));

  const handSign = swing.batter === 'R' ? 1 : -1;
  // Early (tN < 0) pulls the ball; outside pitches drift to the opposite field.
  // RHB stands at +X, so an outside pitch is at −X and goes to RF (+spray).
  let spray = handSign * tN * 38 - (ball.x / 0.25) * 7 + rng.gaussian() * 2;
  spray = Math.max(-89, Math.min(89, spray));

  return { kind: 'contact', timingMs: ms, timing: label, ball: launchBall(ball, ev, la, spray, ctx) };
}

/** Flies a batted ball from `at` and classifies it (shared by every swing model). */
function launchBall(at: { x: number; y: number; z: number }, ev: number, la: number, spray: number, ctx: ContactContext): BattedBall {
  const evMph = ev / MPH;
  const spinRpm = la >= 0 ? Math.min(3000, 500 + 50 * la) : Math.max(-1800, -300 + 40 * la);
  const quality = classifyQuality(evMph, la);
  // Past the foul lines the ball is pure sidespin; behind the plate it barely curves.
  const sideSpin = Math.max(-1, Math.min(1, (Math.abs(spray) > 90 ? Math.sign(spray) * (180 - Math.abs(spray)) : spray) / 45));

  const flight = simulateFlight(
    {
      position: { x: at.x, y: at.y, z: at.z },
      exitVelocity: ev,
      launchAngleDeg: la,
      sprayAngleDeg: spray,
      spinRpm,
      sideSpin,
    },
    ctx.stadium,
  );

  const outcome = flight.outcome === 'inPlay' ? classifyInPlay(evMph, la, flight.hitWall, flight.distance, ctx.stadium, flight.landing) : flight.outcome;

  return {
    exitVelocity: ev,
    launchAngleDeg: la,
    sprayAngleDeg: spray,
    spinRpm,
    quality,
    isBarrel: quality === 'barrel',
    outcome,
    distance: flight.distance,
    projectedDistance: flight.projectedDistance,
    hangTime: flight.hangTime,
    apex: flight.apex,
    fenceIndex: flight.fenceIndex,
    hitWall: flight.hitWall,
    landing: flight.landing,
    trajectory: flight.trajectory,
    targetsHit: outcome === 'foul' ? [] : targetsHit(flight.trajectory, ctx.targets, flight.firstBounceIndex),
  };
}

/** Exit velocity of a maximum-power wild swing (m/s, ≈ 120 mph). */
export const WILD_MAX_EV = 120 * MPH;

/**
 * A no-doubt home run off this pitch: dead-centre, perfect launch at maximum
 * power, with more speed only if a deep park would keep it in. Whiffs are
 * untouched. Used by Chimon's wild racket and Arturek's firecracker.
 */
export function forcedHomeRun(evaluation: SwingEvaluation, plan: PitchPlan, ctx: ContactContext): SwingEvaluation {
  if (evaluation.kind !== 'contact') return evaluation;
  const rng = ctx.rng;
  const at = plan.plateCross;
  const spray = rng.range(-28, 28);
  let ball = launchBall(at, WILD_MAX_EV * rng.range(0.98, 1.02), rng.range(25, 31), spray, ctx);
  for (let k = 1.05; ball.outcome !== 'homeRun' && k < 1.5; k += 0.05) ball = launchBall(at, WILD_MAX_EV * k, 29, spray * 0.5, ctx);
  return { ...evaluation, ball };
}

/**
 * Chimon's racket: whatever the timing or aim, a ball he touches leaves at
 * maximum power. With probability `homeRunChance` it is a no-doubt home run;
 * otherwise it flies off in any foul direction — down the lines, straight up
 * or backwards over the screen — so it can never score. Whiffs are untouched.
 */
export function wildSwing(evaluation: SwingEvaluation, plan: PitchPlan, ctx: ContactContext, homeRunChance: number): SwingEvaluation {
  if (evaluation.kind !== 'contact') return evaluation;
  const rng = ctx.rng;
  const at = plan.plateCross;
  if (rng.next() < homeRunChance) return forcedHomeRun(evaluation, plan, ctx);
  // Any foul direction: past either line (|spray| > 45°) all the way round to
  // straight back (180°), at any launch angle from a chopper to a sky-high pop.
  for (let i = 0; i < 12; i++) {
    const side = rng.next() < 0.5 ? -1 : 1;
    const spray = side * rng.range(58, 180);
    const ball = launchBall(at, WILD_MAX_EV * rng.range(0.95, 1.03), rng.range(-12, 78), spray, ctx);
    if (ball.outcome === 'foul') return { ...evaluation, ball };
  }
  // Fallback that is always foul: straight back over the screen.
  return { ...evaluation, ball: launchBall(at, WILD_MAX_EV, 40, 180, ctx) };
}

/**
 * Hit/out for fair balls that stay in the park. There are no fielders, so the
 * call is deterministic from Statcast-style batted-ball buckets (never random:
 * a well-struck ball must never be ruled an out by chance).
 */
export function classifyInPlay(
  evMph: number,
  la: number,
  hitWall: boolean,
  distance: number,
  stadium: StadiumDef,
  landing: { x: number; z: number },
): 'hit' | 'out' {
  if (hitWall) return 'hit';
  if (la < 10) return evMph >= 100 ? 'hit' : 'out';
  if (la <= 25) return evMph >= 82 ? 'hit' : distance > 45 && distance < 75 ? 'hit' : 'out';
  if (la <= 50) {
    // Bloopers that drop in shallow and balls on the warning track fall in.
    const spray = sprayOf(landing.x, landing.z);
    const fence = fenceDistance(stadium, spray);
    if (distance > fence - 6) return 'hit';
    if (distance > 42 && distance < 68 && evMph < 88) return 'hit';
    return 'out';
  }
  return 'out';
}
