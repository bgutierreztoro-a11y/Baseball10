import type { BatterLook, CustomCharacter, StadiumId, TraitId } from '../contracts';
import type { CreatorHandlers, CreatorVM } from './api';
import { h, svg } from './dom';
import type { StringKey } from './strings';

/**
 * Player Studio (character creator). Side panel (bottom sheet on phones)
 * over the live 3D batter. Every option can be tried on for free; parts
 * that cost Fichas show their price and are paid only to save the player.
 */
type T = (key: StringKey, values?: Record<string, string | number>) => string;

type Tab = 'body' | 'face' | 'kit' | 'bat' | 'trait' | 'stats';

const TABS: { id: Tab; key: StringKey }[] = [
  { id: 'body', key: 'tabBody' },
  { id: 'face', key: 'tabFace' },
  { id: 'kit', key: 'tabKit' },
  { id: 'bat', key: 'tabBat' },
  { id: 'trait', key: 'tabTrait' },
  { id: 'stats', key: 'tabStats' },
];

const lockIco = (): SVGSVGElement => svg('0 0 24 24', 'ico lock-ico', [{ d: 'M7 10V7a5 5 0 0110 0v3h1a1 1 0 011 1v9a1 1 0 01-1 1H6a1 1 0 01-1-1v-9a1 1 0 011-1h1zm2 0h6V7a3 3 0 00-6 0v3z' }]);
const diceIco = (): SVGSVGElement =>
  svg('0 0 24 24', 'ico', [
    { d: 'M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z', fill: 'none', stroke: 'currentColor', sw: 2 },
    { d: 'M8 7.2a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4zm8 0a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4zm-4 3.6a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4zm-4 3.6a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4zm8 0a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z' },
  ]);
const turnIco = (dir: 1 | -1): SVGSVGElement => svg('0 0 24 24', 'ico', [{ d: dir > 0 ? 'M4 12a8 8 0 1014-5.3M18 3v4h-4' : 'M20 12a8 8 0 11-14-5.3M6 3v4h4', fill: 'none', stroke: 'currentColor', sw: 2.2 }]);
const coinIco = (): SVGSVGElement => svg('0 0 24 24', 'ico coin-ico', [{ d: 'M12 2a10 10 0 110 20 10 10 0 010-20zm0 3.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm-1 2.5h2v8h-2z' }]);

