import type { GoalDef, LimitDef, PitchTypeId, StadiumId, StageDef, StarCondition } from '../contracts';
import { Rng } from '../core/rng';
import { STADIUMS } from './stadiums';

/**
 * Desafío diario: one stage per calendar day, the same for everyone (seeded
 * by the date, like a daily puzzle), so scores can be compared and shared.
 * The best score of the day is kept; Fichas are paid the first time it is
 * completed each day, plus a streak bonus.
 */
export const DAILY_PITCHERS = ['brisa', 'mago', 'condor', 'ciclon'] as const;

/** FNV-1a hash of the day key → seed. */
export function daySeed(day: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

interface Twist {
  goal: GoalDef;
  limit: LimitDef;
  stars: [StarCondition, StarCondition];
  name: { es: string; en: string };
}

/** Number of the challenge since launch (shown in the share text). */
export function dailyNumber(day: string): number {
  const t = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  return Math.max(1, Math.round((t - Date.UTC(2026, 10, 1)) / 86_400_000) + 1);
}

export function dailyStage(day: string): StageDef {
  const rng = new Rng(daySeed(day));
  const stadium = rng.pick(Object.keys(STADIUMS) as StadiumId[]);
  const pitcher = rng.pick(DAILY_PITCHERS);
  const twists: Twist[] = [
    {
      goal: { type: 'homeRuns', n: 4 + Math.floor(rng.next() * 3) },
      limit: { type: 'outs', n: 10 },
      stars: [{ type: 'outsLeft', n: 3 }, { type: 'longestHR', ft: 430 }],
      name: { es: 'Lluvia de jonrones', en: 'Home-run shower' },
    },
    {
      goal: { type: 'homeRuns', n: 3 + Math.floor(rng.next() * 3) },
      limit: { type: 'time', seconds: 60 },
      stars: [{ type: 'timeLeft', seconds: 10 }, { type: 'barrels', n: 3 }],
      name: { es: 'Contrarreloj', en: 'Beat the clock' },
    },
    {
      goal: { type: 'distance', ft: 420 + 10 * Math.floor(rng.next() * 4) },
      limit: { type: 'outs', n: 8 },
      stars: [{ type: 'maxEV', mph: 108 }, { type: 'noWhiffs' }],
      name: { es: 'El batazo del día', en: 'Blast of the day' },
    },
    {
      goal: { type: 'streak', n: 3 },
      limit: { type: 'outs', n: 12 },
      stars: [{ type: 'homeRuns', n: 5 }, { type: 'outsLeft', n: 4 }],
      name: { es: 'Racha caliente', en: 'Hot streak' },
    },
  ];
  const tw = rng.pick(twists);
  const arsenals: (PitchTypeId[] | undefined)[] = [undefined, ['FF', 'CH'], ['FF', 'SL', 'CU'], ['SI', 'FC', 'ST']];
  return {
    id: `daily-${day}`,
    chapter: 0,
    index: 0,
    name: tw.name,
    stadium,
    pitcher,
    goal: tw.goal,
    limit: tw.limit,
    stars: tw.stars,
    arsenal: rng.pick(arsenals),
    tip: { es: 'Mismo desafío para todos hoy. Cuenta tu mejor puntuación del día.', en: 'Same challenge for everyone today. Your best score of the day counts.' },
  };
}

/** Score of one attempt: home runs, distance and barrels (completing it doubles it). */
export function dailyScore(s: { homeRuns: number; longestHRft: number; barrels: number; success: boolean; stars: number }): number {
  const raw = s.homeRuns * 100 + Math.round(s.longestHRft) + s.barrels * 15;
  return Math.round(raw * (s.success ? 1 + 0.25 * s.stars : 1));
}
