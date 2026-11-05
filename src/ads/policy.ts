/**
 * When the game may ask for an ad (docs/adr/ADR-009-anuncios.md). Pure: the
 * clock is injected so the rules are unit-tested.
 *
 * Player-first rules, stricter than the platforms' own minimums:
 *  - Rewarded ads are always opt-in, always say what you get, and are capped
 *    (one continue per match, one doubler per results screen, 20 per day).
 *  - Interstitials only at a natural break *between* matches (never during
 *    an at-bat, never on a menu/navigation button), never in a player's
 *    first two matches of a session, at least 3 minutes apart (counting any
 *    ad, rewarded included), and never for supporters (adsRemoved).
 */
export type RewardPlacement = 'doubleCoins' | 'continue' | 'dailyChest';
export type BreakPlacement = 'betweenMatches';

export const POLICY = {
  /** Seconds between any two ads. */
  gapS: 180,
  /** Matches finished this session before the first interstitial may show. */
  graceMatches: 2,
  /** Seconds after boot before any interstitial. */
  bootGraceS: 90,
  rewardedPerDay: 20,
} as const;

export interface PolicyState {
  bootAt: number;
  lastAdAt: number;
  matchesFinished: number;
  rewardedToday: number;
  day: string;
  /** Placements already used in the current match / results screen. */
  usedThisMatch: Set<RewardPlacement>;
}

export class AdPolicy {
  private readonly s: PolicyState;

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly today: () => string = () => {
      const d = new Date();
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    },
  ) {
    this.s = { bootAt: now(), lastAdAt: -Infinity, matchesFinished: 0, rewardedToday: 0, day: today(), usedThisMatch: new Set() };
  }

  private rollDay(): void {
    const d = this.today();
    if (d !== this.s.day) {
      this.s.day = d;
      this.s.rewardedToday = 0;
    }
  }

  /** A new match starts: per-match rewarded placements are available again. */
  matchStarted(): void {
    this.s.usedThisMatch.clear();
  }

  matchFinished(): void {
    this.s.matchesFinished++;
  }

  canOfferReward(p: RewardPlacement): boolean {
    this.rollDay();
    if (this.s.rewardedToday >= POLICY.rewardedPerDay) return false;
    if (p !== 'dailyChest' && this.s.usedThisMatch.has(p)) return false;
    return true;
  }

  rewardShown(p: RewardPlacement): void {
    this.rollDay();
    this.s.rewardedToday++;
    this.s.usedThisMatch.add(p);
    this.s.lastAdAt = this.now();
  }

  canBreak(_p: BreakPlacement, adsRemoved: boolean): boolean {
    if (adsRemoved) return false;
    if (this.s.matchesFinished < POLICY.graceMatches) return false;
    const t = this.now();
    if (t - this.s.bootAt < POLICY.bootGraceS * 1000) return false;
    return t - this.s.lastAdAt >= POLICY.gapS * 1000;
  }

  breakShown(): void {
    this.s.lastAdAt = this.now();
  }

  /** Read-only view (debug / tests). */
  get state(): Readonly<PolicyState> {
    return this.s;
  }
}
