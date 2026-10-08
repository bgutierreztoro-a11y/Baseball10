import * as THREE from 'three';

/**
 * Procedural canvas textures. No image files ship with the game
 * (docs/adr/ADR-005-procedural-assets.md); everything is painted here.
 * A tiny seeded PRNG keeps textures identical between runs.
 */

export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

export function canvasTexture(canvas: HTMLCanvasElement, opts: { repeat?: [number, number]; color?: boolean; anisotropy?: number } = {}): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (opts.color !== false) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = opts.anisotropy ?? 8;
  if (opts.repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  tex.needsUpdate = true;
  return tex;
}

function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
}

/** Grass with a two-tone mowing pattern; tile covers 2 stripes. */
export function grassTexture(base: string, alt: string, seed = 1): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = makeCanvas(size, size);
  const rnd = seeded(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = alt;
  ctx.fillRect(0, 0, size / 2, size / 2);
  ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
  // Blade noise.
  for (let i = 0; i < 26000; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const v = rnd();
    ctx.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, y, 1, 2 + rnd() * 3);
  }
  return canvasTexture(c, { repeat: [1, 1] });
}

/** Infield dirt / warning track with clumps and cleat marks. */
export function dirtTexture(base: string, seed = 2): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = makeCanvas(size, size);
  const rnd = seeded(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1800; i++) {
    const r = 1 + rnd() * 9;
    ctx.fillStyle = rnd() < 0.5 ? shade(base, -0.05 - rnd() * 0.05) : shade(base, 0.04 + rnd() * 0.04);
    ctx.globalAlpha = 0.25 + rnd() * 0.3;
    ctx.beginPath();
    ctx.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 30000; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(rnd() * size, rnd() * size, 1, 1);
  }
  return canvasTexture(c, { repeat: [1, 1] });
}

/** Vertical padding panels for the outfield wall. */
export function wallTexture(color: string): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, shade(color, 0.06));
  g.addColorStop(1, shade(color, -0.06));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(0, 0, 3, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(3, 0, 2, 256);
  return canvasTexture(c, { repeat: [1, 1] });
}

/** Chain-link fence (alpha) for the sandlot. */
export function chainLinkTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128);
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(205,210,215,1)';
  ctx.lineWidth = 3;
  for (let i = -128; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + 128, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
  }
  return canvasTexture(c, { repeat: [1, 1] });
}

/** Backstop netting (alpha grid). */
export function netTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(64, 64);
  ctx.strokeStyle = 'rgba(30,30,30,0.9)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 64; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 64);
    ctx.moveTo(0, i);
    ctx.lineTo(64, i);
    ctx.stroke();
  }
  return canvasTexture(c, { repeat: [1, 1] });
}

/** Windows grid for skyline buildings (emissive at night). */
export function windowsTexture(night: boolean, seed = 3): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 256);
  const rnd = seeded(seed);
  ctx.fillStyle = night ? '#0b1020' : '#6d7a8c';
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 256; y += 32) {
    // Whole floors are often dark at night.
    const floorLit = rnd() > 0.35;
    for (let x = 6; x < 128; x += 20) {
      const lit = rnd();
      if (night) ctx.fillStyle = floorLit && lit > 0.45 ? (lit > 0.9 ? '#ffcf8a' : '#f5ddb0') : '#121a2e';
      else ctx.fillStyle = lit > 0.5 ? '#b7cde0' : '#8ea3b8';
      ctx.fillRect(x, y, 13, 18);
    }
  }
  return canvasTexture(c, { repeat: [1, 1] });
}

/** Big painted text on a transparent canvas (wall distance markers, signs). */
export function textTexture(text: string, opts: { color?: string; font?: string; w?: number; h?: number; stroke?: string } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 256;
  const h = opts.h ?? 128;
  const [c, ctx] = makeCanvas(w, h);
  ctx.clearRect(0, 0, w, h);
  let px = Math.round(h * 0.72);
  const family = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';
  ctx.font = opts.font ?? `bold ${px}px ${family}`;
  // Shrink to fit the canvas width.
  while (!opts.font && ctx.measureText(text).width > w * 0.92 && px > 8) {
    px -= 2;
    ctx.font = `bold ${px}px ${family}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (opts.stroke) {
    ctx.lineWidth = h * 0.08;
    ctx.strokeStyle = opts.stroke;
    ctx.strokeText(text, w / 2, h / 2);
  }
  ctx.fillStyle = opts.color ?? '#ffffff';
  ctx.fillText(text, w / 2, h / 2);
  return canvasTexture(c);
}

/** Soft radial gradient (sprites, blob shadows, glows). */
export function radialTexture(inner: string, outer: string, size = 128): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvasTexture(c);
}
