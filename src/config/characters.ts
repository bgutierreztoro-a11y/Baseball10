import type { BatterRatings, CharacterDef, CharacterId, SwingKind, SwingMods } from '../contracts';
import { SWING_PROFILES } from '../sim/contact';
import { STRIKE_ZONE } from './constants';

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
 * - Chimon: a monkey with a tennis racket — the big string bed is easy to hit
 *   with. Three whiffs in a row make him angry (temper): until he hits a home
 *   run every ball he touches leaves at max power, 50 % home runs and 50 %
 *   wild fouls in any direction (wildSwing); then a 10-swing cooldown.
 * - Benjamin Gutenberg: a rabbi, slightly above average all round; his lucky
 *   penny (pennyBlessing) can fill 85 % of the strike zone with his PCI.
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
    // At home in Bratislava his swing gets a big power boost (+25 % bat speed on both swings).
    homeStadium: { stadium: 'bratislava', mods: mods(1, 1, 1.25, 1.25) },
    trait: {
      name: { es: 'En casa, en Bratislava', en: 'At home in Bratislava' },
      description: {
        es: 'En el Estadio del Danubio, con el castillo y el puente OVNI de fondo, batea con mucha más potencia: +25 % de velocidad de bate en ambos swings.',
        en: 'At the Danube Ballpark, with the castle and the UFO bridge behind the fence, he hits much harder: +25 % bat speed on both swings.',
      },
    },
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
  {
    id: 'chimon',
    name: 'Chimon',
    title: { es: 'El Mono Tenista', en: 'The Tennis Monkey' },
    bio: {
      es: 'Un mono que se coló en el estadio con su raqueta de tenis y se niega a soltarla. Con esa cabeza de cuerdas le pega a casi todo. Si falla muchas veces seguidas se enoja, se le pone la cara roja como un tomate y empieza a pegarle con toda su fuerza… pero sin ninguna dirección. Cuando él batea, el lanzador es un pollo.',
      en: 'A monkey who snuck into the ballpark with his tennis racket and refuses to let go of it. With that string bed he hits almost anything. Miss too many in a row and he gets angry, his face turns red as a tomato and he starts hitting as hard as he can… but with no direction at all. When he bats, the pitcher is a chicken.',
    },
    look: { skin: '#7a4a2a', hair: null, heightM: 1.6, build: 1, belly: 0.25, muscle: 0.3, extraArms: false, beard: false, horns: false, hornBat: false, monkey: true, racket: true, jersey: '#fdfcf7', trim: '#c9d82b', number: '1' },
    ...rated(15, 12, 25),
    ability: null,
    trait: {
      name: { es: 'Raquetazo salvaje', en: 'Wild Racket' },
      description: {
        es: 'Si abanica 3 veces seguidas se enoja y se le pone la cara roja: cada pelota que toque sale a máxima potencia, 50 % jonrón seguro y 50 % foul hacia cualquier lado, hasta hacia atrás. Se calma al batear un jonrón y luego necesita 10 swings para volver a enojarse.',
        en: 'Whiff 3 times in a row and he gets angry and his face turns red: every ball he touches leaves at max power, 50 % a sure home run and 50 % a foul in any direction, even backwards. A home run calms him down, and then it takes 10 swings before he can get angry again.',
      },
    },
    wildSwing: { homeRunChance: 0.5 },
    temper: { whiffs: 3, cooldownSwings: 10 },
    // When Chimon bats, the pitcher is a chicken.
    pitcherKit: { skin: '#fbf7ec', jersey: '#fbf7ec', jerseyTrim: '#e8c547', pants: '#fbf7ec', cap: '#d9262c', socks: '#f2a516', shoes: '#f2a516', chicken: true },
  },
  {
    id: 'benjamin',
    name: 'Benjamin Gutenberg',
    title: { es: 'El Rabino Bateador', en: 'The Batting Rabbi' },
    bio: {
      es: 'Rabino de barba larga, sombrero negro y peyot rizados que batea con su traje de sinagoga. A veces aparece un centavo flotando en el campo: si la pelota lo toca, Benjamín Netanyahu baja del cielo en un kipá volador al ritmo de Hava Nagila y le llena el ojo de bateo. Con él al bate, el lanzador también viste de rabino.',
      en: 'A long-bearded rabbi with a black hat and curly peyot who bats in his synagogue suit. Sometimes a penny floats over the field: if the ball touches it, Benjamin Netanyahu comes down from the sky in a flying kippah to the beat of Hava Nagila and fills his batting eye. When he bats, the pitcher dresses as a rabbi too.',
    },
    look: { skin: '#eac7a8', hair: '#5b3b22', heightM: 1.78, build: 1.02, belly: 0.2, muscle: 0.1, extraArms: false, beard: true, horns: false, hornBat: false, rabbi: true, jersey: '#15161b', trim: '#f4f1e8', number: '18' },
    ...rated(12, 12, 11),
    ability: null,
    trait: {
      name: { es: 'El centavo de la suerte', en: 'The Lucky Penny' },
      description: {
        es: 'Antes de cada lanzamiento hay un 25 % de que aparezca un centavo gigante en el campo. Si tu batazo lo toca, Netanyahu baja en su kipá volador y, durante 3 lanzamientos, el ojo de bateo cubre el 85 % de la zona de strike.',
        en: 'Before each pitch there is a 25 % chance a giant penny appears over the field. If your batted ball touches it, Netanyahu comes down in his flying kippah and, for 3 pitches, the batting eye covers 85 % of the strike zone.',
      },
    },
    pennyBlessing: { spawnChance: 0.25, pciFill: 0.85, pitches: 3 },
    // The pitcher facing Benjamin dresses as a rabbi too.
    pitcherKit: { skin: '#e3b894', jersey: '#15161b', jerseyTrim: '#f4f1e8', pants: '#15161b', cap: '#15161b', socks: '#15161b', shoes: '#0c0c0f', rabbi: true },
  },
];

export const DEFAULT_CHARACTER: CharacterId = 'moro';

/**
 * Multipliers that, applied on top of `base`, make each swing's PCI ellipse
 * cover `fill` (0..1) of the strike zone's area (Benjamin's blessing).
 */
export function pciFillMods(fill: number, base: SwingMods): SwingMods {
  const zone = 2 * STRIKE_ZONE.halfWidth * (STRIKE_ZONE.top - STRIKE_ZONE.bottom);
  const k = (kind: SwingKind): number => {
    const p = SWING_PROFILES[kind];
    return Math.sqrt((fill * zone) / (Math.PI * p.pciHalfWidth * p.pciHalfHeight)) / base.pci[kind];
  };
  return mods(k('contact'), k('power'), 1, 1);
}

export function characterById(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS.find((c) => c.id === DEFAULT_CHARACTER)!;
}

/** Combines two sets of multipliers (e.g. character × active ability). */
export function combineMods(a: SwingMods, b: SwingMods): SwingMods {
  return mods(a.pci.contact * b.pci.contact, a.pci.power * b.pci.power, a.bat.contact * b.bat.contact, a.bat.power * b.bat.power);
}
