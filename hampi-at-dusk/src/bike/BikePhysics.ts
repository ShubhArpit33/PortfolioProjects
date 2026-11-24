// Pure, deterministic bike physics (GAME_SPEC.md section 4). No Phaser imports.
//
// (x, y) is the wheel-contact midpoint. Angles are in degrees, positive = nose up / uphill.
// y grows downward (screen space), so "above the surface" means a smaller y.

import { CONFIG, type Config } from '../config';
import { WATER_KILL_Y, WORLD_END_X, WORLD_START_X } from '../level/levelData';
import { TERRAIN, type Box, type Terrain } from '../level/terrain';

export const FIXED_DT = 1 / 120;
export const HOP_COYOTE_S = 0.08;
export const HOP_BUFFER_S = 0.1;

const DEG = Math.PI / 180;

export interface BikeInput {
  throttle?: boolean;
  brake?: boolean;
  hop?: boolean;
  boost?: boolean;
  tiltUp?: boolean;
  tiltDown?: boolean;
}

export type CrashCause = 'landing' | 'wall' | 'water' | 'obstacle' | 'cow' | 'restart';
export type LandingKind = 'silent' | 'clean' | 'safe' | 'crash';

export interface BikeState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** speed along the slope while grounded (negative = backing up, never below -reverseSpeed); |velocity| snapshot while airborne */
  v: number;
  angle: number;
  grounded: boolean;
  boost: number; // 0..1
  /** null while riding; set once on a crash, after which step() is a no-op */
  crashed: CrashCause | null;

  // --- internals ---
  /** seconds since leaving the ground (0 while grounded) */
  airTime: number;
  /** seconds of coyote time left (only after leaving the ground without a hop, off a hop-able segment) */
  coyote: number;
  /** seconds the buffered hop press stays valid */
  hopBuffer: number;
  /** hop input level on the previous step (for edge detection) */
  hopHeld: boolean;
  /** true while boost is actually being applied this step */
  boosting: boolean;
  /**
   * Seconds Left must still be held at a standstill before it starts backing the bike up. Armed whenever
   * Left is used as a brake on a forward-moving bike; cleared on release (a fresh press backs up at once).
   */
  reverseWait: number;
  /**
   * Degrees turned since leaving the ground (signed: positive = nose up / backflip direction). Tilt input
   * and the idle nose drift both count. 0 while grounded.
   */
  spin: number;
  /** current rate of a held tilt, deg/s (airTiltSpeed .. airTiltMaxSpeed) */
  tiltRate: number;
  /** direction of the tilt held on the previous airborne step: 1 up, -1 down, 0 none */
  tiltDir: number;

  // --- one-step events (reset at the start of every step) ---
  evLanding: LandingKind | null;
  evHop: boolean;
  /** full flips completed by the landing of this step (signed: + backflips, - frontflips); 0 on a crash */
  evFlips: number;
  /** speed into the ground (px/s) of a landing this step (clean, safe or crash); 0 otherwise */
  evImpact: number;
}

export function createBikeState(x: number, terrain: Terrain = TERRAIN, cfg: Config = CONFIG): BikeState {
  const y = terrain.surfaceY(x);
  if (y === null) throw new Error(`createBikeState: x=${x} is over a gap`);
  return {
    x, y, vx: 0, vy: 0, v: 0,
    angle: terrain.slopeAngle(x),
    grounded: true,
    boost: 1,
    crashed: null,
    airTime: 0, coyote: 0, hopBuffer: 0, hopHeld: false, boosting: false, reverseWait: 0,
    spin: 0, tiltRate: cfg.airTiltSpeed, tiltDir: 0,
    evLanding: null, evHop: false, evFlips: 0, evImpact: 0,
  };
}

/** Normalise an angle (degrees) to [-180, 180]. */
export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  else if (a < -180) a += 360;
  return a;
}

/** Pure landing evaluation: 'clean' | 'safe' | 'crash' from the bike angle and the slope angle. */
export function evaluateLanding(
  bikeAngle: number,
  slopeAngle: number,
  cfg: Config = CONFIG,
): 'clean' | 'safe' | 'crash' {
  const diff = Math.abs(normalizeAngle(bikeAngle - slopeAngle));
  if (diff <= cfg.cleanLandingAngle) return 'clean';
  if (diff <= cfg.safeLandingAngle) return 'safe';
  return 'crash';
}

