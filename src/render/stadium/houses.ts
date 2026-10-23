import * as THREE from 'three';
import type { StadiumDef } from '../../contracts';
import { FOUL_LINE_ANGLE } from '../../config/constants';
import { STAND_GAP, STAND_RISE, fenceDistance, fenceHeight, polarToXZ } from '../../sim/field';
import { MeshBuilder } from './geom';

/**
 * Southampton: instead of stands, rows of British terraced houses (brick or
 * painted fronts, slate roofs, chimney stacks, bay windows and coloured
 * doors). Behind the outfield wall they climb the hill that the physics uses
 * as the stands surface (sim/field standHeight), with a wet street in front;
 * in foul territory they line the old seating bowl. The fans watch from the
 * lit windows: every window slot returned here gets a spectator bust.
 */
export interface HouseRows {
  /** Lit (brick, roofs, doors, ground) geometry with vertex colours. */
  solid: THREE.BufferGeometry;
  /** Window glass: drawn unlit so the windows glow in the drizzle. */
  glass: THREE.BufferGeometry;
  /** Where a fan can look out of a window (feet at the sill). */
  windows: { x: number; y: number; z: number; face: number }[];
  /** Back of the CF rows (radius, roof height) — used to place the scoreboard. */
  cfBack: { r: number; y: number };
}

interface Frame {
  /** Facade bottom-centre. */
  ox: number;
  oy: number;
  oz: number;
  /** Unit vector out of the facade (toward the field). */
  fx: number;
  fz: number;
}

/** Outfield rows: distance of each row's facade behind the stands edge (m). */
const OUTFIELD_ROWS = [13, 24, 35, 46];
/** Rows behind the foul-territory path. */
const FOUL_ROWS = [3, 13];
const HOUSE_W = 5.4;
const HOUSE_D = 7;
const BODY_H = 6.2;
const ROOF_H = 2.3;
/** Outfield hill depth behind the wall (m). */
const HILL = 60;

const BRICKS = ['#8a4636', '#7a3c2e', '#9a5843', '#6f3a2d', '#a0614a', '#e6dfd2', '#d9cdb5', '#c4cfd4', '#8e3b33'].map((c) => new THREE.Color(c));
const DOORS = ['#b3121b', '#1d2b4f', '#1f5f3a', '#15161b', '#f2c84b', '#3b6ea8'].map((c) => new THREE.Color(c));
const SLATE = new THREE.Color('#3b4149');
const SLATE_DARK = new THREE.Color('#2e3339');
const WHITE = new THREE.Color('#ecebe6');
const STONE = new THREE.Color('#8f8b84');
const TARMAC = new THREE.Color('#2f3235');
const PAVEMENT = new THREE.Color('#6d6f70');
const LAWN = new THREE.Color('#3b5833');
const LINE = new THREE.Color('#d8d8d0');
const LIT = ['#f3d79b', '#eac37f', '#f6e2b3', '#e0b26e'].map((c) => new THREE.Color(c));
const DARK_GLASS = ['#2b333c', '#36414b'].map((c) => new THREE.Color(c));

type V3 = [number, number, number];

/** Adds a quad facing `out` whatever the order its corners come in. */
function face(b: MeshBuilder, p: [V3, V3, V3, V3], out: V3, color: THREE.Color): void {
  const [a, c1, , d] = p;
  const e1 = [c1[0] - a[0], c1[1] - a[1], c1[2] - a[2]];
  const e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
  if (n[0]! * out[0] + n[1]! * out[1] + n[2]! * out[2] >= 0) b.quad(p[0], p[1], p[2], p[3], color);
  // Reversed keeping the first corner, so a triangle (c = d) never degenerates the normal's edges.
  else b.quad(p[0], p[3], p[2], p[1], color);
}

