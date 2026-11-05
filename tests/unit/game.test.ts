import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { GameSession, MAX_EXTRA, RIVAL_RUNS } from '../../src/sim/game';

/** A game whose rival never scores (λ forced to 0 by the RNG stub). */
class ZeroRng extends Rng {
  constructor() {
    super(1);
  }
  override next(): number {
    return 0.0000001;
  }
}

const opened = (innings = 3) => {
  const g = new GameSession({ innings, difficulty: 'normal' }, new ZeroRng());
  g.startInning();
  return g;
};

describe('count', () => {
  it('four balls is a walk, three strikes a strikeout, fouls stop at two strikes', () => {
    const g = opened();
    for (let i = 0; i < 3; i++) g.pitch('ball');
    expect(g.balls).toBe(3);
    expect(g.pitch('ball').some((e) => e.type === 'walk')).toBe(true);
    expect(g.bases).toEqual([true, false, false]);
    expect(g.balls).toBe(0);

    g.pitch('foul');
    g.pitch('foul');
    g.pitch('foul');
    expect(g.strikes).toBe(2);
    expect(g.pitch('whiff').some((e) => e.type === 'strikeout')).toBe(true);
    expect(g.outs).toBe(1);
    expect(g.batting.strikeouts).toBe(1);
  });

  it('a bases-loaded walk forces in a run', () => {
    const g = opened();
    g.bases = [true, true, true];
    for (let i = 0; i < 4; i++) g.pitch('ball');
    expect(g.you).toBe(1);
    expect(g.bases).toEqual([true, true, true]);
  });
});

describe('plays', () => {
  it('a grand slam scores four', () => {
    const g = opened();
    g.bases = [true, true, true];
    g.applyPlay({ type: 'homeRun' });
    expect(g.you).toBe(4);
    expect(g.bases).toEqual([false, false, false]);
    expect(g.batting.rbi).toBe(4);
  });

  it('a single to the outfield scores the runner from second', () => {
    const g = opened();
    g.bases = [false, true, false];
    g.applyPlay({ type: 'hit', bases: 1, deep: true });
    expect(g.you).toBe(1);
    expect(g.bases).toEqual([true, false, false]);
  });

  it('a sacrifice fly scores from third with fewer than two outs (not an at-bat)', () => {
    const g = opened();
    g.bases = [false, false, true];
    const ev = g.applyPlay({ type: 'flyOut', distanceM: 85 });
    expect(ev.some((e) => e.type === 'sacFly')).toBe(true);
    expect(g.you).toBe(1);
    expect(g.outs).toBe(1);
    expect(g.batting.atBats).toBe(0);
  });

  it('no sacrifice fly on the third out', () => {
    const g = opened();
    g.outs = 2;
    g.bases = [false, false, true];
    g.applyPlay({ type: 'flyOut', distanceM: 95 });
    expect(g.you).toBe(0);
  });

  it('double play erases the runner on first and the batter', () => {
    const g = opened();
    g.bases = [true, false, false];
    g.applyPlay({ type: 'groundOut', doublePlay: true, fieldersChoice: false, slow: false });
    expect(g.outs).toBe(2);
    expect(g.bases).toEqual([false, false, false]);
  });

  it('thrown out stretching a single still scores the runner from third (time play)', () => {
    const g = opened();
    g.outs = 2;
    g.bases = [false, false, true];
    g.applyPlay({ type: 'thrownOut', safeBases: 1, deep: true });
    expect(g.you).toBe(1);
    expect(g.atBat).toBe(false);
  });
});

describe('innings', () => {
  it('three outs end your half and open the next inning', () => {
    const g = opened(3);
    for (let i = 0; i < 3; i++) g.applyPlay({ type: 'lineOut' });
    expect(g.atBat).toBe(false);
    expect(g.inning).toBe(2);
    g.startInning();
    expect(g.atBat).toBe(true);
    expect(g.lineRival).toEqual([0, 0]);
  });

  it('walk-off: the game ends the moment you take the lead in the last inning', () => {
    const g = opened(1);
    g.rival = 1;
    g.bases = [false, true, false];
    g.applyPlay({ type: 'hit', bases: 2, deep: true });
    expect(g.finished).toBe(false); // tied 1-1
    const ev = g.applyPlay({ type: 'hit', bases: 1, deep: true });
    expect(ev.some((e) => e.type === 'walkOff')).toBe(true);
    expect(g.result).toBe('win');
  });

  it('tied after the last inning → extras with a runner on second, then a tie at the cap', () => {
    const g = opened(1);
    for (let i = 0; i < 3; i++) g.applyPlay({ type: 'lineOut' });
    expect(g.finished).toBe(false);
    const ev = g.startInning();
    expect(ev.some((e) => e.type === 'ghostRunner')).toBe(true);
    expect(g.bases).toEqual([false, true, false]);
    for (let inning = 2; inning <= 1 + MAX_EXTRA; inning++) {
      for (let i = 0; i < 3; i++) g.applyPlay({ type: 'lineOut' });
      if (!g.finished) g.startInning();
    }
    expect(g.finished).toBe(true);
    expect(g.result).toBe('tie');
  });

  it('the rival scores more on harder difficulties', () => {
    const avg = (d: 'easy' | 'normal' | 'hard') => {
      let runs = 0;
      for (let s = 0; s < 300; s++) {
        const g = new GameSession({ innings: 3, difficulty: d }, new Rng(s));
        g.startInning();
        runs += g.rival;
      }
      return runs / 300;
    };
    const easy = avg('easy');
    const hard = avg('hard');
    expect(easy).toBeLessThan(hard);
    expect(easy).toBeGreaterThan(RIVAL_RUNS.easy * 0.6);
    expect(hard).toBeLessThan(RIVAL_RUNS.hard * 1.4);
  });

  it('home team already ahead after the top of the last inning does not bat', () => {
    const g = new GameSession({ innings: 1, difficulty: 'easy' }, new ZeroRng());
    g.you = 2;
    const ev = g.startInning();
    expect(ev.some((e) => e.type === 'finished')).toBe(true);
    expect(g.result).toBe('win');
  });
});
