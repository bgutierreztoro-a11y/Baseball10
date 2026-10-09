import { describe, expect, it } from 'vitest';
import { MPH } from '../../src/config/constants';
import { BASE_MODS, CHARACTERS, characterById, combineMods } from '../../src/config/characters';
import { Rng } from '../../src/core/rng';
import { defaultSave, migrate } from '../../src/persistence/save';
import { evaluateSwing, swingProfile, SWING_PROFILES } from '../../src/sim/contact';
import type { SwingMods } from '../../src/contracts';
import { fastball, metro, swingAt } from './helpers';

const plan = fastball(92);
const ctx = () => ({ stadium: metro, targets: [], rng: new Rng(5) });

/** Swing with the aim offset by `nx` base-PCI half-widths (so bigger PCIs tolerate more). */
function hit(mods: SwingMods, kind: 'contact' | 'power', nx = 0) {
  const sw = swingAt(plan, { kind, nx });
  return evaluateSwing(plan, { ...sw, mods }, ctx());
}
const ev = (r: ReturnType<typeof hit>) => (r.kind === 'contact' ? r.ball.exitVelocity / MPH : 0);
const mods = (id: string) => characterById(id).mods;

describe('characters', () => {
  it('has the four batters with valid looks and unique ids', () => {
    expect(CHARACTERS.map((c) => c.id).sort()).toEqual(['arturek', 'chamo', 'mati', 'moro']);
    expect(characterById('arturek').look.heightM).toBeGreaterThan(7.5);
    expect(characterById('chamo').look.heightM).toBeCloseTo(1.88);
    expect(characterById('nope').id).toBe('moro');
  });

  it('El Moro is the base model and only he has an ability', () => {
    expect(mods('moro')).toEqual(BASE_MODS);
    expect(CHARACTERS.filter((c) => c.ability).map((c) => c.id)).toEqual(['moro']);
  });

  it('swingProfile scales the PCI and bat speed', () => {
    const p = swingProfile('contact', mods('arturek'));
    expect(p.pciHalfWidth).toBeCloseTo(SWING_PROFILES.contact.pciHalfWidth * 1.35);
    expect(swingProfile('power', mods('chamo')).batSpeed).toBeGreaterThan(SWING_PROFILES.power.batSpeed);
  });

  it('Arturek reaches pitches the base batter misses, with both swings', () => {
    for (const kind of ['contact', 'power'] as const) {
      expect(hit(BASE_MODS, kind, 1.2).kind).toBe('whiff');
      expect(hit(mods('arturek'), kind, 1.2).kind).toBe('contact');
    }
  });

  it('Chamo has the strongest power swing but the smallest contact circle', () => {
    const power = CHARACTERS.map((c) => [c.id, ev(hit(c.mods, 'power'))] as const).sort((a, b) => b[1] - a[1]);
    expect(power[0]![0]).toBe('chamo');
    expect(ev(hit(mods('chamo'), 'power'))).toBeGreaterThan(ev(hit(BASE_MODS, 'power')) * 1.08);
    expect(hit(BASE_MODS, 'contact', 0.85).kind).toBe('contact');
    expect(hit(mods('chamo'), 'contact', 0.85).kind).toBe('whiff');
  });

  it('El Mati is more balanced than Chamo: more power than base, better contact than Chamo', () => {
    const mati = mods('mati');
    expect(mati.pci.contact).toBeGreaterThan(mods('chamo').pci.contact);
    expect(ev(hit(mati, 'power'))).toBeGreaterThan(ev(hit(BASE_MODS, 'power')));
    expect(ev(hit(mati, 'power'))).toBeLessThan(ev(hit(mods('chamo'), 'power')));
    expect(ev(hit(mati, 'contact'))).toBeGreaterThan(ev(hit(mods('chamo'), 'contact')));
  });

  it("El Moro's peak boosts both contact and power a lot", () => {
    const moro = characterById('moro');
    const peak = combineMods(moro.mods, moro.ability!.mods);
    expect(hit(BASE_MODS, 'contact', 1.2).kind).toBe('whiff');
    expect(hit(peak, 'contact', 1.2).kind).toBe('contact');
    expect(ev(hit(peak, 'power'))).toBeGreaterThan(ev(hit(BASE_MODS, 'power')) * 1.06);
  });

  it('the save remembers the selected batter and rejects unknown ids', () => {
    expect(defaultSave().selectedCharacter).toBe('moro');
    expect(migrate({ ...defaultSave(), selectedCharacter: 'chamo' }).selectedCharacter).toBe('chamo');
    expect(migrate({ ...defaultSave(), selectedCharacter: 'babe-ruth' }).selectedCharacter).toBe('moro');
  });
});
