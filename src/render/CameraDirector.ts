import * as THREE from 'three';
import type { Vec3 } from '../contracts';
import { damp } from '../core/math';

/**
 * Camera language of the game:
 *  - batting: elevated behind-the-plate view (zone above the catcher's head)
 *  - follow: broadcast-style chase that rises behind the batted ball
 *  - intro: flyover from center field down to the plate before a stage
 *  - title: slow orbit over the infield behind the menus
 */
export const BATTING_POS = new THREE.Vector3(0, 2.65, -5.2);
export const BATTING_LOOK = new THREE.Vector3(0, -2.0, 16);
export const BATTING_FOV = 31;

type Mode = 'batting' | 'follow' | 'intro' | 'title';

export class CameraDirector {
  readonly camera: THREE.PerspectiveCamera;
  mode: Mode = 'title';
  reducedMotion = false;
  private t = 0;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly desiredLook = new THREE.Vector3();
  private fov = BATTING_FOV;
  private shakeAmp = 0;
  private followKind: 'fly' | 'ground' | 'foul' = 'fly';
  private introFrom = new THREE.Vector3();
  private introMid = new THREE.Vector3();
  private introDur = 2.6;
  private onIntroDone: (() => void) | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.setTitle();
  }

  setBatting(): void {
    this.mode = 'batting';
    this.pos.copy(BATTING_POS);
    this.look.copy(BATTING_LOOK);
    this.fov = BATTING_FOV;
    this.t = 0;
  }

  setTitle(): void {
    this.mode = 'title';
    this.t = 0;
    this.fov = 48;
  }

  /** Flyover from deep center field to the batting view. */
  playIntro(onDone: () => void, duration = 2.8): void {
    if (this.reducedMotion) {
      this.setBatting();
      onDone();
      return;
    }
    this.mode = 'intro';
    this.t = 0;
    this.introDur = duration;
    this.introFrom.set(18, 34, 150);
    this.introMid.set(30, 16, 35);
    this.onIntroDone = onDone;
  }

  /** Begin following a batted ball. */
  follow(kind: 'fly' | 'ground' | 'foul'): void {
    this.mode = 'follow';
    this.followKind = kind;
    this.t = 0;
  }

  shake(amount: number): void {
    if (!this.reducedMotion) this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  update(dt: number, ball: Vec3 | null): void {
    this.t += dt;
    const cam = this.camera;
    switch (this.mode) {
      case 'title': {
        const a = this.t * 0.045 + 0.9;
        const r = 52;
        this.pos.set(Math.sin(a) * r, 24 + Math.sin(this.t * 0.2) * 3, 45 - Math.cos(a) * r);
        this.look.set(0, 3, 45);
        this.fov = 48;
        break;
      }
      case 'intro': {
        const u = Math.min(1, this.t / this.introDur);
        const e = u * u * (3 - 2 * u);
        this.curve.v0.copy(this.introFrom);
        this.curve.v1.copy(this.introMid);
        this.curve.v2.copy(BATTING_POS);
        this.curve.getPoint(e, this.pos);
        this.look.lerpVectors(this.tmp.set(0, 1, 0), BATTING_LOOK, e * e);
        this.fov = 50 + (BATTING_FOV - 50) * e;
        if (u >= 1) {
          this.setBatting();
          const cb = this.onIntroDone;
          this.onIntroDone = null;
          cb?.();
        }
        break;
      }
      case 'batting': {
        // Very subtle handheld breathing.
        const b = this.reducedMotion ? 0 : 1;
        this.pos.set(BATTING_POS.x + Math.sin(this.t * 0.6) * 0.012 * b, BATTING_POS.y + Math.sin(this.t * 0.9) * 0.008 * b, BATTING_POS.z);
        this.look.copy(BATTING_LOOK);
        this.fov = BATTING_FOV;
        break;
      }
      case 'follow': {
        if (!ball) break;
        const early = this.t < 0.22;
        if (early) {
          // Whip toward the ball first, position barely moves.
          this.desired.copy(BATTING_POS);
        } else if (this.followKind === 'fly') {
          this.desired.set(ball.x * 0.55, 8 + ball.y * 0.55, ball.z * 0.55 - 14);
        } else if (this.followKind === 'ground') {
          this.desired.set(ball.x * 0.35, 6 + ball.y * 0.4, ball.z * 0.35 - 9);
        } else {
          this.desired.set(0, 9, -10);
        }
        this.desiredLook.set(ball.x, ball.y, ball.z);
        const kp = early ? 2 : this.followKind === 'fly' ? 2.4 : 2.8;
        this.pos.lerp(this.desired, damp(kp, dt));
        this.look.lerp(this.desiredLook, damp(early ? 14 : 7, dt));
        const far = Math.min(1, Math.hypot(ball.x, ball.z) / 130);
        this.fov += (52 - far * 14 - this.fov) * damp(2, dt);
        break;
      }
    }
    cam.position.copy(this.pos);
    if (this.shakeAmp > 0.0005) {
      const s = this.shakeAmp;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      this.shakeAmp *= Math.exp(-dt * 14);
    }
    cam.lookAt(this.look);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}
