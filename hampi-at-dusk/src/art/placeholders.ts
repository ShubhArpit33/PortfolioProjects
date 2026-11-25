// Code-drawn placeholder art (GAME_SPEC.md section 6). Every texture is drawn with integer-aligned
// fillRects on a Phaser Graphics object and baked with generateTexture, so pixels stay crisp.
// The parallax layers, the landmark and the light / mist sprites are not here: they come from the stage
// theme, baked by the look system (src/art/look).

import Phaser from 'phaser';
import { BIKE_TEXTURES } from './bikeArt';
import { PAL, mix, rng } from './palette';
import { Pen } from './pen';

const LAYER_W = 960;
const LAYER_H = 270;

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

/**
 * Standing colonnade behind the Mandapa Run plinth (decoration only, low contrast so the fallen pillars
 * and diyas in front of it stay readable). 192 x 72, four columns under a lintel, one of them broken.
 */
function drawColonnade(p: Pen): void {
  const C = mix(PAL.mid, PAL.graniteDark, 0.55);
  const HI = mix(C, PAL.graniteLight, 0.22);
  const xs = [10, 58, 106, 154];
  xs.forEach((x, i) => {
    const broken = i === 2;
    const top = broken ? 38 : 10;
    p.r(C, x, top, 8, 72 - top);
    p.r(HI, x, top, 2, 72 - top);
    p.r(C, x - 2, 66, 12, 6).r(HI, x - 2, 66, 12, 1);       // base
    if (broken) p.r(C, x + 1, top - 2, 4, 2).r(C, x + 5, top - 1, 2, 1);
    else p.r(C, x - 2, top, 12, 3).r(C, x - 4, top - 3, 16, 3).r(HI, x - 4, top - 3, 16, 1); // capital
  });
  // lintel: whole between the first two columns, fallen away toward the broken one
  p.r(C, 0, 0, 84, 7).r(HI, 0, 0, 84, 1).r(C, 84, 2, 10, 5).r(C, 94, 4, 5, 3);
  p.r(C, 146, 0, 46, 7).r(HI, 146, 0, 46, 1).r(C, 140, 3, 6, 4);
}

/**
 * The log on the Warm-up Road (v1.7): 20 x 10, a short trunk lying on the road, its cut end to the left.
 * The hitbox is the middle 16 x 8. Riding into it is only a stumble, so it is small and soft-edged.
 */
function drawLog(p: Pen): void {
  const B = PAL.brown;
  const BD = mix(PAL.brown, PAL.ink, 0.45);
  const BL = mix(PAL.brown, PAL.brass, 0.5);
  const C = mix(PAL.cream, PAL.brass, 0.35);
  p.r(PAL.ink, 1, 9, 19, 1, 0.35);
  // trunk
  p.r(B, 3, 2, 16, 7).r(B, 2, 3, 18, 5);
  p.r(BL, 4, 2, 14, 1).r(BL, 5, 3, 6, 1, 0.5);
  p.r(BD, 3, 7, 16, 2).r(BD, 19, 4, 1, 3);
  // bark
  p.r(BD, 7, 4, 4, 1).r(BD, 13, 5, 4, 1).r(BD, 9, 6, 3, 1).r(BL, 15, 3, 2, 1);
  // the cut end, with rings
  p.r(C, 1, 2, 3, 7).r(C, 0, 3, 1, 5);
  p.r(PAL.brass, 1, 4, 2, 3).r(C, 1, 5, 1, 1).r(BD, 3, 2, 1, 7, 0.5);
  // a snapped branch stub and a little moss
  p.r(B, 13, 0, 2, 2).r(BL, 13, 0, 2, 1);
  p.r(PAL.mossDark, 6, 1, 5, 1).r(PAL.mossLight, 7, 1, 2, 1);
}

/**
 * The rolling boulder (v1.7): 22 x 22, a round granite rock. Its marks (a crack, a chipped facet, a moss
 * patch) are off-centre so the turning shows. Outlined in ink: it has to read against stone and sky.
 */
