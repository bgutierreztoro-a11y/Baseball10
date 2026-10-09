import { expect, test, type Page } from '@playwright/test';

/**
 * Smoke tests: the game boots, menus work, settings persist, and a real
 * pitch can be swung at (timed from the debug hook, like a player would).
 */
type Debug = { phase: string; releaseAtMs: number; flightTime: number; screen: { x: number; y: number } | null; swings: number } | null;

const debug = (page: Page): Promise<Debug> => page.evaluate(() => (window as unknown as { __jonron?: { debug(): Debug } }).__jonron?.debug() ?? null);

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|404|fonts\.g/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('boots to the title screen with a WebGL scene and no errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /JONR/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Campaña/ })).toBeVisible();
  const gl = await page.evaluate(() => !!(document.getElementById('scene') as HTMLCanvasElement).getContext('webgl2'));
  expect(gl).toBe(true);
  expect(errors).toEqual([]);
});

test('campaign is linear: 1-1 open, 1-2 locked', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Campaña/ }).click();
  await expect(page.getByRole('button', { name: /^1-1 Primer contacto$/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /^1-2 Levántala/ })).toBeDisabled();
});

test('settings persist (language switch)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Ajustes/ }).click();
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByRole('button', { name: /Close|Cerrar/ }).click();
  await expect(page.getByRole('button', { name: /Campaign/ })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jonron.save') ?? '{}').settings?.lang);
  expect(saved).toBe('en');
});

test('plays a pitch: swing is judged and a hit card is shown', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Campaña/ }).click();
  await page.getByRole('button', { name: /^1-1 Primer contacto$/ }).click();
  await page.getByRole('button', { name: /A batear/ }).click();

  // Aim as soon as the pitch is planned (the ready phase knows the crossing).
  let st: Debug = null;
  await expect
    .poll(
      async () => {
        st = await debug(page);
        return st && st.screen && (st.phase === 'ready' || st.phase === 'windup') ? 1 : 0;
      },
      { timeout: 45_000, intervals: [25] },
    )
    .toBe(1);
  const s = st as unknown as NonNullable<Debug>;
  if (s.screen) await page.mouse.move(s.screen.x, s.screen.y + 6);
  // Schedule the swing from inside the page: software WebGL runs at a few fps
  // in CI, too slow for a round trip per decision.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const app = (window as unknown as { __jonron: { debug(): { phase: string; releaseAtMs: number; flightTime: number } | null } }).__jonron;
        const go = (): void => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
          window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
        };
        const wait = (): void => {
          const d = app.debug();
          if (d && (d.phase === 'windup' || d.phase === 'pitch')) {
            setTimeout(go, Math.max(0, d.releaseAtMs + d.flightTime * 1000 - 120 - performance.now()));
            resolve();
          } else setTimeout(wait, 5);
        };
        wait();
      }),
  );

  await expect.poll(async () => (await debug(page))?.swings ?? 0, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.hitcard')).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('pause menu opens with Escape and resumes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Práctica/ }).click();
  await page.getByRole('button', { name: /A practicar/ }).click();
  await expect(page.locator('.hud')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: /^Continuar$/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
