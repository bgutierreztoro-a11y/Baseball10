import type { BattedBall, GoalDef, LimitDef, StageDef, StarCondition } from '../contracts';
import { FT, MPH } from '../config/constants';

/**
 * Rules engine for a batting session (a campaign stage, practice, or derby).
 * Pure state machine: the game feeds it pitch results and it answers with
 * events. Rules (also shown to the player):
 *
 *  - Any swing that does not achieve the stage goal, and any called strike,
 *    costs an out. Taking a ball is free.
 *  - A home run of 440+ ft earns a bonus: +1 out (outs mode) or +5 s (timed).
 *  - Outs mode ends as soon as the goal is met (stars reward efficiency).
 *  - Timed mode runs the clock only while the pitcher is working (never during
 *    the ball-flight cinematic) and ends when time runs out.
 */
export type PitchResult =
  | { kind: 'ball' }
  | { kind: 'calledStrike' }
  | { kind: 'whiff' }
  | { kind: 'contact'; ball: BattedBall };

export type SessionEvent =
  | { type: 'out'; outsLeft: number }
  | { type: 'success' }
  | { type: 'homeRun'; distanceFt: number }
  | { type: 'bonus'; kind: 'out' | 'time' }
  | { type: 'targetHit'; index: number }
  | { type: 'streak'; count: number }
  | { type: 'streakBroken' }
  | { type: 'goalMet' }
  | { type: 'finished'; success: boolean };

export interface SessionRules {
  goal: GoalDef | null;
  limit: LimitDef | null;
  stars: [StarCondition, StarCondition] | null;
  targetCount: number;
}

export const BONUS_DISTANCE_FT = 440;
export const BONUS_TIME_S = 5;

export function rulesForStage(stage: StageDef): SessionRules {
  return { goal: stage.goal, limit: stage.limit, stars: stage.stars, targetCount: stage.targets?.length ?? 0 };
}

export const DERBY_RULES: SessionRules = {
  goal: null,
  limit: { type: 'outs', n: 10 },
  stars: null,
  targetCount: 0,
};

export const PRACTICE_RULES: SessionRules = { goal: null, limit: null, stars: null, targetCount: 0 };

export class Session {
  readonly rules: SessionRules;
  outsLeft: number;
  outsTotal: number;
  timeLeft: number;
  homeRuns = 0;
  hits = 0;
  streak = 0;
  bestStreak = 0;
  barrels = 0;
  swings = 0;
  whiffs = 0;
  pitches = 0;
  longestHRft = 0;
  bestDistanceFt = 0;
  totalHRft = 0;
  maxEVmph = 0;
  readonly targetsHit = new Set<number>();
  goalMet = false;
  finished = false;
  success = false;

  constructor(rules: SessionRules) {
    this.rules = rules;
    this.outsTotal = rules.limit?.type === 'outs' ? rules.limit.n : 0;
    this.outsLeft = this.outsTotal;
    this.timeLeft = rules.limit?.type === 'time' ? rules.limit.seconds : 0;
  }

  get timed(): boolean {
    return this.rules.limit?.type === 'time';
  }

