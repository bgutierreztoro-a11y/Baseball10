import * as THREE from 'three';
import type { CharacterId, CustomCharacter, SaveData, Settings, StadiumId, StageDef } from '../contracts';
import { createAdService, type AdService } from '../ads';
import { setCustomCharacterDefs } from '../config/characters';
import { PRESETS, customToDef, missingParts, newCustomId, randomCustom, sanitizeCustom, setRating, slotsOwned, unlockCost, withBat, withBody, PARTS, MAX_SLOTS, type BatChoice } from '../config/creator';
import { dailyNumber, dailyScore, dailyStage } from '../config/daily';
import { dayKey, daysBetween, matchCoins, totalCoins, type CoinInput } from '../config/economy';
import { rivalById } from '../config/rivals';
import { Rng } from '../core/rng';
import { playText } from '../i18n/play';
import { STRINGS } from '../ui/strings';
import { createAudioEngine } from '../audio/AudioEngine';
import type { AudioEngine } from '../audio/api';
import { BATS, STAGES, stageById } from '../config/campaign';
import { characterById } from '../config/characters';
import { STADIUMS, STADIUM_ORDER } from '../config/stadiums';
import { gameText } from '../i18n/game';
import { InputManager } from '../input/InputManager';
import { addCoins, buyParts, claimDailyBonus, defaultSave, deleteCustom, detectLang, isStageUnlocked, loadSave, nextStageId, persistSave, recordStage, upsertCustom, type KeyValueStore } from '../persistence/save';
import { CameraDirector } from '../render/CameraDirector';
import { Renderer, detectTier } from '../render/Renderer';
import { createUI } from '../ui';
import type { GameSetupVM, PracticeConfig, ResultsVM, UI } from '../ui/api';
import { Match, stadiumFor, type MatchMode, type MatchSummary } from './Match';
import { campaignVM, charactersVM, creatorVM, derbySetupVM, gameSetupVM, practiceVM, resultsVM, stageIntroVM, titleVM } from './viewModels';
import { World } from './World';

/**
 * Application shell: owns the long-lived services (renderer, camera, UI,
 * audio, input, save) and the screen flow. A Match is created per session.
 *
 *   Title ─┬─ Campaign map ─ Stage intro ─ Match ─ Results ─┐
 *          ├─ Practice setup ─ Match ─ Results ───────────────┤
 *          ├─ Derby setup ─ Match ─ Results ──────────────────┤
 *          └─ Settings / Calibration                          │
 *          ◄──────────────────────────────────────────────────┘
 */
export class App {
  private readonly renderer: Renderer;
  private readonly camera: CameraDirector;
  private readonly ui: UI;
  private readonly audio: AudioEngine;
  private readonly input: InputManager;
  private readonly store: KeyValueStore | null;
  private save: SaveData;
  private world: World | null = null;
  private match: Match | null = null;
  private lastMode: MatchMode | null = null;
  private lastPractice: PracticeConfig | null = null;
  private lastGame: GameSetupVM['initial'] | null = null;
  private readonly ads: AdService;
  private previewQueued: CustomCharacter | null = null;
  private transitioning = false;
  private elapsed = 0;
  private last = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.store = safeStorage();
    this.save = loadSave(this.store, detectLang(navigator.language));
    this.syncCustoms();
    const s = this.save.settings;
    const tier = s.quality === 'auto' ? detectTier() : s.quality;
    this.renderer = new Renderer(canvas, tier, s.quality === 'auto');
    this.renderer.onQualityChange = () => this.refreshMaterials();
    this.camera = new CameraDirector(this.renderer.camera);
    this.ui = createUI(uiRoot, s.lang);
    this.audio = createAudioEngine();
    this.ads = createAdService({ lang: () => this.s.lang, sound: () => this.s.volume.master > 0 });
    this.ads.setHooks({ onAdStart: () => this.audio.setSuspended(true), onAdEnd: () => this.audio.setSuspended(false) });
    this.input = new InputManager(canvas, this.renderer.camera, {
      onSwing: (ts, power) => this.match?.onSwing(ts, power),
      onPause: () => this.togglePause(),
      onConfirm: () => this.match?.confirm(),
      onAbility: () => this.match?.activateAbility(),
    });
    this.applySettings(s, true);

