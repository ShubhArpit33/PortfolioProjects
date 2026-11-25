// The Warm-up Road and its tutorial (v1.7), in the real game: the four prompts by where the bike is, the
// log that only costs speed, the no-crash rule (a bad landing is a wobble), and when the prompts stop.
// (That a finished full run ends the tutorial, in storage and in memory, is checked in run.spec.ts and storage.spec.ts.)

import type { Page } from '@playwright/test';
import { BIKES, BIKE_ORDER } from '../../src/bike/bikes';
import { PREFS_KEY } from '../../src/progress';
import { boot, expect, getLevel, getState, rideFromTitle, shot, startAt, test, type GameSnapshot } from './helpers';

/** Hold an input until the bike's x reaches untilX (or it crashes, or 20 s pass). */
const rideTo = (page: Page, untilX: number, input: Record<string, boolean>): Promise<GameSnapshot> =>
  page.evaluate(({ untilX, input }) => {
    const t = window.__test!;
    t.setInput(input);
    for (let i = 0; i < 120 * 20 && t.state().x < untilX && !t.state().crashed; i++) t.step(1);
    return t.state();
  }, { untilX, input });

/**
 * One hop at hopX, the nose pulled up to half a turn and left there: the bike comes down on its back, a crash
 * landing anywhere outside the warm-up. (Held for the whole air it could come round as a flip off the roller.)
 */
const botchedHop = (page: Page, hopX: number): Promise<GameSnapshot> =>
  page.evaluate((hopX) => {
    const t = window.__test!;
    let hopped = false;
    for (let i = 0; i < 120 * 20; i++) {
      const s = t.state();
      if (s.crashed) return s;
      if (hopped && s.grounded) return s;
      const hop = !hopped && s.grounded && s.x >= hopX;
      t.setInput({ throttle: true, hop, tiltUp: !s.grounded && s.spin < 170 });
      t.step(1);
      if (hop && !t.state().grounded) hopped = true;
    }
    return t.state();
  }, hopX);

const prefs = (page: Page): Promise<Record<string, unknown>> =>
  page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) ?? '{}') as Record<string, unknown>, PREFS_KEY);

test('first visit: four prompts in turn, the log is a stumble, a bad landing is a wobble, and nothing on the Warm-up Road crashes', async ({ page }) => {
  await boot(page);
  const level = await getLevel(page);
  const T = level.tile;
  const cfg = BIKES.daybreak.cfg;
  const log = level.obstacles.find((o) => o.type === 'log')!;
  expect(level.prompts.map((p) => p.text)).toEqual([
    'HOLD RIGHT TO RIDE', 'SPACE - HOP THE LOG', 'HOLD SHIFT - BOOST', 'IN THE AIR: UP / DOWN TO TILT',
  ]);

  await rideFromTitle(page);
  let s = await getState(page);
  expect([s.bike, s.checkpoint, s.prompt]).toEqual(['daybreak', 0, 'HOLD RIGHT TO RIDE']);
  await page.evaluate(() => window.__test!.step(30));
  await shot(page, 'prompt-1-ride');

  // Throttle only. The second prompt comes up before the log ...
  s = await rideTo(page, 28 * T, { throttle: true });
  expect(s.prompt).toBe('SPACE - HOP THE LOG');
  await shot(page, 'prompt-2-hop-the-log');
  // ... and riding into the log anyway is a stumble: 40% of the speed, no crash.
  s = await rideTo(page, log.col * T - cfg.bikeHitW / 2 - 2, { throttle: true });
  expect(s.v).toBe(cfg.topSpeed);
  s = await rideTo(page, log.col * T + 6, { throttle: true });
  expect([s.stumbles, s.crashes, s.crashed]).toEqual([1, 0, false]);
  expect(s.v).toBeLessThan(cfg.topSpeed * 0.55);
  expect(s.v).toBeGreaterThan(cfg.topSpeed * 0.4);
  await shot(page, 'log-bump'); // "BUMP!", the bike rocking, still on its wheels
  s = await rideTo(page, 43 * T, { throttle: true });
  expect([s.stumbles, s.prompt], 'one stumble for the whole log; a beat with no prompt after it').toEqual([1, '']);

  // The boost strip: the third prompt, and boost along the diya line.
  s = await rideTo(page, 48 * T, { throttle: true });
  expect(s.prompt).toBe('HOLD SHIFT - BOOST');
  s = await rideTo(page, 62 * T, { throttle: true, boost: true });
  expect(s.v).toBeGreaterThan(cfg.topSpeed + 60);
  expect(s.boost).toBeLessThan(1);
  await shot(page, 'prompt-3-boost-strip');

  // The roller: the fourth prompt; a hop on its up-ramp with the nose held up all the way.
  s = await rideTo(page, 80 * T, { throttle: true });
  expect(s.prompt).toBe('IN THE AIR: UP / DOWN TO TILT');
  await shot(page, 'prompt-4-tilt');
  s = await botchedHop(page, 85 * T);
  expect([s.crashed, s.crashes, s.wobbles, s.grounded], 'a bad landing in the warm-up is a wobble').toEqual([false, 0, 1, true]);
  expect(s.angle, 'stood upright along the ground').toBeCloseTo(0, 6);
  expect(s.flips).toBe(0);
  await page.evaluate(() => { window.__test!.setInput({ throttle: true }); window.__test!.step(12); });
  await shot(page, 'wobble'); // "WOBBLE!"

  // The last metres: no prompt, and on to Bazaar Street's checkpoint without a crash.
  s = await rideTo(page, 104 * T, { throttle: true });
  expect(s.prompt).toBe('');
  s = await rideTo(page, level.checkpoints[1]!.col * T + 12, { throttle: true });
  expect([s.checkpoint, s.crashes, s.prompt]).toEqual([1, 0, '']);

  // The run was not finished, so the tutorial is not done: R shows the first prompt again.
  expect((await prefs(page)).tutorialDone).not.toBe(true);
  await page.keyboard.press('r');
  await page.evaluate(() => window.__test!.step(0));
  await page.waitForFunction(() => window.__test!.state().timeMs === 0 && window.__test!.state().x > 0);
  expect((await getState(page)).prompt).toBe('HOLD RIGHT TO RIDE');
});

