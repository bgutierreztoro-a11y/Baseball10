import * as THREE from 'three';
import type { BatterLook, CharacterLook, QualitySettings } from '../../contracts';
import type { FielderId, XZ } from '../../sim/baserunning';
import { dressBatter, makeWheelchair } from './batter';
import { Humanoid, type HumanoidPose } from './humanoid';

/**
 * Base running in 3D: the runners (the batter in his own look, plus generic
 * teammates on base) and the eight fielders of the rival team. Every pose is
 * procedural (IK humanoid), driven by distance travelled so the feet never
 * slide whatever the runner's speed or size.
 */

const BASE_HEIGHT = 1.85;

/** Run cycle into `p` at phase `ph` (radians; 2π = two steps). */
function runPose(p: HumanoidPose, ph: number, effort = 1): void {
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  p.hipsPos.set(0, 0.9 + 0.035 * Math.abs(c) * effort, 0.04);
  p.hipsYaw = 0.12 * s * effort;
  p.hipsLean = 0.2 * effort;
  p.hipsRoll = 0;
  p.spineYaw = 0;
  p.spineLean = 0.1 * effort;
  p.chestYaw = -0.2 * s * effort;
  p.chestLean = 0.05;
  p.headYaw = 0;
  p.headPitch = -0.12;
  p.footL.set(0.11, 0.26 * Math.max(0, c) * effort, 0.04 + 0.42 * s * effort);
  p.footR.set(-0.11, 0.26 * Math.max(0, -c) * effort, 0.04 - 0.42 * s * effort);
  p.footYawL = 0;
  p.footYawR = 0;
  p.kneePoleL.set(0.1, 0, 1);
  p.kneePoleR.set(-0.1, 0, 1);
  p.handL.set(0.21, 1.0 + 0.12 * Math.max(0, -s) * effort, 0.1 - 0.3 * s * effort);
  p.handR.set(-0.21, 1.0 + 0.12 * Math.max(0, s) * effort, 0.1 + 0.3 * s * effort);
  p.elbowPoleL.set(0.4, -0.5, -1);
  p.elbowPoleR.set(-0.4, -0.5, -1);
}

function standPose(p: HumanoidPose, t: number, crouch = 0): void {
  p.hipsYaw = 0;
  p.hipsRoll = 0;
  p.spineYaw = 0;
  p.spineLean = 0;
  p.chestYaw = 0;
  p.chestLean = 0;
  p.headYaw = 0;
  p.footYawL = 0;
  p.footYawR = 0;
  p.hipsPos.set(0, 0.97 - 0.3 * crouch + Math.sin(t * 1.5) * 0.004, 0);
  p.hipsLean = 0.45 * crouch;
  p.headPitch = -0.1 * crouch;
  p.footL.set(0.17 + 0.1 * crouch, 0, 0.02);
  p.footR.set(-0.17 - 0.1 * crouch, 0, -0.02);
  p.kneePoleL.set(0.4, 0, 1);
  p.kneePoleR.set(-0.4, 0, 1);
  // Hands on the knees when crouched, loose at the sides standing.
  p.handL.set(0.2 + 0.05 * crouch, 0.82 - 0.22 * crouch, 0.05 + 0.25 * crouch);
  p.handR.set(-0.2 - 0.05 * crouch, 0.82 - 0.22 * crouch, 0.05 + 0.25 * crouch);
  p.elbowPoleL.set(0.8, -0.3, -0.4);
  p.elbowPoleR.set(-0.8, -0.3, -0.4);
}

function slidePose(p: HumanoidPose): void {
  p.hipsPos.set(0, 0.3, 0.1);
  p.hipsYaw = 0;
  p.hipsLean = -1.0;
  p.hipsRoll = 0;
  p.spineLean = 0.25;
  p.chestLean = 0.2;
  p.headPitch = 0.35;
  p.footL.set(0.12, 0.1, 0.95);
  p.footR.set(-0.14, 0.05, 0.62);
  p.kneePoleL.set(0, 1, 0.4);
  p.kneePoleR.set(0, 1, 0.3);
  p.handL.set(0.3, 0.9, -0.1);
  p.handR.set(-0.35, 1.1, 0.05);
  p.elbowPoleL.set(1, 0, -0.5);
  p.elbowPoleR.set(-1, 0, -0.5);
}

export type RunnerMode = 'run' | 'stand' | 'slide' | 'lead';

