import * as THREE from 'three';

/**
 * A club crest that hovers over the pitcher, bobbing like a little cloud.
 * The crest is a stylised red/white striped shield drawn on a canvas (no
 * external art), with a soft puff of cloud behind it.
 */

const CREST_SIZE = 1.15;
const CLOUD_SIZE = 1.9;
/**
 * Height of the crest centre above the pitcher's feet. High enough that the
 * cloud stays above the release point (1.78 m) and the raised arm, so it can
 * never hide the pitch.
 */
const HOVER = 3.3;

function crestTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  // Shield outline: flat top with small shoulders, rounded point at the bottom.
  const shield = new Path2D();
  shield.moveTo(48, 70);
  shield.quadraticCurveTo(128, 50, 208, 70);
  shield.lineTo(208, 140);
  shield.quadraticCurveTo(208, 205, 128, 244);
  shield.quadraticCurveTo(48, 205, 48, 140);
  shield.closePath();
  ctx.save();
  ctx.clip(shield);
  const stripes = 6;
  const w = (208 - 48) / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#d71920' : '#ffffff';
    ctx.fillRect(48 + i * w, 0, w + 1, 256);
  }
  ctx.restore();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#1b1b1f';
  ctx.stroke(shield);
  // Golden halo above the shield.
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#f2c230';
  ctx.beginPath();
  ctx.ellipse(128, 40, 46, 15, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Little football in the middle.
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1b1b1f';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(128, 145, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1b1b1f';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const x = 128 + Math.cos(a) * 14;
    const y = 145 + Math.sin(a) * 14;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

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

export class PitcherBadge {
  readonly root = new THREE.Group();
  private readonly crest: THREE.Sprite;
  private readonly cloud: THREE.Sprite;

  constructor() {
    const mat = (map: THREE.Texture, opacity = 1): THREE.SpriteMaterial =>
      new THREE.SpriteMaterial({ map, transparent: true, opacity, depthWrite: false, toneMapped: false });
    this.cloud = new THREE.Sprite(mat(cloudTexture(), 0.9));
    this.cloud.scale.set(CLOUD_SIZE, CLOUD_SIZE, 1);
    this.cloud.renderOrder = 4;
    this.crest = new THREE.Sprite(mat(crestTexture()));
    this.crest.scale.set(CREST_SIZE, CREST_SIZE, 1);
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

  /** Drives the bob/sway from elapsed seconds (never frame count). */
  update(elapsed: number): void {
    if (!this.root.visible) return;
    const bob = Math.sin(elapsed * 1.7) * 0.2;
    this.crest.position.set(Math.sin(elapsed * 0.8) * 0.07, bob, 0);
    // The cloud lags a little behind the crest and breathes.
    const breathe = 1 + Math.sin(elapsed * 1.7 + 0.8) * 0.05;
    this.cloud.position.set(Math.sin(elapsed * 0.8 - 0.5) * 0.1, bob * 0.8 - 0.28, -0.01);
    this.cloud.scale.set(CLOUD_SIZE * breathe, CLOUD_SIZE * breathe, 1);
  }

  dispose(): void {
    for (const s of [this.crest, this.cloud]) {
      s.material.map?.dispose();
      s.material.dispose();
    }
  }
}
