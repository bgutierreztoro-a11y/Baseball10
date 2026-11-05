import type { LocalizedText } from '../contracts';

/**
 * Soft currency: "Fichas" (docs/07-plan-maestro.md §6). Earned only by
 * playing (and doubled by an optional rewarded ad), spent only on cosmetic
 * creator parts, traits and extra player slots. Fichas are never sold for
 * money and never buy ratings, so nobody can pay to hit farther.
 */
export const COIN = {
  /** Gift for new players: enough for a first funny part. */
  starting: 300,
  dailyBonus: 50,
  homeRun: 5,
  hit: 2,
  barrel: 1,
  newStar: 25,
  firstClear: 40,
  derbyHomeRun: 4,
  gameWin: 120,
  gamePlayed: 40,
  run: 8,
  extraBase: 10,
  walkOff: 50,
  dailyDone: 100,
  /** Extra per day of daily-challenge streak (capped at 7 days). */
  dailyStreak: 20,
  /** Cap per match before the ad doubler, so grinding practice is not the way. */
  practiceCap: 30,
} as const;

export interface CoinLine {
  label: LocalizedText;
  amount: number;
}

export interface CoinInput {
  mode: 'campaign' | 'practice' | 'derby' | 'game' | 'daily';
  homeRuns: number;
  hits: number;
  barrels: number;
  newStars?: number;
  firstClear?: boolean;
  game?: { won: boolean; runs: number; extraBases: number; walkOff: boolean };
  daily?: { completed: boolean; streak: number };
}

const L = (es: string, en: string): LocalizedText => ({ es, en });

/** Itemised Fichas for one finished match (pure; shown on the results screen). */
export function matchCoins(i: CoinInput): CoinLine[] {
  const lines: CoinLine[] = [];
  const add = (label: LocalizedText, amount: number): void => {
    if (amount > 0) lines.push({ label, amount: Math.round(amount) });
  };
  if (i.mode === 'derby') add(L('Jonrones del derby', 'Derby home runs'), i.homeRuns * COIN.derbyHomeRun);
  else add(L('Jonrones', 'Home runs'), i.homeRuns * COIN.homeRun);
  add(L('Hits', 'Hits'), (i.hits - i.homeRuns) * COIN.hit);
  add(L('Barrels', 'Barrels'), i.barrels * COIN.barrel);
  if (i.newStars) add(L('Estrellas nuevas', 'New stars'), i.newStars * COIN.newStar);
  if (i.firstClear) add(L('Primera vez superada', 'First clear'), COIN.firstClear);
  if (i.game) {
    add(i.game.won ? L('Victoria', 'Win') : L('Partido jugado', 'Game played'), i.game.won ? COIN.gameWin : COIN.gamePlayed);
    add(L('Carreras anotadas', 'Runs scored'), i.game.runs * COIN.run);
    add(L('Bases extra corriendo', 'Extra bases on the run'), i.game.extraBases * COIN.extraBase);
    if (i.game.walkOff) add(L('¡Walk-off!', 'Walk-off!'), COIN.walkOff);
  }
  if (i.daily?.completed) {
    add(L('Desafío diario', 'Daily challenge'), COIN.dailyDone);
    add(L('Racha diaria', 'Daily streak'), Math.min(7, i.daily.streak) * COIN.dailyStreak);
  }
  if (i.mode === 'practice') {
    const total = lines.reduce((s, l) => s + l.amount, 0);
    if (total > COIN.practiceCap) return [{ label: L('Práctica', 'Practice'), amount: COIN.practiceCap }];
  }
  return lines;
}

export function totalCoins(lines: readonly CoinLine[]): number {
  return lines.reduce((s, l) => s + l.amount, 0);
}

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Whole days between two day keys (b − a). */
export function daysBetween(a: string, b: string): number {
  const pa = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const pb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((pb - pa) / 86_400_000);
}