/**
 * Full flips in a cumulative air rotation (degrees), signed: + backflips (nose up), - frontflips.
 * Rounded to the nearest whole turn: a landing the bike survives is within safeLandingAngle of the
 * slope, so the rotation is always close to a multiple of 360 (give or take the take-off / landing
 * slope difference), and anything under half a turn is just levelling out.
 */
export function countFlips(spinDeg: number): number {
  const n = Math.round(Math.abs(spinDeg) / 360);
  return n === 0 ? 0 : spinDeg < 0 ? -n : n;
}

function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(target, value + maxDelta);
  return Math.max(target, value - maxDelta);
}

/**
 * Advance the bike by one fixed step. Returns a new state; the input state is not modified.
 * Entities (obstacles, diyas, cow, monkeys) are handled by the caller with the helpers below.
 */
export function step(
  prev: BikeState,
  input: BikeInput,
  dt: number = FIXED_DT,
  terrain: Terrain = TERRAIN,
  cfg: Config = CONFIG,
): BikeState {
  if (prev.crashed !== null) return prev;
  const s: BikeState = { ...prev, evLanding: null, evHop: false, evFlips: 0, evImpact: 0, boosting: false };

  // Hop buffer: a press (rising edge) stays valid for HOP_BUFFER_S.
  const hop = input.hop === true;
  if (hop && !s.hopHeld) s.hopBuffer = HOP_BUFFER_S;
  s.hopHeld = hop;

  if (s.grounded) stepGround(s, input, dt, terrain, cfg);
  else stepAir(s, input, dt, terrain, cfg);

  if (s.hopBuffer > 0) s.hopBuffer = Math.max(0, s.hopBuffer - dt);

  // World bounds: invisible walls at both ends of the stage.
  if (s.x > WORLD_END_X) {
    s.x = WORLD_END_X;
    s.vx = 0;
    if (s.grounded) s.v = 0;
  } else if (s.x < WORLD_START_X) {
    s.x = WORLD_START_X;
    if (s.vx < 0) s.vx = 0;
    if (s.grounded) {
      if (s.v < 0) s.v = 0;
      const y = terrain.surfaceY(s.x);
      if (y !== null) s.y = y;
    }
  }
  return s;
}

