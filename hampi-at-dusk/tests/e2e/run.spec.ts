// The bot run (GAME_SPEC.md section 9, criteria 2, 3 and 9), then the replay loop on the same page:
// best time + medal + ghost saved at the line, R to ride again, the ghost of the first run, G to hide it.
// Starts from the title with a real Enter key press, then plays with __test.setInput / __test.step only.
// v1.7: the 900-column stage. The first run also shows the tutorial prompts; finishing it switches them off.

import { BIKES, BIKE_ORDER, BOT_RUN_MS, DEFAULT_BIKE } from '../../src/bike/bikes';
import { TERRAIN } from '../../src/level/terrain';
import { ARCHIVED_BEST_KEYS, GHOST_SAMPLE_STEPS, PREFS_KEY, bestKey, encodeGhost } from '../../src/progress';
import { boulderMeetX } from '../shared/plan';
import { advance, planFor, resetBot } from './bot';
import { boot, expect, getLevel, getState, rideFromTitle, shot as saveShot, test } from './helpers';

/** The bot's measured clean run per bike (ms): a change in feel shows up here first. */
const EXPECTED_MS = BOT_RUN_MS;

/**
 * What a v1.6 player has in storage: the pre-roster record and one per bike, from the 580-column stage, all
 * faster than anything on the new one. v1.7 must neither use nor touch them (records are version 2 now).
 */
const OLD_GHOST = encodeGhost(Array.from({ length: 240 }, (_, i) => ({ x: 40 + i * 10, y: 222, angle: 0 })));
const ARCHIVE: Record<string, string> = Object.fromEntries(ARCHIVED_BEST_KEYS.map((k, i) =>
  [k, JSON.stringify({ v: 1, stage: 580, timeMs: 32_058 + i * 1000, diyas: 30, flips: i, ghost: OLD_GHOST })]));

