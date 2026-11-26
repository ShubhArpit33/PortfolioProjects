// A stage (v1.9): everything the game needs to run one road, as one object. The Game scene, the HUD, the
// entities, the records and the bot all take a StageDef; nothing reads a stage's data any other way.
// Pure data (the theme's painters are functions, but nothing here touches Phaser).
//
// A new stage: write its data and theme, call defineStage, and add it to the registry (src/stages/index.ts).

import type { StageTheme } from '../art/look/theme';
import type { BikeId } from '../bike/bikes';
import {
  BASELINE_Y, TILE, WATER_KILL_Y, WATER_LINE_Y, WORLD_START_X, stageWidth, worldEndX,
  type BoulderDef, type Checkpoint, type CowDef, type DecorDef, type DiyaDef, type HintDef, type MonkeysDef,
  type ObstacleDef, type PromptDef, type Section,
} from '../level/level';
import { buildTerrain, type Terrain } from '../level/terrain';

/** A stage's id: used in the registry, in storage keys and in the journey's order. Lower-case letters and digits. */
export type StageId = string;

export type MedalTimes = Readonly<Record<'gold' | 'silver' | 'bronze', number>>;

/** Medal targets from a bot time (v1.7): gold x1.05, silver x1.25, bronze x2.2, each rounded up to a whole second. */
export function medalsFor(botMs: number): MedalTimes {
  const up = (k: number): number => Math.ceil((botMs * k) / 1000 - 1e-9) * 1000;
  return { gold: up(1.05), silver: up(1.25), bronze: up(2.2) };
}

/** What the stage's pickups are (Hampi: diyas; Goa: seashells; Ladakh: butter lamps). */
export interface CollectibleKind {
  /** the pickup's texture; also the icon beside the HUD count. Its keyline texture is `<texture>_key`. */
  texture: string;
  /** the halo drawn behind it (additive), or null for none */
  glow: string | null;
  /** what the screens call them, e.g. 'DIYAS' */
  label: string;
}

/** Things that can hurt (or only slow) the bike. A stage leaves out what it does not have. */
export interface StageHazards {
  /** pillars and carts (a crash) and logs (a stumble) */
  obstacles: ObstacleDef[];
  cow: CowDef | null;
  monkeys: MonkeysDef | null;
  boulder: BoulderDef | null;
}

/** What a stage is written as. defineStage adds what follows from it. */
export interface StageSpec {
  id: StageId;
  /** on the HUD, the stage card and the lists, e.g. 'HAMPI AT DUSK' (ASCII capitals) */
  name: string;
  /** its look: parallax layers, road, mist, light (src/art/look/theme.ts) */
  theme: StageTheme;
  collectible: CollectibleKind;
  /** stage length in columns; the sections must add up to it */
  cols: number;
  sections: Section[];
  /** 3 or 4: the start, then one before each big moment. ids are 0..n-1 in column order. */
  checkpoints: Checkpoint[];
  collectibles: DiyaDef[];
  hazards: StageHazards;
  /** the no-crash zone (the warm-up): a bad landing whose take-off was left of toCol is a wobble; null = none */
  safeZone: { fromCol: number; toCol: number } | null;
  /** tutorial prompts (first run only) and hints (every run) */
  prompts: PromptDef[];
  hints: HintDef[];
  /** the finish line's column, and the texture that stands on it */
  finish: { col: number; art: string };
  /** a ramp over a tank whose lip is a flip spot (lipCol = first column past the lip), or null */
  kicker: { rampCol: number; lipCol: number } | null;
  /** an optional flip ramp that ends in a drop, or null */
  bonus: { rampCol: number; lipCol: number; cliffCol: number } | null;
  /** decoration standing on the road, behind every entity */
  decor: DecorDef[];
  /** texture of the boats that bob on the river gap, or null */
  boats: string | null;
  /** the bot's clean run on each bike (ms), measured; the e2e bot run asserts it to the millisecond */
  botRunMs: Readonly<Record<BikeId, number>>;
}