function drawBoulder(p: Pen): void {
  const L = PAL.graniteLight;
  const D = PAL.graniteDark;
  const H = mix(PAL.graniteLight, PAL.cream, 0.4);
  const M = mix(PAL.graniteLight, PAL.graniteDark, 0.5);
  p.disc(PAL.ink, 11, 11, 10);
  p.disc(L, 11, 11, 9);
  // a darker half and a lighter cap, both off-centre
  p.rows(M, 0, 12, [[3, 17], [3, 17], [4, 15], [4, 15], [5, 13], [6, 11], [8, 7]]);
  p.rows(D, 0, 15, [[9, 9], [8, 10], [8, 9], [9, 6]]);
  p.rows(H, 0, 3, [[7, 6], [5, 7], [4, 5], [4, 3]]);
  // a crack across it and a chipped facet
  p.r(D, 12, 4, 1, 3).r(D, 13, 6, 1, 3).r(D, 14, 8, 2, 1).r(D, 15, 9, 1, 3).r(D, 16, 11, 2, 1);
  p.r(D, 5, 9, 3, 1).r(D, 4, 10, 2, 2).r(H, 6, 10, 2, 1);
  // speckles
  p.r(D, 9, 7, 1, 1).r(D, 7, 13, 1, 1).r(H, 16, 14, 1, 1).r(H, 11, 16, 2, 1).r(D, 18, 9, 1, 1);
  // moss on one shoulder
  p.r(PAL.mossDark, 14, 2, 4, 2).r(PAL.mossDark, 17, 4, 2, 2).r(PAL.mossLight, 15, 2, 2, 1);
}

/**
 * The same rock an eighth of a turn on (anticlockwise, the way it rolls). The outline stays the clean
 * disc; only the marks inside it move. With the first texture turned by quarter turns this gives eight
 * crisp frames per revolution, with no rotated-sprite fringes.
 */
function drawBoulderTurned(p: Pen): void {
  const N = 22;
  const grid: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(-1));
  // Paint the rock into a 22 x 22 grid of colours first (-1 = nothing there).
  let colour = 0;
  drawBoulder(new Pen({
    fillStyle: (c: number) => { colour = c; },
    fillRect: (x: number, y: number, w: number, h: number) => {
      for (let yy = Math.max(0, y); yy < Math.min(N, y + h); yy++) {
        for (let xx = Math.max(0, x); xx < Math.min(N, x + w); xx++) grid[yy]![xx] = colour;
      }
    },
  }));
  const cos = Math.SQRT1_2;
  const sin = Math.SQRT1_2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const own = grid[y]![x]!;
      if (own < 0) continue; // outside the disc
      const dx = x - 11;
      const dy = y - 11;
      let c = own;
      if (dx * dx + dy * dy <= 8.6 * 8.6) {
        // inside the rim: take the pixel that an anticlockwise eighth of a turn brings here
        const sx = Math.round(11 + dx * cos - dy * sin);
        const sy = Math.round(11 + dx * sin + dy * cos);
        const from = grid[sy]?.[sx];
        if (from !== undefined && from >= 0 && from !== PAL.ink) c = from;
      } else if (own !== PAL.ink) {
        c = PAL.graniteLight; // the ring just inside the outline: plain stone
      }
      p.r(c, x, y, 1, 1);
    }
  }
}

/**
 * The temple doorway on the terrace (v1.7, decoration): 96 x 80, in the colonnade's dark, low-contrast tone.
 * Two heavy jambs under a stepped lintel, a black opening (the boulder comes out of it), two worn steps.
 */
