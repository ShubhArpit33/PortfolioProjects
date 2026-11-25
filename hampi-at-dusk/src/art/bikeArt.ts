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
];

/** Riding: the near leg tucked back to the rearset. */
const TONUP_LEG: readonly Seg[] = [
  [14, 16, 'PPPPPPP'], [15, 18, 'PPPPPPP'], [16, 22, 'ppp'], [17, 21, 'PPp'], [18, 21, 'Pp'], [19, 20, 'Pp'], [20, 19, 'Pp'],
  [21, 17, 'BBBB'], [22, 17, 'BB'],
];

/** Foot down: the same leg off the peg, the thigh reaching the planted leg (leg_tonup, columns 19..22 from row 15). */
const TONUP_THIGH: readonly Seg[] = [
  [14, 16, 'PPPPPP'], [15, 18, 'pPPP'],
];

const TONUP_RIDER: readonly Seg[] = [
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
];

/** Riding: the near leg down to the mid-set peg. */
const DAYBREAK_LEG: readonly Seg[] = [
  [14, 17, 'PPPPPPPP'], [15, 19, 'PPPPPP'], [16, 22, 'pP'], [17, 22, 'pP'], [18, 22, 'pP'], [19, 21, 'pP'],
  [20, 21, 'pP'], [21, 21, 'pP'], [22, 20, 'BBBB'], [23, 20, 'BB'],
];

/** Foot down: the thigh reaching the planted leg (leg_daybreak, columns 21..24 from row 15). */
const DAYBREAK_THIGH: readonly Seg[] = [
  [14, 17, 'PPPPPPP'], [15, 19, 'PpPPP'],
];

