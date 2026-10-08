import { describe, expect, it } from 'vitest';
import { MPH } from '../../src/config/constants';
import { STADIUMS } from '../../src/config/stadiums';
import { classifyQuality, isBarrel, SWING_PROFILES, timingLabel } from '../../src/sim/contact';
import { fastball, swing } from './helpers';

const ev = (r: ReturnType<typeof swing>) => (r.kind === 'contact' ? r.ball.exitVelocity / MPH : 0);

describe('swing evaluation', () => {
  it('perfect timing + sweet-spot aim produces a barrel home run', () => {
    const r = swing(fastball(90), { kind: 'power' });
    expect(r.kind).toBe('contact');
    if (r.kind !== 'contact') return;
    expect(r.timing).toBe('perfect');
    expect(r.ball.isBarrel).toBe(true);
    expect(r.ball.outcome).toBe('homeRun');
  });

  it('power swings hit harder than contact swings', () => {
    const plan = fastball(90);
    expect(ev(swing(plan, { kind: 'power' }))).toBeGreaterThan(ev(swing(plan, { kind: 'contact' })) + 8);
  });

  it('exit velocities stay within realistic bounds (contact ≈ 90–97, power ≈ 104–112 mph)', () => {
    const plan = fastball(92);
    const c = ev(swing(plan, { kind: 'contact' }));
    const p = ev(swing(plan, { kind: 'power' }));
    expect(c).toBeGreaterThan(88);
    expect(c).toBeLessThan(98);
    expect(p).toBeGreaterThan(103);
    expect(p).toBeLessThan(113);
  });

  it('whiffs when the timing error exceeds the foul window', () => {
    const plan = fastball(90);
    const prof = SWING_PROFILES.contact;
    const r = swing(plan, { dtMs: prof.foulMs + 5 });
    expect(r.kind).toBe('whiff');
    if (r.kind === 'whiff') expect(r.missedBy).toBe('timing');
  });

  it('whiffs when the ball is outside the PCI', () => {
    const r = swing(fastball(90), { nx: 0.9, ny: 0.6 });
    expect(r.kind).toBe('whiff');
    if (r.kind === 'whiff') expect(r.missedBy).toBe('location');
  });

  it('early swings pull the ball (RHB → left field), late swings go the other way; mirrored for LHB', () => {
    const plan = fastball(90);
    const spray = (dtMs: number, batter: 'R' | 'L') => {
      const r = swing(plan, { dtMs, batter });
      return r.kind === 'contact' ? r.ball.sprayAngleDeg : NaN;
    };
    expect(spray(-40, 'R')).toBeLessThan(-15);
    expect(spray(40, 'R')).toBeGreaterThan(15);
    expect(spray(-40, 'L')).toBeGreaterThan(15);
    expect(spray(40, 'L')).toBeLessThan(-15);
  });

  it('ball above the PCI centre → higher launch angle; below → grounder', () => {
    const plan = fastball(90);
    const la = (ny: number) => {
      const r = swing(plan, { ny });
      return r.kind === 'contact' ? r.ball.launchAngleDeg : NaN;
    };
    expect(la(0.8)).toBeGreaterThan(45);
    expect(la(-0.5)).toBeLessThan(-10);
    expect(la(0.27)).toBeGreaterThan(20);
    expect(la(0.27)).toBeLessThan(34);
  });

  it('timing errors reduce exit velocity smoothly', () => {
    const plan = fastball(90);
    const e0 = ev(swing(plan, { dtMs: 0 }));
    const e1 = ev(swing(plan, { dtMs: 25 }));
    const e2 = ev(swing(plan, { dtMs: 55 }));
    expect(e0).toBeGreaterThan(e1);
    expect(e1).toBeGreaterThan(e2);
  });

  it('is deterministic for the same seed', () => {
    const plan = fastball(91);
    const a = swing(plan, { dtMs: 8 }, STADIUMS.final, 42);
    const b = swing(plan, { dtMs: 8 }, STADIUMS.final, 42);
    expect(a).toEqual(b);
  });

  it('labels timing windows', () => {
    const p = SWING_PROFILES.contact;
    expect(timingLabel(0, p)).toBe('perfect');
    expect(timingLabel(-p.goodMs + 1, p)).toBe('good');
    expect(timingLabel(-p.goodMs - 5, p)).toBe('early');
    expect(timingLabel(p.goodMs + 5, p)).toBe('late');
  });

  it('follows the Statcast barrel definition', () => {
    expect(isBarrel(98, 28)).toBe(true);
    expect(isBarrel(98, 20)).toBe(false);
    expect(isBarrel(105, 20)).toBe(true);
    expect(isBarrel(97, 28)).toBe(false);
    expect(classifyQuality(85, -5)).toBe('topped');
    expect(classifyQuality(85, 60)).toBe('under');
  });
});
