import * as THREE from 'three';
import type { BatterLook, Hand, QualitySettings, SwingKind } from '../../contracts';
import { PLATE } from '../../config/constants';
import type { BatterRig } from '../api';
import { PeakAura } from './aura';
import { addRabbiAttire } from './rabbi';
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

/**
 * Tapered tube swept along a curve: radius(t) for t∈[0,1] from start to end,
 * with optional growth-ring ridges. Vertex colours run from `c0` to `c1`.
 */
function hornGeometry(curve: THREE.Curve<THREE.Vector3>, radius: (t: number) => number, c0: THREE.Color, c1: THREE.Color, segs = 40, radial = 12, ridges = 0): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, p);
    const ridge = ridges > 0 ? 1 + 0.06 * Math.max(0, Math.sin(t * ridges * Math.PI * 2)) : 1;
    const r = radius(t) * ridge;
    c.copy(c0).lerp(c1, t);
    const shade = ridges > 0 ? 0.92 + 0.08 * Math.cos(t * ridges * Math.PI * 2) : 1;
    const N = frames.normals[i]!;
    const B = frames.binormals[i]!;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cx = Math.cos(a);
      const sy = Math.sin(a);
      pos.push(p.x + r * (cx * N.x + sy * B.x), p.y + r * (cx * N.y + sy * B.y), p.z + r * (cx * N.z + sy * B.z));
      col.push(c.r * shade, c.g * shade, c.b * shade);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * row + j;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Chamo's bat: a giant curved horn. Same length and sweet spot as a wooden
 * bat along local +Y (knob at 0); the barrel is the wide, cut base of the
 * horn, the handle its narrow end wrapped in leather.
 */
function makeHornBat(): { group: THREE.Group; wood: THREE.MeshStandardMaterial; grip: THREE.MeshStandardMaterial } {
  const horn = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.32, metalness: 0.05 });
  const grip = new THREE.MeshStandardMaterial({ color: '#3d2b1f', roughness: 0.8 });
  // A gentle arc: stays within ~3 cm of the axis at the sweet spot.
  // Crescent arc through the knob and the sweet spot (both on the swing axis),
  // so the ball still meets the horn where the contact IK expects it.
  const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0.05, 0.22, 0.01), V(0.07, 0.43, 0.018), V(0.045, 0.6, 0.012), V(0, SWEET, 0), V(-0.05, BAT_LENGTH + 0.02, -0.01)]);
  const radius = (t: number): number => 0.016 + 0.05 * Math.pow(t, 1.5) - (t > 0.96 ? 0.014 * ((t - 0.96) / 0.04) : 0);
  const body = new THREE.Mesh(hornGeometry(curve, radius, new THREE.Color('#2e2018'), new THREE.Color('#f5e8cc'), 52, 16, 12), horn);
  // Cut end of the horn (the barrel cap) and a leather grip on the handle.
  const end = curve.getPointAt(1);
  const cap = new THREE.Mesh(new THREE.CircleGeometry(radius(0.97), 14), new THREE.MeshStandardMaterial({ color: '#c9b48a', roughness: 0.7 }));
  cap.position.copy(end);
  cap.lookAt(end.clone().add(curve.getTangentAt(1)));
  const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.0175, 0.0165, 0.2, 10), grip);
  tape.position.set(0.006, 0.12, 0);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 6), grip);
  knob.scale.set(1, 0.6, 1);
  body.castShadow = true;
  const group = new THREE.Group();
  group.add(body, cap, tape, knob);
  return { group, wood: horn, grip };
}

/** Villain horns: rise from the temples, sweep back, then curl up and forward. */
function makeHeadHorns(quality: QualitySettings): THREE.Group {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.22, metalness: 0.25, emissive: '#2a0f22', emissiveIntensity: 0.6 });
  const g = new THREE.Group();
  for (const side of [1, -1]) {
    const curve = new THREE.CatmullRomCurve3([
      V(side * 0.09, 0.05, 0.02),
      V(side * 0.165, 0.11, -0.03),
      V(side * 0.19, 0.21, -0.1),
      V(side * 0.165, 0.31, -0.11),
      V(side * 0.12, 0.38, -0.05),
      V(side * 0.095, 0.4, 0.02),
    ]);
    const geo = hornGeometry(curve, (t) => 0.048 * Math.pow(1 - t, 0.7) + 0.002, new THREE.Color('#5a3a4a'), new THREE.Color('#140d14'), 44, 14, 8);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = quality.shadows;
    g.add(m);
  }
  return g;
}

