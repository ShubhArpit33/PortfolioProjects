// Pixel text helper: Press Start 2P at multiples of 8 px with a hard 1 px ink shadow. ASCII only.
import type Phaser from 'phaser';
import { PAL, css } from '../art/palette';

export const FONT = '"Press Start 2P"';

export function pixelText(
  scene: Phaser.Scene, x: number, y: number, text: string, colour: number = PAL.uiYellow, size = 8,
): Phaser.GameObjects.Text {
  const shadow = size >= 16 ? 2 : 1;
  return scene.add.text(x, y, text, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color: css(colour),
    padding: { x: 0, y: 0, right: shadow, bottom: shadow },
  }).setShadow(shadow, shadow, css(PAL.ink), 0, false, true);
}

/** mm:ss.cc */
export function formatTime(ms: number): string {
  const cs = Math.floor(ms / 10);
  const mm = Math.floor(cs / 6000);
  const ss = Math.floor(cs / 100) % 60;
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(mm)}:${p(ss)}.${p(cs % 100)}`;
}

/** Yellow pixel frame: 2 px UI-yellow border, 4 px notched corners, UI-ink fill. */
export function pixelFrame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  g.fillStyle(PAL.uiYellow, 1);
  g.fillRect(x + 4, y, w - 8, h);
  g.fillRect(x, y + 4, w, h - 8);
  g.fillStyle(PAL.ink, 1);
  g.fillRect(x + 6, y + 2, w - 12, h - 4);
  g.fillRect(x + 2, y + 6, w - 4, h - 12);
}