export function createHouseRows(def: StadiumDef, rnd: () => number, foulPath: { x: number; z: number; nx: number; nz: number }[]): HouseRows {
  const solid = new MeshBuilder(true);
  const glass = new MeshBuilder(true);
  const windows: HouseRows['windows'] = [];

  /** World point from the house frame: u along the row, v up, w back into the house. */
  const P = (f: Frame, u: number, v: number, w: number): V3 => {
    // Lateral axis: the facade normal turned 90° (any consistent choice works).
    const tx = f.fz;
    const tz = -f.fx;
    return [f.ox + tx * u - f.fx * w, f.oy + v, f.oz + tz * u - f.fz * w];
  };

  const house = (f: Frame): void => {
    const fwd: V3 = [f.fx, 0, f.fz];
    const back: V3 = [-f.fx, 0, -f.fz];
    const side: V3 = [f.fz, 0, -f.fx];
    const sideN: V3 = [-f.fz, 0, f.fx];
    const up: V3 = [0, 1, 0];
    const hw = HOUSE_W / 2;
    const brick = BRICKS[Math.floor(rnd() * BRICKS.length)]!.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.04);
    const shade = brick.clone().multiplyScalar(0.78);
    const v0 = -0.6;
    // Body.
    face(solid, [P(f, -hw, v0, 0), P(f, hw, v0, 0), P(f, hw, BODY_H, 0), P(f, -hw, BODY_H, 0)], fwd, brick);
    face(solid, [P(f, -hw, v0, HOUSE_D), P(f, hw, v0, HOUSE_D), P(f, hw, BODY_H, HOUSE_D), P(f, -hw, BODY_H, HOUSE_D)], back, shade);
    face(solid, [P(f, hw, v0, 0), P(f, hw, v0, HOUSE_D), P(f, hw, BODY_H, HOUSE_D), P(f, hw, BODY_H, 0)], side, shade);
    face(solid, [P(f, -hw, v0, 0), P(f, -hw, v0, HOUSE_D), P(f, -hw, BODY_H, HOUSE_D), P(f, -hw, BODY_H, 0)], sideN, shade);
    // Stone band between the floors and a white sill course.
    face(solid, [P(f, -hw, 2.95, -0.03), P(f, hw, 2.95, -0.03), P(f, hw, 3.15, -0.03), P(f, -hw, 3.15, -0.03)], fwd, STONE);
    // Slate roof: ridge along the row, eaves overhanging the facade.
    const ridgeY = BODY_H + ROOF_H;
    const mid = HOUSE_D / 2;
    face(solid, [P(f, -hw - 0.05, BODY_H - 0.1, -0.3), P(f, hw + 0.05, BODY_H - 0.1, -0.3), P(f, hw + 0.05, ridgeY, mid), P(f, -hw - 0.05, ridgeY, mid)], [f.fx * 0.7, 0.7, f.fz * 0.7], SLATE);
    face(solid, [P(f, -hw - 0.05, BODY_H - 0.1, HOUSE_D + 0.3), P(f, hw + 0.05, BODY_H - 0.1, HOUSE_D + 0.3), P(f, hw + 0.05, ridgeY, mid), P(f, -hw - 0.05, ridgeY, mid)], [-f.fx * 0.7, 0.7, -f.fz * 0.7], SLATE_DARK);
    // Gable ends (triangles as degenerate quads).
    for (const s of [-1, 1]) {
      const u = s * hw;
      face(solid, [P(f, u, BODY_H, 0), P(f, u, BODY_H, HOUSE_D), P(f, u, ridgeY, mid), P(f, u, ridgeY, mid)], s > 0 ? side : sideN, shade);
    }
    // Chimney stack on the party wall with two pots.
    const cu = hw - 0.5;
    const cy0 = ridgeY - 0.6;
    const cy1 = ridgeY + 1.1;
    const cw = 0.45;
    const cd = 0.35;
    const chim = brick.clone().multiplyScalar(0.9);
    face(solid, [P(f, cu - cw, cy0, mid - cd), P(f, cu + cw, cy0, mid - cd), P(f, cu + cw, cy1, mid - cd), P(f, cu - cw, cy1, mid - cd)], fwd, chim);
    face(solid, [P(f, cu - cw, cy0, mid + cd), P(f, cu + cw, cy0, mid + cd), P(f, cu + cw, cy1, mid + cd), P(f, cu - cw, cy1, mid + cd)], back, chim);
    face(solid, [P(f, cu + cw, cy0, mid - cd), P(f, cu + cw, cy0, mid + cd), P(f, cu + cw, cy1, mid + cd), P(f, cu + cw, cy1, mid - cd)], side, chim);
    face(solid, [P(f, cu - cw, cy0, mid - cd), P(f, cu - cw, cy0, mid + cd), P(f, cu - cw, cy1, mid + cd), P(f, cu - cw, cy1, mid - cd)], sideN, chim);
    face(solid, [P(f, cu - cw, cy1, mid - cd), P(f, cu + cw, cy1, mid - cd), P(f, cu + cw, cy1, mid + cd), P(f, cu - cw, cy1, mid + cd)], up, STONE);
    for (const pu of [cu - 0.2, cu + 0.2]) {
      face(solid, [P(f, pu - 0.08, cy1, mid - 0.08), P(f, pu + 0.08, cy1, mid - 0.08), P(f, pu + 0.08, cy1 + 0.4, mid - 0.08), P(f, pu - 0.08, cy1 + 0.4, mid - 0.08)], fwd, new THREE.Color('#a8553a'));
    }
    // Windows: two upstairs, a bay window and the front door downstairs.
    const win = (u: number, v: number, w: number, h: number): void => {
      face(solid, [P(f, u - w / 2 - 0.1, v - 0.12, -0.03), P(f, u + w / 2 + 0.1, v - 0.12, -0.03), P(f, u + w / 2 + 0.1, v + h + 0.08, -0.03), P(f, u - w / 2 - 0.1, v + h + 0.08, -0.03)], fwd, WHITE);
      const lit = rnd() < 0.72;
      const col = lit ? LIT[Math.floor(rnd() * LIT.length)]! : DARK_GLASS[Math.floor(rnd() * DARK_GLASS.length)]!;
      face(glass, [P(f, u - w / 2, v, -0.05), P(f, u + w / 2, v, -0.05), P(f, u + w / 2, v + h, -0.05), P(f, u - w / 2, v + h, -0.05)], fwd, col);
      // Glazing bar across the middle.
      face(solid, [P(f, u - w / 2, v + h * 0.55, -0.06), P(f, u + w / 2, v + h * 0.55, -0.06), P(f, u + w / 2, v + h * 0.55 + 0.05, -0.06), P(f, u - w / 2, v + h * 0.55 + 0.05, -0.06)], fwd, WHITE);
      if (lit && rnd() < 0.62) {
        const p = P(f, u + (rnd() - 0.5) * w * 0.3, v + 0.02, -0.12);
        windows.push({ x: p[0], y: p[1], z: p[2], face: Math.atan2(f.fx, f.fz) });
      }
    };
    win(-hw / 2, 3.55, 1.15, 1.35);
    win(hw / 2, 3.55, 1.15, 1.35);
    // Bay window: a box sticking out of the ground floor with its own little roof.
    const bu = -hw / 2;
    const bw = 0.95;
    const bd = 0.6;
    face(solid, [P(f, bu - bw, v0, -bd), P(f, bu + bw, v0, -bd), P(f, bu + bw, 0.8, -bd), P(f, bu - bw, 0.8, -bd)], fwd, brick);
    face(solid, [P(f, bu - bw, 2.45, -bd - 0.1), P(f, bu + bw, 2.45, -bd - 0.1), P(f, bu + bw, 2.75, 0), P(f, bu - bw, 2.75, 0)], [f.fx * 0.5, 0.85, f.fz * 0.5], SLATE);
    for (const s of [-1, 1]) {
      face(solid, [P(f, bu + s * bw, v0, -bd), P(f, bu + s * bw, v0, 0), P(f, bu + s * bw, 2.45, 0), P(f, bu + s * bw, 2.45, -bd)], s > 0 ? side : sideN, shade);
    }
    const bayLit = rnd() < 0.8;
    face(glass, [P(f, bu - bw + 0.1, 0.9, -bd - 0.02), P(f, bu + bw - 0.1, 0.9, -bd - 0.02), P(f, bu + bw - 0.1, 2.35, -bd - 0.02), P(f, bu - bw + 0.1, 2.35, -bd - 0.02)], fwd, bayLit ? LIT[Math.floor(rnd() * LIT.length)]! : DARK_GLASS[0]!);
    if (bayLit && rnd() < 0.7) {
      const p = P(f, bu + (rnd() - 0.5) * 0.6, 0.92, -bd - 0.08);
      windows.push({ x: p[0], y: p[1], z: p[2], face: Math.atan2(f.fx, f.fz) });
    }
    // Front door with a white frame and a step.
    const du = hw / 2;
    face(solid, [P(f, du - 0.62, 0, -0.03), P(f, du + 0.62, 0, -0.03), P(f, du + 0.62, 2.45, -0.03), P(f, du - 0.62, 2.45, -0.03)], fwd, WHITE);
    face(solid, [P(f, du - 0.5, 0, -0.05), P(f, du + 0.5, 0, -0.05), P(f, du + 0.5, 2.25, -0.05), P(f, du - 0.5, 2.25, -0.05)], fwd, DOORS[Math.floor(rnd() * DOORS.length)]!);
    face(solid, [P(f, du - 0.7, 0.18, -0.45), P(f, du + 0.7, 0.18, -0.45), P(f, du + 0.7, 0.18, 0), P(f, du - 0.7, 0.18, 0)], up, STONE);
    face(solid, [P(f, du - 0.7, v0, -0.45), P(f, du + 0.7, v0, -0.45), P(f, du + 0.7, 0.18, -0.45), P(f, du - 0.7, 0.18, -0.45)], fwd, STONE);
  };

  // ── Outfield: the hill (street, pavements, lawns) and the rows climbing it ──
  const N = 96;
  const ring = (d: number): { x: number; y: number; z: number }[] => {
    const pts: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i <= N; i++) {
      const ang = -FOUL_LINE_ANGLE + (2 * FOUL_LINE_ANGLE * i) / N;
      const r = fenceDistance(def, ang) + STAND_GAP + d;
      const p = polarToXZ(ang, r);
      pts.push({ x: p.x, y: fenceHeight(def, ang) + d * STAND_RISE, z: p.z });
    }
    return pts;
  };
  const bands: [number, number, THREE.Color][] = [
    [-STAND_GAP, 0, PAVEMENT],
    [0, 1.6, PAVEMENT],
    [1.6, 4.9, TARMAC],
    [4.9, 5.1, LINE],
    [5.1, 8.4, TARMAC],
    [8.4, 10, PAVEMENT],
  ];
  let last = 10;
  for (const d of OUTFIELD_ROWS) {
    bands.push([last, d - 1.2, LAWN], [d - 1.2, d, PAVEMENT]);
    last = d + HOUSE_D;
  }
  bands.push([last, HILL, LAWN]);
  for (const [d0, d1, col] of bands) {
    const a = ring(d0);
    const b = ring(d1);
    // The pavement right behind the wall sits at wall-top level (where the physics stands start).
    const lift = col === LINE ? 0.01 : 0;
    for (let i = 0; i < N; i++) {
      if (col === LINE && i % 2 === 1) continue;
      const ya = d0 < 0 ? b[i]!.y : a[i]!.y;
      const yb = d0 < 0 ? b[i + 1]!.y : a[i + 1]!.y;
      solid.quad([a[i]!.x, ya + lift, a[i]!.z], [a[i + 1]!.x, yb + lift, a[i + 1]!.z], [b[i + 1]!.x, b[i + 1]!.y + lift, b[i + 1]!.z], [b[i]!.x, b[i]!.y + lift, b[i]!.z], col);
    }
  }
  // Retaining wall from the ground up to the hill at the back edge.
  const backRing = ring(HILL);
  for (let i = 0; i < N; i++) {
    const a = backRing[i]!;
    const b = backRing[i + 1]!;
    face(solid, [[a.x, 0, a.z], [b.x, 0, b.z], [b.x, b.y, b.z], [a.x, a.y, a.z]], [a.x, 0, a.z], STONE);
  }
  for (const d of OUTFIELD_ROWS) {
    // March along the arc one house at a time (arc length grows with radius).
    const R0 = fenceDistance(def, 0) + STAND_GAP + d;
    const count = Math.floor((2 * FOUL_LINE_ANGLE * R0) / HOUSE_W);
    for (let k = 0; k < count; k++) {
      const ang = -FOUL_LINE_ANGLE + (2 * FOUL_LINE_ANGLE * (k + 0.5)) / count;
      const r = fenceDistance(def, ang) + STAND_GAP + d;
      const p = polarToXZ(ang, r);
      const y = fenceHeight(def, ang) + d * STAND_RISE;
      house({ ox: p.x, oy: y, oz: p.z, fx: -p.x / r, fz: -p.z / r });
    }
  }

  // ── Foul territory: rows behind the old seating line, on flat ground ──
  for (const off of FOUL_ROWS) {
    let acc = HOUSE_W / 2;
    for (let i = 0; i < foulPath.length - 1; i++) {
      const a = foulPath[i]!;
      const c = foulPath[i + 1]!;
      const seg = Math.hypot(c.x - a.x, c.z - a.z);
      while (acc <= seg) {
        const t = acc / seg;
        const nx = a.nx + (c.nx - a.nx) * t;
        const nz = a.nz + (c.nz - a.nz) * t;
        const nl = Math.hypot(nx, nz) || 1;
        const x = a.x + (c.x - a.x) * t + (nx / nl) * off;
        const z = a.z + (c.z - a.z) * t + (nz / nl) * off;
        house({ ox: x, oy: 0, oz: z, fx: -nx / nl, fz: -nz / nl });
        acc += HOUSE_W;
      }
      acc -= seg;
    }
  }

  const lastRow = OUTFIELD_ROWS[OUTFIELD_ROWS.length - 1]!;
  const backD = lastRow + HOUSE_D;
  return {
    solid: solid.build(),
    glass: glass.build(),
    windows,
    cfBack: { r: fenceDistance(def, 0) + STAND_GAP + backD, y: fenceHeight(def, 0) + lastRow * STAND_RISE + BODY_H + ROOF_H },
  };
}
