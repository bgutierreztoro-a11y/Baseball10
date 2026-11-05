// UI QA harness for the batter select screen, title chip and HUD ability button.
// ?screen=chars|title|hud &lang=es|en &touch=1 &state=ready|active|used|none &sel=moro &hit=1
import { createUI } from '../src/ui/index';
import { batterPortrait } from '../src/ui/portrait';
import { CHARACTERS } from '../src/config/characters';
import type { CharacterId, Lang } from '../src/contracts';
import type { CharactersVM, HudVM } from '../src/ui/api';

const q = new URLSearchParams(location.search);
const lang = (q.get('lang') ?? 'es') as Lang;
const touch = q.get('touch') === '1';
const ui = createUI(document.getElementById('ui')!, lang);
ui.setTouchMode(touch);
const log = (...a: unknown[]): void => console.log('[ui]', ...a);
(window as unknown as { __ui: typeof ui }).__ui = ui;

const stat = (label: string, r: number) => ({ label, value: Math.max(0.04, Math.min(1, r / 20)), detail: String(r), tone: r > 10 ? ('up' as const) : r < 10 ? ('down' as const) : ('base' as const) });
const fmtH = (m: number): string => (lang === 'es' ? `${m.toFixed(2).replace('.', ',')} m` : `${m.toFixed(2)} m`);
let selected = (q.get('sel') ?? 'moro') as CharacterId;

function vm(): CharactersVM {
  return {
    canCreate: true,
    items: CHARACTERS.map((c) => ({
      id: c.id,
      name: c.name,
      title: c.title[lang],
      bio: c.bio[lang],
      height: fmtH(c.look.heightM),
      look: c.look,
      stats: [
        stat(lang === 'es' ? 'Visión' : 'Vision', c.ratings.vision),
        stat(lang === 'es' ? 'Contacto' : 'Contact', c.ratings.contact),
        stat(lang === 'es' ? 'Poder' : 'Power', c.ratings.power),
      ],
      ability: c.ability ? { name: c.ability.name[lang], description: c.ability.description[lang] } : c.trait ? { name: c.trait.name[lang], description: c.trait.description[lang] } : null,
      selected: c.id === selected,
    })),
  };
}

function chars(): void {
  ui.showCharacters(vm(), {
    onSelect: (id) => {
      log('select', id);
      selected = id;
      chars();
    },
    onBack: () => {
      log('back');
      title();
    },
    onCreate: () => log('create'),
    onEdit: (id) => log('edit', id),
    onDelete: (id) => log('delete', id),
  });
}

function title(): void {
  const c = CHARACTERS.find((x) => x.id === selected)!;
  ui.showTitle(
    { totalStars: 12, maxStars: 75, derbyBest: '1.284 ft', continueLabel: q.get('cont') === '0' ? null : '1-3 · Tiro al blanco', characterName: c.name, coins: 640, daily: { label: 'Desafío #5 · Lluvia de jonrones', done: false, streak: 3 } },
    { onContinue: () => log('continue'), onCampaign: () => log('campaign'), onPractice: () => log('practice'), onDerby: () => log('derby'), onSettings: () => log('settings'), onCharacters: () => chars(), onGame: () => log('game'), onDaily: () => log('daily'), onStudio: () => log('studio') },
  );
}

function hud(): void {
  const st = q.get('state') ?? 'ready';
  const base: HudVM = {
    mode: 'campaign',
    stageLabel: '1-3 · Tiro al blanco',
    goalText: lang === 'es' ? 'Jonrones|2/5' : 'Home runs|2/5',
    progress: 0.4,
    outs: { left: 2, total: 3 },
    timeLeft: q.get('time') === '1' ? 42 : null,
    streak: 3,
    score: null,
    powerOn: false,
    controlHint: touch ? (lang === 'es' ? 'Arrastra para apuntar · BATEAR para hacer swing' : 'Drag to aim · SWING to swing') : lang === 'es' ? 'Ratón: apuntar · Clic/Espacio: batear · Q: potencia · E: Peak máximo' : 'Mouse: aim · Click/Space: swing · Q: power · E: Max Peak',
    ability: st === 'none' ? null : { label: lang === 'es' ? 'Peak máximo' : 'Max Peak', state: st as 'ready' | 'active' | 'used', pitchesLeft: st === 'active' ? Number(q.get('left') ?? 3) : null, keyHint: 'E' },
  };
  ui.showHUD(base, {
    onPause: () => log('pause'),
    onSwing: (t) => log('swing', t),
    onPowerToggle: (on) => log('power', on),
    onRunAdvance: () => log('run'),
    onRunBack: () => log('back'),
    onAbility: () => {
      log('ability');
      if (base.ability?.state === 'ready') ui.updateHUD({ ...base, ability: { ...base.ability, state: 'active', pitchesLeft: 3 } });
    },
  });
  if (q.get('pitch') === '1') ui.showPitchLabel('Recta 4 costuras · 94 mph');
  if (q.get('hit') === '1') {
    ui.showHitCard({
      result: 'homeRun',
      title: '¡JONRÓN!',
      stats: [
        { label: 'Salida', value: '108 mph' },
        { label: 'Ángulo', value: '27°' },
        { label: 'Distancia', value: '421 ft' },
        { label: 'Vuelo', value: '5,2 s' },
      ],
      timing: { label: 'Perfecto', ms: 4, tone: 'perfect' },
      quality: { label: 'Barrel', tone: 'barrel' },
      coach: 'Le diste justo en el punto dulce y a tiempo: así se va.',
      pitch: 'Recta 4 costuras · 94 mph',
      badges: [],
    });
  }
  if (q.get('tip') === '1') ui.showTip('Pulsa E para activar el Peak máximo cuando venga una recta.');
}

