import * as THREE from 'three';
import type { CharacterLook, Hand, QualitySettings, SwingKind } from '../../contracts';
import { BALL, PLATE } from '../../config/constants';
import { releasePoint } from '../../sim/pitch';
import type { BatterRig, CatcherRig, CharacterFactory, PitcherRig, UmpireRig } from '../api';
import { Humanoid, blendPose, copyPose, ease, easeOut, makePose, type HumanoidPose, type Outfit } from './humanoid';

/**
 * Character controllers. Every animation is driven by elapsed time (never by
 * frame count) so the bat reaches the contact pose exactly when the
 * simulation says it does.
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

const BATTER_OUTFIT: Outfit = {
  skin: '#c68c5a',
  jersey: '#f4f1e8',
  trim: '#d7263d',
  sleeve: '#0b1426',
  pants: '#ece8dc',
  socks: '#0b1426',
  shoes: '#15161a',
  hat: '#0b1426',
  gloves: '#d7263d',
  number: '10',
};

type BatterState = 'stance' | 'prepare' | 'swing' | 'celebrate' | 'react';

class Batter implements BatterRig {
  readonly root: THREE.Group;
  private readonly h: Humanoid;
  private readonly bat: THREE.Group;
  private readonly batWood: THREE.MeshStandardMaterial;
  private readonly batGrip: THREE.MeshStandardMaterial;
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
  private readonly q = new THREE.Quaternion();
  private flip: { pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; landed: boolean } | null = null;
  private reactKey: BatKey = SLUMP;

  constructor(quality: QualitySettings) {
    this.h = new Humanoid(BATTER_OUTFIT, quality);
    this.root = this.h.root;
    this.addHelmet();
    const bat = makeBat();
    this.bat = bat.group;
    this.batWood = bat.wood;
    this.batGrip = bat.grip;
    this.bat.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = quality.shadows;
    });
    this.h.body.add(this.bat);
    this.contact = key({}, new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
    this.from = key({}, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    this.cur = key({}, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    this.copyKey(STANCE, this.cur);
    this.applyCurrent();
  }

  private addHelmet(): void {
    const m = this.h.materials;
    const helmetMat = new THREE.MeshStandardMaterial({ color: '#0b1426', roughness: 0.25, metalness: 0.2 });
    m.helmet = helmetMat;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.132, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), helmetMat);
    shell.position.y = 0.01;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), helmetMat);
    brim.scale.set(1, 1, 0.7);
    brim.position.set(0, 0.0, 0.1);
    // Ear flap on the side facing the pitcher (+X).
    const flap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), helmetMat);
    flap.scale.set(0.45, 1, 1);
    flap.position.set(0.11, -0.05, 0.0);
    const logo = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), new THREE.MeshStandardMaterial({ color: '#d7263d', roughness: 0.4 }));
    logo.position.set(0, 0.06, 0.12);
    logo.rotation.x = -0.45;
    for (const x of [shell, brim, flap, logo]) {
      x.castShadow = true;
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
    target.copy(this.K).addScaledVector(this.D, SWEET);
    return this.h.body.localToWorld(target);
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

  /** Contact pose bends toward the aim so the sweet spot meets the ball there. */
  private computeContactKey(): void {
    this.root.updateWorldMatrix(true, true);
    const ss = this.h.body.worldToLocal(this.tmp.copy(this.aimWorld));
    const low = THREE.MathUtils.clamp((0.95 - ss.y) / 0.5, -0.4, 1);
    const power = this.swingKind === 'power' ? 1 : 0;
    const p = this.contact.pose;
    copyPose(EXTENSION.pose, p);
    p.hipsPos.set(0.06, 0.9 - low * 0.1, 0.0);
    p.hipsYaw = 0.72 + power * 0.12;
    p.hipsLean = 0.16 + low * 0.12;
    p.hipsRoll = -0.05 - low * 0.06;
    p.spineLean = 0.06 + low * 0.12;
    p.chestYaw = 0.2 + power * 0.08;
    p.chestLean = 0.08 + low * 0.18;
    p.headYaw = 0.55;
    p.headPitch = 0.3 + low * 0.25;
    p.footR.set(-0.34, 0.02, 0.02);
    p.footYawR = 0.9;
    p.elbowPoleL.set(0.3, -0.9, 0.2);
    p.elbowPoleR.set(-0.3, -0.9, 0.1);
    // Bat: mostly toward the plate with a little lag; tilt follows the pitch height.
    const ky = THREE.MathUtils.clamp(ss.y + 0.2, 0.86, 1.16);
    const dy = THREE.MathUtils.clamp((ss.y - ky) / SWEET, -0.7, 0.3);
    const hz = Math.sqrt(1 - dy * dy);
    this.contact.D.set(-0.16 * hz, dy, 0.99 * hz).normalize();
    this.contact.K.copy(ss).addScaledVector(this.contact.D, -SWEET);
  }

  update(dt: number): void {
    this.time += dt;
    this.t += dt;
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
    copyPose(c.pose, p);
    if (this.flip) {
      // Bat flies free; hands relax near the hips.
      p.handL.set(0.22, 0.9, 0.22);
      p.handR.set(-0.05, 0.92, 0.25);
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
      p.handL.copy(this.K).addScaledVector(this.D, 0.07);
      p.handR.copy(this.K).addScaledVector(this.D, 0.16);
      this.bat.position.copy(this.K);
      this.q.setFromUnitVectors(this.tmp2.set(0, 1, 0), this.D);
      this.bat.quaternion.copy(this.q);
    }
    this.h.apply();
  }
}

