// Tricks in the real game (v1.3): a backflip off the kicker lands, counts and refills the meter;
// an over-rotated one crashes and awards nothing. Both runs start at cp5 (Hemakuta Rocks).

import { CONFIG } from '../../src/config';
import { kickerFlip } from './flipHelper';
import { boot, expect, getLevel, getState, shot, startAt, test } from './helpers';

const ROCKS_CP = 5;

test('kicker: a backflip lands, counts as a flip and refills the boost meter; a botched one does not', async ({ page }) => {
  await boot(page);
  const level = await getLevel(page);
  const lipX = level.kicker.lipCol * level.tile;
  const tankEndX = lipX + 8 * level.tile;

  await startAt(page, ROCKS_CP);
  // Stop upside down for the screenshot, then finish the flip.
  expect(await kickerFlip(page, lipX - 32, 330, true, 180, true)).toBeNull();
  const mid = await getState(page);
  expect(mid.grounded).toBe(false);
  expect(mid.spin).toBeGreaterThanOrEqual(180);
  await shot(page, 'flip-midair');

  const r = (await kickerFlip(page, lipX - 32, 330, true, Infinity, true))!;
  console.log(
    `[flip e2e] air ${(r.airSteps / 120).toFixed(2)} s; lands at x=${r.after.x.toFixed(1)}; flips=${r.after.flips}; ` +
    `boost ${r.before.boost.toFixed(2)} -> ${r.after.boost.toFixed(2)}`,
  );
  expect(r.after.crashed).toBe(false);
  expect(r.after.crashes).toBe(0);
  expect(r.after.flips).toBe(1);
  expect(r.after.spin).toBe(0);
  expect(r.after.x).toBeGreaterThan(tankEndX);
  expect(r.before.boost).toBeLessThan(0.7);
  expect(r.after.boost).toBeGreaterThanOrEqual(r.before.boost + CONFIG.boostFlip - 1e-9);
  expect(r.after.boost).toBeLessThanOrEqual(r.before.boost + CONFIG.boostFlip + CONFIG.boostCleanLanding + 1e-9);
  await page.evaluate(() => { window.__test!.setInput({ throttle: true }); window.__test!.step(14); });
  await shot(page, 'flip-landed'); // "+FLIP" popup, FLIPS 1 in the HUD

  // Second run: hold Up far too long and never correct. Crash, no award.
  await startAt(page, ROCKS_CP);
  const bad = (await kickerFlip(page, lipX - 32, 440, false))!;
  expect(bad.after.crashed).toBe(true);
  expect(bad.after.crashes).toBe(1);
  expect(bad.after.flips).toBe(0);
});
