import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { QualitySettings, StadiumDef } from '../../contracts';
import { DEG } from '../../config/constants';
import { fenceDistance, polarToXZ } from '../../sim/field';
import { canvasTexture, makeCanvas, seeded, textTexture } from '../textures';
import { MeshBuilder, chalkLine } from './geom';

/**
 * El Mati's gym (Iron Paradise): the park is an indoor hall. A round wall with
 * a mirror band and murals, a roof of steel trusses with strip lights, rubber
 * tile lines and a logo painted on the floor, gym equipment all around the
 * outfield (racks, benches, treadmills, cable towers, dumbbells, kettlebells,
 * plates...), two golden statues of Ronnie Coleman flexing behind the stands,
 * banners with his catchphrases and heavy bags that swing. Pure decoration:
 * the ball flies through all of it. Static props are merged into one mesh per
 * material, so the whole gym costs a dozen draw calls.
 */
export interface Gym {
  group: THREE.Group;
  update(elapsed: number): void;
  dispose(): void;
}

const HALL_R = 230;
const HALL_H = 82;

type MatKey = 'iron' | 'steel' | 'chrome' | 'black' | 'rubber' | 'red' | 'yellow' | 'blue' | 'pad' | 'redpad' | 'plateRed' | 'plateBlue' | 'plateYellow' | 'plateGreen' | 'wood' | 'screen' | 'gold' | 'stone' | 'mirror' | 'beam' | 'lamp';

const MATS: Record<MatKey, THREE.MeshStandardMaterialParameters> = {
  iron: { color: '#2a2c31', roughness: 0.45, metalness: 0.5 },
  steel: { color: '#9aa1a9', roughness: 0.4, metalness: 0.45 },
  chrome: { color: '#d3d7dc', roughness: 0.22, metalness: 0.6 },
  black: { color: '#17181b', roughness: 0.7, metalness: 0.2 },
  rubber: { color: '#0e0e10', roughness: 0.95 },
  red: { color: '#b3221f', roughness: 0.5, metalness: 0.25 },
  yellow: { color: '#ffc21a', roughness: 0.5, metalness: 0.2 },
  blue: { color: '#2b5bd7', roughness: 0.5, metalness: 0.2 },
  pad: { color: '#202226', roughness: 0.85 },
  redpad: { color: '#8f1d22', roughness: 0.85 },
  plateRed: { color: '#c0261f', roughness: 0.5, metalness: 0.35 },
  plateBlue: { color: '#2456c9', roughness: 0.5, metalness: 0.35 },
  plateYellow: { color: '#e8b923', roughness: 0.5, metalness: 0.35 },
  plateGreen: { color: '#2e8b4a', roughness: 0.5, metalness: 0.35 },
  wood: { color: '#c9955b', roughness: 0.8 },
  screen: { color: '#0b1220', roughness: 0.3, emissive: '#2d7dd2', emissiveIntensity: 0.9 },
  gold: { color: '#d9ac3b', roughness: 0.35, metalness: 0.35, emissive: '#4a3306', emissiveIntensity: 0.8 },
  stone: { color: '#3d4048', roughness: 0.9 },
  mirror: { color: '#b9d3e4', roughness: 0.08, metalness: 0.5, emissive: '#25384a', emissiveIntensity: 0.6 },
  beam: { color: '#32363d', roughness: 0.6, metalness: 0.5 },
  lamp: { color: '#fff1d6', roughness: 0.5, emissive: '#fff1d6', emissiveIntensity: 1 },
};

/** Collects transformed primitives and merges them into one mesh per material. */
class Batch {
  private readonly parts = new Map<MatKey, THREE.BufferGeometry[]>();
  private readonly templates = new Map<string, THREE.BufferGeometry>();

  template(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.templates.get(key);
    if (!g) {
      g = make();
      this.templates.set(key, g);
    }
    return g;
  }

  add(mat: MatKey, tpl: THREE.BufferGeometry, m: THREE.Matrix4): void {
    const g = tpl.index ? tpl.toNonIndexed() : tpl.clone();
    g.applyMatrix4(m);
    let list = this.parts.get(mat);
    if (!list) {
      list = [];
      this.parts.set(mat, list);
    }
    list.push(g);
  }

  build(mats: Map<MatKey, THREE.Material>, shadows: boolean): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [key, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mats.get(key)!);
      mesh.castShadow = shadows && key !== 'lamp';
      mesh.receiveShadow = false;
      out.push(mesh);
    }
    this.parts.clear();
    this.templates.forEach((g) => g.dispose());
    this.templates.clear();
    return out;
  }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** A local frame (position, yaw, scale) for placing primitives in real-world metres. */
class Rig {
  constructor(
    private readonly batch: Batch,
    private readonly base: THREE.Matrix4,
  ) {}

