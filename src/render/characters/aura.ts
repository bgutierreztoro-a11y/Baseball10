import * as THREE from 'three';
import type { QualitySettings } from '../../contracts';

/**
 * "Peak" aura: golden sparks spiralling up around the batter, a soft halo on
 * the ground and a warm emissive pulse on the body materials.
 *
 * All particle motion runs in the vertex shader from a single time uniform, so
 * the CPU cost while active is a couple of uniform writes per frame; while off
 * the group is invisible and update() returns immediately.
 */
const VERT = /* glsl */ `
attribute vec4 seed;
uniform float uTime;
uniform float uScale;
uniform float uSize;
uniform float uHeight;
uniform float uRadius;
varying float vAlpha;
void main() {
  float t = fract(uTime * (0.22 + seed.z * 0.25) + seed.w);
  float ang = seed.x + t * (2.2 + seed.z * 1.5);
  float r = uRadius * (0.55 + seed.y * 0.55) * (1.0 - 0.35 * t);
  vec3 p = vec3(cos(ang) * r, 0.05 + t * uHeight, sin(ang) * r * 0.8);
  vAlpha = sin(t * 3.14159) * (0.55 + 0.45 * sin(uTime * 7.0 + seed.x * 11.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.6 + seed.y * 0.8) * uScale / max(0.5, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a *= a * vAlpha * uIntensity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (1.0 + 1.5 * a), a);
}`;
const HALO_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const HALO_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float ring = smoothstep(1.0, 0.75, d) * smoothstep(0.35, 0.8, d);
  float core = smoothstep(1.0, 0.0, d) * 0.35;
  float pulse = 0.75 + 0.25 * sin(uTime * 4.0);
  float a = (ring * pulse + core) * uIntensity * 0.55;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}`;

const GOLD = new THREE.Color('#ffc94a');
const EMISSIVE = new THREE.Color('#ffb347');
const drawSize = new THREE.Vector2();

export class PeakAura {
  /** Attach to the character's body frame (follows mirroring/scale). */
  readonly group = new THREE.Group();
  private readonly points: THREE.Points;
  private readonly halo: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;
  private readonly haloMat: THREE.ShaderMaterial;
  private readonly glowMats: THREE.MeshStandardMaterial[];
  /** Each material's own emissive, restored when the aura fades out. */
  private readonly baseEmissive: THREE.Color[];
  private on = false;
  private level = 0;
  private time = 0;

  constructor(quality: QualitySettings, glowMats: THREE.MeshStandardMaterial[], bodyScale: number) {
    this.glowMats = glowMats;
    this.baseEmissive = glowMats.map((m) => m.emissive.clone());
    const n = Math.max(18, Math.round(90 * quality.particles));
    const seeds = new Float32Array(n * 4);
    // Deterministic pseudo-random seeds (no Math.random in render setup).
    let h = 0x9e3779b9;
    const rnd = (): number => {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      return ((h >>> 0) % 10000) / 10000;
    };
    for (let i = 0; i < n * 4; i += 4) {
      seeds[i] = rnd() * Math.PI * 2;
      seeds[i + 1] = rnd();
      seeds[i + 2] = rnd();
      seeds[i + 3] = rnd();
    }
    const g = new THREE.BufferGeometry();
    // Positions are computed in the shader; the attribute only sizes the draw.
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.6);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 400 },
        uSize: { value: 0.07 * bodyScale },
        uHeight: { value: 2.0 },
        uRadius: { value: 0.5 },
        uColor: { value: GOLD.clone() },
        uIntensity: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.renderOrder = 8;
    const mat = this.mat;
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      const cam = camera as THREE.PerspectiveCamera;
      if (!cam.isPerspectiveCamera) return;
      renderer.getDrawingBufferSize(drawSize);
      mat.uniforms.uScale!.value = drawSize.y / (2 * Math.tan((cam.fov * Math.PI) / 360));
    };
    this.haloMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: GOLD.clone() }, uIntensity: { value: 0 }, uTime: { value: 0 } },
      vertexShader: HALO_VERT,
      fragmentShader: HALO_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), this.haloMat);
    this.halo.rotation.x = -Math.PI / 2;
    this.halo.position.y = 0.012;
    this.halo.renderOrder = 7;
    this.group.add(this.halo, this.points);
    this.group.visible = false;
  }

  set(on: boolean): void {
    this.on = on;
    if (on) this.group.visible = true;
  }

  /** Forces the visible state (shader warm-up) without animating. */
  forceVisible(v: boolean): void {
    this.group.visible = v || this.level > 0;
    this.mat.uniforms.uIntensity!.value = v ? 1 : this.level;
    this.haloMat.uniforms.uIntensity!.value = v ? 1 : this.level;
  }

  update(dt: number): void {
    if (!this.on && this.level === 0) return;
    this.time += dt;
    this.level = this.on ? Math.min(1, this.level + dt * 2.5) : Math.max(0, this.level - dt * 1.6);
    const k = this.level * this.level * (3 - 2 * this.level);
    this.mat.uniforms.uTime!.value = this.time;
    this.mat.uniforms.uIntensity!.value = k;
    this.haloMat.uniforms.uTime!.value = this.time;
    this.haloMat.uniforms.uIntensity!.value = k;
    // Warm rim-like pulse through the emissive channel (no shader recompile).
    const pulse = k * (0.16 + 0.08 * Math.sin(this.time * 4.0));
    this.glowMats.forEach((m, i) => m.emissive.copy(EMISSIVE).multiplyScalar(pulse).add(this.baseEmissive[i]!));
    if (this.level === 0) {
      this.group.visible = false;
      this.glowMats.forEach((m, i) => m.emissive.copy(this.baseEmissive[i]!));
    }
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.mat.dispose();
    this.halo.geometry.dispose();
    this.haloMat.dispose();
  }
}
