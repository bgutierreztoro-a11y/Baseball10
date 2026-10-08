import * as THREE from 'three';
import type { QualitySettings, Vec3 } from '../../contracts';
import { BALL } from '../../config/constants';
import type { BallView } from '../api';
import { makeCanvas, radialTexture } from '../textures';

/** Off-white leather with the classic two-lobe red seam (equirectangular map). */
function seamTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#f3efe4';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgba(120,100,80,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  // Seam: latitude oscillates twice per revolution.
  const pt = (t: number): [number, number] => {
    const lon = t;
    const lat = Math.asin(0.62 * Math.sin(2 * t));
    return [(lon / (Math.PI * 2)) * W, (0.5 - lat / Math.PI) * H];
  };
  ctx.strokeStyle = '#c1121f';
  ctx.lineWidth = 2;
  const n = 120;
  for (const offset of [-5, 5]) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const [x, y] = pt((i / n) * Math.PI * 2);
      if (i === 0) ctx.moveTo(x, y + offset);
      else ctx.lineTo(x, y + offset);
    }
    ctx.stroke();
  }
  // Stitches (V marks across the seam).
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 108; i++) {
    const t = (i / 108) * Math.PI * 2;
    const [x, y] = pt(t);
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 7);
    ctx.lineTo(x, y);
    ctx.lineTo(x + 4, y - 7);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const TRAIL_MAX = 72;
const COOL = new THREE.Color('#bfefff');
const WARM = new THREE.Color('#ffd166');
const HOT = new THREE.Color('#ff2e63');
const PITCH_COLOR = new THREE.Color('#e8f6ff');
const WHITE = new THREE.Color('#ffffff');

const TRAIL_VERT = /* glsl */ `
attribute float alpha;
attribute vec3 tcolor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = alpha;
  vColor = tcolor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const TRAIL_FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor * vAlpha, vAlpha); }`;

class Ball implements BallView {
  readonly root = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private readonly trail: THREE.Mesh;
  private readonly trailPos: Float32Array;
  private readonly trailAlpha: Float32Array;
  private readonly trailColor: Float32Array;
  private readonly hist: THREE.Vector3[] = [];
  private mode: 'off' | 'pitch' | 'hit' = 'off';
  private heat = 0;
  private readonly axis = new THREE.Vector3(1, 0, 0);
  private rps = 0;
  private readonly pos = new THREE.Vector3();
  private camera: THREE.Camera | null = null;
  private readonly side = new THREE.Vector3();
  private readonly toCam = new THREE.Vector3();
  private readonly seg = new THREE.Vector3();
  private readonly colA = new THREE.Color();
  private readonly colB = new THREE.Color();