  child(x: number, y: number, z: number, yaw = 0, scale = 1): Rig {
    _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw), _s.set(scale, scale, scale));
    return new Rig(this.batch, new THREE.Matrix4().multiplyMatrices(this.base, _m));
  }

  private put(mat: MatKey, geo: THREE.BufferGeometry, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number): void {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    this.batch.add(mat, geo, new THREE.Matrix4().multiplyMatrices(this.base, _m));
  }

  box(mat: MatKey, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
    this.put(mat, this.batch.template('box', () => new THREE.BoxGeometry(1, 1, 1)), x, y, z, rx, ry, rz, w, h, d);
  }

  /** Cylinder along local Y (rz = π/2 lays it along X, rx = π/2 along Z). */
  cyl(mat: MatKey, rt: number, rb: number, h: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, seg = 10, sx = 1, sz = 1): void {
    const key = `cyl:${rt.toFixed(3)}:${rb.toFixed(3)}:${seg}`;
    this.put(mat, this.batch.template(key, () => new THREE.CylinderGeometry(rt, rb, 1, seg)), x, y, z, rx, ry, rz, sx, h, sz);
  }

  /** Weight plate / disc with its axis along local X. */
  disc(mat: MatKey, r: number, thick: number, x: number, y: number, z: number): void {
    this.cyl(mat, r, r, thick, x, y, z, 0, 0, Math.PI / 2, 16);
  }

  ball(mat: MatKey, r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): void {
    this.put(mat, this.batch.template('ball', () => new THREE.SphereGeometry(1, 10, 7)), x, y, z, 0, 0, 0, r * sx, r * sy, r * sz);
  }

  ring(mat: MatKey, R: number, tube: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
    const key = `ring:${R.toFixed(3)}:${tube.toFixed(3)}`;
    this.put(mat, this.batch.template(key, () => new THREE.TorusGeometry(R, tube, 6, 18)), x, y, z, rx, ry, rz, 1, 1, 1);
  }
}

// ───────────────────────────── Equipment (real-world metres, front = +Z) ─────────────────────────────

function barbell(r: Rig, y: number, z: number, len: number, plates: MatKey[]): void {
  r.cyl('chrome', 0.014, 0.014, len, 0, y, z, 0, 0, Math.PI / 2, 8);
  for (const side of [-1, 1]) {
    r.cyl('steel', 0.025, 0.025, 0.4, side * (len / 2 - 0.2), y, z, 0, 0, Math.PI / 2, 8);
    plates.forEach((p, i) => r.disc(p, 0.225 - i * 0.03, 0.045, side * (len / 2 - 0.13 - i * 0.055), y, z));
  }
}

function powerRack(r: Rig): void {
  for (const sx of [-0.7, 0.7]) for (const sz of [-0.6, 0.6]) r.box('red', 0.08, 2.3, 0.08, sx, 1.15, sz);
  for (const sz of [-0.6, 0.6]) r.box('red', 1.5, 0.08, 0.08, 0, 2.28, sz);
  for (const sx of [-0.7, 0.7]) r.box('red', 0.08, 0.08, 1.2, sx, 2.28, 0);
  r.cyl('chrome', 0.017, 0.017, 1.5, 0, 2.18, -0.6, 0, 0, Math.PI / 2, 8);
  for (const sx of [-0.7, 0.7]) {
    r.box('black', 0.1, 0.1, 0.1, sx, 1.4, 0.55);
    r.box('black', 0.06, 0.06, 1.2, sx, 0.62, 0);
  }
  barbell(r, 1.5, 0.55, 2.2, ['plateRed', 'plateBlue', 'plateYellow']);
  r.box('rubber', 2.4, 0.04, 1.8, 0, 0.02, 0.1);
}

function benchPress(r: Rig): void {
  r.box('pad', 0.32, 0.12, 1.25, 0, 0.45, 0);
  r.box('black', 0.06, 0.4, 0.06, 0, 0.2, 0.5);
  r.box('black', 0.06, 0.4, 0.06, 0, 0.2, -0.5);
  r.box('black', 0.5, 0.05, 0.05, 0, 0.03, 0.5);
  for (const sx of [-0.55, 0.55]) {
    r.box('blue', 0.07, 1.35, 0.07, sx, 0.67, -0.6);
    r.box('black', 0.1, 0.1, 0.5, sx, 0.05, -0.6);
    r.box('black', 0.1, 0.07, 0.1, sx, 1.25, -0.6);
  }
  barbell(r, 1.28, -0.6, 2.2, ['plateBlue', 'plateRed', 'plateGreen']);
  // Weight tree beside it.
  for (const k of [0, 1, 2]) r.disc(k === 1 ? 'plateYellow' : 'plateRed', 0.2, 0.04, 1.5 + k * 0.05, 0.25, -0.4);
  r.cyl('iron', 0.025, 0.025, 0.9, 1.52, 0.45, -0.4);
  r.box('rubber', 2.6, 0.04, 2.2, 0, 0.02, 0);
}

function treadmill(r: Rig): void {
  r.box('black', 0.95, 0.18, 1.9, 0, 0.26, 0);
  r.box('rubber', 0.72, 0.03, 1.7, 0, 0.36, 0);
  for (const sx of [-0.42, 0.42]) r.box('steel', 0.06, 0.05, 1.8, sx, 0.4, 0);
  for (const sx of [-0.45, 0.45]) {
    r.box('black', 0.06, 1.15, 0.06, sx, 0.95, 0.85, -0.12, 0, 0);
    r.box('black', 0.05, 0.05, 0.8, sx, 1.2, 0.5);
  }
  r.box('black', 0.7, 0.28, 0.12, 0, 1.38, 0.9, -0.5, 0, 0);
  r.box('screen', 0.5, 0.18, 0.02, 0, 1.4, 0.84, -0.5, 0, 0);
  r.box('screen', 0.5, 0.18, 0.02, 0, 1.38, 0.96, -0.5, 0, 0);
}

