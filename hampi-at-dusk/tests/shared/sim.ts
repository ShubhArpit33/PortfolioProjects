// A headless port of the Game scene's ride loop (src/scenes/Game.ts fixedStep / collide / stepAnimals),
// built from the same pure modules the game uses: the bike physics, the terrain, the boulder's state
// machine, the warm-up's no-crash rule, the log's stumble. The unit tests ride it; the e2e bot run checks
// that the real game gives the same times to the millisecond.
// v1.9: it rides any StageDef (default: Hampi); a stage without a cow, monkeys or a boulder simply has none.

import {
  FIXED_DT, aabbOverlap, addBoost, bikeAABB, crash, createBikeState, hitsObstacle, normalizeAngle, step, stumble,
  touchesDiya, wobbleLanding, type BikeInput, type BikeState, type CrashCause,
} from '../../src/bike/BikePhysics';
import type { Config } from '../../src/config';
import { boulderModel, type BoulderPhase } from '../../src/level/boulder';
import { BASELINE_Y, TILE, cameraMaxScrollX, checkpointX, diyaCentre } from '../../src/level/level';
import { obstacleBox, type Box } from '../../src/level/terrain';
import { HAMPI } from '../../src/stages/hampi';
import { levelOf, type StageDef } from '../../src/stages/stage';
import { layout, planHopsFor } from './plan';

/** A stage's solid boxes (pillars, carts) and its logs. */
export const solidBoxes = (stage: StageDef): Box[] =>
  stage.hazards.obstacles.filter((o) => o.type !== 'log').map((o) => obstacleBox(o, stage.terrain));
export const logBoxes = (stage: StageDef): Box[] =>
  stage.hazards.obstacles.filter((o) => o.type === 'log').map((o) => obstacleBox(o, stage.terrain));
/** Hampi's, for the tests written against it. */
export const SOLID_BOXES: Box[] = solidBoxes(HAMPI);
export const LOG_BOXES: Box[] = logBoxes(HAMPI);
export const SAFE_X1 = HAMPI.safeZone!.toCol * TILE;

export interface RideOpts {
  /** take-off x of each hop, ascending (default: the bot's plan for this bike) */
  hops?: readonly number[];
  /** 'bot' = hold the bike level in the air (the bot's +/- 3 deg rule); 'none' = no tilt input at all */
  tilt?: 'bot' | 'none';
  /** hold boost from this x on (default: the last checkpoint, as the bot does) */
  boostFrom?: number;
  /** honk at the monkeys, as the bot does (default true) */
  honk?: boolean;
  /** start at this checkpoint, at rest (default 0) */
  startCp?: number;
  /** start at rest at this column instead (the middle of it), like __test.startAtCol */
  startCol?: number;
  /** stop once the bike is on the ground at or past this x */
  untilX?: number;
  /** switch the warm-up's no-crash rule off (to show what it is for) */
  noSafe?: boolean;
  /** replaces the bot's input entirely: (state, step index, boulder x or null) -> input */
  inputAt?: (s: BikeState, step: number, boulderX: number | null) => BikeInput;
}

export interface RideResult {
  /** crossed the line, or reached untilX */
  finished: boolean;
  steps: number;
  timeMs: number;
  crash: CrashCause | null;
  crashX: number;
  diyas: number;
  /** columns of the diyas that were missed */
  missing: number[];
  flips: number;
  /** stumbles on a monkey, on the log, and warm-up wobbles */
  stumbles: number;
  logHits: number;
  wobbles: number;
  /** the worst landing: degrees off the slope */
  worstLanding: number;
  boostLeft: number;
  hopsUsed: number;
  boulder: BoulderPhase;
  /** the bike's x when the boulder's centre went past it (-1: they never met) */
  boulderMetX: number;
  /** the step at which each checkpoint was reached (-1: never) */
  cpSteps: number[];
  /** camera: the smallest and largest scroll change in one step, and where the bike sat on screen */
  cam: { minStep: number; maxStep: number; minScreenX: number; maxScreenX: number };
  state: BikeState;
}

/** The bot's hop plan for a bike (the same one the e2e bot rides). */
export function botHops(cfg: Config, stage: StageDef = HAMPI): number[] {
  const level = levelOf(stage);
  return planHopsFor(layout(level), level, cfg).hops;
}

