import * as THREE from 'three';
import type { QualitySettings, StadiumDef } from '../../contracts';
import { DEG, FOUL_LINE_ANGLE } from '../../config/constants';
import { STAND_GAP, STAND_RISE, fenceDistance, fenceHeight, fencePolyline, polarToXZ } from '../../sim/field';
import { chainLinkTexture, netTexture, seeded, textTexture, wallTexture } from '../textures';
import { MeshBuilder } from './geom';
import type { Atmosphere } from './atmosphere';

/**
 * Architecture: outfield wall (matches physics exactly), foul poles, seating
 * bowl (outfield bleachers follow sim/field standHeight), backstop net,
 * animated crowd, light towers. Each structure is one merged mesh.
 */
export interface Structures {
  group: THREE.Group;
  /** Back edge of the CF bleachers (radius, height) — used to place the scoreboard. */
  cfBack: { r: number; y: number };
  update(elapsed: number, excitement: number): void;
  dispose(): void;
}

const ROW_DEPTH = 0.9;
const ROW_RISE = ROW_DEPTH * STAND_RISE;

interface PathPoint {
  x: number;
  z: number;
  nx: number;
  nz: number;
  /** Seating starts at this height. */
  h0: number;
}

export function createStructures(def: StadiumDef, quality: QualitySettings, atm: Atmosphere): Structures {
  const group = new THREE.Group();
  group.name = 'structures';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const sandlot = def.features.sandlot;
  const rnd = seeded(def.id.length * 977);

  // ── Outfield wall ──
  const fence = fencePolyline(def, 96);
  const wall = new MeshBuilder();
  const trimB = new MeshBuilder();
  let u = 0;
  for (let i = 0; i < fence.length - 1; i++) {
    const a = fence[i]!;
    const b = fence[i + 1]!;
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    // Inner face: a→b runs toward −X (increasing spray), so this order faces home.
    wall.quad([a.x, 0, a.z], [b.x, 0, b.z], [b.x, b.h, b.z], [a.x, a.h, a.z], undefined, [u, 0, u + seg / 3, 1]);
    u += seg / 3;
    // Top cap + yellow home-run line.
    const ao = scaleXZ(a, 0.45);
    const bo = scaleXZ(b, 0.45);
    trimB.quad([a.x, a.h, a.z], [b.x, b.h, b.z], [bo.x, b.h, bo.z], [ao.x, a.h, ao.z]);
    const ai = scaleXZ(a, -0.02);
    const bi = scaleXZ(b, -0.02);
    trimB.quad([ai.x, a.h - 0.14, ai.z], [bi.x, b.h - 0.14, bi.z], [bi.x, b.h, bi.z], [ai.x, a.h, ai.z]);
  }
  const wallMat = sandlot
    ? track(new THREE.MeshStandardMaterial({ map: track(chainLinkTexture()), alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4, color: '#c9ced3' }))
    : track(new THREE.MeshStandardMaterial({ map: track(wallTexture(def.palette.wall)), roughness: 0.85 }));
  if (sandlot) (wallMat.map as THREE.Texture).repeat.set(3, Math.max(...def.fence.heightsFt) * 0.3048 / 1.0);
  const wallMesh = new THREE.Mesh(track(wall.build()), wallMat);
  wallMesh.receiveShadow = quality.shadows;
  group.add(wallMesh);
  group.add(new THREE.Mesh(track(trimB.build()), track(new THREE.MeshStandardMaterial({ color: def.palette.wallTrim, roughness: 0.6 }))));

  if (sandlot) {
    // Posts for the chain-link fence.
    const postGeo = track(new THREE.CylinderGeometry(0.05, 0.05, 1, 6));
    const postMat = track(new THREE.MeshStandardMaterial({ color: '#9aa1a8', metalness: 0.7, roughness: 0.35 }));
    for (let i = 0; i < fence.length; i += 4) {
      const p = fence[i]!;
      const m = new THREE.Mesh(postGeo, postMat);
      m.scale.y = p.h + 0.1;
      m.position.set(p.x, (p.h + 0.1) / 2, p.z);
      group.add(m);
    }
  }

  // Distance markers painted on the wall.
  const markerAngles = [-45, -22.5, 0, 22.5, 45];
  def.fence.distancesFt.forEach((ft, i) => {
    const ang = markerAngles[i]! * DEG * 0.97;
    // A flat plane on a concave wall: pull it in so its edges don't sink behind the padding.
    const r = fenceDistance(def, ang) - 0.35;
    const h = fenceHeight(def, ang);
    const tex = track(textTexture(String(ft), { color: sandlot ? '#1f2a36' : '#ffffff', stroke: sandlot ? '#ffffff' : undefined, w: 256, h: 128 }));
    const size = Math.min(2.4, h * 0.55);
    const plane = new THREE.Mesh(track(new THREE.PlaneGeometry(size * 2, size)), track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })));
    const p = polarToXZ(ang, r);
    plane.position.set(p.x, Math.max(size * 0.6, h * 0.55), p.z);
    plane.lookAt(0, plane.position.y, 0);
    group.add(plane);
  });

  // ── Foul poles ──
  const poleMat = track(new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffcc33', emissiveIntensity: atm.night ? 0.6 : 0.15, roughness: 0.4 }));
  for (const side of [-1, 1]) {
    const ang = side * FOUL_LINE_ANGLE;
    const p = polarToXZ(ang, fenceDistance(def, ang) + 0.2);
    const h = fenceHeight(def, ang) + (sandlot ? 9 : 22);
    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.16, 0.2, h, 10)), poleMat);
    pole.position.set(p.x, h / 2, p.z);
    group.add(pole);
    // Screen ("fin") on the fair side of the pole.
    const fin = new THREE.Mesh(track(new THREE.PlaneGeometry(0.9, h * 0.75)), track(new THREE.MeshStandardMaterial({ color: '#ffd23f', side: THREE.DoubleSide, transparent: true, opacity: 0.85 })));
    const tx = -Math.cos(ang) * -side;
    const tz = -Math.sin(ang) * -side;
    fin.position.set(p.x + tx * 0.5, h * 0.6, p.z + tz * 0.5);
    fin.lookAt(p.x + tx * 2, h * 0.6, p.z + tz * 2);
    fin.rotateY(Math.PI / 2);
    group.add(fin);
  }

  // ── Seating bowl ──
  // Seats are slightly muted so the crowd and the ball read on top of them.
  const seatColors = def.palette.seats.map((c) => new THREE.Color(c).offsetHSL(0, -0.12, -0.06));
  const outfieldRows = sandlot ? 0 : 40;
  const foulRows = sandlot ? 7 : 30;
  const crowdSlots: { x: number; y: number; z: number; face: number }[] = [];
  const stands = new MeshBuilder(true);

  // Outfield bleachers: radial rows from STAND_GAP behind the wall (physics surface).
  const ofPath: PathPoint[] = [];
  for (let i = 0; i <= 96; i++) {
    const ang = -FOUL_LINE_ANGLE + (2 * FOUL_LINE_ANGLE * i) / 96;
    const r = fenceDistance(def, ang) + STAND_GAP;
    const p = polarToXZ(ang, r);
    ofPath.push({ x: p.x, z: p.z, nx: p.x / r, nz: p.z / r, h0: fenceHeight(def, ang) });
  }
  if (outfieldRows > 0) {
    buildRows(stands, ofPath, outfieldRows, seatColors, crowdSlots, rnd, true);
  } else {
    buildBerm(stands, ofPath, 34, new THREE.Color(def.palette.grassAlt), crowdSlots, rnd);
  }

  // Foul territory: from the LF pole back along the 3B line, around home, out the 1B line.
  const foulPath = foulBowlPath(def, sandlot);
  buildRows(stands, foulPath, foulRows, seatColors, crowdSlots, rnd, false);
  const standsMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  const standsMesh = new THREE.Mesh(track(stands.build()), standsMat);
  standsMesh.receiveShadow = quality.shadows && quality.tier === 'high';
  group.add(standsMesh);

  // Upper deck facade for the big parks (foul side).
  if (!sandlot && def.crowdDensity >= 0.6) {
    const deck = new MeshBuilder(true);
    const upper = foulPath.map((p) => ({ ...p, x: p.x + p.nx * (foulRows * ROW_DEPTH + 3), z: p.z + p.nz * (foulRows * ROW_DEPTH + 3), h0: p.h0 + foulRows * ROW_RISE * 1.05 + 4 }));
    buildRows(deck, upper, 18, seatColors.map((c) => c.clone().offsetHSL(0, -0.05, -0.06)), crowdSlots, rnd, false);
    // Facade band under the upper deck, in the park's accent color.
    const accent = new THREE.Color(def.palette.accent);
    for (let i = 0; i < upper.length - 1; i++) {
      const a = upper[i]!;
      const b = upper[i + 1]!;
      deck.quad([a.x, a.h0 - 2.2, a.z], [b.x, b.h0 - 2.2, b.z], [b.x, b.h0, b.z], [a.x, a.h0, a.z], accent);
    }
    const deckMesh = new THREE.Mesh(track(deck.build()), standsMat);
    group.add(deckMesh);
  }

  // Ground gap between the wall and the bleachers (dark) + outer concourse floor.
  const gap = new MeshBuilder();
  for (let i = 0; i < fence.length - 1; i++) {
    const a = fence[i]!;
    const b = fence[i + 1]!;
    const ao = scaleXZ(a, STAND_GAP + 0.1);
    const bo = scaleXZ(b, STAND_GAP + 0.1);
    gap.quad([a.x, 0.02, a.z], [b.x, 0.02, b.z], [bo.x, 0.02, bo.z], [ao.x, 0.02, ao.z]);
  }
  group.add(new THREE.Mesh(track(gap.build()), track(new THREE.MeshStandardMaterial({ color: '#1d2421', roughness: 1, side: THREE.DoubleSide }))));

  // ── Backstop net ──
  const net = new THREE.Mesh(
    track(new THREE.CylinderGeometry(18.6, 18.6, 9, 40, 1, true, Math.PI * 0.75, Math.PI * 0.5)),
    track(new THREE.MeshBasicMaterial({ map: track(netTexture()), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })),
  );
  ((net.material as THREE.MeshBasicMaterial).map as THREE.Texture).repeat.set(60, 12);
  // θ ∈ [0.75π, 1.25π] → z < 0: the arc wraps behind home plate.
  net.position.set(0, 4.5 + 1.2, 0);
  group.add(net);

  // ── Crowd ──
  const crowd = createCrowd(def, quality, crowdSlots, rnd);
  if (crowd) {
    group.add(crowd.mesh);
    disposables.push(crowd);
  }

  // ── Light towers ──
  if (def.features.lightTowers) {
    group.add(createLightTowers(def, atm, track));
  }

  const cfR = fenceDistance(def, 0) + STAND_GAP + outfieldRows * ROW_DEPTH;
  return {
    group,
    cfBack: { r: cfR, y: fenceHeight(def, 0) + outfieldRows * ROW_RISE },
    update(elapsed, excitement) {
      crowd?.update(elapsed, excitement);
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}

function scaleXZ(p: { x: number; z: number }, extra: number): { x: number; z: number } {
  const r = Math.hypot(p.x, p.z) || 1;
  return { x: p.x * (1 + extra / r), z: p.z * (1 + extra / r) };
}

/** Inner edge of the foul-territory seating: LF pole → around home → RF pole. */
function foulBowlPath(def: StadiumDef, sandlot: boolean): PathPoint[] {
  const pts: { x: number; z: number }[] = [];
  const gHome = 18.6;
  const gPole = sandlot ? 6 : 3.2;
  const lineLen = (side: number) => fenceDistance(def, side * FOUL_LINE_ANGLE);
  const n = 30;
  // 3B side (+X), from the pole toward home.
  const len3 = lineLen(-1) * (sandlot ? 0.45 : 1);
  for (let i = 0; i <= n; i++) {
    const s = len3 * (1 - i / n);
    const g = gPole + (gHome - gPole) * (1 - s / lineLen(-1));
    const d = polarToXZ(-FOUL_LINE_ANGLE, s);
    pts.push({ x: d.x + Math.SQRT1_2 * g, z: d.z - Math.SQRT1_2 * g });
  }
  // Behind home: arc of radius gHome from the 3B side to the 1B side.
  for (let i = 1; i < 24; i++) {
    const a = -Math.PI / 4 - (Math.PI / 2) * (i / 24);
    pts.push({ x: Math.cos(a) * gHome, z: Math.sin(a) * gHome });
  }
  const len1 = lineLen(1) * (sandlot ? 0.45 : 1);
  for (let i = 0; i <= n; i++) {
    const s = len1 * (i / n);
    const g = gPole + (gHome - gPole) * (1 - s / lineLen(1));
    const d = polarToXZ(FOUL_LINE_ANGLE, s);
    pts.push({ x: d.x - Math.SQRT1_2 * g, z: d.z - Math.SQRT1_2 * g });
  }
  // Run RF → home → LF (same winding as the outfield path) with outward normals.
  pts.reverse();
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    let nx = b.z - a.z;
    let nz = -(b.x - a.x);
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    // Field centre is around (0, 30): flip if pointing inward.
    if (nx * (p.x - 0) + nz * (p.z - 30) < 0) {
      nx = -nx;
      nz = -nz;
    }
    return { x: p.x, z: p.z, nx, nz, h0: 1.2 };
  });
}

