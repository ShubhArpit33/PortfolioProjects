// Bakes the heightfield into static textures, in chunks of 960 px (<= 1024, GAME_SPEC.md section 6.2).
// Drawn once per page load with the 2D canvas API, one pixel column at a time so ramps stay crisp.
// What a column of road or water looks like is the stage theme's ground kit (src/art/look/ground.ts);
// where the surface is, the dressed stone of a flight of steps and the boost strip are the stage's.
// v1.9: baked per stage (texture keys carry the stage id), the first time that stage is shown.

import Phaser from 'phaser';
import { grassLine, roadColumn, roadDetail, waterColumn } from '../art/look/ground';
import { theme } from '../art/look/theme';
import { PAL, css, mix, rng } from '../art/palette';
import type { StageDef } from '../stages/stage';
import { BASELINE_Y, TILE, WATER_LINE_Y, type PromptDef } from './level';
import type { Terrain } from './terrain';

export const CHUNK_W = 960;
const H = 270;

/** The stretch of road under the "HOLD SHIFT - BOOST" prompt, in world px (empty when a stage has none). */
function boostStrip(prompts: readonly PromptDef[]): { x0: number; x1: number } {
  const p = prompts.find((q) => q.text.includes('BOOST'));
  return p ? { x0: (p.fromCol + 2) * TILE, x1: (p.toCol - 2) * TILE } : { x0: 0, x1: 0 };
}

/**
 * The drawn top of the ground at a world x, or null over water. A riser's slot (v1.7) is dry: it is drawn
 * as the lower step's stone carried up to the riser's face, in shadow.
 */
function surfaceRow(terrain: Terrain, wx: number): number | null {
  // Past either end of the stage the ground simply continues (no exposed wall at the edges).
  const x = Math.min(terrain.width - 1, Math.max(0, wx));
  const y = terrain.surfaceY(x + 0.5);
  if (y !== null) return Math.round(y);
  const gap = terrain.gapAt(x + 0.5);
  return gap !== null && gap.step ? Math.round(gap.nearY) : null;
}

/**
 * The Temple Steps are dressed stone (courses of cut blocks, a pale worn lip, no moss) from a little
 * before the first riser to a little past the last drop: [x0, x1) in world px, or null without risers.
 */
export function dressedSpan(terrain: Terrain): { x0: number; x1: number } | null {
  const steps = terrain.gaps.filter((g) => g.step);
  if (steps.length === 0) return null;
  const last = steps[steps.length - 1]!;
  const drops = terrain.cliffs.filter((c) => c.x > last.x1);
  const end = drops.length > 0 ? drops[drops.length - 1]!.x : last.x1;
  return { x0: steps[0]!.x0 - 2 * TILE, x1: end + 2 * TILE };
}

