// The bot's plan, derived from levelData and a bike's tuning only. Pure (no Playwright, no Phaser), so
// the unit tests can ride the same plan the e2e bot does.

import { CONFIG, type Config } from '../../src/config';
import type { LevelData } from '../../src/level/levelData';

export interface Span { x0: number; x1: number }

export interface Layout {
  gaps: Span[];       // canal gaps
  river: Span;
  rampStartX: number; // start of the noHop river ramp
  boxes: Span[];      // cow + solid obstacles (x extent of the hitbox)
  cpX: number[];
  finishX: number;
}

export function layout(level: LevelData): Layout {
  const T = level.tile;
  const gaps: Span[] = [];
  let river: Span | null = null;
  let rampStartX = 0;
  let col = 0;
  for (const section of level.sections) {
    for (const seg of section.segments) {
      if (seg.kind === 'cliff') continue;
      const span = { x0: col * T, x1: (col + seg.cols) * T };
      if (seg.kind === 'gap') {
        if (seg.river) river = span;
        else gaps.push(span);
      } else if (seg.noHop) {
        rampStartX = span.x0;
      }
      col += seg.cols;
    }
  }
  if (!river) throw new Error('levelData has no river gap');
  const boxes: Span[] = [
    { x0: level.cow.col * T, x1: level.cow.col * T + level.cow.w },
    ...level.obstacles.map((o) => ({ x0: o.col * T, x1: (o.col + o.wCols) * T })),
  ];
  return {
    gaps, river, rampStartX, boxes,
    cpX: level.checkpoints.map((c) => c.col * T + T / 2),
    finishX: level.finish.col * T,
  };
}

const MARGIN = 8;

/** Length of a flat-ground hop at top speed: 2·hopVelocity/gravity · topSpeed (192 px on the Daybreak). */
export const hopLength = (cfg: Config): number => ((2 * cfg.hopVelocity) / cfg.gravity) * cfg.topSpeed;

export interface HopPlan {
  hops: number[];
  /** which planner produced the hazard hops */
  planner: 'centred' | 'interval';
}

/**
 * One hop per hazard (canal gap, cow, pillar, cart), centred over it. If a hop would come down
 * too late to take off for the next hazard, both are cleared with a single hop centred over the pair.
 *
 * A bike whose hops are long enough to chain into each other (the Ton-Up: 214 px) has no centred plan.
 * It gets the interval planner instead: each hazard group has a range of take-off points that clear it;
 * one pass forward finds the earliest take-off each hop can have, one pass back the latest, and the hop
 * goes in the middle of what is left.
 */
export function planHopsFor(lay: Layout, level: LevelData, cfg: Config = CONFIG): HopPlan {
  const HALF_BIKE = cfg.bikeHitW / 2;
  const HOP_LEN = hopLength(cfg);
  const hazards: Span[] = [
    ...lay.gaps,
    ...lay.boxes.map((b) => ({ x0: b.x0 - HALF_BIKE, x1: b.x1 + HALF_BIKE })),
  ].sort((a, b) => a.x0 - b.x0);

  let hops: number[] = [];
  let groups: Span[] = [];
  let planner: HopPlan['planner'] = 'centred';
  try {
    let prevLanding = -Infinity;
    for (let i = 0; i < hazards.length; i++) {
      const group = { ...hazards[i]! };
      const landing = (): number => Math.max((group.x0 + group.x1) / 2 - HOP_LEN / 2, prevLanding + 2) + HOP_LEN;
      while (i + 1 < hazards.length && landing() > hazards[i + 1]!.x0 - MARGIN - 2) {
        group.x1 = hazards[++i]!.x1;
      }
      const takeoff = landing() - HOP_LEN;
      if (takeoff > group.x0 - MARGIN || landing() < group.x1 + MARGIN) {
        throw new Error(`no safe hop for hazard ${group.x0}..${group.x1}`);
      }
      hops.push(takeoff);
      groups.push(group);
      prevLanding = landing();
    }
  } catch {
    planner = 'interval';
    hops = [];
    groups = [];
    for (let i = 0; i < hazards.length; i++) {
      const g = { ...hazards[i]! };
      // Hazards less than 4 tiles apart that one hop can span are taken together.
      while (
        i + 1 < hazards.length && hazards[i + 1]!.x0 - g.x1 < 64 && hazards[i + 1]!.x1 - g.x0 + 2 * MARGIN <= HOP_LEN
      ) g.x1 = hazards[++i]!.x1;
      groups.push(g);
    }
    const lo = groups.map((g) => g.x1 + MARGIN - HOP_LEN);
    const hi = groups.map((g) => g.x0 - MARGIN);
    const earliest: number[] = [];
    const latest: number[] = new Array<number>(groups.length);
    groups.forEach((_, i) => earliest.push(Math.max(lo[i]!, i > 0 ? earliest[i - 1]! + HOP_LEN + 2 : -Infinity)));
    for (let i = groups.length - 1; i >= 0; i--) {
      latest[i] = Math.min(hi[i]!, i + 1 < groups.length ? latest[i + 1]! - HOP_LEN - 2 : Infinity);
    }
    groups.forEach((g, i) => {
      if (earliest[i]! > latest[i]!) throw new Error(`no safe hop for hazard ${g.x0}..${g.x1}`);
      hops.push((earliest[i]! + latest[i]!) / 2);
    });
  }

  // Diyas floating 2+ tiles above solid ground that no hazard hop passes through need their own
  // hop (x276 and x437, on up-ramps). Diyas just past a cliff are collected by rolling off it.
  const T = level.tile;
  const heights = columnHeights(level);
  let lastDiyaHop = -Infinity;
  for (const d of level.diyas) {
    const x = d.col * T + T / 2;
    const ground = heights.h[d.col];
    if (ground === null || ground === undefined || d.h - ground < 2) continue;
    if (groups.some((g) => x >= g.x0 - HOP_LEN && x <= g.x1 + HOP_LEN)) continue;
    if (heights.cliffCols.some((c) => d.col >= c && d.col < c + 8)) continue;
    // A second diya further along the same arc (the hop line off the second roller) needs no hop of its own.
    if (x - 24 < lastDiyaHop + HOP_LEN * 1.5) continue;
    lastDiyaHop = x - 24;
    hops.push(x - 24); // just before the diya: the bike box is centred on it while rising
  }
  return { hops: hops.sort((a, b) => a - b), planner };
}

export function planHops(lay: Layout, level: LevelData, cfg: Config = CONFIG): number[] {
  return planHopsFor(lay, level, cfg).hops;
}

/** Surface height (tiles) at the middle of each column; null over water. */
function columnHeights(level: LevelData): { h: Array<number | null>; cliffCols: number[] } {
  const h: Array<number | null> = [];
  const cliffCols: number[] = [];
  let cur = 0;
  for (const section of level.sections) {
    for (const seg of section.segments) {
      if (seg.kind === 'cliff') {
        cliffCols.push(h.length);
        cur = seg.toH;
      } else if (seg.kind === 'gap') {
        for (let i = 0; i < seg.cols; i++) h.push(null);
        cur = seg.farBankH ?? cur;
      } else {
        const rise = seg.kind === 'ramp' ? seg.rise : 0;
        for (let i = 0; i < seg.cols; i++) h.push(cur + (rise * (i + 0.5)) / seg.cols);
        cur += rise;
      }
    }
  }
  return { h, cliffCols };
}
