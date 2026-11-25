// The three bikes, drawn in code (v1.6; the Daybreak redrawn as a retro roadster in v1.6.1). Each is a tribute to a real kind of motorcycle, in the same
// pixel scale as the rest of the game (wheels 12 px across). No logos, badges or lettering anywhere.
//
// A body texture is 48 x 32: its bottom edge is the ground, the wheel centres are at (11, 26) and
// (37, 26), and the pixel (24, 26) is the pivot the body leans and bobs about (sprites.ts). The wheels
// are separate 12 x 12 textures so they can turn. Bike colours may leave the stage palette (GAME_SPEC 6.1);
// nothing else in the game does.
//
// The art is written as layers of segments, [row, column, pixels]: one character per pixel, looked up
// in the bike's legend. Later segments paint over earlier ones (frame, engine, bodywork, rider).

import { PAL, mix } from './palette';
import type { Pen } from './pen';

export const BIKE_W = 48;
export const BIKE_H = 32;

type Seg = readonly [row: number, col: number, pixels: string];
/** colour, or [colour, alpha] */
type Legend = Record<string, number | readonly [number, number]>;

function paint(p: Pen, legend: Legend, segs: readonly Seg[]): void {
  for (const [row, col, pixels] of segs) {
    // run-length: one rectangle per run of the same character
    let i = 0;
    while (i < pixels.length) {
      const ch = pixels[i]!;
      let j = i + 1;
      while (j < pixels.length && pixels[j] === ch) j++;
      if (ch !== '.') {
        const entry = legend[ch];
        if (entry === undefined) throw new Error(`bikeArt: no colour for '${ch}'`);
        if (typeof entry === 'number') p.r(entry, col + i, row, j - i, 1);
        else p.r(entry[0], col + i, row, j - i, 1, entry[1]);
      }
      i = j;
    }
  }
}

/** Rows of a whole small texture (wheels, legs): row i starts at column 0. */
const grid = (rows: readonly string[]): Seg[] => rows.map((pixels, row) => [row, 0, pixels] as const);

// Shared metals and rubber.
const CHROME = PAL.chrome;
const STEEL = mix(PAL.chrome, PAL.ink, 0.45);
const IRON = mix(PAL.chrome, PAL.ink, 0.7);
const BLACK = PAL.tyre;
const FRAME = 0x3a3341;
const LAMP = PAL.gold;
const TAIL = 0xe0452f;

// ---------------------------------------------------------------------------------------------------
// TON-UP: a cafe racer. Cockpit fairing with a short smoked screen around a round headlamp, long flat
// tank with knee recesses, a single seat with a humped cowl, low clip-ons, upswept megaphone silencers,
// wire wheels, gold forks, and the rider tucked in behind the screen.
// ---------------------------------------------------------------------------------------------------

const GREEN = 0x1f6a45;
const TONUP: Legend = {
  G: GREEN, g: mix(GREEN, PAL.cream, 0.35), d: mix(GREEN, PAL.ink, 0.45),
  S: 0xe4e1d6,                       // silver stripe
  C: CHROME, c: STEEL, E: IRON, K: BLACK, k: FRAME,
  O: 0xd9a531, o: 0x9a6f22,          // gold fork legs and shock springs
  Y: LAMP, W: PAL.cream, R: TAIL,
  V: [0x9db4d6, 0.5], v: [0xe6eefb, 0.95],  // smoked screen and its bright edge
  J: 0x2b2a35, j: 0x4d4b5c,          // black leather
  P: 0x3a4262, p: 0x2a3049,          // dark denim
  H: 0xe9e6dc, h: 0xaaa69c,          // silver-white helmet
  B: 0x1a1418,
};

