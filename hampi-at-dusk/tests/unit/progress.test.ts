import { describe, expect, it } from 'vitest';
import { MELODY_MAX, MELODY_MIN, MelodyGen, SCALE, degreeHz, type MelodyEvent } from '../../src/audio/music';
import { STAGE_COLS } from '../../src/level/levelData';
import {
  BEST_KEY, DEFAULT_PREFS, EMPTY_BEST, GHOST_HZ, MEDAL_TIMES_MS, PREFS_KEY, decodeGhost, encodeGhost, ghostPoseAt,
  loadBest, loadPrefs, medalFor, nextMedal, saveBest, savePrefs, submitRun,
  type Best, type GhostPose, type KeyValueStore, type StoreProvider,
} from '../../src/progress';

/** An in-memory stand-in for localStorage. */
function memoryStore(): { provider: StoreProvider; data: Map<string, string> } {
  const data = new Map<string, string>();
  const store: KeyValueStore = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
  };
  return { provider: () => store, data };
}

const throwingAccess: StoreProvider = () => { throw new Error('SecurityError: storage is blocked'); };
const throwingMethods: StoreProvider = () => ({
  getItem: () => { throw new Error('denied'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
});

describe('medals', () => {
  it('thresholds are inclusive: gold <= 40 s, silver <= 46 s, bronze <= 56 s', () => {
    expect(MEDAL_TIMES_MS).toEqual({ gold: 40_000, silver: 46_000, bronze: 56_000 });
    expect(medalFor(38_125)).toBe('gold'); // the bot's clean run
    expect(medalFor(40_000)).toBe('gold');
    expect(medalFor(40_001)).toBe('silver');
    expect(medalFor(46_000)).toBe('silver');
    expect(medalFor(46_001)).toBe('bronze');
    expect(medalFor(56_000)).toBe('bronze');
    expect(medalFor(56_001)).toBeNull();
    expect(medalFor(Number.NaN)).toBeNull();
    expect(medalFor(-1)).toBeNull();
  });

  it('the next target is one medal up; none after gold', () => {
    expect(nextMedal(90_000)).toEqual({ medal: 'bronze', timeMs: 56_000 });
    expect(nextMedal(50_000)).toEqual({ medal: 'silver', timeMs: 46_000 });
    expect(nextMedal(41_000)).toEqual({ medal: 'gold', timeMs: 40_000 });
    expect(nextMedal(39_000)).toBeNull();
  });
});

describe('best run', () => {
  it('the first run sets every best; later runs only improve them, each on its own', () => {
    const first = submitRun(EMPTY_BEST, { timeMs: 50_000, diyas: 20, flips: 1 }, 'aaaaaaa');
    expect(first).toEqual({
      best: { timeMs: 50_000, diyas: 20, flips: 1, ghost: 'aaaaaaa' },
      newTime: true, newDiyas: true, newFlips: true,
    });
    // slower, but more diyas: time and ghost stay
    const second = submitRun(first.best, { timeMs: 52_000, diyas: 30, flips: 0 }, 'bbbbbbb');
    expect(second.best).toEqual({ timeMs: 50_000, diyas: 30, flips: 1, ghost: 'aaaaaaa' });
    expect([second.newTime, second.newDiyas, second.newFlips]).toEqual([false, true, false]);
    // faster: the ghost is replaced
    const third = submitRun(second.best, { timeMs: 41_000, diyas: 12, flips: 3 }, 'ccccccc');
    expect(third.best).toEqual({ timeMs: 41_000, diyas: 30, flips: 3, ghost: 'ccccccc' });
    expect([third.newTime, third.newDiyas, third.newFlips]).toEqual([true, false, true]);
    // an equal run is not a new best
    const same = submitRun(third.best, { timeMs: 41_000, diyas: 30, flips: 3 }, 'ddddddd');
    expect(same.best).toEqual(third.best);
    expect([same.newTime, same.newDiyas, same.newFlips]).toEqual([false, false, false]);
  });

  it('round-trips through storage', () => {
    const { provider, data } = memoryStore();
    expect(loadBest(provider)).toEqual(EMPTY_BEST);
    const ghost = encodeGhost([{ x: 40, y: 222, angle: 0 }, { x: 52.5, y: 210, angle: 12 }]);
    const best: Best = { timeMs: 38_125, diyas: 30, flips: 2, ghost };
    expect(saveBest(best, provider)).toBe(true);
    expect(data.has(BEST_KEY)).toBe(true);
    expect(loadBest(provider)).toEqual(best);
  });

  it('ignores malformed records and records from another stage layout', () => {
    const { provider, data } = memoryStore();
    for (const raw of ['', 'not json', '42', 'null', '[]', '{"v":1}', '{"v":99,"stage":580,"timeMs":1}']) {
      data.set(BEST_KEY, raw);
      expect(loadBest(provider), raw).toEqual(EMPTY_BEST);
    }
    data.set(BEST_KEY, JSON.stringify({ v: 1, stage: STAGE_COLS - 1, timeMs: 30_000, diyas: 5, flips: 0, ghost: '' }));
    expect(loadBest(provider)).toEqual(EMPTY_BEST);
    // bad fields are dropped one by one; a broken ghost is dropped but the time is kept
    data.set(BEST_KEY, JSON.stringify({ v: 1, stage: STAGE_COLS, timeMs: 30_000, diyas: 'many', flips: -3, ghost: 'x!' }));
    expect(loadBest(provider)).toEqual({ timeMs: 30_000, diyas: null, flips: null, ghost: '' });
  });

  it('works when storage throws: loads come back empty, saves report false, nothing escapes', () => {
    for (const provider of [throwingAccess, throwingMethods, () => null, () => undefined]) {
      expect(loadBest(provider)).toEqual(EMPTY_BEST);
      expect(saveBest({ timeMs: 1, diyas: 1, flips: 1, ghost: '' }, provider)).toBe(false);
      expect(loadPrefs(provider)).toEqual(DEFAULT_PREFS);
      expect(savePrefs({ ghost: false, sound: 2 }, provider)).toBe(false);
    }
    // and the bests still fold in memory
    const u = submitRun(loadBest(throwingAccess), { timeMs: 45_000, diyas: 9, flips: 0 });
    expect(u.newTime).toBe(true);
    expect(u.best.timeMs).toBe(45_000);
  });

  it('prefs round-trip and fall back to the defaults', () => {
    const { provider, data } = memoryStore();
    expect(loadPrefs(provider)).toEqual({ ghost: true, sound: 0 });
    expect(savePrefs({ ghost: false, sound: 1 }, provider)).toBe(true);
    expect(loadPrefs(provider)).toEqual({ ghost: false, sound: 1 });
    data.set(PREFS_KEY, '{"ghost":"yes","sound":7}');
    expect(loadPrefs(provider)).toEqual({ ghost: true, sound: 0 });
  });
});

describe('ghost', () => {
  const run: GhostPose[] = [];
  for (let i = 0; i < 800; i++) run.push({ x: 40 + i * 11.4, y: 222 - 60 * Math.abs(Math.sin(i / 9)), angle: ((i * 7) % 360) - 180 });

  it('encodes to 7 characters per sample and decodes within half a pixel / half a degree', () => {
    const s = encodeGhost(run);
    expect(s).toHaveLength(run.length * 7);
    expect(s).toMatch(/^[0-9a-z]+$/);
    expect(s.length).toBeLessThan(6000); // a 40 s run is under 6 kB
    const back = decodeGhost(s);
    expect(back).toHaveLength(run.length);
    back.forEach((p, i) => {
      expect(Math.abs(p.x - run[i]!.x)).toBeLessThanOrEqual(0.25 + 1e-9);
      expect(Math.abs(p.y - run[i]!.y)).toBeLessThanOrEqual(0.25 + 1e-9);
      const da = Math.abs(((p.angle - run[i]!.angle + 540) % 360) - 180);
      expect(da).toBeLessThanOrEqual(0.5 + 1e-9);
    });
  });

  it('survives positions above the screen and past the stage end', () => {
    const [p] = decodeGhost(encodeGhost([{ x: 9264, y: -40.5, angle: -179 }]));
    expect(p).toEqual({ x: 9264, y: -40.5, angle: -179 });
  });

  it('rejects malformed data', () => {
    expect(decodeGhost('')).toEqual([]);
    expect(decodeGhost('abc')).toEqual([]);
    expect(decodeGhost('ABCDEFG')).toEqual([]);
    expect(decodeGhost(12345 as unknown)).toEqual([]);
    expect(decodeGhost(null)).toEqual([]);
  });

  it('plays back at 20 Hz of game time, interpolating, and ends with the recording', () => {
    const poses: GhostPose[] = [{ x: 0, y: 100, angle: 170 }, { x: 10, y: 110, angle: -170 }, { x: 30, y: 110, angle: 0 }];
    expect(GHOST_HZ).toBe(20);
    expect(ghostPoseAt(poses, 0)).toEqual({ x: 0, y: 100, angle: 170 });
    const mid = ghostPoseAt(poses, 0.025)!;
    expect(mid.x).toBeCloseTo(5, 9);
    expect(mid.y).toBeCloseTo(105, 9);
    expect(mid.angle).toBeCloseTo(180, 9); // the short way round, not through 0
    expect(ghostPoseAt(poses, 0.075)!.x).toBeCloseTo(20, 9);
    expect(ghostPoseAt(poses, 0.1)).toEqual({ x: 30, y: 110, angle: 0 });
    expect(ghostPoseAt(poses, 0.11)).toBeNull();
    expect(ghostPoseAt(poses, -1)).toBeNull();
    expect(ghostPoseAt([], 0)).toBeNull();
  });
});

describe('music score (generative melody)', () => {
  it('Bhupali: Sa Re Ga Pa Dha, octaves double', () => {
    expect([...SCALE]).toEqual([0, 2, 4, 7, 9]);
    expect(degreeHz(0, 100)).toBeCloseTo(100, 9);
    expect(degreeHz(5, 100)).toBeCloseTo(200, 9);
    expect(degreeHz(3, 100)).toBeCloseTo(100 * 2 ** (7 / 12), 9);
    expect(degreeHz(-2, 100)).toBeCloseTo(50 * 2 ** (7 / 12), 9); // lower Pa
  });

  it('is deterministic, stays in range, breathes between phrases and does not loop early', () => {
    const a = new MelodyGen();
    const b = new MelodyGen();
    const events: MelodyEvent[] = [];
    for (let i = 0; i < 600; i++) {
      const e = a.next();
      expect(b.next()).toEqual(e);
      events.push(e);
      expect(e.halfBeats).toBeGreaterThanOrEqual(1);
      expect(e.halfBeats).toBeLessThanOrEqual(8);
      if (e.degree !== null) {
        expect(e.degree).toBeGreaterThanOrEqual(MELODY_MIN);
        expect(e.degree).toBeLessThanOrEqual(MELODY_MAX);
      }
    }
    const rests = events.filter((e) => e.degree === null).length;
    expect(rests).toBeGreaterThan(60);
    expect(rests).toBeLessThan(200);
    // no period of up to 64 events anywhere in the first 600 (far longer than 90 s of music)
    const key = (i: number): string => `${events[i]!.degree}:${events[i]!.halfBeats}`;
    for (let period = 1; period <= 64; period++) {
      let same = true;
      for (let i = 0; i + period < 400 && same; i++) same = key(i) === key(i + period);
      expect(same, `repeats every ${period} events`).toBe(false);
    }
    // total length of 600 events at the base tempo: several minutes
    const halfBeats = events.reduce((n, e) => n + e.halfBeats, 0);
    expect((halfBeats * 60) / 76 / 2).toBeGreaterThan(180);
  });
});