function elliptical(r: Rig): void {
  r.box('black', 0.62, 0.14, 1.6, 0, 0.12, 0);
  r.box('iron', 0.62, 0.55, 0.45, 0, 0.5, -0.65);
  r.ring('steel', 0.2, 0.03, 0, 0.55, -0.88, 0, Math.PI / 2, 0);
  for (const sx of [-0.2, 0.2]) {
    r.box('steel', 0.05, 0.05, 0.9, sx, 0.3, -0.1, 0.1, 0, 0);
    r.box('pad', 0.22, 0.04, 0.3, sx, 0.34, 0.25);
    r.box('black', 0.05, 1.6, 0.05, sx * 1.35, 1.0, 0.65, -0.28, 0, 0);
  }
  r.box('black', 0.5, 0.26, 0.1, 0, 1.78, 0.95, -0.4, 0, 0);
  r.box('screen', 0.4, 0.17, 0.02, 0, 1.79, 0.9, -0.4, 0, 0);
}

function cableCrossover(r: Rig): void {
  for (const sx of [-1.9, 1.9]) {
    r.box('steel', 0.14, 2.5, 0.14, sx, 1.25, 0);
    r.box('black', 0.5, 0.06, 0.5, sx, 0.03, 0);
    r.box('iron', 0.42, 1.7, 0.36, sx, 0.9, -0.28);
    for (let k = 0; k < 5; k++) r.box('plateRed', 0.38, 0.05, 0.32, sx, 0.25 + k * 0.28, -0.28);
    r.cyl('black', 0.012, 0.012, 1.9, sx * 0.9, 1.35, 0.1, 0, 0, sx > 0 ? -0.9 : 0.9, 6);
    r.ring('chrome', 0.07, 0.012, sx * 0.1, 0.45, 0.1, Math.PI / 2, 0, 0);
  }
  r.box('steel', 4.0, 0.14, 0.14, 0, 2.5, 0);
  r.box('red', 4.2, 0.2, 0.2, 0, 2.62, 0);
}

function legPress(r: Rig): void {
  r.box('black', 1.2, 0.1, 2.9, 0, 0.05, 0);
  for (const sx of [-0.45, 0.45]) r.box('steel', 0.08, 0.08, 2.9, sx, 0.9, 0, -0.62, 0, 0);
  r.box('pad', 0.55, 0.12, 0.75, 0, 0.55, -0.9, -0.3, 0, 0);
  r.box('pad', 0.55, 0.65, 0.12, 0, 0.9, -1.25, 0.35, 0, 0);
  r.box('iron', 1.05, 0.9, 0.08, 0, 1.55, 0.5, -0.62, 0, 0);
  for (const sx of [-0.55, 0.55]) for (let k = 0; k < 4; k++) r.disc(k % 2 ? 'plateBlue' : 'plateRed', 0.22, 0.05, sx + (sx > 0 ? 0.05 * k : -0.05 * k), 1.55 - 0.03 * k, 0.5);
}

function latPulldown(r: Rig): void {
  r.box('black', 1.1, 0.08, 1.7, 0, 0.04, 0);
  for (const sx of [-0.5, 0.5]) r.box('steel', 0.07, 2.3, 0.07, sx, 1.15, 0.5);
  r.box('steel', 1.1, 0.08, 0.08, 0, 2.3, 0.5);
  r.box('iron', 0.5, 1.9, 0.4, 0, 1.0, 0.82);
  for (let k = 0; k < 7; k++) r.box('plateYellow', 0.46, 0.05, 0.36, 0, 0.2 + k * 0.24, 0.82);
  r.box('pad', 0.4, 0.1, 0.4, 0, 0.5, 0.1);
  for (const sx of [-0.24, 0.24]) r.box('pad', 0.1, 0.1, 0.4, sx, 0.8, 0.28);
  r.cyl('black', 0.012, 0.012, 1.2, 0, 1.7, 0.5, 0, 0, 0, 6);
  r.box('chrome', 1.2, 0.04, 0.04, 0, 1.1, 0.5);
}

function smithMachine(r: Rig): void {
  r.box('black', 2.6, 0.06, 1.4, 0, 0.03, 0);
  for (const sx of [-1.1, 1.1]) {
    r.box('steel', 0.08, 2.5, 0.08, sx, 1.25, -0.2);
    r.box('red', 0.12, 0.12, 0.6, sx, 0.1, 0.1);
  }
  r.box('steel', 2.4, 0.1, 0.1, 0, 2.5, -0.2);
  r.box('chrome', 2.4, 0.04, 0.04, 0, 1.4, -0.2);
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) r.disc(k === 1 ? 'plateBlue' : 'plateRed', 0.22 - k * 0.02, 0.05, sx * (1.0 + 0.06 * k), 1.4, -0.2);
  r.box('pad', 0.36, 0.12, 1.2, 0, 0.45, -0.2);
}

function dumbbellRack(r: Rig): void {
  for (const sx of [-1.4, 1.4]) for (const sz of [-0.3, 0.3]) r.box('iron', 0.06, 1.2, 0.06, sx, 0.6, sz);
  for (const [y, tilt] of [[0.7, 0.12], [1.15, 0.12]] as const) {
    r.box('steel', 3.0, 0.05, 0.62, 0, y, 0, tilt, 0, 0);
    for (let k = 0; k < 10; k++) {
      const x = -1.35 + k * 0.3;
      const hr = 0.05 + (k + (y > 1 ? 10 : 0)) * 0.0045;
      r.cyl('chrome', 0.016, 0.016, 0.3, x, y + 0.1, 0.02, 0, 0, Math.PI / 2, 6);
      r.cyl('iron', hr, hr, 0.08, x, y + 0.1, 0.18, 0, 0, 0, 6, 1, 1);
      r.cyl('iron', hr, hr, 0.08, x, y + 0.1, -0.14, 0, 0, 0, 6, 1, 1);
    }
  }
  r.box('black', 3.1, 0.05, 0.7, 0, 0.03, 0);
}

