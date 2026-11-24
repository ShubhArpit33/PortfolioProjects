// Code-drawn placeholder art (GAME_SPEC.md section 6). Every texture is drawn with integer-aligned
// fillRects on a Phaser Graphics object and baked with generateTexture, so pixels stay crisp.

import Phaser from 'phaser';
import { PAL, mix, rng } from './palette';

type G = Phaser.GameObjects.Graphics;

/** Tiny pixel-art pen. With wrapW set, everything drawn across the left/right edge wraps (seamless tiling). */
class Pen {
  constructor(private g: G, private wrapW = 0) {}

  r(c: number, x: number, y: number, w: number, h: number, a = 1): this {
    if (w <= 0 || h <= 0) return this;
    this.g.fillStyle(c, a);
    this.g.fillRect(x, y, w, h);
    if (this.wrapW > 0) {
      if (x < 0) this.g.fillRect(x + this.wrapW, y, w, h);
      if (x + w > this.wrapW) this.g.fillRect(x - this.wrapW, y, w, h);
    }
    return this;
  }

  /** Filled disc from scanlines (no anti-aliasing). */
  disc(c: number, cx: number, cy: number, rad: number, a = 1): this {
    for (let dy = -rad; dy <= rad; dy++) {
      const half = Math.floor(Math.sqrt(rad * rad - dy * dy) + 0.5);
      this.r(c, cx - half, cy + dy, half * 2 + 1, 1, a);
    }
    return this;
  }

  /** Ring between an outer and an inner radius. */
  ring(c: number, cx: number, cy: number, rad: number, thick: number, a = 1): this {
    const inner = rad - thick;
    for (let dy = -rad; dy <= rad; dy++) {
      const half = Math.floor(Math.sqrt(rad * rad - dy * dy) + 0.5);
      if (Math.abs(dy) > inner) {
        this.r(c, cx - half, cy + dy, half * 2 + 1, 1, a);
      } else {
        const ih = Math.floor(Math.sqrt(inner * inner - dy * dy) + 0.5);
        this.r(c, cx - half, cy + dy, half - ih + 1, 1, a);
        this.r(c, cx + ih, cy + dy, half - ih + 1, 1, a);
      }
    }
    return this;
  }

  /** Bresenham line of t x t squares. */
  line(c: number, x0: number, y0: number, x1: number, y1: number, t = 1, a = 1): this {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.r(c, x0, y0, t, t, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  /** Rows of [x, w] pairs starting at y. */
  rows(c: number, x: number, y: number, spans: Array<[number, number]>, a = 1): this {
    spans.forEach(([sx, w], i) => this.r(c, x + sx, y + i, w, 1, a));
    return this;
  }
}

const TAU = Math.PI * 2;
const LAYER_W = 960;
const LAYER_H = 270;

// --- Shared silhouette profiles (periodic over 960 px so the layers tile) --------------------------

/** Top of the far skyline ridge at x (also used to stand the stone chariot on it). */
export function skylineRidgeY(x: number): number {
  const u = (x / LAYER_W) * TAU;
  const y = 190 + 9 * Math.sin(2 * u + 1) + 5 * Math.sin(5 * u + 2) + 3 * Math.sin(11 * u);
  return Math.round(y / 2) * 2;
}

function farHillY(x: number): number {
  const u = (x / LAYER_W) * TAU;
  const y = 172 + 12 * Math.sin(3 * u + 4) + 6 * Math.sin(7 * u + 1);
  return Math.round(y / 2) * 2;
}

function midGroundY(x: number): number {
  const u = (x / LAYER_W) * TAU;
  const y = 210 + 4 * Math.sin(3 * u) + 2 * Math.sin(7 * u + 1);
  return Math.round(y);
}

// --- Parallax layers -------------------------------------------------------------------------------

function drawSky(p: Pen): void {
  const stops: Array<[number, number]> = [[0, PAL.skyTop], [0.55, PAL.skyMid], [1, PAL.skyHorizon]];
  const colourAt = (t: number): number => {
    if (t <= stops[1]![0]) return mix(stops[0]![1], stops[1]![1], t / stops[1]![0]);
    return mix(stops[1]![1], stops[2]![1], Math.min(1, (t - stops[1]![0]) / (1 - stops[1]![0])));
  };
  const bands = 13;
  const bandH = 16;
  const horizonY = bands * bandH; // 208
  const colours: number[] = [];
  for (let i = 0; i < bands; i++) colours.push(colourAt(i / (bands - 1)));
  for (let i = 0; i < bands; i++) p.r(colours[i]!, 0, i * bandH, LAYER_W, bandH);
  p.r(colours[bands - 1]!, 0, horizonY, LAYER_W, LAYER_H - horizonY);
  // Ordered dither across each band boundary (2 px cells, three density rows).
  for (let i = 1; i < bands; i++) {
    const y = i * bandH;
    const next = colours[i]!;
    const prev = colours[i - 1]!;
    for (let cx = 0; cx < LAYER_W / 2; cx++) {
      const x = cx * 2;
      if (cx % 4 === 1) p.r(next, x, y - 4, 2, 2);
      if (cx % 2 === 0) p.r(next, x, y - 2, 2, 2);
      if (cx % 2 === 0) p.r(prev, x, y, 2, 2);
      if (cx % 4 === 3) p.r(prev, x, y + 2, 2, 2);
    }
  }

  // Pixel stars in the upper sky.
  const rand = rng(11);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rand() * LAYER_W);
    const y = Math.floor(rand() * 96);
    const a = 0.35 + rand() * 0.55 * (1 - y / 130);
    p.r(PAL.cream, x, y, 1, 1, a);
    if (rand() < 0.12) {
      p.r(PAL.cream, x - 1, y, 3, 1, a * 0.6);
      p.r(PAL.cream, x, y - 1, 1, 3, a * 0.6);
    }
  }

