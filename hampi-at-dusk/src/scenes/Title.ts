// Title: the parallax scene drifts by under the logo. Two ways in (v1.9): JOURNEY (the stages in order,
// one bike, 5 helmets) and STAGES (one stage at a time, for medals and ghosts).
import Phaser from 'phaser';
import { DEPTH, Parallax } from '../art/Parallax';
import { useStageLook } from '../art/assets';
import { PAL } from '../art/palette';
import { soundLabel } from '../audio/sfx';
import { setMusicInRun, setMusicIntensity, tickMusic } from '../audio/music';
import { BikeView } from '../bike/BikeView';
import { currentBikeDef } from '../bike/selection';
import { onKeyPress } from '../input';
import { MAX_HELMETS } from '../journey';
import { journeyBest } from '../journeyRun';
import { BASELINE_Y, cameraMaxScrollX } from '../level/level';
import { addGroundStrip } from '../level/terrainView';
import { FIRST_STAGE, JOURNEY_ORDER, stageTitle } from '../stages';
import { Menu } from '../ui/Menu';
import { formatTime, pixelText } from '../ui/text';

const SCROLL_SPEED = 28; // px/s

export class TitleScene extends Phaser.Scene {
  /** JOURNEY / STAGES */
  menu!: Menu;
  private parallax!: Parallax;
  private ground!: Phaser.GameObjects.TileSprite;
  private bike!: BikeView;
  private about!: Phaser.GameObjects.Text;
  private mute!: Phaser.GameObjects.Text;
  private lines: string[] = [];
  private shown = -1;
  private t = 0;

  constructor() {
    super('Title');
  }

  create(): void {
    setMusicInRun(false); // v1.6.4: menus have the music
    this.t = 0;
    this.shown = -1;
    // The menus are set on the first stage's road.
    useStageLook(this, FIRST_STAGE);
    this.parallax = new Parallax(this, cameraMaxScrollX(FIRST_STAGE.width));
    this.ground = addGroundStrip(this, FIRST_STAGE, DEPTH.terrain);
    // The bike picked last rides across the title; the journey best shown is that bike's.
    const def = currentBikeDef();
    this.bike = new BikeView(this, DEPTH.bike, DEPTH.fx, def.id);

    const ui = DEPTH.fade;
    // The font is monospaced, so a ':' sits in a full-width cell; drawn as two pieces with a small gap the
    // space after the colon reads as one space instead of two.
    const head = pixelText(this, 0, 50, 'OPEN ROADS:', PAL.uiYellow, 24).setDepth(ui);
    const tail = pixelText(this, 0, 50, 'INDIA', PAL.uiYellow, 24).setDepth(ui);
    const gap = 12;
    const left = Math.round(240 - (head.width + gap + tail.width) / 2);
    head.setX(left);
    tail.setX(left + head.width + gap);
    const n = JOURNEY_ORDER.length;
    const sub = n === 1 ? stageTitle(FIRST_STAGE) : `A ROAD TRIP IN ${n} STAGES`;
    pixelText(this, 240, 84, sub, PAL.cream).setOrigin(0.5, 0).setDepth(ui);

    // What each way in is, in one line under the menu (the journey's line ends with this bike's best time).
    const best = journeyBest(def.id);
    this.lines = [
      best === null ? `ONE BIKE, ${MAX_HELMETS} HELMETS, EVERY STAGE IN ORDER` : `${def.name} JOURNEY BEST ${formatTime(best)}`,
      'ONE STAGE AT A TIME: MEDALS AND GHOSTS',
    ];
    // A dim plate behind the menu and its line, so they read over the skyline (notched like the pixel frames).
    const plate = this.add.graphics().setDepth(ui - 1);
    plate.fillStyle(PAL.ink, 0.55).fillRect(66, 108, 348, 62).fillRect(64, 110, 352, 58);
    this.menu = new Menu(this, [
      { label: 'JOURNEY', x: 240, y: 116, action: () => this.scene.start('Select', { mode: 'journey' }) },
      { label: 'STAGES', x: 240, y: 132, action: () => this.scene.start('Stages') },
    ], ui);
    this.about = pixelText(this, 240, 154, '', PAL.cream).setOrigin(0.5, 0).setDepth(ui);

    this.add.rectangle(0, 232, 480, 38, PAL.ink, 0.72).setOrigin(0, 0).setDepth(ui - 1);
    const hints = [
      'RIGHT GAS  LEFT BRAKE/BACK  SPACE HOP  UP/DOWN TILT+FLIP',
      'SHIFT BOOST  H HONK  R RETRY  M SOUND  G GHOST  P/ESC MENU',
    ];
    hints.forEach((line, i) => pixelText(this, 240, 239 + i * 13, line, PAL.cream).setOrigin(0.5, 0).setDepth(ui));
    this.mute = pixelText(this, 474, 6, '', PAL.cream).setOrigin(1, 0).setDepth(ui).setVisible(false);

    onKeyPress(this, 'UP', () => this.menu.move(-1));
    onKeyPress(this, 'DOWN', () => this.menu.move(1));
    onKeyPress(this, 'ENTER', () => this.menu.activate());
    this.draw(0);
  }

  override update(_time: number, delta: number): void {
    this.draw(Math.min(delta / 1000, 0.1));
  }

  private draw(dt: number): void {
    this.t += dt;
    const scroll = Math.round(this.t * SCROLL_SPEED);
    this.parallax.update(scroll, this.t);
    this.ground.tilePositionX = scroll;
    this.bike.ride(150, BASELINE_Y, 0, { throttle: true, brake: false, reversing: false, footDown: false, boosting: false, grounded: true, v: SCROLL_SPEED * 3 }, dt);
    if (this.menu.index !== this.shown) {
      this.shown = this.menu.index;
      this.about.setText(this.lines[this.shown] ?? '');
    }
    const tag = soundLabel();
    if (tag !== this.mute.text) this.mute.setText(tag);
    this.mute.setVisible(tag !== '');
    setMusicIntensity(0);
    tickMusic();
  }
}
