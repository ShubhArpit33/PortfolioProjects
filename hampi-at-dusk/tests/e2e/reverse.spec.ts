// Backing up at a standstill, in the real game: Left brakes while rolling, then walks the bike backward
// at reverseSpeed; releasing stops it; the level start is a wall.

import { CONFIG } from '../../src/config';
import { boot, expect, getLevel, getState, shot, startAt, test } from './helpers';

test('Left brakes while rolling, backs the bike up from a standstill, and stops at the level start', async ({ page }) => {
  await boot(page);
  const level = await getLevel(page);
  await startAt(page, 1);
  const startX = (await getState(page)).x;

  // Roll forward for half a second, then hold Left through the stop and beyond.
  const trace = await page.evaluate(() => {
    const t = window.__test!;
    t.setInput({ throttle: true });
    t.step(60);
    const peak = t.state();
    t.setInput({ brake: true });
    const vs: number[] = [];
    for (let i = 0; i < 120 * 3; i++) { t.step(1); vs.push(t.state().v); }
    return { peakV: peak.v, peakX: peak.x, vs };
  });
  expect(trace.peakV).toBeGreaterThan(60);
  const stopAt = trace.vs.findIndex((v) => v === 0);
  const backAt = trace.vs.findIndex((v) => v < 0);
  expect(stopAt).toBeGreaterThan(0);
  expect(trace.vs.slice(0, stopAt).every((v) => v > 0), 'brakes without reversing').toBe(true);
  // held through the stop: a pause of reverseHoldDelayMs before it starts to back up
  expect(backAt - stopAt).toBe(Math.round((CONFIG.reverseHoldDelayMs / 1000) * 120) + 1);
  expect(Math.min(...trace.vs)).toBe(-CONFIG.reverseSpeed);

  const backing = await getState(page);
  expect(backing.v).toBe(-CONFIG.reverseSpeed);
  expect(backing.grounded).toBe(true);
  expect(backing.crashed).toBe(false);
  await shot(page, 'reverse');

  // Release: stops and stays put.
  await page.evaluate(() => { const t = window.__test!; t.setInput({}); t.step(30); });
  const stopped = await getState(page);
  expect(stopped.v).toBe(0);
  await page.evaluate(() => window.__test!.step(60));
  expect((await getState(page)).x).toBe(stopped.x);
  expect(stopped.x).toBeLessThan(trace.peakX);
  expect(stopped.checkpoint).toBe(1);
  expect(startX).toBeGreaterThan(0);

  // From cp0, backing up ends at the wall at the level start, with no crash.
  await startAt(page, 0);
  await page.evaluate(() => { const t = window.__test!; t.setInput({ brake: true }); t.step(120 * 4); });
  const atWall = await getState(page);
  expect(atWall.x).toBe(level.worldStartX);
  expect(atWall.v).toBe(0);
  expect(atWall.crashes).toBe(0);
  await shot(page, 'reverse-start-wall');
  await page.evaluate(() => { const t = window.__test!; t.setInput({ throttle: true }); t.step(60); });
  expect((await getState(page)).x).toBeGreaterThan(level.worldStartX);
});
