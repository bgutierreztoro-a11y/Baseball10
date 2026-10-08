#!/usr/bin/env node
/**
 * Scripted play-through for visual QA: title → campaign → stage → swings.
 *   node scripts/play.mjs <baseUrl> <outDir> [stageId=1-1] [swings=4] [kind=contact|power]
 * Aims the mouse at the projected pitch crossing (slightly under it) and
 * swings at the ideal moment, capturing screenshots along the way.
 */
import { chromium } from 'playwright';

const [base = 'http://localhost:5181/', out = '.', stageId = '1-1', swingsArg = '4', kind = 'contact'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'es-ES' });
const errors = [];
if (process.env.UNLOCK) {
  // Seed a save with every stage completed (QA only).
  await page.addInitScript(() => {
    const ids = [];
    for (let c = 1; c <= 5; c++) for (let i = 1; i <= 5; i++) ids.push(`${c}-${i}`);
    const stages = Object.fromEntries(ids.map((id) => [id, { stars: 1, completed: true, bestLongestFt: 0 }]));
    localStorage.setItem('jonron.save', JSON.stringify({ version: 1, stages, seenTips: ['first'], settings: { lang: 'es' } }));
  });
}
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
const dbg = () => page.evaluate(() => window.__jonron?.debug());

await page.goto(base, { waitUntil: 'load' });
await page.waitForTimeout(5000);
await shot('01-title');
await page.getByRole('button', { name: /Campaña|Campaign/ }).first().click();
await page.waitForTimeout(800);
await shot('02-campaign');
await page.locator(`button.node`).filter({ hasText: stageId }).first().click();
await page.waitForTimeout(800);
await shot('03-intro');
await page.getByRole('button', { name: /A batear|Play ball/ }).click();
await page.waitForTimeout(4500);
await shot('04-batting');

const swings = Number(swingsArg);
for (let i = 0; i < swings; i++) {
  // Wait for a pitch whose ideal swing moment is still ahead of us.
  let st = null;
  const t0 = Date.now();
  for (;;) {
    st = await dbg();
    const ahead = st && (st.phase === 'windup' || st.phase === 'pitch') ? await page.evaluate((r) => r - performance.now(), st.releaseAtMs + st.flightTime * 1000 - 200) : -1;
    if (ahead > 60) break;
    if (Date.now() - t0 > 40000) { console.log('no pitch', JSON.stringify(st)); st = null; break; }
    await page.waitForTimeout(25);
  }
  if (!st) break;
  // Aim slightly under the crossing to lift the ball.
  await page.mouse.move(st.screen.x, st.screen.y + 6);
  const swingTime = kind === 'power' ? 150 : 120;
  const fire = st.releaseAtMs + st.flightTime * 1000 - swingTime;
  const wait = await page.evaluate((f) => f - performance.now(), fire);
  if (i === 0) {
    await page.waitForTimeout(Math.max(0, wait - 140));
    await shot('05-pitch');
  }
  await page.evaluate(({ f, k }) => new Promise((res) => {
    const go = () => {
      const opts = { key: ' ', code: 'Space', bubbles: true, shiftKey: k === 'power' };
      if (k === 'power') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', opts));
      window.dispatchEvent(new KeyboardEvent('keyup', opts));
      if (k === 'power') window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', bubbles: true }));
      res(null);
    };
    const d = f - performance.now();
    if (d <= 0) go(); else setTimeout(go, d);
  }), { f: fire, k: kind });
  await page.waitForTimeout(700);
  await shot(`06-flight-${i}`);
  await page.waitForTimeout(1500);
  await shot(`07-after-${i}`);
  console.log('state', JSON.stringify(await dbg()));
}
await page.waitForTimeout(6000);
await shot('08-end');
console.log('errors', JSON.stringify(errors));
await browser.close();
