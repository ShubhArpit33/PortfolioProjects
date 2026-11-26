// Fallen pillars and the parked bullock cart: solid boxes; any overlap with the bike box is a crash.
// The log on the Warm-up Road (v1.7) is the same kind of box, but not solid: the scene makes it a stumble.
import Phaser from 'phaser';
import { keyUnder } from '../art/look/bake';
import type { ObstacleDef } from '../level/level';
import { obstacleBox, type Box, type Terrain } from '../level/terrain';

export class Obstacle {
  readonly box: Box;
  readonly type: ObstacleDef['type'];
  /** true = touching it crashes the bike */
  readonly solid: boolean;
  constructor(scene: Phaser.Scene, def: ObstacleDef, terrain: Terrain, depth: number) {
    this.box = obstacleBox(def, terrain);
    this.type = def.type;
    this.solid = def.type !== 'log';
    // The art is centred on the box (the log's is a little wider than its box) and stands on the ground.
    keyUnder(scene, scene.add.image(this.box.x + this.box.w / 2, this.box.y + this.box.h, def.type).setOrigin(0.5, 1).setDepth(depth));
  }
}
