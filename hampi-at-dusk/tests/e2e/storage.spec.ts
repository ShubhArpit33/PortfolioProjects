// The game must play the same when localStorage is unavailable (v1.3): here every access to it throws.
// A full run still gets its medal; best time and ghost live on in memory for the session.

import { BIKES } from '../../src/bike/bikes';
import { advance, planFor, resetBot } from './bot';
import { boot, expect, getLevel, getState, rideFromTitle, shot, test } from './helpers';

test('with localStorage throwing: full run, medal, in-memory best and ghost, no console errors', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
    });
  });
  await boot(page);
  expect(await page.evaluate(() => {
    try { void window.localStorage; return 'readable'; } catch { return 'throws'; }
  })).toBe('throws');

  const level = await getLevel(page);
  const { plan, lay } = planFor(level, BIKES.sundowner.cfg);

  // Real key presses: Enter starts; M and G both try to save a preference.
  await page.evaluate(() => window.__test!.step(30));
  await rideFromTitle(page, 'sundowner'); // picking a bike tries to save a preference too
  expect((await getState(page)).bike).toBe('sundowner');
  for (const key of ['m', 'm', 'm', 'g', 'g']) {
    await page.keyboard.press(key);
    await page.evaluate(() => window.__test!.step(1));
  }

  let s = await advance(page, plan, Infinity);
  expect(s.finished).toBe(true);
  expect(s.crashes).toBe(0);
  expect(s.diyas).toBe(level.diyas.length);
  const fin = (await page.evaluate(() => window.__test!.finish()))!;
  expect(fin.medal).toBe('gold');
  expect(fin.newTime).toBe(true);
  expect(fin.saved).toBe(false);
  await page.evaluate(() => { window.__test!.setInput({}); window.__test!.step(240); });
  await shot(page, 'finish-no-storage');

  // Ride again: the best and its ghost come from memory.
  await page.keyboard.press('r');
  await page.evaluate(() => window.__test!.step(0));
  await page.waitForFunction(() => window.__test!.state().timeMs === 0 && !window.__test!.state().finished);
  await resetBot(page);
  await page.evaluate(() => { window.__test!.setInput({}); window.__test!.step(60); });
  s = await getState(page);
  expect(s.ghost).not.toBeNull();
  expect(s.ghost!.x).toBeGreaterThan(s.x);
  s = await advance(page, plan, lay.cpX[1]!);
  expect(s.crashes).toBe(0);
});
