// Bike select (v1.6): Title -> BIKE SELECT -> ride. Each bike can be picked with the keys and with the
// mouse; CHANGE BIKE in the pause menu and on the finish screen comes back here; every bike keeps its own
// record; the pick is remembered; and nothing leaks over repeated trips through the select screen.

import type { Page } from '@playwright/test';
import { BIKES, BIKE_ORDER, type BikeId } from '../../src/bike/bikes';
import { PREFS_KEY, bestKey } from '../../src/progress';
import { advance, planFor, resetBot } from './bot';
import { boot, expect, getLevel, getState, rideFromSelect, shot, test } from './helpers';

type Rect = { x: number; y: number; w: number; h: number };

const step = (page: Page, n: number): Promise<void> => page.evaluate((k) => window.__test!.step(k), n);
const screen = (page: Page): Promise<string> => page.evaluate(() => window.__test!.screen());
const targets = (page: Page) => page.evaluate(() => window.__test!.targets());
const select = (page: Page) => page.evaluate(() => window.__test!.select());
const leaks = (page: Page): Promise<Record<string, number>> => page.evaluate(() => window.__test!.leaks());
const waitFor = (page: Page, name: string) => page.waitForFunction((n) => window.__test!.screen() === n, name);

async function press(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await step(page, 1);
}

async function click(page: Page, r: Rect): Promise<void> {
  const box = (await page.locator('#game canvas').boundingBox())!;
  const k = box.width / 480;
  await page.mouse.click(box.x + (r.x + r.w / 2) * k, box.y + (r.y + r.h / 2) * k);
  await step(page, 1);
}

async function openSelect(page: Page): Promise<void> {
  expect(await screen(page)).toBe('title');
  await press(page, 'Enter');
  await waitFor(page, 'select');
}

async function waitForRun(page: Page): Promise<void> {
  await step(page, 0);
  await page.waitForFunction(() => window.__test!.screen() === 'game' && window.__test!.state().x > 0);
}

/** Pause, then the pause menu option at `index` with the keyboard. */
async function pauseAndPick(page: Page, index: number): Promise<void> {
  await press(page, 'Escape');
  expect(await screen(page)).toBe('paused');
  for (let i = 0; i < index; i++) await press(page, 'ArrowDown');
  expect((await targets(page)).index).toBe(index);
  await press(page, 'Enter');
  await step(page, 1);
}

const PAUSE_CHANGE_BIKE = 2;
const PAUSE_MAIN_MENU = 3;
const FINISH_CHANGE_BIKE = 1;

test('select screen: three cards, Left / Right (wrapping) + Enter rides each bike; Esc and BACK return to the title', async ({ page }) => {
  await boot(page);
  await step(page, 30);
  await openSelect(page);
  await step(page, 40);

  // First visit: the Daybreak (the default) is highlighted; nobody has a record.
  let sel = (await select(page))!;
  expect(sel.cards.map((c) => c.bike)).toEqual(['tonup', 'daybreak', 'sundowner']);
  expect(sel.index).toBe(1);
  expect(sel.cards.map((c) => [c.bestMs, c.medal])).toEqual([[null, null], [null, null], [null, null]]);
  // three cards side by side, inside the screen, not overlapping
  const rects = sel.cards.map((c) => c.rect);
  for (const r of rects) {
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(480);
    expect(r.y + r.h).toBeLessThanOrEqual(270);
  }
  expect(rects[0]!.x + rects[0]!.w).toBeLessThanOrEqual(rects[1]!.x);
  expect(rects[1]!.x + rects[1]!.w).toBeLessThanOrEqual(rects[2]!.x);
  expect((await targets(page)).menu.length, 'RIDE and BACK').toBe(2);
  await shot(page, 'select');

  // Left / Right move the highlight and wrap at both ends.
  await press(page, 'ArrowLeft');
  expect((await select(page))!.index).toBe(0);
  await step(page, 30);
  await shot(page, 'select-tonup');
  await press(page, 'ArrowLeft');
  expect((await select(page))!.index).toBe(2);
  await step(page, 30);
  await shot(page, 'select-sundowner');
  await press(page, 'ArrowRight');
  expect((await select(page))!.index).toBe(0);
  await press(page, 'ArrowRight');
  expect((await select(page))!.index).toBe(1);
  // Browsing saves nothing: the pick is remembered when the ride starts.
  expect(await page.evaluate((k) => window.localStorage.getItem(k), PREFS_KEY)).toBeNull();

  // Esc goes back to the title; so does BACK (Down, Enter).
  await press(page, 'Escape');
  await waitFor(page, 'title');
  await openSelect(page);
  await press(page, 'ArrowDown');
  expect((await targets(page)).index).toBe(1);
  await press(page, 'Enter');
  await waitFor(page, 'title');

  // Each bike in turn, by keyboard: the run is on that bike, and the pick is remembered.
  for (const bike of BIKE_ORDER) {
    await openSelect(page);
    await rideFromSelect(page, bike);
    const s = await getState(page);
    expect([s.bike, s.timeMs, s.checkpoint]).toEqual([bike, 0, 0]);
    expect(JSON.parse((await page.evaluate((k) => window.localStorage.getItem(k), PREFS_KEY))!).bike).toBe(bike);
    // it rides like that bike
    await page.evaluate(() => { window.__test!.setInput({ throttle: true }); window.__test!.step(300); });
    expect((await getState(page)).v).toBe(BIKES[bike].cfg.topSpeed);
    await shot(page, `ride-${bike}`);
    await page.evaluate(() => window.__test!.setInput({}));
    await pauseAndPick(page, PAUSE_MAIN_MENU);
    await waitFor(page, 'title');
    await step(page, 20);
  }

  // The select screen opens on the bike ridden last, and after a reload too.
  await openSelect(page);
  expect((await select(page))!.index).toBe(2);
  await boot(page);
  await step(page, 20);
  await openSelect(page);
  expect((await select(page))!.index).toBe(2);
});

