// Finish screen: a yellow pixel frame over the stopped game. This run next to the best, the medal
// earned and the next target, three stars, and the way out: RIDE AGAIN (Enter or R), CHANGE BIKE or MAIN MENU.
// Medal targets and bests are the ridden bike's own.
import Phaser from 'phaser';
import { PAL } from '../art/palette';
import { tickMusic } from '../audio/music';
import { onKeyPress } from '../input';
import { DIYAS } from '../level/levelData';
import { BIKES, type BikeId } from '../bike/bikes';
import type { Medal } from '../progress';
import { Menu } from '../ui/Menu';
import { formatTime, pixelFrame, pixelText } from '../ui/text';
import type { GameScene } from './Game';

export interface FinishData {
  timeMs: number;
  diyas: number;
  crashes: number;
  flips: number;
  /** the bike the run was ridden on (medal targets and bests are per bike) */
  bike: BikeId;
  /** false for a practice run (started from a checkpoint): no medal, nothing saved */
  ranked: boolean;
  medal: Medal | null;
  next: { medal: Medal; timeMs: number } | null;
  /** the bests before this run (null = there was none) */
  prevBest: { timeMs: number | null; diyas: number | null; flips: number | null };
  newTime: boolean;
  newDiyas: boolean;
  newFlips: boolean;
  /** whether the bests reached storage (the screen is the same either way) */
  saved: boolean;
}

const MEDAL_NAME: Record<Medal, string> = { gold: 'GOLD', silver: 'SILVER', bronze: 'BRONZE' };

export class FinishScene extends Phaser.Scene {
  menu!: Menu;
  private blink: Phaser.GameObjects.Text[] = [];
  private t = 0;

  constructor() {
    super('Finish');
  }

  create(data: FinishData): void {
    this.t = 0;
    this.blink = [];
    const total = DIYAS.length;
    this.add.rectangle(0, 0, 480, 270, PAL.ink, 0.45).setOrigin(0, 0);
    const x = 60, y = 18, w = 360, h = 236;
    pixelFrame(this.add.graphics(), x, y, w, h);

    pixelText(this, 240, y + 12, 'STAGE CLEAR', PAL.uiYellow, 16).setOrigin(0.5, 0);

    // Medal line.
    const my = y + 40;
    const bikeName = BIKES[data.bike].name;
    if (!data.ranked) {
      pixelText(this, 240, my, 'PRACTICE RUN - NO MEDAL', PAL.graniteLight).setOrigin(0.5, 0);
    } else if (data.medal) {
      // The medal itself hangs on either side of the heading.
      for (const mx of [x + 44, x + w - 44]) this.add.image(mx, y + 32, `medal_${data.medal}`).setScale(2);
      pixelText(this, 240, my, `${bikeName} - ${MEDAL_NAME[data.medal]} MEDAL`, PAL.uiYellow).setOrigin(0.5, 0);
    } else {
      pixelText(this, 240, my, `${bikeName} - NO MEDAL YET`, PAL.graniteLight).setOrigin(0.5, 0);
    }

    // This run next to the best before it. A beaten best blinks "NEW BEST!".
    const colRun = x + 212, colBest = x + w - 24;
    const hy = y + 60;
    pixelText(this, colRun, hy, 'RUN', PAL.graniteLight).setOrigin(1, 0);
    pixelText(this, colBest, hy, 'BEST', PAL.graniteLight).setOrigin(1, 0);
    const best = data.prevBest;
    const rows: Array<[string, string, string | null, boolean]> = [
      ['TIME', formatTime(data.timeMs), best.timeMs === null ? null : formatTime(best.timeMs), data.newTime],
      ['DIYAS', `${data.diyas}/${total}`, best.diyas === null ? null : `${best.diyas}/${total}`, data.newDiyas],
      ['FLIPS', String(data.flips), best.flips === null ? null : String(best.flips), data.newFlips],
      ['CRASHES', String(data.crashes), '', false],
    ];
    rows.forEach(([label, value, bestText, isNew], i) => {
      const ry = hy + 13 + i * 13;
      pixelText(this, x + 24, ry, label, PAL.cream);
      pixelText(this, colRun, ry, value, PAL.uiYellow).setOrigin(1, 0);
      if (!data.ranked) {
        if (bestText) pixelText(this, colBest, ry, bestText, PAL.graniteLight).setOrigin(1, 0);
      } else if (isNew) {
        this.blink.push(pixelText(this, colBest, ry, 'NEW BEST!', PAL.uiYellow).setOrigin(1, 0));
      } else if (bestText) {
        pixelText(this, colBest, ry, bestText, PAL.cream).setOrigin(1, 0);
      }
    });

    // Next target.
    const ny = hy + 13 + rows.length * 13 + 4;
    let nextLine = '';
    if (data.ranked) {
      nextLine = data.next
        ? `NEXT: ${MEDAL_NAME[data.next.medal]} UNDER ${formatTime(data.next.timeMs)}`
        : best.timeMs !== null && !data.newTime ? `GOLD! BEAT YOUR ${formatTime(best.timeMs)}` : 'GOLD! NOW BEAT YOUR GHOST';
    }
    if (nextLine) pixelText(this, 240, ny, nextLine, PAL.cream).setOrigin(0.5, 0);

    // Star 1: finished. Star 2: every diya. Star 3: no crashes.
    const earned = [true, data.diyas >= total, data.crashes === 0];
    const labels = ['FINISH', 'DIYAS', 'CLEAN'];
    earned.forEach((on, i) => {
      const sx = 240 + (i - 1) * 72;
      this.add.image(sx, y + 162, on ? 'star_on' : 'star_off').setScale(2);
      pixelText(this, sx, y + 178, labels[i]!, on ? PAL.uiYellow : PAL.graniteLight).setOrigin(0.5, 0);
    });

    // RIDE AGAIN is selected, so Enter still rides again at once. R is handled by the Game scene
    // (it restarts the run from any state).
    const game = this.scene.get('Game') as GameScene;
    this.menu = new Menu(this, [
      { label: 'RIDE AGAIN', x: 240 - 112, y: y + 200, hitW: 104, action: () => game.restartRun() },
      { label: 'CHANGE BIKE', x: 240, y: y + 200, hitW: 112, action: () => game.toSelect() },
      { label: 'MAIN MENU', x: 240 + 112, y: y + 200, hitW: 96, action: () => game.toTitle() },
    ]);
    pixelText(this, 240, y + 216, 'LEFT/RIGHT + ENTER  R AGAIN', PAL.graniteLight).setOrigin(0.5, 0);
    for (const key of ['LEFT', 'UP']) onKeyPress(this, key, () => this.menu.move(-1));
    for (const key of ['RIGHT', 'DOWN']) onKeyPress(this, key, () => this.menu.move(1));
    onKeyPress(this, 'ENTER', () => this.menu.activate());
  }

  override update(_time: number, delta: number): void {
    this.t += Math.min(delta / 1000, 0.1);
    const show = Math.floor(this.t * 4) % 4 !== 3;
    for (const b of this.blink) b.setVisible(show);
    tickMusic();
  }
}
