import type { BattedBall, StadiumDef } from '../contracts';
import { BASE_DISTANCE, DEG, MPH } from '../config/constants';
import { fenceDistance, polarToXZ, sprayOf } from './field';

/**
 * Base running (docs/adr/ADR-010-carreras.md). Pure and deterministic: the
 * same batted ball, runner speed and player decisions always give the same
 * play, so a well-judged dash is never ruled out by chance.
 *
 * Model (timings tuned against public Statcast figures):
 *  - Runner: sprint speed 7.0–9.3 m/s (23–30.5 ft/s, MLB range) from the
 *    0..25 speed rating, ~0.85 s lost leaving the box, 0.25 s per base
 *    rounded. Home → first ≈ 4.3 s for an average runner, 3.8 s elite.
 *  - Ball: grounders roll at ~60 % of the exit velocity; balls in the air
 *    bounce on with part of their horizontal speed and decelerate on the
 *    grass until a fielder cuts them off or they reach the wall.
 *  - Fielders: start from standard positions, react, run at 7–8 m/s, take
 *    a moment to field, transfer and throw (36 m/s outfield, 34 m/s infield;
 *    a long throw goes through a cut-off man).
 *  - The ball is always thrown to the base the runner is heading for; a
 *    throw that beats him there (by the tag time) is an out.
 */

export interface XZ {
  x: number;
  z: number;
}

/** 0 = home, 1 = first, 2 = second, 3 = third, 4 = home again (a run). */
export type BaseIndex = 0 | 1 | 2 | 3 | 4;

export type FielderId = 'P' | '1B' | '2B' | 'SS' | '3B' | 'LF' | 'CF' | 'RF';

export const BASE_POS: readonly XZ[] = [
  { x: 0, z: 0 },
  polarToXZ(45 * DEG, BASE_DISTANCE),
  { x: 0, z: BASE_DISTANCE * Math.SQRT2 },
  polarToXZ(-45 * DEG, BASE_DISTANCE),
  { x: 0, z: 0 },
];

export function basePos(b: number): XZ {
  return BASE_POS[Math.max(0, Math.min(4, b))]!;
}

/** Standard defensive alignment: spray angle (deg, + toward RF) and depth (m). */
const ALIGNMENT: Record<FielderId, { spray: number; r: number; infield: boolean }> = {
  P: { spray: 0, r: 17.5, infield: true },
  '1B': { spray: 39, r: 28, infield: true },
  '2B': { spray: 15, r: 42, infield: true },
  SS: { spray: -15, r: 42, infield: true },
  '3B': { spray: -39, r: 28, infield: true },
  LF: { spray: -28, r: 86, infield: false },
  CF: { spray: 0, r: 96, infield: false },
  RF: { spray: 28, r: 86, infield: false },
};

export const FIELDER_IDS: readonly FielderId[] = ['P', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];

/** Where a fielder stands before the pitch (outfielders play in front of short fences). */
export function fielderHome(id: FielderId, stadium: StadiumDef): XZ {
  const a = ALIGNMENT[id];
  const r = a.infield ? a.r : Math.min(a.r, fenceDistance(stadium, a.spray * DEG) - 14);
  return polarToXZ(a.spray * DEG, r);
}

// ── Tunables ──
export const RUN = {
  minSpeed: 7.0,
  maxSpeed: 9.3,
  /** Seconds lost leaving the box (finish the swing, drop the bat, first steps). */
  start: 0.5,
  /** Extra time of the first leg (acceleration). */
  accel: 0.35,
  /** Time lost rounding a base without stopping. */
  turn: 0.25,
  /** The ball must beat the runner by this much to make the tag. */
  tag: 0.08,
  /** Best slide: gets to the bag this much sooner. A slide started too early costs time. */
  slidePerfect: 0.12,
  slideEarly: -0.12,
} as const;

const FIELD = {
  reactIF: 0.25,
  reactOF: 0.35,
  speedIF: 7.0,
  speedOF: 8.0,
  /** Gloving a ball on the move (outfield / infield). */
  gloveOF: 0.35,
  gloveIF: 0.2,
  transferIF: 0.7,
  /** Outfielders crow-hop before throwing. */
  transferOF: 0.9,
  /** Fielding a slow roller on the run, or after a dive, takes longer to throw. */
  transferHurried: 1.05,
  throwIF: 34,
  throwOF: 36,
  /** Throws longer than this go through a cut-off man (slower). */
  relayOver: 60,
  relaySpeed: 28,
  relayPenalty: 0.8,
  /** Baseman catching and relaying to another base. */
  relayTransfer: 0.45,
  /** Grass deceleration of a rolling ball (m/s²). */
  rollDecel: 2.5,
} as const;

