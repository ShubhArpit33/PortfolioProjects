// The journey (v1.9), in the real game: Title -> JOURNEY -> the bike select (once) -> the stages in order
// -> the journey finish. Five helmets; a crash costs one; none left is GAME OVER and the stage starts again
// with five. The pause menu of a journey; the STAGES list and its locks; the stage card between two stages
// (ridden over a test route of two stages: Hampi, and a copy of Hampi registered as "TEST ROAD").

import type { Page } from '@playwright/test';
import { BIKES, BIKE_ORDER } from '../../src/bike/bikes';
import { PREFS_KEY, UNLOCKS_KEY, bestKey, journeyKey } from '../../src/progress';
import { BOT_RUN_MS, HAMPI } from '../../src/stages/hampi';
import { advance, planFor, resetBot } from './bot';
import {
  boot, expect, getLevel, getState, journeyFromTitle, press, rideFromSelect, shot, test, type GameSnapshot,
} from './helpers';

const step = (page: Page, n: number, input?: Record<string, boolean>): Promise<void> =>
  page.evaluate(({ n, input }) => { const t = window.__test!; if (input) t.setInput(input); t.step(n); }, { n, input });
const screen = (page: Page): Promise<string> => page.evaluate(() => window.__test!.screen());
const targets = (page: Page) => page.evaluate(() => window.__test!.targets());
const journey = (page: Page) => page.evaluate(() => window.__test!.journey());
const stored = (page: Page, key: string): Promise<unknown> =>
  page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) ?? 'null') as unknown, key);
const waitFor = (page: Page, name: string) => page.waitForFunction((n) => window.__test!.screen() === n, name);

/** Start a journey through the test hook (as the bike select's RIDE does) and wait for its first stage. */
async function startJourney(page: Page, bike: string, route?: string[]): Promise<void> {
  await page.evaluate(({ bike, route }) => {
    const t = window.__test!;
    t.setInput({});
    t.startJourney(bike as 'daybreak', route);
    t.step(0);
  }, { bike, route });
  await page.waitForFunction(() => {
    const s = window.__test!.state();
    return s.mode === 'journey' && s.timeMs === 0 && s.x > 0;
  });
}

/** Crash here and now; returns the state on the step after. */
const crashNow = (page: Page): Promise<GameSnapshot> =>
  page.evaluate(() => { const t = window.__test!; t.setInput({}); t.crash(); t.step(1); return t.state(); });

/** After a crash that left helmets: wait out the tumble and the fade (1 s + 0.25 s), back at the checkpoint. */
const respawn = (page: Page): Promise<GameSnapshot> =>
  page.evaluate(() => { const t = window.__test!; t.setInput({}); t.step(160); return t.state(); });

/** The fixed steps of the GAME OVER screen (3 s of game time). */
const GAME_OVER_STEPS = 360;

