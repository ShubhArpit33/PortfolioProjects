// The journey (v1.9): its rules and its state. Pure: no Phaser, no storage, no clock. The scenes hold
// one Journey at a time (src/journeyRun.ts) and replace it with what these functions return.
//
// The rules:
// - One bike for the whole journey, over a route of stages ridden in order.
// - 10 helmets (v1.9.1; was 5). Losing one: a crash, going back to the checkpoint with C, or RESTART STAGE from the pause
//   menu. (A bad landing in a stage's warm-up zone is a wobble, not a crash, so it costs nothing.)
// - Helmets carry over from stage to stage; entering the next stage gives one back, up to 5.
// - No helmets left = game over: the stage being ridden starts again with 10 helmets. The bike and the
//   stages already cleared are kept.
// - The journey's time is the sum of the times of the runs that cleared each stage.
// - Reaching a stage in a journey unlocks it for single runs (the first stage is always unlocked).

import type { BikeId } from './bike/bikes';
import type { Medal } from './progress';
import type { StageId } from './stages/stage';

export const MAX_HELMETS = 10; // v1.9.1: was 5 (user's call)

/** A cleared stage, as the journey remembers it. */
export interface StageResult {
  stage: StageId;
  timeMs: number;
  /** collectibles picked up, and how many the stage has */
  collected: number;
  total: number;
  crashes: number;
  flips: number;
  /** the medal that time earns on that stage and bike (the same targets as a single run) */
  medal: Medal | null;
}

/** riding = on a stage; gameover = out of helmets, the stage is about to start again; done = the last stage is cleared */
export type JourneyStatus = 'riding' | 'gameover' | 'done';

export interface Journey {
  readonly bike: BikeId;
  /** the stages, in riding order */
  readonly route: readonly StageId[];
  /** index into route of the stage being ridden (the last one once the journey is done) */
  readonly index: number;
  readonly helmets: number;
  /** one per cleared stage, in order */
  readonly results: readonly StageResult[];
  readonly gameOvers: number;
  readonly status: JourneyStatus;
}

export function startJourney(bike: BikeId, route: readonly StageId[]): Journey {
  if (route.length === 0) throw new Error('a journey needs at least one stage');
  return { bike, route: [...route], index: 0, helmets: MAX_HELMETS, results: [], gameOvers: 0, status: 'riding' };
}

/** The stage being ridden (after the journey is done: the last one). */
export function currentStage(j: Journey): StageId {
  return j.route[j.index]!;
}

/** A crash (or anything else that costs a helmet). The last helmet makes it game over. */
export function loseHelmet(j: Journey): Journey {
  if (j.status !== 'riding') return j;
  const helmets = j.helmets - 1;
  return helmets > 0 ? { ...j, helmets } : { ...j, helmets: 0, status: 'gameover', gameOvers: j.gameOvers + 1 };
}

/** After a game over: the same stage again, with a full set of helmets. Nothing else changes. */
export function restartAfterGameOver(j: Journey): Journey {
  if (j.status !== 'gameover') return j;
  return { ...j, helmets: MAX_HELMETS, status: 'riding' };
}

/**
 * The stage being ridden is cleared. On to the next one with one helmet back (at most 5), or, after the
 * last stage, done.
 */
export function clearStage(j: Journey, result: StageResult): Journey {
  if (j.status !== 'riding') return j;
  if (result.stage !== currentStage(j)) throw new Error(`cleared "${result.stage}" while riding "${currentStage(j)}"`);
  const results = [...j.results, result];
  if (j.index + 1 >= j.route.length) return { ...j, results, status: 'done' };
  return { ...j, results, index: j.index + 1, helmets: Math.min(MAX_HELMETS, j.helmets + 1) };
}

/** The journey's time so far: the sum of the cleared stages' times. */
export function totalTimeMs(j: Journey): number {
  return j.results.reduce((sum, r) => sum + r.timeMs, 0);
}

/** The stages this journey has reached (ridden or being ridden), in order, each once. */
export function reachedStages(j: Journey): StageId[] {
  return [...new Set(j.route.slice(0, j.index + 1))];
}

/**
 * Is a stage open for single runs? The first stage always is; any other once a journey has reached it.
 * `reached` is what has been remembered from earlier journeys.
 */
export function isUnlocked(stage: StageId, first: StageId, reached: readonly StageId[]): boolean {
  return stage === first || reached.includes(stage);
}
