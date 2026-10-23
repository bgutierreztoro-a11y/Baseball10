import * as THREE from 'three';
import type { QualitySettings, Vec3 } from '../../contracts';
import { BALL } from '../../config/constants';
import { Humanoid, copyPose, makePose, type HumanoidPose } from '../characters/humanoid';
import { textTexture } from '../textures';

/**
 * Chamo's nerf in Southampton. A Slovak "mandem" in a black Nike Tech
 * tracksuit (hood up, white trainers, crossbody bag with a Slovak flag)
 * waits beyond the wall where the home run comes down, leaps and catches it.
 * Then `escape()`: he runs off with the ball to Valentina, Chamo's ex and now
 * his girlfriend, they hug (a heart pops) and walk away hand in hand.
 * Driven by elapsed time.
 */

/** Seconds the escape sequence lasts. */
export const ESCAPE_DURATION = 6.6;
/** How far along the hill (m) Valentina waits from the catch. */
const MEET_OFFSET = 9;

type Ground = (x: number, z: number) => number;

function heartTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ff3b6b';
  ctx.beginPath();
  ctx.moveTo(64, 112);
  ctx.bezierCurveTo(10, 72, 8, 30, 38, 22);
  ctx.bezierCurveTo(54, 18, 62, 30, 64, 40);
  ctx.bezierCurveTo(66, 30, 74, 18, 90, 22);
  ctx.bezierCurveTo(120, 30, 118, 72, 64, 112);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(42, 42, 10, 6, -0.6, 0, Math.PI * 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The mandem: black Nike Tech fleece with grey panels, hood up, white trainers. */
function makeMandem(quality: QualitySettings): Humanoid {
  const h = new Humanoid(
    { skin: '#ecc6a6', jersey: '#1c1d21', trim: '#7f848c', sleeve: '#1c1d21', pants: '#1c1d21', socks: '#f2f2f2', shoes: '#f5f5f5', hat: '#1c1d21', gloves: '#ecc6a6', build: 1 },
    quality,
    { scale: 0.98, hair: '#d9c08a', face: true },
  );
  const black = h.materials.jersey!;
  const grey = h.materials.trim!;
  const white = new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.6 });
  h.materials.white = white;
  // Hood up: a shell around the back and top of the head, open at the face.
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 12, Math.PI * 0.18, Math.PI * 1.64, 0, Math.PI * 0.75), black);
  hood.rotation.y = Math.PI;
  hood.position.set(0, 0.015, -0.01);
  h.head.add(hood);
  // Grey chest panel and the tick on the chest.
  const front = h.chestDepth + 0.006;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.01), grey);
  panel.position.set(0, 0.13, front - 0.004);
  const tick = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.006), white);
  tick.position.set(0.075, 0.06, front);
  tick.rotation.z = 0.45;
  const tickShort = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 0.006), white);
  tickShort.position.set(0.048, 0.054, front);
  tickShort.rotation.z = -0.9;
  h.chest.add(panel, tick, tickShort);
  // Crossbody bag with a little Slovak flag (white / blue / red).
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.008), grey);
  strap.position.set(0, 0.04, front + 0.004);
  strap.rotation.z = 0.75;
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.045), black);
  bag.position.set(-0.08, -0.07, front + 0.02);
  h.chest.add(strap, bag);
  ['#ffffff', '#0b4ea2', '#ee1c25'].forEach((c, i) => {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.004), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
    stripe.position.set(-0.08, -0.055 - i * 0.012, front + 0.044);
    h.chest.add(stripe);
  });
  return h;
}

/** Valentina: long dark hair, pink puffer jacket, jeans and white trainers. */
function makeValentina(quality: QualitySettings): Humanoid {
  const h = new Humanoid(
    { skin: '#f1cdb3', jersey: '#f29bbd', trim: '#f7c1d6', sleeve: '#f29bbd', pants: '#3d5a80', socks: '#f2f2f2', shoes: '#f5f5f5', hat: '#3b2216', gloves: '#f1cdb3', build: 0.86 },
    quality,
    { scale: 0.9, hair: '#3b2216', longHair: true, face: true },
  );
  // Puffer jacket rings.
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 8, 20), h.materials.jersey!);
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(1.05, 0.78, 1);
    ring.position.y = -0.02 + i * 0.09;
    h.chest.add(ring);
  }
  // Hair on top (the humanoid's hair covers the back and the sides).
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.121, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), h.materials.hair!);
  crown.position.y = 0.012;
  h.head.add(crown);
  return h;
}

function label(text: string, color: string): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(text, { color, stroke: '#111111', w: 512, h: 128 }), transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
  s.scale.set(2.4, 0.6, 1);
  s.renderOrder = 6;
  return s;
}

