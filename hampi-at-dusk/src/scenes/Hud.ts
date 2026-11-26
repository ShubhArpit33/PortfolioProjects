// HUD: a separate UI scene that never scrolls. Timer, collectibles, boost bar, crash count, the stage's
// name, the hint, the tutorial prompt (v1.7), the mute tag, the bike's name, the pause button and the
// pause menu. In a journey (v1.9) it also draws the helmets and the GAME OVER screen, and the pause menu
// is RESUME / RESTART STAGE / QUIT JOURNEY instead of RESUME / RESTART / CHANGE BIKE / MAIN MENU.
import Phaser from 'phaser';
import { PAL, mix } from '../art/palette';
import { soundLabel } from '../audio/sfx';
import { onKeyPress } from '../input';
import { MAX_HELMETS } from '../journey';
import { Menu } from '../ui/Menu';
import { formatTime, pixelFrame, pixelText } from '../ui/text';
import type { GameScene } from './Game';

const BAR = { x: 412, y: 6, w: 62, h: 9 };
/** Pause button: top centre, clear of the timer (left) and BOOST / CRASHES (right). */
const PAUSE_BTN = { x: 240, y: 11, w: 15, h: 11, hitW: 30, hitH: 22 };
/** The stage's name: top centre, on the line under the pause button (clear of it, of the diya count and of CRASHES). */
const STAGE_NAME_Y = 22;
const PANEL = { x: 128, y: 68, w: 224, h: 134 };
const OVER = { x: 96, y: 66, w: 288, h: 138 };
/** The checkpoint / stage hint blinks here; the tutorial prompt's text is below it. */
const HINT_Y = 52;
const PROMPT_Y = 72;
/** Helmets (a journey): a row of icons under the collectible count, where a single run shows its best time. */
const HELMETS = { x: 5, y: 28, step: 18 };
/** Seconds a helmet blinks when it has just been lost. */
const HELMET_BLINK_S = 0.9;

export class HudScene extends Phaser.Scene {
  private timer!: Phaser.GameObjects.Text;
  private diyas!: Phaser.GameObjects.Text;
  private crashes!: Phaser.GameObjects.Text;
  private flips!: Phaser.GameObjects.Text;
  private best!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private promptBack!: Phaser.GameObjects.Graphics;
  private mute!: Phaser.GameObjects.Text;
  private bikeName!: Phaser.GameObjects.Text;
  private stageName!: Phaser.GameObjects.Text;
  private bar!: Phaser.GameObjects.Graphics;
  private pause!: Phaser.GameObjects.Container;
  private over!: Phaser.GameObjects.Container;
  private pauseBtn!: Phaser.GameObjects.Graphics;
  private pauseZone!: Phaser.GameObjects.Zone;
  private helmets: Phaser.GameObjects.Image[] = [];
  /** the top-left and top-right corners (timer, collectibles, boost): hidden under a journey's full-width screens */
  private corners: Array<Phaser.GameObjects.Components.Visible> = [];
  private helmetBlink = 0;
  private total = 0;
  menu!: Menu;
  private wasPaused = false;
  private last = { time: '', diyas: -1, crashes: -1, flips: 0, boost: -1, boosting: false, helmets: -1 };

  constructor() {
    super('Hud');
  }

