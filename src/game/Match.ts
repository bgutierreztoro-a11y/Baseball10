import type { BattedBall, Hand, PitchPlan, PitchTypeId, PitcherDef, Settings, StadiumDef, StageDef, SwingEvaluation, SwingKind, TargetDef, Vec3 } from '../contracts';
import type { AudioEngine } from '../audio/api';
import { FT, MPH, STRIKE_ZONE } from '../config/constants';
import { PITCHERS } from '../config/pitches';
import { STADIUMS } from '../config/stadiums';
import { clamp, damp, smoothstep } from '../core/math';
import { Rng } from '../core/rng';
import { coachLine, dist, gameText, pitchLine, speed } from '../i18n/game';
import type { InputManager } from '../input/InputManager';
import type { CameraDirector } from '../render/CameraDirector';
import { HOME_RUN_UNDERCUT, SWING_PROFILES, evaluateSwing } from '../sim/contact';
import { choosePitch, type PitchSelectorConfig } from '../sim/pitcher';
import { planPitch, pitchPosition, timeAtZ } from '../sim/pitch';
import { DERBY_RULES, PRACTICE_RULES, Session, rulesForStage, type PitchResult, type SessionEvent } from '../sim/session';
import type { HitCardVM, HudVM, PracticeConfig, UI } from '../ui/api';
import type { World } from './World';

/**
 * One batting session: the at-bat loop state machine.
 *
 *   intro → ready → windup → pitch ─┬─ (take/whiff) → result ─┐
 *                                    └─ contact → flight → result ┤
 *                       ↑                                         │
 *                       └──────────── next pitch ◄────────────────┘ → ended
 *
 * Pitch timing runs on the real clock (performance.now domain) and swing
 * judgement uses the DOM event timestamp; slow-motion only ever affects the
 * batted-ball cinematic, never the pitch.
 */
export type MatchMode =
  | { kind: 'campaign'; stage: StageDef }
  | { kind: 'practice'; config: PracticeConfig }
  | { kind: 'derby'; stadium: StadiumDef['id'] };

export interface MatchSummary {
  mode: MatchMode;
  session: Session;
}

export interface MatchDeps {
  world: World;
  camera: CameraDirector;
  input: InputManager;
  ui: UI;
  audio: AudioEngine;
  settings: () => Settings;
  onFinished(summary: MatchSummary): void;
  onPause(): void;
  firstTime: boolean;
}

type Phase = 'intro' | 'ready' | 'windup' | 'pitch' | 'contact' | 'flight' | 'result' | 'ended';

const WINDUP = 1.05;
const CATCH_Z = -0.42;
const FLIGHT_SPEED = 1.35;

export function stadiumFor(mode: MatchMode): StadiumDef {
  if (mode.kind === 'campaign') return STADIUMS[mode.stage.stadium];
  if (mode.kind === 'practice') return STADIUMS[mode.config.stadium];
  return STADIUMS[mode.stadium];
}

interface SwingState {
  kind: SwingKind;
  evaluation: SwingEvaluation;
  /** Real time (ms) at which the bat visually meets the ball. */
  contactAtMs: number;
  /** Pitch-time shown when the swing was processed, and real time then. */
  warpFromTau: number;
  warpFromMs: number;
  aim: { x: number; y: number };
}

interface FlightState {
  ball: BattedBall;
  t: number;
  idx: number;
  fenceDone: boolean;
  landed: boolean;
  slowmo: number;
  targetsAt: { index: number; sample: number; done: boolean }[];
  pos: Vec3;
}

export class Match {
  readonly mode: MatchMode;
  readonly session: Session;
  private readonly d: MatchDeps;
  private readonly rng: Rng;
  private readonly stadium: StadiumDef;
  private readonly pitcherDef: PitcherDef;
  private readonly selector: PitchSelectorConfig;
  private readonly targets: TargetDef[];
  private phase: Phase = 'intro';
  private phaseT = 0;
  private plan: PitchPlan | null = null;
  private lastType: PitchTypeId | undefined;
  private releaseAtMs = 0;
  private prepared = false;
  private crossingShown = false;
  private swing: SwingState | null = null;
  private flight: FlightState | null = null;
  private resultDuration = 1.6;
  private paused = false;
  private excitement = 0.25;
  private pitchCount = 0;
  private tipActive = false;
  private readonly ballPos: Vec3 = { x: 0, y: 0, z: 0 };
  private catcherTarget = { x: 0, y: STRIKE_ZONE.centerY };
  private pendingEvents: SessionEvent[] = [];
  private powerToggle = false;

