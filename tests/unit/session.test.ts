import { describe, expect, it } from 'vitest';
import type { BattedBall } from '../../src/contracts';
import { FT, MPH } from '../../src/config/constants';
import { stageById } from '../../src/config/campaign';
import { DERBY_RULES, Session, rulesForStage } from '../../src/sim/session';

function ball(over: Partial<BattedBall> = {}): BattedBall {
  return {
    exitVelocity: 100 * MPH,
    launchAngleDeg: 28,
    sprayAngleDeg: 0,
    spinRpm: 1900,
    quality: 'barrel',
    isBarrel: true,
    outcome: 'homeRun',
    distance: 400 * FT,
    projectedDistance: 410 * FT,
    hangTime: 5,
    apex: 30,
    fenceIndex: 10,
    hitWall: false,
    landing: { x: 0, y: 3, z: 125 },
    trajectory: [],
    targetsHit: [],
    ...over,
  };
}

const hr = (ft = 410) => ({ kind: 'contact' as const, ball: ball({ projectedDistance: ft * FT }) });
const out = { kind: 'contact' as const, ball: ball({ outcome: 'out', isBarrel: false, quality: 'under' }) };

describe('session rules', () => {
  it('home-run goal finishes as soon as it is met', () => {
    const s = new Session(rulesForStage(stageById('1-4')!)); // 3 HR, 7 outs
    s.record(hr());
    s.record(out);
    s.record(hr());
    expect(s.finished).toBe(false);
    const ev = s.record(hr());
    expect(ev.some((e) => e.type === 'finished')).toBe(true);
    expect(s.success).toBe(true);
    expect(s.outsLeft).toBe(6);
  });

  it('taking a ball is free; a called strike costs an out', () => {
    const s = new Session(rulesForStage(stageById('1-4')!));
    s.record({ kind: 'ball' });
    expect(s.outsLeft).toBe(7);
    s.record({ kind: 'calledStrike' });
    expect(s.outsLeft).toBe(6);
  });

  it('fails when outs run out', () => {
    const s = new Session(rulesForStage(stageById('1-2')!)); // 1 HR, 6 outs
    for (let i = 0; i < 6; i++) s.record({ kind: 'whiff' });
    expect(s.finished).toBe(true);
    expect(s.success).toBe(false);
    expect(s.stars()).toBe(0);
  });

  it('440+ ft home runs grant a bonus out', () => {
    const s = new Session(DERBY_RULES);
    const ev = s.record(hr(452));
    expect(ev).toContainEqual({ type: 'bonus', kind: 'out' });
    expect(s.outsLeft).toBe(11);
  });

  it('streaks reset on any non-HR swing or called strike, but not on balls', () => {
    const s = new Session(rulesForStage(stageById('3-3')!)); // streak 3
    s.record(hr());
    s.record(hr());
    s.record({ kind: 'ball' });
    expect(s.streak).toBe(2);
    s.record(out);
    expect(s.streak).toBe(0);
    s.record(hr());
    s.record(hr());
    s.record(hr());
    expect(s.success).toBe(true);
  });

  it('hits goal counts in-play hits and home runs', () => {
    const s = new Session(rulesForStage(stageById('1-1')!)); // 3 hits
    s.record({ kind: 'contact', ball: ball({ outcome: 'hit', isBarrel: false }) });
    s.record(hr());
    s.record({ kind: 'contact', ball: ball({ outcome: 'hit', isBarrel: false }) });
    expect(s.success).toBe(true);
  });

  it('target goal counts unique targets only', () => {
    const s = new Session(rulesForStage(stageById('1-3')!)); // 2 targets
    s.record({ kind: 'contact', ball: ball({ outcome: 'out', targetsHit: [1] }) });
    const before = s.outsLeft;
    s.record({ kind: 'contact', ball: ball({ outcome: 'out', targetsHit: [1] }) });
    expect(s.outsLeft).toBe(before - 1);
    s.record({ kind: 'contact', ball: ball({ outcome: 'out', targetsHit: [0] }) });
    expect(s.success).toBe(true);
  });

  it('timed rounds run the clock and keep going after the goal', () => {
    const s = new Session(rulesForStage(stageById('1-5')!)); // 5 HR in 60 s
    for (let i = 0; i < 5; i++) s.record(hr());
    expect(s.goalMet).toBe(true);
    expect(s.finished).toBe(false);
    s.tick(30);
    s.tick(31);
    expect(s.finished).toBe(true);
    expect(s.success).toBe(true);
  });

  it('awards stars independently once the goal is met', () => {
    const s = new Session(rulesForStage(stageById('1-2')!)); // 1 HR; ★2 outsLeft 3; ★3 longest 330
    s.record(hr(345));
    expect(s.starChecks()).toEqual([true, true, true]);
    expect(s.stars()).toBe(3);
  });

  it('distance goal uses projected distance of fair balls', () => {
    const s = new Session(rulesForStage(stageById('2-4')!)); // 410 ft
    s.record(hr(400));
    expect(s.success).toBe(false);
    s.record(hr(415));
    expect(s.success).toBe(true);
  });
});