/** String bed texture: a lime grid clipped to the racket's oval head (transparent outside). */
function stringsTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  ctx.beginPath();
  ctx.ellipse(64, 80, 62, 78, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(240,244,230,0.12)';
  ctx.fillRect(0, 0, 128, 160);
  ctx.strokeStyle = 'rgba(236,242,214,0.95)';
  ctx.lineWidth = 2;
  for (let x = 6; x < 128; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 160);
    ctx.stroke();
  }
  for (let y = 6; y < 160; y += 10) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Chimon's tennis racket. Same axis convention as the bat (knob at 0, along
 * local +Y): grip under the hands, an open throat, and an oval head whose
 * centre sits on the bat's sweet spot so contact lands in the strings. The
 * head lies in the local YZ plane, facing the pitcher in the swing.
 */
function makeRacket(): { group: THREE.Group; wood: THREE.MeshStandardMaterial; grip: THREE.MeshStandardMaterial } {
  const frame = new THREE.MeshStandardMaterial({ color: '#1f2a44', roughness: 0.3, metalness: 0.35 });
  const grip = new THREE.MeshStandardMaterial({ color: '#f1f1ea', roughness: 0.85 });
  const accent = new THREE.MeshStandardMaterial({ color: '#c9d82b', roughness: 0.4 });
  const group = new THREE.Group();
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.02, 10), frame);
  butt.position.y = 0.01;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.018, 0.26, 8), grip);
  handle.position.y = 0.15;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.14, 8), frame);
  shaft.position.y = 0.34;
  group.add(butt, handle, shaft);
  // Open throat: two arms from the shaft to the bottom of the head.
  const HEAD_Y = SWEET - 0.02;
  const HY = 0.13;
  const HZ = 0.1;
  for (const side of [-1, 1]) {
    const a = V(0, 0.4, 0);
    const b = V(0, HEAD_Y - HY * 0.82, side * HZ * 0.55);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, a.distanceTo(b), 6), frame);
    arm.position.copy(a).add(b).multiplyScalar(0.5);
    arm.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    group.add(arm);
  }
  const ringG = new THREE.TorusGeometry(HZ, 0.009, 8, 44);
  ringG.scale(1, HY / HZ, 1);
  ringG.rotateY(Math.PI / 2);
  const ring = new THREE.Mesh(ringG, frame);
  ring.position.y = HEAD_Y;
  // Lime bumper on the tip of the head.
  const bumperG = new THREE.TorusGeometry(HZ, 0.011, 6, 20, Math.PI * 0.5);
  bumperG.rotateZ(Math.PI * 0.25);
  bumperG.scale(1, HY / HZ, 1);
  bumperG.rotateY(Math.PI / 2);
  const bumper = new THREE.Mesh(bumperG, accent);
  bumper.position.y = HEAD_Y;
  const strings = new THREE.Mesh(
    new THREE.PlaneGeometry(HZ * 2, HY * 2),
    new THREE.MeshStandardMaterial({ map: stringsTexture(), transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, roughness: 0.6, depthWrite: false }),
  );
  strings.rotation.y = Math.PI / 2;
  strings.position.y = HEAD_Y;
  strings.castShadow = false;
  group.add(ring, bumper, strings);
  return { group, wood: frame, grip };
}

/**
 * Monkey parts on top of the humanoid: a light face mask and muzzle, big
 * round ears, a curled tail on the hips and a tennis sweatband. The fur is
 * the humanoid's skin material, so it tints with the rest of the body.
 */