    const unlock = (): void => {
      void this.audio.unlock().then(() => this.audio.setVolumes(this.save.settings.volume));
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('resize', () => this.renderer.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.match && !this.match.isPaused) this.openPause();
        this.audio.setSuspended(true);
      } else this.audio.setSuspended(false);
    });
  }

  private get s(): Settings {
    return this.save.settings;
  }

  start(): void {
    this.ui.showLoading(gameText(this.s.lang).loading);
    // Let the loading screen paint before generating the ballpark.
    window.setTimeout(() => {
      this.ensureWorld(this.featuredStadium());
      this.showTitle();
      this.ads.loadingFinished();
      const bonus = claimDailyBonus(this.save, dayKey());
      if (bonus.amount > 0) {
        this.save = bonus.save;
        this.persist();
        window.setTimeout(() => this.ui.toast(playText(this.s.lang).dailyBonus(bonus.amount)), 900);
        this.showTitle();
      }
      this.last = performance.now();
      requestAnimationFrame(this.loop);
    }, 30);
  }

  private loop = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.elapsed += dt;
    this.input.update(dt);
    if (this.previewQueued) {
      // Creator: rebuild the batter at most once per frame.
      const d = this.previewQueued;
      this.previewQueued = null;
      this.world?.setCharacter(customToDef(d), true);
      this.world?.setHandedness(this.s.handedness);
      this.camera.studioHeight = d.look.heightM;
      if (this.world) this.camera.studioRecenter(this.world.batter.root.position);
    }
    this.match?.update(dt, now);
    this.camera.update(dt, this.match?.ballForCamera ?? null);
    this.world?.update(dt, this.elapsed, this.match?.crowdExcitement ?? 0.2, this.renderer.camera);
    this.renderer.render(dt);
    requestAnimationFrame(this.loop);
  };

  // ── World management ──

  private featuredStadium(): StadiumId {
    let best: StadiumId = 'malecon';
    STADIUM_ORDER.forEach((id, i) => {
      const first = STAGES.find((st) => st.chapter === i + 1)!;
      if (isStageUnlocked(this.save, first.id) && i > 0) best = id;
    });
    return best;
  }

  private ensureWorld(id: StadiumId): World {
    if (this.world && this.world.def.id === id && this.world.quality.tier === this.renderer.quality.tier) return this.world;
    this.world?.dispose();
    this.world = new World(this.renderer, STADIUMS[id]);
    const bat = BATS.find((b) => b.id === this.save.selectedBat) ?? BATS[0]!;
    this.world.batter.setBatColors(bat.wood, bat.grip);
    this.world.setCharacter(characterById(this.save.selectedCharacter));
    this.world.setHandedness(this.s.handedness);
    return this.world;
  }

  private refreshMaterials(): void {
    this.renderer.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.Material | THREE.Material[];
        (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
      }
    });
  }

  private persist(): void {
    persistSave(this.store, this.save);
  }

  /** Created players become playable characters (looked up by id everywhere). */
  private syncCustoms(): void {
    setCustomCharacterDefs(this.save.customCharacters.map(customToDef));
  }

  private tx(key: keyof typeof STRINGS.es, values?: Record<string, string | number>): string {
    let str: string = STRINGS[this.s.lang][key];
    if (values) for (const [k, v] of Object.entries(values)) str = str.replace(`{${k}}`, String(v));
    return str;
  }

  // ── Settings ──

  private applySettings(next: Settings, initial = false): void {
    const prev = this.save.settings;
    this.save = { ...this.save, settings: next };
    this.ui.setLanguage(next.lang);
    this.ui.setTouchMode(this.input.isTouch);
    this.audio.setVolumes(next.volume);
    this.camera.reducedMotion = next.reducedMotion;
    document.documentElement.classList.toggle('reduced-motion', next.reducedMotion);
    if (!initial && (prev.quality !== next.quality)) {
      const tier = next.quality === 'auto' ? detectTier() : next.quality;
      this.renderer.setQuality(tier, next.quality === 'auto');
      if (this.world && !this.match) this.ensureWorld(this.world.def.id);
      this.refreshMaterials();
    }
    if (this.world && prev.handedness !== next.handedness) this.world.setHandedness(next.handedness);
    this.persist();
  }

  private openSettings(onBack: () => void): void {
    this.ui.showSettings(this.s, {
      onChange: (next) => {
        const langChanged = next.lang !== this.s.lang;
        this.applySettings(next);
        if (langChanged) {
          this.ui.closeOverlay();
          this.openSettings(onBack);
        }
      },
      onCalibrate: () => this.openCalibration(onBack),
      onResetProgress: () => {
        this.save = { ...defaultSave(this.s.lang), settings: this.s };
        this.persist();
        this.syncCustoms();
        this.world?.setCharacter(characterById(this.save.selectedCharacter));
        this.ui.toast(gameText(this.s.lang).resetDone);
      },
      onBack: () => {
        this.ui.closeOverlay();
        onBack();
      },
    });
  }

  private openCalibration(onBack: () => void): void {
    void this.audio.unlock();
    this.ui.showCalibration({
      startMetronome: (beats, intervalMs) => {
        const lead = 0.6;
        const t0 = this.audio.now() + lead;
        const perf0 = performance.now() + lead * 1000 + this.audio.outputLatency() * 1000;
        const times: number[] = [];
        for (let i = 0; i < beats; i++) {
          this.audio.scheduleTick(t0 + (i * intervalMs) / 1000, i % 4 === 0);
          times.push(perf0 + i * intervalMs);
        }
        return times;
      },
      onDone: (ms) => {
        if (ms !== null) {
          this.applySettings({ ...this.s, latencyMs: Math.max(-150, Math.min(150, ms)) });
          this.ui.toast(gameText(this.s.lang).calibrated(this.s.latencyMs));
        }
        this.openSettings(onBack);
      },
    });
  }

  // ── Screens ──

  private showTitle(): void {
    this.endMatch();
    const w = this.ensureWorld(this.world?.def.id ?? this.featuredStadium());
    w.setPlayersVisible(true);
    w.zone.setVisible(false, false);
    w.ball.setVisible(false);
    w.stadium.setTargets([]);
    this.camera.setTitle();
    this.audio.setCrowdLevel(0.25);
    this.ui.showTitle(titleVM(this.save, this.s, dayKey()), {
      onContinue: () => this.showStageIntro(stageById(nextStageId(this.save))!),
      onCampaign: () => this.showCampaign(),
      onPractice: () => this.showPractice(),
      onDerby: () => this.showDerby(),
      onSettings: () => this.openSettings(() => this.showTitle()),
      onCharacters: () => this.showCharacters(),
      onGame: () => this.showGameSetup(),
      onDaily: () => this.showDaily(),
      onStudio: () => this.openCreator(null, () => this.showTitle()),
    });
  }

  private showGameSetup(): void {
    this.endMatch();
    this.ui.showGameSetup(gameSetupVM(this.save, this.s, this.lastGame), {
      onStart: (cfg) => {
        this.lastGame = cfg;
        this.startMatch({ kind: 'game', config: cfg });
      },
      onBack: () => this.showTitle(),
    });
  }

  private showDaily(): void {
    this.endMatch();
    const day = dayKey();
    const stage = dailyStage(day);
    const p = playText(this.s.lang);
    const vm = stageIntroVM(stage, this.save, this.s, this.input.isTouch);
    const best = this.save.daily.best[day] ?? 0;
    vm.label = `#${dailyNumber(day)}`;
    vm.tip = `${stage.tip ? stage.tip[this.s.lang] : ''}${best > 0 ? ` ${p.dailyBest(best)}.` : ''}`;
    vm.starsMet = [false, false, false];
    this.ui.showStageIntro(vm, {
      onStart: () => this.startMatch({ kind: 'daily', stage, day }),
      onBack: () => this.showTitle(),
    });
  }

  /**
   * Player Studio. `id` = edit that created player, null = a new one (needs
   * a free slot: offers to buy one with Fichas when they are all used).
   */
  private openCreator(id: CharacterId | null, back: () => void): void {
    this.endMatch();
    const existing = id ? this.save.customCharacters.find((c) => c.id === id) : undefined;
    if (!existing && this.save.customCharacters.length >= slotsOwned(this.save.owned)) {
      const next = slotsOwned(this.save.owned) + 1;
      if (next > MAX_SLOTS) {
        this.ui.toast(this.tx('slotsFull'));
        return;
      }
      const part = `slot-${next}`;
      const price = PARTS[part]!.price;
      void this.ui.showConfirm({ title: this.tx('slotsFull'), body: this.tx('buySlot', { n: price }), yes: this.tx('yes'), no: this.tx('no') }).then((ok) => {
        if (!ok) return;
        const bought = buyParts(this.save, [part]);
        if (!bought) {
          this.ui.toast(this.tx('notEnough', { n: price - this.save.coins }));
          return;
        }
        this.save = bought;
        this.persist();
        this.openCreator(null, back);
      });
      return;
    }
    const w = this.ensureWorld(this.world?.def.id ?? this.featuredStadium());
    const draft: CustomCharacter = existing ? structuredClone(existing) : randomCustom(new Rng(Date.now() >>> 0), newCustomId(this.save.customCharacters), this.save.owned);
    w.setPlayersVisible(true);
    w.setStudio(true);
    w.setGameMode(null, null);
    w.zone.setVisible(false, false);
    w.ball.setVisible(false);
    const center = (): { x: number; y: number; z: number } => {
      const p = w.batter.root.position;
      return { x: p.x, y: 0, z: p.z };
    };
    const restore = (): void => {
      this.previewQueued = null;
      this.world?.setStudio(false);
      this.world?.setCharacter(characterById(this.save.selectedCharacter), true);
      this.world?.setHandedness(this.s.handedness);
      this.camera.setTitle();
    };
    this.previewQueued = draft;
    this.ui.showCreator(creatorVM(this.save, this.s, draft, !existing), {
      onChange: (d) => (this.previewQueued = d),
      onRandom: () => randomCustom(new Rng((Date.now() ^ (Math.random() * 1e9)) >>> 0), draft.id, this.save.owned),
      onPreset: (pid, d) => PRESETS.find((x) => x.id === pid)?.apply(d) ?? d,
      onBuy: (parts) => {
        const r = buyParts(this.save, parts);
        if (!r) return null;
        this.save = r;
        this.persist();
        this.audio.uiClick();
        return { coins: r.coins, owned: [...r.owned] };
      },
      onSave: (d) => {
        const fixed = sanitizeCustom(d);
        if (!fixed || missingParts(fixed, this.save.owned).length) return;
        this.save = { ...upsertCustom(this.save, fixed), selectedCharacter: fixed.id };
        this.persist();
        this.syncCustoms();
        this.audio.crowdReaction('cheer');
        this.ui.toast(this.tx('saved', { name: fixed.name }));
        restore();
        this.showCharacters();
      },
      onSpin: (a) => this.camera.studio(a, center()),
      onBack: () => {
        restore();
        back();
      },
      check: (d) => {
        const missing = missingParts(d, this.save.owned);
        return { missing, cost: unlockCost(missing) };
      },
      rate: (d, k, v) => ({ ...d, ratings: setRating(d.ratings, k, v) }),
      withBat: (d, bat) => ({ ...d, look: withBat(d.look, bat as BatChoice) }),
      withBody: (d, body) => ({ ...d, look: withBody(d.look, body) }),
    });
  }

  private showCharacters(): void {
    this.endMatch();
    this.camera.setTitle();
    this.ui.showCharacters(charactersVM(this.save, this.s), {
      onSelect: (id) => {
        this.audio.uiClick();
        this.save = { ...this.save, selectedCharacter: id };
        this.persist();
        this.world?.setCharacter(characterById(id));
        this.showCharacters();
      },
      onBack: () => this.showTitle(),
      onCreate: () => this.openCreator(null, () => this.showCharacters()),
      onEdit: (id) => this.openCreator(id, () => this.showCharacters()),
      onDelete: (id) => {
        this.save = deleteCustom(this.save, id);
        this.persist();
        this.syncCustoms();
        this.world?.setCharacter(characterById(this.save.selectedCharacter), true);
        this.showCharacters();
      },
    });
  }

  private showCampaign(focus?: string): void {
    this.endMatch();
    this.camera.setTitle();
    this.world?.zone.setVisible(false, false);
    this.ui.showCampaign(campaignVM(this.save, this.s, focus), {
      onSelectStage: (id) => {
        this.audio.uiClick();
        this.showStageIntro(stageById(id)!);
      },
      onSelectBat: (id) => {
        this.save = { ...this.save, selectedBat: id };
        this.persist();
        const bat = BATS.find((b) => b.id === id)!;
        this.world?.batter.setBatColors(bat.wood, bat.grip);
        this.showCampaign(focus);
      },
      onBack: () => this.showTitle(),
    });
  }

  private showStageIntro(stage: StageDef): void {
    this.endMatch();
    this.ui.showStageIntro(stageIntroVM(stage, this.save, this.s, this.input.isTouch), {
      onStart: () => this.startMatch({ kind: 'campaign', stage }),
      onBack: () => this.showCampaign(stage.id),
    });
  }

  private showPractice(): void {
    this.endMatch();
    this.ui.showPractice(practiceVM(this.save, this.s, this.lastPractice), {
      onStart: (cfg) => {
        this.lastPractice = cfg;
        this.startMatch({ kind: 'practice', config: cfg });
      },
      onBack: () => this.showTitle(),
    });
  }

  private showDerby(): void {
    this.endMatch();
    this.ui.showDerbySetup(derbySetupVM(this.save, this.s), {
      onStart: (stadium) => this.startMatch({ kind: 'derby', stadium }),
      onBack: () => this.showTitle(),
    });
  }

  // ── Matches ──

  private startMatch(mode: MatchMode): void {
    this.endMatch();
    this.lastMode = mode;
    const def = stadiumFor(mode);
    const needsBuild = !this.world || this.world.def.id !== def.id;
    if (needsBuild) this.ui.showLoading(gameText(this.s.lang).loading);
    window.setTimeout(
      () => {
        const world = this.ensureWorld(def.id);
        world.warmUp();
        const firstTime = mode.kind === 'campaign' && mode.stage.id === '1-1' && !this.save.seenTips.includes('first');
        if (firstTime) {
          this.save = { ...this.save, seenTips: [...this.save.seenTips, 'first'] };
          this.persist();
        }
        this.ui.clear();
        this.match = new Match(
          mode,
          {
            world,
            camera: this.camera,
            input: this.input,
            ui: this.ui,
            audio: this.audio,
            settings: () => this.s,
            onFinished: (summary) => this.onMatchFinished(summary),
            onPause: () => this.togglePause(),
            firstTime,
            character: characterById(this.save.selectedCharacter),
            offerContinue: (kind) => this.offerContinue(kind),
          },
          (Date.now() ^ (Math.random() * 1e9)) >>> 0,
        );
        this.match.start();
        this.ads.matchStarted();
        this.ads.gameplayStart();
      },
      needsBuild ? 40 : 0,
    );
  }

  private endMatch(): void {
    this.match?.dispose();
    this.match = null;
    this.input.enabled = false;
    this.ads.gameplayStop();
  }

  /** Rewarded second chance: asks first, then shows the ad. */
  private async offerContinue(kind: 'outs' | 'time'): Promise<boolean> {
    const offer = await this.ads.offerReward('continue');
    if (!offer) return false;
    const p = playText(this.s.lang);
    const yes = await this.ui.showConfirm({ title: p.continueTitle, body: p.continueBody(kind === 'outs' ? p.continueOuts : p.continueTime), yes: p.continueYes, no: p.continueNo, tag: this.tx('adTag') });
    if (!yes) return false;
    return offer.show();
  }

  /** Natural break between matches (interstitial, if the policy allows), then go on. */
  private betweenMatches(next: () => void): void {
    if (this.transitioning) return;
    this.transitioning = true;
    void this.ads.naturalBreak('betweenMatches', this.save.adsRemoved).then(() => {
      this.transitioning = false;
      next();
    });
  }

  private togglePause(): void {
    if (!this.match) return;
    if (this.match.isPaused) this.closePause();
    else this.openPause();
  }

  private openPause(): void {
    const m = this.match;
    if (!m) return;
    m.pause();
    this.ads.gameplayStop();
    this.audio.setCrowdLevel(0.15);
    this.ui.showPause({
      onResume: () => this.closePause(),
      onRestart: () => {
        this.ui.hidePause();
        if (this.lastMode) this.startMatch(this.lastMode);
      },
      onSettings: () => {
        this.ui.hidePause();
        this.openSettings(() => this.openPause());
      },
      onQuit: () => {
        this.ui.hidePause();
        const mode = this.lastMode;
        if (mode?.kind === 'campaign') this.showCampaign(mode.stage.id);
        else this.showTitle();
      },
    });
  }

  private closePause(): void {
    this.ui.hidePause();
    this.match?.resume();
    if (this.match) this.ads.gameplayStart();
  }

  private onMatchFinished(summary: MatchSummary): void {
    const { mode, session, game } = summary;
    let newStars = 0;
    let unlockedBats: string[] = [];
    let derbyNewBest = false;
    let firstClear = false;
    const stats = this.save.stats;
    this.save = {
      ...this.save,
      stats: {
        swings: stats.swings + session.swings,
        homeRuns: stats.homeRuns + session.homeRuns,
        barrels: stats.barrels + session.barrels,
        longestHRft: Math.max(stats.longestHRft, session.longestHRft),
        maxEVmph: Math.max(stats.maxEVmph, session.maxEVmph),
      },
    };
    const coinIn: CoinInput = { mode: mode.kind, homeRuns: session.homeRuns, hits: session.hits, barrels: session.barrels };
    let daily: { score: number; best: number; newBest: boolean; number: number } | undefined;
    if (mode.kind === 'campaign') {
      const r = recordStage(this.save, mode.stage.id, session.stars(), session.success, session.longestHRft);
      this.save = r.save;
      newStars = r.newStars;
      unlockedBats = r.unlockedBats;
      firstClear = r.firstClear;
      coinIn.newStars = newStars;
      coinIn.firstClear = firstClear;
    } else if (mode.kind === 'derby' && session.homeRuns > this.save.derbyBest) {
      derbyNewBest = true;
      this.save = { ...this.save, derbyBest: session.homeRuns };
    } else if (mode.kind === 'game' && game) {
      const gs = this.save.gameStats;
      const won = game.result === 'win';
      this.save = {
        ...this.save,
        gameStats: {
          played: gs.played + 1,
          won: gs.won + (won ? 1 : 0),
          runs: gs.runs + game.you,
          hits: gs.hits + game.batting.hits,
          rbi: gs.rbi + game.batting.rbi,
          extraBases: gs.extraBases + summary.extraBases,
          walkOffs: gs.walkOffs + (summary.walkOff ? 1 : 0),
        },
      };
      coinIn.hits = game.batting.hits;
      coinIn.homeRuns = game.batting.homeRuns;
      coinIn.game = { won, runs: game.you, extraBases: summary.extraBases, walkOff: summary.walkOff };
    } else if (mode.kind === 'daily') {
      const d = this.save.daily;
      const score = dailyScore({ homeRuns: session.homeRuns, longestHRft: session.longestHRft, barrels: session.barrels, success: session.success, stars: session.stars() });
      const prevBest = d.best[mode.day] ?? 0;
      const streak = d.lastDay === mode.day ? d.streak : d.lastDay && daysBetween(d.lastDay, mode.day) === 1 ? d.streak + 1 : 1;
      const paidKey = `dailyPaid:${mode.day}`;
      const pay = session.success && !this.save.seenTips.includes(paidKey);
      this.save = {
        ...this.save,
        daily: { lastDay: mode.day, streak, best: { ...d.best, [mode.day]: Math.max(prevBest, score) } },
        seenTips: pay ? [...this.save.seenTips.filter((x) => !x.startsWith('dailyPaid:')), paidKey] : this.save.seenTips,
      };
      if (pay) coinIn.daily = { completed: true, streak };
      daily = { score, best: Math.max(prevBest, score), newBest: score > prevBest, number: dailyNumber(mode.day) };
    }
    const lines = matchCoins(coinIn);
    const earned = totalCoins(lines);
    this.save = addCoins(this.save, earned);
    this.persist();
    this.ads.matchFinished();
    const idx = mode.kind === 'campaign' ? STAGES.findIndex((s) => s.id === mode.stage.id) : -1;
    const next = idx >= 0 ? STAGES[idx + 1] : undefined;
    const rival = mode.kind === 'game' ? rivalById(mode.config.rival) : null;
    let doubled = false;
    const build = (): ResultsVM =>
      resultsVM(mode, session, this.s, {
        newStars,
        unlockedBats,
        derbyNewBest,
        hasNext: !!next,
        coins: lines,
        balance: this.save.coins,
        canDouble: this.ads.enabled && this.ads.policy.canOfferReward('doubleCoins'),
        doubled,
        game,
        rivalName: rival?.name[this.s.lang],
        rivalShort: rival?.short,
        daily,
      });
    let vm = build();
    this.endMatch();
    const show = (): void =>
      this.ui.showResults(vm, {
        onRetry: () => this.betweenMatches(() => this.startMatch(mode)),
        onNext: () => this.betweenMatches(() => (next ? this.showStageIntro(next) : this.showCampaign())),
        onMenu: () => (mode.kind === 'campaign' ? this.showCampaign(mode.stage.id) : this.showTitle()),
        onShare: () => void this.share(vm.shareText),
        onDoubleCoins: () => void doubleCoins(),
      });
    const doubleCoins = async (): Promise<void> => {
      const offer = await this.ads.offerReward('doubleCoins');
      if (!offer) {
        this.ui.toast(playText(this.s.lang).noAd);
        return;
      }
      if (await offer.show()) {
        doubled = true;
        this.save = addCoins(this.save, earned);
        this.persist();
        this.ui.toast(playText(this.s.lang).doubled);
      }
      vm = build();
      show();
    };
    show();
  }


  /** Test hook: current match state + the pitch crossing projected to client pixels. */
  debug(): Record<string, unknown> | null {
    if (!this.match) return null;
    const st = this.match.debugState();
    let screen: { x: number; y: number } | null = null;
    if (st.cross) {
      const v = new THREE.Vector3(st.cross.x, st.cross.y, st.cross.z).project(this.renderer.camera);
      const r = this.renderer.gl.domElement.getBoundingClientRect();
      screen = { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    }
    return { ...st, screen, homeRuns: this.match.session.homeRuns, swings: this.match.session.swings };
  }

  /** Web Share → clipboard → show the text, whichever the browser allows. */
  private async share(text: string): Promise<void> {
    const url = location.href.split('#')[0] ?? '';
    const full = `${text} ${url}`.trim();
    // Clipboard first while the click's user activation is still fresh.
    try {
      await navigator.clipboard.writeText(full);
      this.ui.toast(gameText(this.s.lang).copied);
    } catch {
      this.ui.toast(text);
    }
    try {
      if (navigator.share) await navigator.share({ text, url });
    } catch {
      /* blocked or cancelled: the text is already on the clipboard or on screen */
    }
  }
}

function safeStorage(): KeyValueStore | null {
  try {
    const k = '__jonron_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    return null;
  }
}
