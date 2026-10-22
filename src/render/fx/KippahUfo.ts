import * as THREE from 'three';
import type { QualitySettings } from '../../contracts';
import { Humanoid, makePose } from '../characters/humanoid';

/**
 * Benjamin's blessing cinematic: a giant flying kippah (UFO style: blinking
 * lights under the rim and a tractor beam) swoops down next to home plate;
 * Benjamin Netanyahu floats down the beam, blesses the batter with raised
 * arms, floats back up and the kippah flies away. Driven by elapsed time.
 */

/** Seconds the whole sequence lasts. */
export const BLESSING_DURATION = 7.6;
/** When the blessing "lands" on the batter (seconds into the sequence). */
export const BLESSING_GIVE_AT = 4.0;

const HOVER_Y = 6.0;
const KIPPAH_R = 3.2;

function kippahTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#2c3f9a');
  g.addColorStop(1, '#16205a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  // Velvet sheen: faint radial panels.
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 6;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo((i / 8) * 512, 0);
    ctx.lineTo((i / 8) * 512, 256);
    ctx.stroke();
  }
  // Embroidered silver band near the rim with Stars of David.
  ctx.fillStyle = '#d8dde6';
  ctx.fillRect(0, 186, 512, 6);
  ctx.fillRect(0, 238, 512, 6);
  const star = (cx: number, cy: number, r: number): void => {
    for (const rot of [0, Math.PI]) {
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = rot - Math.PI / 2 + (k * Math.PI * 2) / 3;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  };
  ctx.strokeStyle = '#e9edf3';
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) star(32 + i * 64, 215, 15);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Netanyahu: grey hair, navy suit, white shirt, blue tie. */
function makeNetanyahu(quality: QualitySettings): Humanoid {
  const h = new Humanoid(
    { skin: '#e7bf9f', jersey: '#1c2538', trim: '#1c2538', sleeve: '#1c2538', pants: '#1c2538', socks: '#111216', shoes: '#0d0d10', hat: '#1c2538', gloves: '#e7bf9f', build: 1.08 },
    quality,
    { hair: '#bfc0c2', face: true },
  );
  const white = new THREE.MeshStandardMaterial({ color: '#f5f5f2', roughness: 0.6 });
  const tie = new THREE.MeshStandardMaterial({ color: '#1f4fd1', roughness: 0.45 });
  h.materials.shirt = white;
  h.materials.tie = tie;
  const front = h.chestDepth + 0.004;
  const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.01), white);
  shirt.position.set(0, 0.06, front);
  const knot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.012), tie);
  knot.position.set(0, 0.16, front + 0.004);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.01), tie);
  blade.position.set(0, 0.04, front + 0.005);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.072, 0.04, 14), white);
  collar.position.y = -0.03;
  h.chest.add(shirt, knot, blade);
  h.neck.add(collar);
  // Short grey hair over the crown (the humanoid's hair only covers the back and sides).
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.119, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), h.materials.hair!);
  crown.position.y = 0.01;
  h.head.add(crown);
  return h;
}

export class KippahUfo {
  readonly root = new THREE.Group();
  private readonly ufo = new THREE.Group();
  private readonly beam: THREE.Mesh;
  private readonly lights: THREE.Mesh[] = [];
  private readonly man: Humanoid;
  private readonly land = new THREE.Vector3();
  private face = 0;
  private tiltX = 0;
  private tiltZ = 0;
  /** Spins inside the tilted saucer. */
  private readonly spinner = new THREE.Group();
  private t = -1;
  private gave = false;
  private onGive: (() => void) | null = null;
  private readonly pose = makePose();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(quality: QualitySettings) {
    const tex = kippahTexture();
    const velvet = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(KIPPAH_R, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), velvet);
    dome.scale.y = 0.42;
    const silver = new THREE.MeshStandardMaterial({ color: '#d6dbe3', roughness: 0.25, metalness: 0.8, emissive: '#6b7590', emissiveIntensity: 0.4 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(KIPPAH_R, 0.16, 10, 48), silver);
    rim.rotation.x = Math.PI / 2;
    const under = new THREE.Mesh(new THREE.CircleGeometry(KIPPAH_R, 40), new THREE.MeshStandardMaterial({ color: '#101634', roughness: 0.6, side: THREE.DoubleSide }));
    under.rotation.x = Math.PI / 2;
    under.position.y = -0.02;
    this.spinner.add(dome, rim, under);
    this.ufo.add(this.spinner);
    const lampG = new THREE.SphereGeometry(0.17, 10, 6);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const lamp = new THREE.Mesh(lampG, new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffe27a' : '#9fd8ff', toneMapped: false }));
      lamp.position.set(Math.cos(a) * (KIPPAH_R - 0.35), -0.12, Math.sin(a) * (KIPPAH_R - 0.35));
      this.spinner.add(lamp);
      this.lights.push(lamp);
    }
    const beamG = new THREE.CylinderGeometry(1.0, 2.2, HOVER_Y, 32, 1, true);
    beamG.translate(0, -HOVER_Y / 2, 0);
    this.beam = new THREE.Mesh(beamG, new THREE.MeshBasicMaterial({ color: '#fff1b8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    this.man = makeNetanyahu(quality);
    // The beam hangs straight down from the saucer (not tilted with it).
    this.root.add(this.ufo, this.beam, this.man.root);
    this.root.visible = false;
    // No shadows from the saucer: it would leave Netanyahu in the dark.
    for (const obj of [this.ufo, this.beam]) {
      obj.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = false;
          this.disposables.push(o.geometry, o.material as THREE.Material);
        }
      });
    }
    this.disposables.push(tex);
  }

