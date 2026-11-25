// The bike sprites (v1.6), checked as pixels: every bike fits the shared chassis (same texture size, same
// pivot, wheels that touch the ground at the same contact points), and each carries the features that
// make it its own bike. Drawn into a plain pixel grid; no Phaser.
import { describe, expect, it } from 'vitest';
import { BIKE_H, BIKE_TEXTURES, BIKE_W } from '../../src/art/bikeArt';
import { Pen } from '../../src/art/pen';
import { BIKE_ORDER } from '../../src/bike/bikes';
import { BIKE_SPRITES, WHEEL_DX, WHEEL_R } from '../../src/bike/sprites';
import { CONFIG } from '../../src/config';

interface Px { c: number; a: number }

/** Draw a texture into a grid of pixels (the last paint wins; null = transparent). Throws if anything is drawn outside it. */
function render(key: string): Array<Array<Px | null>> {
  const t = BIKE_TEXTURES[key];
  if (!t) throw new Error(`no texture ${key}`);
  const grid: Array<Array<Px | null>> = Array.from({ length: t.h }, () => Array.from({ length: t.w }, () => null));
  let cur: Px = { c: 0, a: 1 };
  t.draw(new Pen({
    fillStyle: (c: number, a = 1) => { cur = { c, a }; },
    fillRect: (x: number, y: number, w: number, h: number) => {
      if (x < 0 || y < 0 || x + w > t.w || y + h > t.h) throw new Error(`${key}: rect ${x},${y} ${w}x${h} is outside ${t.w}x${t.h}`);
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy]![xx] = { ...cur };
    },
  }));
  return grid;
}

const count = (g: Array<Array<Px | null>>, x0: number, y0: number, x1: number, y1: number, test: (p: Px) => boolean): number => {
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const p = g[y]![x]; if (p && test(p)) n++; }
  return n;
};
const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const isGreen = (p: Px): boolean => { const [r, g, b] = rgb(p.c); return g > r + 25 && g > b + 15; };
const isRed = (p: Px): boolean => { const [r, g, b] = rgb(p.c); return r > 130 && r > g + 70 && r > b + 70; };
const isBlue = (p: Px): boolean => { const [r, g, b] = rgb(p.c); return b > r + 40 && b > g + 15; };
const isBright = (p: Px): boolean => { const [r, g, b] = rgb(p.c); return p.a === 1 && r > 200 && g > 195 && b > 170; }; // chrome / silver / cream
const isLamp = (p: Px): boolean => { const [r, g, b] = rgb(p.c); return r > 230 && g > 170 && b < 120; };

