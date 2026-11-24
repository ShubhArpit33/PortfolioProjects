// The river jump needs boost (GAME_SPEC.md section 9, criterion 4). Both runs start at the river checkpoint.

import { boot, expect, getLevel, layout, shot, startAt, test } from './helpers';

/** The river checkpoint (cp6 since v1.3). */
const RIVER_CP = 6;

interface RiverResult {
  crashed: boolean;
  crashX: number;
  crashY: number;
  lipSpeed: number;
  landingX: number | null;
  landingBoost: number | null;
  midAir: boolean;
}

test.describe('river jump', () => {
  test('throttle only (no boost, no hop) ends in the water', async ({ page }) => {
    await boot(page);
    const level = await getLevel(page);
    const { river } = layout(level);
    await startAt(page, RIVER_CP);

    const r = await page.evaluate(({ river, killY }) => {
      const t = window.__test!;
      t.setInput({ throttle: true });
      let s = t.state();
      let lipSpeed = 0;
      for (let i = 0; i < 120 * 20 && !s.crashed && s.x < river.x1 + 200; i++) {
        if (s.grounded) lipSpeed = s.v;
        t.step(1);
        const n = t.state();
        if (n.crashed) return { crashed: true, x: s.x, y: s.y, lipSpeed, crashes: n.crashes, killY };
        s = n;
      }
      return { crashed: false, x: s.x, y: s.y, lipSpeed, crashes: s.crashes, killY };
    }, { river, killY: level.waterKillY });

    console.log(
      `[river, no boost] lip speed ${r.lipSpeed.toFixed(1)}; last airborne position x=${r.x.toFixed(1)} y=${r.y.toFixed(1)} ` +
      `(${(river.x1 - r.x).toFixed(1)} px short of the far bank), crashed=${r.crashed}`,
    );
    expect(r.lipSpeed, 'reaches normal top speed on the ramp').toBeCloseTo(240, 0);
    expect(r.crashed).toBe(true);
    expect(r.crashes).toBe(1);
    // It went down over the river, at the water (not on the ramp, not on the far wall).
    expect(r.x).toBeGreaterThan(river.x0);
    expect(r.x).toBeLessThan(river.x1);
    expect(r.y).toBeGreaterThan(level.waterLineY);
  });

  test('boost held from the river checkpoint clears the river with at least 1 tile to spare', async ({ page }) => {
    await boot(page);
    const level = await getLevel(page);
    const { river, rampStartX } = layout(level);
    await startAt(page, RIVER_CP);

    const run = (untilLanded: boolean): Promise<RiverResult> =>
      page.evaluate(({ river, untilLanded }) => {
        const t = window.__test!;
        t.setInput({ throttle: true, boost: true });
        const mid = (river.x0 + river.x1) / 2;
        const out = { crashed: false, crashX: 0, crashY: 0, lipSpeed: 0, landingX: null as number | null,
          landingBoost: null as number | null, midAir: false };
        let s = t.state();
        let flew = false;
        for (let i = 0; i < 120 * 20; i++) {
          if (s.grounded && s.x < river.x1) out.lipSpeed = s.v;
          if (!untilLanded && s.x >= mid) { out.midAir = !s.grounded; return out; }
          t.step(1);
          const n = t.state();
          if (n.crashed) { out.crashed = true; out.crashX = s.x; out.crashY = s.y; return out; }
          if (!n.grounded && n.x > river.x0) flew = true;
          if (flew && n.grounded) { out.landingX = n.x; out.landingBoost = n.boost; return out; }
          s = n;
        }
        return out;
      }, { river, untilLanded });

    // On the run-up: boosting on the ground (speed streaks, exhaust flame, camera pulled back).
    const runUp = await page.evaluate((untilX) => {
      const t = window.__test!;
      t.setInput({ throttle: true, boost: true });
      let s = t.state();
      const atRest = s.x - s.camX;
      while (s.x < untilX) { t.step(1); s = t.state(); }
      return { atRest, boosting: s.x - s.camX, v: s.v };
    }, rampStartX + 48);
    await shot(page, 'boost-streaks');
    expect(runUp.v).toBeGreaterThan(340);
    expect(runUp.boosting, 'the camera pulls back at boost speed').toBeLessThan(runUp.atRest - 15);
    expect(runUp.boosting).toBeGreaterThan(90);

    // Stop over the middle of the river for the screenshot, then carry on to the landing.
    const mid = await run(false);
    expect(mid.midAir, 'airborne over the middle of the river').toBe(true);
    await shot(page, 'river-midair-boost-only');

    const r = await run(true);
    expect(r.crashed).toBe(false);
    expect(r.landingX).not.toBeNull();
    const margin = r.landingX! - river.x1;
    console.log(
      `[river, boost] lip speed ${mid.lipSpeed.toFixed(1)}; lands at x=${r.landingX!.toFixed(1)}, ` +
      `margin ${margin.toFixed(1)} px past the far edge (x=${river.x1}), meter left ${r.landingBoost!.toFixed(3)}`,
    );
    expect(river.x1).toBe(8960);
    expect(mid.lipSpeed).toBeCloseTo(360, 0);
    expect(margin).toBeGreaterThanOrEqual(16);

    const end = await page.evaluate(() => window.__test!.state());
    expect(end.crashes).toBe(0);
  });
});