function kettlebells(r: Rig): void {
  const kinds: [MatKey, number][] = [['yellow', 0.12], ['blue', 0.15], ['red', 0.17], ['black', 0.2], ['plateGreen', 0.14]];
  kinds.forEach(([m, rad], i) => {
    const x = (i - 2) * 0.5;
    r.ball(m, rad, x, rad, 0);
    r.ring('iron', rad * 0.6, 0.025, x, rad * 1.9, 0, 0, 0, 0);
  });
  r.box('rubber', 3.0, 0.03, 0.8, 0, 0.015, 0);
}

function plateTree(r: Rig): void {
  r.box('black', 0.7, 0.06, 0.7, 0, 0.03, 0);
  r.cyl('iron', 0.04, 0.04, 1.5, 0, 0.75, 0, 0, 0, 0, 8);
  const cols: MatKey[] = ['plateRed', 'plateBlue', 'plateYellow', 'plateGreen'];
  for (let k = 0; k < 4; k++) {
    const y = 0.35 + k * 0.32;
    r.cyl('iron', 0.02, 0.02, 0.9, 0, y, 0, 0, 0, Math.PI / 2, 6);
    for (const sx of [-1, 1]) for (let j = 0; j < 3; j++) r.disc(cols[(k + j) % 4]!, 0.2 - j * 0.015, 0.045, sx * (0.12 + j * 0.055), y, 0);
  }
}

function giantPlates(r: Rig): void {
  // Oversized plates leaning on each other.
  const cols: MatKey[] = ['plateRed', 'plateBlue', 'plateYellow'];
  cols.forEach((c, i) => {
    const R = 1.0 - i * 0.12;
    r.cyl(c, R, R, 0.2, -1.1 + i * 1.1, R * 0.92, 0, 0.2 - i * 0.1, 0, Math.PI / 2 + (i - 1) * 0.08, 20);
    r.cyl('black', 0.16, 0.16, 0.22, -1.1 + i * 1.1, R * 0.92, 0, 0.2 - i * 0.1, 0, Math.PI / 2 + (i - 1) * 0.08, 10);
  });
}

function plyoBoxes(r: Rig): void {
  r.box('wood', 1.0, 0.9, 0.8, -0.6, 0.45, 0);
  r.box('wood', 0.8, 0.7, 0.65, 0.5, 0.35, 0.1);
  r.box('wood', 0.6, 0.5, 0.5, 0.5, 0.95, 0.1);
  r.box('yellow', 1.02, 0.08, 0.82, -0.6, 0.9, 0);
  r.box('yellow', 0.82, 0.08, 0.67, 0.5, 0.7, 0.1);
}

function tires(r: Rig): void {
  r.ring('rubber', 0.55, 0.25, 0, 0.25, 0, Math.PI / 2, 0, 0);
  r.ring('rubber', 0.5, 0.23, 1.5, 0.23, 0.3, Math.PI / 2, 0, 0);
  r.ring('rubber', 0.5, 0.23, 1.5, 0.66, 0.3, Math.PI / 2, 0, 0);
  r.ring('rubber', 0.58, 0.25, 0.8, 0.9, -0.7, 1.2, 0, 0.4);
  r.box('red', 0.5, 0.1, 0.5, -1.4, 0.05, 0.3);
  r.cyl('iron', 0.1, 0.1, 1.3, -1.4, 0.6, 0.3);
  r.box('iron', 0.7, 0.18, 0.28, -1.4, 1.25, 0.3);
}

function battleRopes(r: Rig): void {
  r.cyl('iron', 0.1, 0.1, 0.5, 0, 0.25, -1.4, 0, 0, 0, 10);
  for (const [off, col] of [[-0.12, 'black'], [0.12, 'red']] as const) {
    for (let k = 0; k < 14; k++) {
      const z = -1.3 + k * 0.28;
      r.cyl(col, 0.035, 0.035, 0.34, off + Math.sin(k * 0.9) * 0.28, 0.06 + Math.abs(Math.sin(k * 0.9)) * 0.1, z, Math.PI / 2, 0, Math.sin(k * 0.9) * 0.5, 6);
    }
  }
}

function mirrorStand(r: Rig): void {
  r.box('black', 3.2, 2.2, 0.1, 0, 1.2, 0);
  r.box('mirror', 3.0, 2.0, 0.05, 0, 1.2, 0.05);
  r.box('black', 0.1, 0.1, 0.9, -1.4, 0.05, -0.4);
  r.box('black', 0.1, 0.1, 0.9, 1.4, 0.05, -0.4);
}

