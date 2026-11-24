// A small pixel menu: a row or column of text options. The selected one is yellow between "> <"
// markers. The scene feeds it key presses (move / activate); each option is also a click / tap target.
// Everything it creates belongs to the scene, so it goes away with the scene (no listeners outlive it).
import type Phaser from 'phaser';
import { PAL, css } from '../art/palette';
import { pixelText } from './text';

export interface MenuItem {
  label: string;
  x: number;
  y: number;
  action: () => void;
}

export class Menu {
  index = 0;
  private visible = true;
  private readonly texts: Phaser.GameObjects.Text[];
  private readonly zones: Phaser.GameObjects.Zone[];

  constructor(scene: Phaser.Scene, private readonly items: MenuItem[], depth = 0) {
    this.texts = items.map((it) => pixelText(scene, it.x, it.y, it.label, PAL.cream).setOrigin(0.5, 0).setDepth(depth));
    this.zones = items.map((it, i) => {
      // The target is wider and taller than the text (easy to tap), and does not move with the markers.
      const zone = scene.add.zone(it.x, it.y + 4, (it.label.length + 6) * 8, 14).setDepth(depth)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this.select(i));
      zone.on('pointerdown', () => { this.select(i); this.activate(); });
      return zone;
    });
    this.draw();
  }

  get length(): number {
    return this.items.length;
  }

  get shown(): boolean {
    return this.visible;
  }

  select(i: number): void {
    if (!this.visible) return;
    this.index = ((i % this.items.length) + this.items.length) % this.items.length;
    this.draw();
  }

  move(by: number): void {
    this.select(this.index + by);
  }

  activate(): void {
    if (this.visible) this.items[this.index]!.action();
  }

  /** Hidden menus take no input (keys or pointer). */
  setVisible(on: boolean): void {
    this.visible = on;
    for (const t of this.texts) t.setVisible(on);
    for (const z of this.zones) {
      if (on) z.setInteractive({ useHandCursor: true });
      else z.disableInteractive();
    }
  }

  /** Screen rectangle of an option's click target (for tests). */
  hitRect(i: number): { x: number; y: number; w: number; h: number } {
    const z = this.zones[i]!;
    return { x: z.x - z.width / 2, y: z.y - z.height / 2, w: z.width, h: z.height };
  }

  private draw(): void {
    this.texts.forEach((t, i) => {
      const on = i === this.index;
      const label = on ? `> ${this.items[i]!.label} <` : this.items[i]!.label;
      if (t.text !== label) t.setText(label);
      t.setColor(css(on ? PAL.uiYellow : PAL.cream));
    });
  }
}
