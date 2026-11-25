// The look system (v1.8), checked as pixels: the passes do what they say, and the Hampi theme keeps the
// choices made for it (subtle glow; teal only in the river and its mist; the dirt road with grass on top;
// nothing tall on the riding line; palms that read as palms). Painted into plain buffers; no Phaser.
import { describe, expect, it } from 'vitest';
import { halo, lightPool } from '../../src/art/look/bake';
import { grassLine, roadColumn, roadDetail, waterColumn, type Rect } from '../../src/art/look/ground';
import { Pix, haze, keyline, rimLight, skyBands } from '../../src/art/look/pix';
import { palm } from '../../src/art/look/silhouettes';
import { LAYER_H, LAYER_W } from '../../src/art/look/theme';
import { PAL, rng } from '../../src/art/palette';
import { Pen } from '../../src/art/pen';
import { HAMPI } from '../../src/art/themes/hampi';

const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
/** Teal / cyan: green and blue both well above red. */
const isTeal = (c: number): boolean => { const [r, g, b] = rgb(c); return g > r + 24 && b > r + 24; };
/** The road's family: warm (red >= green >= blue, roughly), not pale, not grey-blue. */
const isWarmEarth = (c: number): boolean => { const [r, g, b] = rgb(c); return r >= g - 4 && g >= b - 4 && r < 215; };
const isGreen = (c: number): boolean => { const [r, g, b] = rgb(c); return g > r && g > b + 30; };

const layers = Object.fromEntries(HAMPI.layers.map((l) => {
  const p = new Pix(LAYER_W, LAYER_H, true);
  l.paint(p);
  return [l.key, p];
}));
const count = (p: Pix, y0: number, y1: number, test: (c: number, a: number) => boolean): number => {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < p.w; x++) if (test(p.rgb(x, y), p.alpha(x, y))) n++;
  return n;
};

describe('look passes', () => {
  it('Pix blends, adds and wraps', () => {
    const p = new Pix(4, 2, true);
    p.px(0x102030, 0, 0);
    p.px(0xffffff, 0, 0, 0.5);
    expect(rgb(p.rgb(0, 0)).map((v) => Math.round(v / 8))).toEqual([17, 18, 19]);
    p.add(0x404040, 0, 0, 1);
    expect(rgb(p.rgb(0, 0))[0]).toBeGreaterThan(190);
    p.px(0xff0000, 5, 1); // wraps to x = 1
    expect([p.alpha(1, 1), p.alpha(5, 1), p.alpha(1, 5)]).toEqual([255, 255, 0]);
    p.add(0x00ff00, 2, 1, 0.5); // adding light to nothing paints it
    expect(p.alpha(2, 1)).toBe(128);
  });

  it('rim light paints only the edges that face the light and the sky', () => {
    const p = new Pix(12, 12);
    p.fillStyle(0x200040);
    p.fillRect(3, 3, 6, 6);
    rimLight(p, 0xffffff, { side: 1, top: 0.5 });
    const lit = (x: number, y: number): boolean => rgb(p.rgb(x, y))[0] > 100;
    expect([lit(3, 5), lit(5, 3), lit(8, 5), lit(5, 8), lit(5, 5)]).toEqual([true, true, false, false, false]);
    expect(rgb(p.rgb(3, 5))[0]).toBeGreaterThan(rgb(p.rgb(5, 3))[0]); // the side is brighter than the top
    expect(p.alpha(2, 5), 'nothing is painted outside the shape').toBe(0);
  });

  it('haze thickens downward and a sky is banded from its first stop to its last', () => {
    const p = new Pix(64, 40, true);
    haze(p, 5, 30, 0xff8040, 0.6, { y2: 40 });
    const row = (y: number): number => { let s = 0; for (let x = 0; x < 64; x++) s += p.alpha(x, y); return s / 64; };
    expect(row(0)).toBe(0);
    expect(row(12)).toBeLessThan(row(22));
    expect(row(22)).toBeLessThan(row(35));
    expect(Math.round(row(35))).toBe(Math.round(0.6 * 255));
    const s = new Pix(8, 20);
    skyBands(s, [[0, 0x000080], [20, 0xff8000]], 4);
    expect(s.rgb(0, 0)).toBe(0x000080);
    expect(rgb(s.rgb(0, 19))[0]).toBeGreaterThan(150);
    expect(count(s, 0, 20, (_, a) => a < 255)).toBe(0);
  });

  it('a keyline is one pixel around the shape and nowhere else', () => {
    const p = new Pix(4, 4);
    p.px(0xffffff, 1, 1); p.px(0xffffff, 2, 1);
    const k = keyline(p, 0x101010);
    expect([k.w, k.h]).toEqual([6, 6]);
    expect([k.alpha(1, 2), k.alpha(4, 2), k.alpha(2, 1), k.alpha(2, 3), k.alpha(0, 2), k.alpha(1, 1)]).toEqual([255, 255, 255, 255, 0, 0]);
  });
});

