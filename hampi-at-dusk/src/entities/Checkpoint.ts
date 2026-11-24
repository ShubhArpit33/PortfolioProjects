// Deepastambha (stone lamp pillar). Lights up with a glow once the bike's x reaches it.
import Phaser from 'phaser';
import { checkpointX, type Checkpoint as CheckpointDef } from '../level/levelData';
import { TERRAIN } from '../level/terrain';

const LAMP_OFFSET_X = 26;

export class Checkpoint {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** where the lamp is drawn */
  readonly lampX: number;
  readonly hint: string | undefined;
  lit = false;
  private sprite: Phaser.GameObjects.Sprite;
  private glows: Phaser.GameObjects.Image[];

  constructor(scene: Phaser.Scene, def: CheckpointDef, depth: number) {
    this.id = def.id;
    this.hint = def.hint;
    this.x = checkpointX(def);
    this.y = TERRAIN.surfaceY(this.x) ?? 222;
    // The lamp stands just behind the activation / respawn x so a respawned bike doesn't cover it.
    const lampX = this.x - LAMP_OFFSET_X;
    this.lampX = lampX;
    this.glows = [
      scene.add.image(lampX, this.y - 46, 'glow'),
      scene.add.image(lampX, this.y - 26, 'glow').setScale(1, 1.5),
    ];
    for (const g of this.glows) g.setDepth(depth).setVisible(false);
    this.sprite = scene.add.sprite(lampX, this.y, 'deepastambha', 0).setOrigin(0.5, 1).setDepth(depth + 0.1);
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