const TONUP_BODY: readonly Seg[] = [
  // frame: downtube, lower rail, seat rail, tail bracket
  [16, 33, 'k'], [17, 32, 'kk'], [18, 32, 'k'], [19, 31, 'kk'], [20, 31, 'k'], [21, 31, 'k'], [22, 30, 'kk'],
  [23, 30, 'k'], [24, 30, 'k'], [25, 29, 'kk'],
  [17, 11, 'kkkkkkkkkk'],
  // swingarm
  [24, 16, 'ccccc'], [25, 11, 'ccccccc'], [26, 10, 'cCc'],
  // rear shock (gold spring)
  [18, 15, 'O'], [19, 14, 'Oo'], [20, 14, 'O'], [21, 13, 'Oo'], [22, 13, 'O'], [23, 12, 'Oo'], [24, 12, 'O'],
  // engine: finned twin, polished covers, throttle bodies
  [17, 22, 'cCCcCCc'],
  [18, 21, 'kkkkkkkkk'], [19, 21, 'EEEEEEEEE'], [20, 21, 'kkkkkkkkk'], [21, 21, 'EEEEEEEEE'],
  [22, 20, 'ccEcCCcEcc'], [23, 20, 'cEcCCCCcEc'], [24, 20, 'cEcCCCCcEc'], [25, 21, 'EEcCCcEE'],
  [18, 19, 'CC'], [19, 19, 'Cc'],
  // side panel
  [18, 15, 'kdd'], [19, 16, 'dd'],
  // exhaust: header, pipe under the engine, upswept megaphone (and the far one peeking above it)
  [18, 29, 'CC'], [19, 30, 'C'], [20, 30, 'C'], [21, 30, 'C'], [22, 29, 'cC'], [23, 29, 'cC'], [24, 29, 'cC'], [25, 29, 'C'],
  [26, 16, 'CCCCCCCCCCCCCC'],
  [25, 12, 'ccccCCC'], [24, 8, 'ccccCCCC'], [23, 4, 'ccccCCCCC'], [22, 4, 'CCCCCC'], [21, 4, 'CCC'],
  [20, 5, 'ccc'],
  [21, 3, 'K'], [22, 3, 'K'], [23, 3, 'K'],
  // fork (gold) and front mudguard
  [17, 34, 'Oo'], [18, 34, 'Oo'], [19, 35, 'Oo'], [20, 35, 'Oo'], [21, 35, 'Oo'], [22, 36, 'Oo'], [23, 36, 'Oo'],
  [24, 36, 'cC'], [25, 36, 'cC'],
  [19, 33, 'GG'], [19, 37, 'GGGG'], [20, 32, 'd'], [20, 41, 'd'],
  // seat and its humped cowl, tail light
  [15, 15, 'KKKKKKK'], [16, 15, 'KKKKKKK'],
  [12, 11, 'ggg'], [13, 9, 'gGGGGG'], [14, 8, 'GGGGGGG'], [15, 8, 'GGGGGGG'], [16, 9, 'dddddd'], [14, 7, 'R'], [15, 7, 'R'],
  // tank: long and flat, silver stripe, knee recess
  [12, 23, 'gggggggg'], [13, 22, 'GSSSSSSSG'], [14, 22, 'GGGGGGGGG'], [15, 22, 'ddddGGGGG'], [16, 24, 'ddddddd'],
  // headstock and clip-on, in the gap between tank and fairing
  [12, 31, 'k'], [13, 31, 'k'], [14, 31, 'k'], [15, 31, 'k'], [13, 30, 'K'],
  // cockpit fairing: a rounded shell standing proud of the tank, round headlamp in its nose
  [10, 34, 'gggg'], [11, 33, 'gGGGGG'], [12, 32, 'GGGGGGG'], [13, 32, 'GGGGGGG'], [14, 32, 'GGGGGGG'], [15, 33, 'dGGGGd'], [16, 34, 'dddd'],
  [11, 39, 'C'], [12, 39, 'CYY'], [13, 39, 'CYWY'], [14, 39, 'CYY'], [15, 39, 'C'],
  // ... and its short smoked screen
  [6, 33, 'v'], [7, 33, 'Vv'], [8, 33, 'VVv'], [9, 33, 'VVVVv'],
  // rider: leg tucked back to the rearset
  [14, 16, 'PPPPPPP'], [15, 18, 'PPPPPPP'], [16, 22, 'ppp'], [17, 21, 'PPp'], [18, 21, 'Pp'], [19, 20, 'Pp'], [20, 19, 'Pp'],
  [21, 17, 'BBBB'], [22, 17, 'BB'],
  // torso, low over the tank
  [8, 23, 'jjjjj'], [9, 20, 'jjjJJJJJJ'], [10, 18, 'jjJJJJJJJJ'], [11, 16, 'jjJJJJJJJJ'], [12, 15, 'jJJJJJJJ'],
  [13, 15, 'JJJJJJ'], [14, 15, 'J'],
  // arm down to the clip-on, glove
  [10, 26, 'jjj'], [11, 27, 'jJJ'], [12, 28, 'JJJ'], [13, 30, 'BB'], [12, 31, 'B'],
  // helmet, tucked behind the screen
  [3, 28, 'HHHH'], [4, 27, 'HHHHHH'], [5, 27, 'HHHHKK'], [6, 27, 'hHHHKK'], [7, 27, 'hhHHHH'], [8, 28, 'hhhh'],
];

