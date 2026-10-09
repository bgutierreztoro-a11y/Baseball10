import { describe, expect, it } from 'vitest';
import { BATS, MAX_STARS, STAGES } from '../../src/config/campaign';
import { FT, MPH } from '../../src/config/constants';
import { PITCHERS, PITCH_TYPES } from '../../src/config/pitches';
import { STADIUMS } from '../../src/config/stadiums';
import type { StageDef } from '../../src/contracts';
import { SWING_PROFILES } from '../../src/sim/contact';
import { projectedCarry } from '../../src/sim/flight';
import { planPitch, plateSpeed } from '../../src/sim/pitch';

/** Best possible exit velocity (perfect power swing) against the stage's hardest pitch. */
function maxEV(stage: StageDef): number {
  const pitcher = PITCHERS[stage.pitcher]!;
  const entries = pitcher.arsenal.filter((e) => !stage.arsenal || stage.arsenal.includes(e.type));
  let best = 0;
  for (const e of entries) {
    const mph = PITCH_TYPES[e.type].speedMph[1] + (e.speedOffset ?? 0) + (stage.speedOffsetMph ?? 0);
    const plan = planPitch({ type: e.type, hand: pitcher.hand, speedMph: mph, target: { x: 0, y: 0.8 }, airDensity: 1.2 });
    best = Math.max(best, 0.2 * plateSpeed(plan) + 1.2 * SWING_PROFILES.power.batSpeed);
  }
  return best;
}

function maxCarryFt(stage: StageDef): number {
  const ev = maxEV(stage);
  let best = 0;
  for (const la of [26, 28, 30, 32]) {
    const d = projectedCarry({ position: { x: 0, y: 0.8, z: 0.43 }, exitVelocity: ev, launchAngleDeg: la, sprayAngleDeg: 0, spinRpm: 500 + 50 * la, sideSpin: 0 }, STADIUMS[stage.stadium].airDensity);
    best = Math.max(best, d.distance / FT);
  }
  return best;
}

describe('campaign content integrity', () => {
  it('has 25 stages, unique ids, 5 per chapter and one boss per chapter', () => {
    expect(STAGES).toHaveLength(25);
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(25);
    for (let c = 1; c <= 5; c++) {
      const ch = STAGES.filter((s) => s.chapter === c);
      expect(ch).toHaveLength(5);
      expect(ch.filter((s) => s.boss)).toHaveLength(1);
    }
    expect(MAX_STARS).toBe(75);
  });

  it('references existing stadiums, pitchers and pitch types', () => {
    for (const s of STAGES) {
      expect(STADIUMS[s.stadium]).toBeDefined();
      const p = PITCHERS[s.pitcher];
      expect(p).toBeDefined();
      for (const t of s.arsenal ?? []) {
        expect(p!.arsenal.some((e) => e.type === t)).toBe(true);
      }
    }
  });


  it('bats unlock progressively up to the full star count', () => {
    const req = BATS.map((b) => b.starsRequired);
    expect(req[0]).toBe(0);
    expect([...req].sort((a, b) => a - b)).toEqual(req);
    expect(Math.max(...req)).toBeLessThanOrEqual(MAX_STARS);
  });
});

describe('campaign balance: every goal and star is physically achievable', () => {
  it.each(STAGES.map((s) => [s.id, s] as const))('%s', (_id, stage) => {
    const evMph = maxEV(stage) / MPH;
    const carry = maxCarryFt(stage);
    const minFence = Math.min(...STADIUMS[stage.stadium].fence.distancesFt);
    // A perfect power swing must at least clear the shortest fence comfortably.
    expect(carry).toBeGreaterThan(minFence + 25);
    if (stage.goal.type === 'distance') expect(carry).toBeGreaterThan(stage.goal.ft + 10);
    for (const c of stage.stars) {
      if (c.type === 'longestHR') expect(carry).toBeGreaterThan(c.ft + 5);
      if (c.type === 'maxEV') expect(evMph).toBeGreaterThan(c.mph + 0.5);
    }
  });

});