/** Stepped rows (tread + riser) along a path, optionally radial from home. */
function buildRows(
  b: MeshBuilder,
  path: PathPoint[],
  rows: number,
  colors: THREE.Color[],
  slots: { x: number; y: number; z: number; face: number }[],
  rnd: () => number,
  radial: boolean,
): void {
  const front = new THREE.Color('#2b2f36');
  const back = new THREE.Color('#3a3f47');
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const c = path[i + 1]!;
    const section = Math.floor(i / 6);
    for (let r = 0; r < rows; r++) {
      const d0 = r * ROW_DEPTH;
      const d1 = d0 + ROW_DEPTH;
      const ya = a.h0 + (r + 1) * ROW_RISE;
      const yc = c.h0 + (r + 1) * ROW_RISE;
      const yaPrev = a.h0 + r * ROW_RISE;
      const ycPrev = c.h0 + r * ROW_RISE;
      const pa0 = off(a, d0, radial);
      const pc0 = off(c, d0, radial);
      const pa1 = off(a, d1, radial);
      const pc1 = off(c, d1, radial);
      const aisle = i % 6 === 0;
      const tier = r > rows * 0.62 ? 1 : 0;
      const col = aisle ? back : sectionColor(colors[tier % colors.length]!, section);
      // Riser (faces the field) then tread (faces up).
      b.quad([pa0.x, yaPrev, pa0.z], [pc0.x, ycPrev, pc0.z], [pc0.x, yc, pc0.z], [pa0.x, ya, pa0.z], r === 0 ? front : col.clone().multiplyScalar(0.7));
      b.quad([pa0.x, ya, pa0.z], [pc0.x, yc, pc0.z], [pc1.x, yc, pc1.z], [pa1.x, ya, pa1.z], col);
      if (!aisle) {
        const seg = Math.hypot(c.x - a.x, c.z - a.z);
        const seats = Math.max(1, Math.round(seg / 0.62));
        for (let s = 0; s < seats; s++) {
          const t = (s + 0.5) / seats;
          const px = pa0.x + (pc0.x - pa0.x) * t + (pa1.x - pa0.x) * 0.45;
          const pz = pa0.z + (pc0.z - pa0.z) * t + (pa1.z - pa0.z) * 0.45;
          slots.push({ x: px + (rnd() - 0.5) * 0.08, y: ya + (yc - ya) * t, z: pz, face: Math.atan2(-px, -pz) });
        }
      }
    }
    // Back wall down to the ground.
    const top = rows * ROW_RISE;
    const ba = off(a, rows * ROW_DEPTH, radial);
    const bc = off(c, rows * ROW_DEPTH, radial);
    b.quad([bc.x, 0, bc.z], [ba.x, 0, ba.z], [ba.x, a.h0 + top + 1.2, ba.z], [bc.x, c.h0 + top + 1.2, bc.z], back);
    // Front wall from the ground to the first row.
    b.quad([a.x, 0, a.z], [c.x, 0, c.z], [c.x, c.h0, c.z], [a.x, a.h0, a.z], front);
  }
}

