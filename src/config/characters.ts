import type { CharacterDef, CharacterId, SwingMods } from '../contracts';

const mods = (contactPci: number, powerPci: number, contactBat: number, powerBat: number): SwingMods => ({
  pci: { contact: contactPci, power: powerPci },
  bat: { contact: contactBat, power: powerBat },
});

export const BASE_MODS: SwingMods = mods(1, 1, 1, 1);

/**
 * Playable batters. Stats are multipliers on the base swing profiles:
 * PCI size (how forgiving the aim is) and bat speed (exit velocity).
 * Balance intent:
 * - El Moro: the base model, plus a once-per-match "peak" boost.
 * - El Mati: all-rounder with a bit more pop; his size blocks more of the view.
 * - Arturek: huge reach → much bigger PCI for both swings, average power.
 * - Chamo: the strongest power swing, but a small contact PCI.
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
    look: { skin: '#b07a4f', hair: '#1c130d', heightM: 1.85, build: 1, belly: 0, muscle: 0.2, extraArms: false, beard: true, jersey: '#f4f1e8', trim: '#d7263d', number: '7' },
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
    look: { skin: '#3a2318', hair: null, heightM: 1.93, build: 1.95, belly: 1, muscle: 0.3, extraArms: false, beard: true, jersey: '#f4f1e8', trim: '#2563c9', number: '34' },
    mods: mods(1.0, 1.08, 1.04, 1.07),
    ability: null,
  },
  {
    id: 'arturek',
    name: 'Arturek',
    title: { es: 'El Gigante de Bratislava', en: 'The Giant of Bratislava' },
    bio: {
      es: 'Rubio, eslovaco y de casi 8 metros. Con sus cuatro brazos alcanza casi cualquier lanzamiento: su círculo es mucho más grande, tanto de contacto como de poder.',
      en: 'Blond, Slovak and almost 8 metres tall. With four arms he reaches almost any pitch: his circle is much bigger for both contact and power swings.',
    },
    look: { skin: '#f1d2bd', hair: '#f2d16b', heightM: 7.8, build: 1, belly: 0, muscle: 0.2, extraArms: true, beard: false, jersey: '#f4f1e8', trim: '#2fa36b', number: '99' },
    mods: mods(1.35, 1.35, 1.0, 1.0),
    ability: null,
  },
  {
    id: 'chamo',
    name: 'Chamo',
    title: { es: 'El Roto', en: 'The Shredded' },
    bio: {
      es: 'Inspirado en Barry Bonds. 1,88 m de puro músculo: su swing de poder es el más fuerte del juego, pero su círculo de contacto es pequeño.',
      en: 'Inspired by Barry Bonds. 1.88 m of pure muscle: the strongest power swing in the game, but a small contact circle.',
    },
    look: { skin: '#5a3825', hair: null, heightM: 1.88, build: 1.12, belly: 0, muscle: 1, extraArms: false, beard: false, jersey: '#f4f1e8', trim: '#f28c28', number: '25' },
    mods: mods(0.78, 1.0, 0.95, 1.14),
    ability: null,
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
