// Level data (GAME_SPEC.md sections 5.1 and 5.2). Pure data, no Phaser.

export const TILE = 16;
export const BASELINE_Y = 222;      // surface y at height h0
export const WATER_LINE_Y = 226;    // drawn water line in gaps
export const WATER_KILL_Y = 230;    // kill plane over gaps
export const STAGE_COLS = 360;
export const STAGE_WIDTH = STAGE_COLS * TILE; // 5760
export const WORLD_END_X = 5744;    // invisible wall
export const CAMERA_MAX_SCROLL_X = 5280;

export type Segment =
  | { kind: 'flat'; cols: number; noHop?: boolean }
  /** rise is in tiles: positive = uphill, negative = downhill */
  | { kind: 'ramp'; cols: number; rise: number; noHop?: boolean }
  /** farBankH: height (tiles) of the far bank; omitted = unchanged */
  | { kind: 'gap'; cols: number; river?: boolean; farBankH?: number }
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
    id: 5,
    name: 'Tungabhadra Leap',
    startCol: 300,
    endCol: 359,
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
  { id: 4, col: 302, hint: 'HOLD SHIFT - BOOST!' },
];

export const DIYAS: DiyaDef[] = [
  { col: 18, h: 1 }, { col: 22, h: 1 }, { col: 26, h: 1 },
  { col: 69, h: 3 }, { col: 80, h: 3 }, { col: 93, h: 3 },
  { col: 103, h: 3 }, { col: 109, h: 3 }, { col: 121, h: 3 },
  { col: 157, h: 3 }, { col: 199, h: 4 }, { col: 213, h: 3 },
  { col: 234, h: 3 }, { col: 258, h: 4 }, { col: 264, h: 3 }, { col: 276, h: 3 },
  { col: 332, h: 5 },
];

export const OBSTACLES: ObstacleDef[] = [
  { type: 'pillar', col: 156, wCols: 3, hTiles: 1 },
  { type: 'pillar', col: 184, wCols: 3, hTiles: 1 },
  { type: 'cart', col: 198, wCols: 3, hTiles: 2 },
  { type: 'pillar', col: 212, wCols: 3, hTiles: 1 },
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

export const FINISH = { col: 352 };

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
  worldEndX: WORLD_END_X,
  sections: SECTIONS,
  checkpoints: CHECKPOINTS,
  diyas: DIYAS,
  obstacles: OBSTACLES,
  monkeys: MONKEYS,
  cow: COW,
  finish: FINISH,
};

export type LevelData = typeof LEVEL;
