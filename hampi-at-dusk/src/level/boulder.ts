// A rolling boulder (v1.7: Hampi's temple terrace). Pure logic, no Phaser: the Game scene, the unit
// tests and the headless bot all step the same state machine.
//
// hidden -> (bike x reaches the trigger) -> roll (left, at def.speed, one fixed step at a time)
//        -> (reaches its end column) -> gone. It advances on game time only, so it is deterministic.
//
// v1.9: the numbers come from the stage (a BoulderDef); boulderModel(def) is the machine for one boulder.

import { BASELINE_Y, TILE, type BoulderDef } from './level';
import type { Box } from './terrain';

export type BoulderPhase = 'hidden' | 'roll' | 'gone';

export interface BoulderState {
  phase: BoulderPhase;
  /** left edge of the hitbox (world px) */
  x: number;
  /** seconds since it started rolling (0 while hidden) */
  t: number;
}

export interface BoulderModel {
  readonly def: BoulderDef;
  readonly triggerX: number;
  readonly spawnX: number;
  readonly endX: number;
  /** the surface it rolls on */
  readonly groundY: number;
  create(): BoulderState;
  /**
   * One fixed step. bikeX is the bike's x after its own step (pass -Infinity while the bike is crashed:
   * a hidden boulder then stays hidden; a rolling one rolls on).
   * Returns the event of this step: 'start' when it begins to roll, 'break' when it breaks up, else null.
   */
  step(b: BoulderState, bikeX: number, dt: number): 'start' | 'break' | null;
  /** The hitbox at a given left edge. */
  boxAt(x: number, groundY?: number): Box;
  /** The hitbox while it rolls; null when it is hidden or gone (nothing to hit). */
  box(b: BoulderState): Box | null;
  /**
   * Where a bike riding at `speed` from the trigger meets the boulder (the bike's x when the two centres
   * coincide). The bot plans a hop centred on this point.
   */
  meetX(speed: number): number;
}

export function boulderModel(def: BoulderDef): BoulderModel {
  const triggerX = def.triggerCol * TILE;
  const spawnX = def.spawnCol * TILE;
  const endX = def.endCol * TILE;
  const groundY = BASELINE_Y - def.terraceH * TILE;
  const boxAt = (x: number, y: number = groundY): Box => ({ x, y: y - def.hitH, w: def.hitW, h: def.hitH });
  return {
    def, triggerX, spawnX, endX, groundY, boxAt,
    create: () => ({ phase: 'hidden', x: spawnX, t: 0 }),
    step(b, bikeX, dt) {
      if (b.phase === 'hidden') {
        if (bikeX >= triggerX) {
          b.phase = 'roll';
          return 'start';
        }
        return null;
      }
      if (b.phase === 'roll') {
        b.x -= def.speed * dt;
        b.t += dt;
        if (b.x <= endX) {
          b.phase = 'gone';
          return 'break';
        }
      }
      return null;
    },
    box: (b) => (b.phase === 'roll' ? boxAt(b.x) : null),
    meetX(speed) {
      const d = spawnX + def.hitW / 2 - triggerX;
      return triggerX + (d * speed) / (speed + def.speed);
    },
  };
}