test('journey: title -> JOURNEY -> bike select -> Hampi with the bot -> journey finish; its records; a new journey', async ({ page }) => {
  test.setTimeout(240_000);
  const bike = 'daybreak';
  await boot(page);
  await step(page, 60);
  let t = await targets(page);
  expect(t.menu.length, 'JOURNEY and STAGES').toBe(2);
  expect(t.index, 'JOURNEY is the main mode: it is highlighted').toBe(0);
  await shot(page, 'journey-01-title');

  // JOURNEY -> the bike select, opened for a journey: no journey has been ridden on any bike.
  await press(page, 'Enter');
  await waitFor(page, 'select');
  await step(page, 30);
  expect(await page.evaluate(() => window.__test!.selectFor())).toEqual({ mode: 'journey', stage: 'hampi' });
  expect((await page.evaluate(() => window.__test!.select()))!.cards.map((c) => [c.bike, c.bestMs, c.medal])).toEqual(
    BIKE_ORDER.map((b) => [b, null, null]),
  );
  await shot(page, 'journey-02-select');
  // Esc from a journey's bike select is the title.
  await press(page, 'Escape');
  await waitFor(page, 'title');

  // Ride: the journey is on Hampi, on this bike, with five helmets.
  await journeyFromTitle(page, bike);
  let s = await getState(page);
  expect([s.bike, s.stage, s.mode, s.helmets, s.gameOver, s.timeMs]).toEqual([bike, 'hampi', 'journey', 5, false, 0]);
  expect(await journey(page)).toEqual({ bike, route: ['hampi'], index: 0, helmets: 5, results: [], gameOvers: 0, status: 'riding' });
  // Reaching a stage unlocks it (Hampi always is; it is remembered all the same).
  expect(await stored(page, UNLOCKS_KEY)).toEqual({ v: 1, stages: ['hampi'] });
  // A first visit: the tutorial prompts show on a journey too.
  expect(s.prompt).toBe('HOLD RIGHT TO RIDE');
  expect(s.ghost, 'no ghost on a journey').toBeNull();

  const level = await getLevel(page);
  expect([level.id, level.checkpoints.length]).toEqual(['hampi', 4]);
  const { plan, lay } = planFor(level, BIKES[bike].cfg);
  s = await advance(page, plan, 14 * level.tile);
  await shot(page, 'journey-03-hud-helmets'); // five helmets under the diya count; the stage's name top centre

  // The bot rides the stage clean: the same run, to the millisecond, as a single run.
  s = await advance(page, plan, lay.cpX[1]! + 40);
  expect([s.checkpoint, s.helmets, s.crashes]).toEqual([1, 5, 0]);
  await shot(page, 'journey-04-checkpoint');
  s = await advance(page, plan, Infinity);
  expect([s.finished, s.crashes, s.diyas, s.helmets]).toEqual([true, 0, 56, 5]);
  expect(s.timeMs).toBe(BOT_RUN_MS[bike]);

  // 1.2 s after the line: the journey finish (Hampi is the whole journey for now), not the single run's screen.
  await step(page, 240, {});
  expect(await screen(page)).toBe('journeyfinish');
  expect(await page.evaluate(() => window.__test!.finish()), 'no single-run result').toBeNull();
  const jf = (await page.evaluate(() => window.__test!.journeyFinish()))!;
  expect(jf.finish).toEqual({ totalMs: BOT_RUN_MS[bike], prevBestMs: null, newBest: true, saved: true });
  expect(jf.journey.status).toBe('done');
  expect([jf.journey.helmets, jf.journey.gameOvers, jf.journey.index]).toEqual([5, 0, 0]);
  expect(jf.journey.results).toEqual([
    { stage: 'hampi', timeMs: BOT_RUN_MS[bike], collected: 56, total: 56, crashes: 0, flips: 0, medal: 'gold' },
  ]);
  t = await targets(page);
  expect(t.menu.length, 'NEW JOURNEY / STAGES / MAIN MENU').toBe(3);
  expect(t.pause).toBeNull();
  await shot(page, 'journey-05-finish');

  // The journey's records: its best time for this bike over this route. A journey leaves the single-run
  // records alone, and finishing it ends the tutorial.
  expect(await stored(page, journeyKey(['hampi'], bike))).toEqual({ v: 1, route: 'hampi', timeMs: BOT_RUN_MS[bike] });
  expect(await stored(page, bestKey('hampi', bike))).toBeNull();
  expect(((await stored(page, PREFS_KEY)) as { tutorialDone: boolean }).tutorialDone).toBe(true);

  // R and Esc do nothing here.
  await press(page, 'r');
  await press(page, 'Escape');
  expect(await screen(page)).toBe('journeyfinish');

  // NEW JOURNEY (highlighted): the bike select again, for a journey; the Daybreak's card shows its best.
  await press(page, 'Enter');
  await waitFor(page, 'select');
  expect(await journey(page), 'the finished journey is over').toBeNull();
  expect(await page.evaluate(() => window.__test!.selectFor())).toEqual({ mode: 'journey', stage: 'hampi' });
  expect((await page.evaluate(() => window.__test!.select()))!.cards.map((c) => [c.bike, c.bestMs])).toEqual([
    ['tonup', null], ['daybreak', BOT_RUN_MS[bike]], ['sundowner', null],
  ]);
  await step(page, 30);
  await shot(page, 'journey-06-select-with-best');

  // A second journey on the same bike, slower (one crash on the way): the best stands.
  await rideFromSelect(page, bike);
  await resetBot(page);
  s = await getState(page);
  expect([s.mode, s.helmets, s.prompt]).toEqual(['journey', 5, '']);
  s = await crashNow(page);
  expect([s.crashed, s.helmets]).toEqual([true, 4]);
  s = await respawn(page);
  expect([s.crashed, s.helmets, s.crashes]).toEqual([false, 4, 1]);
  s = await advance(page, plan, Infinity);
  expect([s.finished, s.crashes, s.helmets]).toEqual([true, 1, 4]);
  expect(s.timeMs).toBeGreaterThan(BOT_RUN_MS[bike]);
  await step(page, 240, {});
  const jf2 = (await page.evaluate(() => window.__test!.journeyFinish()))!;
  expect(jf2.finish).toEqual({ totalMs: s.timeMs, prevBestMs: BOT_RUN_MS[bike], newBest: false, saved: false });
  expect([jf2.journey.helmets, jf2.journey.results[0]!.crashes]).toEqual([4, 1]);
  expect(await stored(page, journeyKey(['hampi'], bike))).toEqual({ v: 1, route: 'hampi', timeMs: BOT_RUN_MS[bike] });
  await shot(page, 'journey-07-finish-second');

  // MAIN MENU (Right, Right, Enter): the title, where JOURNEY's line now shows the best.
  await press(page, 'ArrowRight');
  await press(page, 'ArrowRight');
  expect((await targets(page)).index).toBe(2);
  await press(page, 'Enter');
  await waitFor(page, 'title');
  expect(await journey(page)).toBeNull();
  await step(page, 30);
  await shot(page, 'journey-08-title-with-best');
});

