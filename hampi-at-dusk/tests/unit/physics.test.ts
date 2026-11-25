import { describe, expect, it } from 'vitest';
import { BIKES, BIKE_ORDER, DEFAULT_BIKE, bikeDef, isBikeId, statBars, type BikeDef, type BikeId } from '../../src/bike/bikes';
import { CONFIG, type Config } from '../../src/config';
import {
  FIXED_DT, countFlips, createBikeState, evaluateLanding, hitsObstacle, normalizeAngle, step, touchesDiya,
  type BikeInput, type BikeState,
} from '../../src/bike/BikePhysics';
import {
  BASELINE_Y, CHECKPOINTS, COW, DIYAS, FINISH, KICKER, LEVEL, OBSTACLES, SECTIONS, TILE, WORLD_START_X, checkpointX, diyaCentre,
} from '../../src/level/levelData';
import { TERRAIN, obstacleBox, type Box } from '../../src/level/terrain';
import { hopLength, layout, planHopsFor } from '../shared/plan';

const OBSTACLE_BOXES: Box[] = OBSTACLES.map((o) => obstacleBox(o));
const COW_BOX: Box = { x: COW.col * TILE, y: BASELINE_Y - COW.h, w: COW.w, h: COW.h };
const CANAL_GAPS = TERRAIN.gaps.filter((g) => !g.river && !g.kicker);
const KICKER_GAP = TERRAIN.gaps.find((g) => g.kicker)!;
const RIVER = TERRAIN.gaps.find((g) => g.river)!;

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
    expect(col).toBe(580);
    expect(TERRAIN.width).toBe(9280);
  });

  it('gap columns match the spec', () => {
    const cols = TERRAIN.gaps.map((g) => [g.col0, g.col0 + g.cols - 1]);
    expect(cols).toEqual([[68, 70], [79, 82], [91, 95], [102, 104], [108, 110], [119, 124], [466, 473], [548, 559]]);
    expect(RIVER.nearY).toBe(BASELINE_Y - 4 * TILE); // lip at h4
    expect(RIVER.farY).toBe(BASELINE_Y);             // far bank at h0
    for (const g of CANAL_GAPS) expect(g.farY).toBe(g.nearY);
    expect(KICKER_GAP.nearY).toBe(BASELINE_Y - 2 * TILE); // kicker lip at h2
    expect(KICKER_GAP.farY).toBe(BASELINE_Y);
  });

  it('heightfield is continuous, null over gaps, with one cliff', () => {
    expect(TERRAIN.surfaceY(0)).toBe(222);
    expect(TERRAIN.surfaceY(68 * 16)).toBeNull();
    expect(TERRAIN.surfaceY(71 * 16)).toBe(222);
    // ramp 6 +2 at columns 226-231: halfway is one tile up
    expect(TERRAIN.surfaceY(229 * 16)).toBeCloseTo(222 - 16, 6);
    expect(TERRAIN.slopeAngle(229 * 16)).toBeCloseTo(18.435, 2);
    expect(TERRAIN.slopeAngle(238 * 16)).toBeCloseTo(-26.565, 2);
    expect(TERRAIN.cliffs).toEqual([{ x: 261 * 16, topY: 222 - 48, bottomY: 222 }]);
    expect(TERRAIN.surfaceY(261 * 16 - 0.01)).toBe(174);
    expect(TERRAIN.surfaceY(261 * 16)).toBe(222);
    // river ramp is the only noHop segment
    expect(TERRAIN.isNoHop(540 * 16)).toBe(true);
    expect(TERRAIN.isNoHop(547 * 16 + 15)).toBe(true);
    expect(TERRAIN.isNoHop(539 * 16 + 15)).toBe(false);
    expect(TERRAIN.pieces.filter((p) => p.noHop)).toHaveLength(1);
    // no steps between neighbouring ground pieces except at the cliff
    for (let i = 1; i < TERRAIN.pieces.length; i++) {
      const a = TERRAIN.pieces[i - 1]!;
      const b = TERRAIN.pieces[i]!;
      if (a.x1 === b.x0 && b.x0 !== 261 * 16) expect(a.y1).toBe(b.y0);
    }
    expect(DIYAS).toHaveLength(30);
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
    // Coast off the flat -> down-ramp corner at column 237 slowly enough for a short air.
    let s = rolling(237 * 16 - 4, 80);
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
    let s = rolling(539 * 16, 240);
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
    let n = rolling(540 * 16 + 2, 240);
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
    let s = createBikeState(544 * TILE);
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
    s = createBikeState(238 * TILE);
    for (let i = 0; i < 120 * 8; i++) {
      s = step(s, { brake: true });
      expect(s.grounded).toBe(true);
      expect(s.evLanding).toBeNull();
    }
    expect(s.x).toBeLessThan(226 * TILE);
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
  /** the bot plan's run time (s) */
  runS: number;
  planner: 'centred' | 'interval';
  /** does the plan survive with no tilt input at all (nose drift only)? */
  noTiltRun: boolean;
}

const FLOORS: Record<BikeId, Floors> = {
  tonup: {
    pairOneHopMs: 200, pairTwoHopMs: null, kickerRoll: 'clears', kickerMinMarginPx: 16, heldFlipSlackS: 0.2,
    pillarMs: 300, cartMs: 150, cowMs: 280, riverShortPx: 16, riverMarginPx: 64, runS: 32.06, planner: 'interval',
    noTiltRun: false,
  },
  daybreak: {
    pairOneHopMs: 120, pairTwoHopMs: null, kickerRoll: 'water', kickerMinMarginPx: 16, heldFlipSlackS: 0.12,
    pillarMs: 330, cartMs: 190, cowMs: 330, riverShortPx: 48, riverMarginPx: 16, runS: 38.13, planner: 'centred',
    noTiltRun: true,
  },
  sundowner: {
    pairOneHopMs: 80, pairTwoHopMs: 120, kickerRoll: 'water', kickerMinMarginPx: 0, heldFlipSlackS: null,
    pillarMs: 280, cartMs: 150, cowMs: 290, riverShortPx: 64, riverMarginPx: 16, runS: 43.99, planner: 'centred',
    noTiltRun: true,
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
      expect(b.tagline.length).toBeLessThanOrEqual(42);
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
    expect(BIKES.tonup.medalsMs).toEqual({ gold: 34_000, silver: 40_000, bronze: 50_000 });
    expect(BIKES.daybreak.medalsMs).toEqual({ gold: 40_000, silver: 46_000, bronze: 56_000 });
    expect(BIKES.sundowner.medalsMs).toEqual({ gold: 46_000, silver: 52_000, bronze: 62_000 });
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

  it('the paired gaps at columns 102-110 clear in one hop', () => {
    const samples: boolean[] = [];
    for (let d = runUp(first.x0, 96); d >= 0.5; d -= 0.5) {
      const r = runUntilLanding(rolling(first.x0 - d, V, cfg), (_s, i) => ({ throttle: true, hop: i === 0 }), [], 720, cfg);
      samples.push(r.landedAt !== null && r.landedAt >= second.x1);
    }
    const windowMs = (longestWindowPx(samples, 0.5) / V) * 1000;
    console.log(`[${bike.id} gaps 102-110 in one hop] window ${windowMs.toFixed(0)} ms`);
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
    console.log(`[${bike.id} gaps 102-110 in two hops] window for the first hop ${windowMs.toFixed(0)} ms`);
    // Only a short hop fits the platform: this is the Sundowner's easy line. The longer hops overshoot it
    // from anywhere on the 96 px run-up, which is why those bikes take the pair in one.
    if (floors.pairTwoHopMs !== null) expect(windowMs).toBeGreaterThanOrEqual(floors.pairTwoHopMs);
    else expect(windowMs).toBe(0);
  });
});

describe('kicker layout (section 6)', () => {
  it('the ramp ends at the tank: lip at h2, 8 columns of water, far bank h0', () => {
    expect(KICKER_GAP.x0).toBe(KICKER.lipCol * TILE);
    expect(KICKER_GAP.cols).toBe(8);
    expect(TERRAIN.slopeAngle(KICKER.rampCol * TILE + 8)).toBeCloseTo(26.565, 2);
    expect(TERRAIN.isNoHop(KICKER.rampCol * TILE + 8)).toBe(false);
  });
});

describe.each(ROSTER)('%s: kicker (section 6)', (_name, bike: BikeDef) => {
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
    expect(ms).toBeGreaterThan(o.type === 'cart' ? floors.cartMs : floors.pillarMs);
  });

  it('the cow can be hopped too', () => {
    const ms = windowMs(COW_BOX);
    console.log(`[${bike.id} cow] hop window ${ms.toFixed(0)} ms`);
    expect(ms).toBeGreaterThan(floors.cowMs);
  });

  it('riding into a pillar without hopping overlaps it', () => {
    const box = obstacleBox(OBSTACLES[0]!);
    const r = runUntilLanding(rolling(box.x - 100, V, cfg), () => ({ throttle: true }), [box], 240, cfg);
    expect(r.hitBox).toBe(true);
  });
});