  create(): void {
    const game = this.scene.get('Game') as GameScene;
    const stage = game.stage;
    const journey = game.mode === 'journey';
    this.total = stage.collectibles.length;
    this.last = { time: '', diyas: -1, crashes: -1, flips: 0, boost: -1, boosting: false, helmets: -1 };
    this.helmets = [];
    this.helmetBlink = 0;
    this.timer = pixelText(this, 6, 6, '00:00.00', PAL.cream);
    const icon = this.add.image(6, 18, stage.collectible.texture).setOrigin(0, 0);
    this.diyas = pixelText(this, 18, 18, `0/${this.total}`, PAL.uiYellow);
    const boost = pixelText(this, BAR.x - 4, 6, 'BOOST', PAL.uiYellow).setOrigin(1, 0);
    this.bar = this.add.graphics();
    this.corners = [this.timer, icon, this.diyas, boost, this.bar];
    this.crashes = pixelText(this, 474, 18, 'CRASHES 0', PAL.cream).setOrigin(1, 0);
    this.best = pixelText(this, 6, 30, '', PAL.graniteLight).setVisible(false);
    this.flips = pixelText(this, 474, 30, '', PAL.uiYellow).setOrigin(1, 0).setVisible(false);
    this.stageName = pixelText(this, 240, STAGE_NAME_Y, stage.name, PAL.cream).setOrigin(0.5, 0);
    this.hint = pixelText(this, 240, HINT_Y, '', PAL.uiYellow).setOrigin(0.5, 0).setVisible(false);
    // Tutorial prompt (v1.7): steady, on a dim plate, below the blinking hint.
    this.promptBack = this.add.graphics().setVisible(false);
    this.prompt = pixelText(this, 240, PROMPT_Y, '', PAL.cream).setOrigin(0.5, 0).setVisible(false);
    this.mute = pixelText(this, 474, 256, '', PAL.cream).setOrigin(1, 0).setVisible(false);

    // A journey's helmets: one icon each, the spent ones dim.
    if (journey) {
      for (let i = 0; i < MAX_HELMETS; i++) {
        this.helmets.push(this.add.image(HELMETS.x + i * HELMETS.step, HELMETS.y, 'helmet_on').setOrigin(0, 0));
      }
    }

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
    const parts: Phaser.GameObjects.GameObject[] = [dim, frame, title, sub];
    // A journey's bike is chosen once, and starting the stage again is not free.
    if (journey) parts.push(pixelText(this, 240, p.y + 96, 'A RESTART COSTS A HELMET', PAL.graniteLight).setOrigin(0.5, 0));
    // (the container first: the menu's texts are drawn over its dimmed backdrop)
    this.pause = this.add.container(0, 0, parts).setVisible(false);
    if (journey) {
      this.menu = new Menu(this, [
        { label: 'RESUME', x: 240, y: p.y + 42, action: () => game.setPaused(false) },
        { label: 'RESTART STAGE', x: 240, y: p.y + 58, action: () => game.restartRun() },
        { label: 'QUIT JOURNEY', x: 240, y: p.y + 74, action: () => game.toTitle() },
      ]);
    } else {
      this.menu = new Menu(this, [
        { label: 'RESUME', x: 240, y: p.y + 42, action: () => game.setPaused(false) },
        { label: 'RESTART', x: 240, y: p.y + 58, action: () => game.restartRun() },
        { label: 'CHANGE BIKE', x: 240, y: p.y + 74, action: () => game.toSelect() },
        { label: 'MAIN MENU', x: 240, y: p.y + 90, action: () => game.toTitle() },
      ]);
    }
    this.menu.setVisible(false);
    this.wasPaused = false;

    // GAME OVER (a journey, out of helmets): what happened and what happens next, over the stopped stage.
    const o = OVER;
    const oFrame = this.add.graphics();
    pixelFrame(oFrame, o.x, o.y, o.w, o.h);
    const spent: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < MAX_HELMETS; i++) {
      spent.push(this.add.image(240 + (i - (MAX_HELMETS - 1) / 2) * 22, o.y + 50, 'helmet_off'));
    }
    this.over = this.add.container(0, 0, [
      this.add.rectangle(0, 0, 480, 270, PAL.ink, 0.6).setOrigin(0, 0),
      oFrame,
      pixelText(this, 240, o.y + 14, 'GAME OVER', PAL.uiYellow, 16).setOrigin(0.5, 0),
      ...spent,
      pixelText(this, 240, o.y + 68, 'OUT OF HELMETS', PAL.cream).setOrigin(0.5, 0),
      pixelText(this, 240, o.y + 86, `${stage.name} STARTS AGAIN`, PAL.cream).setOrigin(0.5, 0),
      pixelText(this, 240, o.y + 98, `WITH ${MAX_HELMETS} HELMETS`, PAL.cream).setOrigin(0.5, 0),
      pixelText(this, 240, o.y + o.h - 18, 'ENTER - GO ON', PAL.graniteLight).setOrigin(0.5, 0),
    ]).setVisible(false);

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