  // Large low sun with a soft halo and retro horizon slits.
  const sx = 360, sy = 168;
  p.disc(PAL.sun, sx, sy, 58, 0.1);
  p.disc(PAL.sun, sx, sy, 50, 0.14);
  p.disc(PAL.sun, sx, sy, 42);
  p.disc(PAL.gold, sx - 4, sy - 6, 30, 0.45);
  const slit = colours[bands - 2]!;
  p.r(slit, sx - 44, sy + 6, 88, 1, 0.9);
  p.r(slit, sx - 44, sy + 13, 88, 2, 0.9);
  p.r(slit, sx - 44, sy + 21, 88, 3, 0.9);
  p.r(slit, sx - 44, sy + 30, 88, 4, 0.9);

  // Thin cloud streaks near the horizon.
  const streak = mix(PAL.skyMid, PAL.skyHorizon, 0.35);
  for (const [x, y, w] of [[60, 150, 90], [520, 138, 120], [760, 160, 70], [200, 126, 60], [880, 120, 100]] as const) {
    p.r(streak, x, y, w, 2, 0.7);
    p.r(streak, x + 10, y - 2, w - 30, 2, 0.5);
    p.r(streak, x + 16, y + 2, w - 24, 1, 0.5);
  }

  // Kites.
  const kite = (x: number, y: number, c: number): void => {
    p.rows(c, x, y, [[3, 1], [2, 3], [1, 5], [0, 7], [1, 5], [2, 3], [2, 3], [3, 1], [3, 1]]);
    p.r(PAL.ink, x + 3, y + 1, 1, 7, 0.35);
    p.r(PAL.ink, x + 1, y + 3, 5, 1, 0.35);
    // tail
    for (let i = 0; i < 6; i++) p.r(PAL.cream, x + 3 - i - (i % 2), y + 10 + i * 2, 1, 1, 0.8);
  };
  kite(150, 58, PAL.gold);
  kite(560, 40, PAL.cream);
  kite(830, 76, PAL.glint);
}

function gopuram(p: Pen, c: number, cx: number, baseY: number, baseW: number, tiers: number, tierH: number): void {
  let w = baseW;
  let y = baseY;
  const shrink = Math.max(2, Math.floor((baseW * 0.55) / tiers / 2) * 2);
  for (let i = 0; i < tiers; i++) {
    const h = i === 0 ? tierH + 6 : tierH;
    p.r(c, cx - w / 2, y - h, w, h);
    p.r(c, cx - w / 2 - 1, y - h, w + 2, 2); // cornice
    // lamp-lit openings
    if (w > 12) p.r(PAL.gold, cx - 1, y - h + 4, 2, Math.min(3, h - 5), 0.55);
    y -= h;
    w -= shrink;
  }
  // barrel-vault cap with finials
  const capW = Math.max(8, w + 2);
  p.r(c, cx - capW / 2, y - 5, capW, 5);
  p.r(c, cx - capW / 2 + 2, y - 7, capW - 4, 2);
  for (let i = 0; i < 3; i++) p.r(c, cx - capW / 2 + 2 + Math.round((i * (capW - 5)) / 2), y - 9, 1, 2);
}

function pavilion(p: Pen, c: number, cx: number, topY: number, w: number, cols: number): void {
  p.r(c, cx - w / 2 - 2, topY, w + 4, 2);
  p.r(c, cx - w / 2, topY + 2, w, 3);
  for (let i = 0; i < cols; i++) {
    const x = Math.round(cx - w / 2 + 1 + (i * (w - 5)) / (cols - 1));
    p.r(c, x, topY + 5, 3, 18);
  }
  p.r(c, cx - w / 2 - 2, topY + 23, w + 4, 40);
}

