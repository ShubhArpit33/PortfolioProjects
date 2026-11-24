// Finish screen: a yellow pixel frame over the stopped game with time, diyas, crashes and three stars.
import Phaser from 'phaser';
import { PAL } from '../art/palette';
import { onKeyPress } from '../input';
import { DIYAS } from '../level/levelData';
import { formatTime, pixelFrame, pixelText } from '../ui/text';

export interface FinishData {
  timeMs: number;
  diyas: number;
  crashes: number;
}

export class FinishScene extends Phaser.Scene {
  private again!: Phaser.GameObjects.Text;
  private t = 0;

  constructor() {
    super('Finish');
  }

  create(data: FinishData): void {
    this.t = 0;
    const total = DIYAS.length;
    this.add.rectangle(0, 0, 480, 270, PAL.ink, 0.45).setOrigin(0, 0);
    const x = 112, y = 50, w = 256, h = 170;
    pixelFrame(this.add.graphics(), x, y, w, h);

    pixelText(this, 240, y + 14, 'STAGE CLEAR', PAL.uiYellow, 16).setOrigin(0.5, 0);
    const rows: Array<[string, string]> = [
      ['TIME', formatTime(data.timeMs)],
      ['DIYAS', `${data.diyas}/${total}`],
      ['CRASHES', String(data.crashes)],
    ];
    rows.forEach(([label, value], i) => {
      const ry = y + 46 + i * 14;
      pixelText(this, x + 40, ry, label, PAL.cream);
      pixelText(this, x + w - 40, ry, value, PAL.uiYellow).setOrigin(1, 0);
    });

    // Star 1: finished. Star 2: every diya. Star 3: no crashes.
    const earned = [true, data.diyas >= total, data.crashes === 0];
    const labels = ['FINISH', 'DIYAS', 'CLEAN'];
    earned.forEach((on, i) => {
      const sx = 240 + (i - 1) * 64;
      this.add.image(sx, y + 106, on ? 'star_on' : 'star_off').setScale(2);
      pixelText(this, sx, y + 122, labels[i]!, on ? PAL.uiYellow : PAL.graniteLight).setOrigin(0.5, 0);
    });

    this.again = pixelText(this, 240, y + h - 22, 'ENTER - RIDE AGAIN', PAL.uiYellow).setOrigin(0.5, 0);
    onKeyPress(this, 'ENTER', () => this.scene.start('Game', { cp: 0 }));
  }

  override update(_time: number, delta: number): void {
    this.t += Math.min(delta / 1000, 0.1);
    this.again.setVisible(Math.floor(this.t * 2.5) % 2 === 0);
  }
}
