// The three bikes, drawn in code (v1.6). Each is a tribute to a real kind of motorcycle, in the same
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
// DAYBREAK: a modern naked twin. Angular tank with shrouds, a short sharp tail, upright bars, exposed
// engine and frame, cast wheels, a compact headlamp and a stubby underslung exhaust. Rider upright.
// ---------------------------------------------------------------------------------------------------

const RED = 0xa3231f;
const DAYBREAK: Legend = {
  R: RED, r: mix(RED, PAL.cream, 0.22), d: mix(RED, PAL.ink, 0.45),
  C: CHROME, c: STEEL, E: IRON, K: BLACK, k: FRAME, N: 0x18131a,
  Y: LAMP, W: PAL.cream, T: TAIL,
  J: PAL.brown, j: mix(PAL.brown, PAL.cream, 0.3), q: mix(PAL.brown, PAL.ink, 0.4),
  P: mix(PAL.skyTop, PAL.chrome, 0.38), p: mix(mix(PAL.skyTop, PAL.chrome, 0.38), PAL.ink, 0.35),
  H: PAL.cream, h: mix(PAL.cream, PAL.ink, 0.3), G: PAL.gold,
  B: 0x1a1418,
};

const DAYBREAK_BODY: readonly Seg[] = [
  // frame: main spar from the headstock to the swingarm pivot, subframe, plate hanger
  [13, 32, 'kk'], [14, 31, 'kk'], [15, 30, 'kk'], [16, 29, 'kk'], [17, 27, 'kkk'], [18, 21, 'kk'], [19, 20, 'kk'],
  [20, 20, 'k'], [21, 20, 'k'], [22, 20, 'k'], [23, 20, 'kk'],
  [17, 11, 'kkkkkkkkkkk'], [16, 9, 'kkk'],
  [17, 8, 'kk'], [18, 7, 'k'], [19, 6, 'k'], [20, 5, 'kk'],
  // swingarm
  [23, 17, 'cccc'], [24, 13, 'ccccccccc'], [25, 10, 'ccccccc'], [26, 10, 'cCc'],
  // radiator
  [17, 31, 'N'], [18, 30, 'Nc'], [19, 30, 'Nc'], [20, 30, 'Nc'], [21, 30, 'Nc'], [22, 30, 'N'],
  // engine: compact water-cooled twin
  [18, 23, 'cccccc'], [19, 22, 'EEEEEEEE'], [20, 22, 'EcEEEEcE'], [21, 21, 'EEEEEEEEE'],
  [22, 21, 'EEcccccEE'], [23, 22, 'EcCCCcEE'], [24, 22, 'EcCCCcEE'], [25, 22, 'EEcccEE'],
  // exhaust: header under the engine, stubby silencer by the rear wheel
  [21, 30, 'c'], [22, 29, 'cc'], [23, 30, 'c'], [24, 30, 'c'], [25, 29, 'cc'], [26, 22, 'cccccccc'],
  [24, 16, 'ccccc'], [25, 15, 'CEEEEEE'], [26, 15, 'CEEEEEE'], [27, 16, 'EEEE'],
  // fork (upside-down: dark tube, bright leg) and front mudguard
  [16, 34, 'Ec'], [17, 34, 'Ec'], [18, 34, 'Ec'], [19, 35, 'Ec'], [20, 35, 'Ec'], [21, 35, 'Ec'],
  [22, 36, 'cC'], [23, 36, 'cC'], [24, 36, 'cC'], [25, 36, 'cC'],
  [19, 33, 'RR'], [19, 37, 'RRRR'], [20, 32, 'd'], [20, 41, 'd'],
  // tail: pillion pad, sharp upswept cowl, tail light
  [13, 9, 'KKKKKKK'], [14, 9, 'KKKKKKK'],
  [12, 5, 'rr'], [13, 5, 'RRRR'], [14, 6, 'RRR'], [15, 7, 'RRRRRRRRR'], [16, 10, 'dddddd'], [13, 4, 'T'],
  // rider seat
  [15, 15, 'KKKKKKKK'], [16, 16, 'KKKKKK'],
  // tank: angular, peaked, with a black shroud reaching forward
  [10, 26, 'rrrr'], [11, 24, 'rrRRRRRR'], [12, 22, 'RRrrrrRRRRR'], [13, 22, 'RRRRRRRRRRRR'], [14, 22, 'RRRRRRRRRRRRR'],
  [15, 22, 'dRRRRRRRdRRRR'], [16, 23, 'ddddddRdNNRR'], [17, 28, 'ddNNRd'], [18, 30, 'dd'],
  // headlamp: small and low, in a dark angular housing; instruments above
  [12, 35, 'EEE'], [13, 35, 'EEEYW'], [14, 35, 'NEEYY'], [15, 36, 'NN'],
  [10, 34, 'EE'], [11, 33, 'EEE'],
  // upright bar, grip, mirror
  [9, 32, 'E'], [10, 32, 'E'], [8, 30, 'KKE'], [7, 33, 'E'], [6, 33, 'E'], [5, 33, 'EE'], [4, 33, 'EE'],
  // rider: leg down to the mid-set peg
  [14, 17, 'PPPPPPPP'], [15, 19, 'PPPPPPP'], [16, 23, 'ppP'], [17, 23, 'pP'], [18, 22, 'pP'], [19, 22, 'pP'],
  [20, 22, 'pP'], [21, 22, 'pP'], [22, 21, 'BBBB'], [23, 21, 'BB'],
  // torso, upright
  [7, 20, 'jJJJJJ'], [8, 19, 'jJJJJJJ'], [9, 18, 'jJJJJJJJ'], [10, 18, 'qJJJJJJ'], [11, 17, 'qJJJJJJJ'],
  [12, 17, 'qJJJJJJ'], [13, 17, 'qqJJJJJ'], [14, 17, 'qq'],
  // arm out to the bar, glove
  [8, 24, 'qq'], [9, 24, 'qqqqq'], [10, 26, 'qqqq'], [9, 29, 'q'], [8, 30, 'BB'], [9, 30, 'B'],
  // helmet
  [1, 21, 'HHHHH'], [2, 20, 'GGGGGGG'], [3, 20, 'HHHHHKK'], [4, 20, 'HHHHHKK'], [5, 20, 'hHHHHHH'], [6, 21, 'hhhHH'],
];

/** Cast wheel: dark rim, three broad spokes, a brake disc at the hub. */
const DAYBREAK_WHEEL: readonly string[] = [
  '....KKKK....',
  '..KKKKKKKK..',
  '.KKEEccEEKK.',
  '.KE..cc..EK.',
  'KKE..cc..EKK',
  'KKE.cCCc.EKK',
  'KKEccCCccEKK',
  'KKEc.cc.cEKK',
  '.KEc....cEK.',
  '.KKEE..EEKK.',
  '..KKKKKKKK..',
  '....KKKK....',
];

// ---------------------------------------------------------------------------------------------------
// SUNDOWNER: a long, low cruiser. Big teardrop tank, a large round chrome headlamp, wide pulled-back
// bars, feet forward, a stepped two-tier seat, a chunky fork, a fat rear tyre under a deep mudguard,
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
  // rider: leg stretched out to the forward peg
  [15, 16, 'PPPPPPPP'], [16, 18, 'PPPPPPPPP'], [17, 25, 'pPP'], [18, 26, 'pPP'], [19, 27, 'pPP'], [20, 27, 'pPP'],
  [21, 28, 'pP'], [22, 28, 'BBBBB'], [23, 28, 'BBB'],
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
