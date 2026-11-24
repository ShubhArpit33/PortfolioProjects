// The four tiled parallax layers (GAME_SPEC.md section 6.2) plus the stone chariot on the far skyline
// and the animated ambience (birds, bats, fireflies, smoke, lamp flicker; see Ambience.ts).
// Layers are screen-fixed TileSprites whose tile offset follows the camera, so they tile seamlessly.

import Phaser from 'phaser';
import { CAMERA_MAX_SCROLL_X } from '../level/levelData';
import { Ambience } from './Ambience';
import { skylineRidgeY } from './placeholders';

export const SCROLL = { sky: 0.05, skyline: 0.2, mid: 0.45, near: 1.1 } as const;
export const DEPTH = {
  sky: 0, skyline: 1, chariot: 1.5, mid: 2,
  terrain: 10, deco: 11, checkpoint: 12, obstacle: 13, animal: 14, diya: 15,
  bike: 20, fx: 21, popup: 30, near: 40, fade: 50, debug: 60,
} as const;

const VIEW_W = 480;
const VIEW_H = 270;
/** Screen x of the chariot when the camera is at the end of the stage. */
const CHARIOT_SCREEN_X = 300;

export class Parallax {
  private sky: Phaser.GameObjects.TileSprite;
  private skyline: Phaser.GameObjects.TileSprite;
  private mid: Phaser.GameObjects.TileSprite;
  private near: Phaser.GameObjects.TileSprite;
  private chariot: Phaser.GameObjects.Image;
  private chariotLayerX: number;
  private ambience: Ambience;

  constructor(scene: Phaser.Scene) {
    const layer = (key: string, depth: number): Phaser.GameObjects.TileSprite =>
      scene.add.tileSprite(0, 0, VIEW_W, VIEW_H, key).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
    this.sky = layer('bg_sky', DEPTH.sky);
    this.skyline = layer('bg_skyline', DEPTH.skyline);
    this.mid = layer('bg_mid', DEPTH.mid);
    this.near = layer('fg_near', DEPTH.near);

    this.chariotLayerX = CHARIOT_SCREEN_X + CAMERA_MAX_SCROLL_X * SCROLL.skyline;
    const texX = this.chariotLayerX % 960;
    const ground = Math.min(skylineRidgeY(texX - 26), skylineRidgeY(texX), skylineRidgeY(texX + 26));
    this.chariot = scene.add.image(0, ground - 2, 'chariot').setOrigin(0.5, 1).setScrollFactor(0).setDepth(DEPTH.chariot);
    this.ambience = new Ambience(scene);
  }

  /** Position every layer for a camera scroll (world px); t is game time in seconds (drives the ambience). */
  update(scrollX: number, t = 0): void {
    this.sky.tilePositionX = Math.round(scrollX * SCROLL.sky);
    const sl = Math.round(scrollX * SCROLL.skyline);
    this.skyline.tilePositionX = sl;
    this.mid.tilePositionX = Math.round(scrollX * SCROLL.mid);
    this.near.tilePositionX = Math.round(scrollX * SCROLL.near);
    this.chariot.x = this.chariotLayerX - sl;
    this.chariot.setVisible(this.chariot.x > -40 && this.chariot.x < VIEW_W + 40);
    this.ambience.update(t, scrollX);
  }
}
