// Journey finish (v1.9): after the last stage, a yellow pixel frame over the stopped game. Each stage's
// time, medal and collectibles, the total time, and the bike's best journey time (a beaten one blinks
// "NEW BEST!"). Ways out: NEW JOURNEY (pick a bike again), STAGES, MAIN MENU. It is a menu: the music plays.
import Phaser from 'phaser';
import { PAL } from '../art/palette';
import { setMusicInRun, tickMusic } from '../audio/music';
import { BIKES } from '../bike/bikes';
import { onKeyPress } from '../input';
import { MAX_HELMETS, type Journey } from '../journey';
import type { JourneyFinishInfo } from '../journeyRun';
import { stageDef } from '../stages';
import { Menu } from '../ui/Menu';
import { formatTime, pixelFrame, pixelText } from '../ui/text';
import type { GameScene } from './Game';

export interface JourneyFinishData {
  journey: Journey;
  finish: JourneyFinishInfo;
}

export class JourneyFinishScene extends Phaser.Scene {
  menu!: Menu;
  /** what the screen was opened with (for tests) */
  shown: JourneyFinishData | null = null;
  private blink: Phaser.GameObjects.Text[] = [];
  private t = 0;

  constructor() {
    super('JourneyFinish');
  }

  create(data: JourneyFinishData): void {
    setMusicInRun(false); // the journey finish is a menu: it has the music
    this.t = 0;
    this.blink = [];
    this.shown = data;
    const { journey, finish } = data;
    const game = this.scene.get('Game') as GameScene;
    const bike = BIKES[journey.bike].name;

    this.add.rectangle(0, 0, 480, 270, PAL.ink, 0.5).setOrigin(0, 0);
    // The frame is as tall as the journey is long (one row per stage), centred on the screen.
    const n = journey.results.length;
    const x = 44, w = 392, h = 188 + Math.max(1, n) * 16;
    const y = Math.max(4, Math.round((270 - h) / 2));
    const g = this.add.graphics();
    pixelFrame(g, x, y, w, h);

    pixelText(this, 240, y + 12, 'JOURNEY COMPLETE', PAL.uiYellow, 16).setOrigin(0.5, 0);
    pixelText(this, 240, y + 36, `${bike} - ${n} ${n === 1 ? 'STAGE' : 'STAGES'}`, PAL.cream).setOrigin(0.5, 0);

    // One row per stage: its name, its time, the medal that time earns, its collectibles.
    const colName = x + 22, colTime = x + 256, colMedal = x + 272, colGot = x + w - 22;
    const hy = y + 56;
    pixelText(this, colName, hy, 'STAGE', PAL.graniteLight);
    pixelText(this, colTime, hy, 'TIME', PAL.graniteLight).setOrigin(1, 0);
    pixelText(this, colGot, hy, 'FOUND', PAL.graniteLight).setOrigin(1, 0);
    journey.results.forEach((r, i) => {
      const stage = stageDef(r.stage);
      const ry = hy + 14 + i * 16;
      pixelText(this, colName, ry, `${i + 1} ${stage.name}`, PAL.cream);
      pixelText(this, colTime, ry, formatTime(r.timeMs), PAL.uiYellow).setOrigin(1, 0);
      if (r.medal) this.add.image(colMedal, ry + 3, `medal_${r.medal}`);
      const got = `${r.collected}/${r.total}`;
      pixelText(this, colGot, ry, got, r.collected >= r.total ? PAL.uiYellow : PAL.cream).setOrigin(1, 0);
      this.add.image(colGot - got.length * 8 - 7, ry + 3, stage.collectible.texture);
    });

    // Total, and the bike's best journey before this one.
    const ty = hy + 14 + Math.max(1, n) * 16 + 6;
    g.fillStyle(PAL.uiYellow, 1).fillRect(x + 20, ty - 5, w - 40, 1);
    pixelText(this, colName, ty + 2, 'TOTAL TIME', PAL.cream);
    pixelText(this, colTime, ty + 2, formatTime(finish.totalMs), PAL.uiYellow).setOrigin(1, 0);
    const by = ty + 18;
    pixelText(this, colName, by, `${bike} BEST`, PAL.cream);
    if (finish.prevBestMs !== null) {
      pixelText(this, colTime, by, formatTime(finish.prevBestMs), finish.newBest ? PAL.graniteLight : PAL.uiYellow).setOrigin(1, 0);
    } else {
      pixelText(this, colTime, by, '--:--.--', PAL.graniteLight).setOrigin(1, 0);
    }
    if (finish.newBest) this.blink.push(pixelText(this, colGot, by, 'NEW BEST!', PAL.uiYellow).setOrigin(1, 0));

    // How it went: the helmets still in hand, and how often they ran out.
    const sy = by + 22;
    pixelText(this, colName, sy, 'HELMETS LEFT', PAL.cream);
    for (let i = 0; i < MAX_HELMETS; i++) {
      this.add.image(colName + 112 + i * 19, sy + 3, i < journey.helmets ? 'helmet_on' : 'helmet_off');
    }
    pixelText(this, colGot, sy, `GAME OVERS ${journey.gameOvers}`, journey.gameOvers === 0 ? PAL.uiYellow : PAL.cream).setOrigin(1, 0);

    this.menu = new Menu(this, [
      { label: 'NEW JOURNEY', x: 240 - 108, y: y + h - 38, hitW: 112, action: () => game.toNewJourney() },
      { label: 'STAGES', x: 240 + 8, y: y + h - 38, hitW: 80, action: () => game.toStages() },
      { label: 'MAIN MENU', x: 240 + 116, y: y + h - 38, hitW: 96, action: () => game.toTitle() },
    ]);
    pixelText(this, 240, y + h - 22, 'LEFT/RIGHT + ENTER', PAL.graniteLight).setOrigin(0.5, 0);
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
