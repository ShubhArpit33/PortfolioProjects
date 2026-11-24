import { GAME_URL, expect, test } from './helpers';

test('page boots a 480x270 canvas', async ({ page }) => {
  await page.goto(GAME_URL);
  const canvas = page.locator('#game canvas');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute('width', '480');
  await expect(canvas).toHaveAttribute('height', '270');
  await page.waitForFunction(() => window.__test?.ready() === true);
});
