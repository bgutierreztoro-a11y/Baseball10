import * as THREE from 'three';
import type { QualitySettings, StadiumDef, Vec3 } from '../../contracts';
import { DEG, FOUL_LINE_ANGLE } from '../../config/constants';
import { STAND_GAP, fenceDistance, polarToXZ, standHeight } from '../../sim/field';
import { seeded } from '../textures';

/**
 * Arturek's curse gone wrong: the firecracker blows up at the plate. A
 * fireball and shockwave at the batter, then the fire spreads from home
 * plate through the whole park (stands, houses, outfield) with columns of
 * smoke and an orange glow over everything. Arturek's soul (a little ghost
 * with a halo) floats up out of the smoke. Driven by elapsed time.
 */

/** Seconds from the blast until the last fires catch. */
const SPREAD = 2.6;
/** Spread speed of the fire from the plate (m/s), capped by SPREAD. */
const SPREAD_SPEED = 70;

function flameTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 96, 2, 32, 84, 60);
  g.addColorStop(0, 'rgba(255,250,210,1)');
  g.addColorStop(0.25, 'rgba(255,196,60,0.95)');
  g.addColorStop(0.6, 'rgba(240,80,10,0.6)');
  g.addColorStop(1, 'rgba(160,20,0,0)');
  ctx.fillStyle = g;
  // Teardrop flame.
  ctx.beginPath();
  ctx.moveTo(32, 4);
  ctx.bezierCurveTo(48, 40, 62, 70, 58, 96);
  ctx.bezierCurveTo(54, 122, 10, 122, 6, 96);
  ctx.bezierCurveTo(2, 70, 16, 40, 32, 4);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function smokeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(40,38,38,0.85)');
  g.addColorStop(0.6, 'rgba(50,48,48,0.45)');
  g.addColorStop(1, 'rgba(60,58,58,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ghostTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  // Halo.
  ctx.strokeStyle = '#ffd84a';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(64, 16, 30, 9, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Sheet ghost with a wavy hem and blond fringe (it is Arturek, after all).
  ctx.fillStyle = 'rgba(250,250,255,0.92)';
  ctx.beginPath();
  ctx.moveTo(22, 150);
  ctx.lineTo(22, 70);
  ctx.bezierCurveTo(22, 20, 106, 20, 106, 70);
  ctx.lineTo(106, 150);
  for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(96 - i * 21, 132, 85 - i * 21, 150);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f2d16b';
  ctx.beginPath();
  ctx.ellipse(64, 40, 30, 12, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#26262e';
  for (const x of [50, 78]) {
    ctx.beginPath();
    ctx.ellipse(x, 70, 6, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(64, 96, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Fire {
  sprite: THREE.Sprite;
  at: number;
  size: number;
  phase: number;
}

interface Smoke {
  sprite: THREE.Sprite;
  base: THREE.Vector3;
  at: number;
  size: number;
}

export class Inferno {
  readonly root = new THREE.Group();
  private readonly flameMat: THREE.SpriteMaterial;
  private readonly smokeMat: THREE.SpriteMaterial;
  private readonly fireball: THREE.Sprite;
  private readonly shock: THREE.Mesh;
  private readonly ghost: THREE.Sprite;
  private readonly glow: THREE.PointLight;
  private readonly tint: THREE.HemisphereLight;
  private readonly fires: Fire[] = [];
  private readonly smokes: Smoke[] = [];
  private readonly origin = new THREE.Vector3();
  private readonly ghostFrom = new THREE.Vector3();
  private readonly count: number;
  private t = -1;

  constructor(quality: QualitySettings) {
    this.count = quality.tier === 'low' ? 90 : quality.tier === 'medium' ? 160 : 240;
    this.flameMat = new THREE.SpriteMaterial({ map: flameTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
    this.smokeMat = new THREE.SpriteMaterial({ map: smokeTexture(), transparent: true, depthWrite: false });
    this.fireball = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flameMat.map, color: '#ffe0a0', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
    this.shock = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.shock.rotation.x = -Math.PI / 2;
    this.ghost = new THREE.Sprite(new THREE.SpriteMaterial({ map: ghostTexture(), transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    this.ghost.renderOrder = 7;
    this.glow = new THREE.PointLight('#ff7a2a', 0, 90, 1.4);
    this.tint = new THREE.HemisphereLight('#ff8a3d', '#3a1006', 0);
    for (let i = 0; i < this.count; i++) {
      const sprite = new THREE.Sprite(this.flameMat);
      sprite.visible = false;
      this.root.add(sprite);
      this.fires.push({ sprite, at: 0, size: 1, phase: i * 1.7 });
    }
    for (let i = 0; i < Math.round(this.count / 5); i++) {
      const sprite = new THREE.Sprite(this.smokeMat.clone());
      sprite.visible = false;
      this.root.add(sprite);
      this.smokes.push({ sprite, base: new THREE.Vector3(), at: 0, size: 1 });
    }
    this.root.add(this.fireball, this.shock, this.ghost, this.glow, this.tint);
    this.root.visible = false;
  }

  get burning(): boolean {
    return this.t >= 0;
  }

  /**
   * The firecracker explodes at `at` (the plate); the fire spreads out over
   * the whole of `def`'s park. The ghost rises from `soul` (the batter's chest).
   */
  blast(at: Vec3, def: StadiumDef, soul: Vec3): void {
    this.origin.set(at.x, at.y, at.z);
    this.ghostFrom.set(soul.x, soul.y, soul.z);
    const rnd = seeded(Math.round(at.x * 1000) + 7);
    const place = (i: number): THREE.Vector3 => {
      const k = rnd();
      if (i < 14) {
        // Around the plate and the batter.
        const a = rnd() * Math.PI * 2;
        const r = 1 + rnd() * 6;
        return new THREE.Vector3(at.x + Math.cos(a) * r, 0.2, at.z + Math.sin(a) * r);
      }
      if (k < 0.55) {
        // Outfield stands / houses behind the wall.
        const ang = (rnd() * 2 - 1) * FOUL_LINE_ANGLE;
        const r = fenceDistance(def, ang) + STAND_GAP + rnd() * 50;
        const p = polarToXZ(ang, r);
        return new THREE.Vector3(p.x, standHeight(def, ang, r) + rnd() * 6, p.z);
      }
      if (k < 0.85) {
        // Foul-side stands, all the way round behind home.
        const ang = (rnd() < 0.5 ? -1 : 1) * (50 + rnd() * 95) * DEG;
        const r = 24 + rnd() * 50;
        const p = polarToXZ(ang, r);
        return new THREE.Vector3(p.x, 1 + rnd() * 14, p.z);
      }
      // The deep outfield grass (kept away from the cinematic camera behind the mound).
      const p = polarToXZ((rnd() * 2 - 1) * FOUL_LINE_ANGLE, 55 + rnd() * 50);
      return new THREE.Vector3(p.x, 0.2, p.z);
    };
    this.fires.forEach((f, i) => {
      const p = place(i);
      f.sprite.position.copy(p);
      const d = p.distanceTo(this.origin);
      f.at = 0.15 + Math.min(SPREAD, d / SPREAD_SPEED) + rnd() * 0.3;
      f.size = i < 14 ? 2.5 + rnd() * 2 : p.y < 0.5 ? 2.5 + rnd() * 2.5 : 4 + rnd() * 7;
      f.sprite.visible = false;
    });
    this.smokes.forEach((s, i) => {
      const src = this.fires[(i * 5 + 14) % this.fires.length]!;
      s.base.copy(src.sprite.position);
      s.at = src.at + 0.4;
      s.size = 8 + rnd() * 10;
      s.sprite.visible = false;
    });
    this.glow.position.set(at.x, 4, at.z);
    this.t = 0;
    this.root.visible = true;
  }

  stop(): void {
    this.t = -1;
    this.root.visible = false;
    this.glow.intensity = 0;
    this.tint.intensity = 0;
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const t = this.t;
    // Fireball + shockwave at the plate.
    const fb = Math.min(1, t / 0.5);
    this.fireball.visible = t < 1.4;
    this.fireball.position.set(this.origin.x, this.origin.y + fb * 3, this.origin.z);
    const fs = 2 + fb * 14;
    this.fireball.scale.set(fs, fs * 1.4, 1);
    this.fireball.material.opacity = 1 - Math.max(0, (t - 0.5) / 0.9);
    this.shock.visible = t < 1.2;
    this.shock.position.set(this.origin.x, 0.1, this.origin.z);
    this.shock.scale.setScalar(1 + t * 40);
    (this.shock.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t / 1.2);
    this.glow.intensity = Math.min(1, t / 0.3) * (60 + Math.sin(t * 23) * 12);
    this.tint.intensity = Math.min(1.1, t * 0.6);
    for (const f of this.fires) {
      const age = t - f.at;
      f.sprite.visible = age > 0;
      if (age <= 0) continue;
      const grow = Math.min(1, age / 0.6);
      const flick = 1 + 0.18 * Math.sin(t * 14 + f.phase) + 0.1 * Math.sin(t * 31 + f.phase * 2);
      const s = f.size * grow * flick;
      f.sprite.scale.set(s * 0.6, s, 1);
      f.sprite.center.set(0.5, 0.1);
    }
    for (const s of this.smokes) {
      const age = t - s.at;
      s.sprite.visible = age > 0;
      if (age <= 0) continue;
      const rise = age * 3.5;
      s.sprite.position.set(s.base.x + Math.sin(age * 0.7) * 2, s.base.y + 4 + rise, s.base.z);
      const size = s.size * (1 + age * 0.35);
      s.sprite.scale.set(size, size, 1);
      s.sprite.material.opacity = Math.min(0.8, age * 0.8);
    }
    // The ghost floats up and waves goodbye.
    const g = t - 1.4;
    this.ghost.visible = g > 0;
    if (g > 0) {
      this.ghost.position.set(this.ghostFrom.x + Math.sin(g * 2.2) * 0.6, this.ghostFrom.y + g * 1.6, this.ghostFrom.z);
      this.ghost.scale.set(2.2, 2.75, 1);
      this.ghost.material.opacity = Math.min(1, g * 1.5);
    }
  }

  dispose(): void {
    this.flameMat.map?.dispose();
    this.flameMat.dispose();
    this.smokeMat.map?.dispose();
    this.smokeMat.dispose();
    this.smokes.forEach((s) => s.sprite.material.dispose());
    this.fireball.material.dispose();
    this.shock.geometry.dispose();
    (this.shock.material as THREE.Material).dispose();
    this.ghost.material.map?.dispose();
    this.ghost.material.dispose();
    this.glow.dispose();
    this.tint.dispose();
  }
}
