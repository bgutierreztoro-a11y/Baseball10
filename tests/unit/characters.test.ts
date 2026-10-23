import { describe, expect, it } from 'vitest';
import { MPH } from '../../src/config/constants';
import { BASE_MODS, CHARACTERS, characterById, combineMods, modsFromRatings, pciFillMods } from '../../src/config/characters';
import { STRIKE_ZONE } from '../../src/config/constants';
import { EXTRA_STADIUMS, STADIUMS, STADIUM_ORDER } from '../../src/config/stadiums';
import { trajectoryTouches } from '../../src/sim/penny';
import { Rng } from '../../src/core/rng';
import { defaultSave, migrate } from '../../src/persistence/save';
import { evaluateSwing, swingProfile, SWING_PROFILES, WILD_MAX_EV, wildSwing } from '../../src/sim/contact';
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
  it('has the six batters with valid looks and unique ids', () => {
    expect(CHARACTERS.map((c) => c.id).sort()).toEqual(['arturek', 'benjamin', 'chamo', 'chimon', 'mati', 'moro']);
    expect(characterById('arturek').look.heightM).toBeGreaterThan(7.5);
    expect(characterById('chamo').look.heightM).toBeCloseTo(1.9);
    expect(characterById('nope').id).toBe('moro');
  });

  it('only Chamo makes the pitcher wear the Southampton striped kit', () => {
    expect(CHARACTERS.filter((c) => c.pitcherKit?.jerseyStripe).map((c) => c.id)).toEqual(['chamo']);
    expect(characterById('chamo').pitcherKit).toMatchObject({ jersey: '#d71920', jerseyStripe: '#ffffff' });
    // The crests hovering over the pitcher: Southampton for Chamo, MŠK Žilina over Arturek's Vikokotor.
    expect(Object.fromEntries(CHARACTERS.filter((c) => c.pitcherBadge).map((c) => [c.id, c.pitcherBadge]))).toEqual({ arturek: 'zilina', chamo: 'southampton' });
  });

  it('Chimon is a monkey with a racket, facing a chicken pitcher', () => {
    const c = characterById('chimon');
    expect(c.look).toMatchObject({ monkey: true, racket: true, hornBat: false });
    expect(CHARACTERS.filter((x) => x.pitcherKit?.chicken).map((x) => x.id)).toEqual(['chimon']);
    expect(CHARACTERS.filter((x) => x.wildSwing).map((x) => x.id)).toEqual(['chimon']);
    expect(c.wildSwing!.homeRunChance).toBe(0.5);
    expect(c.temper).toEqual({ whiffs: 3, cooldownSwings: 10 });
    expect(c.trait).toBeTruthy();
  });

  it("Chimon's angry racket: every contact is max power, ~50 % home runs and the rest fouls", () => {
    const rng = new Rng(11);
    const c = { stadium: metro, targets: [], rng };
    let hr = 0;
    let foul = 0;
    let back = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const sw = swingAt(plan, { kind: 'contact', nx: 0.3 });
      const base = evaluateSwing(plan, { ...sw, mods: mods('chimon') }, c);
      expect(base.kind).toBe('contact');
      const r = wildSwing(base, plan, c, 0.5);
      if (r.kind !== 'contact') throw new Error('contact expected');
      expect(r.ball.exitVelocity).toBeGreaterThan(WILD_MAX_EV * 0.94);
      expect(['homeRun', 'foul']).toContain(r.ball.outcome);
      if (r.ball.outcome === 'homeRun') hr++;
      else {
        foul++;
        expect(r.ball.targetsHit).toEqual([]);
        if (Math.abs(r.ball.sprayAngleDeg) > 90) back++;
      }
    }
    expect(hr + foul).toBe(N);
    expect(hr / N).toBeGreaterThan(0.43);
    expect(hr / N).toBeLessThan(0.57);
    // Some of the wild ones go backwards, over the screen.
    expect(back).toBeGreaterThan(foul * 0.3);
  });

  it('wildSwing leaves whiffs alone', () => {
    const c = { stadium: metro, targets: [], rng: new Rng(3) };
    const whiff = hit(BASE_MODS, 'power', 1.1);
    expect(whiff.kind).toBe('whiff');
    expect(wildSwing(whiff, plan, c, 0.3)).toBe(whiff);
  });

  it('Benjamin is a rabbi facing a rabbi pitcher, with a 25 % lucky penny', () => {
    const b = characterById('benjamin');
    expect(b.name).toBe('Benjamin Gutenberg');
    expect(b.look.rabbi).toBe(true);
    expect(CHARACTERS.filter((c) => c.pitcherKit?.rabbi).map((c) => c.id)).toEqual(['benjamin']);
    expect(b.pennyBlessing).toEqual({ spawnChance: 0.25, pciFill: 0.85, pitches: 3 });
  });

  it("the penny blessing makes both PCIs cover 85 % of the strike zone", () => {
    const zone = 2 * STRIKE_ZONE.halfWidth * (STRIKE_ZONE.top - STRIKE_ZONE.bottom);
    for (const id of ['benjamin', 'moro', 'arturek']) {
      const base = mods(id);
      const m = combineMods(base, pciFillMods(0.85, base));
      for (const kind of ['contact', 'power'] as const) {
        const p = swingProfile(kind, m);
        expect((Math.PI * p.pciHalfWidth * p.pciHalfHeight) / zone).toBeCloseTo(0.85, 5);
        // Bat speed is untouched.
        expect(p.batSpeed).toBeCloseTo(swingProfile(kind, base).batSpeed);
      }
    }
  });

  it('a batted ball touches the penny only along its flight', () => {
    const r = hit(mods('benjamin'), 'power');
    if (r.kind !== 'contact') throw new Error('contact expected');
    const mid = r.ball.trajectory[Math.floor(r.ball.trajectory.length / 3)]!;
    expect(trajectoryTouches(r.ball, { x: mid.x + 1, y: mid.y, z: mid.z }, 4)).toBeGreaterThan(0);
    expect(trajectoryTouches(r.ball, { x: mid.x + 40, y: mid.y, z: mid.z }, 4)).toBe(-1);
  });

  it('Arturek hits much harder at home in Bratislava, which is open outside the campaign', () => {
    const a = characterById('arturek');
    expect(a.homeStadium!.stadium).toBe('bratislava');
    expect(STADIUMS.bratislava.features.bratislava).toBe(true);
    expect(EXTRA_STADIUMS).toEqual(['bratislava', 'southampton', 'tenis', 'gimnasio']);
    expect(STADIUM_ORDER).not.toContain('bratislava');
    const home = combineMods(a.mods, a.homeStadium!.mods);
    for (const kind of ['contact', 'power'] as const) expect(ev(hit(home, kind))).toBeGreaterThan(ev(hit(a.mods, kind)) * 1.15);
    expect(CHARACTERS.filter((c) => c.homeStadium).map((c) => c.id)).toEqual(['mati', 'arturek', 'chimon']);
  });

  it('Chimon gets a 15 % bigger batting eye on the tennis court, a park outside the campaign', () => {
    const c = characterById('chimon');
    expect(c.homeStadium!.stadium).toBe('tenis');
    expect(STADIUMS.tenis.features.tennis).toBe(true);
    expect(STADIUM_ORDER).not.toContain('tenis');
    const home = combineMods(c.mods, c.homeStadium!.mods);
    for (const kind of ['contact', 'power'] as const) {
      const base = swingProfile(kind, c.mods);
      const court = swingProfile(kind, home);
      expect(court.pciHalfWidth / base.pciHalfWidth).toBeCloseTo(1.15);
      expect(court.pciHalfHeight / base.pciHalfHeight).toBeCloseTo(1.15);
      // Only the eye changes: same bat speed.
      expect(court.batSpeed).toBeCloseTo(base.batSpeed);
    }
    expect(c.homeStadium!.buff.es).toContain('15 %');
  });

  it('El Mati is Ronnie Coleman in a wheelchair, with a 10 % pre-workout that gets him up', () => {
    const m = characterById('mati');
    expect(m.look).toMatchObject({ wheelchair: true, muscle: 1 });
    // Sitting he keeps his usual ratings.
    expect(m.ratings).toEqual({ vision: 10, contact: 14, power: 17 });
    const pw = m.preWorkout!;
    expect(pw).toMatchObject({ chance: 0.1, pitches: 3 });
    expect(pw.mods).toEqual(modsFromRatings(pw.ratings));
    expect(CHARACTERS.filter((c) => c.preWorkout).map((c) => c.id)).toEqual(['mati']);
    // Pumped, every rating goes up: bigger circle and a harder swing on both swings.
    for (const k of ['vision', 'contact', 'power'] as const) expect(pw.ratings[k]).toBeGreaterThan(m.ratings[k]);
    for (const kind of ['contact', 'power'] as const) {
      expect(swingProfile(kind, pw.mods).pciHalfWidth).toBeGreaterThan(swingProfile(kind, m.mods).pciHalfWidth);
      expect(ev(hit(pw.mods, kind))).toBeGreaterThan(ev(hit(m.mods, kind)));
    }
  });

  it('El Mati swings a dumbbell and is boosted at home in his gym, a park outside the campaign', () => {
    const m = characterById('mati');
    expect(m.look.dumbbell).toBe(true);
    expect(CHARACTERS.filter((c) => c.look.dumbbell).map((c) => c.id)).toEqual(['mati']);
    expect(m.homeStadium!.stadium).toBe('gimnasio');
    expect(STADIUMS.gimnasio.features.gym).toBe(true);
    expect(STADIUM_ORDER).not.toContain('gimnasio');
    expect(EXTRA_STADIUMS).toContain('gimnasio');
    // Boosted: bigger eye and a harder swing on both swings.
    const home = combineMods(m.mods, m.homeStadium!.mods);
    for (const kind of ['contact', 'power'] as const) {
      expect(swingProfile(kind, home).pciHalfWidth).toBeGreaterThan(swingProfile(kind, m.mods).pciHalfWidth * 1.19);
      expect(swingProfile(kind, home).batSpeed).toBeGreaterThan(swingProfile(kind, m.mods).batSpeed * 1.19);
    }
    // The pre-workout also drops far more often in his gym.
    expect(m.preWorkout!.homeChance).toBeGreaterThan(m.preWorkout!.chance);
  });

  it('Chamo is a horned skeleton', () => {
    expect(characterById('chamo').look).toMatchObject({ skeleton: true, horns: true, hornBat: true });
    expect(CHARACTERS.filter((c) => c.look.skeleton).map((c) => c.id)).toEqual(['chamo']);
  });

  it('El Moro is the base model and only he has an ability', () => {
    expect(mods('moro')).toEqual(BASE_MODS);
    expect(CHARACTERS.filter((c) => c.ability).map((c) => c.id)).toEqual(['moro']);
  });

  it('uses the requested ratings and derives the mods from them', () => {
    expect(characterById('arturek').ratings).toEqual({ vision: 20, contact: 5, power: 2 });
    expect(characterById('chamo').ratings).toEqual({ vision: 10, contact: 5, power: 24 });
    for (const c of CHARACTERS) expect(c.mods).toEqual(modsFromRatings(c.ratings));
  });

  it('swingProfile scales the PCI and bat speed', () => {
    const p = swingProfile('power', mods('arturek'));
    expect(p.pciHalfWidth).toBeCloseTo(SWING_PROFILES.power.pciHalfWidth * 1.35);
    expect(p.batSpeed).toBeLessThan(SWING_PROFILES.power.batSpeed);
    expect(swingProfile('power', mods('chamo')).batSpeed).toBeGreaterThan(SWING_PROFILES.power.batSpeed);
  });

  it('Arturek reaches pitches the base batter misses, with both swings, but hits softest', () => {
    for (const kind of ['contact', 'power'] as const) {
      expect(hit(BASE_MODS, kind, 1.1).kind).toBe('whiff');
      expect(hit(mods('arturek'), kind, 1.1).kind).toBe('contact');
    }
    const power = CHARACTERS.map((c) => [c.id, ev(hit(c.mods, 'power'))] as const).sort((a, b) => a[1] - b[1]);
    expect(power[0]![0]).toBe('arturek');
  });

  it('Chamo has the strongest power swing, a base circle and a weaker contact swing', () => {
    // Chimon's racket ignores bat speed (every contact is max power), so he is not in this race.
    const power = CHARACTERS.filter((c) => !c.wildSwing)
      .map((c) => [c.id, ev(hit(c.mods, 'power'))] as const)
      .sort((a, b) => b[1] - a[1]);
    expect(power[0]![0]).toBe('chamo');
    expect(ev(hit(mods('chamo'), 'power'))).toBeGreaterThan(ev(hit(BASE_MODS, 'power')) * 1.08);
    expect(mods('chamo').pci.power).toBe(1);
    expect(mods('chamo').pci.contact).toBeLessThan(1);
    expect(mods('chamo').pci.contact).toBeGreaterThan(0.85);
    expect(ev(hit(mods('chamo'), 'contact'))).toBeLessThan(ev(hit(BASE_MODS, 'contact')));
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
