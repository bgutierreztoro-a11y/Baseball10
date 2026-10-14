import type { BatterRatings, CharacterDef, CharacterId, SwingMods } from '../contracts';

const mods = (contactPci: number, powerPci: number, contactBat: number, powerBat: number): SwingMods => ({
  pci: { contact: contactPci, power: powerPci },
  bat: { contact: contactBat, power: powerBat },
});

export const BASE_MODS: SwingMods = mods(1, 1, 1, 1);

/** Rating of the base batter in every category. */
export const BASE_RATING = 10;

/**
 * Turns the 0..25 ratings into swing multipliers (10 = base batter):
 * - vision → PCI size for both swings (+3.5 % per point);
 * - contact → contact-swing PCI (+2 % per point) and bat speed (+1 % per point);
 * - power → power-swing bat speed (+1 % per point).
 */
export function modsFromRatings(r: BatterRatings): SwingMods {
  const vision = 1 + 0.035 * (r.vision - BASE_RATING);
  const contact = r.contact - BASE_RATING;
  return mods(vision * (1 + 0.02 * contact), vision, 1 + 0.01 * contact, 1 + 0.01 * (r.power - BASE_RATING));
}

const rated = (vision: number, contact: number, power: number) => {
  const ratings = { vision, contact, power };
  return { ratings, mods: modsFromRatings(ratings) };
};

/**
 * Playable batters. Ratings (0..25, 10 = base) drive the swing multipliers:
 * PCI size (how forgiving the aim is) and bat speed (exit velocity).
 * Balance intent:
 * - El Moro: the base model, plus a once-per-match "peak" boost.
 * - El Mati: all-rounder with a bit more pop; his size blocks more of the view.
 * - Arturek: huge vision → much bigger PCI for both swings, but almost no power.
 * - Chamo: the strongest power swing, average vision, below-average contact.
 */
export const CHARACTERS: readonly CharacterDef[] = [
  {
    id: 'moro',
    name: 'El Moro',
    title: { es: 'El enamorado', en: 'The Lovestruck' },
    bio: {
      es: 'Un bateador de lo más normal… hasta que su novia virtual, «iluvkiwiss», le grita desde la grada. Él no lo sabe, pero detrás del perfil de iluvkiwiss hay un señor llamado Ramiro.',
      en: 'A perfectly ordinary hitter… until his online girlfriend, "iluvkiwiss", cheers from the stands. He has no idea that behind iluvkiwiss’s profile is a guy named Ramiro.',
    },
    look: { skin: '#b07a4f', hair: '#1c130d', heightM: 1.85, build: 1, belly: 0, muscle: 0.2, extraArms: false, beard: true, horns: false, hornBat: false, jersey: '#f4f1e8', trim: '#d7263d', number: '7' },
    ratings: { vision: BASE_RATING, contact: BASE_RATING, power: BASE_RATING },
    mods: BASE_MODS,
    ability: {
      kind: 'peak',
      name: { es: 'Peak máximo', en: 'Max Peak' },
      description: {
        es: 'iluvkiwiss lo alienta desde la grada: durante 3 lanzamientos, círculo mucho más grande y swing mucho más fuerte. Una vez por partido.',
        en: 'iluvkiwiss cheers him on: for 3 pitches, a much bigger circle and a much harder swing. Once per match.',
      },
      pitches: 3,
      uses: 1,
      mods: mods(1.4, 1.4, 1.1, 1.1),
    },
  },
  {
    id: 'mati',
    name: 'El Mati',
    title: { es: 'El Gran Papá', en: 'Big Papa' },
    bio: {
      es: 'Inspirado en David "Big Papi" Ortiz. Enorme, tranquilo y siempre peligroso: batea bien de contacto y de poder. Ocupa tanto espacio en la caja de bateo que tapa buena parte de la vista.',
      en: 'Inspired by David "Big Papi" Ortiz. Huge, calm and always dangerous: hits well for contact and power. He fills so much of the batter’s box that he blocks a good part of the view.',
    },
    look: { skin: '#3a2318', hair: null, heightM: 1.93, build: 1.95, belly: 1, muscle: 0.3, extraArms: false, beard: true, horns: false, hornBat: false, jersey: '#f4f1e8', trim: '#2563c9', number: '34' },
    ...rated(10, 14, 17),
    ability: null,
  },
  {
    id: 'arturek',
    name: 'Arturek',
    title: { es: 'El Gigante de Bratislava', en: 'The Giant of Bratislava' },
    bio: {
      es: 'Rubio, eslovaco y de casi 8 metros. Desde allá arriba lo ve todo y con sus cuatro brazos alcanza casi cualquier lanzamiento: su círculo es mucho más grande. Eso sí, le pega flojito.',
      en: 'Blond, Slovak and almost 8 metres tall. From up there he sees everything, and with four arms he reaches almost any pitch: his circle is much bigger. He just doesn’t hit it very hard.',
    },
    look: { skin: '#f1d2bd', hair: '#f2d16b', heightM: 7.8, build: 1, belly: 0, muscle: 0.2, extraArms: true, beard: false, horns: false, hornBat: false, jersey: '#f4f1e8', trim: '#2fa36b', number: '99' },
    ...rated(20, 5, 2),
    ability: null,
  },
  {
    id: 'chamo',
    name: 'Chamo',
    title: { es: 'El Roto', en: 'The Shredded' },
    bio: {
      es: '1,90 m, marcado de pies a cabeza: el six-pack y los bíceps se le notan a través de la camiseta. Tiene un par de cuernos de villano y no usa bate de madera: le pega a la pelota con un cuerno gigante. Su swing está inspirado en el de Barry Bonds y es el más potente del juego, aunque su contacto es flojo.',
      en: '1.90 m and shredded head to toe: his six-pack and biceps show through the jersey. He has a pair of villain horns and doesn’t use a wooden bat: he hits the ball with a giant horn. His swing is modelled on Barry Bonds’s and is the most powerful in the game, though his contact is weak.',
    },
    look: { skin: '#f0cdb4', hair: null, heightM: 1.9, build: 1.12, belly: 0, muscle: 1, extraArms: false, beard: false, horns: true, hornBat: true, jersey: '#f4f1e8', trim: '#f28c28', number: '25' },
    ...rated(10, 5, 24),
    ability: null,
    // The pitcher facing Chamo wears a Southampton FC home kit (red/white stripes, black shorts).
    pitcherKit: { jersey: '#d71920', jerseyStripe: '#ffffff', jerseyTrim: '#111111', pants: '#141414', cap: '#d71920', socks: '#ffffff' },
    pitcherBadge: true,
  },
];

export const DEFAULT_CHARACTER: CharacterId = 'moro';

export function characterById(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS.find((c) => c.id === DEFAULT_CHARACTER)!;
}

/** Combines two sets of multipliers (e.g. character × active ability). */
export function combineMods(a: SwingMods, b: SwingMods): SwingMods {
  return mods(a.pci.contact * b.pci.contact, a.pci.power * b.pci.power, a.bat.contact * b.bat.contact, a.bat.power * b.bat.power);
}
