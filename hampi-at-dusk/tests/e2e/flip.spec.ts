// Tricks in the real game (v1.3): a backflip off the kicker lands, counts and refills the meter;
// an over-rotated one crashes and awards nothing. Both runs start at cp5 (Hemakuta Rocks).

import type { Page } from '@playwright/test';
import { CONFIG } from '../../src/config';
import { boot, expect, getLevel, getState, shot, startAt, test, type GameSnapshot } from './helpers';

const ROCKS_CP = 5;

interface FlipResult { before: GameSnapshot; after: GameSnapshot; airSteps: number }

/**
 * Throttle to the kicker, hop on its ramp, hold Up until the bike has turned `release` degrees, then
 * (if `level`) level out. With `boostRunUp`, boost is held all the way to the hop (which empties most of
 * the meter, so the refill shows). Stops at `stopAtSpin` degrees (for a screenshot) or once the bike has landed or crashed.
 */
function kickerFlip(
  page: Page, hopX: number, release: number, level: boolean, stopAtSpin = Infinity, boostRunUp = false,
): Promise<FlipResult | null> {
  return page.evaluate(({ hopX, release, level, stopAtSpin, boostRunUp }) => {
    const t = window.__test!;
    const w = window as unknown as { __flip?: { hopped: boolean; released: boolean; air: number; before: unknown } };
    const mem = (w.__flip ??= { hopped: false, released: false, air: 0, before: null });
    let s = t.state();
    for (let i = 0; i < 120 * 20; i++) {
      const inAir = mem.hopped && !s.grounded;
      if (inAir && s.spin >= stopAtSpin) return null;
      if (inAir && s.spin >= release) mem.released = true;
      const holding = inAir && !mem.released;
      const levelling = level && inAir && mem.released;
      if (inAir || !mem.hopped) mem.before = s;
      t.setInput({
        throttle: true,
        boost: boostRunUp && !mem.hopped,
        hop: !mem.hopped && s.x >= hopX,
        tiltUp: holding || (levelling && s.angle < -3),
        tiltDown: levelling && s.angle > 3,
      });
      t.step(1);
      const n = t.state();
      if (!mem.hopped && !n.grounded && n.x >= hopX) mem.hopped = true;
      if (mem.hopped && !n.grounded) mem.air++;
      if (mem.hopped && (n.crashed || n.grounded)) {
        const out = { before: mem.before as typeof n, after: n, airSteps: mem.air };
        delete w.__flip;
        return out;
      }
      s = n;
    }
    throw new Error('the bike never landed');
  }, { hopX, release, level, stopAtSpin, boostRunUp });
}

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