  /** Advances the clock (timed mode). Call only while the pitcher is working. */
  tick(dt: number): SessionEvent[] {
    if (!this.timed || this.finished) return [];
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft <= 0) return this.finish();
    return [];
  }

  /** Progress toward the goal as [current, target]. */
  progress(): [number, number] {
    const g = this.rules.goal;
    if (!g) return [this.homeRuns, 0];
    switch (g.type) {
      case 'hits':
        return [this.hits, g.n];
      case 'homeRuns':
        return [this.homeRuns, g.n];
      case 'targets':
        return [this.targetsHit.size, g.n];
      case 'streak':
        return [this.streak, g.n];
      case 'distance':
        return [Math.round(this.bestDistanceFt), g.ft];
    }
  }

  record(result: PitchResult): SessionEvent[] {
    if (this.finished) return [];
    const events: SessionEvent[] = [];
    this.pitches++;
    if (result.kind === 'ball') return events;

    let success = false;
    if (result.kind === 'whiff') {
      this.swings++;
      this.whiffs++;
    } else if (result.kind === 'contact') {
      this.swings++;
      const b = result.ball;
      const evMph = b.exitVelocity / MPH;
      this.maxEVmph = Math.max(this.maxEVmph, evMph);
      if (b.isBarrel) this.barrels++;
      const fair = b.outcome !== 'foul';
      const distFt = (b.outcome === 'homeRun' ? b.projectedDistance : b.distance) / FT;
      if (fair) this.bestDistanceFt = Math.max(this.bestDistanceFt, distFt);

      if (b.outcome === 'homeRun') {
        this.homeRuns++;
        this.hits++;
        this.longestHRft = Math.max(this.longestHRft, distFt);
        this.totalHRft += distFt;
        this.streak++;
        this.bestStreak = Math.max(this.bestStreak, this.streak);
        events.push({ type: 'homeRun', distanceFt: distFt });
        events.push({ type: 'streak', count: this.streak });
        if (distFt >= BONUS_DISTANCE_FT && this.rules.limit) {
          if (this.rules.limit.type === 'outs') {
            this.outsLeft++;
            events.push({ type: 'bonus', kind: 'out' });
          } else {
            this.timeLeft += BONUS_TIME_S;
            events.push({ type: 'bonus', kind: 'time' });
          }
        }
      } else {
        if (b.outcome === 'hit') this.hits++;
        if (this.streak > 0) events.push({ type: 'streakBroken' });
        this.streak = 0;
      }
      for (const i of b.targetsHit) {
        if (!this.targetsHit.has(i)) {
          this.targetsHit.add(i);
          events.push({ type: 'targetHit', index: i });
          if (this.rules.goal?.type === 'targets') success = true;
        }
      }
      success = success || this.isSuccess(b, distFt);
    }

    if (result.kind === 'calledStrike' || result.kind === 'whiff') {
      if (this.streak > 0) events.push({ type: 'streakBroken' });
      this.streak = 0;
    }

    if (success) events.push({ type: 'success' });
    else if (this.rules.limit?.type === 'outs') {
      this.outsLeft = Math.max(0, this.outsLeft - 1);
      events.push({ type: 'out', outsLeft: this.outsLeft });
    }

    if (!this.goalMet && this.checkGoal()) {
      this.goalMet = true;
      events.push({ type: 'goalMet' });
      if (this.rules.limit?.type === 'outs') events.push(...this.finish());
    }
    if (!this.finished && this.rules.limit?.type === 'outs' && this.outsLeft <= 0) {
      events.push(...this.finish());
    }
    return events;
  }

  /** Does this batted ball count toward the goal (and therefore not cost an out)? */
  private isSuccess(b: BattedBall, distFt: number): boolean {
    const g = this.rules.goal;
    if (!g) return b.outcome === 'homeRun';
    switch (g.type) {
      case 'homeRuns':
      case 'streak':
        return b.outcome === 'homeRun';
      case 'hits':
        return b.outcome === 'homeRun' || b.outcome === 'hit';
      case 'distance':
        return b.outcome !== 'foul' && distFt >= g.ft;
      case 'targets':
        return false; // handled via new target hits
    }
  }

  private checkGoal(): boolean {
    const g = this.rules.goal;
    if (!g) return false;
    switch (g.type) {
      case 'hits':
        return this.hits >= g.n;
      case 'homeRuns':
        return this.homeRuns >= g.n;
      case 'targets':
        return this.targetsHit.size >= g.n;
      case 'streak':
        return this.bestStreak >= g.n;
      case 'distance':
        return this.bestDistanceFt >= g.ft;
    }
  }

  finish(): SessionEvent[] {
    if (this.finished) return [];
    this.finished = true;
    this.success = this.rules.goal ? this.goalMet || this.checkGoal() : true;
    this.goalMet = this.success && !!this.rules.goal;
    return [{ type: 'finished', success: this.success }];
  }

  /** [goal, star2, star3] — independent checks; stars = count of true when goal met. */
  starChecks(): [boolean, boolean, boolean] {
    const goal = this.rules.goal ? this.goalMet : false;
    const s = this.rules.stars;
    if (!s) return [goal, false, false];
    return [goal, goal && this.meets(s[0]), goal && this.meets(s[1])];
  }

  stars(): number {
    return this.starChecks().filter(Boolean).length;
  }

  private meets(c: StarCondition): boolean {
    switch (c.type) {
      case 'outsLeft':
        return this.outsLeft >= c.n;
      case 'timeLeft':
        return this.timeLeft >= c.seconds;
      case 'longestHR':
        return this.longestHRft >= c.ft;
      case 'barrels':
        return this.barrels >= c.n;
      case 'maxEV':
        return this.maxEVmph >= c.mph;
      case 'homeRuns':
        return this.homeRuns >= c.n;
      case 'noWhiffs':
        return this.whiffs === 0;
    }
  }
}
