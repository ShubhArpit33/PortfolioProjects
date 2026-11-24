// Level data (GAME_SPEC.md sections 5.1 and 5.2). Pure data, no Phaser.

export const TILE = 16;
export const BASELINE_Y = 222;      // surface y at height h0
export const WATER_LINE_Y = 226;    // drawn water line in gaps
export const WATER_KILL_Y = 230;    // kill plane over gaps
export const STAGE_COLS = 580;
export const STAGE_WIDTH = STAGE_COLS * TILE; // 9280
export const WORLD_END_X = STAGE_WIDTH - TILE; // 9264, invisible wall
export const WORLD_START_X = 24;    // invisible wall at the start (keeps a backed-up bike fully on screen)
export const CAMERA_MAX_SCROLL_X = STAGE_WIDTH - 480; // 8800

export type Segment =
  | { kind: 'flat'; cols: number; noHop?: boolean }
  /** rise is in tiles: positive = uphill, negative = downhill */
  | { kind: 'ramp'; cols: number; rise: number; noHop?: boolean }
  /** farBankH: height (tiles) of the far bank; omitted = unchanged */
  | { kind: 'gap'; cols: number; river?: boolean; kicker?: boolean; farBankH?: number }
  /** instant drop (vertical wall) to height toH, takes 0 columns */
  | { kind: 'cliff'; toH: number };

export interface Section {
  id: number;
  name: string;
  startCol: number;
  endCol: number; // inclusive
  segments: Segment[];
}

const flat = (cols: number): Segment => ({ kind: 'flat', cols });
const ramp = (cols: number, rise: number, noHop = false): Segment =>
  noHop ? { kind: 'ramp', cols, rise, noHop: true } : { kind: 'ramp', cols, rise };
const gap = (cols: number): Segment => ({ kind: 'gap', cols });
const cliff = (toH: number): Segment => ({ kind: 'cliff', toH });

export const SECTIONS: Section[] = [
  { id: 1, name: 'Bazaar Street', startCol: 0, endCol: 59, segments: [flat(60)] },
  {
    id: 2,
    name: 'Canals',
    startCol: 60,
    endCol: 139,
    segments: [
      flat(8), gap(3), flat(8), gap(4), flat(8), gap(5), flat(6),
      gap(3), flat(3), gap(3), flat(8), gap(6), flat(15),
    ],
  },
  { id: 3, name: 'Fallen Pavilion', startCol: 140, endCol: 219, segments: [flat(80)] },
  {
    id: 4,
    name: 'Boulder Field',
    startCol: 220,
    endCol: 299,
    segments: [
      flat(6), ramp(6, 2), flat(5), ramp(4, -2), flat(6), ramp(8, 3), flat(6),
      cliff(0), flat(10), ramp(5, 1), ramp(5, -1), flat(19),
    ],
  },
  {
    // v1.3: a raised mandapa plinth with a steady hop rhythm (three fallen pillars, then a cart).
    id: 5,
    name: 'Mandapa Run',
    startCol: 300,
    endCol: 409,
    segments: [flat(10), ramp(4, 1), flat(82), ramp(4, -1), flat(10)],
  },
  {
    // v1.3: rollers, then the kicker: a ramp over a stepped tank. Rolling off it falls in; a hop on the
    // ramp (big air, the flip spot) or boost clears it. The far bank is h0.
    id: 6,
    name: 'Hemakuta Rocks',
    startCol: 410,
    endCol: 519,
    segments: [
      flat(8), ramp(6, 1), ramp(6, -1), flat(4), ramp(6, 2), flat(5), ramp(5, -2), flat(12),
      ramp(4, 2), { kind: 'gap', cols: 8, kicker: true, farBankH: 0 }, flat(30),
      ramp(5, 1), ramp(5, -1), flat(6),
    ],
  },
  {
    id: 7,
    name: 'Tungabhadra Leap',
    startCol: 520,
    endCol: 579,
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
export interface ObstacleDef { type: 'pillar' | 'cart'; col: number; wCols: number; hTiles: number }

export const CHECKPOINTS: Checkpoint[] = [
  { id: 0, col: 2 },
  { id: 1, col: 62 },
  { id: 2, col: 142 },
  { id: 3, col: 222 },
  { id: 4, col: 302 },
  { id: 5, col: 412, hint: 'HOP ON THE RAMP!' },
  { id: 6, col: 522, hint: 'HOLD SHIFT - BOOST!' },
];

export const DIYAS: DiyaDef[] = [
  { col: 18, h: 1 }, { col: 22, h: 1 }, { col: 26, h: 1 },
  { col: 69, h: 3 }, { col: 80, h: 3 }, { col: 93, h: 3 },
  { col: 103, h: 3 }, { col: 109, h: 3 }, { col: 121, h: 3 },
  { col: 157, h: 3 }, { col: 199, h: 4 }, { col: 213, h: 3 },
  { col: 234, h: 3 }, { col: 258, h: 4 }, { col: 264, h: 3 }, { col: 276, h: 3 },
  // Mandapa Run: one over each pillar / the cart (the plinth is h1), two on the plinth between hops.
  { col: 325, h: 4 }, { col: 333, h: 2 }, { col: 342, h: 4 }, { col: 350, h: 2 }, { col: 359, h: 4 }, { col: 378, h: 5 },
  // Hemakuta Rocks: roller crests (free), a hop line off the second roller's up-ramp, the kicker arc.
  { col: 425, h: 2 }, { col: 437, h: 4 }, { col: 443, h: 7 },
  { col: 468, h: 7 }, { col: 471, h: 8 }, { col: 474, h: 7 },
  { col: 510, h: 2 },
  { col: 552, h: 5 },
];

export const OBSTACLES: ObstacleDef[] = [
  { type: 'pillar', col: 156, wCols: 3, hTiles: 1 },
  { type: 'pillar', col: 184, wCols: 3, hTiles: 1 },
  { type: 'cart', col: 198, wCols: 3, hTiles: 2 },
  { type: 'pillar', col: 212, wCols: 3, hTiles: 1 },
  // Mandapa Run (on the h1 plinth): a 17-column rhythm, then a longer beat before the cart.
  { type: 'pillar', col: 324, wCols: 3, hTiles: 1 },
  { type: 'pillar', col: 341, wCols: 3, hTiles: 1 },
  { type: 'pillar', col: 358, wCols: 3, hTiles: 1 },
  { type: 'cart', col: 377, wCols: 3, hTiles: 2 },
];

export const MONKEYS = {
  triggerCol: 168,
  spawnCols: [178, 180],
  sitCols: [172, 174],
  runSpeed: 40,
  hitW: 12,
  hitH: 12,
};

export const COW = {
  col: 44,
  w: 32,
  h: 24,
  waitRangeTiles: 3,
  waitMaxSpeed: 20,
  waitSeconds: 1.5,
  walkSpeed: 20,
  walkSeconds: 2,
};

export const FINISH = { col: 572 };

/** The kicker (section 6): the ramp whose lip is the flip spot. lipCol = first column past the lip. */
export const KICKER = { rampCol: 462, lipCol: 466 };

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
};

export type LevelData = typeof LEVEL;