export function ride(cfg: Config, o: RideOpts = {}, stage: StageDef = HAMPI): RideResult {
  const TERRAIN = stage.terrain;
  const CHECKPOINTS = stage.checkpoints;
  const DIYAS = stage.collectibles;
  const COW = stage.hazards.cow;
  const MONKEYS = stage.hazards.monkeys;
  const SOLID = solidBoxes(stage);
  const LOGS = logBoxes(stage);
  const safeX1 = stage.safeZone ? stage.safeZone.toCol * TILE : -Infinity;
  const FINISH_X = stage.finish.col * TILE;
  const CAMERA_MAX_SCROLL_X = cameraMaxScrollX(stage.width);
  const rock = stage.hazards.boulder ? boulderModel(stage.hazards.boulder) : null;

  const hops = o.hops ?? botHops(cfg, stage);
  const boostFrom = o.boostFrom ?? checkpointX(CHECKPOINTS[CHECKPOINTS.length - 1]!);
  const honkFrom = MONKEYS ? MONKEYS.triggerCol * TILE : Infinity;
  const honkTo = MONKEYS ? Math.max(...MONKEYS.spawnCols) * TILE : -Infinity;
  const startX = o.startCol !== undefined ? o.startCol * TILE + TILE / 2 : checkpointX(CHECKPOINTS[o.startCp ?? 0]!);
  let b = createBikeState(startX, TERRAIN, cfg);
  let lastGroundX = b.x;
  const logTouch: boolean[] = [];
  const boulder = rock ? rock.create() : { phase: 'hidden' as BoulderPhase, x: 0, t: 0 };
  const cow = { state: (COW ? 'stand' : 'gone') as 'stand' | 'walk' | 'gone', x: (COW?.col ?? 0) * TILE, waitT: 0, walkT: 0 };
  const monkeys = (MONKEYS?.spawnCols ?? []).map((c, i) => ({
    state: 'hidden' as 'hidden' | 'run' | 'sit' | 'leap' | 'gone', x: c * TILE, sitX: MONKEYS!.sitCols[i]! * TILE, leapT: 0,
  }));
  const collidable = (m: { state: string }): boolean => m.state === 'run' || m.state === 'sit';
  let troopTriggered = false;
  const got = new Set<number>();
  const cpSteps = CHECKPOINTS.map(() => -1);
  let next = 0, hopHeld = false, honkHeld = false, steps = 0;
  let flips = 0, stumbles = 0, logHits = 0, wobbles = 0, worstLanding = 0, boulderMetX = -1;
  let crashCause: CrashCause | null = null;
  let finished = false;

  // camera (Game.stepCamera)
  const lookFor = (speed: number): number => {
    if (speed <= cfg.topSpeed) return cfg.cameraLookAheadRest + (cfg.cameraLookAhead - cfg.cameraLookAheadRest) * Math.max(0, speed / cfg.topSpeed);
    const k = Math.min(1, (speed - cfg.topSpeed) / (cfg.boostSpeed - cfg.topSpeed));
    return cfg.cameraLookAhead + (cfg.cameraLookAheadBoost - cfg.cameraLookAhead) * k;
  };
  const clampCam = (v: number): number => Math.min(CAMERA_MAX_SCROLL_X, Math.max(0, v));
  let look = cfg.cameraLookAheadRest;
  let camX = clampCam(b.x + look - 240);
  const cam = { minStep: Infinity, maxStep: -Infinity, minScreenX: Infinity, maxScreenX: -Infinity };

  while (steps < 120 * 300) {
    const s = b;
    steps++;
    // the bot: one hop per planned x (edge-triggered), level in the air, honk at the monkeys, boost at the river
    const hop: boolean = !hopHeld && s.grounded && next < hops.length && s.x >= hops[next]!;
    const honk = o.honk !== false && s.x >= honkFrom && s.x <= honkTo && (steps - 1) % 10 < 5;
    const tilt = (o.tilt ?? 'bot') === 'bot';
    let input: BikeInput = {
      throttle: true, hop, boost: s.x >= boostFrom,
      tiltDown: tilt && !s.grounded && s.angle > 3, tiltUp: tilt && !s.grounded && s.angle < -3,
    };
    if (o.inputAt) input = o.inputAt(s, steps - 1, boulder.phase === 'roll' ? boulder.x : null);

    if (honk && !honkHeld && !o.inputAt) {
      for (const m of monkeys) {
        if (collidable(m) && Math.abs(s.x - (m.x + MONKEYS!.hitW / 2)) <= cfg.honkRange) { m.state = 'leap'; m.leapT = 0; }
      }
    }
    honkHeld = honk;

    const prev = s;
    b = step(prev, input, FIXED_DT, TERRAIN, cfg);

    if (b.crashed === null && b.evLanding && b.evLanding !== 'silent') {
      // (a landing does not change the angle: it is eased to the slope on the following grounded steps)
      worstLanding = Math.max(worstLanding, Math.abs(normalizeAngle(b.angle - TERRAIN.slopeAngle(b.x))));
      flips += Math.abs(b.evFlips);
    }
    // the warm-up's no-crash rule
    if (prev.grounded) lastGroundX = prev.x;
    if (b.crashed === 'landing' && !o.noSafe && lastGroundX < safeX1) {
      b = wobbleLanding(b, cfg.monkeyStumbleFactor, TERRAIN);
      wobbles++;
    }

    // Game.collide
    if (b.crashed === null) {
      const rockBox = rock ? rock.box(boulder) : null;
      const slot = TERRAIN.gapAt(b.x);
      if (hitsObstacle(b, SOLID, cfg)) b = crash(b, 'obstacle');
      else if (rockBox && aabbOverlap(bikeAABB(b, cfg), rockBox)) b = crash(b, 'obstacle');
      else if (slot !== null && slot.step && b.y > slot.nearY + cfg.wallTolerance) b = crash(b, 'wall');
    }
    if (b.crashed === null) {
      LOGS.forEach((box, i) => {
        const touching = aabbOverlap(bikeAABB(b, cfg), box);
        if (touching && !logTouch[i]) { b = stumble(b, cfg.monkeyStumbleFactor); stumbles++; logHits++; }
        logTouch[i] = touching;
      });
      if (COW && cow.state === 'stand' && aabbOverlap(bikeAABB(b, cfg), { x: cow.x, y: BASELINE_Y - COW.h, w: COW.w, h: COW.h })) {
        if (Math.abs(b.vx) > cfg.cowCrashSpeed) b = crash(b, 'cow');
        else {
          const fromLeft = prev.x <= cow.x + COW.w / 2;
          const x = fromLeft ? cow.x - cfg.bikeHitW / 2 : cow.x + COW.w + cfg.bikeHitW / 2;
          b = { ...b, x, vx: 0, v: b.grounded ? 0 : Math.abs(b.vy) };
        }
      }
    }
    if (b.crashed === null) {
      for (const m of monkeys) {
        const box = { x: m.x, y: BASELINE_Y - MONKEYS!.hitH, w: MONKEYS!.hitW, h: MONKEYS!.hitH };
        if (collidable(m) && aabbOverlap(bikeAABB(b, cfg), box)) {
          b = stumble(b, cfg.monkeyStumbleFactor);
          m.state = 'leap';
          m.leapT = 0;
          stumbles++;
        }
      }
      DIYAS.forEach((d, i) => {
        if (!got.has(i) && touchesDiya(b, diyaCentre(d), cfg)) { got.add(i); b = addBoost(b, cfg.boostDiya); }
      });
    }

    // Game.stepAnimals
    if (COW && cow.state === 'stand') {
      const bb = bikeAABB(b, cfg);
      const gap = Math.max(cow.x - (bb.x + bb.w), bb.x - (cow.x + COW.w), 0);
      if (gap <= COW.waitRangeTiles * TILE && Math.hypot(b.vx, b.vy) < COW.waitMaxSpeed && b.crashed === null) {
        cow.waitT += FIXED_DT;
        if (cow.waitT >= COW.waitSeconds) { cow.state = 'walk'; cow.walkT = 0; }
      } else cow.waitT = 0;
    } else if (COW && cow.state === 'walk') {
      cow.walkT += FIXED_DT;
      cow.x += COW.walkSpeed * FIXED_DT;
      if (cow.walkT >= COW.walkSeconds) cow.state = 'gone';
    }
    if (MONKEYS && !troopTriggered && b.crashed === null && b.x >= MONKEYS.triggerCol * TILE) {
      troopTriggered = true;
      for (const m of monkeys) if (m.state === 'hidden') m.state = 'run';
    }
    for (const m of monkeys) {
      if (m.state === 'run') {
        m.x -= MONKEYS!.runSpeed * FIXED_DT;
        if (m.x <= m.sitX) { m.x = m.sitX; m.state = 'sit'; }
      } else if (m.state === 'leap') {
        m.leapT += FIXED_DT;
        if (m.leapT >= 0.7) m.state = 'gone';
      }
    }
    if (rock) {
      rock.step(boulder, b.crashed === null ? b.x : -Infinity, FIXED_DT);
      if (boulder.phase === 'roll' && boulderMetX < 0 && boulder.x + rock.def.hitW / 2 <= b.x) boulderMetX = b.x;
    }

    CHECKPOINTS.forEach((c, i) => { if (cpSteps[i]! < 0 && b.x >= checkpointX(c)) cpSteps[i] = steps; });

    // Game.stepCamera
    {
      const speed = b.grounded ? b.v : Math.abs(b.vx);
      look += (lookFor(speed) - look) * (1 - Math.exp(-FIXED_DT / cfg.cameraLookSmoothS));
      const k = 1 - Math.pow(1 - cfg.cameraLerp, FIXED_DT * 60);
      const before = camX;
      camX += (clampCam(b.x + look - 240) - camX) * k;
      cam.minStep = Math.min(cam.minStep, camX - before);
      cam.maxStep = Math.max(cam.maxStep, camX - before);
      if (camX > 1 && b.x + 240 < CAMERA_MAX_SCROLL_X) {
        cam.minScreenX = Math.min(cam.minScreenX, b.x - camX);
        cam.maxScreenX = Math.max(cam.maxScreenX, b.x - camX);
      }
    }

    hopHeld = hop;
    if (hop && !b.grounded) next++;
    if (b.crashed !== null) { crashCause = b.crashed; break; }
    if (b.x >= FINISH_X) { finished = true; break; }
    if (o.untilX !== undefined && b.x >= o.untilX && b.grounded) { finished = true; break; }
  }
  const missing = DIYAS.map((d, i) => (got.has(i) ? -1 : d.col)).filter((c) => c >= 0);
  return {
    finished, steps, timeMs: Math.round((steps * 1000) / 120), crash: crashCause, crashX: b.x, diyas: got.size, missing,
    flips, stumbles, logHits, wobbles, worstLanding, boostLeft: b.boost, hopsUsed: next, boulder: boulder.phase, boulderMetX,
    cpSteps, cam, state: b,
  };
}
