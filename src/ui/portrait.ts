import type { BatterLook } from '../contracts';

/**
 * Procedural batter portrait (inline SVG, flat broadcast-card illustration).
 * Everything is derived from `BatterLook`: height (a giant gets cropped by the
 * top of the card and gets a regular batter at his feet for scale), build and
 * belly (torso/hip width, round belly), muscle (V-taper, thick arms, pecs),
 * extra arms, skin/hair/jersey/trim colours, beard and number.
 *
 * Built with createElementNS (no innerHTML); the SVG is decorative
 * (aria-hidden) — the card text carries the same information.
 */

const NS = 'http://www.w3.org/2000/svg';
/**
 * Card-art canvas: fixed width, height follows the box aspect (the art is
 * redrawn on resize) so regular batters always fit and a giant is always
 * cropped by the top edge, whatever the card shape.
 */
const VB_W = 240;
const BASE_M = 1.85;
const DEFAULT_ASPECT = 1.2;

const INK = '#0b1426';
const BELT = '#1a2236';
const CLEAT = '#121a2b';
const WOOD = '#d2a06a';
const WOOD_DARK = '#9c6b3c';

let uid = 0;

type Attrs = Record<string, string | number>;
type Pt = [number, number];

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: SVGElement[]): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? r(v) : v);
  e.append(...children);
  return e;
}