function addMonkey(h: Humanoid, look: BatterLook, quality: QualitySettings): THREE.MeshStandardMaterial {
  const fur = h.materials.skin!;
  const face = new THREE.MeshStandardMaterial({ color: '#e2b48a', roughness: 0.55 });
  face.emissive.set('#e2b48a').multiplyScalar(0.12);
  h.materials.face = face;
  const dark = new THREE.MeshStandardMaterial({ color: '#2a1810', roughness: 0.6 });
  const eyeWhite = new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.35 });
  const band = new THREE.MeshStandardMaterial({ color: look.trim, roughness: 0.85 });
  h.materials.band = band;
  const parts: THREE.Mesh[] = [];
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, pos: THREE.Vector3, scale?: THREE.Vector3): THREE.Mesh => {
    const x = new THREE.Mesh(g, m);
    x.position.copy(pos);
    if (scale) x.scale.copy(scale);
    parent.add(x);
    parts.push(x);
    return x;
  };
  // Heart-shaped face mask around the eyes, then the muzzle.
  add(h.head, new THREE.SphereGeometry(0.085, 18, 12), face, V(0, 0.012, 0.066), V(1.08, 0.82, 0.55));
  add(h.head, new THREE.SphereGeometry(0.06, 18, 12), face, V(0, -0.045, 0.075), V(1.18, 0.82, 0.86));
  for (const side of [-1, 1]) {
    add(h.head, new THREE.SphereGeometry(0.008, 6, 4), dark, V(side * 0.013, -0.03, 0.125));
    // Big round eyes in front of the mask (the humanoid's own eyes sit behind it).
    add(h.head, new THREE.SphereGeometry(0.019, 12, 8), eyeWhite, V(side * 0.036, 0.022, 0.106), V(1, 1.1, 0.6));
    add(h.head, new THREE.SphereGeometry(0.011, 10, 6), dark, V(side * 0.035, 0.021, 0.116), V(1, 1.1, 0.6));
    // Brow ridge.
    const brow = add(h.head, new THREE.CapsuleGeometry(0.008, 0.03, 2, 6), fur, V(side * 0.038, 0.05, 0.103));
    brow.rotation.set(0, 0, Math.PI / 2 + side * 0.18);
    // Ears: fur cup with a light inside.
    const ear = add(h.head, new THREE.SphereGeometry(0.048, 14, 10), fur, V(side * 0.118, 0.005, -0.01), V(0.42, 1, 1));
    ear.rotation.y = side * 0.25;
    add(h.head, new THREE.SphereGeometry(0.034, 12, 8), face, V(side * 0.128, 0.005, 0.0), V(0.3, 1, 1));
  }
  add(h.head, new THREE.BoxGeometry(0.05, 0.006, 0.01), dark, V(0, -0.07, 0.115));
  // Tufts of fur on top of the head, over the sweatband.
  add(h.head, new THREE.SphereGeometry(0.11, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), fur, V(0, 0.012, -0.005), V(0.98, 1.04, 1.02));
  const sweat = add(h.head, new THREE.TorusGeometry(0.112, 0.016, 8, 32), band, V(0, 0.055, 0), V(0.95, 1, 1.03));
  sweat.rotation.x = Math.PI / 2 - 0.12;
  // Long curled tail from the base of the back.
  const tail = new THREE.CatmullRomCurve3([V(0, -0.02, -0.12), V(0, -0.14, -0.26), V(0.03, -0.3, -0.38), V(0.06, -0.3, -0.54), V(0.05, -0.14, -0.6), V(0.03, -0.05, -0.52), V(0.02, -0.08, -0.45)]);
  add(h.hips, new THREE.TubeGeometry(tail, 40, 0.022, 8, false), fur, V(0, 0, 0));
  for (const x of parts) x.castShadow = quality.shadows;
  return face;
}

/**
 * El Mati's wheelchair, in body space (+Z toward the plate): seat, backrest
 * with push handles, two big rear wheels with hand rims and spokes, front
 * casters and a footplate.
 */