function drawTempleDoor(p: Pen): void {
  const C = mix(PAL.mid, PAL.graniteDark, 0.55);
  const HI = mix(C, PAL.graniteLight, 0.25);
  const SH = mix(PAL.mid, PAL.ink, 0.5);
  // wall behind, ragged at the top where it has fallen
  p.r(C, 6, 26, 84, 54);
  p.rows(C, 0, 20, [[10, 14], [8, 20], [6, 30], [6, 34], [6, 40], [6, 44]]);
  p.rows(C, 0, 20, [[70, 12], [66, 20], [62, 26], [58, 32], [54, 36], [52, 38]]);
  for (let y = 32; y < 76; y += 8) p.r(SH, 6, y, 84, 1, 0.5);
  for (let x = 14; x < 88; x += 16) for (let y = 32; y < 72; y += 16) p.r(SH, x, y, 1, 8, 0.4);
  // stepped lintel and cornice
  p.r(C, 18, 12, 60, 14).r(HI, 18, 12, 60, 1);
  p.r(C, 14, 8, 68, 4).r(HI, 14, 8, 68, 1);
  p.r(C, 24, 3, 48, 5).r(HI, 24, 3, 48, 1);
  p.r(C, 38, 0, 20, 3).r(HI, 38, 0, 20, 1);
  for (let x = 22; x < 76; x += 9) p.r(SH, x, 15, 3, 4, 0.6);
  // jambs
  for (const x of [20, 62]) {
    p.r(C, x, 22, 14, 52);
    p.r(HI, x, 22, 2, 52);
    p.r(SH, x + 11, 22, 3, 52, 0.6);
    p.r(C, x - 2, 22, 18, 4).r(HI, x - 2, 22, 18, 1);
    p.r(C, x - 2, 68, 18, 6).r(HI, x - 2, 68, 18, 1);
    p.r(SH, x + 4, 36, 5, 9, 0.7);
  }
  // the opening
  p.r(SH, 34, 26, 28, 48);
  p.r(PAL.ink, 36, 28, 24, 46, 0.55);
  // steps
  p.r(C, 26, 74, 44, 3).r(HI, 26, 74, 44, 1);
  p.r(C, 20, 77, 56, 3).r(HI, 20, 77, 56, 1);
}

/**
 * Ruins beside the Ruins Road (v1.7, decoration only, in the colonnade's tone). A: 160 x 64, a broken hall:
 * columns of different heights, one length of lintel still up, blocks on the ground.
 */
function drawRuinsA(p: Pen): void {
  const C = mix(PAL.mid, PAL.graniteDark, 0.55);
  const HI = mix(C, PAL.graniteLight, 0.22);
  const SH = mix(PAL.mid, PAL.ink, 0.5);
  const column = (x: number, top: number, capital: boolean): void => {
    p.r(C, x, top, 8, 64 - top).r(HI, x, top, 2, 64 - top);
    p.r(C, x - 2, 58, 12, 6).r(HI, x - 2, 58, 12, 1);
    if (capital) p.r(C, x - 2, top, 12, 3).r(C, x - 4, top - 3, 16, 3).r(HI, x - 4, top - 3, 16, 1);
    else p.r(C, x + 1, top - 2, 4, 2).r(C, x + 5, top - 1, 2, 1);
  };
  column(8, 12, true);
  column(46, 12, true);
  column(84, 34, false);
  column(134, 22, false);
  // the lintel between the first two; it has broken off past the second
  p.r(C, 0, 2, 66, 7).r(HI, 0, 2, 66, 1).r(C, 66, 4, 8, 5).r(C, 74, 6, 4, 3);
  // fallen blocks
  p.r(C, 100, 54, 22, 10).r(HI, 100, 54, 22, 1).r(SH, 100, 62, 22, 2, 0.5);
  p.r(C, 106, 46, 12, 8).r(HI, 106, 46, 12, 1);
  p.r(C, 148, 57, 12, 7).r(HI, 148, 57, 12, 1);
  p.r(C, 22, 58, 16, 6).r(HI, 22, 58, 16, 1);
}

