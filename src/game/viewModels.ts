import type { CharacterDef, CustomCharacter, SaveData, Settings, StageDef } from '../contracts';
import { BATS, MAX_STARS, STAGES } from '../config/campaign';
import { BASE_RATING, allCharacters, characterById } from '../config/characters';
import { BAT_NAMES, BAT_ORDER, HAIR_COLORS, HEAD, HEIGHT, NAME_MAX, NICK_MAX, PARTS, PRESETS, RATING_BUDGET, RATING_MAX, RATING_MIN, SKIN_TONES, TEAM_COLORS, TRAITS, TRAIT_ORDER, slotsOwned } from '../config/creator';
import { dailyNumber, dailyStage } from '../config/daily';
import type { CoinLine } from '../config/economy';
import { RIVALS } from '../config/rivals';
import { playText } from '../i18n/play';
import type { GameSession } from '../sim/game';
import { FT, MPH } from '../config/constants';
import { PITCHERS, PITCH_TYPES } from '../config/pitches';
import { EXTRA_STADIUMS, STADIUMS, STADIUM_ORDER } from '../config/stadiums';
import { controlsText, dist, distFt, gameText, goalText, limitText, speedMph, starText } from '../i18n/game';
import { isBatUnlocked, isStageUnlocked, nextStageId, totalStars } from '../persistence/save';
import type { Session } from '../sim/session';
import type { CampaignVM, CharacterStatVM, CharactersVM, CreatorVM, DerbySetupVM, GameSetupVM, PracticeVM, ResultsVM, StageIntroVM, TitleVM } from '../ui/api';
import type { MatchMode } from './Match';

/** Pure builders from game state to UI view-models (localized strings). */

function stadiumInfo(id: keyof typeof STADIUMS, s: Settings): string {
  const st = STADIUMS[id];
  const [lf, , cf, , rf] = st.fence.distancesFt;
  const alt = s.units === 'metric' ? `${st.altitudeM} m` : `${Math.round(st.altitudeM / FT).toLocaleString(s.lang)} ft`;
  return `LF ${distFt(lf, s.units)} · CF ${distFt(cf, s.units)} · RF ${distFt(rf, s.units)} · ${s.lang === 'es' ? 'Alt.' : 'Elev.'} ${alt}`;
}

export function titleVM(save: SaveData, s: Settings, today: string): TitleVM {
  const next = nextStageId(save);
  const st = STAGES.find((x) => x.id === next)!;
  const started = Object.keys(save.stages).length > 0;
  return {
    totalStars: totalStars(save),
    maxStars: MAX_STARS,
    derbyBest: save.derbyBest > 0 ? `${save.derbyBest} HR` : null,
    continueLabel: started ? `${st.id} · ${st.name[s.lang]}` : null,
    characterName: characterById(save.selectedCharacter).name,
    coins: save.coins,
    daily: {
      label: `${playText(s.lang).dailyTitle(dailyNumber(today))} · ${dailyStage(today).name[s.lang]}`,
      done: save.daily.lastDay === today,
      streak: save.daily.streak,
    },
  };
}

/** Bar for a 0..25 rating: the base batter (10) sits at the bar's midpoint tick; the detail shows the number. */
function statBar(label: string, rating: number): CharacterStatVM {
  const tone = rating > BASE_RATING ? 'up' : rating < BASE_RATING ? 'down' : 'base';
  return { label, value: Math.max(0.04, Math.min(1, rating / (2 * BASE_RATING))), detail: String(rating), tone };
}

function characterStats(c: CharacterDef, lang: Settings['lang']): CharacterStatVM[] {
  const { vision, contact, power, speed } = c.ratings;
  const es = lang === 'es';
  return [statBar(es ? 'Visión' : 'Vision', vision), statBar(es ? 'Contacto' : 'Contact', contact), statBar(es ? 'Poder' : 'Power', power), statBar(es ? 'Velocidad' : 'Speed', speed)];
}

export function charactersVM(save: SaveData, s: Settings): CharactersVM {
  return {
    canCreate: save.customCharacters.length < slotsOwned(save.owned),
    items: allCharacters().map((c) => ({
      id: c.id,
      name: c.name,
      title: c.title[s.lang],
      bio: c.bio[s.lang],
      height: s.units === 'metric' || s.lang === 'es' ? `${c.look.heightM.toLocaleString(s.lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m` : feetInches(c.look.heightM),
      look: c.look,
      stats: characterStats(c, s.lang),
      ability: c.ability ? { name: c.ability.name[s.lang], description: c.ability.description[s.lang] } : c.trait ? { name: c.trait.name[s.lang], description: c.trait.description[s.lang] } : null,
      selected: save.selectedCharacter === c.id,
      custom: c.id.startsWith('custom-'),
    })),
  };
}