test('select screen with the mouse: a click picks a card, a second click (or RIDE) rides; BACK returns', async ({ page }) => {
  await boot(page);
  await step(page, 20);
  // The title's PRESS ENTER is a click target.
  await click(page, { x: 172, y: 122, w: 136, h: 20 });
  await waitFor(page, 'select');

  for (const bike of BIKE_ORDER) {
    if ((await screen(page)) !== 'select') {
      await pauseAndPick(page, PAUSE_CHANGE_BIKE);
      await waitFor(page, 'select');
    }
    const i = BIKE_ORDER.indexOf(bike);
    // Make sure the card is not the highlighted one, so the first click only picks it.
    if ((await select(page))!.index === i) await press(page, 'ArrowRight');
    const card = (await select(page))!.cards[i]!;
    await click(page, card.rect);
    expect(await screen(page), 'the first click only picks').toBe('select');
    expect((await select(page))!.index).toBe(i);
    if (bike === 'daybreak') {
      // RIDE button
      await click(page, (await targets(page)).menu[0]!);
    } else {
      // a second click on the same card
      await click(page, card.rect);
    }
    await waitForRun(page);
    expect((await getState(page)).bike).toBe(bike);
  }

  // BACK with the mouse.
  await pauseAndPick(page, PAUSE_CHANGE_BIKE);
  await waitFor(page, 'select');
  await click(page, (await targets(page)).menu[1]!);
  await waitFor(page, 'title');
});

