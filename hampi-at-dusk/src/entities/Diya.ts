// Brass oil lamp (collectible). Flame flickers; picked up when its circle touches the bike box.
import Phaser from 'phaser';
import { followKey, keyUnder } from '../art/look/bake';
import { diyaCentre, type DiyaDef } from '../level/levelData';

export class Diya {
  readonly x: number;
  readonly y: number;
  collected = false;
  private sprite: Phaser.GameObjects.Image;
  /** a dark keyline under the lamp, so it reads against a bright sky as well as a dark ruin */
  private key: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private phase: number;
  private popT = 0;

  constructor(scene: Phaser.Scene, def: DiyaDef, index: number, depth: number) {
    const c = diyaCentre(def);
    this.x = c.x;
    this.y = c.y;
    this.phase = index * 1.7;
    this.glow = scene.add.image(c.x, c.y - 1, 'glow_diya').setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
    this.sprite = scene.add.image(c.x, c.y, 'diya').setDepth(depth + 0.1);
    this.key = keyUnder(scene, this.sprite);
  }

  collect(): void {
    this.collected = true;
    this.popT = 0.25;
  }

  render(t: number, dt: number): void {
    if (this.collected) {
      // quick flare, then gone
      this.popT = Math.max(0, this.popT - dt);
      this.sprite.setVisible(false);
      followKey(this.key, this.sprite);
      this.glow.setVisible(this.popT > 0).setAlpha(this.popT * 4).setScale(1 + (0.25 - this.popT) * 4);
      return;
    }
    const f = Math.sin(t * 13 + this.phase) * 0.5 + Math.sin(t * 29 + this.phase * 2) * 0.5; // -1..1 flicker
    this.glow.setVisible(true).setScale(1).setAlpha(0.85 + 0.15 * f);
    this.sprite.setVisible(true);
    this.sprite.y = this.y + (Math.sin(t * 2.2 + this.phase) > 0.3 ? -1 : 0);
    followKey(this.key, this.sprite);
  }
}