function pullupRig(r: Rig): void {
  for (const sx of [-3.2, 0, 3.2]) for (const sz of [-0.6, 0.6]) r.box('red', 0.12, 3.0, 0.12, sx, 1.5, sz);
  for (const sz of [-0.6, 0.6]) r.box('red', 6.6, 0.12, 0.12, 0, 3.0, sz);
  r.cyl('chrome', 0.02, 0.02, 6.4, 0, 2.9, 0, 0, 0, Math.PI / 2, 8);
  r.cyl('chrome', 0.02, 0.02, 6.4, 0, 2.5, -0.6, 0, 0, Math.PI / 2, 8);
  for (const sx of [-1.4, -0.8]) {
    r.box('black', 0.04, 1.3, 0.02, sx, 2.25, 0);
    r.ring('black', 0.12, 0.018, sx, 1.55, 0, 0, Math.PI / 2, 0);
  }
  for (const sx of [1.6, 2.2, 2.8]) r.box('yellow', 0.05, 0.05, 1.2, sx, 2.9, 0);
  r.box('rubber', 6.8, 0.04, 2, 0, 0.02, 0);
}

/** Posts and beam of the heavy-bag rig (the bags themselves hang from animated pivots). */
function bagRigFrame(r: Rig): void {
  for (const sx of [-2.4, 2.4]) {
    r.box('iron', 0.14, 2.8, 0.14, sx, 1.4, 0);
    r.box('iron', 0.14, 0.14, 1.4, sx, 0.07, 0);
  }
  r.box('iron', 5.2, 0.16, 0.16, 0, 2.8, 0);
  r.box('red', 5.0, 0.05, 0.2, 0, 2.9, 0);
}

/** Front double biceps: the golden Ronnie Coleman statue on its pedestal (y = 0 at the ground). */
function statue(r: Rig): void {
  const P = 0.65;
  r.box('stone', 2.0, P, 1.5, 0, P / 2, 0);
  r.box('yellow', 2.04, 0.06, 1.54, 0, P, 0);
  const f = r.child(0, P + 0.03, 0);
  // Legs and posing trunks.
  for (const sx of [-1, 1]) {
    f.cyl('gold', 0.13, 0.1, 0.5, sx * 0.19, 0.62, 0, 0, 0, sx * 0.05, 8);
    f.cyl('gold', 0.09, 0.07, 0.45, sx * 0.23, 0.22, 0, 0, 0, sx * 0.03, 8);
    f.box('gold', 0.14, 0.06, 0.3, sx * 0.24, 0.03, 0.06);
  }
  f.box('blue', 0.58, 0.26, 0.34, 0, 0.92, 0);
  // Torso: V taper, pecs, abs, lats.
  f.cyl('gold', 0.34, 0.2, 0.62, 0, 1.3, 0, 0, 0, 0, 8, 1.45, 0.7);
  for (const sx of [-1, 1]) {
    f.ball('gold', 0.2, sx * 0.17, 1.46, 0.09, 1, 0.75, 0.7);
    f.ball('gold', 0.18, sx * 0.4, 1.28, -0.04, 0.6, 1.5, 0.8);
    f.ball('gold', 0.15, sx * 0.5, 1.58, 0);
    f.ball('gold', 0.13, sx * 0.13, 1.7, -0.02, 1.2, 0.6, 1);
    // Double biceps: upper arm out, forearm up, peaked biceps and a fist.
    f.cyl('gold', 0.13, 0.12, 0.42, sx * 0.72, 1.58, 0, 0, 0, Math.PI / 2, 8);
    f.ball('gold', 0.15, sx * 0.76, 1.66, 0.02, 1, 0.9, 1);
    f.cyl('gold', 0.1, 0.12, 0.42, sx * 0.93, 1.8, 0, 0, 0, sx * -0.12, 8);
    f.ball('gold', 0.1, sx * 0.97, 2.04, 0.02);
  }
  for (let row = 0; row < 3; row++) for (const sx of [-1, 1]) f.box('gold', 0.1, 0.07, 0.04, sx * 0.065, 1.0 + row * 0.1, 0.19);
  // Neck and head (shaved, goatee).
  f.cyl('gold', 0.09, 0.1, 0.14, 0, 1.66, 0, 0, 0, 0, 8);
  f.ball('gold', 0.14, 0, 1.84, 0.01, 1, 1.08, 1);
  f.box('gold', 0.08, 0.1, 0.05, 0, 1.73, 0.12);
}

// ───────────────────────────── Hall ─────────────────────────────