/** Wire wheel: slim tyre, bright rim, thin spokes. */
const TONUP_WHEEL: readonly string[] = [
  '....KKKK....',
  '..KKccccKK..',
  '.KKc.C..cKK.',
  '.Kc..C...cK.',
  'KKc..c..C.KK',
  'KcCc.cc.c.cK',
  'Kc.c.cc.cCcK',
  'KK.C..c..cKK',
  '.Kc...C..cK.',
  '.KKc..C.cKK.',
  '..KKccccKK..',
  '....KKKK....',
];

// ---------------------------------------------------------------------------------------------------
// DAYBREAK: a retro roadster (v1.6.1). A rounded teardrop tank in deep metallic red, a long flat ribbed
// seat, an upright air-cooled single with cooling fins, deep chrome mudguards front and rear, one long
// low chrome silencer, a round chrome headlamp, twin clocks, a wide upright bar with a round mirror,
// twin rear shocks and wire-spoke wheels. No fairing, no screen. Rider bolt upright.
// ---------------------------------------------------------------------------------------------------

const RED = 0xa81c24;
const DAYBREAK: Legend = {
  R: RED, r: mix(RED, PAL.cream, 0.3), w: mix(RED, PAL.cream, 0.62), d: mix(RED, PAL.ink, 0.45),
  S: 0xf0e2bf,                       // cream pinstripe
  C: CHROME, c: STEEL, E: IRON, K: BLACK, k: FRAME, L: 0xf6f3ea,
  n: 0x5e5666,                       // seat ribs
  Y: LAMP, W: PAL.cream, T: TAIL,
  J: PAL.brown, j: mix(PAL.brown, PAL.cream, 0.3), q: mix(PAL.brown, PAL.ink, 0.4),
  P: mix(PAL.skyTop, PAL.chrome, 0.38), p: mix(mix(PAL.skyTop, PAL.chrome, 0.38), PAL.ink, 0.35),
  H: PAL.cream, h: mix(PAL.cream, PAL.ink, 0.3), G: PAL.gold,
  B: 0x1a1418,
};

