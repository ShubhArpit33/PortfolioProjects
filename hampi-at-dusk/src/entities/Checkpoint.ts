// Deepastambha (stone lamp pillar). Lights up with a glow once the bike's x reaches it.
import Phaser from 'phaser';
import { checkpointX, type Checkpoint as CheckpointDef } from '../level/levelData';
import { TERRAIN } from '../level/terrain';

export class Checkpoint {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly hint: string | undefined;
  lit = false;
  private sprite: Phaser.GameObjects.Sprite;
  private glows: Phaser.GameObjects.Image[];

  constructor(scene: Phaser.Scene, def: CheckpointDef, depth: number) {
    this.id = def.id;
    this.hint = def.hint;
    this.x = checkpointX(def);
    this.y = TERRAIN.surfaceY(this.x) ?? 222;
    this.glows = [
      scene.add.image(this.x, this.y - 46, 'glow'),
      scene.add.image(this.x, this.y - 26, 'glow').setScale(1, 1.5),
    ];
    for (const g of this.glows) g.setDepth(depth).setVisible(false);
    this.sprite = scene.add.sprite(this.x, this.y, 'deepastambha', 0).setOrigin(0.5, 1).setDepth(depth + 0.1);
  }

  setLit(lit: boolean): void {
    this.lit = lit;
    this.sprite.setFrame(lit ? 1 : 0);
    for (const g of this.glows) g.setVisible(lit);
  }

  render(t: number): void {
    if (!this.lit) return;
    const a = 0.8 + 0.2 * Math.sin(t * 9 + this.id);
    this.glows[0]!.setAlpha(a);
    this.glows[1]!.setAlpha(a * 0.6);
  }
}
