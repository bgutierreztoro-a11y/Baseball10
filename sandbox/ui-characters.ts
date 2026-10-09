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

const pct = (k: number): string => (Math.abs(k - 1) < 0.005 ? (lang === 'es' ? 'Base' : 'Base') : `${k > 1 ? '+' : '−'}${Math.round(Math.abs(k - 1) * 100)} %`);
const fmtH = (m: number): string => (lang === 'es' ? `${m.toFixed(2).replace('.', ',')} m` : `${m.toFixed(2)} m`);
let selected = (q.get('sel') ?? 'moro') as CharacterId;

function vm(): CharactersVM {
  return {
    items: CHARACTERS.map((c) => ({
      id: c.id,
      name: c.name,
      title: c.title[lang],
      bio: c.bio[lang],
      height: fmtH(c.look.heightM),
      look: c.look,
      stats: [
        { label: lang === 'es' ? 'Contacto' : 'Contact', value: Math.min(1, 0.5 * c.mods.pci.contact), detail: pct(c.mods.pci.contact) },
        { label: lang === 'es' ? 'Poder' : 'Power', value: Math.min(1, 0.5 * c.mods.bat.power * (c.mods.pci.power) ** 0.3), detail: pct(c.mods.bat.power) },
        { label: lang === 'es' ? 'Alcance del círculo' : 'Circle reach', value: Math.min(1, 0.5 * c.mods.pci.power), detail: pct(c.mods.pci.power) },
      ],
      ability: c.ability ? { name: c.ability.name[lang], description: c.ability.description[lang] } : null,
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
  });
}

function title(): void {
  const c = CHARACTERS.find((x) => x.id === selected)!;
  ui.showTitle(
    { totalStars: 12, maxStars: 75, derbyBest: '1.284 ft', continueLabel: q.get('cont') === '0' ? null : '1-3 · Tiro al blanco', characterName: c.name },
    { onContinue: () => log('continue'), onCampaign: () => log('campaign'), onPractice: () => log('practice'), onDerby: () => log('derby'), onSettings: () => log('settings'), onCharacters: () => chars() },
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

const screen = q.get('screen') ?? 'chars';
if (screen === 'portraits') portraits();
else if (screen === 'title') title();
else if (screen === 'hud') hud();
else chars();
