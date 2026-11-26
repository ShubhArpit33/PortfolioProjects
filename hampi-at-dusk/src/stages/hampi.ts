// Stage 1: Hampi at Dusk (GAME_SPEC.md sections 5.1 and 5.2). Pure data, no Phaser.
//
// v1.7: the stage is 900 columns (about a minute on the Daybreak): the Warm-up Road (the tutorial, a
// no-crash zone), Bazaar Street, the Canals, the Fallen Pavilion, the Boulder Field, the Ruins Road
// breather, the Mandapa Run, the Hemakuta Rocks, the Temple Steps (three risers up, a rolling boulder
// on the terrace, stairs down) and the river.
// v1.9: the data is one StageDef (HAMPI). Four checkpoints instead of twelve; the hints that hung on
// checkpoints are a list of their own. The road itself has not changed by a column.

import { HAMPI as HAMPI_THEME } from '../art/themes/hampi';
import type { BikeId } from '../bike/bikes';
import {
  TILE, cliff, flat, gap, ramp, riser,
  type BoulderDef, type Checkpoint, type CowDef, type DecorDef, type DiyaDef, type HintDef, type MonkeysDef,
  type ObstacleDef, type PromptDef, type Section,
} from '../level/level';
import { defineStage, levelOf, type StageDef } from './stage';

export const STAGE_COLS = 900;

export const SECTIONS: Section[] = [
  {
    // v1.7: the tutorial. Flat road, a log to hop (a stumble at worst), a boost strip, one gentle roller.
    id: 0,
    name: 'Warm-up Road',
    startCol: 0,
    endCol: 119,
    safe: true,
    segments: [flat(84), ramp(5, 1), ramp(5, -1), flat(26)],
  },
  { id: 1, name: 'Bazaar Street', startCol: 120, endCol: 179, segments: [flat(60)] },
  {
    id: 2,
    name: 'Canals',
    startCol: 180,
    endCol: 259,
    segments: [
      flat(8), gap(3), flat(8), gap(4), flat(8), gap(5), flat(6),
      gap(3), flat(3), gap(3), flat(8), gap(6), flat(15),
    ],
  },
  { id: 3, name: 'Fallen Pavilion', startCol: 260, endCol: 339, segments: [flat(80)] },
  {
    id: 4,
    name: 'Boulder Field',
    startCol: 340,
    endCol: 419,
    segments: [
      flat(6), ramp(6, 2), flat(5), ramp(4, -2), flat(6), ramp(8, 3), flat(6),
      cliff(0), flat(10), ramp(5, 1), ramp(5, -1), flat(19),
    ],
  },
  {
    // v1.7: the breather. Nothing here can hurt: a diya trail, and one bonus ramp (the same shape as the
    // Boulder Field's big ramp and cliff) that is a flip spot if you want it and a roll-over if you do not.
    id: 5,
    name: 'Ruins Road',
    startCol: 420,
    endCol: 503,
    segments: [flat(22), ramp(9, 3), flat(5), cliff(0), flat(48)],
  },
  {
    // v1.3: a raised mandapa plinth with a steady hop rhythm (three fallen pillars, then a cart).
    id: 6,
    name: 'Mandapa Run',
    startCol: 504,
    endCol: 613,
    segments: [flat(10), ramp(4, 1), flat(82), ramp(4, -1), flat(10)],
  },
  {
    // v1.3: rollers, then the kicker: a ramp over a stepped tank. Rolling off it falls in; a hop on the
    // ramp (big air, the flip spot) or boost clears it. The far bank is h0.
    id: 7,
    name: 'Hemakuta Rocks',
    startCol: 614,
    endCol: 723,
    segments: [
      flat(8), ramp(6, 1), ramp(6, -1), flat(4), ramp(6, 2), flat(5), ramp(5, -2), flat(12),
      ramp(4, 2), { kind: 'gap', cols: 8, kicker: true, farBankH: 0 }, flat(30),
      ramp(5, 1), ramp(5, -1), flat(6),
    ],
  },
  {
    // v1.7: three risers up (one tile each, 16 columns apart: hop, land, hop), a 46-column terrace where
    // a boulder rolls at the bike, then three one-tile drops back down (rolled, no hop needed).
    id: 8,
    name: 'Temple Steps',
    startCol: 724,
    endCol: 839,
    segments: [
      flat(14), riser(1), flat(15), riser(2), flat(15), riser(3), flat(46),
      cliff(2), flat(5), cliff(1), flat(5), cliff(0), flat(13),
    ],
  },
  {
    id: 9,
    name: 'Tungabhadra Leap',
    startCol: 840,
    endCol: 899,
    segments: [
      flat(20),
      ramp(8, 4, true),
      { kind: 'gap', cols: 12, river: true, farBankH: 0 },
      flat(20),
    ],
  },
];

// ---- Entities (section 5.2). x = left column, h = tiles above the baseline. ----