function stepGround(s: BikeState, input: BikeInput, dt: number, terrain: Terrain, cfg: Config): void {
  const theta = terrain.slopeAngle(s.x) * DEG;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);

  // 1. Speed along the slope.
  const v0 = s.v;
  let v = v0 - cfg.gravity * sin * cfg.slopeGravityFactor * dt;
  const boosting = input.boost === true && s.boost > 0;
  const brake = input.brake === true;
  if (!brake) s.reverseWait = 0;
  if (boosting) {
    v = Math.max(0, Math.min(cfg.boostSpeed, v + cfg.boostAccel * dt));
    s.boost = Math.max(0, s.boost - cfg.boostDrainPerSec * dt);
    s.boosting = true;
  } else {
    if (v0 > 0) {
      // Moving forward: Left is a brake and never carries the bike through zero.
      if (brake) {
        v -= cfg.brake * dt;
        s.reverseWait = cfg.reverseHoldDelayMs / 1000;
      } else if (v > cfg.topSpeed) v = Math.max(cfg.topSpeed, v - cfg.brake * dt); // decay, no instant clamp
      else if (input.throttle) v = Math.min(cfg.topSpeed, v + cfg.accel * dt);
      else v -= cfg.coastDrag * dt;
      if (v < 0) v = 0;
    } else if (brake) {
      // Standstill or already backing up: paddle backward with the feet. The rider's feet hold the bike
      // against the slope, so slope gravity does not apply here. A brake press that has just stopped
      // the bike first has to be held for reverseHoldDelayMs.
      if (v0 === 0 && s.reverseWait > 0) {
        s.reverseWait -= dt;
        if (s.reverseWait < 1e-9) s.reverseWait = 0; // whole number of steps, whatever the rounding
        v = 0;
      } else {
        v = Math.max(-cfg.reverseSpeed, v0 - cfg.reverseAccel * dt);
      }
    } else if (v0 < 0) {
      // Backing up with Left released (or Right pressed): stop first, at the brake rate.
      v = Math.min(0, v0 + cfg.brake * dt);
    } else {
      // At rest.
      if (input.throttle) v = Math.min(cfg.topSpeed, v + cfg.accel * dt);
      else v -= cfg.coastDrag * dt;
      if (v < 0) v = 0;
    }
    // No regen while Shift is held.
    if (!input.boost) s.boost = Math.min(1, s.boost + cfg.boostRegenPerSec * dt);
  }
  s.v = v;

  // 2. Velocity vector along the slope.
  s.vx = v * cos;
  s.vy = -v * sin;

  // 4. Hop (ground only; not on noHop segments, and not while backing up).
  if (s.hopBuffer > 0 && v >= 0 && !terrain.isNoHop(s.x)) {
    doHop(s, cfg);
    integrateAir(s, dt, terrain, cfg);
    return;
  }

  // 3. Move one step as a projectile.
  const fromPiece = terrain.pieceAt(s.x);
  const leftNoHop = fromPiece !== null && fromPiece.noHop;
  const fromX = s.x;
  const fromY = s.y;
  s.vy += cfg.gravity * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  const surf = terrain.surfaceY(s.x);
  if (v < 0 && surf !== null && fromY - surf > cfg.wallTolerance) {
    // Backing into a vertical face (the foot of the cliff): the bike just stops against it.
    s.x = fromX;
    s.y = fromY;
    s.v = 0;
    s.vx = 0;
    s.vy = 0;
    return;
  }
  let airborne = surf === null || s.y < surf - cfg.airborneEps;
  if (!airborne && surf !== null) {
    // Crossing onto another segment: apply the airborneEps rule as if this step had started exactly
    // at the corner, so that leaving a lip does not depend on where the 120 Hz steps happen to fall.
    const toPiece = terrain.pieceAt(s.x);
    if (toPiece !== null && fromPiece !== null && toPiece !== fromPiece) {
      const separation =
        s.vx * dt * (Math.tan(fromPiece.angle * DEG) - Math.tan(toPiece.angle * DEG)) -
        cfg.gravity * dt * dt;
      if (separation > cfg.airborneEps) {
        airborne = true;
        if (s.y > surf) s.y = surf;
      }
    }
  }
  if (airborne) {
    // Ramp lip, cliff edge or gap: airborne, keep the velocity.
    s.grounded = false;
    s.airTime = dt;
    s.coyote = leftNoHop ? 0 : HOP_COYOTE_S;
    return;
  }
  s.y = surf as number;
  s.airTime = 0;
  s.coyote = 0;
  s.angle = approach(
    s.angle,
    terrain.slopeAngle(s.x),
    cfg.angleEaseDegPerSec * dt,
  );
}

function doHop(s: BikeState, cfg: Config): void {
  s.vy -= cfg.hopVelocity;
  s.grounded = false;
  s.hopBuffer = 0;
  s.coyote = 0;
  s.evHop = true;
}

function stepAir(s: BikeState, input: BikeInput, dt: number, terrain: Terrain, cfg: Config): void {
  // Coyote hop.
  if (s.coyote > 0) {
    if (s.hopBuffer > 0) doHop(s, cfg);
    else s.coyote = Math.max(0, s.coyote - dt);
  }

  // Tilt: up / down rotate; with no input the nose drifts down.
  // A tap turns at airTiltSpeed; holding the same key speeds the turn up to airTiltMaxSpeed (flips).
  const dir = input.tiltUp && !input.tiltDown ? 1 : input.tiltDown && !input.tiltUp ? -1 : 0;
  if (dir !== 0 && dir === s.tiltDir) s.tiltRate = Math.min(cfg.airTiltMaxSpeed, s.tiltRate + cfg.airTiltAccel * dt);
  else s.tiltRate = cfg.airTiltSpeed;
  s.tiltDir = dir;
  let turn = 0;
  if (dir !== 0) turn = dir * s.tiltRate * dt;
  else if (!input.tiltUp && !input.tiltDown) turn = -cfg.airNoseDropSpeed * dt;
  s.spin += turn;
  s.angle = normalizeAngle(s.angle + turn);

  integrateAir(s, dt, terrain, cfg);
}

