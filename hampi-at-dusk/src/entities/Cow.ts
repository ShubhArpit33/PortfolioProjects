// The cow on Bazaar Street. Solid below cowCrashSpeed, a crash above it; she is never harmed.
// Wait politely nearby and she ambles off. A honk only earns a "..." bubble.
import Phaser from 'phaser';
import { followKey, keyUnder } from '../art/look/bake';
import { BASELINE_Y, COW, TILE } from '../level/levelData';
import type { Box } from '../level/terrain';

type CowState = 'stand' | 'walk' | 'gone';

export class Cow {
  state: CowState = 'stand';
  x = COW.col * TILE;      // left edge of the box
  readonly homeX = COW.col * TILE;
  private waitT = 0;
  private walkT = 0;
  private bubbleT = 0;
  private sprite: Phaser.GameObjects.Image;
  private key: Phaser.GameObjects.Image;
  private bubble: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, depth: number) {
    this.sprite = scene.add.image(this.x, BASELINE_Y, 'cow').setOrigin(0, 1).setDepth(depth);
    this.key = keyUnder(scene, this.sprite);
    this.bubble = scene.add.image(this.x + 2, BASELINE_Y - COW.h - 3, 'bubble').setOrigin(0.5, 1).setDepth(depth + 0.5).setVisible(false);
  }

  get solid(): boolean {
    return this.state === 'stand';
  }

  get box(): Box {
    return { x: this.x, y: BASELINE_Y - COW.h, w: COW.w, h: COW.h };
  }

  reset(): void {
    this.state = 'stand';
    this.x = this.homeX;
    this.waitT = 0;
    this.walkT = 0;
    this.bubbleT = 0;
  }

  /** One fixed step. bikeBox / speed describe the bike; returns nothing (collision is the scene's job). */
  step(dt: number, bikeBox: Box, speed: number): void {
    if (this.bubbleT > 0) this.bubbleT = Math.max(0, this.bubbleT - dt);
    if (this.state === 'stand') {
      const gap = Math.max(this.x - (bikeBox.x + bikeBox.w), bikeBox.x - (this.x + COW.w), 0);
      if (gap <= COW.waitRangeTiles * TILE && speed < COW.waitMaxSpeed) {
        this.waitT += dt;
        if (this.waitT >= COW.waitSeconds) {
          this.state = 'walk';
          this.walkT = 0;
        }
      } else {
        this.waitT = 0;
      }
    } else if (this.state === 'walk') {
      this.walkT += dt;
      this.x += COW.walkSpeed * dt;
      if (this.walkT >= COW.walkSeconds) this.state = 'gone';
    }
  }

  /** The cow doesn't care. */
  honked(): void {
    if (this.state !== 'gone') this.bubbleT = 1.4;
  }

  render(t: number): void {
    const visible = this.state !== 'gone';
    this.sprite.setVisible(visible);
    this.sprite.x = Math.round(this.x);
    if (this.state === 'walk') {
      this.sprite.setAlpha(Math.min(1, (COW.walkSeconds - this.walkT) / 1.0));
      this.sprite.setFlipX(true); // turns and walks right
      this.sprite.y = BASELINE_Y - (Math.sin(t * 10) > 0 ? 1 : 0);
    } else {
      this.sprite.setAlpha(1).setFlipX(false);
      this.sprite.y = BASELINE_Y;
    }
    followKey(this.key, this.sprite);
    this.bubble.setVisible(visible && this.bubbleT > 0);
    this.bubble.x = Math.round(this.x) + (this.state === 'walk' ? COW.w - 2 : 2);
  }
}
