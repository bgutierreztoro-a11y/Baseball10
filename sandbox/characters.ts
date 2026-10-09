// Visual QA for characters.
//   ?char=moro|mati|arturek|chamo (batter)   &peak=1 (golden aura)   &live=1 (interactive panel)
//   &view=batting (game camera)|side|front|pitcher|closeup|back|profile|rear|face|lineup  (&zoom=, &ly= for profile/rear)
//   &zone=1 (strike-zone outline)  &marker=0 (hide aim/sweet-spot markers)  &debug=1 (log arm IK overreach per step)
//   &pose=stance|load|mid|contact|follow|celebrate|whiff|delivery|release|follow2|strike
//   &aimX=0&aimY=0.8&hand=R|L&kind=contact|power
// view=lineup shows all four batters side by side, each at its own plate (seen from the mound side).
import * as THREE from 'three';
import { STADIUMS } from '../src/config/stadiums';
import { PITCHERS } from '../src/config/pitches';
import { CHARACTERS, characterById } from '../src/config/characters';
import { MOUND, PLATE, RUBBER_Z } from '../src/config/constants';
import type { CharacterDef, Hand, SwingKind } from '../src/contracts';
import { Renderer } from '../src/render/Renderer';
import { createStadium } from '../src/render/stadium';
import { characters, Batter } from '../src/render/characters';
import { BATTING_FOV, BATTING_LOOK, BATTING_POS } from '../src/render/CameraDirector';
import type { BatterRig } from '../src/render/api';
import { releasePoint } from '../src/sim/pitch';

const q = new URLSearchParams(location.search);
let hand = (q.get('hand') ?? 'R') as Hand;
const aimX = Number(q.get('aimX') ?? 0);
const aimY = Number(q.get('aimY') ?? 0.8);
const pose = q.get('pose') ?? 'stance';
let kind = (q.get('kind') ?? 'contact') as SwingKind;
const view = q.get('view') ?? 'batting';
const live = q.get('live') === '1';
const peak = q.get('peak') === '1';
const r = new Renderer(document.getElementById('c') as HTMLCanvasElement, (q.get('tier') as 'high') ?? 'high', false);
const st = createStadium(r.scene, STADIUMS[(q.get('id') as 'metro') ?? 'metro'], r.quality);
r.setAtmosphere(st.atmosphere.bloom, st.atmosphere.exposure);

/** A batter standing at a (possibly shifted) plate; `origin` is that plate's tip. */
interface Slot {
  def: CharacterDef;
  rig: BatterRig;
  origin: THREE.Vector3;
}
const slots: Slot[] = [];

function place(s: Slot): void {
  const side = hand === 'R' ? 1 : -1;
  s.rig.setHandedness(hand);
  s.rig.root.position.set(s.origin.x + side * s.rig.stanceOffsetX, 0, s.origin.z + 0.12);
  s.rig.root.rotation.y = -side * (Math.PI / 2);
  s.rig.setAim(s.origin.x + aimX, aimY);
  s.rig.setBatColors(q.get('wood') ?? '#d9b382', q.get('grip') ?? '#3d2b1f');
}

function addBatter(def: CharacterDef, origin: THREE.Vector3): Slot {
  const s: Slot = { def, rig: characters.createBatter(r.quality, def.look), origin };
  r.scene.add(s.rig.root);
  place(s);
  if (peak) s.rig.setPeak(true);
  slots.push(s);
  return s;
}

if (view === 'lineup') {
  // Plates spaced along X; the giant gets more room.
  let x = 5.2;
  for (const def of CHARACTERS) {
    const w = def.look.heightM > 3 ? 5.6 : 2.4;
    x -= w / 2;
    addBatter(def, new THREE.Vector3(x, 0, 0));
    x -= w / 2;
  }
} else {
  addBatter(characterById(q.get('char') ?? 'moro'), new THREE.Vector3());
}

const pitcher = characters.createPitcher(r.quality);
const catcher = characters.createCatcher(r.quality);
const ump = characters.createUmpire(r.quality);
r.scene.add(pitcher.root);
if (view !== 'lineup') r.scene.add(catcher.root, ump.root);
pitcher.root.position.set(0, MOUND.height, RUBBER_Z);
pitcher.root.rotation.y = Math.PI;
pitcher.setLook(PITCHERS.mago!.look, (q.get('phand') ?? 'R') as Hand);
catcher.root.position.set(0, 0, -0.95);
ump.root.position.set(hand === 'R' ? -1.3 : 1.3, 0, -1.7);
catcher.setTarget(aimX, aimY);

