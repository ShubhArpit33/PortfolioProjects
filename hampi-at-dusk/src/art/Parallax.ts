// The stage theme's tiled parallax layers (GAME_SPEC.md section 6.2), its landmark on the far skyline (the
// stone chariot), the look system's atmosphere (mist, the sun's reflection) and the animated ambience
// (birds, bats, fireflies, smoke, lamp flicker; see Ambience.ts).
// Layers are screen-fixed TileSprites whose tile offset follows the camera, so they tile seamlessly.

import type Phaser from 'phaser';
import { Ambience } from './Ambience';
import { DEPTH } from './depth';
import { Atmosphere } from './look/Atmosphere';
import { LAYER_W, theme } from './look/theme';

export { DEPTH };

const VIEW_W = 480;
const VIEW_H = 270;

export class Parallax {
  private layers: Array<{ sprite: Phaser.GameObjects.TileSprite; scroll: number }>;
  private landmark: Phaser.GameObjects.Image | null = null;
  private landmarkLayerX = 0;
  private landmarkScroll = 0;
  private atmosphere: Atmosphere;
  private ambience: Ambience;

  /** camMaxX = the furthest the camera scrolls on this stage (the landmark stands at the end of it). */
  constructor(scene: Phaser.Scene, camMaxX: number) {
    const t = theme();
    this.layers = t.layers.map((l) => ({
      sprite: scene.add.tileSprite(0, 0, VIEW_W, VIEW_H, l.key).setOrigin(0, 0).setScrollFactor(0).setDepth(l.depth),
      scroll: l.scroll,
    }));
    const lm = t.landmark;
    if (lm) {
      this.landmarkScroll = lm.scroll;
      this.landmarkLayerX = lm.endScreenX + camMaxX * lm.scroll;
      this.landmark = scene.add.image(0, lm.groundY(this.landmarkLayerX % LAYER_W), lm.key)
        .setOrigin(0.5, 1).setScrollFactor(0).setDepth(DEPTH.chariot);
    }
    this.atmosphere = new Atmosphere(scene, t);
    this.ambience = new Ambience(scene);
  }

  /** Position every layer for a camera scroll (world px); t is game time in seconds (drives the ambience). */
  update(scrollX: number, t = 0): void {
    for (const l of this.layers) l.sprite.tilePositionX = Math.round(scrollX * l.scroll);
    if (this.landmark) {
      this.landmark.x = this.landmarkLayerX - Math.round(scrollX * this.landmarkScroll);
      this.landmark.setVisible(this.landmark.x > -40 && this.landmark.x < VIEW_W + 40);
    }
    this.atmosphere.update(scrollX, t);
    this.ambience.update(t, scrollX);
  }
}
