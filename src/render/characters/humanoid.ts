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

/**
 * Optional body-shape parameters (batters). Omitted = the stock body used by
 * the pitcher/catcher/umpire, unchanged.
 */
export interface BodyShape {
  /** Uniform scale of the whole body (1 = base model ≈ 1.85 m). */
  scale?: number;
  /** Belly size 0..1. */
  belly?: number;
  /** Muscle 0..1: broader shoulders, bigger arms/chest, narrower waist. */
  muscle?: number;
  /** Hair colour visible under the helmet (nape/sideburns), null = none. */
  hair?: string | null;
  /** Longer locks falling from under the helmet. */
  longHair?: boolean;
  /** Beard colour, null = clean shaven. */
  beard?: string | null;
  beardStyle?: 'full' | 'goatee';
  /** Second, lower pair of arms driven by `extraHandL/R`. */
  extraArms?: boolean;
  /** Simple eyes/brows (close-up readability). */
  face?: boolean;
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
  /** Second pair of arms (BodyShape.extraArms), solved toward `extraHandL/R`. */
  private readonly armL2: Limb | null = null;
  private readonly armR2: Limb | null = null;
  private readonly shoulderL2 = new THREE.Object3D();
  private readonly shoulderR2 = new THREE.Object3D();
  readonly extraHandL = new THREE.Vector3(0.25, 0.8, 0.15);
  readonly extraHandR = new THREE.Vector3(-0.25, 0.8, 0.15);
  readonly extraPoleL = new THREE.Vector3(0.7, -0.6, -0.3);
  readonly extraPoleR = new THREE.Vector3(-0.7, -0.6, -0.3);
  /**
   * Extra hands may slide along ±this vector from their target (e.g. along the
   * bat handle) to stay within reach. Zero = fixed targets.
   */
  readonly extraSlide = new THREE.Vector3();
  get hasExtraArms(): boolean {
    return this.armL2 !== null;
  }
  /** Jersey number plane (un-mirrored for left-handers so it stays readable). */
  private backNumber: THREE.Mesh | null = null;
  /** Uniform body scale (BodyShape.scale). */
  readonly scale: number;
  /** Half-depth of the chest (body units): where the back number sits. */
  readonly chestDepth: number;
  /** Largest IK overreach of the main arms in the last apply() (debug: hands detaching). */
  overreach = 0;
  /** Same for the extra arms. */
  extraOverreach = 0;
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