/**
 * Four checkpoints (v1.9; twelve before): the start, the Ruins Road breather in the middle, the foot of
 * the Temple Steps, and the river's run-up. A crash goes back to the last one passed.
 */
export const CHECKPOINTS: Checkpoint[] = [
  { id: 0, col: 2 },
  { id: 1, col: 422 },   // Ruins Road: the middle of the stage, where nothing can hurt
  { id: 2, col: 726 },   // Temple Steps
  { id: 3, col: 842 },   // Tungabhadra Leap
];

/**
 * Hints (v1.9): they used to hang on checkpoints; now they are their own list, at the same columns.
 * The empty one clears "HOP UP THE STEPS!" on the terrace, where the thing to read is the boulder's "!".
 */
export const HINTS: HintDef[] = [
  { col: 616, text: 'HOP ON THE RAMP!' },     // Hemakuta Rocks
  { col: 726, text: 'HOP UP THE STEPS!' },    // Temple Steps
  { col: 774, text: '' },                     // the terrace, before the boulder's trigger
  { col: 842, text: 'HOLD SHIFT - BOOST!' },  // Tungabhadra Leap
];

export const DIYAS: DiyaDef[] = [
  // Warm-up Road: the ride line, over the log, the boost strip, the crest of the roller.
  { col: 10, h: 1 }, { col: 14, h: 1 }, { col: 18, h: 1 },
  { col: 36, h: 3 },
  { col: 54, h: 1 }, { col: 60, h: 1 }, { col: 66, h: 1 }, { col: 72, h: 1 },
  { col: 88, h: 2 }, { col: 89, h: 2 },
  // Bazaar Street, Canals, Fallen Pavilion, Boulder Field (v1.0, shifted by 120 columns).
  { col: 138, h: 1 }, { col: 142, h: 1 }, { col: 146, h: 1 },
  { col: 189, h: 3 }, { col: 200, h: 3 }, { col: 213, h: 3 },
  { col: 223, h: 3 }, { col: 229, h: 3 }, { col: 241, h: 3 },
  { col: 277, h: 3 }, { col: 319, h: 4 }, { col: 333, h: 3 },
  { col: 354, h: 3 }, { col: 378, h: 4 }, { col: 384, h: 3 }, { col: 396, h: 3 },
  // Ruins Road: a trail in, up the bonus ramp, over the drop, a trail out.
  { col: 428, h: 1 }, { col: 432, h: 1 }, { col: 436, h: 1 },
  { col: 446, h: 2 }, { col: 450, h: 4 },
  { col: 458, h: 3 },
  { col: 470, h: 1 }, { col: 476, h: 1 }, { col: 482, h: 1 }, { col: 488, h: 1 },
  // Mandapa Run: one over each pillar / the cart (the plinth is h1), two on the plinth between hops.
  { col: 529, h: 4 }, { col: 537, h: 2 }, { col: 546, h: 4 }, { col: 554, h: 2 }, { col: 563, h: 4 }, { col: 582, h: 5 },
  // Hemakuta Rocks: roller crests (free), a hop line off the second roller's up-ramp, the kicker arc.
  { col: 629, h: 2 }, { col: 641, h: 4 }, { col: 647, h: 7 },
  { col: 672, h: 7 }, { col: 675, h: 8 }, { col: 678, h: 7 },
  { col: 714, h: 2 },
  // Temple Steps: one over each riser, one over the spot where the boulder is met, one under each of the first two drops.
  { col: 738, h: 3 }, { col: 754, h: 4 }, { col: 770, h: 5 },
  { col: 803, h: 6 },
  { col: 819, h: 3 }, { col: 824, h: 2 },
  // Tungabhadra Leap
  { col: 872, h: 5 },
];

export const OBSTACLES: ObstacleDef[] = [
  // Warm-up Road: a log across the road. Half a tile high; hitting it only costs speed.
  { type: 'log', col: 36, wCols: 1, hTiles: 0.5 },
  { type: 'pillar', col: 276, wCols: 3, hTiles: 1 },
  { type: 'pillar', col: 304, wCols: 3, hTiles: 1 },
  { type: 'cart', col: 318, wCols: 3, hTiles: 2 },
  { type: 'pillar', col: 332, wCols: 3, hTiles: 1 },
  // Mandapa Run (on the h1 plinth): a 17-column rhythm, then a longer beat before the cart.
  { type: 'pillar', col: 528, wCols: 3, hTiles: 1 },
  { type: 'pillar', col: 545, wCols: 3, hTiles: 1 },
  { type: 'pillar', col: 562, wCols: 3, hTiles: 1 },
  { type: 'cart', col: 581, wCols: 3, hTiles: 2 },
];

export const MONKEYS: MonkeysDef = {
  triggerCol: 288,
  spawnCols: [298, 300],
  sitCols: [292, 294],
  runSpeed: 40,
  hitW: 12,
  hitH: 12,
};

