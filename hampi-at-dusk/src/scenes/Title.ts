// Title: the parallax scene drifts by under the logo. Enter starts the ride.
import Phaser from 'phaser';
import { DEPTH, Parallax } from '../art/Parallax';
import { PAL } from '../art/palette';
import { isMuted } from '../audio/sfx';
import { BikeView } from '../bike/BikeView';
import { URL_CP, onKeyPress } from '../input';
import { BASELINE_Y } from '../level/levelData';
import { pixelText } from '../ui/text';

const SCROLL_SPEED = 28; // px/s

export class TitleScene extends Phaser.Scene {
  private parallax!: Parallax;
  private ground!: Phaser.GameObjects.TileSprite;
  private bike!: BikeView;
  private press!: Phaser.GameObjects.Text;
  private mute!: Phaser.GameObjects.Text;
  private t = 0;

  constructor() {
    super('Title');
  }

  create(): void {
    this.t = 0;
    this.parallax = new Parallax(this);
    // The first terrain chunk is all flat road, so it tiles as a ground strip.
    this.ground = this.add.tileSprite(0, 0, 480, 270, 'terrain_0').setOrigin(0, 0).setDepth(DEPTH.terrain);
    this.bike = new BikeView(this, DEPTH.bike, DEPTH.fx);

    const ui = DEPTH.fade;
    pixelText(this, 240, 58, 'HAMPI AT DUSK', PAL.uiYellow, 24).setOrigin(0.5, 0).setDepth(ui);
    pixelText(this, 240, 92, 'A SUNSET RIDE THROUGH THE RUINS', PAL.cream).setOrigin(0.5, 0).setDepth(ui);
    this.press = pixelText(this, 240, 128, 'PRESS ENTER', PAL.uiYellow).setOrigin(0.5, 0).setDepth(ui);

    this.add.rectangle(0, 232, 480, 38, PAL.ink, 0.72).setOrigin(0, 0).setDepth(ui - 1);
    const hints = [
      'RIGHT GAS  LEFT BRAKE/BACK  SPACE HOP  UP/DOWN TILT',
      'SHIFT BOOST  H HONK  P PAUSE  R RESTART  M MUTE',
    ];
    hints.forEach((line, i) => pixelText(this, 240, 239 + i * 13, line, PAL.cream).setOrigin(0.5, 0).setDepth(ui));
    this.mute = pixelText(this, 474, 6, 'MUTED', PAL.cream).setOrigin(1, 0).setDepth(ui).setVisible(false);

    onKeyPress(this, 'ENTER', () => this.scene.start('Game', { cp: URL_CP ?? 0 }));
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
    this.press.setVisible(Math.floor(this.t * 2.5) % 2 === 0);
    this.mute.setVisible(isMuted());
  }
}