const DAYBREAK_BODY: readonly Seg[] = [
  // frame: single downtube from the headstock, rail under the seat
  [13, 32, 'k'], [14, 32, 'k'], [15, 32, 'k'], [16, 32, 'k'], [17, 32, 'k'], [18, 31, 'kk'], [19, 31, 'k'], [20, 31, 'k'],
  [21, 31, 'k'], [22, 31, 'k'], [23, 31, 'k'], [24, 30, 'kk'],
  [17, 9, 'kkkkkkkkkkkkk'],
  // swingarm
  [24, 15, 'ccccc'], [25, 10, 'ccccccc'], [26, 10, 'cCc'],
  // deep chrome rear mudguard, tail light on its end
  [18, 6, 'CLLLLLL'], [19, 4, 'CCCccccc'], [20, 3, 'CC'], [21, 2, 'Cc'], [22, 2, 'Cc'], [23, 2, 'c'],
  [18, 4, 'TT'],
  // twin rear shocks (chrome spring over a dark body)
  [17, 14, 'Cc'], [18, 14, 'CE'], [19, 13, 'CE'], [20, 13, 'CE'], [21, 12, 'CE'], [22, 12, 'CE'], [23, 11, 'Cc'],
  // side panel under the seat
  [18, 16, 'rRRRR'], [19, 16, 'RRRRR'], [20, 17, 'dddd'],
  // engine: an upright single. Rocker cover, five rows of cooling fins, a round polished case cover
  [16, 24, 'cCCCCc'],
  [17, 24, 'EEEEE'], [18, 24, 'CCCCCC'], [19, 25, 'EEEE'], [20, 24, 'CCCCCC'], [21, 25, 'EEEE'],
  [22, 22, 'ccccccc'], [23, 21, 'ccCCCCCcc'], [24, 21, 'ccCLLCCcc'], [25, 22, 'cCCCCCc'],
  // exhaust: header down the front of the cylinder, under the engine, one long low silencer
  [17, 29, 'CC'], [18, 30, 'C'], [19, 30, 'C'], [20, 30, 'C'], [21, 30, 'C'], [22, 30, 'C'], [23, 30, 'C'], [24, 30, 'C'],
  [25, 29, 'CC'], [26, 20, 'cCCCCCCCCC'],
  [24, 6, 'LLLLLLLLLLLLLL'], [25, 3, 'CCCCCCCCCCCCCCCCCC'], [26, 5, 'ccccccccccccccc'], [25, 2, 'K'],
  // deep chrome front mudguard
  [19, 34, 'LLLLLL'], [20, 32, 'CCC'], [20, 39, 'CCC'], [21, 31, 'cC'], [21, 41, 'CC'], [22, 42, 'Cc'], [23, 43, 'c'],
  // fork: shrouded top, bright stanchion, lower leg
  [15, 34, 'EE'], [16, 34, 'EE'], [17, 34, 'EE'], [18, 35, 'cC'], [19, 35, 'cC'], [20, 35, 'cC'], [21, 35, 'cC'],
  [22, 36, 'cC'], [23, 36, 'cC'], [24, 36, 'cC'], [25, 36, 'cC'],
  // long flat seat, the ribs catching the light along its top
  [15, 7, 'nnKnnKnnKnnKnnKn'], [16, 8, 'KKKKKKKKKKKKKKK'],
  // teardrop tank: full and round at the front, tapering to the seat; highlight, cream pinstripe
  [10, 25, 'rrrrrr'], [11, 23, 'rrwwwrRRR'], [12, 22, 'rRRRRRRRRR'], [13, 21, 'RRRRRRRRRRSR'], [14, 21, 'RRRRSSSSSSRR'],
  [15, 24, 'RRRRRRRR'], [16, 26, 'ddddd'],
  // round headlamp, chrome shell and bezel; twin clocks above it
  [11, 35, 'cCL'], [12, 34, 'cCLYY'], [13, 34, 'cCLWY'], [14, 35, 'cCL'],
  [9, 34, 'LC'], [10, 34, 'EE'],
  // wide upright bar, grip, round mirror on a stalk
  [11, 33, 'c'], [10, 32, 'C'], [9, 32, 'C'], [8, 30, 'KKC'],
  [7, 33, 'c'], [6, 33, 'c'], [5, 33, 'CC'], [4, 32, 'CLLC'], [3, 33, 'CC'],
  // rider: leg down to the mid-set peg
  [14, 17, 'PPPPPPPP'], [15, 19, 'PPPPPP'], [16, 22, 'pP'], [17, 22, 'pP'], [18, 22, 'pP'], [19, 21, 'pP'],
  [20, 21, 'pP'], [21, 21, 'pP'], [22, 20, 'BBBB'], [23, 20, 'BB'],
  // torso, upright
  [7, 20, 'jJJJJJ'], [8, 19, 'jJJJJJJ'], [9, 18, 'jJJJJJJJ'], [10, 18, 'qJJJJJJ'], [11, 17, 'qJJJJJJJ'],
  [12, 17, 'qJJJJJJ'], [13, 17, 'qqJJJJJ'], [14, 17, 'qq'],
  // arm out to the bar, glove
  [8, 24, 'qqqqqq'], [9, 25, 'qqqq'], [8, 30, 'BB'], [7, 30, 'B'],
  // helmet
  [1, 21, 'HHHHH'], [2, 20, 'GGGGGGG'], [3, 20, 'HHHHHKK'], [4, 20, 'HHHHHKK'], [5, 20, 'hHHHHHH'], [6, 21, 'hhhHH'],
];

