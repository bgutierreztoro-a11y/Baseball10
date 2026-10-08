#!/usr/bin/env node
/**
 * Headless screenshot helper for visual QA (uses the pre-installed Chromium
 * with SwiftShader WebGL2).
 *
 *   node scripts/shot.mjs <url> <out.png> [waitMs=2500] [width=1280] [height=720] [evalJs]
 *
 * Prints console errors from the page so rendering bugs are visible.
 */
import { chromium } from 'playwright';

const [url, out, waitMs = '2500', width = '1280', height = '720', evalJs] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node scripts/shot.mjs <url> <out.png> [waitMs] [width] [height] [evalJs]');
  process.exit(1);
}
const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(Number(waitMs));
if (evalJs) {
  await page.evaluate(evalJs);
  await page.waitForTimeout(800);
}
await page.screenshot({ path: out });
console.log(`saved ${out}`);
await browser.close();
