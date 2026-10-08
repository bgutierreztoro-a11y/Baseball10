import * as THREE from 'three';
import type { QualitySettings } from '../../contracts';

/**
 * Stylized procedural humanoid ("designer toy" proportions).
 *
 * The torso chain (hips → spine → chest → neck → head) uses bones driven by
 * keyframed angles. Arms and legs are two-segment limbs solved with analytic
 * IK every frame: hands go to grip/throw targets, feet stay planted. All poses
 * are authored in the character's local frame: +Z forward, +X the
 * character's LEFT, +Y up, origin between the feet.
 */
export interface Outfit {
  skin: string;
  jersey: string;
  trim: string;
  /** Undershirt / sleeves. */
  sleeve: string;
  pants: string;
  socks: string;
  shoes: string;
  hat: string;
  /** Batting gloves; defaults to skin. */
  gloves?: string;
  build?: number;
  /** Number printed on the back of the jersey. */
  number?: string;
}

export interface HumanoidPose {
  hipsPos: THREE.Vector3;
  /** Yaw (Y), lean forward (X, + = bend forward), roll (Z). Radians. */
  hipsYaw: number;
  hipsLean: number;
  hipsRoll: number;
  spineYaw: number;
  spineLean: number;
  chestYaw: number;
  chestLean: number;
  headYaw: number;
  headPitch: number;
  handL: THREE.Vector3;
  handR: THREE.Vector3;
  elbowPoleL: THREE.Vector3;
  elbowPoleR: THREE.Vector3;
  footL: THREE.Vector3;
  footR: THREE.Vector3;
  kneePoleL: THREE.Vector3;
  kneePoleR: THREE.Vector3;
  /** Foot yaw (radians) for each foot. */
  footYawL: number;
  footYawR: number;
}

export function makePose(): HumanoidPose {
  return {
    hipsPos: new THREE.Vector3(0, 0.98, 0),
    hipsYaw: 0,
    hipsLean: 0,
    hipsRoll: 0,
    spineYaw: 0,
    spineLean: 0,
    chestYaw: 0,
    chestLean: 0,
    headYaw: 0,
    headPitch: 0,
    handL: new THREE.Vector3(0.25, 0.85, 0.05),
    handR: new THREE.Vector3(-0.25, 0.85, 0.05),
    elbowPoleL: new THREE.Vector3(0.6, -0.5, -0.6),
    elbowPoleR: new THREE.Vector3(-0.6, -0.5, -0.6),
    footL: new THREE.Vector3(0.12, 0, 0),
    footR: new THREE.Vector3(-0.12, 0, 0),
    kneePoleL: new THREE.Vector3(0.2, 0, 1),
    kneePoleR: new THREE.Vector3(-0.2, 0, 1),
    footYawL: 0,
    footYawR: 0,
  };
}

/** Linear blend of two poses into `out` (angles and vectors). */
export function blendPose(a: HumanoidPose, b: HumanoidPose, t: number, out: HumanoidPose): HumanoidPose {
  const s = (x: number, y: number): number => x + (y - x) * t;
  out.hipsPos.lerpVectors(a.hipsPos, b.hipsPos, t);
  out.hipsYaw = s(a.hipsYaw, b.hipsYaw);
  out.hipsLean = s(a.hipsLean, b.hipsLean);
  out.hipsRoll = s(a.hipsRoll, b.hipsRoll);
  out.spineYaw = s(a.spineYaw, b.spineYaw);
  out.spineLean = s(a.spineLean, b.spineLean);
  out.chestYaw = s(a.chestYaw, b.chestYaw);
  out.chestLean = s(a.chestLean, b.chestLean);
  out.headYaw = s(a.headYaw, b.headYaw);
  out.headPitch = s(a.headPitch, b.headPitch);
  out.handL.lerpVectors(a.handL, b.handL, t);
  out.handR.lerpVectors(a.handR, b.handR, t);
  out.elbowPoleL.lerpVectors(a.elbowPoleL, b.elbowPoleL, t);
  out.elbowPoleR.lerpVectors(a.elbowPoleR, b.elbowPoleR, t);
  out.footL.lerpVectors(a.footL, b.footL, t);
  out.footR.lerpVectors(a.footR, b.footR, t);
  out.kneePoleL.lerpVectors(a.kneePoleL, b.kneePoleL, t);
  out.kneePoleR.lerpVectors(a.kneePoleR, b.kneePoleR, t);
  out.footYawL = s(a.footYawL, b.footYawL);
  out.footYawR = s(a.footYawR, b.footYawR);
  return out;
}