/** Painted wall: a dark padded base, a mirror band, a concrete mural zone and a yellow stripe under the roof. */
function hallWallTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = 700;
  const [c, ctx] = makeCanvas(W, H);
  const rnd = seeded(77);
  // From the bottom (v = 0) up: base, mirror, mural, stripe, dark top.
  const y = (v: number): number => H * (1 - v);
  ctx.fillStyle = '#1b1c20';
  ctx.fillRect(0, 0, W, H);
  // Concrete grain.
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.035})`;
    ctx.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 5, 1);
  }
  // Mirror band with vertical frames and diagonal glints.
  const mg = ctx.createLinearGradient(0, y(0.36), 0, y(0.07));
  mg.addColorStop(0, '#9fb7c7');
  mg.addColorStop(1, '#5d7384');
  ctx.fillStyle = mg;
  ctx.fillRect(0, y(0.36), W, y(0.07) - y(0.36));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y(0.36), W, y(0.07) - y(0.36));
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  for (let x = -200; x < W; x += 170) {
    ctx.beginPath();
    ctx.moveTo(x, y(0.07));
    ctx.lineTo(x + 70, y(0.07));
    ctx.lineTo(x + 70 + 150, y(0.36));
    ctx.lineTo(x + 150, y(0.36));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = '#0f1013';
  for (let x = 0; x < W; x += 128) ctx.fillRect(x, y(0.36), 6, y(0.07) - y(0.36));
  ctx.fillRect(0, y(0.37), W, 8);
  ctx.fillRect(0, y(0.07), W, 8);
  // Mural zone: big stencilled words.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(H * 0.15)}px "Barlow Condensed", Impact, "Arial Narrow", sans-serif`;
  const words: [string, string][] = [
    ['NO PAIN NO GAIN', '#ffc21a'],
    ['YEAH BUDDY', '#e8e4d8'],
    ['LIGHTWEIGHT BABY', '#c0261f'],
    ['IRON PARADISE', '#ffc21a'],
  ];
  const slot = W / words.length;
  words.forEach(([w, col], i) => {
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.88;
    // Fit each word inside its own slot so neighbours never overlap.
    ctx.fillText(w, slot * (i + 0.5), y(0.55), slot * 0.78);
  });
  ctx.globalAlpha = 1;
  // Dumbbell pictograms between the words.
  ctx.fillStyle = 'rgba(232,228,216,0.5)';
  for (let i = 0; i < words.length; i++) {
    const cx = (W / words.length) * i;
    ctx.fillRect(cx - 38, y(0.55) - 6, 76, 12);
    ctx.fillRect(cx - 38, y(0.55) - 26, 14, 52);
    ctx.fillRect(cx + 24, y(0.55) - 26, 14, 52);
  }
  // Yellow caution stripe under the roof.
  ctx.fillStyle = '#ffc21a';
  ctx.fillRect(0, y(0.82), W, H * 0.04);
  ctx.fillStyle = '#17181b';
  for (let x = -40; x < W; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, y(0.78));
    ctx.lineTo(x + 32, y(0.78));
    ctx.lineTo(x + 56, y(0.82));
    ctx.lineTo(x + 24, y(0.82));
    ctx.closePath();
    ctx.fill();
  }
  // Seen from inside the cylinder (BackSide) u runs backwards: flip it so the words read left to right.
  return canvasTexture(c, { repeat: [-3, 1] });
}

