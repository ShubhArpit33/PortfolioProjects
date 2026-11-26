// STAGES (v1.9): the stages, one row each, straight from the registry. A stage a journey has reached can
// be ridden on its own (a single run: no lives, medals, ghost, best times); the others are shown locked.
// Up / Down move through the stages and on to BACK, Enter goes on to the bike select (or back), Esc goes
// back to the title.
import Phaser from 'phaser';
import { DEPTH, Parallax } from '../art/Parallax';
import { useStageLook } from '../art/assets';
import { PAL, css, mix } from '../art/palette';
import { soundLabel } from '../audio/sfx';
import { setMusicInRun, setMusicIntensity, tickMusic } from '../audio/music';
import { BIKES, BIKE_ORDER, type BikeId } from '../bike/bikes';
import { onKeyPress } from '../input';
import { stageUnlocked } from '../journeyRun';
import { cameraMaxScrollX } from '../level/level';
import { addGroundStrip } from '../level/terrainView';
import { medalFor, type Medal } from '../progress';
import { FIRST_STAGE, stageNumber, stages } from '../stages';
import type { StageId } from '../stages/stage';
import { Menu } from '../ui/Menu';
import { formatTime, pixelText } from '../ui/text';
import { currentBest } from './Game';

const SCROLL_SPEED = 14;
const ROW = { x: 64, y: 44, w: 352, h: 44, gap: 6 };

export interface StageRow {
  id: StageId;
  name: string;
  unlocked: boolean;
  /** the fastest single run on any bike (null = none yet, or locked), the bike it was on, and its medal */
  bestMs: number | null;
  bestBike: BikeId | null;
  medal: Medal | null;
}

export class StagesScene extends Phaser.Scene {
  /** index into rows of the highlighted stage; rows.length = BACK is highlighted instead */
  index = 0;
  /** what each row shows (for tests) */
  rows: StageRow[] = [];
  /** BACK */
  menu!: Menu;
  private parallax!: Parallax;
  private ground!: Phaser.GameObjects.TileSprite;
  private frames!: Phaser.GameObjects.Graphics;
  private names: Phaser.GameObjects.Text[] = [];
  private note!: Phaser.GameObjects.Text;
  private mute!: Phaser.GameObjects.Text;
  private noteT = 0;
  private t = 0;

  constructor() {
    super('Stages');
  }

