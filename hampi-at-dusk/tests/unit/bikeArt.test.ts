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
const isPurple = (p: Px): boolean => { const [r, g, b] = rgb(p.c); return b > g + 45 && r > g + 15 && b > r; };
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
      for (const key of [sp.body, sp.standBody, sp.rearWheel, sp.frontWheel, sp.leg]) expect(BIKE_TEXTURES[key], `${id}: ${key}`).toBeDefined();
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
    for (const id of BIKE_ORDER) for (const pose of ['body', 'standBody'] as const) {
      const body = render(BIKE_SPRITES[id][pose]);
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

  it('Sundowner: a purple and black bobber: violet tank, solo saddle, bobbed mudguard, mini-apes, whitewalls, one low black pipe', () => {
    const isBlack = (p: Px): boolean => { const [r, g, b] = rgb(p.c); return r < 115 && g < 110 && b < 125 && Math.abs(r - b) < 20; }; // blacked-out metal and its edge lights
    // the tank: a violet teardrop with a soft highlight, and it is the ONLY purple on the bike
    expect(count(sundowner, 21, 10, 32, 16, isPurple), 'teardrop tank').toBeGreaterThanOrEqual(50);
    expect(count(sundowner, 23, 10, 30, 11, (p) => isPurple(p) && rgb(p.c)[0] > 150), 'highlight on its shoulder').toBeGreaterThanOrEqual(8);
    expect(count(sundowner, 0, 0, 47, 31, isPurple), 'nothing else is purple').toBe(count(sundowner, 21, 10, 32, 16, isPurple));
    expect(count(sundowner, 21, 10, 32, 16, isBright), 'no panel, stripe, badge or lettering on the tank').toBe(0);
    // solo saddle: it ends at column 12, with nothing above or behind it (no pillion pad, no tail unit)
    expect(count(sundowner, 12, 16, 14, 17, isBlack), 'the back of the saddle').toBeGreaterThanOrEqual(5);
    expect(count(sundowner, 0, 0, 11, 17, () => true), 'nothing behind the saddle above the mudguard').toBe(0);
    expect(count(sundowner, 15, 18, 20, 18, () => true), 'it floats on two springs').toBe(2);
    // bobbed black mudguards hugging both tyres (tyre tops are row 20): no chrome, and the rear one stops at the tail lamp
    expect(count(sundowner, 4, 18, 14, 22, isBlack), 'rear mudguard').toBeGreaterThanOrEqual(20);
    expect(count(sundowner, 32, 18, 42, 21, isBlack), 'front mudguard').toBeGreaterThanOrEqual(14);
    expect(count(sundowner, 0, 17, 16, 22, isBright) + count(sundowner, 35, 18, 43, 19, isBright), 'no chrome mudguards').toBe(0);
    expect(count(sundowner, 2, 20, 4, 23, (p) => p.c === 0xe0452f), 'small tail lamp').toBeGreaterThanOrEqual(2);
    expect(count(sundowner, 0, 18, 1, 31, () => true), 'chopped: nothing trails behind the lamp').toBe(0);
    // tall bars: the grip is above the tank top (row 10) and the mirror stands above that
    expect(count(sundowner, 29, 7, 31, 7, () => true), 'grip, three rows above the tank').toBe(3);
    expect(count(sundowner, 30, 2, 33, 4, () => true), 'round mirror').toBeGreaterThanOrEqual(8);
    expect(count(sundowner, 28, 7, 29, 8, (p) => p.c === 0x6b4428 || p.c === 0x8a5a36), 'the brown glove is up at the grip').toBeGreaterThanOrEqual(3);
    // round headlamp in a black cowl
    expect(count(sundowner, 33, 10, 36, 14, isBlack), 'cowl').toBeGreaterThanOrEqual(14);
    expect(count(sundowner, 38, 11, 39, 14, isLamp), 'lamp').toBeGreaterThanOrEqual(5);
    // a tall finned single, blacked out: three fin rows with dark gaps, only a little bright metal
    for (const row of [18, 20]) expect(count(sundowner, 24, row, 29, row, (p) => !isBlack(p)), `fin on row ${row}`).toBeGreaterThanOrEqual(5);
    for (const row of [17, 19, 21]) expect(count(sundowner, 24, row, 29, row, isBlack), `gap on row ${row}`).toBe(6);
    expect(count(sundowner, 21, 15, 30, 25, isBright), 'a few chrome edges, not a chrome engine').toBeLessThanOrEqual(6);
    // one black pipe run low (rows 26-27) to behind the rear axle (column 11), slash-cut: the top row is the longer
    expect(count(sundowner, 3, 26, 30, 26, isBlack), 'pipe').toBeGreaterThanOrEqual(27);
    expect(count(sundowner, 0, 26, 30, 28, isBright), 'no chrome pipe').toBe(0);
    expect(sundowner[26]![2], 'pipe tip').not.toBeNull();
    expect(sundowner[27]![2], 'slash cut').toBeNull();
    expect(sundowner[27]![3], 'slash cut').toBeNull();
    expect([BIKE_SPRITES.sundowner.exhaustX, BIKE_SPRITES.sundowner.exhaustY], 'flame and smoke leave the pipe end').toEqual([2 - 24, 27 - 32]);
    // whitewalls: a full cream ring just inside the tread on both wheels, a black rim inside it; a disc on the front only
    for (const k of ['wheel_sundowner_rear', 'wheel_sundowner_front']) {
      const w = render(k);
      const ring = count(w, 0, 0, 11, 11, (p) => p.c === 0xf3ead7);
      expect(ring, `${k} whitewall`).toBeGreaterThanOrEqual(24);
      expect(count(w, 3, 3, 8, 8, (p) => p.c === 0xf3ead7), `${k}: the stripe is on the sidewall`).toBe(0);
      expect(count(w, 2, 2, 9, 9, isBlack), `${k} black rim`).toBeGreaterThanOrEqual(12);
    }
    expect(count(render('wheel_daybreak'), 0, 0, 11, 11, (p) => p.c === 0xf3ead7) + count(render('wheel_tonup'), 0, 0, 11, 11, (p) => p.c === 0xf3ead7), 'only the bobber has whitewalls').toBe(0);
    expect(count(render('wheel_sundowner_front'), 3, 3, 8, 8, isBright), 'front disc').toBeGreaterThan(count(render('wheel_sundowner_rear'), 3, 3, 8, 8, isBright) + 6);
    // the rider: upright with a slight lean back (the furthest back of the three), feet on mid-set pegs under the knee
    const headLeft = (g: typeof sundowner, top: number): number => {
      for (let x = 0; x < 48; x++) if (count(g, x, top, x, top + 4, () => true) > 0) return x;
      return 48;
    };
    expect(headLeft(sundowner, 1)).toBeLessThan(headLeft(daybreak, 1));
    expect(headLeft(daybreak, 1)).toBeLessThan(headLeft(tonup, 3));
    const bootRight = (g: typeof sundowner): number => {
      for (let x = 47; x >= 0; x--) if (count(g, x, 21, x, 23, (p) => p.c === 0x1a1418) > 0) return x;
      return -1;
    };
    expect(bootRight(sundowner), 'mid-set peg: behind the cylinder (column 24), not out ahead of the engine').toBeLessThanOrEqual(24);
    expect(bootRight(sundowner)).toBeGreaterThan(bootRight(tonup) + 2);
    expect(count(sundowner, 0, 0, 47, 31, isGreen) + count(sundowner, 0, 0, 47, 31, isRed)).toBeLessThanOrEqual(4); // the tail lamp and the amber indicator
  });

  it('no two bikes share a body', () => {
    const key = (g: typeof tonup): string => g.map((row) => row.map((p) => (p ? p.c.toString(16) : '.')).join(',')).join('|');
    expect(new Set([key(tonup), key(daybreak), key(sundowner)]).size).toBe(3);
  });
});