export function copyPose(src: HumanoidPose, out: HumanoidPose): HumanoidPose {
  return blendPose(src, src, 0, out);
}

const UPPER_ARM = 0.3;
const FOREARM = 0.28;
const THIGH = 0.46;
const SHIN = 0.45;
const UP = new THREE.Vector3(0, 1, 0);

interface Limb {
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  end: THREE.Object3D;
  a: number;
  b: number;
}

/** Shared geometry cache (characters reuse primitives). */
const geoCache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export class Humanoid {
  /** Placed by the game (position/rotation in world). */
  readonly root = new THREE.Group();
  /** Inner frame; scale.x = −1 mirrors the character (left-handed). */
  readonly body = new THREE.Group();
  readonly hips = new THREE.Object3D();
  readonly spine = new THREE.Object3D();
  readonly chest = new THREE.Object3D();
  readonly neck = new THREE.Object3D();
  readonly head = new THREE.Object3D();
  readonly pose = makePose();
  readonly handL: THREE.Object3D;
  readonly handR: THREE.Object3D;
  private readonly armL: Limb;
  private readonly armR: Limb;
  private readonly legL: Limb;
  private readonly legR: Limb;
  private readonly footMeshL: THREE.Object3D;
  private readonly footMeshR: THREE.Object3D;
  private readonly shoulderL = new THREE.Object3D();
  private readonly shoulderR = new THREE.Object3D();
  private readonly hipJointL = new THREE.Object3D();
  private readonly hipJointR = new THREE.Object3D();
  readonly materials: Record<string, THREE.MeshStandardMaterial>;
  private readonly segs: number;

  // Scratch vectors (allocation-free updates).
  private readonly s = new THREE.Vector3();
  private readonly e = new THREE.Vector3();
  private readonly d = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly m = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly ankle = new THREE.Vector3();

  constructor(outfit: Outfit, quality: QualitySettings) {
    this.segs = quality.tier === 'low' ? 8 : quality.tier === 'medium' ? 12 : 16;
    const mat = (color: string, rough = 0.7): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
    this.materials = {
      skin: mat(outfit.skin, 0.6),
      jersey: mat(outfit.jersey, 0.75),
      trim: mat(outfit.trim, 0.6),
      sleeve: mat(outfit.sleeve, 0.7),
      pants: mat(outfit.pants, 0.8),
      socks: mat(outfit.socks, 0.8),
      shoes: mat(outfit.shoes, 0.45),
      hat: mat(outfit.hat, 0.45),
      gloves: mat(outfit.gloves ?? outfit.skin, 0.55),
      belt: mat('#1b1b1f', 0.5),
    };
    const M = this.materials;
    const build = outfit.build ?? 1;
    const shadow = quality.shadows;
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh => {
      const x = new THREE.Mesh(g, m);
      x.castShadow = shadow;
      x.receiveShadow = false;
      return x;
    };
    const S = this.segs;

    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.add(this.spine);
    this.spine.position.y = 0.1;
    this.spine.add(this.chest);
    this.chest.position.y = 0.24;
    this.chest.add(this.neck);
    this.neck.position.y = 0.22;
    this.neck.add(this.head);
    this.head.position.y = 0.11;

    // Pelvis + belt.
    const pelvis = mesh(geo(`pelvis${S}`, () => new THREE.CapsuleGeometry(0.15, 0.08, 4, S)), M.pants!);
    pelvis.scale.set(1.15 * build, 1, 0.8);
    pelvis.rotation.z = Math.PI / 2;
    this.hips.add(pelvis);
    const belt = mesh(geo(`belt${S}`, () => new THREE.CylinderGeometry(0.165, 0.165, 0.05, S * 2)), M.belt!);
    belt.scale.set(build, 1, 0.82);
    belt.position.y = 0.09;
    this.hips.add(belt);

    // Torso: abdomen + chest (jersey) with trim piping.
    const abdomen = mesh(geo(`abd${S}`, () => new THREE.CapsuleGeometry(0.145, 0.12, 4, S)), M.jersey!);
    abdomen.scale.set(1.05 * build, 1, 0.78);
    abdomen.position.y = 0.06;
    this.spine.add(abdomen);
    const torso = mesh(geo(`torso${S}`, () => new THREE.CapsuleGeometry(0.17, 0.16, 6, S)), M.jersey!);
    torso.scale.set(1.12 * build, 1, 0.74);
    torso.position.y = 0.05;
    this.chest.add(torso);
    const piping = mesh(geo('piping', () => new THREE.BoxGeometry(0.02, 0.4, 0.02)), M.trim!);
    piping.position.set(0, -0.05, 0.128);
    this.chest.add(piping);
    if (outfit.number) {
      const tex = numberTexture(outfit.number, outfit.trim);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
      back.position.set(0, 0.07, -0.128 * 1.02);
      back.rotation.y = Math.PI;
      this.chest.add(back);
    }
    const neckMesh = mesh(geo(`neck${S}`, () => new THREE.CylinderGeometry(0.055, 0.065, 0.12, S)), M.skin!);
    neckMesh.position.y = -0.06;
    this.neck.add(neckMesh);
    const headMesh = mesh(geo(`head${S}`, () => new THREE.SphereGeometry(0.115, S * 2, S)), M.skin!);
    headMesh.scale.set(0.92, 1.05, 1);
    this.head.add(headMesh);
    // Nose hint so facing direction reads.
    const nose = mesh(geo('nose', () => new THREE.SphereGeometry(0.022, 6, 4)), M.skin!);
    nose.position.set(0, -0.005, 0.11);
    this.head.add(nose);

    // Shoulders / hips joints.
    this.chest.add(this.shoulderL, this.shoulderR);
    this.shoulderL.position.set(0.21 * build, 0.14, 0);
    this.shoulderR.position.set(-0.21 * build, 0.14, 0);
    const deltoid = geo(`delt${S}`, () => new THREE.SphereGeometry(0.075, S, S / 2));
    this.shoulderL.add(mesh(deltoid, M.jersey!));
    this.shoulderR.add(mesh(deltoid, M.jersey!));
    this.hips.add(this.hipJointL, this.hipJointR);
    this.hipJointL.position.set(0.1 * build, -0.03, 0);
    this.hipJointR.position.set(-0.1 * build, -0.03, 0);

    const upperArmG = geo(`ua${S}`, () => new THREE.CapsuleGeometry(0.056, UPPER_ARM - 0.06, 3, S));
    const foreArmG = geo(`fa${S}`, () => new THREE.CapsuleGeometry(0.047, FOREARM - 0.05, 3, S));
    const thighG = geo(`th${S}`, () => new THREE.CapsuleGeometry(0.085, THIGH - 0.1, 3, S));
    const shinG = geo(`sh${S}`, () => new THREE.CapsuleGeometry(0.065, SHIN - 0.08, 3, S));
    const handG = geo(`hand${S}`, () => new THREE.SphereGeometry(0.052, S, S / 2));
    const footG = geo('foot', () => {
      const g = new THREE.BoxGeometry(0.1, 0.07, 0.27);
      g.translate(0, 0.035, 0.06);
      return g;
    });

    const limb = (upperMat: THREE.Material, lowerMat: THREE.Material, endMesh: THREE.Mesh, a: number, b: number, ug: THREE.BufferGeometry, lg: THREE.BufferGeometry): Limb => {
      const upper = mesh(ug, upperMat);
      const lower = mesh(lg, lowerMat);
      const end = new THREE.Object3D();
      end.add(endMesh);
      this.body.add(upper, lower, end);
      return { upper, lower, end, a, b };
    };
    this.armL = limb(M.sleeve!, M.skin!, mesh(handG, M.gloves!), UPPER_ARM, FOREARM, upperArmG, foreArmG);
    this.armR = limb(M.sleeve!, M.skin!, mesh(handG, M.gloves!), UPPER_ARM, FOREARM, upperArmG, foreArmG);
    // Short jersey sleeve over the upper arm.
    for (const arm of [this.armL, this.armR]) {
      const sleeve = mesh(geo(`slv${S}`, () => new THREE.CylinderGeometry(0.07, 0.066, 0.13, S)), M.jersey!);
      sleeve.position.y = 0.06;
      arm.upper.add(sleeve);
    }
    const shoe = (): THREE.Mesh => mesh(footG, M.shoes!);
    this.legL = limb(M.pants!, M.pants!, new THREE.Mesh(), THIGH, SHIN, thighG, shinG);
    this.legR = limb(M.pants!, M.pants!, new THREE.Mesh(), THIGH, SHIN, thighG, shinG);
    // Socks on the lower shin.
    for (const leg of [this.legL, this.legR]) {
      const sock = mesh(geo(`sock${S}`, () => new THREE.CylinderGeometry(0.062, 0.058, 0.2, S)), M.socks!);
      sock.position.y = -0.12;
      leg.lower.add(sock);
    }
    this.footMeshL = shoe();
    this.footMeshR = shoe();
    this.body.add(this.footMeshL, this.footMeshR);
    this.handL = this.armL.end;
    this.handR = this.armR.end;
  }

  /** Fades every material of the character (used to ghost the catcher/umpire). */
  setOpacity(opacity: number): void {
    const solid = opacity >= 0.999;
    this.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const m = o.material as THREE.Material;
      m.transparent = !solid;
      m.opacity = opacity;
      m.depthWrite = solid;
    });
  }

  /** Mirror the whole character (used for left-handed batters/pitchers). */
  setMirrored(mirrored: boolean): void {
    this.body.scale.x = mirrored ? -1 : 1;
  }

  /** Applies `this.pose`: bones first, then IK for all four limbs. */
  apply(): void {
    const p = this.pose;
    this.hips.position.copy(p.hipsPos);
    this.hips.rotation.set(p.hipsLean, p.hipsYaw, p.hipsRoll, 'YXZ');
    this.spine.rotation.set(p.spineLean, p.spineYaw, 0, 'YXZ');
    this.chest.rotation.set(p.chestLean, p.chestYaw, 0, 'YXZ');
    this.head.rotation.set(p.headPitch, p.headYaw, 0, 'YXZ');
    this.root.updateMatrixWorld(true);

    this.solveLimb(this.armL, this.shoulderL, p.handL, p.elbowPoleL);
    this.solveLimb(this.armR, this.shoulderR, p.handR, p.elbowPoleR);
    this.solveLimb(this.legL, this.hipJointL, this.ankle.copy(p.footL).setY(p.footL.y + 0.1), p.kneePoleL);
    this.solveLimb(this.legR, this.hipJointR, this.ankle.copy(p.footR).setY(p.footR.y + 0.1), p.kneePoleR);
    this.footMeshL.position.copy(p.footL);
    this.footMeshL.rotation.set(0, p.footYawL, 0);
    this.footMeshR.position.copy(p.footR);
    this.footMeshR.rotation.set(0, p.footYawR, 0);
  }

  /** Joint position in body space. */
  jointInBody(joint: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
    joint.getWorldPosition(out);
    return this.body.worldToLocal(out);
  }

  /**
   * Two-bone IK in body space: places the upper/lower segment meshes from the
   * joint to `target`, bending toward `pole`.
   */
  private solveLimb(limb: Limb, joint: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3): void {
    const S = this.jointInBody(joint, this.s);
    const { a, b } = limb;
    this.d.subVectors(target, S);
    let dist = this.d.length();
    const maxR = a + b - 1e-3;
    const minR = Math.abs(a - b) + 1e-3;
    dist = Math.min(maxR, Math.max(minR, dist));
    this.n.copy(this.d).normalize();
    // Perpendicular component of the pole hint.
    this.m.copy(pole).addScaledVector(this.n, -pole.dot(this.n));
    if (this.m.lengthSq() < 1e-8) this.m.set(0, -1, 0).addScaledVector(this.n, this.n.y);
    this.m.normalize();
    const x = (a * a - b * b + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, a * a - x * x));
    this.e.copy(S).addScaledVector(this.n, x).addScaledVector(this.m, h);
    const T = this.d.copy(S).addScaledVector(this.n, dist);

    placeSegment(limb.upper, S, this.e, this.tmpQ);
    placeSegment(limb.lower, this.e, T, this.tmpQ);
    limb.end.position.copy(T);
  }

  dispose(): void {
    Object.values(this.materials).forEach((m) => m.dispose());
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh && !isCached(o.geometry)) {
        o.geometry.dispose();
        const mm = o.material as THREE.Material;
        if (!Object.values(this.materials).includes(mm as THREE.MeshStandardMaterial)) mm.dispose();
      }
    });
  }
}

function isCached(g: THREE.BufferGeometry): boolean {
  for (const v of geoCache.values()) if (v === g) return true;
  return false;
}

const segDir = new THREE.Vector3();
function placeSegment(m: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, q: THREE.Quaternion): void {
  m.position.addVectors(from, to).multiplyScalar(0.5);
  segDir.subVectors(to, from).normalize();
  q.setFromUnitVectors(UP, segDir);
  m.quaternion.copy(q);
}

function numberTexture(text: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.font = 'bold 92px "Barlow Condensed", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(text, 64, 68);
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Smooth ease used by all character animations. */
export function ease(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function easeOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) * (1 - x) * (1 - x);
}