// ── Pitcher ──
const PITCH_SET = makePose();
Object.assign(PITCH_SET, { hipsYaw: -1.45, headYaw: 1.35, hipsLean: 0.05, footYawL: -1.4, footYawR: -1.5 });
PITCH_SET.hipsPos.set(0, 0.97, 0.18);
PITCH_SET.footR.set(0, 0, 0);
PITCH_SET.footL.set(0.04, 0, 0.42);
PITCH_SET.handL.set(-0.26, 1.18, 0.2);
PITCH_SET.handR.set(-0.27, 1.15, 0.16);
PITCH_SET.elbowPoleL.set(0.2, -1, 0.5);
PITCH_SET.elbowPoleR.set(-0.3, -1, -0.4);
PITCH_SET.kneePoleL.set(-1, 0, 0.2);
PITCH_SET.kneePoleR.set(-1, 0, -0.2);

const PITCH_LIFT = makePose();
Object.assign(PITCH_LIFT, { hipsYaw: -1.5, headYaw: 1.4, hipsLean: 0.0, footYawL: -1.3, footYawR: -1.5 });
PITCH_LIFT.hipsPos.set(0, 1.0, 0.08);
PITCH_LIFT.footR.set(0, 0, 0);
PITCH_LIFT.footL.set(-0.12, 0.5, 0.12);
PITCH_LIFT.handL.set(-0.25, 1.28, 0.08);
PITCH_LIFT.handR.set(-0.26, 1.25, 0.04);
PITCH_LIFT.elbowPoleL.set(0.2, -1, 0.5);
PITCH_LIFT.elbowPoleR.set(-0.3, -1, -0.4);
PITCH_LIFT.kneePoleL.set(-1, 0.3, 0.3);
PITCH_LIFT.kneePoleR.set(-1, 0, -0.2);

const PITCH_STRIDE = makePose();
Object.assign(PITCH_STRIDE, { hipsYaw: -1.0, chestYaw: -0.25, headYaw: 1.1, hipsLean: 0.1, chestLean: 0.0, footYawL: -0.3, footYawR: -1.4 });
PITCH_STRIDE.hipsPos.set(0, 0.84, 0.62);
PITCH_STRIDE.footR.set(0, 0, 0);
PITCH_STRIDE.footL.set(0.12, 0, 1.45);
PITCH_STRIDE.handL.set(0.45, 1.32, 1.0);
PITCH_STRIDE.handR.set(-0.62, 1.62, 0.12);
PITCH_STRIDE.elbowPoleL.set(0.3, -0.6, 0.5);
PITCH_STRIDE.elbowPoleR.set(-0.5, -0.4, -0.6);
PITCH_STRIDE.kneePoleL.set(0, 0, 1);
PITCH_STRIDE.kneePoleR.set(-0.6, -0.2, 0.3);

const PITCH_RELEASE = makePose();
Object.assign(PITCH_RELEASE, { hipsYaw: -0.05, chestYaw: 0.1, headYaw: 0.05, hipsLean: 0.28, spineLean: 0.18, chestLean: 0.3, headPitch: -0.3, footYawL: -0.1, footYawR: -1.2 });
PITCH_RELEASE.hipsPos.set(0.02, 0.8, 0.95);
PITCH_RELEASE.footR.set(-0.05, 0.08, 0.15);
PITCH_RELEASE.footL.set(0.12, 0, 1.48);
PITCH_RELEASE.handL.set(0.32, 1.02, 1.12);
PITCH_RELEASE.handR.set(-0.5, 1.55, 1.75);
PITCH_RELEASE.elbowPoleL.set(0.6, -0.8, -0.3);
PITCH_RELEASE.elbowPoleR.set(-0.8, 0.3, -0.2);
PITCH_RELEASE.kneePoleL.set(0, 0, 1);
PITCH_RELEASE.kneePoleR.set(-0.5, -0.5, 0.4);

