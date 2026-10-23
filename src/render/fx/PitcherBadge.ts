import * as THREE from 'three';
import type { PitcherBadgeId } from '../../contracts';
import crestUrl from '../assets/southampton-crest.png';

/**
 * A club crest that hovers over the pitcher, bobbing like a little cloud.
 * The crest is the club's PNG (transparent background, Southampton) or a
 * procedural canvas badge (MŠK Žilina) with a soft puff of cloud behind it.
 */

/** Crest sprite height in metres; its width follows the image aspect. */
const CREST_HEIGHT = 1.9;
const CREST_ASPECT: Record<PitcherBadgeId, number> = { southampton: 384 / 438, zilina: 1 };
const CLOUD_SIZE = 2.6;
/**
 * Height of the crest centre above the pitcher's feet. High enough that the
 * cloud stays above the release point (1.78 m) and the raised arm, so it can
 * never hide the pitch.
 */
const HOVER = 3.2;

function cloudTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const puff = (x: number, y: number, r: number): void => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.6, 'rgba(240,246,255,0.7)');
    g.addColorStop(1, 'rgba(240,246,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  };
  puff(128, 150, 70);
  puff(80, 160, 50);
  puff(176, 160, 50);
  puff(105, 125, 45);
  puff(152, 122, 45);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * MŠK Žilina-style round badge: yellow ring with the club name around a green
 * field, a yellow shield and the founding year. Drawn on a canvas.
 */
function zilinaTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  const green = '#0a7a3b';
  const yellow = '#f7d117';
  ctx.translate(256, 256);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 250, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = green;
  ctx.beginPath();
  ctx.arc(0, 0, 236, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = yellow;
  ctx.beginPath();
  ctx.arc(0, 0, 226, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = green;
  ctx.beginPath();
  ctx.arc(0, 0, 160, 0, Math.PI * 2);
  ctx.fill();
  // Club name around the ring.
  const ring = (text: string, start: number, sweep: number, flip: boolean): void => {
    ctx.save();
    ctx.font = 'bold 54px "Arial Black", Arial, sans-serif';
    ctx.fillStyle = green;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const chars = [...text];
    chars.forEach((ch, i) => {
      const a = start + (sweep * (i + 0.5)) / chars.length;
      ctx.save();
      ctx.rotate(a);
      ctx.translate(0, flip ? 193 : -193);
      if (flip) ctx.rotate(Math.PI);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    });
    ctx.restore();
  };
  ring('MŠK ŽILINA', -1.25, 2.5, false);
  ring('1908', Math.PI + 0.45, -0.9, true);
  // Shield with a football.
  ctx.fillStyle = yellow;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-82, -95);
  ctx.lineTo(82, -95);
  ctx.lineTo(82, 10);
  ctx.quadraticCurveTo(80, 90, 0, 120);
  ctx.quadraticCurveTo(-80, 90, -82, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = green;
  ctx.fillRect(-82, -40, 164, 30);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 50, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k * Math.PI * 2) / 5;
    ctx.lineTo(Math.cos(a) * 14, 50 + Math.sin(a) * 14);
  }
  ctx.closePath();
  ctx.fill();
  ctx.font = 'bold 40px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = green;
  ctx.fillText('MŠK', 0, -66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class PitcherBadge {
  readonly root = new THREE.Group();
  private readonly crest: THREE.Sprite;
  private readonly cloud: THREE.Sprite;
  private readonly textures: Partial<Record<PitcherBadgeId, THREE.Texture>> = {};
  private badge: PitcherBadgeId = 'southampton';

  constructor() {
    const mat = (map: THREE.Texture, opacity = 1): THREE.SpriteMaterial =>
      new THREE.SpriteMaterial({ map, transparent: true, opacity, depthWrite: false, toneMapped: false });
    this.cloud = new THREE.Sprite(mat(cloudTexture(), 0.9));
    this.cloud.scale.set(CLOUD_SIZE, CLOUD_SIZE, 1);
    this.cloud.renderOrder = 4;
    this.crest = new THREE.Sprite(mat(this.texture('southampton')));
    this.crest.scale.set(CREST_HEIGHT * CREST_ASPECT.southampton, CREST_HEIGHT, 1);
    this.crest.renderOrder = 5;
    this.root.add(this.cloud, this.crest);
    this.root.visible = false;
  }

  /** Places the badge above `x, y, z` (the pitcher's feet). */
  setAnchor(x: number, y: number, z: number): void {
    this.root.position.set(x, y + HOVER, z);
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  /** Which club's crest floats over the pitcher. */
  setBadge(id: PitcherBadgeId): void {
    if (id === this.badge) return;
    this.badge = id;
    this.crest.material.map = this.texture(id);
    this.crest.material.needsUpdate = true;
    this.crest.scale.set(CREST_HEIGHT * CREST_ASPECT[id], CREST_HEIGHT, 1);
  }

  private texture(id: PitcherBadgeId): THREE.Texture {
    let t = this.textures[id];
    if (!t) {
      if (id === 'zilina') {
        t = zilinaTexture();
      } else {
        t = new THREE.TextureLoader().load(crestUrl);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
      }
      this.textures[id] = t;
    }
    return t;
  }

  /** Drives the bob/sway from elapsed seconds (never frame count). */
  update(elapsed: number): void {
    if (!this.root.visible) return;
    const bob = Math.sin(elapsed * 1.7) * 0.2;
    this.crest.position.set(Math.sin(elapsed * 0.8) * 0.07, bob, 0);
    // The cloud lags a little behind the crest and breathes.
    const breathe = 1 + Math.sin(elapsed * 1.7 + 0.8) * 0.05;
    this.cloud.position.set(Math.sin(elapsed * 0.8 - 0.5) * 0.1, bob * 0.8 - 0.5, -0.01);
    this.cloud.scale.set(CLOUD_SIZE * breathe, CLOUD_SIZE * breathe, 1);
  }

  dispose(): void {
    Object.values(this.textures).forEach((t) => t.dispose());
    this.cloud.material.map?.dispose();
    for (const s of [this.crest, this.cloud]) s.material.dispose();
  }
}
