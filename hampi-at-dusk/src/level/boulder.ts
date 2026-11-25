// The rolling boulder on the temple terrace (v1.7). Pure logic, no Phaser: the Game scene, the unit
// tests and the headless bot all step the same state machine.
//
// hidden -> (bike x reaches the trigger) -> roll (left, at BOULDER.speed, one fixed step at a time)
//        -> (reaches the top riser) -> gone. It advances on game time only, so it is deterministic.

import { BASELINE_Y, BOULDER, TILE } from './levelData';
import type { Box } from './terrain';

export type BoulderPhase = 'hidden' | 'roll' | 'gone';

export interface BoulderState {
  phase: BoulderPhase;
  /** left edge of the hitbox (world px) */
  x: number;
  /** seconds since it started rolling (0 while hidden) */
  t: number;
}

export const BOULDER_TRIGGER_X = BOULDER.triggerCol * TILE;
export const BOULDER_SPAWN_X = BOULDER.spawnCol * TILE;
export const BOULDER_END_X = BOULDER.endCol * TILE;
/** the surface it rolls on */
export const BOULDER_GROUND_Y = BASELINE_Y - BOULDER.terraceH * TILE;

export function createBoulder(): BoulderState {
  return { phase: 'hidden', x: BOULDER_SPAWN_X, t: 0 };
}

/**
 * One fixed step. bikeX is the bike's x after its own step (pass -Infinity while the bike is crashed:
 * a hidden boulder then stays hidden; a rolling one rolls on).
 * Returns the event of this step: 'start' when it begins to roll, 'break' when it breaks up, else null.
 */
export function stepBoulder(b: BoulderState, bikeX: number, dt: number): 'start' | 'break' | null {
  if (b.phase === 'hidden') {
    if (bikeX >= BOULDER_TRIGGER_X) {
      b.phase = 'roll';
      return 'start';
    }
    return null;
  }
  if (b.phase === 'roll') {
    b.x -= BOULDER.speed * dt;
    b.t += dt;
    if (b.x <= BOULDER_END_X) {
      b.phase = 'gone';
      return 'break';
    }
  }
  return null;
}

/** The hitbox at a given left edge. */
export function boulderBoxAt(x: number, groundY: number = BOULDER_GROUND_Y): Box {
  return { x, y: groundY - BOULDER.hitH, w: BOULDER.hitW, h: BOULDER.hitH };
}

/** The hitbox while it rolls; null when it is hidden or gone (nothing to hit). */
export function boulderBox(b: BoulderState): Box | null {
  return b.phase === 'roll' ? boulderBoxAt(b.x) : null;
}

/**
 * Where a bike riding at `speed` from the trigger meets the boulder (the bike's x when the two centres
 * coincide). The bot plans a hop centred on this point.
 */
export function boulderMeetX(speed: number): number {
  const d = BOULDER_SPAWN_X + BOULDER.hitW / 2 - BOULDER_TRIGGER_X;
  return BOULDER_TRIGGER_X + (d * speed) / (speed + BOULDER.speed);
}