function makeWheelchair(quality: QualitySettings): THREE.Group {
  const frame = new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.35, metalness: 0.75 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.22, metalness: 0.9 });
  const tire = new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.85 });
  const cloth = new THREE.MeshStandardMaterial({ color: '#1d3f8a', roughness: 0.8 });
  const g = new THREE.Group();
  g.name = 'wheelchair';
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, pos: THREE.Vector3, rot?: THREE.Euler): THREE.Mesh => {
    const x = new THREE.Mesh(geo, m);
    x.position.copy(pos);
    if (rot) x.rotation.copy(rot);
    x.castShadow = quality.shadows;
    g.add(x);
    return x;
  };
  /** A straight tube between two points. */
  const tube = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material = frame): void => {
    const t = add(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 8), m, a.clone().add(b).multiplyScalar(0.5));
    t.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  };
  const SEAT_H = 0.47;
  add(new THREE.BoxGeometry(0.5, 0.05, 0.46), cloth, V(0, SEAT_H, -0.03));
  add(new THREE.BoxGeometry(0.48, 0.38, 0.03), cloth, V(0, SEAT_H + 0.27, -0.29), new THREE.Euler(-0.12, 0, 0));
  add(new THREE.BoxGeometry(0.14, 0.05, 0.12), frame, V(0, 0.1, 0.43));
  for (const side of [-1, 1]) {
    const x = side * 0.26;
    // Side frame: seat rail, back cane with a push handle, and the leg down to the footplate.
    tube(V(x, SEAT_H - 0.03, -0.27), V(x, SEAT_H - 0.03, 0.22), 0.014);
    tube(V(x, SEAT_H - 0.05, -0.27), V(x, SEAT_H + 0.5, -0.33), 0.014);
    tube(V(x, SEAT_H + 0.5, -0.33), V(x, SEAT_H + 0.5, -0.45), 0.018, tire);
    tube(V(x, SEAT_H - 0.03, 0.22), V(side * 0.12, 0.1, 0.42), 0.013);
    tube(V(x, 0.12, -0.12), V(x, 0.12, 0.3), 0.012);
    // Big rear wheel: tyre, rim, hand rim and spokes, on the outside of the frame.
    const wx = side * 0.33;
    const hub = V(wx, 0.31, -0.1);
    add(new THREE.TorusGeometry(0.29, 0.022, 8, 40), tire, hub, new THREE.Euler(0, Math.PI / 2, 0));
    add(new THREE.TorusGeometry(0.27, 0.008, 6, 40), chrome, hub, new THREE.Euler(0, Math.PI / 2, 0));
    add(new THREE.TorusGeometry(0.25, 0.007, 6, 40), chrome, V(wx + side * 0.035, 0.31, -0.1), new THREE.Euler(0, Math.PI / 2, 0));
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10), chrome, hub, new THREE.Euler(0, 0, Math.PI / 2));
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      tube(hub, V(wx, 0.31 + Math.sin(a) * 0.27, -0.1 + Math.cos(a) * 0.27), 0.003, chrome);
    }
    tube(V(x, 0.31, -0.1), V(wx, 0.31, -0.1), 0.01, chrome);
    // Front caster on a little fork.
    const cz = 0.3;
    tube(V(x, 0.12, cz), V(x, 0.07, cz + 0.03), 0.01);
    add(new THREE.TorusGeometry(0.055, 0.016, 6, 18), tire, V(x, 0.07, cz + 0.03), new THREE.Euler(0, Math.PI / 2, 0));
  }
  return g;
}

/** The pre-workout shaker that falls on El Mati: clear bottle full of green, black screw cap. */
function makeShaker(quality: QualitySettings): THREE.Group {
  const g = new THREE.Group();
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.052, 0.2, 16), new THREE.MeshStandardMaterial({ color: '#e9f2ee', roughness: 0.15, transparent: true, opacity: 0.55 }));
  const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.046, 0.15, 16), new THREE.MeshStandardMaterial({ color: '#8cff2a', emissive: '#5bd400', emissiveIntensity: 0.8, roughness: 0.4 }));
  drink.position.y = -0.02;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.063, 0.063, 0.05, 16), new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.4 }));
  cap.position.y = 0.125;
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.04, 10), cap.material);
  spout.position.y = 0.17;
  for (const m of [bottle, drink, cap, spout]) {
    m.castShadow = quality.shadows;
    g.add(m);
  }
  return g;
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

