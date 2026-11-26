// What every stage shares (GAME_SPEC.md section 5): the tile grid, the baseline, the water lines, the
// screen, and the shapes a stage's data is written in. Pure data and types, no Phaser. The stages
// themselves are in src/stages (one StageDef each).

export const TILE = 16;
export const VIEW_W = 480;
export const VIEW_H = 270;
export const BASELINE_Y = 222;      // surface y at height h0
export const WATER_LINE_Y = 226;    // drawn water line in gaps
export const WATER_KILL_Y = 230;    // kill plane over gaps
export const WORLD_START_X = 24;    // invisible wall at the start (keeps a backed-up bike fully on screen)

/** Stage width in px, the invisible wall at its end, and the furthest the camera scrolls. */
export const stageWidth = (cols: number): number => cols * TILE;
export const worldEndX = (widthPx: number): number => widthPx - TILE;
export const cameraMaxScrollX = (widthPx: number): number => widthPx - VIEW_W;

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

export const flat = (cols: number): Segment => ({ kind: 'flat', cols });
export const ramp = (cols: number, rise: number, noHop = false): Segment =>
  noHop ? { kind: 'ramp', cols, rise, noHop: true } : { kind: 'ramp', cols, rise };
export const gap = (cols: number): Segment => ({ kind: 'gap', cols });
export const cliff = (toH: number): Segment => ({ kind: 'cliff', toH });
/** A riser: a dry 1-column slot whose far bank is at height toH (one tile up). Cleared by a hop, like a canal. */
export const riser = (toH: number): Segment => ({ kind: 'gap', cols: 1, step: true, farBankH: toH });

// ---- Entities (section 5.2). x = left column, h = tiles above the baseline. ----

/** A checkpoint (a lamp pillar): the bike respawns here after a crash once it has been passed. */
export interface Checkpoint { id: number; col: number }
/** A collectible (Hampi: a diya). */
export interface DiyaDef { col: number; h: number }
/** pillar and cart are solid (a crash); a log is not: riding into it is a stumble */
export interface ObstacleDef { type: 'pillar' | 'cart' | 'log'; col: number; wCols: number; hTiles: number }

/** Tutorial prompts: shown while the bike is in [fromCol, toCol), until one full run has been finished. */
export interface PromptDef { fromCol: number; toCol: number; text: string }
/**
 * A hint (v1.9): blinking HUD text that comes up when the bike reaches a column (and again when it
 * respawns at a checkpoint on that column). '' clears the hint that is showing. Shown on every run.
 */
export interface HintDef { col: number; text: string }

/** A troop of monkeys: triggered by the bike, they run in and sit on the road (a stumble each; a honk clears them). */
export interface MonkeysDef {
  triggerCol: number; spawnCols: number[]; sitCols: number[]; runSpeed: number; hitW: number; hitH: number;
}
/** A cow in the road: solid when slow, a crash when fast; wait near her and she walks off. */
export interface CowDef {
  col: number; w: number; h: number; waitRangeTiles: number; waitMaxSpeed: number; waitSeconds: number;
  walkSpeed: number; walkSeconds: number;
}
/**
 * A rolling boulder. When the bike's x reaches triggerCol it starts at spawnCol and rolls left at `speed`;
 * it breaks up when it reaches endCol. Touching it is a crash. terraceH = the surface it rolls on (tiles).
 */
export interface BoulderDef {
  triggerCol: number; spawnCol: number; endCol: number; speed: number; hitW: number; hitH: number; terraceH: number;
}
/** Decoration that stands on the road, behind every entity: a texture, its left x (px) and its alpha. */
export interface DecorDef { key: string; x: number; alpha: number }

/** The prompt for a bike x (world px), or '' when there is none there. */
export function promptAt(prompts: readonly PromptDef[], x: number): string {
  const col = x / TILE;
  for (const p of prompts) if (col >= p.fromCol && col < p.toCol) return p.text;
  return '';
}

/** Diya centre in world px. */
export function diyaCentre(d: DiyaDef): { x: number; y: number } {
  return { x: TILE * d.col + TILE / 2, y: BASELINE_Y - TILE * d.h };
}

/** Respawn / activation x of a checkpoint (also the x a hint comes up at). */
export function checkpointX(cp: { col: number }): number {
  return TILE * cp.col + TILE / 2;
}
