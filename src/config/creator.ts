import type { BatterLook, BatterRatings, CharacterDef, CustomCharacter, CustomCharacterId, LocalizedText, StadiumId, SwingMods, TraitId } from '../contracts';
import type { Rng } from '../core/rng';
import { BASE_RATING, combineMods, modsFromRatings } from './characters';
import { STADIUMS } from './stadiums';

/**
 * Character creator (docs/07-plan-maestro.md §5): the catalogue of parts,
 * the ratings budget, the funny traits (each one reuses a mechanic from the
 * roster) and the conversion from a saved player to a playable CharacterDef.
 *
 * Fair by design: every player gets the same ratings budget (42 points over
 * vision, contact, power and speed, the same as the base batter plus two),
 * so Fichas only ever buy looks, traits and slots — never a better swing.
 */

export type BatChoice = 'wood' | 'baguette' | 'chancla' | 'horn' | 'racket' | 'dumbbell';
export type BodyChoice = 'human' | 'monkey' | 'skeleton';

export const RATING_BUDGET = 42;
export const RATING_MIN = 2;
export const RATING_MAX = 25;
export const NAME_MAX = 18;
export const NICK_MAX = 28;
/** Created-player slots: the first is free, the rest are bought with Fichas. */
export const MAX_SLOTS = 6;

export const HEIGHT = { min: 1.45, maxHuman: 2.3, giantFrom: 2.6, max: 7.8 } as const;
export const HEAD = { min: 0.85, max: 1.9, bobbleFrom: 1.3 } as const;

export interface CreatorPart {
  id: string;
  price: number;
  name: LocalizedText;
}

const L = (es: string, en: string): LocalizedText => ({ es, en });

/** Everything that costs Fichas. Anything not listed here is free. */
export const PARTS: Record<string, CreatorPart> = {
  'body-monkey': { id: 'body-monkey', price: 400, name: L('Cuerpo de mono', 'Monkey body') },
  'body-skeleton': { id: 'body-skeleton', price: 400, name: L('Esqueleto', 'Skeleton') },
  'outfit-rabbi': { id: 'outfit-rabbi', price: 300, name: L('Traje de rabino', 'Rabbi attire') },
  giant: { id: 'giant', price: 600, name: L('Gigante (más de 2,6 m)', 'Giant (over 2.6 m)') },
  'extra-arms': { id: 'extra-arms', price: 300, name: L('Cuatro brazos', 'Four arms') },
  horns: { id: 'horns', price: 200, name: L('Cuernos de villano', 'Villain horns') },
  wheelchair: { id: 'wheelchair', price: 250, name: L('Silla de ruedas turbo', 'Turbo wheelchair') },
  bobblehead: { id: 'bobblehead', price: 200, name: L('Cabezón', 'Bobblehead') },
  'glasses-sun': { id: 'glasses-sun', price: 100, name: L('Gafas de sol', 'Sunglasses') },
  'glasses-nerd': { id: 'glasses-nerd', price: 100, name: L('Gafas de abuelo', 'Grandpa glasses') },
  'bat-baguette': { id: 'bat-baguette', price: 150, name: L('Baguette gigante', 'Giant baguette') },
  'bat-chancla': { id: 'bat-chancla', price: 150, name: L('La chancla', 'The flip-flop') },
  'bat-horn': { id: 'bat-horn', price: 300, name: L('Cuerno gigante', 'Giant horn') },
  'bat-racket': { id: 'bat-racket', price: 300, name: L('Raqueta de tenis', 'Tennis racket') },
  'bat-dumbbell': { id: 'bat-dumbbell', price: 300, name: L('Mancuerna', 'Dumbbell') },
  'trait-peak': { id: 'trait-peak', price: 300, name: L('Peak máximo', 'Max Peak') },
  'trait-preWorkout': { id: 'trait-preWorkout', price: 300, name: L('Preentreno', 'Pre-Workout') },
  'trait-temper': { id: 'trait-temper', price: 300, name: L('Mal genio', 'Short Fuse') },
  'trait-penny': { id: 'trait-penny', price: 300, name: L('Centavo de la suerte', 'Lucky Penny') },
  'trait-firecracker': { id: 'trait-firecracker', price: 200, name: L('Maldición del petardo', 'Firecracker Curse') },
  'trait-homeCooking': { id: 'trait-homeCooking', price: 150, name: L('Comida de casa', 'Home Cooking') },
  ...Object.fromEntries(
    [2, 3, 4, 5, 6].map((n) => [`slot-${n}`, { id: `slot-${n}`, price: 500, name: L(`Hueco de jugador ${n}`, `Player slot ${n}`) }]),
  ),
};

