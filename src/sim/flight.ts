import type { BattedOutcome, StadiumDef, TargetDef, TrajectorySample, Vec3 } from '../contracts';
import { BALL, DEG, FIXED_DT, FOUL_LINE_ANGLE, GRAVITY, RPM_TO_RAD_S } from '../config/constants';
import { STAND_GAP, STAND_RISE, fenceDistance, fenceHeight, sprayOf } from './field';

/**
 * Batted-ball flight: gravity + quadratic drag + Magnus lift, integrated with
 * RK4 at a fixed 240 Hz step. Lift follows the Sawicki–Hubbard–Stronge
 * spin-factor fit used in baseball-physics literature (A. Nathan et al.).
 *
 * The whole flight is precomputed at the moment of contact, so the game knows
 * the outcome instantly (camera planning, slow-motion, crowd) and the render
 * simply plays the samples back.
 */

export interface LaunchParams {
  position: Vec3;
  exitVelocity: number;
  launchAngleDeg: number;
  sprayAngleDeg: number;
  /** Backspin (+) / topspin (−), rpm. */
  spinRpm: number;
  /** −1..1, tilts the spin axis to produce hook/slice. */
  sideSpin: number;
}

export interface FlightResult {
  trajectory: TrajectorySample[];
  outcome: BattedOutcome | 'inPlay';
  distance: number;
  projectedDistance: number;
  hangTime: number;
  apex: number;
  fenceIndex: number;
  hitWall: boolean;
  landing: Vec3;
  firstBounceIndex: number;
}

const SAMPLE_EVERY = 2; // store 120 Hz samples (render interpolates)
const MAX_TIME = 9;

interface State {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/** Lift coefficient from spin factor S = rω/v. */
export function liftCoefficient(spinFactor: number): number {
  const s = Math.abs(spinFactor);
  const cl = s < 0.1 ? 1.5 * s : 0.09 + 0.6 * s;
  return Math.min(cl, 0.42);
}

function launchVelocity(p: LaunchParams): Vec3 {
  const la = p.launchAngleDeg * DEG;
  const sp = p.sprayAngleDeg * DEG;
  return {
    x: p.exitVelocity * Math.cos(la) * Math.sin(sp),
    y: p.exitVelocity * Math.sin(la),
    z: p.exitVelocity * Math.cos(la) * Math.cos(sp),
  };
}

/** Spin vector (rad/s): backspin axis is horizontal ⟂ to travel, tilted by side spin. */
function spinVector(p: LaunchParams, v: Vec3): Vec3 {
  const h = Math.hypot(v.x, v.z) || 1;
  // cross(vHat_horizontal, up) → backspin axis that produces upward Magnus lift.
  const bx = -v.z / h;
  const bz = v.x / h;
  const w = p.spinRpm * RPM_TO_RAD_S;
  const tilt = Math.max(-1, Math.min(1, p.sideSpin)) * 0.3;
  return { x: bx * w * Math.cos(tilt), y: Math.abs(w) * Math.sin(tilt), z: bz * w * Math.cos(tilt) };
}

function makeDeriv(airDensity: number, spin: Vec3) {
  const k = (0.5 * airDensity * BALL.area) / BALL.mass;
  const wMag = Math.hypot(spin.x, spin.y, spin.z);
  return (s: State, out: State): void => {
    const v = Math.hypot(s.vx, s.vy, s.vz) || 1e-6;
    const drag = k * BALL.dragCoefficient * v;
    let mx = 0;
    let my = 0;
    let mz = 0;
    if (wMag > 0) {
      const cl = liftCoefficient((BALL.radius * wMag) / v);
      // Magnus direction = ω̂ × v̂, magnitude k·Cl·v².
      const cx = spin.y * s.vz - spin.z * s.vy;
      const cy = spin.z * s.vx - spin.x * s.vz;
      const cz = spin.x * s.vy - spin.y * s.vx;
      const cm = Math.hypot(cx, cy, cz) || 1;
      const f = (k * cl * v * v) / cm;
      mx = cx * f;
      my = cy * f;
      mz = cz * f;
    }
    out.x = s.vx;
    out.y = s.vy;
    out.z = s.vz;
    out.vx = -drag * s.vx + mx;
    out.vy = -GRAVITY - drag * s.vy + my;
    out.vz = -drag * s.vz + mz;
  };
}

function rk4(s: State, dt: number, deriv: (s: State, o: State) => void, tmp: State[]): void {
  const [k1, k2, k3, k4, t] = tmp as [State, State, State, State, State];
  deriv(s, k1);
  axpy(s, k1, dt / 2, t);
  deriv(t, k2);
  axpy(s, k2, dt / 2, t);
  deriv(t, k3);
  axpy(s, k3, dt, t);
  deriv(t, k4);
  s.x += (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x);
  s.y += (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y);
  s.z += (dt / 6) * (k1.z + 2 * k2.z + 2 * k3.z + k4.z);
  s.vx += (dt / 6) * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx);
  s.vy += (dt / 6) * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy);
  s.vz += (dt / 6) * (k1.vz + 2 * k2.vz + 2 * k3.vz + k4.vz);
}

