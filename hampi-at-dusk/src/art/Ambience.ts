// Living background details: bird flocks, bats near the finish, fireflies, a smoke wisp from a distant
// shrine and flickering lamps in the ruins. Purely visual and always behind the playfield (every depth
// here is below DEPTH.terrain). Everything is a pure function of (game time, camera scroll) on a fixed
// pool of images: no tweens, no wall clock, no Math.random, so manual stepping and screenshots are stable.

import type Phaser from 'phaser';
import { theme } from './look/theme';

const VIEW_W = 480;
const LAYER_W = 960;

/** Depths: between the sky and the far skyline, above the skyline, and above the mid silhouettes. */
const D_SKY = 0.5;
const D_SKYLINE = 1.7;
const D_MID = 2.1;
const D_FIREFLY = 3;

const mod = (a: number, n: number): number => ((a % n) + n) % n;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Deterministic 0..1 hash of two integers. */
function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// --- Birds: flocks that cross the sky every so often, low enough to pass in front of the sun. ---------
interface Flock { y: number; speed: number; lane: number; offset: number; shape: ReadonlyArray<readonly [number, number]> }
const V_SHAPE = [[0, 0], [-6, 3], [-5, -3], [-12, 6], [-11, -6], [-18, 9], [-17, -8]] as const;
const LOOSE = [[0, 0], [-9, 4], [-15, -3], [-24, 2], [-31, -5]] as const;
const FLOCKS: Flock[] = [
  { y: 120, speed: 13, lane: 900, offset: 120, shape: V_SHAPE },
  { y: 86, speed: 9, lane: 1100, offset: 640, shape: LOOSE },
  { y: 142, speed: -11, lane: 1300, offset: 900, shape: LOOSE.slice(0, 3) },
];
/**
 * Birds thin out as dusk deepens toward the end of the stage; bats take over. (World x, v1.7 layout: the
 * change happens along the Mandapa Run and the Hemakuta Rocks, as it did before the stage grew.)
 */
const BIRDS_FADE = [9464, 10664] as const;
const BATS_FADE = [8564, 9764] as const;
const BAT_COUNT = 6;

// --- Fireflies: one candidate per cell of a slow layer just behind the road. -------------------------
const FLY_SCROLL = 0.8;
const FLY_CELL = 36;
const FLY_POOL = Math.ceil(VIEW_W / FLY_CELL) + 2;
/** World x ranges where fireflies gather (the canals, the kicker's tank and the river), and how likely a cell holds one. */
const FLY_ZONES: ReadonlyArray<readonly [number, number, number]> = [[2820, 4220, 0.9], [10564, 10964, 0.75], [13290, 14340, 0.75]];
const FLY_BASE = 0.22;

const WISP_COUNT = 7;

export class Ambience {
  private birds: Phaser.GameObjects.Image[][] = [];
  private bats: Phaser.GameObjects.Image[] = [];
  private flies: Phaser.GameObjects.Image[] = [];
  private wisps: Phaser.GameObjects.Image[] = [];
  private lamps: Phaser.GameObjects.Image[] = [];
  /** where the stage theme hangs its lamps and lets its smoke rise (layer coordinates and scroll factors) */
  private lampDef = theme().lamps;
  private smoke = theme().smoke;

  constructor(scene: Phaser.Scene) {
    const make = (key: string, depth: number, frame?: number): Phaser.GameObjects.Image =>
      scene.add.image(0, 0, key, frame).setOrigin(0, 0).setScrollFactor(0).setDepth(depth).setVisible(false);
    this.birds = FLOCKS.map((f) => f.shape.map(() => make('bird', D_SKY, 0)));
    for (let i = 0; i < BAT_COUNT; i++) this.bats.push(make('bat', D_SKYLINE, 0));
    for (let i = 0; i < FLY_POOL; i++) this.flies.push(make('p_firefly', D_FIREFLY));
    for (let i = 0; i < WISP_COUNT; i++) this.wisps.push(make('p_wisp', D_SKYLINE));
    for (let i = 0; i < this.lampDef.at.length; i++) this.lamps.push(make('lamp_glow', D_MID));
  }

  /** t = game time in seconds, scrollX = camera scroll in world px. */
  update(t: number, scrollX: number): void {
    this.updateBirds(t, scrollX);
    this.updateBats(t, scrollX);
    this.updateFireflies(t, scrollX);
    this.updateSmoke(t, scrollX);
    this.updateLamps(t, scrollX);
  }