describe.each(ROSTER)('%s: river (criterion 4)', (_name, bike: BikeDef) => {
  const cfg = bike.cfg;
  const floors = FLOORS[bike.id];
  const cp6 = checkpointX(CHECKPOINTS[6]!); // the river checkpoint

  const ride = (input: BikeInput, startBoost = 1) => {
    let s = createBikeState(cp6, TERRAIN, cfg);
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

  it('starts at cp6 = 16*522 + 8', () => {
    expect(cp6).toBe(16 * 522 + 8);
    expect(RIVER.x0).toBe(8768);
    expect(RIVER.x1).toBe(8960);
  });

  it('holds top speed up the river ramp without boost', () => {
    let s = rolling(539 * 16, cfg.topSpeed, cfg);
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

  it('with boost from cp6 (at rest, full meter) it clears with >= 1 tile to spare', () => {
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
  // A simple script: hold throttle, hop at fixed x positions, hold boost from cp6 on.
  // The last six: the four mandapa hops, the hop line off the second roller, the kicker.
  const HOPS = [620, 1030, 1230, 1430, 1624, 1880, 2440, 2850, 3090, 3320, 4380, 5112, 5384, 5656, 5960, 6976, 7424];

  it('all 30 are collected in one crash-free scripted run (throttle + 17 hops + boost from cp6)', () => {
    const r = scriptedRun(CONFIG, HOPS, 0, false);
    const missing = DIYAS.filter((_, i) => !r.collected.has(i)).map((d) => `x${d.col}`);
    console.log(
      `[diyas] ${r.collected.size}/${DIYAS.length} collected, missing: ${missing.join(',') || 'none'}; ` +
      `finish x=${r.s.x.toFixed(0)} after ${(r.steps * FIXED_DT).toFixed(2)} s, crashed=${r.s.crashed}, hit=${r.hit}`,
    );
    expect(r.s.crashed).toBeNull();
    expect(r.hit).toBe(false);
    expect(missing).toEqual([]);
    expect(r.s.x).toBeGreaterThanOrEqual(FINISH.col * TILE);
  });

  it('the script is not a knife edge: +/- 4 px on every hop still gets all 30', () => {
    for (const off of [-4, -2, 2, 4]) {
      const r = scriptedRun(CONFIG, HOPS, off, false);
      expect(r.s.crashed, `offset ${off}`).toBeNull();
      expect(r.hit, `offset ${off}`).toBe(false);
      expect(r.collected.size, `offset ${off}`).toBe(30);
    }
  });

  it('x264 is collected by rolling off the cliff; x276 needs the hop', () => {
    const idx264 = DIYAS.findIndex((d) => d.col === 264);
    const idx276 = DIYAS.findIndex((d) => d.col === 276);
    let s = rolling(255 * 16 + 60, 240);
    const got = new Set<number>();
    for (let i = 0; i < 120 * 3; i++) {
      s = step(s, { throttle: true });
      DIYAS.forEach((d, j) => {
        if (touchesDiya(s, diyaCentre(d))) got.add(j);
      });
    }
    expect(s.crashed).toBeNull();
    expect(got.has(idx264)).toBe(true);
    expect(got.has(idx276)).toBe(false);
  });
});

/**
 * Throttle held, a hop at each planned x (+ offset), boost from cp6 on. With `level`, the bike is held
 * level in the air by the bot's +/- 3 deg rule; without it, only the idle nose drift acts.
 */
function scriptedRun(cfg: Config, hops: readonly number[], hopOffset: number, level: boolean) {
  const boxes = [...OBSTACLE_BOXES, COW_BOX];
  const boostFromX = checkpointX(CHECKPOINTS[6]!);
  const finishX = FINISH.col * TILE;
  let s = createBikeState(checkpointX(CHECKPOINTS[0]!), TERRAIN, cfg);
  const collected = new Set<number>();
  let next = 0;
  let steps = 0;
  let hit = false;
  let hopHeld = false;
  let worstLanding = 0;
  while (s.x < finishX && steps < 120 * 120 && !s.crashed && !hit) {
    // edge-triggered, like the bot: press for one step, on the ground only
    const hop: boolean = !hopHeld && s.grounded && next < hops.length && s.x >= hops[next]! + hopOffset;
    const angle = s.angle;
    s = step(s, {
      throttle: true, hop, boost: s.x >= boostFromX,
      tiltDown: level && !s.grounded && angle > 3, tiltUp: level && !s.grounded && angle < -3,
    }, FIXED_DT, TERRAIN, cfg);
    hopHeld = hop;
    if (s.evHop) next++;
    if (s.evLanding && s.evLanding !== 'silent') {
      worstLanding = Math.max(worstLanding, Math.abs(normalizeAngle(s.angle - TERRAIN.slopeAngle(s.x))));
    }
    DIYAS.forEach((d, i) => {
      if (touchesDiya(s, diyaCentre(d), cfg)) collected.add(i);
    });
    hit = hitsObstacle(s, boxes, cfg);
    steps++;
  }
  return { s, collected, steps, hit, worstLanding, hopsUsed: next };
}

describe.each(ROSTER)('%s: the bot plan collects all 30 diyas (5.2)', (_name, bike: BikeDef) => {
  const cfg = bike.cfg;
  const floors = FLOORS[bike.id];
  const plan = planHopsFor(layout(LEVEL), LEVEL, cfg);

  it('plans 17 hops and rides them crash-free to the line, levelling in the air', () => {
    expect(plan.planner).toBe(floors.planner);
    expect(plan.hops).toHaveLength(17);
    const r = scriptedRun(cfg, plan.hops, 0, true);
    const missing = DIYAS.filter((_, i) => !r.collected.has(i)).map((d) => `x${d.col}`);
    const seconds = r.steps * FIXED_DT;
    console.log(
      `[${bike.id} plan] ${plan.planner} planner, hops ${plan.hops.map((x) => x.toFixed(0)).join(',')}; ` +
      `${r.collected.size}/30, ${seconds.toFixed(2)} s, worst landing ${r.worstLanding.toFixed(1)} deg off, boost left ${r.s.boost.toFixed(2)}`,
    );
    expect(r.s.crashed).toBeNull();
    expect(r.hit).toBe(false);
    expect(missing).toEqual([]);
    expect(r.hopsUsed).toBe(17);
    expect(seconds).toBeCloseTo(floors.runS, 1);
    // a clean run is gold on this bike, with room for a slip
    expect(seconds * 1000).toBeLessThan(bike.medalsMs.gold - 1500);
    expect(r.worstLanding).toBeLessThan(cfg.safeLandingAngle);
  });

  it('the plan is not a knife edge: +/- 8 px on every hop still gets all 30', () => {
    for (const off of [-8, -4, -2, 2, 4, 8]) {
      const r = scriptedRun(cfg, plan.hops, off, true);
      expect(r.s.crashed, `offset ${off}`).toBeNull();
      expect(r.hit, `offset ${off}`).toBe(false);
      expect(r.collected.size, `offset ${off}`).toBe(30);
    }
  });

  it('with no tilt at all: the forgiving bikes still finish; the Ton-Up has to be flown level', () => {
    const r = scriptedRun(cfg, plan.hops, 0, false);
    if (floors.noTiltRun) {
      expect(r.s.crashed).toBeNull();
      expect(r.collected.size).toBe(30);
    } else {
      // 25 deg of safe band: an uncorrected hop over a long canal comes down too nose-low.
      expect(r.s.crashed).toBe('landing');
      console.log(`[${bike.id} plan] no tilt: crashes on landing at x=${r.s.x.toFixed(0)}`);
    }
  });
});

describe('performance (criterion 8)', () => {
  it('10 000 steps take under 100 ms', () => {
    const run = (n: number) => {
      let s = createBikeState(40);
      for (let i = 0; i < n; i++) {
        s = step(s, { throttle: true, hop: i % 200 < 2, boost: i % 900 > 700 });
        if (s.crashed || s.x > 9100) s = createBikeState(40);
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