// v1.6.3: every rider wears a helmet in every body texture (the Sundowner's old matte black one read as hair).
describe('bike sprites: every rider is helmeted', () => {
  /** The head of each rider: its columns and rows in the body texture. */
  const HEAD: Record<string, [x0: number, y0: number, x1: number, y1: number]> = {
    tonup: [27, 3, 32, 8], daybreak: [20, 1, 26, 6], sundowner: [14, 1, 20, 6],
  };
  const isDark = (p: Px): boolean => { const [r, g, b] = rgb(p.c); return r < 125 && g < 115 && b < 130; }; // hair, or a black shell lost in the dusk
  const isSkin = (p: Px): boolean => { const [r, g, b] = rgb(p.c); return r > 160 && r > g + 35 && g > b + 25 && b > 90; };

  for (const id of BIKE_ORDER) it(`${id}: a light shell over the crown, in the riding and the foot-down body`, () => {
    const sp = BIKE_SPRITES[id];
    const [x0, y0, x1, y1] = HEAD[id]!;
    for (const key of [sp.body, sp.standBody]) {
      const g = render(key);
      expect(count(g, x0, y0, x1, y0 + 1, () => true), `${key}: crown`).toBeGreaterThanOrEqual(9);
      expect(count(g, x0, y0, x1, y0 + 1, isDark), `${key}: no hair-dark pixel on the crown`).toBe(0);
      expect(count(g, x0, y0, x1, y1, isBright), `${key}: bright shell`).toBeGreaterThanOrEqual(12);
      expect(count(g, x0, y0, x1, y1, isDark), `${key}: the shell outweighs visor, straps and eyes`).toBeLessThan(count(g, x0, y0, x1, y1, isBright));
      expect(count(g, 0, 0, 47, y0 - 1, () => true) - count(g, 28, 0, 47, y0 - 1, () => true), `${key}: nothing above the helmet`).toBe(0);
    }
  });

  it('Sundowner: an open-face helmet with goggles on the brow, unlike the other two', () => {
    const g = render('bike_sundowner');
    const [x0, y0, x1, y1] = HEAD.sundowner!;
    // the head keeps its place and size: columns 14..20, rows 1..6
    expect(count(g, x0, y0, x1, y1, () => true)).toBe(33);
    expect(count(g, 0, 0, 20, 6, () => true), 'and nothing else is up there with it').toBe(33);
    // shell: the crown and down the back of the head, behind the ear
    expect(count(g, 14, 4, 17, 5, (p) => !isSkin(p) && !isDark(p)), 'shell behind the ear').toBeGreaterThanOrEqual(6);
    // open face: skin below the brow at the front, and only on this rider
    expect(count(g, 18, 4, 20, 6, isSkin), 'face').toBeGreaterThanOrEqual(5);
    expect(count(g, x0, y0, x1, y0 + 2, isSkin), 'no bare forehead').toBe(0);
    for (const other of ['tonup', 'daybreak'] as const) {
      const [a, b, c, d] = HEAD[other]!;
      expect(count(render(`bike_${other}`), a, b, c, d, isSkin), `${other}: closed helmet`).toBe(0);
    }
    // goggles at the front of the brow row (glass, chrome frame), their black strap running back round the shell
    expect(isBlue(g[3]![19]!), 'goggle glass').toBe(true);
    expect(isBright(g[3]![20]!), 'goggle frame').toBe(true);
    expect(count(g, 15, 3, 18, 3, isDark), 'strap').toBe(4);
    // chin strap from the shell to under the chin
    expect(isDark(g[5]![17]!) && isDark(g[6]![16]!), 'chin strap').toBe(true);
    // not the Daybreak's helmet: no gold band
    const isGold = (p: Px): boolean => p.c === 0xf4c542;
    expect(count(render('bike_daybreak'), 20, 1, 26, 6, isGold), 'Daybreak band').toBeGreaterThanOrEqual(5);
    expect(count(g, x0, y0, x1, y1, isGold)).toBe(0);
  });
});