export interface TraitInfo {
  name: LocalizedText;
  description: LocalizedText;
  part: string | null;
}

export const TRAITS: Record<TraitId, TraitInfo> = {
  none: { name: L('Sin rasgo', 'No trait'), description: L('Un bateador normal y corriente.', 'A perfectly ordinary hitter.'), part: null },
  peak: {
    name: L('Peak máximo', 'Max Peak'),
    description: L('Tecla E (o botón PEAK): durante 3 lanzamientos, círculo mucho más grande y swing mucho más fuerte. Una vez por partido.', 'Key E (or the PEAK button): for 3 pitches, a much bigger circle and a much harder swing. Once per match.'),
    part: 'trait-peak',
  },
  preWorkout: {
    name: L('Preentreno', 'Pre-Workout'),
    description: L('Antes de cada lanzamiento hay un 10 % de que le caiga un preentreno: durante 3 lanzamientos, +6 a visión, contacto y poder.', 'Before each pitch there is a 10 % chance a pre-workout lands on him: for 3 pitches, +6 vision, contact and power.'),
    part: 'trait-preWorkout',
  },
  temper: {
    name: L('Mal genio', 'Short Fuse'),
    description: L('Si abanica 3 veces seguidas se enoja: cada pelota que toca sale a máxima potencia, 50 % jonrón seguro y 50 % foul a cualquier lado. Se calma con un jonrón.', 'Whiff 3 in a row and he gets angry: every ball he touches leaves at max power, 50 % a sure home run and 50 % a foul anywhere. A home run calms him down.'),
    part: 'trait-temper',
  },
  penny: {
    name: L('Centavo de la suerte', 'Lucky Penny'),
    description: L('25 % por lanzamiento de que aparezca un centavo en el campo. Si tu batazo lo toca, baja el kipá volador y el ojo de bateo cubre el 85 % de la zona durante 3 lanzamientos.', '25 % chance per pitch of a penny over the field. Hit it and the flying kippah comes down: the batting eye covers 85 % of the zone for 3 pitches.'),
    part: 'trait-penny',
  },
  firecracker: {
    name: L('Maldición del petardo', 'Firecracker Curse'),
    description: L('20 % por lanzamiento de que te tiren un petardo encendido. Si lo bateas: 50 % jonrón seguro, 50 % explota y se acaba el partido.', '20 % chance per pitch of a lit firecracker. Hit it: 50 % a sure home run, 50 % it blows up and the match is over.'),
    part: 'trait-firecracker',
  },
  homeCooking: {
    name: L('Comida de casa', 'Home Cooking'),
    description: L('En su estadio de casa batea con +20 % de ojo y de velocidad de bate (en vez del +8 % normal).', 'In his home park he bats with +20 % eye and bat speed (instead of the usual +8 %).'),
    part: 'trait-homeCooking',
  },
};

export const TRAIT_ORDER: TraitId[] = ['none', 'peak', 'preWorkout', 'temper', 'penny', 'firecracker', 'homeCooking'];
export const BAT_ORDER: BatChoice[] = ['wood', 'baguette', 'chancla', 'horn', 'racket', 'dumbbell'];

export const BAT_NAMES: Record<BatChoice, LocalizedText> = {
  wood: L('Bate de madera', 'Wooden bat'),
  baguette: PARTS['bat-baguette']!.name,
  chancla: PARTS['bat-chancla']!.name,
  horn: PARTS['bat-horn']!.name,
  racket: PARTS['bat-racket']!.name,
  dumbbell: PARTS['bat-dumbbell']!.name,
};

export const SKIN_TONES = ['#f6d7c3', '#eac7a8', '#d9a47e', '#b07a4f', '#8d5a3b', '#5e3a24', '#3a2318', '#9fd36b', '#7fb2ff'];
export const HAIR_COLORS: (string | null)[] = [null, '#1c130d', '#5b3b22', '#a8642a', '#f2d16b', '#d9d9d9', '#d7263d', '#2bb3a3'];
export const TEAM_COLORS = ['#f4f1e8', '#15161b', '#d7263d', '#2563c9', '#2fa36b', '#f28c28', '#f7d117', '#8338ec', '#ff6fb5', '#0b1426', '#7a4a2a', '#00b4d8'];

