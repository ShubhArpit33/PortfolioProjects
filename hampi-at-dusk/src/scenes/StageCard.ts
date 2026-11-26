// Stage card (v1.9): between two stages of a journey, a yellow pixel frame over the stopped game. The
// stage just cleared (time, medal, collectibles), the next stage's number and name, the helmets going
// on with it, and the journey's time so far. Enter rides on. It is a menu: the music plays.
import Phaser from 'phaser';
import { PAL } from '../art/palette';
import { setMusicInRun, tickMusic } from '../audio/music';
import { onKeyPress } from '../input';
import { MAX_HELMETS, currentStage, totalTimeMs, type Journey, type StageResult } from '../journey';
import { stageDef } from '../stages';
import { Menu } from '../ui/Menu';
import { formatTime, pixelFrame, pixelText } from '../ui/text';
import type { GameScene } from './Game';

export interface StageCardData {
  /** the journey after the stage was cleared: it is at the next stage, with the helmet for it already given */
  journey: Journey;
  cleared: StageResult;
}

/** What the card shows (for tests). */
export interface StageCardInfo {
  cleared: string;
  next: string;
  nextNumber: number;
  helmets: number;
  gained: number;
  totalMs: number;
}

export class StageCardScene extends Phaser.Scene {
  menu!: Menu;
  info: StageCardInfo | null = null;
  private blink: Phaser.GameObjects.Text | null = null;
  private t = 0;

  constructor() {
    super('StageCard');
  }

  create(data: StageCardData): void {
    setMusicInRun(false); // the stage card is a menu: it has the music
    this.t = 0;
    const game = this.scene.get('Game') as GameScene;
    const { journey, cleared } = data;
    const done = stageDef(cleared.stage);
    const next = stageDef(currentStage(journey));
    // The game still holds the helmets the stage ended with; the journey already has the one for the next stage.
    const gained = Math.max(0, journey.helmets - game.helmets);
    this.info = {
      cleared: done.id, next: next.id, nextNumber: journey.index + 1, helmets: journey.helmets, gained,
      totalMs: totalTimeMs(journey),
    };

    this.add.rectangle(0, 0, 480, 270, PAL.ink, 0.5).setOrigin(0, 0);
    const x = 60, y = 22, w = 360, h = 226;
    const g = this.add.graphics();
    pixelFrame(g, x, y, w, h);

    // The stage behind us.
    pixelText(this, 240, y + 12, 'STAGE CLEAR', PAL.uiYellow, 16).setOrigin(0.5, 0);
    pixelText(this, 240, y + 38, done.name, PAL.cream).setOrigin(0.5, 0);
    const line = `TIME ${formatTime(cleared.timeMs)}   ${done.collectible.label} ${cleared.collected}/${cleared.total}`;
    const lx = cleared.medal ? 247 : 240;
    pixelText(this, lx, y + 52, line, PAL.uiYellow).setOrigin(0.5, 0);
    if (cleared.medal) this.add.image(lx - (line.length * 8) / 2 - 10, y + 56, `medal_${cleared.medal}`);

    g.fillStyle(PAL.uiYellow, 1).fillRect(x + 20, y + 72, w - 40, 1);

    // The stage ahead.
    pixelText(this, 240, y + 84, `NEXT: STAGE ${journey.index + 1} OF ${journey.route.length}`, PAL.graniteLight).setOrigin(0.5, 0);
    pixelText(this, 240, y + 100, next.name, PAL.uiYellow, 16).setOrigin(0.5, 0);

    // Helmets going on with us: one back for the new stage, up to 5.
    const hy = y + 136;
    for (let i = 0; i < MAX_HELMETS; i++) {
      this.add.image(240 + (i - (MAX_HELMETS - 1) / 2) * 22, hy - 1, i < journey.helmets ? 'helmet_on' : 'helmet_off');
    }
    this.blink = pixelText(this, 240, hy + 12, gained > 0 ? `+${gained} HELMET FOR THE NEW STAGE` : 'HELMETS FULL', gained > 0 ? PAL.uiYellow : PAL.graniteLight)
      .setOrigin(0.5, 0);
    pixelText(this, 240, y + 168, `JOURNEY TIME ${formatTime(totalTimeMs(journey))}`, PAL.cream).setOrigin(0.5, 0);

    this.menu = new Menu(this, [{ label: 'RIDE ON', x: 240, y: y + 190, action: () => game.nextStage() }]);
    pixelText(this, 240, y + 206, 'ENTER', PAL.graniteLight).setOrigin(0.5, 0);
    onKeyPress(this, 'ENTER', () => this.menu.activate());
  }

  override update(_time: number, delta: number): void {
    this.t += Math.min(delta / 1000, 0.1);
    if (this.blink && this.info && this.info.gained > 0) this.blink.setVisible(Math.floor(this.t * 4) % 4 !== 3);
    tickMusic();
  }
}
