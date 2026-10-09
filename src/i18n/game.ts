import type { ContactQuality, GoalDef, Lang, LimitDef, PitchPlan, Settings, StarCondition, SwingEvaluation, TimingLabel } from '../contracts';
import { FT, MPH } from '../config/constants';
import { PITCH_TYPES } from '../config/pitches';

/**
 * Dynamic, game-generated text (goals, stars, results, coaching). Static UI
 * chrome lives in src/ui/strings.ts. Spanish is the primary voice of the game:
 * home-run calls follow Latin-American broadcast tradition.
 */
type Units = Settings['units'];

export function dist(m: number, units: Units): string {
  return units === 'metric' ? `${Math.round(m)} m` : `${Math.round(m / FT)} ft`;
}

export function distFt(ft: number, units: Units): string {
  return dist(ft * FT, units);
}

export function speed(ms: number, units: Units): string {
  return units === 'metric' ? `${Math.round(ms * 3.6)} km/h` : `${Math.round(ms / MPH)} mph`;
}

export function speedMph(mph: number, units: Units): string {
  return speed(mph * MPH, units);
}

const T = {
  es: {
    goal: {
      hits: (n: number) => `Conecta ${n} hits`,
      homeRuns: (n: number) => (n === 1 ? 'Batea 1 jonrón' : `Batea ${n} jonrones`),
      distance: (d: string) => `Batea una bola de ${d} o más`,
      targets: (n: number) => `Acierta ${n} dianas`,
      streak: (n: number) => `${n} jonrones seguidos`,
    },
    goalLabel: { hits: 'Hits', homeRuns: 'Jonrones', distance: 'Mejor batazo', targets: 'Dianas', streak: 'Racha' },
    limitOuts: (n: number) => `Tienes ${n} outs · cada swing sin éxito o strike cantado es un out`,
    limitTime: (s: number) => `${s} segundos · el reloj solo corre mientras el lanzador trabaja`,
    star: {
      outsLeft: (n: number) => `Termina con ${n}+ outs de sobra`,
      timeLeft: (s: number) => `Termina con ${s}+ s de sobra`,
      longestHR: (d: string) => `Jonrón de ${d}+`,
      barrels: (n: number) => `${n} barrels (contacto perfecto)`,
      maxEV: (v: string) => `Velocidad de salida de ${v}+`,
      homeRuns: (n: number) => `${n}+ jonrones`,
      noWhiffs: () => 'Sin abanicar ni una vez',
    },
    complete: 'Completa el objetivo',
    result: { homeRun: '¡JONRÓN!', hit: '¡HIT!', out: 'OUT', foul: 'FOUL', whiff: 'SWING Y FALLO', calledStrike: '¡STRIKE!', ball: 'BOLA' },
    timing: { perfect: 'PERFECTO', good: 'BIEN', early: 'TEMPRANO', late: 'TARDE' } as Record<TimingLabel, string>,
    quality: { barrel: 'BARREL', solid: 'SÓLIDO', flare: 'BLOOP', weak: 'DÉBIL', topped: 'RODADO', under: 'POR DEBAJO' } as Record<ContactQuality, string>,
    stat: { ev: 'Salida', la: 'Ángulo', dist: 'Distancia', hang: 'Vuelo' },
    hrCalls: ['¡SE FUE!', '¡ADIÓS, PELOTA!', '¡LA SACÓ DEL PARQUE!', '¡CUADRANGULAR!', '¡VUELA, VUELA… Y SE FUE!', '¡BOTÓ LA PELOTA!'],
    bonusOut: '+1 OUT',
    bonusTime: '+5 S',
    target: 'DIANA',
    streak: (n: number) => `RACHA x${n}`,
    controlsPro: 'Mouse: mueve el círculo · Clic o Espacio: batear · Clic derecho o Shift: swing de potencia · Esc: pausa',
    controlsCasual: 'Clic o Espacio: batear (el círculo apunta solo) · Clic derecho o Shift: swing de potencia · Esc: pausa',
    controlsTouch: 'Desliza el dedo: mueve el círculo · BATEAR: swing · POTENCIA: swing fuerte',
    controlsTouchCasual: 'Toca BATEAR en el momento justo (el círculo apunta solo) · POTENCIA: swing fuerte',
    hand: { R: 'Derecho', L: 'Zurdo' },
    practice: 'Práctica',
    derby: 'Derby',
    derbyRules: '10 outs. Cualquier swing que no sea jonrón es un out; los strikes cantados también. Cada jonrón de 440 ft (134 m) o más te regala un out extra.',
    stageCleared: '¡ETAPA SUPERADA!',
    stageFailed: 'Casi…',
    stageFailedSub: 'Se acabaron los outs. ¡Otra vez!',
    stageClearedSub: (n: number) => (n === 3 ? 'Perfecto: tres estrellas.' : `${n} de 3 estrellas`),
    derbyOver: 'FIN DEL DERBY',
    derbyNewBest: '¡Nuevo récord!',
    derbyScore: (hr: number) => `${hr} jonrones`,
    newBat: (name: string) => `Nuevo bate: ${name}`,
    share: (txt: string) => `${txt} — ¿Me superas en JONRÓN?`,
    copied: 'Copiado al portapapeles',
    statsLabels: { hr: 'Jonrones', longest: 'Más largo', maxEv: 'Máx. salida', barrels: 'Barrels', swings: 'Swings', hits: 'Hits' },
    goalShort: 'Objetivo',
    goalMet: '¡OBJETIVO CUMPLIDO!',
    timeUp: '¡TIEMPO!',
    lastOut: 'ÚLTIMO OUT',
    tipFirst: 'Mueve el mouse para llevar el círculo hasta la bola. La zona dorada te muestra más o menos por dónde va a pasar. Haz clic (o pulsa Espacio) justo antes de que llegue.',
    tipFirstCasual: 'El círculo apunta solo: tú solo eliges el momento. Haz clic (o pulsa Espacio) justo antes de que la bola llegue.',
    tipFirstTouch: 'Desliza el dedo por la pantalla para llevar el círculo hasta la bola. La zona dorada te muestra más o menos por dónde va a pasar. Toca BATEAR justo antes de que llegue. Se juega mejor con el teléfono en horizontal.',
    tipFirstTouchCasual: 'El círculo apunta solo: tú solo eliges el momento. Toca BATEAR justo antes de que la bola llegue. Se juega mejor con el teléfono en horizontal.',
    pitchMph: (name: string, v: string) => `${name} · ${v}`,
    paused: 'Pausa',
    peakOn: '¡PEAK MÁXIMO!',
    peakOff: 'Se acabó el peak',
    fanName: 'iluvkiwiss',
    fanBoard: 'ILUVKIWISS ♥ EL MORO',
    fanCheers: ['¡Tú puedes, mi amor!', '¡Sácala del parque, bebé!', '¡Eres el mejor, mi rey!', '¡Te amo, Morito!', '¡Hazlo por nosotros!'],
    abilityHint: 'E: peak máximo',
    loading: 'Preparando el estadio…',
    resetDone: 'Progreso borrado',
    calibrated: (ms: number) => `Latencia ajustada a ${ms > 0 ? '+' : ''}${ms} ms`,
  },
  en: {
    goal: {
      hits: (n: number) => `Get ${n} hits`,
      homeRuns: (n: number) => (n === 1 ? 'Hit 1 home run' : `Hit ${n} home runs`),
      distance: (d: string) => `Hit one ${d} or farther`,
      targets: (n: number) => `Hit ${n} targets`,
      streak: (n: number) => `${n} home runs in a row`,
    },
    goalLabel: { hits: 'Hits', homeRuns: 'Home runs', distance: 'Longest', targets: 'Targets', streak: 'Streak' },
    limitOuts: (n: number) => `You have ${n} outs · any unsuccessful swing or called strike is an out`,
    limitTime: (s: number) => `${s} seconds · the clock only runs while the pitcher works`,
    star: {
      outsLeft: (n: number) => `Finish with ${n}+ outs to spare`,
      timeLeft: (s: number) => `Finish with ${s}+ s to spare`,
      longestHR: (d: string) => `A ${d}+ home run`,
      barrels: (n: number) => `${n} barrels (perfect contact)`,
      maxEV: (v: string) => `Exit velocity of ${v}+`,
      homeRuns: (n: number) => `${n}+ home runs`,
      noWhiffs: () => 'Never swing and miss',
    },
    complete: 'Complete the goal',
    result: { homeRun: 'HOME RUN!', hit: 'BASE HIT!', out: 'OUT', foul: 'FOUL', whiff: 'SWING & MISS', calledStrike: 'STRIKE!', ball: 'BALL' },
    timing: { perfect: 'PERFECT', good: 'GOOD', early: 'EARLY', late: 'LATE' } as Record<TimingLabel, string>,
    quality: { barrel: 'BARREL', solid: 'SOLID', flare: 'BLOOP', weak: 'WEAK', topped: 'TOPPED', under: 'UNDER' } as Record<ContactQuality, string>,
    stat: { ev: 'Exit velo', la: 'Launch', dist: 'Distance', hang: 'Hang' },
    hrCalls: ['GONE!', 'SEE YA!', 'OUTTA HERE!', 'GOODBYE BASEBALL!', 'BACK, BACK… GONE!', 'NO DOUBTER!'],
    bonusOut: '+1 OUT',
    bonusTime: '+5 S',
    target: 'TARGET',
    streak: (n: number) => `STREAK x${n}`,
    controlsPro: 'Mouse: move the circle · Click or Space: swing · Right-click or Shift: power swing · Esc: pause',
    controlsCasual: 'Click or Space: swing (the circle aims itself) · Right-click or Shift: power swing · Esc: pause',
    controlsTouch: 'Slide your finger: move the circle · SWING: swing · POWER: big swing',
    controlsTouchCasual: 'Tap SWING at the right moment (the circle aims itself) · POWER: big swing',
    hand: { R: 'Righty', L: 'Lefty' },
    practice: 'Practice',
    derby: 'Derby',
    derbyRules: '10 outs. Any swing that is not a home run is an out, called strikes too. Every home run of 440 ft (134 m) or more earns a bonus out.',
    stageCleared: 'STAGE CLEARED!',
    stageFailed: 'So close…',
    stageFailedSub: 'Out of outs. Run it back!',
    stageClearedSub: (n: number) => (n === 3 ? 'Perfect: three stars.' : `${n} of 3 stars`),
    derbyOver: 'DERBY OVER',
    derbyNewBest: 'New record!',
    derbyScore: (hr: number) => `${hr} home runs`,
    newBat: (name: string) => `New bat: ${name}`,
    share: (txt: string) => `${txt} — Can you beat me in JONRÓN?`,
    copied: 'Copied to clipboard',
    statsLabels: { hr: 'Home runs', longest: 'Longest', maxEv: 'Max exit velo', barrels: 'Barrels', swings: 'Swings', hits: 'Hits' },
    goalShort: 'Goal',
    goalMet: 'GOAL COMPLETE!',
    timeUp: 'TIME!',
    peakOn: 'MAX PEAK!',
    peakOff: 'Peak is over',
    fanName: 'iluvkiwiss',
    fanBoard: 'ILUVKIWISS ♥ EL MORO',
    fanCheers: ['You got this, babe!', 'Hit it out of the park, honey!', 'You’re the best, my king!', 'Love you, Morito!', 'Do it for us!'],
    abilityHint: 'E: max peak',
    lastOut: 'LAST OUT',
    tipFirst: 'Move the mouse to bring the circle to the ball. The gold area shows roughly where it will cross. Click (or press Space) just before it arrives.',
    tipFirstCasual: 'The circle aims itself: you just pick the moment. Click (or press Space) just before the ball arrives.',
    tipFirstTouch: 'Slide your finger across the screen to bring the circle to the ball. The gold area shows roughly where it will cross. Tap SWING just before it arrives. Best played with your phone sideways.',
    tipFirstTouchCasual: 'The circle aims itself: you just pick the moment. Tap SWING just before the ball arrives. Best played with your phone sideways.',
    pitchMph: (name: string, v: string) => `${name} · ${v}`,
    paused: 'Paused',
    loading: 'Getting the ballpark ready…',
    resetDone: 'Progress reset',
    calibrated: (ms: number) => `Latency set to ${ms > 0 ? '+' : ''}${ms} ms`,
  },
};