// ── Look helpers (the saved look stores the roster's flags) ──

export function batOf(look: BatterLook): BatChoice {
  if (look.baguette) return 'baguette';
  if (look.chancla) return 'chancla';
  if (look.dumbbell) return 'dumbbell';
  if (look.racket) return 'racket';
  if (look.hornBat) return 'horn';
  return 'wood';
}

export function withBat(look: BatterLook, bat: BatChoice): BatterLook {
  return { ...look, baguette: bat === 'baguette', chancla: bat === 'chancla', dumbbell: bat === 'dumbbell', racket: bat === 'racket', hornBat: bat === 'horn' };
}

export function bodyOf(look: BatterLook): BodyChoice {
  return look.skeleton ? 'skeleton' : look.monkey ? 'monkey' : 'human';
}

export function withBody(look: BatterLook, body: BodyChoice): BatterLook {
  const next: BatterLook = { ...look, skeleton: body === 'skeleton', monkey: body === 'monkey' };
  if (body === 'skeleton') next.skin = '#ebe4cf';
  if (body === 'monkey') next.skin = '#7a4a2a';
  // A monkey or a skeleton does not wear the rabbi suit.
  if (body !== 'human') next.rabbi = false;
  return next;
}

/** Parts (from PARTS) this player uses. */
export function requiredParts(c: CustomCharacter): string[] {
  const l = c.look;
  const out: string[] = [];
  if (l.monkey) out.push('body-monkey');
  if (l.skeleton) out.push('body-skeleton');
  if (l.rabbi) out.push('outfit-rabbi');
  if (l.heightM >= HEIGHT.giantFrom) out.push('giant');
  if (l.extraArms) out.push('extra-arms');
  if (l.horns) out.push('horns');
  if (l.wheelchair) out.push('wheelchair');
  if ((l.headScale ?? 1) >= HEAD.bobbleFrom) out.push('bobblehead');
  if (l.glasses === 'sun') out.push('glasses-sun');
  if (l.glasses === 'nerd') out.push('glasses-nerd');
  const bat = batOf(l);
  if (bat !== 'wood') out.push(`bat-${bat}`);
  const tp = TRAITS[c.trait].part;
  if (tp) out.push(tp);
  return out;
}

export function missingParts(c: CustomCharacter, owned: readonly string[]): string[] {
  return requiredParts(c).filter((p) => !owned.includes(p));
}

/** Price of what is still locked. */
export function unlockCost(parts: readonly string[]): number {
  return parts.reduce((s, p) => s + (PARTS[p]?.price ?? 0), 0);
}

/** How many created players the save may hold. */
export function slotsOwned(owned: readonly string[]): number {
  let n = 1;
  for (let i = 2; i <= MAX_SLOTS; i++) if (owned.includes(`slot-${i}`)) n = i;
  return n;
}

// ── Ratings ──

const RATING_KEYS = ['vision', 'contact', 'power', 'speed'] as const;
export type RatingKey = (typeof RATING_KEYS)[number];
export { RATING_KEYS };

export function ratingsTotal(r: BatterRatings): number {
  return r.vision + r.contact + r.power + r.speed;
}

export function validRatings(r: BatterRatings): boolean {
  return RATING_KEYS.every((k) => Number.isInteger(r[k]) && r[k] >= RATING_MIN && r[k] <= RATING_MAX) && ratingsTotal(r) <= RATING_BUDGET;
}

/**
 * Sets one rating; if that goes over budget, the points come from the
 * other ratings (largest first), never below the minimum.
 */
export function setRating(r: BatterRatings, key: RatingKey, value: number): BatterRatings {
  const next = { ...r, [key]: Math.max(RATING_MIN, Math.min(RATING_MAX, Math.round(value))) };
  let over = ratingsTotal(next) - RATING_BUDGET;
  while (over > 0) {
    const donor = RATING_KEYS.filter((k) => k !== key && next[k] > RATING_MIN).sort((a, b) => next[b] - next[a])[0];
    if (!donor) {
      next[key] -= over;
      break;
    }
    next[donor]--;
    over--;
  }
  return next;
}