/** Sprint speed (m/s) from the 0..25 speed rating (10 = base runner). */
export function runnerSpeed(rating: number): number {
  const k = Math.max(0, Math.min(25, rating)) / 25;
  return RUN.minSpeed + (RUN.maxSpeed - RUN.minSpeed) * k;
}

/**
 * Seconds from contact until a batter-runner running through every base
 * touches base `b` (no stops, no slide).
 */
export function timeToBase(rating: number, b: number): number {
  const v = runnerSpeed(rating);
  return RUN.start + RUN.accel + (b * BASE_DISTANCE) / v + Math.max(0, b - 1) * RUN.turn;
}

/** Ball position while it is loose (before a fielder has it): y for rendering. */
export interface LooseBall {
  x: number;
  y: number;
  z: number;
}

/** How the defence plays one batted ball: who gets it, where and when. */
export interface FieldingPlan {
  fielder: FielderId;
  fielderStart: XZ;
  /** Where the fielder picks the ball up and when (s after contact). */
  pickup: XZ;
  pickupTime: number;
  /** When the ball first touches the ground (s after contact); 0 for a grounder. */
  groundTime: number;
  /** Where the ball first touches the ground. */
  ground: XZ;
  /** Seconds from pickup until the ball leaves his hand. */
  transfer: number;
  infield: boolean;
  /** Ball reached the outfield (runners take an extra base on singles). */
  deep: boolean;
  /** Ball rolled to (or was hit off) the wall. */
  wall: boolean;
}

/** Throw flight time between two points for this fielder (relay for long throws). */
export function throwTime(from: XZ, to: XZ, infield: boolean): number {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  if (d > FIELD.relayOver) return d / FIELD.relaySpeed + FIELD.relayPenalty;
  return d / (infield ? FIELD.throwIF : FIELD.throwOF);
}

function sub(a: XZ, b: XZ): XZ {
  return { x: a.x - b.x, z: a.z - b.z };
}

function len(a: XZ): number {
  return Math.hypot(a.x, a.z);
}

/**
 * The fielding plan for a fair ball that stays in the park. Grounders the
 * contact model ruled outs are fielded by an infielder (the runner can still
 * beat the throw: an infield hit); everything else is run down by the
 * nearest outfielder after it lands and rolls.
 */
export function planFielding(ball: BattedBall, stadium: StadiumDef): FieldingPlan {
  const evMph = ball.exitVelocity / MPH;
  if (ball.outcome === 'out' && ball.launchAngleDeg < 10) return planGrounder(ball, stadium, evMph);
  return planOutfield(ball, stadium);
}

function planGrounder(ball: BattedBall, stadium: StadiumDef, evMph: number): FieldingPlan {
  const spray = ball.sprayAngleDeg * DEG;
  const sprayDeg = ball.sprayAngleDeg;
  const id: FielderId = sprayDeg < -27 ? '3B' : sprayDeg < 0 ? 'SS' : sprayDeg < 27 ? '2B' : '1B';
  const start = fielderHome(id, stadium);
  const vg = Math.max(8, ball.exitVelocity * 0.62 * 0.95);
  // Weak grounders: the fielder charges in and throws on the run.
  const weak = evMph < 62;
  const depth = len(start);
  const r = weak ? Math.max(12, depth * 0.72) : Math.max(14, depth - 1.5);
  const pickup = polarToXZ(spray, r);
  const tBall = r / vg;
  const lateral = len(sub(pickup, start));
  const tFielder = FIELD.reactIF + lateral / FIELD.speedIF;
  // Way off the fielder: he dives for it, which slows the throw.
  const dive = tFielder > tBall + 0.3;
  const pickupTime = Math.max(tBall, tFielder) + 0.15 + (dive ? 0.3 : 0);
  return {
    fielder: id,
    fielderStart: start,
    pickup,
    pickupTime,
    groundTime: 0,
    ground: { x: 0, z: 0.6 },
    transfer: weak || dive ? FIELD.transferHurried : FIELD.transferIF,
    infield: true,
    deep: false,
    wall: false,
  };
}

