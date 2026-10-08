import type { PitchPlan, StadiumDef } from '../../src/contracts';
import { STADIUMS } from '../../src/config/stadiums';
import { Rng } from '../../src/core/rng';
import { evaluateSwing, HOME_RUN_UNDERCUT, SWING_PROFILES, type SwingInput } from '../../src/sim/contact';
import { planPitch } from '../../src/sim/pitch';
import type { SwingKind } from '../../src/contracts';

export const metro: StadiumDef = STADIUMS.metro;

export function fastball(speedMph = 90, x = 0, y = 0.78, hand: 'R' | 'L' = 'R'): PitchPlan {
  return planPitch({ type: 'FF', hand, speedMph, target: { x, y }, airDensity: 1.2 });
}

/** A swing with a given timing error (ms) and PCI offset in normalized units. */
export function swingAt(
  plan: PitchPlan,
  opts: { kind?: SwingKind; dtMs?: number; nx?: number; ny?: number; batter?: 'R' | 'L' } = {},
): SwingInput {
  const kind = opts.kind ?? 'contact';
  const p = SWING_PROFILES[kind];
  const ny = opts.ny ?? HOME_RUN_UNDERCUT;
  return {
    kind,
    contactTime: plan.flightTime + (opts.dtMs ?? 0) / 1000,
    // ball = aim + n·half-size  →  aim = ball − n·half-size
    aim: { x: plan.plateCross.x - (opts.nx ?? 0) * p.pciHalfWidth, y: plan.plateCross.y - ny * p.pciHalfHeight },
    batter: opts.batter ?? 'R',
  };
}

export function swing(plan: PitchPlan, opts: Parameters<typeof swingAt>[1] = {}, stadium: StadiumDef = metro, seed = 7) {
  return evaluateSwing(plan, swingAt(plan, opts), { stadium, targets: [], rng: new Rng(seed) });
}
