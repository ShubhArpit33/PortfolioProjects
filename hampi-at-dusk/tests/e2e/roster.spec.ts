// The roster (v1.6): each bike keeps its own best / medal / ghost, the last pick is remembered, and ?bike=
// picks a bike for one page load. v1.7: records are version 2 (the 900-column stage); everything stored
// before is an archive that is never used, changed or removed.

import { BIKE_ORDER } from '../../src/bike/bikes';
import { ARCHIVED_BEST_KEYS, PREFS_KEY, bestKey, encodeGhost } from '../../src/progress';
import { GAME_URL, boot, expect, getState, rideFromTitle, startAt, test } from './helpers';

const storage = (page: Parameters<typeof boot>[0], keys: string[]): Promise<Array<string | null>> =>
  page.evaluate((ks) => ks.map((k) => window.localStorage.getItem(k)), keys);

test('records from before v1.7 are an archive: no best, no medal, no ghost comes from them, and they are left exactly as they were', async ({ page }) => {
  // A plausible old ghost: 12 s of riding at 200 px/s. One record under the pre-roster key and one per bike.
  const ghost = encodeGhost(Array.from({ length: 240 }, (_, i) => ({ x: 40 + i * 10, y: 222, angle: 0 })));
  const old = ARCHIVED_BEST_KEYS.map((_, i) => JSON.stringify({ v: 1, stage: 580, timeMs: 32_000 + i * 2000, diyas: 30, flips: 3, ghost }));
  expect(ARCHIVED_BEST_KEYS).toEqual([
    'hampi-at-dusk.best', 'hampi-at-dusk.best.tonup', 'hampi-at-dusk.best.daybreak', 'hampi-at-dusk.best.sundowner',
  ]);
  expect(BIKE_ORDER.map(bestKey)).toEqual([
    'hampi-at-dusk.best.v2.tonup', 'hampi-at-dusk.best.v2.daybreak', 'hampi-at-dusk.best.v2.sundowner',
  ]);
  await boot(page);
  await page.evaluate(({ keys, values }) => keys.forEach((k, i) => window.localStorage.setItem(k, values[i]!)), { keys: [...ARCHIVED_BEST_KEYS], values: old });
  await boot(page); // reload with the old records in place

  // The select screen shows "NO RUN YET" on every card.
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.__test!.step(1));
  await page.waitForFunction(() => window.__test!.screen() === 'select');
  const cards = (await page.evaluate(() => window.__test!.select()))!.cards;
  expect(cards.map((c) => [c.bike, c.bestMs, c.medal])).toEqual(BIKE_ORDER.map((b) => [b, null, null]));

  // No bike has a ghost to race.
  for (const bike of BIKE_ORDER) {
    await startAt(page, 0, bike);
    await page.evaluate(() => window.__test!.step(60));
    const s = await getState(page);
    expect(s.bike).toBe(bike);
    expect(s.ghost, `${bike} has no ghost`).toBeNull();
  }

  // Everything that writes to storage short of a ranked finish: the bike pick (above), G, M, and a practice run to the line.
  for (const key of ['g', 'g', 'm', 'm', 'm']) {
    await page.keyboard.press(key);
    await page.evaluate(() => window.__test!.step(1));
  }
  await startAt(page, 11, 'daybreak');
  const fin = await page.evaluate(() => {
    const t = window.__test!;
    t.setInput({ throttle: true, boost: true });
    for (let i = 0; i < 120 * 30 && !t.state().finished; i++) t.step(1);
    t.setInput({});
    t.step(240);
    return t.finish();
  });
  expect(fin!.prevBest).toEqual({ timeMs: null, diyas: null, flips: null });

  // The archive is byte for byte what it was, nothing new sits beside it but the prefs, and no v2 record exists yet.
  expect(await storage(page, [...ARCHIVED_BEST_KEYS])).toEqual(old);
  expect(await storage(page, BIKE_ORDER.map(bestKey))).toEqual([null, null, null]);
  const keys = await page.evaluate(() => Object.keys(window.localStorage).sort());
  expect(keys).toEqual([...ARCHIVED_BEST_KEYS, PREFS_KEY].sort());
});

