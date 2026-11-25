// The bot: plays the stage with __test.setInput / __test.step only. Its plan is derived from __test.levelData.
// Shared by the full-run tests.

import type { Page } from '@playwright/test';
import { CONFIG, type Config } from '../../src/config';
import { CAMERA_MAX_SCROLL_X } from '../../src/level/levelData';
import { layout, planHopsFor, type Layout, type Span } from '../shared/plan';
import type { GameSnapshot, LevelData } from './helpers';

export { planHops } from '../shared/plan';

export interface Plan {
  hops: number[];      // take-off x positions, ascending
  honkFrom: number;    // pulse the horn between these x positions
  honkTo: number;
  boostFrom: number;   // hold boost from this x on
}

const CAM_MAX = CAMERA_MAX_SCROLL_X;

export interface BotMemory {
  next: number; hopHeld: boolean; steps: number;
  camMinStep: number; camMaxStep: number; minScreenX: number; maxScreenX: number;
}

/**
 * Play until the bike's x reaches untilX (or the run ends, or maxSteps pass). One fixed step per
 * decision. The bot's memory lives in window.__bot so the run can be resumed after a screenshot.
 */
export function advance(page: Page, plan: Plan, untilX: number, maxSteps = 120 * 60): Promise<GameSnapshot> {
  return page.evaluate(({ plan, untilX, maxSteps, camMax }) => {
    const t = window.__test!;
    const w = window as unknown as { __bot?: BotMemory };
    const bot = (w.__bot ??= {
      next: 0, hopHeld: false, steps: 0,
      camMinStep: Infinity, camMaxStep: -Infinity, minScreenX: Infinity, maxScreenX: -Infinity,
    });
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
      const camBefore = s.camX;
      s = t.state();
      // Camera bookkeeping: how far it moved this step, and where the bike sits on screen.
      bot.camMinStep = Math.min(bot.camMinStep, s.camX - camBefore);
      bot.camMaxStep = Math.max(bot.camMaxStep, s.camX - camBefore);
      if (s.camX > 1 && s.x + 240 < camMax) { // not while the camera is held at either end of the stage
        bot.minScreenX = Math.min(bot.minScreenX, s.x - s.camX);
        bot.maxScreenX = Math.max(bot.maxScreenX, s.x - s.camX);
      }
      if (hop && !s.grounded) bot.next++;
    }
    return s;
  }, { plan, untilX, maxSteps, camMax: CAM_MAX });
}


/** The bot's whole plan for a level and a bike's tuning: hops, the honking stretch, and boost only on the river run-up. */
export function planFor(level: LevelData, cfg: Config = CONFIG): {
  plan: Plan; lay: Layout; riverCp: number; kickerGap: Span; planner: 'centred' | 'interval';
} {
  const lay = layout(level);
  const hopPlan = planHopsFor(lay, level, cfg);
  const T = level.tile;
  const riverCp = lay.cpX.length - 1;
  return {
    lay,
    riverCp,
    kickerGap: lay.gaps[lay.gaps.length - 1]!, // the tank under the kicker is the last non-river gap
    planner: hopPlan.planner,
    plan: {
      hops: hopPlan.hops,
      honkFrom: level.monkeys.triggerCol * T,
      honkTo: Math.max(...level.monkeys.spawnCols) * T,
      boostFrom: lay.cpX[riverCp]!, // boost only in the river run-up: the meter budget is tight
    },
  };
}

/** Forget the bot's memory (before a second run on the same page). Returns the memory of the run just played. */
export function resetBot(page: Page): Promise<BotMemory | null> {
  return page.evaluate(() => {
    const w = window as unknown as { __bot?: BotMemory };
    const old = w.__bot ?? null;
    delete w.__bot;
    return old;
  });
}
