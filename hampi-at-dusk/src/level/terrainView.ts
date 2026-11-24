// Bakes the heightfield into static textures, in chunks of 960 px (<= 1024, GAME_SPEC.md section 6.2).
// Drawn once per page load with the 2D canvas API, one pixel column at a time so ramps stay crisp.

import Phaser from 'phaser';
import { PAL, css, mix, rng } from '../art/palette';
import { STAGE_WIDTH, WATER_LINE_Y } from './levelData';
import { TERRAIN, type Terrain } from './terrain';

export const CHUNK_W = 960;
const H = 270;

function surfaceRow(terrain: Terrain, wx: number): number | null {
  // Past either end of the stage the ground simply continues (no exposed wall at the edges).
  const x = Math.min(terrain.width - 1, Math.max(0, wx));
  const y = terrain.surfaceY(x + 0.5);
  return y === null ? null : Math.round(y);
}

function bakeChunk(scene: Phaser.Scene, key: string, x0: number, terrain: Terrain): void {
  const tex = scene.textures.createCanvas(key, CHUNK_W, H);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  const tile = scene.textures.get('tile_granite').getSourceImage() as CanvasImageSource;
  const pattern = ctx.createPattern(tile, 'repeat');
  const rand = rng(1000 + x0);
  const rect = (c: number, a: number, x: number, y: number, w: number, h: number): void => {
    ctx.globalAlpha = a;
    ctx.fillStyle = css(c);
    ctx.fillRect(x, y, w, h);
  };

  const rows: Array<number | null> = [];
  for (let x = 0; x < CHUNK_W; x++) rows.push(surfaceRow(terrain, x0 + x));

  for (let x = 0; x < CHUNK_W; x++) {
    const sy = rows[x]!;
    if (sy === null) {
      // Water: soft glow above the line, bright line, base colour, deeper shade.
      rect(PAL.glint, 0.08, x, WATER_LINE_Y - 6, 1, 2);
      rect(PAL.glint, 0.16, x, WATER_LINE_Y - 4, 1, 2);
      rect(PAL.glint, 0.28, x, WATER_LINE_Y - 2, 1, 2);
      rect(PAL.water, 1, x, WATER_LINE_Y, 1, H - WATER_LINE_Y);
      rect(PAL.glint, 0.95, x, WATER_LINE_Y, 1, 1);
      rect(PAL.glint, 0.5, x, WATER_LINE_Y + 1, 1, 1);
      rect(PAL.glint, 0.22, x, WATER_LINE_Y + 2, 1, 2);
      rect(PAL.ink, 0.25, x, WATER_LINE_Y + 22, 1, H);
      continue;
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = pattern ?? css(PAL.graniteDark);
    ctx.fillRect(x, sy, 1, H - sy);
    // lighter lip under the moss, darker with depth
    rect(PAL.graniteLight, 0.75, x, sy + 2, 1, 2);
    rect(PAL.graniteLight, 0.35, x, sy + 4, 1, 3);
    rect(PAL.ink, 0.16, x, sy + 22, 1, H);
    rect(PAL.ink, 0.16, x, sy + 38, 1, H);
    // exposed vertical faces (gap walls, the cliff): shade the two columns next to a drop
    for (const d of [1, 2, -1, -2]) {
      const n = surfaceRow(terrain, x0 + x + d);
      const bottom = n === null ? H : n;
      if (bottom - sy > 6) rect(PAL.ink, Math.abs(d) === 1 ? 0.45 : 0.22, x, sy + 2, 1, bottom - sy - 2);
    }
    // 2 px moss line with the odd drip
    rect(PAL.mossLight, 1, x, sy, 1, 1);
    rect(PAL.mossDark, 1, x, sy + 1, 1, 1);
    if (rand() < 0.14) rect(PAL.mossDark, 1, x, sy + 2, 1, 1 + Math.floor(rand() * 3));
    if (rand() < 0.05) rect(PAL.mossLight, 1, x, sy - 1, 1, 1);
  }

  // Random stone speckles and a few set stones.
  for (let i = 0; i < 520; i++) {
    const x = Math.floor(rand() * CHUNK_W);
    const sy = rows[x];
    const roll = rand();
    const yy = rand();
    if (sy === null || sy === undefined) {
      // sunset glints on the water
      const y = WATER_LINE_Y + 4 + Math.floor(yy * (H - WATER_LINE_Y - 6));
      if (roll < 0.5 && rows[Math.min(CHUNK_W - 1, x + 5)] === null) rect(PAL.glint, 0.25 + roll * 0.6, x, y, 2 + Math.floor(roll * 8), 1);
      continue;
    }
    const y = sy + 6 + Math.floor(yy * (H - sy - 6));
    if (roll < 0.45) rect(PAL.graniteLight, 0.55, x, y, 1 + (i % 2), 1);
    else if (roll < 0.85) rect(PAL.graniteDark, 0.9, x, y, 1 + (i % 2), 1);
    else if (rows[Math.min(CHUNK_W - 1, x + 4)] === sy) {
      rect(mix(PAL.graniteLight, PAL.graniteDark, 0.3), 1, x, y, 4, 2);
      rect(PAL.graniteLight, 1, x, y, 3, 1);
      rect(PAL.graniteDark, 1, x + 1, y + 2, 3, 1);
    }
  }
  ctx.globalAlpha = 1;
  tex.refresh();
}

const chunkCount = Math.ceil(STAGE_WIDTH / CHUNK_W);

/** Bake the chunk textures (once per page load). */
export function bakeTerrain(scene: Phaser.Scene, terrain: Terrain = TERRAIN): void {
  for (let i = 0; i < chunkCount; i++) {
    const key = `terrain_${i}`;
    if (!scene.textures.exists(key)) bakeChunk(scene, key, i * CHUNK_W, terrain);
  }
}

/** Place the terrain chunk images in a scene. */
export function addTerrain(scene: Phaser.Scene, depth: number): void {
  bakeTerrain(scene);
  for (let i = 0; i < chunkCount; i++) {
    scene.add.image(i * CHUNK_W, 0, `terrain_${i}`).setOrigin(0, 0).setDepth(depth);
  }
}