test('journey: a crash costs a helmet, the warm-up costs nothing, the fifth is GAME OVER and the stage restarts with five', async ({ page }) => {
  await boot(page);
  await startJourney(page, 'daybreak');
  const level = await getLevel(page);
  const T = level.tile;
  const startX = level.checkpoints[0]!.col * T + T / 2;

  // The warm-up is a no-crash zone: a botched landing there is a wobble, and a wobble is not a crash.
  let s = await page.evaluate(() => {
    const t = window.__test!;
    let hopped = false;
    for (let i = 0; i < 120 * 20; i++) {
      const st = t.state();
      if (st.crashed || (hopped && st.grounded)) return st;
      const hop = !hopped && st.grounded && st.x >= 300;
      t.setInput({ throttle: true, hop, tiltUp: !st.grounded && st.spin < 170 });
      t.step(1);
      if (hop && !t.state().grounded) hopped = true;
    }
    return t.state();
  });
  expect([s.crashed, s.wobbles, s.crashes, s.helmets], 'a wobble costs no helmet').toEqual([false, 1, 0, 5]);
  // Riding into the log is a stumble: no helmet either.
  s = await page.evaluate((x) => {
    const t = window.__test!;
    t.setInput({ throttle: true });
    for (let i = 0; i < 120 * 10 && t.state().x < x; i++) t.step(1);
    return t.state();
  }, 40 * T);
  expect([s.stumbles, s.crashes, s.helmets]).toEqual([1, 0, 5]);

  // Ride on out of the warm-up and pick up some diyas on the way.
  s = await page.evaluate((x) => {
    const t = window.__test!;
    t.setInput({ throttle: true });
    for (let i = 0; i < 120 * 20 && t.state().x < x; i++) t.step(1);
    return t.state();
  }, 126 * T);
  expect(s.diyas).toBeGreaterThan(0);
  expect([s.crashes, s.helmets, s.checkpoint]).toEqual([0, 5, 0]);

  // Four crashes: a helmet each, and back to the checkpoint each time (the start: the next one is mid-stage).
  for (const left of [4, 3, 2, 1]) {
    s = await crashNow(page);
    expect([s.crashed, s.helmets, s.gameOver], `${left} left`).toEqual([true, left, false]);
    expect((await journey(page))!.helmets).toBe(left);
    if (left === 2) {
      await step(page, 20);
      await shot(page, 'journey-10-helmet-lost'); // three spent helmets dim, the one just lost blinking
    }
    s = await respawn(page);
    expect([s.crashed, s.x, s.helmets, s.crashes, s.checkpoint], `${left} left`).toEqual([false, startX, left, 5 - left, 0]);
    expect(await screen(page)).toBe('game');
    await step(page, 60, { throttle: true });
  }
  for (let i = 0; i < 12; i++) await step(page, 1); // (frames, so the lost helmet's blink has run out)
  await shot(page, 'journey-11-one-helmet');

  // C (back to the checkpoint) costs a helmet as well, so with one left it is the last one.
  // The fifth crash: no helmets, GAME OVER after the tumble (1 s), and the clock stops.
  s = await crashNow(page);
  expect([s.crashed, s.helmets, s.gameOver]).toEqual([true, 0, false]);
  expect(await journey(page)).toMatchObject({ helmets: 0, status: 'gameover', gameOvers: 1, index: 0 });
  await step(page, 110);
  expect(await screen(page), 'the tumble plays out first').toBe('game');
  await step(page, 15);
  expect(await screen(page)).toBe('gameover');
  s = await getState(page);
  expect([s.gameOver, s.crashed, s.helmets, s.crashes]).toEqual([true, false, 0, 5]);
  const t = await targets(page);
  expect([t.menu.length, t.pause], 'no pause on the GAME OVER screen').toEqual([0, null]);
  const stoppedAt = s.timeMs;
  await step(page, 60);
  expect((await getState(page)).timeMs, 'the clock has stopped').toBe(stoppedAt);
  await shot(page, 'journey-12-game-over');
  // P / Esc / R / C do nothing on it.
  for (const key of ['p', 'Escape', 'r', 'c']) await press(page, key);
  expect(await screen(page)).toBe('gameover');

  // After 3 s of game time the stage starts again: five helmets, time 0, nothing collected, same bike.
  await step(page, GAME_OVER_STEPS);
  await page.waitForFunction(() => window.__test!.screen() === 'game' && window.__test!.state().timeMs === 0);
  s = await getState(page);
  expect([s.stage, s.mode, s.bike, s.helmets, s.crashes, s.diyas, s.x, s.gameOver]).toEqual(['hampi', 'journey', 'daybreak', 5, 0, 0, startX, false]);
  expect(await journey(page)).toEqual({ bike: 'daybreak', route: ['hampi'], index: 0, helmets: 5, results: [], gameOvers: 1, status: 'riding' });
  await step(page, 30);
  await shot(page, 'journey-13-restarted-five-helmets');

  // Again, and this time Enter skips the screen (after its first half second). C is the fifth "crash".
  for (const left of [4, 3, 2, 1]) {
    s = await crashNow(page);
    expect(s.helmets).toBe(left);
    s = await respawn(page);
  }
  await step(page, 120, { throttle: true });
  await page.keyboard.press('c');
  await step(page, 3, {});
  expect(await screen(page), 'C with one helmet left is game over at once').toBe('gameover');
  expect(await journey(page)).toMatchObject({ helmets: 0, status: 'gameover', gameOvers: 2 });
  await press(page, 'Enter');
  expect(await screen(page), 'too early to skip').toBe('gameover');
  await step(page, 70);
  await press(page, 'Enter');
  await page.waitForFunction(() => window.__test!.screen() === 'game' && window.__test!.state().timeMs < 50);
  s = await getState(page);
  expect([s.helmets, s.crashes, s.x]).toEqual([5, 0, startX]);
  expect(await journey(page)).toMatchObject({ helmets: 5, status: 'riding', gameOvers: 2 });

  // Nothing was recorded by any of it: no journey best, no single-run record.
  expect(await stored(page, journeyKey(['hampi'], 'daybreak'))).toBeNull();
  expect(await stored(page, bestKey('hampi', 'daybreak'))).toBeNull();
});