function drawSkyline(p: Pen): void {
  const far = mix(PAL.skyline, PAL.skyHorizon, 0.3);
  for (let x = 0; x < LAYER_W; x += 2) p.r(far, x, farHillY(x), 2, LAYER_H - farHillY(x));
  const rand = rng(23);
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rand() * LAYER_W);
    p.disc(far, x, farHillY(x) + 2, 5 + Math.floor(rand() * 8));
  }

  const c = PAL.skyline;
  for (let x = 0; x < LAYER_W; x += 2) p.r(c, x, skylineRidgeY(x), 2, LAYER_H - skylineRidgeY(x));
  // Boulder ridge: round boulders sitting on the hills (kept away from the chariot spot at x ~ 396).
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rand() * LAYER_W);
    const rad = 4 + Math.floor(rand() * 10);
    if (x > 350 && x < 450) continue;
    p.disc(c, x, skylineRidgeY(x) + Math.floor(rad / 3), rad);
    if (rand() < 0.4) p.disc(c, x + rad, skylineRidgeY(x) - rad + 3, Math.max(3, rad - 4));
  }
  gopuram(p, c, 130, skylineRidgeY(130) + 4, 54, 7, 9);
  gopuram(p, c, 640, skylineRidgeY(640) + 4, 42, 6, 8);
  gopuram(p, c, 770, skylineRidgeY(770) + 4, 28, 5, 6);
  gopuram(p, c, 10, skylineRidgeY(10) + 4, 24, 4, 6);
  pavilion(p, c, 250, Math.min(skylineRidgeY(222), skylineRidgeY(278)) - 26, 56, 6);
  pavilion(p, c, 880, Math.min(skylineRidgeY(860), skylineRidgeY(900)) - 26, 40, 5);
  pavilion(p, c, 540, Math.min(skylineRidgeY(526), skylineRidgeY(554)) - 26, 28, 4);
}

function palm(p: Pen, c: number, x: number, baseY: number, h: number, lean: number, rand: () => number): void {
  for (let i = 0; i <= h; i++) {
    const t = i / h;
    p.r(c, x + Math.round(lean * t * t), baseY - i, i < h * 0.3 ? 3 : 2, 1);
  }
  const cx = x + lean + 1;
  const cy = baseY - h;
  const fronds = 8;
  for (let f = 0; f < fronds; f++) {
    const ang = -Math.PI * 0.08 + (f / (fronds - 1)) * Math.PI * 1.16; // fan from right to left
    const len = 16 + Math.floor(rand() * 7);
    const dx = Math.cos(ang);
    const up = Math.sin(ang) * 0.7;
    for (let s = 0; s <= len; s++) {
      const t = s / len;
      const px = Math.round(cx + dx * s);
      const py = Math.round(cy - up * s + 12 * t * t);
      p.r(c, px, py, 2, 1);
      if (s > 3 && s % 2 === 0) p.r(c, px, py + 1, 1, 2 + (s % 4 === 0 ? 1 : 0));
    }
  }
  p.disc(c, cx, cy + 1, 3);
}

function banana(p: Pen, c: number, x: number, baseY: number, rand: () => number): void {
  const leaves = 5;
  for (let f = 0; f < leaves; f++) {
    const dir = f / (leaves - 1) - 0.5; // -0.5 .. 0.5
    const len = 14 + Math.floor(rand() * 8);
    for (let s = 0; s <= len; s++) {
      const t = s / len;
      const px = Math.round(x + dir * 26 * t);
      const py = Math.round(baseY - 22 * Math.sin(t * Math.PI * 0.62) - 2 * t);
      const w = Math.max(1, Math.round(4 * Math.sin(t * Math.PI)));
      p.r(c, px - (w >> 1), py, w + 1, 2);
    }
  }
  p.r(c, x - 1, baseY - 8, 3, 10);
}

function drawMid(p: Pen): void {
  const c = PAL.mid;
  const rand = rng(37);
  // Trees first, then the ground band over their feet.
  const palms: Array<[number, number, number]> = [[40, 70, 8], [210, 58, -6], [232, 74, 5], [470, 64, -8], [700, 72, 6], [716, 56, -4], [905, 66, -7]];
  for (const [x, h, lean] of palms) palm(p, c, x, midGroundY(x) + 2, h, lean, rand);
  for (const x of [110, 300, 392, 600, 820]) banana(p, c, x, midGroundY(x) + 2, rand);
  // Round boulder piles.
  for (const x of [160, 345, 560, 770, 945]) {
    const y = midGroundY(x);
    p.disc(c, x, y - 2, 13);
    p.disc(c, x + 15, y, 9);
    p.disc(c, x - 13, y + 1, 8);
    p.disc(c, x + 5, y - 15, 7);
  }
  for (let x = 0; x < LAYER_W; x++) p.r(c, x, midGroundY(x), 1, LAYER_H - midGroundY(x));
  // A bend of the river with sunset glints.
  for (const [x0, w] of [[250, 150], [640, 110]] as const) {
    for (let i = 0; i < 4; i++) {
      p.r(PAL.water, x0 + i * 6, 216 + i * 2, w - i * 12, 2);
    }
    for (let i = 0; i < 14; i++) {
      const gx = x0 + 8 + Math.floor(rand() * (w - 30));
      const gy = 216 + Math.floor(rand() * 4) * 2;
      p.r(PAL.glint, gx, gy, 3 + Math.floor(rand() * 5), 1, 0.45 + rand() * 0.4);
    }
  }
}

