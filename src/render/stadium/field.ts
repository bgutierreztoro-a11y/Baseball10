import * as THREE from 'three';
import type { QualitySettings, StadiumDef } from '../../contracts';
import { BASE_DISTANCE, DEG, FOUL_LINE_ANGLE, MOUND, PLATE, RUBBER_Z } from '../../config/constants';
import { fenceDistance, polarToXZ } from '../../sim/field';
import { dirtTexture, grassTexture } from '../textures';
import { MeshBuilder, chalkLine, circlePoints, groundPolygon, worldUVs } from './geom';

/**
 * The playing surface: grass with mowing pattern, infield dirt, infield grass,
 * home-plate circle, mound, base paths, chalk lines, bases, plate, warning track.
 * Layers are separated by a few millimetres in Y plus polygonOffset.
 */
export interface FieldParts {
  group: THREE.Group;
  dispose(): void;
}

const INFIELD_ARC_RADIUS = 95 * 0.3048;
const HOME_CIRCLE_RADIUS = 13 * 0.3048;
const WARNING_TRACK = 15 * 0.3048;

export function createField(def: StadiumDef, quality: QualitySettings): FieldParts {
  const group = new THREE.Group();
  group.name = 'field';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const grassTex = track(grassTexture(def.palette.grass, def.palette.grassAlt, 11));
  const dirtTex = track(dirtTexture(def.palette.dirt, 12));
  // Ground decals are painted in a fixed order (renderOrder) without writing
  // depth, so coplanar layers never z-fight; a small offset keeps them above the grass.
  const layer = (_order: number): Partial<THREE.MeshStandardMaterialParameters> => ({
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
    depthWrite: false,
  });
  const grassMat = track(new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.92, metalness: 0 }));
  const infieldGrassMat = track(new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.92, ...layer(2) }));
  const dirtMat = track(new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1, ...layer(1) }));
  const dirtTopMat = track(new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1, ...layer(3) }));
  const moundMat = track(new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1 }));
  const chalkMat = track(new THREE.MeshStandardMaterial({ color: '#f5f3ec', roughness: 0.8, ...layer(4) }));
  const whiteMat = track(new THREE.MeshStandardMaterial({ color: '#fbfaf5', roughness: 0.55 }));

  const ORDER = new Map<THREE.Material, number>([
    [dirtMat, 1],
    [infieldGrassMat, 2],
    [dirtTopMat, 3],
    [chalkMat, 4],
  ]);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, receive = true, name = '', order?: number): THREE.Mesh => {
    track(geo);
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.renderOrder = order ?? ORDER.get(mat) ?? 0;
    m.receiveShadow = receive && quality.shadows;
    group.add(m);
    return m;
  };

  // ── Grass (whole bowl; stands cover the edges) ──
  const grassGeo = new THREE.CircleGeometry(175, 96);
  grassGeo.rotateX(-Math.PI / 2);
  worldUVs(grassGeo, 11, 45 * DEG);
  add(grassGeo, grassMat, true, 'grass');

  // ── Infield dirt: arc around the rubber + base paths along the foul lines ──
  const lineW = 1.25;
  const outward3B = { x: Math.SQRT1_2, z: -Math.SQRT1_2 }; // away from fair territory, 3B side (+X)
  const dir3B = { x: Math.SQRT1_2, z: Math.SQRT1_2 };
  const arcCenter = { x: 0, z: RUBBER_Z };
  const hit = lineCircle(dir3B, outward3B, lineW, arcCenter, INFIELD_ARC_RADIUS);
  const angle3B = Math.atan2(hit.z - arcCenter.z, hit.x - arcCenter.x);
  const angle1B = Math.PI - angle3B;
  // Home (3B-side offset) → along the 3B line → arc through 2B → 1B line → home.
  const dirtPts: { x: number; z: number }[] = [
    { x: outward3B.x * lineW, z: outward3B.z * lineW },
    ...circlePoints(arcCenter.x, arcCenter.z, INFIELD_ARC_RADIUS, angle3B, angle1B, 72),
    { x: -outward3B.x * lineW, z: outward3B.z * lineW },
  ];
  const dirtGeo = groundPolygon(dirtPts, 0.004);
  worldUVs(dirtGeo, 6);
  add(dirtGeo, dirtMat, true, 'dirt');

  // ── Infield grass: the diamond inset from the base paths ──
  const inset = 1.05;
  const b = BASE_DISTANCE;
  const c = { x: 0, z: (b * Math.SQRT2) / 2 };
  const corners = [polarToXZ(0, 0), polarToXZ(-45 * DEG, b), polarToXZ(0, b * Math.SQRT2), polarToXZ(45 * DEG, b)].map((p) => {
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const l = Math.hypot(dx, dz);
    return { x: p.x - (dx / l) * inset * Math.SQRT2, z: p.z - (dz / l) * inset * Math.SQRT2 };
  });
  const ig = groundPolygon(corners, 0.008);
  worldUVs(ig, 11, 45 * DEG);
  add(ig, infieldGrassMat, true, 'infieldGrass');

  // ── Home-plate circle, mound, base cut-outs ──
  const homeGeo = groundPolygon(circlePoints(0, PLATE.depth / 2, HOME_CIRCLE_RADIUS, 0, Math.PI * 2, 64), 0.012);
  worldUVs(homeGeo, 6);
  add(homeGeo, dirtTopMat, true, 'homeCircle');

  for (const ang of [-45, 45]) {
    const p = polarToXZ(ang * DEG, b);
    const cut = groundPolygon(circlePoints(p.x, p.z, 2.6, 0, Math.PI * 2, 32), 0.012);
    worldUVs(cut, 6);
    add(cut, dirtTopMat);
  }

  const moundProfile: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const r = (MOUND.radius * i) / 16;
    const t = Math.max(0, (r - 0.9) / (MOUND.radius - 0.9));
    moundProfile.push(new THREE.Vector2(r, MOUND.height * (1 - t * t * (3 - 2 * t))));
  }
  moundProfile.reverse();
  const moundGeo = new THREE.LatheGeometry(moundProfile, 40);
  moundGeo.translate(0, 0.006, MOUND.centerZ);
  worldUVs(moundGeo, 6);
  const mound = add(moundGeo, moundMat, true, 'mound');
  mound.castShadow = false;

  const rubber = add(new THREE.BoxGeometry(24 * 0.0254, 0.03, 6 * 0.0254), whiteMat);
  rubber.position.set(0, MOUND.height + 0.006, RUBBER_Z + 0.08);

  // ── Home plate (with a dark rim) ──
  const hw = PLATE.width / 2;
  const platePts = [
    { x: 0, z: 0 },
    { x: -hw, z: PLATE.depth / 2 },
    { x: -hw, z: PLATE.depth },
    { x: hw, z: PLATE.depth },
    { x: hw, z: PLATE.depth / 2 },
  ];
  const rim = platePts.map((p) => ({ x: p.x * 1.08, z: (p.z - PLATE.depth / 2) * 1.08 + PLATE.depth / 2 }));
  add(groundPolygon(rim, 0.02), track(new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 1, ...layer(5) })), true, 'plateRim', 5);
  add(groundPolygon(platePts, 0.026), track(new THREE.MeshStandardMaterial({ color: '#fbfaf5', roughness: 0.5, ...layer(6) })), true, 'plate', 6);

  // ── Bases ──
  const baseGeo = new THREE.BoxGeometry(0.38, 0.09, 0.38);
  track(baseGeo);
  for (const [ang, dist] of [
    [-45, b],
    [0, b * Math.SQRT2],
    [45, b],
  ] as const) {
    const p = polarToXZ(ang * DEG, dist);
    const m = new THREE.Mesh(baseGeo, whiteMat);
    m.position.set(p.x, 0.05, p.z);
    m.rotation.y = Math.PI / 4;
    m.castShadow = quality.shadows;
    group.add(m);
  }

  // ── Chalk: foul lines, batter's boxes, catcher's box, coaches' boxes ──
  const chalk = new MeshBuilder();
  const lfPole = polarToXZ(-FOUL_LINE_ANGLE, fenceDistance(def, -FOUL_LINE_ANGLE));
  const rfPole = polarToXZ(FOUL_LINE_ANGLE, fenceDistance(def, FOUL_LINE_ANGLE));
  const y = 0.03;
  chalkLine(chalk, 0, 0, lfPole.x, lfPole.z, 0.1, y);
  chalkLine(chalk, 0, 0, rfPole.x, rfPole.z, 0.1, y);
  const zc = PLATE.depth / 2;
  for (const side of [-1, 1]) {
    const x0 = side * (hw + 0.1524);
    const x1 = side * (hw + 0.1524 + 1.2192);
    const z0 = zc - 0.9144;
    const z1 = zc + 0.9144;
    chalkLine(chalk, x0, z0, x0, z1, 0.07, y);
    chalkLine(chalk, x1, z0, x1, z1, 0.07, y);
    chalkLine(chalk, x0, z0, x1, z0, 0.07, y);
    chalkLine(chalk, x0, z1, x1, z1, 0.07, y);
    // Catcher's box sides.
    chalkLine(chalk, side * 0.55, z0, side * 0.55, z0 - 2.4, 0.07, y);
  }
  chalkLine(chalk, -0.55, zc - 0.9144 - 2.4, 0.55, zc - 0.9144 - 2.4, 0.07, y);
  // On-deck circles.
  for (const side of [-1, 1]) {
    const ring = circlePoints(side * 12.5, -4.5, 0.76, 0, Math.PI * 2, 28);
    for (let i = 1; i < ring.length; i++) chalkLine(chalk, ring[i - 1]!.x, ring[i - 1]!.z, ring[i]!.x, ring[i]!.z, 0.06, 0.02);
  }
  add(chalk.build(), chalkMat, true);

  // ── Warning track ──
  const wt = new MeshBuilder();
  const n = 90;
  for (let i = 0; i < n; i++) {
    const a0 = -FOUL_LINE_ANGLE - 2 * DEG + ((2 * FOUL_LINE_ANGLE + 4 * DEG) * i) / n;
    const a1 = -FOUL_LINE_ANGLE - 2 * DEG + ((2 * FOUL_LINE_ANGLE + 4 * DEG) * (i + 1)) / n;
    const r0 = fenceDistance(def, a0);
    const r1 = fenceDistance(def, a1);
    const i0 = polarToXZ(a0, r0 - WARNING_TRACK);
    const o0 = polarToXZ(a0, r0 + 0.3);
    const i1 = polarToXZ(a1, r1 - WARNING_TRACK);
    const o1 = polarToXZ(a1, r1 + 0.3);
    // Increasing spray goes toward −X; this order keeps the normal up.
    wt.quad([i0.x, 0.006, i0.z], [i1.x, 0.006, i1.z], [o1.x, 0.006, o1.z], [o0.x, 0.006, o0.z]);
  }
  const wtGeo = wt.build();
  worldUVs(wtGeo, 6);
  add(wtGeo, dirtMat);

  return {
    group,
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}

/** Intersection of the line p(s) = dir·s + normal·offset with a circle (largest s). */
function lineCircle(dir: { x: number; z: number }, normal: { x: number; z: number }, offset: number, c: { x: number; z: number }, r: number): { x: number; z: number } {
  const ox = normal.x * offset - c.x;
  const oz = normal.z * offset - c.z;
  const B = 2 * (dir.x * ox + dir.z * oz);
  const C = ox * ox + oz * oz - r * r;
  const s = (-B + Math.sqrt(Math.max(0, B * B - 4 * C))) / 2;
  return { x: dir.x * s + normal.x * offset, z: dir.z * s + normal.z * offset };
}
