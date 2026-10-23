import type { BattedBall, StadiumDef, Vec3 } from '../contracts';
import { sprayOf, standHeight } from './field';

/** How high (m above the ground under him) the mandem can snag a ball with a leap. */
export const THIEF_REACH = 2.3;

/**
 * Chamo's nerf in Southampton: a home run is snatched beyond the wall by the
 * Slovak mandem. He catches it at the first point past the fence where the
 * ball comes within his reach of the ground (the stands surface), or where it
 * would have come to rest. The ball becomes an out whose flight ends in his
 * hands; `feet` is where he stands to catch it. Null if `ball` is no home run.
 */
export function robHomeRun(ball: BattedBall, stadium: StadiumDef): { ball: BattedBall; catchIndex: number; feet: Vec3 } | null {
  if (ball.outcome !== 'homeRun' || ball.fenceIndex < 0) return null;
  const tr = ball.trajectory;
  const groundAt = (x: number, z: number): number => standHeight(stadium, sprayOf(x, z), Math.hypot(x, z));
  let i = ball.fenceIndex;
  while (i < tr.length - 1 && tr[i]!.y - groundAt(tr[i]!.x, tr[i]!.z) > THIEF_REACH) i++;
  const s = tr[i]!;
  const feet = { x: s.x, y: groundAt(s.x, s.z), z: s.z };
  const distance = Math.hypot(s.x, s.z);
  return {
    catchIndex: i,
    feet,
    ball: {
      ...ball,
      outcome: 'out',
      trajectory: tr.slice(0, i + 1),
      distance,
      projectedDistance: distance,
      hangTime: s.t,
      fenceIndex: -1,
      hitWall: false,
      landing: { x: s.x, y: s.y, z: s.z },
      targetsHit: [],
    },
  };
}