function r(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Smooth path through points (Catmull-Rom → cubic Bézier). */
function smooth(pts: Pt[], closed = false): string {
  const n = pts.length;
  const at = (i: number): Pt => (closed ? pts[(i + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!);
  let d = `M${r(pts[0]![0])} ${r(pts[0]![1])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r(c1[0])} ${r(c1[1])} ${r(c2[0])} ${r(c2[1])} ${r(p2[0])} ${r(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  const n = parseInt(f, 16);
  return Number.isNaN(n) ? [128, 128, 128] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mixes `hex` toward `to` by t (0..1). */
function mix(hex: string, to: string, t: number): string {
  const a = hexRgb(hex);
  const b = hexRgb(to);
  const c = a.map((v, i) => Math.round(v + (b[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Closed outline of a tapered stroke along a centre line (horns). */
function taper(center: Pt[], width: (t: number) => number): string {
  const L: Pt[] = [];
  const R: Pt[] = [];
  center.forEach((p, i) => {
    const a = center[Math.max(0, i - 1)]!;
    const b = center[Math.min(center.length - 1, i + 1)]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const n = Math.hypot(dx, dy) || 1;
    const w = width(i / (center.length - 1)) / 2;
    L.push([p[0] - (dy / n) * w, p[1] + (dx / n) * w]);
    R.push([p[0] + (dy / n) * w, p[1] - (dx / n) * w]);
  });
  return smooth([...L, ...R.reverse()], true);
}

/** Samples a quadratic/cubic-like curve through control points (Catmull-Rom). */
function curvePts(ctrl: Pt[], n = 18): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * (ctrl.length - 1);
    const k = Math.min(ctrl.length - 2, Math.floor(t));
    const f = t - k;
    const p0 = ctrl[Math.max(0, k - 1)]!;
    const p1 = ctrl[k]!;
    const p2 = ctrl[k + 1]!;
    const p3 = ctrl[Math.min(ctrl.length - 1, k + 2)]!;
    const cr = (a: number, b: number, c: number, d: number): number => 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
    out.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}

function limb(pts: Pt[], width: number, color: string): SVGPathElement {
  return el('path', {
    d: `M${pts.map((p) => `${r(p[0])} ${r(p[1])}`).join('L')}`,
    fill: 'none',
    stroke: color,
    'stroke-width': width,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
}

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

interface Figure {
  g: SVGGElement;
  /** Half width at the hips (for placing props). */
  hipHalf: number;
}

/**
 * Draws one batter. `cx` = body centre, `feet` = ground y, `H` = drawn height.
 * Facing the viewer, bat resting on his right shoulder (viewer's left).
 */
function figure(look: BatterLook, cx: number, feet: number, H: number, id: string, detail = true): Figure {
  const u = H / 8;
  const T = feet - H;
  const b = Math.max(0.7, look.build);
  const m = Math.max(0, Math.min(1, look.muscle));
  const bl = Math.max(0, Math.min(1, look.belly));
  const y = (k: number): number => T + k * u;

  const sh = u * 0.95 * (1 + 0.45 * (b - 1)) * (1 + 0.4 * m);
  const waist = u * 0.66 * b * (1 - 0.2 * m);
  const hip = u * 0.72 * (1 + 0.75 * (b - 1));
  const bellyOut = bl * u * 0.55;
  const armW = u * (0.36 + 0.36 * m) * (1 + 0.3 * (b - 1));
  const foreW = armW * (0.82 + 0.06 * m);
  const legW = u * 0.5 * (1 + 0.55 * (b - 1)) * (1 + 0.22 * m);
  const neck = u * 0.21 * (1 + 0.7 * m) * (1 + 0.35 * (b - 1));
  const headRx = u * 0.36 * (1 + 0.2 * (b - 1));
  const headRy = u * 0.5;
  const headCy = y(0.56);
  const beltY = y(3.78);
  const beltHalf = Math.max(waist + bellyOut * 0.55, hip);

  const skin = look.skin;
  const skinDark = mix(skin, '#000000', 0.22);
  const jersey = look.jersey;
  const jerseyShade = mix(jersey, INK, 0.2);
  const trim = look.trim;
  const g = el('g');

  // ── Legs ──
  const legX = (side: number, k: number): number => cx + side * (hip * 0.52 + k * u * 0.16);
  for (const side of [-1, 1]) {
    const hipJ: Pt = [legX(side, 0), y(4.15)];
    const knee: Pt = [legX(side, 0.65), y(6.0)];
    const ankle: Pt = [legX(side, 1.0), y(7.72)];
    // Sock (calf) then pants (thigh + knee) on top.
    g.append(limb([knee, ankle], legW * 0.74, trim));
    g.append(limb([lerp(knee, ankle, 0.45), ankle], legW * 0.6, mix(trim, INK, 0.25)));
    g.append(limb([hipJ, knee, lerp(knee, ankle, 0.2)], legW, jersey));
    // Pant stripe along the outer seam.
    const off = side * legW * 0.4;
    g.append(limb([[hipJ[0] + off, hipJ[1]], [knee[0] + off, knee[1]]], Math.max(1, u * 0.06), trim));
    // Cleat.
    g.append(el('ellipse', { cx: ankle[0] + side * u * 0.14, cy: feet - u * 0.1, rx: u * 0.34 + legW * 0.15, ry: u * 0.14, fill: CLEAT }));
  }
  // Pants seat between the legs.
  g.append(
    el('path', {
      d: smooth([
        [cx - beltHalf, beltY],
        [cx - hip * 1.02, y(4.35)],
        [cx, y(4.55)],
        [cx + hip * 1.02, y(4.35)],
        [cx + beltHalf, beltY],
      ]) + 'Z',
      fill: jersey,
    }),
  );

  // ── Torso (jersey) ──
  const sideC = (s: number): Pt[] => [
    [cx + s * neck * 1.05, y(1.3)],
    [cx + s * (sh * 0.72 + neck * 0.3), y(1.42)],
    [cx + s * sh, y(1.68)],
    [cx + s * (sh * 0.92 - 0.04 * u), y(2.25)],
    [cx + s * (waist * (1 - 0.15 * m) + bellyOut * 0.8 + (sh - waist) * 0.35 * (1 - m)), y(2.95)],
    [cx + s * (waist + bellyOut * 0.75), y(3.4)],
    [cx + s * beltHalf, beltY + u * 0.05],
  ];
  const left = sideC(-1);
  const right = sideC(1).reverse();
  const torsoD = smooth(left) + `L${r(right[0]![0])} ${r(right[0]![1])}` + smooth(right).replace(/^M[^C]*/, '') + 'Z';
  const clipId = `${id}-torso`;
  g.append(el('clipPath', { id: clipId }, el('path', { d: torsoD })));
  g.append(el('path', { d: torsoD, fill: jersey }));
  const shade = el('g', { 'clip-path': `url(#${clipId})` });
  // Form shadow on the far side + under the chest.
  shade.append(el('path', { d: `M${r(cx + sh * 0.35)} ${r(y(1.2))}L${r(cx + sh * 1.3)} ${r(y(1.2))}L${r(cx + sh * 1.3)} ${r(beltY + u)}L${r(cx + sh * 0.2)} ${r(beltY + u)}Z`, fill: jerseyShade, opacity: 0.55 }));
  if (bl > 0.05) {
    // Belly: a rounded highlight + the crease beneath it.
    shade.append(el('ellipse', { cx: cx - u * 0.12, cy: y(3.05), rx: waist * 0.8 + bellyOut * 0.6, ry: u * (0.65 + 0.25 * bl), fill: '#ffffff', opacity: 0.18 }));
  }
  if (m > 0.5) {
    // Pecs and abs hint for the muscle build.
    for (const s of [-1, 1]) {
      shade.append(el('path', { d: `M${r(cx + s * u * 0.08)} ${r(y(2.45))}Q${r(cx + s * sh * 0.45)} ${r(y(2.6))} ${r(cx + s * sh * 0.78)} ${r(y(2.0))}`, fill: 'none', stroke: jerseyShade, 'stroke-width': u * 0.07, 'stroke-linecap': 'round' }));
    }
  }
  g.append(shade);
  // Placket + buttons.
  g.append(el('path', { d: `M${r(cx)} ${r(y(1.55))}L${r(cx)} ${r(beltY)}`, stroke: trim, 'stroke-width': Math.max(1, u * 0.05), fill: 'none' }));
  for (let i = 0; i < 4; i++) g.append(el('circle', { cx: cx + u * 0.08, cy: y(1.85 + i * 0.5), r: Math.max(0.6, u * 0.035), fill: mix(jersey, INK, 0.45) }));
  // V collar.
  g.append(el('path', { d: `M${r(cx - neck * 1.15)} ${r(y(1.28))}L${r(cx)} ${r(y(1.62))}L${r(cx + neck * 1.15)} ${r(y(1.28))}`, fill: 'none', stroke: trim, 'stroke-width': Math.max(1.2, u * 0.09), 'stroke-linejoin': 'round' }));
  // Chest number (lower left of the jersey, like the real thing).
  if (detail) {
    g.append(
      el('text', {
        x: cx + sh * 0.4,
        y: y(2.85),
        'text-anchor': 'middle',
        'font-family': "'Bebas Neue', 'Barlow Condensed', Impact, sans-serif",
        'font-size': u * 0.72,
        fill: trim,
        stroke: INK,
        'stroke-width': u * 0.05,
        'paint-order': 'stroke',
      }),
    );
    g.lastElementChild!.textContent = look.number;
  }
  // Belt.
  g.append(el('rect', { x: cx - beltHalf, y: beltY - u * 0.06, width: beltHalf * 2, height: u * 0.17, rx: u * 0.05, fill: BELT }));
  g.append(el('rect', { x: cx - u * 0.13, y: beltY - u * 0.07, width: u * 0.26, height: u * 0.19, rx: u * 0.04, fill: '#c9cfdb' }));
  if (bl > 0.3) {
    // A big belly hangs over the belt.
    const bx = waist * 0.95 + bellyOut * 0.5;
    const by = y(3.42);
    const bry = u * (0.42 + 0.22 * bl);
    // Underside shadow first, then the jersey-covered belly over it.
    g.append(el('ellipse', { cx, cy: by + bry * 0.12, rx: bx * 1.0, ry: bry * 1.02, fill: jerseyShade }));
    g.append(el('ellipse', { cx: cx - bx * 0.03, cy: by - bry * 0.04, rx: bx * 0.98, ry: bry * 0.96, fill: jersey }));
    g.append(el('path', { d: `M${r(cx)} ${r(by - bry)}L${r(cx)} ${r(by + bry * 0.92)}`, stroke: trim, 'stroke-width': Math.max(1, u * 0.05) }));
  }

  // ── Neck + head ──
  g.append(el('path', { d: `M${r(cx - neck)} ${r(headCy + headRy * 0.4)}L${r(cx - neck)} ${r(y(1.38))}Q${r(cx)} ${r(y(1.6))} ${r(cx + neck)} ${r(y(1.38))}L${r(cx + neck)} ${r(headCy + headRy * 0.4)}Z`, fill: skin }));
  g.append(el('path', { d: `M${r(cx - neck)} ${r(y(1.08))}Q${r(cx)} ${r(y(1.22))} ${r(cx + neck)} ${r(y(1.08))}L${r(cx + neck)} ${r(y(1.2))}Q${r(cx)} ${r(y(1.34))} ${r(cx - neck)} ${r(y(1.2))}Z`, fill: skinDark, opacity: 0.55 }));
  if (look.hair) {
    // Hair peeking out under the helmet (longer at the back).
    g.append(el('ellipse', { cx, cy: headCy + headRy * 0.05, rx: headRx * 1.18, ry: headRy * 0.92, fill: look.hair }));
  }
  // Ear (viewer's left; the right one is under the flap).
  g.append(el('ellipse', { cx: cx - headRx * 0.98, cy: headCy + headRy * 0.08, rx: headRx * 0.2, ry: headRy * 0.24, fill: skinDark }));
  g.append(el('ellipse', { cx, cy: headCy, rx: headRx, ry: headRy, fill: skin }));
  // Shadow cast by the helmet bill.
  g.append(el('ellipse', { cx, cy: headCy - headRy * 0.2, rx: headRx * 0.98, ry: headRy * 0.3, fill: '#000000', opacity: 0.16 }));
  // Eyes.
  for (const s of [-1, 1]) {
    // White of the eye first so the eyes read on every skin tone.
    g.append(el('ellipse', { cx: cx + s * headRx * 0.4, cy: headCy + headRy * 0.03, rx: u * 0.085, ry: u * 0.062, fill: '#f4f1e8' }));
    g.append(el('circle', { cx: cx + s * headRx * 0.4 + u * 0.012, cy: headCy + headRy * 0.04, r: u * 0.045, fill: '#14100e' }));
  }
  // Nose.
  g.append(el('path', { d: `M${r(cx + u * 0.02)} ${r(headCy + headRy * 0.08)}Q${r(cx + u * 0.09)} ${r(headCy + headRy * 0.3)} ${r(cx - u * 0.04)} ${r(headCy + headRy * 0.33)}`, fill: 'none', stroke: skinDark, 'stroke-width': u * 0.045, 'stroke-linecap': 'round' }));
  if (look.beard) {
    const bc = look.hair ?? '#15100c';
    g.append(
      el('path', {
        d: smooth([
          [cx - headRx * 0.97, headCy + headRy * 0.02],
          [cx - headRx * 0.82, headCy + headRy * 0.62],
          [cx, headCy + headRy * 1.06],
          [cx + headRx * 0.82, headCy + headRy * 0.62],
          [cx + headRx * 0.97, headCy + headRy * 0.02],
          [cx + headRx * 0.55, headCy + headRy * 0.36],
          [cx, headCy + headRy * 0.32],
          [cx - headRx * 0.55, headCy + headRy * 0.36],
        ], true),
        fill: bc,
      }),
    );
  }
  // Smile.
  // Grin: a light crescent outlined in dark lip colour (reads on any skin tone).
  g.append(el('path', { d: `M${r(cx - headRx * 0.32)} ${r(headCy + headRy * 0.47)}Q${r(cx)} ${r(headCy + headRy * 0.55)} ${r(cx + headRx * 0.34)} ${r(headCy + headRy * 0.45)}Q${r(cx + headRx * 0.05)} ${r(headCy + headRy * 0.8)} ${r(cx - headRx * 0.32)} ${r(headCy + headRy * 0.47)}Z`, fill: '#f4f1e8', stroke: mix(skin, '#3a0d0d', 0.6), 'stroke-width': u * 0.04, 'stroke-linejoin': 'round' }));
  // Batting helmet: dome, ear flap (viewer's right), bill and a gloss stripe.
  const helmet = trim;
  const hTop = T - u * 0.08;
  const rim = headCy - headRy * 0.12;
  g.append(el('path', { d: `M${r(cx + headRx * 0.7)} ${r(rim)}L${r(cx + headRx * 1.2)} ${r(rim)}L${r(cx + headRx * 1.22)} ${r(headCy + headRy * 0.42)}Q${r(cx + headRx * 1.0)} ${r(headCy + headRy * 0.62)} ${r(cx + headRx * 0.78)} ${r(headCy + headRy * 0.4)}Z`, fill: mix(helmet, INK, 0.12) }));
  g.append(el('path', { d: `M${r(cx - headRx * 1.12)} ${r(rim)}C${r(cx - headRx * 1.16)} ${r(hTop - u * 0.02)} ${r(cx + headRx * 1.16)} ${r(hTop - u * 0.02)} ${r(cx + headRx * 1.22)} ${r(rim)}Z`, fill: helmet }));
  g.append(el('path', { d: `M${r(cx - headRx * 0.75)} ${r(headCy - headRy * 0.55)}Q${r(cx - headRx * 0.2)} ${r(hTop + u * 0.06)} ${r(cx + headRx * 0.35)} ${r(hTop + u * 0.1)}`, fill: 'none', stroke: '#ffffff', 'stroke-width': u * 0.07, 'stroke-linecap': 'round', opacity: 0.35 }));
  g.append(el('ellipse', { cx: cx - headRx * 0.05, cy: rim + u * 0.01, rx: headRx * 1.08, ry: u * 0.085, fill: mix(helmet, INK, 0.35) }));
  if (look.horns) {
    // Villain horns: out from the helmet sides, up, then curling inward at the tips.
    for (const sd of [-1, 1]) {
      const base: Pt = [cx + sd * headRx * 0.95, headCy - headRy * 0.45];
      const ctrl: Pt[] = [base, [base[0] + sd * u * 0.32, base[1] - u * 0.18], [base[0] + sd * u * 0.48, base[1] - u * 0.62], [base[0] + sd * u * 0.32, base[1] - u * 1.02], [base[0] + sd * u * 0.06, base[1] - u * 1.18]];
      const c = curvePts(ctrl);
      g.append(el('path', { d: taper(c, (t) => u * (0.26 * Math.pow(1 - t, 0.75) + 0.015)), fill: '#2a1a26', stroke: '#0d0a0e', 'stroke-width': u * 0.025, 'stroke-linejoin': 'round' }));
      // Glossy highlight along the outer curve.
      const hl = c.slice(2, 13).map((p) => [p[0] + sd * u * 0.03, p[1]] as Pt);
      g.append(el('path', { d: `M${hl.map((p) => `${r(p[0])} ${r(p[1])}`).join('L')}`, fill: 'none', stroke: '#8a6a86', 'stroke-width': u * 0.035, 'stroke-linecap': 'round', opacity: 0.55 }));
    }
  }

  // ── Bat + arms ──
  const handR: Pt = [cx - sh * 0.32, y(2.75)];
  const knob: Pt = [handR[0] + u * 0.14, handR[1] + u * 0.55];
  const dir: Pt = [-0.42, -0.91];
  const len = u * 3.75;
  const tip: Pt = [knob[0] + dir[0] * len, knob[1] + dir[1] * len];
  const nrm: Pt = [-dir[1], dir[0]];
  const wAt = (t: number): number => u * (t < 0.45 ? 0.055 : 0.055 + (t - 0.45) * 0.3);
  const batPts: Pt[] = [];
  for (const t of [0, 0.45, 0.75, 1]) batPts.push([knob[0] + dir[0] * len * t + nrm[0] * wAt(t), knob[1] + dir[1] * len * t + nrm[1] * wAt(t)]);
  for (const t of [1, 0.75, 0.45, 0]) batPts.push([knob[0] + dir[0] * len * t - nrm[0] * wAt(t), knob[1] + dir[1] * len * t - nrm[1] * wAt(t)]);
  if (look.hornBat) {
    // A giant crescent horn: dark leather-wrapped handle, ivory barrel with growth rings.
    const ctrl: Pt[] = [0, 0.3, 0.6, 0.85, 1.04].map((t) => {
      const bow = Math.sin(Math.min(1, t) * Math.PI) * u * 0.42;
      return [knob[0] + dir[0] * len * t + nrm[0] * bow, knob[1] + dir[1] * len * t + nrm[1] * bow];
    });
    const c = curvePts(ctrl, 24);
    const hw = (t: number): number => u * (0.13 + 0.42 * Math.pow(t, 1.4));
    g.append(el('path', { d: taper(c, hw), fill: '#efe2c4', stroke: '#8a7350', 'stroke-width': u * 0.03, 'stroke-linejoin': 'round' }));
    for (const t of [0.45, 0.58, 0.7, 0.82, 0.93]) {
      const i = Math.round(t * (c.length - 1));
      const p = c[i]!;
      const q = c[Math.min(c.length - 1, i + 1)]!;
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const n = Math.hypot(dx, dy) || 1;
      const w = hw(i / (c.length - 1)) * 0.46;
      g.append(el('path', { d: `M${r(p[0] - (dy / n) * w)} ${r(p[1] + (dx / n) * w)}L${r(p[0] + (dy / n) * w)} ${r(p[1] - (dx / n) * w)}`, stroke: '#c7b28a', 'stroke-width': u * 0.025, 'stroke-linecap': 'round' }));
    }
    const grip = c.slice(0, Math.round(c.length * 0.32));
    g.append(el('path', { d: taper(grip, (t) => u * (0.15 + 0.06 * t)), fill: '#3a2a20' }));
    const end = c[c.length - 1]!;
    g.append(el('ellipse', { cx: end[0], cy: end[1], rx: hw(1) * 0.42, ry: hw(1) * 0.22, fill: '#c9b48a', transform: `rotate(${r((Math.atan2(dir[1], dir[0]) * 180) / Math.PI + 90)} ${r(end[0])} ${r(end[1])})` }));
  } else {
    g.append(el('path', { d: `M${batPts.map((p) => `${r(p[0])} ${r(p[1])}`).join('L')}Z`, fill: WOOD, stroke: WOOD_DARK, 'stroke-width': u * 0.03, 'stroke-linejoin': 'round' }));
    g.append(el('circle', { cx: tip[0], cy: tip[1], r: wAt(1), fill: WOOD }));
    g.append(el('circle', { cx: knob[0], cy: knob[1], r: u * 0.09, fill: WOOD_DARK }));
  }

  const arm = (shoulder: Pt, elbow: Pt, hand: Pt, gloved: boolean): void => {
    // Biceps bulge for muscular builds.
    g.append(limb([shoulder, elbow], armW, skin));
    if (m > 0.45) {
      const mid = lerp(shoulder, elbow, 0.55);
      g.append(el('ellipse', { cx: mid[0], cy: mid[1], rx: armW * 0.62, ry: armW * 0.72, fill: skin }));
    }
    g.append(limb([elbow, hand], foreW, skin));
    // Short sleeve with a trim band.
    const sl = lerp(shoulder, elbow, 0.44);
    g.append(limb([shoulder, sl], armW * 1.16, jersey));
    const band = limb([lerp(shoulder, elbow, 0.37), sl], armW * 1.18, trim);
    band.setAttribute('stroke-linecap', 'butt');
    g.append(band);
    // Fist, with a knuckle line when it grips the bat.
    g.append(el('circle', { cx: hand[0], cy: hand[1], r: foreW * 0.6, fill: skin }));
    if (gloved) g.append(el('path', { d: `M${r(hand[0] - foreW * 0.35)} ${r(hand[1] - foreW * 0.1)}L${r(hand[0] + foreW * 0.35)} ${r(hand[1] - foreW * 0.1)}`, stroke: skinDark, 'stroke-width': Math.max(0.6, u * 0.03), 'stroke-linecap': 'round' }));
  };
  const shL: Pt = [cx - sh + armW * 0.32, y(1.74)];
  const shR: Pt = [cx + sh - armW * 0.32, y(1.74)];
  const hipHand = (s: number): Pt => [cx + s * (beltHalf + u * 0.04), y(3.7)];
  const akimboElbow = (s: number, from: Pt): Pt => [cx + s * (Math.max(sh, beltHalf) + armW * 0.5 + u * 0.32), (from[1] + y(3.7)) / 2 + u * 0.08];
  if (look.extraArms) {
    // Lower pair: hands on the hips. Upper pair: both on the bat.
    for (const s of [-1, 1]) {
      const lowS: Pt = [cx + s * (Math.max(waist, sh * 0.78) - armW * 0.1), y(2.45)];
      arm(lowS, akimboElbow(s, lowS), hipHand(s), false);
    }
    arm(shR, [cx + sh * 0.35, y(3.0)], [handR[0] + u * 0.06, handR[1] - foreW * 0.9], true);
    arm(shL, [cx - sh - armW * 0.2, y(2.95)], handR, true);
  } else {
    arm(shR, akimboElbow(1, shR), hipHand(1), false);
    arm(shL, [cx - sh - armW * 0.2, y(2.95)], handR, true);
  }
  return { g, hipHalf: beltHalf };
}

function draw(svg: SVGSVGElement, look: BatterLook, aspect: number): void {
  const id = `bp${++uid}`;
  const VB_H = Math.round(VB_W / Math.max(0.6, Math.min(2, aspect)));
  const GROUND = VB_H - 9;
  // Regular batters fill ~80 % of the height; a giant is cut at the nose.
  const baseH = Math.min(VB_H * 0.8, 205);
  const natural = (baseH * look.heightM) / BASE_M;
  const giant = natural > GROUND - 4;
  const H = giant ? GROUND / (1 - 0.07) : natural;
  const cx = giant ? VB_W * 0.56 : VB_W * 0.53;
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.dataset.aspect = String(aspect);
  svg.replaceChildren();

  const glow = `${id}-glow`;
  const floor = `${id}-floor`;
  svg.append(
    el(
      'defs',
      {},
      el('radialGradient', { id: glow, cx: '55%', cy: '42%', r: '62%' }, el('stop', { offset: '0', 'stop-color': look.trim, 'stop-opacity': 0.55 }), el('stop', { offset: '0.55', 'stop-color': look.trim, 'stop-opacity': 0.12 }), el('stop', { offset: '1', 'stop-color': look.trim, 'stop-opacity': 0 })),
      el('linearGradient', { id: floor, x1: '0', y1: '0', x2: '0', y2: '1' }, el('stop', { offset: '0', 'stop-color': '#1d3a2c', 'stop-opacity': 0 }), el('stop', { offset: '1', 'stop-color': '#1d3a2c', 'stop-opacity': 0.9 })),
    ),
  );
  // Background: night sky panel, trim-coloured glow, light beams, giant number.
  svg.append(el('rect', { x: -200, y: -200, width: VB_W + 400, height: VB_H + 400, fill: '#10203b' }));
  svg.append(el('rect', { x: 0, y: 0, width: VB_W, height: VB_H, fill: `url(#${glow})` }));
  svg.append(el('path', { d: `M${VB_W * 0.08} -10L${VB_W * 0.3} -10L${VB_W * 0.58} ${VB_H}L${VB_W * 0.36} ${VB_H}Z`, fill: '#ffffff', opacity: 0.035 }));
  svg.append(el('path', { d: `M${VB_W * 0.72} -10L${VB_W * 0.84} -10L${VB_W * 0.98} ${VB_H}L${VB_W * 0.84} ${VB_H}Z`, fill: '#ffffff', opacity: 0.03 }));
  const bigNum = el('text', { x: VB_W - 6, y: VB_H * 0.74, 'text-anchor': 'end', 'font-family': "'Bebas Neue', 'Barlow Condensed', Impact, sans-serif", 'font-size': Math.min(150, VB_H * 0.66), fill: '#ffffff', opacity: 0.07 });
  bigNum.textContent = look.number;
  svg.append(bigNum);
  svg.append(el('rect', { x: -200, y: GROUND - 18, width: VB_W + 400, height: 400, fill: `url(#${floor})` }));
  svg.append(el('path', { d: `M-200 ${GROUND - 2}L${VB_W + 200} ${GROUND - 2}`, stroke: '#f4f1e8', 'stroke-opacity': 0.1, 'stroke-width': 1 }));

  const fig = figure(look, cx, GROUND, H, id);
  svg.append(el('ellipse', { cx, cy: GROUND + 1, rx: fig.hipHalf * 1.7 + 14, ry: 6, fill: '#000000', opacity: 0.35 }));
  if (giant) {
    // A regular 1.85 m batter at his feet, for scale.
    const refH = (H * BASE_M) / look.heightM;
    const refX = cx - fig.hipHalf - refH * 0.62;
    const ref = figure({ ...look, heightM: BASE_M, build: 1, belly: 0, muscle: 0.2, extraArms: false, beard: false, horns: false, hornBat: false, hair: '#2a1b12', skin: '#c68a5c', number: '1' }, refX, GROUND, refH, `${id}r`, false);
    svg.append(el('ellipse', { cx: refX, cy: GROUND + 0.5, rx: refH * 0.2, ry: 2.2, fill: '#000000', opacity: 0.35 }));
    svg.append(ref.g);
  }
  svg.append(fig.g);
}

const looks = new WeakMap<Element, BatterLook>();
let observer: ResizeObserver | null = null;
function watch(svg: SVGSVGElement, look: BatterLook): void {
  if (typeof ResizeObserver === 'undefined') return;
  looks.set(svg, look);
  observer ??= new ResizeObserver((entries) => {
    for (const e of entries) {
      const t = e.target as SVGSVGElement;
      if (!t.isConnected) {
        observer!.unobserve(t);
        continue;
      }
      const { width, height } = e.contentRect;
      if (width < 8 || height < 8) continue;
      const aspect = Math.round((width / height) * 20) / 20;
      const lk = looks.get(t);
      if (lk && Number(t.dataset.aspect) !== aspect) draw(t, lk, aspect);
    }
  });
  observer.observe(svg);
}

/** Builds the portrait art for a card; it re-frames itself to its box. */
export function batterPortrait(look: BatterLook): SVGSVGElement {
  const svg = el('svg', { preserveAspectRatio: 'xMidYMax slice', class: 'portrait-art', 'aria-hidden': 'true', focusable: 'false' });
  draw(svg, look, DEFAULT_ASPECT);
  watch(svg, look);
  return svg;
}
