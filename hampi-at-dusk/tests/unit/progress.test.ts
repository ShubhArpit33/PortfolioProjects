import { describe, expect, it } from 'vitest';
import {
  BASE_BPM, CHORDS, MELODY_MAX, MELODY_MIN, SCALE, SONG_BARS, STEPS_PER_BAR, barScore, degreeHz, songPosition, songSeconds,
} from '../../src/audio/music';
import { BIKES, BIKE_ORDER, BOT_RUN_MS } from '../../src/bike/bikes';
import { STAGE_COLS } from '../../src/level/levelData';
import {
  ARCHIVED_BEST_KEYS, DEFAULT_PREFS, EMPTY_BEST, GHOST_HZ, GHOST_MAX_SAMPLES, GHOST_MAX_SECONDS, MEDAL_TIMES_MS, PREFS_KEY,
  RECORD_VERSION, bestKey, decodeGhost, encodeGhost, ghostPoseAt, loadBest, loadPrefs, medalFor, nextMedal, saveBest, savePrefs,
  submitRun,
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

const BEST_KEY = bestKey('daybreak');

describe('medals', () => {
  it('thresholds are inclusive: on the Daybreak gold <= 63 s, silver <= 75 s, bronze <= 131 s (v1.7)', () => {
    expect(MEDAL_TIMES_MS).toEqual({ gold: 63_000, silver: 75_000, bronze: 131_000 });
    expect(medalFor(59_517)).toBe('gold'); // the bot's clean run
    expect(medalFor(63_000)).toBe('gold');
    expect(medalFor(63_001)).toBe('silver');
    expect(medalFor(75_000)).toBe('silver');
    expect(medalFor(75_001)).toBe('bronze');
    expect(medalFor(131_000)).toBe('bronze');
    expect(medalFor(131_001)).toBeNull();
    expect(medalFor(Number.NaN)).toBeNull();
    expect(medalFor(-1)).toBeNull();
  });

  it('the next target is one medal up; none after gold', () => {
    expect(nextMedal(200_000)).toEqual({ medal: 'bronze', timeMs: 131_000 });
    expect(nextMedal(90_000)).toEqual({ medal: 'silver', timeMs: 75_000 });
    expect(nextMedal(64_000)).toEqual({ medal: 'gold', timeMs: 63_000 });
    expect(nextMedal(62_000)).toBeNull();
  });

  it('every bike has its own targets: the same time is a different medal on a different bike', () => {
    expect(BIKES.tonup.medalsMs).toEqual({ gold: 53_000, silver: 63_000, bronze: 110_000 });
    expect(BIKES.sundowner.medalsMs).toEqual({ gold: 73_000, silver: 87_000, bronze: 153_000 });
    expect(MEDAL_TIMES_MS).toBe(BIKES.daybreak.medalsMs);
    expect(BIKE_ORDER.map((b) => medalFor(59_517, BIKES[b].medalsMs))).toEqual(['silver', 'gold', 'gold']);
    expect(BIKE_ORDER.map((b) => medalFor(70_000, BIKES[b].medalsMs))).toEqual(['bronze', 'silver', 'gold']);
    expect(BIKE_ORDER.map((b) => medalFor(140_000, BIKES[b].medalsMs))).toEqual([null, null, 'bronze']);
    // each bike's measured bot run is gold on that bike, with 5% (and the rounding up to a second) in hand;
    // bronze is generous: more than twice the bot's time
    for (const b of BIKE_ORDER) {
      const m = BIKES[b].medalsMs;
      expect(medalFor(BOT_RUN_MS[b], m), b).toBe('gold');
      expect(m.gold - BOT_RUN_MS[b], b).toBeGreaterThanOrEqual(BOT_RUN_MS[b] * 0.05);
      expect(m.gold - BOT_RUN_MS[b], b).toBeLessThan(BOT_RUN_MS[b] * 0.05 + 1000);
      expect(m.bronze, b).toBeGreaterThan(2 * BOT_RUN_MS[b]);
      expect(m.gold < m.silver && m.silver < m.bronze, b).toBe(true);
      // a run with a ghost (up to 180 s) can still be a bronze on every bike
      expect(m.bronze, b).toBeLessThan(GHOST_MAX_SECONDS * 1000);
    }
    expect(medalFor(53_000, BIKES.tonup.medalsMs)).toBe('gold');
    expect(medalFor(53_001, BIKES.tonup.medalsMs)).toBe('silver');
    expect(nextMedal(74_000, BIKES.sundowner.medalsMs)).toEqual({ medal: 'gold', timeMs: 73_000 });
    expect(nextMedal(74_000, BIKES.tonup.medalsMs)).toEqual({ medal: 'silver', timeMs: 63_000 });
    expect(nextMedal(50_000, BIKES.tonup.medalsMs)).toBeNull();
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
    expect(loadBest('daybreak', provider)).toEqual(EMPTY_BEST);
    const ghost = encodeGhost([{ x: 40, y: 222, angle: 0 }, { x: 52.5, y: 210, angle: 12 }]);
    const best: Best = { timeMs: 59_517, diyas: 56, flips: 2, ghost };
    expect(saveBest('daybreak', best, provider)).toBe(true);
    expect(data.has(BEST_KEY)).toBe(true);
    expect(loadBest('daybreak', provider)).toEqual(best);
  });

  it('ignores malformed records and records from another stage layout', () => {
    const { provider, data } = memoryStore();
    for (const raw of ['', 'not json', '42', 'null', '[]', '{"v":2}', '{"v":99,"stage":900,"timeMs":1}']) {
      data.set(BEST_KEY, raw);
      expect(loadBest('daybreak', provider), raw).toEqual(EMPTY_BEST);
    }
    data.set(BEST_KEY, JSON.stringify({ v: RECORD_VERSION, stage: STAGE_COLS - 1, timeMs: 30_000, diyas: 5, flips: 0, ghost: '' }));
    expect(loadBest('daybreak', provider)).toEqual(EMPTY_BEST);
    // a v1 record (the 580-column stage) under the new key is not a record either, whatever stage it claims
    for (const stage of [580, STAGE_COLS]) {
      data.set(BEST_KEY, JSON.stringify({ v: 1, stage, timeMs: 30_000, diyas: 5, flips: 0, ghost: '' }));
      expect(loadBest('daybreak', provider)).toEqual(EMPTY_BEST);
    }
    // bad fields are dropped one by one; a broken ghost is dropped but the time is kept
    data.set(BEST_KEY, JSON.stringify({ v: RECORD_VERSION, stage: STAGE_COLS, timeMs: 30_000, diyas: 'many', flips: -3, ghost: 'x!' }));
    expect(loadBest('daybreak', provider)).toEqual({ timeMs: 30_000, diyas: null, flips: null, ghost: '' });
  });

  it('works when storage throws: loads come back empty, saves report false, nothing escapes', () => {
    for (const provider of [throwingAccess, throwingMethods, () => null, () => undefined]) {
      expect(loadBest('daybreak', provider)).toEqual(EMPTY_BEST);
      expect(saveBest('daybreak', { timeMs: 1, diyas: 1, flips: 1, ghost: '' }, provider)).toBe(false);
      for (const b of BIKE_ORDER) expect(loadBest(b, provider)).toEqual(EMPTY_BEST);
      expect(loadPrefs(provider)).toEqual(DEFAULT_PREFS);
      expect(savePrefs({ ghost: false, sound: 2, bike: 'tonup', tutorialDone: true }, provider)).toBe(false);
      // so with storage throwing the tutorial reads "not done" every time: the prompts show
      expect(loadPrefs(provider).tutorialDone).toBe(false);
    }
    // and the bests still fold in memory
    const u = submitRun(loadBest('daybreak', throwingAccess), { timeMs: 45_000, diyas: 9, flips: 0 });
    expect(u.newTime).toBe(true);
    expect(u.best.timeMs).toBe(45_000);
  });

  it('prefs round-trip and fall back to the defaults', () => {
    const { provider, data } = memoryStore();
    expect(loadPrefs(provider)).toEqual({ ghost: true, sound: 0, bike: 'daybreak', tutorialDone: false });
    expect(savePrefs({ ghost: false, sound: 1, bike: 'sundowner', tutorialDone: false }, provider)).toBe(true);
    expect(loadPrefs(provider)).toEqual({ ghost: false, sound: 1, bike: 'sundowner', tutorialDone: false });
    data.set(PREFS_KEY, '{"ghost":"yes","sound":7,"bike":"chopper","tutorialDone":"yes"}');
    expect(loadPrefs(provider)).toEqual({ ghost: true, sound: 0, bike: 'daybreak', tutorialDone: false });
    // prefs saved before the roster have no bike: the default
    data.set(PREFS_KEY, '{"ghost":false,"sound":2}');
    expect(loadPrefs(provider)).toEqual({ ghost: false, sound: 2, bike: 'daybreak', tutorialDone: false });
  });

  it('tutorialDone (v1.7): false by default and for prefs from before v1.7; true once saved; kept by other saves', () => {
    const { provider, data } = memoryStore();
    expect(DEFAULT_PREFS.tutorialDone).toBe(false);
    expect(loadPrefs(provider).tutorialDone).toBe(false);
    // a v1.6 player's prefs: everything kept, the tutorial not done
    data.set(PREFS_KEY, '{"ghost":false,"sound":1,"bike":"tonup"}');
    expect(loadPrefs(provider)).toEqual({ ghost: false, sound: 1, bike: 'tonup', tutorialDone: false });
    // finishing a run: the game saves { ...prefs, tutorialDone: true }
    expect(savePrefs({ ...loadPrefs(provider), tutorialDone: true }, provider)).toBe(true);
    expect(loadPrefs(provider)).toEqual({ ghost: false, sound: 1, bike: 'tonup', tutorialDone: true });
    // the other settings are saved the same way ({ ...prefs, x }), so they carry it along
    savePrefs({ ...loadPrefs(provider), sound: 2 }, provider);
    savePrefs({ ...loadPrefs(provider), bike: 'sundowner' }, provider);
    savePrefs({ ...loadPrefs(provider), ghost: true }, provider);
    expect(loadPrefs(provider)).toEqual({ ghost: true, sound: 2, bike: 'sundowner', tutorialDone: true });
    // only a real true counts
    for (const v of ['1', '"true"', 'null', '0']) {
      data.set(PREFS_KEY, `{"tutorialDone":${v}}`);
      expect(loadPrefs(provider).tutorialDone, v).toBe(false);
    }
  });
});

describe('per-bike records, version 2 (v1.7)', () => {
  const ghost = encodeGhost([{ x: 40, y: 222, angle: 0 }, { x: 52.5, y: 210, angle: 12 }]);
  /** a record as v1.6 stored it (the 580-column stage) */
  const oldRecord = (best: Best): string => JSON.stringify({ v: 1, stage: 580, ...best });

  it('each bike has its own v2 key, and a save touches only that key', () => {
    expect(RECORD_VERSION).toBe(2);
    expect(BIKE_ORDER.map(bestKey)).toEqual([
      'hampi-at-dusk.best.v2.tonup', 'hampi-at-dusk.best.v2.daybreak', 'hampi-at-dusk.best.v2.sundowner',
    ]);
    const { provider, data } = memoryStore();
    const bests: Record<string, Best> = {
      tonup: { timeMs: 51_000, diyas: 50, flips: 4, ghost },
      daybreak: { timeMs: 61_000, diyas: 56, flips: 1, ghost: '' },
      sundowner: { timeMs: 71_500, diyas: 12, flips: 0, ghost },
    };
    expect(saveBest('tonup', bests.tonup!, provider)).toBe(true);
    expect([...data.keys()]).toEqual(['hampi-at-dusk.best.v2.tonup']);
    expect(JSON.parse(data.get('hampi-at-dusk.best.v2.tonup')!)).toEqual({ v: 2, stage: 900, ...bests.tonup });
    expect(loadBest('tonup', provider)).toEqual(bests.tonup);
    expect(loadBest('daybreak', provider)).toEqual(EMPTY_BEST);
    expect(loadBest('sundowner', provider)).toEqual(EMPTY_BEST);
    expect(saveBest('daybreak', bests.daybreak!, provider)).toBe(true);
    expect(saveBest('sundowner', bests.sundowner!, provider)).toBe(true);
    for (const b of BIKE_ORDER) expect(loadBest(b, provider), b).toEqual(bests[b]);
    expect([...data.keys()].sort()).toEqual(BIKE_ORDER.map(bestKey).sort());
    // a broken record on one bike does not disturb the others
    data.set(bestKey('tonup'), 'not json');
    expect(loadBest('tonup', provider)).toEqual(EMPTY_BEST);
    expect(loadBest('sundowner', provider)).toEqual(bests.sundowner);
  });

  it('the old records are an archive: never read, never written, never removed', () => {
    expect(ARCHIVED_BEST_KEYS).toEqual([
      'hampi-at-dusk.best', 'hampi-at-dusk.best.tonup', 'hampi-at-dusk.best.daybreak', 'hampi-at-dusk.best.sundowner',
    ]);
    // none of them is a key this version uses
    for (const b of BIKE_ORDER) expect(ARCHIVED_BEST_KEYS).not.toContain(bestKey(b));

    // A store that records every access.
    const data = new Map<string, string>();
    const reads: string[] = [];
    const writes: string[] = [];
    const provider: StoreProvider = () => ({
      getItem: (k) => { reads.push(k); return data.get(k) ?? null; },
      setItem: (k, v) => { writes.push(k); data.set(k, v); },
    });
    // A v1.6 player's storage: the pre-roster record and one per bike, all better than anything below.
    const old: Record<string, string> = {
      'hampi-at-dusk.best': oldRecord({ timeMs: 38_125, diyas: 30, flips: 2, ghost }),
      'hampi-at-dusk.best.tonup': oldRecord({ timeMs: 32_058, diyas: 30, flips: 0, ghost }),
      'hampi-at-dusk.best.daybreak': oldRecord({ timeMs: 38_125, diyas: 30, flips: 1, ghost }),
      'hampi-at-dusk.best.sundowner': oldRecord({ timeMs: 43_992, diyas: 30, flips: 0, ghost }),
    };
    for (const [k, v] of Object.entries(old)) data.set(k, v);

    // No bike has a record: the old ones are not migrated, whatever they say.
    for (const b of BIKE_ORDER) expect(loadBest(b, provider), b).toEqual(EMPTY_BEST);
    // A first run on each bike is a new best, and is saved under the v2 key.
    for (const b of BIKE_ORDER) {
      const u = submitRun(loadBest(b, provider), { timeMs: 80_000, diyas: 40, flips: 0 }, ghost);
      expect([u.newTime, u.newDiyas, u.newFlips], b).toEqual([true, true, true]);
      expect(saveBest(b, u.best, provider)).toBe(true);
      expect(loadBest(b, provider).timeMs, b).toBe(80_000);
    }
    loadPrefs(provider);
    savePrefs({ ...loadPrefs(provider), tutorialDone: true }, provider);

    // Every access was to a v2 key or the prefs; the archive was never touched and is byte for byte as it was.
    const allowed = new Set([...BIKE_ORDER.map(bestKey), PREFS_KEY]);
    expect(reads.length).toBeGreaterThan(0);
    expect(writes.length).toBeGreaterThan(0);
    for (const k of [...reads, ...writes]) expect(allowed.has(k), k).toBe(true);
    for (const k of ARCHIVED_BEST_KEYS) expect(data.get(k), k).toBe(old[k]);
    expect([...data.keys()].sort()).toEqual([...ARCHIVED_BEST_KEYS, ...BIKE_ORDER.map(bestKey), PREFS_KEY].sort());
  });

  it('an old record copied to a new key by hand is still not a record (wrong version, wrong stage)', () => {
    const { provider, data } = memoryStore();
    data.set(bestKey('daybreak'), oldRecord({ timeMs: 38_125, diyas: 30, flips: 2, ghost }));
    expect(loadBest('daybreak', provider)).toEqual(EMPTY_BEST);
    data.set(bestKey('daybreak'), JSON.stringify({ v: 2, stage: 580, timeMs: 38_125, diyas: 30, flips: 2, ghost }));
    expect(loadBest('daybreak', provider)).toEqual(EMPTY_BEST);
  });

  it('works with read-only or throwing storage: nothing is loaded, nothing escapes, the archive is not consulted', () => {
    const reads: string[] = [];
    const readOnly: StoreProvider = () => ({
      getItem: (k) => { reads.push(k); return ARCHIVED_BEST_KEYS.includes(k) ? oldRecord({ timeMs: 41_000, diyas: 25, flips: 0, ghost }) : null; },
      setItem: () => { throw new Error('QuotaExceededError'); },
    });
    for (const b of BIKE_ORDER) {
      expect(loadBest(b, readOnly)).toEqual(EMPTY_BEST);
      expect(saveBest(b, { timeMs: 70_000, diyas: 1, flips: 0, ghost: '' }, readOnly)).toBe(false);
    }
    expect(reads.sort()).toEqual(BIKE_ORDER.map(bestKey).sort());
    for (const provider of [throwingAccess, throwingMethods]) {
      for (const b of BIKE_ORDER) expect(loadBest(b, provider)).toEqual(EMPTY_BEST);
    }
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

  it('survives positions above the screen and at the end of the 900-column stage', () => {
    const [p] = decodeGhost(encodeGhost([{ x: 14384, y: -40.5, angle: -179 }]));
    expect(p).toEqual({ x: 14384, y: -40.5, angle: -179 });
    expect(STAGE_COLS * 16).toBeLessThan(36 ** 3 / 2); // three base-36 digits of half pixels cover the stage
  });

  it('is kept for runs up to 180 s (v1.7): long enough for a bronze on every bike, about 25 kB at most', () => {
    expect(GHOST_MAX_SECONDS).toBe(180);
    expect(GHOST_MAX_SAMPLES).toBe(3600);
    expect(GHOST_MAX_SAMPLES * 7).toBeLessThan(26_000);
    // the slowest bronze (the Sundowner's, 153 s) still has a ghost
    expect((BIKES.sundowner.medalsMs.bronze / 1000) * GHOST_HZ).toBeLessThan(GHOST_MAX_SAMPLES);
    // a full-length recording round-trips
    const long: GhostPose[] = Array.from({ length: GHOST_MAX_SAMPLES }, (_, i) => ({ x: 40 + i * 3.98, y: 222, angle: 0 }));
    expect(decodeGhost(encodeGhost(long))).toHaveLength(GHOST_MAX_SAMPLES);
    expect(ghostPoseAt(decodeGhost(encodeGhost(long)), 179.9)).not.toBeNull();
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

describe('music score', () => {
  it('Bhupali: Sa Re Ga Pa Dha, octaves double', () => {
    expect([...SCALE]).toEqual([0, 2, 4, 7, 9]);
    expect(degreeHz(0, 100)).toBeCloseTo(100, 9);
    expect(degreeHz(5, 100)).toBeCloseTo(200, 9);
    expect(degreeHz(3, 100)).toBeCloseTo(100 * 2 ** (7 / 12), 9);
    expect(degreeHz(-2, 100)).toBeCloseTo(50 * 2 ** (7 / 12), 9); // lower Pa
  });

  it('song form: intro, A, B, A\', breakdown in 60-90 s; later passes skip the intro', () => {
    expect(SONG_BARS).toBe(32);
    expect(BASE_BPM).toBeGreaterThanOrEqual(100);
    expect(BASE_BPM).toBeLessThanOrEqual(112);
    expect(songSeconds()).toBeGreaterThan(60);
    expect(songSeconds()).toBeLessThan(90);
    const first = Array.from({ length: SONG_BARS }, (_, i) => songPosition(i).section);
    expect(first.join(' ')).toBe([
      ...Array(4).fill('intro'), ...Array(8).fill('A'), ...Array(8).fill('B'), ...Array(8).fill('A2'), ...Array(4).fill('break'),
    ].join(' '));
    expect(songPosition(32)).toEqual({ section: 'A', bar: 0, loop: 1 });
    expect(songPosition(59)).toEqual({ section: 'break', bar: 3, loop: 1 });
    expect(songPosition(60)).toEqual({ section: 'A', bar: 0, loop: 2 });
  });

  it('is deterministic, in the raag and in range, with a clean bass and real chord movement', () => {
    const chordsHeard = new Set<string>();
    for (let bar = 0; bar < 200; bar++) {
      const s = barScore(bar);
      expect(barScore(bar)).toEqual(s);
      for (const c of s.chords) chordsHeard.add(c);
      for (const n of [...s.lead, ...s.flute]) {
        expect(Number.isInteger(n.degree)).toBe(true); // a scale degree: cannot leave Bhupali
        expect(n.degree).toBeGreaterThanOrEqual(MELODY_MIN);
        expect(n.degree).toBeLessThanOrEqual(MELODY_MAX);
      }
      for (const e of [...s.lead, ...s.harmony, ...s.flute, ...s.arp, ...s.bass, ...s.drums, ...s.pad]) {
        expect(e.step).toBeGreaterThanOrEqual(0);
        expect(e.step).toBeLessThan(STEPS_PER_BAR);
        if ('vel' in e) { expect(e.vel).toBeGreaterThan(0); expect(e.vel).toBeLessThanOrEqual(1); }
      }
      for (const b of s.bass) {
        const hz = 73.415 * 2 ** (b.semis / 12);
        expect(hz).toBeGreaterThan(70);  // nothing in the sub range
        expect(hz).toBeLessThan(260);
        // the bass plays the root, fifth or octave of the chord under it
        expect([0, 7, 12]).toContain(b.semis - CHORDS[s.chords[b.step < 8 ? 0 : 1]].bass);
      }
      // a groove whenever the band is in: kick on the one
      if (s.section === 'A' || s.section === 'A2' || s.section === 'B') {
        expect(s.drums.some((d) => d.kind === 'kick' && d.step === 0)).toBe(true);
      }
    }
    expect([...chordsHeard].sort()).toEqual(['A', 'Bm', 'D', 'G']);
  });

  it('has a hook that returns, a flute B section, and passes that vary', () => {
    const lead = (bar: number): string => barScore(bar).lead.map((n) => `${n.step}:${n.degree}`).join(' ');
    // A: bar 4 of the section restates bar 0 (call, answer, call again)
    expect(lead(4)).toBe(lead(8));
    expect(lead(4)).not.toBe(lead(5));
    // B: the flute carries the tune, the santoor only arpeggiates
    for (let bar = 12; bar < 19; bar++) {
      expect(barScore(bar).flute.length).toBeGreaterThan(0);
      expect(barScore(bar).lead.length).toBe(0);
      expect(barScore(bar).arp.length).toBe(8);
    }
    // A' = the hook with ornaments (every hook note is still there) and a second voice at the end
    const a = barScore(4 + 2).lead;
    const a2 = barScore(20 + 2).lead;
    for (const n of a) expect(a2).toContainEqual(n);
    expect(barScore(26).harmony.length).toBeGreaterThan(0);
    expect(barScore(6).harmony.length).toBe(0);
    // the second pass is not a copy of the first
    const pass = (from: number): string => Array.from({ length: 28 }, (_, i) => lead(from + i)).join('|');
    expect(pass(32)).not.toBe(pass(4));
    expect(pass(60)).not.toBe(pass(32));
    // the breakdown thins out: no kick until the last bar
    expect(barScore(28).drums.some((d) => d.kind === 'kick')).toBe(false);
    expect(barScore(28).bass.length).toBe(1);
  });
});