const shadeCache = new Map<string, THREE.Color>();
/** Subtle per-section variation of one seat color (reads as real sections, not a checkerboard). */
function sectionColor(base: THREE.Color, section: number): THREE.Color {
  const key = `${base.getHexString()}:${section % 3}`;
  let c = shadeCache.get(key);
  if (!c) {
    c = base.clone().offsetHSL(0, 0, ((section % 3) - 1) * 0.025);
    shadeCache.set(key, c);
  }
  return c;
}

/** Grass berm behind a sandlot fence (smooth slope matching the physics surface). */
function buildBerm(b: MeshBuilder, path: PathPoint[], depth: number, color: THREE.Color, slots: { x: number; y: number; z: number; face: number }[], rnd: () => number): void {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const c = path[i + 1]!;
    const a1 = off(a, depth, true);
    const c1 = off(c, depth, true);
    const top = depth * STAND_RISE;
    b.quad([a.x, a.h0, a.z], [c.x, c.h0, c.z], [c1.x, c.h0 + top, c1.z], [a1.x, a.h0 + top, a1.z], color);
    b.quad([a.x, 0, a.z], [c.x, 0, c.z], [c.x, c.h0, c.z], [a.x, a.h0, a.z], color.clone().multiplyScalar(0.8));
    if (rnd() < 0.5) {
      const d = 3 + rnd() * (depth - 6);
      const p = off(a, d, true);
      slots.push({ x: p.x, y: a.h0 + d * STAND_RISE, z: p.z, face: Math.atan2(-p.x, -p.z) });
    }
  }
}

