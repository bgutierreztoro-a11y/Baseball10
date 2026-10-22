import type { BattedBall, Vec3 } from '../contracts';

/**
 * Index of the first trajectory sample where a batted ball passes within
 * `radius` of `p` while still in the air (before its first landing; a home
 * run counts until it drops into the stands), or -1 if it never does.
 * Used for Benjamin's lucky penny.
 */
export function trajectoryTouches(ball: BattedBall, p: Vec3, radius: number): number {
  const r2 = radius * radius;
  const until = ball.outcome === 'homeRun' ? Infinity : ball.hangTime;
  const tr = ball.trajectory;
  for (let i = 0; i < tr.length; i++) {
    const s = tr[i]!;
    if (s.t > until) break;
    const dx = s.x - p.x;
    const dy = s.y - p.y;
    const dz = s.z - p.z;
    if (dx * dx + dy * dy + dz * dz <= r2) return i;
  }
  return -1;
}