/** Running cycle in the character frame (+Z forward). `k` 0..1 blends from standing. */
function runPose(p: HumanoidPose, phase: number, k: number): void {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  p.hipsPos.set(0, 0.98 - 0.05 * k + Math.abs(c) * 0.05 * k, 0);
  p.hipsLean = 0.18 * k;
  p.chestLean = 0.1 * k;
  p.footL.set(0.11, Math.max(0, -s) * 0.22 * k, s * 0.42 * k);
  p.footR.set(-0.11, Math.max(0, s) * 0.22 * k, -s * 0.42 * k);
  p.handL.set(0.24, 0.92 + 0.12 * k, 0.05 - s * 0.32 * k);
  p.handR.set(-0.24, 0.92 + 0.12 * k, 0.05 + s * 0.32 * k);
  p.elbowPoleL.set(0.5, -0.5, -0.8);
  p.elbowPoleR.set(-0.5, -0.5, -0.8);
}

export class HomeRunThief {
  readonly root = new THREE.Group();
  private readonly man: Humanoid;
  private readonly girl: Humanoid;
  private readonly ball: THREE.Mesh;
  private readonly heart: THREE.Sprite;
  private readonly manTag: THREE.Sprite;
  private readonly girlTag: THREE.Sprite;
  private ground: Ground = () => 0;
  private readonly catchAt = new THREE.Vector3();
  private readonly meetAt = new THREE.Vector3();
  /** Unit vector along the hill (from the catch toward Valentina) and uphill (away from home). */
  private readonly along = new THREE.Vector3();
  private readonly uphill = new THREE.Vector3();
  private state: 'off' | 'waiting' | 'caught' | 'escape' = 'off';
  private t = 0;
  private time = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(quality: QualitySettings) {
    this.man = makeMandem(quality);
    this.girl = makeValentina(quality);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL.visualRadius * 1.6, 14, 10), new THREE.MeshStandardMaterial({ color: '#f7f5ef', roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0.15 }));
    this.ball.position.set(0, 0, 0.05);
    this.man.handR.add(this.ball);
    this.heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture(), transparent: true, depthWrite: false, toneMapped: false }));
    this.heart.visible = false;
    this.manTag = label('EL ESLOVACO', '#ffffff');
    this.girlTag = label('VALENTINA', '#ff9cc0');
    this.root.add(this.man.root, this.girl.root, this.heart, this.manTag, this.girlTag);
    this.root.visible = false;
    this.disposables.push(this.ball.geometry, this.ball.material as THREE.Material);
    for (const s of [this.heart, this.manTag, this.girlTag]) this.disposables.push(s.material.map!, s.material);
  }

  get playing(): boolean {
    return this.state === 'escape';
  }

  /**
   * The mandem waits at `feet` (on the hill beyond the wall) for the ball;
   * Valentina waits a few metres along the hill. `ground` gives the hill
   * height at any point.
   */
  prepare(feet: Vec3, ground: Ground): void {
    this.ground = ground;
    this.catchAt.set(feet.x, feet.y, feet.z);
    this.uphill.set(feet.x, 0, feet.z).normalize();
    // Valentina waits on the side closer to centre field, so both stay in front of the camera.
    const side = feet.x > 0 ? -1 : 1;
    this.along.set(this.uphill.z * side, 0, -this.uphill.x * side);
    this.meetAt.copy(this.catchAt).addScaledVector(this.along, MEET_OFFSET);
    this.meetAt.y = ground(this.meetAt.x, this.meetAt.z);
    this.state = 'waiting';
    this.t = 0;
    this.ball.visible = false;
    this.heart.visible = false;
    this.root.visible = true;
  }

  /** He snatches the ball out of the air. */
  catchBall(): void {
    if (this.state !== 'waiting') return;
    this.state = 'caught';
    this.t = 0;
    this.ball.visible = true;
  }

  /** Runs off with the ball to Valentina; they leave together. */
  escape(): void {
    if (this.state === 'off') return;
    this.state = 'escape';
    this.t = 0;
    this.ball.visible = true;
  }

  /** Where the camera should look during the escape (between the two of them). */
  focus(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.catchAt).lerp(this.meetAt, 0.55).add(this.tmp.set(0, 1.3, 0));
  }

  stop(): void {
    this.state = 'off';
    this.root.visible = false;
  }

  update(dt: number): void {
    if (this.state === 'off') return;
    this.t += dt;
    this.time += dt;
    const t = this.t;
    const man = this.man;
    const girl = this.girl;
    const mp = man.pose;
    const gp = girl.pose;
    const ease = (u: number): number => {
      const c = Math.min(1, Math.max(0, u));
      return c * c * (3 - 2 * c);
    };
    const faceYaw = (dx: number, dz: number): number => Math.atan2(dx, dz);
    const homeYaw = faceYaw(-this.uphill.x, -this.uphill.z);
    const place = (h: Humanoid, x: number, z: number, lift = 0): void => {
      h.root.position.set(x, this.ground(x, z) + lift, z);
    };
    // Valentina: waits facing the field, waving now and then.
    const gx = this.meetAt.x;
    const gz = this.meetAt.z;
    let girlX = gx;
    let girlZ = gz;
    reset(gp);
    girl.root.rotation.y = homeYaw;
    if (this.state === 'waiting' || this.state === 'caught') {
      // Mandem: bouncing on his toes, hands in his pockets, eyes on the sky.
      reset(mp);
      const bounce = Math.abs(Math.sin(this.time * 5)) * 0.03;
      mp.hipsPos.y += bounce;
      mp.handL.set(0.19, 0.95, 0.07);
      mp.handR.set(-0.19, 0.95, 0.07);
      mp.headPitch = -0.35;
      let lift = 0;
      if (this.state === 'caught') {
        // Leap with the right hand up, then land and hold the ball high.
        const jump = Math.sin(Math.min(1, t / 0.55) * Math.PI);
        lift = jump * 0.6;
        const up = ease(t / 0.15);
        mp.handR.set(-0.22, 0.95 + 1.05 * up, 0.12 + 0.1 * up);
        mp.elbowPoleR.set(-0.6, 0.4, -0.3);
        mp.footL.y = jump * 0.12;
        mp.footR.y = jump * 0.1;
      }
      man.root.rotation.y = homeYaw;
      place(man, this.catchAt.x, this.catchAt.z, lift);
      const wave = Math.sin(this.time * 8) * 0.12 * (Math.sin(this.time * 0.9) > 0 ? 1 : 0);
      gp.handR.set(-0.3, 1.55 + wave, 0.2);
      gp.elbowPoleR.set(-0.6, 0.3, -0.3);
    } else {
      // 0–2.2 s: runs to her with the ball up; 2.2–3.4 s: hug + heart; 3.4 s+: walk away hand in hand.
      const run = ease(t / 2.2);
      const towards = this.tmp.copy(this.meetAt).sub(this.catchAt);
      const gap = 0.55;
      const len = Math.max(0.01, towards.length() - gap);
      towards.normalize();
      let mx = this.catchAt.x + towards.x * len * run;
      let mz = this.catchAt.z + towards.z * len * run;
      reset(mp);
      if (t < 2.2) {
        runPose(mp, this.time * 13, Math.min(1, t / 0.25) * (1 - ease((t - 1.9) / 0.3)));
        mp.handR.set(-0.22, 1.85, 0.15);
        mp.elbowPoleR.set(-0.6, 0.4, -0.3);
        man.root.rotation.y = faceYaw(towards.x, towards.z);
      } else if (t < 3.4) {
        // Hug: arms around each other, facing.
        const hug = ease((t - 2.2) / 0.3) * (1 - ease((t - 3.15) / 0.25));
        man.root.rotation.y = faceYaw(towards.x, towards.z);
        mp.handL.set(0.26, 1.1, 0.2 + 0.25 * hug);
        mp.handR.set(-0.26, 1.1, 0.2 + 0.25 * hug);
        girl.root.rotation.y = faceYaw(-towards.x, -towards.z);
        gp.handL.set(0.24, 1.15, 0.18 + 0.24 * hug);
        gp.handR.set(-0.24, 1.15, 0.18 + 0.24 * hug);
        gp.footL.y = 0.06 * hug;
        gp.headPitch = 0.2 * hug;
      } else {
        // Walk away uphill together, side by side.
        const w = t - 3.4;
        const go = Math.min(1, w / 0.4);
        const dist = w * 1.9;
        const walk = this.time * 8.5;
        const yaw = faceYaw(this.uphill.x, this.uphill.z);
        man.root.rotation.y = yaw;
        girl.root.rotation.y = yaw;
        mx += this.uphill.x * dist;
        mz += this.uphill.z * dist;
        girlX += this.uphill.x * dist;
        girlZ += this.uphill.z * dist;
        runPose(mp, walk, 0.45 * go);
        runPose(gp, walk + Math.PI, 0.45 * go);
        // Holding hands, the ball tucked under his other arm.
        mp.handL.set(0.3, 0.92, 0.08);
        gp.handR.set(-0.3, 0.92, 0.08);
        mp.handR.set(-0.22, 1.05, 0.18);
        gp.headYaw = -0.35;
      }
      place(man, mx, mz);
    }
    place(girl, girlX, girlZ);
    // Name tags float over their heads; the heart pops during the hug.
    this.manTag.position.copy(man.root.position).add(this.tmp.set(0, 2.6, 0));
    this.girlTag.position.copy(girl.root.position).add(this.tmp.set(0, 2.35, 0));
    const heartOn = this.state === 'escape' && t > 2.3 && t < 4.4;
    this.heart.visible = heartOn;
    if (heartOn) {
      const u = (t - 2.3) / 2.1;
      const s = (0.6 + 0.9 * ease(u / 0.2)) * (1 + 0.08 * Math.sin(this.time * 12));
      this.heart.scale.set(s, s, 1);
      this.heart.position.copy(man.root.position).lerp(girl.root.position, 0.5).add(this.tmp.set(0, 2.1 + u * 1.2, 0));
      this.heart.material.opacity = 1 - ease((u - 0.75) / 0.25);
    }
    man.apply();
    girl.apply();
    if (this.state === 'escape' && t >= ESCAPE_DURATION) this.stop();
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.man.dispose();
    this.girl.dispose();
  }
}

const REST = makePose();
function reset(p: HumanoidPose): void {
  copyPose(REST, p);
}
