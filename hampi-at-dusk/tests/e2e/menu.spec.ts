// Pause menu (RESUME / RESTART / MAIN MENU), the finish screen's MAIN MENU, and the way back to the title:
// the game truly freezes while paused, nothing leaks over repeated title -> game -> title round trips,
// no key stays stuck, and the best / medal / ghost survive the trip.

import type { Page } from '@playwright/test';
import { DEFAULT_BIKE } from '../../src/bike/bikes';
import { bestKey } from '../../src/progress';
import { advance, planFor, resetBot } from './bot';
import { boot, expect, getState, getLevel, rideFromTitle, shot, test } from './helpers';

const BEST_KEY = bestKey(DEFAULT_BIKE);

type Rect = { x: number; y: number; w: number; h: number };

const step = (page: Page, n: number): Promise<void> => page.evaluate((k) => window.__test!.step(k), n);
const screen = (page: Page): Promise<string> => page.evaluate(() => window.__test!.screen());
const targets = (page: Page) => page.evaluate(() => window.__test!.targets());
const leaks = (page: Page): Promise<Record<string, number>> => page.evaluate(() => window.__test!.leaks());

/** A real key press, then one frame so the scenes see it. */
async function press(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await step(page, 1);
}

/** A real mouse click in the middle of a rectangle given in game pixels (480x270), then one frame. */
async function click(page: Page, r: Rect): Promise<void> {
  const box = (await page.locator('#game canvas').boundingBox())!;
  const k = box.width / 480;
  await page.mouse.click(box.x + (r.x + r.w / 2) * k, box.y + (r.y + r.h / 2) * k);
  await step(page, 1);
}

/** From the title: Enter, and wait for the run to exist. */
async function startFromTitle(page: Page): Promise<void> {
  expect(await screen(page)).toBe('title');
  await rideFromTitle(page);
}

async function expectTitle(page: Page): Promise<void> {
  await step(page, 1);
  await page.waitForFunction(() => window.__test!.screen() === 'title');
  expect(await page.evaluate(() => window.__test!.state().x), 'no run behind the title').toBe(0);
}

/** A quick practice run from the river checkpoint to the finish screen. */
async function practiceFinish(page: Page): Promise<void> {
  await page.evaluate(() => {
    const t = window.__test!;
    t.setInput({});
    t.startAt(6);
    t.step(0);
  });
  await page.waitForFunction(() => window.__test!.state().checkpoint === 6 && window.__test!.state().x > 0);
  await page.evaluate(() => {
    const t = window.__test!;
    t.setInput({ throttle: true, boost: true });
    for (let i = 0; i < 120 * 30 && !t.state().finished; i++) t.step(1);
    t.setInput({});
    t.step(240);
  });
  expect(await screen(page)).toBe('finish');
}

