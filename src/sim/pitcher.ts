import type { Hand, PitchTypeId, PitcherDef } from '../contracts';
import { BALL, STRIKE_ZONE } from '../config/constants';
import { PITCH_TYPES } from '../config/pitches';
import type { Rng } from '../core/rng';
import type { PitchRequest } from './pitch';

/**
 * Pitch selection ("pitcher AI"): what to throw, how hard and where.
 * Deterministic for a given RNG seed. Command error is gaussian; pitchers
 * with better command paint the edges more often.
 */
export interface PitchSelectorConfig {
  pitcher: PitcherDef;
  hand?: Hand;
  arsenal?: readonly PitchTypeId[];
  speedOffsetMph?: number;
  zoneRate?: number;
  /** Practice-only overrides. */
  location?: 'middle' | 'zone' | 'any';
  speedScale?: number;
  airDensity: number;
}

/** Vertical tendency per pitch (m): fastballs live up, breaking balls down. */
const VERTICAL_BIAS: Record<PitchTypeId, number> = {
  FF: 0.1,
  SI: -0.06,
  FC: 0.02,
  SL: -0.08,
  ST: -0.04,
  CU: -0.12,
  CH: -0.1,
  FS: -0.14,
};

export function choosePitch(rng: Rng, cfg: PitchSelectorConfig, previous?: PitchTypeId): PitchRequest {
  const hand = cfg.hand ?? cfg.pitcher.hand;
  const allowed = cfg.pitcher.arsenal.filter((e) => !cfg.arsenal || cfg.arsenal.includes(e.type));
  const pool = allowed.length > 0 ? allowed : cfg.arsenal ? cfg.arsenal.map((type) => ({ type, weight: 1, speedOffset: cfg.pitcher.arsenal[0]?.speedOffset ?? 0 })) : cfg.pitcher.arsenal;

  // Light sequencing: avoid throwing the same off-speed pitch three times in a row.
  const entry = rng.weighted(pool, (e) => (e.type === previous && e.type !== 'FF' ? e.weight * 0.5 : e.weight));
  const def = PITCH_TYPES[entry.type];

  const base = rng.range(def.speedMph[0], def.speedMph[1]);
  const speedMph = Math.max(45, (base + (entry.speedOffset ?? 0) + (cfg.speedOffsetMph ?? 0)) * (cfg.speedScale ?? 1));

  const target = chooseLocation(rng, cfg, entry.type);
  return { type: entry.type, hand, speedMph, target, airDensity: cfg.airDensity };
}

function chooseLocation(rng: Rng, cfg: PitchSelectorConfig, type: PitchTypeId): { x: number; y: number } {
  const z = STRIKE_ZONE;
  const cy = z.centerY;
  const hw = z.halfWidth - BALL.radius;
  const hh = (z.top - z.bottom) / 2;
  const command = cfg.pitcher.command;
  const sigma = (1 - command) * 0.11 + 0.015;

  if (cfg.location === 'middle') {
    return { x: rng.gaussian() * 0.04, y: cy + rng.gaussian() * 0.04 };
  }

  const zoneRate = cfg.location === 'zone' ? 1 : (cfg.zoneRate ?? cfg.pitcher.zoneRate);
  const inZone = rng.next() < zoneRate;
  let x: number;
  let y: number;
  if (inZone) {
    // Better command → intended spots closer to the edges.
    const edge = 0.35 + command * 0.45;
    x = (rng.next() * 2 - 1) * hw * edge;
    y = cy + VERTICAL_BIAS[type] + (rng.next() * 2 - 1) * hh * edge * 0.8;
    x += rng.gaussian() * sigma;
    y += rng.gaussian() * sigma;
    // Keep "in-zone" intentions honest after command error.
    x = Math.max(-hw, Math.min(hw, x));
    y = Math.max(z.bottom + 0.02, Math.min(z.top - 0.02, y));
  } else {
    const chaseLow = PITCH_TYPES[type].chaseLow;
    const r = rng.next();
    if (r < chaseLow) {
      x = (rng.next() * 2 - 1) * hw;
      y = z.bottom - rng.range(0.08, 0.28);
    } else if (r < chaseLow + (1 - chaseLow) * 0.7) {
      x = (rng.next() < 0.5 ? -1 : 1) * (z.halfWidth + rng.range(0.06, 0.22));
      y = cy + (rng.next() * 2 - 1) * hh;
    } else {
      x = (rng.next() * 2 - 1) * hw;
      y = z.top + rng.range(0.08, 0.22);
    }
    x += rng.gaussian() * sigma * 0.5;
    y += rng.gaussian() * sigma * 0.5;
  }
  return { x, y: Math.max(0.15, Math.min(1.6, y)) };
}