function planOutfield(ball: BattedBall, stadium: StadiumDef): FieldingPlan {
  const land: XZ = { x: ball.landing.x, z: ball.landing.z };
  const grounder = ball.launchAngleDeg < 10;
  const groundTime = grounder ? 0 : ball.hangTime;
  const ground: XZ = grounder ? { x: 0, z: 0.6 } : land;
  const dir = grounder ? { x: Math.sin(-ball.sprayAngleDeg * DEG), z: Math.cos(ball.sprayAngleDeg * DEG) } : normalized(land);
  // Speed the ball keeps rolling with after the first bounce.
  const vh = ball.exitVelocity * Math.cos(Math.max(0, ball.launchAngleDeg) * DEG);
  const keep = grounder ? 0.62 * 0.95 : ball.launchAngleDeg <= 25 ? 0.45 : ball.launchAngleDeg <= 40 ? 0.22 : 0.08;
  const v0 = ball.hitWall ? 3 : vh * keep;
  let from = ground;
  let rollDir = dir;
  if (ball.hitWall) {
    // Off the wall: it caroms back toward the infield.
    rollDir = { x: -dir.x, z: -dir.z };
    from = land;
  }
  const wallR = fenceDistance(stadium, sprayOf(from.x, from.z)) - 1;
  const rollTo = (tau: number): { p: XZ; done: boolean } => {
    const tStop = v0 / FIELD.rollDecel;
    const t = Math.min(tau, tStop);
    let d = v0 * t - 0.5 * FIELD.rollDecel * t * t;
    let p = { x: from.x + rollDir.x * d, z: from.z + rollDir.z * d };
    if (!ball.hitWall && len(p) > wallR) {
      d = Math.max(0, wallR - len(from));
      p = { x: from.x + rollDir.x * d, z: from.z + rollDir.z * d };
      return { p, done: true };
    }
    return { p, done: tau >= tStop };
  };
  // Outfielders only (infielders when the ball dies in the infield).
  const candidates: FielderId[] = len(land) < 38 && !grounder ? ['1B', '2B', 'SS', '3B', 'P'] : ['LF', 'CF', 'RF'];
  let best: FieldingPlan | null = null;
  for (const id of candidates) {
    const start = fielderHome(id, stadium);
    const infield = !['LF', 'CF', 'RF'].includes(id);
    const react = infield ? FIELD.reactIF : FIELD.reactOF;
    const sp = infield ? FIELD.speedIF : FIELD.speedOF;
    let pick: XZ | null = null;
    let time = 0;
    for (let tau = 0; tau <= 12; tau += 0.05) {
      const r = rollTo(tau);
      const reach = react + len(sub(r.p, start)) / sp;
      if (reach <= groundTime + tau) {
        pick = r.p;
        time = groundTime + tau;
        break;
      }
      if (r.done) {
        pick = r.p;
        time = Math.max(groundTime + tau, reach);
        break;
      }
    }
    if (!pick) continue;
    const plan: FieldingPlan = {
      fielder: id,
      fielderStart: start,
      pickup: pick,
      pickupTime: time + (infield ? FIELD.gloveIF : FIELD.gloveOF),
      groundTime,
      ground,
      transfer: infield ? FIELD.transferIF : FIELD.transferOF,
      infield,
      deep: len(pick) > 45,
      wall: ball.hitWall || len(pick) >= wallR - 0.5,
    };
    if (!best || plan.pickupTime < best.pickupTime) best = plan;
  }
  return best!;
}

function normalized(p: XZ): XZ {
  const l = len(p) || 1;
  return { x: p.x / l, z: p.z / l };
}

/** Loose-ball position (for rendering) between the first bounce and the pickup. */
export function looseBallAt(plan: FieldingPlan, t: number): XZ {
  if (t <= plan.groundTime) return plan.ground;
  const glove = plan.infield ? FIELD.gloveIF : FIELD.gloveOF;
  const u = Math.min(1, (t - plan.groundTime) / Math.max(0.05, plan.pickupTime - glove - plan.groundTime));
  // Decelerating roll: fast at first, easing into the pickup point.
  const e = 1 - (1 - u) * (1 - u);
  return { x: plan.ground.x + (plan.pickup.x - plan.ground.x) * e, z: plan.ground.z + (plan.pickup.z - plan.ground.z) * e };
}

/** Where the fielding fielder is at time t (runs from his spot to the pickup). */
export function fielderAt(plan: FieldingPlan, t: number): XZ {
  const react = plan.infield ? FIELD.reactIF : FIELD.reactOF;
  const sp = plan.infield ? FIELD.speedIF : FIELD.speedOF;
  const d = len(sub(plan.pickup, plan.fielderStart));
  const k = d > 0 ? Math.max(0, Math.min(1, ((t - react) * sp) / d)) : 1;
  return { x: plan.fielderStart.x + (plan.pickup.x - plan.fielderStart.x) * k, z: plan.fielderStart.z + (plan.pickup.z - plan.fielderStart.z) * k };
}