  private updateBirds(t: number, scrollX: number): void {
    const alpha = 0.85 * (1 - clamp01((scrollX - BIRDS_FADE[0]) / (BIRDS_FADE[1] - BIRDS_FADE[0])));
    FLOCKS.forEach((f, k) => {
      const dir = f.speed > 0 ? 1 : -1;
      const lead = mod(f.offset + f.speed * t - scrollX * 0.1, f.lane) - 60;
      const drift = Math.sin(t * 0.23 + k * 2) * 5;
      f.shape.forEach(([dx, dy], i) => {
        const img = this.birds[k]![i]!;
        const x = Math.round(lead + dx * dir);
        const y = Math.round(f.y + dy + drift + Math.sin(t * 1.7 + i * 1.3 + k) * 1.2);
        const on = alpha > 0.02 && x > -8 && x < VIEW_W + 8;
        img.setVisible(on);
        if (!on) return;
        // Flap, with a short glide every few beats.
        const beat = t * 4.2 + i * 0.37 + k;
        img.setFrame(Math.floor(beat) % 5 === 4 ? 0 : Math.floor(beat * 2) % 2);
        img.setPosition(x, y).setAlpha(alpha);
      });
    });
  }

  private updateBats(t: number, scrollX: number): void {
    const alpha = 0.9 * clamp01((scrollX - BATS_FADE[0]) / (BATS_FADE[1] - BATS_FADE[0]));
    this.bats.forEach((img, i) => {
      if (alpha <= 0.02) { img.setVisible(false); return; }
      const ph = i * 2.399;
      const speed = (i % 2 === 0 ? 1 : -1) * (26 + hash(i, 7) * 22);
      const x = mod(hash(i, 3) * 700 + speed * t - scrollX * 0.15, 700) - 90
        + Math.sin(t * 2.7 + ph) * 7;
      const y = 44 + hash(i, 5) * 74 + Math.sin(t * 1.9 + ph) * 11 + Math.sin(t * 4.3 + ph * 2) * 5;
      const on = x > -10 && x < VIEW_W + 10;
      img.setVisible(on);
      if (!on) return;
      img.setFrame(Math.floor(t * 9 + i * 0.5) % 2);
      img.setPosition(Math.round(x), Math.round(y)).setAlpha(alpha);
    });
  }

  private updateFireflies(t: number, scrollX: number): void {
    const layer = scrollX * FLY_SCROLL;
    const first = Math.floor(layer / FLY_CELL) - 1;
    for (let n = 0; n < FLY_POOL; n++) {
      const img = this.flies[n]!;
      const cell = first + n;
      // World x this cell is drawn over when it is mid-screen: decides how likely it holds a firefly.
      const cx = (cell + 0.5) * FLY_CELL;
      const worldX = (cx - VIEW_W / 2) / FLY_SCROLL + VIEW_W / 2;
      let chance = FLY_BASE;
      for (const [x0, x1, c] of FLY_ZONES) if (worldX >= x0 && worldX <= x1) chance = c;
      if (hash(cell, 11) >= chance) { img.setVisible(false); continue; }
      const p1 = hash(cell, 13) * 6.283;
      const p2 = hash(cell, 17) * 6.283;
      const rate = 0.9 + hash(cell, 19) * 0.9;
      const glow = Math.max(0, Math.sin(t * rate + p1));
      const a = glow * glow * 0.9;
      if (a < 0.04) { img.setVisible(false); continue; }
      const x = cx - layer + (hash(cell, 23) - 0.5) * FLY_CELL + Math.sin(t * 0.6 + p2) * 7 + Math.sin(t * 1.3 + p1) * 3;
      const y = 172 + hash(cell, 29) * 40 + Math.sin(t * 0.8 + p2 * 1.7) * 5;
      img.setVisible(true).setPosition(Math.round(x), Math.round(y)).setAlpha(a);
    }
  }

  private updateSmoke(t: number, scrollX: number): void {
    const sx = mod(this.smoke.x - Math.round(scrollX * this.smoke.scroll) + 40, LAYER_W) - 40;
    const on = sx < VIEW_W + 30;
    this.wisps.forEach((img, i) => {
      img.setVisible(on);
      if (!on) return;
      const life = mod(t * 0.11 + i / WISP_COUNT, 1);
      const x = sx - 2 + life * 14 + Math.sin(life * 7 + i * 1.9 + t * 0.4) * (1 + life * 4);
      const y = this.smoke.y - life * 46;
      img.setPosition(Math.round(x), Math.round(y)).setAlpha(0.5 * Math.sin(Math.PI * Math.min(1, life * 1.15)) * (1 - life * 0.5));
    });
  }

  private updateLamps(t: number, scrollX: number): void {
    const off = Math.round(scrollX * this.lampDef.scroll);
    this.lampDef.at.forEach(([lx, ly], i) => {
      const img = this.lamps[i]!;
      const x = mod(lx - off + 10, LAYER_W) - 10;
      const on = x < VIEW_W + 6;
      img.setVisible(on);
      if (!on) return;
      // Two beating sines read as an uneven flame flicker.
      const a = 0.62 + 0.2 * Math.sin(t * 7.3 + i * 2.1) * Math.sin(t * 2.9 + i) + 0.1 * Math.sin(t * 13 + i * 5);
      img.setPosition(x - 2, ly - 2).setAlpha(a);
    });
  }
}
