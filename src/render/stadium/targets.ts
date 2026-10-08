import * as THREE from 'three';
import type { TargetDef } from '../../contracts';
import { makeCanvas } from '../textures';

/** Mission targets: glowing rings on the grass and bullseye billboards. */
export interface TargetsView {
  group: THREE.Group;
  set(targets: TargetDef[]): void;
  hit(index: number): void;
  update(elapsed: number): void;
  dispose(): void;
}

function billboardTexture(hit: boolean): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.clearRect(0, 0, 512, 512);
  const rings = hit ? ['#ffc83d', '#fff1c1', '#ffc83d', '#fff1c1', '#ffc83d'] : ['#d7263d', '#ffffff', '#d7263d', '#ffffff', '#d7263d'];
  rings.forEach((col, i) => {
    ctx.beginPath();
    ctx.arc(256, 256, 240 - i * 46, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
  });
  ctx.lineWidth = 14;
  ctx.strokeStyle = hit ? '#ffc83d' : '#0b1426';
  ctx.beginPath();
  ctx.arc(256, 256, 247, 0, Math.PI * 2);
  ctx.stroke();
  if (hit) {
    ctx.strokeStyle = '#0b1426';
    ctx.lineWidth = 40;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(160, 262);
    ctx.lineTo(230, 330);
    ctx.lineTo(360, 180);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createTargets(): TargetsView {
  const group = new THREE.Group();
  group.name = 'targets';
  const texIdle = billboardTexture(false);
  const texHit = billboardTexture(true);
  const ringMatBase = new THREE.MeshBasicMaterial({ color: new THREE.Color('#3ec1f3').multiplyScalar(2.2), transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
  const fillMatBase = new THREE.MeshBasicMaterial({ color: '#3ec1f3', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  const postMat = new THREE.MeshStandardMaterial({ color: '#3a3f47', metalness: 0.5, roughness: 0.5 });
  let items: { root: THREE.Object3D; kind: TargetDef['kind']; mats: THREE.Material[]; hitAt: number; isHit: boolean; face?: THREE.MeshBasicMaterial }[] = [];
  const owned: { dispose(): void }[] = [];
  let now = 0;

  const clear = (): void => {
    items.forEach((it) => group.remove(it.root));
    owned.forEach((o) => o.dispose());
    owned.length = 0;
    items = [];
  };

  return {
    group,
    set(targets) {
      clear();
      for (const t of targets) {
        const root = new THREE.Group();
        root.position.set(t.position.x, t.position.y, t.position.z);
        if (t.kind === 'ring') {
          const ringMat = ringMatBase.clone();
          const fillMat = fillMatBase.clone();
          const ring = new THREE.Mesh(new THREE.RingGeometry(t.radius * 0.88, t.radius, 64), ringMat);
          const inner = new THREE.Mesh(new THREE.RingGeometry(t.radius * 0.42, t.radius * 0.5, 48), ringMat);
          const fill = new THREE.Mesh(new THREE.CircleGeometry(t.radius * 0.88, 64), fillMat);
          for (const m of [ring, inner, fill]) {
            m.rotation.x = -Math.PI / 2;
            m.renderOrder = 2;
            root.add(m);
            owned.push(m.geometry);
          }
          owned.push(ringMat, fillMat);
          items.push({ root, kind: 'ring', mats: [ringMat, fillMat], hitAt: -1, isHit: false });
        } else {
          const face = new THREE.MeshBasicMaterial({ map: texIdle, transparent: true, side: THREE.DoubleSide, fog: false });
          const d = t.radius * 1.6;
          const panel = new THREE.Mesh(new THREE.CircleGeometry(d / 2, 48), face);
          root.add(panel);
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1, 8), postMat);
          const postH = Math.max(0.5, t.position.y - d / 2);
          post.scale.y = postH;
          post.position.y = -d / 2 - postH / 2;
          if (t.position.y > d) root.add(post);
          root.lookAt(0, t.position.y, 0);
          owned.push(panel.geometry, post.geometry, face);
          items.push({ root, kind: 'billboard', mats: [face], hitAt: -1, isHit: false, face });
        }
        group.add(root);
      }
    },
    hit(index) {
      const it = items[index];
      if (!it || it.isHit) return;
      it.isHit = true;
      it.hitAt = now;
      if (it.face) it.face.map = texHit;
      for (const m of it.mats) {
        if (m instanceof THREE.MeshBasicMaterial && it.kind === 'ring') m.color.set('#ffc83d').multiplyScalar(m.opacity > 0.5 ? 2.4 : 1);
      }
    },
    update(elapsed) {
      now = elapsed;
      for (const it of items) {
        const pulse = 1 + Math.sin(elapsed * 3) * 0.03;
        const pop = it.hitAt >= 0 ? Math.max(0, 1 - (elapsed - it.hitAt) * 2) : 0;
        const s = pulse + pop * 0.4;
        if (it.kind === 'ring') it.root.scale.set(s, 1, s);
        else it.root.scale.setScalar(s);
      }
    },
    dispose() {
      clear();
      texIdle.dispose();
      texHit.dispose();
      ringMatBase.dispose();
      fillMatBase.dispose();
      postMat.dispose();
    },
  };
}