// v1.6.2: the planted leg is the rider's near leg. The riding body has it on the peg; the foot-down body
// must not, or the rider has two near legs.
describe('bike sprites: one near leg in every pose', () => {
  const BOOT = 0x1a1418;
  for (const id of BIKE_ORDER) it(`${id}: the foot-down body has no leg on the peg, and the planted leg takes its place`, () => {
    const sp = BIKE_SPRITES[id];
    expect(sp.standBody).not.toBe(sp.body);
    const ride = render(sp.body);
    const stand = render(sp.standBody);
    const leg = render(sp.leg);
    const denim = new Set<number>();
    for (const row of leg) for (const p of row) if (p && p.c !== BOOT) denim.add(p.c);
    const isDenim = (p: Px): boolean => denim.has(p.c);
    expect(denim.size, 'the planted leg wears the same two shades as the riding leg').toBe(2);

    // riding: a thigh, a shin down to the peg and a boot on it
    expect(count(ride, 0, 16, 47, 31, isDenim), 'riding: shin').toBeGreaterThanOrEqual(8);
    expect(count(ride, 0, 18, 47, 31, (p) => p.c === BOOT), 'riding: boot on the peg').toBeGreaterThanOrEqual(5);
    // foot down: no boot on the peg, no shin; all that is left of the leg is a thigh from the hip to the planted leg
    expect(count(stand, 0, 18, 47, 31, (p) => p.c === BOOT), 'foot down: no boot on the peg').toBe(0);
    expect(count(stand, 0, 17, 47, 31, isDenim), 'foot down: no shin on the peg').toBe(0);
    const legTop = BIKE_H - BIKE_TEXTURES[sp.leg]!.h;        // body row where the planted leg starts
    const legL = sp.pivotX + sp.legX - 2, legR = legL + 3;   // body columns it covers
    expect(count(stand, legL, legTop - 2, legR, legTop, isDenim), 'the thigh meets the top of the planted leg').toBeGreaterThanOrEqual(3);
    expect(count(stand, 0, 0, 47, 13, isDenim), 'one thigh, at the hip').toBe(0);

    // nothing but the leg differs between the two bodies: same bike, same torso, arm and helmet
    let diff = 0, other = 0;
    for (let y = 0; y < BIKE_H; y++) for (let x = 0; x < BIKE_W; x++) {
      const a = ride[y]![x], b = stand[y]![x];
      if (a?.c === b?.c && a?.a === b?.a) continue;
      diff++;
      const isLeg = (p: Px | null | undefined): boolean => !!p && (isDenim(p) || p.c === BOOT);
      if (!isLeg(a) && !isLeg(b)) other++;
    }
    expect(diff, 'the peg leg is what changes').toBeGreaterThanOrEqual(15);
    expect(other, 'every changed pixel is leg or boot in one body or the other').toBe(0);
    // the planted leg: one column pair of denim down to a boot on the bottom row
    expect(count(leg, 0, leg.length - 1, 3, leg.length - 1, (p) => p.c === BOOT)).toBe(4);
  });
});
