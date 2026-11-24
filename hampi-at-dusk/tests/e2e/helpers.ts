// Shared e2e fixture and helpers.
// - `test` fails any test that logs a console error, a page error, or a warning outside the allowlist.
// - All tests drive the game with window.__test manual stepping (never rAF / wall-clock time).

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import type { GameSnapshot } from '../../src/scenes/Game';
import type { LevelData } from '../../src/level/levelData';
import type {} from '../../src/testHooks'; // window.__test typing
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

export async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`) });
}

export const getState = (page: Page): Promise<GameSnapshot> => page.evaluate(() => window.__test!.state());
export const getLevel = (page: Page): Promise<LevelData> => page.evaluate(() => window.__test!.levelData);

export async function startAt(page: Page, cp: number): Promise<void> {
  await page.evaluate((n) => {
    const t = window.__test!;
    t.setInput({});
    t.startAt(n);
    t.step(0); // let the scene manager process the start
  }, cp);
  await page.waitForFunction((n) => {
    const s = window.__test!.state();
    return s.checkpoint === n && s.x > 0;
  }, cp);
}

// ------------------------------------------------------------------------------------------------
// Terrain helpers (derived from levelData only)
// ------------------------------------------------------------------------------------------------

export interface Span { x0: number; x1: number }

export interface Layout {
  gaps: Span[];       // canal gaps
  river: Span;
  rampStartX: number; // start of the noHop river ramp
  boxes: Span[];      // cow + solid obstacles (x extent of the hitbox)
  cpX: number[];
  finishX: number;
}

export function layout(level: LevelData): Layout {
  const T = level.tile;
  const gaps: Span[] = [];
  let river: Span | null = null;
  let rampStartX = 0;
  let col = 0;
  for (const section of level.sections) {
    for (const seg of section.segments) {
      if (seg.kind === 'cliff') continue;
      const span = { x0: col * T, x1: (col + seg.cols) * T };
      if (seg.kind === 'gap') {
        if (seg.river) river = span;
        else gaps.push(span);
      } else if (seg.noHop) {
        rampStartX = span.x0;
      }
      col += seg.cols;
    }
  }
  if (!river) throw new Error('levelData has no river gap');
  const boxes: Span[] = [
    { x0: level.cow.col * T, x1: level.cow.col * T + level.cow.w },
    ...level.obstacles.map((o) => ({ x0: o.col * T, x1: (o.col + o.wCols) * T })),
  ];
  return {
    gaps, river, rampStartX, boxes,
    cpX: level.checkpoints.map((c) => c.col * T + T / 2),
    finishX: level.finish.col * T,
  };
}