  constructor(quality: QualitySettings) {
    const tex = seamTexture();
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL.visualRadius, 20, 14), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: '#ffffff', emissiveIntensity: 0.12 }));
    this.mesh.castShadow = false;
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.75)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 7;
    const g = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(TRAIL_MAX * 2 * 3);
    this.trailAlpha = new Float32Array(TRAIL_MAX * 2);
    this.trailColor = new Float32Array(TRAIL_MAX * 2 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.trailAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tcolor', new THREE.BufferAttribute(this.trailColor, 3).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_MAX - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    this.trail = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        vertexShader: TRAIL_VERT,
        fragmentShader: TRAIL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 8;
    // Capture the active camera lazily so the ribbon can face it.
    this.trail.onBeforeRender = (_r, _s, cam) => {
      this.camera = cam;
    };
    this.root.add(this.mesh, this.shadow, this.trail);
    void quality;
  }

  setVisible(v: boolean): void {
    this.mesh.visible = v;
    this.shadow.visible = v;
  }

  setPosition(p: Vec3): void {
    this.pos.set(p.x, p.y, p.z);
    this.mesh.position.copy(this.pos);
    const h = Math.max(0, p.y);
    const size = 0.16 + h * 0.035;
    this.shadow.position.set(p.x, 0.012, p.z);
    this.shadow.scale.set(size, size, 1);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.85 / (1 + h * 0.35);
  }

  setSpin(axis: Vec3, rps: number): void {
    this.axis.set(axis.x, axis.y, axis.z).normalize();
    // Cap visual spin so it never strobes at 60 fps.
    this.rps = Math.min(rps, 5);
  }

  setTrail(mode: 'off' | 'pitch' | 'hit', heat = 0): void {
    this.mode = mode;
    this.heat = heat;
    if (mode === 'off') this.clearTrail();
  }

  clearTrail(): void {
    this.hist.length = 0;
    this.trailAlpha.fill(0);
    (this.trail.geometry.getAttribute('alpha') as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number): void {
    if (this.rps > 0) this.mesh.rotateOnWorldAxis(this.axis, this.rps * Math.PI * 2 * dt);
    if (this.mode === 'off' || !this.mesh.visible) {
      this.trail.visible = this.hist.length > 0 && this.mode !== 'off';
      return;
    }
    this.trail.visible = true;
    const maxLen = this.mode === 'pitch' ? 26 : TRAIL_MAX;
    const last = this.hist[this.hist.length - 1];
    if (!last || last.distanceToSquared(this.pos) > 1e-6) {
      const v = this.hist.length >= maxLen ? this.hist.shift()! : new THREE.Vector3();
      this.hist.push(v.copy(this.pos));
    }
    this.rebuildTrail();
  }

  private rebuildTrail(): void {
    const n = this.hist.length;
    const cam = this.camera;
    const hit = this.mode === 'hit';
    const baseW = hit ? 0.09 : 0.03;
    // Heat ramp: cool white/cyan → yellow/orange → red/magenta.
    if (hit) {
      const h = this.heat;
      if (h < 0.5) this.colA.copy(COOL).lerp(WARM, h * 2);
      else this.colA.copy(WARM).lerp(HOT, (h - 0.5) * 2);
    } else this.colA.copy(PITCH_COLOR);
    for (let i = 0; i < TRAIL_MAX; i++) {
      const k = i * 2;
      if (i >= n) {
        this.trailAlpha[k] = this.trailAlpha[k + 1] = 0;
        continue;
      }
      const p = this.hist[i]!;
      const q = this.hist[Math.min(n - 1, i + 1)]!;
      const o = this.hist[Math.max(0, i - 1)]!;
      this.seg.subVectors(q, o);
      if (cam) this.toCam.subVectors(cam.position, p);
      else this.toCam.set(0, 1, 0);
      this.side.crossVectors(this.seg, this.toCam).normalize();
      const f = n > 1 ? i / (n - 1) : 1; // 0 = oldest, 1 = newest
      const dist = cam ? Math.max(1, this.toCam.length()) : 10;
      // Keep a minimum on-screen width for distant balls.
      const w = baseW * (0.35 + 0.65 * f) * Math.max(1, dist / (hit ? 25 : 40));
      this.trailPos[k * 3] = p.x + this.side.x * w;
      this.trailPos[k * 3 + 1] = p.y + this.side.y * w;
      this.trailPos[k * 3 + 2] = p.z + this.side.z * w;
      this.trailPos[k * 3 + 3] = p.x - this.side.x * w;
      this.trailPos[k * 3 + 4] = p.y - this.side.y * w;
      this.trailPos[k * 3 + 5] = p.z - this.side.z * w;
      const a = (hit ? 0.95 : 0.4) * f * f;
      this.trailAlpha[k] = this.trailAlpha[k + 1] = a;
      this.colB.copy(this.colA).lerp(WHITE, f * 0.5);
      for (const j of [k, k + 1]) {
        this.trailColor[j * 3] = this.colB.r;
        this.trailColor[j * 3 + 1] = this.colB.g;
        this.trailColor[j * 3 + 2] = this.colB.b;
      }
    }
    const g = this.trail.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('alpha') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('tcolor') as THREE.BufferAttribute).needsUpdate = true;
  }
}

export const createBallView = (quality: QualitySettings): BallView => new Ball(quality);