/** Brings any ratings into the rules (used when loading a save). */
export function fixRatings(r: Partial<Record<RatingKey, unknown>>): BatterRatings {
  let out: BatterRatings = { vision: BASE_RATING, contact: BASE_RATING, power: BASE_RATING, speed: BASE_RATING };
  for (const k of RATING_KEYS) {
    const v = r[k];
    if (typeof v === 'number' && Number.isFinite(v)) out = setRating(out, k, v);
  }
  return out;
}

// ── Conversion ──

const mods = (c: number, p: number, bc: number, bp: number): SwingMods => ({ pci: { contact: c, power: p }, bat: { contact: bc, power: bp } });

function boosted(r: BatterRatings, by: number): BatterRatings {
  const up = (v: number): number => Math.min(RATING_MAX, v + by);
  return { vision: up(r.vision), contact: up(r.contact), power: up(r.power), speed: Math.min(RATING_MAX, r.speed + 4) };
}

/** A created player as a playable character (same machinery as the roster). */
export function customToDef(c: CustomCharacter): CharacterDef {
  const ratings = fixRatings(c.ratings);
  const t = TRAITS[c.trait];
  const parkName = c.home ? STADIUMS[c.home].name : null;
  const def: CharacterDef = {
    id: c.id,
    name: c.name,
    title: { es: c.nickname, en: c.nickname },
    bio: {
      es: `Creado en el Estudio de JONRÓN.${parkName ? ` Juega en casa en ${parkName.es}.` : ''}`,
      en: `Made in the JONRÓN Studio.${parkName ? ` Plays at home at ${parkName.en}.` : ''}`,
    },
    look: { ...c.look },
    ratings,
    mods: modsFromRatings(ratings),
    ability: null,
  };
  if (c.trait !== 'none' && c.trait !== 'peak') def.trait = { name: t.name, description: t.description };
  switch (c.trait) {
    case 'peak':
      def.ability = { kind: 'peak', name: t.name, description: t.description, pitches: 3, uses: 1, mods: mods(1.4, 1.4, 1.1, 1.1) };
      break;
    case 'preWorkout': {
      const r = boosted(ratings, 6);
      def.preWorkout = { chance: 0.1, pitches: 3, ratings: r, mods: modsFromRatings(r) };
      break;
    }
    case 'temper':
      def.temper = { whiffs: 3, cooldownSwings: 10 };
      def.wildSwing = { homeRunChance: 0.5 };
      break;
    case 'penny':
      def.pennyBlessing = { spawnChance: 0.25, pciFill: 0.85, pitches: 3 };
      break;
    case 'firecracker':
      def.firecracker = { chance: 0.2, explodeChance: 0.5 };
      break;
    default:
      break;
  }
  if (c.home) {
    const k = c.trait === 'homeCooking' ? 1.2 : 1.08;
    const pct = Math.round((k - 1) * 100);
    def.homeStadium = {
      stadium: c.home,
      mods: combineMods(mods(1, 1, 1, 1), mods(k, k, k, k)),
      buff: { es: `En casa: +${pct} % de ojo y de velocidad de bate`, en: `At home: +${pct} % eye and bat speed` },
    };
  }
  return def;
}

// ── Defaults, presets, random ──

export function defaultLook(): BatterLook {
  return {
    skin: '#b07a4f',
    hair: '#1c130d',
    heightM: 1.85,
    build: 1,
    belly: 0,
    muscle: 0.2,
    extraArms: false,
    beard: false,
    horns: false,
    hornBat: false,
    jersey: '#f4f1e8',
    trim: '#2563c9',
    number: '10',
    headScale: 1,
  };
}

export function defaultCustom(id: CustomCharacterId): CustomCharacter {
  return { id, name: 'Novato', nickname: 'El de la casa', look: defaultLook(), ratings: { vision: 11, contact: 11, power: 10, speed: 10 }, trait: 'none', home: null };
}

export function newCustomId(existing: readonly { id: string }[]): CustomCharacterId {
  let n = existing.length + 1;
  while (existing.some((c) => c.id === `custom-${n}`)) n++;
  return `custom-${n}`;
}

export interface CreatorPreset {
  id: string;
  name: LocalizedText;
  apply(c: CustomCharacter): CustomCharacter;
}

