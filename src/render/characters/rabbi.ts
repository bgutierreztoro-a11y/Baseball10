import * as THREE from 'three';
import type { QualitySettings } from '../../contracts';
import type { Humanoid } from './humanoid';

/**
 * Rabbi attire layered on a Humanoid (Benjamin and the pitcher who faces
 * him): a black wide-brimmed hat over a kippah, curled sidelocks (peyot), a
 * long beard, a white shirt collar and placket, the skirt of a long black
 * coat and tzitzit fringes hanging at the hips. The coat itself is the
 * humanoid's jersey colour (black).
 */
export function addRabbiAttire(h: Humanoid, hair: string, quality: QualitySettings, opts: { chestDepth: number }): void {
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const black = new THREE.MeshStandardMaterial({ color: '#111216', roughness: 0.55 });
  const band = new THREE.MeshStandardMaterial({ color: '#2b2c33', roughness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: '#f4f2ea', roughness: 0.7 });
  const hairM = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9 });
  h.materials.rabbiHat = black;
  h.materials.rabbiBand = band;
  h.materials.rabbiShirt = white;
  h.materials.rabbiHair = hairM;
  const parts: THREE.Mesh[] = [];
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, pos: THREE.Vector3, scale?: THREE.Vector3): THREE.Mesh => {
    const x = new THREE.Mesh(g, m);
    x.position.copy(pos);
    if (scale) x.scale.copy(scale);
    parent.add(x);
    parts.push(x);
    return x;
  };
  // Hat: wide flat brim, tall rounded crown and a ribbon band.
  add(h.head, new THREE.CylinderGeometry(0.205, 0.205, 0.012, 28), black, V(0, 0.07, 0.0));
  add(h.head, new THREE.CylinderGeometry(0.112, 0.124, 0.15, 24), black, V(0, 0.15, -0.005));
  add(h.head, new THREE.SphereGeometry(0.112, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), black, V(0, 0.225, -0.005), V(1, 0.3, 1));
  add(h.head, new THREE.CylinderGeometry(0.1265, 0.1265, 0.03, 24, 1, true), band, V(0, 0.093, -0.005));
  // Peyot: a tight curl of hair hanging in front of each ear.
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const a = t * Math.PI * 7;
      pts.push(V(side * (0.104 + Math.cos(a) * 0.012), 0.02 - t * 0.17, 0.03 + Math.sin(a) * 0.012));
    }
    add(h.head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.0075, 6, false), hairM, V(0, 0, 0));
  }
  // Long beard hanging below the jaw.
  add(h.head, new THREE.SphereGeometry(0.07, 16, 12), hairM, V(0, -0.135, 0.06), V(1.05, 1.7, 0.72));
  // White shirt: collar around the neck and the placket under the open coat.
  add(h.neck, new THREE.CylinderGeometry(0.068, 0.075, 0.045, 16), white, V(0, -0.03, 0));
  add(h.chest, new THREE.BoxGeometry(0.075, 0.2, 0.01), white, V(0, 0.08, opts.chestDepth + 0.004));
  // Skirt of the long coat, carried by the hips (open at the bottom).
  const skirt = add(h.hips, new THREE.CylinderGeometry(0.19, 0.25, 0.4, 20, 1, true), h.materials.jersey!, V(0, -0.2, 0));
  skirt.scale.set(1, 1, 0.85);
  (h.materials.jersey as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  // Tzitzit: white fringes hanging at each hip.
  const fringe = new THREE.CylinderGeometry(0.0035, 0.0035, 0.24, 4);
  for (const side of [-1, 1]) {
    for (const dz of [-0.03, -0.01, 0.01, 0.03]) add(h.hips, fringe, white, V(side * 0.2, -0.16, dz + 0.05));
  }
  for (const x of parts) x.castShadow = quality.shadows;
}
