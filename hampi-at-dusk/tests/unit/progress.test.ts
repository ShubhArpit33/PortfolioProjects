import { describe, expect, it } from 'vitest';
import {
  BASE_BPM, CHORDS, MELODY_MAX, MELODY_MIN, SCALE, SONG_BARS, STEPS_PER_BAR, barScore, degreeHz, songPosition, songSeconds,
} from '../../src/audio/music';
import { BIKE_ORDER, type BikeId } from '../../src/bike/bikes';
import {
  ARCHIVED_BEST_KEYS, DEFAULT_PREFS, EMPTY_BEST, GHOST_HZ, GHOST_MAX_SAMPLES, GHOST_MAX_SECONDS, LEGACY_V2_STAGE, PREFS_KEY,
  RECORD_VERSION, UNLOCKS_KEY, bestKey, decodeGhost, encodeGhost, ghostPoseAt, journeyKey, legacyV2Key, loadBest as loadBestOf,
  loadJourneyBest, loadPrefs, loadUnlocks, medalFor, nextMedal, saveBest as saveBestOf, saveJourneyBest, savePrefs, saveUnlocks,
  submitRun,
  type Best, type GhostPose, type KeyValueStore, type StageRef, type StoreProvider,
} from '../../src/progress';
import { BOT_RUN_MS, HAMPI, STAGE_COLS } from '../../src/stages/hampi';

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

// Records belong to a stage and a bike (v1.9). Most of these tests are about Hampi's.
const loadBest = (bike: BikeId, store: StoreProvider): Best => loadBestOf(HAMPI, bike, store);
const saveBest = (bike: BikeId, best: Best, store: StoreProvider): boolean => saveBestOf(HAMPI, bike, best, store);
const hampiKey = (bike: BikeId): string => bestKey('hampi', bike);
const BEST_KEY = hampiKey('daybreak');
/** Hampi's medal targets, per bike. */
const MEDALS = HAMPI.medalsMs;
const DAYBREAK = MEDALS.daybreak;
/** A stage that is not Hampi (only what the records need of one). */
const GOA: StageRef = { id: 'goa', cols: 960 };