function axpy(s: State, d: State, h: number, out: State): void {
  out.x = s.x + d.x * h;
  out.y = s.y + d.y * h;
  out.z = s.z + d.z * h;
  out.vx = s.vx + d.vx * h;
  out.vy = s.vy + d.vy * h;
  out.vz = s.vz + d.vz * h;
}

const blank = (): State => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });

/**
 * Carry with no obstacles until the ball returns to field level — Statcast's
 * "projected distance" for home runs.
 */
export function projectedCarry(p: LaunchParams, airDensity: number): { distance: number; hangTime: number; apex: number } {
  const v = launchVelocity(p);
  const s: State = { x: p.position.x, y: p.position.y, z: p.position.z, vx: v.x, vy: v.y, vz: v.z };
  const deriv = makeDeriv(airDensity, spinVector(p, v));
  const tmp = [blank(), blank(), blank(), blank(), blank()];
  let t = 0;
  let apex = s.y;
  let prev = { ...s };
  while (t < MAX_TIME) {
    prev = { ...s };
    rk4(s, FIXED_DT, deriv, tmp);
    t += FIXED_DT;
    apex = Math.max(apex, s.y);
    if (s.y <= BALL.radius && s.vy < 0) break;
  }
  // Interpolate to the exact ground crossing.
  const f = prev.y === s.y ? 1 : (prev.y - BALL.radius) / (prev.y - s.y);
  const x = prev.x + (s.x - prev.x) * f;
  const z = prev.z + (s.z - prev.z) * f;
  return { distance: Math.hypot(x, z), hangTime: t - FIXED_DT * (1 - f), apex };
}

/**
 * Full flight with the ballpark: wall, stands (simplified as a slope rising
 * behind the wall), bounces and roll. Classifies HR / foul / in-play.
 */
