// Visual QA: ?view=batting|side|pitcher|closeup&pose=stance|load|contact|follow|celebrate|delivery|release|follow2&aimX=0&aimY=0.8&hand=R|L&kind=contact|power
import * as THREE from 'three';
import { STADIUMS } from '../src/config/stadiums';
import { PITCHERS } from '../src/config/pitches';
import { MOUND, RUBBER_Z } from '../src/config/constants';
import type { Hand, SwingKind } from '../src/contracts';
import { Renderer } from '../src/render/Renderer';
import { createStadium } from '../src/render/stadium';
import { characters } from '../src/render/characters';
import { releasePoint } from '../src/sim/pitch';

const q = new URLSearchParams(location.search);
const hand = (q.get('hand') ?? 'R') as Hand;
const aimX = Number(q.get('aimX') ?? 0);
const aimY = Number(q.get('aimY') ?? 0.8);
const pose = q.get('pose') ?? 'stance';
const kind = (q.get('kind') ?? 'contact') as SwingKind;
const r = new Renderer(document.getElementById('c') as HTMLCanvasElement, 'high', false);
const st = createStadium(r.scene, STADIUMS[(q.get('id') as 'metro') ?? 'metro'], r.quality);
r.setAtmosphere(st.atmosphere.bloom, st.atmosphere.exposure);

const batter = characters.createBatter(r.quality);
const pitcher = characters.createPitcher(r.quality);
const catcher = characters.createCatcher(r.quality);
const ump = characters.createUmpire(r.quality);
r.scene.add(batter.root, pitcher.root, catcher.root, ump.root);
batter.setHandedness(hand);
batter.root.position.set(hand === 'R' ? 0.92 : -0.92, 0, 0.12);
batter.root.rotation.y = hand === 'R' ? -Math.PI / 2 : Math.PI / 2;
pitcher.root.position.set(0, MOUND.height, RUBBER_Z);
pitcher.root.rotation.y = Math.PI;
pitcher.setLook(PITCHERS.mago!.look, (q.get('phand') ?? 'R') as Hand);
catcher.root.position.set(0, 0, -0.95);
ump.root.position.set(hand === 'R' ? -0.95 : 0.95, 0, -2.3);
batter.setAim(aimX, aimY);
catcher.setTarget(aimX, aimY);

const marker = new THREE.Mesh(new THREE.SphereGeometry(0.03), new THREE.MeshBasicMaterial({ color: 'red', depthTest: false }));
marker.position.set(aimX, aimY, 0.4318);
const ss = new THREE.Mesh(new THREE.SphereGeometry(0.025), new THREE.MeshBasicMaterial({ color: 'cyan', depthTest: false }));
marker.renderOrder = ss.renderOrder = 999;
r.scene.add(marker, ss);
const rel = releasePoint((q.get('phand') ?? 'R') as Hand);
const relMarker = new THREE.Mesh(new THREE.SphereGeometry(0.04), new THREE.MeshBasicMaterial({ color: 'yellow', depthTest: false }));
relMarker.position.set(rel.x, rel.y, rel.z);
relMarker.renderOrder = 999;
r.scene.add(relMarker);

const dt = 1 / 120;
const step = (sec: number, f?: () => void) => { for (let t = 0; t < sec; t += dt) { f?.(); batter.update(dt); pitcher.update(dt); catcher.update(dt); ump.update(dt); } };
step(0.5);
const TC = kind === 'power' ? 0.15 : 0.12;
if (pose === 'load') { batter.prepare(0.45); step(0.4); }
if (['contact', 'follow', 'celebrate', 'mid'].includes(pose)) {
  batter.prepare(0.45); step(0.3);
  batter.swing(kind, TC);
  if (pose === 'mid') step(TC * 0.55);
  if (pose === 'contact') step(TC - dt * 0.5);
  if (pose === 'follow') step(TC + 0.5);
  if (pose === 'celebrate') { step(TC + 0.3); batter.celebrate(); step(1.0); }
}
if (pose === 'whiff') { batter.prepare(0.45); step(0.3); batter.swing(kind, TC); step(TC + 0.4); batter.react('whiff'); step(0.5); }
if (['delivery', 'release', 'follow2'].includes(pose)) {
  pitcher.startDelivery(1.0);
  step(pose === 'delivery' ? 0.6 : pose === 'release' ? 1.0 - dt * 0.5 : 1.6);
}
if (pose === 'strike') { ump.callStrike(); step(0.5); }

const sweet = batter.getBatSweetSpot(new THREE.Vector3());
ss.position.copy(sweet);
document.getElementById('log')!.textContent = `pose=${pose} hand=${hand} aim=(${aimX},${aimY}) sweet=(${sweet.x.toFixed(3)},${sweet.y.toFixed(3)},${sweet.z.toFixed(3)}) err=${sweet.distanceTo(marker.position).toFixed(3)}`;
console.warn(document.getElementById('log')!.textContent);

const cam = r.camera;
const view = q.get('view') ?? 'batting';
if (view === 'batting') { cam.fov = Number(q.get('fov') ?? 34); cam.position.set(0, Number(q.get('cy') ?? 1.85), Number(q.get('cz') ?? -4.4)); cam.lookAt(0, Number(q.get('ly') ?? 0.95), 16); }
if (view === 'side') { cam.fov = 35; cam.position.set(-1.5, 1.2, 5.5); cam.lookAt(0.5, 0.9, 0.3); }
if (view === 'front') { cam.fov = 35; cam.position.set(0, 1.3, 7); cam.lookAt(0.6, 0.9, 0); }
if (view === 'pitcher') { cam.fov = 30; cam.position.set(-6, 2.2, 15.5); cam.lookAt(0, 1.2, 17.5); }
if (view === 'closeup') { cam.fov = 35; cam.position.set(2.8, 1.4, -2.2); cam.lookAt(0.7, 1.0, 0.2); }
cam.updateProjectionMatrix();
const render = () => { st.update(0, 0, 0); r.render(1 / 60); requestAnimationFrame(render); };
requestAnimationFrame(render);
