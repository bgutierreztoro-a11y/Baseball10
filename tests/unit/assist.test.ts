import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { AIM_ASSIST, assistAim, LANDING_HINT, landingHint } from '../../src/sim/assist';
import { evaluateSwing, SWING_PROFILES } from '../../src/sim/contact';
import { fastball, metro, swingAt } from './helpers';

describe('landing hint', () => {
  it('always contains the true crossing but is not centred on it', () => {
    const rng = new Rng(11);
    let exact = 0;
    for (let i = 0; i < 2000; i++) {
      const cross = { x: rng.range(-0.3, 0.3), y: rng.range(0.4, 1.2) };
      const h = landingHint(cross, rng);
      const off = Math.hypot(h.x - cross.x, h.y - cross.y);
      expect(off).toBeLessThanOrEqual(h.radius * LANDING_HINT.maxOffset + 1e-9);
      if (off < 0.01) exact++;
    }
    expect(exact / 2000).toBeLessThan(0.05);
  });
});

describe('aim magnetism', () => {
  const plan = fastball(92);
  const ctx = () => ({ stadium: metro, targets: [], rng: new Rng(3) });

  it('rescues a swing that just misses the PCI edge', () => {
    const sw = swingAt(plan, { nx: 1.3, ny: 0.15 });
    expect(evaluateSwing(plan, sw, ctx()).kind).toBe('whiff');
    const assisted = { ...sw, aim: assistAim(sw.aim, plan.plateCross, sw.kind) };
    expect(evaluateSwing(plan, assisted, ctx()).kind).toBe('contact');
  });

  it('leaves clear misses alone', () => {
    const sw = swingAt(plan, { nx: AIM_ASSIST.reach + 0.3 });
    expect(assistAim(sw.aim, plan.plateCross, sw.kind)).toEqual(sw.aim);
  });

  it('only nudges good aims, never snapping to the ball', () => {
    const p = SWING_PROFILES.contact;
    const sw = swingAt(plan, { nx: 0.5, ny: 0.15 });
    const a = assistAim(sw.aim, plan.plateCross, 'contact');
    const before = Math.abs(plan.plateCross.x - sw.aim.x) / p.pciHalfWidth;
    const after = Math.abs(plan.plateCross.x - a.x) / p.pciHalfWidth;
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(before * 0.75);
  });
});
