/** Tiny DOM builders shared by the UI modules (textContent only, never innerHTML). */
export type Child = Node | string | null | undefined | false;
export type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg(viewBox: string, cls: string, paths: { d: string; fill?: string; stroke?: string; sw?: number }[]): SVGSVGElement {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', viewBox);
  s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true');
  for (const p of paths) {
    const e = document.createElementNS(SVG_NS, 'path');
    e.setAttribute('d', p.d);
    e.setAttribute('fill', p.fill ?? 'currentColor');
    if (p.stroke) {
      e.setAttribute('stroke', p.stroke);
      e.setAttribute('stroke-width', String(p.sw ?? 2));
      e.setAttribute('stroke-linecap', 'round');
    }
    s.append(e);
  }
  return s;
}