function drawNear(p: Pen): void {
  const dark = mix(PAL.mossDark, PAL.ink, 0.62);
  const midc = mix(PAL.mossDark, PAL.ink, 0.35);
  const rand = rng(53);
  // Grass tufts along the very bottom edge (below the road surface, so they never cover obstacles).
  for (const x of [70, 215, 330, 505, 640, 790, 900]) {
    const blades = 6 + Math.floor(rand() * 5);
    for (let i = 0; i < blades; i++) {
      const bx = x + i * 3 + Math.floor(rand() * 2);
      const h = 7 + Math.floor(rand() * 12);
      const lean = Math.floor(rand() * 7) - 3;
      p.line(i % 3 === 0 ? midc : dark, bx, LAYER_H, bx + lean, LAYER_H - h, 2);
    }
  }
  // Hanging vines along the very top edge.
  for (const x of [150, 455, 745]) {
    const strands = 2 + Math.floor(rand() * 2);
    for (let sIdx = 0; sIdx < strands; sIdx++) {
      const vx = x + sIdx * 7;
      const len = 14 + Math.floor(rand() * 18);
      for (let y = 0; y < len; y++) {
        const wob = Math.round(Math.sin(y / 4 + sIdx) * 1.5);
        p.r(dark, vx + wob, y, 1, 1);
        if (y % 5 === 2) p.r(midc, vx + wob + (y % 10 === 2 ? 1 : -2), y, 2, 2);
      }
      p.r(midc, vx - 1, len, 3, 2);
    }
  }
}

// --- Terrain tile ----------------------------------------------------------------------------------

function drawGranite(p: Pen): void {
  const base = mix(PAL.graniteDark, PAL.graniteLight, 0.22);
  p.r(base, 0, 0, 16, 16);
  const rand = rng(71);
  for (let i = 0; i < 14; i++) p.r(PAL.graniteDark, Math.floor(rand() * 16), Math.floor(rand() * 16), 1, 1);
  for (let i = 0; i < 7; i++) p.r(mix(PAL.graniteDark, PAL.graniteLight, 0.5), Math.floor(rand() * 16), Math.floor(rand() * 16), 1, 1);
  p.r(PAL.graniteDark, 3, 5, 3, 1).r(PAL.graniteDark, 5, 6, 1, 2);
  p.r(PAL.graniteDark, 10, 12, 4, 1).r(PAL.graniteDark, 10, 13, 1, 1);
}

// --- Bike ------------------------------------------------------------------------------------------

function drawBikeBody(p: Pen): void {
  const R = PAL.bikeBody;
  const RH = mix(PAL.bikeBody, PAL.cream, 0.35);
  const C = PAL.chrome;
  const CD = mix(PAL.chrome, PAL.ink, 0.45);
  const K = PAL.tyre;
  const J = PAL.brown;
  const JD = mix(PAL.brown, PAL.ink, 0.4);
  const PN = mix(PAL.skyTop, PAL.chrome, 0.38);

  // Swingarm, rear shock, frame.
  p.r(K, 7, 22, 11, 1).r(K, 6, 23, 3, 1);
  p.line(C, 11, 16, 8, 21, 1);
  p.line(K, 14, 15, 17, 21, 1);
  p.line(K, 27, 14, 25, 21, 1);
  // Exhaust (long low pipe to the rear).
  p.r(C, 3, 20, 14, 1).r(CD, 3, 21, 14, 1).r(K, 2, 20, 1, 2);
  // Engine.
  p.r(CD, 17, 16, 9, 6);
  p.r(C, 18, 16, 3, 2).r(C, 22, 16, 3, 2);
  p.r(K, 17, 18, 9, 1);
  p.r(C, 18, 20, 6, 1).r(K, 20, 21, 2, 1);
  // Front fork + fender.
  p.line(C, 30, 11, 33, 23, 1);
  p.line(CD, 31, 11, 34, 23, 1);
  p.r(R, 29, 16, 8, 1).r(R, 28, 17, 2, 1).r(R, 36, 17, 2, 1);
  // Rear fender, tail cowl, tail light.
  p.r(R, 3, 16, 9, 1).r(R, 2, 17, 2, 1);
  p.r(R, 5, 13, 6, 3).r(RH, 6, 13, 4, 1).r(PAL.gold, 4, 14, 1, 1);
  // Seat.
  p.r(K, 9, 13, 10, 2);
  // Teardrop tank.
  p.r(R, 20, 10, 7, 1).r(R, 19, 11, 10, 2).r(R, 19, 13, 9, 1).r(R, 20, 14, 7, 1);
  p.r(RH, 21, 11, 5, 1);
  // Round headlamp, handlebar.
  p.r(K, 30, 9, 1, 3);
  p.r(C, 31, 8, 2, 5).r(C, 33, 9, 1, 3);
  p.r(PAL.gold, 33, 9, 2, 3).r(PAL.cream, 34, 10, 1, 1);
  p.r(K, 28, 8, 1, 3).r(K, 27, 7, 4, 1);

  // Rider: legs, torso, arm, helmet.
  p.r(PN, 13, 11, 7, 2).r(PN, 18, 12, 5, 2);
  p.r(PN, 21, 14, 2, 3).r(PN, 20, 16, 2, 3);
  p.r(K, 19, 19, 4, 1).r(K, 19, 18, 2, 1);
  p.rows(J, 0, 5, [[17, 5], [15, 7], [14, 8], [14, 7], [13, 7], [13, 6], [13, 6]]);
  p.r(JD, 13, 9, 2, 2).r(JD, 14, 8, 1, 1);
  p.r(JD, 20, 7, 3, 2).r(JD, 22, 8, 3, 2).r(JD, 25, 8, 2, 1);
  p.r(K, 27, 7, 1, 2);
  p.rows(PAL.cream, 0, 0, [[17, 5], [16, 7], [16, 7], [16, 7], [16, 7], [17, 5]]);
  p.r(PAL.gold, 16, 1, 5, 1);
  p.r(K, 21, 2, 2, 2);
  p.r(mix(PAL.cream, PAL.ink, 0.3), 16, 4, 3, 1);
}

