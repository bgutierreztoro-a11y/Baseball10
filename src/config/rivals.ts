import type { CharacterLook, LocalizedText } from '../contracts';
import type { Difficulty } from '../sim/game';

/**
 * Rival teams of the quick game (modo Partido). Each one is an inside joke
 * of the JONRÓN universe and trash-talks between innings, Backyard
 * Baseball style. The pitcher sets the difficulty (speed, arsenal,
 * command); `kit` dresses the whole defence.
 */
export interface RivalTeam {
  id: string;
  name: LocalizedText;
  /** Three letters for the scorebug. */
  short: string;
  difficulty: Difficulty;
  pitcher: string;
  kit: CharacterLook;
  taunts: LocalizedText[];
}

const L = (es: string, en: string): LocalizedText => ({ es, en });

export const RIVALS: readonly RivalTeam[] = [
  {
    id: 'ramiros',
    name: L('Los Ramiros', 'The Ramiros'),
    short: 'RAM',
    difficulty: 'easy',
    pitcher: 'ramon',
    kit: { skin: '#d9a47e', jersey: '#ff6fb5', jerseyTrim: '#ffffff', pants: '#ffe3f1', cap: '#ff6fb5', build: 1.1 },
    taunts: [
      L('«Hola, soy iluvkiwiss… digo, Ramiro»', '"Hi, it’s iluvkiwiss… I mean, Ramiro"'),
      L('«Te escribo luego, mi amor 😘»', '"Text you later, babe 😘"'),
      L('«Todo el equipo se llama Ramiro. Sí, todos»', '"The whole team is called Ramiro. Yes, all of us"'),
    ],
  },
  {
    id: 'pollos',
    name: L('Pollos Furiosos', 'Furious Chickens'),
    short: 'POL',
    difficulty: 'easy',
    pitcher: 'brisa',
    kit: { skin: '#fbf7ec', jersey: '#f7d117', jerseyTrim: '#d9262c', pants: '#fbf7ec', cap: '#d9262c', build: 1.05 },
    taunts: [L('«¡Cocorocóóó!»', '"Cock-a-doodle-doo!"'), L('«Bateas como gallina»', '"You swing like a hen"'), L('«El lanzador de Chimon es nuestro primo»', '"Chimon’s pitcher is our cousin"')],
  },
  {
    id: 'mandem',
    name: L('Mandem FC', 'Mandem FC'),
    short: 'MDM',
    difficulty: 'normal',
    pitcher: 'mago',
    kit: { skin: '#f1d2bd', jersey: '#8a8f98', jerseyTrim: '#111111', pants: '#5c616b', cap: '#111111', build: 1 },
    taunts: [L('«Wagwan, ¿eso fue un swing?»', '"Wagwan, was that a swing?"'), L('«Valentina está en la grada, bro»', '"Valentina’s in the stands, bro"'), L('«Ese jonrón me lo llevo yo»', '"I’m taking that home run with me"')],
  },
  {
    id: 'zilina',
    name: L('Vikokotores de Žilina', 'Žilina Vikokotors'),
    short: 'ZIL',
    difficulty: 'normal',
    pitcher: 'condor',
    kit: { skin: '#f0c9a8', jersey: '#f7d117', jerseyTrim: '#0a7a3b', pants: '#0a7a3b', cap: '#0a7a3b', build: 1.25 },
    taunts: [L('«Ojo, que traemos petardos»', '"Careful, we brought firecrackers"'), L('«Bubenik te manda saludos»', '"Bubenik says hi"'), L('«En Žilina esto es un toque»', '"In Žilina that’s a bunt"')],
  },
  {
    id: 'mamados',
    name: L('Los Mamados del Iron Paradise', 'The Iron Paradise Swoles'),
    short: 'IRN',
    difficulty: 'hard',
    pitcher: 'ciclon',
    kit: { skin: '#8d5a3b', jersey: '#15161b', jerseyTrim: '#ffc21a', pants: '#15161b', cap: '#ffc21a', build: 1.45 },
    taunts: [L('«¡Lightweight, baby!»', '"Lightweight, baby!"'), L('«¿Eso es todo lo que levantas?»', '"Is that all you lift?"'), L('«Hoy es día de pierna… y de ponches»', '"Today is leg day… and strikeout day"')],
  },
  {
    id: 'huesos',
    name: L('Huesos FC', 'Bones FC'),
    short: 'HUE',
    difficulty: 'hard',
    pitcher: 'ciclon',
    kit: { skin: '#ebe4cf', jersey: '#15161b', jerseyTrim: '#f28c28', pants: '#15161b', cap: '#f28c28', build: 0.95 },
    taunts: [L('«Te vamos a dejar en los huesos»', '"We’ll leave you skin and bones"'), L('«Chamo es nuestro capitán honorario»', '"Chamo is our honorary captain"'), L('«No tenemos corazón. Literal»', '"We have no heart. Literally"')],
  },
];

export function rivalById(id: string): RivalTeam {
  return RIVALS.find((r) => r.id === id) ?? RIVALS[0]!;
}
