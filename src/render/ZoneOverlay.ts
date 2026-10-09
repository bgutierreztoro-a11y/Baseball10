import * as THREE from 'three';
import { BALL, PLATE, STRIKE_ZONE } from '../config/constants';
import { SWING_PROFILES } from '../sim/contact';

/**
 * Strike zone frame + PCI (plate-coverage indicator) drawn in 3D on the
 * contact plane, always on top. Also shows where the last pitch crossed.
 */
function ellipseRing(hw: number, hh: number, thickness: number, seg = 72): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pos.push(c * hw, s * hh, 0, c * (hw - thickness), s * (hh - thickness), 0);
    if (i < seg) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function frameGeometry(x0: number, y0: number, x1: number, y1: number, t: number): THREE.BufferGeometry {
  const quads: [number, number, number, number][] = [
    [x0 - t, y1, x1 + t, y1 + t],
    [x0 - t, y0 - t, x1 + t, y0],
    [x0 - t, y0, x0, y1],
    [x1, y0, x1 + t, y1],
  ];
  const pos: number[] = [];
  const idx: number[] = [];
  quads.forEach(([a, b, c, d], i) => {
    pos.push(a, b, 0, c, b, 0, c, d, 0, a, d, 0);
    const k = i * 4;
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Unit-radius ring split into `dashes` arcs (for the landing hint). */
function dashedRing(thickness: number, dashes: number, fill = 0.55): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const steps = 6;
  for (let d = 0; d < dashes; d++) {
    const a0 = (d / dashes) * Math.PI * 2;
    const a1 = a0 + (fill / dashes) * Math.PI * 2;
    const base = pos.length / 3;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(c, s, 0, c * (1 - thickness), s * (1 - thickness), 0);
      if (i < steps) {
        const k = base + i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Soft radial falloff so the hint reads as "somewhere around here", not a target. */
function softDiscTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.6)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const overlayMat = (color: string, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });

export class ZoneOverlay {
  readonly group = new THREE.Group();
  private readonly zone: THREE.Group;
  private readonly pci: THREE.Group;
  private readonly pciContact: THREE.Group;
  private readonly pciPower: THREE.Group;
  private readonly cross: THREE.Mesh;
  private readonly hint = new THREE.Group();
  private readonly hintMats: THREE.MeshBasicMaterial[] = [];
  private readonly hintBase: number[] = [];
  private hintAlpha = 0;
  private hintTarget = 0;
  private hintTexture: THREE.Texture | null = null;
  private crossT = 99;
  private flashT = 99;
  private power = false;
  private readonly mats: THREE.Material[] = [];

  constructor() {
    this.group.name = 'zoneOverlay';
    this.group.position.z = PLATE.frontZ;
    const hw = PLATE.width / 2;
    const zoneMat = this.track(overlayMat('#ffffff', 0.55));
    const gridMat = this.track(overlayMat('#ffffff', 0.14));
    this.zone = new THREE.Group();
    this.zone.add(new THREE.Mesh(frameGeometry(-hw, STRIKE_ZONE.bottom, hw, STRIKE_ZONE.top, 0.007), zoneMat));
    const h3 = (STRIKE_ZONE.top - STRIKE_ZONE.bottom) / 3;
    const w3 = (2 * hw) / 3;
    for (let i = 1; i <= 2; i++) {
      const y = STRIKE_ZONE.bottom + h3 * i;
      const x = -hw + w3 * i;
      this.zone.add(new THREE.Mesh(frameGeometry(-hw, y, hw, y, 0.003), gridMat));
      this.zone.add(new THREE.Mesh(frameGeometry(x, STRIKE_ZONE.bottom, x, STRIKE_ZONE.top, 0.003), gridMat));
    }
    this.group.add(this.zone);

    const build = (kind: 'contact' | 'power', color: string): THREE.Group => {
      const p = SWING_PROFILES[kind];
      const g = new THREE.Group();
      g.add(new THREE.Mesh(ellipseRing(p.pciHalfWidth, p.pciHalfHeight, 0.012), this.track(overlayMat(color, 0.95))));
      g.add(new THREE.Mesh(new THREE.CircleGeometry(1, 48).scale(p.pciHalfWidth, p.pciHalfHeight, 1), this.track(overlayMat(color, 0.08))));
      // Sweet spot ring (barrel zone) and centre dot.
      g.add(new THREE.Mesh(ellipseRing(p.pciHalfWidth * 0.36, p.pciHalfHeight * 0.36, 0.007), this.track(overlayMat(color, 0.7))));
      g.add(new THREE.Mesh(new THREE.CircleGeometry(0.011, 16), this.track(overlayMat('#ffffff', 0.95))));
      return g;
    };
    this.pciContact = build('contact', '#7fe3ff');
    this.pciPower = build('power', '#ffb347');
    this.pci = new THREE.Group();
    this.pci.add(this.pciContact, this.pciPower);
    this.pciPower.visible = false;
    this.group.add(this.pci);

    // Approximate arrival area: soft gold glow + dashed edge, under the PCI.
    const hintColor = '#ffc83d';
    if (typeof document !== 'undefined') {
      this.hintTexture = softDiscTexture();
      const disc = overlayMat(hintColor, 1);
      disc.map = this.hintTexture;
      this.hint.add(new THREE.Mesh(new THREE.CircleGeometry(1, 48), this.trackHint(disc, 1)));
    }
    this.hint.add(new THREE.Mesh(dashedRing(0.09, 14), this.trackHint(overlayMat(hintColor, 1), 0.95)));
    // Always drawn (opacity 0 when idle) so its shaders compile with the zone,
    // not on the frame the pitch is released.
    this.zone.add(this.hint);

    this.cross = new THREE.Mesh(ellipseRing(BALL.radius * 1.5, BALL.radius * 1.5, 0.012, 32), this.track(overlayMat('#ff4d5e', 1)));
    this.cross.visible = false;
    this.group.add(this.cross);

    this.group.traverse((o) => {
      o.renderOrder = 30;
      o.frustumCulled = false;
    });
    // The hint sits under the PCI so the aim circle always reads on top.
    this.hint.traverse((o) => (o.renderOrder = 29));
  }

  private track<T extends THREE.Material>(m: T): T {
    this.mats.push(m);
    return m;
  }

  private trackHint(m: THREE.MeshBasicMaterial, base: number): THREE.MeshBasicMaterial {
    this.track(m);
    this.hintMats.push(m);
    this.hintBase.push(base);
    return m;
  }

  /** Fades in the approximate area where the pitch will arrive. */
  showHint(x: number, y: number, radius: number): void {
    this.hint.position.set(x, y, 0);
    this.hint.scale.setScalar(radius);
    this.hintTarget = 1;
  }

  hideHint(immediate = false): void {
    this.hintTarget = 0;
    if (immediate) this.hintAlpha = 0;
  }

  setAim(x: number, y: number): void {
    this.pci.position.set(x, y, 0);
  }

  setPower(on: boolean): void {
    this.power = on;
    this.pciContact.visible = !on;
    this.pciPower.visible = on;
  }

  setVisible(zone: boolean, pci: boolean): void {
    this.zone.visible = zone;
    this.pci.visible = pci;
  }

  /** Brief pulse when the swing reaches the plate. */
  flashContact(): void {
    this.flashT = 0;
  }

  /** Marks where the pitch crossed (red = strike, blue = ball). */
  showCrossing(x: number, y: number, strike: boolean): void {
    this.cross.position.set(x, y, 0);
    (this.cross.material as THREE.MeshBasicMaterial).color.set(strike ? '#ff4d5e' : '#3ec1f3');
    this.cross.visible = true;
    this.crossT = 0;
  }

  hideCrossing(): void {
    this.cross.visible = false;
  }

  update(dt: number): void {
    this.flashT += dt;
    const f = Math.max(0, 1 - this.flashT / 0.18);
    this.pci.scale.setScalar(1 + f * 0.25);
    this.crossT += dt;
    if (this.cross.visible && this.crossT > 2.2) this.cross.visible = false;
    this.hintAlpha += (this.hintTarget - this.hintAlpha) * Math.min(1, dt * (this.hintTarget > this.hintAlpha ? 9 : 14));
    this.hintMats.forEach((m, i) => (m.opacity = this.hintBase[i]! * this.hintAlpha));
    void this.power;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.mats.forEach((m) => m.dispose());
    this.hintTexture?.dispose();
  }
}
