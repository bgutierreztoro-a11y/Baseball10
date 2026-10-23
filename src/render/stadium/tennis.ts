import * as THREE from 'three';
import type { QualitySettings, StadiumDef } from '../../contracts';
import { DEG } from '../../config/constants';
import { fenceDistance, fenceHeight, polarToXZ } from '../../sim/field';
import { netTexture, textTexture } from '../textures';
import { MeshBuilder, chalkLine, groundPolygon } from './geom';

/**
 * Centre Court trimmings: a giant hard court painted over the outfield
 * (blue court, white lines, net with posts), the umpire's high chair at the
 * net, players' benches under umbrellas, line judges and ball kids. Pure
 * decoration: the ball flies (and rolls) through all of it.
 */
export interface TennisCourt {
  group: THREE.Group;
  update(elapsed: number): void;
  dispose(): void;
}

/** Court footprint on the outfield (m): from just past the infield dirt to the warning track. */
const NEAR_Z = 49;
const FAR_Z = 103;
/** Real court: 23.77 m long, 10.97 m wide (doubles), 8.23 m (singles), service line 6.40 m from the net. */
const SCALE = (FAR_Z - NEAR_Z) / 23.77;
const HALF_W = (10.97 / 2) * SCALE;
const HALF_SINGLES = (8.23 / 2) * SCALE;
const SERVICE = 6.4 * SCALE;
const NET_Z = (NEAR_Z + FAR_Z) / 2;
const NET_H = 1.5;
const POST_X = HALF_W + 1.1;

