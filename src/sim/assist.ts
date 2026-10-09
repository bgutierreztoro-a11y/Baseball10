import type { SwingKind } from '../contracts';
import type { Rng } from '../core/rng';
import { IDEAL_UNDERCUT, SWING_PROFILES } from './contact';

/**
 * Batting assists that answer the most common complaint about zone hitting
 * in MLB The Show: the PCI has to land exactly on a ball you can barely
 * read, so near-misses feel random. Two helps, both deliberately inexact:
 *
 * 1. Landing hint: an area (not a point) where the pitch will roughly cross.
 *    Its centre is jittered, so it narrows the search without giving the
 *    answer away; the true crossing is always somewhere inside it.
 * 2. Aim magnetism: at swing time the PCI is pulled part of the way toward
 *    the ideal contact point, rescuing swings that just miss the edge.
 */

export const LANDING_HINT = {
  /** Radius of the hint area on the contact plane (m). Zone half-width is 0.216. */
  radius: 0.15,
  /** Std-dev of the jitter applied to the hint centre (m). */
  sigma: 0.055,
  /** The centre never drifts more than this fraction of the radius (keeps the ball inside). */
  maxOffset: 0.6,
} as const;

export interface LandingHint {
  x: number;
  y: number;
  radius: number;
}

export function landingHint(cross: { x: number; y: number }, rng: Rng): LandingHint {
  let ox = rng.gaussian() * LANDING_HINT.sigma;
  let oy = rng.gaussian() * LANDING_HINT.sigma;
  const max = LANDING_HINT.radius * LANDING_HINT.maxOffset;
  const len = Math.hypot(ox, oy);
  if (len > max) {
    ox *= max / len;
    oy *= max / len;
  }
  return { x: cross.x + ox, y: cross.y + oy, radius: LANDING_HINT.radius };
}

export const AIM_ASSIST = {
  /** Misses up to this many PCI radii away are pulled back in. */
  reach: 1.6,
  /** Fraction of the offset removed for a swing right at the PCI edge. */
  pull: 0.3,
  /** Where a rescued near-miss lands, in PCI radii (just inside the edge). */
  rescueTo: 0.92,
} as const;

/**
 * Returns the effective aim after magnetism. The pull targets the ideal
 * contact point (slightly under the ball), never the exact centre, so a
 * barrel still requires a good read.
 */
export function assistAim(aim: { x: number; y: number }, cross: { x: number; y: number }, kind: SwingKind): { x: number; y: number } {
  const p = SWING_PROFILES[kind];
  const ideal = { x: cross.x, y: cross.y - IDEAL_UNDERCUT * p.pciHalfHeight };
  const nx = (ideal.x - aim.x) / p.pciHalfWidth;
  const ny = (ideal.y - aim.y) / p.pciHalfHeight;
  const d = Math.hypot(nx, ny);
  if (d === 0 || d > AIM_ASSIST.reach) return { x: aim.x, y: aim.y };
  const s = d <= 1 ? AIM_ASSIST.pull * d : Math.max(AIM_ASSIST.pull, 1 - AIM_ASSIST.rescueTo / d);
  return { x: aim.x + (ideal.x - aim.x) * s, y: aim.y + (ideal.y - aim.y) * s };
}