test('the no-crash zone ends with the warm-up, on every bike; prompts stop for good once tutorialDone is saved', async ({ page }) => {
  await boot(page);
  const level = await getLevel(page);
  const T = level.tile;
  const safeEnd = level.safeZone.toCol * T;

  for (const bike of BIKE_ORDER) {
    // The last hop of the warm-up comes down in Bazaar Street and is still only a wobble ...
    await startAt(page, 0, bike);
    await rideTo(page, safeEnd - 40, { throttle: true });
    let s = await botchedHop(page, safeEnd - 6);
    expect(s.x, bike).toBeGreaterThan(safeEnd);
    expect([s.crashed, s.crashes, s.wobbles], bike).toEqual([false, 0, 1]);
    // ... the first hop taken past the line is a crash, as everywhere else.
    await startAt(page, 1, bike);
    s = await botchedHop(page, level.checkpoints[1]!.col * T + 60);
    expect([s.crashed, s.crashes, s.wobbles], bike).toEqual([true, 1, 0]);
  }

  // A practice run to the line (from the river checkpoint) is not "one full run": the prompts stay.
  await startAt(page, level.checkpoints.length - 1);
  const fin = await page.evaluate(() => {
    const t = window.__test!;
    t.setInput({ throttle: true, boost: true });
    for (let i = 0; i < 120 * 30 && !t.state().finished; i++) t.step(1);
    return t.finish();
  });
  expect(fin!.ranked).toBe(false);
  expect((await prefs(page)).tutorialDone).not.toBe(true);
  await startAt(page, 0);
  expect((await getState(page)).prompt).toBe('HOLD RIGHT TO RIDE');

  // With tutorialDone saved (as a finished full run saves it), a new visit shows no prompts at all.
  await page.evaluate((k) => {
    const p = JSON.parse(window.localStorage.getItem(k) ?? '{}') as Record<string, unknown>;
    window.localStorage.setItem(k, JSON.stringify({ ...p, tutorialDone: true }));
  }, PREFS_KEY);
  await boot(page);
  await rideFromTitle(page);
  let s = await getState(page);
  expect(s.prompt).toBe('');
  for (const col of [10, 30, 60, 85]) {
    s = await rideTo(page, col * T, { throttle: true });
    expect(s.prompt, `column ${col}`).toBe('');
  }
  await shot(page, 'warmup-tutorial-done');
  // The rules of the warm-up do not depend on the prompts: the log stumbled, and a bad landing still wobbles.
  expect(s.stumbles).toBe(1);
  s = await botchedHop(page, 86 * T);
  expect([s.crashed, s.crashes, s.wobbles]).toEqual([false, 0, 1]);
  // Changing a setting keeps the flag (G saves the prefs).
  await page.keyboard.press('g');
  await page.evaluate(() => window.__test!.step(1));
  expect(await prefs(page)).toMatchObject({ tutorialDone: true, ghost: false });
});
