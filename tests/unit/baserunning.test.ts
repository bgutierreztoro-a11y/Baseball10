import { describe, expect, it } from 'vitest';
import { MPH } from '../../src/config/constants';
import { STADIUMS } from '../../src/config/stadiums';
import { Rng } from '../../src/core/rng';
import { BASE_POS, BaseRunningPlay, autoRun, fielderHome, planFielding, runnerSpeed, timeToBase } from '../../src/sim/baserunning';
import { launchBall } from '../../src/sim/contact';

const metro = STADIUMS.metro;
const ball = (evMph: number, la: number, spray: number, stadium = metro) =>
  launchBall({ x: 0, y: 0.8, z: 0.43 }, evMph * MPH, la, spray, { stadium, targets: [], rng: new Rng(1) });

describe('runner speed', () => {
  it('maps the 0..25 rating onto the MLB sprint-speed range', () => {
    expect(runnerSpeed(0)).toBeCloseTo(7.0, 5); // ~23 ft/s
    expect(runnerSpeed(25)).toBeCloseTo(9.3, 5); // ~30.5 ft/s
    expect(runnerSpeed(99)).toBe(runnerSpeed(25));
  });

  it('home to first ≈ 4.3 s for an average runner, 3.8 s elite, 4.8 s slow', () => {
    expect(timeToBase(10, 1)).toBeGreaterThan(4.2);
    expect(timeToBase(10, 1)).toBeLessThan(4.4);
    expect(timeToBase(25, 1)).toBeLessThan(3.9);
    expect(timeToBase(0, 1)).toBeGreaterThan(4.7);
    // A double ≈ 8 s and a triple ≈ 11.7 s for an average runner.
    expect(timeToBase(10, 2)).toBeCloseTo(8.0, 0);
    expect(timeToBase(10, 3)).toBeGreaterThan(11);
  });
});

describe('fielding plan', () => {
  it('bases form a 90 ft diamond: first on the right-field side (−X)', () => {
    expect(BASE_POS[1]!.x).toBeLessThan(0);
    expect(BASE_POS[3]!.x).toBeGreaterThan(0);
    expect(Math.hypot(BASE_POS[1]!.x, BASE_POS[1]!.z)).toBeCloseTo(27.43, 1);
  });

  it('outfielders play in front of short fences', () => {
    const solar = STADIUMS.solar;
    const cf = fielderHome('CF', solar);
    expect(Math.hypot(cf.x, cf.z)).toBeLessThan(96);
  });

  it('a routine grounder goes to an infielder, a liner to an outfielder', () => {
    const g = ball(85, 0, -10);
    expect(g.outcome).toBe('out');
    const pg = planFielding(g, metro);
    expect(pg.infield).toBe(true);
    expect(pg.fielder).toBe('SS');
    expect(pg.pickupTime).toBeLessThan(2.5);

    const l = ball(95, 15, -20);
    expect(l.outcome).toBe('hit');
    const pl = planFielding(l, metro);
    expect(pl.infield).toBe(false);
    expect(pl.fielder).toBe('LF');
    expect(pl.pickupTime).toBeGreaterThan(l.hangTime);
  });
});

describe('base running play', () => {
  it('a routine grounder is an out at first for everyone but the fastest runner on a slow roller', () => {
    const plan = planFielding(ball(85, 0, -10), metro);
    for (const speed of [0, 10, 25]) expect(autoRun(plan, { speed }).out).toBe(true);
    const slow = planFielding(ball(70, 0, -10), metro);
    expect(autoRun(slow, { speed: 10 }).out).toBe(true);
    expect(autoRun(slow, { speed: 25 })).toMatchObject({ out: false, bases: 1 });
  });

  it('a liner in front of the left fielder is a single; trying for two gets you thrown out', () => {
    const plan = planFielding(ball(95, 15, -20), metro);
    expect(autoRun(plan, { speed: 10 })).toMatchObject({ out: false, bases: 1 });
    const play = new BaseRunningPlay(plan, { speed: 10 });
    play.advance(); // send him to second right away
    for (let i = 0; i < 3000 && !play.finished; i++) play.step(1 / 120);
    expect(play.result()).toMatchObject({ out: true, outAt: 2 });
  });

  it('a ball off the wall in the gap is a double for an average runner, a single for a slow one', () => {
    const plan = planFielding(ball(100, 18, -14), metro);
    expect(plan.wall).toBe(true);
    expect(autoRun(plan, { speed: 10 })).toMatchObject({ out: false, bases: 2 });
    expect(autoRun(plan, { speed: 0 })).toMatchObject({ out: false, bases: 1 });
  });

  it('the coach reads the throw: green on a sure double, red on a sure out', () => {
    const gap = new BaseRunningPlay(planFielding(ball(100, 18, -14), metro), { speed: 25 });
    expect(gap.coach()).toBe('go');
    const liner = new BaseRunningPlay(planFielding(ball(95, 15, -20), metro), { speed: 10 });
    expect(liner.coach()).toBe('hold');
  });

  it('retreat first cancels the extra base, then turns him around', () => {
    const play = new BaseRunningPlay(planFielding(ball(95, 15, -20), metro), { speed: 10 });
    play.advance();
    expect(play.goal).toBe(2);
    expect(play.retreat()).toBe(true);
    expect(play.goal).toBe(1);
    // On the way to first he cannot turn back to home.
    expect(play.retreat()).toBe(false);
  });

  it('a perfect slide beats a throw that would otherwise tag him', () => {
    // Find a ball where going for two is a bang-bang play for an average runner.
    const tries = [
      [100, 18, -14],
      [101, 16, 24],
      [99, 21, -24],
      [98, 14, -32],
    ] as const;
    let found = false;
    for (const [ev, la, spray] of tries) {
      const plan = planFielding(ball(ev, la, spray), metro);
      for (const speed of [4, 6, 8, 10, 12, 14]) {
        const run = (slide: boolean): ReturnType<BaseRunningPlay['result']> => {
          const p = new BaseRunningPlay(plan, { speed });
          p.advance();
          for (let i = 0; i < 3000 && !p.finished; i++) {
            if (slide && p.slideWindow && p.distanceToBase <= 2.2) p.slide();
            p.step(1 / 240);
          }
          return p.result();
        };
        const plain = run(false);
        const slid = run(true);
        if (plain.out && plain.outAt === 2 && !slid.out) {
          expect(slid.bases).toBe(2);
          found = true;
          break;
        }
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });

  it('forced at second: the defence turns two on a routine grounder, the fast runner beats the relay', () => {
    const plan = planFielding(ball(95, 3, -8), metro);
    const slow = autoRun(plan, { speed: 0, forceSecond: true });
    expect(slow.forceOut).toBe(true);
    expect(slow.out).toBe(true);
    const fast = autoRun(planFielding(ball(72, 0, -12), metro), { speed: 25, forceSecond: true });
    expect(fast.forceOut).toBe(true);
    expect(fast.out).toBe(false);
  });

  it('is deterministic', () => {
    const plan = planFielding(ball(99, 21, -24), metro);
    expect(autoRun(plan, { speed: 12, policy: 'aggressive' })).toEqual(autoRun(plan, { speed: 12, policy: 'aggressive' }));
  });
});