/** Angry tantrum after a whiff: racket raised overhead, ready to smash something. */
const TANTRUM = key(
  { hips: V(0, 0.95, 0), hipsYaw: 0.4, hipsLean: -0.05, chestYaw: 0.2, chestLean: -0.08, headYaw: 0.3, headPitch: -0.2, footL: V(0.42, 0, 0.04), footR: V(-0.32, 0, 0), footYawL: 0.5, footYawR: 0.5, elbowL: V(0.6, 0.2, 0.3), elbowR: V(-0.6, 0.2, 0.3) },
  V(0.02, 1.62, 0.12),
  V(0.15, 0.85, -0.5),
);

/** Fur / skin colour when angry. */
const ANGRY_RED = new THREE.Color('#c8141a');
const ANGRY_FACE = new THREE.Color('#ff3326');

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

/** Hips height and depth (body units) while sitting in the wheelchair. */
const SEAT_Y = 0.6;
const SEAT_Z = -0.06;
/** Pre-workout: the shaker falls for this long, then he drinks it for SHAKER_DRINK. */
const SHAKER_FALL = 0.45;
const SHAKER_DRINK = 0.35;
/** Body grows this much (uniformly) when pumped. */
const PUMP_GROWTH = 0.1;

export class Batter implements BatterRig {
  readonly root: THREE.Group;
  readonly stanceOffsetX: number;
  private readonly h: Humanoid;
  private readonly bat: THREE.Group;
  private readonly batWood: THREE.MeshStandardMaterial;
  private readonly hornBat: boolean;
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
  /** Anger 0..1 (fades toward `angryTarget`); tints the face (or the skin) red. */
  private anger = 0;
  private angryTarget = 0;
  private readonly tintable: { m: THREE.MeshStandardMaterial; color: THREE.Color; emissive: THREE.Color; red: THREE.Color }[] = [];
  /** El Mati's wheelchair (null for everyone else) and how seated he is (1 = sitting, 0 = standing). */
  private readonly chair: THREE.Group | null = null;
  private seat = 0;
  private seatTarget = 0;
  /** Pre-workout pump 0..1 (body growth) and the falling shaker (seconds since it started, −1 = none). */
  private pump = 0;
  private pumpTarget = 0;
  private readonly shaker: THREE.Group | null = null;
  private shakerT = -1;
  private readonly seated = makePose();