const DAYBREAK_RIDER: readonly Seg[] = [
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
// SUNDOWNER: a bobber (v1.6.2), purple and black. A deep metallic violet teardrop tank and everything
// else blacked out: a single sprung solo saddle floating over the frame (no pillion), a short bobbed rear
// mudguard hugging the tyre with a small round tail lamp and a side-mounted plate stub, tall mini-ape
// bars with a round mirror, a round headlamp in a black cowl, gaitered forks, whitewall tyres on black
// wire wheels (a disc on the front), a long-stroke finned single, twin shocks and a black slash-cut
// pipe run low to behind the rear axle. Mid-set pegs; the rider sits upright, arms raised to the bars, in a
// cream open-face helmet with goggles on the brow (v1.6.3).
// ---------------------------------------------------------------------------------------------------

const PURPLE = 0x7436b8;
const SUNDOWNER: Legend = {
  U: PURPLE, u: mix(PURPLE, PAL.cream, 0.32), w: mix(PURPLE, PAL.cream, 0.68), d: mix(PURPLE, PAL.ink, 0.5),
  N: 0x2b2731, n: 0x4f4a5a, e: 0x6a6476, // blacked-out metal, its edge light, its brightest edge
  C: CHROME, c: STEEL, E: IRON, K: BLACK, k: FRAME, L: 0xf6f3ea,
  Y: LAMP, W: PAL.cream, T: TAIL, A: 0xe8912a,
  J: 0xb98a4e, j: 0xd8ad6c, q: 0x8a6335, // tan jacket
  P: 0x44557c, p: 0x303d5c,          // blue jeans
  H: PAL.cream, h: mix(PAL.cream, PAL.ink, 0.28), // open-face (3/4) helmet: cream shell, its shaded back edge
  S: 0x2b2731,                       // the goggle strap round the shell (the helmet's one black stripe) and the chin strap
  G: 0x7fa6d8, g: CHROME,            // goggles pushed up on the brow: glass, chrome frame
  F: 0xd9a37a, f: 0xa9744f,          // face
  B: 0x1a1418,
  O: 0x6b4428, o: 0x8a5a36,          // brown leather glove (v1.6.4: a black glove vanished against the dark bars)
};

const SUNDOWNER_BODY: readonly Seg[] = [
  // frame: downtube from the headstock, rail under the saddle, the rigid-looking rear triangle
  [14, 32, 'k'], [15, 32, 'k'], [16, 32, 'k'], [17, 32, 'k'], [18, 31, 'kk'], [19, 31, 'k'], [20, 31, 'k'], [21, 31, 'k'],
  [22, 31, 'k'], [23, 31, 'k'], [24, 30, 'kk'],
  [19, 13, 'kkkkkkkkkkk'],
  [24, 16, 'nnnnn'], [25, 12, 'nnnnn'],
  // twin rear shocks (black springs, a chrome collar)
  [20, 14, 'en'], [21, 14, 'Nc'], [22, 13, 'en'], [23, 13, 'Nc'], [24, 12, 'en'],
  // short bobbed rear mudguard hugging the tyre; small round tail lamp, plate stub and indicator on its end
  [18, 8, 'nnnnnn'], [19, 6, 'nNNNNNNNN'], [20, 5, 'nNNN'], [20, 13, 'NN'], [21, 4, 'nNN'], [22, 4, 'NN'],
  [21, 3, 'TT'], [22, 3, 'T'], [23, 3, 'NN'], [24, 3, 'An'],
  // battery box / side panel under the saddle
  [20, 17, 'nnnnn'], [21, 17, 'NNNNN'], [22, 17, 'NNNcN'], [23, 18, 'NNNN'],
  // engine: a tall long-stroke single. Black fins with a few bright edges, a round case cover
  [15, 25, 'nnnn'], [16, 24, 'NccccN'],
  [17, 24, 'KKKKKK'], [18, 24, 'ncccCC'], [19, 24, 'KKKKKK'], [20, 24, 'nccccC'], [21, 24, 'KKKKKK'],
  [22, 22, 'nnnnnnnn'], [23, 21, 'nNNNccNNNN'], [24, 21, 'nNNcCCcNNN'], [25, 21, 'NNNNccNNNN'],
  // exhaust: black header down the front of the cylinder, one black pipe run low, slash-cut behind the rear axle
  [17, 30, 'n'], [18, 30, 'n'], [19, 30, 'n'], [20, 30, 'n'], [21, 30, 'n'], [22, 30, 'n'], [23, 30, 'n'], [24, 30, 'n'], [25, 30, 'n'],
  [26, 2, 'cnnnnnnnnnnnnnnnnnnnnnnnnnnnn'], [27, 4, 'NNNNNNNNNNNNNNNNNNNNNNNNNN'],
  // short black front mudguard
  [18, 35, 'nnnn'], [19, 33, 'nNNNNNNN'], [20, 32, 'nN'], [20, 40, 'NN'], [21, 42, 'N'],
  // fork: black gaiters, a length of chrome tube, black lower legs
  [15, 33, 'nN'], [16, 33, 'Nn'], [17, 33, 'nN'], [18, 34, 'Nn'], [19, 34, 'nN'],
  [20, 35, 'cC'], [21, 35, 'cC'], [22, 36, 'nN'], [23, 36, 'nN'], [24, 36, 'nN'], [25, 36, 'nN'],
  // sprung solo saddle, floating over the rail on its two springs
  [15, 12, 'ee'], [16, 12, 'NNeeeeeeee'], [17, 13, 'NNNNNNNNN'], [18, 15, 'c'], [18, 20, 'c'],
  // teardrop tank in deep violet: full at the front, a soft highlight along its shoulder, filler cap
  [10, 25, 'uuuuuu'], [11, 23, 'uuwwwuuUU'], [12, 22, 'uUUUUUUUUUU'], [13, 21, 'UUUUUUUUUUUU'], [14, 21, 'dUUUUUUUUUUd'],
  [15, 23, 'ddUUUUdd'], [16, 26, 'dddd'],
  [9, 27, 'en'],
  // round headlamp in a black cowl, chrome bezel
  [10, 34, 'eee'], [11, 33, 'nNNNcY'], [12, 33, 'nNNNcYW'], [13, 33, 'NNNNcYY'], [14, 34, 'NNNcY'],
  // tall mini-ape bar: riser up from the yoke, pulled back to the grip; a round mirror standing above it
  [13, 32, 'n'], [12, 32, 'e'], [11, 32, 'e'], [10, 32, 'e'], [9, 31, 'e'], [8, 31, 'e'], [7, 29, 'nne'],
  [6, 31, 'ee'], [5, 30, 'eNNe'], [4, 31, 'ee'], // v1.8.1: mirror sits 2 px lower on a shorter stalk
];

/** Riding: knee bent, shin down to the mid-set peg just behind the cylinder. */
const SUNDOWNER_LEG: readonly Seg[] = [
  [14, 17, 'PPPPPPP'], [15, 17, 'PPPPPPPP'], [16, 22, 'pPP'], [17, 22, 'pP'], [18, 22, 'pP'], [19, 22, 'pP'],
  [20, 22, 'pP'], [21, 22, 'pP'], [22, 21, 'BBBB'], [23, 21, 'BBB'],
];

/** Foot down: the thigh reaching the planted leg (leg_sundowner, columns 18..21 from row 17). */
const SUNDOWNER_THIGH: readonly Seg[] = [
  [14, 17, 'PPPP'], [15, 17, 'PPPP'], [16, 19, 'pP'],
];

const SUNDOWNER_RIDER: readonly Seg[] = [
  // torso, relaxed: upright with a slight lean back
  [7, 15, 'jjjjj'], [8, 14, 'qJJJJJJ'], [9, 14, 'qJJJJJJ'], [10, 14, 'qJJJJJJ'], [11, 14, 'qJJJJJJ'], [12, 15, 'qJJJJJ'],
  [13, 15, 'qJJJJJ'], [14, 15, 'qq'], [15, 16, 'q'],
  // arm raised to the high grip, glove
  [9, 20, 'JJ'], [8, 20, 'jjjj'], [9, 22, 'qqq'], [7, 23, 'jjjjj'], [8, 24, 'qqqq'], [7, 28, 'oO'], [8, 28, 'O'],
  // open-face retro helmet (v1.6.3): a cream shell over the crown and down behind the ear, goggles pushed up on
  // the brow with their black strap round the shell, the face open below it, a chin strap. Same seven columns
  // and six rows as the head it replaces.
  [1, 15, 'HHHH'], [2, 14, 'hHHHHH'], [3, 14, 'hSSSSGg'], [4, 14, 'hHHHFKF'], [5, 14, 'hhHSFF'], [6, 16, 'SFF'],
];

/** Whitewall on a black wire wheel: black tread, a cream sidewall stripe, a black rim, thin spokes. */
const SUNDOWNER_REAR: readonly string[] = [
  '....KKKK....',
  '..KKWWWWKK..',
  '.KWWNNNNWWK.',
  '.KWN.c..NWK.',
  'KWN..c.c.NWK',
  'KWN.ceec.NWK',
  'KWNc.eec.NWK',
  'KWN.c.c..NWK',
  '.KWN..c.NWK.',
  '.KWWNNNNWWK.',
  '..KKWWWWKK..',
  '....KKKK....',
];

/** Front: the same whitewall, with a brake disc around the hub. */
const SUNDOWNER_FRONT: readonly string[] = [
  '....KKKK....',
  '..KKWWWWKK..',
  '.KWWNNNNWWK.',
  '.KWN.cc.NWK.',
  'KWN.cCCc.NWK',
  'KWNcCnnCcNWK',
  'KWNcCnnCcNWK',
  'KWN.cCCc.NWK',
  '.KWN.cc.NWK.',
  '.KWWNNNNWWK.',
  '..KKWWWWKK..',
  '....KKKK....',
];

// ---------------------------------------------------------------------------------------------------
// The planted leg (shown at a standstill and while backing up): 4 px wide, the boot on the ground.
//
// It is the rider's NEAR leg, so a body has two versions (v1.6.2): riding, with that leg on its peg, and
// foot-down ("_stand"), with the peg leg gone and only a thigh that meets the planted leg. The far leg is
// behind the bike in both. Never draw the peg leg and the planted leg together.
// ---------------------------------------------------------------------------------------------------

function legRows(length: number): string[] {
  const rows: string[] = [];
  for (let i = 0; i < length - 3; i++) rows.push('.pP.');
  rows.push('.BBB', 'BBBB', 'BBBB');
  return rows;
}

export interface BikeTexture { w: number; h: number; draw: (p: Pen) => void }

const tex = (w: number, h: number, legend: Legend, ...layers: ReadonlyArray<readonly Seg[]>): BikeTexture =>
  ({ w, h, draw: (p) => { for (const segs of layers) paint(p, legend, segs); } });

/** Every bike texture, by key (sprites.ts says which bike uses which). */
export const BIKE_TEXTURES: Readonly<Record<string, BikeTexture>> = {
  bike_tonup: tex(BIKE_W, BIKE_H, TONUP, TONUP_BODY, TONUP_LEG, TONUP_RIDER),
  bike_daybreak: tex(BIKE_W, BIKE_H, DAYBREAK, DAYBREAK_BODY, DAYBREAK_LEG, DAYBREAK_RIDER),
  bike_sundowner: tex(BIKE_W, BIKE_H, SUNDOWNER, SUNDOWNER_BODY, SUNDOWNER_LEG, SUNDOWNER_RIDER),
  bike_tonup_stand: tex(BIKE_W, BIKE_H, TONUP, TONUP_BODY, TONUP_THIGH, TONUP_RIDER),
  bike_daybreak_stand: tex(BIKE_W, BIKE_H, DAYBREAK, DAYBREAK_BODY, DAYBREAK_THIGH, DAYBREAK_RIDER),
  bike_sundowner_stand: tex(BIKE_W, BIKE_H, SUNDOWNER, SUNDOWNER_BODY, SUNDOWNER_THIGH, SUNDOWNER_RIDER),
  wheel_tonup: tex(12, 12, TONUP, grid(TONUP_WHEEL)),
  wheel_daybreak: tex(12, 12, DAYBREAK, grid(DAYBREAK_WHEEL)),
  wheel_sundowner_rear: tex(12, 12, SUNDOWNER, grid(SUNDOWNER_REAR)),
  wheel_sundowner_front: tex(12, 12, SUNDOWNER, grid(SUNDOWNER_FRONT)),
  leg_tonup: tex(4, 17, TONUP, grid(legRows(17))),
  leg_daybreak: tex(4, 17, DAYBREAK, grid(legRows(17))),
  leg_sundowner: tex(4, 15, SUNDOWNER, grid(legRows(15))),
};
