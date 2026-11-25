// The roster (v1.6): each bike keeps its own best / medal / ghost, the pre-roster record moves to the
// Daybreak, the last pick is remembered, and ?bike= picks a bike for one page load.

import { BIKE_ORDER } from '../../src/bike/bikes';
import { STAGE_COLS } from '../../src/level/levelData';
import { LEGACY_BEST_KEY, PREFS_KEY, bestKey, encodeGhost } from '../../src/progress';
import { GAME_URL, boot, expect, getState, rideFromTitle, startAt, test } from './helpers';

const storage = (page: Parameters<typeof boot>[0], keys: string[]): Promise<Array<string | null>> =>
  page.evaluate((ks) => ks.map((k) => window.localStorage.getItem(k)), keys);

test('a record from before the roster becomes the Daybreak record; the other bikes start clean', async ({ page }) => {
  // A plausible old ghost: 12 s of riding at 200 px/s.
  const ghost = encodeGhost(Array.from({ length: 240 }, (_, i) => ({ x: 40 + i * 10, y: 222, angle: 0 })));
  const legacy = JSON.stringify({ v: 1, stage: STAGE_COLS, timeMs: 39_500, diyas: 27, flips: 3, ghost });
  await boot(page);
  await page.evaluate(({ k, v }) => window.localStorage.setItem(k, v), { k: LEGACY_BEST_KEY, v: legacy });
  await boot(page); // reload with the old record in place

  // Riding the Daybreak: the old best is the time to beat, with its ghost.
  await rideFromTitle(page);
  await page.evaluate(() => window.__test!.step(60));
  let s = await getState(page);
  expect(s.bike).toBe('daybreak');
  expect(s.ghost, 'the pre-roster ghost rides with the Daybreak').not.toBeNull();
  expect(s.ghost!.x).toBeGreaterThan(s.x + 50);
  const [oldKey, daybreak, tonup, sundowner] = await storage(page, [LEGACY_BEST_KEY, bestKey('daybreak'), bestKey('tonup'), bestKey('sundowner')]);
  expect(oldKey, 'the legacy key is kept as it was').toBe(legacy);
  expect(JSON.parse(daybreak!)).toEqual(JSON.parse(legacy));
  expect([tonup, sundowner]).toEqual([null, null]);

  // The other bikes have no best and no ghost.
  for (const bike of ['tonup', 'sundowner'] as const) {
    await startAt(page, 0, bike);
    await page.evaluate(() => window.__test!.step(60));
    s = await getState(page);
    expect(s.bike).toBe(bike);
    expect(s.ghost, `${bike} has no ghost`).toBeNull();
  }
  expect(await storage(page, [bestKey('tonup'), bestKey('sundowner')])).toEqual([null, null]);
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
