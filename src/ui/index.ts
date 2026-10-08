import './styles.css';
import type { Lang, PitchTypeId, Settings, StadiumId } from '../contracts';
import type {
  CalibrationHandlers,
  CalloutStyle,
  CampaignHandlers,
  CampaignVM,
  CreateUI,
  DerbySetupVM,
  HitCardVM,
  HudHandlers,
  HudVM,
  PauseHandlers,
  PracticeConfig,
  PracticeVM,
  ResultsHandlers,
  ResultsVM,
  SettingsHandlers,
  StageIntroVM,
  TitleHandlers,
  TitleVM,
  UI,
} from './api';
import { STRINGS, fmt, type StringKey } from './strings';

/**
 * DOM overlay UI (vanilla TS). Every node is built with textContent — no
 * innerHTML with data — and every action is a real <button>, so keyboard and
 * screen-reader users get the whole game.
 */

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(viewBox: string, cls: string, paths: { d: string; fill?: string; stroke?: string; sw?: number }[]): SVGSVGElement {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', viewBox);
  s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true');
  for (const p of paths) {
    const e = document.createElementNS(SVG_NS, 'path');
    e.setAttribute('d', p.d);
    e.setAttribute('fill', p.fill ?? 'currentColor');
    if (p.stroke) {
      e.setAttribute('stroke', p.stroke);
      e.setAttribute('stroke-width', String(p.sw ?? 2));
      e.setAttribute('stroke-linecap', 'round');
    }
    s.append(e);
  }
  return s;
}