export function simulateFlight(p: LaunchParams, stadium: StadiumDef): FlightResult {
  const v = launchVelocity(p);
  const s: State = { x: p.position.x, y: p.position.y, z: p.position.z, vx: v.x, vy: v.y, vz: v.z };
  const deriv = makeDeriv(stadium.airDensity, spinVector(p, v));
  const tmp = [blank(), blank(), blank(), blank(), blank()];
  const traj: TrajectorySample[] = [{ t: 0, x: s.x, y: s.y, z: s.z }];
  const proj = projectedCarry(p, stadium.airDensity);

  let t = 0;
  let step = 0;
  let outcome: FlightResult['outcome'] = 'inPlay';
  let fenceIndex = -1;
  let hitWall = false;
  let landed = false;
  let firstBounceIndex = -1;
  let landing: Vec3 = { x: s.x, y: 0, z: s.z };
  let distance = 0;
  let hangTime = 0;
  let pastFence = false;
  let fenceR = 0;
  let wallH = 0;
  let rolling = false;
  let restTime = 0;
  let bounces = 0;

  const push = (force = false): void => {
    if (force || step % SAMPLE_EVERY === 0) traj.push({ t, x: s.x, y: s.y, z: s.z });
  };

  while (t < MAX_TIME) {
    const prevR = Math.hypot(s.x, s.z);
    const prevY = s.y;
    if (rolling) {
      // Ground roll: simple rolling friction.
      const h = Math.hypot(s.vx, s.vz);
      const dec = 3.2 * FIXED_DT;
      const nh = Math.max(0, h - dec);
      if (h > 0) {
        s.vx *= nh / h;
        s.vz *= nh / h;
      }
      s.x += s.vx * FIXED_DT;
      s.z += s.vz * FIXED_DT;
      s.y = BALL.radius;
      if (nh < 0.3) restTime += FIXED_DT;
      if (restTime > 0.4) break;
    } else {
      rk4(s, FIXED_DT, deriv, tmp);
    }
    t += FIXED_DT;
    step++;

    const r = Math.hypot(s.x, s.z);
    const spray = sprayOf(s.x, s.z);
    const fair = s.z > 0 && Math.abs(spray) <= FOUL_LINE_ANGLE;

    // Crossing the fence line (only meaningful in fair territory).
    if (!pastFence && fair) {
      const R = fenceDistance(stadium, spray);
      if (prevR < R && r >= R) {
        const H = fenceHeight(stadium, spray);
        const f = (R - prevR) / Math.max(1e-6, r - prevR);
        const yAt = prevY + (s.y - prevY) * f;
        if (yAt > H + BALL.radius && !landed) {
          pastFence = true;
          fenceR = R;
          wallH = H;
          if (outcome === 'inPlay') outcome = 'homeRun';
          push(true);
          fenceIndex = traj.length - 1;
          continue;
        }
        // Hits the wall: reflect the radial component with heavy damping.
        hitWall = true;
        const nx = s.x / r;
        const nz = s.z / r;
        const vr = s.vx * nx + s.vz * nz;
        s.vx -= 1.4 * vr * nx;
        s.vz -= 1.4 * vr * nz;
        s.vx *= 0.6;
        s.vz *= 0.6;
        s.x = nx * (R - 0.05);
        s.z = nz * (R - 0.05);
        if (!landed) {
          landed = true;
          landing = { x: s.x, y: Math.max(BALL.radius, s.y), z: s.z };
          distance = R;
          hangTime = t;
        }
        push(true);
        fenceIndex = traj.length - 1;
        if (firstBounceIndex < 0) firstBounceIndex = traj.length - 1;
        continue;
      }
    }

    if (pastFence) {
      // Ball is over the wall: stop when it drops into the stands.
      const standY = wallH + Math.max(0, r - fenceR - STAND_GAP) * STAND_RISE;
      if (s.y <= standY && s.vy < 0) {
        landing = { x: s.x, y: Math.max(0, standY), z: s.z };
        distance = r;
        hangTime = t;
        push(true);
        break;
      }
    } else if (s.y <= BALL.radius && s.vy < 0 && !rolling) {
      // Ground contact.
      s.y = BALL.radius;
      if (!landed) {
        landed = true;
        landing = { x: s.x, y: 0, z: s.z };
        distance = r;
        hangTime = t;
        if (!fair) outcome = 'foul';
      }
      if (firstBounceIndex < 0) firstBounceIndex = traj.length;
      bounces++;
      s.vy = -s.vy * 0.42;
      s.vx *= 0.72;
      s.vz *= 0.72;
      if (s.vy < 1.2 || bounces > 4) {
        rolling = true;
        s.vy = 0;
      }
    }

    // Out of the playable world (deep foul territory or far away).
    if (r > 170 || s.z < -25 || s.y < -1) {
      if (!landed) {
        landing = { x: s.x, y: 0, z: s.z };
        distance = r;
        hangTime = t;
        if (!fair) outcome = 'foul';
      }
      push(true);
      break;
    }
    push();
  }

  if (!landed && outcome === 'inPlay') {
    landing = { x: s.x, y: 0, z: s.z };
    distance = Math.hypot(s.x, s.z);
    hangTime = t;
  }
  // A ball that first touches ground in foul territory before the bases… or
  // any first landing outside the lines is foul (unless it already cleared).
  if (outcome === 'inPlay' && !(landing.z > 0 && Math.abs(sprayOf(landing.x, landing.z)) <= FOUL_LINE_ANGLE)) {
    outcome = 'foul';
  }
  push(true);

  return {
    trajectory: traj,
    outcome,
    distance,
    projectedDistance: outcome === 'homeRun' ? proj.distance : distance,
    hangTime: outcome === 'homeRun' ? proj.hangTime : hangTime,
    apex: proj.apex,
    fenceIndex,
    hitWall,
    landing,
    firstBounceIndex,
  };
}

/** Indices of targets whose centre the trajectory passes within `radius` of. */
export function targetsHit(traj: TrajectorySample[], targets: readonly TargetDef[], untilIndex: number): number[] {
  const hits: number[] = [];
  const end = untilIndex < 0 ? traj.length - 1 : Math.min(untilIndex, traj.length - 1);
  targets.forEach((tg, i) => {
    for (let k = 1; k <= end; k++) {
      if (segmentPointDistance(traj[k - 1]!, traj[k]!, tg.position) <= tg.radius) {
        hits.push(i);
        return;
      }
    }
  });
  return hits;
}

function segmentPointDistance(a: Vec3, b: Vec3, p: Vec3): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz || 1e-9;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2));
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z);
}