function drawWheel(p: Pen): void {
  const K = PAL.tyre;
  const C = PAL.chrome;
  const CD = mix(PAL.chrome, PAL.ink, 0.45);
  p.rows(K, 0, 0, [[4, 4], [2, 8], [1, 10], [1, 10], [0, 12], [0, 12], [0, 12], [0, 12], [1, 10], [1, 10], [2, 8], [4, 4]]);
  p.rows(CD, 2, 2, [[2, 4], [1, 6], [0, 8], [0, 8], [0, 8], [0, 8], [1, 6], [2, 4]]);
  p.rows(K, 3, 3, [[1, 4], [0, 6], [0, 6], [0, 6], [0, 6], [1, 4]]);
  p.r(C, 5, 3, 2, 6);       // bright spoke pair (makes the rotation readable)
  p.r(CD, 3, 5, 6, 2);
  p.r(C, 5, 5, 2, 2);
}

// --- Obstacles and characters ----------------------------------------------------------------------

function drawPillar(p: Pen): void {
  const L = PAL.graniteLight;
  const D = PAL.graniteDark;
  const H = mix(PAL.graniteLight, PAL.cream, 0.35);
  p.r(PAL.ink, 1, 15, 46, 1, 0.35);
  p.r(L, 3, 2, 40, 12);
  p.r(H, 3, 2, 40, 2);
  p.r(D, 3, 11, 40, 3);
  p.r(D, 3, 6, 40, 1, 0.45).r(D, 3, 9, 40, 1, 0.3);
  // base (left) and capital (right)
  p.r(L, 0, 1, 4, 14).r(H, 0, 1, 4, 2).r(D, 0, 12, 4, 3).r(D, 4, 2, 1, 12, 0.6);
  p.r(L, 41, 0, 3, 15).r(L, 44, 1, 4, 14).r(H, 41, 0, 3, 2).r(H, 44, 1, 4, 2);
  p.r(D, 41, 12, 7, 3).r(D, 40, 2, 1, 12, 0.6);
  // cracks
  p.r(D, 15, 2, 1, 5).r(D, 16, 6, 1, 4).r(D, 28, 5, 1, 6).r(D, 27, 4, 1, 2);
  // moss
  p.r(PAL.mossDark, 7, 1, 7, 2).r(PAL.mossLight, 8, 1, 4, 1).r(PAL.mossDark, 9, 3, 3, 1);
  p.r(PAL.mossDark, 30, 1, 6, 2).r(PAL.mossLight, 31, 1, 3, 1);
}

function drawCart(p: Pen): void {
  const B = PAL.brown;
  const BD = mix(PAL.brown, PAL.ink, 0.45);
  const BL = mix(PAL.brown, PAL.brass, 0.5);
  p.r(PAL.ink, 1, 31, 46, 1, 0.35);
  // hay load
  p.rows(PAL.brass, 0, 1, [[10, 22], [7, 28], [5, 33], [4, 35], [4, 36], [4, 36], [4, 36], [4, 36], [4, 36]]);
  p.r(PAL.gold, 11, 1, 16, 1).r(PAL.gold, 8, 3, 10, 1).r(PAL.gold, 24, 4, 9, 1).r(PAL.gold, 14, 6, 12, 1);
  // side rails
  p.r(B, 2, 5, 41, 2).r(BL, 2, 5, 41, 1);
  for (const x of [2, 11, 21, 31, 41]) p.r(B, x, 5, 2, 9).r(BL, x, 5, 1, 9);
  // bed
  p.r(B, 0, 13, 45, 3).r(BL, 0, 13, 45, 1).r(BD, 0, 16, 45, 1);
  // prop leg (rear) and yoke pole resting on the ground (front)
  p.r(BD, 3, 17, 2, 14);
  p.line(B, 43, 15, 46, 30, 2);
  // big spoked wheel
  const cx = 22, cy = 21;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 4 + 0.2;
    p.line(BL, cx - Math.cos(a) * 8, cy - Math.sin(a) * 8, cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, 1);
  }
  p.ring(BD, cx, cy, 10, 3);
  p.ring(B, cx, cy, 10, 2);
  p.disc(PAL.brass, cx, cy, 2);
}

