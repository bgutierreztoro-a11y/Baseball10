import type { BatDef, StageDef, TargetDef } from '../contracts';
import { DEG, FT } from './constants';

/** Target placed by spray angle (deg, + = right field), distance (ft) and height (m). */
function target(sprayDeg: number, distFt: number, y: number, radius: number, kind: TargetDef['kind']): TargetDef {
  const r = distFt * FT;
  return {
    position: { x: Math.sin(sprayDeg * DEG) * r, y, z: Math.cos(sprayDeg * DEG) * r },
    radius,
    kind,
  };
}

const TIP = {
  timing: {
    es: 'Haz clic (o Espacio) un instante ANTES de que la bola llegue: el bate tarda en salir.',
    en: 'Click (or Space) a split second BEFORE the ball arrives: the bat needs time to come through.',
  },
  lift: {
    es: 'Coloca el círculo un poco por DEBAJO de la bola para elevarla. Centro = línea, arriba = rodado.',
    en: 'Put the circle slightly BELOW the ball to lift it. Centre = liner, above = grounder.',
  },
  direction: {
    es: 'Temprano = la bola va al jardín izquierdo (diestro). Tarde = al contrario.',
    en: 'Early = pull side. Late = opposite field.',
  },
  power: {
    es: 'Mantén Shift (o el botón POTENCIA) para el swing de poder: más distancia, círculo más pequeño.',
    en: 'Hold Shift (or the POWER button) for a power swing: more distance, smaller circle.',
  },
  changeup: {
    es: 'El cambio parece una recta pero llega tarde. Espera un poco más.',
    en: 'The changeup looks like a fastball but arrives late. Wait on it.',
  },
  timed: {
    es: 'Contrarreloj: el reloj corre mientras el lanzador trabaja. ¡Batea sin miedo!',
    en: 'Timed round: the clock runs while the pitcher works. Swing away!',
  },
  wall: {
    es: 'El Muro mide 34 pies. Por la izquierda necesitas elevar más la bola.',
    en: 'The Wall is 34 ft tall. To left field you need extra lift.',
  },
  sinker: {
    es: 'El sinker cae y se mete hacia el bateador diestro. Apunta un poco más abajo.',
    en: 'The sinker drops and runs in. Aim a little lower.',
  },
  lefty: {
    es: 'Zurdo en la loma: sus rompimientos van en sentido contrario.',
    en: 'Lefty on the mound: his breaking balls move the other way.',
  },
  slider: {
    es: 'El slider rompe hacia afuera. No persigas los que caen fuera de la zona.',
    en: 'The slider breaks away. Lay off the ones that leave the zone.',
  },
  streak: {
    es: 'Racha: los jonrones deben ser consecutivos. Un fallo y vuelves a cero.',
    en: 'Streak: home runs must be back-to-back. Miss one and you start over.',
  },
  altitude: {
    es: 'A 1.600 m el aire es menos denso: la bola viaja ~8% más lejos.',
    en: 'At 5,200 ft the air is thinner: the ball carries ~8% farther.',
  },
  splitter: {
    es: 'El splitter se desploma al final. Si está bajo, déjalo pasar.',
    en: 'The splitter falls off the table. If it is low, take it.',
  },
  final: {
    es: 'Más de 100 mph y todo el arsenal. Es la Gran Final.',
    en: '100+ mph and the full arsenal. This is the Grand Final.',
  },
} as const;

