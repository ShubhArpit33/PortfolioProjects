// Shared by the flip and sprite specs: ride at the kicker and flip off it.
import type { Page } from '@playwright/test';
import type { GameSnapshot } from './helpers';

export interface FlipResult { before: GameSnapshot; after: GameSnapshot; airSteps: number }

/**
 * Throttle to the kicker, hop on its ramp, hold Up until the bike has turned `release` degrees, then
 * (if `level`) level out. With `boostRunUp`, boost is held all the way to the hop (which empties most of
 * the meter, so the refill shows). Stops at `stopAtSpin` degrees (for a screenshot) or once the bike has landed or crashed.
 */
export function kickerFlip(
  page: Page, hopX: number, release: number, level: boolean, stopAtSpin = Infinity, boostRunUp = false,
): Promise<FlipResult | null> {
  return page.evaluate(({ hopX, release, level, stopAtSpin, boostRunUp }) => {
    const t = window.__test!;
    const w = window as unknown as { __flip?: { hopped: boolean; released: boolean; air: number; before: unknown } };
    const mem = (w.__flip ??= { hopped: false, released: false, air: 0, before: null });
    let s = t.state();
    for (let i = 0; i < 120 * 20; i++) {
      const inAir = mem.hopped && !s.grounded;
      if (inAir && s.spin >= stopAtSpin) return null;
      if (inAir && s.spin >= release) mem.released = true;
      const holding = inAir && !mem.released;
      const levelling = level && inAir && mem.released;
      if (inAir || !mem.hopped) mem.before = s;
      t.setInput({
        throttle: true,
        boost: boostRunUp && !mem.hopped,
        hop: !mem.hopped && s.x >= hopX,
        tiltUp: holding || (levelling && s.angle < -3),
        tiltDown: levelling && s.angle > 3,
      });
      t.step(1);
      const n = t.state();
      if (!mem.hopped && !n.grounded && n.x >= hopX) mem.hopped = true;
      if (mem.hopped && !n.grounded) mem.air++;
      if (mem.hopped && (n.crashed || n.grounded)) {
        const out = { before: mem.before as typeof n, after: n, airSteps: mem.air };
        delete w.__flip;
        return out;
      }
      s = n;
    }
    throw new Error('the bike never landed');
  }, { hopX, release, level, stopAtSpin, boostRunUp });
}