  constructor(outfit: Outfit, quality: QualitySettings, shape: BodyShape = {}) {
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
    const mus = shape.muscle ?? 0;
    const belly = shape.belly ?? 0;
    // Stock bodies (no shape) keep the original proportions exactly: `build`
    // simply widens the torso, nothing else changes.
    const custom = shape.scale !== undefined;
    const heavy = custom ? Math.max(0, build - 1) : 0;
    this.scale = shape.scale ?? 1;
    this.body.scale.setScalar(this.scale);
    // Width factors: chest/shoulders follow the build only partly (a heavy body
    // is mostly wider at the waist); muscle widens the top and narrows the waist.
    const chestW = custom ? (1 + heavy * 0.85) * (1 + 0.22 * mus) : build;
    const chestD = (1 + heavy * 0.6) * (1 + 0.2 * mus);
    const waistW = build * (1 - 0.24 * mus);
    const waistD = 1 + heavy * 0.45;
    const shoulderX = 0.21 * (1 + heavy * 0.3) * (1 + 0.24 * mus);
    const armT = (1 + 0.65 * mus) * (1 + 0.42 * heavy);
    const foreT = (1 + 0.5 * mus) * (1 + 0.34 * heavy);
    const thighT = (1 + 0.2 * mus) * (1 + 0.5 * heavy);
    const shinT = (1 + 0.1 * mus) * (1 + 0.34 * heavy);
    const neckT = (1 + 0.5 * mus) * (1 + 0.35 * heavy);
    this.chestDepth = 0.17 * 0.74 * chestD;
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
    pelvis.scale.set(1.15 * build * (1 - 0.1 * mus), 1, 0.8 * waistD);
    pelvis.rotation.z = Math.PI / 2;
    this.hips.add(pelvis);
    const belt = mesh(geo(`belt${S}`, () => new THREE.CylinderGeometry(0.165, 0.165, 0.05, S * 2)), M.belt!);
    belt.scale.set(build * (1 - 0.1 * mus), 1, 0.82 * waistD);
    belt.position.y = 0.09;
    this.hips.add(belt);

    // Torso: abdomen + chest (jersey) with trim piping.
    const abdomen = mesh(geo(`abd${S}`, () => new THREE.CapsuleGeometry(0.145, 0.12, 4, S)), M.jersey!);
    abdomen.scale.set(1.05 * waistW, 1, 0.78 * waistD);
    abdomen.position.y = 0.06;
    this.spine.add(abdomen);
    const torso = mesh(geo(`torso${S}`, () => new THREE.CapsuleGeometry(0.17, 0.16, 6, S)), M.jersey!);
    torso.scale.set(1.12 * chestW, 1, 0.74 * chestD);
    torso.position.y = 0.05;
    this.chest.add(torso);
    if (belly > 0) {
      // Round belly pushing the jersey forward, carried by the spine bone; a
      // second, smaller curve overhangs the belt. Both stay inside the back.
      const bg = geo(`belly${S}`, () => new THREE.SphereGeometry(0.17, S * 2, S));
      const b = mesh(bg, M.jersey!);
      b.scale.set(0.86 * waistW * (0.75 + 0.25 * belly), 0.95 + 0.55 * belly, 0.95 + 0.95 * belly);
      b.position.set(0, 0.05, 0.05 + 0.19 * belly);
      this.spine.add(b);
      const lb = mesh(bg, M.jersey!);
      lb.scale.set(0.76 * waistW * (0.75 + 0.25 * belly), 0.85, 0.8 + 0.75 * belly);
      lb.position.set(0, -0.06, 0.06 + 0.17 * belly);
      this.spine.add(lb);
    }
    if (mus > 0.5) {
      // Lats/pecs for the V-taper and trapezius sloping into a thick neck.
      const k = (mus - 0.5) * 2;
      const lats = mesh(geo(`lats${S}`, () => new THREE.SphereGeometry(0.17, S * 2, S)), M.jersey!);
      lats.scale.set(1.12 * chestW * (1 + 0.12 * k), 0.62, 0.74 * chestD * 1.04);
      lats.position.set(0, 0.11, 0.005);
      this.chest.add(lats);
      const traps = mesh(geo(`traps${S}`, () => new THREE.SphereGeometry(0.1, S, S / 2)), M.jersey!);
      traps.scale.set(1.9 + 0.4 * k, 0.75, 0.95);
      traps.position.set(0, 0.2, -0.025);
      this.chest.add(traps);
    }
    const piping = mesh(geo('piping', () => new THREE.BoxGeometry(0.02, 0.4, 0.02)), M.trim!);
    piping.position.set(0, -0.05, 0.128);
    this.chest.add(piping);
    if (outfit.number) {
      const tex = numberTexture(outfit.number, outfit.trim);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
      back.position.set(0, 0.07, -(this.chestDepth + 0.005));
      if (custom) back.scale.setScalar(Math.min(1.5, Math.sqrt(chestW)));
      this.backNumber = back;
      back.rotation.y = Math.PI;
      this.chest.add(back);
    }
    const neckMesh = mesh(geo(`neck${S}`, () => new THREE.CylinderGeometry(0.055, 0.065, 0.12, S)), M.skin!);
    neckMesh.position.y = -0.06;
    neckMesh.scale.set(neckT, 1, neckT);
    this.neck.add(neckMesh);
    const headMesh = mesh(geo(`head${S}`, () => new THREE.SphereGeometry(0.115, S * 2, S)), M.skin!);
    headMesh.scale.set(0.92, 1.05, 1);
    if (heavy > 0) this.head.scale.setScalar(1 + heavy * 0.08);
    this.head.add(headMesh);
    // Nose hint so facing direction reads.
    const nose = mesh(geo('nose', () => new THREE.SphereGeometry(0.022, 6, 4)), M.skin!);
    nose.position.set(0, -0.005, 0.11);
    this.head.add(nose);
    if (shape.face) this.addFace(shape, mesh);
    if (shape.hair) this.addHair(shape.hair, !!shape.longHair, mesh);
    if (shape.beard) this.addBeard(shape.beard, shape.beardStyle ?? 'full', mesh);

    // Shoulders / hips joints.
    this.chest.add(this.shoulderL, this.shoulderR);
    // Stock bodies keep the original 0.21·build shoulder width.
    const sx = custom ? shoulderX : 0.21 * build;
    this.shoulderL.position.set(sx, 0.14, 0);
    this.shoulderR.position.set(-sx, 0.14, 0);
    const deltoid = geo(`delt${S}`, () => new THREE.SphereGeometry(0.075, S, S / 2));
    const deltS = (1 + 0.5 * mus) * (1 + 0.42 * heavy);
    this.shoulderL.add(mesh(deltoid, M.jersey!)).children[0]!.scale.setScalar(deltS);
    this.shoulderR.add(mesh(deltoid, M.jersey!)).children[0]!.scale.setScalar(deltS);
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

    const limb = (upperMat: THREE.Material, lowerMat: THREE.Material, endMesh: THREE.Mesh, a: number, b: number, ug: THREE.BufferGeometry, lg: THREE.BufferGeometry, ut = 1, lt = 1): Limb => {
      const upper = mesh(ug, upperMat);
      const lower = mesh(lg, lowerMat);
      // Thickness only (local Y runs along the segment; placeSegment never touches scale).
      upper.scale.set(ut, 1, ut);
      lower.scale.set(lt, 1, lt);
      const end = new THREE.Object3D();
      end.add(endMesh);
      this.body.add(upper, lower, end);
      return { upper, lower, end, a, b };
    };
    this.armL = limb(M.sleeve!, M.skin!, mesh(handG, M.gloves!), UPPER_ARM, FOREARM, upperArmG, foreArmG, armT, foreT);
    this.armR = limb(M.sleeve!, M.skin!, mesh(handG, M.gloves!), UPPER_ARM, FOREARM, upperArmG, foreArmG, armT, foreT);
    if (shape.extraArms) {
      // Lower pair under the main shoulders, slightly forward on the ribcage.
      this.chest.add(this.shoulderL2, this.shoulderR2);
      this.shoulderL2.position.set(sx * 0.9, -0.04, 0.03);
      this.shoulderR2.position.set(-sx * 0.9, -0.04, 0.03);
      this.shoulderL2.add(mesh(deltoid, M.jersey!)).children[0]!.scale.setScalar(deltS * 0.85);
      this.shoulderR2.add(mesh(deltoid, M.jersey!)).children[0]!.scale.setScalar(deltS * 0.85);
      this.armL2 = limb(M.sleeve!, M.skin!, mesh(handG, M.gloves!), UPPER_ARM, FOREARM, upperArmG, foreArmG, armT * 0.95, foreT * 0.95);
      this.armR2 = limb(M.sleeve!, M.skin!, mesh(handG, M.gloves!), UPPER_ARM, FOREARM, upperArmG, foreArmG, armT * 0.95, foreT * 0.95);
    }
    // Short jersey sleeve over the upper arm.
    for (const arm of [this.armL, this.armR, this.armL2, this.armR2]) {
      if (!arm) continue;
      const sleeve = mesh(geo(`slv${S}`, () => new THREE.CylinderGeometry(0.07, 0.066, 0.13, S)), M.jersey!);
      sleeve.position.y = 0.06;
      arm.upper.add(sleeve);
    }
    const shoe = (): THREE.Mesh => mesh(footG, M.shoes!);
    this.legL = limb(M.pants!, M.pants!, new THREE.Mesh(), THIGH, SHIN, thighG, shinG, thighT, shinT);
    this.legR = limb(M.pants!, M.pants!, new THREE.Mesh(), THIGH, SHIN, thighG, shinG, thighT, shinT);
    // Socks on the lower shin.
    for (const leg of [this.legL, this.legR]) {
      const sock = mesh(geo(`sock${S}`, () => new THREE.CylinderGeometry(0.062, 0.058, 0.2, S)), M.socks!);
      sock.position.y = -0.12;
      leg.lower.add(sock);
    }
    this.footMeshL = shoe();
    this.footMeshR = shoe();
    if (heavy > 0 || mus > 0) {
      const f = 1 + 0.12 * heavy + 0.05 * mus;
      this.footMeshL.scale.set(f, 1, f);
      this.footMeshR.scale.set(f, 1, f);
    }
    this.body.add(this.footMeshL, this.footMeshR);
    this.handL = this.armL.end;
    this.handR = this.armR.end;
  }