describe('bike sprites: one chassis', () => {
  it('every bike uses a 48 x 32 body with the same pivot, and 12 x 12 wheels at the same contact points', () => {
    expect([BIKE_W, BIKE_H, WHEEL_R, WHEEL_DX]).toEqual([48, 32, 6, 13]);
    expect(CONFIG.bikeHitW).toBe(24);
    expect(CONFIG.bikeHitH).toBe(16);
    for (const id of BIKE_ORDER) {
      const sp = BIKE_SPRITES[id];
      expect([sp.w, sp.h, sp.pivotX, sp.pivotY], id).toEqual([48, 32, 24, 26]);
      for (const key of [sp.body, sp.rearWheel, sp.frontWheel, sp.leg]) expect(BIKE_TEXTURES[key], `${id}: ${key}`).toBeDefined();
      expect([BIKE_TEXTURES[sp.body]!.w, BIKE_TEXTURES[sp.body]!.h]).toEqual([48, 32]);
      for (const key of [sp.rearWheel, sp.frontWheel]) {
        expect([BIKE_TEXTURES[key]!.w, BIKE_TEXTURES[key]!.h], key).toEqual([12, 12]);
        const w = render(key);
        // a full 12 px circle: it reaches all four edges, so its lowest pixels are on the ground
        expect(count(w, 0, 11, 11, 11, () => true), `${key} bottom row`).toBeGreaterThanOrEqual(4);
        expect(count(w, 0, 0, 11, 0, () => true), `${key} top row`).toBeGreaterThanOrEqual(4);
        expect(count(w, 0, 0, 0, 11, () => true), `${key} left column`).toBeGreaterThanOrEqual(4);
        expect(count(w, 11, 0, 11, 11, () => true), `${key} right column`).toBeGreaterThanOrEqual(4);
        // and it is a circle, not a square: the corners are empty
        for (const [x, y] of [[0, 0], [11, 0], [0, 11], [11, 11]] as const) expect(w[y]![x], `${key} corner`).toBeNull();
      }
      // the exhaust tip is behind the bike's middle and above the ground
      expect(sp.exhaustX).toBeLessThan(-8);
      expect(sp.exhaustY).toBeLessThan(-4);
      // the planted leg reaches the ground from seat height, near the middle of the bike
      expect(BIKE_TEXTURES[sp.leg]!.h).toBeGreaterThanOrEqual(14);
      expect(Math.abs(sp.legX)).toBeLessThanOrEqual(4);
    }
  });

  it('every texture draws inside its bounds with a known colour, and the body leaves the tyres on the road clear', () => {
    for (const key of Object.keys(BIKE_TEXTURES)) expect(() => render(key), key).not.toThrow();
    for (const id of BIKE_ORDER) {
      const body = render(BIKE_SPRITES[id].body);
      // nothing in the bottom three rows (the body never touches the road), nothing in the top-left corner
      expect(count(body, 0, 29, 47, 31, () => true), `${id}: below the bike`).toBe(0);
      // the rider's head is the highest thing; the bike body is between the wheels' outer edges (give or take a tail and a lamp)
      expect(count(body, 0, 0, 47, 8, () => true), `${id}: rider above the bike`).toBeGreaterThan(20);
      expect(count(body, 44, 0, 47, 31, () => true), `${id}: nothing far ahead of the front tyre`).toBe(0);
      // solid: a real silhouette, not a sketch
      expect(count(body, 0, 0, 47, 31, () => true), `${id}: painted pixels`).toBeGreaterThan(330);
    }
  });
});

