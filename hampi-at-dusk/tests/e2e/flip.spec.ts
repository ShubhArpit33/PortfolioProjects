// Tricks in the real game (v1.3): a backflip off the kicker lands, counts and refills the meter;
// an over-rotated one crashes and awards nothing. Both runs start at the Hemakuta Rocks (column 616).
// v1.7: the bonus ramp on Ruins Road (cp1 since v1.9) is a flip spot as well.

import { CONFIG } from '../../src/config';
import { kickerFlip } from './flipHelper';
import { CP, SPOT, boot, expect, getLevel, getState, shot, startAt, startAtCol, test } from './helpers';

const RUINS_CP = CP.ruins;

test('kicker: a backflip lands, counts as a flip and refills the boost meter; a botched one does not', async ({ page }) => {
  await boot(page);
  const level = await getLevel(page);
  const lipX = level.kicker!.lipCol * level.tile;
  const tankEndX = lipX + 8 * level.tile;

  await startAtCol(page, SPOT.rocks);
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
  await startAtCol(page, SPOT.rocks);
  const bad = (await kickerFlip(page, lipX - 32, 440, false))!;
  expect(bad.after.crashed).toBe(true);
  expect(bad.after.crashes).toBe(1);
  expect(bad.after.flips).toBe(0);
});

test('bonus ramp (v1.7): a backflip off the Ruins Road ramp lands and counts; ignoring the ramp costs nothing', async ({ page }) => {
  await boot(page);
  const level = await getLevel(page);
  const T = level.tile;
  const lipX = level.bonus!.lipCol * T;

  await startAt(page, RUINS_CP);
  // Stop upside down over the top of the ramp for the screenshot, then finish the flip.
  expect(await kickerFlip(page, lipX - 32, 330, true, 180)).toBeNull();
  const mid = await getState(page);
  expect(mid.grounded).toBe(false);
  expect(mid.spin).toBeGreaterThanOrEqual(180);
  await shot(page, 'ruins-bonus-flip-midair');
  const r = (await kickerFlip(page, lipX - 32, 330, true))!;
  console.log(`[bonus flip e2e] air ${(r.airSteps / 120).toFixed(2)} s; lands at x=${r.after.x.toFixed(1)}; flips=${r.after.flips}`);
  expect(r.after.crashed).toBe(false);
  expect([r.after.crashes, r.after.flips]).toEqual([0, 1]);
  await page.evaluate(() => { window.__test!.setInput({ throttle: true }); window.__test!.step(14); });
  await shot(page, 'ruins-bonus-flip-landed');

  // Throttle only, from the same checkpoint: over the ramp, off the drop, along the trail. No crash, all ten diyas.
  await startAt(page, RUINS_CP);
  const rolled = await page.evaluate((untilX) => {
    const t = window.__test!;
    t.setInput({ throttle: true });
    for (let i = 0; i < 120 * 30 && t.state().x < untilX && !t.state().crashed; i++) t.step(1);
    return t.state();
  }, (level.bonus!.cliffCol + 44) * T);
  expect([rolled.crashed, rolled.crashes, rolled.flips, rolled.diyas]).toEqual([false, 0, 0, 10]);
});