  constructor(mode: MatchMode, deps: MatchDeps, seed: number) {
    this.mode = mode;
    this.d = deps;
    this.rng = new Rng(seed);
    this.stadium = stadiumFor(mode);
    if (mode.kind === 'campaign') {
      this.session = new Session(rulesForStage(mode.stage));
      this.pitcherDef = PITCHERS[mode.stage.pitcher]!;
      this.selector = { pitcher: this.pitcherDef, arsenal: mode.stage.arsenal, speedOffsetMph: mode.stage.speedOffsetMph, zoneRate: mode.stage.zoneRate, airDensity: this.stadium.airDensity };
      this.targets = mode.stage.targets ?? [];
    } else if (mode.kind === 'practice') {
      this.session = new Session(PRACTICE_RULES);
      const c = mode.config;
      this.pitcherDef = { ...PITCHERS.machine!, hand: c.pitcherHand, arsenal: c.pitches.map((type) => ({ type, weight: 1, speedOffset: -4 })) };
      this.selector = { pitcher: this.pitcherDef, hand: c.pitcherHand, location: c.location, speedScale: c.speed === 'slow' ? 0.82 : c.speed === 'fast' ? 1.06 : 1, airDensity: this.stadium.airDensity };
      this.targets = [];
    } else {
      this.session = new Session(DERBY_RULES);
      this.pitcherDef = { ...PITCHERS.machine!, arsenal: [{ type: 'FF', weight: 1, speedOffset: -15 }] };
      this.selector = { pitcher: this.pitcherDef, location: 'zone', airDensity: this.stadium.airDensity };
      this.targets = [];
    }
    const w = deps.world;
    w.pitcher.setLook(this.pitcherDef.look, this.selector.hand ?? this.pitcherDef.hand);
    w.setHandedness(deps.settings().handedness);
    w.stadium.setTargets(this.targets);
    w.fx.clearMarkers();
    w.setPlayersVisible(true);
    w.ball.setVisible(false);
    w.batter.reset();
    w.catcher.reset();
    w.umpire.reset();
    w.catcher.setGhost(1);
    w.umpire.setGhost(1);
    this.updateScoreboard(null);
  }

