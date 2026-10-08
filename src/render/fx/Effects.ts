import * as THREE from 'three';
import type { QualitySettings, Vec3 } from '../../contracts';
import type { Effects } from '../api';
import { makeCanvas, radialTexture } from '../textures';

/**
 * Pooled particle effects. Two Points systems (additive for light, normal
 * for dust) with preallocated buffers; nothing is allocated per frame.
 */
const VERT = /* glsl */ `
attribute float size;
attribute float alpha;
attribute vec3 pcolor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = alpha;
  vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.5, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a;
  if (vAlpha * a < 0.003) discard;
  gl_FragColor = vec4(vColor, vAlpha * a);
}`;

class ParticlePool {
  readonly points: THREE.Points;
  private readonly cap: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly size0: Float32Array;
  private readonly grow: Float32Array;
  private readonly alpha: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly twinkle: Uint8Array;
  private next = 0;
  private time = 0;

  constructor(cap: number, additive: boolean) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.size0 = new Float32Array(cap);
    this.grow = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.twinkle = new Uint8Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 9 : 6;
  }

  setScale(px: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale!.value = px;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, size: number, life: number, gravity: number, drag: number, grow = 0, twinkle = false): void {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
    this.size[i] = this.size0[i] = size;
    this.grow[i] = grow;
    this.alpha[i] = 1;
    this.life[i] = 0;
    this.maxLife[i] = life;
    this.grav[i] = gravity;
    this.drag[i] = drag;
    this.twinkle[i] = twinkle ? 1 : 0;
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = 0; i < this.cap; i++) {
      if (this.maxLife[i]! <= 0) continue;
      const l = (this.life[i]! += dt);
      const t = l / this.maxLife[i]!;
      if (t >= 1) {
        this.maxLife[i] = 0;
        this.alpha[i] = 0;
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i]! * dt);
      this.vel[i * 3]! *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1]! * d - this.grav[i]! * dt;
      this.vel[i * 3 + 2]! *= d;
      this.pos[i * 3] += this.vel[i * 3]! * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1]! * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2]! * dt;
      this.size[i] = this.size0[i]! * (1 + this.grow[i]! * t);
      let a = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      if (this.twinkle[i]) a *= 0.55 + 0.45 * Math.sin(this.time * 40 + i);
      this.alpha[i] = Math.max(0, a);
    }
    const g = this.points.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('pcolor') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('size') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('alpha') as THREE.BufferAttribute).needsUpdate = true;
  }
}

function labelTexture(text: string, color: string): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 160);
  ctx.clearRect(0, 0, 512, 160);
  ctx.fillStyle = 'rgba(11,20,38,0.82)';
  const r = 34;
  ctx.beginPath();
  ctx.roundRect(16, 20, 480, 120, r);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.font = 'bold 92px "Bebas Neue", "Barlow Condensed", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 256, 86);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Marker {
  ring: THREE.Mesh;
  label: THREE.Sprite;
  t: number;
}

interface Burst {
  at: THREE.Vector3;
  delay: number;
}

const PALETTE = ['#ffd60a', '#ff006e', '#3a86ff', '#8338ec', '#06d6a0', '#fb5607', '#ffffff'].map((c) => new THREE.Color(c));

