import { describe, expect, it } from 'vitest';
import { AdPolicy, POLICY } from '../../src/ads/policy';
import { resolveProvider } from '../../src/ads';

const clock = () => {
  let t = 1_000_000;
  let day = '2026-11-05';
  return {
    now: () => t,
    today: () => day,
    advance: (s: number) => (t += s * 1000),
    setDay: (d: string) => (day = d),
  };
};

describe('ad policy', () => {
  it('no interstitial in the first matches, right after boot, or too soon after another ad', () => {
    const c = clock();
    const p = new AdPolicy(c.now, c.today);
    c.advance(POLICY.bootGraceS + 1);
    expect(p.canBreak('betweenMatches', false)).toBe(false);
    for (let i = 0; i < POLICY.graceMatches; i++) p.matchFinished();
    expect(p.canBreak('betweenMatches', false)).toBe(true);
    p.breakShown();
    expect(p.canBreak('betweenMatches', false)).toBe(false);
    c.advance(POLICY.gapS - 1);
    expect(p.canBreak('betweenMatches', false)).toBe(false);
    c.advance(2);
    expect(p.canBreak('betweenMatches', false)).toBe(true);
  });

  it('supporters never see interstitials', () => {
    const c = clock();
    const p = new AdPolicy(c.now, c.today);
    c.advance(10_000);
    for (let i = 0; i < 5; i++) p.matchFinished();
    expect(p.canBreak('betweenMatches', true)).toBe(false);
  });

  it('a rewarded ad also resets the interstitial timer', () => {
    const c = clock();
    const p = new AdPolicy(c.now, c.today);
    c.advance(10_000);
    for (let i = 0; i < 5; i++) p.matchFinished();
    p.rewardShown('doubleCoins');
    expect(p.canBreak('betweenMatches', false)).toBe(false);
  });

  it('one continue and one doubler per match; daily cap', () => {
    const c = clock();
    const p = new AdPolicy(c.now, c.today);
    expect(p.canOfferReward('continue')).toBe(true);
    p.rewardShown('continue');
    expect(p.canOfferReward('continue')).toBe(false);
    expect(p.canOfferReward('doubleCoins')).toBe(true);
    p.matchStarted();
    expect(p.canOfferReward('continue')).toBe(true);
    for (let i = 0; i < POLICY.rewardedPerDay; i++) p.rewardShown('dailyChest');
    expect(p.canOfferReward('dailyChest')).toBe(false);
    c.setDay('2026-11-06');
    expect(p.canOfferReward('dailyChest')).toBe(true);
  });
});

describe('provider selection', () => {
  it('dev builds use the fake ad, production needs a client id or a platform host', () => {
    expect(resolveProvider({ dev: true }, 'localhost', '')).toBe('dev');
    expect(resolveProvider({ dev: false }, 'jonron.vercel.app', '')).toBe('none');
    expect(resolveProvider({ dev: false, client: 'ca-pub-1' }, 'jonron.vercel.app', '')).toBe('h5');
    expect(resolveProvider({ dev: false }, 'games.poki.com', '')).toBe('poki');
    expect(resolveProvider({ dev: false }, 'www.crazygames.com', '')).toBe('crazygames');
    expect(resolveProvider({ dev: false, mode: 'h5' }, 'x.com', '')).toBe('none');
    expect(resolveProvider({ dev: false }, 'jonron.vercel.app', '?ads=dev')).toBe('dev');
  });
});
