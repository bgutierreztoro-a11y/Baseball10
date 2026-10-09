import * as THREE from 'three';
import type { BatterLook, Hand, QualitySettings, SwingKind } from '../../contracts';
import { PLATE } from '../../config/constants';
import type { BatterRig } from '../api';
import { PeakAura } from './aura';
import { Humanoid, blendPose, copyPose, ease, easeOut, makePose, type BodyShape, type HumanoidPose, type Outfit } from './humanoid';

/**
 * Playable batter rig. Every animation is driven by elapsed time (never by
 * frame count) so the bat reaches the contact pose exactly when the
 * simulation says it does.
 *
 * Keyframes are authored for the base body in its local frame; bigger
 * characters scale the whole body frame uniformly (BatterLook.heightM), so the
 * same keys work in "body units" and the contact IK (worldToLocal of the aim)
 * adapts automatically. The giant additionally crouches and uses a longer bat
 * so the sweet spot can still reach a zone that sits at his shins.
 */

const BAT_LENGTH = 0.86;
/** Sweet spot distance from the knob. */
const SWEET = 0.7;
const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

function slerpDir(a: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const dot = Math.min(1, Math.max(-1, a.dot(b)));
  const th = Math.acos(dot);
  if (th < 1e-4) return out.copy(b);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return out.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb).normalize();
}

function makeBat(): { group: THREE.Group; wood: THREE.MeshStandardMaterial; grip: THREE.MeshStandardMaterial } {
  const wood = new THREE.MeshStandardMaterial({ color: '#d9b382', roughness: 0.35, metalness: 0.05 });
  const grip = new THREE.MeshStandardMaterial({ color: '#3d2b1f', roughness: 0.8 });
  // Lathe profile from the knob (y=0) to the barrel end (y=BAT_LENGTH).
  const prof = [
    [0, 0],
    [0.026, 0.0],
    [0.027, 0.012],
    [0.014, 0.025],
    [0.0135, 0.25],
    [0.017, 0.4],
    [0.026, 0.55],
    [0.032, 0.68],
    [0.033, 0.83],
    [0.026, BAT_LENGTH],
    [0, BAT_LENGTH],
  ].map(([r, y]) => new THREE.Vector2(r!, y!));
  const bat = new THREE.Mesh(new THREE.LatheGeometry(prof, 14), wood);
  const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0155, 0.2, 10), grip);
  tape.position.y = 0.13;
  bat.castShadow = true;
  const group = new THREE.Group();
  group.add(bat, tape);
  return { group, wood, grip };
}

interface BatKey {
  pose: HumanoidPose;
  K: THREE.Vector3;
  D: THREE.Vector3;
}

function key(pose: Partial<Omit<HumanoidPose, 'hipsPos' | 'handL' | 'handR' | 'footL' | 'footR' | 'elbowPoleL' | 'elbowPoleR' | 'kneePoleL' | 'kneePoleR'>> & {
  hips?: THREE.Vector3;
  footL?: THREE.Vector3;
  footR?: THREE.Vector3;
  elbowL?: THREE.Vector3;
  elbowR?: THREE.Vector3;
}, K: THREE.Vector3, D: THREE.Vector3): BatKey {
  const p = makePose();
  Object.assign(p, pose);
  if (pose.hips) p.hipsPos.copy(pose.hips);
  if (pose.footL) p.footL.copy(pose.footL);
  if (pose.footR) p.footR.copy(pose.footR);
  if (pose.elbowL) p.elbowPoleL.copy(pose.elbowL);
  if (pose.elbowR) p.elbowPoleR.copy(pose.elbowR);
  p.kneePoleL.set(0.3, 0, 1);
  p.kneePoleR.set(-0.1, 0, 1);
  return { pose: p, K, D: D.normalize() };
}