const PITCH_FOLLOW = makePose();
Object.assign(PITCH_FOLLOW, { hipsYaw: 0.45, chestYaw: 0.25, headYaw: -0.3, hipsLean: 0.45, spineLean: 0.25, chestLean: 0.35, headPitch: -0.45, footYawL: 0.1, footYawR: -0.2 });
PITCH_FOLLOW.hipsPos.set(0.05, 0.76, 1.12);
PITCH_FOLLOW.footR.set(-0.28, 0.32, 0.85);
PITCH_FOLLOW.footL.set(0.12, 0, 1.48);
PITCH_FOLLOW.handL.set(0.3, 0.95, 1.2);
PITCH_FOLLOW.handR.set(0.38, 0.62, 1.42);
PITCH_FOLLOW.elbowPoleL.set(0.6, -0.8, -0.3);
PITCH_FOLLOW.elbowPoleR.set(-0.4, 0.4, 0.6);
PITCH_FOLLOW.kneePoleL.set(0, 0, 1);
PITCH_FOLLOW.kneePoleR.set(-0.3, 0, 1);

const PITCH_READY = makePose();
Object.assign(PITCH_READY, { hipsYaw: 0, hipsLean: 0.32, spineLean: 0.1, chestLean: 0.1, headPitch: -0.15, footYawL: 0.1, footYawR: -0.1 });
PITCH_READY.hipsPos.set(0, 0.86, 1.12);
PITCH_READY.footR.set(-0.3, 0, 1.0);
PITCH_READY.footL.set(0.3, 0, 1.3);
PITCH_READY.handL.set(0.22, 1.0, 1.42);
PITCH_READY.handR.set(-0.2, 1.0, 1.42);
PITCH_READY.elbowPoleL.set(0.6, -0.8, 0);
PITCH_READY.elbowPoleR.set(-0.6, -0.8, 0);
PITCH_READY.kneePoleL.set(0.2, 0, 1);
PITCH_READY.kneePoleR.set(-0.2, 0, 1);

type PitcherState = 'set' | 'delivery';

class Pitcher implements PitcherRig {
  readonly root: THREE.Group;
  private h: Humanoid;
  private readonly quality: QualitySettings;
  private ball: THREE.Mesh;
  private glove: THREE.Mesh;
  private state: PitcherState = 'set';
  private t = 0;
  private release = 1;
  private time = 0;
  private readonly from = makePose();
  private readonly releaseTarget = new THREE.Vector3();

  constructor(quality: QualitySettings) {
    this.quality = quality;
    this.root = new THREE.Group();
    this.h = this.build({ skin: '#c68c5a', jersey: '#ffffff', jerseyTrim: '#d7263d', pants: '#dddddd', cap: '#d7263d', build: 1 }, 'R');
    this.ball = this.makeBall();
    this.glove = this.makeGlove();
    this.attach();
  }