test('CHANGE BIKE from the pause menu and from the finish screen; each bike keeps its own best, medal and ghost', async ({ page }) => {
  test.setTimeout(240_000);
  await boot(page);
  const level = await getLevel(page);
  await step(page, 20);
  await openSelect(page);

  // A gold run on the Ton-Up.
  await rideFromSelect(page, 'tonup');
  let s = await advance(page, planFor(level, BIKES.tonup.cfg).plan, Infinity);
  expect([s.finished, s.crashes]).toEqual([true, 0]);
  const tonupMs = s.timeMs;
  await page.evaluate(() => { window.__test!.setInput({}); window.__test!.step(240); });
  expect(await screen(page)).toBe('finish');
  let fin = (await page.evaluate(() => window.__test!.finish()))!;
  expect([fin.bike, fin.medal]).toEqual(['tonup', 'gold']);
  await shot(page, 'finish-tonup');

  // Finish screen: RIDE AGAIN / CHANGE BIKE / MAIN MENU. CHANGE BIKE by keyboard.
  let t = await targets(page);
  expect(t.menu.length).toBe(3);
  await press(page, 'ArrowRight');
  expect((await targets(page)).index).toBe(FINISH_CHANGE_BIKE);
  await press(page, 'Enter');
  await waitFor(page, 'select');
  await step(page, 30);
  let sel = (await select(page))!;
  expect(sel.index, 'opens on the bike just ridden').toBe(0);
  expect(sel.cards.map((c) => [c.bestMs, c.medal])).toEqual([[tonupMs, 'gold'], [null, null], [null, null]]);
  await shot(page, 'select-one-record');

  // The Sundowner: no best, no ghost of the Ton-Up run. Its (slower) run is gold on its own targets.
  await rideFromSelect(page, 'sundowner');
  await resetBot(page);
  await step(page, 60);
  s = await getState(page);
  expect(s.bike).toBe('sundowner');
  expect(s.ghost, "another bike's ghost never rides along").toBeNull();
  s = await advance(page, planFor(level, BIKES.sundowner.cfg).plan, Infinity);
  expect([s.finished, s.crashes]).toEqual([true, 0]);
  const sundownerMs = s.timeMs;
  expect(sundownerMs).toBeGreaterThan(tonupMs + 8000);
  await page.evaluate(() => { window.__test!.setInput({}); window.__test!.step(240); });
  fin = (await page.evaluate(() => window.__test!.finish()))!;
  expect([fin.bike, fin.medal, fin.newTime]).toEqual(['sundowner', 'gold', true]);
  expect(fin.prevBest.timeMs, 'no best to beat on this bike').toBeNull();
  await shot(page, 'finish-sundowner');

  // CHANGE BIKE with the mouse this time.
  t = await targets(page);
  await click(page, t.menu[FINISH_CHANGE_BIKE]!);
  await waitFor(page, 'select');
  await step(page, 30);
  sel = (await select(page))!;
  expect(sel.index).toBe(2);
  expect(sel.cards.map((c) => [c.bestMs, c.medal])).toEqual([[tonupMs, 'gold'], [null, null], [sundownerMs, 'gold']]);
  await shot(page, 'select-two-records');

  // Storage: one record per bike ridden, each with its own ghost.
  const stored = await page.evaluate((keys) => keys.map((k) => JSON.parse(window.localStorage.getItem(k) ?? 'null')), BIKE_ORDER.map(bestKey));
  expect(stored[0].timeMs).toBe(tonupMs);
  expect(stored[1]).toBeNull();
  expect(stored[2].timeMs).toBe(sundownerMs);
  expect(stored[0].ghost).not.toBe(stored[2].ghost);

  // Back on the Ton-Up: its own ghost rides ahead. Then CHANGE BIKE from the pause menu, mid-run.
  await rideFromSelect(page, 'tonup');
  await step(page, 60);
  s = await getState(page);
  expect(s.bike).toBe('tonup');
  expect(s.ghost).not.toBeNull();
  expect(s.ghost!.x).toBeGreaterThan(s.x + 5);
  await page.evaluate(() => { window.__test!.setInput({ throttle: true }); window.__test!.step(200); });
  await press(page, 'Escape');
  expect((await targets(page)).menu.length).toBe(4);
  await press(page, 'ArrowDown');
  await press(page, 'ArrowDown');
  await shot(page, 'pause-menu-change-bike');
  await press(page, 'Enter');
  await page.evaluate(() => window.__test!.setInput({}));
  await waitFor(page, 'select');
  expect(await page.evaluate(() => window.__test!.state().x), 'no run behind the select screen').toBe(0);

  // The Daybreak: a fresh run from the start, not paused, no ghost.
  await rideFromSelect(page, 'daybreak');
  s = await getState(page);
  expect([s.bike, s.timeMs, s.crashes, s.checkpoint]).toEqual(['daybreak', 0, 0, 0]);
  await page.evaluate(() => { window.__test!.setInput({ throttle: true }); window.__test!.step(120); });
  s = await getState(page);
  expect(s.x).toBeGreaterThan(100);
  expect(s.ghost).toBeNull();

  // Pause -> CHANGE BIKE with the mouse; the abandoned runs changed no record.
  await press(page, 'Escape');
  await click(page, (await targets(page)).menu[PAUSE_CHANGE_BIKE]!);
  await page.evaluate(() => window.__test!.setInput({}));
  await waitFor(page, 'select');
  sel = (await select(page))!;
  expect(sel.index).toBe(1);
  expect(sel.cards.map((c) => c.bestMs)).toEqual([tonupMs, null, sundownerMs]);

  // The title shows the best of the bike picked last (none on the Daybreak; the Sundowner's after picking it).
  await press(page, 'Escape');
  await waitFor(page, 'title');
  await step(page, 30);
  await shot(page, 'title-daybreak-no-best');
  await openSelect(page);
  await rideFromSelect(page, 'sundowner');
  await pauseAndPick(page, PAUSE_MAIN_MENU);
  await waitFor(page, 'title');
  await step(page, 30);
  await shot(page, 'title-sundowner-best');
});