describe('bike sprites: each is its own bike', () => {
  const tonup = render('bike_tonup');
  const daybreak = render('bike_daybreak');
  const sundowner = render('bike_sundowner');

  it('Ton-Up: a green cafe racer with a cockpit fairing, a smoked screen and a round headlamp in its nose', () => {
    // the fairing: a green shell ahead of the headstock, standing above the tank line
    expect(count(tonup, 32, 10, 38, 16, isGreen)).toBeGreaterThanOrEqual(30);
    expect(count(tonup, 33, 10, 38, 11, isGreen), 'the fairing rises above the tank top (row 12)').toBeGreaterThanOrEqual(8);
    // the screen: translucent pixels rising off the back of the fairing
    expect(count(tonup, 33, 6, 37, 9, (p) => p.a < 1)).toBeGreaterThanOrEqual(10);
    expect(count(tonup, 0, 0, 47, 31, (p) => p.a < 1), 'the screen is the only glass').toBe(count(tonup, 33, 6, 37, 9, (p) => p.a < 1));
    // the headlamp in the nose of the fairing, with a chrome bezel
    expect(count(tonup, 40, 12, 42, 14, isLamp)).toBeGreaterThanOrEqual(5);
    // a gap between tank and fairing (the headstock), so the fairing reads as its own piece
    expect(count(tonup, 31, 12, 31, 15, isGreen)).toBe(0);
    // long flat tank with a silver stripe; humped seat cowl behind the rider
    expect(count(tonup, 22, 12, 30, 16, isGreen)).toBeGreaterThanOrEqual(15);
    expect(count(tonup, 23, 13, 29, 13, isBright), 'tank stripe').toBeGreaterThanOrEqual(3);
    expect(count(tonup, 8, 12, 14, 15, isGreen), 'seat hump').toBeGreaterThanOrEqual(20);
    // upswept silencer: bright metal climbing to the rear, above the rear axle line (row 26)
    expect(count(tonup, 3, 20, 12, 24, isBright)).toBeGreaterThanOrEqual(14);
    // gold fork legs
    expect(count(tonup, 34, 17, 37, 23, (p) => { const [r, g, b] = rgb(p.c); return r > 140 && g > 100 && b < 70; })).toBeGreaterThanOrEqual(10);
    // the rider is tucked: the helmet is forward of the tank's middle and low
    expect(count(tonup, 27, 3, 32, 8, isBright), 'helmet over the bars').toBeGreaterThanOrEqual(18);
    expect(count(tonup, 0, 0, 47, 2, () => true), 'nothing above row 3').toBe(0);
    // no red or blue bodywork
    expect(count(tonup, 26, 10, 42, 16, isBlue) + count(tonup, 26, 10, 42, 16, isRed)).toBe(0);
  });

  it('Daybreak: a red retro roadster, rider upright: teardrop tank, flat seat, finned single, chrome mudguards, one long low silencer', () => {
    // the tank: a full red teardrop with a highlight and a cream pinstripe, fuller at the front than at the seat
    const isTank = (p: Px): boolean => { const [r, g, b] = rgb(p.c); return r > 90 && r > g + 50 && r > b + 40; }; // red, its highlight and its shadow
    expect(count(daybreak, 21, 10, 32, 16, isTank), 'tank').toBeGreaterThanOrEqual(40);
    expect(count(daybreak, 25, 14, 31, 14, isBright) + count(daybreak, 31, 13, 31, 13, isBright), 'pinstripe').toBeGreaterThanOrEqual(6);
    expect(count(daybreak, 27, 10, 32, 16, isTank), 'front half of the tank').toBeGreaterThan(count(daybreak, 21, 10, 26, 16, isTank));
    expect(count(daybreak, 16, 18, 20, 19, isRed), 'side panel under the seat').toBeGreaterThanOrEqual(8);
    // a long flat seat: two rows of black from the tail to the tank, nothing humped or kicked up behind the rider
    for (const row of [15, 16]) expect(count(daybreak, 7, row, 16, row, (p) => !isRed(p) && !isBright(p)), `seat row ${row}`).toBeGreaterThanOrEqual(9);
    expect(count(daybreak, 0, 0, 16, 14, () => true), 'nothing above the seat behind the rider').toBe(0);
    // upright: the helmet is over the seat, well above the tank, and behind the Ton-Up's
    expect(count(daybreak, 20, 1, 26, 6, () => true)).toBeGreaterThanOrEqual(30);
    expect(count(daybreak, 28, 0, 47, 2, () => true), 'no screen or fairing ahead of the rider').toBe(0);
    expect(count(daybreak, 0, 0, 47, 31, (p) => p.a < 1), 'no glass').toBe(0);
    // an upright single: bright cooling fins with dark gaps between them, in one narrow column under the tank
    for (const row of [18, 20]) expect(count(daybreak, 24, row, 29, row, isBright), `fin on row ${row}`).toBe(6);
    for (const row of [17, 19, 21]) expect(count(daybreak, 24, row, 28, row, isBright), `gap on row ${row}`).toBe(0);
    // chrome mudguards wrapping both tyres
    expect(count(daybreak, 2, 18, 12, 23, isBright), 'rear mudguard').toBeGreaterThanOrEqual(14);
    expect(count(daybreak, 31, 19, 43, 23, isBright), 'front mudguard').toBeGreaterThanOrEqual(14);
    // one long low silencer running back past the rear axle (column 11), not upswept
    expect(count(daybreak, 3, 25, 20, 25, isBright), 'silencer').toBe(18);
    expect(count(daybreak, 3, 24, 10, 25, isBright), 'it ends behind the axle').toBeGreaterThanOrEqual(12);
    // round headlamp with a bright bezel, a round mirror on a stalk
    expect(count(daybreak, 37, 12, 38, 13, isLamp), 'headlamp').toBeGreaterThanOrEqual(3);
    expect(count(daybreak, 35, 11, 36, 14, isBright), 'lamp shell and bezel').toBeGreaterThanOrEqual(6);
    expect(count(daybreak, 32, 3, 35, 5, isBright), 'mirror').toBeGreaterThanOrEqual(8);
    // wire wheels: a chrome rim inside a full tyre, mostly open between the spokes
    const wheel = render('wheel_daybreak');
    expect(count(wheel, 2, 2, 9, 9, isBright), 'rim and hub').toBeGreaterThanOrEqual(20);
    expect(count(wheel, 3, 3, 8, 8, () => true), 'open between the spokes').toBeLessThanOrEqual(22);
    expect(count(daybreak, 0, 0, 47, 31, isGreen) + count(daybreak, 0, 9, 47, 31, isBlue)).toBe(0);
  });

  it('Sundowner: a blue cruiser, long and low, rider leaning back with feet forward, twin long pipes', () => {
    expect(count(sundowner, 21, 10, 32, 17, isBlue), 'teardrop tank').toBeGreaterThanOrEqual(40);
    expect(count(sundowner, 24, 12, 30, 14, isBright), 'cream tank panel').toBeGreaterThanOrEqual(12);
    expect(count(sundowner, 2, 17, 17, 22, isBlue), 'deep rear mudguard').toBeGreaterThanOrEqual(20);
    // twin pipes: two long bright rows running back past the rear axle (column 11)
    for (const row of [24, 26]) expect(count(sundowner, 4, row, 29, row, isBright), `pipe on row ${row}`).toBeGreaterThanOrEqual(22);
    expect(count(sundowner, 2, 26, 10, 26, isBright), 'the pipes end behind the axle').toBeGreaterThanOrEqual(7);
    // big chrome headlamp
    expect(count(sundowner, 32, 10, 38, 14, isBright)).toBeGreaterThanOrEqual(12);
    expect(count(sundowner, 36, 11, 38, 14, isLamp)).toBeGreaterThanOrEqual(5);
    // laid back: the head is behind the hips' front edge and the furthest back of the three riders
    const headLeft = (g: typeof sundowner, top: number): number => {
      for (let x = 0; x < 48; x++) if (count(g, x, top, x, top + 4, () => true) > 0) return x;
      return 48;
    };
    expect(headLeft(sundowner, 1)).toBeLessThan(headLeft(daybreak, 1));
    expect(headLeft(daybreak, 1)).toBeLessThan(headLeft(tonup, 3));
    // feet forward: the boot is ahead of the engine, further forward than either other bike's
    const bootRight = (g: typeof sundowner): number => {
      for (let x = 47; x >= 0; x--) if (count(g, x, 21, x, 23, (p) => p.c === 0x1a1418) > 0) return x;
      return -1;
    };
    expect(bootRight(sundowner)).toBeGreaterThan(bootRight(daybreak) + 5);
    expect(bootRight(daybreak)).toBeGreaterThan(bootRight(tonup) + 2);
    // low seat: the rider seat is lower than the other two (row 17 against 15)
    expect(count(sundowner, 14, 17, 22, 18, (p) => p.c === 0x4a3324 || p.c === 0x6d4b33)).toBeGreaterThanOrEqual(12);
    expect(count(sundowner, 0, 0, 47, 31, isGreen) + count(sundowner, 0, 0, 47, 31, isRed)).toBeLessThanOrEqual(1); // the tail light
  });

  it('no two bikes share a body, and the Sundowner has a fatter rear tyre than its front', () => {
    const key = (g: typeof tonup): string => g.map((row) => row.map((p) => (p ? p.c.toString(16) : '.')).join(',')).join('|');
    expect(new Set([key(tonup), key(daybreak), key(sundowner)]).size).toBe(3);
    const tyre = (k: string): number => count(render(k), 0, 0, 11, 11, (p) => p.c === 0x1c1418);
    expect(tyre('wheel_sundowner_rear')).toBeGreaterThan(tyre('wheel_sundowner_front') + 20);
    expect(tyre('wheel_sundowner_rear')).toBeGreaterThan(tyre('wheel_tonup') + 20);
  });
});