export function gameSetupVM(_save: SaveData, s: Settings, last: GameSetupVM['initial'] | null): GameSetupVM {
  return {
    rivals: RIVALS.map((r) => ({ id: r.id, name: r.name[s.lang], short: r.short, difficulty: r.difficulty, taunt: r.taunts[0]![s.lang], jersey: r.kit.jersey, trim: r.kit.jerseyTrim })),
    stadiums: [...STADIUM_ORDER, ...EXTRA_STADIUMS].map((id) => ({ id, name: STADIUMS[id].name[s.lang], locked: false })),
    innings: [1, 3, 5],
    initial: last ?? { stadium: 'malecon', rival: 'ramiros', innings: 3 },
    rules: '',
  };
}

export function creatorVM(save: SaveData, s: Settings, draft: CustomCharacter, isNew: boolean): CreatorVM {
  return {
    draft,
    isNew,
    coins: save.coins,
    owned: [...save.owned],
    parts: Object.fromEntries(Object.values(PARTS).map((p) => [p.id, { price: p.price, name: p.name[s.lang] }])),
    traits: TRAIT_ORDER.map((id) => ({ id, name: TRAITS[id].name[s.lang], description: TRAITS[id].description[s.lang], part: TRAITS[id].part })),
    bats: BAT_ORDER.map((id) => ({ id, name: BAT_NAMES[id][s.lang], part: id === 'wood' ? null : `bat-${id}` })),
    presets: PRESETS.map((p) => ({ id: p.id, name: p.name[s.lang] })),
    stadiums: [...STADIUM_ORDER, ...EXTRA_STADIUMS].map((id) => ({ id, name: STADIUMS[id].name[s.lang] })),
    skins: SKIN_TONES,
    hairs: HAIR_COLORS,
    colors: TEAM_COLORS,
    budget: RATING_BUDGET,
    ratingMin: RATING_MIN,
    ratingMax: RATING_MAX,
    height: { ...HEIGHT },
    head: { ...HEAD },
    nameMax: NAME_MAX,
    nickMax: NICK_MAX,
  };
}

function feetInches(m: number): string {
  const inches = Math.round(m / 0.0254);
  return `${Math.floor(inches / 12)}′${inches % 12}″`;
}

export function campaignVM(save: SaveData, s: Settings, focusStageId?: string): CampaignVM {
  const chapters = STADIUM_ORDER.map((id, ci) => {
    const def = STADIUMS[id];
    const stages = STAGES.filter((st) => st.chapter === ci + 1);
    const starsSum = stages.reduce((a, st) => a + (save.stages[st.id]?.stars ?? 0), 0);
    return {
      id,
      number: ci + 1,
      name: def.name[s.lang],
      subtitle: def.subtitle[s.lang],
      info: stadiumInfo(id, s),
      timeOfDay: def.timeOfDay,
      accent: def.palette.accent,
      locked: !isStageUnlocked(save, stages[0]!.id),
      stars: starsSum,
      maxStars: stages.length * 3,
      stages: stages.map((st) => ({
        id: st.id,
        label: st.id,
        name: st.name[s.lang],
        stars: save.stages[st.id]?.stars ?? 0,
        locked: !isStageUnlocked(save, st.id),
        boss: !!st.boss,
        completed: !!save.stages[st.id]?.completed,
      })),
    };
  });
  return {
    totalStars: totalStars(save),
    maxStars: MAX_STARS,
    chapters,
    focusStageId: focusStageId ?? nextStageId(save),
    bats: BATS.map((b) => ({
      id: b.id,
      name: b.name[s.lang],
      wood: b.wood,
      grip: b.grip,
      trail: b.trail,
      starsRequired: b.starsRequired,
      locked: !isBatUnlocked(save, b.id),
      selected: save.selectedBat === b.id,
    })),
  };
}

