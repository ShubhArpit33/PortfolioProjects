// Bike select (v1.6): the three bikes side by side, each on a card with its name, stat bars and its own
// best time and medal. Left / Right choose, Enter rides, Esc goes back to the title. A click or tap on a
// card picks it; a second one (or the RIDE button) rides.
import Phaser from 'phaser';
import { DEPTH, Parallax } from '../art/Parallax';
import { PAL, css, mix } from '../art/palette';
import { soundLabel } from '../audio/sfx';
import { setMusicInRun, setMusicIntensity, tickMusic } from '../audio/music';
import { BikePreview } from '../bike/BikeView';
import { BIKES, BIKE_ORDER, type BikeId, type BikeStats } from '../bike/bikes';
import { currentBike, selectBike } from '../bike/selection';
import { URL_CP, onKeyPress } from '../input';
import { medalFor, type Medal } from '../progress';
import { Menu } from '../ui/Menu';
import { formatTime, pixelText } from '../ui/text';
import { currentBest } from './Game';

const SCROLL_SPEED = 14; // px/s: the dusk drifts by, slower than on the title
const CARD = { x0: 10, y: 30, w: 148, h: 194, gap: 8 };
const PREVIEW_SCALE = 3;
const STATS: ReadonlyArray<[keyof BikeStats, string]> = [
  ['speed', 'SPEED'], ['pull', 'PULL'], ['boost', 'BOOST'], ['flip', 'FLIP'], ['grip', 'GRIP'],
];

export interface SelectCard { bike: BikeId; bestMs: number | null; medal: Medal | null }

export class SelectScene extends Phaser.Scene {
  /** index into BIKE_ORDER of the highlighted bike */
  index = 0;
  /** what each card shows (for tests) */
  cards: SelectCard[] = [];
  /** RIDE / BACK */
  menu!: Menu;
  private parallax!: Parallax;
  private ground!: Phaser.GameObjects.TileSprite;
  private previews: BikePreview[] = [];
  private frames!: Phaser.GameObjects.Graphics;
  private names: Phaser.GameObjects.Text[] = [];
  private tagline!: Phaser.GameObjects.Text;
  private mute!: Phaser.GameObjects.Text;
  private t = 0;

  constructor() {
    super('Select');
  }

  create(): void {
    setMusicInRun(false); // v1.6.4: menus have the music
    this.t = 0;
    this.previews = [];
    this.names = [];
    this.index = BIKE_ORDER.indexOf(currentBike());
    this.parallax = new Parallax(this);
    this.ground = this.add.tileSprite(0, 0, 480, 270, 'terrain_0').setOrigin(0, 0).setDepth(DEPTH.terrain);
    const ui = DEPTH.fade;
    this.add.rectangle(0, 0, 480, 270, PAL.ink, 0.5).setOrigin(0, 0).setDepth(ui - 2);

    pixelText(this, 240, 7, 'CHOOSE YOUR RIDE', PAL.uiYellow, 16).setOrigin(0.5, 0).setDepth(ui);
    this.frames = this.add.graphics().setDepth(ui - 1);

    this.cards = BIKE_ORDER.map((id) => {
      const best = currentBest(id).timeMs;
      return { bike: id, bestMs: best, medal: best === null ? null : medalFor(best, BIKES[id].medalsMs) };
    });

    const bars = this.add.graphics().setDepth(ui);
    BIKE_ORDER.forEach((id, i) => {
      const def = BIKES[id];
      const r = this.cardRect(i);
      const cx = r.x + r.w / 2;
      // The bike, standing on the card's own strip of ground.
      this.previews.push(new BikePreview(this, id, cx, r.y + 98, PREVIEW_SCALE, ui));
      this.names.push(pixelText(this, cx, r.y + 106, def.name, PAL.cream).setOrigin(0.5, 0).setDepth(ui));

      // Stat bars: five pips each, from the bike's real numbers.
      STATS.forEach(([key, label], row) => {
        const y = r.y + 121 + row * 10;
        pixelText(this, r.x + 10, y, label, PAL.graniteLight).setDepth(ui);
        for (let k = 0; k < 5; k++) {
          const on = k < def.stats[key];
          bars.fillStyle(on ? PAL.glint : mix(PAL.ink, PAL.graniteDark, 0.6), 1).fillRect(r.x + 56 + k * 16, y + 1, 14, 5);
          if (on) bars.fillStyle(PAL.sun, 1).fillRect(r.x + 56 + k * 16, y + 1, 14, 1);
        }
      });

      // This bike's own best time and medal.
      const card = this.cards[i]!;
      const by = r.y + 177;
      if (card.bestMs === null) {
        pixelText(this, cx, by, 'NO RUN YET', PAL.graniteLight).setOrigin(0.5, 0).setDepth(ui);
      } else {
        const tx = card.medal ? cx + 8 : cx;
        pixelText(this, tx, by, formatTime(card.bestMs), PAL.uiYellow).setOrigin(0.5, 0).setDepth(ui);
        if (card.medal) this.add.image(tx - 32 - 10, by + 3, `medal_${card.medal}`).setDepth(ui);
      }

      this.add.zone(cx, r.y + r.h / 2, r.w, r.h).setDepth(ui).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => { if (this.index === i) this.ride(); else this.choose(i); });
    });

