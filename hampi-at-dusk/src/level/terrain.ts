// Heightfield built from the level segments. Pure, no Phaser.
// surfaceY is continuous piecewise-linear (ramps interpolate; columns do not step),
// except at a cliff (vertical wall) and at gaps (null).

import {
  BASELINE_Y, SECTIONS, STAGE_COLS, TILE,
  type ObstacleDef, type Section,
} from './levelData';

export interface GroundPiece {
  x0: number; x1: number;   // [x0, x1)
  y0: number; y1: number;   // surface y at x0 and x1
  /** degrees, positive = uphill (to the right) */
  angle: number;
  noHop: boolean;
  col0: number; cols: number;
}

export interface Gap {
  x0: number; x1: number;   // [x0, x1) has no surface
  col0: number; cols: number;
  river: boolean;
  nearY: number;            // surface y of the take-off lip
  farY: number;             // surface y of the far bank
}

export interface CliffWall {
  x: number;                // the wall is vertical at this x
  topY: number;             // surface y just left of x
  bottomY: number;          // surface y at x and to the right
}

export interface Terrain {
  width: number;
  pieces: GroundPiece[];
  gaps: Gap[];
  cliffs: CliffWall[];
  /** Ground y at x, or null over a gap. */
  surfaceY(x: number): number | null;
  /** Slope in degrees at x (positive = uphill); 0 over a gap. */
  slopeAngle(x: number): number;
  isNoHop(x: number): boolean;
  /** The gap containing x, or null. */
  gapAt(x: number): Gap | null;
  pieceAt(x: number): GroundPiece | null;
}

export const heightY = (h: number): number => BASELINE_Y - TILE * h;

export function buildTerrain(sections: Section[] = SECTIONS): Terrain {
  const pieces: GroundPiece[] = [];
  const gaps: Gap[] = [];
  const cliffs: CliffWall[] = [];
  // Per column: index into pieces (>= 0) or -(gapIndex + 1).
  const colIndex: number[] = [];

  let col = 0;
  let h = 0; // current height in tiles
  for (const section of sections) {
    for (const seg of section.segments) {
      if (seg.kind === 'cliff') {
        cliffs.push({ x: col * TILE, topY: heightY(h), bottomY: heightY(seg.toH) });
        h = seg.toH;
        continue;
      }
      const x0 = col * TILE;
      const x1 = (col + seg.cols) * TILE;
      if (seg.kind === 'gap') {
        const farH = seg.farBankH ?? h;
        gaps.push({
          x0, x1, col0: col, cols: seg.cols, river: seg.river === true,
          nearY: heightY(h), farY: heightY(farH),
        });
        for (let i = 0; i < seg.cols; i++) colIndex.push(-gaps.length);
        h = farH;
      } else {
        const rise = seg.kind === 'ramp' ? seg.rise : 0;
        const y0 = heightY(h);
        const y1 = heightY(h + rise);
        pieces.push({
          x0, x1, y0, y1,
          angle: (Math.atan2(y0 - y1, x1 - x0) * 180) / Math.PI,
          noHop: seg.noHop === true,
          col0: col, cols: seg.cols,
        });
        for (let i = 0; i < seg.cols; i++) colIndex.push(pieces.length - 1);
        h += rise;
      }
      col += seg.cols;
    }
  }

  const totalCols = col;
  const width = totalCols * TILE;

  const lookup = (x: number): number => {
    let c = Math.floor(x / TILE);
    if (c < 0) c = 0;
    else if (c >= totalCols) c = totalCols - 1;
    return colIndex[c]!;
  };

  const pieceAt = (x: number): GroundPiece | null => {
    const i = lookup(x);
    return i >= 0 ? pieces[i]! : null;
  };

  return {
    width,
    pieces,
    gaps,
    cliffs,
    pieceAt,
    surfaceY(x) {
      const i = lookup(x);
      if (i < 0) return null;
      const p = pieces[i]!;
      if (p.y0 === p.y1) return p.y0;
      const cx = x < p.x0 ? p.x0 : x > p.x1 ? p.x1 : x;
      return p.y0 + ((p.y1 - p.y0) * (cx - p.x0)) / (p.x1 - p.x0);
    },
    slopeAngle(x) {
      const i = lookup(x);
      return i >= 0 ? pieces[i]!.angle : 0;
    },
    isNoHop(x) {
      const i = lookup(x);
      return i >= 0 ? pieces[i]!.noHop : false;
    },
    gapAt(x) {
      const i = lookup(x);
      return i < 0 ? gaps[-i - 1]! : null;
    },
  };
}

/** The stage terrain (built once). */
export const TERRAIN: Terrain = buildTerrain();

if (TERRAIN.width !== STAGE_COLS * TILE) {
  throw new Error(`level segments cover ${TERRAIN.width} px, expected ${STAGE_COLS * TILE}`);
}

export interface Box { x: number; y: number; w: number; h: number } // top-left + size

/** Obstacle AABB: left column, extends right and up from the surface. */
export function obstacleBox(o: ObstacleDef, terrain: Terrain = TERRAIN): Box {
  const x = o.col * TILE;
  const ground = terrain.surfaceY(x) ?? BASELINE_Y;
  const h = o.hTiles * TILE;
  return { x, y: ground - h, w: o.wCols * TILE, h };
}