/** Wire-spoke wheel: a full tyre, a bright chrome rim, laced spokes. */
const DAYBREAK_WHEEL: readonly string[] = [
  '....KKKK....',
  '..KKKKKKKK..',
  '.KKcCCCCcKK.',
  '.KKC.c..CKK.',
  'KKC.c..c.CKK',
  'KKCc.CC..CKK',
  'KKC..CC.cCKK',
  'KKC.c..c.CKK',
  '.KKC..c.CKK.',
  '.KKcCCCCcKK.',
  '..KKKKKKKK..',
  '....KKKK....',
];

// ---------------------------------------------------------------------------------------------------
// SUNDOWNER: a long, low cruiser. Big teardrop tank, a large round chrome headlamp, wide pulled-back
// bars, feet forward (pegs just ahead of the engine, knees bent), a stepped two-tier seat, a chunky fork, a fat rear tyre under a deep mudguard,
// twin long chrome pipes. Rider laid back.
// ---------------------------------------------------------------------------------------------------

const BLUE = 0x3f7fc0;
const SUNDOWNER: Legend = {
  U: BLUE, u: mix(BLUE, PAL.cream, 0.4), d: mix(BLUE, PAL.ink, 0.45),
  M: 0xf0e2bf,                       // cream tank panel
  C: CHROME, c: STEEL, E: IRON, K: BLACK, k: FRAME, L: 0xf6f3ea,
  Y: LAMP, W: PAL.cream, T: TAIL,
  S: 0x4a3324, s: 0x6d4b33,          // brown leather seat
  J: 0xb98a4e, j: 0xd8ad6c, q: 0x8a6335, // tan jacket
  P: 0x44557c, p: 0x303d5c,          // blue jeans
  H: 0x26222b, h: 0x4a4553,          // open-face helmet
  F: 0xd9a37a, f: 0xa9744f,          // face
  B: 0x1a1418,
};