export function stageIntroVM(stage: StageDef, save: SaveData, s: Settings, touch: boolean): StageIntroVM {
  const p = PITCHERS[stage.pitcher]!;
  const t = gameText(s.lang);
  const best = save.stages[stage.id]?.stars ?? 0;
  const arsenal = p.arsenal
    .filter((e) => !stage.arsenal || stage.arsenal.includes(e.type))
    .map((e) => {
      const def = PITCH_TYPES[e.type];
      const off = (e.speedOffset ?? 0) + (stage.speedOffsetMph ?? 0);
      const lo = Math.round(def.speedMph[0] + off);
      const hi = Math.round(def.speedMph[1] + off);
      const sp = s.units === 'metric' ? `${Math.round(lo * MPH * 3.6)}–${Math.round(hi * MPH * 3.6)} km/h` : `${lo}–${hi} mph`;
      return { code: e.type, name: def.name[s.lang], speed: sp, color: def.color };
    });
  return {
    label: stage.id,
    name: stage.name[s.lang],
    stadiumName: STADIUMS[stage.stadium].name[s.lang],
    stadiumInfo: stadiumInfo(stage.stadium, s),
    boss: !!stage.boss,
    pitcher: { name: p.name, nickname: p.nickname[s.lang], handText: t.hand[p.hand], jersey: p.look.jersey, trim: p.look.jerseyTrim, arsenal },
    goal: goalText(stage.goal, s.lang, s.units),
    limit: limitText(stage.limit, s.lang),
    starTexts: [t.complete, starText(stage.stars[0], s.lang, s.units), starText(stage.stars[1], s.lang, s.units)],
    starsMet: [best >= 1, best >= 2, best >= 3],
    tip: stage.tip ? stage.tip[s.lang] : null,
    controls: controlsText(s.controlMode, touch, s.lang),
  };
}

export function practiceVM(save: SaveData, s: Settings, last: PracticeVM['initial'] | null): PracticeVM {
  const unlockedStadiums = [
    ...STADIUM_ORDER.map((id, i) => ({ id, name: STADIUMS[id].name[s.lang], locked: !isStageUnlocked(save, STAGES.find((st) => st.chapter === i + 1)!.id) })),
    ...EXTRA_STADIUMS.map((id) => ({ id, name: STADIUMS[id].name[s.lang], locked: false })),
  ];
  return {
    stadiums: unlockedStadiums,
    pitches: Object.values(PITCH_TYPES).map((p) => ({ id: p.id, name: p.name[s.lang], color: p.color })),
    initial: last ?? { stadium: 'solar', pitches: ['FF', 'CH'], speed: 'normal', location: 'zone', pitcherHand: 'R' },
  };
}

export function derbySetupVM(save: SaveData, s: Settings): DerbySetupVM {
  const t = gameText(s.lang);
  return {
    stadiums: [
      ...STADIUM_ORDER.map((id, i) => ({
        id,
        name: STADIUMS[id].name[s.lang],
        info: stadiumInfo(id, s),
        locked: !isStageUnlocked(save, STAGES.find((st) => st.chapter === i + 1)!.id),
        best: save.derbyBest > 0 ? `${save.derbyBest} HR` : null,
      })),
      ...EXTRA_STADIUMS.map((id) => ({ id, name: STADIUMS[id].name[s.lang], info: stadiumInfo(id, s), locked: false, best: save.derbyBest > 0 ? `${save.derbyBest} HR` : null })),
    ],
    rules: t.derbyRules,
  };
}

export function resultsVM(
  mode: MatchMode,
  session: Session,
  s: Settings,
  opts: { newStars: number; unlockedBats: string[]; derbyNewBest: boolean; hasNext: boolean; coins: CoinLine[]; balance: number; canDouble: boolean; doubled: boolean; game: GameSession | null; rivalName?: string; rivalShort?: string; daily?: { score: number; best: number; newBest: boolean; number: number } },
): ResultsVM {
  const vm = baseResultsVM(mode, session, s, opts);
  const total = opts.coins.reduce((a, l) => a + l.amount, 0) * (opts.doubled ? 2 : 1);
  vm.coins = { lines: opts.coins.map((l) => ({ label: l.label[s.lang], amount: l.amount * (opts.doubled ? 2 : 1) })), total, balance: opts.balance, canDouble: opts.canDouble && !opts.doubled && total > 0, doubled: opts.doubled };
  return vm;
}