export function createTennisCourt(def: StadiumDef, quality: QualitySettings): TennisCourt {
  const group = new THREE.Group();
  group.name = 'tennis';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  // Same ground-decal recipe as the field (no depth writes, ordered, pulled up a little).
  const decal = (color: string, order: number): THREE.MeshStandardMaterial => {
    const m = track(new THREE.MeshStandardMaterial({ color, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, depthWrite: false }));
    m.userData.order = order;
    return m;
  };
  const addGround = (geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial): void => {
    const m = new THREE.Mesh(track(geo), mat);
    m.renderOrder = mat.userData.order as number;
    m.receiveShadow = quality.shadows;
    group.add(m);
  };

  // ── Court: a lighter run-off apron, the blue playing area and the lines ──
  const rect = (hw: number, z0: number, z1: number) => [
    { x: hw, z: z0 },
    { x: -hw, z: z0 },
    { x: -hw, z: z1 },
    { x: hw, z: z1 },
  ];
  addGround(groundPolygon(rect(HALF_W + 3.5, NEAR_Z - 3, FAR_Z + 2.5), 0.005), decal('#2f7d58', 1));
  addGround(groundPolygon(rect(HALF_W, NEAR_Z, FAR_Z), 0.009), decal('#2c5fa8', 2));
  const lines = new MeshBuilder();
  const W = 0.32;
  const y = 0.03;
  for (const z of [NEAR_Z, FAR_Z]) chalkLine(lines, HALF_W, z, -HALF_W, z, W * 1.4, y);
  for (const x of [HALF_W, -HALF_W, HALF_SINGLES, -HALF_SINGLES]) chalkLine(lines, x, NEAR_Z, x, FAR_Z, W, y);
  for (const z of [NET_Z - SERVICE, NET_Z + SERVICE]) chalkLine(lines, HALF_SINGLES, z, -HALF_SINGLES, z, W, y);
  chalkLine(lines, 0, NET_Z - SERVICE, 0, NET_Z + SERVICE, W, y);
  // Centre marks on both baselines.
  chalkLine(lines, 0, NEAR_Z, 0, NEAR_Z + 1.2, W, y);
  chalkLine(lines, 0, FAR_Z, 0, FAR_Z - 1.2, W, y);
  addGround(lines.build(), decal('#f7f7f2', 4));

  // ── Net: mesh between two posts, white tape on top, a darker band at the bottom ──
  const netTex = track(netTexture());
  netTex.repeat.set((POST_X * 2) / 0.35, NET_H / 0.35);
  const net = new THREE.Mesh(track(new THREE.PlaneGeometry(POST_X * 2, NET_H - 0.12)), track(new THREE.MeshBasicMaterial({ map: netTex, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })));
  net.position.set(0, (NET_H - 0.12) / 2, NET_Z);
  group.add(net);
  const white = track(new THREE.MeshStandardMaterial({ color: '#f7f7f2', roughness: 0.6 }));
  const tape = new THREE.Mesh(track(new THREE.BoxGeometry(POST_X * 2, 0.14, 0.05)), white);
  tape.position.set(0, NET_H - 0.07, NET_Z);
  group.add(tape);
  const strap = new THREE.Mesh(track(new THREE.BoxGeometry(0.12, NET_H, 0.04)), white);
  strap.position.set(0, NET_H / 2, NET_Z);
  group.add(strap);
  const postMat = track(new THREE.MeshStandardMaterial({ color: '#1d4a30', roughness: 0.4, metalness: 0.5 }));
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.12, 0.12, NET_H + 0.15, 12)), postMat);
    post.position.set(side * POST_X, (NET_H + 0.15) / 2, NET_Z);
    post.castShadow = quality.shadows;
    group.add(post);
  }

  // ── People and furniture ──
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color: string): THREE.MeshStandardMaterial => {
    let m = mats.get(color);
    if (!m) {
      m = track(new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
      mats.set(color, m);
    }
    return m;
  };
  const geos = new Map<string, THREE.BufferGeometry>();
  const shape = (key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry => {
    let g = geos.get(key);
    if (!g) {
      g = track(make());
      geos.set(key, g);
    }
    return g;
  };
  const part = (parent: THREE.Object3D, g: THREE.BufferGeometry, color: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.Mesh => {
    const m = new THREE.Mesh(g, mat(color));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = quality.shadows;
    parent.add(m);
    return m;
  };
  const SKIN = ['#f0cdb4', '#c68c5a', '#8a5a3c', '#e3b894'];
  let who = 0;
  /**
   * A court official: polo, trousers, cap or panama hat. `sit` lowers the hips
   * (umpire, judges on chairs); `crouch` folds a ball kid on one knee.
   */
  const official = (x: number, z: number, face: number, shirt: string, pants: string, opts: { sit?: boolean; crouch?: boolean; hat?: 'cap' | 'panama'; scale?: number } = {}): THREE.Group => {
    const g = new THREE.Group();
    const skin = SKIN[who++ % SKIN.length]!;
    const hip = opts.crouch ? 0.42 : opts.sit ? 0.5 : 0.92;
    const capsule = shape('limb', () => new THREE.CapsuleGeometry(0.07, 0.36, 3, 8));
    if (opts.sit) {
      for (const sd of [-1, 1]) {
        const th = part(g, capsule, pants, sd * 0.1, hip, 0.2);
        th.rotation.x = Math.PI / 2;
        part(g, capsule, pants, sd * 0.1, hip / 2, 0.4, 1, hip / 0.5, 1);
      }
    } else if (opts.crouch) {
      part(g, capsule, pants, 0.1, 0.3, 0.12).rotation.x = 0.9;
      part(g, capsule, pants, -0.1, 0.18, -0.08).rotation.x = Math.PI / 2;
    } else {
      for (const sd of [-1, 1]) part(g, capsule, pants, sd * 0.1, hip / 2, 0, 1, hip / 0.5, 1);
    }
    const torso = part(g, shape('torso', () => new THREE.CapsuleGeometry(0.17, 0.32, 3, 10)), shirt, 0, hip + 0.32, opts.crouch ? 0.06 : 0);
    if (opts.crouch) torso.rotation.x = 0.35;
    for (const sd of [-1, 1]) {
      const arm = part(g, capsule, shirt, sd * 0.24, hip + 0.3, opts.sit || opts.crouch ? 0.1 : 0, 0.75, 0.9, 0.75);
      arm.rotation.set(opts.sit || opts.crouch ? 0.7 : 0, 0, sd * 0.12);
    }
    const head = part(g, shape('head', () => new THREE.SphereGeometry(0.12, 12, 8)), skin, 0, hip + 0.72, opts.crouch ? 0.14 : 0);
    if (opts.hat === 'panama') {
      part(head, shape('brim', () => new THREE.CylinderGeometry(0.22, 0.22, 0.015, 16)), '#f2ead2', 0, 0.07, 0);
      part(head, shape('crown', () => new THREE.CylinderGeometry(0.1, 0.12, 0.1, 14)), '#f2ead2', 0, 0.12, 0);
      part(head, shape('band', () => new THREE.CylinderGeometry(0.121, 0.121, 0.025, 14)), '#5a2d86', 0, 0.09, 0);
    } else if (opts.hat === 'cap') {
      part(head, shape('cap', () => new THREE.SphereGeometry(0.125, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), shirt, 0, 0.02, 0);
      part(head, shape('bill', () => new THREE.BoxGeometry(0.16, 0.015, 0.12)), shirt, 0, 0.03, 0.12);
    }
    g.position.set(x, 0, z);
    g.rotation.y = face;
    g.scale.setScalar(opts.scale ?? 1);
    group.add(g);
    return g;
  };
  /** Rotation that makes a figure at (x, z) look at (tx, tz). */
  const facing = (x: number, z: number, tx: number, tz: number): number => Math.atan2(tx - x, tz - z);

  // Umpire's high chair beside the net post on the 3B side (+X), the umpire up top.
  const chair = new THREE.Group();
  const chairX = POST_X + 2.2;
  const wood = '#20543a';
  const leg = shape('chairLeg', () => new THREE.BoxGeometry(0.1, 2.3, 0.1));
  for (const [dx, dz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]] as const) part(chair, leg, wood, dx, 1.15, dz);
  for (let k = 0; k < 5; k++) part(chair, shape('rung', () => new THREE.BoxGeometry(0.9, 0.05, 0.06)), wood, 0, 0.35 + k * 0.42, 0.5);
  part(chair, shape('deck', () => new THREE.BoxGeometry(1.1, 0.1, 1.1)), wood, 0, 2.32, 0);
  part(chair, shape('chairBack', () => new THREE.BoxGeometry(1.1, 0.8, 0.08)), wood, 0, 2.75, 0.55);
  part(chair, shape('apron', () => new THREE.BoxGeometry(1.12, 0.5, 0.04)), '#5a2d86', 0, 2.05, -0.57);
  chair.position.set(chairX, 0, NET_Z);
  // Back to the stands, the umpire looking across the net (−X).
  chair.rotation.y = Math.PI / 2;
  group.add(chair);
  const ump = official(0, 0, Math.PI, '#1e3a5f', '#e9e2cf', { sit: true, hat: 'panama' });
  group.remove(ump);
  ump.position.set(0, 2.37, 0.1);
  chair.add(ump);

  // Players' benches with umbrellas on both sides of the umpire's chair.
  for (const dz of [-3.2, 3.2]) {
    const bench = new THREE.Group();
    part(bench, shape('bench', () => new THREE.BoxGeometry(0.6, 0.5, 1.4)), '#2a6b40', 0, 0.25, 0);
    part(bench, shape('pole', () => new THREE.CylinderGeometry(0.03, 0.03, 2.4, 8)), '#d8d8d8', 0.2, 1.2, 0);
    part(bench, shape('umbrella', () => new THREE.ConeGeometry(1.3, 0.5, 12, 1, true)), dz < 0 ? '#5a2d86' : '#1f5a35', 0.2, 2.35, 0);
    bench.position.set(chairX + 1.2, 0, NET_Z + dz);
    group.add(bench);
  }
  // Open umbrella cones are seen from below.
  mat('#5a2d86').side = THREE.DoubleSide;
  mat('#1f5a35').side = THREE.DoubleSide;

  // Line judges: seated at the corners of the court, looking down their line.
  for (const [x, z] of [
    [HALF_W + 2.2, NEAR_Z - 1.5],
    [-HALF_W - 2.2, NEAR_Z - 1.5],
    [HALF_W + 2.2, FAR_Z + 1.5],
    [-HALF_W - 2.2, FAR_Z + 1.5],
  ] as const) {
    official(x, z, facing(x, z, x, NET_Z), '#1e3a5f', '#e9e2cf', { sit: true, hat: 'cap' });
    part(group, shape('stool', () => new THREE.BoxGeometry(0.5, 0.45, 0.5)), '#20543a', x, 0.22, z);
  }
  // Ball kids crouching at the net posts and at the far baseline.
  for (const [x, z] of [
    [POST_X + 0.6, NET_Z - 0.9],
    [-POST_X - 0.6, NET_Z + 0.9],
    [HALF_W * 0.5, FAR_Z + 2.2],
    [-HALF_W * 0.5, NEAR_Z - 2.2],
  ] as const) {
    official(x, z, facing(x, z, 0, NET_Z), '#5a2d86', '#1f5a35', { crouch: true, hat: 'cap', scale: 0.85 });
  }

  // Courtside boards on the wall, between the distance markers.
  ['SILENCIO, POR FAVOR', 'JUEGO, SET Y PARTIDO', 'ACE · 40 – 15', 'QUIET PLEASE'].forEach((text, i) => {
    const ang = [-33, -11, 11, 33][i]! * DEG;
    const h = fenceHeight(def, ang);
    const tex = track(textTexture(text, { color: '#f4f1e8', w: 512, h: 96 }));
    const board = new THREE.Mesh(track(new THREE.PlaneGeometry(9, 1.3)), track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })));
    const p = polarToXZ(ang, fenceDistance(def, ang) - 0.3);
    board.position.set(p.x, Math.min(h * 0.35, 1.1), p.z);
    board.lookAt(0, board.position.y, 0);
    group.add(board);
  });

  // A few oversized tennis balls lying on the run-off.
  const ballTex = track(tennisBallTexture());
  const ballMat = track(new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.95 }));
  for (const [x, z, r] of [
    [HALF_W + 2.6, FAR_Z - 4, 0.45],
    [-HALF_W - 2.4, NET_Z + 9, 0.45],
    [-HALF_W - 1.8, NEAR_Z + 3, 0.45],
  ] as const) {
    const b = new THREE.Mesh(track(new THREE.SphereGeometry(r, 18, 12)), ballMat);
    b.position.set(x, r, z);
    b.rotation.set(x, z, 0);
    b.castShadow = quality.shadows;
    group.add(b);
  }

  return {
    group,
    update(elapsed) {
      // The net breathes in the breeze.
      net.position.z = NET_Z + Math.sin(elapsed * 1.3) * 0.03;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}

/** Optic-yellow felt with the white curved seam. */
function tennisBallTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#d4ec3a';
  ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = '#f7f7ee';
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let x = 0; x <= 128; x += 2) {
    const yy = 32 + Math.sin((x / 128) * Math.PI * 4) * 18;
    if (x === 0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  }
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
