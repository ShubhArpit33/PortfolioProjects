// Level data (GAME_SPEC.md sections 5.1 and 5.2). Pure data, no Phaser.
//
// v1.7: the stage is 900 columns (about a minute on the Daybreak). New since v1.6: the Warm-up Road in
// front of Bazaar Street (the tutorial, a no-crash zone), the Ruins Road breather after the Boulder
// Field, and the Temple Steps (three risers up, a rolling boulder on the terrace, stairs down) before
// the river. Every section that existed in v1.6 is unchanged, only shifted right.

export const TILE = 16;
export const BASELINE_Y = 222;      // surface y at height h0
export const WATER_LINE_Y = 226;    // drawn water line in gaps
export const WATER_KILL_Y = 230;    // kill plane over gaps
export const STAGE_COLS = 900;
export const STAGE_WIDTH = STAGE_COLS * TILE; // 14400
export const WORLD_END_X = STAGE_WIDTH - TILE; // 14384, invisible wall
export const WORLD_START_X = 24;    // invisible wall at the start (keeps a backed-up bike fully on screen)
export const CAMERA_MAX_SCROLL_X = STAGE_WIDTH - 480; // 13920

export type Segment =
  | { kind: 'flat'; cols: number; noHop?: boolean }
  /** rise is in tiles: positive = uphill, negative = downhill */
  | { kind: 'ramp'; cols: number; rise: number; noHop?: boolean }
  /**
   * farBankH: height (tiles) of the far bank; omitted = unchanged.
   * step: a dry 1-column slot at the foot of a riser (stone, not water); its far bank is one tile higher.
   */
  | { kind: 'gap'; cols: number; river?: boolean; kicker?: boolean; step?: boolean; farBankH?: number }
  /** instant drop (vertical wall) to height toH, takes 0 columns */
  | { kind: 'cliff'; toH: number };

export interface Section {
  id: number;
  name: string;
  startCol: number;
  endCol: number; // inclusive
  segments: Segment[];
  /** no-crash zone (the warm-up): a bad landing is a wobble, never a crash */
  safe?: boolean;
}

const flat = (cols: number): Segment => ({ kind: 'flat', cols });
const ramp = (cols: number, rise: number, noHop = false): Segment =>
  noHop ? { kind: 'ramp', cols, rise, noHop: true } : { kind: 'ramp', cols, rise };
const gap = (cols: number): Segment => ({ kind: 'gap', cols });
const cliff = (toH: number): Segment => ({ kind: 'cliff', toH });
/** A riser: a dry 1-column slot whose far bank is at height toH (one tile up). Cleared by a hop, like a canal. */
const riser = (toH: number): Segment => ({ kind: 'gap', cols: 1, step: true, farBankH: toH });

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

export interface Checkpoint { id: number; col: number; hint?: string }
export interface DiyaDef { col: number; h: number }
/** pillar and cart are solid (a crash); a log is not: riding into it is a stumble */
export interface ObstacleDef { type: 'pillar' | 'cart' | 'log'; col: number; wCols: number; hTiles: number }

export const CHECKPOINTS: Checkpoint[] = [
  { id: 0, col: 2 },
  { id: 1, col: 122 },                               // Bazaar Street
  { id: 2, col: 182 },                               // Canals
  { id: 3, col: 232 },                               // v1.7: inside the canal run, before the widest canal
  { id: 4, col: 262 },                               // Fallen Pavilion
  { id: 5, col: 342 },                               // Boulder Field
  { id: 6, col: 422 },                               // v1.7: Ruins Road
  { id: 7, col: 506 },                               // Mandapa Run
  { id: 8, col: 616, hint: 'HOP ON THE RAMP!' },     // Hemakuta Rocks
  { id: 9, col: 726, hint: 'HOP UP THE STEPS!' },    // v1.7: Temple Steps
  { id: 10, col: 774 },                              // v1.7: the terrace, before the boulder's trigger
  { id: 11, col: 842, hint: 'HOLD SHIFT - BOOST!' }, // Tungabhadra Leap
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

export const MONKEYS = {
  triggerCol: 288,
  spawnCols: [298, 300],
  sitCols: [292, 294],
  runSpeed: 40,
  hitW: 12,
  hitH: 12,
};

export const COW = {
  col: 164,
  w: 32,
  h: 24,
  waitRangeTiles: 3,
  waitMaxSpeed: 20,
  waitSeconds: 1.5,
  walkSpeed: 20,
  walkSeconds: 2,
};

export const FINISH = { col: 892 };

/** The kicker (Hemakuta Rocks): the ramp whose lip is the flip spot. lipCol = first column past the lip. */
export const KICKER = { rampCol: 666, lipCol: 670 };

/** The bonus ramp on Ruins Road (v1.7): ramp 9 +3, 5 flat columns, a cliff back to h0. Optional flip spot. */
export const BONUS = { rampCol: 442, lipCol: 451, cliffCol: 456 };

/**
 * The rolling boulder on the temple terrace (v1.7). When the bike's x reaches triggerCol it starts at
 * spawnCol and rolls left at `speed`; it breaks up when it reaches endCol (the top riser). Touching it
 * is a crash. The box is smaller than the 22 px rock, on purpose.
 */
export const BOULDER = {
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
export interface PromptDef { fromCol: number; toCol: number; text: string }
export const PROMPTS: PromptDef[] = [
  { fromCol: 0, toCol: 24, text: 'HOLD RIGHT TO RIDE' },
  { fromCol: 24, toCol: 40, text: 'SPACE - HOP THE LOG' },
  { fromCol: 46, toCol: 76, text: 'HOLD SHIFT - BOOST' },
  { fromCol: 78, toCol: 100, text: 'IN THE AIR: UP / DOWN TO TILT' },
];

/** The prompt for a bike x (world px), or '' when there is none there. */
export function promptAt(x: number): string {
  const col = x / TILE;
  for (const p of PROMPTS) if (col >= p.fromCol && col < p.toCol) return p.text;
  return '';
}

/** Diya centre in world px. */
export function diyaCentre(d: DiyaDef): { x: number; y: number } {
  return { x: TILE * d.col + TILE / 2, y: BASELINE_Y - TILE * d.h };
}

/** Respawn / activation x of a checkpoint. */
export function checkpointX(cp: Checkpoint): number {
  return TILE * cp.col + TILE / 2;
}

export const LEVEL = {
  tile: TILE,
  baselineY: BASELINE_Y,
  waterLineY: WATER_LINE_Y,
  waterKillY: WATER_KILL_Y,
  stageCols: STAGE_COLS,
  stageWidth: STAGE_WIDTH,
  worldStartX: WORLD_START_X,
  worldEndX: WORLD_END_X,
  sections: SECTIONS,
  checkpoints: CHECKPOINTS,
  diyas: DIYAS,
  obstacles: OBSTACLES,
  monkeys: MONKEYS,
  cow: COW,
  finish: FINISH,
  kicker: KICKER,
  bonus: BONUS,
  boulder: BOULDER,
  safeZone: SAFE_ZONE,
  prompts: PROMPTS,
};

export type LevelData = typeof LEVEL;
