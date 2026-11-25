// The rolling boulder on the temple terrace (v1.7), in the real game: it waits for its trigger, rolls the
// same way every time (game time only), crashes a bike that rides into it, is hopped from a run and from a
// standstill, breaks up at the top riser, and goes back to its doorway when the bike respawns.

import type { Page } from '@playwright/test';
import { BIKES, BIKE_ORDER } from '../../src/bike/bikes';
import { boot, expect, getLevel, getState, shot, startAt, test, type GameSnapshot } from './helpers';

const TERRACE_CP = 10;

interface Trace {
  /** per fixed step: bike x, boulder x (null while it is hidden or gone) */
  rows: Array<[number, number | null]>;
  /** the step on which it started to roll, and on which the bike crashed (-1: never) */
  startStep: number;
  crashStep: number;
  end: GameSnapshot;
}

/** From where the bike is: throttle held for up to `steps` fixed steps (stops at a crash). One row per step. */
const throttleTrace = (page: Page, steps: number): Promise<Trace> =>
  page.evaluate((steps) => {
    const t = window.__test!;
    const out = { rows: [] as Array<[number, number | null]>, startStep: -1, crashStep: -1, end: t.state() };
    t.setInput({ throttle: true });
    for (let i = 0; i < steps; i++) {
      t.step(1);
      const s = t.state();
      out.rows.push([s.x, s.boulder.phase === 'roll' ? s.boulder.x : null]);
      if (out.startStep < 0 && s.boulder.phase === 'roll') out.startStep = i;
      out.end = s;
      if (s.crashed) { out.crashStep = i; break; }
    }
    return out;
  }, steps);

test('boulder: hidden until the trigger, the same roll every time, a crash if ridden into, back in its doorway on respawn', async ({ page }) => {
  await boot(page);
  const level = await getLevel(page);
  const T = level.tile;
  const B = level.boulder;
  const triggerX = B.triggerCol * T;
  const spawnX = B.spawnCol * T;

  await startAt(page, TERRACE_CP, 'daybreak');
  let s = await getState(page);
  expect(s.boulder).toEqual({ phase: 'hidden', x: spawnX });
  // Standing at the checkpoint for two seconds sets nothing off.
  await page.evaluate(() => { window.__test!.setInput({}); window.__test!.step(240); });
  expect((await getState(page)).boulder).toEqual({ phase: 'hidden', x: spawnX });

  // Ride at it: it starts on the step the bike reaches the trigger, then moves 80 px/s, and the bike crashes into it.
  const first = await throttleTrace(page, 120 * 8);
  expect(first.startStep).toBeGreaterThan(0);
  expect(first.rows[first.startStep - 1]![0]).toBeLessThan(triggerX);
  expect(first.rows[first.startStep]![0]).toBeGreaterThanOrEqual(triggerX);
  expect(first.rows[first.startStep]![1]).toBe(spawnX);
  for (let i = first.startStep + 1; i <= first.crashStep; i++) {
    expect(first.rows[i - 1]![1]! - first.rows[i]![1]!).toBeCloseTo(B.speed / 120, 6);
  }
  expect(first.crashStep).toBeGreaterThan(first.startStep + 120); // more than a second of warning, even from a standing start
  expect([first.end.crashed, first.end.crashes]).toEqual([true, 1]);
  // the bike's front met the rock's hitbox
  const rockX = first.rows[first.crashStep]![1]!;
  expect(first.end.x + BIKES.daybreak.cfg.bikeHitW / 2).toBeGreaterThan(rockX);
  expect(first.end.x + BIKES.daybreak.cfg.bikeHitW / 2).toBeLessThan(rockX + 6);
  console.log(`[boulder] from rest at cp10: starts at step ${first.startStep}, crash at step ${first.crashStep} (${((first.crashStep - first.startStep) / 120).toFixed(2)} s later), bike x=${first.end.x.toFixed(1)}`);
  await page.evaluate(() => { window.__test!.setInput({}); window.__test!.step(24); });
  await shot(page, 'boulder-crash');

  // Respawn (1 s + fade): the bike is back at the checkpoint and the boulder back in its doorway.
  await page.evaluate(() => window.__test!.step(160));
  s = await getState(page);
  expect([s.crashed, s.checkpoint, s.v]).toEqual([false, TERRACE_CP, 0]);
  expect(s.x).toBe(level.checkpoints[TERRACE_CP]!.col * T + T / 2);
  expect(s.boulder).toEqual({ phase: 'hidden', x: spawnX });

  // The same ride again: the same trace, step for step, to the last bit.
  const second = await throttleTrace(page, 120 * 8);
  expect(second.rows).toEqual(first.rows);
  expect([second.startStep, second.crashStep]).toEqual([first.startStep, first.crashStep]);

  // And again after a full page reload.
  await boot(page);
  await startAt(page, TERRACE_CP, 'daybreak');
  await page.evaluate(() => { window.__test!.setInput({}); window.__test!.step(240); });
  const third = await throttleTrace(page, 120 * 8);
  expect(third.rows).toEqual(first.rows);

  // On every bike: ridden into, it is a crash, and the respawn resets it.
  for (const bike of BIKE_ORDER) {
    await startAt(page, TERRACE_CP, bike);
    const run = await throttleTrace(page, 120 * 8);
    expect([run.end.crashed, run.end.crashes], bike).toEqual([true, 1]);
    expect(run.end.x, bike).toBeGreaterThan(triggerX);
    await page.evaluate(() => { window.__test!.setInput({}); window.__test!.step(190); });
    s = await getState(page);
    expect([s.crashed, s.checkpoint], bike).toEqual([false, TERRACE_CP]);
    expect(s.boulder, bike).toEqual({ phase: 'hidden', x: spawnX });
  }
});

