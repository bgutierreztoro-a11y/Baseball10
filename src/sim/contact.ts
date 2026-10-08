import type {
  BattedBall,
  ContactQuality,
  Hand,
  PitchPlan,
  StadiumDef,
  SwingEvaluation,
  SwingKind,
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
  if (evMph >= 92) return 'solid';
  if (evMph >= 72) return 'flare';
  return 'weak';
}

export function evaluateSwing(plan: PitchPlan, swing: SwingInput, ctx: ContactContext): SwingEvaluation {
  const profile = SWING_PROFILES[swing.kind];
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

  const evMph = ev / MPH;
  const spinRpm = la >= 0 ? Math.min(3000, 500 + 50 * la) : Math.max(-1800, -300 + 40 * la);
  const quality = classifyQuality(evMph, la);

  const flight = simulateFlight(
    {
      position: { x: ball.x, y: ball.y, z: ball.z },
      exitVelocity: ev,
      launchAngleDeg: la,
      sprayAngleDeg: spray,
      spinRpm,
      sideSpin: Math.max(-1, Math.min(1, spray / 45)),
    },
    ctx.stadium,
  );

  const outcome = flight.outcome === 'inPlay' ? classifyInPlay(evMph, la, flight.hitWall, flight.distance, ctx.stadium, flight.landing) : flight.outcome;

  const batted: BattedBall = {
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

  return { kind: 'contact', timingMs: ms, timing: label, ball: batted };
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
