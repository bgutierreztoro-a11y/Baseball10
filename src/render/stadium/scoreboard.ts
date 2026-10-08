import * as THREE from 'three';
import type { StadiumDef } from '../../contracts';
import type { ScoreboardData } from '../api';
import { makeCanvas } from '../textures';
import type { Atmosphere } from './atmosphere';

/** Center-field video board rendered from a 2D canvas. */
export interface Scoreboard {
  group: THREE.Group;
  set(data: ScoreboardData): void;
  update(elapsed: number): void;
  dispose(): void;
}

export function createScoreboard(def: StadiumDef, atm: Atmosphere, at: { r: number; y: number }): Scoreboard {
  const small = def.features.sandlot;
  const W = small ? 12 : 30;
  const H = small ? 6 : 14;
  const [canvas, ctx] = makeCanvas(1024, Math.round((1024 * H) / W));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const group = new THREE.Group();
  group.name = 'scoreboard';

  const frameMat = new THREE.MeshStandardMaterial({ color: '#1b1f27', metalness: 0.4, roughness: 0.6 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 1.4, H + 1.4, 1.2), frameMat);
  const screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1, 1, 1).multiplyScalar(atm.night ? 1.25 : 1.05) });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), screenMat);
  screen.position.z = 0.62;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, 1, 1), frameMat);
  group.add(frame, screen, legs);

  const y = at.y + (small ? 2 : 4) + H / 2;
  group.position.set(0, y, at.r + 4);
  legs.scale.y = y - H / 2;
  legs.position.y = -(H / 2) - (y - H / 2) / 2;
  group.lookAt(0, y, 0);

  let current: ScoreboardData = { title: def.name.es.toUpperCase(), line1: '', line2: '', big: 'JONRÓN', highlight: false };
  const accent = def.palette.accent;
  const draw = (pulse: number): void => {
    const w = canvas.width;
    const h = canvas.height;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b1426');
    bg.addColorStop(1, '#050a14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // LED dot texture.
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let yy = 0; yy < h; yy += 6) ctx.fillRect(0, yy, w, 1);
    ctx.fillStyle = current.highlight ? accent : '#d7263d';
    ctx.fillRect(0, 0, w, h * 0.16);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(h * 0.11)}px "Barlow Condensed", Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(current.title, w * 0.03, h * 0.08);
    ctx.textAlign = 'right';
    ctx.fillText('JONRÓN', w * 0.97, h * 0.08);
    ctx.textAlign = 'center';
    const big = current.big;
    const scale = current.highlight ? 1 + 0.04 * Math.sin(pulse * 6) : 1;
    ctx.font = `bold ${Math.round(h * 0.42 * scale)}px "Bebas Neue", "Barlow Condensed", Impact, sans-serif`;
    ctx.fillStyle = current.highlight ? '#ffc83d' : '#f4f1e8';
    if (current.highlight) {
      ctx.shadowColor = '#ffc83d';
      ctx.shadowBlur = 30;
    }
    ctx.fillText(big, w / 2, h * 0.52);
    ctx.shadowBlur = 0;
    ctx.font = `600 ${Math.round(h * 0.1)}px "Barlow Condensed", Arial, sans-serif`;
    ctx.fillStyle = '#b9c0cf';
    ctx.fillText(current.line1, w / 2, h * 0.8);
    ctx.fillText(current.line2, w / 2, h * 0.92);
    tex.needsUpdate = true;
  };
  draw(0);

  let lastPulse = 0;
  return {
    group,
    set(data) {
      current = data;
      draw(0);
    },
    update(elapsed) {
      if (current.highlight && elapsed - lastPulse > 0.08) {
        lastPulse = elapsed;
        draw(elapsed);
      }
    },
    dispose() {
      tex.dispose();
      frameMat.dispose();
      screenMat.dispose();
      frame.geometry.dispose();
      screen.geometry.dispose();
      legs.geometry.dispose();
    },
  };
}