  constructor(quality: QualitySettings, look: BatterLook) {
    const m = batterMetrics(look);
    this.giant = m.giant;
    this.batScale = m.batScale;
    this.sweet = SWEET * m.batScale;
    this.stanceOffsetX = m.stanceX;
    this.extra = look.extraArms;
    const bone = look.skeleton ? look.skin : null;
    const outfit: Outfit = bone
      ? { skin: bone, jersey: bone, trim: bone, sleeve: bone, pants: bone, socks: bone, shoes: bone, hat: bone, gloves: bone, build: look.build }
      : {
          skin: look.skin,
          jersey: look.jersey,
          trim: look.trim,
          // A rabbi's coat has long black sleeves and black trousers.
          sleeve: look.rabbi ? look.jersey : look.trim,
          pants: look.rabbi ? look.jersey : '#ece8dc',
          socks: look.rabbi ? '#101014' : mixHex(look.trim, '#0b1426', 0.25),
          shoes: '#15161a',
          hat: mixHex(look.trim, '#0b1426', 0.08),
          gloves: look.monkey ? '#e2b48a' : look.rabbi ? look.skin : look.trim,
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
      skeleton: !!look.skeleton,
    };
    this.h = new Humanoid(outfit, quality, shape);
    this.tuneSkin(this.h.materials.skin!);
    this.root = this.h.root;
    const face = look.monkey ? addMonkey(this.h, look, quality) : null;
    if (look.rabbi) addRabbiAttire(this.h, look.hair ?? '#2a1d14', quality, { chestDepth: this.h.chestDepth });
    // A skeleton wears no helmet: the horns grow straight out of the skull.
    if (!look.monkey && !look.rabbi && !look.skeleton) this.addHelmet(look, quality);
    if (look.horns) this.h.head.add(makeHeadHorns(quality));
    this.hornBat = look.hornBat || !!look.racket;
    const bat = look.racket ? makeRacket() : look.hornBat ? makeHornBat() : makeBat();
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
    const tint = (m: THREE.MeshStandardMaterial | undefined, red: THREE.Color): void => {
      if (m) this.tintable.push({ m, color: m.color.clone(), emissive: m.emissive.clone(), red });
    };
    // A monkey's anger shows on his face (mask, muzzle, inner ears); anyone else reddens all over.
    if (face) tint(face, ANGRY_FACE);
    else tint(this.h.materials.skin, ANGRY_RED);
    if (look.wheelchair) {
      this.chair = makeWheelchair(quality);
      this.h.body.add(this.chair);
      this.shaker = makeShaker(quality);
      this.shaker.visible = false;
      this.h.body.add(this.shaker);
      this.seat = this.seatTarget = 1;
    }
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
    // A horn (or a racket) keeps its own colours; only the grip follows the bat skin.
    if (!this.hornBat) this.batWood.color.set(wood);
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

  setAngry(on: boolean): void {
    this.angryTarget = on ? 1 : 0;
  }

  setPumped(on: boolean, instant = false): void {
    if (!this.chair) {
      this.aura.set(on);
      return;
    }
    if (instant) {
      this.shakerT = -1;
      this.shaker!.visible = false;
      this.seat = this.seatTarget = on ? 0 : 1;
      this.pump = this.pumpTarget = on ? 1 : 0;
      this.aura.set(on);
      this.applyCurrent();
      return;
    }
    if (on) {
      // The shaker falls first; he gets up once he has drunk it (see updatePump).
      this.shakerT = 0;
      this.shaker!.visible = true;
    } else {
      this.shakerT = -1;
      this.shaker!.visible = false;
      this.seatTarget = 1;
      this.pumpTarget = 0;
      this.aura.set(false);
    }
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
    this.reactKey = this.angryTarget > 0 && kind === 'whiff' ? TANTRUM : SLUMP;
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
    h.applyBones(this.seatPose(copyPose(this.contact.pose, this.seated), this.seat));
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
    this.updateAnger(dt);
    this.updatePump(dt);
    const u = this.dur > 0 ? this.t / this.dur : 1;
    switch (this.state) {
      case 'stance': {
        this.copyKey(STANCE, this.cur);
        // Idle: breathing + bat waggle.
        // Angry: a fast, jittery waggle.
        const w = Math.sin(this.time * (2.1 + 9 * this.anger)) * (1 + 1.5 * this.anger);
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
        if (this.reactKey === TANTRUM) {
          // Shakes the racket over his head.
          this.cur.K.x += Math.sin(this.time * 22) * 0.05;
          this.cur.pose.hipsPos.y += Math.abs(Math.sin(this.time * 11)) * 0.03;
        }
        break;
    }
    this.applyCurrent(dt);
  }

  /**
   * Pre-workout: the shaker drops from the sky onto his hands, he chugs it,
   * then gets up out of the chair (which rolls back) and swells. Off: he sits
   * back down and deflates.
   */
  private updatePump(dt: number): void {
    if (!this.chair) return;
    if (this.shakerT >= 0) {
      this.shakerT += dt;
      const t = this.shakerT;
      const sh = this.shaker!;
      // From high above his head down to his face, spinning, then tipped up to drink.
      const k = Math.min(1, t / SHAKER_FALL);
      const head = this.tmp.set(0.04, SEAT_Y + 0.72, 0.16);
      sh.position.set(head.x, head.y + (1 - k * k) * 3.2, head.z);
      if (t < SHAKER_FALL) sh.rotation.set(t * 9, 0, t * 5);
      else sh.rotation.set(-2.3, 0, 0);
      sh.scale.setScalar(t > SHAKER_FALL + SHAKER_DRINK * 0.7 ? Math.max(0.01, 1 - (t - SHAKER_FALL - SHAKER_DRINK * 0.7) / (SHAKER_DRINK * 0.3)) : 1);
      if (t >= SHAKER_FALL + SHAKER_DRINK) {
        this.shakerT = -1;
        sh.visible = false;
        sh.scale.setScalar(1);
        this.seatTarget = 0;
        this.pumpTarget = 1;
        this.aura.set(true);
      }
    }
    const k = 1 - Math.exp(-dt * 7);
    this.seat += (this.seatTarget - this.seat) * k;
    this.pump += (this.pumpTarget - this.pump) * (1 - Math.exp(-dt * 4));
    if (Math.abs(this.seat - this.seatTarget) < 0.002) this.seat = this.seatTarget;
    if (Math.abs(this.pump - this.pumpTarget) < 0.002) this.pump = this.pumpTarget;
    // The chair rolls back behind him while he stands; a flex pulse as he swells.
    this.chair.position.z = -0.85 * (1 - this.seat);
    const flex = this.pumpTarget > 0 ? Math.sin(this.time * 6) * 0.012 * this.pump : 0;
    this.root.scale.setScalar(1 + PUMP_GROWTH * this.pump + flex);
  }

  /**
   * Sitting version of a standing pose, blended by `s` (0 = untouched): hips
   * on the seat with the upper body taking over the twist and lean, knees bent
   * forward and the feet on the footplate.
   */
  private seatPose(p: HumanoidPose, s: number): HumanoidPose {
    if (s <= 0) return p;
    const L = THREE.MathUtils.lerp;
    p.hipsPos.set(L(p.hipsPos.x, 0, s), L(p.hipsPos.y, SEAT_Y + (p.hipsPos.y - 0.93) * 0.3, s), L(p.hipsPos.z, SEAT_Z, s));
    const yaw = p.hipsYaw * 0.3;
    p.spineYaw += (p.hipsYaw - yaw) * s;
    p.hipsYaw = L(p.hipsYaw, yaw, s);
    p.spineLean += (p.hipsLean + 0.04) * s * 0.8;
    p.hipsLean = L(p.hipsLean, -0.04, s);
    p.hipsRoll = L(p.hipsRoll, 0, s);
    p.footL.lerp(this.tmp3.set(0.17, 0.13, 0.43), s);
    p.footR.lerp(this.tmp3.set(-0.17, 0.13, 0.43), s);
    p.footYawL = L(p.footYawL, 0.05, s);
    p.footYawR = L(p.footYawR, -0.05, s);
    p.kneePoleL.lerp(this.tmp3.set(0.15, 1, 0.5), s);
    p.kneePoleR.lerp(this.tmp3.set(-0.15, 1, 0.5), s);
    return p;
  }

  /** Fades the red tint in/out and makes it throb while angry. */
  private updateAnger(dt: number): void {
    if (this.anger === this.angryTarget && this.anger === 0) return;
    const k = 1 - Math.exp(-dt * 4);
    this.anger += (this.angryTarget - this.anger) * k;
    if (Math.abs(this.anger - this.angryTarget) < 0.002) this.anger = this.angryTarget;
    const a = this.anger;
    const throb = 0.75 + 0.25 * Math.sin(this.time * 7);
    for (const t of this.tintable) {
      t.m.color.copy(t.color).lerp(t.red, 0.92 * a);
      t.m.emissive.copy(t.emissive).lerp(t.red, 0.45 * a * throb);
    }
  }

  private applyCurrent(dt = 0): void {
    const c = this.cur;
    this.K.copy(c.K);
    this.D.copy(c.D).normalize();
    const p = this.h.pose;
    const h = this.h;
    copyPose(c.pose, p);
    this.seatPose(p, this.seat);
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