test('pause menus: a journey has RESUME / RESTART STAGE (a helmet) / QUIT JOURNEY; a single run keeps its four', async ({ page }) => {
  await boot(page);
  await startJourney(page, 'tonup');
  const startX = (await getState(page)).x;
  await step(page, 240, { throttle: true });

  // Esc: three options, opening on RESUME; the game stands still.
  await press(page, 'Escape');
  expect(await screen(page)).toBe('paused');
  let t = await targets(page);
  expect([t.menu.length, t.index, t.pause]).toEqual([3, 0, null]);
  const frozen = await getState(page);
  await step(page, 120);
  expect(await getState(page)).toEqual(frozen);
  await shot(page, 'journey-20-pause-menu');
  await press(page, 'ArrowDown');
  await press(page, 'ArrowDown');
  await shot(page, 'journey-21-pause-menu-quit-selected');
  await press(page, 'ArrowDown');
  expect((await targets(page)).index, 'wraps after three').toBe(0);
  // RESUME.
  await press(page, 'Enter');
  expect(await screen(page)).toBe('game');
  expect((await getState(page)).helmets).toBe(5);

  // R does not restart a journey's stage (it would throw a helmet away): the run goes on.
  const before = await getState(page);
  await press(page, 'r');
  await step(page, 30);
  let s = await getState(page);
  expect(s.timeMs).toBeGreaterThan(before.timeMs);
  expect([s.helmets, s.crashes]).toEqual([5, 0]);
  await shot(page, 'journey-22-r-hint');

  // RESTART STAGE (Down, Enter): the stage from its start, one helmet fewer.
  await press(page, 'Escape');
  await press(page, 'ArrowDown');
  expect((await targets(page)).index).toBe(1);
  await press(page, 'Enter');
  await page.waitForFunction(() => window.__test!.screen() === 'game' && window.__test!.state().timeMs < 50);
  s = await getState(page);
  expect([s.helmets, s.crashes, s.x, s.mode, s.bike]).toEqual([4, 0, startX, 'journey', 'tonup']);
  expect(await journey(page)).toMatchObject({ helmets: 4, status: 'riding', gameOvers: 0 });

  // With one helmet left, RESTART STAGE is the last one: GAME OVER, then the stage with five.
  for (const left of [3, 2, 1]) {
    s = await crashNow(page);
    expect(s.helmets).toBe(left);
    await respawn(page);
  }
  await step(page, 120, { throttle: true });
  await press(page, 'Escape');
  await press(page, 'ArrowDown');
  await press(page, 'Enter');
  expect(await screen(page)).toBe('gameover');
  expect(await journey(page)).toMatchObject({ helmets: 0, status: 'gameover', gameOvers: 1 });
  await step(page, GAME_OVER_STEPS);
  await page.waitForFunction(() => window.__test!.screen() === 'game' && window.__test!.state().timeMs === 0);
  expect((await getState(page)).helmets).toBe(5);

  // QUIT JOURNEY, with the mouse: back on the title, and the journey is over.
  await step(page, 120, { throttle: true });
  await press(page, 'Escape');
  t = await targets(page);
  const box = (await page.locator('#game canvas').boundingBox())!;
  const k = box.width / 480;
  const quit = t.menu[2]!;
  await page.mouse.click(box.x + (quit.x + quit.w / 2) * k, box.y + (quit.y + quit.h / 2) * k);
  await page.evaluate(() => { window.__test!.setInput({}); window.__test!.step(1); });
  await waitFor(page, 'title');
  expect(await journey(page)).toBeNull();
  expect(await page.evaluate(() => window.__test!.state().x), 'no run behind the title').toBe(0);

  // A single run's pause menu is the one it always was: RESUME / RESTART / CHANGE BIKE / MAIN MENU.
  await page.evaluate(() => { const tt = window.__test!; tt.startAt(0, 'tonup'); tt.step(0); });
  await page.waitForFunction(() => window.__test!.screen() === 'game' && window.__test!.state().mode === 'single');
  await step(page, 240, { throttle: true });
  s = await getState(page);
  expect([s.mode, s.helmets]).toEqual(['single', null]);
  await press(page, 'Escape');
  t = await targets(page);
  expect([t.menu.length, t.index]).toEqual([4, 0]);
  await shot(page, 'journey-23-single-pause-menu');
  // R restarts a single run at once, as before; crashes there cost nothing but time.
  await press(page, 'Escape');
  await press(page, 'r');
  await page.waitForFunction(() => window.__test!.state().timeMs === 0);
  for (let i = 0; i < 7; i++) {
    s = await crashNow(page);
    expect([s.crashed, s.helmets, s.gameOver]).toEqual([true, null, false]);
    s = await respawn(page);
  }
  expect([s.crashes, s.crashed, s.gameOver, await screen(page)]).toEqual([7, false, false, 'game']);
});