  get playing(): boolean {
    return this.t >= 0;
  }

  /**
   * Starts the sequence: the kippah hovers over `land` (feet position of
   * Netanyahu), who faces `faceYaw`, tilted toward `camera`. `onGive` fires
   * when he blesses the batter.
   */
  play(land: { x: number; z: number }, faceYaw: number, camera: { x: number; z: number }, onGive: () => void): void {
    this.land.set(land.x, 0, land.z);
    // Tip the dome toward the camera so the kippah reads (not just its underside).
    const dx = camera.x - land.x;
    const dz = camera.z - land.z;
    const n = Math.hypot(dx, dz) || 1;
    this.tiltX = (0.42 * dz) / n;
    this.tiltZ = (-0.42 * dx) / n;
    this.face = faceYaw;
    this.onGive = onGive;
    this.gave = false;
    this.t = 0;
    this.root.visible = true;
  }

  stop(): void {
    this.t = -1;
    this.root.visible = false;
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const t = this.t;
    const ease = (u: number): number => {
      const c = Math.min(1, Math.max(0, u));
      return c * c * (3 - 2 * c);
    };
    // Kippah: swoops in from high above centre field, hovers, leaves straight up.
    const inU = ease(t / 1.8);
    const outU = ease((t - 6.3) / 1.3);
    const from = this.tmpFrom.set(this.land.x + 25, 75, this.land.z + 60);
    const hover = this.tmpHover.set(this.land.x, HOVER_Y + Math.sin(t * 2) * 0.15, this.land.z);
    this.ufo.position.lerpVectors(from, hover, inU);
    this.ufo.position.y += outU * 80;
    this.ufo.position.x += outU * 10;
    this.spinner.rotation.y = t * 1.6;
    const hoverTilt = inU * (1 - outU);
    this.ufo.rotation.set(this.tiltX * hoverTilt, 0, this.tiltZ * hoverTilt + Math.sin(t * 1.3) * 0.05);
    this.lights.forEach((l, i) => l.scale.setScalar(0.7 + 0.5 * Math.max(0, Math.sin(t * 9 + i * 0.9))));
    const beamOn = ease((t - 1.8) / 0.4) * (1 - ease((t - 5.9) / 0.4));
    this.beam.position.copy(this.ufo.position);
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.3 * beamOn;
    this.beam.visible = beamOn > 0.01;

    // Netanyahu: down the beam, bless, back up.
    const down = ease((t - 2.1) / 1.3);
    const up = ease((t - 5.3) / 0.9);
    const visible = t > 2.0 && t < 6.3;
    this.man.root.visible = visible;
    this.man.root.position.set(this.land.x, (1 - down) * (HOVER_Y - 2.2) + up * (HOVER_Y - 2.2), this.land.z);
    this.man.root.rotation.y = this.face + (1 - down) * 2.5;
    const p = this.pose;
    const raise = ease((t - 3.4) / 0.5) * (1 - ease((t - 5.1) / 0.3));
    const wave = Math.sin(t * 7) * 0.06 * raise;
    p.handL.set(0.25 + 0.1 * raise, 0.85 + 0.95 * raise + wave, 0.05 + 0.25 * raise);
    p.handR.set(-0.25 - 0.1 * raise, 0.85 + 0.95 * raise - wave, 0.05 + 0.25 * raise);
    p.elbowPoleL.set(0.6, -0.5 + raise * 0.3, -0.6);
    p.elbowPoleR.set(-0.6, -0.5 + raise * 0.3, -0.6);
    p.headPitch = -0.15 * raise;
    // Feet dangle a little while floating.
    const float = 1 - down + up;
    p.footL.set(0.12, Math.min(0.12, float * 0.12), float * 0.05);
    p.footR.set(-0.12, Math.min(0.08, float * 0.08), -float * 0.04);
    this.copyPose(p);
    this.man.apply();
    if (!this.gave && t >= BLESSING_GIVE_AT) {
      this.gave = true;
      this.onGive?.();
    }
    if (t >= BLESSING_DURATION) this.stop();
  }

  private readonly tmpFrom = new THREE.Vector3();
  private readonly tmpHover = new THREE.Vector3();

  private copyPose(p: ReturnType<typeof makePose>): void {
    const m = this.man.pose;
    m.handL.copy(p.handL);
    m.handR.copy(p.handR);
    m.elbowPoleL.copy(p.elbowPoleL);
    m.elbowPoleR.copy(p.elbowPoleR);
    m.headPitch = p.headPitch;
    m.footL.copy(p.footL);
    m.footR.copy(p.footR);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.man.dispose();
  }
}