  private addFace(shape: BodyShape, mesh: (g: THREE.BufferGeometry, m: THREE.Material) => THREE.Mesh): void {
    const eyeM = (this.materials.eyes = new THREE.MeshStandardMaterial({ color: '#15100c', roughness: 0.3 }));
    const eyeG = geo('eye', () => new THREE.SphereGeometry(0.014, 8, 6));
    const browM = (this.materials.brow = new THREE.MeshStandardMaterial({ color: shape.hair ?? shape.beard ?? '#1a120d', roughness: 0.9 }));
    const browG = geo('brow', () => new THREE.BoxGeometry(0.036, 0.009, 0.012));
    for (const side of [1, -1]) {
      const e = mesh(eyeG, eyeM);
      e.castShadow = false;
      e.position.set(side * 0.038, 0.022, 0.1);
      e.scale.set(1, 1.15, 0.6);
      const b = mesh(browG, browM);
      b.castShadow = false;
      b.position.set(side * 0.04, 0.046, 0.1);
      b.rotation.set(-0.25, 0, side * -0.12);
      this.head.add(e, b);
    }
  }

  private addHair(color: string, long: boolean, mesh: (g: THREE.BufferGeometry, m: THREE.Material) => THREE.Mesh): void {
    const m = (this.materials.hair = new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
    const S = this.segs;
    // Back and sides of the head below the helmet line, open at the face.
    const cap = mesh(geo(`hair${S}`, () => new THREE.SphereGeometry(0.121, S * 2, S, Math.PI * 0.92, Math.PI * 1.16, Math.PI * 0.28, Math.PI * 0.42)), m);
    cap.scale.set(0.95, 1.05, 1.02);
    this.head.add(cap);
    // Sideburns.
    const burnG = geo('burn', () => new THREE.BoxGeometry(0.012, 0.05, 0.026));
    for (const side of [1, -1]) {
      const b = mesh(burnG, m);
      b.position.set(side * 0.104, -0.015, 0.045);
      this.head.add(b);
    }
    if (long) {
      // Locks spilling out from under the helmet onto the neck/shoulders.
      const lockG = geo(`lock${S}`, () => new THREE.CapsuleGeometry(0.05, 0.09, 3, S));
      const locks: [number, number, number, number][] = [
        [0, -0.1, -0.085, 0],
        [0.06, -0.09, -0.075, 0.35],
        [-0.06, -0.09, -0.075, -0.35],
      ];
      for (const [x, y, z, r] of locks) {
        const l = mesh(lockG, m);
        l.position.set(x, y, z);
        l.rotation.set(-0.35, 0, r);
        l.scale.set(1.2, 1, 0.7);
        this.head.add(l);
      }
    }
  }

  private addBeard(color: string, style: 'full' | 'goatee', mesh: (g: THREE.BufferGeometry, m: THREE.Material) => THREE.Mesh): void {
    const m = (this.materials.beard = new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
    const S = this.segs;
    const full = style === 'full';
    // Front-lower part of a sphere hugging the jaw (+Z = face).
    const g = full
      ? geo(`beardF${S}`, () => new THREE.SphereGeometry(0.121, S * 2, S, Math.PI * 0.06, Math.PI * 0.88, Math.PI * 0.56, Math.PI * 0.32))
      : geo(`beardG${S}`, () => new THREE.SphereGeometry(0.121, S, S, Math.PI * 0.36, Math.PI * 0.28, Math.PI * 0.6, Math.PI * 0.3));
    const beard = mesh(g, m);
    beard.scale.set(0.95, 1.06, 1.04);
    this.head.add(beard);
    const stache = mesh(geo(`stache${S}`, () => new THREE.CapsuleGeometry(0.009, 0.05, 2, 6)), m);
    stache.rotation.z = Math.PI / 2;
    stache.position.set(0, -0.034, 0.11);
    stache.scale.set(1, 1, 0.8);
    this.head.add(stache);
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
    this.body.scale.x = mirrored ? -this.scale : this.scale;
    if (this.backNumber) this.backNumber.scale.x = Math.abs(this.backNumber.scale.x) * (mirrored ? -1 : 1);
  }

  /** Applies `this.pose`: bones first, then IK for all four limbs. */
  apply(): void {
    this.applyBones();
    this.applyLimbs();
  }

  /** Torso chain only (then shoulders can be queried with shoulderInBody). */
  applyBones(pose: HumanoidPose = this.pose): void {
    const p = pose;
    this.hips.position.copy(p.hipsPos);
    this.hips.rotation.set(p.hipsLean, p.hipsYaw, p.hipsRoll, 'YXZ');
    this.spine.rotation.set(p.spineLean, p.spineYaw, 0, 'YXZ');
    this.chest.rotation.set(p.chestLean, p.chestYaw, 0, 'YXZ');
    this.head.rotation.set(p.headPitch, p.headYaw, 0, 'YXZ');
    this.root.updateMatrixWorld(true);
  }

  /** Main shoulder joints in body space (valid after applyBones). */
  shoulderInBody(side: 'L' | 'R', out: THREE.Vector3): THREE.Vector3 {
    return this.jointInBody(side === 'L' ? this.shoulderL : this.shoulderR, out);
  }

  /** Extra-arm shoulder joints in body space (valid after applyBones). */
  extraShoulderInBody(side: 'L' | 'R', out: THREE.Vector3): THREE.Vector3 {
    return this.jointInBody(side === 'L' ? this.shoulderL2 : this.shoulderR2, out);
  }

  /** Arm length (shoulder to hand centre) in body units. */
  get armReach(): number {
    return UPPER_ARM + FOREARM;
  }

  /** IK for all limbs from `this.pose` (bones must be applied). */
  applyLimbs(): void {
    const p = this.pose;
    this.overreach = 0;
    this.solveLimb(this.armL, this.shoulderL, p.handL, p.elbowPoleL);
    this.solveLimb(this.armR, this.shoulderR, p.handR, p.elbowPoleR);
    const armOverreach = this.overreach;
    this.overreach = 0;
    if (this.armL2 && this.armR2) {
      this.solveLimb(this.armL2, this.shoulderL2, this.slideGrip(this.armL2, this.shoulderL2, this.extraHandL), this.extraPoleL);
      this.solveLimb(this.armR2, this.shoulderR2, this.slideGrip(this.armR2, this.shoulderR2, this.extraHandR), this.extraPoleR);
    }
    this.extraOverreach = this.overreach;
    this.solveLimb(this.legL, this.hipJointL, this.ankle.copy(p.footL).setY(p.footL.y + 0.1), p.kneePoleL);
    this.solveLimb(this.legR, this.hipJointR, this.ankle.copy(p.footR).setY(p.footR.y + 0.1), p.kneePoleR);
    this.overreach = armOverreach;
    this.footMeshL.position.copy(p.footL);
    this.footMeshL.rotation.set(0, p.footYawL, 0);
    this.footMeshR.position.copy(p.footR);
    this.footMeshR.rotation.set(0, p.footYawR, 0);
  }

  private readonly grip = new THREE.Vector3();
  private readonly ga = new THREE.Vector3();

  /**
   * Point of the segment target ± extraSlide that is within the limb's reach
   * and closest to `target` (or the closest point to the shoulder if none is).
   */
  private slideGrip(limb: Limb, joint: THREE.Object3D, target: THREE.Vector3): THREE.Vector3 {
    const u = this.extraSlide;
    const uu = u.lengthSq();
    if (uu < 1e-10) return target;
    const S = this.jointInBody(joint, this.s);
    const R = (limb.a + limb.b) * 0.985;
    // P(t) = target + t·u, t ∈ [-1, 1]; |P − S|² ≤ R²  ⇔  uu·t² + b·t + c ≤ 0.
    const A = this.ga.subVectors(target, S);
    const b = 2 * A.dot(u);
    const c = A.lengthSq() - R * R;
    if (c <= 0) return target;
    const disc = b * b - 4 * uu * c;
    let t: number;
    if (disc < 0) {
      t = Math.min(1, Math.max(-1, -b / (2 * uu)));
    } else {
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / (2 * uu);
      const t2 = (-b + sq) / (2 * uu);
      // Interval [t1, t2] is reachable; take its end nearest to 0, clamped.
      t = Math.abs(t1) < Math.abs(t2) ? t1 : t2;
      if (t < -1 || t > 1) t = Math.min(1, Math.max(-1, -b / (2 * uu)));
    }
    return this.grip.copy(target).addScaledVector(u, t);
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
    if (dist - maxR > this.overreach) this.overreach = dist - maxR;
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
        if (!Object.values(this.materials).includes(mm as THREE.MeshStandardMaterial)) {
          (mm as THREE.MeshStandardMaterial).map?.dispose();
          mm.dispose();
        }
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