export interface StageDef extends StageSpec {
  /** stage width in px */
  width: number;
  /** the heightfield, built once from the sections */
  terrain: Terrain;
  /** medal targets (ms, inclusive) per bike, from botRunMs */
  medalsMs: Readonly<Record<BikeId, MedalTimes>>;
}

const ID = /^[a-z][a-z0-9]*$/;

/** Check a stage's data and build what follows from it (terrain, medal targets). Throws on a stage that cannot be ridden. */
export function defineStage(spec: StageSpec): StageDef {
  if (!ID.test(spec.id)) throw new Error(`stage id "${spec.id}": lower-case letters and digits only`);
  const terrain = buildTerrain(spec.sections);
  const width = stageWidth(spec.cols);
  if (terrain.width !== width) throw new Error(`${spec.id}: sections cover ${terrain.width} px, expected ${width}`);
  if (spec.checkpoints.length < 1) throw new Error(`${spec.id}: a stage needs a checkpoint at its start`);
  spec.checkpoints.forEach((c, i) => {
    if (c.id !== i) throw new Error(`${spec.id}: checkpoint ids must be 0..n-1 in order`);
    if (i > 0 && c.col <= spec.checkpoints[i - 1]!.col) throw new Error(`${spec.id}: checkpoints must be in column order`);
    if (terrain.surfaceY(TILE * c.col + TILE / 2) === null) throw new Error(`${spec.id}: checkpoint ${i} is over a gap`);
  });
  if (!(spec.finish.col > 0 && spec.finish.col < spec.cols)) throw new Error(`${spec.id}: the finish line is off the stage`);
  const medalsMs = Object.fromEntries(
    Object.entries(spec.botRunMs).map(([bike, ms]) => [bike, medalsFor(ms)]),
  ) as Record<BikeId, MedalTimes>;
  return { ...spec, width, terrain, medalsMs };
}

/**
 * A stage as plain data (no functions): what window.__test.levelData hands to the e2e bot, and what the
 * bot's planner reads. Field names are the ones the planner has always used.
 */
export interface LevelData {
  id: StageId;
  name: string;
  tile: number;
  baselineY: number;
  waterLineY: number;
  waterKillY: number;
  stageCols: number;
  stageWidth: number;
  worldStartX: number;
  worldEndX: number;
  sections: Section[];
  checkpoints: Checkpoint[];
  collectibles: DiyaDef[];
  obstacles: ObstacleDef[];
  monkeys: MonkeysDef | null;
  cow: CowDef | null;
  boulder: BoulderDef | null;
  finish: { col: number };
  kicker: { rampCol: number; lipCol: number } | null;
  bonus: { rampCol: number; lipCol: number; cliffCol: number } | null;
  safeZone: { fromCol: number; toCol: number } | null;
  prompts: PromptDef[];
  hints: HintDef[];
}

export function levelOf(stage: StageDef): LevelData {
  return {
    id: stage.id,
    name: stage.name,
    tile: TILE,
    baselineY: BASELINE_Y,
    waterLineY: WATER_LINE_Y,
    waterKillY: WATER_KILL_Y,
    stageCols: stage.cols,
    stageWidth: stage.width,
    worldStartX: WORLD_START_X,
    worldEndX: worldEndX(stage.width),
    sections: stage.sections,
    checkpoints: stage.checkpoints,
    collectibles: stage.collectibles,
    obstacles: stage.hazards.obstacles,
    monkeys: stage.hazards.monkeys,
    cow: stage.hazards.cow,
    boulder: stage.hazards.boulder,
    finish: { col: stage.finish.col },
    kicker: stage.kicker,
    bonus: stage.bonus,
    safeZone: stage.safeZone,
    prompts: stage.prompts,
    hints: stage.hints,
  };
}