function drawCow(p: Pen): void {
  const W = PAL.cream;
  const S = mix(PAL.cream, PAL.brown, 0.3);
  const B = PAL.brown;
  // far legs
  p.r(S, 13, 17, 2, 6).r(S, 20, 17, 2, 6);
  // tail
  p.r(S, 29, 8, 1, 9).r(B, 29, 17, 1, 3);
  // body + hump
  p.r(W, 8, 7, 21, 10).r(W, 9, 6, 19, 1);
  p.r(W, 11, 4, 6, 3).r(W, 12, 3, 4, 1);
  p.r(S, 8, 15, 21, 2).r(S, 19, 17, 3, 1);
  // patches
  p.r(B, 16, 8, 5, 4).r(B, 17, 12, 3, 1).r(B, 23, 11, 4, 3).r(B, 24, 10, 2, 1);
  // near legs + hooves
  p.r(W, 9, 17, 3, 6).r(W, 24, 17, 3, 6);
  p.r(PAL.ink, 9, 23, 3, 1).r(PAL.ink, 24, 23, 3, 1).r(PAL.ink, 13, 23, 2, 1).r(PAL.ink, 20, 23, 2, 1);
  // neck, head (facing left, toward the rider)
  p.r(W, 6, 8, 4, 7);
  p.r(W, 2, 6, 6, 6).r(W, 1, 9, 2, 4).r(W, 3, 12, 4, 1);
  p.r(mix(PAL.cream, PAL.bikeBody, 0.3), 1, 11, 3, 2);
  p.r(PAL.ink, 4, 8, 1, 1).r(PAL.ink, 1, 12, 1, 1);
  p.r(S, 8, 6, 2, 2);
  // horns
  p.r(PAL.brass, 3, 4, 1, 2).r(PAL.brass, 2, 3, 1, 1).r(PAL.brass, 7, 4, 1, 2).r(PAL.brass, 8, 3, 1, 1);
  // bell on a cord
  p.r(PAL.bikeBody, 6, 14, 4, 1).r(PAL.gold, 7, 15, 2, 2);
}

function drawMonkey(p: Pen): void {
  const B = PAL.brown;
  const BD = mix(PAL.brown, PAL.ink, 0.4);
  const F = PAL.cream;
  // frame 0 (x 0..15): running on all fours, facing left
  p.r(B, 4, 7, 9, 4).r(B, 5, 6, 7, 1);
  p.r(B, 1, 3, 5, 5).r(B, 0, 4, 1, 2).r(F, 1, 5, 3, 3).r(PAL.ink, 2, 5, 1, 1).r(BD, 5, 3, 1, 1);
  p.r(BD, 4, 11, 2, 4).r(B, 6, 11, 2, 3).r(BD, 11, 11, 2, 4).r(B, 9, 11, 2, 3);
  p.r(BD, 3, 15, 2, 1).r(BD, 10, 15, 2, 1);
  p.r(B, 13, 5, 1, 4).r(B, 14, 3, 1, 3).r(B, 13, 2, 1, 1);
  // frame 1 (x 16..31): sitting, facing left
  const o = 16;
  p.r(B, o + 5, 7, 7, 8).r(B, o + 6, 6, 5, 1);
  p.r(B, o + 3, 1, 6, 6).r(B, o + 2, 3, 1, 2).r(B, o + 9, 2, 1, 2);
  p.r(F, o + 3, 3, 4, 3).r(PAL.ink, o + 4, 3, 1, 1).r(PAL.ink, o + 6, 3, 1, 1).r(BD, o + 4, 5, 2, 1);
  p.r(F, o + 6, 9, 3, 4);
  p.r(BD, o + 4, 9, 2, 4).r(BD, o + 3, 14, 5, 2).r(BD, o + 10, 13, 2, 3);
  p.r(B, o + 12, 13, 2, 1).r(B, o + 14, 10, 1, 4).r(B, o + 13, 9, 1, 1);
}

function drawDeepastambha(p: Pen): void {
  const L = PAL.graniteLight;
  const D = PAL.graniteDark;
  const H = mix(PAL.graniteLight, PAL.cream, 0.35);
  for (let f = 0; f < 2; f++) {
    const o = f * 8;
    const lit = f === 1;
    // stepped base
    p.r(D, o, 45, 8, 3).r(L, o, 45, 7, 1);
    p.r(L, o + 1, 41, 6, 4).r(D, o + 5, 42, 2, 3).r(H, o + 1, 41, 5, 1);
    // shaft
    p.r(L, o + 3, 8, 2, 33).r(D, o + 4, 8, 1, 33).r(H, o + 3, 8, 1, 33, 0.5);
    // lamp brackets
    for (let y = 13; y <= 37; y += 6) {
      p.r(L, o + 1, y, 6, 1).r(D, o + 1, y + 1, 6, 1, 0.7);
      p.r(lit ? PAL.gold : PAL.brass, o, y - 1, 2, 1).r(lit ? PAL.gold : PAL.brass, o + 6, y - 1, 2, 1);
      if (lit) p.r(PAL.sun, o, y - 3, 1, 2).r(PAL.sun, o + 7, y - 3, 1, 2).r(PAL.cream, o, y - 2, 1, 1).r(PAL.cream, o + 7, y - 2, 1, 1);
    }
    // capital and top lamp bowl
    p.r(L, o + 2, 6, 4, 2).r(D, o + 5, 6, 1, 2);
    p.r(lit ? PAL.gold : PAL.brass, o + 1, 4, 6, 2).r(D, o + 2, 5, 4, 1, 0.5);
    if (lit) p.r(PAL.sun, o + 3, 0, 2, 4).r(PAL.gold, o + 2, 2, 4, 2).r(PAL.cream, o + 3, 2, 2, 2);
    else p.r(D, o + 3, 3, 2, 1);
  }
}

