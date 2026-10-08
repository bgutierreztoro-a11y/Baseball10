import { describe, expect, it } from 'vitest';
import { FT, MPH } from '../../src/config/constants';
import { STADIUMS } from '../../src/config/stadiums';
import { liftCoefficient, projectedCarry, simulateFlight, targetsHit, type LaunchParams } from '../../src/sim/flight';

const launch = (evMph: number, la: number, spray = 0): LaunchParams => ({
  position: { x: 0, y: 0.9, z: 0.43 },
  exitVelocity: evMph * MPH,
  launchAngleDeg: la,
  sprayAngleDeg: spray,
  spinRpm: la >= 0 ? 500 + 50 * la : -800,
  sideSpin: spray / 45,
});

const carryFt = (ev: number, la: number, rho = 1.2) => projectedCarry(launch(ev, la), rho).distance / FT;

describe('batted-ball aerodynamics (calibrated to Statcast ranges)', () => {
  it('100 mph at 28° carries ~390–420 ft at sea level', () => {
    const d = carryFt(100, 28);
    expect(d).toBeGreaterThan(390);
    expect(d).toBeLessThan(420);
  });

  it('110 mph at 30° carries ~440–470 ft', () => {
    const d = carryFt(110, 30);
    expect(d).toBeGreaterThan(440);
    expect(d).toBeLessThan(470);
  });

  it('distance increases with exit velocity', () => {
    let last = 0;
    for (const ev of [80, 90, 100, 110]) {
      const d = carryFt(ev, 27);
      expect(d).toBeGreaterThan(last);
      last = d;
    }
  });

  it('thin air (altitude) adds 5–12% carry', () => {
    const sea = carryFt(104, 28, 1.2);
    const high = carryFt(104, 28, 0.98);
    expect(high / sea).toBeGreaterThan(1.05);
    expect(high / sea).toBeLessThan(1.12);
  });

  it('optimal launch angle for distance is between 25° and 36°', () => {
    const angles = [15, 20, 25, 30, 35, 40, 45];
    const best = angles.reduce((b, a) => (carryFt(103, a) > carryFt(103, b) ? a : b));
    expect(best).toBeGreaterThanOrEqual(25);
    expect(best).toBeLessThanOrEqual(36);
  });

  it('lift coefficient grows with spin factor and is capped', () => {
    expect(liftCoefficient(0.05)).toBeLessThan(liftCoefficient(0.2));
    expect(liftCoefficient(5)).toBeLessThanOrEqual(0.42);
  });
});

describe('ballpark interaction', () => {
  const metro = STADIUMS.metro;

  it('a deep fly to center clears a 400 ft fence', () => {
    const r = simulateFlight(launch(108, 29), metro);
    expect(r.outcome).toBe('homeRun');
    expect(r.fenceIndex).toBeGreaterThan(0);
    expect(r.projectedDistance / FT).toBeGreaterThan(400);
  });

  it('a short fly stays in the park', () => {
    const r = simulateFlight(launch(85, 30), metro);
    expect(r.outcome).toBe('inPlay');
    expect(r.distance / FT).toBeLessThan(400);
  });

  it('a liner that reaches the wall below its height bounces back', () => {
    const r = simulateFlight(launch(108, 13), metro);
    expect(r.hitWall).toBe(true);
    expect(r.outcome).toBe('inPlay');
  });

  it("El Muro (34 ft) in Malecón stops line drives that would be gone elsewhere", () => {
    const pull = launch(100, 17, -40);
    expect(simulateFlight(pull, STADIUMS.solar).outcome).toBe('homeRun');
    const malecon = simulateFlight(pull, STADIUMS.malecon);
    expect(malecon.outcome).not.toBe('homeRun');
  });

  it('balls outside the foul lines are fouls', () => {
    expect(simulateFlight(launch(95, 25, -60), metro).outcome).toBe('foul');
    expect(simulateFlight(launch(95, 25, 60), metro).outcome).toBe('foul');
  });

  it('detects targets along the trajectory', () => {
    const r = simulateFlight(launch(95, 25, 0), metro);
    const landing = r.landing;
    const hits = targetsHit(r.trajectory, [
      { position: { x: landing.x, y: 0, z: landing.z }, radius: 3, kind: 'ring' },
      { position: { x: 60, y: 0, z: 60 }, radius: 3, kind: 'ring' },
    ], r.firstBounceIndex);
    expect(hits).toEqual([0]);
  });

  it('trajectory samples are time-ordered and start at contact', () => {
    const r = simulateFlight(launch(100, 25), metro);
    expect(r.trajectory[0]!.t).toBe(0);
    for (let i = 1; i < r.trajectory.length; i++) {
      expect(r.trajectory[i]!.t).toBeGreaterThanOrEqual(r.trajectory[i - 1]!.t);
    }
  });
});