describe('Hampi theme: the choices made for it', () => {
  it('glow and haze are at the subtle level, and the halo and light pool are faint', () => {
    expect(HAMPI.glow).toBeLessThanOrEqual(0.5);
    expect(HAMPI.haze).toBeLessThanOrEqual(0.5);
    const h = halo(HAMPI.lamp, 32, 11, HAMPI.glow * 1.1);
    expect(h.alpha(16, 16), 'halo core').toBeLessThan(140);
    expect(h.alpha(16, 16)).toBeGreaterThan(60);
    expect(h.alpha(16, 3), 'halo edge').toBeLessThan(40);
    const pool = lightPool(HAMPI.lamp, 26, HAMPI.glow * 1.6);
    expect(pool.alpha(26, 0)).toBeLessThan(130);
  });

  it('five layers, back to front, each a full 960 x 270 that tiles; the sky is opaque', () => {
    expect(HAMPI.layers.map((l) => l.key)).toEqual(['bg_sky', 'bg_far', 'bg_skyline', 'bg_mid', 'fg_near']);
    const scrolls = HAMPI.layers.map((l) => l.scroll), depths = HAMPI.layers.map((l) => l.depth);
    expect([...scrolls].sort((a, b) => a - b)).toEqual(scrolls);
    expect([...depths].sort((a, b) => a - b)).toEqual(depths);
    expect(count(layers.bg_sky!, 0, LAYER_H, (_, a) => a < 255)).toBe(0);
    // the far ridge joins itself across the seam: the top of the hills at x = 0 and x = 959 are neighbours
    const top = (p: Pix, x: number): number => { let y = 0; while (y < LAYER_H && p.alpha(x, y) < 200) y++; return y; };
    for (const key of ['bg_far', 'bg_skyline']) expect(Math.abs(top(layers[key]!, 0) - top(layers[key]!, LAYER_W - 1)), key).toBeLessThanOrEqual(6);
  });

  it('the sky runs from purple to gold: no teal in the sky or on the far hills', () => {
    expect(count(layers.bg_sky!, 0, LAYER_H, isTeal)).toBe(0);
    expect(count(layers.bg_far!, 0, LAYER_H, (c, a) => a > 0 && isTeal(c))).toBe(0);
    const [r0, g0, b0] = rgb(layers.bg_sky!.rgb(700, 2)), [r1, g1, b1] = rgb(layers.bg_sky!.rgb(700, 205));
    expect(b0, 'deep purple at the top').toBeGreaterThan(r0 + 20);
    expect(b0).toBeGreaterThan(g0 + 20);
    expect([r1 > 230, g1 > 170, b1 < 150], 'gold at the horizon').toEqual([true, true, true]);
  });

  it('teal is the river and the mist on it: on the skyline layer it starts at the far shore, on the near bank it is only mist at the feet', () => {
    const riverY = HAMPI.sun!.glitterY;
    const sky = layers.bg_skyline!;
    expect(count(sky, 0, riverY - 8, (c, a) => a > 0 && isTeal(c)), 'the temple town is not teal').toBe(0);
    expect(count(sky, riverY + 2, riverY + 12, (c) => isTeal(c)), 'the river is').toBeGreaterThan(LAYER_W * 10 * 0.9);
    expect(count(layers.bg_mid!, 0, riverY, (c, a) => a > 0 && isTeal(c)), 'ruins and palms are not').toBe(0);
    expect(count(layers.fg_near!, 0, LAYER_H, (c, a) => a > 0 && isTeal(c))).toBe(0);
    expect(HAMPI.mist.colours.every(isTeal)).toBe(true);
    expect([isTeal(HAMPI.lamp), isTeal(HAMPI.ground.rim[0])]).toEqual([false, false]);
  });

  it('the road is the dirt road: warm earth under a green line, no pale cap, no bricks', () => {
    const k = HAMPI.ground;
    expect(k.soil.every(isWarmEarth), 'soil colours').toBe(true);
    expect([k.soil[1], k.soil[2]]).toEqual([PAL.graniteLight, PAL.graniteDark]);
    expect([k.grass[0], k.grass[1]]).toEqual([PAL.mossLight, PAL.mossDark]);
    // one column: the two top pixels are grass, everything the kit paints below is the lip (warm) or shade
    const calls: Array<{ c: number; a: number; x: number; y: number; w: number; h: number }> = [];
    const rect: Rect = (c, a, x, y, w, h) => { calls.push({ c, a, x, y, w, h }); };
    roadColumn(rect, k, 0, 1234, 100, 270);
    grassLine(rect, k, 0, 1234, 100);
    const at = (y: number): number[] => calls.filter((r) => r.y <= y && y < r.y + r.h).map((r) => r.c);
    expect(at(100).some(isGreen)).toBe(true);
    expect(at(101).every(isGreen)).toBe(true);
    for (const r of calls.filter((q) => q.y >= 102)) expect(isWarmEarth(r.c) || r.c === k.shade || isGreen(r.c), `0x${r.c.toString(16)} at +${r.y - 100}`).toBe(true);
    // no bright cap: nothing opaque and pale is laid along the surface
    for (const r of calls) expect(r.a > 0.8 && rgb(r.c).every((v) => v > 170), 'a pale opaque pixel').toBe(false);
    // no courses: the kit draws no full-depth vertical joints
    expect(calls.filter((r) => r.h > 12 && r.c === k.shade && r.y < 120)).toEqual([]);
  });

  it('road texture stays low: tufts are thin and at most four pixels tall, and two chunks agree at their join', () => {
    const k = HAMPI.ground;
    const run = (x0: number, n: number): string[] => {
      const out: string[] = [];
      roadDetail((c, a, x, y, w, h) => { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out.push(`${x0 + x + i},${y + j},${c},${a}`); }, k, () => 100, x0, x0 + n);
      return out;
    };
    const a = run(0, 960), b = run(960, 960), whole = run(0, 1920);
    const above = whole.map((s) => s.split(',').map(Number)).filter(([, y]) => y! < 100);
    expect(above.length, 'there are tufts').toBeGreaterThan(40);
    expect(Math.min(...above.map(([, y]) => y!)), 'tallest blade').toBeGreaterThanOrEqual(96);
    expect(above.every(([, , c]) => isGreen(c!) || c === k.grass[2])).toBe(true);
    expect([...a, ...b].sort()).toEqual([...whole].sort());
  });

  it('water in the road is dusk water with a bright line on top', () => {
    const calls: Array<[number, number, number]> = [];
    waterColumn((c, a, _x, y) => { calls.push([c, a, y]); }, HAMPI.ground, 0, 0, 226, 270);
    const line = calls.filter(([, a, y]) => y === 226 && a > 0.9).pop()!;
    expect(rgb(line[0]).every((v) => v > 190), 'the line is bright').toBe(true);
    expect(isTeal(HAMPI.ground.water.top)).toBe(true);
    const [r, g, b] = rgb(HAMPI.ground.water.deep);
    expect(b > r && b > g, 'deep water is dusk purple').toBe(true);
  });

  it('nothing grey and lit stands on the near bank (no mound by the road): only dark silhouettes, their rim light and small lamps', () => {
    const mid = layers.bg_mid!;
    const pale = count(mid, 0, 208, (c, a) => { const [r, g, b] = rgb(c); return a > 200 && r > 110 && g > 100 && b > 100; });
    expect(pale, 'pale pixels: at most the two-pixel core of each lamp flame').toBeLessThanOrEqual(HAMPI.lamps.at.length * 2);
  });

  it('a coconut palm: fronds reach out and up from the crown, feathered, not webbed', () => {
    const p = new Pix(120, 110);
    palm(new Pen(p), 0x101010, 60, 108, 70, 0, rng(3));
    const on = (x: number, y: number): boolean => p.alpha(x, y) > 0;
    const cy = 108 - 70;
    let left = 60, right = 60, top = cy, low = cy;
    for (let y = 0; y < 110; y++) for (let x = 0; x < 120; x++) if (on(x, y) && y < 95 && Math.abs(x - 60) > 3) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); low = Math.max(low, y); }
    expect(right - left, 'a wide crown').toBeGreaterThanOrEqual(44);
    expect(cy - top, 'fronds rise above the crown point').toBeGreaterThanOrEqual(8);
    expect(low - cy, 'the lowest tips hang well short of half the trunk').toBeLessThanOrEqual(28);
    // feathered: the crown's box is mostly sky (a webbed wing would fill it)
    let filled = 0;
    for (let y = top; y <= low; y++) for (let x = left; x <= right; x++) if (on(x, y)) filled++;
    expect(filled / ((low - top + 1) * (right - left + 1))).toBeLessThan(0.3);
  });
});
