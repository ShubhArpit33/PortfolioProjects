// The replay loop (v1.3): medals, the best run, and its ghost. Pure logic, no Phaser.
//
// Everything that touches storage goes through try/catch: localStorage can be missing, full, or throw
// on access (private windows, blocked site data, sandboxed frames). The game must play the same without it.

import { BIKES, DEFAULT_BIKE, isBikeId, type BikeId, type MedalTimes } from './bike/bikes';
import { STAGE_COLS } from './level/levelData';

// ---------------------------------------------------------------------------------------------
// Medals
// ---------------------------------------------------------------------------------------------

export type Medal = 'gold' | 'silver' | 'bronze';

/**
 * Time targets (ms) of the default bike, set from the measured bot run: 38.13 s for a clean, no-flip run
 * that boosts only at the river. Gold leaves about 2 s of slack on that line (or pays for one slip with
 * boost and flips). Every bike has its own targets, set the same way (bikes.ts).
 */
export const MEDAL_TIMES_MS: MedalTimes = BIKES[DEFAULT_BIKE].medalsMs;
export const MEDAL_ORDER: readonly Medal[] = ['bronze', 'silver', 'gold'];

/** The medal a finishing time earns (targets are inclusive), or null. */
export function medalFor(timeMs: number, targets: MedalTimes = MEDAL_TIMES_MS): Medal | null {
  if (!(timeMs >= 0)) return null;
  if (timeMs <= targets.gold) return 'gold';
  if (timeMs <= targets.silver) return 'silver';
  if (timeMs <= targets.bronze) return 'bronze';
  return null;
}

/** The next medal up from a finishing time and its target, or null once gold is earned. */
export function nextMedal(timeMs: number, targets: MedalTimes = MEDAL_TIMES_MS): { medal: Medal; timeMs: number } | null {
  const have = medalFor(timeMs, targets);
  if (have === 'gold') return null;
  const next: Medal = have === 'silver' ? 'gold' : have === 'bronze' ? 'silver' : 'bronze';
  return { medal: next, timeMs: targets[next] };
}

// ---------------------------------------------------------------------------------------------
// Ghost: the best run's pose sampled at a fixed rate of game time
// ---------------------------------------------------------------------------------------------

export const GHOST_HZ = 20;
/** Fixed steps (1/120 s) between two ghost samples. */
export const GHOST_SAMPLE_STEPS = 120 / GHOST_HZ;
/** Runs longer than this are not kept as a ghost (keeps the stored string under about 17 kB). */
export const GHOST_MAX_SAMPLES = GHOST_HZ * 120;

export interface GhostPose { x: number; y: number; angle: number }

const B36 = 36;
const X_SCALE = 2;      // half-pixel steps, 3 base-36 digits (up to 23 327 px)
const Y_SCALE = 2;      // half-pixel steps, 2 digits (up to 647 px)
const Y_OFFSET = 200;   // y may be a little above the screen top
const CHARS_PER_SAMPLE = 7;

const digits = (n: number, width: number): string => {
  const max = B36 ** width - 1;
  const v = Math.min(max, Math.max(0, Math.round(n)));
  return v.toString(B36).padStart(width, '0');
};

/** Pack poses into a compact string: 7 characters per sample (x 3, y 2, angle 2). */
export function encodeGhost(poses: readonly GhostPose[]): string {
  let out = '';
  for (const p of poses) {
    const a = ((Math.round(p.angle) % 360) + 360) % 360;
    out += digits(p.x * X_SCALE, 3) + digits((p.y + Y_OFFSET) * Y_SCALE, 2) + digits(a, 2);
  }
  return out;
}

/** Unpack a ghost string. Returns [] for anything malformed. */
export function decodeGhost(data: unknown): GhostPose[] {
  if (typeof data !== 'string' || data.length === 0 || data.length % CHARS_PER_SAMPLE !== 0) return [];
  if (!/^[0-9a-z]+$/.test(data)) return [];
  const poses: GhostPose[] = [];
  for (let i = 0; i < data.length; i += CHARS_PER_SAMPLE) {
    const x = parseInt(data.slice(i, i + 3), B36) / X_SCALE;
    const y = parseInt(data.slice(i + 3, i + 5), B36) / Y_SCALE - Y_OFFSET;
    let angle = parseInt(data.slice(i + 5, i + 7), B36);
    if (angle > 180) angle -= 360;
    poses.push({ x, y, angle });
  }
  return poses;
}

/** The ghost's pose at a game time (seconds), interpolated between samples; null once the ghost has finished. */
export function ghostPoseAt(poses: readonly GhostPose[], timeS: number): GhostPose | null {
  if (poses.length === 0 || timeS < 0) return null;
  const f = timeS * GHOST_HZ;
  const i = Math.floor(f);
  if (i >= poses.length - 1) return i === poses.length - 1 && f === i ? { ...poses[i]! } : null;
  const a = poses[i]!;
  const b = poses[i + 1]!;
  const k = f - i;
  let da = b.angle - a.angle;
  if (da > 180) da -= 360;
  else if (da < -180) da += 360;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, angle: a.angle + da * k };
}

// ---------------------------------------------------------------------------------------------
// Best run
// ---------------------------------------------------------------------------------------------