/** One airborne integration step, including wall / water / landing resolution. */
function integrateAir(s: BikeState, dt: number, terrain: Terrain, cfg: Config): void {
  const wasOverGap = terrain.surfaceY(s.x) === null;
  s.airTime += dt;
  s.vy += cfg.gravity * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.v = Math.hypot(s.vx, s.vy);

  const surf = terrain.surfaceY(s.x);
  if (surf === null) {
    if (s.y > WATER_KILL_Y) s.crashed = 'water';
    return;
  }
  if (s.y < surf) return; // still in the air

  // Gap far wall: entering a solid column from a gap too far below the lip.
  if (wasOverGap && s.y > surf + cfg.wallTolerance) {
    s.crashed = 'wall';
    return;
  }

  // Landing.
  const slope = terrain.slopeAngle(s.x);
  let kind: LandingKind;
  if (s.airTime * 1000 < cfg.minAirMsForLanding) kind = 'silent';
  else kind = evaluateLanding(s.angle, slope, cfg);
  s.evLanding = kind;
  s.y = surf;
  const th = slope * DEG;
  if (kind !== 'silent') s.evImpact = Math.max(0, s.vx * Math.sin(th) + s.vy * Math.cos(th));
  const spin = s.spin;
  s.spin = 0;
  s.tiltRate = cfg.airTiltSpeed;
  s.tiltDir = 0;
  if (kind === 'crash') {
    s.crashed = 'landing';
    return;
  }
  if (kind === 'clean') s.boost = Math.min(1, s.boost + cfg.boostCleanLanding);
  if (kind !== 'silent') {
    // Tricks: every full turn that ends in a landing the bike survives counts as a flip.
    const flips = countFlips(spin);
    if (flips !== 0) {
      s.evFlips = flips;
      s.boost = Math.min(1, s.boost + cfg.boostFlip * Math.abs(flips));
    }
  }
  s.v = Math.max(0, s.vx * Math.cos(th) - s.vy * Math.sin(th));
  s.vx = s.v * Math.cos(th);
  s.vy = -s.v * Math.sin(th);
  s.grounded = true;
  s.airTime = 0;
  s.coyote = 0;
}

// ---------------------------------------------------------------------------
// Collision helpers (entities are driven by the caller).
// ---------------------------------------------------------------------------

/** Bike hitbox: unrotated AABB, bottom-centre at (x, y). */
export function bikeAABB(s: { x: number; y: number }, cfg: Config = CONFIG): Box {
  return { x: s.x - cfg.bikeHitW / 2, y: s.y - cfg.bikeHitH, w: cfg.bikeHitW, h: cfg.bikeHitH };
}

/** Strict AABB overlap (touching edges do not count). */
export function aabbOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Circle vs AABB overlap (touching counts). */
export function circleAABBOverlap(cx: number, cy: number, r: number, b: Box): boolean {
  const nx = cx < b.x ? b.x : cx > b.x + b.w ? b.x + b.w : cx;
  const ny = cy < b.y ? b.y : cy > b.y + b.h ? b.y + b.h : cy;
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

/** True if the bike AABB overlaps any of the solid boxes (pillar / cart: any side, including the top). */
export function hitsObstacle(s: { x: number; y: number }, boxes: readonly Box[], cfg: Config = CONFIG): boolean {
  const bike = bikeAABB(s, cfg);
  for (const b of boxes) if (aabbOverlap(bike, b)) return true;
  return false;
}

/** Diya pickup test: a circle of diyaRadius at the diya centre overlapping the bike AABB. */
export function touchesDiya(
  s: { x: number; y: number },
  centre: { x: number; y: number },
  cfg: Config = CONFIG,
): boolean {
  return circleAABBOverlap(centre.x, centre.y, cfg.diyaRadius, bikeAABB(s, cfg));
}

/** Returns a crashed copy of the state (used by the caller for obstacle / cow / restart crashes). */
export function crash(s: BikeState, cause: CrashCause): BikeState {
  return s.crashed !== null ? s : { ...s, crashed: cause };
}

/** Diya pickup bonus applied to the meter. */
export function addBoost(s: BikeState, amount: number): BikeState {
  return { ...s, boost: Math.min(1, Math.max(0, s.boost + amount)) };
}
