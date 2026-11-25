// The three bike sprites in the real game (v1.6), at 4x: every pose each bike has to carry (standing with
// a foot down, riding, backing up, boosting, upside down in a flip, landed, tumbling in a crash, back at the
// checkpoint), saved as crops in test-results/shots for a look by eye. The checks here are about the game
// state behind each picture; the pixels themselves are checked in tests/unit/bikeArt.test.ts.

import type { Page } from '@playwright/test';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { BIKES, BIKE_ORDER, type BikeId } from '../../src/bike/bikes';
import { kickerFlip } from './flipHelper';
import { SHOTS_DIR, boot, expect, getLevel, getState, startAt, test } from './helpers';

const SCALE = 4;
test.use({ viewport: { width: 480 * SCALE, height: 270 * SCALE } });

const ROCKS_CP = 5;
const RIVER_CP = 6;

/** A crop of the screen around the bike, w x h game pixels, at 4 screen pixels per game pixel. */
async function bikeShot(page: Page, name: string, w = 72, h = 52, lift = 0): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  const s = await getState(page);
  const box = (await page.locator('#game canvas').boundingBox())!;
  const k = box.width / 480;
  expect(k, 'the canvas is shown at exactly 4x').toBe(SCALE);
  const gx = Math.max(0, Math.min(480 - w, Math.round(s.x - s.camX) - w / 2));
  const gy = Math.max(0, Math.min(270 - h, Math.round(s.y) - h + 8 - lift));
  await page.screenshot({
    path: path.join(SHOTS_DIR, `${name}.png`),
    clip: { x: box.x + gx * k, y: box.y + gy * k, width: w * k, height: h * k },
  });
}

async function fullShot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`) });
}

const run = (page: Page, input: Record<string, boolean>, steps: number): Promise<void> =>
  page.evaluate(({ input, steps }) => { const t = window.__test!; t.setInput(input); t.step(steps); }, { input, steps });

for (const bike of BIKE_ORDER) test(`${BIKES[bike].name} sprite: standing, riding, backing up, boosting, flipping, landing, crashing, respawning`, async ({ page }) => {
  const cfg = BIKES[bike].cfg;
  const id: BikeId = bike;
  await boot(page);
  const level = await getLevel(page);

  // Standing at the start: foot down.
  await startAt(page, 0, id);
  await run(page, {}, 40);
  let s = await getState(page);
  expect([s.bike, s.v, s.grounded]).toEqual([id, 0, true]);
  await bikeShot(page, `bike-${id}-4x-standing`);

  // Riding flat at top speed.
  await run(page, { throttle: true }, 330);
  s = await getState(page);
  expect(s.v).toBe(cfg.topSpeed);
  await bikeShot(page, `bike-${id}-4x`);
  await fullShot(page, `ride-flat-${id}-4x`);

  // A hop, at its top: level flight.
  await run(page, { throttle: true, hop: true }, 1);
  await run(page, { throttle: true }, Math.round((cfg.hopVelocity / cfg.gravity) * 120) - 1);
  s = await getState(page);
  expect(s.grounded).toBe(false);
  await bikeShot(page, `bike-${id}-4x-hop`, 72, 60);

  // Backing up: the foot shuffles.
  await startAt(page, 1, id);
  await run(page, { brake: true }, 130);
  s = await getState(page);
  expect(s.v).toBe(-cfg.reverseSpeed);
  await bikeShot(page, `bike-${id}-4x-reverse`);

  // Boosting on the river run-up: flame at this bike's exhaust tip, streaks, the rider leaning back.
  await startAt(page, RIVER_CP, id);
  await run(page, { throttle: true, boost: true }, 110);
  s = await getState(page);
  expect(s.v).toBeGreaterThan(cfg.topSpeed);
  await bikeShot(page, `bike-${id}-4x-boost`, 96, 52);
  await fullShot(page, `boost-${id}-4x`);

  // A backflip off the kicker: upside down, then landed.
  const lipX = level.kicker.lipCol * level.tile;
  await startAt(page, ROCKS_CP, id);
  expect(await kickerFlip(page, lipX - 32, 330, true, 180, true)).toBeNull();
  s = await getState(page);
  expect(s.grounded).toBe(false);
  expect(s.spin).toBeGreaterThanOrEqual(180);
  await bikeShot(page, `bike-${id}-4x-flip`, 80, 80, -36);
  await fullShot(page, `flip-midair-${id}-4x`);
  const r = (await kickerFlip(page, lipX - 32, 330, true, Infinity, true))!;
  expect(r.after.crashed, 'the flip lands').toBe(false);
  expect(r.after.flips).toBe(1);
  await bikeShot(page, `bike-${id}-4x-landing`, 80, 60); // the landing frame: squash and dust
  await run(page, { throttle: true }, 14);
  await fullShot(page, `flip-landed-${id}-4x`);

  // A crash: straight into the first pillar. The bike tumbles back, then is at the checkpoint again.
  await startAt(page, 2, id);
  const crashed = await page.evaluate(() => {
    const t = window.__test!;
    t.setInput({ throttle: true });
    for (let i = 0; i < 120 * 20 && !t.state().crashed; i++) t.step(1);
    t.setInput({});
    t.step(30); // a quarter of a second into the tumble
    return t.state();
  });
  expect(crashed.crashed).toBe(true);
  expect(crashed.crashes).toBe(1);
  await fullShot(page, `crash-${id}-4x`);
  await run(page, {}, 150); // respawn delay + fade
  s = await getState(page);
  expect([s.crashed, s.checkpoint, s.v, s.boost]).toEqual([false, 2, 0, 1]);
  await run(page, {}, 40);
  await bikeShot(page, `bike-${id}-4x-respawn`);
});

test('select screen, ghost and finish at 4x with the three sprites', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__test!.step(40));
  await fullShot(page, 'title-4x');
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.__test!.step(40));
  await page.waitForFunction(() => window.__test!.screen() === 'select');
  await fullShot(page, 'select-4x');
  for (const [key, name] of [['ArrowLeft', 'tonup'], ['ArrowLeft', 'sundowner']] as const) {
    await page.keyboard.press(key);
    await page.evaluate(() => window.__test!.step(40));
    await fullShot(page, `select-4x-${name}`);
  }
  // A quick practice finish on each bike for the finish screen behind its frame.
  for (const bike of BIKE_ORDER) {
    await startAt(page, RIVER_CP, bike);
    await page.evaluate(() => {
      const t = window.__test!;
      t.setInput({ throttle: true, boost: true });
      for (let i = 0; i < 120 * 30 && !t.state().finished; i++) t.step(1);
      t.setInput({});
      t.step(100); // stopped under the gateway, before the finish screen opens
    });
    expect((await getState(page)).finished).toBe(true);
    await bikeShot(page, `bike-${bike}-4x-finish`, 96, 60);
    await page.evaluate(() => window.__test!.step(140));
    expect(await page.evaluate(() => window.__test!.screen())).toBe('finish');
    await fullShot(page, `finish-${bike}-4x`);
  }
});
