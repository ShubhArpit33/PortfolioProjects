// Texture loading (GAME_SPEC.md section 6): a PNG in public/assets with a manifest name replaces the
// code-drawn placeholder. Only files that exist are requested (the list is baked in by vite.config.ts),
// so a missing PNG never causes a 404.

import type Phaser from 'phaser';
import { bakeKeyline, bakeLook } from './look/bake';
import { setTheme, theme } from './look/theme';
import { MANIFEST, generatePlaceholders } from './placeholders';
import { HAMPI } from './themes/hampi';

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

/**
 * Sprites that get a dark keyline under them, so they read against the lit background as well as against
 * a dark ruin: the pickup (with a white sparkle beside its flame) and everything that can be ridden into.
 * The boulder has its outline drawn in. [key, frame width (0 = one frame), sparkle position]
 */
const KEYLINED: ReadonlyArray<readonly [string, number, (readonly [number, number])?]> = [
  ['diya', 0, [7, 1]], ['pillar', 0], ['cart', 0], ['log', 0], ['cow', 0], ['monkey', 16],
];

/** Fill in every texture that was not loaded from a PNG. Call from create(). */
export function ensureTextures(scene: Phaser.Scene): void {
  setTheme(HAMPI); // the only stage so far
  bakeLook(scene, theme());
  generatePlaceholders(scene);
  for (const [key, frameW, glint] of KEYLINED) bakeKeyline(scene, key, theme().ink, 0.9, frameW, glint);
}