test('pause menu: freezes the game; resume, restart and main menu by keyboard and mouse', async ({ page }) => {
  await boot(page);
  await step(page, 30);
  await startFromTitle(page);
  await page.evaluate(() => { window.__test!.setInput({ throttle: true }); window.__test!.step(180); });

  // Esc opens the menu on RESUME; nothing moves while it is open, however many frames pass.
  await press(page, 'Escape');
  expect(await screen(page)).toBe('paused');
  let t = await targets(page);
  expect(t.menu.length).toBe(4);
  expect(t.index).toBe(0);
  expect(t.pause).toBeNull();
  const frozen = await getState(page);
  expect(frozen.timeMs).toBeGreaterThan(1000);
  expect(frozen.v).toBeGreaterThan(100);
  await step(page, 240);
  expect(await getState(page)).toEqual(frozen);
  await shot(page, 'pause-menu');

  // Real time too (rAF-driven frames, throttle still held): the clock and the bike stand still.
  await page.evaluate(() => window.__test!.setManual(false));
  await page.waitForTimeout(600);
  expect(await getState(page)).toEqual(frozen);
  // Esc resumes, and the run carries on from exactly where it stopped.
  await page.keyboard.press('Escape');
  await page.waitForFunction((ms) => window.__test!.state().timeMs > ms + 100, frozen.timeMs);
  expect(await screen(page)).toBe('game');
  await page.keyboard.press('p');
  await page.waitForFunction(() => window.__test!.screen() === 'paused');
  const frozen2 = await getState(page);
  expect(frozen2.x).toBeGreaterThan(frozen.x);
  await page.waitForTimeout(400);
  expect(await getState(page)).toEqual(frozen2);
  await page.evaluate(() => window.__test!.setManual(true));

  // Up / Down move the selection (and wrap); P closes the menu again.
  await press(page, 'ArrowDown');
  expect((await targets(page)).index).toBe(1);
  await press(page, 'ArrowDown');
  expect((await targets(page)).index).toBe(2);
  await press(page, 'ArrowDown');
  expect((await targets(page)).index).toBe(3);
  await press(page, 'ArrowDown');
  expect((await targets(page)).index).toBe(0);
  await press(page, 'ArrowUp');
  expect((await targets(page)).index).toBe(3);
  await press(page, 'p');
  expect(await screen(page)).toBe('game');
  await step(page, 60);
  // 61 fixed steps since the menu closed (1 in press(), 60 here) = 508 ms: exactly the steps that ran.
  expect(Math.abs((await getState(page)).timeMs - (frozen2.timeMs + 508))).toBeLessThanOrEqual(1);

  // Mouse: the HUD pause button opens the menu, a click on RESUME closes it.
  t = await targets(page);
  expect(t.menu).toEqual([]);
  await click(page, t.pause!);
  expect(await screen(page)).toBe('paused');
  t = await targets(page);
  expect(t.index, 'the menu always opens on RESUME').toBe(0);
  await click(page, t.menu[0]!);
  expect(await screen(page)).toBe('game');

  // RESTART (Down, Enter): a fresh run from the start, not paused.
  await press(page, 'Escape');
  await press(page, 'ArrowDown');
  await press(page, 'Enter');
  await page.waitForFunction(() => window.__test!.screen() === 'game' && window.__test!.state().timeMs < 50);
  const fresh = await getState(page);
  expect(fresh.x).toBeLessThan(100);
  expect(fresh.crashes).toBe(0);
  await page.evaluate(() => { window.__test!.setInput({ throttle: true }); window.__test!.step(120); });
  expect((await getState(page)).x).toBeGreaterThan(fresh.x + 50);

  // MAIN MENU by mouse.
  await press(page, 'Escape');
  await click(page, (await targets(page)).menu[3]!);
  await page.evaluate(() => window.__test!.setInput({}));
  await expectTitle(page);
  await step(page, 30);
  await shot(page, 'title-after-menu');
});

test('three round trips title -> game -> title: nothing leaks, no stuck keys, every start works', async ({ page }) => {
  await boot(page);
  await step(page, 30);
  const atTitle: Array<Record<string, number>> = [await leaks(page)];
  const inGame: Array<Record<string, number>> = [];
  const paused: Array<Record<string, number>> = [];

  for (let trip = 0; trip < 3; trip++) {
    await startFromTitle(page);
    const start = await getState(page);
    expect([start.timeMs, start.crashes, start.diyas, start.checkpoint]).toEqual([0, 0, 0, 0]);
    // Nothing is held: the bike stays put.
    await step(page, 60);
    expect((await getState(page)).x, `trip ${trip}: no stuck throttle`).toBeCloseTo(start.x, 3);

    // Ride with the real Right key held down, and keep it down through the pause and the exit.
    await page.keyboard.down('ArrowRight');
    await step(page, 240);
    const s = await getState(page);
    expect(s.x, `trip ${trip}: the run plays`).toBeGreaterThan(start.x + 150);
    inGame.push(await leaks(page));

    await press(page, trip === 1 ? 'p' : 'Escape');
    expect(await screen(page)).toBe('paused');
    paused.push(await leaks(page));
    if (trip === 1) {
      await click(page, (await targets(page)).menu[3]!);
    } else {
      await press(page, 'ArrowUp'); // wraps to MAIN MENU
      expect((await targets(page)).index).toBe(3);
      await press(page, 'Enter');
    }
    await expectTitle(page);
    // The key is let go on the title screen: the next run must not start with it down.
    await page.keyboard.up('ArrowRight');
    await step(page, 30);
    atTitle.push(await leaks(page));
  }

  console.log(`[leaks] title: ${JSON.stringify(atTitle[3])}`);
  // The very first title has no Game / Hud scene behind it yet; from then on every count is identical.
  expect(atTitle[2]).toEqual(atTitle[1]);
  expect(atTitle[3]).toEqual(atTitle[1]);
  expect(inGame[1]).toEqual(inGame[0]);
  expect(inGame[2]).toEqual(inGame[0]);
  expect(paused[1]).toEqual(paused[0]);
  expect(paused[2]).toEqual(paused[0]);
  // Only the title is running; Game, Hud and Finish hold nothing.
  const end = atTitle[3]!;
  expect(end.scenes).toBe(6);
  expect(end.running).toBe(1);
  for (const key of ['Select', 'Game', 'Hud', 'Finish']) {
    for (const what of ['objects', 'updating', 'interactive', 'keyEvents', 'inputEvents', 'tweens', 'timers']) {
      expect(end[`${key}.${what}`], `${key}.${what} after returning to the title`).toBe(0);
    }
  }
  expect(end['Title.tweens']! + end['Title.timers']!).toBe(0);
  for (const k of Object.keys(end)) {
    if (k.endsWith('Events')) expect(end[k], `${k} does not grow`).toBe(atTitle[0]![k]);
  }
});