export function creatorScreen(vm: CreatorVM, hd: CreatorHandlers, t: T, lang: 'es' | 'en'): { el: HTMLElement; esc: () => void } {
  let draft: CustomCharacter = structuredClone(vm.draft);
  let owned = [...vm.owned];
  let coins = vm.coins;
  let tab: Tab = 'body';
  // Three-quarter front view (from the pitcher's side of the plate).
  let spin = -Math.PI / 2 + 0.45;

  const click = (fn: () => void): EventListener => (e: Event) => {
    e.stopPropagation();
    fn();
  };
  const has = (part: string | null): boolean => !part || owned.includes(part);
  const price = (part: string): number => vm.parts[part]?.price ?? 0;
  const lockTag = (part: string | null): HTMLElement | null =>
    part && !has(part) ? h('span', { class: 'lock-tag', title: t('locked2', { n: price(part) }) }, lockIco(), String(price(part))) : null;

  const preview = (): void => hd.onChange(draft);
  const setLook = (patch: Partial<BatterLook>, rerender = true): void => {
    draft = { ...draft, look: { ...draft.look, ...patch } };
    preview();
    if (rerender) render();
    else renderFoot();
  };

  const coinsChip = h('span', { class: 'chip coins-chip num', 'aria-label': t('coinsAria', { n: coins }) }, coinIco(), String(coins));
  const nameIn = h('input', { class: 'text-in', type: 'text', maxlength: vm.nameMax, value: draft.name, 'aria-label': t('name') }) as HTMLInputElement;
  const nickIn = h('input', { class: 'text-in small', type: 'text', maxlength: vm.nickMax, value: draft.nickname, placeholder: t('nickname'), 'aria-label': t('nickname') }) as HTMLInputElement;
  nameIn.addEventListener('input', () => {
    draft = { ...draft, name: nameIn.value };
    renderFoot();
  });
  nickIn.addEventListener('input', () => {
    draft = { ...draft, nickname: nickIn.value };
  });
  for (const el of [nameIn, nickIn]) el.addEventListener('keydown', (e) => e.stopPropagation());

  const tabs = h('div', { class: 'ctabs', role: 'tablist' });
  const body = h('div', { class: 'cbody', role: 'tabpanel' });
  const foot = h('div', { class: 'cfoot' });

  // ── Field builders ──
  const field = (label: string, ...children: (Node | null)[]): HTMLElement => h('div', { class: 'field' }, h('span', { class: 'label' }, label), ...children);
  const seg = <V extends string>(opts: { v: V; label: string; part?: string | null }[], cur: V, set: (v: V) => void): HTMLElement =>
    h('div', { class: 'seg seg-wrap', role: 'group' }, ...opts.map((o) => h('button', { 'aria-pressed': o.v === cur ? 'true' : 'false', onclick: click(() => set(o.v)) }, o.label, lockTag(o.part ?? null))));
  const toggle = (label: string, on: boolean, part: string | null, set: (v: boolean) => void): HTMLElement =>
    h('button', { class: `ctoggle ${on ? 'on' : ''}`, 'aria-pressed': on ? 'true' : 'false', onclick: click(() => set(!on)) }, h('span', { class: 'knob', 'aria-hidden': 'true' }), h('span', null, label), lockTag(part));
  const swatches = (colors: (string | null)[], cur: string | null, set: (c: string | null) => void, noneLabel?: string): HTMLElement =>
    h(
      'div',
      { class: 'swatches', role: 'group' },
      ...colors.map((c) =>
        h('button', { class: `sw ${c === null ? 'none' : ''}`, style: c ? `--sw:${c}` : '', 'aria-label': c ?? noneLabel ?? '—', 'aria-pressed': c === cur ? 'true' : 'false', onclick: click(() => set(c)) }),
      ),
    );
  const slider = (label: string, min: number, max: number, step: number, val: number, fmt: (v: number) => string, set: (v: number) => void, lock?: (v: number) => string | null): HTMLElement => {
    const input = h('input', { type: 'range', min, max, step, 'aria-label': label }) as HTMLInputElement;
    input.value = String(val);
    const out = h('output', null, fmt(val));
    const tag = h('span', { class: 'slider-lock' });
    const syncLock = (v: number): void => {
      const part = lock?.(v) ?? null;
      tag.replaceChildren(...(part && !has(part) ? [lockTag(part)!] : []));
    };
    syncLock(val);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      out.textContent = fmt(v);
      syncLock(v);
      set(v);
    });
    input.addEventListener('keydown', (e) => e.stopPropagation());
    return h('div', { class: 'field' }, h('span', { class: 'label' }, label, tag), h('div', { class: 'range' }, input, out));
  };
  const pct = (v: number): string => `${Math.round(v * 100)}%`;
  const meters = (v: number): string => `${v.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;


  const panels: Record<Tab, () => HTMLElement[]> = {
    body: () => {
      const l = draft.look;
      const bodyNow = l.skeleton ? 'skeleton' : l.monkey ? 'monkey' : 'human';
      return [
        field(
          t('bodyType'),
          seg(
            [
              { v: 'human', label: t('bodyHuman') },
              { v: 'monkey', label: t('bodyMonkey'), part: 'body-monkey' },
              { v: 'skeleton', label: t('bodySkeleton'), part: 'body-skeleton' },
            ],
            bodyNow,
            (v) => {
              draft = hd.withBody(draft, v);
              preview();
              render();
            },
          ),
        ),
        slider(t('heightLbl'), vm.height.min, vm.height.max, 0.05, l.heightM, meters, (v) => setLook({ heightM: Math.round(v * 100) / 100 }, false), (v) => (v >= vm.height.giantFrom ? 'giant' : null)),
        slider(t('buildLbl'), 0.8, 1.6, 0.01, l.build, pct, (v) => setLook({ build: v }, false)),
        slider(t('bellyLbl'), 0, 1, 0.01, l.belly, pct, (v) => setLook({ belly: v }, false)),
        slider(t('muscleLbl'), 0, 1, 0.01, l.muscle, pct, (v) => setLook({ muscle: v }, false)),
        h(
          'div',
          { class: 'toggles' },
          toggle(t('extraArms'), l.extraArms, 'extra-arms', (v) => setLook({ extraArms: v })),
          toggle(t('wheelchair'), !!l.wheelchair, 'wheelchair', (v) => setLook({ wheelchair: v })),
          bodyNow === 'human' ? toggle(t('rabbi'), !!l.rabbi, 'outfit-rabbi', (v) => setLook({ rabbi: v })) : null,
        ),
      ];
    },
    face: () => {
      const l = draft.look;
      return [
        draft.look.skeleton ? null : field(t('skin'), swatches(vm.skins, l.skin, (c) => setLook({ skin: c ?? l.skin }))),
        field(t('hair'), swatches(vm.hairs, l.hair, (c) => setLook({ hair: c }), t('noHair'))),
        slider(t('headLbl'), vm.head.min, vm.head.max, 0.01, l.headScale ?? 1, pct, (v) => setLook({ headScale: v }, false), (v) => (v >= vm.head.bobbleFrom ? 'bobblehead' : null)),
        field(
          t('glasses'),
          seg(
            [
              { v: 'none', label: t('glassesNone') },
              { v: 'sun', label: t('glassesSun'), part: 'glasses-sun' },
              { v: 'nerd', label: t('glassesNerd'), part: 'glasses-nerd' },
            ],
            l.glasses ?? 'none',
            (v) => setLook({ glasses: v === 'none' ? undefined : v }),
          ),
        ),
        h(
          'div',
          { class: 'toggles' },
          toggle(t('beard'), l.beard, null, (v) => setLook({ beard: v })),
          toggle(t('mustache'), !!l.mustache, null, (v) => setLook({ mustache: v })),
          toggle(t('horns'), l.horns, 'horns', (v) => setLook({ horns: v })),
        ),
      ].filter((x): x is HTMLElement => !!x);
    },
    kit: () => {
      const l = draft.look;
      const num = h('input', { class: 'text-in num-in', type: 'text', inputmode: 'numeric', maxlength: 2, value: l.number, 'aria-label': t('number') }) as HTMLInputElement;
      num.addEventListener('keydown', (e) => e.stopPropagation());
      num.addEventListener('change', () => setLook({ number: num.value.replace(/\D/g, '').slice(0, 2) || '0' }));
      return [field(t('jersey'), swatches(vm.colors, l.jersey, (c) => setLook({ jersey: c ?? l.jersey }))), field(t('trim'), swatches(vm.colors, l.trim, (c) => setLook({ trim: c ?? l.trim }))), field(t('number'), num)];
    },
    bat: () => {
      const cur = draft.look.baguette ? 'baguette' : draft.look.chancla ? 'chancla' : draft.look.dumbbell ? 'dumbbell' : draft.look.racket ? 'racket' : draft.look.hornBat ? 'horn' : 'wood';
      return [
        h(
          'div',
          { class: 'pick-list', role: 'group' },
          ...vm.bats.map((b) =>
            h(
              'button',
              {
                class: 'pick-row',
                'aria-pressed': b.id === cur ? 'true' : 'false',
                onclick: click(() => {
                  draft = hd.withBat(draft, b.id);
                  preview();
                  render();
                }),
              },
              h('span', { class: 'pick-name' }, b.name),
              lockTag(b.part) ?? h('span', { class: 'dim' }, b.part ? '✓' : t('free')),
            ),
          ),
        ),
      ];
    },
    trait: () => {
      const homeSel = h('select', { class: 'text-in', 'aria-label': t('homePark') }) as HTMLSelectElement;
      homeSel.append(h('option', { value: '' }, t('noHome')), ...vm.stadiums.map((s) => h('option', { value: s.id }, s.name)));
      homeSel.value = draft.home ?? '';
      homeSel.addEventListener('change', () => {
        draft = { ...draft, home: (homeSel.value || null) as StadiumId | null };
        preview();
      });
      return [
        h(
          'div',
          { class: 'pick-list', role: 'group' },
          ...vm.traits.map((tr) =>
            h(
              'button',
              {
                class: 'pick-row tall',
                'aria-pressed': tr.id === draft.trait ? 'true' : 'false',
                onclick: click(() => {
                  draft = { ...draft, trait: tr.id as TraitId };
                  preview();
                  render();
                }),
              },
              h('span', { class: 'pick-text' }, h('span', { class: 'pick-name' }, tr.name), h('span', { class: 'pick-desc' }, tr.description)),
              lockTag(tr.part),
            ),
          ),
        ),
        field(t('homePark'), homeSel),
      ];
    },
    stats: () => {
      const r = draft.ratings;
      const used = r.vision + r.contact + r.power + r.speed;
      const keys: { k: 'vision' | 'contact' | 'power' | 'speed'; label: StringKey }[] = [
        { k: 'vision', label: 'vision' },
        { k: 'contact', label: 'contact' },
        { k: 'power', label: 'powerLbl' },
        { k: 'speed', label: 'speedLbl' },
      ];
      const left = h('div', { class: 'points num' }, t('pointsLeft', { n: vm.budget - used }));
      const rows = keys.map(({ k, label }) =>
        slider(t(label), vm.ratingMin, vm.ratingMax, 1, r[k], (v) => String(v), (v) => {
          draft = hd.rate(draft, k, v);
          preview();
          // Other ratings may have donated points: update them in place (re-rendering would end the drag).
          rows.forEach((row, i) => {
            const key = keys[i]!.k;
            const input = row.querySelector('input')!;
            const out = row.querySelector('output')!;
            if (key !== k) input.value = String(draft.ratings[key]);
            out.textContent = String(draft.ratings[key]);
          });
          const d = draft.ratings;
          left.textContent = t('pointsLeft', { n: vm.budget - (d.vision + d.contact + d.power + d.speed) });
        }),
      );
      return [h('p', { class: 'help' }, t('statsHelp', { n: vm.budget })), left, ...rows];
    },
  };

  const renderTabs = (): void => {
    tabs.replaceChildren(
      ...TABS.map((x) =>
        h(
          'button',
          {
            class: 'ctab',
            role: 'tab',
            'aria-selected': x.id === tab ? 'true' : 'false',
            onclick: click(() => {
              tab = x.id;
              render();
            }),
          },
          t(x.key),
        ),
      ),
    );
  };

  const renderFoot = (): void => {
    const { missing, cost } = hd.check(draft);
    coinsChip.replaceChildren(coinIco(), String(coins));
    coinsChip.setAttribute('aria-label', t('coinsAria', { n: coins }));
    const valid = draft.name.trim().length > 0;
    const save = missing.length
      ? h(
          'button',
          {
            class: 'btn btn-primary',
            disabled: !valid || cost > coins,
            onclick: click(() => {
              const r = hd.onBuy(missing);
              if (!r) return;
              coins = r.coins;
              owned = r.owned;
              hd.onSave(draft);
            }),
          },
          cost > coins ? t('notEnough', { n: cost - coins }) : t('unlockSave', { n: cost }),
        )
      : h('button', { class: 'btn btn-primary', disabled: !valid, onclick: click(() => hd.onSave(draft)) }, t('save'));
    foot.replaceChildren(
      ...[
      h(
        'div',
        { class: 'cfoot-tools' },
        h('button', { class: 'btn btn-icon', 'aria-label': t('rotateL'), onclick: click(() => spinBy(-0.6)) }, turnIco(-1)),
        h('button', { class: 'btn btn-icon', 'aria-label': t('rotateR'), onclick: click(() => spinBy(0.6)) }, turnIco(1)),
        h(
          'button',
          {
            class: 'btn',
            onclick: click(() => {
              draft = { ...hd.onRandom(), id: draft.id };
              nameIn.value = draft.name;
              nickIn.value = draft.nickname;
              preview();
              render();
            }),
          },
          diceIco(),
          t('random'),
        ),
      ),
      missing.length ? h('p', { class: 'help try-on' }, t('tryOn')) : null,
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-ghost', onclick: click(hd.onBack) }, t('back')), save),
      ].filter((x) => x !== null) as HTMLElement[],
    );
  };

  const presets = h(
    'div',
    { class: 'chips presets', role: 'group', 'aria-label': t('presets') },
    ...vm.presets.map((p) =>
      h(
        'button',
        {
          class: 'chip',
          onclick: click(() => {
            draft = hd.onPreset(p.id, draft);
            nickIn.value = draft.nickname;
            preview();
            render();
          }),
        },
        p.name,
      ),
    ),
  );

  const spinBy = (d: number): void => {
    spin += d;
    hd.onSpin(spin);
  };

  const render = (): void => {
    renderTabs();
    body.replaceChildren(...panels[tab]());
    renderFoot();
  };

  // Drag on the free area rotates the batter.
  const stage = h('div', { class: 'cstage', 'aria-hidden': 'true' });
  let dragX: number | null = null;
  stage.addEventListener('pointerdown', (e) => {
    dragX = e.clientX;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (dragX === null) return;
    spinBy((e.clientX - dragX) * 0.012);
    dragX = e.clientX;
  });
  stage.addEventListener('pointerup', () => (dragX = null));

  const panel = h(
    'section',
    { class: 'cpanel panel', 'aria-label': t('creatorTitle') },
    h('header', { class: 'chead' }, h('div', { class: 'eyebrow' }, t('creatorTitle')), coinsChip),
    h('div', { class: 'cnames' }, nameIn, nickIn),
    h('div', { class: 'eyebrow presets-lbl' }, t('presets')),
    presets,
    tabs,
    body,
    foot,
  );

  render();
  hd.onSpin(spin);
  preview();
  return { el: h('div', { class: 'screen creator' }, stage, panel), esc: hd.onBack };
}
