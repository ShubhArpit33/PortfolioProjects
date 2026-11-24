// HUD: a separate UI scene that never scrolls. Timer, diyas, boost bar, crash count, the cp4 hint,
// the mute tag and the pause overlay.
import Phaser from 'phaser';
import { PAL, mix } from '../art/palette';
import { soundLabel } from '../audio/sfx';
import { DIYAS } from '../level/levelData';
import { formatTime, pixelText } from '../ui/text';
import type { GameScene } from './Game';

const BAR = { x: 412, y: 6, w: 62, h: 9 };

export class HudScene extends Phaser.Scene {
  private timer!: Phaser.GameObjects.Text;
  private diyas!: Phaser.GameObjects.Text;
  private crashes!: Phaser.GameObjects.Text;
  private flips!: Phaser.GameObjects.Text;
  private best!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private mute!: Phaser.GameObjects.Text;
  private bar!: Phaser.GameObjects.Graphics;
  private pause!: Phaser.GameObjects.Container;
  private last = { time: '', diyas: -1, crashes: -1, flips: 0, boost: -1, boosting: false };

  constructor() {
    super('Hud');
  }

  create(): void {
    this.last = { time: '', diyas: -1, crashes: -1, flips: 0, boost: -1, boosting: false };
    this.timer = pixelText(this, 6, 6, '00:00.00', PAL.cream);
    this.add.image(6, 18, 'diya').setOrigin(0, 0);
    this.diyas = pixelText(this, 18, 18, `0/${DIYAS.length}`, PAL.uiYellow);
    pixelText(this, BAR.x - 4, 6, 'BOOST', PAL.uiYellow).setOrigin(1, 0);
    this.bar = this.add.graphics();
    this.crashes = pixelText(this, 474, 18, 'CRASHES 0', PAL.cream).setOrigin(1, 0);
    this.best = pixelText(this, 6, 30, '', PAL.graniteLight).setVisible(false);
    this.flips = pixelText(this, 474, 30, '', PAL.uiYellow).setOrigin(1, 0).setVisible(false);
    this.hint = pixelText(this, 240, 52, '', PAL.uiYellow).setOrigin(0.5, 0).setVisible(false);
    this.mute = pixelText(this, 474, 256, '', PAL.cream).setOrigin(1, 0).setVisible(false);

    const dim = this.add.rectangle(0, 0, 480, 270, PAL.ink, 0.6).setOrigin(0, 0);
    const title = pixelText(this, 240, 118, 'PAUSED', PAL.uiYellow, 16).setOrigin(0.5, 0);
    const sub = pixelText(this, 240, 144, 'P / ESC - RESUME', PAL.cream).setOrigin(0.5, 0);
    this.pause = this.add.container(0, 0, [dim, title, sub]).setVisible(false);
  }

  override update(): void {
    const game = this.scene.get('Game') as GameScene;
    if (!game.bike) return;
    // The time to beat (the best before this run; it does not change under the finish screen).
    if (!this.best.visible && !game.finished && game.bestTimeMs !== null) {
      this.best.setText(`BEST ${formatTime(game.bestTimeMs)}`).setVisible(true);
    }
    const l = this.last;

    const time = formatTime(game.timeMs);
    if (time !== l.time) { l.time = time; this.timer.setText(time); }
    if (game.diyaCount !== l.diyas) { l.diyas = game.diyaCount; this.diyas.setText(`${game.diyaCount}/${DIYAS.length}`); }
    if (game.crashes !== l.crashes) { l.crashes = game.crashes; this.crashes.setText(`CRASHES ${game.crashes}`); }

    if (game.flips !== l.flips) { l.flips = game.flips; this.flips.setText(`FLIPS ${game.flips}`).setVisible(game.flips > 0); }

    const fill = Math.round(game.bike.boost * (BAR.w - 4));
    if (fill !== l.boost || game.boosting !== l.boosting) {
      l.boost = fill;
      l.boosting = game.boosting;
      const g = this.bar;
      g.clear();
      g.fillStyle(PAL.ink, 1).fillRect(BAR.x - 1, BAR.y - 1, BAR.w + 2, BAR.h + 2);
      g.fillStyle(PAL.uiYellow, 1).fillRect(BAR.x, BAR.y, BAR.w, BAR.h);
      g.fillStyle(PAL.ink, 1).fillRect(BAR.x + 1, BAR.y + 1, BAR.w - 2, BAR.h - 2);
      g.fillStyle(game.boosting ? PAL.cream : PAL.glint, 1).fillRect(BAR.x + 2, BAR.y + 2, fill, BAR.h - 4);
      g.fillStyle(game.boosting ? PAL.uiYellow : mix(PAL.glint, PAL.ink, 0.35), 1).fillRect(BAR.x + 2, BAR.y + BAR.h - 4, fill, 2);
    }

    const showHint = game.hintT > 0 && !game.finished;
    this.hint.setVisible(showHint && Math.floor(game.hintT * 4) % 4 !== 0);
    if (showHint && this.hint.text !== game.hintText) this.hint.setText(game.hintText);

    const tag = soundLabel();
    if (tag !== this.mute.text) this.mute.setText(tag);
    this.mute.setVisible(tag !== '');
    this.pause.setVisible(game.paused);
  }
}