const starIcon = (on: boolean, extra = ''): SVGSVGElement =>
  svg('0 0 24 24', `star ${on ? 'on' : ''} ${extra}`, [{ d: 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z' }]);
const lockIcon = (): SVGSVGElement => svg('0 0 24 24', 'star', [{ d: 'M7 10V7a5 5 0 0110 0v3h1a1 1 0 011 1v9a1 1 0 01-1 1H6a1 1 0 01-1-1v-9a1 1 0 011-1h1zm2 0h6V7a3 3 0 00-6 0v3z' }]);
const whistleIcon = (): SVGSVGElement => svg('0 0 24 24', '', [{ d: 'M3 10a6 6 0 0011.2 3H21V8H9.5A6 6 0 003 10zm6 2a2 2 0 110-4 2 2 0 010 4zM14 5h3v2h-3z' }]);
const crownIcon = (): SVGSVGElement => svg('0 0 24 24', 'star on', [{ d: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z' }]);
const pauseIcon = (): SVGSVGElement => svg('0 0 24 24', '', [{ d: 'M7 5h4v14H7zM13 5h4v14h-4z' }]);
const backIcon = (): SVGSVGElement => svg('0 0 24 24', '', [{ d: 'M15 5l-7 7 7 7', fill: 'none', stroke: 'currentColor', sw: 2.5 }]);

/** Baseball icon with red stitches (brand mark). */
function ballIcon(): SVGSVGElement {
  const s = svg('0 0 100 100', 'ball-icon', [
    { d: 'M50 4a46 46 0 110 92 46 46 0 010-92z', fill: '#f4f1e8' },
    { d: 'M27 12c9 12 12 26 10 38s-8 25-19 34', fill: 'none', stroke: '#d7263d', sw: 3.2 },
    { d: 'M73 12c-9 12-12 26-10 38s8 25 19 34', fill: 'none', stroke: '#d7263d', sw: 3.2 },
  ]);
  for (let i = 0; i < 8; i++) {
    for (const side of [-1, 1]) {
      const y = 18 + i * 8.5;
      const x = side < 0 ? 31 + Math.sin(i / 2.4) * 4 - 2 : 69 - Math.sin(i / 2.4) * 4 + 2;
      const l = document.createElementNS(SVG_NS, 'path');
      l.setAttribute('d', `M${x - 4} ${y - 2}l4 3 4-3`);
      l.setAttribute('fill', 'none');
      l.setAttribute('stroke', '#d7263d');
      l.setAttribute('stroke-width', '2');
      s.append(l);
    }
  }
  return s;
}

function stars(n: number, total = 3): HTMLElement {
  const el = h('span', { class: 'stars', role: 'img', 'aria-label': `${n}/${total}` });
  for (let i = 0; i < total; i++) el.append(starIcon(i < n));
  return el;
}

class DomUI implements UI {
  readonly root: HTMLElement;
  private lang: Lang;
  private readonly screenLayer: HTMLElement;
  private readonly hudLayer: HTMLElement;
  private readonly overlayLayer: HTMLElement;
  private readonly fxLayer: HTMLElement;
  private readonly live: HTMLElement;
  private touch = false;
  private escHandler: (() => void) | null = null;
  private hud: {
    chipTag: HTMLElement;
    chipText: HTMLElement;
    goal: HTMLElement;
    goalNum: HTMLElement;
    bar: HTMLElement;
    right: HTMLElement;
    hint: HTMLElement;
    pitch: HTMLElement;
    power: HTMLButtonElement | null;
    onPause: () => void;
    last: HudVM | null;
  } | null = null;
  private hitCard: HTMLElement | null = null;
  private tipEl: HTMLElement | null = null;
  private hintTimer = 0;

  constructor(mount: HTMLElement, lang: Lang) {
    this.root = mount;
    this.lang = lang;
    mount.replaceChildren();
    this.screenLayer = h('div', { class: 'layer' });
    this.hudLayer = h('div', { class: 'layer' });
    this.fxLayer = h('div', { class: 'layer' });
    this.overlayLayer = h('div', { class: 'layer' });
    this.live = h('div', { class: 'sr-only', 'aria-live': 'polite', role: 'status' });
    mount.append(this.screenLayer, this.hudLayer, this.fxLayer, this.overlayLayer, this.live);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.escHandler) {
        e.stopPropagation();
        this.escHandler();
      }
    });
    this.setLanguage(lang);
  }

  private t(key: StringKey, values?: Record<string, string | number>): string {
    const s = STRINGS[this.lang][key];
    return values ? fmt(s, values) : s;
  }

  private announce(text: string): void {
    this.live.textContent = '';
    window.setTimeout(() => (this.live.textContent = text), 30);
  }

  private click(fn: () => void): EventListener {
    return (e: Event) => {
      e.stopPropagation();
      fn();
    };
  }

  setLanguage(lang: Lang): void {
    this.lang = lang;
    document.documentElement.lang = lang;
  }

  setTouchMode(touch: boolean): void {
    this.touch = touch;
  }

  private setScreen(el: HTMLElement | null, esc: (() => void) | null = null): void {
    this.screenLayer.replaceChildren(...(el ? [el] : []));
    this.escHandler = esc;
    const focusable = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('button:not([disabled])');
    if (focusable && !this.touch) window.setTimeout(() => focusable.focus({ preventScroll: true }), 50);
  }

  showLoading(label: string): void {
    const spinner = svg('0 0 50 50', 'spinner', [{ d: 'M25 5a20 20 0 0120 20', fill: 'none', stroke: '#d7263d', sw: 5 }]);
    this.setScreen(h('div', { class: 'screen loading' }, ballIcon(), spinner, h('div', { class: 'eyebrow' }, label)));
  }

  clear(): void {
    this.setScreen(null);
    this.hudLayer.replaceChildren();
    this.overlayLayer.replaceChildren();
    this.fxLayer.replaceChildren();
    this.hud = null;
    this.hitCard = null;
    this.tipEl = null;
  }

  // ── Title ──
  showTitle(vm: TitleVM, hd: TitleHandlers): void {
    this.clear();
    const menu = h('nav', { class: 'menu', 'aria-label': this.t('mainMenu') });
    if (vm.continueLabel) {
      menu.append(h('button', { class: 'btn btn-primary btn-lg', onclick: this.click(hd.onContinue), 'data-autofocus': true }, h('span', null, this.t('continue')), h('small', null, vm.continueLabel)));
    }
    menu.append(
      h('button', { class: `btn btn-lg ${vm.continueLabel ? '' : 'btn-primary'}`, onclick: this.click(hd.onCampaign) }, h('span', null, this.t('campaign')), h('small', null, this.t('campaignDesc'))),
      h('button', { class: 'btn', onclick: this.click(hd.onPractice) }, h('span', null, this.t('practice')), h('small', null, this.t('practiceDesc'))),
      h('button', { class: 'btn', onclick: this.click(hd.onDerby) }, h('span', null, this.t('derby')), h('small', null, this.t('derbyDesc'))),
      h('button', { class: 'btn btn-ghost', onclick: this.click(hd.onSettings) }, h('span', null, this.t('settings'))),
    );
    const meta = h(
      'div',
      { class: 'title-meta' },
      h('span', null, starIcon(true), ' ', h('b', { class: 'num' }, `${vm.totalStars}`), ` / ${vm.maxStars}`),
      vm.derbyBest ? h('span', null, `${this.t('derbyBest')}: `, h('b', { class: 'num' }, vm.derbyBest)) : null,
    );
    const word = h('h1', null, 'JONR', h('span', { class: 'acc' }, 'Ó'), 'N');
    this.setScreen(
      h(
        'section',
        { class: 'screen title', 'aria-label': 'JONRÓN' },
        h('div', { class: 'title-inner' }, h('div', { class: 'wordmark' }, ballIcon(), word), h('p', { class: 'tagline' }, this.t('tagline')), menu, meta),
      ),
    );
  }

  // ── Campaign ──
  showCampaign(vm: CampaignVM, hd: CampaignHandlers): void {
    this.clear();
    const tod = (t: string): string => (t === 'day' ? this.t('todDay') : t === 'sunset' ? this.t('todSunset') : this.t('todNight'));
    const chapters = h('div', { class: 'chapters', role: 'list' });
    let focusEl: HTMLElement | null = null;
    for (const ch of vm.chapters) {
      const nodes = h('ol', { class: 'nodes' });
      for (const st of ch.stages) {
        const isFocus = st.id === vm.focusStageId;
        const btn = h(
          'button',
          {
            class: `node ${st.boss ? 'boss' : ''} ${st.completed ? 'done' : ''} ${isFocus ? 'focus' : ''}`,
            disabled: st.locked,
            'aria-label': `${st.label} ${st.name}${st.locked ? ` — ${this.t('stageLocked')}` : ''}`,
            onclick: this.click(() => hd.onSelectStage(st.id)),
          },
          h('span', { class: 'badge num' }, st.locked ? lockIcon() : st.boss ? crownIcon() : st.label),
          h('span', { class: 'meta' }, h('span', null, st.name), h('span', { class: 'dim', style: 'font-size:13px' }, st.boss ? this.t('boss') : st.label)),
          st.locked ? null : stars(st.stars),
        );
        if (isFocus) focusEl = btn;
        nodes.append(h('li', null, btn));
      }
      chapters.append(
        h(
          'article',
          { class: `chapter panel ${ch.locked ? 'locked' : ''}`, role: 'listitem', style: `--accent:${ch.accent}` },
          h(
            'header',
            { class: 'chapter-head' },
            h('div', { class: 'eyebrow' }, `${this.t('chapter')} ${ch.number}`),
            h('div', { class: 'display' }, ch.name),
            h('div', { class: 'dim' }, ch.subtitle),
            h('div', { class: 'info', style: 'margin-top:6px' }, ch.info),
            h('span', { class: 'chip tod' }, tod(ch.timeOfDay)),
          ),
          nodes,
          h('footer', { class: 'chapter-foot' }, h('span', null, ch.locked ? this.t('chapterLocked') : this.t('stars')), h('span', { class: 'num' }, starIcon(true), ` ${ch.stars}/${ch.maxStars}`)),
        ),
      );
    }
    const locker = h('div', { class: 'locker panel' }, h('h3', null, this.t('batLocker')));
    for (const bat of vm.bats) {
      locker.append(
        h(
          'button',
          { class: 'bat', disabled: bat.locked, 'aria-pressed': bat.selected ? 'true' : 'false', onclick: this.click(() => hd.onSelectBat(bat.id)) },
          h('span', { class: 'swatch', style: `background:linear-gradient(90deg, ${bat.grip} 0 30%, ${bat.wood} 30% 100%)` }),
          h('span', null, bat.name, h('small', null, bat.locked ? this.t('batNeeds', { n: bat.starsRequired }) : bat.selected ? this.t('batInUse') : this.t('batEquip'))),
        ),
      );
    }
    const screen = h(
      'section',
      { class: 'screen scrim' },
      h(
        'div',
        { class: 'col' },
        h(
          'div',
          { class: 'topbar' },
          h('button', { class: 'btn btn-icon', 'aria-label': this.t('back'), onclick: this.click(hd.onBack) }, backIcon()),
          h('h2', null, this.t('campaign')),
          h('span', { class: 'chip num' }, starIcon(true), ` ${vm.totalStars} / ${vm.maxStars}`),
        ),
        chapters,
        locker,
      ),
    );
    this.setScreen(screen, hd.onBack);
    if (focusEl) {
      const f = focusEl as HTMLElement;
      window.setTimeout(() => {
        f.scrollIntoView({ block: 'nearest', inline: 'center' });
        if (!this.touch) f.focus({ preventScroll: true });
      }, 60);
    }
  }

  // ── Stage intro ──
  showStageIntro(vm: StageIntroVM, hd: { onStart(): void; onBack(): void }): void {
    this.clear();
    const p = vm.pitcher;
    const initials = p.nickname
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const arsenal = h('div', { class: 'chips' });
    for (const a of p.arsenal) arsenal.append(h('span', { class: 'chip' }, h('span', { class: 'dot', style: `background:${a.color}` }), `${a.name} · ${a.speed}`));
    const starList = h('ul', { class: 'starlist' });
    vm.starTexts.forEach((s, i) => starList.append(h('li', { class: vm.starsMet[i] ? 'met' : '' }, starIcon(vm.starsMet[i]), s)));
    const modal = h(
      'div',
      { class: 'modal panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'stage-title' },
      h(
        'div',
        null,
        h('div', { class: 'eyebrow' }, vm.boss ? h('span', { class: 'boss-badge' }, crownIcon(), this.t('bossStage')) : `${this.t('stage')} ${vm.label}`),
        h('h2', { id: 'stage-title' }, vm.name),
        h('div', { class: 'dim', style: 'margin-top:6px;font-weight:500' }, `${vm.stadiumName} · ${vm.stadiumInfo}`),
      ),
      h(
        'div',
        { class: 'row' },
        h(
          'section',
          { class: 'card' },
          h('h3', null, this.t('pitcher')),
          h(
            'div',
            { class: 'pitcher-id' },
            h('span', { class: 'avatar', style: `background:${p.jersey};border-color:${p.trim}` }, initials),
            h('div', null, h('div', { style: 'font:700 20px var(--f-body)' }, p.nickname), h('div', { class: 'dim' }, `${p.name} · ${p.handText}`)),
          ),
          h('h3', null, this.t('arsenal')),
          arsenal,
        ),
        h('section', { class: 'card' }, h('h3', null, this.t('goal')), h('div', { class: 'goal' }, vm.goal), h('div', { class: 'dim' }, vm.limit), h('h3', null, this.t('stars')), starList),
      ),
      vm.tip ? h('div', { class: 'tip' }, whistleIcon(), h('div', null, h('div', { class: 'eyebrow', style: 'color:var(--c-info)' }, this.t('coachTip')), vm.tip)) : null,
      h('div', { class: 'dim', style: 'font-size:14px' }, `${this.t('controls')}: ${vm.controls}`),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn btn-ghost', onclick: this.click(hd.onBack) }, this.t('back')),
        h('button', { class: 'btn btn-primary btn-lg', onclick: this.click(hd.onStart), 'data-autofocus': true }, this.t('letsBat')),
      ),
    );
    this.setScreen(h('section', { class: 'screen scrim center' }, modal), hd.onBack);
  }

  // ── Practice ──
  showPractice(vm: PracticeVM, hd: { onStart(cfg: PracticeConfig): void; onBack(): void }): void {
    this.clear();
    const cfg: PracticeConfig = { ...vm.initial, pitches: [...vm.initial.pitches] };
    const seg = <T extends string>(options: { v: T; label: string; disabled?: boolean }[], get: () => T, set: (v: T) => void): HTMLElement => {
      const el = h('div', { class: 'seg', role: 'group' });
      const render = (): void => {
        el.replaceChildren(
          ...options.map((o) =>
            h('button', { 'aria-pressed': get() === o.v ? 'true' : 'false', disabled: o.disabled, onclick: this.click(() => { set(o.v); render(); }) }, o.label),
          ),
        );
      };
      render();
      return el;
    };
    const pitchChips = h('div', { class: 'chips' });
    const warn = h('div', { class: 'help', style: 'color:var(--c-warn)', hidden: true }, this.t('pickOnePitch'));
    const start = h('button', { class: 'btn btn-primary btn-lg', onclick: this.click(() => hd.onStart(cfg)), 'data-autofocus': true }, this.t('letsPractice'));
    const renderChips = (): void => {
      pitchChips.replaceChildren(
        ...vm.pitches.map((p) =>
          h(
            'button',
            {
              class: 'chip',
              'aria-pressed': cfg.pitches.includes(p.id) ? 'true' : 'false',
              onclick: this.click(() => {
                const has = cfg.pitches.includes(p.id);
                cfg.pitches = has ? cfg.pitches.filter((x) => x !== p.id) : [...cfg.pitches, p.id as PitchTypeId];
                renderChips();
              }),
            },
            h('span', { class: 'dot', style: `background:${p.color}` }),
            p.name,
          ),
        ),
      );
      warn.hidden = cfg.pitches.length > 0;
      start.disabled = cfg.pitches.length === 0;
    };
    renderChips();
    const modal = h(
      'div',
      { class: 'modal panel', role: 'dialog', 'aria-modal': 'true' },
      h('h2', null, this.t('practiceTitle')),
      h('div', { class: 'field' }, h('span', { class: 'label' }, this.t('stadium')), seg(vm.stadiums.map((s) => ({ v: s.id, label: s.name, disabled: s.locked })), () => cfg.stadium, (v) => (cfg.stadium = v as StadiumId))),
      h('div', { class: 'field' }, h('span', { class: 'label' }, this.t('pitches')), pitchChips, warn),
      h(
        'div',
        { class: 'row' },
        h('div', { class: 'field' }, h('span', { class: 'label' }, this.t('speed')), seg([{ v: 'slow', label: this.t('speedSlow') }, { v: 'normal', label: this.t('speedNormal') }, { v: 'fast', label: this.t('speedFast') }], () => cfg.speed, (v) => (cfg.speed = v))),
        h('div', { class: 'field' }, h('span', { class: 'label' }, this.t('location')), seg([{ v: 'middle', label: this.t('locMiddle') }, { v: 'zone', label: this.t('locZone') }, { v: 'any', label: this.t('locAny') }], () => cfg.location, (v) => (cfg.location = v))),
        h('div', { class: 'field' }, h('span', { class: 'label' }, this.t('pitcherHand')), seg([{ v: 'R', label: this.t('handR') }, { v: 'L', label: this.t('handL') }], () => cfg.pitcherHand, (v) => (cfg.pitcherHand = v))),
      ),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-ghost', onclick: this.click(hd.onBack) }, this.t('back')), start),
    );
    this.setScreen(h('section', { class: 'screen scrim center' }, modal), hd.onBack);
  }

  // ── Derby ──
  showDerbySetup(vm: DerbySetupVM, hd: { onStart(stadium: StadiumId): void; onBack(): void }): void {
    this.clear();
    const grid = h('div', { class: 'row' });
    for (const s of vm.stadiums) {
      grid.append(
        h(
          'button',
          { class: 'card btn', style: 'align-items:flex-start;text-align:left;min-height:110px', disabled: s.locked, onclick: this.click(() => hd.onStart(s.id)) },
          h('div', { style: 'font:400 26px var(--f-display);letter-spacing:.03em' }, s.name),
          h('div', { class: 'dim num', style: 'font-size:13px' }, s.info),
          h('div', { class: 'num' }, s.locked ? h('span', { class: 'dim' }, lockIcon(), ` ${this.t('locked')}`) : `${this.t('best')}: ${s.best ?? this.t('noBest')}`),
        ),
      );
    }
    const modal = h(
      'div',
      { class: 'modal panel', role: 'dialog', 'aria-modal': 'true', style: 'width:min(980px,100%)' },
      h('h2', null, this.t('derbyTitle')),
      h('div', { class: 'tip' }, whistleIcon(), h('div', null, h('div', { class: 'eyebrow', style: 'color:var(--c-info)' }, this.t('rules')), vm.rules)),
      h('div', { class: 'eyebrow' }, this.t('chooseStadium')),
      grid,
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-ghost', onclick: this.click(hd.onBack) }, this.t('back'))),
    );
    this.setScreen(h('section', { class: 'screen scrim center' }, modal), hd.onBack);
  }

  // ── Settings ──
  showSettings(settings: Settings, hd: SettingsHandlers): void {
    this.overlayLayer.replaceChildren();
    let s: Settings = structuredClone(settings);
    const commit = (next: Settings): void => {
      s = next;
      hd.onChange(structuredClone(s));
    };
    const seg = <T extends string>(options: { v: T; label: string }[], get: () => T, set: (v: T) => void): HTMLElement => {
      const el = h('div', { class: 'seg', role: 'group' });
      const render = (): void => {
        el.replaceChildren(...options.map((o) => h('button', { 'aria-pressed': get() === o.v ? 'true' : 'false', onclick: this.click(() => { set(o.v); render(); }) }, o.label)));
      };
      render();
      return el;
    };
    const toggle = (label: string, get: () => boolean, set: (v: boolean) => void): HTMLElement => {
      const input = h('input', { type: 'checkbox', role: 'switch' }) as HTMLInputElement;
      input.checked = get();
      input.addEventListener('change', () => set(input.checked));
      return h('label', { class: 'switch' }, h('span', null, label), input);
    };
    const slider = (label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, format: (v: number) => string): HTMLElement => {
      const input = h('input', { type: 'range', min, max, step, 'aria-label': label }) as HTMLInputElement;
      input.value = String(get());
      const out = h('output', null, format(get()));
      input.addEventListener('input', () => {
        out.textContent = format(Number(input.value));
        set(Number(input.value));
      });
      return h('div', { class: 'field' }, h('span', { class: 'label' }, label), h('div', { class: 'range' }, input, out));
    };
    const pct = (v: number): string => `${Math.round(v * 100)}%`;
    const modeHelp = h('div', { class: 'help' }, s.controlMode === 'pro' ? this.t('modeProDesc') : this.t('modeCasualDesc'));
    const resetBtn = h('button', { class: 'btn danger' }, this.t('resetProgress'));
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (resetBtn.dataset.confirm) {
        hd.onResetProgress();
        resetBtn.textContent = '✓';
        resetBtn.disabled = true;
      } else {
        resetBtn.dataset.confirm = '1';
        resetBtn.textContent = this.t('resetYes');
      }
    });
    const latency = slider(this.t('latency'), -100, 100, 5, () => s.latencyMs, (v) => commit({ ...s, latencyMs: v }), (v) => `${v > 0 ? '+' : ''}${v} ms`);
    const modal = h(
      'div',
      { class: 'modal panel', role: 'dialog', 'aria-modal': 'true', style: 'width:min(980px,100%)' },
      h('div', { class: 'topbar', style: 'margin:0' }, h('h2', { style: 'flex:1' }, this.t('settingsTitle')), h('button', { class: 'btn', onclick: this.click(hd.onBack), 'data-autofocus': true }, this.t('close'))),
      h(
        'div',
        { class: 'settings-grid' },
        h(
          'section',
          { class: 'card' },
          h('h3', { class: 'section-title' }, this.t('secGame')),
          h('div', { class: 'field' }, h('span', { class: 'label' }, this.t('language')), seg([{ v: 'es', label: 'Español' }, { v: 'en', label: 'English' }], () => s.lang, (v) => commit({ ...s, lang: v }))),
          h(
            'div',
            { class: 'field' },
            h('span', { class: 'label' }, this.t('controlMode')),
            seg([{ v: 'pro', label: this.t('modePro') }, { v: 'casual', label: this.t('modeCasual') }], () => s.controlMode, (v) => {
              commit({ ...s, controlMode: v });
              modeHelp.textContent = v === 'pro' ? this.t('modeProDesc') : this.t('modeCasualDesc');
            }),
            modeHelp,
          ),
          h('div', { class: 'field' }, h('span', { class: 'label' }, this.t('handedness')), seg([{ v: 'R', label: this.t('righty') }, { v: 'L', label: this.t('lefty') }], () => s.handedness, (v) => commit({ ...s, handedness: v }))),
          h('div', { class: 'field' }, h('span', { class: 'label' }, this.t('units')), seg([{ v: 'imperial', label: this.t('imperial') }, { v: 'metric', label: this.t('metric') }], () => s.units, (v) => commit({ ...s, units: v }))),
        ),
        h(
          'section',
          { class: 'card' },
          h('h3', { class: 'section-title' }, this.t('secAudio')),
          slider(this.t('volMaster'), 0, 1, 0.05, () => s.volume.master, (v) => commit({ ...s, volume: { ...s.volume, master: v } }), pct),
          slider(this.t('volSfx'), 0, 1, 0.05, () => s.volume.sfx, (v) => commit({ ...s, volume: { ...s.volume, sfx: v } }), pct),
          slider(this.t('volMusic'), 0, 1, 0.05, () => s.volume.music, (v) => commit({ ...s, volume: { ...s.volume, music: v } }), pct),
          slider(this.t('volCrowd'), 0, 1, 0.05, () => s.volume.crowd, (v) => commit({ ...s, volume: { ...s.volume, crowd: v } }), pct),
        ),
        h(
          'section',
          { class: 'card' },
          h('h3', { class: 'section-title' }, this.t('secVideo')),
          h('div', { class: 'field' }, h('span', { class: 'label' }, this.t('quality')), seg([{ v: 'auto', label: this.t('qAuto') }, { v: 'low', label: this.t('qLow') }, { v: 'medium', label: this.t('qMedium') }, { v: 'high', label: this.t('qHigh') }], () => s.quality, (v) => commit({ ...s, quality: v }))),
          toggle(this.t('reducedMotion'), () => s.reducedMotion, (v) => commit({ ...s, reducedMotion: v })),
        ),
        h(
          'section',
          { class: 'card' },
          h('h3', { class: 'section-title' }, this.t('secAssist')),
          toggle(this.t('pitchTrail'), () => s.pitchTrail, (v) => commit({ ...s, pitchTrail: v })),
          toggle(this.t('showTimingMs'), () => s.showTimingMs, (v) => commit({ ...s, showTimingMs: v })),
          toggle(this.t('showPitchType'), () => s.showPitchType, (v) => commit({ ...s, showPitchType: v })),
        ),
        h(
          'section',
          { class: 'card' },
          h('h3', { class: 'section-title' }, this.t('secTiming')),
          latency,
          h('div', { class: 'help' }, this.t('latencyDesc')),
          h('button', { class: 'btn', onclick: this.click(hd.onCalibrate) }, this.t('calibrate')),
        ),
        h('section', { class: 'card' }, h('h3', { class: 'section-title' }, this.t('secData')), h('div', { class: 'help' }, this.t('resetDesc')), resetBtn),
      ),
    );
    const screen = h('section', { class: 'screen scrim center', style: 'pointer-events:auto' }, modal);
    this.overlayLayer.replaceChildren(screen);
    const prevEsc = this.escHandler;
    this.escHandler = () => {
      this.escHandler = prevEsc;
      hd.onBack();
    };
    window.setTimeout(() => modal.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true }), 50);
  }

  /** Closes an overlay-level screen (settings / pause). */
  closeOverlay(): void {
    this.overlayLayer.replaceChildren();
  }

  // ── Calibration ──
  showCalibration(hd: CalibrationHandlers): void {
    this.overlayLayer.replaceChildren();
    const BEATS = 8;
    const INTERVAL = 600;
    const pulse = h('div', { class: 'cal-pulse', 'aria-hidden': 'true' });
    const status = h('div', { class: 'eyebrow', style: 'text-align:center' }, '');
    const body = h('div', { class: 'col', style: 'gap:16px' });
    const startBtn = h('button', { class: 'btn btn-primary btn-lg', 'data-autofocus': true }, this.t('calStart'));
    const cancel = h('button', { class: 'btn btn-ghost' }, this.t('cancel'));
    const actions = h('div', { class: 'actions' }, cancel, startBtn);
    body.append(h('p', { style: 'margin:0;line-height:1.5' }, this.t('calIntro')), h('p', { class: 'dim', style: 'margin:0' }, this.t('calIntro2')), pulse, status);
    const modal = h('div', { class: 'modal panel', role: 'dialog', 'aria-modal': 'true', style: 'width:min(560px,100%)' }, h('h2', null, this.t('calTitle')), body, actions);
    const screen = h('section', { class: 'screen scrim center', style: 'pointer-events:auto' }, modal);
    this.overlayLayer.replaceChildren(screen);
    let taps: number[] = [];
    let expected: number[] = [];
    let running = false;
    const timers: number[] = [];
    const finish = (ms: number | null): void => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('keydown', onKey, true);
      screen.removeEventListener('pointerdown', onTap);
      this.overlayLayer.replaceChildren();
      hd.onDone(ms);
    };
    const onTap = (e: Event): void => {
      if (!running) return;
      taps.push(e.timeStamp);
      pulse.classList.add('beat');
      window.setTimeout(() => pulse.classList.remove('beat'), 80);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === ' ' && running) {
        e.preventDefault();
        e.stopPropagation();
        onTap(e);
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        finish(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    screen.addEventListener('pointerdown', onTap);
    cancel.addEventListener('click', (e) => {
      e.stopPropagation();
      finish(null);
    });
    const showResult = (): void => {
      running = false;
      const diffs: number[] = [];
      for (const exp of expected.slice(2)) {
        const near = taps.reduce((b, t) => (Math.abs(t - exp) < Math.abs(b - exp) ? t : b), Number.POSITIVE_INFINITY);
        if (Math.abs(near - exp) < INTERVAL / 2) diffs.push(near - exp);
      }
      if (diffs.length < 4) {
        status.textContent = this.t('calNotEnough');
        startBtn.textContent = this.t('calRetry');
        startBtn.disabled = false;
        return;
      }
      diffs.sort((a, b) => a - b);
      const mid = diffs.slice(1, -1);
      const mean = Math.round(mid.reduce((a, b) => a + b, 0) / mid.length);
      const msg = Math.abs(mean) < 10 ? this.t('calSpot') : mean > 0 ? this.t('calLate', { ms: mean }) : this.t('calEarly', { ms: -mean });
      const marker = h('i', { style: `left:${50 + Math.max(-50, Math.min(50, mean / 2))}%` });
      body.replaceChildren(
        h('div', { class: 'eyebrow' }, this.t('calResult')),
        h('div', { class: 'display', style: 'font-size:64px' }, `${mean > 0 ? '+' : ''}${mean} ms`),
        h('div', { class: 'cal-axis' }, marker),
        h('div', { style: 'display:flex;justify-content:space-between' }, h('span', { class: 'dim' }, this.t('calEarlyAxis')), h('span', { class: 'dim' }, this.t('calLateAxis'))),
        h('p', { style: 'margin:0' }, msg),
      );
      this.announce(msg);
      const apply = h('button', { class: 'btn btn-primary btn-lg', onclick: this.click(() => finish(mean)) }, this.t('calApply'));
      const retry = h('button', { class: 'btn', onclick: this.click(() => { body.replaceChildren(pulse, status); actions.replaceChildren(cancel, startBtn); begin(); }) }, this.t('calRetry'));
      actions.replaceChildren(cancel, retry, apply);
      apply.focus();
    };
    const begin = (): void => {
      taps = [];
      running = true;
      startBtn.disabled = true;
      expected = hd.startMetronome(BEATS, INTERVAL);
      expected.forEach((t, i) => {
        timers.push(
          window.setTimeout(() => {
            pulse.classList.add('beat');
            status.textContent = `${i < 2 ? this.t('calWarmup') : this.t('calCounting')} · ${i + 1}/${BEATS}`;
            window.setTimeout(() => pulse.classList.remove('beat'), 90);
          }, Math.max(0, t - performance.now())),
        );
      });
      status.textContent = this.touch ? this.t('calTap') : this.t('calTapKey');
      timers.push(window.setTimeout(showResult, Math.max(0, expected[expected.length - 1]! - performance.now()) + 500));
    };
    startBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      begin();
    });
    window.setTimeout(() => startBtn.focus(), 50);
  }

  // ── HUD ──
  showHUD(vm: HudVM, hd: HudHandlers): void {
    this.setScreen(null);
    this.hudLayer.replaceChildren();
    const chipTag = h('span', { class: 'tag' }, '');
    const chipText = h('span', null, '');
    const goal = h('span', null, '');
    const goalNum = h('span', { class: 'num' }, '');
    const barFill = h('i');
    const right = h('div', { class: 'hud-tr' });
    const hint = h('div', { class: 'hint' }, '');
    const pitch = h('div', { class: 'pitch-label', hidden: true }, '');
    const hud = h(
      'div',
      { class: 'hud' },
      h('div', { class: 'hud-tl' }, h('div', { class: 'hud-chip' }, chipTag, chipText), h('div', { class: 'hud-goal' }, h('div', { class: 'txt' }, goal, goalNum), h('div', { class: 'bar' }, barFill))),
      right,
      h('div', { class: 'hud-bottom' }, pitch, hint),
    );
    let power: HTMLButtonElement | null = null;
    if (this.touch) {
      power = h('button', { class: 'power-btn', 'aria-pressed': vm.powerOn ? 'true' : 'false', 'aria-label': this.t('powerAria') }, this.t('power'));
      power.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const on = power!.getAttribute('aria-pressed') !== 'true';
        power!.setAttribute('aria-pressed', on ? 'true' : 'false');
        hd.onPowerToggle(on);
      });
      const swing = h('button', { class: 'swing-btn', 'aria-label': this.t('swing') }, this.t('swing'));
      swing.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.vibrate?.(10);
        hd.onSwing(e.timeStamp);
      });
      hud.append(h('div', { class: 'touch' }, power, swing));
    }
    this.hudLayer.append(hud);
    this.hud = { chipTag, chipText, goal, goalNum, bar: barFill, right, hint, pitch, power, onPause: hd.onPause, last: null };
    this.updateHUD(vm);
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => hint.classList.add('hide'), 6000);
  }

  updateHUD(vm: HudVM): void {
    const hud = this.hud;
    if (!hud) return;
    const prev = hud.last;
    if (prev && JSON.stringify(prev) === JSON.stringify(vm)) return;
    hud.last = { ...vm, outs: vm.outs ? { ...vm.outs } : null };
    const [tag, ...rest] = vm.stageLabel.split(' · ');
    hud.chipTag.textContent = tag ?? '';
    hud.chipText.textContent = rest.join(' · ');
    const [g, n] = vm.goalText.split('|');
    hud.goal.textContent = g ?? '';
    hud.goalNum.textContent = n ?? '';
    hud.bar.style.width = `${Math.round(Math.max(0, Math.min(1, vm.progress)) * 100)}%`;
    if (!prev || prev.controlHint !== vm.controlHint) {
      hud.hint.textContent = vm.controlHint ?? '';
      hud.hint.hidden = !vm.controlHint;
    }
    if (hud.power) hud.power.setAttribute('aria-pressed', vm.powerOn ? 'true' : 'false');
    this.hudLayer.classList.toggle('power-on', vm.powerOn);

    const right: Node[] = [];
    if (vm.streak !== null && vm.streak > 0) {
      right.push(h('div', { class: 'hud-box streak', 'aria-label': this.t('streakAria', { n: vm.streak }) }, h('span', { class: 'lbl' }, this.t('streak')), h('span', { class: 'val' }, `🔥${vm.streak}`)));
    }
    if (vm.score) right.push(h('div', { class: 'hud-box' }, h('span', { class: 'lbl' }, this.t('score')), h('span', { class: 'val', style: 'font-size:20px' }, vm.score)));
    if (vm.outs) {
      const dots = h('div', { class: 'outs' });
      for (let i = 0; i < vm.outs.total; i++) dots.append(h('span', { class: `out-dot ${i < vm.outs.left ? '' : 'used'}` }));
      if (vm.outs.left > vm.outs.total) dots.append(h('span', { class: 'num', style: 'font-weight:700;color:var(--c-success)' }, `+${vm.outs.left - vm.outs.total}`));
      right.push(h('div', { class: 'hud-box', 'aria-label': this.t('outsAria', { left: vm.outs.left, total: vm.outs.total }) }, h('span', { class: 'lbl' }, this.t('outs')), dots));
    }
    if (vm.timeLeft !== null) {
      const s = Math.ceil(vm.timeLeft);
      right.push(h('div', { class: `hud-box ${s <= 10 ? 'warn' : ''}`, 'aria-label': this.t('timeAria', { s }) }, h('span', { class: 'lbl' }, this.t('time')), h('span', { class: 'val' }, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)));
    }
    right.push(h('button', { class: 'btn btn-icon hud-pause', 'aria-label': this.t('pause'), onclick: this.click(hud.onPause) }, pauseIcon()));
    hud.right.replaceChildren(...right);
  }

  showHitCard(vm: HitCardVM): void {
    this.hideHitCard();
    const stats = h('div', { class: 'stats' });
    for (const s of vm.stats) stats.append(h('div', { class: 'stat' }, h('div', { class: 'k' }, s.label), h('div', { class: 'v' }, s.value)));
    const chips = h('div', { class: 'chips' });
    if (vm.timing) chips.append(h('span', { class: `chip tone tone-${vm.timing.tone}` }, vm.timing.ms !== null ? `${vm.timing.label} · ${vm.timing.ms > 0 ? '+' : ''}${vm.timing.ms} ms` : vm.timing.label));
    if (vm.quality) chips.append(h('span', { class: `chip tone tone-${vm.quality.tone}` }, vm.quality.label));
    for (const b of vm.badges) chips.append(h('span', { class: 'chip tone', style: '--tone:var(--c-gold)' }, b));
    const card = h(
      'aside',
      { class: `hitcard panel res-${vm.result}`, 'aria-label': vm.title },
      h('div', { class: 'title' }, vm.title),
      vm.stats.length ? stats : null,
      chips.childNodes.length ? chips : null,
      vm.coach ? h('div', { class: 'coach' }, vm.coach) : null,
      h('div', { class: 'eyebrow', style: 'font-size:12px' }, vm.pitch),
    );
    this.hitCard = card;
    this.fxLayer.append(card);
    this.announce([vm.title, ...vm.stats.map((s) => `${s.label} ${s.value}`), vm.coach ?? ''].join('. '));
  }

  hideHitCard(): void {
    this.hitCard?.remove();
    this.hitCard = null;
  }

  showCallout(text: string, style: CalloutStyle, sub?: string): void {
    const el = h('div', { class: `callout ${style}` }, h('div', { class: 'big' }, text), sub ? h('div', { class: 'sub' }, sub) : null);
    this.fxLayer.querySelectorAll('.callout').forEach((c) => c.remove());
    this.fxLayer.append(el);
    window.setTimeout(() => el.remove(), 1650);
    if (style !== 'info') this.announce(sub ? `${text}. ${sub}` : text);
  }

  showPitchLabel(text: string | null): void {
    if (!this.hud) return;
    this.hud.pitch.hidden = !text;
    this.hud.pitch.textContent = text ?? '';
  }

  showTip(text: string | null): void {
    this.tipEl?.remove();
    this.tipEl = null;
    if (!text) return;
    const close = h('button', { class: 'btn btn-ghost btn-icon', 'aria-label': this.t('dismissTip'), onclick: this.click(() => this.showTip(null)) }, '✕');
    this.tipEl = h('div', { class: 'coach-tip panel', role: 'note' }, whistleIcon(), h('div', { style: 'flex:1' }, h('div', { class: 'who' }, this.t('coach')), h('p', null, text)), close);
    this.fxLayer.append(this.tipEl);
  }

  showPause(hd: PauseHandlers): void {
    const modal = h(
      'div',
      { class: 'modal panel', role: 'dialog', 'aria-modal': 'true', style: 'width:min(420px,100%)' },
      h('h2', null, this.t('pauseTitle')),
      h(
        'div',
        { class: 'menu' },
        h('button', { class: 'btn btn-primary btn-lg', onclick: this.click(hd.onResume), 'data-autofocus': true }, this.t('resume')),
        h('button', { class: 'btn', onclick: this.click(hd.onRestart) }, this.t('restart')),
        h('button', { class: 'btn', onclick: this.click(hd.onSettings) }, this.t('settings')),
        h('button', { class: 'btn btn-ghost', onclick: this.click(hd.onQuit) }, this.t('quit')),
      ),
    );
    this.overlayLayer.replaceChildren(h('section', { class: 'screen scrim center', style: 'pointer-events:auto' }, modal));
    this.escHandler = hd.onResume;
    window.setTimeout(() => modal.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 50);
  }

  hidePause(): void {
    this.overlayLayer.replaceChildren();
    this.escHandler = null;
  }

  showResults(vm: ResultsVM, hd: ResultsHandlers): void {
    this.hudLayer.replaceChildren();
    this.hud = null;
    this.fxLayer.replaceChildren();
    this.hitCard = null;
    const big = h('div', { class: 'big-stars', role: 'img', 'aria-label': `${vm.stars}/3` });
    for (let i = 0; i < 3; i++) {
      const on = i < vm.stars;
      const isNew = on && i >= vm.stars - vm.newStars;
      const st = starIcon(on, isNew ? 'new' : '');
      st.style.animationDelay = `${250 + i * 260}ms`;
      big.append(st);
    }
    const list = h('ul', { class: 'starlist' });
    if (vm.mode === 'campaign') vm.starTexts.forEach((s, i) => list.append(h('li', { class: vm.starsMet[i] ? 'met' : '' }, starIcon(vm.starsMet[i]), s)));
    const stats = h('div', { class: 'stats' });
    for (const s of vm.stats) stats.append(h('div', { class: 'stat' }, h('div', { class: 'k' }, s.label), h('div', { class: 'v' }, s.value)));
    const modal = h(
      'div',
      { class: 'modal panel results', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'res-title' },
      vm.mode === 'campaign' ? big : null,
      h('h2', { id: 'res-title', style: vm.success ? 'color:var(--c-gold)' : '' }, vm.title),
      h('div', { class: 'sub' }, vm.subtitle),
      vm.mode === 'campaign' ? list : null,
      h('div', { class: 'eyebrow' }, this.t('summary')),
      stats,
      ...vm.unlocks.map((u) => h('div', { class: 'unlock' }, starIcon(true), `${this.t('unlocked')}: ${u}`)),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn btn-ghost', onclick: this.click(hd.onMenu) }, this.t('menu')),
        h('button', { class: 'btn', onclick: this.click(hd.onShare) }, this.t('share')),
        h('button', { class: `btn ${vm.canNext ? '' : 'btn-primary'}`, onclick: this.click(hd.onRetry), 'data-autofocus': !vm.canNext }, this.t('retry')),
        vm.canNext ? h('button', { class: 'btn btn-primary btn-lg', onclick: this.click(hd.onNext), 'data-autofocus': true }, this.t('next')) : null,
      ),
    );
    this.setScreen(h('section', { class: 'screen scrim center' }, modal), hd.onMenu);
    this.announce(`${vm.title}. ${vm.subtitle}`);
  }

  toast(text: string): void {
    const el = h('div', { class: 'toast panel', role: 'status' }, text);
    this.fxLayer.append(el);
    window.setTimeout(() => el.remove(), 2700);
  }
}

export const createUI: CreateUI = (mount, lang) => new DomUI(mount, lang);
export type { DomUI };