const SUNDOWNER_BODY: readonly Seg[] = [
  // frame: downtube and cradle, rail under the seat
  [15, 31, 'k'], [16, 31, 'k'], [17, 31, 'k'], [18, 31, 'k'], [19, 30, 'kk'], [20, 30, 'k'], [21, 30, 'k'], [22, 30, 'k'],
  [23, 30, 'k'], [24, 29, 'kk'], [19, 12, 'kkkkkkkkk'],
  // swingarm
  [24, 15, 'cccccc'], [25, 10, 'ccccccc'], [26, 10, 'cCc'],
  // twin rear shocks (chrome spring over a dark body)
  [19, 15, 'Cc'], [20, 14, 'Cc'], [21, 14, 'Cc'], [22, 13, 'Cc'], [23, 13, 'Cc'], [24, 12, 'Cc'],
  // engine: big air-cooled twin, polished fins and cases
  [17, 23, 'CCcCCc'],
  [18, 22, 'cCCCCCCc'], [19, 22, 'EEEEEEEE'], [20, 22, 'cCCCCCCc'], [21, 22, 'EEEEEEEE'],
  [22, 21, 'cCCCCCCCCc'], [23, 21, 'CCcLLLLcCC'], [24, 21, 'CCcLCCLcCC'], [25, 21, 'cCcLLLLcCc'], [26, 22, 'ccCCCCcc'],
  // side cover under the seat
  [19, 17, 'UUUU'], [20, 17, 'UuUU'], [21, 18, 'ddd'],
  // exhaust: headers sweeping down, twin long pipes all the way back past the rear axle
  [19, 30, 'C'], [20, 30, 'CC'], [21, 31, 'C'], [22, 31, 'C'], [23, 30, 'CC'],
  [24, 4, 'CCCCCCCCCCCCCCCCCCCCCCCCCCC'], [25, 4, 'EEEEEEEEEEEEEEEEEEEEEEEEEE'], [26, 2, 'CCCCCCCCCCCCCCCCCCCCCCCCCCCC'],
  [24, 3, 'K'], [26, 1, 'K'],
  // fork: chunky, raked out (dark upper tubes, polished legs) and a full front mudguard
  [15, 32, 'EEc'], [16, 32, 'EEc'], [17, 33, 'EEc'], [18, 33, 'EEc'], [19, 34, 'EEc'], [20, 34, 'EEc'],
  [21, 35, 'cCC'], [22, 35, 'cCC'], [23, 35, 'cCC'], [24, 36, 'cC'], [25, 36, 'cC'],
  [18, 36, 'uuuu'], [19, 37, 'UUUUU'], [20, 31, 'UU'], [19, 32, 'UU'], [20, 41, 'UU'], [21, 42, 'd'], [21, 31, 'd'],
  // deep rear mudguard, tail light
  [17, 7, 'uuuuuuuuu'], [18, 5, 'UUUUUUUUUUUUU'], [19, 3, 'UUUU'], [19, 15, 'UU'], [20, 2, 'UUU'], [21, 2, 'Ud'], [22, 2, 'd'],
  [19, 2, 'T'],
  // stepped seat: low rider seat, raised pillion pad
  [15, 8, 'sssssss'], [16, 8, 'SSSSSSS'], [17, 8, 'SSSSSS'],
  [16, 15, 's'], [17, 14, 'sSsssssss'], [18, 14, 'SSSSSSSSS'],
  // teardrop tank with a cream panel, filler cap
  [10, 25, 'uuuuuu'], [11, 23, 'uuUUUUUUU'], [12, 22, 'UUUMMMMMUUU'], [13, 21, 'UUUMMMMMMMUU'], [14, 21, 'UUUUMMMMMUUU'],
  [15, 21, 'UUUUUUUUUUU'], [16, 22, 'dddddddd'], [17, 23, 'dd'],
  [9, 28, 'CC'],
  // big round headlamp in a chrome shell, speedo on top
  [10, 33, 'CCC'], [11, 32, 'CCCCYY'], [12, 32, 'CCCLYWY'], [13, 32, 'cCCCYWY'], [14, 32, 'cCCCYY'], [15, 35, 'cc'],
  [9, 32, 'Kc'],
  // wide pulled-back bar, grip, mirror
  [10, 31, 'C'], [9, 27, 'CCCCC'], [8, 29, 'c'], [7, 29, 'c'], [6, 28, 'CC'], [5, 28, 'CC'],
  // rider: knee bent, shin down to the forward peg just ahead of the engine
  [15, 16, 'PPPPPPPP'], [16, 18, 'PPPPPPPP'], [17, 24, 'pPP'], [18, 24, 'pPP'], [19, 25, 'pPP'], [20, 25, 'pPP'],
  [21, 26, 'pP'], [22, 26, 'BBBBB'], [23, 26, 'BBB'],
  // torso, leaning back
  [7, 15, 'jjjjj'], [8, 14, 'qJJJJJJ'], [9, 14, 'qJJJJJJ'], [10, 14, 'qJJJJJJ'], [11, 14, 'qJJJJJJ'], [12, 15, 'qJJJJJ'],
  [13, 15, 'qJJJJJJ'], [14, 15, 'qqJJJJJ'], [15, 16, 'q'],
  // arm reaching out to the grip, glove
  [8, 20, 'jj'], [9, 20, 'JJJJJ'], [10, 21, 'qqqqq'], [9, 25, 'BB'], [10, 26, 'B'],
  // open-face helmet, glasses, a bit of beard
  [1, 15, 'hhhh'], [2, 14, 'hHHHHH'], [3, 14, 'HHHHHHH'], [4, 14, 'HHHFKKF'], [5, 14, 'HHFFFF'], [6, 16, 'fFF'],
];

