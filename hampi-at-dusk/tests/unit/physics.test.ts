import { describe, expect, it } from 'vitest';
import {
  BIKES, BIKE_ORDER, BOT_RUN_MS, DEFAULT_BIKE, bikeDef, isBikeId, medalsFor, statBars, type BikeDef, type BikeId,
} from '../../src/bike/bikes';
import { CONFIG, type Config } from '../../src/config';
import {
  FIXED_DT, aabbOverlap, bikeAABB, countFlips, createBikeState, evaluateLanding, hitsObstacle, normalizeAngle, step,
  stumble, touchesDiya, wobbleLanding, type BikeInput, type BikeState,
} from '../../src/bike/BikePhysics';
import {
  BOULDER_END_X, BOULDER_GROUND_Y, BOULDER_SPAWN_X, BOULDER_TRIGGER_X, boulderBox, boulderBoxAt, boulderMeetX, createBoulder,
  stepBoulder,
} from '../../src/level/boulder';
import {
  BASELINE_Y, BONUS, BOULDER, CHECKPOINTS, COW, DIYAS, FINISH, KICKER, LEVEL, OBSTACLES, PROMPTS, SAFE_ZONE, SECTIONS, STAGE_COLS,
  TILE, WORLD_START_X, checkpointX, diyaCentre, promptAt,
} from '../../src/level/levelData';
import { TERRAIN, obstacleBox, type Box } from '../../src/level/terrain';
import { boulderMeetX as planMeetX, hopLength, layout, planHopsFor } from '../shared/plan';
import { LOG_BOXES, SAFE_X1, botHops, ride } from '../shared/sim';

const COW_BOX: Box = { x: COW.col * TILE, y: BASELINE_Y - COW.h, w: COW.w, h: COW.h };
const CANAL_GAPS = TERRAIN.gaps.filter((g) => !g.river && !g.kicker && !g.step);
const RISERS = TERRAIN.gaps.filter((g) => g.step);
const KICKER_GAP = TERRAIN.gaps.find((g) => g.kicker)!;
const RIVER = TERRAIN.gaps.find((g) => g.river)!;
/** The river checkpoint: the last one. */
const RIVER_CP = CHECKPOINTS.length - 1;
/** First column of a section, by name. */
const sectionCol = (name: string): number => SECTIONS.find((s) => s.name === name)!.startCol;
/** The Boulder Field started at column 220 before v1.7 put the Warm-up Road in front of everything. */
const BOULDER_FIELD = sectionCol('Boulder Field');
const RIVER_RAMP = TERRAIN.pieces.find((p) => p.noHop)!;

/** A grounded bike already moving at speed v. */
function rolling(x: number, v: number, cfg: Config = CONFIG): BikeState {
  const s = createBikeState(x, TERRAIN, cfg);
  s.v = v;
  return s;
}

interface RunResult { state: BikeState; steps: number; landedAt: number | null; hitBox: boolean }

/** Steps until the bike crashes, hits a box, lands from an air of >= 120 ms, or maxSteps pass. */
function runUntilLanding(
  start: BikeState,
  inputAt: (s: BikeState, i: number) => BikeInput,
  boxes: readonly Box[] = [],
  maxSteps = 120 * 6,
  cfg: Config = CONFIG,
): RunResult {
  let s = start;
  for (let i = 0; i < maxSteps; i++) {
    s = step(s, inputAt(s, i), FIXED_DT, TERRAIN, cfg);
    if (hitsObstacle(s, boxes, cfg)) return { state: s, steps: i + 1, landedAt: null, hitBox: true };
    if (s.crashed) return { state: s, steps: i + 1, landedAt: null, hitBox: false };
    if (s.evLanding && s.evLanding !== 'silent') return { state: s, steps: i + 1, landedAt: s.x, hitBox: false };
  }
  return { state: s, steps: maxSteps, landedAt: null, hitBox: false };
}

