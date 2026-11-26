// The stage registry (v1.9). The stages in riding order, and the journey that strings them together.
// Everything that lists stages (the STAGES screen, the unlocks, the journey) reads this; adding a stage
// is one line in each of the two lists below.

import { HAMPI } from './hampi';
import type { StageDef, StageId } from './stage';

export type { LevelData, MedalTimes, StageDef, StageId } from './stage';
export { levelOf, medalsFor } from './stage';

const registry: StageDef[] = [];

/** Add a stage to the registry (its position is its stage number). An id can be registered once. */
export function registerStage(stage: StageDef): void {
  if (registry.some((s) => s.id === stage.id)) throw new Error(`stage "${stage.id}" is registered twice`);
  registry.push(stage);
}

registerStage(HAMPI);
// registerStage(GOA);
// registerStage(LADAKH);

/**
 * The journey: these stages, in this order. (A list of ids, so a journey can be shorter than the registry
 * while a stage is being built.)
 */
export const JOURNEY_ORDER: readonly StageId[] = ['hampi'];

/** Every registered stage, in order. */
export function stages(): readonly StageDef[] {
  return registry;
}

/** The first stage: always unlocked, and the backdrop of the menus. */
export const FIRST_STAGE: StageDef = HAMPI;

export function isStageId(v: unknown): v is StageId {
  return typeof v === 'string' && registry.some((s) => s.id === v);
}

/** The stage for an id; anything unknown is the first stage. */
export function stageDef(id: unknown): StageDef {
  return registry.find((s) => s.id === id) ?? FIRST_STAGE;
}

/** A stage's number as the player sees it (1-based position in the registry). */
export function stageNumber(id: StageId): number {
  return Math.max(0, registry.findIndex((s) => s.id === id)) + 1;
}

/** "STAGE 1: HAMPI AT DUSK" */
export function stageTitle(stage: StageDef): string {
  return `STAGE ${stageNumber(stage.id)}: ${stage.name}`;
}