  private build(look: CharacterLook, hand: Hand): Humanoid {
    const h = new Humanoid(
      { skin: look.skin, jersey: look.jersey, trim: look.jerseyTrim, sleeve: look.cap, pants: look.pants, socks: look.cap, shoes: '#111216', hat: look.cap, build: look.build, number: '' },
      this.quality,
    );
    const capMat = h.materials.hat!;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.122, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), capMat);
    crown.position.y = 0.02;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 14, 1, false, -Math.PI / 2, Math.PI), capMat);
    brim.position.set(0, 0.02, 0.1);
    brim.scale.set(1, 1, 0.8);
    h.head.add(crown, brim);
    h.setMirrored(hand === 'L');
    return h;
  }

  private makeBall(): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.SphereGeometry(BALL.radius * 1.2, 12, 8), new THREE.MeshStandardMaterial({ color: '#f7f5ef', roughness: 0.5 }));
    return m;
  }

  private makeGlove(): THREE.Mesh {
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshStandardMaterial({ color: '#7a4a24', roughness: 0.6 }));
    g.scale.set(0.7, 1.15, 1);
    g.castShadow = this.quality.shadows;
    return g;
  }

  private attach(): void {
    this.root.add(this.h.root);
    this.h.handR.add(this.ball);
    this.ball.position.set(0, 0, 0.04);
    this.h.handL.add(this.glove);
  }

  setLook(look: CharacterLook, hand: Hand): void {
    this.root.remove(this.h.root);
    this.h.dispose();
    this.h = this.build(look, hand);
    this.attach();
    this.reset();
  }

  startDelivery(timeToRelease: number): void {
    copyPose(this.h.pose, this.from);
    this.state = 'delivery';
    this.t = 0;
    this.release = timeToRelease;
    this.ball.visible = true;
  }

  reset(): void {
    this.state = 'set';
    this.ball.visible = true;
    copyPose(PITCH_SET, this.h.pose);
    this.h.apply();
  }

  update(dt: number): void {
    this.time += dt;
    const p = this.h.pose;
    if (this.state === 'set') {
      copyPose(PITCH_SET, p);
      p.hipsPos.y += Math.sin(this.time * 1.4) * 0.005;
      p.headPitch = Math.sin(this.time * 0.7) * 0.04;
    } else {
      this.t += dt;
      const R = this.release;
      const t = this.t;
      const k1 = R * 0.38;
      const k2 = R * 0.78;
      if (t < k1) blendPose(this.from, PITCH_LIFT, ease(t / k1), p);
      else if (t < k2) blendPose(PITCH_LIFT, PITCH_STRIDE, ease((t - k1) / (k2 - k1)), p);
      else if (t < R) blendPose(PITCH_STRIDE, PITCH_RELEASE, (t - k2) / (R - k2), p);
      else if (t < R + 0.35) blendPose(PITCH_RELEASE, PITCH_FOLLOW, easeOut((t - R) / 0.35), p);
      else blendPose(PITCH_FOLLOW, PITCH_READY, ease(Math.min(1, (t - R - 0.35) / 0.6)), p);
      if (t >= R && t < R + 0.12) {
        // Hand passes through the physics release point.
        this.root.updateWorldMatrix(true, true);
        const rp = releasePoint(this.h.body.scale.x < 0 ? 'L' : 'R');
        this.h.body.worldToLocal(this.releaseTarget.set(rp.x, rp.y, rp.z));
        p.handR.lerp(this.releaseTarget, 1 - (t - R) / 0.12);
      }
      this.ball.visible = t < R;
    }
    this.h.apply();
  }
}

// ── Catcher ──
const CATCH_POSE = makePose();
Object.assign(CATCH_POSE, { hipsLean: 0.5, spineLean: 0.12, chestLean: 0.0, headPitch: -0.45, footYawL: 0.5, footYawR: -0.5 });
CATCH_POSE.hipsPos.set(0, 0.4, 0.0);
CATCH_POSE.footL.set(0.36, 0, 0.12);
CATCH_POSE.footR.set(-0.36, 0, 0.12);
CATCH_POSE.kneePoleL.set(0.8, 0.2, 1);
CATCH_POSE.kneePoleR.set(-0.8, 0.2, 1);
CATCH_POSE.handR.set(-0.3, 0.52, 0.2);
CATCH_POSE.elbowPoleL.set(0.6, -0.6, -0.2);
CATCH_POSE.elbowPoleR.set(-0.6, -0.4, -0.4);

class Catcher implements CatcherRig {
  readonly root: THREE.Group;
  private readonly h: Humanoid;
  private readonly target = new THREE.Vector3(0.0, 0.62, 0.5);
  private readonly mitt = new THREE.Vector3(0.0, 0.62, 0.5);
  private pop = 0;
  private time = 0;