  create(): void {
    setMusicInRun(false); // menus have the music
    this.t = 0;
    this.noteT = 0;
    this.names = [];
    useStageLook(this, FIRST_STAGE);
    this.parallax = new Parallax(this, cameraMaxScrollX(FIRST_STAGE.width));
    this.ground = addGroundStrip(this, FIRST_STAGE, DEPTH.terrain);
    const ui = DEPTH.fade;
    this.add.rectangle(0, 0, 480, 270, PAL.ink, 0.5).setOrigin(0, 0).setDepth(ui - 2);
    pixelText(this, 240, 12, 'STAGES', PAL.uiYellow, 16).setOrigin(0.5, 0).setDepth(ui);
    this.frames = this.add.graphics().setDepth(ui - 1);

    this.rows = stages().map((stage) => {
      const unlocked = stageUnlocked(stage.id);
      let bestMs: number | null = null;
      let bestBike: BikeId | null = null;
      if (unlocked) {
        for (const bike of BIKE_ORDER) {
          const t = currentBest(stage, bike).timeMs;
          if (t !== null && (bestMs === null || t < bestMs)) { bestMs = t; bestBike = bike; }
        }
      }
      const medal = bestMs !== null && bestBike !== null ? medalFor(bestMs, stage.medalsMs[bestBike]) : null;
      return { id: stage.id, name: stage.name, unlocked, bestMs, bestBike, medal };
    });

    this.rows.forEach((row, i) => {
      const r = this.rowRect(i);
      const n = stageNumber(row.id);
      const dim = mix(PAL.ink, PAL.graniteLight, 0.75);
      pixelText(this, r.x + 14, r.y + 10, `STAGE ${n}`, row.unlocked ? PAL.graniteLight : dim).setDepth(ui);
      this.names.push(pixelText(this, r.x + 14, r.y + 24, row.name, row.unlocked ? PAL.cream : dim).setDepth(ui));
      if (!row.unlocked) {
        this.add.image(r.x + r.w - 20, r.y + 15, 'lock').setDepth(ui);
        pixelText(this, r.x + r.w - 32, r.y + 10, 'LOCKED', dim).setOrigin(1, 0).setDepth(ui);
        pixelText(this, r.x + r.w - 14, r.y + 24, 'REACH IT ON A JOURNEY', dim).setOrigin(1, 0).setDepth(ui);
      } else if (row.bestMs === null || row.bestBike === null) {
        pixelText(this, r.x + r.w - 14, r.y + 24, 'NO RUN YET', PAL.graniteLight).setOrigin(1, 0).setDepth(ui);
      } else {
        pixelText(this, r.x + r.w - 14, r.y + 10, `BEST ${formatTime(row.bestMs)}`, PAL.uiYellow).setOrigin(1, 0).setDepth(ui);
        const who = BIKES[row.bestBike].name;
        pixelText(this, r.x + r.w - 14, r.y + 24, who, PAL.graniteLight).setOrigin(1, 0).setDepth(ui);
        if (row.medal) this.add.image(r.x + r.w - 14 - who.length * 8 - 10, r.y + 28, `medal_${row.medal}`).setDepth(ui);
      }
      this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h).setDepth(ui).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => { if (this.index === i) this.pick(); else this.choose(i); });
    });

    this.note = pixelText(this, 240, 226, '', PAL.uiYellow).setOrigin(0.5, 0).setDepth(ui);
    this.menu = new Menu(this, [{ label: 'BACK', x: 240, y: 241, action: () => this.back() }], ui);
    this.menu.blur();
    pixelText(this, 240, 257, 'UP/DOWN CHOOSE  ENTER RIDE  ESC BACK', PAL.graniteLight).setOrigin(0.5, 0).setDepth(ui);
    this.mute = pixelText(this, 474, 7, '', PAL.cream).setOrigin(1, 0).setDepth(ui).setVisible(false);

    onKeyPress(this, 'UP', () => this.choose(this.index - 1));
    onKeyPress(this, 'DOWN', () => this.choose(this.index + 1));
    onKeyPress(this, 'ENTER', () => this.pick());
    onKeyPress(this, 'ESC', () => this.back());

    this.choose(0);
    this.draw(0);
  }

  /** Screen rectangle of a stage's row (also its click target). */
  rowRect(i: number): { x: number; y: number; w: number; h: number } {
    return { x: ROW.x, y: ROW.y + i * (ROW.h + ROW.gap), w: ROW.w, h: ROW.h };
  }

  /** Highlight a stage, or BACK after the last one (wraps around). */
  choose(i: number): void {
    const n = this.rows.length + 1;
    this.index = ((i % n) + n) % n;
    this.noteT = 0;
    if (this.index === this.rows.length) this.menu.select(0);
    else this.menu.blur();
    this.names.forEach((t, k) => {
      if (this.rows[k]!.unlocked) t.setColor(css(k === this.index ? PAL.uiYellow : PAL.cream));
    });
    const g = this.frames;
    g.clear();
    this.rows.forEach((_, k) => {
      const r = this.rowRect(k);
      const on = k === this.index;
      // The same notched frame as the bike cards: yellow for the pick, dim stone for the others.
      g.fillStyle(on ? PAL.uiYellow : PAL.graniteDark, 1);
      g.fillRect(r.x + 4, r.y, r.w - 8, r.h).fillRect(r.x, r.y + 4, r.w, r.h - 8);
      g.fillStyle(PAL.ink, on ? 0.94 : 0.86);
      g.fillRect(r.x + 6, r.y + 2, r.w - 12, r.h - 4).fillRect(r.x + 2, r.y + 6, r.w - 4, r.h - 12);
    });
  }

  /** On to the bike select for the highlighted stage; a locked one only says how to open it. (On BACK: back.) */
  pick(): void {
    const row = this.rows[this.index];
    if (!row) {
      this.back();
      return;
    }
    if (!row.unlocked) {
      this.noteT = 2.5;
      return;
    }
    this.scene.start('Select', { mode: 'single', stage: row.id });
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
    // The mouse over BACK highlights it (the menu does that itself): the rows give the highlight up.
    if (this.menu.index === 0 && this.index !== this.rows.length) this.choose(this.rows.length);
    if (this.noteT > 0) this.noteT = Math.max(0, this.noteT - dt);
    const note = this.noteT > 0 ? 'LOCKED: A JOURNEY HAS TO GET THERE FIRST' : '';
    if (note !== this.note.text) this.note.setText(note);
    const tag = soundLabel();
    if (tag !== this.mute.text) this.mute.setText(tag);
    this.mute.setVisible(tag !== '');
    setMusicIntensity(0);
    tickMusic();
  }
}
