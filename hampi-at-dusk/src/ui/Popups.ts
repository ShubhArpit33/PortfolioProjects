// Short floating world-space text ("CLEAN!", "CHECKPOINT", "+1"). Animated by frame time, no tweens,
// so it behaves the same under manual stepping.
import type Phaser from 'phaser';
import { PAL } from '../art/palette';
import { pixelText } from './text';

interface Popup {
  text: Phaser.GameObjects.Text;
  y: number;
  age: number;
  life: number;
}

export class Popups {
  private items: Popup[] = [];
  constructor(private scene: Phaser.Scene, private depth: number) {}

  show(text: string, x: number, y: number, colour: number = PAL.uiYellow, life = 0.9): void {
    const t = pixelText(this.scene, Math.round(x), Math.round(y), text, colour).setOrigin(0.5, 1).setDepth(this.depth);
    this.items.push({ text: t, y, age: 0, life });
  }

  update(dt: number): void {
    for (const p of this.items) {
      p.age += dt;
      const k = p.age / p.life;
      p.text.y = Math.round(p.y - 22 * (1 - (1 - Math.min(1, k)) ** 2));
      p.text.setAlpha(k < 0.65 ? 1 : Math.max(0, 1 - (k - 0.65) / 0.35));
    }
    this.items = this.items.filter((p) => {
      if (p.age < p.life) return true;
      p.text.destroy();
      return false;
    });
  }
}