/** Longest contiguous run of `true` in samples taken every `stepPx`, as a distance in px. */
function longestWindowPx(samples: boolean[], stepPx: number): number {
  let best = 0;
  let run = 0;
  for (const ok of samples) {
    run = ok ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best > 0 ? (best - 1) * stepPx : 0;
}

describe('level data (5.1)', () => {
  it('each section adds up to its column range', () => {
    let col = 0;
    for (const sec of SECTIONS) {
      expect(sec.startCol).toBe(col);
      const sum = sec.segments.reduce((n, seg) => n + (seg.kind === 'cliff' ? 0 : seg.cols), 0);
      expect(sum, sec.name).toBe(sec.endCol - sec.startCol + 1);
      col += sum;
    }
    expect(col).toBe(900);
    expect(STAGE_COLS).toBe(900);
    expect(TERRAIN.width).toBe(14400);
    expect(LEVEL.stageWidth).toBe(14400);
    expect(SECTIONS.map((x) => x.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(SECTIONS.map((x) => [x.startCol, x.endCol])).toEqual([
      [0, 119], [120, 179], [180, 259], [260, 339], [340, 419], [420, 503], [504, 613], [614, 723], [724, 839], [840, 899],
    ]);
    // only the warm-up is a no-crash zone, and the zone is exactly that section
    expect(SECTIONS.filter((x) => x.safe).map((x) => x.name)).toEqual(['Warm-up Road']);
    expect(SAFE_ZONE).toEqual({ fromCol: 0, toCol: 120 });
  });

  it('gap columns match the spec', () => {
    const cols = TERRAIN.gaps.map((g) => [g.col0, g.col0 + g.cols - 1]);
    expect(cols).toEqual([
      [188, 190], [199, 202], [211, 215], [222, 224], [228, 230], [239, 244], // canals
      [670, 677],                                                             // the kicker's tank
      [738, 738], [754, 754], [770, 770],                                     // the three risers
      [868, 879],                                                             // the river
    ]);
    expect(RIVER.nearY).toBe(BASELINE_Y - 4 * TILE); // lip at h4
    expect(RIVER.farY).toBe(BASELINE_Y);             // far bank at h0
    for (const g of CANAL_GAPS) expect(g.farY).toBe(g.nearY);
    expect(KICKER_GAP.nearY).toBe(BASELINE_Y - 2 * TILE); // kicker lip at h2
    expect(KICKER_GAP.farY).toBe(BASELINE_Y);
    // each riser is one dry column whose far bank is one tile higher than its near one
    RISERS.forEach((g, i) => {
      expect(g.nearY).toBe(BASELINE_Y - i * TILE);
      expect(g.farY).toBe(BASELINE_Y - (i + 1) * TILE);
      expect([g.river, g.kicker]).toEqual([false, false]);
    });
    expect(RISERS).toHaveLength(3);
  });

  it('heightfield is continuous, null over gaps, with a cliff at each drop', () => {
    expect(TERRAIN.surfaceY(0)).toBe(222);
    expect(TERRAIN.surfaceY(188 * 16)).toBeNull();
    expect(TERRAIN.surfaceY(191 * 16)).toBe(222);
    // ramp 6 +2 at columns 346-351: halfway is one tile up
    expect(TERRAIN.surfaceY(349 * 16)).toBeCloseTo(222 - 16, 6);
    expect(TERRAIN.slopeAngle(349 * 16)).toBeCloseTo(18.435, 2);
    expect(TERRAIN.slopeAngle(358 * 16)).toBeCloseTo(-26.565, 2);
    // the Boulder Field's cliff, the bonus ramp's (the same shape), and the three stairs down off the terrace
    expect(TERRAIN.cliffs).toEqual([
      { x: 381 * 16, topY: 222 - 48, bottomY: 222 },
      { x: BONUS.cliffCol * 16, topY: 222 - 48, bottomY: 222 },
      { x: 817 * 16, topY: 222 - 48, bottomY: 222 - 32 },
      { x: 822 * 16, topY: 222 - 32, bottomY: 222 - 16 },
      { x: 827 * 16, topY: 222 - 16, bottomY: 222 },
    ]);
    expect(TERRAIN.surfaceY(381 * 16 - 0.01)).toBe(174);
    expect(TERRAIN.surfaceY(381 * 16)).toBe(222);
    // the terrace is h3 from the top riser to the first stair
    expect(TERRAIN.surfaceY(771 * 16)).toBe(BOULDER_GROUND_Y);
    expect(TERRAIN.surfaceY(817 * 16 - 0.01)).toBe(BOULDER_GROUND_Y);
    expect(BOULDER_GROUND_Y).toBe(222 - 48);
    // river ramp is the only noHop segment
    expect(TERRAIN.isNoHop(860 * 16)).toBe(true);
    expect(TERRAIN.isNoHop(867 * 16 + 15)).toBe(true);
    expect(TERRAIN.isNoHop(859 * 16 + 15)).toBe(false);
    expect(TERRAIN.pieces.filter((p) => p.noHop)).toHaveLength(1);
    expect(RIVER_RAMP.col0).toBe(860);
    // no steps between neighbouring ground pieces except at the cliffs
    const cliffXs = TERRAIN.cliffs.map((c) => c.x);
    for (let i = 1; i < TERRAIN.pieces.length; i++) {
      const a = TERRAIN.pieces[i - 1]!;
      const b = TERRAIN.pieces[i]!;
      if (a.x1 === b.x0 && !cliffXs.includes(b.x0)) expect(a.y1).toBe(b.y0);
    }
    expect(DIYAS).toHaveLength(56);
    expect(new Set(DIYAS.map((d) => `${d.col}:${d.h}`)).size).toBe(56);
  });

  it('entities stand where the layout says (v1.7)', () => {
    expect(CHECKPOINTS.map((c) => c.col)).toEqual([2, 122, 182, 232, 262, 342, 422, 506, 616, 726, 774, 842]);
    expect(CHECKPOINTS.map((c) => c.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(CHECKPOINTS.filter((c) => c.hint).map((c) => [c.id, c.hint])).toEqual([
      [8, 'HOP ON THE RAMP!'], [9, 'HOP UP THE STEPS!'], [11, 'HOLD SHIFT - BOOST!'],
    ]);
    // every checkpoint is on solid, level ground
    for (const c of CHECKPOINTS) {
      expect(TERRAIN.surfaceY(checkpointX(c)), `cp${c.id}`).not.toBeNull();
      expect(TERRAIN.slopeAngle(checkpointX(c)), `cp${c.id}`).toBe(0);
    }
    expect(OBSTACLES.map((o) => `${o.type}@${o.col}`)).toEqual([
      'log@36', 'pillar@276', 'pillar@304', 'cart@318', 'pillar@332', 'pillar@528', 'pillar@545', 'pillar@562', 'cart@581',
    ]);
    expect(LOG_BOXES).toEqual([{ x: 36 * 16, y: 222 - 8, w: 16, h: 8 }]);
    expect([COW.col, FINISH.col, KICKER.rampCol, KICKER.lipCol]).toEqual([164, 892, 666, 670]);
    expect(BONUS).toEqual({ rampCol: 442, lipCol: 451, cliffCol: 456 });
    expect(BOULDER).toEqual({ triggerCol: 781, spawnCol: 811, endCol: 771, speed: 80, hitW: 16, hitH: 14, terraceH: 3 });
    // the boulder's checkpoint is on the terrace, before its trigger; the boulder starts before the stairs down
    expect(CHECKPOINTS[10]!.col).toBeGreaterThan(BOULDER.endCol);
    expect(CHECKPOINTS[10]!.col).toBeLessThan(BOULDER.triggerCol);
    expect(BOULDER.spawnCol).toBeLessThan(817);
    for (const d of DIYAS) expect(d.col).toBeLessThan(FINISH.col);
  });

  it('tutorial prompts cover the warm-up only, one at a time (v1.7)', () => {
    expect(PROMPTS.map((p) => p.text)).toEqual([
      'HOLD RIGHT TO RIDE', 'SPACE - HOP THE LOG', 'HOLD SHIFT - BOOST', 'IN THE AIR: UP / DOWN TO TILT',
    ]);
    for (let i = 0; i < PROMPTS.length; i++) {
      const p = PROMPTS[i]!;
      expect(p.fromCol).toBeLessThan(p.toCol);
      expect(p.toCol).toBeLessThanOrEqual(SAFE_ZONE.toCol);
      if (i > 0) expect(p.fromCol).toBeGreaterThanOrEqual(PROMPTS[i - 1]!.toCol);
      expect(p.text).toMatch(/^[A-Z :/-]+$/);             // ASCII, the UI font
      expect(p.text.length * 8).toBeLessThanOrEqual(440); // fits the 480 px screen
    }
    expect(promptAt(checkpointX(CHECKPOINTS[0]!))).toBe('HOLD RIGHT TO RIDE');
    expect(promptAt(30 * 16)).toBe('SPACE - HOP THE LOG');
    expect(promptAt(42 * 16)).toBe('');                   // a beat of nothing after the log
    expect(promptAt(60 * 16)).toBe('HOLD SHIFT - BOOST');
    expect(promptAt(85 * 16)).toBe('IN THE AIR: UP / DOWN TO TILT');
    expect(promptAt(100 * 16)).toBe('');
    expect(promptAt(checkpointX(CHECKPOINTS[1]!))).toBe('');
    // the log's prompt is up before the log, the tilt prompt before the roller
    expect(PROMPTS[1]!.fromCol).toBeLessThan(36);
    expect(PROMPTS[3]!.fromCol).toBeLessThan(84);
  });
});

describe('landing (criterion 7)', () => {
  it('40 deg off the slope crashes, 5 deg is CLEAN', () => {
    expect(evaluateLanding(40, 0)).toBe('crash');
    expect(evaluateLanding(-40, 0)).toBe('crash');
    expect(evaluateLanding(5, 0)).toBe('clean');
    expect(evaluateLanding(-5, 0)).toBe('clean');
    expect(evaluateLanding(20, 0)).toBe('safe');
    expect(evaluateLanding(10, 0)).toBe('clean');
    expect(evaluateLanding(35, 0)).toBe('safe');
    expect(evaluateLanding(35.01, 0)).toBe('crash');
    // relative to the slope, and normalised to [-180, 180]
    expect(evaluateLanding(26.57 + 5, 26.57)).toBe('clean');
    expect(evaluateLanding(26.57 - 40, 26.57)).toBe('crash');
    expect(evaluateLanding(365, 0)).toBe('clean');
    expect(evaluateLanding(-175, 180)).toBe('clean');
    expect(normalizeAngle(190)).toBe(-170);
  });

  it('in the simulation: a hop landed 40 deg off crashes, 5 deg off gives CLEAN + boost', () => {
    const land = (angleAtLanding: number) => {
      let s = rolling(200, 240);
      s.boost = 0.5;
      s = step(s, { throttle: true, hop: true });
      for (let i = 0; i < 600 && !s.grounded && !s.crashed; i++) {
        s = { ...s, angle: angleAtLanding + CONFIG.airNoseDropSpeed * FIXED_DT }; // cancels the drift
        s = step(s, { throttle: true });
      }
      return s;
    };
    const bad = land(40);
    expect(bad.crashed).toBe('landing');
    expect(bad.evLanding).toBe('crash');
    const good = land(5);
    expect(good.crashed).toBeNull();
    expect(good.evLanding).toBe('clean');
    expect(good.boost).toBeCloseTo(0.5 + CONFIG.boostCleanLanding, 2);
    expect(good.v).toBeCloseTo(240, 3);
  });

  it('short airs (< 120 ms) re-attach silently with no angle check', () => {
    // Coast off the flat -> down-ramp corner (Boulder Field, column 357) slowly enough for a short air.
    let s = rolling((BOULDER_FIELD + 17) * 16 - 4, 80);
    let sawSilent = false;
    for (let i = 0; i < 240; i++) {
      s = step(s, {});
      if (s.evLanding === 'silent') sawSilent = true;
      expect(s.evLanding === null || s.evLanding === 'silent').toBe(true);
    }
    expect(sawSilent).toBe(true);
    expect(s.crashed).toBeNull();
  });
});

describe('ground rules', () => {
  it('throttle reaches topSpeed and holds it; brake stops', () => {
    let s = createBikeState(40);
    for (let i = 0; i < 120 * 3; i++) s = step(s, { throttle: true });
    expect(s.v).toBe(CONFIG.topSpeed);
    // 240 / 400 = 0.6 s to stop; 100 steps is still inside the hold delay that precedes backing up
    for (let i = 0; i < 100; i++) s = step(s, { brake: true });
    expect(s.v).toBe(0);
    expect(s.vx).toBe(0);
  });

  it('holds 240 up the river ramp without boost', () => {
    let s = rolling(RIVER_RAMP.x0 - 16, 240);
    let lipSpeed = 0;
    while (s.grounded) {
      lipSpeed = s.v;
      s = step(s, { throttle: true });
    }
    expect(lipSpeed).toBeCloseTo(240, 6);
    expect(s.x).toBeGreaterThanOrEqual(RIVER.x0);
  });

  it('boost: needs no throttle, drains only while applied, no regen while held, decays at brake rate after', () => {
    let s = createBikeState(40);
    for (let i = 0; i < 120; i++) s = step(s, { boost: true });
    expect(s.v).toBe(CONFIG.boostSpeed);
    expect(s.boost).toBeCloseTo(1 - CONFIG.boostDrainPerSec, 6);
    // release: speed above topSpeed decays at brake rate (no instant clamp)
    const released = step(s, { throttle: true });
    expect(released.v).toBeCloseTo(CONFIG.boostSpeed - CONFIG.brake * FIXED_DT, 6);
    let r = released;
    for (let i = 0; i < 60; i++) r = step(r, { throttle: true });
    expect(r.v).toBe(CONFIG.topSpeed);
    // in the air: no drain, no regen, no acceleration
    let a = step(s, { boost: true, hop: true });
    const boostAtTakeoff = a.boost;
    const vxAtTakeoff = a.vx;
    while (!a.grounded) {
      expect(a.boost).toBe(boostAtTakeoff);
      expect(a.vx).toBe(vxAtTakeoff);
      a = step(a, { boost: true });
    }
    // empty meter while held: no boost, no regen
    let e = createBikeState(40);
    e.boost = 0;
    for (let i = 0; i < 120 * 3; i++) e = step(e, { boost: true, throttle: true });
    expect(e.boost).toBe(0);
    expect(e.v).toBe(CONFIG.topSpeed);
    for (let i = 0; i < 120; i++) e = step(e, { throttle: true });
    expect(e.boost).toBeCloseTo(CONFIG.boostRegenPerSec, 6);
  });

  it('hop: buffer (100 ms) and coyote (80 ms); none on or off the noHop ramp', () => {
    // buffer: pressed 80 ms before landing -> hops again on touchdown
    let s = rolling(200, 240);
    s = step(s, { hop: true });
    let hops = 1;
    let pressAt = -1;
    for (let i = 0; i < 400; i++) {
      // air time is 0.8 s = 96 steps; press again 10 steps (83 ms) before touchdown
      const press = i >= 85 && i < 88;
      if (press && pressAt < 0) pressAt = i;
      s = step(s, { hop: press });
      if (s.evHop) hops++;
    }
    expect(hops).toBe(2);
    // too early (150 ms before touchdown) -> no second hop
    s = step(rolling(200, 240), { hop: true });
    hops = 1;
    for (let i = 0; i < 400; i++) {
      s = step(s, { hop: i >= 77 && i < 79 });
      if (s.evHop) hops++;
    }
    expect(hops).toBe(1);

    // coyote: roll off a canal edge, press 60 ms later -> still hops; 100 ms later -> no hop
    const g = CANAL_GAPS[0]!;
    const coyote = (delaySteps: number) => {
      let c = rolling(g.x0 - 1, 240);
      let leftAt = -1;
      for (let i = 0; i < 200 && !c.crashed; i++) {
        if (!c.grounded && leftAt < 0) leftAt = i;
        c = step(c, { throttle: true, hop: leftAt >= 0 && i >= leftAt + delaySteps });
        if (c.evHop) return true;
      }
      return false;
    };
    expect(coyote(7)).toBe(true);   // 58 ms
    expect(coyote(12)).toBe(false); // 100 ms

    // noHop: mashing hop on the river ramp and past its lip never hops
    let n = rolling(RIVER_RAMP.x0 + 2, 240);
    let hopped = false;
    for (let i = 0; i < 400 && !n.crashed; i++) {
      n = step(n, { throttle: true, hop: i % 2 === 0 });
      if (n.evHop) hopped = true;
    }
    expect(hopped).toBe(false);
    expect(n.crashed).toBe('water');
  });

  it('is deterministic', () => {
    const run = () => {
      let s = createBikeState(40);
      for (let i = 0; i < 3000 && !s.crashed; i++) {
        s = step(s, { throttle: true, hop: i % 150 < 3, tiltUp: i % 7 === 0 });
      }
      return s;
    };
    expect(run()).toEqual(run());
  });
});

describe('backing up at a standstill', () => {
  const HOLD_STEPS = Math.round((CONFIG.reverseHoldDelayMs / 1000) * 120);

  it('Left from a standstill backs up at once, reaching and holding reverseSpeed', () => {
    let s = createBikeState(400);
    s.boost = 0.5;
    let idle = createBikeState(400);
    idle.boost = 0.5;
    s = step(s, { brake: true });
    expect(s.v).toBeCloseTo(-CONFIG.reverseAccel * FIXED_DT, 9);
    let minV = 0;
    for (let i = 0; i < 120 * 2; i++) {
      s = step(s, { brake: true });
      minV = Math.min(minV, s.v);
      expect(s.grounded).toBe(true);
      expect(s.evHop).toBe(false);
      expect(s.evLanding).toBeNull();
    }
    for (let i = 0; i < 120 * 2 + 1; i++) idle = step(idle, {});
    expect(s.v).toBe(-CONFIG.reverseSpeed);
    expect(minV).toBe(-CONFIG.reverseSpeed);
    expect(s.vx).toBe(-CONFIG.reverseSpeed);
    expect(s.x).toBeLessThan(400 - CONFIG.reverseSpeed * 1.5);
    expect(s.y).toBe(BASELINE_Y);
    expect(s.crashed).toBeNull();
    // the meter behaves exactly as it does standing still (plain regen)
    expect(s.boost).toBeCloseTo(idle.boost, 12);
    expect(s.boosting).toBe(false);
  });

  it('Left while moving forward only brakes: no reverse until it has been held at rest for the hold delay', () => {
    let s = rolling(1000 - 200, 240);
    let steps = 0;
    while (s.v > 0) {
      const before = s.v;
      s = step(s, { brake: true });
      expect(s.v).toBeGreaterThanOrEqual(0);
      expect(s.v).toBeCloseTo(Math.max(0, before - CONFIG.brake * FIXED_DT), 9);
      steps++;
    }
    expect(steps).toBe(Math.ceil(240 / (CONFIG.brake * FIXED_DT)));
    const stopX = s.x;
    for (let i = 0; i < HOLD_STEPS; i++) {
      s = step(s, { brake: true });
      expect(s.v).toBe(0);
    }
    expect(s.x).toBe(stopX);
    for (let i = 0; i < 4; i++) s = step(s, { brake: true });
    expect(s.v).toBeLessThan(0);
    expect(s.x).toBeLessThan(stopX);
  });

  it('a released and re-pressed Left backs up without the delay', () => {
    let s = rolling(800, 100);
    while (s.v > 0) s = step(s, { brake: true });
    s = step(s, {});
    s = step(s, { brake: true });
    expect(s.v).toBeLessThan(0);
  });

  it('releasing Left stops the bike at the brake rate, and it stays stopped', () => {
    let s = createBikeState(400);
    for (let i = 0; i < 120; i++) s = step(s, { brake: true });
    expect(s.v).toBe(-CONFIG.reverseSpeed);
    const stopSteps = Math.ceil(CONFIG.reverseSpeed / (CONFIG.brake * FIXED_DT));
    for (let i = 0; i < stopSteps; i++) {
      s = step(s, {});
      expect(s.v).toBeLessThanOrEqual(0);
    }
    expect(s.v).toBe(0);
    const x = s.x;
    for (let i = 0; i < 120; i++) s = step(s, {});
    expect(s.v).toBe(0);
    expect(s.x).toBe(x);
  });

  it('Right while backing up brakes to a stop first, then drives forward', () => {
    let s = createBikeState(400);
    for (let i = 0; i < 120; i++) s = step(s, { brake: true });
    let prev = s.v;
    let sawZero = false;
    for (let i = 0; i < 60; i++) {
      s = step(s, { throttle: true });
      expect(s.v).toBeGreaterThanOrEqual(prev);
      if (prev < 0) expect(s.v).toBeLessThanOrEqual(0); // never jumps through zero
      if (s.v === 0) sawZero = true;
      prev = s.v;
    }
    expect(sawZero).toBe(true);
    expect(s.v).toBeGreaterThan(0);
  });

  it('is clamped at the start of the level', () => {
    let s = createBikeState(checkpointX(CHECKPOINTS[0]!));
    for (let i = 0; i < 120 * 5; i++) s = step(s, { brake: true });
    expect(s.x).toBe(WORLD_START_X);
    expect(s.v).toBe(0);
    expect(s.vx).toBe(0);
    expect(s.grounded).toBe(true);
    expect(s.crashed).toBeNull();
    // and it can ride away again
    for (let i = 0; i < 60; i++) s = step(s, { throttle: true });
    expect(s.x).toBeGreaterThan(WORLD_START_X);
  });

  it('follows the slope: backing down the river ramp stays glued to the surface, and holds when released', () => {
    let s = createBikeState(RIVER_RAMP.x0 + 4 * TILE);
    const y0 = s.y;
    for (let i = 0; i < 120; i++) {
      s = step(s, { brake: true });
      expect(s.grounded).toBe(true);
      expect(s.y).toBeCloseTo(TERRAIN.surfaceY(s.x)!, 6);
    }
    expect(s.v).toBe(-CONFIG.reverseSpeed);
    expect(s.y).toBeGreaterThan(y0); // lower on the ramp
    for (let i = 0; i < 120; i++) s = step(s, {});
    expect(s.v).toBe(0);
    // crossing ramp corners backwards never launches the bike (boulder field crest and dip)
    s = createBikeState((BOULDER_FIELD + 18) * TILE);
    for (let i = 0; i < 120 * 8; i++) {
      s = step(s, { brake: true });
      expect(s.grounded).toBe(true);
      expect(s.evLanding).toBeNull();
    }
    expect(s.x).toBeLessThan((BOULDER_FIELD + 6) * TILE);
  });

  it('backing into a canal falls in the water (normal crash rules)', () => {
    const gap = CANAL_GAPS[0]!;
    let s = createBikeState(gap.x1 + 20);
    for (let i = 0; i < 120 * 3 && !s.crashed; i++) s = step(s, { brake: true });
    expect(s.crashed).toBe('water');
    expect(s.x).toBeLessThan(gap.x1);
    expect(s.x).toBeGreaterThan(gap.x0);
  });

  it('backing into the foot of the cliff just stops against it', () => {
    const cliff = TERRAIN.cliffs[0]!;
    let s = createBikeState(cliff.x + 30);
    for (let i = 0; i < 120 * 3; i++) s = step(s, { brake: true });
    expect(s.crashed).toBeNull();
    expect(s.grounded).toBe(true);
    expect(s.x).toBeGreaterThanOrEqual(cliff.x);
    expect(s.x).toBeLessThan(cliff.x + 1);
    expect(s.y).toBe(cliff.bottomY);
    expect(s.v).toBe(0);
  });

  it('no hop while backing up; the buffered press fires once the bike has stopped', () => {
    let s = createBikeState(400);
    for (let i = 0; i < 120; i++) s = step(s, { brake: true });
    s = step(s, { brake: true, hop: true });
    expect(s.evHop).toBe(false);
    expect(s.grounded).toBe(true);
    // hop from a standstill still works
    let t = createBikeState(400);
    t = step(t, { hop: true });
    expect(t.evHop).toBe(true);
  });

  it('Left in the air does nothing (no air brake, no reverse)', () => {
    let a = rolling(400, 200);
    let b = rolling(400, 200);
    a = step(a, { hop: true });
    b = step(b, { hop: true });
    for (let i = 0; i < 30; i++) {
      a = step(a, { brake: true });
      b = step(b, {});
    }
    expect(a.grounded).toBe(false);
    expect(a.x).toBe(b.x);
    expect(a.vx).toBe(b.vx);
  });
});

// =================================================================================================
// The roster (v1.6). Every stage rule is checked on every bike; the floors below come from the measured
// numbers in DECISIONS.md (v1.6) with a little slack, so a tuning change that eats a margin fails here.
// =================================================================================================

const ROSTER = BIKE_ORDER.map((id) => [BIKES[id].name, BIKES[id]] as const);

interface Floors {
  /** hop window (ms) over the paired gaps in ONE hop, and by the two-hop route (null = not this bike's line) */
  pairOneHopMs: number;
  pairTwoHopMs: number | null;
  /** rolling off the kicker at top speed with no hop */
  kickerRoll: 'water' | 'clears';
  /** shortest landing margin (px past the tank) of any hop taken on the kicker ramp */
  kickerMinMarginPx: number;
  /** seconds to spare after a full turn with the key simply held off the kicker (null: it does not fit) */
  heldFlipSlackS: number | null;
  pillarMs: number; cartMs: number; cowMs: number;
  /** how far short of the far bank the no-boost river arc comes down, and the margin with boost (px) */
  riverShortPx: number;
  riverMarginPx: number;
  planner: 'centred' | 'interval';
  /** does the plan survive with no tilt input at all (nose drift only)? */
  noTiltRun: boolean;
  // --- v1.7 ---
  /** hop window (ms) over a riser at top speed, and what is left for the next riser after any hop that cleared one */
  riserMs: number;
  riserChainMs: number;
  logMs: number;
  /** hop window (ms) over the rolling boulder: standing still, at top speed, at boost speed */
  boulderStandMs: number;
  boulderTopMs: number;
  boulderBoostMs: number;
  /** from a standing start at cp3 (the widest canal), cp9 (the first riser), cp10 (the boulder): single-hop window (ms) */
  restCanalMs: number;
  restRiserMs: number;
  restBoulderMs: number;
  /** take-off px on the bonus ramp from which a backflip lands, and the longest unbroken stretch of them (ms) */
  bonusFlipPx: number;
  bonusFlipMs: number;
}

const FLOORS: Record<BikeId, Floors> = {
  tonup: {
    pairOneHopMs: 200, pairTwoHopMs: null, kickerRoll: 'clears', kickerMinMarginPx: 16, heldFlipSlackS: 0.2,
    pillarMs: 300, cartMs: 150, cowMs: 280, riverShortPx: 16, riverMarginPx: 64, planner: 'interval',
    noTiltRun: false,
    riserMs: 560, riserChainMs: 200, logMs: 480, boulderStandMs: 120, boulderTopMs: 470, boulderBoostMs: 500,
    restCanalMs: 200, restRiserMs: 430, restBoulderMs: 470, bonusFlipPx: 180, bonusFlipMs: 480,
  },
  daybreak: {
    pairOneHopMs: 120, pairTwoHopMs: null, kickerRoll: 'water', kickerMinMarginPx: 16, heldFlipSlackS: 0.12,
    pillarMs: 330, cartMs: 190, cowMs: 330, riverShortPx: 48, riverMarginPx: 16, planner: 'centred',
    noTiltRun: true,
    riserMs: 620, riserChainMs: 300, logMs: 520, boulderStandMs: 160, boulderTopMs: 510, boulderBoostMs: 540,
    restCanalMs: 220, restRiserMs: 480, restBoulderMs: 510, bonusFlipPx: 190, bonusFlipMs: 580,
  },
  sundowner: {
    pairOneHopMs: 80, pairTwoHopMs: 120, kickerRoll: 'water', kickerMinMarginPx: 0, heldFlipSlackS: null,
    pillarMs: 280, cartMs: 150, cowMs: 290, riverShortPx: 64, riverMarginPx: 16, planner: 'centred',
    noTiltRun: true,
    riserMs: 600, riserChainMs: 500, logMs: 480, boulderStandMs: 160, boulderTopMs: 500, boulderBoostMs: 540,
    restCanalMs: 250, restRiserMs: 540, restBoulderMs: 500, bonusFlipPx: 90, bonusFlipMs: 460,
  },
};

describe('roster (v1.6)', () => {
  it('three bikes; the Daybreak is CONFIG untouched and the default', () => {
    expect(BIKE_ORDER).toEqual(['tonup', 'daybreak', 'sundowner']);
    expect(DEFAULT_BIKE).toBe('daybreak');
    expect(BIKES.daybreak.overrides).toEqual({});
    expect(BIKES.daybreak.cfg).toEqual(CONFIG);
    expect(BIKES.daybreak.cfg).not.toBe(CONFIG); // a copy: nothing can write through to CONFIG
    for (const id of BIKE_ORDER) {
      const b = BIKES[id];
      expect(b.id).toBe(id);
      expect(b.cfg).toEqual({ ...CONFIG, ...b.overrides });
      expect(b.name).toMatch(/^[A-Z-]+$/);
      expect(b.tagline.length).toBeLessThanOrEqual(50); // 50 chars still fit the select screen (checked at 4x, v1.6.4)
      expect(b.tagline).toMatch(/^[A-Z .,'-]+$/);
    }
    expect(isBikeId('tonup')).toBe(true);
    expect(isBikeId('roadster')).toBe(false);
    expect(bikeDef('nope').id).toBe('daybreak');
    expect(bikeDef('sundowner').id).toBe('sundowner');
  });

  it('the approved tuning table, verbatim', () => {
    expect(BIKES.tonup.overrides).toEqual({
      topSpeed: 288, accel: 180, boostSpeed: 420, boostAccel: 800, boostDrainPerSec: 0.72, boostRegenPerSec: 0.096,
      boostCleanLanding: 0.30, boostDiya: 0.12, hopVelocity: 260, airTiltSpeed: 200, airTiltAccel: 900, airTiltMaxSpeed: 520,
      safeLandingAngle: 25, cleanLandingAngle: 7, cameraLookAhead: 124, cameraLookAheadBoost: 184,
    });
    expect(BIKES.sundowner.overrides).toEqual({
      topSpeed: 204, accel: 220, boostSpeed: 350, boostAccel: 380, boostDrainPerSec: 0.36, boostRegenPerSec: 0.048,
      boostCleanLanding: 0.15, boostDiya: 0.06, airTiltSpeed: 150, airTiltAccel: 500, airTiltMaxSpeed: 360,
      safeLandingAngle: 45, cleanLandingAngle: 13,
    });
  });

  it('medals (v1.7): gold = the bot run x 1.05, silver x 1.25, bronze x 2.2, each rounded up to a whole second', () => {
    expect(BOT_RUN_MS).toEqual({ tonup: 49_908, daybreak: 59_517, sundowner: 69_150 });
    expect(BIKES.tonup.medalsMs).toEqual({ gold: 53_000, silver: 63_000, bronze: 110_000 });
    expect(BIKES.daybreak.medalsMs).toEqual({ gold: 63_000, silver: 75_000, bronze: 131_000 });
    expect(BIKES.sundowner.medalsMs).toEqual({ gold: 73_000, silver: 87_000, bronze: 153_000 });
    for (const id of BIKE_ORDER) {
      const m = BIKES[id].medalsMs;
      expect(m).toEqual(medalsFor(BOT_RUN_MS[id]));
      for (const [medal, k] of [['gold', 1.05], ['silver', 1.25], ['bronze', 2.2]] as const) {
        expect(m[medal] % 1000, `${id} ${medal}: a whole second`).toBe(0);
        expect(m[medal], `${id} ${medal}`).toBeGreaterThanOrEqual(BOT_RUN_MS[id] * k);
        expect(m[medal], `${id} ${medal}`).toBeLessThan(BOT_RUN_MS[id] * k + 1000);
      }
    }
    // rounding up, also when the product is already a whole second
    expect(medalsFor(40_000)).toEqual({ gold: 42_000, silver: 50_000, bronze: 88_000 });
    expect(medalsFor(40_001)).toEqual({ gold: 43_000, silver: 51_000, bronze: 89_000 });
  });

  it('every bike has the same hitbox, gravity and stage rules', () => {
    const shared: Array<keyof Config> = [
      'gravity', 'brake', 'coastDrag', 'boostFlip', 'slopeGravityFactor', 'airNoseDropSpeed', 'monkeyStumbleFactor',
      'honkRange', 'bikeHitW', 'bikeHitH', 'diyaRadius', 'airborneEps', 'wallTolerance', 'minAirMsForLanding',
      'cowCrashSpeed', 'reverseSpeed', 'reverseAccel', 'reverseHoldDelayMs', 'respawnDelayMs',
    ];
    for (const id of BIKE_ORDER) for (const k of shared) expect(BIKES[id].cfg[k], `${id}.${k}`).toBe(CONFIG[k]);
  });

  it('stat bars come from the real numbers and tell the bikes apart', () => {
    expect(BIKES.tonup.stats).toEqual({ speed: 5, pull: 3, boost: 1, flip: 5, grip: 1 });
    expect(BIKES.daybreak.stats).toEqual({ speed: 3, pull: 2, boost: 2, flip: 3, grip: 3 });
    expect(BIKES.sundowner.stats).toEqual({ speed: 1, pull: 5, boost: 5, flip: 1, grip: 5 });
    for (const id of BIKE_ORDER) expect(statBars(BIKES[id].cfg)).toEqual(BIKES[id].stats);
  });

  it('each bike holds its own top speed and boost speed', () => {
    for (const id of BIKE_ORDER) {
      const cfg = BIKES[id].cfg;
      let s = createBikeState(40, TERRAIN, cfg);
      for (let i = 0; i < 120 * 3; i++) s = step(s, { throttle: true }, FIXED_DT, TERRAIN, cfg);
      expect(s.v, id).toBe(cfg.topSpeed);
      let b = createBikeState(40, TERRAIN, cfg);
      for (let i = 0; i < 120; i++) b = step(b, { boost: true }, FIXED_DT, TERRAIN, cfg);
      expect(b.v, id).toBe(cfg.boostSpeed);
      expect(b.boost, id).toBeCloseTo(1 - cfg.boostDrainPerSec, 6);
    }
  });
});

/** How far before the gap the bike may start while staying on the same platform. */
const runUp = (gapX0: number, want: number): number => {
  let d = 0;
  while (d < want && TERRAIN.surfaceY(gapX0 - d - 1.5) !== null) d += 0.5;
  return d;
};

describe.each(ROSTER)('%s: canal gaps (criterion 5)', (_name, bike: BikeDef) => {
  const cfg = bike.cfg;
  const V = cfg.topSpeed;
  const floors = FLOORS[bike.id];
  const first = CANAL_GAPS[3]!;
  const second = CANAL_GAPS[4]!;

  it.each(CANAL_GAPS.map((g, i) => [`columns ${g.col0}-${g.col0 + g.cols - 1}`, g, i] as const))(
    'gap at %s: cleared by a hop at top speed, not rolled across at top speed or at boostSpeed',
    (name, g, index) => {
      // Hop: sweep the take-off x, 0.5 px apart.
      const maxD = runUp(g.x0, 260);
      const samples: boolean[] = [];
      for (let d = maxD; d >= 0.5; d -= 0.5) {
        const r = runUntilLanding(rolling(g.x0 - d, V, cfg), (_s, i) => ({ throttle: true, hop: i === 0 }), [], 720, cfg);
        samples.push(r.landedAt !== null && r.landedAt >= g.x1 && !r.state.crashed);
      }
      const windowMs = (longestWindowPx(samples, 0.5) / V) * 1000;
      // The second of the paired gaps has only 48 px of run-up. A long, fast hop (the Ton-Up's 214 px)
      // has no room to start there: that bike takes the pair in one hop instead (next test).
      const ownHop = !(g === second && hopLength(cfg) > 200);
      if (ownHop) expect(windowMs, 'hop window').toBeGreaterThan(100);
      else expect(floors.pairOneHopMs, 'this bike takes the pair in one hop').toBeGreaterThanOrEqual(120);

      // Roll (no hop) at topSpeed and at boostSpeed, over a sweep of step phases.
      const outcomes = new Set<string>();
      for (const speed of [cfg.topSpeed, cfg.boostSpeed]) {
        const base = runUp(g.x0, 60);
        for (let phase = 0; phase < 3.01; phase += 0.125) {
          const start = rolling(g.x0 - base + phase, speed, cfg);
          const boosted = speed > cfg.topSpeed;
          const r = runUntilLanding(start, () => ({ throttle: true, boost: boosted }), [], 720, cfg);
          expect(r.state.crashed, `rolled across at ${speed}`).not.toBeNull();
          expect(r.state.x).toBeLessThan(g.x1 + 4);
          outcomes.add(`${speed}:${r.state.crashed}`);
        }
      }
      console.log(`[${bike.id} gap ${index} ${name}] ${g.cols} tiles: hop window ${windowMs.toFixed(0)} ms; rolling -> ${[...outcomes].join(', ')}`);
    },
  );

  it('the paired gaps at columns 222-230 clear in one hop', () => {
    const samples: boolean[] = [];
    for (let d = runUp(first.x0, 96); d >= 0.5; d -= 0.5) {
      const r = runUntilLanding(rolling(first.x0 - d, V, cfg), (_s, i) => ({ throttle: true, hop: i === 0 }), [], 720, cfg);
      samples.push(r.landedAt !== null && r.landedAt >= second.x1);
    }
    const windowMs = (longestWindowPx(samples, 0.5) / V) * 1000;
    console.log(`[${bike.id} gaps 222-230 in one hop] window ${windowMs.toFixed(0)} ms`);
    expect(windowMs).toBeGreaterThanOrEqual(floors.pairOneHopMs);
  });

  it('the paired gaps by two hops (land on the 48 px platform, hop again at once)', () => {
    const samples: boolean[] = [];
    for (let d = runUp(first.x0, 96); d >= 0.5; d -= 0.5) {
      let s = rolling(first.x0 - d, V, cfg);
      let ok = false;
      let phase = 0; // 0 first hop in the air, 1 on the platform, 2 second hop in the air
      let hopHeld = false;
      for (let i = 0; i < 600 && !s.crashed; i++) {
        const hop: boolean = (phase === 0 && i === 0) || (phase === 1 && s.grounded && !hopHeld);
        s = step(s, { throttle: true, hop }, FIXED_DT, TERRAIN, cfg);
        hopHeld = hop;
        if (s.evLanding && s.evLanding !== 'silent') {
          if (phase === 0) {
            if (s.x >= first.x1 && s.x < second.x0) phase = 1;
            else break;
          } else if (phase === 2) {
            ok = s.x >= second.x1;
            break;
          }
        }
        if (phase === 1 && s.evHop) phase = 2;
      }
      samples.push(ok);
    }
    const windowMs = (longestWindowPx(samples, 0.5) / V) * 1000;
    console.log(`[${bike.id} gaps 222-230 in two hops] window for the first hop ${windowMs.toFixed(0)} ms`);
    // Only a short hop fits the platform: this is the Sundowner's easy line. The longer hops overshoot it
    // from anywhere on the 96 px run-up, which is why those bikes take the pair in one.
    if (floors.pairTwoHopMs !== null) expect(windowMs).toBeGreaterThanOrEqual(floors.pairTwoHopMs);
    else expect(windowMs).toBe(0);
  });
});

describe('kicker layout (Hemakuta Rocks)', () => {
  it('the ramp ends at the tank: lip at h2, 8 columns of water, far bank h0', () => {
    expect(KICKER_GAP.x0).toBe(KICKER.lipCol * TILE);
    expect(KICKER_GAP.cols).toBe(8);
    expect(TERRAIN.slopeAngle(KICKER.rampCol * TILE + 8)).toBeCloseTo(26.565, 2);
    expect(TERRAIN.isNoHop(KICKER.rampCol * TILE + 8)).toBe(false);
  });
});

describe.each(ROSTER)('%s: kicker (Hemakuta Rocks)', (_name, bike: BikeDef) => {
  const cfg = bike.cfg;
  const V = cfg.topSpeed;
  const floors = FLOORS[bike.id];
  const lipX = KICKER.lipCol * TILE;
  const rampX = KICKER.rampCol * TILE;

  it('rolling off it at top speed: in the tank, except the Ton-Up, which just skims across; boost alone clears it', () => {
    const roll = runUntilLanding(rolling(rampX - 160, V, cfg), () => ({ throttle: true }), [], 720, cfg);
    if (floors.kickerRoll === 'water') {
      expect(roll.state.crashed).toBe('water');
    } else {
      // The Ton-Up's perk: at its full 288 px/s the roll carries the tank, with little to spare.
      expect(roll.state.crashed).toBeNull();
      const margin = roll.landedAt! - KICKER_GAP.x1;
      console.log(`[${bike.id} kicker] rolled at ${V}: lands ${margin.toFixed(1)} px past the tank (${roll.state.evLanding})`);
      expect(margin).toBeGreaterThan(0);
      expect(margin).toBeLessThan(16);
      // ... and only at full speed: 10 px/s short of it, the roll is wet.
      const slow = runUntilLanding(rolling(rampX + 8, V - 10, cfg), () => ({}), [], 720, cfg);
      expect(slow.state.crashed).toBe('water');
    }
    const boosted = runUntilLanding(rolling(rampX - 180, cfg.boostSpeed, cfg), () => ({ boost: true }), [], 720, cfg);
    expect(boosted.state.crashed).toBeNull();
    expect(boosted.landedAt!).toBeGreaterThan(KICKER_GAP.x1 + 16);
  });

  it('a hop anywhere on the ramp clears it: window >= 120 ms (>= 200 ms with a tile to spare), airtime >= 1 s', () => {
    const samples: boolean[] = [];
    const roomy: boolean[] = [];
    let minAir = Infinity;
    let minMargin = Infinity;
    for (let d = 120; d >= 0.5; d -= 0.5) {
      let s = rolling(rampX - 160, V, cfg);
      while (s.x < lipX - d && s.grounded) s = step(s, { throttle: true }, FIXED_DT, TERRAIN, cfg);
      const r = runUntilLanding(s, (_s, i) => ({ throttle: true, hop: i === 0 }), [], 720, cfg);
      const ok = r.landedAt !== null && r.landedAt >= KICKER_GAP.x1 && !r.state.crashed;
      samples.push(ok);
      roomy.push(ok && r.landedAt! >= KICKER_GAP.x1 + 16);
      if (ok && d <= 64) {
        minAir = Math.min(minAir, r.steps * FIXED_DT);
        minMargin = Math.min(minMargin, r.landedAt! - KICKER_GAP.x1);
      }
    }
    const windowPx = longestWindowPx(samples, 0.5);
    const windowMs = (windowPx / V) * 1000;
    const roomyMs = (longestWindowPx(roomy, 0.5) / V) * 1000;
    console.log(
      `[${bike.id} kicker] hop window ${windowPx.toFixed(1)} px = ${windowMs.toFixed(0)} ms at ${V} (${roomyMs.toFixed(0)} ms landing >= 16 px clear); ` +
      `airtime >= ${minAir.toFixed(2)} s; lands >= ${minMargin.toFixed(1)} px past the tank`,
    );
    expect(windowMs).toBeGreaterThanOrEqual(120);
    expect(roomyMs).toBeGreaterThanOrEqual(200);
    expect(minAir).toBeGreaterThanOrEqual(1);
    // Every hop on the ramp lands past the tank. (The slow Sundowner only just makes it from the very
    // foot of the ramp; the later the hop, the more room.)
    expect(minMargin).toBeGreaterThan(floors.kickerMinMarginPx);
  });
});

describe('tricks: flip rules (v1.3)', () => {
  it('countFlips rounds the air rotation to whole turns, signed', () => {
    expect(countFlips(0)).toBe(0);
    expect(countFlips(27)).toBe(0);
    expect(countFlips(-170)).toBe(0);
    expect(countFlips(333)).toBe(1);
    expect(countFlips(395)).toBe(1);
    expect(countFlips(-386)).toBe(-1);
    expect(countFlips(700)).toBe(2);
    expect(countFlips(-1080)).toBe(-3);
  });
});

describe.each(ROSTER)('%s: tricks, flips (v1.3)', (_name, bike: BikeDef) => {
  const CFG = bike.cfg;
  const V = CFG.topSpeed;
  const floors = FLOORS[bike.id];
  const lipX = KICKER.lipCol * TILE;
  const rampX = KICKER.rampCol * TILE;

  interface FlipRun { s: BikeState; airS: number; fullTurnS: number; boostBefore: number; maxSpin: number }

  /**
   * Ride at the kicker, hop at hopX, hold a tilt key until |spin| reaches `release`, then level out
   * (the same +/- 3 deg rule the bot uses) until the bike lands or crashes.
   */
  const flipRun = (
    hopX: number, dir: 1 | -1, release: number,
    opts: { from?: number; level?: boolean; cfg?: Config } = {},
  ): FlipRun => {
    const cfg = opts.cfg ?? CFG;
    let s = rolling(opts.from ?? rampX - 160, V, cfg);
    s.boost = 0.2;
    let hopped = false;
    let air = 0;
    let fullTurn = -1;
    let released = false;
    let boostBefore = s.boost;
    let maxSpin = 0;
    for (let i = 0; i < 120 * 10 && !s.crashed; i++) {
      boostBefore = s.boost; // the meter just before the landing step (it regenerates on the run-up)
      const inAir = hopped && !s.grounded;
      if (inAir && Math.abs(s.spin) >= release) released = true; // latched: levelling back must not re-arm the hold
      const holding = inAir && !released;
      const level = opts.level !== false && inAir && released;
      s = step(s, {
        throttle: true,
        hop: !hopped && s.x >= hopX,
        tiltUp: holding ? dir === 1 : level && s.angle < -3,
        tiltDown: holding ? dir === -1 : level && s.angle > 3,
      }, FIXED_DT, TERRAIN, cfg);
      if (s.evHop) hopped = true;
      if (hopped && !s.grounded) {
        air++;
        maxSpin = Math.max(maxSpin, Math.abs(s.spin));
        if (fullTurn < 0 && Math.abs(s.spin) >= 360) fullTurn = air * FIXED_DT;
      }
      if (hopped && s.evLanding) break;
    }
    return { s, airS: air * FIXED_DT, fullTurnS: fullTurn, boostBefore, maxSpin };
  };

  /** A player's flip: hold until some point in the last sixth of the turn, then level. The first release that lands. */
  const landedFlip = (hopX: number, dir: 1 | -1): { r: FlipRun; release: number } | null => {
    for (const release of [330, 340, 320, 345, 310, 350, 300]) {
      const r = flipRun(hopX, dir, release);
      if (!r.s.crashed && r.s.evFlips === dir) return { r, release };
    }
    return null;
  };

  it('a tap still turns at airTiltSpeed; a held key speeds up to airTiltMaxSpeed', () => {
    let s = step(rolling(200, V, CFG), { hop: true }, FIXED_DT, TERRAIN, CFG);
    const a0 = s.angle;
    s = step(s, { tiltUp: true }, FIXED_DT, TERRAIN, CFG);
    expect(s.angle - a0).toBeCloseTo(CFG.airTiltSpeed * FIXED_DT, 9);
    let prev = s.angle;
    let rate = 0;
    for (let i = 0; i < 60; i++) {
      s = step(s, { tiltUp: true }, FIXED_DT, TERRAIN, CFG);
      rate = normalizeAngle(s.angle - prev) / FIXED_DT;
      prev = s.angle;
      expect(rate).toBeLessThanOrEqual(CFG.airTiltMaxSpeed + 1e-6);
    }
    expect(rate).toBeCloseTo(CFG.airTiltMaxSpeed, 6);
    // releasing drops the rate back: the next press is a tap again
    s = step(s, {}, FIXED_DT, TERRAIN, CFG);
    prev = s.angle;
    s = step(s, { tiltDown: true }, FIXED_DT, TERRAIN, CFG);
    expect(prev - s.angle).toBeCloseTo(CFG.airTiltSpeed * FIXED_DT, 9);
    // spin follows the turns (grounded bikes have none)
    expect(s.spin).toBeGreaterThan(100);
    expect(createBikeState(200, TERRAIN, CFG).spin).toBe(0);
  });

  it.each([-64, -32, -1])('kicker, hop %i px from the lip: a backflip fits in the air and lands', (off) => {
    const flip = landedFlip(lipX + off, 1);
    expect(flip, 'some release point lands the flip').not.toBeNull();
    const { r, release } = flip!;
    console.log(
      `[${bike.id} flip, kicker lip${off}] air ${r.airS.toFixed(2)} s; released at ${release} deg; landing ${r.s.evLanding}, ` +
      `flips ${r.s.evFlips}, boost ${r.boostBefore.toFixed(2)} -> ${r.s.boost.toFixed(2)}`,
    );
    expect(r.s.spin).toBe(0); // reset on landing
    const clean = r.s.evLanding === 'clean' ? CFG.boostCleanLanding : 0;
    expect(r.s.boost).toBeCloseTo(Math.min(1, r.boostBefore + CFG.boostFlip + clean), 6);
    expect(r.s.x).toBeGreaterThan(KICKER_GAP.x1);

    // Airtime against the full turn with the key simply held (measured without releasing).
    const held = flipRun(lipX + off, 1, Infinity, { level: false });
    if (floors.heldFlipSlackS !== null) {
      expect(held.fullTurnS).toBeGreaterThan(0);
      expect(held.airS - held.fullTurnS).toBeGreaterThanOrEqual(floors.heldFlipSlackS);
      console.log(`[${bike.id} flip, kicker lip${off}] full turn with the key held: ${held.fullTurnS.toFixed(2)} s of ${held.airS.toFixed(2)} s in the air`);
    } else {
      // The Sundowner turns too slowly to finish the turn in this air: held all the way it comes down
      // a little short of upright, inside its wide safe band. The flip is a commitment, never a spare one.
      expect(held.fullTurnS).toBe(-1);
      expect(held.maxSpin).toBeGreaterThan(360 - CFG.safeLandingAngle);
      expect(held.s.crashed).toBeNull();
      expect(held.s.evFlips).toBe(1);
      console.log(`[${bike.id} flip, kicker lip${off}] key held for the whole ${held.airS.toFixed(2)} s: ${held.maxSpin.toFixed(0)} deg, lands ${held.s.evLanding}`);
    }
  });

  it('a frontflip counts too (negative)', () => {
    const flip = landedFlip(lipX - 32, -1);
    expect(flip).not.toBeNull();
    expect(flip!.r.s.evFlips).toBe(-1);
    expect(flip!.r.s.boost).toBeGreaterThanOrEqual(flip!.r.boostBefore + CFG.boostFlip - 1e-9);
  });

  it('a partial rotation that is levelled back out is not a flip', () => {
    const r = flipRun(lipX - 32, 1, 90);
    expect(r.s.crashed).toBeNull();
    expect(r.s.evLanding === 'clean' || r.s.evLanding === 'safe').toBe(true);
    expect(r.s.evFlips).toBe(0);
    const clean = r.s.evLanding === 'clean' ? CFG.boostCleanLanding : 0;
    expect(r.s.boost).toBeCloseTo(r.boostBefore + clean, 6);
  });

  it('a flip that crashes awards nothing', () => {
    // under-rotated: half a turn, landing upside down
    const half = flipRun(lipX - 32, 1, 180, { level: false });
    expect(half.s.crashed).toBe('landing');
    expect(half.s.evLanding).toBe('crash');
    expect(half.s.evFlips).toBe(0);
    expect(half.s.boost).toBeCloseTo(half.boostBefore, 6);
    // over-rotated: the key is held to 420 deg and never corrected (the Sundowner cannot turn that far in this air)
    if (floors.heldFlipSlackS !== null) {
      const r = flipRun(lipX - 32, 1, 420, { level: false });
      expect(r.s.crashed).toBe('landing');
      expect(r.s.evFlips).toBe(0);
      expect(r.s.boost).toBeCloseTo(r.boostBefore, 6);
    }
  });

  it('a flat-ground hop is too short for a flip, whatever the timing', () => {
    let air = 0;
    for (const dir of [1, -1] as const) {
      // Held all the way: a crash.
      const held = flipRun(400, dir, Infinity, { from: 300, level: false });
      air = held.airS;
      expect(held.airS).toBeLessThan(0.85);
      expect(held.s.crashed).toBe('landing');
      expect(held.s.evFlips).toBe(0);
      // The most a held key turns in this air is short of the safe band around a full turn ...
      expect(held.maxSpin).toBeLessThan(360 - CFG.safeLandingAngle);
      // ... so no release point lands one either.
      for (let release = 200; release <= 360; release += 10) {
        const r = flipRun(400, dir, release, { from: 300 });
        expect(Math.abs(r.s.evFlips), `dir ${dir}, release ${release}`).toBe(0);
      }
    }
    console.log(`[${bike.id} flat hop] air ${air.toFixed(2)} s: no flip`);
  });

  it('two full turns in one air count as a double flip (needs more air than the stage gives: low gravity here)', () => {
    const cfg = { ...CFG, gravity: 240 };
    let done: FlipRun | null = null;
    for (const release of [690, 700, 680, 705, 670]) {
      const r = flipRun(400, 1, release, { from: 300, cfg });
      if (!r.s.crashed && r.s.evFlips === 2) { done = r; break; }
    }
    expect(done).not.toBeNull();
    const r = done!;
    expect(r.airS).toBeGreaterThan(1.8);
    const clean = r.s.evLanding === 'clean' ? CFG.boostCleanLanding : 0;
    expect(r.s.boost).toBeCloseTo(Math.min(1, r.boostBefore + 2 * CFG.boostFlip + clean), 6);
  });

  it('flips stay optional: the kicker hop with no tilt at all lands safely with no flip', () => {
    const r = flipRun(lipX - 32, 1, 0, { level: false });
    expect(r.s.crashed).toBeNull();
    expect(r.s.evFlips).toBe(0);
  });

  it('the bonus ramp on Ruins Road is a flip spot too (v1.7): a backflip lands from a wide stretch of it', () => {
    const from = BONUS.rampCol * TILE - 160;
    const oks: boolean[] = [];
    for (let x = BONUS.rampCol * TILE + 4; x < BONUS.cliffCol * TILE; x += 2) {
      let landed = false;
      for (const release of [290, 300, 310, 320, 330, 340, 350]) {
        const r = flipRun(x, 1, release, { from });
        if (!r.s.crashed && r.s.evFlips === 1) { landed = true; break; }
      }
      oks.push(landed);
    }
    const px = oks.filter(Boolean).length * 2;
    const windowMs = (longestWindowPx(oks, 2) / V) * 1000;
    console.log(`[${bike.id} flip, bonus ramp] lands from ${px} of ${oks.length * 2} px of take-off; longest stretch ${windowMs.toFixed(0)} ms`);
    expect(px).toBeGreaterThan(floors.bonusFlipPx);
    expect(windowMs).toBeGreaterThan(floors.bonusFlipMs);
    // and a frontflip, from the middle of the ramp
    let front = false;
    for (const release of [300, 315, 330, 345]) {
      const r = flipRun(BONUS.lipCol * TILE - 40, -1, release, { from });
      if (!r.s.crashed && r.s.evFlips === -1) { front = true; break; }
    }
    if (bike.id !== 'sundowner') expect(front).toBe(true);
  });
});

describe.each(ROSTER)('%s: pillar, cart and cow hop windows (criterion 6)', (_name, bike: BikeDef) => {
  const cfg = bike.cfg;
  const V = cfg.topSpeed;
  const floors = FLOORS[bike.id];

  const windowMs = (box: Box): number => {
    const samples: boolean[] = [];
    for (let d = 300; d >= 0; d -= 0.5) {
      const r = runUntilLanding(rolling(box.x - d, V, cfg), (_s, i) => ({ throttle: true, hop: i === 0 }), [box], 720, cfg);
      samples.push(!r.hitBox && !r.state.crashed && r.landedAt !== null && r.landedAt - cfg.bikeHitW / 2 >= box.x + box.w);
    }
    return (longestWindowPx(samples, 0.5) / V) * 1000;
  };

  it.each(OBSTACLES.map((o) => [`${o.type} x${o.col}`, o] as const))('%s has a window >= 120 ms at top speed', (name, o) => {
    const ms = windowMs(obstacleBox(o));
    console.log(`[${bike.id} ${name}] hop window ${ms.toFixed(0)} ms`);
    expect(ms).toBeGreaterThanOrEqual(120);
    expect(ms).toBeGreaterThan(o.type === 'cart' ? floors.cartMs : o.type === 'log' ? floors.logMs : floors.pillarMs);
  });

  it('the cow can be hopped too', () => {
    const ms = windowMs(COW_BOX);
    console.log(`[${bike.id} cow] hop window ${ms.toFixed(0)} ms`);
    expect(ms).toBeGreaterThan(floors.cowMs);
  });

  it('riding into a pillar without hopping overlaps it', () => {
    const box = obstacleBox(OBSTACLES.find((o) => o.type === 'pillar')!);
    const r = runUntilLanding(rolling(box.x - 100, V, cfg), () => ({ throttle: true }), [box], 240, cfg);
    expect(r.hitBox).toBe(true);
  });
});

describe.each(ROSTER)('%s: river (criterion 4)', (_name, bike: BikeDef) => {
  const cfg = bike.cfg;
  const floors = FLOORS[bike.id];
  const riverCp = checkpointX(CHECKPOINTS[RIVER_CP]!); // the river checkpoint (cp11 since v1.7)

  const ride = (input: BikeInput, startBoost = 1) => {
    let s = createBikeState(riverCp, TERRAIN, cfg);
    s.boost = startBoost;
    let lipSpeed = 0;
    let lipX = 0;
    for (let i = 0; i < 120 * 20; i++) {
      const before = s;
      s = step(s, input, FIXED_DT, TERRAIN, cfg);
      if (before.grounded && !s.grounded && s.x >= RIVER.x0 - 4) {
        lipSpeed = before.v; // speed along the ramp on the last grounded step
        lipX = s.x;
      }
      if (s.crashed || (s.grounded && s.x > RIVER.x0)) break;
    }
    return { s, lipSpeed, lipX };
  };

  it('starts at cp11 = 16*842 + 8', () => {
    expect(RIVER_CP).toBe(11);
    expect(riverCp).toBe(16 * 842 + 8);
    expect(RIVER.x0).toBe(13888);
    expect(RIVER.x1).toBe(14080);
    // the same run-up as before v1.7: 18 columns of flat less half a tile, then the 8-column ramp
    expect(RIVER_RAMP.x0 - riverCp).toBe(18 * 16 - 8);
  });

  it('holds top speed up the river ramp without boost', () => {
    let s = rolling(RIVER_RAMP.x0 - 16, cfg.topSpeed, cfg);
    let lipSpeed = 0;
    while (s.grounded) {
      lipSpeed = s.v;
      s = step(s, { throttle: true }, FIXED_DT, TERRAIN, cfg);
    }
    expect(lipSpeed).toBeCloseTo(cfg.topSpeed, 6);
    expect(s.x).toBeGreaterThanOrEqual(RIVER.x0);
  });

  it('at top speed with no boost and no hop it lands in the water', () => {
    const { s, lipSpeed } = ride({ throttle: true });
    expect(lipSpeed).toBeCloseTo(cfg.topSpeed, 6);
    expect(s.crashed).toBe('water');
    // where the arc comes back down to bank height (y = 222)
    let p = rolling(RIVER.x0 - 30, cfg.topSpeed, cfg);
    let lip = 0;
    while (p.y <= BASELINE_Y && !p.crashed) {
      const g = p.grounded;
      p = step(p, { throttle: true }, FIXED_DT, TERRAIN, cfg);
      if (g && !p.grounded) lip = p.x;
    }
    console.log(
      `[${bike.id} river, no boost] lip speed ${lipSpeed.toFixed(1)}; reaches bank height at x=${p.x.toFixed(1)} ` +
      `(${(p.x - lip).toFixed(1)} px of flight, ${(RIVER.x1 - p.x).toFixed(1)} px short); water at x=${s.x.toFixed(1)}`,
    );
    expect(p.x).toBeLessThan(RIVER.x1 - 16);
    expect(RIVER.x1 - p.x).toBeGreaterThan(floors.riverShortPx);
  });

  it('holding hop as well changes nothing (ramp is noHop)', () => {
    const { s } = ride({ throttle: true, hop: true });
    expect(s.crashed).toBe('water');
  });

  it('with boost from the river checkpoint (at rest, full meter) it clears with >= 1 tile to spare', () => {
    const { s, lipSpeed, lipX } = ride({ boost: true });
    expect(s.crashed).toBeNull();
    expect(s.grounded).toBe(true);
    const margin = s.x - RIVER.x1;
    console.log(
      `[${bike.id} river, boost] lip speed ${lipSpeed.toFixed(1)}; lands at x=${s.x.toFixed(1)} (${(s.x - lipX).toFixed(1)} px of flight), ` +
      `margin ${margin.toFixed(1)} px, landing ${s.evLanding}, meter left ${s.boost.toFixed(3)}`,
    );
    expect(margin).toBeGreaterThanOrEqual(16);
    expect(margin).toBeGreaterThanOrEqual(floors.riverMarginPx);
    expect(lipSpeed).toBeCloseTo(cfg.boostSpeed, 6);
  });

  it('the river still needs most of a tank from rest: half a meter is not enough', () => {
    const { s } = ride({ boost: true, throttle: true }, 0.4);
    expect(s.crashed).not.toBeNull();
  });
});

describe('diyas (5.2): the hand-written script on the Daybreak', () => {
  // A simple script: hold throttle, hop at fixed x positions, hold boost from the river checkpoint on; no tilt.
  // The log; the cow; five canal hops; three pillars and the cart; the Boulder Field's up-ramp diya; the four
  // mandapa hops; the hop line off the second roller; the kicker; the three risers; the boulder.
  const HOPS = [
    490, 2540, 2950, 3150, 3350, 3544, 3800, 4360, 4770, 5010, 5240, 6300,
    8376, 8648, 8920, 9224, 10240, 10688, 11720, 11980, 12240, 12770,
  ];

  it('all 56 are collected in one crash-free scripted run (throttle + 22 hops + boost from the river checkpoint)', () => {
    const r = ride(CONFIG, { hops: HOPS, tilt: 'none' });
    console.log(
      `[diyas] ${r.diyas}/${DIYAS.length} collected, missing: ${r.missing.map((c) => `x${c}`).join(',') || 'none'}; ` +
      `finish x=${r.state.x.toFixed(0)} after ${(r.timeMs / 1000).toFixed(2)} s, crash=${r.crash}`,
    );
    expect(r.crash).toBeNull();
    expect(r.missing).toEqual([]);
    expect(r.hopsUsed).toBe(22);
    expect(r.state.x).toBeGreaterThanOrEqual(FINISH.col * TILE);
    expect([r.wobbles, r.stumbles]).toEqual([0, 0]);
  });

  it('the script is not a knife edge: +/- 4 px on every hop still gets all 56', () => {
    for (const off of [-4, -2, 2, 4]) {
      const r = ride(CONFIG, { hops: HOPS.map((h) => h + off), tilt: 'none' });
      expect(r.crash, `offset ${off}`).toBeNull();
      expect(r.diyas, `offset ${off}`).toBe(56);
    }
  });

  it('x384 is collected by rolling off the cliff; x396 needs the hop', () => {
    const idxCliff = DIYAS.findIndex((d) => d.col === BOULDER_FIELD + 44);
    const idxRamp = DIYAS.findIndex((d) => d.col === BOULDER_FIELD + 56);
    expect([idxCliff, idxRamp].every((i) => i >= 0)).toBe(true);
    let s = rolling((BOULDER_FIELD + 35) * 16 + 60, 240);
    const got = new Set<number>();
    for (let i = 0; i < 120 * 3; i++) {
      s = step(s, { throttle: true });
      DIYAS.forEach((d, j) => {
        if (touchesDiya(s, diyaCentre(d))) got.add(j);
      });
    }
    expect(s.crashed).toBeNull();
    expect(got.has(idxCliff)).toBe(true);
    expect(got.has(idxRamp)).toBe(false);
  });
});

describe.each(ROSTER)('%s: the bot plan collects all 56 diyas (5.2)', (_name, bike: BikeDef) => {
  const cfg = bike.cfg;
  const floors = FLOORS[bike.id];
  const plan = planHopsFor(layout(LEVEL), LEVEL, cfg);

  it('plans 22 hops and rides them crash-free to the line in the measured time, levelling in the air', () => {
    expect(plan.planner).toBe(floors.planner);
    expect(plan.hops).toHaveLength(22);
    expect(botHops(cfg)).toEqual(plan.hops);
    const r = ride(cfg, { hops: plan.hops });
    console.log(
      `[${bike.id} plan] ${plan.planner} planner, hops ${plan.hops.map((x) => x.toFixed(0)).join(',')}; ` +
      `${r.diyas}/56, ${(r.timeMs / 1000).toFixed(3)} s, worst landing ${r.worstLanding.toFixed(1)} deg off, boost left ${r.boostLeft.toFixed(2)}; ` +
      `camera: bike screen x ${r.cam.minScreenX.toFixed(0)}..${r.cam.maxScreenX.toFixed(0)}; legs (s) ` +
      r.cpSteps.map((st, i) => (((i + 1 < r.cpSteps.length ? r.cpSteps[i + 1]! : r.steps) - st) / 120).toFixed(1)).join('/'),
    );
    expect(r.crash).toBeNull();
    expect(r.finished).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.hopsUsed).toBe(22);
    expect([r.flips, r.wobbles, r.stumbles]).toEqual([0, 0, 0]);
    // the measured run, to the millisecond (the e2e bot run asserts the same number in the real game)
    expect(r.timeMs).toBe(BOT_RUN_MS[bike.id]);
    // a clean run is gold on this bike, with a few seconds in hand
    expect(bike.medalsMs.gold - r.timeMs).toBeGreaterThan(2400);
    expect(bike.medalsMs.gold - r.timeMs).toBeLessThan(4500);
    expect(r.worstLanding).toBeLessThan(cfg.safeLandingAngle);
    // the camera never jumps or runs backward, and the bike stays in the left part of the screen
    expect(r.cam.minStep).toBeGreaterThanOrEqual(-0.001);
    expect(r.cam.maxStep).toBeLessThanOrEqual((cfg.boostSpeed / 120) * 1.5);
    expect(r.cam.minScreenX).toBeGreaterThanOrEqual(110);
    expect(r.cam.maxScreenX).toBeLessThanOrEqual(215);
    // every leg between two checkpoints is short: nothing is ever more than about 10 s back
    const legs = r.cpSteps.map((st, i) => ((i + 1 < r.cpSteps.length ? r.cpSteps[i + 1]! : r.steps) - st) / 120);
    expect(Math.max(...legs)).toBeLessThan(10.5);
  });

  it('the plan is not a knife edge: +/- 8 px on every hop still gets all 56', () => {
    for (const off of [-8, -4, -2, 2, 4, 8]) {
      const r = ride(cfg, { hops: plan.hops.map((h) => h + off) });
      expect(r.crash, `offset ${off}`).toBeNull();
      expect(r.diyas, `offset ${off}`).toBe(56);
    }
  });

  it('with no tilt at all: the forgiving bikes still finish; the Ton-Up has to be flown level', () => {
    const r = ride(cfg, { hops: plan.hops, tilt: 'none' });
    if (floors.noTiltRun) {
      expect(r.crash).toBeNull();
      expect(r.diyas).toBe(56);
    } else {
      // 25 deg of safe band: an uncorrected hop over a long canal comes down too nose-low.
      // (Not on the Warm-up Road, though: there it would only have been a wobble.)
      expect(r.crash).toBe('landing');
      expect(r.crashX).toBeGreaterThan(SAFE_X1);
      console.log(`[${bike.id} plan] no tilt: crashes on landing at x=${r.crashX.toFixed(0)}`);
    }
  });
});

// =================================================================================================
// v1.7: the 900-column stage. Warm-up Road (log, no-crash zone), Ruins Road (the breather and its bonus
// ramp), Temple Steps (risers, the boulder, stairs down), and the standing starts at the new checkpoints.
// Floors come from the measured numbers in DECISIONS.md (v1.7).
// =================================================================================================

/** Roll from x0 to x1 with one fixed input (no hop, no tilt): the crash cause or null, and the worst landing. */
function rollThrough(cfg: Config, x0: number, x1: number, v: number, input: BikeInput): { crash: string | null; worst: number } {
  let s = rolling(x0, v, cfg);
  let worst = 0;
  for (let i = 0; i < 120 * 60 && s.x < x1 && !s.crashed; i++) {
    const p = s;
    s = step(s, input, FIXED_DT, TERRAIN, cfg);
    if (s.evLanding && s.evLanding !== 'silent') worst = Math.max(worst, Math.abs(normalizeAngle(p.angle - TERRAIN.slopeAngle(s.x))));
    if (s.grounded && s.v === 0 && !input.throttle && !input.boost) break; // coasted to a stop
  }
  return { crash: s.crashed, worst };
}

/** Every speed from 20 px/s to boost speed, with throttle, with boost, and coasting: crashes, and the worst landing. */
function rolledAtEverySpeed(cfg: Config, x0: number, x1: number): { crashes: string[]; worst: number } {
  const crashes: string[] = [];
  let worst = 0;
  for (let v = 20; v <= cfg.boostSpeed; v += 4) {
    for (const input of [{ throttle: true }, { throttle: true, boost: true }, {}] as BikeInput[]) {
      const r = rollThrough(cfg, x0, x1, v, input);
      worst = Math.max(worst, r.worst);
      if (r.crash) crashes.push(`${v}/${JSON.stringify(input)}:${r.crash}`);
    }
  }
  return { crashes, worst };
}

/** One hop at each take-off x in [from, to) (4 px apart), throttle held, no tilt: how many crash, of how many. */
function hopAnywhereNoTilt(cfg: Config, startX: number, from: number, to: number, endX: number): { crashes: number; n: number } {
  let crashes = 0;
  let n = 0;
  for (let x = from; x < to; x += 4) {
    let s = rolling(startX, cfg.topSpeed, cfg);
    let hopped = false;
    for (let i = 0; i < 2400 && s.x < endX && !s.crashed; i++) {
      s = step(s, { throttle: true, hop: !hopped && s.grounded && s.x >= x }, FIXED_DT, TERRAIN, cfg);
      if (s.evHop) hopped = true;
    }
    n++;
    if (s.crashed) crashes++;
  }
  return { crashes, n };
}

/**
 * From a standing start at a checkpoint, throttle held: the longest unbroken range of hop-press times (ms)
 * for which a single hop takes the bike past untilX. Ridden in the full game loop (boulder, log, wobbles).
 */
function fromRestWindowMs(cfg: Config, cp: number, untilX: number): number {
  let best = 0;
  let run = 0;
  for (let k = 0; k < 120 * 8; k++) {
    const r = ride(cfg, { startCp: cp, untilX, inputAt: (_s, i) => ({ throttle: true, hop: i === k }) });
    const ok = r.finished && r.crash === null;
    run = ok ? run + 1 : 0;
    best = Math.max(best, run);
    if (r.steps < k) break; // the run was over before the hop was pressed: later presses change nothing
  }
  return (best / 120) * 1000;
}

/**
 * Hop window (ms of hop-press time) over the rolling boulder for a bike arriving at speed v with a fixed
 * input, on a long flat (the boulder is set rolling toward it from 1.3 s away).
 */
function boulderWindowMs(cfg: Config, v: number, input: BikeInput): number {
  const flat = TERRAIN.pieces.filter((p) => p.y0 === p.y1).sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0))[0]!;
  const xs = flat.x0 + 40;
  const startGap = Math.max(120, (v + BOULDER.speed) * 1.3);
  let best = 0;
  let run = 0;
  for (let k = 0; k < 120 * 1.6; k++) {
    let s = rolling(xs, v, cfg);
    let bx = xs + startGap;
    let good = true;
    let passed = false;
    for (let i = 0; i < 120 * 6; i++) {
      s = step(s, { ...input, hop: i === k }, FIXED_DT, TERRAIN, cfg);
      bx -= BOULDER.speed * FIXED_DT;
      if (s.crashed || aabbOverlap(bikeAABB(s, cfg), boulderBoxAt(bx, flat.y0))) { good = false; break; }
      if (bx + BOULDER.hitW < s.x - cfg.bikeHitW / 2) passed = true;
      if (passed && s.grounded) break;
    }
    run = good && passed ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return (best / 120) * 1000;
}

describe('the warm-up rules (v1.7)', () => {
  it('stumble: the bike keeps 40% of its speed and is never crashed by it', () => {
    const s = rolling(400, 240);
    s.vx = 240;
    const t = stumble(s, CONFIG.monkeyStumbleFactor);
    expect(t.v).toBeCloseTo(96, 9);
    expect(t.vx).toBeCloseTo(96, 9);
    expect(t.crashed).toBeNull();
    expect(s.v).toBe(240); // a new state: the old one is untouched
  });

  it('wobbleLanding turns a landing crash into an upright, slowed bike; anything else is left alone', () => {
    // A hop with the nose held up all the way: a crash landing.
    let s = step(rolling(400, 240), { throttle: true, hop: true });
    while (!s.crashed && !s.grounded) s = step(s, { throttle: true, tiltUp: true });
    expect(s.crashed).toBe('landing');
    expect(s.evLanding).toBe('crash');
    const w = wobbleLanding(s, CONFIG.monkeyStumbleFactor);
    expect(w.crashed).toBeNull();
    expect(w.grounded).toBe(true);
    expect(w.angle).toBe(0);
    expect(w.y).toBe(BASELINE_Y);
    expect(w.v).toBeCloseTo(240 * 0.4, 6);
    expect(w.vx).toBeCloseTo(240 * 0.4, 6);
    expect(w.vy).toBeCloseTo(0, 9);
    expect(w.evLanding).toBe('safe');
    expect([w.evFlips, w.spin, w.airTime]).toEqual([0, 0, 0]);
    expect(w.boost).toBe(s.boost); // no bonus for it
    // it rides on from there
    let r = w;
    for (let i = 0; i < 120; i++) r = step(r, { throttle: true });
    expect(r.crashed).toBeNull();
    expect(r.v).toBeGreaterThan(200);
    // on a slope it stands along the slope
    const ramp = TERRAIN.pieces.find((p) => p.angle > 10)!;
    const onRamp = wobbleLanding({ ...s, x: ramp.x0 + 20, y: TERRAIN.surfaceY(ramp.x0 + 20)! }, 0.4);
    expect(onRamp.angle).toBeCloseTo(ramp.angle, 9);
    expect(Math.hypot(onRamp.vx, onRamp.vy)).toBeCloseTo(onRamp.v, 9);
    // not a landing crash: unchanged
    const wet = { ...s, crashed: 'water' as const };
    expect(wobbleLanding(wet, 0.4)).toBe(wet);
    const fine = rolling(400, 100);
    expect(wobbleLanding(fine, 0.4)).toBe(fine);
  });
});

describe.each(ROSTER)('%s: Warm-up Road (v1.7)', (_name, bike: BikeDef) => {
  const cfg = bike.cfg;
  const log = LOG_BOXES[0]!;

  it('riding into the log without hopping is one stumble (speed x 0.4), not a crash', () => {
    const r = ride(cfg, { untilX: log.x + 200, inputAt: () => ({ throttle: true }) });
    expect(r.crash).toBeNull();
    expect(r.finished).toBe(true);
    expect([r.logHits, r.stumbles, r.wobbles]).toEqual([1, 1, 0]); // once, not once per step of contact
    // at top speed: 40% of it is left on the step it touches the log
    let s = rolling(log.x - 120, cfg.topSpeed, cfg);
    while (!aabbOverlap(bikeAABB(s, cfg), log)) s = step(s, { throttle: true }, FIXED_DT, TERRAIN, cfg);
    expect(s.x).toBeLessThan(log.x);
    const hit = stumble(s, cfg.monkeyStumbleFactor);
    expect(hit.v).toBeCloseTo(cfg.topSpeed * 0.4, 6);
    expect(hit.crashed).toBeNull();
    // and the log is not one of the solid boxes
    expect(OBSTACLES.filter((o) => o.type === 'log')).toHaveLength(1);
    expect(hitsObstacle(s, OBSTACLES.filter((o) => o.type !== 'log').map((o) => obstacleBox(o)), cfg)).toBe(false);
  });

  it('throttle held and nothing else gets through the whole warm-up; so does the bot, clean', () => {
    const plain = ride(cfg, { untilX: SAFE_X1, inputAt: () => ({ throttle: true }) });
    expect(plain.crash).toBeNull();
    expect(plain.finished).toBe(true);
    expect([plain.logHits, plain.wobbles]).toEqual([1, 0]);
    const bot = ride(cfg, { untilX: SAFE_X1 });
    expect([bot.crash, bot.logHits, bot.wobbles]).toEqual([null, 0, 0]);
    // the 10 warm-up diyas are all on the bot's line
    expect(bot.missing.filter((c) => c < SAFE_ZONE.toCol)).toEqual([]);
    console.log(`[${bike.id} warm-up] throttle only ${(plain.timeMs / 1000).toFixed(2)} s, bot ${(bot.timeMs / 1000).toFixed(2)} s`);
    expect(plain.timeMs - bot.timeMs).toBeLessThan(600);
  });

  it('the roller is rolled at every speed with no crash', () => {
    const r = rolledAtEverySpeed(cfg, 70 * TILE, 110 * TILE);
    expect(r.crashes).toEqual([]);
    expect(r.worst).toBeLessThan(cfg.safeLandingAngle);
  });

  it('1000 runs of random input: never a crash, every one reaches Bazaar Street; without the rule nearly all crash', () => {
    let seed = 12345;
    const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const fuzz = (noSafe: boolean, n: number): { crashes: number; reached: number; wobbles: number; logs: number } => {
      const out = { crashes: 0, reached: 0, wobbles: 0, logs: 0 };
      for (let i = 0; i < n; i++) {
        let cur: BikeInput = { throttle: true };
        let hold = 0;
        const r = ride(cfg, {
          untilX: SAFE_X1, noSafe,
          inputAt: () => {
            if (hold-- <= 0) {
              hold = 6 + Math.floor(rnd() * 30);
              cur = {
                throttle: rnd() < 0.85, brake: rnd() < 0.08, hop: rnd() < 0.3, tiltUp: rnd() < 0.3, tiltDown: rnd() < 0.3,
                boost: rnd() < 0.25,
              };
            }
            return cur;
          },
        });
        if (r.crash) out.crashes++;
        if (r.finished) out.reached++;
        out.wobbles += r.wobbles;
        out.logs += r.logHits;
      }
      return out;
    };
    const safe = fuzz(false, 1000);
    console.log(`[${bike.id} warm-up fuzz] with the rule: ${JSON.stringify(safe)}`);
    expect(safe.crashes).toBe(0);
    expect(safe.reached).toBe(1000);
    expect(safe.wobbles).toBeGreaterThan(1000); // the rule was doing the work
    const bare = fuzz(true, 200);
    console.log(`[${bike.id} warm-up fuzz] without it: ${JSON.stringify(bare)}`);
    expect(bare.crashes).toBeGreaterThan(190);
  }, 60_000);

  it('the rule goes by where the bike took off: the last hop of the warm-up is covered, the first one after it is not', () => {
    // one hop at hopX with the nose held up for the whole air: a crash landing anywhere else on the stage
    const botched = (hopX: number): ReturnType<typeof ride> => {
      let hopped = false;
      return ride(cfg, {
        untilX: hopX + 400,
        inputAt: (s) => {
          const hop = !hopped && s.grounded && s.x >= hopX;
          if (hop) hopped = true;
          return { throttle: true, hop, tiltUp: hopped && !s.grounded };
        },
      });
    };
    const inside = botched(SAFE_X1 - 6);
    expect(inside.crash).toBeNull();
    expect(inside.wobbles).toBe(1);
    expect(inside.finished).toBe(true); // it came down in Bazaar Street, and still only wobbled
    const outside = botched(SAFE_X1 + 60);
    expect(outside.crash).toBe('landing');
    expect(outside.wobbles).toBe(0);
    expect(outside.crashX).toBeGreaterThan(SAFE_X1 + 60);
  });
});

describe.each(ROSTER)('%s: Ruins Road, the breather (v1.7)', (_name, bike: BikeDef) => {
  const cfg = bike.cfg;
  const BR = sectionCol('Ruins Road');
  const x0 = (BR + 6) * TILE;
  const x1 = (BR + 80) * TILE;

  it('ignoring the bonus ramp is safe: rolled at every speed, with throttle, boost or coasting', () => {
    const r = rolledAtEverySpeed(cfg, x0, x1);
    console.log(`[${bike.id} bonus ramp] rolled 20..${cfg.boostSpeed} px/s: ${r.crashes.length} crashes, worst landing ${r.worst.toFixed(1)} deg off`);
    expect(r.crashes).toEqual([]);
    expect(r.worst).toBeLessThan(cfg.safeLandingAngle - 5);
  });

  it('its ten diyas are all on the rolling line, and there is nothing to hit', () => {
    const r = ride(cfg, { startCp: 6, hops: [], untilX: x1 });
    expect(r.crash).toBeNull();
    const here = DIYAS.filter((d) => d.col >= BR && d.col < BR + 84).map((d) => d.col);
    expect(here).toHaveLength(10);
    expect(r.missing.filter((c) => here.includes(c))).toEqual([]);
    expect(OBSTACLES.filter((o) => o.col >= BR && o.col < BR + 84)).toEqual([]);
    expect(TERRAIN.gaps.filter((g) => g.col0 >= BR && g.col0 < BR + 84)).toEqual([]);
  });

  it('a hop on the ramp or its top with no tilt lands on the forgiving bikes; the Ton-Up has to level a hop into the ramp', () => {
    const r = hopAnywhereNoTilt(cfg, x0, x0 + 40, BONUS.cliffCol * TILE + 60, x1);
    console.log(`[${bike.id} bonus ramp] one hop, no tilt: ${r.crashes}/${r.n} crash`);
    if (bike.id === 'tonup') {
      // its 25 deg band: a flat hop that comes down on the 18 deg up-ramp without levelling (as on the Boulder Field)
      expect(r.crashes).toBeGreaterThan(0);
      expect(r.crashes).toBeLessThan(r.n / 2);
      // from the ramp itself and its top it is fine
      const onRamp = hopAnywhereNoTilt(cfg, x0, BONUS.rampCol * TILE + 4, BONUS.cliffCol * TILE + 60, x1);
      expect(onRamp.crashes).toBe(0);
    } else {
      expect(r.crashes).toBe(0);
    }
  });
});

describe.each(ROSTER)('%s: Temple Steps, the risers (v1.7)', (_name, bike: BikeDef) => {
  const cfg = bike.cfg;
  const V = cfg.topSpeed;
  const floors = FLOORS[bike.id];

  /** hop window (ms) over one riser for a bike rolling at v */
  const riserWindowMs = (g: typeof RISERS[number], v: number): number => {
    const samples: boolean[] = [];
    for (let d = runUp(g.x0, 260); d >= 0.5; d -= 0.5) {
      const r = runUntilLanding(rolling(g.x0 - d, v, cfg), (_s, i) => ({ throttle: true, hop: i === 0 }), [], 720, cfg);
      samples.push(r.landedAt !== null && r.landedAt >= g.x1 && !r.state.crashed);
    }
    return (longestWindowPx(samples, 0.5) / v) * 1000;
  };

  it.each(RISERS.map((g, i) => [i + 1, g] as const))('riser %i: cleared by a hop at top speed with a wide window; never rolled, at any speed', (n, g) => {
    const windowMs = riserWindowMs(g, V);
    expect(windowMs).toBeGreaterThanOrEqual(120);
    expect(windowMs).toBeGreaterThan(floors.riserMs);
    // No speed rolls up it: 10 px/s to boost speed, over a sweep of step phases.
    const outcomes = new Set<string>();
    for (let speed = 10; speed <= cfg.boostSpeed + 0.01; speed += 10) {
      const base = runUp(g.x0, 60);
      for (let phase = 0; phase < 3.01; phase += 0.125) {
        const boosted = speed > cfg.topSpeed;
        const r = runUntilLanding(rolling(g.x0 - base + phase, speed, cfg), () => ({ throttle: true, boost: boosted }), [], 720, cfg);
        expect(r.state.crashed, `rolled up at ${speed}`).not.toBeNull();
        expect(r.state.x, `rolled up at ${speed}`).toBeLessThan(g.x1 + 4);
        outcomes.add(r.state.crashed!);
      }
    }
    console.log(`[${bike.id} riser ${n}] hop window ${windowMs.toFixed(0)} ms; rolling -> ${[...outcomes].join(', ')}`);
  });

  it('a slow bike can still hop the first riser (40 to 160 px/s)', () => {
    const ms = [40, 80, 120, 160].map((v) => riserWindowMs(RISERS[0]!, v));
    console.log(`[${bike.id} riser 1] hop window at 40/80/120/160 px/s: ${ms.map((m) => m.toFixed(0)).join('/')} ms`);
    for (const m of ms) expect(m).toBeGreaterThan(250);
  });

  it('the risers chain: whatever hop cleared one, there is a window left for the next', () => {
    for (const [a, b] of [[RISERS[0]!, RISERS[1]!], [RISERS[1]!, RISERS[2]!]] as const) {
      let minWin = Infinity;
      let cleared = 0;
      for (let d = 200; d >= 1; d -= 2) {
        // first hop d px before riser a
        let s = rolling(a.x0 - 220, V, cfg);
        let hopped = false;
        let landed = false;
        for (let i = 0; i < 1200 && !s.crashed; i++) {
          s = step(s, { throttle: true, hop: !hopped && s.x >= a.x0 - d }, FIXED_DT, TERRAIN, cfg);
          if (s.evHop) hopped = true;
          if (hopped && s.evLanding) { landed = true; break; }
        }
        if (!landed || s.crashed || s.x < a.x1) continue;
        cleared++;
        // second hop k steps after that landing
        let best = 0;
        let run = 0;
        for (let k = 0; k < 150; k++) {
          let q = s;
          let ok = false;
          for (let i = 0; i < 600 && !q.crashed; i++) {
            q = step(q, { throttle: true, hop: i === k }, FIXED_DT, TERRAIN, cfg);
            if (q.grounded && q.x >= b.x1) { ok = true; break; }
          }
          run = ok ? run + 1 : 0;
          best = Math.max(best, run);
          if (!ok && run === 0 && best > 0) break;
        }
        minWin = Math.min(minWin, (best / 120) * 1000);
      }
      console.log(`[${bike.id} risers] ${cleared} first hops clear riser at col ${a.col0}; least window left for the next: ${minWin.toFixed(0)} ms`);
      expect(cleared).toBeGreaterThan(50);
      expect(minWin).toBeGreaterThanOrEqual(120);
      expect(minWin).toBeGreaterThan(floors.riserChainMs);
    }
  });

  it('in the game loop, riding into a riser is a wall crash at the foot of the step, never a sink into the stone', () => {
    for (const target of [15, 40, 90, 150, V]) {
      const r = ride(cfg, { startCp: 9, hops: [], inputAt: (s) => ({ throttle: s.v < target }) });
      expect(r.crash, `at ${target} px/s`).toBe('wall');
      expect(r.crashX, `at ${target} px/s`).toBeGreaterThanOrEqual(RISERS[0]!.x0);
      expect(r.crashX, `at ${target} px/s`).toBeLessThan(RISERS[0]!.x1 + 6);
      expect(r.state.y, `at ${target} px/s`).toBeLessThan(RISERS[0]!.nearY + cfg.wallTolerance + 3);
    }
  });

  it('the stairs down are rolled at every speed, and a hop anywhere on them with no tilt lands', () => {
    const a = (BOULDER.endCol + 36) * TILE;       // on the terrace, ten columns before the first drop
    const b = (sectionCol('Tungabhadra Leap') + 1) * TILE;
    const rolled = rolledAtEverySpeed(cfg, a, b);
    expect(rolled.crashes).toEqual([]);
    expect(rolled.worst).toBeLessThan(cfg.safeLandingAngle - 10);
    const hops = hopAnywhereNoTilt(cfg, (BOULDER.endCol + 30) * TILE, (BOULDER.endCol + 31) * TILE, (BOULDER.endCol + 57) * TILE, b);
    console.log(`[${bike.id} stairs down] rolled: worst landing ${rolled.worst.toFixed(1)} deg off; one hop, no tilt: ${hops.crashes}/${hops.n} crash`);
    expect(hops.crashes).toBe(0);
  });
});

describe('the boulder: its state machine (v1.7)', () => {
  it('waits for the trigger, rolls left at 80 px/s one fixed step at a time, breaks at the top riser', () => {
    expect([BOULDER_TRIGGER_X, BOULDER_SPAWN_X, BOULDER_END_X]).toEqual([781 * 16, 811 * 16, 771 * 16]);
    const b = createBoulder();
    expect(b).toEqual({ phase: 'hidden', x: BOULDER_SPAWN_X, t: 0 });
    expect(boulderBox(b)).toBeNull();
    // nothing happens until the bike reaches the trigger, however long it takes
    for (let i = 0; i < 1000; i++) expect(stepBoulder(b, BOULDER_TRIGGER_X - 0.01, FIXED_DT)).toBeNull();
    expect(b).toEqual({ phase: 'hidden', x: BOULDER_SPAWN_X, t: 0 });
    // a crashed bike (x = -Infinity) does not set it off either
    expect(stepBoulder(b, -Infinity, FIXED_DT)).toBeNull();
    expect(stepBoulder(b, BOULDER_TRIGGER_X, FIXED_DT)).toBe('start');
    expect(b.phase).toBe('roll');
    expect(b.x).toBe(BOULDER_SPAWN_X); // it starts on the next step
    expect(boulderBox(b)).toEqual({ x: BOULDER_SPAWN_X, y: BOULDER_GROUND_Y - 14, w: 16, h: 14 });
    // then it rolls whatever the bike does (also while the bike is crashed)
    let steps = 0;
    let ev: string | null = null;
    while (ev === null && steps < 5000) {
      const before = b.x;
      ev = stepBoulder(b, steps % 2 === 0 ? -Infinity : 1e9, FIXED_DT);
      steps++;
      expect(before - b.x).toBeCloseTo(80 / 120, 9);
    }
    expect(ev).toBe('break');
    expect(b.phase).toBe('gone');
    expect(boulderBox(b)).toBeNull();
    // 640 px at 80 px/s: 8 s (960 steps, or one more when the rounding of 2/3 px steps falls short)
    const exact = ((BOULDER_SPAWN_X - BOULDER_END_X) / 80) * 120;
    expect(steps).toBeGreaterThanOrEqual(exact);
    expect(steps).toBeLessThanOrEqual(exact + 1);
    expect(b.t).toBeCloseTo(8, 1);
    // gone is gone
    const x = b.x;
    expect(stepBoulder(b, 1e9, FIXED_DT)).toBeNull();
    expect(b.x).toBe(x);
    // and a second boulder set off the same way is in the same place at the same step
    const run = (n: number): number => { const q = createBoulder(); for (let i = 0; i < n; i++) stepBoulder(q, 1e9, FIXED_DT); return q.x; };
    expect(run(333)).toBe(run(333));
    expect(run(333)).toBeCloseTo(BOULDER_SPAWN_X - (332 * 80) / 120, 6);
  });
});

describe.each(ROSTER)('%s: Temple Steps, the boulder (v1.7)', (_name, bike: BikeDef) => {
  const cfg = bike.cfg;
  const floors = FLOORS[bike.id];
  const plan = botHops(cfg);

  it('it can be hopped from a standstill, at top speed and at boost speed', () => {
    const stand = boulderWindowMs(cfg, 0, {});
    const slow = boulderWindowMs(cfg, 60, { throttle: true });
    const top = boulderWindowMs(cfg, cfg.topSpeed, { throttle: true });
    const boost = boulderWindowMs(cfg, cfg.boostSpeed, { boost: true });
    console.log(`[${bike.id} boulder] hop window: standing ${stand.toFixed(0)} ms, from 60 px/s ${slow.toFixed(0)} ms, top speed ${top.toFixed(0)} ms, boost ${boost.toFixed(0)} ms`);
    for (const ms of [stand, slow, top, boost]) expect(ms).toBeGreaterThanOrEqual(120);
    expect(stand).toBeGreaterThanOrEqual(floors.boulderStandMs);
    expect(top).toBeGreaterThan(floors.boulderTopMs);
    expect(boost).toBeGreaterThan(floors.boulderBoostMs);
  });

  it('there is at least 1.3 s between its start and the bike reaching it, flat out', () => {
    const warning = (BOULDER_SPAWN_X - BOULDER_TRIGGER_X) / (cfg.topSpeed + BOULDER.speed);
    expect(warning).toBeGreaterThanOrEqual(1.3);
  });

  it('the bot meets it where the plan says, in the air; without that hop it is a crash', () => {
    const lay = layout(LEVEL);
    const meet = planMeetX(lay, cfg);
    expect(meet).toBeCloseTo(boulderMeetX(cfg.topSpeed), 9);
    const r = ride(cfg);
    expect(r.crash).toBeNull();
    expect(Math.abs(r.boulderMetX - meet)).toBeLessThan(2);
    // the last planned hop is the boulder's
    const boulderHop = plan[plan.length - 1]!;
    expect(boulderHop).toBeGreaterThan(BOULDER_TRIGGER_X);
    expect(boulderHop).toBeLessThan(meet);
    const hit = ride(cfg, { hops: plan.slice(0, -1) });
    expect(hit.crash).toBe('obstacle');
    expect(hit.crashX).toBeGreaterThan(BOULDER_TRIGGER_X);
    expect(hit.crashX).toBeLessThan(meet + 4);
    expect(hit.boulder).toBe('roll');
  });

  it('a bike that stops short of the trigger never sets it off', () => {
    const r = ride(cfg, { startCp: 10, hops: [], untilX: BOULDER_TRIGGER_X - 40, inputAt: (s) => ({ throttle: s.x < BOULDER_TRIGGER_X - 60 }) });
    expect(r.crash).toBeNull();
    expect(r.boulder).toBe('hidden');
  });
});

describe.each(ROSTER)('%s: standing starts at the new checkpoints (v1.7)', (_name, bike: BikeDef) => {
  const cfg = bike.cfg;
  const floors = FLOORS[bike.id];

  it('cp3, inside the canal run: one hop clears the widest canal', () => {
    const cp = CHECKPOINTS[3]!;
    const canal = CANAL_GAPS[5]!;
    expect(canal.cols).toBe(6);
    expect(canal.x0 - checkpointX(cp)).toBe(104);
    const ms = fromRestWindowMs(cfg, 3, canal.x1 + 20);
    console.log(`[${bike.id} cp3 from rest] canal hop window ${ms.toFixed(0)} ms`);
    expect(ms).toBeGreaterThanOrEqual(120);
    expect(ms).toBeGreaterThan(floors.restCanalMs);
  });

  it('cp9, at the foot of the steps: one hop clears the first riser', () => {
    const ms = fromRestWindowMs(cfg, 9, RISERS[0]!.x1 + 20);
    console.log(`[${bike.id} cp9 from rest] riser hop window ${ms.toFixed(0)} ms`);
    expect(ms).toBeGreaterThanOrEqual(120);
    expect(ms).toBeGreaterThan(floors.restRiserMs);
  });

  it('cp10, on the terrace: one hop clears the boulder', () => {
    const ms = fromRestWindowMs(cfg, 10, (BOULDER.spawnCol + 2) * TILE);
    console.log(`[${bike.id} cp10 from rest] boulder hop window ${ms.toFixed(0)} ms`);
    expect(ms).toBeGreaterThanOrEqual(120);
    expect(ms).toBeGreaterThan(floors.restBoulderMs);
  });
});

describe('performance (criterion 8)', () => {
  it('10 000 steps take under 100 ms', () => {
    const run = (n: number) => {
      let s = createBikeState(40);
      for (let i = 0; i < n; i++) {
        s = step(s, { throttle: true, hop: i % 200 < 2, boost: i % 900 > 700 });
        if (s.crashed || s.x > 14200) s = createBikeState(40);
      }
      return s;
    };
    run(2000); // warm-up
    const t0 = performance.now();
    run(10_000);
    const ms = performance.now() - t0;
    console.log(`[perf] 10 000 steps in ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(100);
  });
});
