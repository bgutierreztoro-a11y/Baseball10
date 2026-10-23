import { describe, expect, it } from 'vitest';
import { characterById } from '../../src/config/characters';
import { EXTRA_STADIUMS, STADIUMS, STADIUM_ORDER } from '../../src/config/stadiums';
import { Rng } from '../../src/core/rng';
import { evaluateSwing, forcedHomeRun } from '../../src/sim/contact';
import { sprayOf, standHeight } from '../../src/sim/field';
import { DERBY_RULES, Session } from '../../src/sim/session';
import { THIEF_REACH, robHomeRun } from '../../src/sim/thief';
import { fastball, swingAt } from './helpers';

const southampton = STADIUMS.southampton;
const plan = fastball(92);

/** A guaranteed home run in Southampton off a contact swing. */
function homeRun(seed: number) {
  const ctx = { stadium: southampton, targets: [], rng: new Rng(seed) };
  const base = evaluateSwing(plan, { ...swingAt(plan, { kind: 'power' }), mods: characterById('chamo').mods }, ctx);
  const r = forcedHomeRun(base, plan, ctx);
  if (r.kind !== 'contact') throw new Error('expected contact');
  return r.ball;
}

describe('Southampton and Chamo’s nerf', () => {
  it('is a rainy park of terraced houses outside the campaign, home of Chamo’s nerf', () => {
    expect(southampton.features).toMatchObject({ southampton: true, rain: true });
    expect(EXTRA_STADIUMS).toContain('southampton');
    expect(STADIUM_ORDER).not.toContain('southampton');
    const chamo = characterById('chamo');
    expect(chamo.homeRunThief).toEqual({ stadium: 'southampton' });
    expect(chamo.trait).toBeTruthy();
  });

  it('the mandem turns a home run into an out that ends in his hands beyond the wall', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const ball = homeRun(seed);
      expect(ball.outcome).toBe('homeRun');
      const robbed = robHomeRun(ball, southampton)!;
      expect(robbed).not.toBeNull();
      const b = robbed.ball;
      expect(b.outcome).toBe('out');
      expect(b.fenceIndex).toBe(-1);
      expect(robbed.catchIndex).toBeGreaterThanOrEqual(ball.fenceIndex);
      expect(b.trajectory.length).toBe(robbed.catchIndex + 1);
      const last = b.trajectory[b.trajectory.length - 1]!;
      expect(b.hangTime).toBeCloseTo(last.t);
      // He stands on the hill behind the wall, within reach of the ball.
      const ground = standHeight(southampton, sprayOf(last.x, last.z), Math.hypot(last.x, last.z));
      expect(robbed.feet.y).toBeCloseTo(ground);
      expect(last.y - ground).toBeLessThanOrEqual(THIEF_REACH + 1e-9);
      expect(last.y).toBeGreaterThanOrEqual(ground - 0.5);
    }
  });

  it('only home runs can be stolen', () => {
    const ball = homeRun(3);
    expect(robHomeRun({ ...ball, outcome: 'hit' }, southampton)).toBeNull();
    expect(robHomeRun({ ...ball, fenceIndex: -1 }, southampton)).toBeNull();
  });
});

describe('La maldición de Bubenik (Arturek)', () => {
  it('Vikokotor, short and chubby, pitches in MŠK Žilina colours under the club crest', () => {
    const a = characterById('arturek');
    expect(a.firecracker).toEqual({ chance: 0.2, explodeChance: 0.5 });
    expect(a.pitcherName).toBe('Vikokotor');
    expect(a.pitcherBadge).toBe('zilina');
    expect(a.pitcherKit!.scale).toBeLessThan(1);
    expect(a.pitcherKit!.belly).toBe(1);
    expect(a.trait!.name.es).toBe('La maldición de Bubenik');
  });

  it('a firecracker that does not explode is always a home run, even in the deepest parks', () => {
    for (const id of ['southampton', 'final', 'metro'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const ctx = { stadium: STADIUMS[id], targets: [], rng: new Rng(seed) };
        const base = evaluateSwing(plan, { ...swingAt(plan, { kind: 'contact', nx: 0.4 }), mods: characterById('arturek').mods }, ctx);
        const r = forcedHomeRun(base, plan, ctx);
        expect(r.kind === 'contact' && r.ball.outcome).toBe('homeRun');
      }
    }
  });

  it('an explosion forfeits the match whatever the score', () => {
    const s = new Session(DERBY_RULES);
    s.record({ kind: 'contact', ball: homeRun(2) });
    expect(s.homeRuns).toBe(1);
    expect(s.forfeit()).toEqual([{ type: 'finished', success: false }]);
    expect(s.finished && s.forfeited && !s.success).toBe(true);
    // Finishing afterwards changes nothing.
    expect(s.finish()).toEqual([]);
    expect(s.success).toBe(false);
  });
});