test('boulder: it only moves on game time (pause), C sends it home, a hop clears it, and it breaks up at the top riser', async ({ page }) => {
  await boot(page);
  const level = await getLevel(page);
  const T = level.tile;
  const B = level.boulder;
  const spawnX = B.spawnCol * T;
  const endX = B.endCol * T;
  const cfg = BIKES.daybreak.cfg;

  // Set it rolling, then pause: nothing moves, however many frames or however much real time passes.
  await startAt(page, TERRACE_CP, 'daybreak');
  const rolling = await page.evaluate(() => {
    const t = window.__test!;
    t.setInput({ throttle: true });
    for (let i = 0; i < 120 * 4 && t.state().boulder.phase !== 'roll'; i++) t.step(1);
    t.step(20);
    return t.state();
  });
  expect(rolling.boulder.phase).toBe('roll');
  await shot(page, 'boulder-cue-from-rest'); // the "!" at the right edge: the rock is still off screen
  await page.keyboard.press('p');
  await page.evaluate(() => window.__test!.step(240));
  expect(await page.evaluate(() => window.__test!.screen())).toBe('paused');
  expect((await getState(page)).boulder).toEqual(rolling.boulder);
  await page.evaluate(() => window.__test!.setManual(false));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__test!.setManual(true));
  expect((await getState(page)).boulder).toEqual(rolling.boulder);
  await page.keyboard.press('p');
  await page.evaluate(() => { window.__test!.setInput({}); window.__test!.step(1); });
  expect((await getState(page)).boulder.x).toBeLessThan(rolling.boulder.x);

  // C (back to the checkpoint) while it rolls: it is back in its doorway with the bike back at the lamp.
  await page.keyboard.press('c');
  await page.evaluate(() => window.__test!.step(60));
  let s = await getState(page);
  expect([s.crashed, s.checkpoint, s.crashes]).toEqual([false, TERRACE_CP, 1]);
  expect(s.boulder).toEqual({ phase: 'hidden', x: spawnX });

  // A hop taken so that the top of it is over the rock: no crash. Stop in mid-air, right above it.
  const tHop = (2 * cfg.hopVelocity) / cfg.gravity;
  const hopOver = await page.evaluate(({ tHop, speed, w }) => {
    const t = window.__test!;
    let hopped = false;
    for (let i = 0; i < 120 * 8; i++) {
      const s = t.state();
      if (s.crashed) return s;
      const centre = s.boulder.x + w / 2;
      if (hopped && !s.grounded && centre <= s.x) return s; // right over it
      const close = s.boulder.phase === 'roll' && centre - s.x <= (s.v + speed) * (tHop / 2);
      const hop = !hopped && s.grounded && close;
      t.setInput({ throttle: true, hop, tiltUp: !s.grounded && s.angle < -3, tiltDown: !s.grounded && s.angle > 3 });
      t.step(1);
      if (hop && !t.state().grounded) hopped = true;
    }
    return t.state();
  }, { tHop, speed: B.speed, w: B.hitW });
  expect([hopOver.crashed, hopOver.grounded]).toEqual([false, false]);
  expect(hopOver.y, 'well above the 14 px rock').toBeLessThan(222 - B.terraceH * T - B.hitH - 8);
  await shot(page, 'boulder-hop-from-rest');

  // Land, then stop on the terrace and watch it go: it rolls on to the top riser and breaks up there.
  const watched = await page.evaluate((endX) => {
    const t = window.__test!;
    let landed: ReturnType<typeof t.state> | null = null;
    let lastRollX = Infinity;
    for (let i = 0; i < 120 * 12; i++) {
      const s = t.state();
      if (!landed && s.grounded) landed = s;
      if (s.boulder.phase === 'roll') lastRollX = s.boulder.x;
      if (s.boulder.phase === 'gone') return { landed, lastRollX, gone: s, steps: i };
      t.setInput({ brake: landed !== null && s.v > 0 });
      t.step(1);
    }
    return { landed, lastRollX, gone: t.state(), steps: -1, endX };
  }, endX);
  expect(watched.landed).not.toBeNull();
  expect(watched.landed!.crashes).toBe(1); // only the C from before
  expect(watched.gone.boulder.phase).toBe('gone');
  expect(watched.lastRollX).toBeGreaterThan(endX);
  expect(watched.lastRollX).toBeLessThan(endX + 1);
  expect(watched.gone.crashes).toBe(1);

  // Once gone it stays gone for the rest of the terrace, and the stairs down are just rolled.
  s = await page.evaluate((untilX) => {
    const t = window.__test!;
    t.setInput({ throttle: true });
    for (let i = 0; i < 120 * 20 && t.state().x < untilX && !t.state().crashed; i++) t.step(1);
    return t.state();
  }, level.checkpoints[TERRACE_CP + 1]!.col * T + T);
  expect([s.crashed, s.crashes, s.checkpoint, s.boulder.phase]).toEqual([false, 1, TERRACE_CP + 1, 'gone']);
});