function off(p: PathPoint, d: number, _radial: boolean): { x: number; z: number } {
  return { x: p.x + p.nx * d, z: p.z + p.nz * d };
}

interface Crowd {
  mesh: THREE.InstancedMesh;
  update(elapsed: number, excitement: number): void;
  dispose(): void;
}

/** Instanced spectators animated entirely in the vertex shader. */
function createCrowd(def: StadiumDef, quality: QualitySettings, slots: { x: number; y: number; z: number; face: number }[], rnd: () => number): Crowd | null {
  const wanted = Math.min(slots.length, Math.round(quality.crowdCount * def.crowdDensity));
  if (wanted <= 0) return null;
  // Spectator: torso + head, ~24 triangles.
  const body = new THREE.BoxGeometry(0.44, 0.62, 0.3);
  body.translate(0, 0.31, 0);
  const head = new THREE.OctahedronGeometry(0.15, 0);
  head.translate(0, 0.78, 0);
  const geo = mergeSimple([body, head]);
  body.dispose();
  head.dispose();

  const uniforms = { uTime: { value: 0 }, uExcite: { value: 0 } };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: false });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uExcite = uniforms.uExcite;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uExcite;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
          float idle = sin(uTime * (1.2 + ph) + ph * 6.2831) * 0.025;
          float jump = max(0.0, sin(uTime * (7.0 + ph * 4.0) + ph * 6.2831)) * 0.38 * uExcite * step(0.25, ph + uExcite * 0.6);
          transformed.y += idle + jump;
          transformed.x += sin(uTime * 2.0 + ph * 10.0) * 0.03 * uExcite;
        #endif`,
      );
  };
  const mesh = new THREE.InstancedMesh(geo, mat, wanted);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const color = new THREE.Color();
  const palette = def.palette.crowd.map((c) => new THREE.Color(c));
  const skin = ['#f1c27d', '#c68642', '#8d5524', '#e0ac69', '#ffdbac'].map((c) => new THREE.Color(c));
  // Uniformly sample `wanted` slots.
  const step = slots.length / wanted;
  for (let i = 0; i < wanted; i++) {
    const slot = slots[Math.min(slots.length - 1, Math.floor(i * step + rnd() * step))]!;
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, slot.face);
    const k = 0.85 + rnd() * 0.3;
    s.set(k, k, k);
    m.compose(new THREE.Vector3(slot.x, slot.y, slot.z), q, s);
    mesh.setMatrixAt(i, m);
    color.copy(rnd() < 0.82 ? palette[Math.floor(rnd() * palette.length)]! : skin[Math.floor(rnd() * skin.length)]!);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return {
    mesh,
    update(elapsed, excitement) {
      uniforms.uTime.value = elapsed;
      uniforms.uExcite.value += (excitement - uniforms.uExcite.value) * 0.08;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
}

/** Merge simple non-indexed-compatible geometries (position/normal/uv). */
export function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((s, g) => s + g.getAttribute('position').count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of parts) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    const t = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
    pos.set(p.array as Float32Array, o * 3);
    nor.set(n.array as Float32Array, o * 3);
    if (t) uv.set(t.array as Float32Array, o * 2);
    o += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  parts.forEach((g, i) => {
    if (g !== geos[i]) g.dispose();
  });
  return out;
}

