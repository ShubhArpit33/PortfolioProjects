// Title: the parallax scene drifts by under the logo. Enter goes to the bike select.
import Phaser from 'phaser';
import { DEPTH, Parallax } from '../art/Parallax';
import { PAL } from '../art/palette';
import { soundLabel } from '../audio/sfx';
import { setMusicInRun, setMusicIntensity, tickMusic } from '../audio/music';
import { BikeView } from '../bike/BikeView';
import { currentBikeDef } from '../bike/selection';
import { onKeyPress } from '../input';
import { BASELINE_Y } from '../level/levelData';
import { medalFor } from '../progress';
import { formatTime, pixelText } from '../ui/text';
import { currentBest } from './Game';

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
    setMusicInRun(false); // v1.6.4: menus have the music
    this.t = 0;
    this.parallax = new Parallax(this);
    // The first terrain chunk is all flat road, so it tiles as a ground strip.
    this.ground = this.add.tileSprite(0, 0, 480, 270, 'terrain_0').setOrigin(0, 0).setDepth(DEPTH.terrain);
    // The bike picked last rides across the title; the best shown is that bike's.
    const def = currentBikeDef();
    this.bike = new BikeView(this, DEPTH.bike, DEPTH.fx, def.id);

    const ui = DEPTH.fade;
    pixelText(this, 240, 58, 'HAMPI AT DUSK', PAL.uiYellow, 24).setOrigin(0.5, 0).setDepth(ui);
    pixelText(this, 240, 92, 'A SUNSET RIDE THROUGH THE RUINS', PAL.cream).setOrigin(0.5, 0).setDepth(ui);
    this.press = pixelText(this, 240, 128, 'PRESS ENTER', PAL.uiYellow).setOrigin(0.5, 0).setDepth(ui);

    // The time to beat, with its medal.
    const best = currentBest(def.id);
    if (best.timeMs !== null) {
      const medal = medalFor(best.timeMs, def.medalsMs);
      const label = `${def.name} BEST ${formatTime(best.timeMs)}`;
      const tx = medal ? 247 : 240;
      pixelText(this, tx, 150, label, PAL.cream).setOrigin(0.5, 0).setDepth(ui);
      if (medal) this.add.image(tx - (label.length * 8) / 2 - 13, 154, `medal_${medal}`).setDepth(ui);
    }

    this.add.rectangle(0, 232, 480, 38, PAL.ink, 0.72).setOrigin(0, 0).setDepth(ui - 1);
    const hints = [
      'RIGHT GAS  LEFT BRAKE/BACK  SPACE HOP  UP/DOWN TILT+FLIP',
      'SHIFT BOOST  H HONK  R RETRY  M SOUND  G GHOST  P/ESC MENU',
    ];
    hints.forEach((line, i) => pixelText(this, 240, 239 + i * 13, line, PAL.cream).setOrigin(0.5, 0).setDepth(ui));
    this.mute = pixelText(this, 474, 6, '', PAL.cream).setOrigin(1, 0).setDepth(ui).setVisible(false);

    const start = (): void => { this.scene.start('Select'); };
    onKeyPress(this, 'ENTER', start);
    // "PRESS ENTER" is also a click / tap target (it blinks, so the target is a zone of its own).
    this.add.zone(240, 132, 136, 20).setInteractive({ useHandCursor: true }).once('pointerdown', start);
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
    const tag = soundLabel();
    if (tag !== this.mute.text) this.mute.setText(tag);
    this.mute.setVisible(tag !== '');
    setMusicIntensity(0);
    tickMusic();
  }
}