// ───────────────────────────── The play ─────────────────────────────

export type BallState =
  | { kind: 'loose' }
  | { kind: 'held'; at: XZ; since: number; base: number | null }
  | { kind: 'thrown'; from: XZ; to: number; departAt: number; arriveAt: number };

export type RunEvent =
  | { type: 'pickup'; fielder: FielderId }
  | { type: 'throw'; to: number; arriveAt: number }
  | { type: 'catch'; base: number }
  | { type: 'touch'; base: number }
  | { type: 'safe'; base: number; margin: number }
  | { type: 'out'; base: number; margin: number }
  | { type: 'run' }
  | { type: 'slide'; quality: 'perfect' | 'early' | 'late' }
  | { type: 'done' };

export type CoachSign = 'go' | 'risky' | 'hold';

export interface RunOptions {
  /** 0..25 speed rating of the batter-runner. */
  speed: number;
  /**
   * Ground ball with a runner forced at second (and fewer than two outs):
   * the fielder goes to second first, then relays to first (double play or
   * fielder's choice).
   */
  forceSecond?: boolean;
}

export interface RunResult {
  /** Last base reached safely (0 if out at first). */
  bases: number;
  out: boolean;
  /** Base where he was put out (out only). */
  outAt: number | null;
  /** The forced lead runner was put out at second (forceSecond). */
  forceOut: boolean;
}

/**
 * One batter-runner on one batted ball, stepped in real time. The player
 * sends him on (`advance`), sends him back (`retreat`) and times the slide;
 * the defence always throws to the base he is heading for.
 */
export class BaseRunningPlay {
  readonly plan: FieldingPlan;
  readonly speed: number;
  t = 0;
  /** Runner: last base touched, base he is running toward, metres covered on this leg. */
  from = 0;
  toward = 1;
  s = 0;
  /** Base where he intends to stop. */
  goal = 1;
  stopped = false;
  out = false;
  outAt: number | null = null;
  forceOut = false;
  finished = false;
  ball: BallState = { kind: 'loose' };
  private readonly v: number;
  /** Seconds of standing still left (leaving the box, rounding a base). */
  private delay: number;
  private legBonus = 0;
  private slid = false;
  private forcePending: boolean;
  private settleT = -1;

  constructor(plan: FieldingPlan, opts: RunOptions) {
    this.plan = plan;
    this.speed = opts.speed;
    this.v = runnerSpeed(opts.speed);
    this.delay = RUN.start + RUN.accel;
    this.forcePending = !!opts.forceSecond;
  }

  /** Runner position on the field. */
  position(): XZ {
    const a = basePos(this.from);
    const b = basePos(this.toward);
    const k = Math.max(0, Math.min(1, this.s / BASE_DISTANCE));
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
  }

  /** Distance (m) to the base he is running toward. */
  get distanceToBase(): number {
    return BASE_DISTANCE - this.s;
  }

  /** Bases covered so far (fractional), for ghost runners. */
  get progress(): number {
    return this.toward > this.from ? this.from + this.s / BASE_DISTANCE : this.from - this.s / BASE_DISTANCE;
  }

  /** Send him on to the next base. */
  advance(): boolean {
    if (this.finished || this.out || this.goal >= 4) return false;
    if (this.stopped) {
      this.stopped = false;
      this.from = this.goal;
      this.toward = this.goal + 1;
      this.s = 0;
      this.goal += 1;
      this.delay = 0.25;
      this.slid = false;
      this.legBonus = 0;
      this.settleT = -1;
      return true;
    }
    // Running toward `toward`: keep going past it (or further).
    if (this.toward > this.from) {
      this.goal = Math.min(4, Math.max(this.goal, this.toward) + 1);
      return true;
    }
    return false;
  }

  /** Back to the last base (not on the way to first). */
  retreat(): boolean {
    if (this.finished || this.out || this.stopped) return false;
    if (this.toward > this.from && this.goal > this.toward) {
      // Changed his mind before reaching the bag: stop at it.
      this.goal = this.toward;
      return true;
    }
    if (this.toward > this.from && this.from >= 1) {
      // Turn around: he is now heading back to `from`.
      const back = this.from;
      this.from = this.toward;
      this.toward = back;
      this.s = BASE_DISTANCE - this.s;
      this.goal = back;
      this.slid = false;
      this.legBonus = 0;
      return true;
    }
    return false;
  }