describe('medals', () => {
  it('thresholds are inclusive: on the Daybreak gold <= 63 s, silver <= 75 s, bronze <= 131 s (v1.7)', () => {
    expect(DAYBREAK).toEqual({ gold: 63_000, silver: 75_000, bronze: 131_000 });
    expect(medalFor(59_517, DAYBREAK)).toBe('gold'); // the bot's clean run
    expect(medalFor(63_000, DAYBREAK)).toBe('gold');
    expect(medalFor(63_001, DAYBREAK)).toBe('silver');
    expect(medalFor(75_000, DAYBREAK)).toBe('silver');
    expect(medalFor(75_001, DAYBREAK)).toBe('bronze');
    expect(medalFor(131_000, DAYBREAK)).toBe('bronze');
    expect(medalFor(131_001, DAYBREAK)).toBeNull();
    expect(medalFor(Number.NaN, DAYBREAK)).toBeNull();
    expect(medalFor(-1, DAYBREAK)).toBeNull();
  });

  it('the next target is one medal up; none after gold', () => {
    expect(nextMedal(200_000, DAYBREAK)).toEqual({ medal: 'bronze', timeMs: 131_000 });
    expect(nextMedal(90_000, DAYBREAK)).toEqual({ medal: 'silver', timeMs: 75_000 });
    expect(nextMedal(64_000, DAYBREAK)).toEqual({ medal: 'gold', timeMs: 63_000 });
    expect(nextMedal(62_000, DAYBREAK)).toBeNull();
  });

  it('every bike has its own targets: the same time is a different medal on a different bike', () => {
    expect(MEDALS.tonup).toEqual({ gold: 53_000, silver: 63_000, bronze: 110_000 });
    expect(MEDALS.sundowner).toEqual({ gold: 73_000, silver: 87_000, bronze: 153_000 });
    expect(BIKE_ORDER.map((b) => medalFor(59_517, MEDALS[b]))).toEqual(['silver', 'gold', 'gold']);
    expect(BIKE_ORDER.map((b) => medalFor(70_000, MEDALS[b]))).toEqual(['bronze', 'silver', 'gold']);
    expect(BIKE_ORDER.map((b) => medalFor(140_000, MEDALS[b]))).toEqual([null, null, 'bronze']);
    // each bike's measured bot run is gold on that bike, with 5% (and the rounding up to a second) in hand;
    // bronze is generous: more than twice the bot's time
    for (const b of BIKE_ORDER) {
      const m = MEDALS[b];
      expect(medalFor(BOT_RUN_MS[b], m), b).toBe('gold');
      expect(m.gold - BOT_RUN_MS[b], b).toBeGreaterThanOrEqual(BOT_RUN_MS[b] * 0.05);
      expect(m.gold - BOT_RUN_MS[b], b).toBeLessThan(BOT_RUN_MS[b] * 0.05 + 1000);
      expect(m.bronze, b).toBeGreaterThan(2 * BOT_RUN_MS[b]);
      expect(m.gold < m.silver && m.silver < m.bronze, b).toBe(true);
      // a run with a ghost (up to 180 s) can still be a bronze on every bike
      expect(m.bronze, b).toBeLessThan(GHOST_MAX_SECONDS * 1000);
    }
    expect(medalFor(53_000, MEDALS.tonup)).toBe('gold');
    expect(medalFor(53_001, MEDALS.tonup)).toBe('silver');
    expect(nextMedal(74_000, MEDALS.sundowner)).toEqual({ medal: 'gold', timeMs: 73_000 });
    expect(nextMedal(74_000, MEDALS.tonup)).toEqual({ medal: 'silver', timeMs: 63_000 });
    expect(nextMedal(50_000, MEDALS.tonup)).toBeNull();
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
    for (const raw of ['', 'not json', '42', 'null', '[]', '{"v":3}', '{"v":99,"stage":"hampi","cols":900,"timeMs":1}']) {
      data.set(BEST_KEY, raw);
      expect(loadBest('daybreak', provider), raw).toEqual(EMPTY_BEST);
    }
    // another length of the stage, or another stage's record under this key
    data.set(BEST_KEY, JSON.stringify({ v: RECORD_VERSION, stage: 'hampi', cols: STAGE_COLS - 1, timeMs: 30_000, diyas: 5, flips: 0, ghost: '' }));
    expect(loadBest('daybreak', provider)).toEqual(EMPTY_BEST);
    data.set(BEST_KEY, JSON.stringify({ v: RECORD_VERSION, stage: 'goa', cols: STAGE_COLS, timeMs: 30_000, diyas: 5, flips: 0, ghost: '' }));
    expect(loadBest('daybreak', provider)).toEqual(EMPTY_BEST);
    // a v1 or v2 record under the v3 key is not a record either, whatever stage it claims
    for (const v of [1, 2]) {
      for (const stage of [580, STAGE_COLS, 'hampi']) {
        data.set(BEST_KEY, JSON.stringify({ v, stage, cols: STAGE_COLS, timeMs: 30_000, diyas: 5, flips: 0, ghost: '' }));
        expect(loadBest('daybreak', provider), `v${v} ${stage}`).toEqual(EMPTY_BEST);
      }
    }
    // bad fields are dropped one by one; a broken ghost is dropped but the time is kept
    data.set(BEST_KEY, JSON.stringify({ v: RECORD_VERSION, stage: 'hampi', cols: STAGE_COLS, timeMs: 30_000, diyas: 'many', flips: -3, ghost: 'x!' }));
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

describe('records per stage and bike, version 3 (v1.9)', () => {
  const ghost = encodeGhost([{ x: 40, y: 222, angle: 0 }, { x: 52.5, y: 210, angle: 12 }]);
  /** a record as v1.6 stored it (the 580-column stage) */
  const oldRecord = (best: Best): string => JSON.stringify({ v: 1, stage: 580, ...best });
  /** a record as v1.7 - v1.8 stored it (Hampi, 900 columns, one per bike) */
  const v2Record = (best: Best): string => JSON.stringify({ v: 2, stage: 900, ...best });

  it('each stage and bike has its own v3 key, and a save touches only that key', () => {
    expect(RECORD_VERSION).toBe(3);
    expect(BIKE_ORDER.map(hampiKey)).toEqual([
      'hampi-at-dusk.best.v3.hampi.tonup', 'hampi-at-dusk.best.v3.hampi.daybreak', 'hampi-at-dusk.best.v3.hampi.sundowner',
    ]);
    expect(bestKey('goa', 'tonup')).toBe('hampi-at-dusk.best.v3.goa.tonup');
    const { provider, data } = memoryStore();
    const bests: Record<string, Best> = {
      tonup: { timeMs: 51_000, diyas: 50, flips: 4, ghost },
      daybreak: { timeMs: 61_000, diyas: 56, flips: 1, ghost: '' },
      sundowner: { timeMs: 71_500, diyas: 12, flips: 0, ghost },
    };
    expect(saveBest('tonup', bests.tonup!, provider)).toBe(true);
    expect([...data.keys()]).toEqual(['hampi-at-dusk.best.v3.hampi.tonup']);
    expect(JSON.parse(data.get('hampi-at-dusk.best.v3.hampi.tonup')!)).toEqual({ v: 3, stage: 'hampi', cols: 900, ...bests.tonup });
    expect(loadBest('tonup', provider)).toEqual(bests.tonup);
    expect(loadBest('daybreak', provider)).toEqual(EMPTY_BEST);
    expect(loadBest('sundowner', provider)).toEqual(EMPTY_BEST);
    expect(saveBest('daybreak', bests.daybreak!, provider)).toBe(true);
    expect(saveBest('sundowner', bests.sundowner!, provider)).toBe(true);
    for (const b of BIKE_ORDER) expect(loadBest(b, provider), b).toEqual(bests[b]);
    expect([...data.keys()].sort()).toEqual(BIKE_ORDER.map(hampiKey).sort());
    // a broken record on one bike does not disturb the others
    data.set(hampiKey('tonup'), 'not json');
    expect(loadBest('tonup', provider)).toEqual(EMPTY_BEST);
    expect(loadBest('sundowner', provider)).toEqual(bests.sundowner);
  });

  it('a stage keeps its own records: the same bike on two stages is two records', () => {
    const { provider, data } = memoryStore();
    const onHampi: Best = { timeMs: 61_000, diyas: 56, flips: 1, ghost };
    const onGoa: Best = { timeMs: 48_000, diyas: 20, flips: 0, ghost: '' };
    expect(saveBestOf(HAMPI, 'daybreak', onHampi, provider)).toBe(true);
    expect(loadBestOf(GOA, 'daybreak', provider)).toEqual(EMPTY_BEST);
    expect(saveBestOf(GOA, 'daybreak', onGoa, provider)).toBe(true);
    expect(loadBestOf(HAMPI, 'daybreak', provider)).toEqual(onHampi);
    expect(loadBestOf(GOA, 'daybreak', provider)).toEqual(onGoa);
    expect([...data.keys()].sort()).toEqual(['hampi-at-dusk.best.v3.goa.daybreak', 'hampi-at-dusk.best.v3.hampi.daybreak']);
    expect(JSON.parse(data.get('hampi-at-dusk.best.v3.goa.daybreak')!)).toMatchObject({ v: 3, stage: 'goa', cols: 960 });
    // the stage in the record must be the stage asked for, at its present length
    expect(loadBestOf({ id: 'goa', cols: 1000 }, 'daybreak', provider)).toEqual(EMPTY_BEST);
  });

  it('migration: a v2 record becomes the bike\'s Hampi record (used, copied to the v3 key, the v2 key kept)', () => {
    expect(LEGACY_V2_STAGE).toEqual({ id: 'hampi', cols: 900 });
    expect(HAMPI.id).toBe(LEGACY_V2_STAGE.id);
    expect(HAMPI.cols).toBe(LEGACY_V2_STAGE.cols);
    expect(BIKE_ORDER.map(legacyV2Key)).toEqual([
      'hampi-at-dusk.best.v2.tonup', 'hampi-at-dusk.best.v2.daybreak', 'hampi-at-dusk.best.v2.sundowner',
    ]);
    const { provider, data } = memoryStore();
    const old: Record<BikeId, Best> = {
      tonup: { timeMs: 51_250, diyas: 56, flips: 3, ghost },
      daybreak: { timeMs: 60_100, diyas: 41, flips: 0, ghost },
      sundowner: { timeMs: 72_900, diyas: 56, flips: 1, ghost: '' },
    };
    data.set(legacyV2Key('tonup'), v2Record(old.tonup));
    data.set(legacyV2Key('daybreak'), v2Record(old.daybreak));
    const before = new Map(data);

    // used: the first load of each bike returns its v2 record, ghost and all
    expect(loadBest('tonup', provider)).toEqual(old.tonup);
    expect(loadBest('daybreak', provider)).toEqual(old.daybreak);
    // never for another bike: the Sundowner had no v2 record and has none now
    expect(loadBest('sundowner', provider)).toEqual(EMPTY_BEST);
    expect(data.has(hampiKey('sundowner'))).toBe(false);
    // copied: the v3 key now holds it, in the v3 shape
    expect(JSON.parse(data.get(hampiKey('tonup'))!)).toEqual({ v: 3, stage: 'hampi', cols: 900, ...old.tonup });
    expect(JSON.parse(data.get(hampiKey('daybreak'))!)).toEqual({ v: 3, stage: 'hampi', cols: 900, ...old.daybreak });
    // legacy kept: the v2 keys are byte for byte as they were
    for (const [k, v] of before) expect(data.get(k), k).toBe(v);

    // the bike's own record wins from then on: a new best is saved under v3, and a v2 record that changes
    // later (or was better all along) is not read again
    const u = submitRun(loadBest('tonup', provider), { timeMs: 50_400, diyas: 30, flips: 0 }, ghost);
    expect([u.newTime, u.newDiyas, u.newFlips]).toEqual([true, false, false]);
    expect(saveBest('tonup', u.best, provider)).toBe(true);
    data.set(legacyV2Key('tonup'), v2Record({ timeMs: 40_000, diyas: 56, flips: 9, ghost }));
    expect(loadBest('tonup', provider)).toEqual({ timeMs: 50_400, diyas: 56, flips: 3, ghost });
    expect(data.get(legacyV2Key('daybreak'))).toBe(before.get(legacyV2Key('daybreak')));
  });

  it('migration: only into Hampi, only from a real v2 record', () => {
    const { provider, data } = memoryStore();
    const best: Best = { timeMs: 60_100, diyas: 41, flips: 0, ghost };
    data.set(legacyV2Key('daybreak'), v2Record(best));
    // another stage does not get Hampi's old record
    expect(loadBestOf(GOA, 'daybreak', provider)).toEqual(EMPTY_BEST);
    // nor does a Hampi of another length (if the stage is ever rebuilt, its old records stop counting)
    expect(loadBestOf({ id: 'hampi', cols: 901 }, 'daybreak', provider)).toEqual(EMPTY_BEST);
    expect([...data.keys()]).toEqual([legacyV2Key('daybreak')]);
    // malformed, or not a v2 record of the 900-column stage: ignored, and nothing is written
    const bad = ['', 'not json', 'null', '[]', '{"v":2}', JSON.stringify({ v: 2, stage: 580, ...best }), JSON.stringify({ v: 1, stage: 900, ...best }),
      JSON.stringify({ v: 3, stage: 'hampi', cols: 900, ...best })];
    for (const raw of bad) {
      data.set(legacyV2Key('daybreak'), raw);
      expect(loadBest('daybreak', provider), raw).toEqual(EMPTY_BEST);
      expect(data.has(hampiKey('daybreak')), raw).toBe(false);
    }
    // bad fields in a v2 record are dropped one by one, as in any record
    data.set(legacyV2Key('daybreak'), JSON.stringify({ v: 2, stage: 900, timeMs: 61_000, diyas: 'many', flips: 2, ghost: 'x!' }));
    expect(loadBest('daybreak', provider)).toEqual({ timeMs: 61_000, diyas: null, flips: 2, ghost: '' });
  });

  it('migration with read-only or throwing storage: the v2 record is still used, nothing escapes', () => {
    const best: Best = { timeMs: 60_100, diyas: 41, flips: 0, ghost };
    const writes: string[] = [];
    const readOnly: StoreProvider = () => ({
      getItem: (k) => (k === legacyV2Key('daybreak') ? v2Record(best) : null),
      setItem: (k) => { writes.push(k); throw new Error('QuotaExceededError'); },
    });
    // the copy fails, the record is used all the same (and again on the next load)
    expect(loadBest('daybreak', readOnly)).toEqual(best);
    expect(loadBest('daybreak', readOnly)).toEqual(best);
    expect(writes).toEqual([hampiKey('daybreak'), hampiKey('daybreak')]);
    for (const provider of [throwingAccess, throwingMethods, () => null]) {
      for (const b of BIKE_ORDER) expect(loadBest(b, provider)).toEqual(EMPTY_BEST);
    }
  });

  it('the records of the 580-column stage are an archive: never read, never written, never removed', () => {
    expect(ARCHIVED_BEST_KEYS).toEqual([
      'hampi-at-dusk.best', 'hampi-at-dusk.best.tonup', 'hampi-at-dusk.best.daybreak', 'hampi-at-dusk.best.sundowner',
    ]);
    // none of them is a key this version uses
    for (const b of BIKE_ORDER) {
      expect(ARCHIVED_BEST_KEYS).not.toContain(hampiKey(b));
      expect(ARCHIVED_BEST_KEYS).not.toContain(legacyV2Key(b));
    }

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
    // A first run on each bike is a new best, and is saved under the v3 key.
    for (const b of BIKE_ORDER) {
      const u = submitRun(loadBest(b, provider), { timeMs: 80_000, diyas: 40, flips: 0 }, ghost);
      expect([u.newTime, u.newDiyas, u.newFlips], b).toEqual([true, true, true]);
      expect(saveBest(b, u.best, provider)).toBe(true);
      expect(loadBest(b, provider).timeMs, b).toBe(80_000);
    }
    loadPrefs(provider);
    savePrefs({ ...loadPrefs(provider), tutorialDone: true }, provider);
    loadUnlocks(provider);
    saveUnlocks(['hampi'], provider);
    saveJourneyBest(['hampi'], 'daybreak', 80_000, provider);
    loadJourneyBest(['hampi'], 'daybreak', provider);

    // Every read was of a v3 key, a v2 key (the migration looks there while a bike has no v3 record), the
    // prefs or the journey's records; every write was to a v3 key, the prefs or the journey's records. The
    // archive was never touched and is byte for byte as it was.
    const written = new Set([...BIKE_ORDER.map(hampiKey), PREFS_KEY, UNLOCKS_KEY, journeyKey(['hampi'], 'daybreak')]);
    const readable = new Set([...written, ...BIKE_ORDER.map(legacyV2Key)]);
    expect(reads.length).toBeGreaterThan(0);
    expect(writes.length).toBeGreaterThan(0);
    for (const k of reads) expect(readable.has(k), k).toBe(true);
    for (const k of writes) expect(written.has(k), k).toBe(true);
    for (const k of ARCHIVED_BEST_KEYS) expect(data.get(k), k).toBe(old[k]);
    expect([...data.keys()].sort()).toEqual([...ARCHIVED_BEST_KEYS, ...written].sort());
  });

  it('an old record copied to a new key by hand is still not a record (wrong version, wrong stage)', () => {
    const { provider, data } = memoryStore();
    data.set(hampiKey('daybreak'), oldRecord({ timeMs: 38_125, diyas: 30, flips: 2, ghost }));
    expect(loadBest('daybreak', provider)).toEqual(EMPTY_BEST);
    data.set(hampiKey('daybreak'), JSON.stringify({ v: 3, stage: 580, timeMs: 38_125, diyas: 30, flips: 2, ghost }));
    expect(loadBest('daybreak', provider)).toEqual(EMPTY_BEST);
    // and a 580-column record under a v2 key is not migrated
    data.clear();
    data.set(legacyV2Key('daybreak'), oldRecord({ timeMs: 38_125, diyas: 30, flips: 2, ghost }));
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
    expect(reads.sort()).toEqual([...BIKE_ORDER.map(hampiKey), ...BIKE_ORDER.map(legacyV2Key)].sort());
    for (const provider of [throwingAccess, throwingMethods]) {
      for (const b of BIKE_ORDER) expect(loadBest(b, provider)).toEqual(EMPTY_BEST);
    }
  });
});

describe('the journey\'s records (v1.9)', () => {
  it('unlocks: a list of stage ids under one key; anything malformed is no unlocks', () => {
    expect(UNLOCKS_KEY).toBe('hampi-at-dusk.unlocks');
    const { provider, data } = memoryStore();
    expect(loadUnlocks(provider)).toEqual([]);
    expect(saveUnlocks(['hampi', 'goa'], provider)).toBe(true);
    expect(JSON.parse(data.get(UNLOCKS_KEY)!)).toEqual({ v: 1, stages: ['hampi', 'goa'] });
    expect(loadUnlocks(provider)).toEqual(['hampi', 'goa']);
    for (const raw of ['', 'not json', 'null', '42', '[]', '{}', '{"stages":"hampi"}']) {
      data.set(UNLOCKS_KEY, raw);
      expect(loadUnlocks(provider), raw).toEqual([]);
    }
    // entries that are not stage ids are dropped, and each id counts once
    data.set(UNLOCKS_KEY, '{"v":1,"stages":["goa",7,null,"Goa!","goa","ladakh",""]}');
    expect(loadUnlocks(provider)).toEqual(['goa', 'ladakh']);
    for (const p of [throwingAccess, throwingMethods, () => null]) {
      expect(loadUnlocks(p)).toEqual([]);
      expect(saveUnlocks(['hampi'], p)).toBe(false);
    }
  });

  it('journey best: one per route and bike; a longer journey is another record', () => {
    expect(journeyKey(['hampi'], 'daybreak')).toBe('hampi-at-dusk.journey.v1.hampi.daybreak');
    expect(journeyKey(['hampi', 'goa', 'ladakh'], 'tonup')).toBe('hampi-at-dusk.journey.v1.hampi+goa+ladakh.tonup');
    const { provider, data } = memoryStore();
    expect(loadJourneyBest(['hampi'], 'daybreak', provider)).toBeNull();
    expect(saveJourneyBest(['hampi'], 'daybreak', 61_234.4, provider)).toBe(true);
    expect(JSON.parse(data.get(journeyKey(['hampi'], 'daybreak'))!)).toEqual({ v: 1, route: 'hampi', timeMs: 61_234 });
    expect(loadJourneyBest(['hampi'], 'daybreak', provider)).toBe(61_234);
    // another bike, or the journey once it has grown: no record yet, and the old one stays
    expect(loadJourneyBest(['hampi'], 'tonup', provider)).toBeNull();
    expect(loadJourneyBest(['hampi', 'goa'], 'daybreak', provider)).toBeNull();
    expect(saveJourneyBest(['hampi', 'goa'], 'daybreak', 130_000, provider)).toBe(true);
    expect(loadJourneyBest(['hampi'], 'daybreak', provider)).toBe(61_234);
    expect(loadJourneyBest(['hampi', 'goa'], 'daybreak', provider)).toBe(130_000);
    // malformed, another version, or a record of another route under this key
    for (const raw of ['', 'x', 'null', '{"v":1}', '{"v":2,"route":"hampi","timeMs":5}', '{"v":1,"route":"goa","timeMs":5}', '{"v":1,"route":"hampi","timeMs":-1}']) {
      data.set(journeyKey(['hampi'], 'daybreak'), raw);
      expect(loadJourneyBest(['hampi'], 'daybreak', provider), raw).toBeNull();
    }
    for (const p of [throwingAccess, throwingMethods, () => null]) {
      expect(loadJourneyBest(['hampi'], 'daybreak', p)).toBeNull();
      expect(saveJourneyBest(['hampi'], 'daybreak', 1, p)).toBe(false);
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
    expect((MEDALS.sundowner.bronze / 1000) * GHOST_HZ).toBeLessThan(GHOST_MAX_SAMPLES);
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