const markers = slots.map((s) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.037, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff3030', depthTest: false }));
  m.position.set(s.origin.x + aimX, aimY, PLATE.frontZ);
  m.renderOrder = 999;
  m.visible = q.get('marker') !== '0';
  r.scene.add(m);
  return m;
});
const ssMarkers = slots.map(() => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 6), new THREE.MeshBasicMaterial({ color: 'cyan', depthTest: false }));
  m.renderOrder = 999;
  m.visible = q.get('marker') !== '0';
  r.scene.add(m);
  return m;
});
// Strike zone outline (debug) on the contact plane of the main plate.
if (q.get('zone') === '1') {
  const zg = new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.44, 0.65));
  const zl = new THREE.LineSegments(zg, new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false }));
  zl.position.set(0, 0.775, PLATE.frontZ);
  zl.renderOrder = 998;
  r.scene.add(zl);
}
const rel = releasePoint((q.get('phand') ?? 'R') as Hand);
if (q.get('rel') === '1') {
  const relMarker = new THREE.Mesh(new THREE.SphereGeometry(0.04), new THREE.MeshBasicMaterial({ color: 'yellow', depthTest: false }));
  relMarker.position.set(rel.x, rel.y, rel.z);
  r.scene.add(relMarker);
}

const dt = 1 / 120;
let maxReach = 0;
const updateAll = (d: number): void => {
  for (const s of slots) {
    s.rig.update(d);
    if (s.rig instanceof Batter) {
      maxReach = Math.max(maxReach, s.rig.armOverreach);
      if (q.get('debug') === '1' && (s.rig.armOverreach > 0.01 || s.rig.extraArmOverreach > 0.01)) console.warn(`${s.def.id} t=${(performance.now() / 1000).toFixed(2)} overreach=${s.rig.armOverreach.toFixed(3)} extra=${s.rig.extraArmOverreach.toFixed(3)} step=${stepN}`);
    }
  }
  pitcher.update(d);
  catcher.update(d);
  ump.update(d);
};
let stepN = 0;
const step = (sec: number): void => {
  for (let t = 0; t < sec; t += dt) {
    stepN++;
    updateAll(dt);
  }
};
const each = (f: (b: BatterRig) => void): void => slots.forEach((s) => f(s.rig));

step(0.5);
const TC = kind === 'power' ? 0.15 : 0.12;
maxReach = 0;
if (pose === 'load') {
  each((b) => b.prepare(0.45));
  step(0.4);
}
if (['contact', 'follow', 'celebrate', 'mid'].includes(pose)) {
  each((b) => b.prepare(0.45));
  step(0.3);
  each((b) => b.swing(kind, TC));
  if (pose === 'mid') step(TC * Number(q.get('frac') ?? 0.55));
  if (pose === 'contact') {
    // Land exactly on the contact instant (integer steps + a fractional one).
    const n = Math.floor(TC / dt + 1e-6);
    for (let i = 0; i < n; i++) updateAll(dt);
    if (TC - n * dt > 1e-6) updateAll(TC - n * dt);
  }
  if (pose === 'follow') step(TC + Number(q.get('after') ?? 0.5));
  if (pose === 'celebrate') {
    step(TC + 0.3);
    each((b) => b.celebrate());
    step(Number(q.get('after') ?? 1.0));
  }
}
if (pose === 'whiff') {
  each((b) => b.prepare(0.45));
  step(0.3);
  each((b) => b.swing(kind, TC));
  step(TC + 0.4);
  each((b) => b.react('whiff'));
  step(0.5);
}
if (['delivery', 'release', 'follow2'].includes(pose)) {
  pitcher.startDelivery(1.0);
  step(pose === 'delivery' ? 0.6 : pose === 'release' ? 1.0 - dt * 0.5 : 1.6);
}
if (pose === 'strike') {
  ump.callStrike();
  step(0.5);
}
if (peak) step(0.6);

const log = document.getElementById('log')!;
function report(): void {
  const lines = slots.map((s, i) => {
    const sweet = s.rig.getBatSweetSpot(new THREE.Vector3());
    ssMarkers[i]!.position.copy(sweet);
    return `${s.def.id.padEnd(8)} x=${s.rig.stanceOffsetX.toFixed(2)} sweet=(${sweet.x.toFixed(3)},${sweet.y.toFixed(3)},${sweet.z.toFixed(3)}) err=${sweet.distanceTo(markers[i]!.position).toFixed(3)}`;
  });
  log.textContent = `pose=${pose} hand=${hand} kind=${kind} aim=(${aimX},${aimY}) armOverreach=${maxReach.toFixed(3)}\n${lines.join('\n')}`;
}
report();
console.warn(log.textContent);