test('finish screen: Enter rides again, MAIN MENU by keyboard and mouse; best, medal and ghost survive', async ({ page }) => {
  test.setTimeout(180_000);
  await boot(page);
  const level = await getLevel(page);
  const { plan } = planFor(level);
  await step(page, 30);
  await startFromTitle(page);

  // A ranked gold run.
  let s = await advance(page, plan, Infinity);
  expect(s.finished).toBe(true);
  await page.evaluate(() => { window.__test!.setInput({}); window.__test!.step(240); });
  expect(await screen(page)).toBe('finish');
  const fin = (await page.evaluate(() => window.__test!.finish()))!;
  expect(fin.medal).toBe('gold');
  const stored = await page.evaluate((k) => window.localStorage.getItem(k), BEST_KEY);
  expect(JSON.parse(stored!).timeMs).toBe(s.timeMs);
  let t = await targets(page);
  expect(t.menu.length).toBe(3);
  expect(t.index, 'RIDE AGAIN is selected').toBe(0);
  expect(t.pause).toBeNull();
  await shot(page, 'finish-menu');

  // P / Esc do nothing after the line.
  await press(page, 'Escape');
  expect(await screen(page)).toBe('finish');

  // Right moves along to CHANGE BIKE and MAIN MENU, Left goes back; Enter on RIDE AGAIN starts a fresh run with the ghost.
  await press(page, 'ArrowRight');
  expect((await targets(page)).index).toBe(1);
  await shot(page, 'finish-menu-change-bike-selected');
  await press(page, 'ArrowRight');
  expect((await targets(page)).index).toBe(2);
  await shot(page, 'finish-menu-main-selected');
  await press(page, 'ArrowLeft');
  await press(page, 'ArrowLeft');
  expect((await targets(page)).index).toBe(0);
  await press(page, 'Enter');
  await page.waitForFunction(() => window.__test!.screen() === 'game' && window.__test!.state().timeMs < 50);
  await resetBot(page);
  await step(page, 60);
  s = await getState(page);
  expect(s.finished).toBe(false);
  expect(s.ghost, 'the ghost of the gold run').not.toBeNull();

  // Pause -> MAIN MENU: the title shows the best and its medal; storage is untouched.
  await press(page, 'Escape');
  await press(page, 'ArrowDown');
  await press(page, 'ArrowDown');
  await press(page, 'ArrowDown');
  await press(page, 'Enter');
  await expectTitle(page);
  await step(page, 40);
  await shot(page, 'title-after-run');
  expect(await page.evaluate((k) => window.localStorage.getItem(k), BEST_KEY)).toBe(stored);

  // Finish (practice) -> MAIN MENU with the mouse.
  await practiceFinish(page);
  t = await targets(page);
  await click(page, t.menu[2]!);
  await expectTitle(page);

  // Finish (practice) -> MAIN MENU with Left (wraps) + Enter.
  await practiceFinish(page);
  await press(page, 'ArrowLeft');
  expect((await targets(page)).index).toBe(2);
  await press(page, 'Enter');
  await expectTitle(page);
  expect(await page.evaluate((k) => window.localStorage.getItem(k), BEST_KEY)).toBe(stored);

  // And a click on RIDE AGAIN.
  await practiceFinish(page);
  await click(page, (await targets(page)).menu[0]!);
  await page.waitForFunction(() => window.__test!.screen() === 'game' && window.__test!.state().timeMs < 50);
  expect((await getState(page)).checkpoint).toBe(6);
  await press(page, 'Escape');
  await press(page, 'ArrowUp');
  await press(page, 'Enter');
  await expectTitle(page);

  // From the title again: a ranked run against the same best and ghost.
  await startFromTitle(page);
  await step(page, 60);
  s = await getState(page);
  expect(s.checkpoint).toBe(0);
  expect(s.ghost).not.toBeNull();
  expect(s.ghost!.x).toBeGreaterThan(s.x);
  // The title's "PRESS ENTER" is a click target as well.
  await press(page, 'Escape');
  await press(page, 'ArrowUp');
  await press(page, 'Enter');
  await expectTitle(page);
  // The title's "PRESS ENTER" is a click target as well: it opens the bike select.
  await click(page, { x: 172, y: 122, w: 136, h: 20 });
  await page.waitForFunction(() => window.__test!.screen() === 'select');
});