test('the last pick is remembered; ?bike= overrides it for one page load without saving', async ({ page }) => {
  await boot(page);
  expect(await page.evaluate(() => window.__test!.bike())).toBe('daybreak');
  expect(await page.evaluate(() => window.__test!.bike('sundowner'))).toBe('sundowner');
  expect(JSON.parse((await storage(page, [PREFS_KEY]))[0]!).bike).toBe('sundowner');

  await boot(page);
  await rideFromTitle(page);
  expect((await getState(page)).bike).toBe('sundowner');

  // ?bike=tonup: this page load rides the Ton-Up, the remembered pick stays the Sundowner.
  await page.goto(`${GAME_URL}&bike=tonup`);
  await page.waitForFunction(() => window.__test?.ready() === true);
  await page.evaluate(() => window.__test!.setManual(true));
  await rideFromTitle(page);
  expect((await getState(page)).bike).toBe('tonup');
  expect(JSON.parse((await storage(page, [PREFS_KEY]))[0]!).bike).toBe('sundowner');

  // Nonsense values are ignored.
  await page.goto(`${GAME_URL}&bike=unicycle`);
  await page.waitForFunction(() => window.__test?.ready() === true);
  await page.evaluate(() => window.__test!.setManual(true));
  await rideFromTitle(page);
  expect((await getState(page)).bike).toBe('sundowner');

  // ?cp=N&bike= goes straight into a practice run on that bike.
  await page.goto(`${GAME_URL}&cp=11&bike=daybreak`);
  await page.waitForFunction(() => window.__test?.ready() === true && window.__test!.state().x > 0);
  const s = await getState(page);
  expect([s.bike, s.checkpoint]).toEqual(['daybreak', 11]);

  // A checkpoint number past the last one is the last one.
  await page.goto(`${GAME_URL}&cp=99`);
  await page.waitForFunction(() => window.__test?.ready() === true && window.__test!.state().x > 0);
  expect((await getState(page)).checkpoint).toBe(11);
});

test('each bike feels different in the game itself: top speed, hop length and boost', async ({ page }) => {
  await boot(page);
  const measured: Record<string, { top: number; hopPx: number; boost: number }> = {};
  for (const bike of BIKE_ORDER) {
    await startAt(page, 0, bike);
    measured[bike] = await page.evaluate(() => {
      const t = window.__test!;
      t.setInput({ throttle: true });
      t.step(204); // 1.7 s: every bike is at its top speed, and the hop that follows lands short of the log
      const top = t.state().v;
      const x0 = t.state().x;
      t.setInput({ throttle: true, hop: true });
      t.step(1);
      t.setInput({ throttle: true });
      let n = 0;
      while (!t.state().grounded && n++ < 400) t.step(1);
      const hopPx = t.state().x - x0;
      // (a second of boost: the log on the Warm-up Road costs a stumble on the way, and there is still time to top out)
      t.setInput({ boost: true });
      t.step(120);
      return { top, hopPx, boost: t.state().v };
    });
  }
  console.log(`[roster] ${JSON.stringify(measured)}`);
  expect(measured.tonup!.top).toBe(288);
  expect(measured.daybreak!.top).toBe(240);
  expect(measured.sundowner!.top).toBe(204);
  expect(measured.tonup!.hopPx).toBeCloseTo(214, -1);
  expect(measured.daybreak!.hopPx).toBeCloseTo(192, -1);
  expect(measured.sundowner!.hopPx).toBeCloseTo(163, -1);
  expect(measured.tonup!.boost).toBe(420);
  expect(measured.daybreak!.boost).toBe(360);
  expect(measured.sundowner!.boost).toBe(350);
});