test('STAGES: Hampi is open, a stage no journey has reached is locked; a two-stage journey shows the stage card and unlocks it', async ({ page }) => {
  test.setTimeout(300_000);
  const bike = 'tonup';
  const cfg = BIKES[bike].cfg;
  const ROUTE = ['hampi', 'test2'];
  const addStage = (): Promise<void> => page.evaluate(() => window.__test!.addTestStage('test2', 'TEST ROAD'));
  await boot(page);
  await step(page, 30);

  // The shipped list: Hampi alone, unlocked, no run yet.
  await press(page, 'ArrowDown');
  expect((await targets(page)).index).toBe(1);
  await press(page, 'Enter');
  await waitFor(page, 'stages');
  let list = (await page.evaluate(() => window.__test!.stages()))!;
  expect(list.rows.map((r) => [r.id, r.name, r.unlocked, r.bestMs])).toEqual([['hampi', 'HAMPI AT DUSK', true, null]]);
  await step(page, 30);
  await shot(page, 'journey-30-stages-list');
  await press(page, 'Escape');
  await waitFor(page, 'title');

  // A second stage in the registry (a copy of Hampi, for this test): listed, and locked.
  await addStage();
  await press(page, 'ArrowDown');
  await press(page, 'Enter');
  await waitFor(page, 'stages');
  list = (await page.evaluate(() => window.__test!.stages()))!;
  expect(list.rows.map((r) => [r.id, r.name, r.unlocked])).toEqual([['hampi', 'HAMPI AT DUSK', true], ['test2', 'TEST ROAD', false]]);
  expect(list.index).toBe(0);
  // Enter on a locked stage goes nowhere (a note says why). Up / Down go through the stages, then BACK, and wrap.
  expect((await targets(page)).index, 'BACK is not highlighted while a stage is').toBe(-1);
  await press(page, 'ArrowDown');
  expect((await page.evaluate(() => window.__test!.stages()))!.index).toBe(1);
  await press(page, 'Enter');
  expect(await screen(page)).toBe('stages');
  await step(page, 20);
  await shot(page, 'journey-31-stages-list-locked');
  await press(page, 'ArrowDown');
  expect([(await page.evaluate(() => window.__test!.stages()))!.index, (await targets(page)).index], 'on BACK').toEqual([2, 0]);
  await press(page, 'ArrowDown');
  expect([(await page.evaluate(() => window.__test!.stages()))!.index, (await targets(page)).index]).toEqual([0, -1]);
  // Enter on BACK is the title.
  await press(page, 'ArrowUp');
  await press(page, 'Enter');
  await waitFor(page, 'title');
  await press(page, 'ArrowDown');
  await press(page, 'Enter');
  await waitFor(page, 'stages');
  // A click on the locked row picks it; a second click still goes nowhere.
  const box = (await page.locator('#game canvas').boundingBox())!;
  const k = box.width / 480;
  const row = list.rows[1]!.rect;
  for (let i = 0; i < 2; i++) {
    await page.mouse.click(box.x + (row.x + row.w / 2) * k, box.y + (row.y + row.h / 2) * k);
    await step(page, 1);
  }
  expect([await screen(page), (await page.evaluate(() => window.__test!.stages()))!.index]).toEqual(['stages', 1]);

  // A journey over both stages. One crash on Hampi first, so there is a helmet to get back.
  await startJourney(page, bike, ROUTE);
  expect(await journey(page)).toMatchObject({ route: ROUTE, index: 0, helmets: 5 });
  expect(await stored(page, UNLOCKS_KEY), 'only what has been reached').toEqual({ v: 1, stages: ['hampi'] });
  let s = await crashNow(page);
  s = await respawn(page);
  expect(s.helmets).toBe(4);
  let level = await getLevel(page);
  let plan = planFor(level, cfg).plan;
  s = await advance(page, plan, Infinity);
  expect([s.finished, s.crashes, s.diyas, s.helmets]).toEqual([true, 1, 56, 4]);
  const firstMs = s.timeMs;
  expect(firstMs).toBeGreaterThan(BOT_RUN_MS[bike]);
  expect(firstMs).toBeLessThan(HAMPI.medalsMs[bike].gold);

  // The stage card: the stage behind (time, medal, diyas), the stage ahead, a helmet back.
  await step(page, 240, {});
  expect(await screen(page)).toBe('stagecard');
  expect(await page.evaluate(() => window.__test!.stageCard())).toEqual({
    cleared: 'hampi', next: 'test2', nextNumber: 2, helmets: 5, gained: 1, totalMs: firstMs,
  });
  expect(await journey(page)).toMatchObject({ index: 1, helmets: 5, status: 'riding' });
  expect((await journey(page))!.results).toEqual([
    { stage: 'hampi', timeMs: firstMs, collected: 56, total: 56, crashes: 1, flips: 0, medal: 'gold' },
  ]);
  expect(await stored(page, UNLOCKS_KEY), 'reaching the stage unlocks it').toEqual({ v: 1, stages: ['hampi', 'test2'] });
  let t = await targets(page);
  expect([t.menu.length, t.index, t.pause]).toEqual([1, 0, null]);
  await step(page, 20);
  await shot(page, 'journey-32-stage-card');
  // Esc, P and R do nothing on the card.
  for (const key of ['Escape', 'p', 'r']) await press(page, key);
  expect(await screen(page)).toBe('stagecard');

  // RIDE ON: stage 2, on the same bike (no bike select), with the helmets the card showed.
  await press(page, 'Enter');
  await page.waitForFunction(() => window.__test!.screen() === 'game' && window.__test!.state().stage === 'test2' && window.__test!.state().timeMs === 0);
  s = await getState(page);
  expect([s.stage, s.mode, s.bike, s.helmets, s.crashes, s.diyas, s.checkpoint]).toEqual(['test2', 'journey', bike, 5, 0, 0, 0]);
  level = await getLevel(page);
  expect([level.id, level.name]).toEqual(['test2', 'TEST ROAD']);
  await resetBot(page);
  await step(page, 40, { throttle: true });
  await shot(page, 'journey-33-stage-2-hud');

  // Two crashes here, then the bot: the journey finishes with three helmets.
  for (const left of [4, 3]) {
    s = await crashNow(page);
    expect(s.helmets).toBe(left);
    s = await respawn(page);
  }
  plan = planFor(level, cfg).plan;
  s = await advance(page, plan, Infinity);
  expect([s.finished, s.crashes, s.diyas, s.helmets]).toEqual([true, 2, 56, 3]);
  const secondMs = s.timeMs;
  await step(page, 240, {});
  expect(await screen(page)).toBe('journeyfinish');
  const jf = (await page.evaluate(() => window.__test!.journeyFinish()))!;
  expect(jf.finish).toEqual({ totalMs: firstMs + secondMs, prevBestMs: null, newBest: true, saved: true });
  expect(jf.journey.results.map((r) => [r.stage, r.timeMs, r.crashes, r.collected])).toEqual([
    ['hampi', firstMs, 1, 56], ['test2', secondMs, 2, 56],
  ]);
  expect([jf.journey.status, jf.journey.helmets, jf.journey.gameOvers]).toEqual(['done', 3, 0]);
  await shot(page, 'journey-34-finish-two-stages');
  // A journey's best belongs to its route: this one is not the shipped journey's.
  expect(await stored(page, journeyKey(ROUTE, bike))).toEqual({ v: 1, route: 'hampi+test2', timeMs: firstMs + secondMs });
  expect(await stored(page, journeyKey(['hampi'], bike))).toBeNull();

  // STAGES (Right, Enter): stage 2 is open now.
  await press(page, 'ArrowRight');
  expect((await targets(page)).index).toBe(1);
  await press(page, 'Enter');
  await waitFor(page, 'stages');
  expect(await journey(page)).toBeNull();
  list = (await page.evaluate(() => window.__test!.stages()))!;
  expect(list.rows.map((r) => [r.id, r.unlocked, r.bestMs])).toEqual([['hampi', true, null], ['test2', true, null]]);
  await step(page, 20);
  await shot(page, 'journey-35-stages-list-unlocked');

  // Pick it: the bike select for a single run of that stage, then the run itself (no helmets).
  await press(page, 'ArrowDown');
  await press(page, 'Enter');
  await waitFor(page, 'select');
  expect(await page.evaluate(() => window.__test!.selectFor())).toEqual({ mode: 'single', stage: 'test2' });
  await rideFromSelect(page, bike);
  s = await getState(page);
  expect([s.stage, s.mode, s.helmets, s.timeMs]).toEqual(['test2', 'single', null, 0]);

  // The unlock is remembered: after a reload (the test stage registered again) it is still open.
  await boot(page);
  await addStage();
  await press(page, 'ArrowDown');
  await press(page, 'Enter');
  await waitFor(page, 'stages');
  list = (await page.evaluate(() => window.__test!.stages()))!;
  expect(list.rows.map((r) => [r.id, r.unlocked])).toEqual([['hampi', true], ['test2', true]]);
  // ... and a single run of stage 2 keeps its record under that stage's own key.
  await page.evaluate(() => { const tt = window.__test!; tt.startAt(3, 'tonup', 'test2'); tt.step(0); });
  await page.waitForFunction(() => window.__test!.state().stage === 'test2' && window.__test!.state().checkpoint === 3);
  expect((await getState(page)).mode).toBe('single');
  t = await targets(page);
  expect(t.pause).not.toBeNull();
});