const cam = r.camera;
const main = slots[0]!;
if (view === 'batting') {
  cam.fov = Number(q.get('fov') ?? BATTING_FOV);
  cam.position.copy(BATTING_POS);
  cam.lookAt(BATTING_LOOK);
}
if (view === 'side') { cam.fov = 35; cam.position.set(-1.5, 1.2, 5.5); cam.lookAt(0.5, 0.9, 0.3); }
if (view === 'front') { cam.fov = 35; cam.position.set(0, 1.3, 7); cam.lookAt(0.6, 0.9, 0); }
if (view === 'pitcher') { cam.fov = 30; cam.position.set(-6, 2.2, 15.5); cam.lookAt(0, 1.2, 17.5); }
if (view === 'closeup') { cam.fov = 35; cam.position.set(2.8, 1.4, -2.2); cam.lookAt(0.7, 1.0, 0.2); }
if (view === 'back') { cam.fov = 35; cam.position.set(2.2, 1.5, -3.2); cam.lookAt(0.9, 1.0, 0.3); }
if (view === 'lineup') {
  cam.fov = Number(q.get('fov') ?? 40);
  const d = Number(q.get('dist') ?? 17);
  cam.position.set(0.8, Number(q.get('cy') ?? 3.2), d);
  cam.lookAt(0.8, Number(q.get('ly') ?? 3.4), 0);
}
if (view === 'face' && main.rig instanceof Batter) {
  // Head close-up of the main batter, from where his face points.
  const head = main.rig.humanoid.head;
  const hp = head.getWorldPosition(new THREE.Vector3());
  const fwd = new THREE.Vector3(0, 0, 1).transformDirection(head.matrixWorld);
  const sc = main.def.look.heightM / 1.85;
  const yaw = Number(q.get('yaw') ?? 0.5);
  fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw * (hand === 'R' ? 1 : -1));
  cam.fov = 30;
  cam.position.copy(hp).addScaledVector(fwd, 0.8 * sc).add(new THREE.Vector3(0, Number(q.get('up') ?? 0.3) * sc, 0));
  cam.lookAt(hp.x, hp.y - 0.04 * sc, hp.z);
}
if (view === 'profile' || view === 'rear') {
  // Framed on the main batter, scaled to his height. profile: from the mound side; rear: from behind the catcher side.
  const sc = main.def.look.heightM / 1.85;
  const bx = main.rig.root.position.x;
  const sd = hand === 'R' ? 1 : -1;
  cam.fov = 30;
  const z = Number(q.get('zoom') ?? 1);
  const ly = Number(q.get('ly') ?? 0.95);
  if (view === 'profile') cam.position.set(bx - 0.6 * sc * sd * z, (ly + 0.15 * z) * sc, 0.12 + 4.6 * sc * z);
  else cam.position.set(bx + 2.2 * sc * sd * z, (ly + 0.55 * z) * sc, 0.12 - 4.0 * sc * z);
  cam.lookAt(bx - 0.15 * sc * sd, ly * sc, 0.12);
}
cam.updateProjectionMatrix();

// ── Live mode: selector + swing buttons, real-time animation. ──
if (live) {
  const ui = document.createElement('div');
  ui.style.cssText = 'position:fixed;right:8px;top:8px;display:flex;flex-direction:column;gap:4px;font:13px system-ui';
  const btn = (label: string, on: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'padding:6px 10px;cursor:pointer';
    b.onclick = on;
    ui.appendChild(b);
    return b;
  };
  for (const def of CHARACTERS) {
    btn(def.name, () => {
      const u = new URL(location.href);
      u.searchParams.set('char', def.id);
      if (u.searchParams.get('view') === 'lineup') u.searchParams.set('view', 'batting');
      location.href = u.toString();
    });
  }
  btn('Lineup', () => {
    const u = new URL(location.href);
    u.searchParams.set('view', 'lineup');
    location.href = u.toString();
  });
  btn('Swing (contact)', () => {
    kind = 'contact';
    each((b) => b.reset());
    each((b) => b.prepare(0.4));
    window.setTimeout(() => each((b) => b.swing('contact', 0.14)), 250);
  });
  btn('Swing (power)', () => {
    kind = 'power';
    each((b) => b.reset());
    each((b) => b.prepare(0.4));
    window.setTimeout(() => each((b) => b.swing('power', 0.16)), 250);
  });
  btn('Bat flip', () => each((b) => b.celebrate()));
  btn('Whiff', () => each((b) => b.react('whiff')));
  btn('Reset', () => each((b) => b.reset()));
  let peakOn = peak;
  btn('Toggle peak', () => {
    peakOn = !peakOn;
    each((b) => b.setPeak(peakOn));
  });
  btn('Hand R/L', () => {
    hand = hand === 'R' ? 'L' : 'R';
    slots.forEach(place);
  });
  document.body.appendChild(ui);
}

let last = performance.now();
const render = (): void => {
  const now = performance.now();
  const d = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (live) {
    updateAll(d);
    report();
  }
  st.update(0, 0, 0);
  r.render(1 / 60);
  requestAnimationFrame(render);
};
requestAnimationFrame(render);
