// Look system, part 3: the ground kit. Paints the road a stage is ridden on, one pixel column at a time,
// from a small set of colours and densities in the stage theme. The level decides where the surface is;
// this decides what a column of road, and a column of water, look like. Canvas-agnostic: it only fills rects.

import { bayer, hash2 } from './pix';
import type { Tones } from './silhouettes';

export interface GroundKit {
  /** the road body: [pebble highlight, lit lip, shade] (the fill itself is the 16 px ground tile) */
  soil: Tones;
  /** growth on top: [lit top line, second line and drips, blade shadow] */
  grass: Tones;
  /** warm light caught by the top line: [colour, strength 0..1] */
  rim: readonly [number, number];
  /** shade colour for depth, ruts and the band under the surface */
  shade: number;
  /** strength (alpha) of the soft dark band under the surface */
  under: number;
  /** how many per 100 px of road */
  tufts: number;
  pebbles: number;
  ruts: number;
  water: { line: number; glow: number; top: number; deep: number; glints: readonly number[] };
}

/** fill w x h at (x, y) with colour c at alpha a */
export type Rect = (c: number, a: number, x: number, y: number, w: number, h: number) => void;

/**
 * One column of road body at chunk x / world x, surface at sy: the lit lip, a soft darker band under it
 * (`band`; not on dressed stone), and shade that deepens in two dithered steps.
 */
export function roadColumn(rect: Rect, k: GroundKit, x: number, wx: number, sy: number, H: number, band = true): void {
  rect(k.soil[1], 0.75, x, sy + 2, 1, 2);
  rect(k.soil[1], 0.35, x, sy + 4, 1, 3);
  for (let d = 8; band && d < 15; d++) {
    const edge = d < 10 ? (d - 7) / 3 : d > 12 ? (15 - d) / 3 : 1;
    if (edge > bayer(wx, sy + d)) rect(k.shade, k.under, x, sy + d, 1, 1);
  }
  for (const d0 of [22, 38]) {
    for (let d = -3; d < 0; d++) if ((d + 4) / 4 > bayer(wx, sy + d0 + d)) rect(k.shade, 0.16, x, sy + d0 + d, 1, 1);
    rect(k.shade, 0.16, x, sy + d0, 1, H);
  }
}

/** The 2 px growth line on top of a road column, with the odd drip and sprout. */
export function grassLine(rect: Rect, k: GroundKit, x: number, wx: number, sy: number): void {
  rect(k.grass[0], 1, x, sy, 1, 1);
  if (k.rim[1] > 0 && hash2(wx, 5) < 0.7) rect(k.rim[0], k.rim[1], x, sy, 1, 1);
  rect(k.grass[1], 1, x, sy + 1, 1, 1);
  if (hash2(wx, 1) < 0.14) rect(k.grass[1], 1, x, sy + 2, 1, 1 + Math.floor(hash2(wx, 2) * 3));
  if (hash2(wx, 3) < 0.05) rect(k.grass[0], 1, x, sy - 1, 1, 1);
}

/** One column of water whose surface is at wy: a glow above the line, the bright line, a dithered fall to the deep colour. */
export function waterColumn(rect: Rect, k: GroundKit, x: number, wx: number, wy: number, H: number): void {
  const w = k.water;
  rect(w.glow, 0.08, x, wy - 6, 1, 2);
  rect(w.glow, 0.16, x, wy - 4, 1, 2);
  rect(w.glow, 0.28, x, wy - 2, 1, 2);
  rect(w.deep, 1, x, wy, 1, H - wy);
  for (let d = 0; d < 16; d++) if (1 - d / 16 > bayer(wx, wy + d)) rect(w.top, 1, x, wy + d, 1, 1);
  rect(w.line, 0.95, x, wy, 1, 1);
  rect(w.line, 0.5, x, wy + 1, 1, 1);
  rect(w.line, 0.22, x, wy + 2, 1, 2);
  rect(k.shade, 0.25, x, wy + 22, 1, H);
}

/**
 * Texture over the stretch [x0, x1) of world x: ruts, pebbles and grass tufts on the road. surface(wx) is
 * the surface y of a column, or null where there is no open road (water, dressed stone). Everything is
 * placed by a hash of world x and drawn at x - x0, so two neighbouring chunks agree about whatever
 * crosses their join.
 */
export function roadDetail(rect: Rect, k: GroundKit, surface: (wx: number) => number | null, x0: number, x1: number): void {
  const CELL = 20;
  const put: Rect = (c, a, wx, y, w, h) => { // clipped to the stretch
    const l = Math.max(wx, x0), r = Math.min(wx + w, x1);
    if (r > l) rect(c, a, l - x0, y, r - l, h);
  };
  for (let cell = Math.floor(x0 / CELL) - 2; cell * CELL < x1; cell++) {
    const cx = cell * CELL;
    // a rut: a dark streak that follows the surface a few pixels down, with a lighter line under it
    if (hash2(cell, 11) < (k.ruts * CELL) / 100) {
      const start = cx + Math.floor(hash2(cell, 12) * CELL), len = 10 + Math.floor(hash2(cell, 13) * 26);
      const d = [4, 5, 6, 10, 11, 17][Math.floor(hash2(cell, 14) * 6)]!;
      for (let wx = start; wx < start + len; wx++) {
        const sy = surface(wx);
        if (sy === null) continue;
        put(k.shade, 0.38, wx, sy + d, 1, 1);
        if (wx > start + 1 && wx < start + len - 2) put(k.soil[0], 0.22, wx, sy + d + 1, 1, 1);
      }
    }
    // a pebble: two or three pixels wide, lit on top, shaded underneath
    if (hash2(cell, 21) < (k.pebbles * CELL) / 100) {
      const wx = cx + Math.floor(hash2(cell, 22) * CELL), sy = surface(wx), w = 2 + Math.floor(hash2(cell, 23) * 2);
      if (sy !== null && surface(wx + w) === sy) {
        const y = sy + 3 + Math.floor(hash2(cell, 24) * 14);
        put(k.soil[0], 0.9, wx, y, w, 1);
        put(k.soil[2], 0.9, wx, y + 1, w, 1);
        put(k.shade, 0.3, wx + 1, y + 2, w, 1);
      }
    }
    // a grass tuft: a few thin blades standing two to four pixels above the road (never tall enough to read as a thing in the way)
    if (hash2(cell, 31) < (k.tufts * CELL) / 100) {
      const wx = cx + Math.floor(hash2(cell, 32) * CELL), blades = 2 + Math.floor(hash2(cell, 33) * 3);
      for (let b = 0; b < blades; b++) {
        const bx = wx + b * 2, sy = surface(bx);
        if (sy === null) continue;
        const h = 2 + Math.floor(hash2(bx, 34) * 3);
        put(k.grass[2], 1, bx, sy - h + 1, 1, h);
        put(k.grass[0], 1, bx, sy - h, 1, 1);
      }
    }
  }
}