  /** Mid-slide (for the pose): slid into the bag he is about to reach. */
  get sliding(): boolean {
    return this.slid && !this.stopped && this.distanceToBase < 4.5;
  }

  /** True when a throw is coming to the base he is about to reach. */
  get slideWindow(): boolean {
    if (this.finished || this.out || this.stopped || this.slid) return false;
    const d = this.distanceToBase;
    if (d > 4.5) return false;
    const b = this.ball;
    return b.kind === 'thrown' && b.to === this.toward;
  }

  /** Slide into the bag: perfect inside the last 2.6 m, early before. */
  slide(): RunEvent | null {
    if (!this.slideWindow) return null;
    this.slid = true;
    const d = this.distanceToBase;
    const quality: 'perfect' | 'early' = d <= 2.6 ? 'perfect' : 'early';
    this.legBonus = quality === 'perfect' ? RUN.slidePerfect : RUN.slideEarly;
    return { type: 'slide', quality };
  }

  /**
   * Coach's read on going one base further than his current goal: compares
   * the runner's arrival with the defence's best throw there.
   */
  coach(): CoachSign | null {
    if (this.finished || this.out || this.goal >= 4) return null;
    const next = this.stopped ? this.goal + 1 : Math.max(this.goal, this.toward) + 1;
    if (next > 4) return null;
    const margin = this.predictBallAt(next) - this.predictRunnerAt(next);
    return margin > 0.35 ? 'go' : margin > -0.1 ? 'risky' : 'hold';
  }

  /** Seconds until the runner would touch base `b` if sent there now. */
  predictRunnerAt(b: number): number {
    let t = this.t + Math.max(0, this.delay);
    if (this.stopped) {
      t += 0.25 + ((b - this.goal) * BASE_DISTANCE) / this.v + Math.max(0, b - this.goal - 1) * RUN.turn;
      return t;
    }
    if (this.toward < this.from) {
      // Retreating: has to stop, turn and come back.
      return t + 0.4 + (this.distanceToBase + BASE_DISTANCE * (b - this.toward)) / this.v;
    }
    t += this.distanceToBase / this.v;
    t += (b - this.toward) * (BASE_DISTANCE / this.v + RUN.turn);
    return t;
  }

  /** Earliest time the defence can have the ball at base `b`. */
  predictBallAt(b: number): number {
    const target = basePos(b);
    const ball = this.ball;
    if (ball.kind === 'loose') {
      return Math.max(this.t, this.plan.pickupTime) + this.plan.transfer + throwTime(this.plan.pickup, target, this.plan.infield);
    }
    if (ball.kind === 'held') {
      if (ball.base === b) return this.t;
      return Math.max(this.t, ball.since + FIELD.relayTransfer) + throwTime(ball.at, target, true);
    }
    if (ball.to === b) return ball.arriveAt;
    return ball.arriveAt + FIELD.relayTransfer + throwTime(basePos(ball.to), target, true);
  }

  /** Advance the play by dt seconds. */
  step(dt: number): RunEvent[] {
    const ev: RunEvent[] = [];
    if (this.finished) return ev;
    this.t += dt;
    this.stepBall(ev);
    if (!this.out && !this.stopped) this.stepRunner(dt, ev);
    if (this.out) {
      this.finish(ev);
      return ev;
    }
    // Over once he is standing on a bag and the ball is back in the infield.
    if (this.stopped && this.ball.kind === 'held' && this.ball.base !== null) {
      if (this.settleT < 0) this.settleT = this.t;
      if (this.t - this.settleT > 0.45) this.finish(ev);
    }
    return ev;
  }

  private finish(ev: RunEvent[]): void {
    if (this.finished) return;
    this.finished = true;
    ev.push({ type: 'done' });
  }