  get hand(): Hand {
    return this.d.world.handedness;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  // ── Lifecycle ──

  start(): void {
    const s = this.d.settings();
    this.d.input.enabled = true;
    this.d.audio.organCharge();
    this.d.audio.setCrowdLevel(0.35);
    this.d.ui.showHUD(this.hudVM(), {
      onPause: () => this.d.onPause(),
      onSwing: (ts) => this.d.input.touchSwing(ts),
      onPowerToggle: (on) => {
        this.powerToggle = on;
        this.d.input.powerLatched = on;
      },
    });
    this.phase = 'intro';
    this.phaseT = 0;
    this.d.camera.playIntro(() => this.enter('ready'), this.mode.kind === 'campaign' ? 2.8 : 1.6);
    if (this.d.firstTime) {
      const t = gameText(s.lang);
      this.d.ui.showTip(this.d.input.isTouch ? t.tipFirstTouch : t.tipFirst);
      this.tipActive = true;
    }
  }

  pause(): void {
    if (this.paused || this.phase === 'ended') return;
    this.paused = true;
    this.d.input.enabled = false;
    // A pitch in progress is voided and thrown again after resuming.
    if (this.phase === 'windup' || (this.phase === 'pitch' && !this.swing)) {
      this.plan = null;
      this.phase = 'ready';
      this.phaseT = 0;
      this.d.world.ball.setVisible(false);
      this.d.world.pitcher.reset();
      this.d.world.batter.reset();
      this.d.world.catcher.setGhost(1);
      this.d.world.umpire.setGhost(1);
      this.d.ui.showPitchLabel(null);
    }
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.d.input.enabled = this.phase !== 'ended';
  }

  /** Click / Space while not swinging: skip cinematics. */
  confirm(): void {
    if (this.phase === 'flight' && this.flight && this.flight.t > 0.5) this.endFlight();
    else if (this.phase === 'result' && this.phaseT > 0.35) this.phaseT = this.resultDuration;
  }

  dispose(): void {
    this.d.input.enabled = false;
    this.d.ui.showTip(null);
  }

  // ── Input ──

  onSwing(timeStamp: number, power: boolean): void {
    if (this.paused) return;
    if (this.phase === 'flight' || this.phase === 'result') {
      this.confirm();
      return;
    }
    if (this.phase !== 'pitch' && this.phase !== 'windup') return;
    if (this.swing || !this.plan) return;
    const s = this.d.settings();
    const effectiveTs = timeStamp - s.latencyMs;
    // Presses well before the release are ignored (no accidental outs).
    if (effectiveTs < this.releaseAtMs - 100) return;
    const kind: SwingKind = power || this.powerToggle ? 'power' : 'contact';
    const prof = SWING_PROFILES[kind];
    const contactTime = (effectiveTs - this.releaseAtMs) / 1000 + prof.swingTime;
    const aim = this.currentAim(true);
    const evaluation = evaluateSwing(this.plan, { kind, contactTime, aim, batter: this.hand }, { stadium: this.stadium, targets: this.targets, rng: this.rng });
    const now = performance.now();
    const contactAtMs = timeStamp + prof.swingTime * 1000;
    const tau = Math.max(0, (now - this.releaseAtMs) / 1000);
    this.swing = { kind, evaluation, contactAtMs, warpFromTau: tau, warpFromMs: now, aim };
    const w = this.d.world;
    w.batter.setAim(aim.x, aim.y);
    w.batter.swing(kind, Math.max(0.03, (contactAtMs - now) / 1000));
    this.d.audio.swingWhoosh(kind === 'power');
    if (this.tipActive) {
      this.d.ui.showTip(null);
      this.tipActive = false;
    }
  }

  /** Where the PCI is: player aim (pro) or auto-aim (casual). */
  private currentAim(atSwing = false): { x: number; y: number } {
    const s = this.d.settings();
    const inAim = this.d.input.aim;
    if (s.controlMode === 'pro' || !this.plan) return { x: inAim.x, y: inAim.y };
    const prof = SWING_PROFILES[this.d.input.power || this.powerToggle ? 'power' : 'contact'];
    const target = {
      x: clamp(this.plan.plateCross.x, -STRIKE_ZONE.halfWidth - 0.04, STRIKE_ZONE.halfWidth + 0.04),
      y: clamp(this.plan.plateCross.y, STRIKE_ZONE.bottom - 0.05, STRIKE_ZONE.top + 0.05) - HOME_RUN_UNDERCUT * prof.pciHalfHeight,
    };
    if (atSwing) {
      // Casual mode is forgiving but not perfect.
      return { x: target.x + this.rng.gaussian() * prof.pciHalfWidth * 0.12, y: target.y + this.rng.gaussian() * prof.pciHalfHeight * 0.12 };
    }
    const tau = this.phase === 'pitch' ? (performance.now() - this.releaseAtMs) / 1000 : 0;
    const k = smoothstep(0.1, 0.85, tau / this.plan.flightTime);
    return { x: target.x * k, y: STRIKE_ZONE.centerY + (target.y - STRIKE_ZONE.centerY) * k };
  }

  // ── State machine ──

  private enter(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    const w = this.d.world;
    switch (p) {
      case 'ready': {
        this.d.camera.setBatting();
        this.swing = null;
        this.flight = null;
        this.prepared = false;
        this.crossingShown = false;
        w.ball.setVisible(false);
        w.ball.setTrail('off');
        w.batter.reset();
        w.pitcher.reset();
        w.catcher.setGhost(1);
        w.umpire.setGhost(1);
        w.fx.clearMarkers();
        this.d.ui.hideHitCard();
        this.d.ui.showPitchLabel(null);
        this.d.input.enabled = true;
        if (!this.plan) this.plan = planPitch(choosePitch(this.rng, this.selector, this.lastType));
        this.lastType = this.plan.type;
        // The catcher sets up near (not exactly at) the target.
        this.catcherTarget = { x: this.plan.plateCross.x + this.rng.gaussian() * 0.05, y: this.plan.plateCross.y + this.rng.gaussian() * 0.05 };
        w.catcher.setTarget(this.catcherTarget.x, this.catcherTarget.y);
        break;
      }
      case 'windup':
        this.releaseAtMs = performance.now() + WINDUP * 1000;
        w.pitcher.startDelivery(WINDUP);
        break;
      case 'pitch': {
        const s = this.d.settings();
        w.ball.setVisible(true);
        w.ball.clearTrail();
        w.ball.setTrail(s.pitchTrail ? 'pitch' : 'off');
        w.catcher.setGhost(0.28);
        w.umpire.setGhost(0.28);
        if (s.showPitchType && this.plan) this.d.ui.showPitchLabel(pitchLine(this.plan, s.lang, s.units));
        break;
      }
      default:
        break;
    }
  }

  update(dt: number, now: number): void {
    if (this.paused) return;
    this.phaseT += dt;
    const w = this.d.world;
    const aim = this.currentAim();
    if (this.phase !== 'flight' && this.phase !== 'result' && this.phase !== 'contact') {
      w.zone.setAim(aim.x, aim.y);
      if (!this.swing) w.batter.setAim(aim.x, aim.y);
      w.zone.setPower(this.d.input.power || this.powerToggle);
      w.zone.setVisible(true, this.phase !== 'intro');
    }
    if (this.session.timed && (this.phase === 'ready' || this.phase === 'windup' || this.phase === 'pitch')) {
      const ev = this.session.tick(dt);
      if (ev.some((e) => e.type === 'finished')) {
        this.d.ui.showCallout(gameText(this.d.settings().lang).timeUp, 'warning');
        if (this.phase !== 'pitch' || !this.swing) {
          this.endMatchSoon();
          return;
        }
      }
    }

    switch (this.phase) {
      case 'intro':
        break;
      case 'ready': {
        const wait = this.pitcherDef.tempo * (this.mode.kind === 'derby' ? 0.7 : 1) + (this.pitchCount === 0 ? 0.5 : 0);
        if (this.phaseT >= wait && this.plan) this.enter('windup');
        break;
      }
      case 'windup':
        if (now >= this.releaseAtMs) this.enter('pitch');
        break;
      case 'pitch':
        this.updatePitch(now);
        break;
      case 'contact': {
        const hold = this.swing?.evaluation.kind === 'contact' && this.swing.evaluation.ball.isBarrel ? 0.1 : 0.07;
        if (this.phaseT >= (this.d.settings().reducedMotion ? 0.02 : hold)) this.startFlight();
        break;
      }
      case 'flight':
        this.updateFlight(dt);
        break;
      case 'result':
        if (this.phaseT >= this.resultDuration) this.afterResult();
        break;
      case 'ended':
        break;
    }

    // Crowd energy relaxes back to idle.
    this.excitement += (0.25 - this.excitement) * damp(0.6, dt);
    this.d.audio.setCrowdLevel(0.3 + this.excitement * 0.5);
    this.d.ui.updateHUD(this.hudVM());
  }

  /** Test/debug snapshot (used by the e2e smoke test). */
  debugState(): { phase: Phase; releaseAtMs: number; flightTime: number; cross: Vec3 | null; swingTime: number } {
    return { phase: this.phase, releaseAtMs: this.releaseAtMs, flightTime: this.plan?.flightTime ?? 0, cross: this.plan?.plateCross ?? null, swingTime: SWING_PROFILES.contact.swingTime };
  }

  get crowdExcitement(): number {
    return this.excitement;
  }

  get ballForCamera(): Vec3 | null {
    return this.phase === 'flight' || this.phase === 'result' ? this.ballPos : null;
  }

  private updatePitch(now: number): void {
    const plan = this.plan!;
    const w = this.d.world;
    let tau = (now - this.releaseAtMs) / 1000;
    if (!this.prepared) {
      this.prepared = true;
      w.batter.prepare(plan.flightTime);
    }
    const sw = this.swing;
    if (sw && sw.evaluation.kind === 'contact') {
      // Time-warp the last instant so the ball meets the bat on screen exactly.
      const span = Math.max(1, sw.contactAtMs - sw.warpFromMs);
      const u = clamp((now - sw.warpFromMs) / span, 0, 1);
      tau = sw.warpFromTau + (plan.flightTime - sw.warpFromTau) * u;
      pitchPosition(plan, tau, this.ballPos);
      w.ball.setPosition(this.ballPos);
      if (now >= sw.contactAtMs) this.contact();
      return;
    }
    pitchPosition(plan, Math.max(0, tau), this.ballPos);
    w.ball.setPosition(this.ballPos);
    w.ball.setSpin({ x: 1, y: 0, z: 0 }, plan.spinRpm / 60);
    if (tau >= plan.flightTime && !this.crossingShown) {
      this.crossingShown = true;
      w.zone.showCrossing(plan.plateCross.x, plan.plateCross.y, plan.isStrike);
    }
    const catchT = timeAtZ(plan, CATCH_Z);
    if (tau >= catchT) {
      w.catcher.receive();
      w.fx.mittPop(this.ballPos);
      this.d.audio.mittPop();
      w.ball.setVisible(false);
      if (sw) {
        this.resolve({ kind: 'whiff' }, sw.evaluation);
        w.batter.react('whiff');
      } else if (plan.isStrike) {
        w.umpire.callStrike();
        this.resolve({ kind: 'calledStrike' }, null);
      } else {
        this.resolve({ kind: 'ball' }, null);
      }
    }
  }

  private contact(): void {
    const sw = this.swing!;
    if (sw.evaluation.kind !== 'contact') return;
    const ball = sw.evaluation.ball;
    const w = this.d.world;
    const s = this.d.settings();
    const evMph = ball.exitVelocity / MPH;
    const q = ball.isBarrel ? 1 : ball.quality === 'solid' ? 0.75 : ball.quality === 'flare' ? 0.5 : 0.25;
    const at = this.plan!.plateCross;
    w.fx.contact(at, clamp((evMph - 60) / 55, 0, 1), ball.isBarrel);
    this.d.audio.batCrack(q, clamp((evMph - 60) / 55, 0, 1));
    w.zone.flashContact();
    if (!s.reducedMotion) this.d.camera.shake(0.02 + q * 0.05);
    this.phase = 'contact';
    this.phaseT = 0;
    this.pendingEvents = this.session.record({ kind: 'contact', ball });
  }

  private startFlight(): void {
    const sw = this.swing!;
    if (sw.evaluation.kind !== 'contact') return;
    const ball = sw.evaluation.ball;
    const w = this.d.world;
    const evMph = ball.exitVelocity / MPH;
    w.ball.clearTrail();
    w.ball.setTrail('hit', clamp((evMph - 70) / 45, 0, 1));
    w.catcher.setGhost(1);
    w.umpire.setGhost(1);
    w.zone.setVisible(false, false);
    this.d.ui.showPitchLabel(null);
    const kind = ball.outcome === 'foul' ? 'foul' : ball.launchAngleDeg < 10 || ball.distance < 40 ? 'ground' : 'fly';
    this.d.camera.follow(kind);
    // Where each hit target is closest to the flight path.
    const targetsAt = ball.targetsHit.map((index) => {
      const tg = this.targets[index]!.position;
      let best = 0;
      let bd = Infinity;
      ball.trajectory.forEach((p, i) => {
        const d2 = (p.x - tg.x) ** 2 + (p.y - tg.y) ** 2 + (p.z - tg.z) ** 2;
        if (d2 < bd) {
          bd = d2;
          best = i;
        }
      });
      return { index, sample: best, done: false };
    });
    this.flight = { ball, t: 0, idx: 0, fenceDone: false, landed: false, slowmo: 0, targetsAt, pos: this.ballPos };
    this.phase = 'flight';
    this.phaseT = 0;
    const loud = ball.outcome === 'homeRun' ? 0.7 : ball.quality === 'solid' || ball.isBarrel ? 0.55 : 0.35;
    this.excitement = Math.max(this.excitement, loud);
    if (ball.outcome === 'homeRun') window.setTimeout(() => this.d.world.batter.celebrate(), 450);
  }

  private updateFlight(dt: number): void {
    const f = this.flight!;
    const w = this.d.world;
    const s = this.d.settings();
    const t = gameText(s.lang);
    const traj = f.ball.trajectory;
    const speedK = f.slowmo > 0 ? 0.42 : FLIGHT_SPEED;
    if (f.slowmo > 0) f.slowmo -= dt;
    f.t += dt * speedK;
    while (f.idx < traj.length - 2 && traj[f.idx + 1]!.t <= f.t) f.idx++;
    const a = traj[f.idx]!;
    const b = traj[Math.min(traj.length - 1, f.idx + 1)]!;
    const u = b.t > a.t ? clamp((f.t - a.t) / (b.t - a.t), 0, 1) : 1;
    this.ballPos.x = a.x + (b.x - a.x) * u;
    this.ballPos.y = a.y + (b.y - a.y) * u;
    this.ballPos.z = a.z + (b.z - a.z) * u;
    w.ball.setPosition(this.ballPos);
    w.ball.setSpin({ x: 1, y: 0, z: 0 }, f.ball.spinRpm / 60);

    if (!f.fenceDone && f.ball.fenceIndex >= 0 && f.idx >= f.ball.fenceIndex) {
      f.fenceDone = true;
      if (f.ball.outcome === 'homeRun') {
        const distTxt = dist(f.ball.projectedDistance, s.units);
        this.d.ui.showCallout(this.rng.pick(t.hrCalls), 'homeRun', `${distTxt} · ${speed(f.ball.exitVelocity, s.units)}`);
        this.d.audio.crowdReaction('roar');
        this.d.audio.homeRunJingle();
        this.excitement = 1;
        const bursts = this.stadium.features.fireworks ? 7 : 3;
        w.fx.fireworks({ x: this.ballPos.x * 0.8, y: 32, z: this.ballPos.z + 25 }, bursts);
        this.d.audio.fireworks(Math.min(4, bursts));
        if (!s.reducedMotion) f.slowmo = 0.9;
      } else {
        this.d.audio.thud(0.8);
        this.d.audio.crowdReaction('ooh');
        w.fx.dust(this.ballPos, 1.2);
      }
    }
    for (const tg of f.targetsAt) {
      if (!tg.done && f.idx >= tg.sample) {
        tg.done = true;
        w.stadium.markTargetHit(tg.index);
        this.d.ui.showCallout(t.target, 'target');
        this.d.audio.crowdReaction('cheer');
      }
    }
    const landT = f.ball.outcome === 'homeRun' ? traj[traj.length - 1]!.t : f.ball.hangTime;
    if (!f.landed && f.t >= landT) {
      f.landed = true;
      const landing = f.ball.landing;
      w.fx.dust(landing, f.ball.outcome === 'homeRun' ? 0.6 : 1);
      if (f.ball.outcome !== 'foul') {
        const label = dist(f.ball.outcome === 'homeRun' ? f.ball.projectedDistance : f.ball.distance, s.units).toUpperCase();
        w.fx.landingMarker(landing, label, f.ball.outcome === 'homeRun' ? '#ffc83d' : f.ball.outcome === 'hit' ? '#2fbf71' : '#ff4d5e');
      }
      if (f.ball.outcome === 'out') this.d.audio.crowdReaction('groan');
      if (f.ball.outcome === 'hit') this.d.audio.crowdReaction('cheer');
    }
    const end = traj[traj.length - 1]!.t + 0.35;
    const foulCut = f.ball.outcome === 'foul' && f.t > 1.8;
    if (f.t >= end || foulCut) this.endFlight();
  }

  private endFlight(): void {
    const f = this.flight;
    if (!f || this.phase !== 'flight') return;
    if (!f.fenceDone && f.ball.outcome === 'homeRun') {
      // Skipped before the fence: still celebrate.
      const s = this.d.settings();
      const t = gameText(s.lang);
      this.d.ui.showCallout(this.rng.pick(t.hrCalls), 'homeRun', dist(f.ball.projectedDistance, s.units));
      this.d.audio.crowdReaction('roar');
    }
    for (const tg of f.targetsAt) if (!tg.done) this.d.world.stadium.markTargetHit(tg.index);
    if (f.ball.outcome !== 'homeRun') this.d.world.batter.react('out');
    this.resolve({ kind: 'contact', ball: f.ball }, this.swing!.evaluation, true);
  }

  /** Records a pitch outcome (if not yet recorded), shows the hit card and moves to 'result'. */
  private resolve(result: PitchResult, evaluation: SwingEvaluation | null, alreadyRecorded = false): void {
    const events = alreadyRecorded ? this.pendingEvents : this.session.record(result);
    this.pendingEvents = [];
    this.pitchCount++;
    this.d.ui.showHitCard(this.hitCardVM(result, evaluation));
    this.handleEvents(events);
    this.updateScoreboard(result);
    this.phase = 'result';
    this.phaseT = 0;
    this.resultDuration = result.kind === 'contact' ? 2.0 : result.kind === 'ball' ? 1.1 : 1.5;
    if (result.kind === 'whiff' || result.kind === 'calledStrike') this.d.audio.crowdReaction('groan');
  }

  private handleEvents(events: SessionEvent[]): void {
    const s = this.d.settings();
    const t = gameText(s.lang);
    for (const e of events) {
      if (e.type === 'bonus') window.setTimeout(() => this.d.ui.showCallout(e.kind === 'out' ? t.bonusOut : t.bonusTime, 'bonus'), 1100);
      if (e.type === 'streak' && e.count >= 2) window.setTimeout(() => this.d.ui.showCallout(t.streak(e.count), 'info'), 1700);
      if (e.type === 'goalMet' && this.session.timed) window.setTimeout(() => this.d.ui.showCallout(t.goalMet, 'bonus'), 1200);
      if (e.type === 'out' && e.outsLeft === 1 && !this.session.finished) window.setTimeout(() => this.d.ui.showCallout(t.lastOut, 'warning'), 900);
    }
  }

  private afterResult(): void {
    const w = this.d.world;
    w.fx.clearMarkers();
    this.d.ui.hideHitCard();
    this.plan = null;
    if (this.session.finished) {
      this.endMatchSoon();
      return;
    }
    this.enter('ready');
  }

  private endMatchSoon(): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.d.input.enabled = false;
    this.session.finish();
    const success = this.session.success;
    this.d.audio.stageEnd(success);
    if (success && this.mode.kind === 'campaign') {
      this.d.world.fx.confetti({ x: 0, y: 2, z: -2 });
      this.d.audio.crowdReaction('roar');
    }
    window.setTimeout(() => this.d.onFinished({ mode: this.mode, session: this.session }), 900);
  }