export interface RunResult { timeMs: number; diyas: number; flips: number }

/** Each best is kept on its own: the fastest time, the most diyas, the most flips. null = no run yet. */
export interface Best {
  timeMs: number | null;
  diyas: number | null;
  flips: number | null;
  /** encoded ghost of the best-time run ('' if none) */
  ghost: string;
}

export interface BestUpdate {
  best: Best;
  newTime: boolean;
  newDiyas: boolean;
  newFlips: boolean;
}

export const EMPTY_BEST: Readonly<Best> = { timeMs: null, diyas: null, flips: null, ghost: '' };

/**
 * Fold a finished run into the bests. The first run sets all three. `ghost` (the run's encoded ghost)
 * replaces the stored one only when the time is a new best.
 */
export function submitRun(prev: Best, run: RunResult, ghost = ''): BestUpdate {
  const newTime = prev.timeMs === null || run.timeMs < prev.timeMs;
  const newDiyas = prev.diyas === null || run.diyas > prev.diyas;
  const newFlips = prev.flips === null || run.flips > prev.flips;
  return {
    best: {
      timeMs: newTime ? run.timeMs : prev.timeMs,
      diyas: newDiyas ? run.diyas : prev.diyas,
      flips: newFlips ? run.flips : prev.flips,
      ghost: newTime ? ghost : prev.ghost,
    },
    newTime, newDiyas, newFlips,
  };
}

// ---------------------------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------------------------

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
/** Returns the store, or throws / returns null when there is none. */
export type StoreProvider = () => KeyValueStore | null | undefined;

/** The single record of v1.3 - v1.5 (one bike). Read once to seed the Daybreak's record; never written or removed. */
export const LEGACY_BEST_KEY = 'hampi-at-dusk.best';
/** Each bike keeps its own best run and ghost (v1.6). */
export const bestKey = (bike: BikeId): string => `${LEGACY_BEST_KEY}.${bike}`;
export const PREFS_KEY = 'hampi-at-dusk.prefs';
/** Bumped (with the stage length) whenever old records stop being comparable. */
const RECORD_VERSION = 1;

/** The browser's localStorage. Even reading the property can throw, so callers wrap this. */
export const browserStore: StoreProvider = () =>
  (typeof window !== 'undefined' ? window.localStorage : null);

function read(key: string, store: StoreProvider): unknown {
  try {
    const raw = store()?.getItem(key);
    return typeof raw === 'string' ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown, store: StoreProvider): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const wholeOrNull = (v: unknown, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null;

function parseBest(raw: unknown): Best | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== RECORD_VERSION || r.stage !== STAGE_COLS) return null;
  const timeMs = wholeOrNull(r.timeMs, 3_600_000);
  const ghost = timeMs !== null && decodeGhost(r.ghost).length > 0 ? (r.ghost as string) : '';
  return { timeMs, diyas: wholeOrNull(r.diyas, 999), flips: wholeOrNull(r.flips, 9999), ghost };
}

/**
 * Load a bike's bests. Anything missing, malformed or from another stage layout comes back as "no run yet".
 *
 * Migration (v1.6): records from before the roster were all ridden on the Daybreak. While the Daybreak has
 * no record of its own, the legacy record is used and copied to the Daybreak's key (if storage allows).
 * The legacy key is left alone, and it is never read for another bike or once the Daybreak has a record.
 */
export function loadBest(bike: BikeId = DEFAULT_BIKE, store: StoreProvider = browserStore): Best {
  const own = read(bestKey(bike), store);
  if (own !== null) return parseBest(own) ?? { ...EMPTY_BEST };
  if (bike !== DEFAULT_BIKE) return { ...EMPTY_BEST };
  const legacy = parseBest(read(LEGACY_BEST_KEY, store));
  if (legacy === null) return { ...EMPTY_BEST };
  saveBest(bike, legacy, store);
  return legacy;
}

/** Save a bike's bests. Returns false (and changes nothing else) when storage is unavailable or throws. */
export function saveBest(bike: BikeId, best: Best, store: StoreProvider = browserStore): boolean {
  return write(bestKey(bike), { v: RECORD_VERSION, stage: STAGE_COLS, ...best }, store);
}

export interface Prefs {
  /** show the ghost of the best run */
  ghost: boolean;
  /** 0 = all sound, 1 = music off, 2 = everything muted */
  sound: 0 | 1 | 2;
  /** the bike picked last */
  bike: BikeId;
}

export const DEFAULT_PREFS: Readonly<Prefs> = { ghost: true, sound: 0, bike: DEFAULT_BIKE };

export function loadPrefs(store: StoreProvider = browserStore): Prefs {
  const raw = read(PREFS_KEY, store);
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFS };
  const r = raw as Record<string, unknown>;
  return {
    ghost: typeof r.ghost === 'boolean' ? r.ghost : DEFAULT_PREFS.ghost,
    sound: r.sound === 1 || r.sound === 2 ? r.sound : 0,
    bike: isBikeId(r.bike) ? r.bike : DEFAULT_BIKE,
  };
}

export function savePrefs(prefs: Prefs, store: StoreProvider = browserStore): boolean {
  return write(PREFS_KEY, prefs, store);
}