export type GameText = (typeof T)['es'];
export function gameText(lang: Lang): GameText {
  return T[lang] as GameText;
}

export function goalText(g: GoalDef, lang: Lang, units: Units): string {
  const t = gameText(lang).goal;
  switch (g.type) {
    case 'hits':
      return t.hits(g.n);
    case 'homeRuns':
      return t.homeRuns(g.n);
    case 'distance':
      return t.distance(distFt(g.ft, units));
    case 'targets':
      return t.targets(g.n);
    case 'streak':
      return t.streak(g.n);
  }
}

export function limitText(l: LimitDef, lang: Lang): string {
  const t = gameText(lang);
  return l.type === 'outs' ? t.limitOuts(l.n) : t.limitTime(l.seconds);
}

export function starText(c: StarCondition, lang: Lang, units: Units): string {
  const t = gameText(lang).star;
  switch (c.type) {
    case 'outsLeft':
      return t.outsLeft(c.n);
    case 'timeLeft':
      return t.timeLeft(c.seconds);
    case 'longestHR':
      return t.longestHR(distFt(c.ft, units));
    case 'barrels':
      return t.barrels(c.n);
    case 'maxEV':
      return t.maxEV(speedMph(c.mph, units));
    case 'homeRuns':
      return t.homeRuns(c.n);
    case 'noWhiffs':
      return t.noWhiffs();
  }
}

