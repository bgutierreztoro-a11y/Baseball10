import * as THREE from 'three';
import type { CharacterLook, Hand, QualitySettings } from '../../contracts';
import { BALL } from '../../config/constants';
import { releasePoint } from '../../sim/pitch';
import type { CatcherRig, CharacterFactory, PitcherRig, UmpireRig } from '../api';
import { Batter } from './batter';
import { Humanoid, blendPose, copyPose, ease, easeOut, makePose } from './humanoid';

export { Batter, batterMetrics } from './batter';

/**
 * Character controllers. Every animation is driven by elapsed time (never by
 * frame count) so the bat reaches the contact pose exactly when the
 * simulation says it does.
 */

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
UMP_POSE.hipsPos.set(0, 0.72, -0.05);
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
  createBatter: (q, look) => new Batter(q, look),
  createPitcher: (q) => new Pitcher(q),
  createCatcher: (q) => new Catcher(q),
  createUmpire: (q) => new Umpire(q),
};