// ── Batter keyframes (right-handed, local: +Z toward the plate, +X toward the pitcher) ──
const STANCE = key(
  { hips: V(0, 0.93, -0.02), hipsYaw: -0.12, hipsLean: 0.16, spineLean: 0.08, chestYaw: -0.18, chestLean: 0.06, headYaw: 1.2, headPitch: 0.08, footL: V(0.38, 0, 0.02), footR: V(-0.36, 0, 0), footYawL: 0.35, footYawR: 0.1, elbowL: V(0.4, -0.8, 0.5), elbowR: V(-0.5, -0.45, -0.3) },
  V(-0.16, 1.24, 0.16),
  V(-0.3, 0.9, -0.32),
);
const LOAD = key(
  { hips: V(-0.06, 0.9, -0.02), hipsYaw: -0.28, hipsLean: 0.18, spineLean: 0.08, chestYaw: -0.38, chestLean: 0.06, headYaw: 1.25, headPitch: 0.1, footL: V(0.56, 0, 0.04), footR: V(-0.36, 0, 0), footYawL: 0.55, footYawR: 0.1, elbowL: V(0.4, -0.8, 0.6), elbowR: V(-0.7, 0.2, -0.5) },
  V(-0.25, 1.27, 0.08),
  V(-0.18, 0.86, -0.5),
);
const MID = key(
  { hips: V(0.02, 0.88, 0), hipsYaw: 0.35, hipsLean: 0.18, spineLean: 0.08, chestYaw: -0.15, chestLean: 0.1, headYaw: 0.9, headPitch: 0.25, footL: V(0.56, 0, 0.04), footR: V(-0.36, 0, 0), footYawL: 0.6, footYawR: 0.4, elbowL: V(0.3, -0.9, 0.4), elbowR: V(-0.4, -0.9, -0.2) },
  V(-0.02, 1.08, 0.3),
  V(-0.9, 0.18, 0.38),
);
const EXTENSION = key(
  { hips: V(0.08, 0.9, 0.02), hipsYaw: 1.05, hipsLean: 0.15, spineLean: 0.06, chestYaw: 0.45, chestLean: 0.1, headYaw: 0.4, headPitch: 0.25, footL: V(0.56, 0, 0.04), footR: V(-0.33, 0.03, 0.03), footYawL: 0.65, footYawR: 1.1, elbowL: V(0.2, -0.9, 0.3), elbowR: V(0.1, -0.9, 0.2) },
  V(0.32, 1.06, 0.36),
  V(0.78, 0.05, 0.62),
);
const FOLLOW = key(
  { hips: V(0.1, 0.94, 0.02), hipsYaw: 1.45, hipsLean: 0.06, spineLean: 0.02, chestYaw: 0.5, chestLean: 0.02, headYaw: 0.15, headPitch: 0.05, footL: V(0.56, 0, 0.04), footR: V(-0.22, 0.05, 0.06), footYawL: 0.7, footYawR: 1.45, elbowL: V(0.4, 0.4, -0.3), elbowR: V(0.6, -0.4, 0.4) },
  V(0.22, 1.45, -0.06),
  V(-0.35, 0.3, -0.9),
);
const ADMIRE = key(
  { hips: V(0.05, 0.96, 0.02), hipsYaw: 0.9, hipsLean: 0.02, chestYaw: 0.4, headYaw: 0.25, headPitch: -0.12, footL: V(0.5, 0, 0.04), footR: V(-0.28, 0, 0.04), footYawL: 0.8, footYawR: 1.0, elbowL: V(0.5, -0.6, 0.2), elbowR: V(-0.5, -0.6, 0.2) },
  V(0.1, 0.95, 0.35),
  V(0.4, -0.2, 0.9),
);
const SLUMP = key(
  { hips: V(0.02, 0.95, 0), hipsYaw: 0.3, hipsLean: 0.22, spineLean: 0.12, chestYaw: 0.1, chestLean: 0.15, headYaw: 0.2, headPitch: 0.55, footL: V(0.45, 0, 0.04), footR: V(-0.33, 0, 0), footYawL: 0.5, footYawR: 0.5, elbowL: V(0.4, -0.6, 0.4), elbowR: V(-0.4, -0.6, 0.4) },
  V(0.12, 0.92, 0.38),
  V(0.15, -0.95, 0.25),
);