function bakeChunk(scene: Phaser.Scene, key: string, x0: number, stage: StageDef): void {
  const terrain = stage.terrain;
  const BOOST_STRIP = boostStrip(stage.prompts);
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

  const kit = theme().ground;
  const rows: Array<number | null> = [];
  for (let x = 0; x < CHUNK_W; x++) rows.push(surfaceRow(terrain, x0 + x));
  const dressed = dressedSpan(terrain);
  const isDressed = (wx: number): boolean => dressed !== null && wx >= dressed.x0 && wx < dressed.x1;
  const LIP = mix(PAL.graniteLight, PAL.cream, 0.35);

  for (let x = 0; x < CHUNK_W; x++) {
    const sy = rows[x]!;
    const wx = x0 + x;
    if (sy === null) {
      waterColumn(rect, kit, x, wx, WATER_LINE_Y, H);
      continue;
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = pattern ?? css(PAL.graniteDark);
    ctx.fillRect(x, sy, 1, H - sy);
    roadColumn(rect, kit, x, wx, sy, H, !isDressed(wx));
    // exposed vertical faces (gap walls, the cliff): shade the two columns next to a drop
    for (const d of [1, 2, -1, -2]) {
      const n = surfaceRow(terrain, wx + d);
      const bottom = n === null ? H : n;
      if (bottom - sy > 6) rect(PAL.ink, Math.abs(d) === 1 ? 0.45 : 0.22, x, sy + 2, 1, bottom - sy - 2);
    }
    if (isDressed(wx)) {
      // Dressed stone: courses 8 px deep with staggered joints, and a pale worn lip instead of moss.
      rect(PAL.graniteLight, 0.16, x, sy, 1, 44);
      for (let c = 0; c < 6; c++) {
        const cy = sy + 4 + c * 8;
        rect(PAL.ink, c === 0 ? 0.3 : 0.2, x, cy + 7, 1, 1);
        if ((wx + (c % 2 === 0 ? 0 : 12)) % 24 === 0) rect(PAL.ink, 0.2, x, cy, 1, 7);
      }
      const slot = terrain.gapAt(wx + 0.5) !== null;
      if (slot) {
        // The foot of a riser: bare stone in the shadow of the step above it.
        rect(PAL.ink, 0.5, x, sy, 1, 3);
        rect(PAL.ink, 0.3, x, sy + 3, 1, 5);
      } else {
        rect(LIP, 1, x, sy, 1, 1);
        rect(PAL.graniteLight, 1, x, sy + 1, 1, 1);
        rect(PAL.ink, 0.28, x, sy + 2, 1, 1);
      }
      continue;
    }
    grassLine(rect, kit, x, wx, sy);
  }
  // Ruts, pebbles and grass tufts on the open road (not on the dressed stone, not on water).
  const open = (wx: number): number | null => (isDressed(wx) || terrain.gapAt(wx + 0.5) !== null ? null : surfaceRow(terrain, wx));
  roadDetail(rect, kit, open, x0, x0 + CHUNK_W);

  // The boost strip on the Warm-up Road (v1.7): chevrons painted on the road, pointing the way.
  for (let cx = Math.ceil(BOOST_STRIP.x0 / 16) * 16; cx < BOOST_STRIP.x1; cx += 16) {
    for (const off of [0, 4]) {
      for (let i = 0; i < 5; i++) {
        const px = cx + off + (i < 3 ? i : 4 - i) - x0;
        const sy = px >= 0 && px < CHUNK_W ? rows[px] : null;
        if (sy !== null && sy !== undefined) rect(PAL.glint, off === 0 ? 0.55 : 0.9, px, sy + 4 + i, 1, 1);
      }
    }
  }

  // Random stone speckles and a few set stones.
  for (let i = 0; i < 520; i++) {
    const x = Math.floor(rand() * CHUNK_W);
    const sy = rows[x];
    const roll = rand();
    const yy = rand();
    if (sy === null || sy === undefined) {
      // glints on the water
      const y = WATER_LINE_Y + 4 + Math.floor(yy * (H - WATER_LINE_Y - 6));
      const glints = kit.water.glints;
      if (roll < 0.5 && rows[Math.min(CHUNK_W - 1, x + 5)] === null) rect(glints[i % glints.length]!, 0.25 + roll * 0.6, x, y, 2 + Math.floor(roll * 8), 1);
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

const chunkCount = (stage: StageDef): number => Math.ceil(stage.width / CHUNK_W);

/** Texture key of a stage's i-th terrain chunk. */
export const terrainKey = (stage: StageDef, i: number): string => `terrain_${stage.id}_${i}`;

/**
 * Bake a stage's chunk textures (once per page load and stage). The road is drawn with the theme that is
 * active, so the stage's look must have been set first (useStageLook in src/art/assets.ts does both).
 */
export function bakeTerrain(scene: Phaser.Scene, stage: StageDef): void {
  for (let i = 0; i < chunkCount(stage); i++) {
    const key = terrainKey(stage, i);
    if (!scene.textures.exists(key)) bakeChunk(scene, key, i * CHUNK_W, stage);
  }
}

/** Place a stage's terrain chunk images in a scene. */
export function addTerrain(scene: Phaser.Scene, stage: StageDef, depth: number): void {
  bakeTerrain(scene, stage);
  for (let i = 0; i < chunkCount(stage); i++) {
    scene.add.image(i * CHUNK_W, 0, terrainKey(stage, i)).setOrigin(0, 0).setDepth(depth);
  }
}

/**
 * A strip of a stage's road for the menus (the first chunk starts with flat road, so it tiles), as a
 * TileSprite that fills the screen.
 */
export function addGroundStrip(scene: Phaser.Scene, stage: StageDef, depth: number): Phaser.GameObjects.TileSprite {
  bakeTerrain(scene, stage);
  return scene.add.tileSprite(0, 0, 480, 270, terrainKey(stage, 0)).setOrigin(0, 0).setDepth(depth);
}

/**
 * A stage's decoration that stands on the terrain (stage.decor), all behind every entity and in a dark,
 * low-contrast tone. Hampi: the colonnade, the ruins, the temple doorway.
 */
export function addDecor(scene: Phaser.Scene, stage: StageDef, depth: number): void {
  for (const d of stage.decor) {
    const y = stage.terrain.surfaceY(d.x + 0.5) ?? BASELINE_Y;
    scene.add.image(d.x, y + 1, d.key).setOrigin(0, 1).setDepth(depth).setAlpha(d.alpha);
  }
}
