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

  // v1.6.4: the music plays on the menus only. During a run the music bus fades to silence while the engine and
  // effects play on; crash once into the cow so the duck path runs too (it must not bring the music back).
  // (The cow is the first thing that can crash the bike: the Warm-up Road before her is a no-crash zone.)
  let runMusicPeak = 0;
  let masterPeak = 0;
  for (let i = 0; i < 60; i++) {
    if (i >= 16 && (await page.evaluate(() => window.__test!.state())).crashes >= 1) break;
    await page.evaluate(() => { const t = window.__test!; t.setInput({ throttle: true }); t.step(30); });
    await page.waitForTimeout(120);
    a = await audio();
    if (i >= 12) runMusicPeak = Math.max(runMusicPeak, a.musicPeak); // after the fade-out
    masterPeak = Math.max(masterPeak, a.masterPeak);
  }
  expect((await page.evaluate(() => window.__test!.state())).crashes).toBeGreaterThanOrEqual(1);

  // Back to the title through the pause menu (RESUME, RESTART, CHANGE BIKE, MAIN MENU): the music returns there.
  for (const key of ['Escape', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter']) {
    await page.keyboard.press(key);
    await page.evaluate(() => window.__test!.step(2));
  }
  await page.waitForFunction(() => window.__test!.screen() === 'title');
  let menuMusicPeak = 0;
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => window.__test!.step(30));
    await page.waitForTimeout(120);
    a = await audio();
    menuMusicPeak = Math.max(menuMusicPeak, a.musicPeak);
    masterPeak = Math.max(masterPeak, a.masterPeak);
  }
  console.log(`[audio] context ${a.state}; music peak in the run ${runMusicPeak.toFixed(3)}, on the title ${menuMusicPeak.toFixed(3)}, master peak ${masterPeak.toFixed(3)}`);
  if (a.state === 'running') {
    expect(runMusicPeak, 'no music during a run').toBeLessThan(0.005);
    expect(menuMusicPeak, 'music is audible on the menus').toBeGreaterThan(0.005);
    expect(menuMusicPeak, 'music sits low in the mix').toBeLessThan(0.5);
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