class FX implements Effects {
  readonly root = new THREE.Group();
  private readonly light: ParticlePool;
  private readonly dustPool: ParticlePool;
  private readonly flash: THREE.Sprite;
  private flashT = 1;
  private readonly shock: THREE.Mesh;
  private shockT = 1;
  private readonly markers: Marker[] = [];
  private readonly bursts: Burst[] = [];
  private readonly confettiMesh: THREE.InstancedMesh;
  private readonly confettiState: Float32Array;
  private confettiT = -1;
  private readonly q: number;
  private readonly c = new THREE.Color();
  private readonly m4 = new THREE.Matrix4();
  private readonly e = new THREE.Euler();
  private readonly qt = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(quality: QualitySettings) {
    this.q = quality.particles;
    this.light = new ParticlePool(Math.round(4000 * this.q) + 200, true);
    this.dustPool = new ParticlePool(Math.round(800 * this.q) + 100, false);
    this.root.add(this.light.points, this.dustPool.points);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,250,230,1)', 'rgba(255,200,80,0)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
    this.flash.visible = false;
    this.flash.renderOrder = 10;
    this.shock = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: '#ffc83d', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    this.shock.visible = false;
    this.root.add(this.flash, this.shock);
    const n = Math.round(320 * this.q) + 40;
    this.confettiMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.2), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n);
    this.confettiMesh.visible = false;
    this.confettiMesh.frustumCulled = false;
    this.confettiState = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) this.confettiMesh.setColorAt(i, PALETTE[i % PALETTE.length]!);
    this.root.add(this.confettiMesh);
  }

  contact(at: Vec3, power: number, barrel: boolean): void {
    this.flash.position.set(at.x, at.y, at.z);
    this.flash.visible = true;
    this.flashT = 0;
    this.flash.userData.size = 0.5 + power * 0.9 + (barrel ? 0.6 : 0);
    const n = Math.round((24 + power * 50 + (barrel ? 40 : 0)) * Math.max(0.5, this.q));
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const sp = 3 + Math.random() * (6 + power * 8);
      this.c.set(barrel ? (Math.random() < 0.6 ? '#ffd166' : '#ffffff') : '#fff1c1');
      this.light.spawn(at.x, at.y, at.z, Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp, this.c, 0.05 + Math.random() * 0.06, 0.18 + Math.random() * 0.25, 6, 3);
    }
    if (barrel) {
      this.shock.position.set(at.x, at.y, at.z);
      this.shock.visible = true;
      this.shockT = 0;
    }
  }

  dust(at: Vec3, size: number): void {
    const n = Math.round((14 + size * 20) * Math.max(0.5, this.q));
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 1.8 * size;
      this.c.set('#b08a63').offsetHSL(0, 0, (Math.random() - 0.5) * 0.1);
      this.dustPool.spawn(at.x, at.y + 0.1, at.z, Math.cos(th) * sp, 0.6 + Math.random() * 1.2, Math.sin(th) * sp, this.c, 0.35 + Math.random() * 0.4 * size, 0.9 + Math.random() * 0.8, 0.6, 1.2, 2.5);
    }
  }

  fireworks(at: Vec3, bursts: number): void {
    for (let i = 0; i < bursts; i++) {
      this.bursts.push({ at: new THREE.Vector3(at.x + (Math.random() - 0.5) * 60, at.y + Math.random() * 25, at.z + (Math.random() - 0.5) * 30), delay: i * 0.28 + Math.random() * 0.2 });
    }
  }

  private explode(at: THREE.Vector3): void {
    const base = PALETTE[Math.floor(Math.random() * PALETTE.length)]!;
    const alt = PALETTE[Math.floor(Math.random() * PALETTE.length)]!;
    const n = Math.round(150 * this.q) + 30;
    const speed = 16 + Math.random() * 10;
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.85 + Math.random() * 0.15);
      this.c.copy(Math.random() < 0.7 ? base : alt);
      this.light.spawn(at.x, at.y, at.z, Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp, this.c, 0.9 + Math.random() * 0.6, 1.4 + Math.random() * 0.8, 5, 1.6, -0.4, Math.random() < 0.35);
    }
    // Bright core.
    this.c.set('#ffffff');
    this.light.spawn(at.x, at.y, at.z, 0, 0, 0, this.c, 14, 0.25, 0, 0, 1);
  }

  confetti(around: Vec3): void {
    const n = this.confettiMesh.count;
    for (let i = 0; i < n; i++) {
      const o = i * 8;
      this.confettiState[o] = around.x + (Math.random() - 0.5) * 8;
      this.confettiState[o + 1] = around.y + 3 + Math.random() * 6;
      this.confettiState[o + 2] = around.z + (Math.random() - 0.5) * 8;
      this.confettiState[o + 3] = -1.2 - Math.random() * 1.2; // fall speed
      this.confettiState[o + 4] = Math.random() * Math.PI * 2; // phase
      this.confettiState[o + 5] = 2 + Math.random() * 4; // spin
      this.confettiState[o + 6] = (Math.random() - 0.5) * 1.5; // drift x
      this.confettiState[o + 7] = (Math.random() - 0.5) * 1.5; // drift z
    }
    this.confettiT = 0;
    this.confettiMesh.visible = true;
  }

  landingMarker(at: Vec3, label: string, color: string): void {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, Math.max(0.06, at.y + 0.06), at.z);
    ring.renderOrder = 7;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(label, color), depthTest: false, transparent: true }));
    sprite.position.set(at.x, at.y + 4.5, at.z);
    sprite.scale.set(9.6, 3, 1);
    sprite.renderOrder = 11;
    this.root.add(ring, sprite);
    this.markers.push({ ring, label: sprite, t: 0 });
  }

  clearMarkers(): void {
    for (const m of this.markers) {
      this.root.remove(m.ring, m.label);
      m.ring.geometry.dispose();
      (m.ring.material as THREE.Material).dispose();
      m.label.material.map?.dispose();
      m.label.material.dispose();
    }
    this.markers.length = 0;
  }

  mittPop(at: Vec3): void {
    for (let i = 0; i < 8; i++) {
      this.c.set('#d9c7a8');
      this.dustPool.spawn(at.x, at.y, at.z, (Math.random() - 0.5) * 1.2, Math.random() * 0.8, (Math.random() - 0.5) * 1.2, this.c, 0.08, 0.4, 0, 2, 2);
    }
  }

  update(dt: number, camera: THREE.Camera): void {
    const h = (camera as THREE.PerspectiveCamera).isPerspectiveCamera ? window.innerHeight / (2 * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360)) : 400;
    this.light.setScale(h);
    this.dustPool.setScale(h);
    this.light.update(dt);
    this.dustPool.update(dt);

    if (this.flash.visible) {
      this.flashT += dt;
      const t = this.flashT / 0.16;
      const size = (this.flash.userData.size as number) * (0.6 + t * 1.2);
      this.flash.scale.set(size, size, 1);
      this.flash.material.opacity = Math.max(0, 1 - t);
      if (t >= 1) this.flash.visible = false;
    }
    if (this.shock.visible) {
      this.shockT += dt;
      const t = this.shockT / 0.35;
      this.shock.scale.setScalar(0.2 + t * 1.15);
      this.shock.quaternion.copy(camera.quaternion);
      (this.shock.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.75 * (1 - t));
      if (t >= 1) this.shock.visible = false;
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]!;
      b.delay -= dt;
      if (b.delay <= 0) {
        this.explode(b.at);
        this.bursts.splice(i, 1);
      }
    }
    for (const m of this.markers) {
      m.t += dt;
      const s = 1 + Math.sin(m.t * 4) * 0.08;
      m.ring.scale.set(s, s, s);
      // Keep the label readable at any distance.
      const d = this.v.copy(m.label.position).distanceTo(camera.position);
      const k = Math.max(1, d / 40);
      m.label.scale.set(9.6 * k * 0.6, 3 * k * 0.6, 1);
    }
    if (this.confettiT >= 0) {
      this.confettiT += dt;
      const n = this.confettiMesh.count;
      for (let i = 0; i < n; i++) {
        const o = i * 8;
        const st = this.confettiState;
        st[o] += (st[o + 6]! + Math.sin(this.confettiT * 2 + st[o + 4]!) * 0.6) * dt;
        st[o + 1] += st[o + 3]! * dt;
        st[o + 2] += st[o + 7]! * dt;
        this.e.set(this.confettiT * st[o + 5]!, st[o + 4]!, this.confettiT * st[o + 5]! * 0.7);
        this.qt.setFromEuler(this.e);
        this.v.set(st[o]!, st[o + 1]!, st[o + 2]!);
        this.s.setScalar(this.confettiT > 3.5 ? Math.max(0, 1 - (this.confettiT - 3.5) * 2) : 1);
        this.m4.compose(this.v, this.qt, this.s);
        this.confettiMesh.setMatrixAt(i, this.m4);
      }
      this.confettiMesh.instanceMatrix.needsUpdate = true;
      if (this.confettiT > 4.2) {
        this.confettiT = -1;
        this.confettiMesh.visible = false;
      }
    }
  }
}

export const createEffects = (quality: QualitySettings): Effects => new FX(quality);
