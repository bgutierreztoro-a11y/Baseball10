import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { QualitySettings, QualityTier } from '../contracts';

/**
 * WebGL renderer + post-processing (bloom) with three quality tiers and an
 * automatic downgrade when the frame rate stays low (docs/03-system-design.md §Rendimiento).
 */
export function qualityFor(tier: QualityTier): QualitySettings {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  switch (tier) {
    case 'low':
      return { tier, pixelRatio: Math.min(dpr, 1), shadows: false, shadowMapSize: 512, bloom: false, msaa: 0, crowdCount: 1400, particles: 0.4 };
    case 'medium':
      return { tier, pixelRatio: Math.min(dpr, 1.5), shadows: true, shadowMapSize: 1024, bloom: true, msaa: 0, crowdCount: 3800, particles: 0.7 };
    case 'high':
      return { tier, pixelRatio: Math.min(dpr, 2), shadows: true, shadowMapSize: 2048, bloom: true, msaa: 4, crowdCount: 7000, particles: 1 };
  }
}

/** Best-guess starting tier from the device; refined at runtime by FPS. */
export function detectTier(): QualityTier {
  if (typeof navigator === 'undefined') return 'medium';
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mobile) return mem >= 6 && cores >= 8 ? 'medium' : 'low';
  if (mem <= 4 || cores <= 4) return 'medium';
  return 'high';
}

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  quality: QualitySettings;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private bloomStrength = 0.3;
  private autoQuality: boolean;
  private fpsSamples: number[] = [];
  private lastDowngrade = 0;
  onQualityChange: ((q: QualitySettings) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, tier: QualityTier, auto: boolean) {
    this.quality = qualityFor(tier);
    this.autoQuality = auto;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: this.quality.tier !== 'low', powerPreference: 'high-performance', alpha: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 3000);
    this.applyQuality();
    this.resize();
  }

  setQuality(tier: QualityTier, auto: boolean): void {
    this.autoQuality = auto;
    if (tier === this.quality.tier) return;
    this.quality = qualityFor(tier);
    this.applyQuality();
    this.onQualityChange?.(this.quality);
  }

  /** Bloom strength / exposure per ballpark mood. */
  setAtmosphere(bloom: number, exposure: number): void {
    this.bloomStrength = bloom;
    if (this.bloomPass) this.bloomPass.strength = bloom;
    this.gl.toneMappingExposure = exposure;
  }

  private applyQuality(): void {
    const q = this.quality;
    this.gl.setPixelRatio(q.pixelRatio);
    this.gl.shadowMap.enabled = q.shadows;
    this.composer?.dispose();
    this.composer = null;
    this.bloomPass = null;
    if (q.bloom) {
      const size = this.gl.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
        type: THREE.HalfFloatType,
        samples: q.msaa,
      });
      this.composer = new EffectComposer(this.gl, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), this.bloomStrength, 0.55, 0.82);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    }
    this.resize();
  }

  resize(): void {
    const canvas = this.gl.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.gl.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.composer?.setPixelRatio(this.quality.pixelRatio);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  render(dt: number): void {
    if (this.composer) this.composer.render(dt);
    else this.gl.render(this.scene, this.camera);
    this.trackFps(dt);
  }

  /** Steps quality down if the average frame time stays above ~22 ms. */
  private trackFps(dt: number): void {
    if (!this.autoQuality || dt <= 0 || dt > 0.25) return;
    this.fpsSamples.push(dt);
    if (this.fpsSamples.length < 120) return;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.fpsSamples.length = 0;
    const now = performance.now();
    if (avg > 0.022 && now - this.lastDowngrade > 6000 && this.quality.tier !== 'low') {
      this.lastDowngrade = now;
      this.quality = qualityFor(this.quality.tier === 'high' ? 'medium' : 'low');
      this.applyQuality();
      this.onQualityChange?.(this.quality);
    }
  }

  dispose(): void {
    this.composer?.dispose();
    this.gl.dispose();
  }
}
