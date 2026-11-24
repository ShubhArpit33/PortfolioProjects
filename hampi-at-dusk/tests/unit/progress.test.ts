import { describe, expect, it } from 'vitest';
import {
  BASE_BPM, CHORDS, MELODY_MAX, MELODY_MIN, SCALE, SONG_BARS, STEPS_PER_BAR, barScore, degreeHz, songPosition, songSeconds,
} from '../../src/audio/music';
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