for (const bike of BIKE_ORDER) test(`bot on the ${BIKES[bike].name}: full run from the title - 0 crashes, all 56 diyas, gold; then best, ghost and quick restart`, async ({ page }) => {
  test.setTimeout(300_000);
  const def = BIKES[bike];
  const CONFIG = def.cfg;
  const MEDAL_TIMES_MS = def.medalsMs;
  const BEST_KEY = bestKey(bike);
  // The default bike keeps the plain screenshot names; the others get a suffix.
  const shot = (p: typeof page, name: string): Promise<void> => saveShot(p, bike === DEFAULT_BIKE ? name : `${name}-${bike}`);
  await boot(page);
  await page.evaluate((old) => { for (const [k, v] of Object.entries(old)) window.localStorage.setItem(k, v); }, ARCHIVE);
  await boot(page); // reload with the old records in place
  const readArchive = (): Promise<Record<string, string | null>> =>
    page.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, window.localStorage.getItem(k)])), [...ARCHIVED_BEST_KEYS]);
  const level = await getLevel(page);
  const { plan, lay, riverCp, kickerGap, planner } = planFor(level, CONFIG);
  console.log(`[bot ${bike}] ${planner} planner`);
  const T = level.tile;
  const sectionMid = (name: string): number => {
    const s = level.sections.find((x) => x.name === name)!;
    return ((s.startCol + s.endCol + 1) / 2) * T;
  };
  const boxOf = (type: string, nth: number): { x0: number; x1: number } => {
    const o = level.obstacles.filter((x) => x.type === type)[nth]!;
    return { x0: o.col * T, x1: (o.col + o.wCols) * T };
  };

  console.log(`[bot ${bike}] hops at x = ${plan.hops.map((x) => x.toFixed(0)).join(', ')}`);

  // --- title ---
  await page.evaluate(() => window.__test!.step(90));
  await shot(page, 'title');
  expect((await getState(page)).timeMs).toBe(0);

  await rideFromTitle(page, bike);
  expect((await getState(page)).bike).toBe(bike);

  // --- the ride, stopping for screenshots ---
  let s = await getState(page);
  const stop = async (x: number, name: string): Promise<void> => {
    s = await advance(page, plan, x);
    await shot(page, name);
  };

  // The old records are not this stage's: there is no best to beat and no ghost to race.
  await page.evaluate(() => window.__test!.step(0)); // one frame drawn, no game time: a ghost would be at its first pose
  expect((await getState(page)).ghost, 'no ghost from an archived record').toBeNull();
  s = await getState(page);

  // Warm-up Road: no full run has been finished yet, so the four tutorial prompts show in turn.
  expect(s.prompt).toBe('HOLD RIGHT TO RIDE');
  await stop(10 * T, 'warmup-prompt-ride');
  expect(s.prompt).toBe('HOLD RIGHT TO RIDE');
  await stop(boxOf('log', 0).x0 + 8, 'warmup-log-hop'); // in the air over the log
  expect(s.grounded, 'airborne over the log').toBe(false);
  expect(s.prompt).toBe('SPACE - HOP THE LOG');
  await stop(62 * T, 'warmup-boost-strip'); // the diya line along the boost strip (the bot saves its boost for the river)
  expect(s.prompt).toBe('HOLD SHIFT - BOOST');
  await stop(89 * T, 'warmup-roller'); // the crest of the roller
  expect(s.prompt).toBe('IN THE AIR: UP / DOWN TO TILT');
  expect([s.stumbles, s.wobbles, s.diyas]).toEqual([0, 0, 10]);

  await stop(sectionMid('Bazaar Street') + 120, 'bazaar'); // the cow comes into view
  expect(s.prompt).toBe('');
  await stop((lay.canals[2]!.x0 + lay.canals[2]!.x1) / 2, 'canals'); // mid-hop over the widest early canal
  await stop(lay.cpX[3]! + 56, 'canals-cp3'); // v1.7: the checkpoint inside the canal run, just lit
  expect(s.checkpoint).toBe(3);
  await stop(plan.honkFrom + 110, 'pavilion-monkeys'); // monkeys leaping away from the horn
  await stop(boxOf('cart', 0).x0, 'pavilion-cart'); // hopping the bullock cart
  await stop(sectionMid('Boulder Field') - 60, 'boulder-field'); // top of the big ramp, cliff ahead
  await stop(level.bonus.lipCol * T - 24, 'ruins-bonus-ramp'); // v1.7 breather: rolling up the bonus ramp, ruins behind
  await stop((level.bonus.cliffCol + 24) * T, 'ruins-trail'); // the diya trail out, past the shrine
  expect(s.checkpoint).toBe(6);
  await stop(boxOf('pillar', 4).x0 + 24, 'mandapa'); // mandapa run: over the second pillar on the plinth
  await stop(kickerGap.x0 - 23 * T, 'rocks'); // rocks: top of the hop line off the second roller
  if (bike === DEFAULT_BIKE) expect(s.grounded, 'airborne on the roller hop line').toBe(false);
  await stop((kickerGap.x0 + kickerGap.x1) / 2, 'kicker'); // big air off the kicker, over the tank
  expect(s.grounded, 'airborne over the tank').toBe(false);

  // Temple Steps (v1.7): a hop up each riser, the boulder with its "!", a hop over it, the stairs down.
  for (let i = 0; i < 3; i++) {
    await stop(lay.steps[i]!.x0 + 8, `steps-riser${i + 1}`);
    expect(s.grounded, `airborne over riser ${i + 1}`).toBe(false);
  }
  expect(s.boulder.phase).toBe('hidden');
  await stop(lay.boulder.triggerX + 16, 'boulder-cue'); // it has just started: still off screen, the "!" at the right edge
  expect(s.boulder.phase).toBe('roll');
  expect(s.checkpoint).toBe(10);
  await stop(lay.boulder.triggerX + 150, 'boulder-on-screen'); // rolling out of the temple doorway
  await stop(boulderMeetX(lay, CONFIG), 'boulder-hop'); // right over it
  expect(s.grounded, 'airborne over the boulder').toBe(false);
  expect(Math.abs(s.boulder.x + level.boulder.hitW / 2 - s.x), 'the boulder is under the bike').toBeLessThan(6);
  const stairs = TERRAIN.cliffs.filter((c) => c.x > lay.steps[2]!.x1);
  expect(stairs).toHaveLength(3);
  await stop(stairs[1]!.x + 8, 'stairs-down'); // rolling down the three drops
  expect(s.crashes).toBe(0);

  await stop(lay.cpX[riverCp]! + 150, 'river-run-up'); // river checkpoint lit, boost hint, run-up
  await stop((lay.river.x0 + lay.river.x1) / 2, 'river-midair');
  expect(s.grounded, 'airborne over the middle of the river').toBe(false);

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
  expect(level.diyas.length).toBe(56);
  expect(s.diyas).toBe(level.diyas.length);
  expect([s.stumbles, s.wobbles, s.flips]).toEqual([0, 0, 0]);
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
  // One full run finished: the tutorial is done, and remembered.
  expect(JSON.parse((await page.evaluate((k) => window.localStorage.getItem(k), PREFS_KEY))!).tutorialDone).toBe(true);
  expect([fin.newTime, fin.newDiyas, fin.newFlips, fin.saved]).toEqual([true, true, true, true]);
  const stored = await page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) ?? 'null'), BEST_KEY);
  expect(stored.timeMs).toBe(s.timeMs);
  expect(stored.diyas).toBe(level.diyas.length);
  expect(stored.flips).toBe(0);
  expect(stored.v).toBe(2);
  expect(stored.stage).toBe(900);
  // This bike's record only: nothing under the other bikes' keys, and the archive exactly as it was.
  const others = await page.evaluate(
    (keys) => keys.map((k) => window.localStorage.getItem(k)),
    BIKE_ORDER.filter((b) => b !== bike).map(bestKey),
  );
  expect(others).toEqual([null, null]);
  expect(await readArchive()).toEqual(ARCHIVE);
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
  expect(r.prompt, 'no tutorial prompt on the second run').toBe('');
  expect(r.boulder.phase, 'the boulder is back in its doorway').toBe('hidden');

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

  // Back on the title after a reload: the best time and its medal are shown. The archive is still untouched.
  expect(await readArchive()).toEqual(ARCHIVE);
  await boot(page);
  expect(await readArchive()).toEqual(ARCHIVE);
  await page.evaluate(() => window.__test!.step(40));
  await shot(page, 'title-best');
  // ... and the tutorial stays done on the next visit.
  await rideFromTitle(page, bike);
  r = await getState(page);
  expect([r.timeMs, r.prompt]).toEqual([0, '']);
});