export const COW: CowDef = {
  col: 164,
  w: 32,
  h: 24,
  waitRangeTiles: 3,
  waitMaxSpeed: 20,
  waitSeconds: 1.5,
  walkSpeed: 20,
  walkSeconds: 2,
};

export const FINISH = { col: 892, art: 'gateway' };

/** The kicker (Hemakuta Rocks): the ramp whose lip is the flip spot. lipCol = first column past the lip. */
export const KICKER = { rampCol: 666, lipCol: 670 };

/** The bonus ramp on Ruins Road (v1.7): ramp 9 +3, 5 flat columns, a cliff back to h0. Optional flip spot. */
export const BONUS = { rampCol: 442, lipCol: 451, cliffCol: 456 };

/**
 * The rolling boulder on the temple terrace (v1.7). When the bike's x reaches triggerCol it starts at
 * spawnCol and rolls left at `speed`; it breaks up when it reaches endCol (the top riser). Touching it
 * is a crash. The box is smaller than the 22 px rock, on purpose.
 */
export const BOULDER: BoulderDef = {
  triggerCol: 781,
  spawnCol: 811,
  endCol: 771,
  speed: 80,
  hitW: 16,
  hitH: 14,
  /** the terrace it rolls on (tiles above the baseline) */
  terraceH: 3,
};

/** The no-crash zone (v1.7): a bad landing whose take-off was left of toCol is a wobble, not a crash. */
export const SAFE_ZONE = { fromCol: 0, toCol: 120 };

/** Tutorial prompts (v1.7): shown while the bike is in [fromCol, toCol), until one full run has been finished. */
export const PROMPTS: PromptDef[] = [
  { fromCol: 0, toCol: 24, text: 'HOLD RIGHT TO RIDE' },
  { fromCol: 24, toCol: 40, text: 'SPACE - HOP THE LOG' },
  { fromCol: 46, toCol: 76, text: 'HOLD SHIFT - BOOST' },
  { fromCol: 78, toCol: 100, text: 'IN THE AIR: UP / DOWN TO TILT' },
];

/** The Mandapa Run's plinth (h1): the flat stretch the colonnade stands behind. */
const PLINTH = { col: 518, cols: 82 };

/**
 * Decoration that stands on the road, behind every entity and in a dark, low-contrast tone: the colonnade
 * behind the Mandapa Run's plinth, ruins along the Ruins Road, and the temple doorway the boulder rolls out of.
 */
export const DECOR: DecorDef[] = ((): DecorDef[] => {
  const out: DecorDef[] = [];
  // A standing colonnade behind the plinth: 192 px pieces, 16 px apart.
  for (let x = PLINTH.col * TILE + 24; x + 192 <= (PLINTH.col + PLINTH.cols) * TILE; x += 208) out.push({ key: 'colonnade', x, alpha: 0.85 });
  // Ruins Road: a broken hall before the bonus ramp, then more along the trail out after the drop.
  const at = (key: string, col: number, alpha = 0.85): void => { out.push({ key, x: col * TILE, alpha }); };
  at('ruins_a', BONUS.rampCol - 16);
  at('ruins_b', BONUS.cliffCol + 6);
  at('ruins_a', BONUS.cliffCol + 22);
  at('ruins_b', BONUS.cliffCol + 37);
  // The temple doorway stands where the boulder starts (it is 96 px wide: three columns either side).
  at('temple_door', BOULDER.spawnCol - 3, 1);
  return out;
})();

/**
 * The bot's clean run on each bike (ms): no flips, boost only at the river. Measured on the 900-column
 * stage (v1.7); the e2e bot run asserts these to the millisecond. Medal targets follow from them.
 */
export const BOT_RUN_MS: Readonly<Record<BikeId, number>> = { tonup: 49_908, daybreak: 59_517, sundowner: 69_150 };

export const HAMPI: StageDef = defineStage({
  id: 'hampi',
  name: 'HAMPI AT DUSK',
  theme: HAMPI_THEME,
  collectible: { texture: 'diya', glow: 'glow_diya', label: 'DIYAS' },
  cols: STAGE_COLS,
  sections: SECTIONS,
  checkpoints: CHECKPOINTS,
  collectibles: DIYAS,
  hazards: { obstacles: OBSTACLES, cow: COW, monkeys: MONKEYS, boulder: BOULDER },
  safeZone: SAFE_ZONE,
  prompts: PROMPTS,
  hints: HINTS,
  finish: FINISH,
  kicker: KICKER,
  bonus: BONUS,
  decor: DECOR,
  boats: 'coracle',
  botRunMs: BOT_RUN_MS,
});

/** Hampi's heightfield and its plain-data view (for the tests and the bot's planner). */
export const TERRAIN = HAMPI.terrain;
export const LEVEL = levelOf(HAMPI);