  // ── View models ──

  hudVM(): HudVM {
    const s = this.d.settings();
    const t = gameText(s.lang);
    const ses = this.session;
    const powerOn = this.d.input.power || this.powerToggle;
    const hint = this.d.input.isTouch ? t.controlsTouch : s.controlMode === 'pro' ? t.controlsPro : t.controlsCasual;
    if (this.mode.kind === 'campaign') {
      const st = this.mode.stage;
      const [cur, target] = ses.progress();
      const g = st.goal;
      const label = t.goalLabel[g.type];
      const value = g.type === 'distance' ? `${dist(cur * FT, s.units)} / ${dist(target * FT, s.units)}` : `${Math.min(cur, target)}/${target}`;
      return {
        mode: 'campaign',
        stageLabel: `${st.id} · ${st.name[s.lang]}`,
        goalText: `${label}|${value}`,
        progress: target > 0 ? cur / target : 0,
        outs: ses.rules.limit?.type === 'outs' ? { left: ses.outsLeft, total: ses.outsTotal } : null,
        timeLeft: ses.timed ? ses.timeLeft : null,
        streak: g.type === 'streak' || ses.streak >= 2 ? ses.streak : null,
        score: ses.timed ? `HR ${ses.homeRuns}` : null,
        powerOn,
        controlHint: hint,
      };
    }
    if (this.mode.kind === 'derby') {
      return {
        mode: 'derby',
        stageLabel: `${t.derby} · ${this.stadium.name[s.lang]}`,
        goalText: `${t.goalLabel.homeRuns}|${ses.homeRuns}`,
        progress: Math.min(1, ses.homeRuns / 15),
        outs: { left: ses.outsLeft, total: ses.outsTotal },
        timeLeft: null,
        streak: ses.streak >= 2 ? ses.streak : null,
        score: ses.longestHRft > 0 ? dist(ses.longestHRft * FT, s.units) : null,
        powerOn,
        controlHint: hint,
      };
    }
    return {
      mode: 'practice',
      stageLabel: `${t.practice} · ${this.stadium.name[s.lang]}`,
      goalText: `${t.goalLabel.homeRuns}|${ses.homeRuns} · ${t.statsLabels.swings} ${ses.swings}`,
      progress: ses.swings > 0 ? ses.hits / ses.swings : 0,
      outs: null,
      timeLeft: null,
      streak: ses.streak >= 2 ? ses.streak : null,
      score: null,
      powerOn,
      controlHint: hint,
    };
  }