function createLightTowers(def: StadiumDef, atm: Atmosphere, track: <T extends { dispose(): void }>(x: T) => T): THREE.Group {
  const g = new THREE.Group();
  g.name = 'lightTowers';
  const poleMat = track(new THREE.MeshStandardMaterial({ color: '#59606b', metalness: 0.6, roughness: 0.45 }));
  const frameMat = track(new THREE.MeshStandardMaterial({ color: '#2b3038', metalness: 0.5, roughness: 0.5 }));
  const lampMat = track(
    new THREE.MeshBasicMaterial({ color: atm.lampsOn ? new THREE.Color('#fff6e0').multiplyScalar(atm.night ? 6 : 3) : new THREE.Color('#cfd6de'), toneMapped: !atm.lampsOn }),
  );
  const glowTex = track(radialGlow());
  const glowMat = track(new THREE.SpriteMaterial({ map: glowTex, color: '#fff2d0', transparent: true, opacity: atm.night ? 0.55 : 0.25, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  const poleGeo = track(new THREE.CylinderGeometry(0.45, 0.8, 1, 8));
  const frameGeo = track(new THREE.BoxGeometry(11, 6.5, 0.6));
  const lampGeo = track(new THREE.PlaneGeometry(1.1, 0.8));
  const angles = [-62, -28, 28, 62, -118, 118];
  for (const a of angles) {
    const ang = a * DEG;
    const r = Math.abs(a) > 90 ? 60 : fenceDistance(def, Math.max(-FOUL_LINE_ANGLE, Math.min(FOUL_LINE_ANGLE, ang))) + 48;
    const p = polarToXZ(ang, r);
    const h = 52;
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.scale.y = h;
    pole.position.set(p.x, h / 2, p.z);
    g.add(pole);
    const head = new THREE.Group();
    head.position.set(p.x, h + 2, p.z);
    head.lookAt(0, 0, 30);
    const frame = new THREE.Mesh(frameGeo, frameMat);
    head.add(frame);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 8; col++) {
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(-4.6 + col * 1.3, -2.4 + row * 1.2, 0.32);
        head.add(lamp);
      }
    }
    if (atm.lampsOn) {
      const glow = new THREE.Sprite(glowMat);
      glow.scale.set(34, 24, 1);
      glow.position.set(0, 0, 1.5);
      head.add(glow);
    }
    g.add(head);
  }
  return g;
}

function radialGlow(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