function baseResultsVM(
  mode: MatchMode,
  session: Session,
  s: Settings,
  opts: { newStars: number; unlockedBats: string[]; derbyNewBest: boolean; hasNext: boolean; game: GameSession | null; rivalName?: string; rivalShort?: string; daily?: { score: number; best: number; newBest: boolean; number: number } },
): ResultsVM {
  const t = gameText(s.lang);
  const L = t.statsLabels;
  const stats = [
    { label: L.hr, value: String(session.homeRuns) },
    { label: L.longest, value: session.longestHRft > 0 ? dist(session.longestHRft * FT, s.units) : '—' },
    { label: L.maxEv, value: session.maxEVmph > 0 ? speedMph(session.maxEVmph, s.units) : '—' },
    { label: L.barrels, value: String(session.barrels) },
    { label: L.hits, value: String(session.hits) },
    { label: L.swings, value: String(session.swings) },
  ];
  const unlocks = opts.unlockedBats.map((id) => BATS.find((b) => b.id === id)!.name[s.lang]);
  const p = playText(s.lang);
  if (mode.kind === 'game' && opts.game) {
    const g = opts.game;
    const b = g.batting;
    const team = opts.rivalName ?? '';
    const avg = b.atBats > 0 ? (b.hits / b.atBats).toFixed(3).replace(/^0/, '') : '.000';
    const won = g.result === 'win';
    return {
      mode: 'game',
      success: won,
      title: won ? p.win : g.result === 'tie' ? p.tie : session.forfeited ? t.dead : p.loss,
      subtitle: p.winSub(g.you, g.rival, team),
      stars: 0,
      newStars: 0,
      starTexts: ['', '', ''],
      starsMet: [false, false, false],
      stats: [
        { label: p.statsGame.runs, value: String(g.you) },
        { label: p.statsGame.hits, value: String(b.hits) },
        { label: p.statsGame.rbi, value: String(b.rbi) },
        { label: p.statsGame.avg, value: avg },
        { label: L.hr, value: String(b.homeRuns) },
        { label: p.statsGame.k, value: String(b.strikeouts) },
      ],
      unlocks,
      canNext: false,
      shareText: won ? p.gameShare(g.you, g.rival, team) : p.gameShareLoss(g.you, g.rival, team),
      linescore: { away: opts.rivalShort ?? 'RIV', home: p.you, awayLine: g.lineRival, homeLine: g.lineYou, awayTotal: g.rival, homeTotal: g.you },
    };
  }
  if (mode.kind === 'daily' && opts.daily) {
    const st = mode.stage;
    const checks = session.starChecks();
    const stars = session.stars();
    const d = opts.daily;
    return {
      mode: 'daily',
      success: session.success,
      title: `${p.dailyTitle(d.number)} · ${p.dailyScore(d.score)}`,
      subtitle: d.newBest ? p.dailyNewBest : p.dailyBest(d.best),
      stars,
      newStars: 0,
      starTexts: [goalText(st.goal, s.lang, s.units), starText(st.stars[0], s.lang, s.units), starText(st.stars[1], s.lang, s.units)],
      starsMet: checks,
      stats,
      unlocks,
      canNext: false,
      shareText: p.dailyShare(d.number, d.score, session.homeRuns),
    };
  }
  if (mode.kind === 'campaign') {
    const st = mode.stage;
    const checks = session.starChecks();
    const stars = session.stars();
    return {
      mode: 'campaign',
      success: session.success,
      title: session.success ? t.stageCleared : session.forfeited ? t.dead : t.stageFailed,
      subtitle: session.success ? t.stageClearedSub(stars) : session.forfeited ? t.boomSub : t.stageFailedSub,
      stars,
      newStars: opts.newStars,
      starTexts: [goalText(st.goal, s.lang, s.units), starText(st.stars[0], s.lang, s.units), starText(st.stars[1], s.lang, s.units)],
      starsMet: checks,
      stats,
      unlocks,
      canNext: session.success && opts.hasNext,
      shareText: t.share(`${st.id} ${st.name[s.lang]}: ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} · ${session.homeRuns} HR${session.longestHRft ? ` · ${distFt(session.longestHRft, s.units)}` : ''}`),
    };
  }
  if (mode.kind === 'derby') {
    return {
      mode: 'derby',
      success: true,
      title: session.forfeited ? t.dead : t.derbyOver,
      subtitle: `${t.derbyScore(session.homeRuns)}${opts.derbyNewBest ? ` · ${t.derbyNewBest}` : ''}${session.forfeited ? ` · ${t.boomSub}` : ''}`,
      stars: 0,
      newStars: 0,
      starTexts: ['', '', ''],
      starsMet: [false, false, false],
      stats,
      unlocks,
      canNext: false,
      shareText: t.share(`Derby: ${session.homeRuns} HR${session.longestHRft ? ` · ${distFt(session.longestHRft, s.units)}` : ''}`),
    };
  }
  return {
    mode: 'practice',
    success: true,
    title: session.forfeited ? t.dead : t.practice,
    subtitle: `${session.swings} ${L.swings.toLowerCase()}${session.forfeited ? ` · ${t.boomSub}` : ''}`,
    stars: 0,
    newStars: 0,
    starTexts: ['', '', ''],
    starsMet: [false, false, false],
    stats,
    unlocks,
    canNext: false,
    shareText: t.share(`${session.homeRuns} HR`),
  };
}
