// Fallen pillars and the parked bullock cart: solid boxes; any overlap with the bike box is a crash.
import Phaser from 'phaser';
import type { ObstacleDef } from '../level/levelData';
import { obstacleBox, type Box } from '../level/terrain';

export class Obstacle {
  readonly box: Box;
  constructor(scene: Phaser.Scene, def: ObstacleDef, depth: number) {
    this.box = obstacleBox(def);
    scene.add.image(this.box.x, this.box.y + this.box.h, def.type).setOrigin(0, 1).setDepth(depth);
  }
}
