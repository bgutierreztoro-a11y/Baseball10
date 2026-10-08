import type { SaveData, Settings, StageDef } from '../contracts';
import { BATS, MAX_STARS, STAGES } from '../config/campaign';
import { FT, MPH } from '../config/constants';
import { PITCHERS, PITCH_TYPES } from '../config/pitches';
import { STADIUMS, STADIUM_ORDER } from '../config/stadiums';
import { controlsText, dist, distFt, gameText, goalText, limitText, speedMph, starText } from '../i18n/game';
import { isBatUnlocked, isStageUnlocked, nextStageId, totalStars } from '../persistence/save';
import type { Session } from '../sim/session';
import type { CampaignVM, DerbySetupVM, PracticeVM, ResultsVM, StageIntroVM, TitleVM } from '../ui/api';
import type { MatchMode } from './Match';

/** Pure builders from game state to UI view-models (localized strings). */

function stadiumInfo(id: keyof typeof STADIUMS, s: Settings): string {
  const st = STADIUMS[id];
  const [lf, , cf, , rf] = st.fence.distancesFt;
  const alt = s.units === 'metric' ? `${st.altitudeM} m` : `${Math.round(st.altitudeM / FT).toLocaleString(s.lang)} ft`;
  return `LF ${distFt(lf, s.units)} · CF ${distFt(cf, s.units)} · RF ${distFt(rf, s.units)} · ${s.lang === 'es' ? 'Alt.' : 'Elev.'} ${alt}`;
}

export function titleVM(save: SaveData, s: Settings): TitleVM {
  const next = nextStageId(save);
  const st = STAGES.find((x) => x.id === next)!;
  const started = Object.keys(save.stages).length > 0;
  return {
    totalStars: totalStars(save),
    maxStars: MAX_STARS,
    derbyBest: save.derbyBest > 0 ? `${save.derbyBest} HR` : null,
    continueLabel: started ? `${st.id} · ${st.name[s.lang]}` : null,
  };
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
  const unlockedStadiums = STADIUM_ORDER.map((id, i) => ({ id, name: STADIUMS[id].name[s.lang], locked: !isStageUnlocked(save, STAGES.find((st) => st.chapter === i + 1)!.id) }));
  return {
    stadiums: unlockedStadiums,
    pitches: Object.values(PITCH_TYPES).map((p) => ({ id: p.id, name: p.name[s.lang], color: p.color })),
    initial: last ?? { stadium: 'solar', pitches: ['FF', 'CH'], speed: 'normal', location: 'zone', pitcherHand: 'R' },
  };
}

export function derbySetupVM(save: SaveData, s: Settings): DerbySetupVM {
  const t = gameText(s.lang);
  return {
    stadiums: STADIUM_ORDER.map((id, i) => ({
      id,
      name: STADIUMS[id].name[s.lang],
      info: stadiumInfo(id, s),
      locked: !isStageUnlocked(save, STAGES.find((st) => st.chapter === i + 1)!.id),
      best: save.derbyBest > 0 ? `${save.derbyBest} HR` : null,
    })),
    rules: t.derbyRules,
  };
}

export function resultsVM(
  mode: MatchMode,
  session: Session,
  s: Settings,
  opts: { newStars: number; unlockedBats: string[]; derbyNewBest: boolean; hasNext: boolean },
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
  if (mode.kind === 'campaign') {
    const st = mode.stage;
    const checks = session.starChecks();
    const stars = session.stars();
    return {
      mode: 'campaign',
      success: session.success,
      title: session.success ? t.stageCleared : t.stageFailed,
      subtitle: session.success ? t.stageClearedSub(stars) : t.stageFailedSub,
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
      title: t.derbyOver,
      subtitle: `${t.derbyScore(session.homeRuns)}${opts.derbyNewBest ? ` · ${t.derbyNewBest}` : ''}`,
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
    title: t.practice,
    subtitle: `${session.swings} ${L.swings.toLowerCase()}`,
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