  constructor(quality: QualitySettings) {
    this.h = new Humanoid({ skin: '#a5694f', jersey: '#2b2d42', trim: '#8d99ae', sleeve: '#2b2d42', pants: '#d9d9d9', socks: '#1b1b1f', shoes: '#111', hat: '#1b1b1f', build: 1.1 }, quality);
    this.root = this.h.root;
    const gear = new THREE.MeshStandardMaterial({ color: '#1f2128', roughness: 0.5 });
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10), gear);
    helmet.scale.set(1, 1, 1.08);
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 14, Math.PI), new THREE.MeshStandardMaterial({ color: '#9aa1a9', metalness: 0.7, roughness: 0.3 }));
    cage.position.set(0, -0.02, 0.1);
    cage.rotation.set(0, 0, Math.PI);
    this.h.head.add(helmet, cage);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.08), gear);
    chest.position.set(0, 0.0, 0.12);
    this.h.chest.add(chest);
    const mitt = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.55 }));
    mitt.scale.set(1, 1.1, 0.55);
    mitt.position.set(0, 0.03, 0.04);
    this.h.handL.add(mitt);
    for (const m of [helmet, chest, mitt]) m.castShadow = quality.shadows;
    this.reset();
  }

  setTarget(x: number, y: number): void {
    this.root.updateWorldMatrix(true, false);
    const local = this.h.body.worldToLocal(new THREE.Vector3(x, y, -0.35));
    this.target.set(THREE.MathUtils.clamp(local.x, -0.45, 0.6), THREE.MathUtils.clamp(local.y, 0.25, 1.25), THREE.MathUtils.clamp(local.z, 0.35, 0.6));
  }

  receive(): void {
    this.pop = 1;
  }

  setGhost(opacity: number): void {
    this.h.setOpacity(opacity);
  }

  reset(): void {
    this.target.set(0, 0.62, 0.5);
    this.mitt.copy(this.target);
    this.pop = 0;
  }

  update(dt: number): void {
    this.time += dt;
    this.mitt.lerp(this.target, 1 - Math.exp(-dt * 10));
    this.pop = Math.max(0, this.pop - dt * 5);
    const p = this.h.pose;
    copyPose(CATCH_POSE, p);
    p.hipsPos.y += Math.sin(this.time * 1.6) * 0.004;
    p.handL.copy(this.mitt);
    p.handL.z -= this.pop * 0.1;
    this.h.apply();
  }
}

// ── Umpire ──
const UMP_POSE = makePose();
Object.assign(UMP_POSE, { hipsLean: 0.55, spineLean: 0.1, chestLean: 0.0, headPitch: -0.5, footYawL: 0.3, footYawR: -0.3 });
UMP_POSE.hipsPos.set(0, 0.78, -0.05);
UMP_POSE.footL.set(0.32, 0, 0.0);
UMP_POSE.footR.set(-0.32, 0, 0.0);
UMP_POSE.kneePoleL.set(0.4, 0, 1);
UMP_POSE.kneePoleR.set(-0.4, 0, 1);
UMP_POSE.handL.set(0.26, 0.62, 0.22);
UMP_POSE.handR.set(-0.26, 0.62, 0.22);
UMP_POSE.elbowPoleL.set(1, 0, -0.3);
UMP_POSE.elbowPoleR.set(-1, 0, -0.3);

class Umpire implements UmpireRig {
  readonly root: THREE.Group;
  private readonly h: Humanoid;
  private call = -1;

  constructor(quality: QualitySettings) {
    this.h = new Humanoid({ skin: '#e0ac69', jersey: '#1d2b4f', trim: '#1d2b4f', sleeve: '#1d2b4f', pants: '#5c636e', socks: '#111', shoes: '#111', hat: '#111', build: 1.12 }, quality);
    this.root = this.h.root;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.122, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), this.h.materials.hat!);
    const mask = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 14, Math.PI), new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.4 }));
    mask.position.set(0, -0.02, 0.1);
    mask.rotation.z = Math.PI;
    this.h.head.add(cap, mask);
    this.reset();
  }

  callStrike(): void {
    this.call = 0;
  }

  setGhost(opacity: number): void {
    this.h.setOpacity(opacity);
  }

  reset(): void {
    this.call = -1;
  }

  update(dt: number): void {
    const p = this.h.pose;
    copyPose(UMP_POSE, p);
    if (this.call >= 0) {
      this.call += dt;
      const c = this.call;
      // Stand up, then punch out with the right arm.
      const up = ease(Math.min(1, c / 0.25)) * (1 - ease(Math.max(0, (c - 1.0) / 0.4)));
      p.hipsPos.y += up * 0.18;
      p.hipsLean -= up * 0.4;
      p.headPitch += up * 0.4;
      const punch = c < 0.3 ? ease(c / 0.3) : c < 0.9 ? 1 : 1 - ease((c - 0.9) / 0.4);
      p.handR.set(-0.26 - punch * 0.45, 0.62 + punch * 0.95, 0.22 + punch * 0.2);
      p.elbowPoleR.set(-1, 0.5, -0.2);
      if (c > 1.5) this.call = -1;
    }
    this.h.apply();
  }
}

export const characters: CharacterFactory = {
  createBatter: (q) => new Batter(q),
  createPitcher: (q) => new Pitcher(q),
  createCatcher: (q) => new Catcher(q),
  createUmpire: (q) => new Umpire(q),
};
