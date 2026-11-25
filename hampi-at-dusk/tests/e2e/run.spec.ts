// The bot run (GAME_SPEC.md section 9, criteria 2, 3 and 9), then the replay loop on the same page:
// best time + medal + ghost saved at the line, R to ride again, the ghost of the first run, G to hide it.
// Starts from the title with a real Enter key press, then plays with __test.setInput / __test.step only.

import { BIKES, BIKE_ORDER, DEFAULT_BIKE } from '../../src/bike/bikes';
import { GHOST_SAMPLE_STEPS, LEGACY_BEST_KEY, bestKey } from '../../src/progress';
import { advance, planFor, resetBot } from './bot';
import { boot, expect, getLevel, getState, rideFromTitle, shot as saveShot, test } from './helpers';

/** The bot's measured clean run per bike (ms): a change in feel shows up here first. */
const EXPECTED_MS = { tonup: 32_058, daybreak: 38_125, sundowner: 43_992 } as const;

for (const bike of BIKE_ORDER) test(`bot on the ${BIKES[bike].name}: full run from the title - 0 crashes, all 30 diyas, gold; then best, ghost and quick restart`, async ({ page }) => {
  test.setTimeout(180_000);
  const def = BIKES[bike];
  const CONFIG = def.cfg;
  const MEDAL_TIMES_MS = def.medalsMs;
  const BEST_KEY = bestKey(bike);
  // The default bike keeps the plain screenshot names; the others get a suffix.
  const shot = (p: typeof page, name: string): Promise<void> => saveShot(p, bike === DEFAULT_BIKE ? name : `${name}-${bike}`);
  await boot(page);
  const level = await getLevel(page);
  const { plan, lay, riverCp, kickerGap, planner } = planFor(level, CONFIG);
  console.log(`[bot ${bike}] ${planner} planner`);
  const T = level.tile;
  const sectionMid = (id: number): number => {
    const s = level.sections.find((x) => x.id === id)!;
    return ((s.startCol + s.endCol + 1) / 2) * T;
  };

  console.log(`[bot ${bike}] hops at x = ${plan.hops.map((x) => x.toFixed(0)).join(', ')}`);

  // --- title ---
  await page.evaluate(() => window.__test!.step(90));
  await shot(page, 'title');
  expect((await getState(page)).timeMs).toBe(0);

  await rideFromTitle(page, bike);
  expect((await getState(page)).bike).toBe(bike);

  // --- the ride, stopping for screenshots ---
  let s = await advance(page, plan, sectionMid(1) + 120); // the cow comes into view
  await shot(page, 'section1');
  s = await advance(page, plan, (lay.gaps[2]!.x0 + lay.gaps[2]!.x1) / 2); // mid-hop over the widest early canal
  await shot(page, 'section2');
  s = await advance(page, plan, plan.honkFrom + 110); // monkeys leaping away from the horn
  await shot(page, 'section3-monkeys');
  s = await advance(page, plan, lay.boxes[3]!.x0); // hopping the bullock cart
  await shot(page, 'section3');
  s = await advance(page, plan, sectionMid(4) - 60); // boulder field: top of the big ramp, cliff ahead
  await shot(page, 'section4');
  s = await advance(page, plan, lay.boxes[6]!.x0 + 24); // mandapa run: over the second pillar on the plinth
  await shot(page, 'section5-mandapa');
  s = await advance(page, plan, kickerGap.x0 - 23 * T); // rocks: top of the hop line off the second roller
  if (bike === DEFAULT_BIKE) expect(s.grounded, 'airborne on the roller hop line').toBe(false);
  await shot(page, 'section6-rocks');
  s = await advance(page, plan, (kickerGap.x0 + kickerGap.x1) / 2); // big air off the kicker, over the tank
  expect(s.grounded, 'airborne over the tank').toBe(false);
  await shot(page, 'section6-kicker');
  s = await advance(page, plan, lay.cpX[riverCp]! + 150); // river checkpoint lit, boost hint, run-up
  await shot(page, 'section7');
  s = await advance(page, plan, (lay.river.x0 + lay.river.x1) / 2);
  expect(s.grounded, 'airborne over the middle of the river').toBe(false);
  await shot(page, 'river-midair');

  s = await advance(page, plan, Infinity);
  expect(s.finished).toBe(true);
  const final = s;

  // The finish screen appears 1.2 s of game time after the line.
  await page.evaluate(() => {
    window.__test!.setInput({});
    window.__test!.step(240);
  });
  await shot(page, 'finish');

  s = await getState(page);
  console.log(
    `[bot ${bike}] finished: timeMs=${s.timeMs} (${(s.timeMs / 1000).toFixed(2)} s), crashes=${s.crashes}, ` +
    `diyas=${s.diyas}/${level.diyas.length}, boost left=${s.boost.toFixed(3)}`,
  );
  expect(s.finished).toBe(true);
  expect(s.crashed).toBe(false);
  expect(s.crashes).toBe(0);
  expect(level.diyas.length).toBe(30);
  expect(s.diyas).toBe(level.diyas.length);
  expect(s.timeMs).toBeLessThan(120_000);
  expect(s.timeMs, 'the timer stops at the finish line').toBe(final.timeMs);

  // Camera (v1.3 look-ahead): it never jumps or runs backward in a crash-free run, and the bike stays
  // in the left part of the screen with the road ahead visible.
  const cam = (await resetBot(page))!;
  console.log(
    `[bot ${bike}] camera: step ${cam.camMinStep.toFixed(3)}..${cam.camMaxStep.toFixed(3)} px, ` +
    `bike screen x ${cam.minScreenX.toFixed(1)}..${cam.maxScreenX.toFixed(1)}`,
  );
  expect(cam.camMinStep).toBeGreaterThanOrEqual(-0.001);
  expect(cam.camMaxStep).toBeLessThanOrEqual((CONFIG.boostSpeed / 120) * 1.5);
  expect(cam.minScreenX).toBeGreaterThanOrEqual(110);
  expect(cam.maxScreenX).toBeLessThanOrEqual(215);

  // ---------------------------------------------------------------------------------------------
  // Replay loop: the run was scored at the line.
  // ---------------------------------------------------------------------------------------------
  const fin = (await page.evaluate(() => window.__test!.finish()))!;
  expect(fin.ranked).toBe(true);
  expect(fin.bike).toBe(bike);
  expect(fin.timeMs, 'the measured run for this bike').toBe(EXPECTED_MS[bike]);
  expect(fin.timeMs).toBe(s.timeMs);
  expect(fin.timeMs).toBeLessThanOrEqual(MEDAL_TIMES_MS.gold);
  expect(fin.medal).toBe('gold');
  expect(fin.next).toBeNull();
  expect(fin.prevBest).toEqual({ timeMs: null, diyas: null, flips: null });
  expect([fin.newTime, fin.newDiyas, fin.newFlips, fin.saved]).toEqual([true, true, true, true]);
  const stored = await page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) ?? 'null'), BEST_KEY);
  expect(stored.timeMs).toBe(s.timeMs);
  expect(stored.diyas).toBe(level.diyas.length);
  expect(stored.flips).toBe(0);
  // This bike's record only: nothing under the other bikes' keys or the pre-roster key.
  const others = await page.evaluate(
    (keys) => keys.map((k) => window.localStorage.getItem(k)),
    [LEGACY_BEST_KEY, ...BIKE_ORDER.filter((b) => b !== bike).map(bestKey)],
  );
  expect(others).toEqual([null, null, null]);
  // one 7-character sample every 6 steps from time 0, plus the pose on the line
  const runSteps = Math.round((s.timeMs * 120) / 1000);
  expect(stored.ghost.length).toBe((Math.ceil(runSteps / GHOST_SAMPLE_STEPS) + 1) * 7);
  console.log(`[replay ${bike}] best saved: ${stored.timeMs} ms, ghost ${stored.ghost.length} chars`);

  // R on the finish screen: a fresh run at once, with the ghost of the first one.
  await page.keyboard.press('r');
  await page.evaluate(() => window.__test!.step(0));
  await page.waitForFunction(() => {
    const st = window.__test!.state();
    return st.timeMs === 0 && !st.finished && st.x > 0;
  });
  let r = await getState(page);
  expect([r.crashes, r.diyas, r.flips, r.checkpoint]).toEqual([0, 0, 0, 0]);

  // Dawdle for half a second: the ghost pulls ahead.
  await page.evaluate(() => { window.__test!.setInput({}); window.__test!.step(60); });
  r = await getState(page);
  expect(r.ghost).not.toBeNull();
  expect(r.ghost!.x).toBeGreaterThan(r.x + 5);
  r = await advance(page, plan, lay.gaps[0]!.x0 - 60);
  expect(r.ghost).not.toBeNull();
  const lead = r.ghost!.x - r.x;
  expect(lead).toBeGreaterThan(40);
  expect(lead).toBeLessThan(CONFIG.topSpeed * 0.5 + 20); // half a second at up to top speed
  await shot(page, 'ghost'); // translucent ghost ahead, hopping the first canal; BEST in the HUD

  // G hides it and brings it back.
  await page.keyboard.press('g');
  await page.evaluate(() => window.__test!.step(1));
  expect((await getState(page)).ghost).toBeNull();
  await page.keyboard.press('g');
  await page.evaluate(() => window.__test!.step(1));
  expect((await getState(page)).ghost).not.toBeNull();

  // Ride it out: slower than the first run, so the best stands; still gold.
  r = await advance(page, plan, Infinity);
  expect(r.finished).toBe(true);
  expect(r.crashes).toBe(0);
  expect(r.timeMs).toBeGreaterThan(s.timeMs);
  await page.evaluate(() => { window.__test!.setInput({}); window.__test!.step(240); });
  await shot(page, 'finish-second-run');
  const fin2 = (await page.evaluate(() => window.__test!.finish()))!;
  expect(fin2.prevBest).toEqual({ timeMs: s.timeMs, diyas: level.diyas.length, flips: 0 });
  expect([fin2.newTime, fin2.newDiyas, fin2.newFlips]).toEqual([false, false, false]);
  expect(fin2.medal).toBe('gold');
  const stored2 = await page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) ?? 'null'), BEST_KEY);
  expect(stored2).toEqual(stored);
  console.log(`[replay ${bike}] second run ${r.timeMs} ms vs best ${s.timeMs} ms: best kept`);

  // R in the middle of a run restarts it too.
  await page.keyboard.press('r');
  await page.evaluate(() => window.__test!.step(0));
  await page.waitForFunction(() => window.__test!.state().timeMs === 0 && !window.__test!.state().finished);
  await resetBot(page);
  r = await advance(page, plan, 600);
  expect(r.timeMs).toBeGreaterThan(1000);
  await page.keyboard.press('r');
  await page.evaluate(() => window.__test!.step(0));
  await page.waitForFunction(() => window.__test!.state().timeMs === 0);
  r = await getState(page);
  expect(r.x).toBeLessThan(100);
  expect(r.crashes).toBe(0);

  // Back on the title after a reload: the best time and its medal are shown.
  await boot(page);
  await page.evaluate(() => window.__test!.step(40));
  await shot(page, 'title-best');
});