/** One base runner (the batter in his own look, or a generic teammate). */
export class RunnerRig {
  readonly root = new THREE.Group();
  private readonly h: Humanoid;
  private readonly scale: number;
  private readonly chair: THREE.Group | null;
  private phase = 0;
  private time = 0;
  private mode: RunnerMode = 'stand';
  private speed = 0;
  private readonly last = new THREE.Vector3();
  private placed = false;

  constructor(quality: QualitySettings, look: BatterLook) {
    // Giants are capped so they still fit on the base paths.
    const height = Math.min(look.heightM, 4.5);
    this.scale = height / BASE_HEIGHT;
    const { h } = dressBatter({ ...look, heightM: height }, quality, this.scale);
    this.h = h;
    this.root.add(h.root);
    this.chair = look.wheelchair ? makeWheelchair(quality) : null;
    if (this.chair) h.body.add(this.chair);
    this.root.visible = false;
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  /** Puts him at a field point facing `heading` (world yaw: atan2(dx, dz)). */
  place(at: XZ, heading: number, mode: RunnerMode): void {
    if (this.placed) {
      const d = Math.hypot(at.x - this.last.x, at.z - this.last.z);
      this.speed = d;
    }
    this.root.position.set(at.x, 0, at.z);
    this.last.set(at.x, 0, at.z);
    this.placed = true;
    // Smooth turn toward the new heading.
    let dy = heading - this.root.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.root.rotation.y += dy * 0.35;
    this.mode = mode;
  }

  update(dt: number): void {
    if (!this.root.visible) return;
    this.time += dt;
    const p = this.h.pose;
    // Distance this frame drives the cycle: 2π per ~2.4 m (×size).
    const moved = dt > 0 ? this.speed : 0;
    this.speed = 0;
    if (this.chair) {
      // Wheelchair: seated, pushing the hand rims.
      this.phase += (moved / (1.6 * this.scale)) * Math.PI * 2;
      standPose(p, this.time, 0);
      p.hipsPos.set(0, 0.6, -0.06);
      p.hipsLean = 0.15;
      p.footL.set(0.17, 0.13, 0.43);
      p.footR.set(-0.17, 0.13, 0.43);
      p.kneePoleL.set(0.15, 1, 0.5);
      p.kneePoleR.set(-0.15, 1, 0.5);
      const push = this.mode === 'run' ? Math.sin(this.phase) : 0;
      p.handL.set(0.32, 0.5 + 0.12 * push, -0.05 + 0.2 * Math.cos(this.phase) * (this.mode === 'run' ? 1 : 0));
      p.handR.set(-0.32, 0.5 + 0.12 * push, -0.05 + 0.2 * Math.cos(this.phase) * (this.mode === 'run' ? 1 : 0));
      this.h.apply();
      return;
    }
    if (this.mode === 'run') {
      this.phase += (moved / (2.4 * this.scale)) * Math.PI * 2;
      runPose(p, this.phase, 1);
    } else if (this.mode === 'slide') {
      slidePose(p);
    } else {
      standPose(p, this.time, this.mode === 'lead' ? 0.6 : 0);
    }
    this.h.apply();
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    this.h.dispose();
  }
}

export type FielderMode = 'ready' | 'run' | 'throw' | 'catch' | 'stand';

/** One fielder of the rival team, glove on the left hand. */
class FielderRig {
  readonly root = new THREE.Group();
  readonly h: Humanoid;
  private phase = 0;
  private time = 0;
  mode: FielderMode = 'ready';
  private modeT = 0;
  private readonly last = new THREE.Vector3();
  private moved = 0;