    this.tagline = pixelText(this, 240, 229, '', PAL.cream).setOrigin(0.5, 0).setDepth(ui);
    this.menu = new Menu(this, [
      { label: 'RIDE', x: 240 - 44, y: 243, action: () => this.ride() },
      { label: 'BACK', x: 240 + 44, y: 243, action: () => this.back() },
    ], ui);
    pixelText(this, 240, 257, 'LEFT/RIGHT CHOOSE  ENTER RIDE  ESC BACK', PAL.graniteLight).setOrigin(0.5, 0).setDepth(ui);
    this.mute = pixelText(this, 474, 7, '', PAL.cream).setOrigin(1, 0).setDepth(ui).setVisible(false);

    onKeyPress(this, 'LEFT', () => this.choose(this.index - 1));
    onKeyPress(this, 'RIGHT', () => this.choose(this.index + 1));
    // Up / Down move between RIDE and BACK; Enter does what is highlighted (RIDE unless moved).
    onKeyPress(this, 'UP', () => this.menu.move(-1));
    onKeyPress(this, 'DOWN', () => this.menu.move(1));
    onKeyPress(this, 'ENTER', () => this.menu.activate());
    onKeyPress(this, 'ESC', () => this.back());

    this.choose(this.index);
    this.draw(0);
  }

  /** Screen rectangle of a bike's card (also its click target). */
  cardRect(i: number): { x: number; y: number; w: number; h: number } {
    return { x: CARD.x0 + i * (CARD.w + CARD.gap), y: CARD.y, w: CARD.w, h: CARD.h };
  }

  /** Highlight a bike (wraps around). Nothing is saved until the ride starts. */
  choose(i: number): void {
    const n = BIKE_ORDER.length;
    this.index = ((i % n) + n) % n;
    const def = BIKES[BIKE_ORDER[this.index]!];
    this.tagline.setText(def.tagline);
    this.names.forEach((t, k) => t.setColor(css(k === this.index ? PAL.uiYellow : PAL.cream)));
    this.menu.select(0);

    const g = this.frames;
    g.clear();
    BIKE_ORDER.forEach((_, k) => {
      const r = this.cardRect(k);
      const on = k === this.index;
      // The same notched frame as the menus: yellow for the pick, dim stone for the others.
      g.fillStyle(on ? PAL.uiYellow : PAL.graniteDark, 1);
      g.fillRect(r.x + 4, r.y, r.w - 8, r.h).fillRect(r.x, r.y + 4, r.w, r.h - 8);
      g.fillStyle(PAL.ink, on ? 0.94 : 0.86);
      g.fillRect(r.x + 6, r.y + 2, r.w - 12, r.h - 4).fillRect(r.x + 2, r.y + 6, r.w - 4, r.h - 12);
      // A strip of road under the bike.
      g.fillStyle(on ? PAL.graniteLight : PAL.graniteDark, 1).fillRect(r.x + 10, r.y + 98, r.w - 20, 2);
      g.fillStyle(PAL.graniteDark, on ? 1 : 0.5).fillRect(r.x + 10, r.y + 100, r.w - 20, 1);
    });
  }

  /** Remember the pick and start a run on it. */
  ride(): void {
    const bike = BIKE_ORDER[this.index]!;
    selectBike(bike);
    this.scene.start('Game', { cp: URL_CP ?? 0, bike });
  }

  back(): void {
    this.scene.start('Title');
  }

  override update(_time: number, delta: number): void {
    this.draw(Math.min(delta / 1000, 0.1));
  }

  private draw(dt: number): void {
    this.t += dt;
    const scroll = Math.round(this.t * SCROLL_SPEED);
    this.parallax.update(scroll, this.t);
    this.ground.tilePositionX = scroll;
    this.previews.forEach((p, i) => p.update(dt, i === this.index));
    const tag = soundLabel();
    if (tag !== this.mute.text) this.mute.setText(tag);
    this.mute.setVisible(tag !== '');
    setMusicIntensity(0);
    tickMusic();
  }
}
