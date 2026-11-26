// Short floating world-space text ("CLEAN!", "CHECKPOINT", "+1"). Animated by frame time, no tweens,
// so it behaves the same under manual stepping.
import type Phaser from 'phaser';
import { PAL } from '../art/palette';
import { VIEW_W } from '../level/level';
import { pixelText } from './text';

interface Popup {
  key?: string;
  text: Phaser.GameObjects.Text;
  y: number;
  age: number;
  life: number;
  /** pinned popups keep their place on the screen: this is their x from the left screen edge */
  screenX: number | null;
}

/** A pinned popup is never closer than this to the left or right screen edge. */
const EDGE = 6;

export class Popups {
  private items: Popup[] = [];
  constructor(private scene: Phaser.Scene, private depth: number) {}

  /**
   * A popup with a key replaces any live popup with the same key (so repeated honks don't pile up).
   * pin = keep its place on the screen instead of in the world, wholly inside the screen: for text that
   * must stay readable while the camera moves on (v1.9: "CHECKPOINT" used to slide off the left edge).
   */
  show(text: string, x: number, y: number, colour: number = PAL.uiYellow, life = 0.9, key?: string, pin = false): void {
    if (key !== undefined) {
      this.items = this.items.filter((p) => {
        if (p.key !== key) return true;
        p.text.destroy();
        return false;
      });
    }
    const t = pixelText(this.scene, Math.round(x), Math.round(y), text, colour).setOrigin(0.5, 1).setDepth(this.depth);
    let screenX: number | null = null;
    if (pin) {
      const half = Math.ceil(t.width / 2) + EDGE;
      screenX = Math.min(VIEW_W - half, Math.max(half, Math.round(x - this.scene.cameras.main.scrollX)));
      t.x = this.scene.cameras.main.scrollX + screenX;
    }
    this.items.push({ key, text: t, y, age: 0, life, screenX });
  }

  /** scrollX = the camera's scroll this frame (pinned popups follow it). */
  update(dt: number, scrollX = 0): void {
    for (const p of this.items) {
      p.age += dt;
      const k = p.age / p.life;
      if (p.screenX !== null) p.text.x = scrollX + p.screenX;
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