function drawDiya(p: Pen): void {
  const BD = mix(PAL.brass, PAL.ink, 0.4);
  p.r(PAL.brass, 0, 5, 8, 1).r(PAL.brass, 1, 6, 6, 1).r(BD, 2, 7, 4, 1);
  p.r(PAL.gold, 1, 5, 3, 1);
  p.r(PAL.sun, 3, 1, 2, 4).r(PAL.gold, 3, 2, 2, 3).r(PAL.cream, 3, 3, 2, 2).r(PAL.sun, 4, 0, 1, 1);
}

function drawGateway(p: Pen): void {
  const L = PAL.graniteLight;
  const D = PAL.graniteDark;
  const H = mix(PAL.graniteLight, PAL.cream, 0.35);
  const M = mix(PAL.graniteLight, PAL.graniteDark, 0.5);
  const pillarAt = (x: number): void => {
    p.r(L, x, 38, 18, 58);
    p.r(H, x, 38, 3, 58).r(D, x + 14, 38, 4, 58).r(M, x + 11, 38, 3, 58);
    for (let y = 48; y < 96; y += 10) p.r(D, x, y, 18, 1, 0.55);
    p.r(L, x - 2, 88, 22, 8).r(H, x - 2, 88, 22, 1).r(D, x - 2, 94, 22, 2);
    p.r(L, x - 2, 36, 22, 4).r(H, x - 2, 36, 22, 1).r(D, x - 2, 39, 22, 1);
    // carved niche with a lamp
    p.r(D, x + 6, 56, 6, 10).r(PAL.gold, x + 8, 62, 2, 2).r(PAL.sun, x + 8, 60, 2, 2);
  };
  pillarAt(10);
  pillarAt(68);
  // lintel
  p.r(L, 4, 26, 88, 10).r(H, 4, 26, 88, 2).r(D, 4, 33, 88, 3);
  p.r(L, 1, 23, 94, 3).r(H, 1, 23, 94, 1);
  for (let x = 10; x < 90; x += 12) p.r(D, x, 28, 1, 5, 0.5);
  // ruined stepped tower above
  p.r(L, 10, 14, 72, 9).r(H, 10, 14, 72, 1).r(D, 10, 21, 72, 2);
  p.r(L, 18, 6, 46, 8).r(H, 18, 6, 46, 1).r(D, 18, 12, 46, 2);
  p.r(L, 24, 0, 22, 6).r(H, 24, 0, 22, 1).r(D, 24, 5, 22, 1);
  p.r(L, 52, 3, 8, 3).r(H, 52, 3, 8, 1);
  for (let x = 16; x < 80; x += 10) p.r(D, x, 16, 4, 4, 0.6);
  for (let x = 24; x < 60; x += 9) p.r(D, x, 8, 3, 3, 0.6);
  // moss and a hanging vine
  p.r(PAL.mossDark, 64, 5, 12, 2).r(PAL.mossLight, 66, 5, 6, 1);
  p.r(PAL.mossDark, 2, 22, 14, 2).r(PAL.mossLight, 4, 22, 7, 1);
  p.r(PAL.mossDark, 78, 13, 8, 2).r(PAL.mossLight, 80, 13, 4, 1);
  for (let y = 36; y < 54; y++) p.r(PAL.mossDark, 62 + Math.round(Math.sin(y / 3)), y, 1, 1);
  p.r(PAL.mossLight, 61, 54, 3, 2);
}

function drawCoracle(p: Pen): void {
  const B = PAL.brown;
  const BD = mix(PAL.brown, PAL.ink, 0.45);
  // boatman
  p.r(PAL.cream, 10, 0, 2, 2).r(PAL.bikeBody, 9, 2, 4, 3);
  p.line(BD, 14, 1, 19, 6, 1);
  // round basket hull
  p.r(PAL.brass, 0, 4, 24, 1);
  p.r(B, 0, 5, 24, 1).r(B, 1, 6, 22, 1).r(B, 2, 7, 20, 1).r(BD, 4, 8, 16, 1).r(BD, 7, 9, 10, 1);
  for (let x = 2; x < 22; x += 3) p.r(BD, x, 5 + (x % 2), 1, 2);
}

function drawChariot(p: Pen): void {
  const c = PAL.skyline;
  p.disc(c, 14, 39, 8).disc(c, 46, 39, 8);
  p.r(c, 2, 28, 56, 6);
  for (const x of [9, 17, 39, 47]) p.r(c, x, 12, 4, 16);
  p.r(c, 25, 12, 10, 16);
  p.r(c, 5, 9, 50, 3).r(c, 11, 5, 38, 4).r(c, 18, 2, 24, 3).r(c, 26, 0, 8, 2);
}

function drawGlow(p: Pen): void {
  for (let cy = 0; cy < 16; cy++) {
    for (let cx = 0; cx < 16; cx++) {
      const d = Math.hypot(cx - 7.5, cy - 7.5);
      let a = 0;
      if (d < 2.5) a = 0.5;
      else if (d < 4.5) a = 0.3;
      else if (d < 6.2) a = (cx + cy) % 2 === 0 ? 0.24 : 0.1;
      else if (d < 7.8) a = (cx + cy) % 2 === 0 && cy % 2 === 0 ? 0.14 : 0;
      if (a > 0) p.r(PAL.sun, cx * 2, cy * 2, 2, 2, a);
    }
  }
}

