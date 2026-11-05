import type { Rng } from '../core/rng';

/**
 * Rules of a quick game (modo Partido). Pure state machine, like Session:
 * the match feeds it pitches and plays, it answers with events.
 *
 *  - You are the home team: the rival bats the top of each inning (simulated
 *    in one go, shown as a summary), you bat the bottom.
 *  - Real count: 4 balls = walk, 3 strikes = strikeout, a foul is a strike
 *    except with two strikes. 3 outs end your half.
 *  - Runners advance with real-baseball rules simplified for an arcade game
 *    (see applyPlay). Runs scored on the play that makes the third out only
 *    count on a time play (batter thrown out on the bases).
 *  - Walk-off: in the bottom of the last (or an extra) inning the game ends
 *    the moment you take the lead. Tied after the last inning → extra
 *    innings with a runner on second (the extra-innings rule), up to
 *    `innings + MAX_EXTRA`, then the game ends in a tie.
 */
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface GameRules {
  innings: number;
  difficulty: Difficulty;
}

export const MAX_EXTRA = 3;

/** Expected rival runs per inning (Poisson λ) for each difficulty. */
export const RIVAL_RUNS: Record<Difficulty, number> = { easy: 0.3, normal: 0.55, hard: 0.85 };

export type PitchCall = 'ball' | 'calledStrike' | 'whiff' | 'foul';

export type Play =
  | { type: 'homeRun' }
  /** Batter safe on `bases` (4 = inside-the-park home run). `deep` = the ball reached the outfield. */
  | { type: 'hit'; bases: 1 | 2 | 3 | 4; deep: boolean }
  /** Batter thrown out trying to take base `safeBases + 1`; he had `safeBases` safely. */
  | { type: 'thrownOut'; safeBases: 1 | 2 | 3; deep: boolean }
  | { type: 'infieldHit' }
  | { type: 'flyOut'; distanceM: number }
  | { type: 'lineOut' }
  | { type: 'groundOut'; doublePlay: boolean; fieldersChoice: boolean; slow: boolean };

export type GameEvent =
  | { type: 'count'; balls: number; strikes: number }
  | { type: 'walk' }
  | { type: 'strikeout' }
  | { type: 'out'; outs: number }
  | { type: 'runs'; n: number; rbi: number }
  | { type: 'sacFly' }
  | { type: 'doublePlay' }
  | { type: 'fieldersChoice' }
  | { type: 'halfOver' }
  | { type: 'rivalHalf'; inning: number; runs: number; hits: number }
  | { type: 'inning'; inning: number; extra: boolean }
  | { type: 'ghostRunner' }
  | { type: 'walkOff' }
  | { type: 'finished'; result: GameResult };

export type GameResult = 'win' | 'loss' | 'tie';

export interface BattingLine {
  plateAppearances: number;
  atBats: number;
  hits: number;
  singles: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  walks: number;
  strikeouts: number;
  rbi: number;
  runs: number;
}

/** Bases occupied (index 0 = first, 1 = second, 2 = third). */
export type Bases = [boolean, boolean, boolean];

export class GameSession {
  readonly rules: GameRules;
  inning = 1;
  outs = 0;
  balls = 0;
  strikes = 0;
  bases: Bases = [false, false, false];
  you = 0;
  rival = 0;
  /** Runs per inning (null = not played yet / not needed). */
  readonly lineYou: (number | null)[] = [];
  readonly lineRival: (number | null)[] = [];
  hitsYou = 0;
  hitsRival = 0;
  finished = false;
  result: GameResult | null = null;
  readonly batting: BattingLine = { plateAppearances: 0, atBats: 0, hits: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, walks: 0, strikeouts: 0, rbi: 0, runs: 0 };
  private readonly rng: Rng;
  /** True while you are batting (bottom half in progress). */
  private hitting = false;

  constructor(rules: GameRules, rng: Rng) {
    this.rules = { innings: Math.max(1, Math.round(rules.innings)), difficulty: rules.difficulty };
    this.rng = rng;
  }

  get isExtra(): boolean {
    return this.inning > this.rules.innings;
  }

  /** Last scheduled inning or later: a lead in the bottom half ends it. */
  private get walkOffInning(): boolean {
    return this.inning >= this.rules.innings;
  }

  /**
   * Plays the top of the current inning (rival, simulated) and opens your
   * half. May end the game (you lead after the rival's last turn).
   */
  startInning(): GameEvent[] {
    if (this.finished) return [];
    const ev: GameEvent[] = [{ type: 'inning', inning: this.inning, extra: this.isExtra }];
    const { runs, hits } = this.simulateRivalHalf();
    this.rival += runs;
    this.hitsRival += hits;
    this.lineRival[this.inning - 1] = runs;
    ev.push({ type: 'rivalHalf', inning: this.inning, runs, hits });
    // Home team already ahead after the rival's last turn: no need to bat.
    if (this.walkOffInning && this.you > this.rival) {
      this.lineYou[this.inning - 1] = null;
      return [...ev, ...this.finish()];
    }
    this.outs = 0;
    this.resetCount();
    this.bases = [false, false, false];
    this.lineYou[this.inning - 1] = 0;
    if (this.isExtra) {
      this.bases[1] = true;
      ev.push({ type: 'ghostRunner' });
    }
    this.hitting = true;
    return ev;
  }

