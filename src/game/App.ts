import * as THREE from 'three';
import type { SaveData, Settings, StadiumId, StageDef } from '../contracts';
import { createAudioEngine } from '../audio/AudioEngine';
import type { AudioEngine } from '../audio/api';
import { BATS, STAGES, stageById } from '../config/campaign';
import { STADIUMS, STADIUM_ORDER } from '../config/stadiums';
import { gameText } from '../i18n/game';
import { InputManager } from '../input/InputManager';
import { defaultSave, detectLang, isStageUnlocked, loadSave, nextStageId, persistSave, recordStage, type KeyValueStore } from '../persistence/save';
import { CameraDirector } from '../render/CameraDirector';
import { Renderer, detectTier } from '../render/Renderer';
import { createUI } from '../ui';
import type { PracticeConfig, UI } from '../ui/api';
import { Match, stadiumFor, type MatchMode, type MatchSummary } from './Match';
import { campaignVM, derbySetupVM, practiceVM, resultsVM, stageIntroVM, titleVM } from './viewModels';
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
  private elapsed = 0;
  private last = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.store = safeStorage();
    this.save = loadSave(this.store, detectLang(navigator.language));
    const s = this.save.settings;
    const tier = s.quality === 'auto' ? detectTier() : s.quality;
    this.renderer = new Renderer(canvas, tier, s.quality === 'auto');
    this.renderer.onQualityChange = () => this.refreshMaterials();
    this.camera = new CameraDirector(this.renderer.camera);
    this.ui = createUI(uiRoot, s.lang);
    this.audio = createAudioEngine();
    this.input = new InputManager(canvas, this.renderer.camera, {
      onSwing: (ts, power) => this.match?.onSwing(ts, power),
      onPause: () => this.togglePause(),
      onConfirm: () => this.match?.confirm(),
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
      this.last = performance.now();
      requestAnimationFrame(this.loop);
    }, 30);
  }

  private loop = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.elapsed += dt;
    this.input.update(dt);
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
    this.world.setHandedness(this.s.handedness);
    const bat = BATS.find((b) => b.id === this.save.selectedBat) ?? BATS[0]!;
    this.world.batter.setBatColors(bat.wood, bat.grip);
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
    this.ui.showTitle(titleVM(this.save, this.s), {
      onContinue: () => this.showStageIntro(stageById(nextStageId(this.save))!),
      onCampaign: () => this.showCampaign(),
      onPractice: () => this.showPractice(),
      onDerby: () => this.showDerby(),
      onSettings: () => this.openSettings(() => this.showTitle()),
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
          },
          (Date.now() ^ (Math.random() * 1e9)) >>> 0,
        );
        this.match.start();
      },
      needsBuild ? 40 : 0,
    );
  }

  private endMatch(): void {
    this.match?.dispose();
    this.match = null;
    this.input.enabled = false;
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
  }

  private onMatchFinished(summary: MatchSummary): void {
    const { mode, session } = summary;
    let newStars = 0;
    let unlockedBats: string[] = [];
    let derbyNewBest = false;
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
    if (mode.kind === 'campaign') {
      const r = recordStage(this.save, mode.stage.id, session.stars(), session.success, session.longestHRft);
      this.save = r.save;
      newStars = r.newStars;
      unlockedBats = r.unlockedBats;
    } else if (mode.kind === 'derby' && session.homeRuns > this.save.derbyBest) {
      derbyNewBest = true;
      this.save = { ...this.save, derbyBest: session.homeRuns };
    }
    this.persist();
    const idx = mode.kind === 'campaign' ? STAGES.findIndex((s) => s.id === mode.stage.id) : -1;
    const next = idx >= 0 ? STAGES[idx + 1] : undefined;
    const vm = resultsVM(mode, session, this.s, { newStars, unlockedBats, derbyNewBest, hasNext: !!next });
    this.endMatch();
    this.ui.showResults(vm, {
      onRetry: () => this.startMatch(mode),
      onNext: () => (next ? this.showStageIntro(next) : this.showCampaign()),
      onMenu: () => (mode.kind === 'campaign' ? this.showCampaign(mode.stage.id) : this.showTitle()),
      onShare: () => void this.share(vm.shareText),
    });
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

  private async share(text: string): Promise<void> {
    const url = location.href.split('#')[0] ?? '';
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      this.ui.toast(gameText(this.s.lang).copied);
    } catch {
      /* user cancelled */
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
