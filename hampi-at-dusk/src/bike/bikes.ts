// The roster (v1.6): three bikes, each a set of overrides on CONFIG. Pure data, no Phaser.
//
// CONFIG itself is the Daybreak (the bike the stage was built around) and is never changed here.
// All three share the 24 x 16 hitbox and the same wheel contact points; only the feel differs.
// Every number below was measured against the stage first (DECISIONS.md, v1.6).

import { CONFIG, type Config } from '../config';

export type BikeId = 'tonup' | 'daybreak' | 'sundowner';
export type MedalTimes = Readonly<Record<'gold' | 'silver' | 'bronze', number>>;

export interface BikeStats {
  speed: number; pull: number; boost: number; flip: number; grip: number;
}

export interface BikeDef {
  id: BikeId;
  name: string;
  /** one line for the select screen (ASCII, at most 42 characters) */
  tagline: string;
  /** what this bike changes; everything else is CONFIG */
  overrides: Readonly<Partial<Config>>;
  cfg: Config;
  /** medal targets (ms, inclusive), set from each bike's measured bot run */
  medalsMs: MedalTimes;
  /** select-screen bars, 1..5, derived from cfg (see statBars) */
  stats: BikeStats;
}

export const BIKE_ORDER: readonly BikeId[] = ['tonup', 'daybreak', 'sundowner'];
export const DEFAULT_BIKE: BikeId = 'daybreak';

const OVERRIDES: Record<BikeId, Partial<Config>> = {
  // Cafe racer: fast and sharp. Long low hops, quick flips, a strict landing.
  tonup: {
    topSpeed: 288, accel: 180, boostSpeed: 420, boostAccel: 800, boostDrainPerSec: 0.72, boostRegenPerSec: 0.096,
    boostCleanLanding: 0.30, boostDiya: 0.12, hopVelocity: 260, airTiltSpeed: 200, airTiltAccel: 900, airTiltMaxSpeed: 520,
    safeLandingAngle: 25, cleanLandingAngle: 7, cameraLookAhead: 124, cameraLookAheadBoost: 184,
  },
  // The all-rounder: CONFIG as it stands.
  daybreak: {},
  // Cruiser: slow, strong off the line, a long gentle boost, lazy in the air, forgiving on the ground.
  sundowner: {
    topSpeed: 204, accel: 220, boostSpeed: 350, boostAccel: 380, boostDrainPerSec: 0.36, boostRegenPerSec: 0.048,
    boostCleanLanding: 0.15, boostDiya: 0.06, airTiltSpeed: 150, airTiltAccel: 500, airTiltMaxSpeed: 360,
    safeLandingAngle: 45, cleanLandingAngle: 13,
  },
};

const NAMES: Record<BikeId, [string, string]> = {
  tonup: ['TON-UP', 'FAST AND SHARP. LAND IT STRAIGHT.'],
  daybreak: ['DAYBREAK', 'THE ALL-ROUNDER. A CLASSIC ROADSTER.'],
  sundowner: ['SUNDOWNER', 'THE BOBBER. LOW, HEAVY AND FORGIVING.'],
};

const MEDALS: Record<BikeId, MedalTimes> = {
  tonup: { gold: 34_000, silver: 40_000, bronze: 50_000 },
  daybreak: { gold: 40_000, silver: 46_000, bronze: 56_000 },
  sundowner: { gold: 46_000, silver: 52_000, bronze: 62_000 },
};

/** A value on a 1..5 bar: lo maps to 1, hi to 5 (rounded, clamped). */
const bar = (v: number, lo: number, hi: number): number =>
  Math.min(5, Math.max(1, Math.round(1 + (4 * (v - lo)) / (hi - lo))));

/**
 * Stat bars from the real numbers: SPEED = top speed, PULL = throttle acceleration, BOOST = seconds of
 * boost in a full tank, FLIP = how fast a held tilt turns, GRIP = how far off the slope a landing may be.
 */
export function statBars(cfg: Config): BikeStats {
  return {
    speed: bar(cfg.topSpeed, 204, 288),
    pull: bar(cfg.accel, 140, 220),
    boost: bar(1 / cfg.boostDrainPerSec, 1.39, 2.78),
    flip: bar(cfg.airTiltMaxSpeed, 360, 520),
    grip: bar(cfg.safeLandingAngle, 25, 45),
  };
}

function define(id: BikeId): BikeDef {
  const overrides = OVERRIDES[id];
  const cfg: Config = { ...CONFIG, ...overrides };
  return { id, name: NAMES[id][0], tagline: NAMES[id][1], overrides, cfg, medalsMs: MEDALS[id], stats: statBars(cfg) };
}

export const BIKES: Readonly<Record<BikeId, BikeDef>> = {
  tonup: define('tonup'),
  daybreak: define('daybreak'),
  sundowner: define('sundowner'),
};

export function isBikeId(v: unknown): v is BikeId {
  return v === 'tonup' || v === 'daybreak' || v === 'sundowner';
}

/** The definition for an id; anything unknown is the default bike. */
export function bikeDef(id: unknown): BikeDef {
  return BIKES[isBikeId(id) ? id : DEFAULT_BIKE];
}