  /** Rival half-inning: Poisson runs (capped), and a plausible hit count. */
  private simulateRivalHalf(): { runs: number; hits: number } {
    let lambda = RIVAL_RUNS[this.rules.difficulty];
    // Extra innings start with a runner on second: more runs.
    if (this.isExtra) lambda += 0.45;
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.rng.next();
    } while (p > L && k < 12);
    const runs = Math.min(5, k - 1);
    const hits = runs + (this.rng.next() < 0.45 ? 1 : 0) + (runs > 0 && this.rng.next() < 0.3 ? 1 : 0);
    return { runs, hits };
  }

  private resetCount(): void {
    this.balls = 0;
    this.strikes = 0;
  }

  /** A pitch that did not put the ball in play. */
  pitch(call: PitchCall): GameEvent[] {
    if (this.finished || !this.hitting) return [];
    const ev: GameEvent[] = [];
    if (call === 'ball') {
      this.balls++;
      if (this.balls >= 4) {
        this.batting.plateAppearances++;
        this.batting.walks++;
        ev.push({ type: 'walk' });
        const runs = this.forceAdvance();
        this.resetCount();
        if (runs) ev.push(...this.score(runs, runs));
        return ev;
      }
    } else if (call === 'foul') {
      if (this.strikes < 2) this.strikes++;
    } else {
      this.strikes++;
      if (this.strikes >= 3) {
        this.batting.plateAppearances++;
        this.batting.atBats++;
        this.batting.strikeouts++;
        ev.push({ type: 'strikeout' });
        this.resetCount();
        ev.push(...this.addOuts(1));
        return ev;
      }
    }
    ev.push({ type: 'count', balls: this.balls, strikes: this.strikes });
    return ev;
  }

  /** Batter to first; forced runners move up. Returns runs forced in. */
  private forceAdvance(): number {
    const [b1, b2, b3] = this.bases;
    if (!b1) this.bases = [true, b2, b3];
    else if (!b2) this.bases = [true, true, b3];
    else if (!b3) this.bases = [true, true, true];
    else return 1; // bases loaded: a run is forced in, they stay loaded
    return 0;
  }

  /** Every runner moves up `n` bases (runners at index i). Returns runs. */
  private advanceAll(n: number, extra: [number, number, number] = [0, 0, 0]): number {
    const next: Bases = [false, false, false];
    let runs = 0;
    for (let i = 2; i >= 0; i--) {
      if (!this.bases[i]) continue;
      const to = i + 1 + n + extra[i]!;
      if (to >= 4) runs++;
      else next[to - 1] = true;
    }
    this.bases = next;
    return runs;
  }

  /** The ball was put in play: apply the play's outcome. */
  applyPlay(play: Play): GameEvent[] {
    if (this.finished || !this.hitting) return [];
    const ev: GameEvent[] = [];
    const b = this.batting;
    b.plateAppearances++;
    this.resetCount();
    const outsBefore = this.outs;
    switch (play.type) {
      case 'homeRun': {
        b.atBats++;
        b.hits++;
        b.homeRuns++;
        this.hitsYou++;
        const runs = this.advanceAll(4) + 1;
        b.runs++;
        ev.push(...this.score(runs, runs));
        break;
      }
      case 'hit': {
        b.atBats++;
        b.hits++;
        this.hitsYou++;
        if (play.bases === 1) b.singles++;
        else if (play.bases === 2) b.doubles++;
        else if (play.bases === 3) b.triples++;
        else b.homeRuns++;
        // Singles to the outfield score a runner from second; deep doubles score from first.
        const extra: [number, number, number] =
          play.bases === 1 && play.deep ? [0, 1, 0] : play.bases === 2 && play.deep ? [1, 0, 0] : [0, 0, 0];
        let runs = this.advanceAll(play.bases, extra);
        if (play.bases === 4) {
          runs++;
          b.runs++;
        } else this.bases[play.bases - 1] = true;
        if (runs) ev.push(...this.score(runs, runs));
        break;
      }
      case 'infieldHit': {
        b.atBats++;
        b.hits++;
        b.singles++;
        this.hitsYou++;
        const runs = this.forceAdvance();
        if (runs) ev.push(...this.score(runs, runs));
        break;
      }
      case 'thrownOut': {
        b.atBats++;
        b.hits++;
        if (play.safeBases === 1) b.singles++;
        else if (play.safeBases === 2) b.doubles++;
        else b.triples++;
        this.hitsYou++;
        const extra: [number, number, number] = play.safeBases === 1 && play.deep ? [0, 1, 0] : [0, 0, 0];
        // Time play: runners who cross before the tag count.
        const runs = this.advanceAll(play.safeBases, extra);
        if (runs) ev.push(...this.score(runs, runs));
        ev.push(...this.addOuts(1));
        break;
      }
      case 'flyOut': {
        b.atBats++;
        const next = this.outs + 1;
        if (next < 3 && this.bases[2] && play.distanceM >= 70) {
          // Sacrifice fly: tags up from third and scores (not an at-bat).
          b.atBats--;
          this.bases[2] = false;
          if (this.bases[1] && play.distanceM >= 90) {
            this.bases[1] = false;
            this.bases[2] = true;
          }
          ev.push({ type: 'sacFly' });
          ev.push(...this.addOuts(1));
          if (!this.finished && this.outs < 3) ev.push(...this.score(1, 1));
        } else ev.push(...this.addOuts(1));
        break;
      }
      case 'lineOut':
        b.atBats++;
        ev.push(...this.addOuts(1));
        break;
      case 'groundOut': {
        b.atBats++;
        if ((play.doublePlay || play.fieldersChoice) && this.bases[0] && outsBefore < 2) {
          // Lead runner forced out at second; the runners ahead of him are forced up a base.
          const [, b2, b3] = this.bases;
          const runs = b2 && b3 ? 1 : 0;
          this.bases = [play.fieldersChoice, false, b2 || b3];
          if (play.doublePlay) {
            ev.push({ type: 'doublePlay' });
            ev.push(...this.addOuts(2));
          } else {
            ev.push({ type: 'fieldersChoice' });
            ev.push(...this.addOuts(1));
          }
          if (runs && !this.finished && this.outs < 3) ev.push(...this.score(runs, play.doublePlay ? 0 : runs));
        } else {
          // Batter out at first; with fewer than two outs a slow roller moves the runners up.
          const productive = outsBefore < 2 && play.slow;
          let runs = 0;
          if (productive) {
            if (this.bases[2]) runs = 1;
            this.bases = [false, this.bases[0], this.bases[1]];
          } else if (this.bases[0]) {
            // Runner on first is forced: he moves up even on a routine grounder.
            const [, b2, b3] = this.bases;
            if (b2 && b3) runs = 1;
            this.bases = [false, true, b2 || b3];
          }
          ev.push(...this.addOuts(1));
          if (runs && !this.finished && this.outs < 3) ev.push(...this.score(runs, runs));
        }
        break;
      }
    }
    return ev;
  }

  private score(runs: number, rbi: number): GameEvent[] {
    if (runs <= 0) return [];
    this.you += runs;
    this.batting.rbi += rbi;
    const i = this.inning - 1;
    this.lineYou[i] = (this.lineYou[i] ?? 0) + runs;
    const ev: GameEvent[] = [{ type: 'runs', n: runs, rbi }];
    if (this.walkOffInning && this.you > this.rival) {
      ev.push({ type: 'walkOff' });
      ev.push(...this.finish());
    }
    return ev;
  }

  private addOuts(n: number): GameEvent[] {
    this.outs = Math.min(3, this.outs + n);
    const ev: GameEvent[] = [{ type: 'out', outs: this.outs }];
    if (this.outs >= 3) ev.push(...this.endHalf());
    return ev;
  }

  /** Your half is over: next inning, or the end of the game. */
  private endHalf(): GameEvent[] {
    this.hitting = false;
    this.bases = [false, false, false];
    const ev: GameEvent[] = [{ type: 'halfOver' }];
    if (this.inning >= this.rules.innings) {
      if (this.you !== this.rival || this.inning >= this.rules.innings + MAX_EXTRA) return [...ev, ...this.finish()];
    }
    this.inning++;
    return ev;
  }

  finish(): GameEvent[] {
    if (this.finished) return [];
    this.finished = true;
    this.hitting = false;
    this.result = this.you > this.rival ? 'win' : this.you < this.rival ? 'loss' : 'tie';
    return [{ type: 'finished', result: this.result }];
  }

  /** Ends the game as a loss whatever the score (the batter cannot go on). */
  forfeit(): GameEvent[] {
    if (this.finished) return [];
    this.finished = true;
    this.hitting = false;
    this.result = 'loss';
    return [{ type: 'finished', result: 'loss' }];
  }

  /** Who is forced at second on a grounder right now (runner on first, < 2 outs). */
  get forceAtSecond(): boolean {
    return this.bases[0] && this.outs < 2;
  }

  /** Whether you are at bat. */
  get atBat(): boolean {
    return this.hitting;
  }
}