/** Height of the base body the keyframes were authored for. */
const BASE_HEIGHT = 1.85;
/** Distance from the plate centre line to the root of a base-sized batter. */
const BASE_STANCE_X = 0.92;

/** Mixes two sRGB hex colours (t = 0 → a). */
function mixHex(a: string, b: string, t: number): string {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

/** Derived build numbers for a look (shared by the rig and the stance placement). */
export function batterMetrics(look: BatterLook): { scale: number; giant: number; batScale: number; stanceX: number } {
  const scale = look.heightM / BASE_HEIGHT;
  // 0 for human-sized batters, 1 for the giant (≥ 3 m).
  const giant = THREE.MathUtils.clamp((scale - 1.2) / 0.5, 0, 1);
  const batScale = 1 + 0.15 * giant;
  // Wide batters stand farther out so the belly stays off the plate; the giant
  // stands where his long, downward swing meets the zone (see computeContactKey).
  const human = BASE_STANCE_X + Math.max(0, look.build - 1) * 0.06 * scale + look.belly * 0.02 + look.muscle * 0.02;
  const stanceX = THREE.MathUtils.lerp(human, scale * 0.71, giant);
  return { scale, giant, batScale, stanceX };
}

type BatterState = 'stance' | 'prepare' | 'swing' | 'celebrate' | 'react';

export class Batter implements BatterRig {
  readonly root: THREE.Group;
  readonly stanceOffsetX: number;
  private readonly h: Humanoid;
  private readonly bat: THREE.Group;
  private readonly batWood: THREE.MeshStandardMaterial;
  private readonly batGrip: THREE.MeshStandardMaterial;
  private readonly batScale: number;
  private readonly sweet: number;
  private readonly giant: number;
  private readonly aura: PeakAura;
  private readonly extra: boolean;
  private state: BatterState = 'stance';
  private t = 0;
  private dur = 0;
  private time = 0;
  private swingKind: SwingKind = 'contact';
  private readonly aimWorld = new THREE.Vector3(0, 0.78, PLATE.frontZ);
  private readonly contact: BatKey;
  private readonly from: BatKey;
  private readonly cur: BatKey;
  private readonly K = new THREE.Vector3();
  private readonly D = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly tmp3 = new THREE.Vector3();
  private readonly tmp4 = new THREE.Vector3();
  private readonly sL = new THREE.Vector3();
  private readonly sR = new THREE.Vector3();
  private readonly savedPose = makePose();
  private readonly q = new THREE.Quaternion();
  private flip: { pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; landed: boolean } | null = null;
  private reactKey: BatKey = SLUMP;

  constructor(quality: QualitySettings, look: BatterLook) {
    const m = batterMetrics(look);
    this.giant = m.giant;
    this.batScale = m.batScale;
    this.sweet = SWEET * m.batScale;
    this.stanceOffsetX = m.stanceX;
    this.extra = look.extraArms;
    const outfit: Outfit = {
      skin: look.skin,
      jersey: look.jersey,
      trim: look.trim,
      sleeve: look.trim,
      pants: '#ece8dc',
      socks: mixHex(look.trim, '#0b1426', 0.25),
      shoes: '#15161a',
      hat: mixHex(look.trim, '#0b1426', 0.08),
      gloves: look.trim,
      build: look.build,
      number: look.number,
    };
    const shape: BodyShape = {
      scale: m.scale,
      belly: look.belly,
      muscle: look.muscle,
      hair: look.hair,
      // Beardless + hair = flowing locks (Arturek); bearded = tidy nape.
      longHair: !!look.hair && !look.beard,
      beard: look.beard ? (look.hair ?? '#17110d') : null,
      beardStyle: look.hair ? 'full' : 'goatee',
      extraArms: look.extraArms,
      face: true,
    };
    this.h = new Humanoid(outfit, quality, shape);
    this.tuneSkin(this.h.materials.skin!);
    this.root = this.h.root;
    this.addHelmet(look, quality);
    const bat = makeBat();
    this.bat = bat.group;
    this.bat.scale.setScalar(this.batScale);
    this.batWood = bat.wood;
    this.batGrip = bat.grip;
    this.bat.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = quality.shadows;
    });
    this.h.body.add(this.bat);
    const M = this.h.materials;
    this.aura = new PeakAura(quality, [M.jersey!, M.skin!, M.sleeve!], m.scale);
    this.h.body.add(this.aura.group);
    this.contact = key({}, new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
    this.from = key({}, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    this.cur = key({}, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    this.copyKey(STANCE, this.cur);
    this.applyCurrent();
  }

  /**
   * Skin reads as skin at every tone: a touch of sheen, a faint warm
   * "subsurface" emissive so faces under the brim aren't pitch black, and very
   * dark albedos lifted slightly (hue kept) so deep browns stay brown.
   */
  private tuneSkin(m: THREE.MeshStandardMaterial): void {
    m.roughness = 0.46;
    const c = m.color;
    const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    if (lum < 0.032) c.multiplyScalar(Math.min(1.6, 0.032 / Math.max(lum, 1e-4)));
    m.emissive.copy(c).multiplyScalar(0.16);
  }

  private addHelmet(look: BatterLook, quality: QualitySettings): void {
    const m = this.h.materials;
    const helmetMat = new THREE.MeshStandardMaterial({ color: m.hat!.color, roughness: 0.25, metalness: 0.2 });
    m.helmet = helmetMat;
    const logoMat = new THREE.MeshStandardMaterial({ color: mixHex(look.trim, '#ffffff', 0.15), roughness: 0.4 });
    m.logo = logoMat;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.132, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), helmetMat);
    shell.position.y = 0.01;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), helmetMat);
    brim.scale.set(1, 1, 0.7);
    brim.position.set(0, 0.0, 0.1);
    // Ear flap on the side facing the pitcher (+X).
    const flap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), helmetMat);
    flap.scale.set(0.45, 1, 1);
    flap.position.set(0.11, -0.05, 0.0);
    // Team stripe over the crown + front logo, in the trim colour.
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.1335, 0.007, 4, 24, Math.PI * 0.9), logoMat);
    stripe.rotation.set(0, Math.PI / 2, Math.PI * 0.05);
    stripe.position.y = 0.01;
    const logo = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), logoMat);
    logo.position.set(0, 0.06, 0.12);
    logo.rotation.x = -0.45;
    for (const x of [shell, brim, flap, stripe, logo]) {
      x.castShadow = quality.shadows;
      this.h.head.add(x);
    }
  }

  setHandedness(hand: Hand): void {
    this.h.setMirrored(hand === 'L');
  }

  setBatColors(wood: string, grip: string): void {
    this.batWood.color.set(wood);
    this.batGrip.color.set(grip);
  }

  setAim(x: number, y: number): void {
    this.aimWorld.set(x, y, PLATE.frontZ);
  }

  setPeak(on: boolean): void {
    this.aura.set(on);
  }

  /** Shows the aura immediately at full strength (shader warm-up), or restores it. */
  forcePeakVisible(v: boolean): void {
    this.aura.forceVisible(v);
  }

  /** Stride/load timed to the pitch (called at release). */
  prepare(timeToPlate: number): void {
    if (this.state !== 'stance') return;
    this.begin('prepare', Math.max(0.15, timeToPlate - 0.22));
  }

  swing(kind: SwingKind, timeToContact: number): void {
    this.swingKind = kind;
    this.computeContactKey();
    this.begin('swing', Math.max(0.02, timeToContact));
  }

  celebrate(): void {
    this.begin('celebrate', 0.5);
    // Bat flip: release the bat with an upward toss and spin.
    this.flip = {
      pos: this.K.clone(),
      vel: new THREE.Vector3(0.9, 3.6, 1.4),
      rot: new THREE.Euler().setFromQuaternion(this.bat.quaternion),
      spin: new THREE.Vector3(9, 2, 4),
      landed: false,
    };
  }

  react(kind: 'whiff' | 'out'): void {
    this.reactKey = SLUMP;
    this.begin('react', kind === 'whiff' ? 0.35 : 0.5);
  }

  reset(): void {
    this.flip = null;
    this.state = 'stance';
    this.copyKey(STANCE, this.cur);
    this.applyCurrent();
  }

  getBatSweetSpot(target: THREE.Vector3): THREE.Vector3 {
    target.copy(this.K).addScaledVector(this.D, this.sweet);
    return this.h.body.localToWorld(target);
  }

  /** The underlying procedural body (debug / sandbox framing). */
  get humanoid(): Humanoid {
    return this.h;
  }

  /** Debug: largest arm IK overreach (body units) of the last frame. */
  get armOverreach(): number {
    return this.h.overreach;
  }

  get extraArmOverreach(): number {
    return this.h.extraOverreach;
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    this.aura.dispose();
    this.bat.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.batWood.dispose();
    this.batGrip.dispose();
    this.h.dispose();
  }

  private begin(state: BatterState, dur: number): void {
    this.copyKey(this.cur, this.from);
    this.state = state;
    this.t = 0;
    this.dur = dur;
  }

  private copyKey(src: BatKey, dst: BatKey): void {
    copyPose(src.pose, dst.pose);
    dst.K.copy(src.K);
    dst.D.copy(src.D);
  }

  private mix(a: BatKey, b: BatKey, t: number, out: BatKey): void {
    blendPose(a.pose, b.pose, t, out.pose);
    out.K.lerpVectors(a.K, b.K, t);
    slerpDir(a.D, b.D, t, out.D);
  }

  /**
   * Contact pose bends toward the aim so the sweet spot meets the ball there.
   * Works in body units (worldToLocal includes the body scale). For the giant
   * the zone sits around his shins: he sinks the hips, bends over the plate
   * and chops down with a longer bat, so the hands stay within arm's reach.
   */
  private computeContactKey(): void {
    this.root.updateWorldMatrix(true, true);
    const ss = this.h.body.worldToLocal(this.tmp.copy(this.aimWorld));
    const g = this.giant;
    const low = THREE.MathUtils.clamp((0.95 - ss.y) / 0.5, -0.4, 1);
    const power = this.swingKind === 'power' ? 1 : 0;
    const p = this.contact.pose;
    copyPose(EXTENSION.pose, p);
    p.hipsPos.set(0.06, 0.9 - low * 0.1 - g * 0.1, -g * 0.03);
    p.hipsYaw = 0.72 + power * 0.12 - g * 0.12;
    p.hipsLean = 0.16 + low * 0.12 + g * 0.14;
    p.hipsRoll = -0.05 - low * 0.06;
    p.spineLean = 0.06 + low * 0.12 + g * 0.1;
    p.chestYaw = 0.2 + power * 0.08 - g * 0.05;
    p.chestLean = 0.08 + low * 0.18 + g * 0.12;
    p.headYaw = 0.55;
    p.headPitch = 0.3 + low * 0.25;
    p.footL.x += g * 0.06;
    p.footR.set(-0.34, 0.02, 0.02);
    p.footYawR = 0.9;
    p.kneePoleL.set(0.3 + g * 0.3, 0, 1);
    p.kneePoleR.set(-0.1 - g * 0.3, 0, 1);
    p.elbowPoleL.set(0.3, -0.9, 0.2);
    p.elbowPoleR.set(-0.3, -0.9, 0.1);
    // Outside pitches (farther than the base reach): stride and lean over the plate.
    const far = THREE.MathUtils.clamp(ss.z - 0.88 + Math.max(0, 0.7 - ss.y) * 0.3, 0, 0.5) * (1 - g);
    p.hipsPos.z += far * 0.6;
    p.hipsPos.y -= far * 0.15;
    p.hipsLean += far * 0.6;
    p.spineLean += far * 0.4;
    p.chestLean += far * 0.4;
    p.footL.z += far * 0.6;
    p.footR.z += far * 0.25;
    // Bat: mostly toward the plate with a little lag; tilt follows the pitch height.
    const sw = this.sweet;
    const ky = THREE.MathUtils.clamp(ss.y + 0.2 + g * 0.42, 0.86 - g * 0.2, 1.16);
    const dy = THREE.MathUtils.clamp((ss.y - ky) / sw, -0.7 - g * 0.25, 0.3);
    const hz = Math.sqrt(1 - dy * dy);
    this.contact.D.set(-0.16 * hz, dy, 0.99 * hz).normalize();
    this.contact.K.copy(ss).addScaledVector(this.contact.D, -sw);
    this.reaim(ss);
  }

  /**
   * Keeps the contact grip within arm's reach: if a hand can't get to the
   * handle, the bat pivots about the sweet spot (which stays on the aim) so
   * the knob comes toward the shoulders.
   */
  private reaim(ss: THREE.Vector3): void {
    const h = this.h;
    const K = this.contact.K;
    const D = this.contact.D;
    copyPose(h.pose, this.savedPose);
    h.applyBones(this.contact.pose);
    const SL = h.shoulderInBody('L', this.sL);
    const SR = h.shoulderInBody('R', this.sR);
    const R = h.armReach * 0.97;
    const sw = this.sweet;
    const over = (d: THREE.Vector3): number => {
      K.copy(ss).addScaledVector(d, -sw);
      const eL = this.tmp2.copy(K).addScaledVector(d, 0.07).distanceTo(SL) - R;
      const eR = this.tmp2.copy(K).addScaledVector(d, 0.16).distanceTo(SR) - R;
      return Math.max(eL, eR);
    };
    if (over(D) > 0) {
      // Most reachable direction: bat pointing from between the hands' shoulders at the ball.
      const auth = this.tmp3.copy(D);
      const best = this.tmp4.addVectors(SL, SR).multiplyScalar(0.5);
      best.subVectors(ss, best).normalize();
      if (over(best) > 0) {
        D.copy(best);
      } else {
        // Smallest rotation from the authored direction that is reachable.
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 10; i++) {
          const mid = (lo + hi) / 2;
          if (over(slerpDir(auth, best, mid, D)) > 0) lo = mid;
          else hi = mid;
        }
        slerpDir(auth, best, hi, D);
      }
      K.copy(ss).addScaledVector(D, -sw);
    }
    h.applyBones(this.savedPose);
  }

  /** Per-frame safety net: slides the whole bat toward the shoulders if a hand would overreach. */
  private keepGrip(): void {
    const h = this.h;
    const SL = h.shoulderInBody('L', this.sL);
    const SR = h.shoulderInBody('R', this.sR);
    const R = h.armReach * 0.995;
    for (let i = 0; i < 2; i++) {
      const hl = this.tmp2.copy(this.K).addScaledVector(this.D, 0.07);
      const eL = hl.distanceTo(SL) - R;
      const hr = this.tmp3.copy(this.K).addScaledVector(this.D, 0.16);
      const eR = hr.distanceTo(SR) - R;
      if (eL <= 0 && eR <= 0) return;
      const [S, H, e] = eL > eR ? [SL, hl, eL] : [SR, hr, eR];
      this.K.addScaledVector(this.tmp4.subVectors(S, H).normalize(), e);
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.t += dt;
    this.aura.update(dt);
    const u = this.dur > 0 ? this.t / this.dur : 1;
    switch (this.state) {
      case 'stance': {
        this.copyKey(STANCE, this.cur);
        // Idle: breathing + bat waggle.
        const w = Math.sin(this.time * 2.1);
        this.cur.D.applyAxisAngle(this.tmp2.set(0, 0, 1), w * 0.06);
        this.cur.K.y += Math.sin(this.time * 1.3) * 0.01;
        this.cur.pose.hipsPos.y += Math.sin(this.time * 1.3) * 0.006;
        break;
      }
      case 'prepare':
        this.mix(this.from, LOAD, ease(u), this.cur);
        break;
      case 'swing': {
        const T = this.dur;
        const t = this.t;
        const ext = this.swingKind === 'power' ? 0.08 : 0.07;
        const fin = this.swingKind === 'power' ? 0.42 : 0.34;
        if (t < T * 0.55) this.mix(this.from, MID, ease(t / (T * 0.55)), this.cur);
        else if (t < T) this.mix(MID, this.contact, (t - T * 0.55) / (T * 0.45), this.cur);
        else if (t < T + ext) this.mix(this.contact, EXTENSION, (t - T) / ext, this.cur);
        else this.mix(EXTENSION, FOLLOW, easeOut((t - T - ext) / fin), this.cur);
        break;
      }
      case 'celebrate':
        this.mix(this.from, ADMIRE, ease(u), this.cur);
        break;
      case 'react':
        this.mix(this.from, this.reactKey, ease(u), this.cur);
        break;
    }
    this.applyCurrent(dt);
  }

  private applyCurrent(dt = 0): void {
    const c = this.cur;
    this.K.copy(c.K);
    this.D.copy(c.D).normalize();
    const p = this.h.pose;
    const h = this.h;
    copyPose(c.pose, p);
    if (this.flip) {
      // Bat flies free; hands relax near the hips (the extra pair cheers).
      p.handL.set(0.22, 0.9, 0.22);
      p.handR.set(-0.05, 0.92, 0.25);
      if (this.extra) {
        // Raised fists, pumping: up and out from each extra shoulder.
        h.applyBones();
        const sl = h.extraShoulderInBody('L', this.sL);
        const sr = h.extraShoulderInBody('R', this.sR);
        const out = this.tmp4.subVectors(sl, sr).setY(0).normalize();
        const pump = Math.sin(this.time * 9) * 0.06;
        h.extraHandL.copy(sl).addScaledVector(out, 0.2).add(this.tmp2.set(0, 0.5 + pump, 0));
        h.extraHandR.copy(sr).addScaledVector(out, -0.2).add(this.tmp2.set(0, 0.5 - pump, 0));
        h.extraPoleL.copy(out).setY(-0.6);
        h.extraPoleR.copy(out).negate().setY(-0.6);
        h.extraSlide.set(0, 0, 0);
      }
      const f = this.flip;
      if (!f.landed) {
        f.vel.y -= 9.81 * dt;
        f.pos.addScaledVector(f.vel, dt);
        f.rot.x += f.spin.x * dt;
        f.rot.y += f.spin.y * dt;
        f.rot.z += f.spin.z * dt;
        if (f.pos.y < 0.03 && f.vel.y < 0) {
          f.pos.y = 0.03;
          f.landed = true;
          f.rot.set(Math.PI / 2, f.rot.y, 0);
        }
      }
      this.bat.position.copy(f.pos);
      this.bat.rotation.copy(f.rot);
    } else {
      h.applyBones();
      this.keepGrip();
      p.handL.copy(this.K).addScaledVector(this.D, 0.07);
      p.handR.copy(this.K).addScaledVector(this.D, 0.16);
      if (this.extra) {
        // Second pair grips the bat further up the handle and swings along.
        h.extraHandL.copy(this.K).addScaledVector(this.D, 0.26 * this.batScale);
        h.extraHandR.copy(this.K).addScaledVector(this.D, 0.35 * this.batScale);
        // Free to slide along the bat (−0.24…+0.24) to stay within reach.
        h.extraSlide.copy(this.D).multiplyScalar(0.24 * this.batScale);
        h.extraPoleL.set(p.elbowPoleL.x + 0.5, p.elbowPoleL.y - 0.4, p.elbowPoleL.z);
        h.extraPoleR.set(p.elbowPoleR.x - 0.5, p.elbowPoleR.y - 0.4, p.elbowPoleR.z);
      }
      this.bat.position.copy(this.K);
      this.q.setFromUnitVectors(this.tmp2.set(0, 1, 0), this.D);
      this.bat.quaternion.copy(this.q);
      h.applyLimbs();
      return;
    }
    h.apply();
  }
}