export const STAGES: StageDef[] = [
  // ── Chapter 1 · El Solar ──
  { id: '1-1', chapter: 1, index: 1, name: { es: 'Primer contacto', en: 'First Contact' }, stadium: 'solar', pitcher: 'ramon', goal: { type: 'hits', n: 3 }, limit: { type: 'outs', n: 8 }, stars: [{ type: 'outsLeft', n: 4 }, { type: 'noWhiffs' }], arsenal: ['FF'], speedOffsetMph: -4, zoneRate: 0.97, tip: TIP.timing },
  { id: '1-2', chapter: 1, index: 2, name: { es: 'Levántala', en: 'Lift It' }, stadium: 'solar', pitcher: 'ramon', goal: { type: 'homeRuns', n: 1 }, limit: { type: 'outs', n: 6 }, stars: [{ type: 'outsLeft', n: 3 }, { type: 'longestHR', ft: 330 }], arsenal: ['FF'], speedOffsetMph: -2, zoneRate: 0.95, tip: TIP.lift },
  { id: '1-3', chapter: 1, index: 3, name: { es: 'Tiro al blanco', en: 'Target Practice' }, stadium: 'solar', pitcher: 'ramon', goal: { type: 'targets', n: 2 }, limit: { type: 'outs', n: 8 }, stars: [{ type: 'outsLeft', n: 4 }, { type: 'barrels', n: 2 }], arsenal: ['FF'], zoneRate: 0.92, targets: [target(-24, 225, 0.05, 9, 'ring'), target(0, 250, 0.05, 9, 'ring'), target(24, 225, 0.05, 9, 'ring')], tip: TIP.direction },
  { id: '1-4', chapter: 1, index: 4, name: { es: 'Cambio de ritmo', en: 'Change of Pace' }, stadium: 'solar', pitcher: 'ramon', goal: { type: 'homeRuns', n: 3 }, limit: { type: 'outs', n: 7 }, stars: [{ type: 'outsLeft', n: 3 }, { type: 'longestHR', ft: 360 }], tip: TIP.changeup },
  { id: '1-5', chapter: 1, index: 5, name: { es: 'Jefe: Tío Ramón', en: 'Boss: Uncle Ramón' }, stadium: 'solar', pitcher: 'ramon', goal: { type: 'homeRuns', n: 5 }, limit: { type: 'time', seconds: 60 }, stars: [{ type: 'homeRuns', n: 8 }, { type: 'longestHR', ft: 380 }], boss: true, tip: TIP.timed },

  // ── Chapter 2 · Malecón ──
  { id: '2-1', chapter: 2, index: 1, name: { es: 'Brisa marina', en: 'Sea Breeze' }, stadium: 'malecon', pitcher: 'brisa', goal: { type: 'homeRuns', n: 2 }, limit: { type: 'outs', n: 7 }, stars: [{ type: 'outsLeft', n: 3 }, { type: 'maxEV', mph: 100 }], arsenal: ['FF'], tip: TIP.power },
  { id: '2-2', chapter: 2, index: 2, name: { es: 'El Muro', en: 'The Wall' }, stadium: 'malecon', pitcher: 'brisa', goal: { type: 'targets', n: 2 }, limit: { type: 'outs', n: 8 }, stars: [{ type: 'outsLeft', n: 4 }, { type: 'barrels', n: 2 }], arsenal: ['FF', 'CH'], targets: [target(-40, 314, 7.5, 3.6, 'billboard'), target(-30, 322, 7.5, 3.6, 'billboard'), target(-20, 336, 7.5, 3.6, 'billboard')], tip: TIP.wall },
  { id: '2-3', chapter: 2, index: 3, name: { es: 'Sinker al suelo', en: 'Sinker Ground' }, stadium: 'malecon', pitcher: 'brisa', goal: { type: 'hits', n: 5 }, limit: { type: 'outs', n: 7 }, stars: [{ type: 'outsLeft', n: 3 }, { type: 'noWhiffs' }], arsenal: ['FF', 'SI'], tip: TIP.sinker },
  { id: '2-4', chapter: 2, index: 4, name: { es: 'Más allá del agua', en: 'Beyond the Water' }, stadium: 'malecon', pitcher: 'brisa', goal: { type: 'distance', ft: 410 }, limit: { type: 'outs', n: 7 }, stars: [{ type: 'outsLeft', n: 3 }, { type: 'maxEV', mph: 105 }] },
  { id: '2-5', chapter: 2, index: 5, name: { es: 'Jefe: La Brisa', en: 'Boss: The Breeze' }, stadium: 'malecon', pitcher: 'brisa', goal: { type: 'homeRuns', n: 6 }, limit: { type: 'outs', n: 10 }, stars: [{ type: 'outsLeft', n: 4 }, { type: 'longestHR', ft: 420 }], boss: true },

  // ── Chapter 3 · Metro ──
  { id: '3-1', chapter: 3, index: 1, name: { es: 'Bajo las luces', en: 'Under the Lights' }, stadium: 'metro', pitcher: 'mago', goal: { type: 'homeRuns', n: 3 }, limit: { type: 'outs', n: 8 }, stars: [{ type: 'outsLeft', n: 4 }, { type: 'barrels', n: 2 }], arsenal: ['FF', 'CH'], tip: TIP.lefty },
  { id: '3-2', chapter: 3, index: 2, name: { es: 'El slider', en: 'The Slider' }, stadium: 'metro', pitcher: 'mago', goal: { type: 'hits', n: 5 }, limit: { type: 'outs', n: 7 }, stars: [{ type: 'outsLeft', n: 3 }, { type: 'noWhiffs' }], arsenal: ['FF', 'SL'], tip: TIP.slider },
  { id: '3-3', chapter: 3, index: 3, name: { es: 'Racha', en: 'Hot Streak' }, stadium: 'metro', pitcher: 'mago', goal: { type: 'streak', n: 3 }, limit: { type: 'outs', n: 10 }, stars: [{ type: 'outsLeft', n: 4 }, { type: 'longestHR', ft: 410 }], arsenal: ['FF', 'SL'], tip: TIP.streak },
  { id: '3-4', chapter: 3, index: 4, name: { es: 'Pantalla gigante', en: 'Big Screen' }, stadium: 'metro', pitcher: 'mago', goal: { type: 'targets', n: 2 }, limit: { type: 'outs', n: 10 }, stars: [{ type: 'outsLeft', n: 4 }, { type: 'maxEV', mph: 108 }], targets: [target(-24, 410, 9, 5.5, 'billboard'), target(0, 440, 13, 6.5, 'billboard'), target(24, 410, 9, 5.5, 'billboard')] },
  { id: '3-5', chapter: 3, index: 5, name: { es: 'Jefe: El Mago', en: 'Boss: The Wizard' }, stadium: 'metro', pitcher: 'mago', goal: { type: 'homeRuns', n: 7 }, limit: { type: 'time', seconds: 75 }, stars: [{ type: 'homeRuns', n: 10 }, { type: 'longestHR', ft: 430 }], boss: true, tip: TIP.timed },

  // ── Chapter 4 · La Cumbre ──
  { id: '4-1', chapter: 4, index: 1, name: { es: 'Aire fino', en: 'Thin Air' }, stadium: 'cumbre', pitcher: 'condor', goal: { type: 'distance', ft: 440 }, limit: { type: 'outs', n: 7 }, stars: [{ type: 'outsLeft', n: 3 }, { type: 'longestHR', ft: 460 }], arsenal: ['FF', 'FC'], tip: TIP.altitude },
  { id: '4-2', chapter: 4, index: 2, name: { es: 'Corte fino', en: 'Fine Cut' }, stadium: 'cumbre', pitcher: 'condor', goal: { type: 'homeRuns', n: 4 }, limit: { type: 'outs', n: 8 }, stars: [{ type: 'outsLeft', n: 3 }, { type: 'barrels', n: 3 }], arsenal: ['FF', 'FC'] },
  { id: '4-3', chapter: 4, index: 3, name: { es: 'Barrido', en: 'Sweep' }, stadium: 'cumbre', pitcher: 'condor', goal: { type: 'hits', n: 6 }, limit: { type: 'outs', n: 8 }, stars: [{ type: 'outsLeft', n: 3 }, { type: 'noWhiffs' }], arsenal: ['FF', 'ST'] },
  { id: '4-4', chapter: 4, index: 4, name: { es: 'Doble racha', en: 'Double Streak' }, stadium: 'cumbre', pitcher: 'condor', goal: { type: 'streak', n: 4 }, limit: { type: 'outs', n: 12 }, stars: [{ type: 'outsLeft', n: 5 }, { type: 'maxEV', mph: 110 }], arsenal: ['FF', 'FC', 'FS'], tip: TIP.splitter },
  { id: '4-5', chapter: 4, index: 5, name: { es: 'Jefe: El Cóndor', en: 'Boss: The Condor' }, stadium: 'cumbre', pitcher: 'condor', goal: { type: 'homeRuns', n: 8 }, limit: { type: 'outs', n: 10 }, stars: [{ type: 'outsLeft', n: 3 }, { type: 'longestHR', ft: 475 }], boss: true },

  // ── Chapter 5 · Gran Final ──
  { id: '5-1', chapter: 5, index: 1, name: { es: 'Calentamiento', en: 'Warm-up' }, stadium: 'final', pitcher: 'ciclon', goal: { type: 'homeRuns', n: 4 }, limit: { type: 'outs', n: 8 }, stars: [{ type: 'outsLeft', n: 4 }, { type: 'barrels', n: 3 }], arsenal: ['FF', 'SI'], tip: TIP.final },
  { id: '5-2', chapter: 5, index: 2, name: { es: 'Velocidad pura', en: 'Pure Heat' }, stadium: 'final', pitcher: 'ciclon', goal: { type: 'hits', n: 6 }, limit: { type: 'outs', n: 8 }, stars: [{ type: 'outsLeft', n: 3 }, { type: 'maxEV', mph: 112 }], arsenal: ['FF', 'SI'], speedOffsetMph: 2 },
  { id: '5-3', chapter: 5, index: 3, name: { es: 'Fuegos artificiales', en: 'Fireworks' }, stadium: 'final', pitcher: 'ciclon', goal: { type: 'targets', n: 3 }, limit: { type: 'outs', n: 12 }, stars: [{ type: 'outsLeft', n: 4 }, { type: 'longestHR', ft: 450 }], targets: [target(-30, 425, 13, 6, 'billboard'), target(0, 455, 17, 6.5, 'billboard'), target(30, 420, 13, 6, 'billboard')] },
  { id: '5-4', chapter: 5, index: 4, name: { es: 'Sin red', en: 'No Net' }, stadium: 'final', pitcher: 'ciclon', goal: { type: 'streak', n: 5 }, limit: { type: 'outs', n: 12 }, stars: [{ type: 'outsLeft', n: 5 }, { type: 'barrels', n: 5 }] },
  { id: '5-5', chapter: 5, index: 5, name: { es: 'Gran Final', en: 'Grand Final' }, stadium: 'final', pitcher: 'ciclon', goal: { type: 'homeRuns', n: 10 }, limit: { type: 'time', seconds: 90 }, stars: [{ type: 'homeRuns', n: 14 }, { type: 'longestHR', ft: 480 }], boss: true, tip: TIP.timed },
];

