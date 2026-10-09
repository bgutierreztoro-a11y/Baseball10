import type { Lang, SaveData, Settings, StageProgress } from '../contracts';
import { BATS, STAGES } from '../config/campaign';

/**
 * Local-first persistence (docs/adr/ADR-007-local-persistence.md).
 * One versioned JSON document in localStorage. Every read goes through
 * `migrate()`, which tolerates missing/corrupt data and older versions, so a
 * bad save can never brick the game.
 */
export const SAVE_KEY = 'jonron.save';
export const SAVE_VERSION = 1;

/** Minimal storage surface (localStorage or an in-memory fake in tests). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function detectLang(language: string | undefined): Lang {
  return language && language.toLowerCase().startsWith('en') ? 'en' : 'es';
}

export function defaultSettings(lang: Lang = 'es'): Settings {
  return {
    lang,
    controlMode: 'pro',
    handedness: 'R',
    quality: 'auto',
    units: 'imperial',
    volume: { master: 0.8, sfx: 0.9, music: 0.6, crowd: 0.7 },
    latencyMs: 0,
    reducedMotion: false,
    pitchTrail: true,
    showTimingMs: true,
    showPitchType: false,
    pitchHint: true,
    aimAssist: true,
  };
}

export function defaultSave(lang: Lang = 'es'): SaveData {
  return {
    version: SAVE_VERSION,
    settings: defaultSettings(lang),
    stages: {},
    stats: { swings: 0, homeRuns: 0, barrels: 0, longestHRft: 0, maxEVmph: 0 },
    derbyBest: 0,
    selectedBat: BATS[0]!.id,
    seenTips: [],
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);

/** Validates and upgrades any input into a well-formed current-version save. */
export function migrate(raw: unknown, lang: Lang = 'es'): SaveData {
  const base = defaultSave(lang);
  if (!isObj(raw)) return base;

  const s = isObj(raw.settings) ? raw.settings : {};
  const vol = isObj(s.volume) ? s.volume : {};
  const d = base.settings;
  const settings: Settings = {
    lang: oneOf(s.lang, ['es', 'en'] as const, d.lang),
    controlMode: oneOf(s.controlMode, ['pro', 'casual'] as const, d.controlMode),
    handedness: oneOf(s.handedness, ['R', 'L'] as const, d.handedness),
    quality: oneOf(s.quality, ['auto', 'low', 'medium', 'high'] as const, d.quality),
    units: oneOf(s.units, ['imperial', 'metric'] as const, d.units),
    volume: {
      master: num(vol.master, d.volume.master, 0, 1),
      sfx: num(vol.sfx, d.volume.sfx, 0, 1),
      music: num(vol.music, d.volume.music, 0, 1),
      crowd: num(vol.crowd, d.volume.crowd, 0, 1),
    },
    latencyMs: num(s.latencyMs, d.latencyMs, -150, 150),
    reducedMotion: bool(s.reducedMotion, d.reducedMotion),
    pitchTrail: bool(s.pitchTrail, d.pitchTrail),
    showTimingMs: bool(s.showTimingMs, d.showTimingMs),
    showPitchType: bool(s.showPitchType, d.showPitchType),
    pitchHint: bool(s.pitchHint, d.pitchHint),
    aimAssist: bool(s.aimAssist, d.aimAssist),
  };

  const stages: Record<string, StageProgress> = {};
  if (isObj(raw.stages)) {
    for (const st of STAGES) {
      const p = raw.stages[st.id];
      if (!isObj(p)) continue;
      stages[st.id] = {
        stars: Math.round(num(p.stars, 0, 0, 3)),
        completed: bool(p.completed, false),
        bestLongestFt: num(p.bestLongestFt, 0, 0, 1000),
      };
    }
  }

  const st = isObj(raw.stats) ? raw.stats : {};
  const selected = typeof raw.selectedBat === 'string' && BATS.some((b) => b.id === raw.selectedBat) ? raw.selectedBat : base.selectedBat;

  return {
    version: SAVE_VERSION,
    settings,
    stages,
    stats: {
      swings: num(st.swings, 0, 0),
      homeRuns: num(st.homeRuns, 0, 0),
      barrels: num(st.barrels, 0, 0),
      longestHRft: num(st.longestHRft, 0, 0, 1000),
      maxEVmph: num(st.maxEVmph, 0, 0, 200),
    },
    derbyBest: num(raw.derbyBest, 0, 0),
    selectedBat: selected,
    seenTips: Array.isArray(raw.seenTips) ? raw.seenTips.filter((x): x is string => typeof x === 'string') : [],
  };
}

export function loadSave(store: KeyValueStore | null, lang: Lang = 'es'): SaveData {
  if (!store) return defaultSave(lang);
  try {
    const text = store.getItem(SAVE_KEY);
    return text ? migrate(JSON.parse(text), lang) : defaultSave(lang);
  } catch {
    return defaultSave(lang);
  }
}

export function persistSave(store: KeyValueStore | null, data: SaveData): boolean {
  if (!store) return false;
  try {
    store.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function totalStars(save: SaveData): number {
  return Object.values(save.stages).reduce((s, p) => s + p.stars, 0);
}

/** Linear campaign: a stage unlocks when the previous one is completed. */
export function isStageUnlocked(save: SaveData, stageId: string): boolean {
  const i = STAGES.findIndex((s) => s.id === stageId);
  if (i <= 0) return i === 0;
  return !!save.stages[STAGES[i - 1]!.id]?.completed;
}

export function nextStageId(save: SaveData): string {
  const next = STAGES.find((s) => !save.stages[s.id]?.completed);
  return (next ?? STAGES[STAGES.length - 1]!).id;
}

export interface StageRecordResult {
  save: SaveData;
  newStars: number;
  unlockedBats: string[];
  firstClear: boolean;
}

/** Applies a stage result immutably; keeps best stars/distances. */
export function recordStage(save: SaveData, stageId: string, stars: number, success: boolean, longestFt: number): StageRecordResult {
  const prev = save.stages[stageId] ?? { stars: 0, completed: false, bestLongestFt: 0 };
  const before = totalStars(save);
  const next: StageProgress = {
    stars: Math.max(prev.stars, success ? stars : 0),
    completed: prev.completed || success,
    bestLongestFt: Math.max(prev.bestLongestFt, longestFt),
  };
  const updated: SaveData = { ...save, stages: { ...save.stages, [stageId]: next } };
  const after = totalStars(updated);
  const unlockedBats = BATS.filter((b) => b.starsRequired > before && b.starsRequired <= after).map((b) => b.id);
  return { save: updated, newStars: next.stars - prev.stars, unlockedBats, firstClear: success && !prev.completed };
}

export function isBatUnlocked(save: SaveData, batId: string): boolean {
  const bat = BATS.find((b) => b.id === batId);
  return !!bat && totalStars(save) >= bat.starsRequired;
}
