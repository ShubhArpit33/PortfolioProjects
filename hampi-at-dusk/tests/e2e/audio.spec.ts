// Audio (v1.3): no AudioContext until a real key press; music runs after it; M cycles
// all sound -> music off -> muted, and the choice is remembered. Console must stay clean throughout.

import { boot, expect, rideFromTitle, test } from './helpers';

test('music starts only after a real key press; M cycles the sound modes and is remembered', async ({ page }) => {
  await boot(page);
  const audio = () => page.evaluate(() => window.__test!.audio());

  // Test input and stepping never create audio.
  await page.evaluate(() => { const t = window.__test!; t.setInput({ throttle: true, honk: true }); t.step(60); });
  expect((await audio()).created).toBe(false);

  await rideFromTitle(page); // trusted key presses (Enter, Enter): create the context and start the run
  let a = await audio();
  expect(a.created).toBe(true);
  expect(a.mode).toBe(0);

  // Let the music play for a while in real time (the scheduler runs from the frame loop / steps),
  // crashing once into the cow on the way so the duck path runs too.
  let musicPeak = 0;
  let masterPeak = 0;
  for (let i = 0; i < 16; i++) {
    await page.evaluate(() => { const t = window.__test!; t.setInput({ throttle: true }); t.step(30); });
    await page.waitForTimeout(120);
    a = await audio();
    musicPeak = Math.max(musicPeak, a.musicPeak);
    masterPeak = Math.max(masterPeak, a.masterPeak);
  }
  expect((await page.evaluate(() => window.__test!.state())).crashes).toBeGreaterThanOrEqual(1);
  console.log(`[audio] context ${a.state}; music bus peak ${musicPeak.toFixed(3)}, master peak ${masterPeak.toFixed(3)}`);
  if (a.state === 'running') {
    expect(musicPeak, 'music is audible on its bus').toBeGreaterThan(0.005);
    expect(musicPeak, 'music sits low in the mix').toBeLessThan(0.5);
    expect(masterPeak, 'no clipping').toBeLessThan(1);
  }

  // M: music off, then everything muted, then back on.
  const modes: number[] = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('m');
    await page.evaluate(() => window.__test!.step(2));
    modes.push((await audio()).mode);
  }
  expect(modes).toEqual([1, 2, 0]);

  // Remembered across a reload.
  await page.keyboard.press('m');
  expect((await audio()).mode).toBe(1);
  await boot(page);
  a = await audio();
  expect(a.mode).toBe(1);
  expect(a.created).toBe(false);
});
