// The journey being ridden, and the journey's records (v1.9). The rules are in journey.ts (pure); this
// module holds the one Journey of the page session, and keeps what a journey earns: the stages it has
// reached (unlocks) and the best total time per bike.
//
// Like the single-run bests, storage is only a copy: when it is missing or throws, the unlocks and the
// best time still work until the page is closed. A journey itself is not saved: closing the page ends it.

import type { BikeId } from './bike/bikes';
import {
  clearStage, currentStage, isUnlocked, loseHelmet, reachedStages, restartAfterGameOver, startJourney, totalTimeMs,
  type Journey, type StageResult,
} from './journey';
import { loadJourneyBest, loadUnlocks, saveJourneyBest, saveUnlocks } from './progress';
import { FIRST_STAGE, JOURNEY_ORDER } from './stages';
import type { StageId } from './stages/stage';

let active: Journey | null = null;
/** stages reached in this page session (storage holds the lasting copy) */
const sessionUnlocks = new Set<StageId>();
/** journey bests set in this page session, by route and bike */
const sessionBest = new Map<string, number>();
const bestId = (route: readonly StageId[], bike: BikeId): string => `${route.join('+')}.${bike}`;

/** The journey being ridden, or null. */
export function activeJourney(): Journey | null {
  return active;
}

/** Every stage reached in a journey so far (this session's and the remembered ones). */
export function reached(): StageId[] {
  return [...new Set([...loadUnlocks(), ...sessionUnlocks])];
}

/** Can this stage be picked for a single run? */
export function stageUnlocked(id: StageId): boolean {
  return isUnlocked(id, FIRST_STAGE.id, reached());
}

function remember(ids: readonly StageId[]): void {
  const before = reached();
  const fresh = ids.filter((id) => !before.includes(id));
  if (fresh.length === 0) return;
  for (const id of fresh) sessionUnlocks.add(id);
  saveUnlocks([...before, ...fresh]);
}

/** A bike's best journey time over a route (ms), or null. */
export function journeyBest(bike: BikeId, route: readonly StageId[] = JOURNEY_ORDER): number | null {
  return sessionBest.get(bestId(route, bike)) ?? loadJourneyBest(route, bike);
}

/** Start a journey on a bike (it replaces any journey in progress). Its first stage counts as reached. */
export function beginJourney(bike: BikeId, route: readonly StageId[] = JOURNEY_ORDER): Journey {
  active = startJourney(bike, route);
  remember(reachedStages(active));
  return active;
}

/** Leave the journey (QUIT JOURNEY, or the finish screen's way out). Unlocks and bests stay. */
export function endJourney(): void {
  active = null;
}

/** A helmet is lost. Returns the journey after it (status 'gameover' when that was the last one). */
export function journeyLoseHelmet(): Journey | null {
  if (active) active = loseHelmet(active);
  return active;
}

/** After the game over screen: the same stage again, with 5 helmets. */
export function journeyRestartStage(): Journey | null {
  if (active) active = restartAfterGameOver(active);
  return active;
}

export interface JourneyFinishInfo {
  totalMs: number;
  /** the bike's best over this route before this journey (null = none) */
  prevBestMs: number | null;
  newBest: boolean;
  /** whether the new best reached storage (the screen is the same either way) */
  saved: boolean;
}

/**
 * The stage being ridden is cleared. The next stage (if there is one) is unlocked; after the last one the
 * journey's total is folded into the bike's best. Returns the journey and, when it is done, the totals.
 */
export function journeyClearStage(result: StageResult): { journey: Journey; finish: JourneyFinishInfo | null } | null {
  if (!active) return null;
  active = clearStage(active, result);
  remember(reachedStages(active));
  if (active.status !== 'done') return { journey: active, finish: null };
  const totalMs = totalTimeMs(active);
  const prevBestMs = journeyBest(active.bike, active.route);
  const newBest = prevBestMs === null || totalMs < prevBestMs;
  let saved = false;
  if (newBest) {
    sessionBest.set(bestId(active.route, active.bike), totalMs);
    saved = saveJourneyBest(active.route, active.bike, totalMs);
  }
  return { journey: active, finish: { totalMs, prevBestMs, newBest, saved } };
}

export { currentStage };