  constructor(quality: QualitySettings, look: CharacterLook) {
    this.h = new Humanoid({ skin: look.skin, jersey: look.jersey, trim: look.jerseyTrim, sleeve: look.cap, pants: look.pants, socks: look.socks ?? look.cap, shoes: look.shoes ?? '#111216', hat: look.cap, build: 1, number: '' }, quality, { face: true });
    const capMat = this.h.materials.hat!;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.122, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), capMat);
    crown.position.y = 0.02;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 12, 1, false, -Math.PI / 2, Math.PI), capMat);
    brim.position.set(0, 0.02, 0.1);
    brim.scale.set(1, 1, 0.8);
    this.h.head.add(crown, brim);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: '#7a4a24', roughness: 0.6 }));
    glove.scale.set(0.7, 1.15, 1);
    this.h.handL.add(glove);
    for (const m of [crown, brim, glove]) m.castShadow = quality.shadows;
    this.root.add(this.h.root);
  }

  place(at: XZ, face: XZ): void {
    this.moved += Math.hypot(at.x - this.last.x, at.z - this.last.z);
    this.root.position.set(at.x, 0, at.z);
    this.last.set(at.x, 0, at.z);
    const yaw = Math.atan2(face.x - at.x, face.z - at.z);
    let dy = yaw - this.root.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.root.rotation.y += dy * 0.3;
  }

  setMode(m: FielderMode): void {
    if (m === this.mode) return;
    this.mode = m;
    this.modeT = 0;
  }

  update(dt: number): void {
    this.time += dt;
    this.modeT += dt;
    const p = this.h.pose;
    const moved = this.moved;
    this.moved = 0;
    if (this.mode === 'run' && moved > 0.001) {
      this.phase += (moved / 2.4) * Math.PI * 2;
      runPose(p, this.phase, 1);
    } else if (this.mode === 'throw') {
      standPose(p, this.time, 0.1);
      const k = Math.min(1, this.modeT / 0.35);
      // Arm back over the shoulder, then whip forward.
      const back = k < 0.6 ? k / 0.6 : 1 - (k - 0.6) / 0.4;
      p.handR.set(-0.3, 1.1 + 0.55 * back, 0.1 - 0.45 * back + (k > 0.6 ? (k - 0.6) * 1.6 : 0));
      p.elbowPoleR.set(-1, 0.3, -0.4);
      p.chestYaw = 0.5 * back - 0.3 * (k > 0.6 ? 1 : 0);
      p.footL.set(0.2, 0, 0.35);
    } else if (this.mode === 'catch') {
      standPose(p, this.time, 0.15);
      p.handL.set(0.12, 1.35, 0.35);
      p.elbowPoleL.set(0.8, -0.5, 0);
    } else {
      standPose(p, this.time, this.mode === 'ready' ? 0.55 : 0);
    }
    this.h.apply();
  }

  dispose(): void {
    this.h.dispose();
  }
}

/** The rival team in the field (quick-game mode only). */
export class FieldersView {
  readonly root = new THREE.Group();
  private readonly quality: QualitySettings;
  private readonly rigs = new Map<FielderId, FielderRig>();
  private homes = new Map<FielderId, XZ>();
  private look: CharacterLook | null = null;

  constructor(quality: QualitySettings) {
    this.quality = quality;
    this.root.visible = false;
  }

  /**
   * Dresses the defence (rival colours) and puts everyone at his spot.
   * `homes` = where each fielder plays (from the simulation, via the game layer).
   */
  setTeam(look: CharacterLook, homes: ReadonlyMap<FielderId, XZ>): void {
    this.homes = new Map(homes);
    if (this.look !== look) {
      this.look = look;
      for (const r of this.rigs.values()) {
        this.root.remove(r.root);
        r.dispose();
      }
      this.rigs.clear();
      for (const id of this.homes.keys()) {
        const r = new FielderRig(this.quality, look);
        this.rigs.set(id, r);
        this.root.add(r.root);
      }
    }
    this.reset();
  }

  reset(): void {
    for (const [id, r] of this.rigs) {
      const home = this.homes.get(id);
      if (!home) continue;
      r.place(home, { x: 0, z: 0 });
      r.root.rotation.y = Math.atan2(-home.x, -home.z);
      r.setMode('ready');
    }
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  /** Moves a fielder (null = back to his spot) facing a point. */
  move(id: FielderId, at: XZ, face: XZ, mode: FielderMode): void {
    const r = this.rigs.get(id);
    if (!r) return;
    r.place(at, face);
    r.setMode(mode);
  }

  home(id: FielderId): XZ {
    return this.homes.get(id) ?? { x: 0, z: 0 };
  }

  /** World position of a fielder's glove (to put the ball in it). */
  glove(id: FielderId, out: THREE.Vector3): THREE.Vector3 | null {
    const r = this.rigs.get(id);
    if (!r) return null;
    r.h.handL.updateWorldMatrix(true, false);
    return r.h.handL.getWorldPosition(out);
  }

  update(dt: number): void {
    if (!this.root.visible) return;
    for (const r of this.rigs.values()) r.update(dt);
  }

  dispose(): void {
    for (const r of this.rigs.values()) r.dispose();
    this.rigs.clear();
  }
}