export const PRESETS: CreatorPreset[] = [
  {
    id: 'clasico',
    name: L('Clásico', 'Classic'),
    apply: (c) => ({ ...c, look: { ...defaultLook(), jersey: c.look.jersey, trim: c.look.trim, number: c.look.number }, ratings: { vision: 11, contact: 11, power: 10, speed: 10 } }),
  },
  {
    id: 'panadero',
    name: L('El Panadero', 'The Baker'),
    apply: (c) => ({
      ...c,
      nickname: 'Pan caliente',
      look: withBat({ ...c.look, belly: 0.8, build: 1.25, mustache: true, beard: false, hair: '#5b3b22', skeleton: false, monkey: false }, 'baguette'),
      ratings: { vision: 10, contact: 14, power: 12, speed: 6 },
    }),
  },
  {
    id: 'chancla',
    name: L('La Chancla', 'The Flip-Flop'),
    apply: (c) => ({
      ...c,
      nickname: 'Nadie se le escapa',
      look: withBat({ ...c.look, glasses: 'nerd', hair: '#d9d9d9', heightM: 1.6, belly: 0.3, skeleton: false, monkey: false }, 'chancla'),
      ratings: { vision: 16, contact: 14, power: 6, speed: 6 },
    }),
  },
  {
    id: 'cabezon',
    name: L('El Cabezón', 'The Bobblehead'),
    apply: (c) => ({ ...c, nickname: 'Cabeza de jonrón', look: { ...c.look, headScale: 1.85, glasses: 'sun' }, ratings: { vision: 14, contact: 10, power: 10, speed: 8 } }),
  },
  {
    id: 'monstruo',
    name: L('El Monstruo', 'The Monster'),
    apply: (c) => ({ ...c, nickname: 'Pesadilla de la loma', look: withBat(withBody({ ...c.look, horns: true, hair: null, beard: false }, 'skeleton'), 'horn'), ratings: { vision: 8, contact: 6, power: 22, speed: 6 } }),
  },
  {
    id: 'gigante',
    name: L('El Gigantón', 'The Colossus'),
    apply: (c) => ({ ...c, nickname: 'Rascacielos', look: { ...c.look, heightM: 6.5, extraArms: true }, ratings: { vision: 18, contact: 8, power: 6, speed: 10 } }),
  },
  {
    id: 'mono',
    name: L('Mono Loco', 'Crazy Monkey'),
    apply: (c) => ({ ...c, nickname: 'Plátano veloz', look: withBat(withBody({ ...c.look, hair: null, beard: false, heightM: 1.55 }, 'monkey'), 'racket'), ratings: { vision: 12, contact: 10, power: 8, speed: 12 }, trait: 'temper' }),
  },
];

const FUNNY_NAMES = ['Pepe Jonrón', 'Tío Batazo', 'Don Cabezón', 'Kiko Turbo', 'Juancho Swing', 'El Abuelo', 'Barriga de Oro', 'Flaco Fuerza', 'Nacho Nachos', 'Chuchito Bomba', 'Mister Bloop', 'La Pantera', 'Toño Cohete', 'Doña Chancla', 'Chepe Mazazo', 'Rambo Ramírez'];
const FUNNY_NICKS = ['El terror de la loma', 'Rey del bloop', 'Mano de piedra', 'Bigote de oro', 'El que nunca corre', 'Señor de los fouls', 'Brazo de goma', 'Pura vitamina', 'El del pan', 'Ojo de halcón', 'Patas de gelatina', 'Primo de Arturek'];