  override update(_time: number, delta: number): void {
    const game = this.scene.get('Game') as GameScene;
    if (!game.bike) return;
    const journey = game.mode === 'journey';
    const gameOver = game.phase === 'gameover';
    // The time to beat (the best before this run; it does not change under the finish screen).
    if (!this.best.visible && !game.finished && game.bestTimeMs !== null) {
      this.best.setText(`BEST ${formatTime(game.bestTimeMs)}`).setVisible(true);
    }
    const l = this.last;

    const time = formatTime(game.timeMs);
    if (time !== l.time) { l.time = time; this.timer.setText(time); }
    if (game.diyaCount !== l.diyas) { l.diyas = game.diyaCount; this.diyas.setText(`${game.diyaCount}/${this.total}`); }
    if (game.crashes !== l.crashes) { l.crashes = game.crashes; this.crashes.setText(`CRASHES ${game.crashes}`); }
    if (game.flips !== l.flips) { l.flips = game.flips; this.flips.setText(`FLIPS ${game.flips}`); }
    // A finish screen's frame reaches under these, and shows the same numbers itself.
    const clear = !['Finish', 'StageCard', 'JourneyFinish'].some((key) => this.scene.isActive(key));
    this.crashes.setVisible(clear);
    this.flips.setVisible(clear && game.flips > 0);
    this.bikeName.setVisible(clear);
    this.stageName.setVisible(clear);
    // The stage card and the journey finish are wider than a single run's finish screen: nothing shows beside them.
    const wide = this.scene.isActive('StageCard') || this.scene.isActive('JourneyFinish');
    if (this.corners[0]!.visible === wide) for (const c of this.corners) c.setVisible(!wide);

    // Helmets: the one just lost blinks before it goes dim.
    if (journey) {
      if (game.helmets !== l.helmets) {
        if (l.helmets >= 0 && game.helmets < l.helmets) this.helmetBlink = HELMET_BLINK_S;
        l.helmets = game.helmets;
      }
      if (this.helmetBlink > 0 && !game.paused) this.helmetBlink = Math.max(0, this.helmetBlink - Math.min(delta / 1000, 0.1));
      const lit = this.helmetBlink > 0 && Math.floor(this.helmetBlink * 8) % 2 === 1;
      this.helmets.forEach((img, i) => {
        const on = i < game.helmets || (i === game.helmets && lit);
        img.setTexture(on ? 'helmet_on' : 'helmet_off').setVisible(clear);
      });
    }

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

    const showHint = game.hintT > 0 && !game.finished && !gameOver;
    this.hint.setVisible(showHint && Math.floor(game.hintT * 4) % 4 !== 0);
    if (showHint && this.hint.text !== game.hintText) this.hint.setText(game.hintText);

    const prompt = game.paused ? '' : game.promptText;
    if (prompt !== this.prompt.text) {
      this.prompt.setText(prompt);
      const g = this.promptBack;
      g.clear();
      if (prompt !== '') {
        // a plate sized to the text: ink at 60%, corners notched like the pixel frames
        const w = prompt.length * 8 + 12;
        const x = 240 - Math.floor(w / 2);
        g.fillStyle(PAL.ink, 0.6).fillRect(x + 2, PROMPT_Y - 5, w - 4, 17).fillRect(x, PROMPT_Y - 3, w, 13);
        g.fillStyle(PAL.uiYellow, 1).fillRect(x + 2, PROMPT_Y + 11, w - 4, 1);
      }
    }
    this.prompt.setVisible(prompt !== '');
    this.promptBack.setVisible(prompt !== '');

    const tag = soundLabel();
    if (tag !== this.mute.text) this.mute.setText(tag);
    this.mute.setVisible(tag !== '');

    if (game.paused !== this.wasPaused) {
      this.wasPaused = game.paused;
      this.pause.setVisible(game.paused);
      this.menu.setVisible(game.paused);
      if (game.paused) this.menu.select(0); // always opens on RESUME
    }
    if (gameOver !== this.over.visible) this.over.setVisible(gameOver);
    const showBtn = !game.paused && !game.finished && !gameOver;
    if (showBtn !== this.pauseBtn.visible) {
      this.pauseBtn.setVisible(showBtn);
      if (showBtn) this.pauseZone.setInteractive({ useHandCursor: true });
      else this.pauseZone.disableInteractive();
    }
  }
}
