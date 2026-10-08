import * as THREE from 'three';
import type { QualitySettings, StadiumDef } from '../../contracts';
import { seeded } from '../textures';

/** Lighting/sky recipe for a ballpark (time of day + per-park mood). */
export interface Atmosphere {
  skyTop: string;
  skyHorizon: string;
  skyBottom: string;
  /** Direction TOWARD the sun/key light (normalized in code). */
  sunDir: [number, number, number];
  sunColor: string;
  /** Visible sun disc (day/sunset). */
  sunDisc: boolean;
  keyColor: string;
  keyIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  clouds: number;
  stars: boolean;
  night: boolean;
  bloom: number;
  exposure: number;
  /** Lamps on the light towers are lit. */
  lampsOn: boolean;
}

export function atmosphereFor(def: StadiumDef): Atmosphere {
  switch (def.id) {
    case 'solar':
      return { skyTop: '#2a66d0', skyHorizon: '#c4e3f8', skyBottom: '#9cb98a', sunDir: [-0.45, 0.78, -0.42], sunColor: '#fff2d6', sunDisc: true, keyColor: '#fff3df', keyIntensity: 2.7, hemiSky: '#d6ecff', hemiGround: '#6b7f3c', hemiIntensity: 1.0, fogColor: '#c9e2f2', fogNear: 220, fogFar: 1500, clouds: 0.55, stars: false, night: false, bloom: 0.1, exposure: 1.0, lampsOn: false };
    case 'malecon':
      return { skyTop: '#1b2452', skyHorizon: '#ff9a52', skyBottom: '#3a2a3a', sunDir: [0.62, 0.2, 0.76], sunColor: '#ffb066', sunDisc: true, keyColor: '#ffc08a', keyIntensity: 3.0, hemiSky: '#c3a6e0', hemiGround: '#6a4a44', hemiIntensity: 1.25, fogColor: '#e08a6c', fogNear: 220, fogFar: 1900, clouds: 0.7, stars: false, night: false, bloom: 0.32, exposure: 1.12, lampsOn: true };
    case 'metro':
      return { skyTop: '#03050d', skyHorizon: '#16244a', skyBottom: '#05070c', sunDir: [0.12, 0.85, -0.5], sunColor: '#e8efff', sunDisc: false, keyColor: '#edf2ff', keyIntensity: 2.5, hemiSky: '#3b4c7a', hemiGround: '#0e1712', hemiIntensity: 0.65, fogColor: '#111c38', fogNear: 220, fogFar: 1400, clouds: 0.0, stars: true, night: true, bloom: 0.75, exposure: 1.0, lampsOn: true };
    case 'cumbre':
      return { skyTop: '#1450c0', skyHorizon: '#b4d4f2', skyBottom: '#8aa38a', sunDir: [0.5, 0.72, -0.35], sunColor: '#fff8ec', sunDisc: true, keyColor: '#fff7ee', keyIntensity: 2.9, hemiSky: '#cfe4ff', hemiGround: '#5f6f4a', hemiIntensity: 1.0, fogColor: '#bcd6ee', fogNear: 300, fogFar: 3200, clouds: 0.35, stars: false, night: false, bloom: 0.08, exposure: 1.0, lampsOn: false };
    case 'final':
      return { skyTop: '#05030f', skyHorizon: '#2a1458', skyBottom: '#06040c', sunDir: [-0.1, 0.85, -0.5], sunColor: '#f2e8ff', sunDisc: false, keyColor: '#f1eeff', keyIntensity: 2.6, hemiSky: '#4b3a7a', hemiGround: '#0f0f14', hemiIntensity: 0.7, fogColor: '#1b1238', fogNear: 220, fogFar: 1400, clouds: 0.0, stars: true, night: true, bloom: 0.85, exposure: 1.0, lampsOn: true };
  }
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w * 0.99999; // keep the dome at the far plane
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunDisc;
uniform float uClouds;
uniform float uTime;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h >= 0.0
    ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55))
    : mix(uHorizon, uBottom, clamp(-h * 6.0, 0.0, 1.0));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  // Warm glow around the sun (strong near the horizon at sunset).
  col += uSunColor * (pow(s, 6.0) * 0.28 + pow(s, 48.0) * 0.4) * (0.4 + uSunDisc * 0.6);
  col += uSunColor * smoothstep(0.9993, 0.9997, s) * 3.0 * uSunDisc;
  // Flat cloud layer projected on the dome.
  if (uClouds > 0.0 && h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.004, 0.0);
    float c = smoothstep(0.52, 0.85, fbm(uv));
    vec3 cloudCol = mix(vec3(1.0), uSunColor, 0.35) * (0.85 + 0.25 * pow(s, 4.0));
    col = mix(col, cloudCol, c * uClouds * smoothstep(0.0, 0.18, h));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface SkyView {
  group: THREE.Group;
  update(elapsed: number): void;
  dispose(): void;
}

export function createSky(atm: Atmosphere, quality: QualitySettings): SkyView {
  const group = new THREE.Group();
  group.name = 'sky';
  const uniforms = {
    uTop: { value: new THREE.Color(atm.skyTop) },
    uHorizon: { value: new THREE.Color(atm.skyHorizon) },
    uBottom: { value: new THREE.Color(atm.skyBottom) },
    uSunDir: { value: new THREE.Vector3(...atm.sunDir).normalize() },
    uSunColor: { value: new THREE.Color(atm.sunColor) },
    uSunDisc: { value: atm.sunDisc ? 1 : 0 },
    uClouds: { value: quality.tier === 'low' ? atm.clouds * 0.6 : atm.clouds },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 24), mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  let stars: THREE.Points | null = null;
  if (atm.stars) {
    const rnd = seeded(99);
    const n = quality.tier === 'low' ? 700 : 1800;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = rnd() * Math.PI * 2;
      const y = 0.08 + rnd() * 0.92;
      const r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(u) * r * 2200;
      pos[i * 3 + 1] = y * 2200;
      pos[i * 3 + 2] = Math.sin(u) * r * 2200;
      size[i] = 1 + rnd() * 2.2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const sm = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float size; uniform float uTime; varying float vA;
        void main() {
          vA = 0.55 + 0.45 * sin(uTime * 1.3 + position.x * 0.37 + position.z * 0.11);
          gl_PointSize = size;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), smoothstep(0.5, 0.1, d) * vA);
        }`,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    stars = new THREE.Points(g, sm);
    stars.frustumCulled = false;
    stars.renderOrder = -9;
    group.add(stars);
  }

  return {
    group,
    update(elapsed) {
      uniforms.uTime.value = elapsed;
      if (stars) (stars.material as THREE.ShaderMaterial).uniforms.uTime!.value = elapsed;
    },
    dispose() {
      dome.geometry.dispose();
      mat.dispose();
      if (stars) {
        stars.geometry.dispose();
        (stars.material as THREE.Material).dispose();
      }
    },
  };
}