  private stepBall(ev: RunEvent[]): void {
    const b = this.ball;
    if (b.kind === 'loose') {
      if (this.t >= this.plan.pickupTime) {
        this.ball = { kind: 'held', at: this.plan.pickup, since: this.plan.pickupTime, base: null };
        ev.push({ type: 'pickup', fielder: this.plan.fielder });
      }
      return;
    }
    if (b.kind === 'held') {
      const transfer = b.base === null ? this.plan.transfer : FIELD.relayTransfer;
      if (this.t < b.since + transfer) return;
      const target = this.throwTarget(b, b.base !== null || this.plan.infield);
      if (target === null || target === b.base) return;
      const departAt = b.since + transfer;
      const infield = b.base !== null || this.plan.infield;
      const arriveAt = departAt + throwTime(b.at, basePos(target), infield);
      this.ball = { kind: 'thrown', from: b.at, to: target, departAt, arriveAt };
      ev.push({ type: 'throw', to: target, arriveAt });
      return;
    }
    if (this.t >= b.arriveAt) {
      this.ball = { kind: 'held', at: basePos(b.to), since: b.arriveAt, base: b.to };
      ev.push({ type: 'catch', base: b.to });
      if (this.forcePending && b.to === 2) {
        // Lead runner forced out at second; now the relay to first.
        this.forcePending = false;
        this.forceOut = true;
      }
    }
  }

  /** Where the fielder holding the ball throws. */
  private throwTarget(b: { at: XZ; base: number | null }, infield: boolean): number | null {
    if (this.forcePending) return 2;
    if (this.stopped) {
      // No play on him: get it back to the infield, to the base ahead of him.
      if (b.base !== null) return null;
      return Math.min(4, this.goal + 1);
    }
    const k = this.toward;
    if (k < this.from || k >= 4) return k;
    // He will clearly beat a throw to the bag he is heading for: throw ahead
    // of him instead, so he cannot take another base.
    const runnerAt = this.t + Math.max(0, this.delay) + this.distanceToBase / this.v;
    const ballAt = this.t + throwTime(b.at, basePos(k), infield);
    return runnerAt < ballAt - 0.3 ? k + 1 : k;
  }

  private stepRunner(dt: number, ev: RunEvent[]): void {
    let move = dt;
    if (this.delay > 0) {
      const used = Math.min(this.delay, move);
      this.delay -= used;
      move -= used;
      if (move <= 0) return;
    }
    this.s += this.v * move;
    if (this.s < BASE_DISTANCE) return;
    // Touches the bag. How far over (seconds) he went this frame:
    const over = (this.s - BASE_DISTANCE) / this.v;
    const touchT = this.t - over - this.legBonus;
    const base = this.toward;
    this.s = BASE_DISTANCE;
    const b = this.ball;
    const ballThere = b.kind === 'held' ? (b.base === base ? b.since : Infinity) : b.kind === 'thrown' && b.to === base ? b.arriveAt : Infinity;
    const margin = ballThere - touchT;
    if (margin < RUN.tag) {
      // The ball beat him there (or bang-bang within the tag time): out.
      this.out = true;
      this.outAt = base;
      ev.push({ type: 'out', base, margin });
      return;
    }
    ev.push({ type: 'touch', base });
    if (Number.isFinite(ballThere) || this.forcePending) ev.push({ type: 'safe', base, margin });
    this.from = base;
    this.legBonus = 0;
    this.slid = false;
    if (base === 4 || base === this.goal) {
      this.toward = base;
      this.s = 0;
      this.stopped = true;
      if (base === 4) this.finish(ev);
      return;
    }
    if (this.goal > base) {
      this.toward = base + 1;
      this.s = 0;
      this.delay = RUN.turn;
      ev.push({ type: 'run' });
    } else {
      this.toward = base;
      this.s = 0;
      this.stopped = true;
    }
  }

  result(): RunResult {
    // Out while retreating: `from` is the base he never reached, so take the lower one.
    return { bases: this.out ? Math.max(0, Math.min(this.from, this.toward)) : this.stopped ? this.toward : this.from, out: this.out, outAt: this.outAt, forceOut: this.forceOut };
  }
}

/**
 * Plays a whole run with a fixed policy (tests, CPU and the "auto" option):
 * keeps sending the runner while the coach says go (or until `maxBase`).
 */
export function autoRun(plan: FieldingPlan, opts: RunOptions & { policy?: 'safe' | 'aggressive'; maxBase?: number }): RunResult {
  const play = new BaseRunningPlay(plan, opts);
  const max = opts.maxBase ?? 4;
  for (let i = 0; i < 4000 && !play.finished; i++) {
    const sign = play.coach();
    const nextGoal = play.stopped ? play.goal + 1 : Math.max(play.goal, play.toward) + 1;
    if (nextGoal <= max && (sign === 'go' || (opts.policy === 'aggressive' && sign === 'risky'))) play.advance();
    if (play.slideWindow && play.distanceToBase <= 2.4) play.slide();
    play.step(1 / 120);
  }
  return play.result();
}