export function pitchLine(plan: PitchPlan, lang: Lang, units: Units): string {
  return gameText(lang).pitchMph(PITCH_TYPES[plan.type].name[lang], speedMph(plan.speedMph, units));
}

/**
 * One-line coaching: explains WHY the result happened in terms of the two
 * skills (when + where), so every swing teaches something.
 */
export function coachLine(ev: SwingEvaluation, plan: PitchPlan, lang: Lang, batter: 'R' | 'L'): string {
  const es = lang === 'es';
  const ms = Math.round(Math.abs(ev.timingMs));
  if (ev.kind === 'whiff') {
    if (ev.missedBy === 'timing') {
      return ev.timingMs < 0
        ? es
          ? `Muy temprano (${ms} ms): espera más la bola${plan.type === 'CH' || plan.type === 'CU' || plan.type === 'FS' ? ', era un lanzamiento lento' : ''}.`
          : `Way early (${ms} ms): wait longer${plan.type === 'CH' || plan.type === 'CU' || plan.type === 'FS' ? ', that was off-speed' : ''}.`
        : es
          ? `Muy tarde (${ms} ms): empieza el swing antes.`
          : `Way late (${ms} ms): start your swing sooner.`;
    }
    const dy = plan.plateCross.y - 0.78;
    const vertical = Math.abs(dy) > 0.12;
    if (vertical) return es ? `La bola pasó ${dy > 0 ? 'por encima' : 'por debajo'} del círculo. Ajusta la altura.` : `The ball went ${dy > 0 ? 'over' : 'under'} your circle. Adjust the height.`;
    const away = batter === 'R' ? plan.plateCross.x < 0 : plan.plateCross.x > 0;
    return es ? `La bola pasó por ${away ? 'afuera' : 'adentro'}: mueve el círculo hacia ella.` : `The ball was ${away ? 'away' : 'inside'}: move the circle to it.`;
  }
  const b = ev.ball;
  const parts: string[] = [];
  if (ev.timing === 'perfect') parts.push(es ? 'Timing perfecto' : 'Perfect timing');
  else if (ev.timing === 'good') parts.push(es ? `Buen timing (${ms} ms ${ev.timingMs < 0 ? 'antes' : 'después'})` : `Good timing (${ms} ms ${ev.timingMs < 0 ? 'early' : 'late'})`);
  else if (ev.timingMs < 0) parts.push(es ? `Llegaste ${ms} ms temprano → la halaste` : `${ms} ms early → you pulled it`);
  else parts.push(es ? `Llegaste ${ms} ms tarde → al lado contrario` : `${ms} ms late → went the other way`);
  const la = b.launchAngleDeg;
  if (la > 42) parts.push(es ? 'le diste muy por debajo: elevado alto' : 'you got too far under it: pop-up');
  else if (la < 8) parts.push(es ? 'le diste por encima: rodado' : 'you topped it: grounder');
  else if (la >= 22 && la <= 36) parts.push(es ? 'ángulo ideal para jonrón' : 'ideal home-run angle');
  else if (la < 22) parts.push(es ? 'línea: apunta un poco más abajo de la bola para elevarla' : 'line drive: aim a bit lower to lift it');
  else parts.push(es ? 'buen vuelo, un poco alto' : 'good loft, a bit high');
  if (b.outcome === 'foul') parts.push(es ? 'pero salió de foul' : 'but it hooked foul');
  return `${parts.join(', ')}.`;
}

export function controlsText(mode: Settings['controlMode'], touch: boolean, lang: Lang): string {
  const t = gameText(lang);
  if (touch) return t.controlsTouch;
  return mode === 'pro' ? t.controlsPro : t.controlsCasual;
}
