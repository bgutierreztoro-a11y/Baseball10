import * as THREE from 'three';
import type { QualitySettings, StadiumDef } from '../../contracts';
import { DEG } from '../../config/constants';
import { fenceDistance, polarToXZ } from '../../sim/field';
import { seeded, windowsTexture } from '../textures';
import { MeshBuilder } from './geom';
import type { Atmosphere } from './atmosphere';
import { mergeSimple } from './structures';

/**
 * Backdrop outside the ballpark: terrain, sea (Malecón), mountains (Cumbre),
 * skyline (Metro/Final), trees and houses (El Solar).
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
  const terrainColor = atm.night ? '#0d1410' : def.id === 'malecon' ? '#3b3330' : def.id === 'cumbre' ? '#6e7c55' : '#5a7a3a';
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