test('menus have the music: the stage card and the journey finish count as menus, a ride does not', async ({ page }) => {
  test.setTimeout(240_000);
  const inRun = (): Promise<boolean> => page.evaluate(() => window.__test!.audio().musicInRun);
  await boot(page);
  await page.evaluate(() => window.__test!.addTestStage('test2', 'TEST ROAD'));
  expect(await inRun(), 'title').toBe(false);
  await startJourney(page, 'tonup', ['hampi', 'test2']);
  expect(await inRun(), 'riding').toBe(true);
  const cfg = BIKES.tonup.cfg;
  let s = await advance(page, planFor(await getLevel(page), cfg).plan, Infinity);
  expect(s.finished).toBe(true);
  expect(s.timeMs, 'a clean journey stage is the measured run').toBe(BOT_RUN_MS.tonup);
  await step(page, 240, {});
  expect([await screen(page), await inRun()]).toEqual(['stagecard', false]);
  expect((await page.evaluate(() => window.__test!.stageCard()))!.gained, 'helmets were full: none to give back').toBe(0);
  await press(page, 'Enter');
  await page.waitForFunction(() => window.__test!.state().stage === 'test2' && window.__test!.state().timeMs === 0);
  expect(await inRun(), 'riding stage 2').toBe(true);
  // Out of helmets on stage 2: GAME OVER restarts stage 2 (not the journey); stage 1's result is kept.
  for (let i = 0; i < 5; i++) {
    await crashNow(page);
    if (i < 4) await respawn(page);
  }
  await step(page, 125);
  expect(await screen(page)).toBe('gameover');
  await step(page, GAME_OVER_STEPS);
  await page.waitForFunction(() => window.__test!.screen() === 'game' && window.__test!.state().timeMs === 0);
  s = await getState(page);
  expect([s.stage, s.helmets, s.bike]).toEqual(['test2', 5, 'tonup']);
  const j = (await journey(page))!;
  expect([j.index, j.gameOvers, j.results.length, j.results[0]!.timeMs]).toEqual([1, 1, 1, BOT_RUN_MS.tonup]);
  await resetBot(page);
  s = await advance(page, planFor(await getLevel(page), cfg).plan, Infinity);
  expect([s.finished, s.timeMs]).toEqual([true, BOT_RUN_MS.tonup]);
  await step(page, 240, {});
  expect([await screen(page), await inRun()]).toEqual(['journeyfinish', false]);
  const jf = (await page.evaluate(() => window.__test!.journeyFinish()))!;
  expect([jf.finish.totalMs, jf.journey.gameOvers, jf.journey.helmets]).toEqual([2 * BOT_RUN_MS.tonup, 1, 5]);
  await shot(page, 'journey-40-finish-after-game-over');
});
