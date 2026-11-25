// Fixed moments along the stage, saved as PNGs for judging the look by eye (see playwright.look.config.ts).
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { BIKES, DEFAULT_BIKE } from '../../src/bike/bikes';
import { boulderMeetX } from '../shared/plan';
import { advance, planFor } from '../e2e/bot';
import { expect, getLevel, getState, rideFromTitle, startAt, test } from '../e2e/helpers';

const DIR = path.resolve(process.env.LOOK_DIR ?? path.join('test-results', 'look'));
const URL = process.env.LOOK_RENDERER === 'webgl' ? '/' : '/?renderer=canvas';

async function boot(page: Page): Promise<void> {
  await page.goto(URL);
  await page.waitForFunction(() => window.__test?.ready() === true);
  await page.evaluate(() => window.__test!.setManual(true));
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  await page.screenshot({ path: path.join(DIR, `${name}.png`) });
}

const step = (page: Page, n: number, input: Record<string, boolean> = {}): Promise<void> =>
  page.evaluate(({ n, input }) => { const t = window.__test!; t.setInput(input); t.step(n); }, { n, input });

test('look: title, select, the stage end to end, finish', async ({ page }) => {
  test.setTimeout(300_000);
  const cfg = BIKES[DEFAULT_BIKE].cfg;
  await boot(page);
  await step(page, 90);
  await shot(page, '01-title');
  await page.keyboard.press('Enter');
  await step(page, 1);
  await page.waitForFunction(() => window.__test!.screen() === 'select');
  await step(page, 30);
  await shot(page, '02-select');
  await page.keyboard.press('Escape');
  await step(page, 1);
  await page.waitForFunction(() => window.__test!.screen() === 'title');

  await rideFromTitle(page, DEFAULT_BIKE);
  const level = await getLevel(page);
  const { plan, lay, riverCp, kickerGap } = planFor(level, cfg);
  const T = level.tile;
  const stop = async (x: number, name: string): Promise<void> => { await advance(page, plan, x); await shot(page, name); };
  const box = (type: string, nth: number): number => level.obstacles.filter((o) => o.type === type)[nth]!.col * T;
  const mid = (name: string): number => { const s = level.sections.find((x) => x.name === name)!; return ((s.startCol + s.endCol + 1) / 2) * T; };

  await step(page, 30);
  await shot(page, '03-start');
  await stop(14 * T, '04-warmup-diyas');
  await stop(box('log', 0) + 8, '05-log-hop');
  await stop(62 * T, '06-boost-strip');
  await stop(mid('Bazaar Street') + 120, '07-bazaar-cow');
  await stop((lay.canals[2]!.x0 + lay.canals[2]!.x1) / 2, '08-canals');
  await stop(lay.cpX[3]! + 56, '09-canals-checkpoint');
  await stop(plan.honkFrom + 110, '10-pavilion-monkeys');
  await stop(box('cart', 0), '11-pavilion-cart');
  await stop(mid('Boulder Field') - 60, '12-boulder-field');
  await stop(level.bonus.lipCol * T - 24, '13-ruins-bonus-ramp');
  await stop((level.bonus.cliffCol + 24) * T, '14-ruins-trail');
  await stop(box('pillar', 4) + 24, '15-mandapa');
  await stop(kickerGap.x0 - 23 * T, '16-rocks');
  await stop((kickerGap.x0 + kickerGap.x1) / 2, '17-kicker');
  await stop(lay.steps[1]!.x0 + 8, '18-steps-riser2');
  await stop(lay.boulder.triggerX + 150, '19-boulder-on-screen');
  await stop(boulderMeetX(lay, cfg), '20-boulder-hop');
  await stop(lay.cpX[riverCp]! + 150, '21-river-run-up');
  await stop(lay.river.x0 - 40, '22-river-lip');
  await stop((lay.river.x0 + lay.river.x1) / 2, '23-river-midair');
  const s = await advance(page, plan, Infinity);
  expect([s.finished, s.crashes]).toEqual([true, 0]);
  await step(page, 60);
  await shot(page, '24-finish-line');
  await step(page, 240);
  await shot(page, '25-finish-screen');
});

test('look: crash, respawn, pause', async ({ page }) => {
  await boot(page);
  await startAt(page, 2, DEFAULT_BIKE);
  await step(page, 150, { throttle: true }); // into the first canal
  for (let i = 0; i < 400 && !(await getState(page)).crashed; i += 4) await step(page, 4, { throttle: true });
  await step(page, 20);
  await shot(page, '30-crash-water');
  await step(page, 160);
  await shot(page, '31-respawn');
  await startAt(page, 4, DEFAULT_BIKE);
  for (let i = 0; i < 800 && !(await getState(page)).crashed; i += 4) await step(page, 4, { throttle: true });
  await step(page, 30);
  await shot(page, '32-crash-pillar');
  await startAt(page, 10, DEFAULT_BIKE);
  for (let i = 0; i < 800 && !(await getState(page)).crashed; i += 4) await step(page, 4, { throttle: true });
  await step(page, 12);
  await shot(page, '33-crash-boulder');
  await startAt(page, 7, DEFAULT_BIKE);
  await step(page, 200, { throttle: true });
  await page.keyboard.press('p');
  await step(page, 1);
  await shot(page, '34-pause');
});
