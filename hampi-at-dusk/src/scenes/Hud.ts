// HUD: a separate UI scene that never scrolls. Timer, diyas, boost bar, crash count, the cp4 hint,
// the mute tag, the bike's name, the pause button and the pause menu (RESUME / RESTART / CHANGE BIKE / MAIN MENU).
import Phaser from 'phaser';
import { PAL, mix } from '../art/palette';
import { soundLabel } from '../audio/sfx';
import { DIYAS } from '../level/levelData';
import { onKeyPress } from '../input';
import { Menu } from '../ui/Menu';
import { formatTime, pixelFrame, pixelText } from '../ui/text';
import type { GameScene } from './Game';

const BAR = { x: 412, y: 6, w: 62, h: 9 };
/** Pause button: top centre, clear of the timer (left) and BOOST / CRASHES (right). */
const PAUSE_BTN = { x: 240, y: 11, w: 15, h: 11, hitW: 30, hitH: 22 };
const PANEL = { x: 128, y: 68, w: 224, h: 134 };

export class HudScene extends Phaser.Scene {
  private timer!: Phaser.GameObjects.Text;
  private diyas!: Phaser.GameObjects.Text;
  private crashes!: Phaser.GameObjects.Text;
  private flips!: Phaser.GameObjects.Text;
  private best!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private mute!: Phaser.GameObjects.Text;
  private bikeName!: Phaser.GameObjects.Text;
  private bar!: Phaser.GameObjects.Graphics;
  private pause!: Phaser.GameObjects.Container;
  private pauseBtn!: Phaser.GameObjects.Graphics;
  private pauseZone!: Phaser.GameObjects.Zone;
  menu!: Menu;
  private wasPaused = false;
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

    const game = this.scene.get('Game') as GameScene;
    // Which bike this is: small, bottom left, out of the way of the road.
    this.bikeName = pixelText(this, 6, 256, game.bikeDef.name, PAL.graniteLight);

    // Pause button (click / tap): a small framed "II".
    const b = PAUSE_BTN;
    const g = this.pauseBtn = this.add.graphics();
    const bx = b.x - Math.floor(b.w / 2), by = b.y - Math.floor(b.h / 2);
    g.fillStyle(PAL.ink, 1).fillRect(bx - 1, by - 1, b.w + 2, b.h + 2);
    g.fillStyle(PAL.uiYellow, 1).fillRect(bx, by, b.w, b.h);
    g.fillStyle(PAL.ink, 1).fillRect(bx + 1, by + 1, b.w - 2, b.h - 2);
    g.fillStyle(PAL.uiYellow, 1).fillRect(bx + 4, by + 3, 2, b.h - 6).fillRect(bx + b.w - 6, by + 3, 2, b.h - 6);
    this.pauseZone = this.add.zone(b.x, b.y, b.hitW, b.hitH).setInteractive({ useHandCursor: true });
    this.pauseZone.on('pointerdown', () => game.setPaused(true));

    // Pause menu: the same yellow pixel frame as the finish screen, over a dimmed game.
    const p = PANEL;
    const dim = this.add.rectangle(0, 0, 480, 270, PAL.ink, 0.6).setOrigin(0, 0);
    const frame = this.add.graphics();
    pixelFrame(frame, p.x, p.y, p.w, p.h);
    const title = pixelText(this, 240, p.y + 12, 'PAUSED', PAL.uiYellow, 16).setOrigin(0.5, 0);
    const sub = pixelText(this, 240, p.y + p.h - 18, 'UP/DOWN + ENTER  ESC BACK', PAL.graniteLight).setOrigin(0.5, 0);
    this.pause = this.add.container(0, 0, [dim, frame, title, sub]).setVisible(false);
    this.menu = new Menu(this, [
      { label: 'RESUME', x: 240, y: p.y + 42, action: () => game.setPaused(false) },
      { label: 'RESTART', x: 240, y: p.y + 58, action: () => game.restartRun() },
      { label: 'CHANGE BIKE', x: 240, y: p.y + 74, action: () => game.toSelect() },
      { label: 'MAIN MENU', x: 240, y: p.y + 90, action: () => game.toTitle() },
    ]);
    this.menu.setVisible(false);
    this.wasPaused = false;
    // The menu only takes keys while it is shown (Up / Down are the tilt keys otherwise).
    onKeyPress(this, 'UP', () => this.menu.move(-1));
    onKeyPress(this, 'DOWN', () => this.menu.move(1));
    onKeyPress(this, 'ENTER', () => this.menu.activate());
  }

  /** Screen rectangle of the pause button's click target (for tests). */
  get pauseHit(): { x: number; y: number; w: number; h: number } {
    const b = PAUSE_BTN;
    return { x: b.x - b.hitW / 2, y: b.y - b.hitH / 2, w: b.hitW, h: b.hitH };
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
    if (game.flips !== l.flips) { l.flips = game.flips; this.flips.setText(`FLIPS ${game.flips}`); }
    // The finish screen's frame reaches under these, and shows the same numbers itself.
    const clear = !this.scene.isActive('Finish');
    this.crashes.setVisible(clear);
    this.flips.setVisible(clear && game.flips > 0);
    this.bikeName.setVisible(clear);

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

    if (game.paused !== this.wasPaused) {
      this.wasPaused = game.paused;
      this.pause.setVisible(game.paused);
      this.menu.setVisible(game.paused);
      if (game.paused) this.menu.select(0); // always opens on RESUME
    }
    const showBtn = !game.paused && !game.finished;
    if (showBtn !== this.pauseBtn.visible) {
      this.pauseBtn.setVisible(showBtn);
      if (showBtn) this.pauseZone.setInteractive({ useHandCursor: true });
      else this.pauseZone.disableInteractive();
    }
  }
}