/** Banner: solid colour, a trim line and a big catchphrase. */
function bannerTexture(text: string, bg: string, fg: string, trim: string): THREE.CanvasTexture {
  const W = 1024;
  const H = 256;
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = trim;
  ctx.fillRect(0, 0, W, 16);
  ctx.fillRect(0, H - 16, W, 16);
  let px = Math.round(H * 0.58);
  const fam = '"Barlow Condensed", Impact, "Arial Narrow", sans-serif';
  ctx.font = `900 ${px}px ${fam}`;
  while (ctx.measureText(text).width > W * 0.9 && px > 20) {
    px -= 4;
    ctx.font = `900 ${px}px ${fam}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.strokeText(text, W / 2, H / 2 + 4);
  ctx.fillStyle = fg;
  ctx.fillText(text, W / 2, H / 2 + 4);
  return canvasTexture(c);
}

/** The floor logo: yellow stencil with a dumbbell, readable from home plate. */
function floorLogoTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 256;
  const [c, ctx] = makeCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffc21a';
  ctx.fillRect(0, 0, W, 10);
  ctx.fillRect(0, H - 10, W, 10);
  let px = Math.round(H * 0.62);
  const fam = '"Barlow Condensed", Impact, "Arial Narrow", sans-serif';
  ctx.font = `900 ${px}px ${fam}`;
  const text = 'IRON PARADISE';
  while (ctx.measureText(text).width > W * 0.8 && px > 20) {
    px -= 4;
    ctx.font = `900 ${px}px ${fam}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffc21a';
  ctx.fillText(text, W / 2, H / 2 + 6);
  // Dumbbells at both ends.
  for (const side of [-1, 1]) {
    const cx = W / 2 + side * (W * 0.46);
    ctx.fillStyle = '#e8e4d8';
    ctx.fillRect(cx - 40, H / 2 - 5, 80, 10);
    ctx.fillRect(cx - 44, H / 2 - 30, 18, 60);
    ctx.fillRect(cx + 26, H / 2 - 30, 18, 60);
  }
  return canvasTexture(c);
}

export function createGym(def: StadiumDef, quality: QualitySettings): Gym {
  const group = new THREE.Group();
  group.name = 'gym';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const updaters: ((t: number) => void)[] = [];
  const batch = new Batch();
  const root = new Rig(batch, new THREE.Matrix4());
  const rnd = seeded(2024);

  // Shared materials for the merged props.
  const mats = new Map<MatKey, THREE.Material>();
  for (const key of Object.keys(MATS) as MatKey[]) {
    const m = track(new THREE.MeshStandardMaterial(MATS[key]));
    if (key === 'lamp') {
      (m as unknown as { toneMapped: boolean }).toneMapped = false;
      m.emissiveIntensity = 2.6;
    }
    mats.set(key, m);
  }

  // ── Floor: rubber tile grid and the logo ──
  const decal = (color: string, opacity: number, order: number): THREE.MeshStandardMaterial => {
    const m = track(new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: opacity < 1, opacity, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, depthWrite: false }));
    m.userData.order = order;
    return m;
  };
  const addGround = (geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial): THREE.Mesh => {
    const m = new THREE.Mesh(track(geo), mat);
    m.renderOrder = mat.userData.order as number;
    m.receiveShadow = quality.shadows;
    group.add(m);
    return m;
  };
  const tiles = new MeshBuilder();
  const R = 172;
  for (let k = -R; k <= R; k += 4) {
    const half = Math.sqrt(Math.max(0, R * R - k * k));
    // Lines along Z (at x = k) and along X (at z = k + 60), kept in the outfield half.
    const z0 = Math.max(6, 60 - half);
    const z1 = Math.min(R, 60 + half);
    if (z1 > z0) chalkLine(tiles, k, z0, k, z1, 0.06, 0.016);
    const zz = k + 60;
    if (zz > 6 && zz < R) chalkLine(tiles, -half, zz, half, zz, 0.06, 0.016);
  }
  addGround(tiles.build(), decal('#0a0a0c', 0.7, 1));
  // Yellow lane stripes along the warning-track side, like a sprint lane.
  const lanes = new MeshBuilder();
  for (const a of [-30, -15, 0, 15, 30]) {
    const p0 = polarToXZ(a * DEG, 56);
    const p1 = polarToXZ(a * DEG, fenceDistance(def, a * DEG) - 18);
    chalkLine(lanes, p0.x, p0.z, p1.x, p1.z, 0.35, 0.02);
  }
  addGround(lanes.build(), decal('#c9a017', 0.5, 2));
  const logoTex = track(floorLogoTexture());
  const logo = new THREE.Mesh(track(new THREE.PlaneGeometry(64, 16)), track(new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 })));
  logo.rotation.set(-Math.PI / 2, 0, Math.PI);
  logo.position.set(0, 0.03, 72);
  logo.renderOrder = 3;
  group.add(logo);

  // ── Hall: wall, roof, trusses and strip lights ──
  const wallTex = track(hallWallTexture());
  const wall = new THREE.Mesh(track(new THREE.CylinderGeometry(HALL_R, HALL_R, HALL_H, 96, 1, true)), track(new THREE.MeshBasicMaterial({ map: wallTex, side: THREE.BackSide, color: '#d8d4cc' })));
  wall.position.y = HALL_H / 2;
  group.add(wall);
  const roof = new THREE.Mesh(track(new THREE.CircleGeometry(HALL_R, 64)), track(new THREE.MeshBasicMaterial({ color: '#17181c', side: THREE.DoubleSide })));
  roof.rotation.x = Math.PI / 2;
  roof.position.y = HALL_H;
  group.add(roof);
  // Trusses: long beams both ways with cross braces, strip lights hanging below.
  const roofRig = root;
  const span = (z: number): number => Math.sqrt(Math.max(0, (HALL_R - 4) * (HALL_R - 4) - z * z));
  for (let z = -200; z <= 200; z += 40) {
    const half = span(z);
    roofRig.box('beam', half * 2, 2.2, 1.2, 0, HALL_H - 3, z);
    roofRig.box('beam', half * 2, 0.6, 2.6, 0, HALL_H - 4.3, z);
    for (let x = -half + 10; x < half - 10; x += 14) roofRig.box('beam', 0.5, 5, 0.5, x, HALL_H - 3.5, z, 0, 0, 0.8 * (Math.round(x / 14) % 2 ? 1 : -1));
  }
  for (let x = -200; x <= 200; x += 50) {
    const half = span(x);
    roofRig.box('beam', 1.2, 2.2, half * 2, x, HALL_H - 6.5, 0);
  }
  for (let z = -160; z <= 200; z += 40) {
    const half = span(z);
    for (let x = -half + 25; x < half - 20; x += 40) {
      if (Math.hypot(x, z) > HALL_R - 22) continue;
      roofRig.box('lamp', 22, 0.5, 1.8, x, HALL_H - 9, z);
      roofRig.box('beam', 0.18, 3, 0.18, x - 9, HALL_H - 7.2, z);
      roofRig.box('beam', 0.18, 3, 0.18, x + 9, HALL_H - 7.2, z);
    }
  }
  // Glow halos on some of the lamps (bloom-friendly).
  const glow = track(new THREE.SpriteMaterial({ map: track(softGlow()), color: '#ffe9c4', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  for (let z = 40; z <= 160; z += 40) {
    for (let x = -80; x <= 80; x += 40) {
      const s = new THREE.Sprite(glow);
      s.scale.set(48, 20, 1);
      s.position.set(x, HALL_H - 9, z);
      group.add(s);
    }
  }

  // ── Equipment around the outfield ──
  const at = (angDeg: number, back: number, scale: number, side = 0): Rig => {
    const ang = angDeg * DEG;
    const rr = fenceDistance(def, ang) - back;
    const p = polarToXZ(ang, rr);
    const yaw = Math.atan2(-p.x, -p.z);
    // `side` slides the piece along the tangent (local X after the yaw).
    const ox = Math.cos(yaw) * side;
    const oz = -Math.sin(yaw) * side;
    return root.child(p.x + ox, 0, p.z + oz, yaw, scale);
  };
  // Row A: along the wall.
  dumbbellRack(at(-43, 12, 3.4));
  benchPress(at(-35, 12, 3.2));
  powerRack(at(-27, 12, 3.4));
  for (const s of [-3.3, 0, 3.3]) treadmill(at(-17, 12, 3.2, s * 3.2));
  cableCrossover(at(-8, 12, 3.4));
  pullupRig(at(1, 13, 3.4));
  legPress(at(10, 12, 3.4));
  latPulldown(at(17.5, 12, 3.4, -4));
  smithMachine(at(18.5, 13, 3.2, 8));
  for (const s of [-3.3, 0, 3.3]) elliptical(at(27, 12, 3.2, s * 3.2));
  benchPress(at(35, 12, 3.2));
  dumbbellRack(at(43, 12, 3.4));
  // Row B: smaller gear a little in front.
  plyoBoxes(at(-38, 34, 3.2));
  kettlebells(at(-30, 34, 3.4));
  tires(at(-22, 34, 3));
  battleRopes(at(-13, 34, 3.2));
  giantPlates(at(-4.5, 38, 3.2));
  plateTree(at(4, 34, 3.6));
  kettlebells(at(13, 34, 3.4));
  plyoBoxes(at(22, 34, 3.2));
  tires(at(30, 34, 3));
  giantPlates(at(39, 34, 3.2));
  // Mirrors and spare plate trees near the foul lines.
  mirrorStand(at(-47, 26, 3.4));
  mirrorStand(at(47, 26, 3.4));
  plateTree(at(-47, 46, 3.4));
  plateTree(at(47, 46, 3.4));

  // Heavy bags: static frames plus swinging bags.
  const bagMat = track(new THREE.MeshStandardMaterial({ color: '#a8231f', roughness: 0.6 }));
  const bagGeo = track(new THREE.CylinderGeometry(0.2, 0.2, 1.15, 12));
  const chainMat = track(new THREE.MeshStandardMaterial({ color: '#8d949c', metalness: 0.5, roughness: 0.4 }));
  const chainGeo = track(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5));
  for (const ang of [-24, 24]) {
    const a = ang * DEG;
    const p = polarToXZ(a, fenceDistance(def, a) - 24);
    const yaw = Math.atan2(-p.x, -p.z);
    const scale = 3.4;
    bagRigFrame(root.child(p.x, 0, p.z, yaw, scale));
    for (const sx of [-1.4, 0, 1.4]) {
      const pivot = new THREE.Group();
      const local = new THREE.Vector3(sx * scale, 2.8 * scale, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      pivot.position.set(p.x + local.x, local.y, p.z + local.z);
      pivot.rotation.y = yaw;
      pivot.scale.setScalar(scale);
      const chain = new THREE.Mesh(chainGeo, chainMat);
      chain.position.y = -0.25;
      const bag = new THREE.Mesh(bagGeo, bagMat);
      bag.position.y = -1.07;
      bag.castShadow = quality.shadows;
      pivot.add(chain, bag);
      group.add(pivot);
      const phase = rnd() * 6;
      updaters.push((t) => {
        pivot.rotation.x = Math.sin(t * 0.8 + phase) * 0.09;
        pivot.rotation.z = Math.sin(t * 0.55 + phase * 1.7) * 0.04;
      });
    }
  }

  // ── Ronnie Coleman statues behind the stands, flexing at the pitcher ──
  for (const ang of [-30, 30]) {
    const a = ang * DEG;
    const p = polarToXZ(a, 176);
    const yaw = Math.atan2(-p.x, -p.z);
    statue(root.child(p.x, 0, p.z, yaw, 15));
    // Plaque on the pedestal.
    const tex = track(textTexture('EL MATI', { color: '#ffc21a', stroke: '#000000', w: 512, h: 128 }));
    const plaque = new THREE.Mesh(track(new THREE.PlaneGeometry(1.7 * 15, 0.5 * 15)), track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })));
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    plaque.position.set(p.x + fwd.x * 0.76 * 15, 0.32 * 15, p.z + fwd.z * 0.76 * 15);
    plaque.rotation.y = yaw;
    group.add(plaque);
  }

  // ── Banners high on the wall ──
  const banner = (text: string, bg: string, fg: string, trim: string, angDeg: number, y: number, w: number): void => {
    const tex = track(bannerTexture(text, bg, fg, trim));
    const mat = track(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15), side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(track(new THREE.PlaneGeometry(w, w / 4)), mat);
    const p = polarToXZ(angDeg * DEG, HALL_R - 6);
    mesh.position.set(p.x, y, p.z);
    mesh.lookAt(0, y, 0);
    group.add(mesh);
    if (text === 'IRON PARADISE') updaters.push((t) => mat.color.setScalar(1.1 + 0.18 * Math.sin(t * 2.2)));
  };
  banner('IRON PARADISE', '#0f1013', '#ffc21a', '#c0261f', 0, 63, 80);
  banner('YEAH BUDDY!', '#b3221f', '#f4f1e8', '#ffc21a', -38, 55, 60);
  banner('LIGHTWEIGHT BABY!', '#1f3f9a', '#f4f1e8', '#ffc21a', 38, 55, 60);
  banner('NO PAIN NO GAIN', '#17181b', '#f4f1e8', '#b3221f', -68, 46, 56);
  banner('EVERYBODY WANNA BE A BODYBUILDER', '#ffc21a', '#17181b', '#17181b', 68, 46, 70);
  banner('AIN’T NOTHIN’ BUT A PEANUT', '#b3221f', '#ffc21a', '#17181b', -100, 44, 64);
  banner('NO LEG DAY, NO PARADISE', '#1f3f9a', '#ffc21a', '#f4f1e8', 100, 44, 64);

  // Merge every static prop into one mesh per material.
  for (const mesh of batch.build(mats, quality.shadows)) {
    track(mesh.geometry);
    group.add(mesh);
  }

  return {
    group,
    update(elapsed) {
      updaters.forEach((u) => u(elapsed));
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}

function softGlow(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.3)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(c);
}
