import * as THREE from 'three';
import type { QualitySettings, StadiumDef } from '../../contracts';
import { DEG } from '../../config/constants';
import { fenceDistance, polarToXZ } from '../../sim/field';
import { seeded, windowsTexture } from '../textures';
import { MeshBuilder } from './geom';
import type { Atmosphere } from './atmosphere';
import { mergeSimple } from './structures';
import { createRain } from './weather';

/**
 * Backdrop outside the ballpark: terrain, sea (Malecón), mountains (Cumbre),
 * skyline (Metro/Final), trees and houses (El Solar), the Danube with
 * Bratislava Castle and the UFO bridge (Bratislava), the rainy town, its
 * port cranes and a cruise ship (Southampton).
 */
export interface Scenery {
  group: THREE.Group;
  update(elapsed: number): void;
  dispose(): void;
}

export function createScenery(def: StadiumDef, quality: QualitySettings, atm: Atmosphere): Scenery {
  const group = new THREE.Group();
  group.name = 'scenery';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const rnd = seeded(def.id.charCodeAt(0) * 131);
  const updaters: ((t: number) => void)[] = [];

  // Outer terrain.
  const terrainColor = atm.night ? '#0d1410' : def.id === 'malecon' ? '#3b3330' : def.id === 'cumbre' ? '#6e7c55' : def.id === 'southampton' ? '#44523d' : def.id === 'gimnasio' ? '#17181b' : '#5a7a3a';
  const terrain = new THREE.Mesh(track(new THREE.CircleGeometry(2300, 48)), track(new THREE.MeshLambertMaterial({ color: terrainColor })));
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -0.08;
  terrain.receiveShadow = false;
  group.add(terrain);

  if (def.features.sea) {
    const seaUniforms = { uTime: { value: 0 } };
    const seaMat = track(new THREE.MeshStandardMaterial({ color: '#1f4e63', roughness: 0.18, metalness: 0.15 }));
    seaMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = seaUniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSeaPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSeaPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vSeaPos;')
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            vec2 p = vSeaPos.xz * 0.045;
            float w1 = sin(p.x * 3.1 + uTime * 0.9) * cos(p.y * 2.3 + uTime * 0.7);
            float w2 = sin(p.x * 7.3 - uTime * 1.4 + p.y * 5.1) * 0.5;
            vec3 pert = vec3(w1 * 0.12 + w2 * 0.06, 0.0, cos(p.y * 4.1 + uTime) * 0.1);
            normal = normalize(normal + (viewMatrix * vec4(pert, 0.0)).xyz);
          }`,
        );
    };
    const sea = new THREE.Mesh(track(new THREE.RingGeometry(235, 2300, 64, 1)), seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.5;
    group.add(sea);
    updaters.push((t) => (seaUniforms.uTime.value = t));

    // Seawall + palms around the park.
    const wall = new THREE.Mesh(track(new THREE.CylinderGeometry(236, 236, 2.2, 96, 1, true)), track(new THREE.MeshStandardMaterial({ color: '#c9b9a0', roughness: 0.9, side: THREE.DoubleSide })));
    wall.position.y = 0.5;
    group.add(wall);
    group.add(createPalms(rnd, track));
  }

  if (def.features.mountains) {
    const peaks: THREE.BufferGeometry[] = [];
    const snow: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rnd() * 0.15;
      const r = 700 + rnd() * 600;
      const h = 160 + rnd() * 340;
      const rad = 220 + rnd() * 220;
      const cone = new THREE.ConeGeometry(rad, h, 6 + Math.floor(rnd() * 3), 1);
      cone.translate(Math.cos(a) * r, h / 2 - 10, Math.sin(a) * r);
      peaks.push(cone);
      const capH = h * 0.28;
      const cap = new THREE.ConeGeometry(rad * 0.28 * 1.02, capH, 6, 1);
      cap.translate(Math.cos(a) * r, h - 10 - capH / 2 + 0.5, Math.sin(a) * r);
      snow.push(cap);
    }
    const m1 = new THREE.Mesh(track(mergeSimple(peaks)), track(new THREE.MeshLambertMaterial({ color: '#4f6275', flatShading: true })));
    const m2 = new THREE.Mesh(track(mergeSimple(snow)), track(new THREE.MeshLambertMaterial({ color: '#f4f8fc', flatShading: true })));
    peaks.forEach((g) => g.dispose());
    snow.forEach((g) => g.dispose());
    group.add(m1, m2);
  }

  if (def.features.skyline) {
    const tex = track(windowsTexture(atm.night, 7));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const b = new MeshBuilder();
    const count = quality.tier === 'low' ? 60 : 120;
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      // Keep the area behind home plate clearer so the title orbit stays readable.
      const r = 330 + rnd() * 420;
      const w = 18 + rnd() * 34;
      const d = 18 + rnd() * 30;
      const h = 30 + Math.pow(rnd(), 1.8) * 210;
      box(b, Math.cos(a) * r, Math.sin(a) * r, w, d, h, a);
    }
    const mat = track(
      new THREE.MeshStandardMaterial({
        map: tex,
        emissiveMap: atm.night ? tex : null,
        emissive: atm.night ? new THREE.Color('#ffe2b0') : new THREE.Color(0),
        emissiveIntensity: atm.night ? 0.75 : 0,
        roughness: 0.8,
        color: atm.night ? '#3a4255' : '#9aa6b8',
      }),
    );
    group.add(new THREE.Mesh(track(b.build()), mat));
  }

  if (def.features.sandlot) {
    group.add(createTrees(def, rnd, track));
    group.add(createHouses(rnd, track));
  }

  if (def.features.bratislava) {
    group.add(createBratislava(rnd, track));
  }

  if (def.features.southampton) {
    group.add(createSouthampton(rnd, track));
  }

  if (def.features.rain) {
    const rain = track(createRain(quality));
    group.add(rain.points);
    updaters.push((t) => rain.update(t));
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

/** Building box with windows UV-scaled to a constant world size. */
function box(b: MeshBuilder, cx: number, cz: number, w: number, d: number, h: number, rot: number): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const P = (x: number, y: number, z: number): [number, number, number] => [cx + x * c - z * s, y, cz + x * s + z * c];
  const hw = w / 2;
  const hd = d / 2;
  const uw = w / 9;
  const ud = d / 9;
  const vh = h / 18;
  b.quad(P(-hw, 0, hd), P(hw, 0, hd), P(hw, h, hd), P(-hw, h, hd), undefined, [0, 0, uw, vh]);
  b.quad(P(hw, 0, -hd), P(-hw, 0, -hd), P(-hw, h, -hd), P(hw, h, -hd), undefined, [0, 0, uw, vh]);
  b.quad(P(hw, 0, hd), P(hw, 0, -hd), P(hw, h, -hd), P(hw, h, hd), undefined, [0, 0, ud, vh]);
  b.quad(P(-hw, 0, -hd), P(-hw, 0, hd), P(-hw, h, hd), P(-hw, h, -hd), undefined, [0, 0, ud, vh]);
  b.quad(P(-hw, h, hd), P(hw, h, hd), P(hw, h, -hd), P(-hw, h, -hd), undefined, [0, 0, 0.01, 0.01]);
}

function createTrees(def: StadiumDef, rnd: () => number, track: <T extends { dispose(): void }>(x: T) => T): THREE.Group {
  const g = new THREE.Group();
  const foliage: THREE.BufferGeometry[] = [];
  const trunks: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 70; i++) {
    const sprayDeg = -80 + rnd() * 160;
    const a = sprayDeg * DEG;
    const base = Math.abs(sprayDeg) <= 45 ? fenceDistance(def, a) + 40 : 70;
    const r = base + rnd() * 120;
    const p = polarToXZ(a, r);
    const h = 9 + rnd() * 10;
    const y0 = Math.abs(sprayDeg) <= 45 ? 34 * 0.53 * Math.min(1, (r - base + 40) / 40) : 0;
    const trunk = new THREE.CylinderGeometry(0.35, 0.5, h * 0.4, 6);
    trunk.translate(p.x, y0 + h * 0.2, p.z);
    trunks.push(trunk);
    for (let k = 0; k < 3; k++) {
      const s = new THREE.IcosahedronGeometry(h * (0.32 - k * 0.05), 0);
      s.translate(p.x + (rnd() - 0.5) * 2, y0 + h * (0.5 + k * 0.17), p.z + (rnd() - 0.5) * 2);
      foliage.push(s);
    }
  }
  g.add(new THREE.Mesh(track(mergeSimple(trunks)), track(new THREE.MeshLambertMaterial({ color: '#5b4632' }))));
  g.add(new THREE.Mesh(track(mergeSimple(foliage)), track(new THREE.MeshLambertMaterial({ color: '#3f7d34', flatShading: true }))));
  trunks.forEach((t) => t.dispose());
  foliage.forEach((t) => t.dispose());
  return g;
}

function createHouses(rnd: () => number, track: <T extends { dispose(): void }>(x: T) => T): THREE.Group {
  const g = new THREE.Group();
  const walls = new MeshBuilder(true);
  const palette = ['#f4d35e', '#ee964b', '#f95738', '#83c5be', '#e5e5e5', '#a3c4f3'].map((c) => new THREE.Color(c));
  const roofs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 230 + rnd() * 160;
    const w = 8 + rnd() * 6;
    const d = 7 + rnd() * 5;
    const h = 4 + rnd() * 4;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const col = palette[Math.floor(rnd() * palette.length)]!;
    const hw = w / 2;
    const hd = d / 2;
    walls.quad([cx - hw, 0, cz + hd], [cx + hw, 0, cz + hd], [cx + hw, h, cz + hd], [cx - hw, h, cz + hd], col);
    walls.quad([cx + hw, 0, cz - hd], [cx - hw, 0, cz - hd], [cx - hw, h, cz - hd], [cx + hw, h, cz - hd], col);
    walls.quad([cx + hw, 0, cz + hd], [cx + hw, 0, cz - hd], [cx + hw, h, cz - hd], [cx + hw, h, cz + hd], col);
    walls.quad([cx - hw, 0, cz - hd], [cx - hw, 0, cz + hd], [cx - hw, h, cz + hd], [cx - hw, h, cz - hd], col);
    const roof = new THREE.ConeGeometry(Math.max(w, d) * 0.78, 3, 4);
    roof.rotateY(Math.PI / 4);
    roof.translate(cx, h + 1.5, cz);
    roofs.push(roof);
  }
  g.add(new THREE.Mesh(track(walls.build()), track(new THREE.MeshLambertMaterial({ vertexColors: true }))));
  g.add(new THREE.Mesh(track(mergeSimple(roofs)), track(new THREE.MeshLambertMaterial({ color: '#8c3b2e', flatShading: true }))));
  roofs.forEach((r) => r.dispose());
  return g;
}

function createPalms(rnd: () => number, track: <T extends { dispose(): void }>(x: T) => T): THREE.Group {
  const g = new THREE.Group();
  const trunks: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 205 + rnd() * 25;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 10 + rnd() * 7;
    const lean = (rnd() - 0.5) * 0.25;
    const t = new THREE.CylinderGeometry(0.25, 0.4, h, 6);
    t.rotateZ(lean);
    t.translate(x, h / 2, z);
    trunks.push(t);
    for (let k = 0; k < 7; k++) {
      const leaf = new THREE.ConeGeometry(0.7, 5.5, 3, 1);
      leaf.rotateZ(Math.PI / 2 + 0.5);
      leaf.translate(2.6, 0, 0);
      leaf.rotateY((k / 7) * Math.PI * 2 + rnd() * 0.3);
      leaf.translate(x - Math.sin(lean) * h, h, z);
      leaves.push(leaf);
    }
  }
  g.add(new THREE.Mesh(track(mergeSimple(trunks)), track(new THREE.MeshLambertMaterial({ color: '#6b5440' }))));
  g.add(new THREE.Mesh(track(mergeSimple(leaves)), track(new THREE.MeshLambertMaterial({ color: '#2f6b3a', flatShading: true, side: THREE.DoubleSide }))));
  trunks.forEach((x) => x.dispose());
  leaves.forEach((x) => x.dispose());
  return g;
}

/**
 * Bratislava behind the outfield (+Z): the Danube running across the view,
 * the castle on its hill above the river (left-centre: a white block with four
 * corner towers and red roofs) and the UFO bridge (Most SNP, right-centre): a
 * leaning A-shaped pylon on the near bank topped by the flying-saucer
 * restaurant, with stay cables fanning out to the deck across the river.
 * Everything is oversized a little so it reads over the bleachers.
 */
function createBratislava(rnd: () => number, track: <T extends { dispose(): void }>(x: T) => T): THREE.Group {
  const g = new THREE.Group();
  g.name = 'bratislava';
  const lambert = (color: string, extra: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial => track(new THREE.MeshLambertMaterial({ color, ...extra }));
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh => {
    const m = new THREE.Mesh(track(geo), mat);
    g.add(m);
    return m;
  };

  // The Danube: a wide band across the view, then the far bank.
  const RIVER_NEAR = 360;
  const RIVER_FAR = 470;
  const river = add(new THREE.PlaneGeometry(4000, RIVER_FAR - RIVER_NEAR), track(new THREE.MeshStandardMaterial({ color: '#41708a', roughness: 0.25, metalness: 0.2 })));
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, 0.05, (RIVER_NEAR + RIVER_FAR) / 2);

  // Castle hill (left-centre, on the far bank) with a few trees.
  const HX = 175;
  const HZ = 600;
  const HILL_H = 70;
  const hill = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  hill.scale(170, HILL_H, 120);
  hill.translate(HX, 0, HZ);
  add(hill, lambert('#4f7d3a', { flatShading: true }));
  const trees: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 60; i++) {
    const a = rnd() * Math.PI * 2;
    const k = 0.55 + rnd() * 0.4;
    const x = HX + Math.cos(a) * 170 * k;
    const z = HZ + Math.sin(a) * 120 * k;
    const y = HILL_H * Math.sqrt(Math.max(0, 1 - k * k)) - 2;
    const t = new THREE.IcosahedronGeometry(7 + rnd() * 5, 0);
    t.translate(x, y + 5, z);
    trees.push(t);
  }
  add(mergeSimple(trees), lambert('#3c6b2f', { flatShading: true }));
  trees.forEach((t) => t.dispose());

  // Bratislava Castle: white rectangular palace, red hipped roof, four corner towers.
  const white = lambert('#f1ece0');
  const roofRed = lambert('#b8432f', { flatShading: true });
  const CW = 110;
  const CD = 70;
  const CH = 42;
  const base = HILL_H - 4;
  const body = new THREE.BoxGeometry(CW, CH, CD);
  body.translate(HX, base + CH / 2, HZ);
  const walls: THREE.BufferGeometry[] = [body];
  const roofs: THREE.BufferGeometry[] = [];
  const mainRoof = new THREE.ConeGeometry(1, 1, 4, 1);
  mainRoof.rotateY(Math.PI / 4);
  mainRoof.scale((CW / 2) * 1.414, 22, (CD / 2) * 1.414);
  mainRoof.translate(HX, base + CH + 11, HZ);
  roofs.push(mainRoof);
  const TW = 22;
  const TH = CH + 26;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const tx = HX + sx * (CW / 2 - TW / 2 + 3);
      const tz = HZ + sz * (CD / 2 - TW / 2 + 3);
      const tower = new THREE.BoxGeometry(TW, TH, TW);
      tower.translate(tx, base + TH / 2, tz);
      walls.push(tower);
      const cap = new THREE.ConeGeometry(TW * 0.75, 18, 4, 1);
      cap.rotateY(Math.PI / 4);
      cap.translate(tx, base + TH + 9, tz);
      roofs.push(cap);
    }
  }
  add(mergeSimple(walls), white);
  add(mergeSimple(roofs), roofRed);
  walls.forEach((w) => w.dispose());
  roofs.forEach((r) => r.dispose());
  // Rows of dark windows on the facade facing the ballpark.
  const winTex = track(castleWindowsTexture());
  const facade = add(new THREE.PlaneGeometry(CW - TW * 2 + 4, CH - 8), track(new THREE.MeshLambertMaterial({ map: winTex, transparent: true })));
  facade.position.set(HX, base + CH / 2 + 2, HZ - CD / 2 - 0.3);
  facade.rotation.y = Math.PI;

  // Old-town roofs at the foot of the hill.
  const houses = new MeshBuilder(true);
  const houseCols = ['#efe6d2', '#e9d8b4', '#f3efe6', '#d9c7a3'].map((c) => new THREE.Color(c));
  const houseRoofs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 46; i++) {
    const cx = HX - 260 + rnd() * 420;
    const cz = RIVER_FAR + 25 + rnd() * 60;
    if (Math.abs(cx - HX) < 120 && cz > HZ - 140) continue;
    const w = 12 + rnd() * 10;
    const d = 10 + rnd() * 8;
    const h = 10 + rnd() * 12;
    const col = houseCols[Math.floor(rnd() * houseCols.length)]!;
    const hw = w / 2;
    const hd = d / 2;
    houses.quad([cx - hw, 0, cz - hd], [cx + hw, 0, cz - hd], [cx + hw, h, cz - hd], [cx - hw, h, cz - hd], col);
    houses.quad([cx + hw, 0, cz - hd], [cx + hw, 0, cz + hd], [cx + hw, h, cz + hd], [cx + hw, h, cz - hd], col);
    houses.quad([cx - hw, 0, cz + hd], [cx - hw, 0, cz - hd], [cx - hw, h, cz - hd], [cx - hw, h, cz + hd], col);
    const roof = new THREE.ConeGeometry(Math.max(w, d) * 0.75, 7, 4);
    roof.rotateY(Math.PI / 4);
    roof.translate(cx, h + 3.5, cz);
    houseRoofs.push(roof);
  }
  add(houses.build(), lambert('#ffffff', { vertexColors: true }));
  add(mergeSimple(houseRoofs), roofRed);
  houseRoofs.forEach((r) => r.dispose());

  // UFO bridge (Most SNP): pylon on the near bank, deck across the river.
  const BX = -150;
  const steel = track(new THREE.MeshStandardMaterial({ color: '#d9dde2', roughness: 0.45, metalness: 0.55 }));
  const PZ = RIVER_NEAR - 18;
  const TOP = new THREE.Vector3(BX, 150, PZ - 22);
  const parts: THREE.BufferGeometry[] = [];
  const beam = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number): void => {
    const len = a.distanceTo(b);
    const c = new THREE.CylinderGeometry(r1, r0, len, 8, 1);
    c.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    c.applyQuaternion(q);
    c.translate(a.x, a.y, a.z);
    parts.push(c);
  };
  // Two legs leaning back from the bank, joining under the saucer.
  for (const s of [-1, 1]) beam(new THREE.Vector3(BX + s * 26, 0, PZ + 6), TOP.clone().add(new THREE.Vector3(s * 3, -6, 0)), 4.2, 2.6);
  // Deck: from the near bank across the Danube to the old town.
  const DECK_Y = 16;
  const deck = new THREE.BoxGeometry(34, 4, RIVER_FAR - PZ + 50);
  deck.translate(BX, DECK_Y, (PZ + RIVER_FAR + 50) / 2);
  parts.push(deck);
  for (const z of [RIVER_NEAR + 40, RIVER_NEAR + 80]) {
    for (const s of [-1, 1]) beam(new THREE.Vector3(BX + s * 12, 0, z), new THREE.Vector3(BX + s * 12, DECK_Y - 2, z), 2.2, 2.2);
  }
  add(mergeSimple(parts), steel);
  parts.forEach((p) => p.dispose());
  // Stay cables fanning from the pylon to the deck edges.
  const cablePts: number[] = [];
  for (let i = 1; i <= 6; i++) {
    const z = PZ + 15 + i * ((RIVER_FAR - PZ) / 6);
    for (const s of [-1, 1]) {
      const top = TOP.clone().add(new THREE.Vector3(s * 3, -14 - i * 4, 0));
      cablePts.push(top.x, top.y, top.z, BX + s * 16, DECK_Y + 2, z);
    }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cablePts, 3));
  g.add(new THREE.LineSegments(track(cg), track(new THREE.LineBasicMaterial({ color: '#c3c9cf' }))));
  // The saucer ("UFO") on top: a flattened lens with a glazed band.
  const saucer = new THREE.SphereGeometry(1, 32, 12);
  saucer.scale(30, 7.5, 30);
  const ufo = add(saucer, steel);
  ufo.position.copy(TOP).add(new THREE.Vector3(0, 4, 0));
  const band = add(new THREE.CylinderGeometry(29, 29, 3.6, 32, 1, true), track(new THREE.MeshStandardMaterial({ color: '#2a3542', roughness: 0.2, metalness: 0.6, emissive: '#ffcf7a', emissiveIntensity: 0.25 })));
  band.position.copy(ufo.position);
  const dome = add(new THREE.SphereGeometry(9, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel);
  dome.position.copy(ufo.position).add(new THREE.Vector3(0, 5, 0));
  const mast = add(new THREE.CylinderGeometry(0.6, 0.9, 16, 6), steel);
  mast.position.copy(dome.position).add(new THREE.Vector3(0, 14, 0));
  return g;
}

/**
 * Southampton beyond the houses: more terraced streets all round, a church
 * spire, and behind centre field the docks on Southampton Water with
 * container cranes and a moored cruise ship.
 */
function createSouthampton(rnd: () => number, track: <T extends { dispose(): void }>(x: T) => T): THREE.Group {
  const g = new THREE.Group();
  g.name = 'southampton';
  const lambert = (color: string, extra: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial => track(new THREE.MeshLambertMaterial({ color, ...extra }));
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh => {
    const m = new THREE.Mesh(track(geo), mat);
    g.add(m);
    return m;
  };

  // Distant terraced streets: long brick blocks with slate gable roofs.
  const walls = new MeshBuilder(true);
  const roofs: THREE.BufferGeometry[] = [];
  const bricks = ['#7d4334', '#8f5241', '#6b3a2e', '#a26450', '#cfc4b0'].map((c) => new THREE.Color(c));
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2;
    // Keep the docks clear behind centre field.
    if (Math.abs(Math.atan2(Math.cos(a), Math.sin(a))) < 0.5) continue;
    const r = 240 + rnd() * 260;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const w = 30 + rnd() * 40;
    const d = 8;
    const h = 6 + rnd() * 2;
    const rot = a + Math.PI / 2;
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    const P = (x: number, y: number, z: number): [number, number, number] => [cx + x * c - z * sn, y, cz + x * sn + z * c];
    const col = bricks[Math.floor(rnd() * bricks.length)]!;
    const hw = w / 2;
    const hd = d / 2;
    walls.quad(P(-hw, 0, hd), P(hw, 0, hd), P(hw, h, hd), P(-hw, h, hd), col);
    walls.quad(P(hw, 0, -hd), P(-hw, 0, -hd), P(-hw, h, -hd), P(hw, h, -hd), col);
    walls.quad(P(hw, 0, hd), P(hw, 0, -hd), P(hw, h, -hd), P(hw, h, hd), col);
    walls.quad(P(-hw, 0, -hd), P(-hw, 0, hd), P(-hw, h, hd), P(-hw, h, -hd), col);
    // Gable roof: a triangular prism along the block.
    const roof = new THREE.CylinderGeometry(hd * 1.15, hd * 1.15, w, 3, 1);
    roof.rotateZ(Math.PI / 2);
    roof.rotateX(Math.PI / 2);
    roof.scale(1, 0.55, 1);
    roof.rotateY(-rot);
    roof.translate(cx, h + hd * 0.3, cz);
    roofs.push(roof);
  }
  add(walls.build(), lambert('#ffffff', { vertexColors: true }));
  add(mergeSimple(roofs), lambert('#3b4149', { flatShading: true }));
  roofs.forEach((r) => r.dispose());

  // Church: stone tower with a slate spire, off to the left of the view.
  const church = new THREE.Group();
  const stone = lambert('#8c8a83');
  const tower = new THREE.Mesh(track(new THREE.BoxGeometry(12, 34, 12)), stone);
  tower.position.y = 17;
  const spire = new THREE.Mesh(track(new THREE.ConeGeometry(8, 30, 4)), lambert('#3e454d', { flatShading: true }));
  spire.position.y = 34 + 15;
  spire.rotation.y = Math.PI / 4;
  const nave = new THREE.Mesh(track(new THREE.BoxGeometry(16, 16, 40)), stone);
  nave.position.set(0, 8, -24);
  church.add(tower, spire, nave);
  church.position.set(260, 0, 330);
  church.rotation.y = -0.6;
  g.add(church);

  // Southampton Water behind centre field, with the quay.
  const WATER = 560;
  const water = add(new THREE.PlaneGeometry(4000, 1600), track(new THREE.MeshStandardMaterial({ color: '#48606d', roughness: 0.3, metalness: 0.2 })));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.1, WATER + 800);
  const quay = add(new THREE.BoxGeometry(900, 3, 30), lambert('#6f716f'));
  quay.position.set(0, 1.5, WATER - 10);

  // Container cranes along the quay (A-frame legs, a boom reaching over the water).
  const craneMat = lambert('#d9a521');
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const x = -260 + i * 70 + (rnd() - 0.5) * 12;
    for (const lx of [-9, 9]) {
      for (const lz of [-8, 8]) {
        const leg = new THREE.BoxGeometry(1.6, 42, 1.6);
        leg.translate(x + lx, 21, WATER - 10 + lz);
        parts.push(leg);
      }
    }
    const beam = new THREE.BoxGeometry(22, 3, 20);
    beam.translate(x, 42, WATER - 10);
    parts.push(beam);
    const boom = new THREE.BoxGeometry(3.2, 3.2, 90);
    boom.translate(x, 46, WATER + 20);
    parts.push(boom);
    const cab = new THREE.BoxGeometry(6, 5, 7);
    cab.translate(x, 40, WATER + 6);
    parts.push(cab);
  }
  add(mergeSimple(parts), craneMat);
  parts.forEach((p) => p.dispose());

  // A cruise ship moored at the quay: white hull with a blue band, decks and a red funnel.
  const ship = new THREE.Group();
  const white = lambert('#f1f2ee');
  const hull = new THREE.Mesh(track(new THREE.BoxGeometry(240, 22, 34)), white);
  hull.position.y = 11;
  const band = new THREE.Mesh(track(new THREE.BoxGeometry(241, 4, 35)), lambert('#1d2b4f'));
  band.position.y = 4;
  ship.add(hull, band);
  for (let k = 0; k < 5; k++) {
    const deck = new THREE.Mesh(track(new THREE.BoxGeometry(200 - k * 26, 6, 30 - k * 2)), white);
    deck.position.set(-8 - k * 4, 25 + k * 6, 0);
    ship.add(deck);
    const windows = new THREE.Mesh(track(new THREE.BoxGeometry(200 - k * 26 + 0.2, 1.4, 30 - k * 2 + 0.2)), lambert('#2a3a4a'));
    windows.position.set(-8 - k * 4, 25 + k * 6, 0);
    ship.add(windows);
  }
  const funnel = new THREE.Mesh(track(new THREE.CylinderGeometry(7, 8, 18, 16)), lambert('#c8102e'));
  funnel.position.set(-40, 62, 0);
  funnel.scale.set(1.6, 1, 1);
  const funnelTop = new THREE.Mesh(track(new THREE.CylinderGeometry(7.2, 7.2, 3, 16)), lambert('#15161b'));
  funnelTop.position.set(-40, 72, 0);
  funnelTop.scale.set(1.6, 1, 1);
  ship.add(funnel, funnelTop);
  ship.position.set(120, 0, WATER + 45);
  g.add(ship);
  return g;
}

function castleWindowsTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1f2a33';
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 16; i++) ctx.fillRect(8 + i * 15.5, 8 + row * 19, 6, 11);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
