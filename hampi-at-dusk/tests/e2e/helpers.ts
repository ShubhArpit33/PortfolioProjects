// Shared e2e fixture and helpers.
// - `test` fails any test that logs a console error, a page error, or a warning outside the allowlist.
// - All tests drive the game with window.__test manual stepping (never rAF / wall-clock time).

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import type { GameSnapshot } from '../../src/scenes/Game';
import type { LevelData } from '../../src/level/levelData';
import type {} from '../../src/testHooks'; // window.__test typing
import { BIKE_ORDER, type BikeId } from '../../src/bike/bikes';
import { isAllowedWarning } from './consoleAllowlist';

export { expect };
export type { GameSnapshot, LevelData };

export const SHOTS_DIR = path.resolve('test-results', 'shots');
export const GAME_URL = '/?renderer=canvas';

export const test = base.extend<{ consoleGuard: string[] }>({
  consoleGuard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('pageerror', (e) => problems.push(`pageerror: ${String(e)}`));
      page.on('console', (m) => {
        const type = m.type();
        if (type === 'error') problems.push(`console.error: ${m.text()}`);
        else if (type === 'warning' && !isAllowedWarning(m.text())) problems.push(`console.warning: ${m.text()}`);
      });
      await use(problems);
      expect(problems, 'console errors / non-allowlisted warnings').toEqual([]);
    },
    { auto: true },
  ],
});

/** Load the game, wait for Boot, and switch to manual stepping. */
export async function boot(page: Page): Promise<void> {
  await page.goto(GAME_URL);
  await page.waitForFunction(() => window.__test?.ready() === true);
  await page.evaluate(() => window.__test!.setManual(true));
}

/**
 * From the title screen: start a ranked run with real key presses, on the given bike (default: whichever
 * is selected). Leaves the game in manual stepping with the run at time 0.
 */
export async function rideFromTitle(page: Page, bike?: BikeId): Promise<void> {
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.__test!.step(1));
  await page.waitForFunction(() => window.__test!.screen() === 'select');
  await rideFromSelect(page, bike);
}

/** On the bike select screen: Left / Right to the bike (if given), then Enter. */
export async function rideFromSelect(page: Page, bike?: BikeId): Promise<void> {
  if (bike) {
    const from = await page.evaluate(() => window.__test!.select()!.index);
    const to = BIKE_ORDER.indexOf(bike);
    const right = (to - from + BIKE_ORDER.length) % BIKE_ORDER.length;
    // the shorter way round
    const [key, n] = right <= BIKE_ORDER.length / 2 ? ['ArrowRight', right] as const : ['ArrowLeft', BIKE_ORDER.length - right] as const;
    for (let i = 0; i < n; i++) {
      await page.keyboard.press(key);
      await page.evaluate(() => window.__test!.step(1));
    }
    expect(await page.evaluate(() => window.__test!.select()!.cards[window.__test!.select()!.index]!.bike)).toBe(bike);
  }
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.__test!.step(0));
  await page.waitForFunction(() => window.__test!.screen() === 'game' && window.__test!.state().x > 0);
}

export async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`) });
}

export const getState = (page: Page): Promise<GameSnapshot> => page.evaluate(() => window.__test!.state());
export const getLevel = (page: Page): Promise<LevelData> => page.evaluate(() => window.__test!.levelData);

/** Start a fresh run at a checkpoint; with a bike id, on that bike (otherwise on the selected one). */
export async function startAt(page: Page, cp: number, bike?: BikeId): Promise<void> {
  await page.evaluate(({ n, bike }) => {
    const t = window.__test!;
    t.setInput({});
    t.startAt(n, bike);
    t.step(0); // let the scene manager process the start
  }, { n: cp, bike });
  await page.waitForFunction((n) => {
    const s = window.__test!.state();
    return s.checkpoint === n && s.x > 0;
  }, cp);
}

// Terrain helpers (derived from levelData only) live in tests/shared/plan.ts.
export { layout, type Layout, type Span } from '../shared/plan';