/** Rear: a fat tyre on a small polished wheel. */
const SUNDOWNER_REAR: readonly string[] = [
  '....KKKK....',
  '..KKKKKKKK..',
  '.KKKKKKKKKK.',
  '.KKKccccKKK.',
  'KKKcC..CcKKK',
  'KKKc.CC.cKKK',
  'KKKc.CC.cKKK',
  'KKKcC..CcKKK',
  '.KKKccccKKK.',
  '.KKKKKKKKKK.',
  '..KKKKKKKK..',
  '....KKKK....',
];

/** Front: taller-looking and slimmer, bright rim, broad polished spokes. */
const SUNDOWNER_FRONT: readonly string[] = [
  '....KKKK....',
  '..KKccccKK..',
  '.KKc.CC.cKK.',
  '.Kc..CC..cK.',
  'KKc..CC..cKK',
  'KcCCCccCCCcK',
  'KcCCCccCCCcK',
  'KKc..CC..cKK',
  '.Kc..CC..cK.',
  '.KKc.CC.cKK.',
  '..KKccccKK..',
  '....KKKK....',
];

// ---------------------------------------------------------------------------------------------------
// The planted leg (shown at a standstill and while backing up): 4 px wide, the boot on the ground.
// ---------------------------------------------------------------------------------------------------

function legRows(length: number): string[] {
  const rows: string[] = [];
  for (let i = 0; i < length - 3; i++) rows.push('.pP.');
  rows.push('.BBB', 'BBBB', 'BBBB');
  return rows;
}

export interface BikeTexture { w: number; h: number; draw: (p: Pen) => void }

const tex = (w: number, h: number, legend: Legend, segs: readonly Seg[]): BikeTexture =>
  ({ w, h, draw: (p) => paint(p, legend, segs) });

/** Every bike texture, by key (sprites.ts says which bike uses which). */
export const BIKE_TEXTURES: Readonly<Record<string, BikeTexture>> = {
  bike_tonup: tex(BIKE_W, BIKE_H, TONUP, TONUP_BODY),
  bike_daybreak: tex(BIKE_W, BIKE_H, DAYBREAK, DAYBREAK_BODY),
  bike_sundowner: tex(BIKE_W, BIKE_H, SUNDOWNER, SUNDOWNER_BODY),
  wheel_tonup: tex(12, 12, TONUP, grid(TONUP_WHEEL)),
  wheel_daybreak: tex(12, 12, DAYBREAK, grid(DAYBREAK_WHEEL)),
  wheel_sundowner_rear: tex(12, 12, SUNDOWNER, grid(SUNDOWNER_REAR)),
  wheel_sundowner_front: tex(12, 12, SUNDOWNER, grid(SUNDOWNER_FRONT)),
  leg_tonup: tex(4, 17, TONUP, grid(legRows(17))),
  leg_daybreak: tex(4, 17, DAYBREAK, grid(legRows(17))),
  leg_sundowner: tex(4, 15, SUNDOWNER, grid(legRows(15))),
};
