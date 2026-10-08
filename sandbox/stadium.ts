// Visual QA sandbox: ?id=solar|malecon|metro|cumbre|final&view=batting|outfield|overview|title&quality=low|medium|high&targets=1
import { STADIUMS } from '../src/config/stadiums';
import { STAGES } from '../src/config/campaign';
import type { QualityTier, StadiumId } from '../src/contracts';
import { Renderer } from '../src/render/Renderer';
import { createStadium } from '../src/render/stadium';

const q = new URLSearchParams(location.search);
const id = (q.get('id') ?? 'metro') as StadiumId;
const view = q.get('view') ?? 'batting';
const tier = (q.get('quality') ?? 'high') as QualityTier;
const r = new Renderer(document.getElementById('c') as HTMLCanvasElement, tier, false);
const stadium = createStadium(r.scene, STADIUMS[id], r.quality);
r.setAtmosphere(stadium.atmosphere.bloom, stadium.atmosphere.exposure);
stadium.setScoreboard({ title: STADIUMS[id].name.es.toUpperCase(), line1: 'EV 108 MPH · LA 29°', line2: 'JONRÓN #3', big: '452 FT', highlight: true });
if (q.get('targets')) {
  const st = STAGES.find((s) => s.stadium === id && s.targets);
  if (st?.targets) stadium.setTargets(st.targets);
}
const cam = r.camera;
const views: Record<string, () => void> = {
  batting: () => { cam.fov = 40; cam.position.set(0, 1.62, -3.3); cam.lookAt(0, 1.05, 18); },
  outfield: () => { cam.fov = 50; cam.position.set(20, 22, 60); cam.lookAt(-10, 6, 120); },
  overview: () => { cam.fov = 50; cam.position.set(0, 70, -80); cam.lookAt(0, 0, 60); },
  title: () => { cam.fov = 50; cam.position.set(38, 30, -12); cam.lookAt(0, 2, 55); },
  stands: () => { cam.fov = 55; cam.position.set(0, 25, 160); cam.lookAt(0, 2, 0); },
};
(views[view] ?? views.batting!)();
cam.updateProjectionMatrix();
window.addEventListener('resize', () => r.resize());
let last = performance.now();
let t = 0;
const loop = (now: number) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  t += dt;
  stadium.update(dt, t, Number(q.get('excite') ?? 0));
  r.render(dt);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
(window as unknown as { __ready: boolean }).__ready = true;
// Top-down debug view.
if (view === 'top') { cam.fov = 60; cam.position.set(0, 190, 60); cam.lookAt(0, 0, 60); cam.updateProjectionMatrix(); }
if (q.get('only') === 'field') stadium.root.traverse((o) => { if (o.name === 'structures' || o.name === 'scenery') o.visible = false; });
if (q.get('noshadow')) { r.gl.shadowMap.enabled = false; }
for (const n of (q.get('hide') ?? '').split(',').filter(Boolean)) stadium.root.traverse((o) => { if (o.name === n) o.visible = false; });
