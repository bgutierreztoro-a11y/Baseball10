import { describe, expect, it } from 'vitest';
import { CONTACT_PLANE_Z, MPH, STRIKE_ZONE } from '../../src/config/constants';
import { PITCH_TYPES } from '../../src/config/pitches';
import type { PitchTypeId } from '../../src/contracts';
import { isInZone, pitchPosition, pitchVelocity, planPitch, plateSpeed, timeAtZ } from '../../src/sim/pitch';

describe('pitch model (constant acceleration)', () => {
  const types = Object.keys(PITCH_TYPES) as PitchTypeId[];

  it.each(types)('%s reaches its target exactly at flightTime', (type) => {
    const plan = planPitch({ type, hand: 'R', speedMph: 88, target: { x: 0.1, y: 0.7 }, airDensity: 1.2 });
    const p = pitchPosition(plan, plan.flightTime);
    expect(p.x).toBeCloseTo(0.1, 6);
    expect(p.y).toBeCloseTo(0.7, 6);
    expect(p.z).toBeCloseTo(CONTACT_PLANE_Z, 6);
    expect(timeAtZ(plan, CONTACT_PLANE_Z)).toBeCloseTo(plan.flightTime, 6);
  });

  it('release speed matches the requested speed within 4%', () => {
    for (const mph of [70, 85, 95, 102]) {
      const plan = planPitch({ type: 'FF', hand: 'R', speedMph: mph, target: { x: 0, y: 0.8 }, airDensity: 1.2 });
      const v = pitchVelocity(plan, 0);
      expect(Math.hypot(v.x, v.y, v.z) / MPH).toBeGreaterThan(mph * 0.96);
      expect(Math.hypot(v.x, v.y, v.z) / MPH).toBeLessThan(mph * 1.04);
    }
  });

  it('has realistic flight times (90 mph ≈ 0.42–0.46 s) and loses speed to drag', () => {
    const plan = planPitch({ type: 'FF', hand: 'R', speedMph: 90, target: { x: 0, y: 0.8 }, airDensity: 1.2 });
    expect(plan.flightTime).toBeGreaterThan(0.4);
    expect(plan.flightTime).toBeLessThan(0.47);
    expect(plateSpeed(plan)).toBeLessThan(90 * MPH);
    expect(plateSpeed(plan)).toBeGreaterThan(80 * MPH);
  });

  it('breaks to the glove side for a RHP slider and mirrors for a LHP', () => {
    const r = planPitch({ type: 'SL', hand: 'R', speedMph: 85, target: { x: 0, y: 0.8 }, airDensity: 1.2 });
    const l = planPitch({ type: 'SL', hand: 'L', speedMph: 85, target: { x: 0, y: 0.8 }, airDensity: 1.2 });
    // RHP arm side is the 3B side (+X), so the glove side is −X.
    expect(r.a.x).toBeLessThan(0);
    expect(l.a.x).toBeCloseTo(-r.a.x, 6);
  });

  it('curveball drops more than a four-seamer', () => {
    const ff = planPitch({ type: 'FF', hand: 'R', speedMph: 85, target: { x: 0, y: 0.8 }, airDensity: 1.2 });
    const cu = planPitch({ type: 'CU', hand: 'R', speedMph: 85, target: { x: 0, y: 0.8 }, airDensity: 1.2 });
    expect(cu.a.y).toBeLessThan(ff.a.y);
  });

  it('classifies the strike zone with the ball radius on the edges', () => {
    expect(isInZone(0, STRIKE_ZONE.centerY)).toBe(true);
    expect(isInZone(STRIKE_ZONE.halfWidth - 0.001, STRIKE_ZONE.centerY)).toBe(true);
    expect(isInZone(STRIKE_ZONE.halfWidth + 0.01, STRIKE_ZONE.centerY)).toBe(false);
    expect(isInZone(0, STRIKE_ZONE.bottom - 0.2)).toBe(false);
    expect(isInZone(0, STRIKE_ZONE.top + 0.2)).toBe(false);
  });
});
