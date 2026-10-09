/**
 * UI contract. The UI is a DOM overlay on top of the WebGL canvas
 * (docs/adr/ADR-004-ui-dom-overlay.md). The game composes view-models with
 * already-localized dynamic text; the UI owns only its static chrome strings
 * (buttons, headings, settings labels) in src/ui/strings.ts.
 */
import type { BatterLook, CharacterId, Hand, Lang, PitchTypeId, Settings, StadiumId, TimeOfDay } from '../contracts';

export interface StatVM {
  label: string;
  value: string;
}

export interface TitleVM {
  totalStars: number;
  maxStars: number;
  derbyBest: string | null;
  /** Label of the next stage to play, e.g. "1-3 · Al centro". */
  continueLabel: string | null;
  /** Currently selected batter, e.g. "El Mati". */
  characterName: string;
}

export interface TitleHandlers {
  onContinue(): void;
  onCampaign(): void;
  onPractice(): void;
  onDerby(): void;
  onSettings(): void;
  /** Opens the batter select screen. */
  onCharacters(): void;
}

/** One stat bar on a character card; value is 0..1 relative to the roster. */
export interface CharacterStatVM {
  label: string;
  /** 0..1 (0.5 ≈ base batter). */
  value: number;
  /** Short qualitative text, e.g. "+35 %" or "Base". */
  detail: string;
}

export interface CharacterCardVM {
  id: CharacterId;
  name: string;
  /** Tagline, e.g. "El Gigante de Bratislava". */
  title: string;
  bio: string;
  /** e.g. "7,80 m". */
  height: string;
  look: BatterLook;
  stats: CharacterStatVM[];
  ability: { name: string; description: string } | null;
  selected: boolean;
}

export interface CharactersVM {
  items: CharacterCardVM[];
}

export interface StageNodeVM {
  id: string;
  label: string;
  name: string;
  stars: number;
  locked: boolean;
  boss: boolean;
  completed: boolean;
}

export interface ChapterVM {
  id: StadiumId;
  number: number;
  name: string;
  subtitle: string;
  /** e.g. "LF 310 · CF 395 · RF 330 · 5 m" */
  info: string;
  timeOfDay: TimeOfDay;
  accent: string;
  locked: boolean;
  stars: number;
  maxStars: number;
  stages: StageNodeVM[];
}

export interface BatVM {
  id: string;
  name: string;
  wood: string;
  grip: string;
  trail: string;
  starsRequired: number;
  locked: boolean;
  selected: boolean;
}

export interface CampaignVM {
  totalStars: number;
  maxStars: number;
  chapters: ChapterVM[];
  focusStageId: string;
  bats: BatVM[];
}

export interface CampaignHandlers {
  onSelectStage(id: string): void;
  onSelectBat(id: string): void;
  onBack(): void;
}

export interface ArsenalChipVM {
  code: PitchTypeId;
  name: string;
  speed: string;
  color: string;
}

export interface StageIntroVM {
  label: string;
  name: string;
  stadiumName: string;
  stadiumInfo: string;
  boss: boolean;
  pitcher: {
    name: string;
    nickname: string;
    handText: string;
    jersey: string;
    trim: string;
    arsenal: ArsenalChipVM[];
  };
  goal: string;
  limit: string;
  starTexts: [string, string, string];
  starsMet: [boolean, boolean, boolean];
  tip: string | null;
  controls: string;
}

export interface PracticeConfig {
  stadium: StadiumId;
  pitches: PitchTypeId[];
  speed: 'slow' | 'normal' | 'fast';
  location: 'middle' | 'zone' | 'any';
  pitcherHand: Hand;
}

export interface PracticeVM {
  stadiums: { id: StadiumId; name: string; locked: boolean }[];
  pitches: { id: PitchTypeId; name: string; color: string }[];
  initial: PracticeConfig;
}

export interface DerbySetupVM {
  stadiums: { id: StadiumId; name: string; info: string; locked: boolean; best: string | null }[];
  rules: string;
}

export interface HudVM {
  mode: 'campaign' | 'practice' | 'derby';
  /** "1-3 · Al centro" — the part before " · " renders as a tag. */
  stageLabel: string;
  /** "Jonrones|2/5" — label and value separated by "|". */
  goalText: string;
  /** 0..1 */
  progress: number;
  outs: { left: number; total: number } | null;
  timeLeft: number | null;
  streak: number | null;
  score: string | null;
  powerOn: boolean;
  controlHint: string | null;
  /** Special ability button (El Moro's peak); null when the batter has none. */
  ability: {
    label: string;
    state: 'ready' | 'active' | 'used';
    /** Pitches left while active. */
    pitchesLeft: number | null;
    /** Key/tap hint, e.g. "E". */
    keyHint: string;
  } | null;
}