function drawStar(p: Pen, c: number, shade: number | null): void {
  p.rows(c, 0, 0, [
    [6, 1], [6, 1], [5, 3], [5, 3], [0, 13], [1, 11], [2, 9], [3, 7], [3, 7], [2, 9], [2, 9], [1, 11],
  ]);
  // notch between the legs
  p.r(PAL.ink, 6, 9, 1, 1).r(PAL.ink, 5, 10, 3, 1).r(PAL.ink, 4, 11, 5, 1);
  if (shade !== null) p.r(shade, 6, 2, 1, 2).r(shade, 3, 5, 4, 1);
}

function drawBubble(p: Pen): void {
  p.r(PAL.ink, 1, 0, 18, 11).r(PAL.ink, 0, 1, 20, 9);
  p.r(PAL.cream, 1, 1, 18, 9);
  p.r(PAL.ink, 5, 11, 4, 1).r(PAL.ink, 6, 12, 2, 1).r(PAL.cream, 6, 10, 2, 2);
  for (const x of [5, 9, 13]) p.r(PAL.ink, x, 5, 2, 2);
}

// --- Registry ---------------------------------------------------------------------------------------

interface Def {
  w: number;
  h: number;
  draw: (p: Pen) => void;
  wrap?: boolean;
  /** frame size for strips (frames are numbered 0..n-1, left to right) */
  frameW?: number;
}

/** The 6.4 manifest: these names may be replaced by PNGs in public/assets. */
export const MANIFEST: Record<string, Def> = {
  bg_sky: { w: LAYER_W, h: LAYER_H, draw: drawSky, wrap: true },
  bg_skyline: { w: LAYER_W, h: LAYER_H, draw: drawSkyline, wrap: true },
  bg_mid: { w: LAYER_W, h: LAYER_H, draw: drawMid, wrap: true },
  fg_near: { w: LAYER_W, h: LAYER_H, draw: drawNear, wrap: true },
  bike_body: { w: 40, h: 24, draw: drawBikeBody },
  wheel: { w: 12, h: 12, draw: drawWheel },
  tile_granite: { w: 16, h: 16, draw: drawGranite },
  pillar: { w: 48, h: 16, draw: drawPillar },
  cart: { w: 48, h: 32, draw: drawCart },
  cow: { w: 32, h: 24, draw: drawCow },
  monkey: { w: 32, h: 16, draw: drawMonkey, frameW: 16 },
  deepastambha: { w: 16, h: 48, draw: drawDeepastambha, frameW: 8 },
  diya: { w: 8, h: 8, draw: drawDiya },
  gateway: { w: 96, h: 96, draw: drawGateway },
  coracle: { w: 24, h: 10, draw: drawCoracle },
};

/** Extra code-only textures (effects and UI icons); not part of the PNG manifest. */
const EXTRAS: Record<string, Def> = {
  chariot: { w: 60, h: 48, draw: drawChariot },
  glow: { w: 32, h: 32, draw: drawGlow },
  star_on: { w: 13, h: 12, draw: (p) => drawStar(p, PAL.uiYellow, PAL.cream) },
  star_off: { w: 13, h: 12, draw: (p) => drawStar(p, mix(PAL.ink, PAL.uiYellow, 0.28), null) },
  bubble: { w: 20, h: 13, draw: drawBubble },
  p_dust: { w: 2, h: 2, draw: (p) => p.r(PAL.graniteLight, 0, 0, 2, 2, 0.8) },
  p_smoke: { w: 3, h: 3, draw: (p) => p.r(PAL.cream, 1, 0, 1, 3, 0.45).r(PAL.cream, 0, 1, 3, 1, 0.45) },
  p_spark: { w: 2, h: 2, draw: (p) => p.r(PAL.gold, 0, 0, 2, 2).r(PAL.cream, 0, 0, 1, 1) },
  p_splash: { w: 2, h: 2, draw: (p) => p.r(mix(PAL.water, PAL.cream, 0.65), 0, 0, 2, 2) },
  p_glint: { w: 6, h: 1, draw: (p) => p.r(PAL.glint, 0, 0, 6, 1).r(PAL.sun, 2, 0, 2, 1) },
};

/** Draw every texture that is not already present (i.e. not supplied as a PNG). */
export function generatePlaceholders(scene: Phaser.Scene): void {
  const g = scene.make.graphics({}, false);
  const all: Record<string, Def> = { ...MANIFEST, ...EXTRAS };
  for (const [key, def] of Object.entries(all)) {
    if (scene.textures.exists(key)) continue;
    g.clear();
    def.draw(new Pen(g, def.wrap ? def.w : 0));
    g.generateTexture(key, def.w, def.h);
    if (def.frameW) {
      const tex = scene.textures.get(key);
      for (let i = 0; i * def.frameW < def.w; i++) tex.add(i, 0, i * def.frameW, 0, def.frameW, def.h);
    }
  }
  g.destroy();
}