function portraits(): void {
  // Close-up gallery of the procedural portraits at several aspects.
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:fixed;inset:0;display:grid;grid-template-columns:repeat(${q.get('cols') ?? 4},1fr);gap:8px;padding:8px;background:#0b1426;overflow:auto;z-index:9`;
  for (const aspect of (q.get('aspects') ?? '1.2').split(',').map(Number)) {
    for (const c of CHARACTERS) {
      const box = document.createElement('div');
      box.style.cssText = `position:relative;aspect-ratio:${aspect};overflow:hidden;border-radius:12px`;
      const svg = batterPortrait(c.look);
      svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      box.append(svg);
      wrap.append(box);
    }
  }
  document.body.append(wrap);
}

function results(): void {
  ui.showResults(
    {
      mode: 'game',
      success: true,
      title: lang === 'es' ? '¡GANASTE EL PARTIDO!' : 'YOU WON THE GAME!',
      subtitle: '4-2 contra Los Ramiros',
      stars: 0,
      newStars: 0,
      starTexts: ['', '', ''],
      starsMet: [false, false, false],
      stats: [
        { label: 'Carreras', value: '4' },
        { label: 'Hits', value: '5' },
        { label: 'Impulsadas', value: '3' },
        { label: 'AVG', value: '.455' },
        { label: 'Jonrones', value: '1' },
        { label: 'Ponches', value: '2' },
      ],
      unlocks: [],
      canNext: false,
      shareText: '',
      linescore: { away: 'RAM', home: 'TÚ', awayLine: [1, 0, 1], homeLine: [0, 3, null], awayTotal: 2, homeTotal: 4 },
      coins: {
        lines: [
          { label: 'Jonrones', amount: 5 },
          { label: 'Hits', amount: 8 },
          { label: 'Victoria', amount: 120 },
          { label: 'Carreras anotadas', amount: 32 },
          { label: 'Bases extra corriendo', amount: 10 },
        ],
        total: 175,
        balance: 815,
        canDouble: q.get('dbl') !== '0',
        doubled: q.get('dbl') === '0',
      },
    },
    { onRetry: () => log('retry'), onNext: () => log('next'), onMenu: () => log('menu'), onShare: () => log('share'), onDoubleCoins: () => log('double') },
  );
}

function setup(): void {
  ui.showGameSetup(
    {
      rivals: [
        { id: 'ramiros', name: 'Los Ramiros', short: 'RAM', difficulty: 'easy', taunt: '«Hola, soy iluvkiwiss… digo, Ramiro»', jersey: '#ff6fb5', trim: '#ffffff' },
        { id: 'pollos', name: 'Pollos Furiosos', short: 'POL', difficulty: 'easy', taunt: '«¡Cocorocóóó!»', jersey: '#f7d117', trim: '#d9262c' },
        { id: 'mandem', name: 'Mandem FC', short: 'MDM', difficulty: 'normal', taunt: '«Wagwan, ¿eso fue un swing?»', jersey: '#8a8f98', trim: '#111111' },
        { id: 'mamados', name: 'Los Mamados del Iron Paradise', short: 'IRN', difficulty: 'hard', taunt: '«¡Lightweight, baby!»', jersey: '#15161b', trim: '#ffc21a' },
      ],
      stadiums: [
        { id: 'solar', name: 'El Solar', locked: false },
        { id: 'malecon', name: 'Malecón', locked: false },
      ],
      innings: [1, 3, 5],
      initial: { stadium: 'malecon', rival: 'ramiros', innings: 3 },
      rules: '',
    },
    { onStart: (c) => log('start', c), onBack: () => log('back') },
  );
}

function gameHud(): void {
  const base: HudVM = {
    mode: 'game',
    stageLabel: 'Partido · Los Ramiros',
    goalText: '▼2|1-1',
    progress: 0.4,
    outs: null,
    timeLeft: null,
    streak: null,
    score: null,
    powerOn: false,
    controlHint: null,
    ability: null,
    scorebug: { away: 'RAM', home: 'TÚ', awayRuns: 1, homeRuns: 1, inning: '▼2', balls: 2, strikes: 1, outs: 1, bases: [true, false, true] },
    run: q.get('run') === '0' ? null : { coach: (q.get('coach') ?? 'go') as 'go' | 'risky' | 'hold', coachText: '¡SIGUE, SIGUE!', coachWho: 'Coach de tercera', primary: q.get('slide') === '1' ? '¡BÁRRETE!' : '¡CORRE!', slide: q.get('slide') === '1', back: 'REGRESA', hint: 'Espacio / clic: ¡corre a la siguiente! · Shift / clic derecho: regresa · Bárrete cuando venga el tiro' },
  };
  ui.showHUD(base, { onPause: () => log('pause'), onSwing: () => log('swing'), onPowerToggle: () => {}, onAbility: () => {}, onRunAdvance: () => log('run'), onRunBack: () => log('back') });
}

const screen = q.get('screen') ?? 'chars';
if (screen === 'results') results();
else if (screen === 'setup') setup();
else if (screen === 'gamehud') gameHud();
else if (screen === 'portraits') portraits();
else if (screen === 'title') title();
else if (screen === 'hud') hud();
else chars();