export interface HudHandlers {
  onPause(): void;
  /** Touch swing button. `timeStamp` = the PointerEvent's timeStamp. */
  onSwing(timeStamp: number): void;
  onPowerToggle(on: boolean): void;
  /** Activates the batter's special ability (touch/click on the HUD button). */
  onAbility(): void;
}

export type HitResultKind = 'homeRun' | 'hit' | 'out' | 'foul' | 'whiff' | 'calledStrike' | 'ball';

export interface HitCardVM {
  result: HitResultKind;
  title: string;
  stats: StatVM[];
  timing: { label: string; ms: number | null; tone: 'perfect' | 'good' | 'early' | 'late' } | null;
  quality: { label: string; tone: 'barrel' | 'solid' | 'weak' } | null;
  /** One-line coaching explanation of WHY the result happened. */
  coach: string | null;
  pitch: string;
  badges: string[];
}

export type CalloutStyle = 'homeRun' | 'info' | 'warning' | 'target' | 'bonus';

export interface PauseHandlers {
  onResume(): void;
  onRestart(): void;
  onSettings(): void;
  onQuit(): void;
}

export interface ResultsVM {
  mode: 'campaign' | 'practice' | 'derby';
  success: boolean;
  title: string;
  subtitle: string;
  stars: number;
  /** Stars that are new compared to the previous best (animated differently). */
  newStars: number;
  starTexts: [string, string, string];
  starsMet: [boolean, boolean, boolean];
  stats: StatVM[];
  unlocks: string[];
  canNext: boolean;
  shareText: string;
}

export interface ResultsHandlers {
  onRetry(): void;
  onNext(): void;
  onMenu(): void;
  onShare(): void;
}

export interface SettingsHandlers {
  onChange(next: Settings): void;
  onCalibrate(): void;
  onResetProgress(): void;
  onBack(): void;
}

export interface CalibrationHandlers {
  /**
   * Starts a metronome of `beats` ticks at `intervalMs`. Returns the expected
   * tap times in the performance.now() clock (audio output latency included).
   */
  startMetronome(beats: number, intervalMs: number): number[];
  /** Called with the measured mean offset (ms, + = player taps late) — or null if cancelled. */
  onDone(offsetMs: number | null): void;
}

export interface UI {
  readonly root: HTMLElement;
  setLanguage(lang: Lang): void;
  /** Show/hide on-screen touch controls (swing / power / pause). */
  setTouchMode(touch: boolean): void;
  showLoading(label: string): void;
  showTitle(vm: TitleVM, h: TitleHandlers): void;
  showCampaign(vm: CampaignVM, h: CampaignHandlers): void;
  showStageIntro(vm: StageIntroVM, h: { onStart(): void; onBack(): void }): void;
  showPractice(vm: PracticeVM, h: { onStart(cfg: PracticeConfig): void; onBack(): void }): void;
  showDerbySetup(vm: DerbySetupVM, h: { onStart(stadium: StadiumId): void; onBack(): void }): void;
  /** Settings open as an overlay (also above the pause menu); close with closeOverlay(). */
  showSettings(settings: Settings, h: SettingsHandlers): void;
  /** Batter select: roster cards with portrait, stats and ability. */
  showCharacters(vm: CharactersVM, h: { onSelect(id: CharacterId): void; onBack(): void }): void;
  closeOverlay(): void;
  showCalibration(h: CalibrationHandlers): void;
  showHUD(vm: HudVM, h: HudHandlers): void;
  updateHUD(vm: HudVM): void;
  showHitCard(vm: HitCardVM): void;
  hideHitCard(): void;
  /** Large transient text in the middle of the screen ("¡SE FUE!"). */
  showCallout(text: string, style: CalloutStyle, sub?: string): void;
  /** Pitch type label shown during/after the pitch; null hides it. */
  showPitchLabel(text: string | null): void;
  /** Contextual coach tip bubble (tutorial). null hides it. */
  showTip(text: string | null): void;
  showPause(h: PauseHandlers): void;
  hidePause(): void;
  showResults(vm: ResultsVM, h: ResultsHandlers): void;
  toast(text: string): void;
  /** Hides every screen (keeps HUD hidden too). */
  clear(): void;
}

export type CreateUI = (mount: HTMLElement, lang: Lang) => UI;
