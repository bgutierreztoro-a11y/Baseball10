import * as THREE from 'three';
import { PLATE, STRIKE_ZONE } from '../config/constants';

/**
 * Unified input: mouse (absolute aim), touch (relative drag + on-screen
 * button), keyboard and gamepad. Swing timestamps come from the DOM event
 * (`event.timeStamp`, same clock as performance.now()) so timing is judged
 * at the moment of the click, not at the next frame.
 */
export interface InputCallbacks {
  onSwing(timeStamp: number, power: boolean): void;
  onPause(): void;
  /** Any confirm action (skip cinematic / continue). */
  onConfirm(): void;
  /** Batter's special ability (key E / gamepad Y). */
  onAbility(): void;
}

const AIM_X = 0.62;
const AIM_Y_MIN = 0.12;
const AIM_Y_MAX = 1.55;

export class InputManager {
  /** Aim point on the contact plane (world X/Y). */
  readonly aim = new THREE.Vector2(0, STRIKE_ZONE.centerY);
  powerLatched = false;
  private shiftHeld = false;
  enabled = false;
  isTouch = false;
  private readonly keys = new Set<string>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -PLATE.frontZ);
  private readonly ndc = new THREE.Vector2();
  private readonly hit = new THREE.Vector3();
  private lastTouch: { x: number; y: number } | null = null;
  private padPrev: boolean[] = [];
  private readonly listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly cb: InputCallbacks,
  ) {
    this.isTouch = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);
    this.on(canvas, 'pointermove', (e) => this.onMove(e as PointerEvent));
    this.on(canvas, 'pointerdown', (e) => this.onDown(e as PointerEvent));
    this.on(canvas, 'pointerup', () => (this.lastTouch = null));
    this.on(canvas, 'contextmenu', (e) => e.preventDefault());
    this.on(window, 'keydown', (e) => this.onKey(e as KeyboardEvent, true));
    this.on(window, 'keyup', (e) => this.onKey(e as KeyboardEvent, false));
    this.on(window, 'blur', () => {
      this.keys.clear();
      this.shiftHeld = false;
    });
  }

  private on(t: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions): void {
    t.addEventListener(type, fn, opts);
    this.listeners.push([t, type, fn, opts]);
  }

  get power(): boolean {
    return this.powerLatched || this.shiftHeld;
  }

  /** Called by the on-screen SWING button (touch). */
  touchSwing(timeStamp: number): void {
    if (this.enabled) this.cb.onSwing(timeStamp, this.power);
    else this.cb.onConfirm();
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      this.isTouch = true;
      if (!this.enabled) return;
      if (this.lastTouch) {
        // Relative drag, scaled to world units at the plate.
        const dist = this.camera.position.distanceTo(this.hit.set(0, STRIKE_ZONE.centerY, PLATE.frontZ));
        const worldPerPx = (2 * dist * Math.tan((this.camera.fov * Math.PI) / 360)) / this.canvas.clientHeight;
        const k = worldPerPx * 1.7;
        this.aim.x -= (e.clientX - this.lastTouch.x) * k; // screen-right is −X
        this.aim.y -= (e.clientY - this.lastTouch.y) * k;
        this.clampAim();
      }
      this.lastTouch = { x: e.clientX, y: e.clientY };
      return;
    }
    this.isTouch = false;
    this.aimAtPointer(e.clientX, e.clientY);
  }

  private aimAtPointer(clientX: number, clientY: number): void {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    if (this.raycaster.ray.intersectPlane(this.plane, this.hit)) {
      this.aim.set(this.hit.x, this.hit.y);
      this.clampAim();
    }
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      this.isTouch = true;
      this.lastTouch = { x: e.clientX, y: e.clientY };
      return; // touch swings come from the on-screen button
    }
    if (!this.enabled) {
      if (e.button === 0) this.cb.onConfirm();
      return;
    }
    if (e.button === 0 || e.button === 2) {
      this.aimAtPointer(e.clientX, e.clientY);
      this.cb.onSwing(e.timeStamp, e.button === 2 || e.shiftKey || this.powerLatched);
    }
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (e.key === 'Shift') this.shiftHeld = down;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (down) this.keys.add(k);
    else this.keys.delete(k);
    if (!down || e.repeat) return;
    if (k === ' ' || k === 'enter') {
      if (this.enabled && k === ' ') {
        e.preventDefault();
        this.cb.onSwing(e.timeStamp, this.power);
      } else if (!this.enabled && k === ' ') {
        this.cb.onConfirm();
      }
    } else if (k === 'escape' || k === 'p') {
      this.cb.onPause();
    } else if (k === 'q') {
      this.powerLatched = !this.powerLatched;
    } else if (k === 'e') {
      this.cb.onAbility();
    }
  }

  private clampAim(): void {
    this.aim.x = Math.max(-AIM_X, Math.min(AIM_X, this.aim.x));
    this.aim.y = Math.max(AIM_Y_MIN, Math.min(AIM_Y_MAX, this.aim.y));
  }

  /** Per-frame: keyboard aiming + gamepad polling. */
  update(dt: number): void {
    if (!this.enabled) {
      this.pollPad(true);
      return;
    }
    const speed = 0.9 * dt;
    // Screen-left is +X from the batting camera.
    if (this.keys.has('arrowleft') || this.keys.has('a')) this.aim.x += speed;
    if (this.keys.has('arrowright') || this.keys.has('d')) this.aim.x -= speed;
    if (this.keys.has('arrowup') || this.keys.has('w')) this.aim.y += speed;
    if (this.keys.has('arrowdown') || this.keys.has('s')) this.aim.y -= speed;
    this.pollPad(false);
    this.clampAim();
  }

  private pollPad(menuOnly: boolean): void {
    let pads: (Gamepad | null)[] = [];
    try {
      pads = typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    } catch {
      return; // gamepad API blocked by the embedding page's permissions policy
    }
    const pad = Array.from(pads).find((p): p is Gamepad => !!p);
    if (!pad) return;
    const pressed = pad.buttons.map((b) => b.pressed);
    const edge = (i: number): boolean => !!pressed[i] && !this.padPrev[i];
    if (!menuOnly) {
      const dz = (v: number): number => (Math.abs(v) < 0.15 ? 0 : v);
      this.aim.x -= dz(pad.axes[0] ?? 0) * 0.016;
      this.aim.y -= dz(pad.axes[1] ?? 0) * 0.016;
      if (edge(0) || edge(7)) this.cb.onSwing(performance.now(), edge(7) || this.power);
    } else if (edge(0)) this.cb.onConfirm();
    if (edge(9)) this.cb.onPause();
    if (!menuOnly && edge(3)) this.cb.onAbility();
    this.padPrev = pressed;
  }

  dispose(): void {
    for (const [t, type, fn, opts] of this.listeners) t.removeEventListener(type, fn, opts);
  }
}
