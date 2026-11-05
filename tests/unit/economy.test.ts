import { describe, expect, it } from 'vitest';
import type { CustomCharacter } from '../../src/contracts';
import { characterById, setCustomCharacterDefs } from '../../src/config/characters';
import {
  PRESETS,
  RATING_BUDGET,
  customToDef,
  defaultCustom,
  missingParts,
  randomCustom,
  ratingsTotal,
  requiredParts,
  sanitizeCustom,
  setRating,
  slotsOwned,
  validRatings,
  withBat,
} from '../../src/config/creator';
import { dailyNumber, dailyScore, dailyStage } from '../../src/config/daily';
import { COIN, dayKey, daysBetween, matchCoins, totalCoins } from '../../src/config/economy';
import { Rng } from '../../src/core/rng';
import { addCoins, buyParts, claimDailyBonus, defaultSave, deleteCustom, migrate, upsertCustom } from '../../src/persistence/save';

describe('Fichas', () => {
  it('new players start with the welcome gift; old saves get it too', () => {
    expect(defaultSave().coins).toBe(COIN.starting);
    expect(migrate({ settings: {} }).coins).toBe(COIN.starting);
    expect(migrate({ coins: -50 }).coins).toBe(0);
  });

  it('itemises a match and caps practice', () => {
    const lines = matchCoins({ mode: 'campaign', homeRuns: 3, hits: 5, barrels: 2, newStars: 2, firstClear: true });
    expect(totalCoins(lines)).toBe(3 * COIN.homeRun + 2 * COIN.hit + 2 * COIN.barrel + 2 * COIN.newStar + COIN.firstClear);
    const practice = matchCoins({ mode: 'practice', homeRuns: 40, hits: 60, barrels: 30 });
    expect(totalCoins(practice)).toBe(COIN.practiceCap);
  });

  it('pays a quick game for winning, runs and extra bases', () => {
    const lines = matchCoins({ mode: 'game', homeRuns: 1, hits: 3, barrels: 0, game: { won: true, runs: 4, extraBases: 1, walkOff: true } });
    expect(totalCoins(lines)).toBe(COIN.homeRun + 2 * COIN.hit + COIN.gameWin + 4 * COIN.run + COIN.extraBase + COIN.walkOff);
  });

  it('buys parts only when affordable and never twice', () => {
    let save = addCoins(defaultSave(), 1000);
    const bought = buyParts(save, ['bat-baguette', 'glasses-sun']);
    expect(bought).not.toBeNull();
    save = bought!;
    expect(save.owned).toEqual(['bat-baguette', 'glasses-sun']);
    expect(save.coins).toBe(COIN.starting + 1000 - 250);
    expect(buyParts(save, ['bat-baguette'])!.coins).toBe(save.coins);
    expect(buyParts({ ...save, coins: 10 }, ['giant'])).toBeNull();
  });

  it('daily login bonus once per day', () => {
    const a = claimDailyBonus(defaultSave(), '2026-11-05');
    expect(a.amount).toBe(COIN.dailyBonus);
    expect(claimDailyBonus(a.save, '2026-11-05').amount).toBe(0);
    expect(claimDailyBonus(a.save, '2026-11-06').amount).toBe(COIN.dailyBonus);
  });

  it('day keys and day differences', () => {
    expect(dayKey(new Date(2026, 10, 5))).toBe('2026-11-05');
    expect(daysBetween('2026-11-05', '2026-11-06')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});

describe('character creator', () => {
  it('ratings stay inside the shared budget', () => {
    let r = defaultCustom('custom-1').ratings;
    expect(ratingsTotal(r)).toBe(RATING_BUDGET);
    r = setRating(r, 'power', 25);
    expect(r.power).toBe(25);
    expect(ratingsTotal(r)).toBe(RATING_BUDGET);
    expect(validRatings(r)).toBe(true);
    r = setRating(r, 'speed', 25);
    expect(validRatings(r)).toBe(true);
    expect(ratingsTotal(r)).toBeLessThanOrEqual(RATING_BUDGET);
  });

  it('knows which parts cost Fichas', () => {
    const c: CustomCharacter = { ...defaultCustom('custom-1'), look: withBat({ ...defaultCustom('custom-1').look, heightM: 5, headScale: 1.6, glasses: 'sun' }, 'chancla'), trait: 'penny' };
    expect(requiredParts(c).sort()).toEqual(['bat-chancla', 'bobblehead', 'giant', 'glasses-sun', 'trait-penny']);
    expect(missingParts(c, ['giant', 'bat-chancla'])).toEqual(['bobblehead', 'glasses-sun', 'trait-penny']);
    expect(requiredParts(defaultCustom('custom-2'))).toEqual([]);
  });

  it('turns a created player into a playable character with the roster mechanics', () => {
    const base = defaultCustom('custom-7');
    const peak = customToDef({ ...base, trait: 'peak' });
    expect(peak.ability?.kind).toBe('peak');
    const temper = customToDef({ ...base, trait: 'temper' });
    expect(temper.temper).toBeDefined();
    expect(temper.wildSwing).toBeDefined();
    const home = customToDef({ ...base, trait: 'homeCooking', home: 'tenis' });
    expect(home.homeStadium?.stadium).toBe('tenis');
    expect(home.homeStadium!.mods.pci.contact).toBeCloseTo(1.2);
    setCustomCharacterDefs([peak]);
    expect(characterById('custom-7').name).toBe('Novato');
    setCustomCharacterDefs([]);
    expect(characterById('custom-7').id).toBe('moro');
  });

  it('random players only use owned parts and spend the whole budget', () => {
    for (let s = 1; s < 40; s++) {
      const c = randomCustom(new Rng(s), 'custom-1', []);
      expect(missingParts(c, [])).toEqual([]);
      expect(ratingsTotal(c.ratings)).toBe(RATING_BUDGET);
    }
  });

  it('presets keep the ratings legal', () => {
    for (const p of PRESETS) expect(validRatings(p.apply(defaultCustom('custom-1')).ratings)).toBe(true);
  });

  it('repairs or rejects saved players', () => {
    expect(sanitizeCustom({ id: 'evil<script>' })).toBeNull();
    const fixed = sanitizeCustom({ id: 'custom-3', name: '<b>Pepe</b>', look: { heightM: 99, skin: 'red', number: '1234' }, ratings: { vision: 25, contact: 25, power: 25, speed: 25 }, trait: 'godmode' })!;
    expect(fixed.name).toBe('bPepe/b');
    expect(fixed.look.heightM).toBe(7.8);
    expect(fixed.look.skin).toMatch(/^#/);
    expect(fixed.look.number).toBe('12');
    expect(validRatings(fixed.ratings)).toBe(true);
    expect(fixed.trait).toBe('none');
  });

  it('created players live in the save, can be selected and deleted', () => {
    let save = upsertCustom(defaultSave(), defaultCustom('custom-1'));
    save = { ...save, selectedCharacter: 'custom-1' };
    const loaded = migrate(JSON.parse(JSON.stringify(save)));
    expect(loaded.customCharacters).toHaveLength(1);
    expect(loaded.selectedCharacter).toBe('custom-1');
    const gone = deleteCustom(loaded, 'custom-1');
    expect(gone.customCharacters).toHaveLength(0);
    expect(gone.selectedCharacter).toBe('moro');
  });

  it('extra slots are bought', () => {
    expect(slotsOwned([])).toBe(1);
    expect(slotsOwned(['slot-2', 'slot-3'])).toBe(3);
  });
});

describe('daily challenge', () => {
  it('is the same stage for everyone on a given day and changes the next day', () => {
    expect(dailyStage('2026-11-05')).toEqual(dailyStage('2026-11-05'));
    const days = ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'].map((d) => JSON.stringify({ ...dailyStage(d), id: '' }));
    expect(new Set(days).size).toBeGreaterThan(1);
    expect(dailyNumber('2026-11-01')).toBe(1);
    expect(dailyNumber('2026-11-05')).toBe(5);
  });

  it('scores home runs, distance and completion', () => {
    const a = dailyScore({ homeRuns: 3, longestHRft: 430, barrels: 2, success: false, stars: 0 });
    const b = dailyScore({ homeRuns: 3, longestHRft: 430, barrels: 2, success: true, stars: 3 });
    expect(b).toBeGreaterThan(a);
  });
});