/** Ruins B: 128 x 56, a small roofed shrine with a lamp niche, and a stack of boulders beside it. */
function drawRuinsB(p: Pen): void {
  const C = mix(PAL.mid, PAL.graniteDark, 0.55);
  const HI = mix(C, PAL.graniteLight, 0.22);
  const SH = mix(PAL.mid, PAL.ink, 0.5);
  // plinth, four short pillars, a stepped roof
  p.r(C, 4, 50, 64, 6).r(HI, 4, 50, 64, 1);
  for (const x of [8, 24, 44, 60]) p.r(C, x, 24, 5, 26).r(HI, x, 24, 1, 26);
  p.r(SH, 13, 26, 11, 24, 0.55).r(SH, 29, 26, 15, 24, 0.7).r(SH, 49, 26, 11, 24, 0.55);
  p.r(C, 2, 18, 68, 6).r(HI, 2, 18, 68, 1);
  p.r(C, 8, 12, 56, 6).r(HI, 8, 12, 56, 1);
  p.r(C, 16, 6, 40, 6).r(HI, 16, 6, 40, 1);
  p.r(C, 26, 1, 20, 5).r(HI, 26, 1, 20, 1);
  p.r(C, 33, 0, 6, 1);
  // a lamp left burning in the middle bay
  p.r(PAL.brass, 35, 44, 3, 1, 0.9).r(PAL.gold, 36, 42, 1, 2).r(PAL.sun, 34, 41, 5, 4, 0.18);
  // boulders
  p.disc(C, 96, 44, 12).disc(HI, 91, 37, 3, 0.5);
  p.disc(C, 114, 49, 8);
  p.disc(C, 104, 27, 7).disc(HI, 101, 23, 2, 0.5);
  p.r(C, 82, 52, 46, 4);
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

/** Two 5x3 frames: wings up, wings down. */
function drawBird(p: Pen): void {
  const c = mix(PAL.skyTop, PAL.ink, 0.6);
  p.r(c, 0, 0, 1, 1).r(c, 1, 1, 3, 1).r(c, 4, 0, 1, 1);
  p.r(c, 5, 1, 2, 1).r(c, 7, 2, 1, 1).r(c, 8, 1, 2, 1);
}

/** Two 9x5 frames: wings spread, wings beating down. */
function drawBat(p: Pen): void {
  const c = PAL.ink;
  p.rows(c, 0, 0, [[3, 1], [0, 2], [0, 9], [0, 1]]);
  p.r(c, 5, 0, 1, 1).r(c, 3, 1, 3, 1).r(c, 7, 1, 2, 1).r(c, 2, 3, 1, 1).r(c, 4, 3, 1, 1).r(c, 6, 3, 1, 1).r(c, 8, 3, 1, 1);
  const o = 9;
  p.r(c, o + 3, 0, 1, 1).r(c, o + 5, 0, 1, 1).r(c, o + 3, 1, 3, 1).r(c, o + 1, 2, 7, 1);
  p.r(c, o, 3, 3, 1).r(c, o + 4, 3, 1, 1).r(c, o + 6, 3, 3, 1).r(c, o, 4, 1, 1).r(c, o + 8, 4, 1, 1);
}

function drawFirefly(p: Pen): void {
  const c = mix(PAL.mossLight, PAL.gold, 0.45);
  p.r(c, 1, 0, 1, 3, 0.3).r(c, 0, 1, 3, 1, 0.3).r(c, 1, 1, 1, 1);
}

function drawWisp(p: Pen): void {
  const c = mix(PAL.skyline, PAL.cream, 0.5);
  p.r(c, 1, 0, 3, 1, 0.45).r(c, 0, 1, 5, 2, 0.45).r(c, 1, 3, 4, 1, 0.45).r(c, 1, 1, 3, 2, 0.3);
}

function drawLampGlow(p: Pen): void {
  p.r(PAL.sun, 2, 0, 2, 6, 0.22).r(PAL.sun, 0, 2, 6, 2, 0.22).r(PAL.sun, 1, 1, 4, 4, 0.3).r(PAL.gold, 2, 2, 2, 2, 0.9);
}

/** Boost exhaust flame, 2 frames of 9 x 5 (long, short). The nozzle is at the right edge. */
function drawFlame(p: Pen): void {
  // long
  p.r(PAL.glint, 1, 1, 8, 3, 0.9).r(PAL.glint, 0, 2, 2, 1, 0.7);
  p.r(PAL.sun, 4, 1, 5, 3).r(PAL.cream, 6, 2, 3, 1);
  // short
  p.r(PAL.glint, 12, 1, 6, 3, 0.9).r(PAL.sun, 14, 1, 4, 3).r(PAL.cream, 16, 2, 2, 1);
}

/** Speed streak: a 24 px line that fades toward its tail (the right-hand end). */
function drawStreak(p: Pen): void {
  p.r(PAL.cream, 0, 0, 8, 1, 1).r(PAL.cream, 8, 0, 8, 1, 0.6).r(PAL.cream, 16, 0, 8, 1, 0.25);
}

/** Medal icon, 11 x 14: a short ribbon and a disc. main / light / dark are palette colours. */
function drawMedal(p: Pen, main: number, light: number, dark: number): void {
  p.r(PAL.bikeBody, 2, 0, 3, 5).r(PAL.cream, 6, 0, 3, 5).r(PAL.ink, 5, 0, 1, 5, 0.5);
  p.disc(dark, 5, 9, 4);
  p.disc(main, 5, 8, 4);
  p.r(light, 3, 5, 4, 1).r(light, 2, 6, 2, 2);
  p.r(dark, 4, 8, 3, 1, 0.55).r(dark, 5, 7, 1, 3, 0.55);
}

function drawStar(p: Pen, c: number, shade: number | null): void {
  p.rows(c, 0, 0, [[6, 1], [5, 3], [5, 3], [4, 5], [0, 13], [1, 11], [2, 9], [3, 7], [2, 9], [2, 4], [1, 3], [1, 1]]);
  p.r(c, 7, 9, 4, 1).r(c, 9, 10, 3, 1).r(c, 11, 11, 1, 1);
  if (shade !== null) p.r(shade, 6, 2, 1, 2).r(shade, 3, 5, 3, 1);
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
  /** missing = painted by the look system from the stage theme */
  draw?: (p: Pen) => void;
  /** frame size for strips (frames are numbered 0..n-1, left to right) */
  frameW?: number;
}

/** The 6.4 manifest: these names may be replaced by PNGs in public/assets. */
export const MANIFEST: Record<string, Def> = {
  bg_sky: { w: LAYER_W, h: LAYER_H },
  bg_far: { w: LAYER_W, h: LAYER_H },
  bg_skyline: { w: LAYER_W, h: LAYER_H },
  bg_mid: { w: LAYER_W, h: LAYER_H },
  fg_near: { w: LAYER_W, h: LAYER_H },
  // the three bikes: body + rider (48 x 32), wheels (12 x 12), planted leg (bikeArt.ts)
  ...BIKE_TEXTURES,
  tile_granite: { w: 16, h: 16, draw: drawGranite },
  pillar: { w: 48, h: 16, draw: drawPillar },
  cart: { w: 48, h: 32, draw: drawCart },
  cow: { w: 32, h: 24, draw: drawCow },
  monkey: { w: 32, h: 16, draw: drawMonkey, frameW: 16 },
  deepastambha: { w: 16, h: 48, draw: drawDeepastambha, frameW: 8 },
  diya: { w: 8, h: 8, draw: drawDiya },
  gateway: { w: 96, h: 96, draw: drawGateway },
  coracle: { w: 24, h: 10, draw: drawCoracle },
  log: { w: 20, h: 10, draw: drawLog },
  boulder: { w: 22, h: 22, draw: drawBoulder },
  boulder_turned: { w: 22, h: 22, draw: drawBoulderTurned },
};

/** Extra code-only textures (effects and UI icons); not part of the PNG manifest. */
const EXTRAS: Record<string, Def> = {
  colonnade: { w: 192, h: 72, draw: drawColonnade },
  temple_door: { w: 96, h: 80, draw: drawTempleDoor },
  ruins_a: { w: 160, h: 64, draw: drawRuinsA },
  ruins_b: { w: 128, h: 56, draw: drawRuinsB },
  boulder_shadow: { w: 20, h: 3, draw: (p) => p.r(PAL.ink, 3, 0, 14, 1, 0.3).r(PAL.ink, 0, 1, 20, 1, 0.35).r(PAL.ink, 3, 2, 14, 1, 0.3) },
  p_rock: { w: 3, h: 3, draw: (p) => p.r(PAL.graniteLight, 0, 0, 3, 3).r(PAL.graniteDark, 1, 1, 2, 2).r(mix(PAL.graniteLight, PAL.cream, 0.4), 0, 0, 1, 1) },
  star_on: { w: 13, h: 12, draw: (p) => drawStar(p, PAL.uiYellow, PAL.cream) },
  star_off: { w: 13, h: 12, draw: (p) => drawStar(p, mix(PAL.ink, PAL.uiYellow, 0.28), null) },
  bubble: { w: 20, h: 13, draw: drawBubble },
  medal_gold: { w: 11, h: 14, draw: (p) => drawMedal(p, PAL.gold, PAL.cream, PAL.brass) },
  medal_silver: { w: 11, h: 14, draw: (p) => drawMedal(p, PAL.chrome, PAL.cream, mix(PAL.chrome, PAL.ink, 0.45)) },
  medal_bronze: { w: 11, h: 14, draw: (p) => drawMedal(p, PAL.brass, PAL.sun, PAL.brown) },
  p_dust: { w: 2, h: 2, draw: (p) => p.r(PAL.graniteLight, 0, 0, 2, 2, 0.8) },
  p_puff: { w: 3, h: 3, draw: (p) => p.r(PAL.graniteLight, 0, 0, 3, 3, 0.45).r(mix(PAL.graniteLight, PAL.cream, 0.4), 0, 1, 2, 2, 0.6) },
  p_streak: { w: 24, h: 1, draw: drawStreak },
  flame: { w: 18, h: 5, draw: drawFlame, frameW: 9 },
  p_smoke: { w: 3, h: 3, draw: (p) => p.r(PAL.cream, 0, 0, 3, 3, 0.3).r(PAL.cream, 0, 1, 2, 2, 0.25) },
  p_spark: { w: 2, h: 2, draw: (p) => p.r(PAL.gold, 0, 0, 2, 2).r(PAL.cream, 0, 0, 1, 1) },
  p_splash: { w: 2, h: 2, draw: (p) => p.r(mix(PAL.water, PAL.cream, 0.65), 0, 0, 2, 2) },
  bird: { w: 10, h: 3, draw: drawBird, frameW: 5 },
  bat: { w: 18, h: 5, draw: drawBat, frameW: 9 },
  p_firefly: { w: 3, h: 3, draw: drawFirefly },
  p_wisp: { w: 5, h: 4, draw: drawWisp },
  lamp_glow: { w: 6, h: 6, draw: drawLampGlow },
  p_glint: { w: 6, h: 1, draw: (p) => p.r(PAL.glint, 0, 0, 6, 1).r(PAL.sun, 2, 0, 2, 1) },
};

/** Draw every texture that is not already present (i.e. not supplied as a PNG). */
export function generatePlaceholders(scene: Phaser.Scene): void {
  const g = scene.make.graphics({}, false);
  const all: Record<string, Def> = { ...MANIFEST, ...EXTRAS };
  for (const [key, def] of Object.entries(all)) {
    if (scene.textures.exists(key) || !def.draw) continue;
    g.clear();
    def.draw(new Pen(g));
    g.generateTexture(key, def.w, def.h);
    if (def.frameW) {
      const tex = scene.textures.get(key);
      for (let i = 0; i * def.frameW < def.w; i++) tex.add(i, 0, i * def.frameW, 0, def.frameW, def.h);
    }
  }
  g.destroy();
}
