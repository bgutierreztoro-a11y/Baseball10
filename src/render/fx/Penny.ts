import * as THREE from 'three';

/**
 * Benjamin's lucky penny: a giant copper one-cent coin floating over the
 * outfield, rocking and bobbing so it glints, with a soft halo so it reads
 * from home plate. `hit()` flips it away in a burst of spin.
 */

/** Visual radius of the coin (m). The hit test uses a larger radius (see Match). */
export const PENNY_RADIUS = 2.2;

function faceTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(110, 100, 10, 128, 128, 128);
  g.addColorStop(0, '#f6b68a');
  g.addColorStop(0.55, '#c8703f');
  g.addColorStop(1, '#8a4524');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(128, 128, 128, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,40,18,0.8)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(80,34,14,0.85)';
  ctx.font = 'bold 120px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('1¢', 128, 136);
  ctx.font = 'bold 26px Georgia, serif';
  ctx.fillText('ONE CENT', 128, 52);
  ctx.fillText('LIBERTY', 128, 210);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function haloTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,214,150,0.9)');
  g.addColorStop(0.45, 'rgba(255,170,90,0.35)');
  g.addColorStop(1, 'rgba(255,170,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class PennyView {
  readonly root = new THREE.Group();
  private readonly coin = new THREE.Group();
  private readonly halo: THREE.Sprite;
  private readonly base = new THREE.Vector3();
  private t = 0;
  private flip = -1;
  private readonly mats: THREE.Material[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];

  constructor() {
    const tex = faceTexture();
    const faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.75, emissive: '#5a2a10', emissiveIntensity: 0.35 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: '#b5622f', roughness: 0.35, metalness: 0.8, emissive: '#4a200c', emissiveIntensity: 0.3 });
    // Cylinder groups: 0 = side, 1 = top, 2 = bottom. The faces point ±Z after the rotation.
    const geo = new THREE.CylinderGeometry(PENNY_RADIUS, PENNY_RADIUS, 0.28, 48);
    geo.rotateX(Math.PI / 2);
    const disc = new THREE.Mesh(geo, [edgeMat, faceMat, faceMat]);
    this.coin.add(disc);
    const haloMat = new THREE.SpriteMaterial({ map: haloTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.halo = new THREE.Sprite(haloMat);
    this.halo.scale.setScalar(PENNY_RADIUS * 4.2);
    this.root.add(this.halo, this.coin);
    this.root.visible = false;
    this.mats.push(faceMat, edgeMat, haloMat);
    this.geos.push(geo);
  }

  /** Shows the penny at `pos` (world), facing home plate. */
  show(pos: { x: number; y: number; z: number }): void {
    this.base.set(pos.x, pos.y, pos.z);
    this.root.position.copy(this.base);
    this.root.rotation.set(0, Math.atan2(-pos.x, -pos.z), 0);
    this.coin.rotation.set(0, 0, 0);
    this.coin.scale.setScalar(1);
    this.flip = -1;
    this.root.visible = true;
  }

  hide(): void {
    this.root.visible = false;
  }

  /** The ball touched it: it spins away upward and fades. */
  hit(): void {
    if (this.root.visible) this.flip = 0;
  }

  update(dt: number): void {
    if (!this.root.visible) return;
    this.t += dt;
    if (this.flip >= 0) {
      this.flip += dt;
      const u = this.flip / 1.2;
      this.coin.rotation.y += dt * 30;
      this.root.position.y = this.base.y + u * 14;
      this.coin.scale.setScalar(Math.max(0.01, 1 - u));
      this.halo.scale.setScalar(PENNY_RADIUS * 4.2 * (1 + u * 2));
      (this.halo.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - u);
      if (u >= 1) this.root.visible = false;
      return;
    }
    (this.halo.material as THREE.SpriteMaterial).opacity = 0.75 + Math.sin(this.t * 4) * 0.2;
    this.root.position.y = this.base.y + Math.sin(this.t * 1.6) * 0.35;
    // Rocks around its vertical axis so the copper catches the light, never edge-on.
    this.coin.rotation.y = Math.sin(this.t * 1.1) * 0.6;
  }

  dispose(): void {
    for (const m of this.mats) {
      (m as THREE.MeshStandardMaterial).map?.dispose();
      m.dispose();
    }
    for (const g of this.geos) g.dispose();
  }
}