test('round trips through the select screen: nothing leaks, no stuck keys', async ({ page }) => {
  await boot(page);
  await step(page, 30);
  const atTitle: Array<Record<string, number>> = [];
  const atSelect: Array<Record<string, number>> = [];
  const atSelectAgain: Array<Record<string, number>> = [];
  const inGame: Array<Record<string, number>> = [];
  const order: BikeId[] = ['tonup', 'sundowner', 'daybreak', 'tonup'];

  for (let trip = 0; trip < 4; trip++) {
    // title -> select -> ride
    await openSelect(page);
    await step(page, 20);
    atSelect.push(await leaks(page));
    await rideFromSelect(page, order[trip]);
    const start = await getState(page);
    await step(page, 60);
    expect((await getState(page)).x, `trip ${trip}: no stuck throttle`).toBeCloseTo(start.x, 3);
    // ride with the real Right key held, through the pause and the change of bike
    await page.keyboard.down('ArrowRight');
    await step(page, 200);
    expect((await getState(page)).x).toBeGreaterThan(start.x + 100);
    inGame.push(await leaks(page));

    // pause -> CHANGE BIKE -> select (the held Right key must not move the highlight or ride off)
    await press(page, 'Escape');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await waitFor(page, 'select');
    await step(page, 20);
    expect((await select(page))!.index).toBe(BIKE_ORDER.indexOf(order[trip]!));
    await page.keyboard.up('ArrowRight');
    await step(page, 5);
    atSelectAgain.push(await leaks(page));

    // ride another bike, then finish-less exit: pause -> MAIN MENU
    await rideFromSelect(page, order[(trip + 1) % order.length]);
    const again = await getState(page);
    await step(page, 60);
    expect((await getState(page)).x, `trip ${trip}: the released key is not stuck`).toBeCloseTo(again.x, 3);
    await pauseAndPick(page, PAUSE_MAIN_MENU);
    await waitFor(page, 'title');
    expect(await page.evaluate(() => window.__test!.state().x)).toBe(0);
    await step(page, 20);
    atTitle.push(await leaks(page));
  }

  console.log(`[leaks] select: ${JSON.stringify(atSelect[3])}`);
  // The first pass creates the Game / Hud scenes' systems; from the second on, every count is identical.
  for (const series of [atTitle, atSelect, atSelectAgain]) {
    expect(series[2]).toEqual(series[1]);
    expect(series[3]).toEqual(series[1]);
  }
  // In the game: trips 0 and 3 ride the same bike, so everything matches. The other bikes are 200 steps
  // further along or behind (a popup more or less on screen), so the object count is left out for them.
  expect(inGame[3]).toEqual(inGame[0]);
  for (const k of [1, 2]) expect({ ...inGame[k], 'Game.objects': 0 }).toEqual({ ...inGame[0], 'Game.objects': 0 });
  expect(atSelectAgain[1]).toEqual(atSelect[1]);
  const end = atTitle[3]!;
  expect(end.scenes).toBe(6);
  expect(end.running).toBe(1);
  for (const key of ['Select', 'Game', 'Hud', 'Finish']) {
    for (const what of ['objects', 'updating', 'interactive', 'keyEvents', 'inputEvents', 'tweens', 'timers']) {
      expect(end[`${key}.${what}`], `${key}.${what} after returning to the title`).toBe(0);
    }
  }
  // While the select screen is up, it is the only scene running.
  const sel = atSelect[3]!;
  expect(sel.running).toBe(1);
  for (const key of ['Title', 'Game', 'Hud', 'Finish']) {
    for (const what of ['objects', 'updating', 'interactive', 'keyEvents', 'inputEvents']) {
      expect(sel[`${key}.${what}`], `${key}.${what} behind the select screen`).toBe(0);
    }
  }
  expect(sel['Select.tweens']! + sel['Select.timers']!).toBe(0);
});
