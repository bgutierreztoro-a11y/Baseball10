import type { Hand, PitchPlan, PitchTypeId, Vec3 } from '../contracts';
import {
  BALL,
  CONTACT_PLANE_Z,
  GRAVITY,
  IN,
  MPH,
  RELEASE_HEIGHT,
  RELEASE_SIDE,
  RELEASE_Z,
  STRIKE_ZONE,
} from '../config/constants';
import { PITCH_TYPES } from '../config/pitches';

/**
 * Pitch model: constant acceleration from release to the plate — the same
 * 9-parameter model PITCHf/x and Statcast fit to real pitches. It is exact,
 * analytic and lets us choose WHERE the pitch crosses the plate and WHEN, then
 * solve for the release velocity. Timing judgement therefore has no
 * integration error and no frame-rate dependence.
 */
export interface PitchRequest {
  type: PitchTypeId;
  hand: Hand;
  speedMph: number;
  /** Desired crossing point on the contact plane (world X/Y). */
  target: { x: number; y: number };
  airDensity: number;
}

export function releasePoint(hand: Hand): Vec3 {
  return { x: hand === 'R' ? -RELEASE_SIDE : RELEASE_SIDE, y: RELEASE_HEIGHT, z: RELEASE_Z };
}

export function planPitch(req: PitchRequest): PitchPlan {
  const def = PITCH_TYPES[req.type];
  const p0 = releasePoint(req.hand);
  const v = req.speedMph * MPH;
  const distance = p0.z - CONTACT_PLANE_Z;

  // Drag deceleration (along the direction of travel ≈ -Z), evaluated at a
  // representative mid-flight speed.
  const k = (0.5 * req.airDensity * BALL.dragCoefficient * BALL.area) / BALL.mass;
  const drag = k * (0.95 * v) ** 2;
  const disc = Math.max(0, v * v - 2 * drag * distance);
  const flightTime = (v - Math.sqrt(disc)) / drag;

  // Whole-flight break → constant accelerations (d = ½·a·T²).
  const armSide = req.hand === 'R' ? -1 : 1;
  const T2 = flightTime * flightTime;
  const ax = (2 * def.hbIn * IN * armSide) / T2;
  const ay = -GRAVITY + (2 * def.ivbIn * IN) / T2;
  const a: Vec3 = { x: ax, y: ay, z: drag };

  const target: Vec3 = { x: req.target.x, y: req.target.y, z: CONTACT_PLANE_Z };
  const v0: Vec3 = {
    x: (target.x - p0.x - 0.5 * a.x * T2) / flightTime,
    y: (target.y - p0.y - 0.5 * a.y * T2) / flightTime,
    z: (target.z - p0.z - 0.5 * a.z * T2) / flightTime,
  };

  return {
    type: req.type,
    hand: req.hand,
    speedMph: req.speedMph,
    spinRpm: def.spinRpm,
    p0,
    v0,
    a,
    flightTime,
    plateCross: target,
    isStrike: isInZone(target.x, target.y),
  };
}

export function isInZone(x: number, y: number): boolean {
  return (
    Math.abs(x) <= STRIKE_ZONE.halfWidth &&
    y >= STRIKE_ZONE.bottom - BALL.radius &&
    y <= STRIKE_ZONE.top + BALL.radius
  );
}

/** Ball position `t` seconds after release. Writes into `out` when given (allocation-free). */
export function pitchPosition(plan: PitchPlan, t: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const h = 0.5 * t * t;
  out.x = plan.p0.x + plan.v0.x * t + plan.a.x * h;
  out.y = plan.p0.y + plan.v0.y * t + plan.a.y * h;
  out.z = plan.p0.z + plan.v0.z * t + plan.a.z * h;
  return out;
}

export function pitchVelocity(plan: PitchPlan, t: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  out.x = plan.v0.x + plan.a.x * t;
  out.y = plan.v0.y + plan.a.y * t;
  out.z = plan.v0.z + plan.a.z * t;
  return out;
}

/** Time (s after release) at which the pitch reaches plane Z = `z`, or Infinity if never. */
export function timeAtZ(plan: PitchPlan, z: number): number {
  const A = 0.5 * plan.a.z;
  const B = plan.v0.z;
  const C = plan.p0.z - z;
  if (Math.abs(A) < 1e-9) return B === 0 ? Infinity : -C / B;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  const roots = [(-B - s) / (2 * A), (-B + s) / (2 * A)].filter((r) => r >= 0).sort((p, q) => p - q);
  return roots[0] ?? Infinity;
}

/** Speed (m/s) when the pitch crosses the contact plane. */
export function plateSpeed(plan: PitchPlan): number {
  const v = pitchVelocity(plan, plan.flightTime);
  return Math.hypot(v.x, v.y, v.z);
}
