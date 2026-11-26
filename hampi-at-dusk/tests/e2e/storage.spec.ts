// The game must play the same when localStorage is unavailable (v1.3): here every access to it throws.
// A full run still gets its medal; best time and ghost live on in memory for the session.

import { MAX_HELMETS } from '../../src/journey';
import { BIKES } from '../../src/bike/bikes';
import { advance, planFor, resetBot } from './bot';
import { SPOT, boot, expect, getLevel, getState, rideFromTitle, shot, test } from './helpers';

test('with localStorage throwing: full run, medal, in-memory best and ghost, no console errors', async ({ page }) => {
  test.setTimeout(240_000);
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
  // With storage throwing the prefs always read "tutorial not done": the prompts show.
  expect((await getState(page)).prompt).toBe('HOLD RIGHT TO RIDE');
  for (const key of ['m', 'm', 'm', 'g', 'g']) {
    await page.keyboard.press(key);
    await page.evaluate(() => window.__test!.step(1));
  }

  let s = await advance(page, plan, Infinity);
  expect(s.finished).toBe(true);
  expect(s.crashes).toBe(0);
  expect(s.diyas).toBe(level.collectibles.length);
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
  // The tutorial is done for the rest of the session, from memory too.
  expect((await getState(page)).prompt, 'no prompt after a finished run, even though nothing could be saved').toBe('');
  await page.evaluate(() => { window.__test!.setInput({}); window.__test!.step(60); });
  s = await getState(page);
  expect(s.ghost).not.toBeNull();
  expect(s.ghost!.x).toBeGreaterThan(s.x);
  s = await advance(page, plan, SPOT.bazaar * level.tile);
  expect(s.crashes).toBe(0);
  expect(lay.cpX).toHaveLength(4);

  // v1.9: the journey works without storage too. Its helmets, its unlocks and its best time live in memory.
  await page.evaluate(() => { const t = window.__test!; t.setInput({}); t.startJourney('sundowner'); t.step(0); });
  await page.waitForFunction(() => window.__test!.state().mode === 'journey' && window.__test!.state().timeMs === 0);
  s = await getState(page);
  expect([s.stage, s.helmets, s.prompt]).toEqual(['hampi', MAX_HELMETS, '']);
  await page.evaluate(() => { const t = window.__test!; t.setInput({ throttle: true }); t.step(120); t.crash(); t.step(1); });
  expect((await getState(page)).helmets).toBe(MAX_HELMETS - 1);
  expect(await page.evaluate(() => window.__test!.journey()!.helmets)).toBe(MAX_HELMETS - 1);
});
