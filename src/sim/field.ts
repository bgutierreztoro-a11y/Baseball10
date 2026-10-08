import type { StadiumDef } from '../contracts';
import { DEG, FOUL_LINE_ANGLE, FT } from '../config/constants';

/**
 * Fence geometry shared by physics (home-run detection) and rendering (wall
 * mesh), so what you see is exactly what the simulation tests against.
 *
 * The profile is defined at 5 control angles (LF line, LCF, CF, RCF, RF line)
 * and interpolated with a monotone cubic (Catmull-Rom, clamped) in angle.
 */
const CONTROL_ANGLES = [-45, -22.5, 0, 22.5, 45].map((d) => d * DEG);

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function sampleProfile(values: readonly number[], sprayRad: number): number {
  const a = Math.max(-FOUL_LINE_ANGLE, Math.min(FOUL_LINE_ANGLE, sprayRad));
  const step = CONTROL_ANGLES[1]! - CONTROL_ANGLES[0]!;
  const f = (a - CONTROL_ANGLES[0]!) / step;
  const i = Math.min(3, Math.max(0, Math.floor(f)));
  const t = f - i;
  const v = (k: number): number => values[Math.max(0, Math.min(4, k))]!;
  const out = catmullRom(v(i - 1), v(i), v(i + 1), v(i + 2), t);
  // Clamp to the neighbouring control values to avoid overshoot bumps.
  const lo = Math.min(v(i), v(i + 1));
  const hi = Math.max(v(i), v(i + 1));
  return Math.max(lo, Math.min(hi, out));
}

/** Fence distance from home plate (m) at a spray angle (rad, + toward RF). */
export function fenceDistance(stadium: StadiumDef, sprayRad: number): number {
  return sampleProfile(stadium.fence.distancesFt, sprayRad) * FT;
}

/** Wall height (m) at a spray angle (rad). */
export function fenceHeight(stadium: StadiumDef, sprayRad: number): number {
  return sampleProfile(stadium.fence.heightsFt, sprayRad) * FT;
}

/** Spray angle (rad) of a ground point; + toward right field. */
export function sprayOf(x: number, z: number): number {
  return Math.atan2(x, z);
}

/** Slope of the outfield stands rising behind the wall (physics + visuals). */
export const STAND_RISE = Math.tan(28 * DEG);
/** Gap between the wall and the first row of seats (m). */
export const STAND_GAP = 1.5;

/**
 * Height (m) of the seating surface at radius `r` behind the fence: the
 * stands start STAND_GAP behind the wall at wall height and rise at 28°.
 * Home runs come to rest on this surface, so the stadium builder must match it.
 */
export function standHeight(stadium: StadiumDef, sprayRad: number, r: number): number {
  const R = fenceDistance(stadium, sprayRad);
  return fenceHeight(stadium, sprayRad) + Math.max(0, r - R - STAND_GAP) * STAND_RISE;
}

export function isFair(x: number, z: number): boolean {
  return z > 0 && Math.abs(sprayOf(x, z)) <= FOUL_LINE_ANGLE + 1e-9;
}

/**
 * Polyline of the fence (ground level) from the LF foul pole to the RF foul
 * pole, `segments` + 1 points. Used by the stadium builder.
 */
export function fencePolyline(stadium: StadiumDef, segments: number): { x: number; z: number; h: number; angle: number }[] {
  const pts: { x: number; z: number; h: number; angle: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = -FOUL_LINE_ANGLE + (2 * FOUL_LINE_ANGLE * i) / segments;
    const r = fenceDistance(stadium, angle);
    pts.push({ x: Math.sin(angle) * r, z: Math.cos(angle) * r, h: fenceHeight(stadium, angle), angle });
  }
  return pts;
}