export const MAX_STARS = STAGES.length * 3;

export const BATS: BatDef[] = [
  { id: 'fresno', name: { es: 'Fresno clásico', en: 'Classic Ash' }, starsRequired: 0, wood: '#d9b382', grip: '#3d2b1f', trail: '#ffffff' },
  { id: 'arce', name: { es: 'Arce oscuro', en: 'Dark Maple' }, starsRequired: 8, wood: '#5a3825', grip: '#111111', trail: '#ffb703' },
  { id: 'neon', name: { es: 'Neón', en: 'Neon' }, starsRequired: 20, wood: '#2b2d42', grip: '#00f5d4', trail: '#00f5d4' },
  { id: 'oro', name: { es: 'Bate de oro', en: 'Golden Bat' }, starsRequired: 40, wood: '#e9b949', grip: '#7a4f01', trail: '#ffd60a' },
  { id: 'cometa', name: { es: 'Cometa', en: 'Comet' }, starsRequired: 60, wood: '#14213d', grip: '#fca311', trail: '#ff006e' },
  { id: 'leyenda', name: { es: 'Leyenda', en: 'Legend' }, starsRequired: 75, wood: '#f8f9fa', grip: '#d00000', trail: '#9d4edd' },
];

export function stageById(id: string): StageDef | undefined {
  return STAGES.find((s) => s.id === id);
}
