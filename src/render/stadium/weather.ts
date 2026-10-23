import * as THREE from 'three';
import type { QualitySettings } from '../../contracts';
import { seeded } from '../textures';

/**
 * Constant rain over the park (Southampton): thin slanted streaks falling in
 * a box around the play area, animated entirely in the vertex shader. Streaks
 * fade with distance from the camera so the far field stays readable.
 */
export interface Rain {
  points: THREE.LineSegments;
  update(elapsed: number): void;
  dispose(): void;
}

const BOX = { x0: -70, x1: 70, z0: -40, z1: 150, height: 55 };
const FALL_SPEED = 17;
const STREAK = 0.55;

export function createRain(quality: QualitySettings): Rain {
  const n = quality.tier === 'low' ? 2500 : quality.tier === 'medium' ? 5000 : 8000;
  const rnd = seeded(4242);
  const pos = new Float32Array(n * 6);
  const end = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = BOX.x0 + rnd() * (BOX.x1 - BOX.x0);
    const y = rnd() * BOX.height;
    const z = BOX.z0 + rnd() * (BOX.z1 - BOX.z0);
    pos.set([x, y, z, x, y, z], i * 6);
    // 0 = head of the streak, 1 = tail.
    end[i * 2] = 0;
    end[i * 2 + 1] = 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('tail', new THREE.BufferAttribute(end, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, BOX.height / 2, (BOX.z0 + BOX.z1) / 2), 140);
  const uniforms = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float tail;
      uniform float uTime;
      varying float vA;
      void main() {
        vec3 p = position;
        float ph = fract(sin(dot(p.xz, vec2(12.9898, 78.233))) * 43758.5453);
        float speed = ${FALL_SPEED.toFixed(1)} * (0.85 + 0.3 * ph);
        p.y = mod(p.y - uTime * speed, ${BOX.height.toFixed(1)});
        p.y += tail * ${STREAK.toFixed(2)};
        // A little wind from the sea: the drops drift sideways as they fall, so the streaks lean.
        p.x -= p.y * 0.18;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        vA = (1.0 - tail * 0.7) * smoothstep(0.6, 3.0, d) * (1.0 - smoothstep(35.0, 90.0, d));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        gl_FragColor = vec4(0.82, 0.86, 0.9, vA * 0.42);
      }`,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const points = new THREE.LineSegments(g, mat);
  points.name = 'rain';
  points.renderOrder = 3;
  return {
    points,
    update(elapsed) {
      uniforms.uTime.value = elapsed;
    },
    dispose() {
      g.dispose();
      mat.dispose();
    },
  };
}