test('boulder: hopped from a standstill, and its break-up seen from the top of the steps', async ({ page }) => {
  await boot(page);
  const level = await getLevel(page);
  const T = level.tile;
  const B = level.boulder;
  const cfg = BIKES.daybreak.cfg;
  const waitX = level.checkpoints[TERRACE_CP]!.col * T + T / 2; // back at the lamp

  await startAt(page, TERRACE_CP, 'daybreak');
  // Ride on until it starts, stop, back the bike up to the lamp, and wait for it there.
  const r = await page.evaluate(({ waitX, tHop, speed, w }) => {
    const t = window.__test!;
    let phase: 'out' | 'stop' | 'back' | 'wait' | 'air' | 'done' = 'out';
    let apex: ReturnType<typeof t.state> | null = null;
    for (let i = 0; i < 120 * 30; i++) {
      const s = t.state();
      if (s.crashed) return { s, apex, phase };
      let input: Record<string, boolean> = {};
      if (phase === 'out') {
        input = { throttle: true };
        if (s.boulder.phase === 'roll') phase = 'stop';
      } else if (phase === 'stop') {
        input = { brake: s.v > 0 };
        if (s.v === 0) phase = 'back';
      } else if (phase === 'back') {
        input = { brake: s.x > waitX };
        if (s.x <= waitX && s.v === 0) phase = 'wait';
      } else if (phase === 'wait') {
        const centre = s.boulder.x + w / 2;
        if (centre - s.x <= speed * (tHop / 2)) { input = { hop: true }; phase = 'air'; }
      } else if (phase === 'air') {
        if (!apex && s.boulder.x + w / 2 <= s.x) apex = s;
        if (s.grounded && apex) phase = 'done';
      } else if (s.boulder.phase === 'gone') {
        return { s, apex, phase };
      }
      t.setInput(input);
      t.step(1);
    }
    return { s: t.state(), apex, phase };
  }, { waitX, tHop: (2 * cfg.hopVelocity) / cfg.gravity, speed: B.speed, w: B.hitW });
  expect(r.phase).toBe('done');
  expect(r.apex, 'it passed under the bike in the air').not.toBeNull();
  expect([r.s.crashed, r.s.crashes, r.s.boulder.phase]).toEqual([false, 0, 'gone']);
  expect(r.s.x, 'it hopped where it stood').toBeLessThanOrEqual(waitX);
  expect(r.s.x).toBeGreaterThan(waitX - 6);
  await page.evaluate(() => { window.__test!.setInput({}); window.__test!.step(8); });
  await shot(page, 'boulder-break'); // chips and dust at the top riser, just behind the bike
});
