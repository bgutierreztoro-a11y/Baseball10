import * as THREE from 'three';

type V3 = [number, number, number];

/**
 * Minimal mesh builder for procedural architecture (stands, walls, strips).
 * Accumulates quads with optional vertex colors and produces one
 * BufferGeometry, so a whole structure is a single draw call.
 */
export class MeshBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];
  private readonly useColor: boolean;

  constructor(useColor = false) {
    this.useColor = useColor;
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /**
   * Quad a-b-c-d, counter-clockwise when seen from its front side.
   * `uv` = [u0, v0, u1, v1] mapped a=(u0,v0) b=(u1,v0) c=(u1,v1) d=(u0,v1).
   */
  quad(a: V3, b: V3, c: V3, d: V3, color?: THREE.Color, uv: [number, number, number, number] = [0, 0, 1, 1]): void {
    const e1x = b[0] - a[0];
    const e1y = b[1] - a[1];
    const e1z = b[2] - a[2];
    const e2x = d[0] - a[0];
    const e2y = d[1] - a[1];
    const e2z = d[2] - a[2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const base = this.vertexCount;
    const uvs: [number, number][] = [
      [uv[0], uv[1]],
      [uv[2], uv[1]],
      [uv[2], uv[3]],
      [uv[0], uv[3]],
    ];
    [a, b, c, d].forEach((p, i) => {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.uv.push(uvs[i]![0], uvs[i]![1]);
      if (this.useColor) {
        const cc = color ?? WHITE;
        this.col.push(cc.r, cc.g, cc.b);
      }
    });
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.useColor) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const WHITE = new THREE.Color(1, 1, 1);

/** Flat polygon lying on the ground (points in world XZ) at height y, facing up. */
export function groundPolygon(points: { x: number; z: number }[], y: number): THREE.BufferGeometry {
  // Shape space (x, -z) rotated −90° about X maps back to world (x, ·, z) with +Y normals.
  const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, -p.z)));
  const g = new THREE.ShapeGeometry(shape, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

/** Planar UVs from world XZ so ground textures tile at a fixed world size. */
export function worldUVs(g: THREE.BufferGeometry, tileSize: number, rotation = 0): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    uv[i * 2] = (x * c - z * s) / tileSize;
    uv[i * 2 + 1] = (x * s + z * c) / tileSize;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Thin flat strip (chalk line) between two ground points. */
export function chalkLine(b: MeshBuilder, x0: number, z0: number, x1: number, z1: number, width: number, y: number): void {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const l = Math.hypot(dx, dz) || 1;
  const px = (-dz / l) * (width / 2);
  const pz = (dx / l) * (width / 2);
  // Order chosen so the face normal points up.
  b.quad([x0 - px, y, z0 - pz], [x0 + px, y, z0 + pz], [x1 + px, y, z1 + pz], [x1 - px, y, z1 - pz]);
}

export function circlePoints(cx: number, cz: number, r: number, from: number, to: number, n: number): { x: number; z: number }[] {
  const pts: { x: number; z: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    pts.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r });
  }
  return pts;
}
