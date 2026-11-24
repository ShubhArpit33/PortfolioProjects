// The bot run (GAME_SPEC.md section 9, criteria 2, 3 and 9).
// Starts from the title with a real Enter key press, then plays the whole stage with
// __test.setInput / __test.step only. Its plan is derived from __test.levelData.

import type { Page } from '@playwright/test';
import { CONFIG } from '../../src/config';
import {
  boot, expect, getLevel, getState, layout, shot, test,
  type GameSnapshot, type Layout, type LevelData, type Span,
} from './helpers';

interface Plan {
  hops: number[];      // take-off x positions, ascending
  honkFrom: number;    // pulse the horn between these x positions
  honkTo: number;
  boostFrom: number;   // hold boost from this x on
}

const HALF_BIKE = CONFIG.bikeHitW / 2;
/** Length of a flat-ground hop at top speed: 2·hopVelocity/gravity · topSpeed = 192 px. */
const HOP_LEN = ((2 * CONFIG.hopVelocity) / CONFIG.gravity) * CONFIG.topSpeed;
const MARGIN = 8;

/**
 * One hop per hazard (canal gap, cow, pillar, cart), centred over it. If a hop would come down
 * too late to take off for the next hazard, both are cleared with a single hop centred over the pair.
 */
function planHops(lay: Layout, level: LevelData): number[] {
  const hazards: Span[] = [
    ...lay.gaps,
    ...lay.boxes.map((b) => ({ x0: b.x0 - HALF_BIKE, x1: b.x1 + HALF_BIKE })),
  ].sort((a, b) => a.x0 - b.x0);

  const hops: number[] = [];
  const groups: Span[] = [];
  let prevLanding = -Infinity;
  for (let i = 0; i < hazards.length; i++) {
    const group = { ...hazards[i]! };
    const landing = (): number => Math.max((group.x0 + group.x1) / 2 - HOP_LEN / 2, prevLanding + 2) + HOP_LEN;
    while (i + 1 < hazards.length && landing() > hazards[i + 1]!.x0 - MARGIN - 2) {
      group.x1 = hazards[++i]!.x1;
    }
    const takeoff = landing() - HOP_LEN;
    if (takeoff > group.x0 - MARGIN || landing() < group.x1 + MARGIN) {
      throw new Error(`no safe hop for hazard ${group.x0}..${group.x1}`);
    }
    hops.push(takeoff);
    groups.push(group);
    prevLanding = landing();
  }

  // Diyas floating 2+ tiles above solid ground that no hazard hop passes through need their own
  // hop (x276 on the up-ramp). Diyas just past a cliff are collected by rolling off it.
  const T = level.tile;
  const heights = columnHeights(level);
  for (const d of level.diyas) {
    const x = d.col * T + T / 2;
    const ground = heights.h[d.col];
    if (ground === null || ground === undefined || d.h - ground < 2) continue;
    if (groups.some((g) => x >= g.x0 - HOP_LEN && x <= g.x1 + HOP_LEN)) continue;
    if (heights.cliffCols.some((c) => d.col >= c && d.col < c + 8)) continue;
    hops.push(x - 24); // 0.1 s before the diya: the bike box is centred on it while rising
  }
  return hops.sort((a, b) => a - b);
}

/** Surface height (tiles) at the middle of each column; null over water. */
function columnHeights(level: LevelData): { h: Array<number | null>; cliffCols: number[] } {
  const h: Array<number | null> = [];
  const cliffCols: number[] = [];
  let cur = 0;
  for (const section of level.sections) {
    for (const seg of section.segments) {
      if (seg.kind === 'cliff') {
        cliffCols.push(h.length);
        cur = seg.toH;
      } else if (seg.kind === 'gap') {
        for (let i = 0; i < seg.cols; i++) h.push(null);
        cur = seg.farBankH ?? cur;
      } else {
        const rise = seg.kind === 'ramp' ? seg.rise : 0;
        for (let i = 0; i < seg.cols; i++) h.push(cur + (rise * (i + 0.5)) / seg.cols);
        cur += rise;
      }
    }
  }
  return { h, cliffCols };
}

/**
 * Play until the bike's x reaches untilX (or the run ends, or maxSteps pass). One fixed step per
 * decision. The bot's memory lives in window.__bot so the run can be resumed after a screenshot.
 */
function advance(page: Page, plan: Plan, untilX: number, maxSteps = 120 * 60): Promise<GameSnapshot> {
  return page.evaluate(({ plan, untilX, maxSteps }) => {
    const t = window.__test!;
    const w = window as unknown as { __bot?: { next: number; hopHeld: boolean; steps: number } };
    const bot = (w.__bot ??= { next: 0, hopHeld: false, steps: 0 });
    let s = t.state();
    for (let i = 0; i < maxSteps && s.x < untilX && !s.finished && !s.crashed; i++) {
      // Hop: edge-triggered, so press for one step and release on the next.
      let hop = false;
      if (!bot.hopHeld && s.grounded && bot.next < plan.hops.length && s.x >= plan.hops[bot.next]!) hop = true;
      // Honk early and often while the monkeys run in (edge-triggered: 5 steps on, 5 off).
      const honk = s.x >= plan.honkFrom && s.x <= plan.honkTo && bot.steps % 10 < 5;
      // In the air, hold the bike level for a clean landing.
      const tiltDown = !s.grounded && s.angle > 3;
      const tiltUp = !s.grounded && s.angle < -3;
      t.setInput({ throttle: true, hop, honk, tiltUp, tiltDown, boost: s.x >= plan.boostFrom });
      t.step(1);
      bot.steps++;
      bot.hopHeld = hop;
      s = t.state();
      if (hop && !s.grounded) bot.next++;
    }
    return s;
  }, { plan, untilX, maxSteps });
}

test('bot: full run from the title - 0 crashes, 17 diyas, under 120 s', async ({ page }) => {
  test.setTimeout(120_000);
  await boot(page);
  const level = await getLevel(page);
  const lay = layout(level);
  const T = level.tile;
  const sectionMid = (id: number): number => {
    const s = level.sections.find((x) => x.id === id)!;
    return ((s.startCol + s.endCol + 1) / 2) * T;
  };

  const plan: Plan = {
    hops: planHops(lay, level),
    honkFrom: level.monkeys.triggerCol * T,
    honkTo: Math.max(...level.monkeys.spawnCols) * T,
    boostFrom: lay.cpX[4]!, // boost only in the cp4 run-up: the meter budget is tight
  };
  console.log(`[bot] hops at x = ${plan.hops.map((x) => x.toFixed(0)).join(', ')}`);

  // --- title ---
  await page.evaluate(() => window.__test!.step(90));
  await shot(page, 'title');
  expect((await getState(page)).timeMs).toBe(0);

  await page.keyboard.press('Enter');
  await page.evaluate(() => window.__test!.step(0));
  await page.waitForFunction(() => window.__test!.state().x > 0);

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
  s = await advance(page, plan, lay.cpX[4]! + 150); // cp4 lit, boost hint, run-up
  await shot(page, 'section5');
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
    `[bot] finished: timeMs=${s.timeMs} (${(s.timeMs / 1000).toFixed(2)} s), crashes=${s.crashes}, ` +
    `diyas=${s.diyas}/${level.diyas.length}, boost left=${s.boost.toFixed(3)}`,
  );
  expect(s.finished).toBe(true);
  expect(s.crashed).toBe(false);
  expect(s.crashes).toBe(0);
  expect(s.diyas).toBe(17);
  expect(s.timeMs).toBeLessThan(120_000);
  expect(s.timeMs, 'the timer stops at the finish line').toBe(final.timeMs);
});