/** A random (funny) player that only uses parts the player already owns. */
export function randomCustom(rng: Rng, id: CustomCharacterId, owned: readonly string[]): CustomCharacter {
  const has = (p: string): boolean => owned.includes(p);
  const bodies: BodyChoice[] = ['human', ...(has('body-monkey') ? (['monkey'] as const) : []), ...(has('body-skeleton') ? (['skeleton'] as const) : [])];
  const bats = BAT_ORDER.filter((b) => b === 'wood' || has(`bat-${b}`));
  const traits = TRAIT_ORDER.filter((t) => t === 'none' || has(TRAITS[t].part!));
  const body = rng.pick(bodies);
  const giant = has('giant') && rng.next() < 0.2;
  let look: BatterLook = {
    ...defaultLook(),
    skin: rng.pick(SKIN_TONES.slice(0, 7)),
    hair: rng.pick(HAIR_COLORS),
    heightM: giant ? Math.round(rng.range(HEIGHT.giantFrom, HEIGHT.max) * 10) / 10 : Math.round(rng.range(HEIGHT.min, HEIGHT.maxHuman) * 100) / 100,
    build: Math.round(rng.range(0.85, 1.5) * 100) / 100,
    belly: rng.next() < 0.4 ? Math.round(rng.range(0.2, 1) * 100) / 100 : 0,
    muscle: Math.round(rng.range(0, 1) * 100) / 100,
    beard: rng.next() < 0.35,
    mustache: rng.next() < 0.3,
    headScale: has('bobblehead') && rng.next() < 0.35 ? Math.round(rng.range(1.3, HEAD.max) * 100) / 100 : Math.round(rng.range(0.9, 1.15) * 100) / 100,
    glasses: has('glasses-sun') && rng.next() < 0.25 ? 'sun' : has('glasses-nerd') && rng.next() < 0.2 ? 'nerd' : undefined,
    horns: has('horns') && rng.next() < 0.3,
    extraArms: has('extra-arms') && rng.next() < 0.2,
    jersey: rng.pick(TEAM_COLORS),
    trim: rng.pick(TEAM_COLORS),
    number: String(Math.floor(rng.range(0, 100))),
  };
  look = withBat(withBody(look, body), rng.pick(bats));
  // Random ratings that spend the whole budget.
  let ratings: BatterRatings = { vision: RATING_MIN, contact: RATING_MIN, power: RATING_MIN, speed: RATING_MIN };
  for (let left = RATING_BUDGET - ratingsTotal(ratings); left > 0; left--) {
    const k = rng.pick(RATING_KEYS.filter((x) => ratings[x] < RATING_MAX));
    ratings = { ...ratings, [k]: ratings[k] + 1 };
  }
  const homes = Object.keys(STADIUMS) as StadiumId[];
  return { id, name: rng.pick(FUNNY_NAMES), nickname: rng.pick(FUNNY_NICKS), look, ratings, trait: rng.pick(traits), home: rng.next() < 0.5 ? rng.pick(homes) : null };
}

// ── Save validation ──

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const hex = (v: unknown, d: string): string => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const num = (v: unknown, d: number, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const flag = (v: unknown): boolean => v === true;
const text = (v: unknown, d: string, max: number): string => {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '';
  return s || d;
};

/** Validates a saved created player; null if it cannot be repaired. */
export function sanitizeCustom(raw: unknown): CustomCharacter | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !/^custom-[a-z0-9-]{1,24}$/.test(raw.id)) return null;
  const d = defaultLook();
  const l = isObj(raw.look) ? raw.look : {};
  const look: BatterLook = {
    skin: hex(l.skin, d.skin),
    hair: l.hair === null ? null : hex(l.hair, d.hair ?? '#1c130d'),
    heightM: num(l.heightM, d.heightM, HEIGHT.min, HEIGHT.max),
    build: num(l.build, 1, 0.8, 1.6),
    belly: num(l.belly, 0, 0, 1),
    muscle: num(l.muscle, 0.2, 0, 1),
    extraArms: flag(l.extraArms),
    beard: flag(l.beard),
    horns: flag(l.horns),
    hornBat: flag(l.hornBat),
    monkey: flag(l.monkey),
    skeleton: flag(l.skeleton),
    rabbi: flag(l.rabbi),
    racket: flag(l.racket),
    dumbbell: flag(l.dumbbell),
    wheelchair: flag(l.wheelchair),
    baguette: flag(l.baguette),
    chancla: flag(l.chancla),
    mustache: flag(l.mustache),
    glasses: l.glasses === 'sun' || l.glasses === 'nerd' ? l.glasses : undefined,
    headScale: num(l.headScale, 1, HEAD.min, HEAD.max),
    jersey: hex(l.jersey, d.jersey),
    trim: hex(l.trim, d.trim),
    number: text(l.number, '10', 2).replace(/\D/g, '') || '10',
  };
  const trait = TRAIT_ORDER.includes(raw.trait as TraitId) ? (raw.trait as TraitId) : 'none';
  const home = typeof raw.home === 'string' && raw.home in STADIUMS ? (raw.home as StadiumId) : null;
  return {
    id: raw.id as CustomCharacterId,
    name: text(raw.name, 'Novato', NAME_MAX),
    nickname: text(raw.nickname, '', NICK_MAX),
    look: withBat(look, batOf(look)),
    ratings: fixRatings(isObj(raw.ratings) ? raw.ratings : {}),
    trait,
    home,
  };
}
