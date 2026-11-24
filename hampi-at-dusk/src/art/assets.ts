// Texture loading (GAME_SPEC.md section 6): a PNG in public/assets with a manifest name replaces the
// code-drawn placeholder. Only files that exist are requested (the list is baked in by vite.config.ts),
// so a missing PNG never causes a 404.

import type Phaser from 'phaser';
import { MANIFEST, generatePlaceholders } from './placeholders';

/** Queue the PNGs that exist. Call from a scene's preload(). */
export function queueAssetPngs(scene: Phaser.Scene): void {
  const present: string[] = typeof __ASSET_PNGS__ !== 'undefined' ? __ASSET_PNGS__ : [];
  for (const name of present) {
    const def = MANIFEST[name];
    if (!def) continue; // not a manifest name: ignore
    const url = `assets/${name}.png`;
    if (def.frameW) scene.load.spritesheet(name, url, { frameWidth: def.frameW, frameHeight: def.h });
    else scene.load.image(name, url);
  }
}

/** Fill in every texture that was not loaded from a PNG. Call from create(). */
export function ensureTextures(scene: Phaser.Scene): void {
  generatePlaceholders(scene);
}