  private hitCardVM(result: PitchResult, ev: SwingEvaluation | null): HitCardVM {
    const s = this.d.settings();
    const t = gameText(s.lang);
    const plan = this.plan!;
    const pitch = pitchLine(plan, s.lang, s.units);
    const timing = ev
      ? { label: ev.timing ? t.timing[ev.timing] : '', ms: s.showTimingMs ? Math.round(ev.timingMs) : null, tone: (ev.timing ?? (ev.timingMs < 0 ? 'early' : 'late')) as 'perfect' | 'good' | 'early' | 'late' }
      : null;
    if (result.kind === 'ball' || result.kind === 'calledStrike') {
      const coach = result.kind === 'ball' ? (s.lang === 'es' ? 'Bien tomada: las bolas no cuestan outs.' : 'Good take: balls never cost an out.') : s.lang === 'es' ? 'Estaba en la zona: hay que hacerle swing.' : 'That was in the zone: you have to swing.';
      return { result: result.kind, title: t.result[result.kind], stats: [], timing: null, quality: null, coach, pitch, badges: [] };
    }
    if (result.kind === 'whiff') {
      return { result: 'whiff', title: t.result.whiff, stats: [], timing, quality: null, coach: ev ? coachLine(ev, plan, s.lang, this.hand) : null, pitch, badges: [] };
    }
    const b = result.ball;
    const d = b.outcome === 'homeRun' ? b.projectedDistance : b.distance;
    const badges: string[] = [];
    if (b.targetsHit.length) badges.push(t.target);
    return {
      result: b.outcome,
      title: t.result[b.outcome],
      stats: [
        { label: t.stat.ev, value: speed(b.exitVelocity, s.units) },
        { label: t.stat.la, value: `${Math.round(b.launchAngleDeg)}°` },
        { label: t.stat.dist, value: dist(d, s.units) },
        { label: t.stat.hang, value: `${b.hangTime.toFixed(1)} s` },
      ],
      timing,
      quality: { label: t.quality[b.quality], tone: b.isBarrel ? 'barrel' : b.quality === 'solid' ? 'solid' : 'weak' },
      coach: ev ? coachLine(ev, plan, s.lang, this.hand) : null,
      pitch,
      badges,
    };
  }

  private updateScoreboard(result: PitchResult | null): void {
    const s = this.d.settings();
    const t = gameText(s.lang);
    const title = this.stadium.name[s.lang].toUpperCase();
    const line2 = this.mode.kind === 'campaign' ? `${this.mode.stage.id} · ${this.mode.stage.name[s.lang].toUpperCase()}` : t.derby.toUpperCase();
    if (!result || result.kind !== 'contact') {
      this.d.world.stadium.setScoreboard({ title, line1: `HR ${this.session.homeRuns}`, line2, big: result ? t.result[result.kind] : 'JONRÓN', highlight: false });
      return;
    }
    const b = result.ball;
    const d = b.outcome === 'homeRun' ? b.projectedDistance : b.distance;
    this.d.world.stadium.setScoreboard({
      title,
      line1: `${speed(b.exitVelocity, s.units).toUpperCase()} · ${Math.round(b.launchAngleDeg)}°`,
      line2,
      big: b.outcome === 'homeRun' ? dist(d, s.units).toUpperCase() : t.result[b.outcome],
      highlight: b.outcome === 'homeRun',
    });
  }
}
