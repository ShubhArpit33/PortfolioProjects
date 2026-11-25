// Stage 1, Hampi at Dusk: its theme for the shared look system (src/art/look). A purple-to-gold sky with
// a low sun, hazy boulder hills, a temple town across the river, dark ruins and coconut palms on the near
// bank, and the warm dirt road. Decisions (DECISIONS.md, v1.8): the glow is subtle; teal is only in the
// river and the mist over water; the road keeps its dusty brown with grass on top.

import { DEPTH } from '../depth';
import { Pix, bayer, bloom, fade, haze, ridge, rimLight, skyBands, stars, strata, wisps } from '../look/pix';
import {
  banana, boulderHill, boulders, gopuram, mandapa, mandapaLamp, palm, ruinedArch, tree, tuft, vine,
  type Stone, type Tones,
} from '../look/silhouettes';
import { LAYER_H as H, LAYER_W as W, type StageTheme } from '../look/theme';
import { PAL, mix, rng } from '../palette';
import { Pen } from '../pen';

const GLOW = 0.5; // subtle
const HAZE = 0.5;
/** Rim light follows the glow level, but never quite goes. */
const RIM = Math.min(1.3, 0.4 + 0.6 * GLOW);

/** What distance fades to (a dusty mauve), and the low golden haze. No teal up here: that is the river's. */
const AIR = 0xb46c94;
const WARM = 0xf49a5c;
const MIST_HI = 0x9cecd4;
const MIST = 0x28c4b4;
/** The river itself is dusk water with a teal cast: [at the far shore, toward the near bank]. */
const RIVER = [0x1c6674, 0x2a1c52] as const;
const SUN = { x: 360, y: 152 };
/** The far shore: below this line the skyline layer is the river. */
const RIVER_Y = 202;
const TAU = Math.PI * 2;
const wrapX = (x: number): number => ((Math.round(x) % W) + W) % W;

/**
 * Draw on a scratch layer, rim-light its edges, lay it over p. The light comes from the right: that is
 * where the sun stands on the title screen and for the first stretch of the ride, and the way the road runs.
 */
function lit(p: Pix, rim: number, side: number, top: number, draw: (pen: Pen) => void, maxY = H): void {
  const l = new Pix(p.w, p.h, p.wrap);
  draw(new Pen(l));
  rimLight(l, rim, { side: side * RIM, top: top * RIM, dir: 1, maxY });
  p.blit(l);
}

// --- Sky: banded purple to gold, stars, cloud banks lit from below, the low sun, kites ----------------

const SKY: ReadonlyArray<readonly [number, number]> = [
  [0, 0x161040], [52, 0x33206a], [100, 0x6c2c78], [140, 0xb8486c], [170, 0xee7a4a], [198, 0xffcf70],
];

function paintSky(p: Pix): void {
  const pen = new Pen(p);
  skyBands(p, SKY, 5);
  stars(p, 3, 150, 110, [PAL.cream, 0xd0b8ff]);
  const r = rng(61);
  for (let i = 0; i < 13; i++) {
    const x = Math.round((i * W) / 13 + r() * 50), y = 60 + Math.floor(r() * 84), w = 44 + Math.floor(r() * 56);
    const t = (y - 60) / 84; // higher banks are darker and cooler
    strata(p, x, y, w, mix(0x402670, 0x9a3c74, t), mix(0xb85080, 0xffb060, t), 70 + i);
  }
  bloom(p, 0xff7a4a, SUN.x, SUN.y, 62, 0.65 * GLOW);
  bloom(p, 0xffc060, SUN.x, SUN.y, 34, GLOW);
  pen.disc(0xffdc80, SUN.x, SUN.y, 16).disc(0xfff4c0, SUN.x, SUN.y, 13);
  const kite = (x: number, y: number, c: number): void => {
    pen.rows(c, x, y, [[3, 1], [2, 3], [1, 5], [0, 7], [1, 5], [2, 3], [2, 3], [3, 1], [3, 1]]);
    pen.r(PAL.ink, x + 3, y + 1, 1, 7, 0.35).r(PAL.ink, x + 1, y + 3, 5, 1, 0.35);
    for (let i = 0; i < 6; i++) pen.r(PAL.cream, x + 3 - i - (i % 2), y + 10 + i * 2, 1, 1, 0.8);
  };
  kite(96, 104, PAL.gold);
  kite(560, 40, PAL.cream);
  kite(830, 76, PAL.glint);
}

// --- Far: boulder hills, half lost in the golden haze -------------------------------------------------

function paintFar(p: Pix): void {
  const tops = ridge({ seed: 11, w: W, base: 196, amp: 40, cells: 10, jag: 2 });
  const C: Tones = [fade(0x94507a, AIR, 0.5), fade(0x4c2466, AIR, 0.55), fade(0x3a1c58, AIR, 0.55)];
  lit(p, 0xffb478, 0.4, 0.18, (pen) => {
    for (let x = 0; x < W; x++) pen.r(C[1], x, tops[x]!, 1, H - tops[x]!);
    boulders(pen, tops, C, rng(5), 0.7, 26);
    const r = rng(29);
    for (const [x, w, h] of [[95, 120, 30], [330, 90, 22], [585, 140, 36], [840, 100, 26]] as const) boulderHill(pen, C, x, tops[x]! + 6, w, h, r);
    gopuram(pen, { body: C[1], dark: C[2], lit: null }, 446, tops[446]! + 6, 20, 6, 4, 0, r);
  });
  haze(p, 158, 202, WARM, 0.66 * HAZE, { seed: 21, wisp: 7, y2: H });
}

// --- Skyline: the temple town on the far bank, and the river at its feet ------------------------------

const SKYLINE_TOPS = ridge({ seed: 27, w: W, base: RIVER_Y + 1, amp: 26, cells: 16, jag: 2 });
const skylineY = (x: number): number => SKYLINE_TOPS[wrapX(x)]!;
/** The landmark (the stone chariot) stands here on the skyline layer: nothing tall is drawn around it. */
const LANDMARK_X = 204;
const SHRINE = { x: 528, cols: 3, gap: 12, h: 16 };
const shrineBase = Math.max(skylineY(SHRINE.x), skylineY(SHRINE.x + 28)) + 3;

function paintSkyline(p: Pix): void {
  const S: Stone = { body: fade(0x3a1a56, AIR, 0.26), dark: fade(0x2a1244, AIR, 0.26), lit: 0xf2b060 };
  const R: Tones = [fade(0x7a3e70, AIR, 0.26), S.body, S.dark];
  const clear = (x: number): boolean => Math.abs(x + 8 - LANDMARK_X) < 48;
  lit(p, 0xffa860, 0.5, 0.15, (pen) => {
    for (let x = 0; x < W; x++) pen.r(S.body, x, skylineY(x), 1, H - skylineY(x));
    boulders(pen, SKYLINE_TOPS, R, rng(8), 0.5, 18, clear);
    const r = rng(31);
    for (const [x, w, h] of [[310, 52, 24], [484, 70, 30], [712, 56, 26], [826, 48, 18], [934, 40, 20]] as const) boulderHill(pen, R, x, skylineY(x) + 6, w, h, r);
    for (const [x, h, w] of [[72, 22, 24], [364, 26, 28], [596, 20, 22], [900, 24, 26]] as const) tree(pen, S.body, x, skylineY(x) + 2, h, w, r);
    for (const [x, h, lean] of [[44, 34, 4], [318, 40, -5], [420, 30, -4], [690, 38, 5], [808, 32, -4]] as const) palm(pen, S.body, x, skylineY(x) + 2, h, lean, r);
    gopuram(pen, S, 130, skylineY(130) + 4, 46, 8, 8, 0.14, r);
    gopuram(pen, S, 640, skylineY(640) + 4, 38, 7, 7, 0.14, r);
    gopuram(pen, S, 770, skylineY(770) + 4, 26, 5, 6, 0.15, r);
    gopuram(pen, S, 10, skylineY(10) + 4, 22, 4, 6, 0.15, r);
    mandapa(pen, S, 254, Math.max(skylineY(254), skylineY(310)) + 3, 5, 13, 20, []);
    mandapa(pen, S, 862, Math.max(skylineY(862), skylineY(900)) + 3, 4, 12, 18, [2]);
    mandapa(pen, S, SHRINE.x, shrineBase, SHRINE.cols, SHRINE.gap, SHRINE.h, []);
  });
  bloom(p, 0xffb050, 130, skylineY(130) - 44, 26, 0.5 * GLOW);
  bloom(p, 0xffb050, 640, skylineY(640) - 34, 20, 0.4 * GLOW);
  haze(p, 174, RIVER_Y + 2, mix(WARM, AIR, 0.35), 0.62 * HAZE, { seed: 22, wisp: 5 });

  // The river: teal at the far shore falling to deep dusk purple, pale glints, mist lying on it.
  for (let y = RIVER_Y; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = Math.min(1, Math.floor(((y - RIVER_Y) / 20) * 5 + bayer(x, y)) / 5);
      p.px(mix(RIVER[0], RIVER[1], v), x, y);
    }
  }
  const g = rng(40);
  for (let i = 0; i < 170; i++) {
    const y = RIVER_Y + 1 + Math.floor(g() * 17), x = Math.floor(g() * W);
    p.fillStyle(MIST_HI, 0.25 + g() * 0.3);
    p.fillRect(x, y, 3 + Math.floor(g() * 8), 1);
  }
  haze(p, RIVER_Y - 3, RIVER_Y + 16, MIST_HI, 0.4 * HAZE, { seed: 23, wisp: 3 });
  wisps(p, 9, 20, RIVER_Y - 5, RIVER_Y + 12, MIST_HI, 0.5 * HAZE);
}

function paintChariot(p: Pix): void {
  const c = fade(0x3a1a56, AIR, 0.26), d = fade(0x2a1244, AIR, 0.26);
  lit(p, 0xffa860, 0.5, 0.15, (pen) => {
    pen.disc(c, 14, 39, 8).disc(c, 46, 39, 8).disc(d, 14, 39, 4).disc(d, 46, 39, 4);
    pen.r(c, 10, 39, 9, 1).r(c, 14, 35, 1, 9).r(c, 42, 39, 9, 1).r(c, 46, 35, 1, 9);
    pen.r(c, 2, 28, 56, 6);
    for (const x of [9, 17, 39, 47]) pen.r(c, x, 12, 4, 16);
    pen.r(c, 25, 12, 10, 16).r(d, 28, 16, 4, 12);
    pen.r(c, 5, 9, 50, 3).r(c, 11, 5, 38, 4).r(c, 18, 2, 24, 3).r(c, 26, 0, 8, 2);
  });
}

// --- Mid: the near bank. Dark ruins, coconut palms and banana clumps against the river ----------------

const midGroundY = (x: number): number => {
  const u = (x / W) * TAU;
  return Math.round(217 + 2 * Math.sin(3 * u) + Math.sin(7 * u + 1));
};
const midBase = (x: number): number => midGroundY(x) + 2;
/** [x, ground-reference x, cols, gap, pillar height, broken pillars] */
const MANDAPAS: ReadonlyArray<readonly [number, number, number, number, number, readonly number[]]> = [
  [60, 90, 5, 14, 30, [3]],
  [432, 470, 6, 14, 34, [0, 4]],
  [640, 665, 4, 15, 28, []],
  [850, 880, 4, 14, 32, [1]],
];
/** [x, ground-reference x, span, height] */
const ARCHES: ReadonlyArray<readonly [number, number, number, number]> = [[252, 270, 38, 34], [742, 760, 30, 28]];
/** Lamps hung in the ruins (mid layer coordinates): a baked flame and halo each, and a flicker from the ambience. */
const MID_LAMPS: ReadonlyArray<readonly [number, number]> = [
  ...([[0, 1], [1, 1], [1, 2], [2, 1], [3, 2]] as const).map(([m, bay]) => {
    const [x, refX, , gap, h] = MANDAPAS[m]!;
    return mandapaLamp(x, midBase(refX), gap, h, bay);
  }),
  ...ARCHES.map(([x, refX, w, h]): [number, number] => [x + (w >> 1) - 1, midBase(refX) - h + 10]),
];

function paintMid(p: Pix): void {
  // A hazier row behind: pillared halls, arches, banana clumps.
  const back: Stone = { body: fade(0x2e1650, AIR, 0.1), dark: 0x1c0e34, lit: null };
  lit(p, 0xffa050, 0.5, 0.2, (pen) => {
    const r = rng(41);
    for (const [x, refX, cols, gap, h, broken] of MANDAPAS) mandapa(pen, back, x, midBase(refX), cols, gap, h, broken);
    for (const [x, refX, w, h] of ARCHES) ruinedArch(pen, back.body, x, midBase(refX), w, h);
    for (const x of [140, 300, 392, 580, 745, 925]) banana(pen, back.body, x, midBase(x) + 2, r);
    for (const [x, h, w] of [[20, 30, 34], [548, 34, 38], [800, 28, 32]] as const) tree(pen, back.body, x, midBase(x), h, w, r);
  });
  for (const [lx, ly] of MID_LAMPS) {
    bloom(p, 0xff9a3a, lx + 1, ly, 6, 0.8 * GLOW);
    p.fillStyle(0xffa030); p.fillRect(lx, ly, 2, 2);
    p.fillStyle(0xfff6b0); p.fillRect(lx, ly - 1, 1, 2);
  }
  // The front row and the bank itself, darkest.
  const c = 0x22103a;
  lit(p, 0xffa050, 0.75, 0.22, (pen) => {
    const r = rng(37);
    for (const [x, h, lean] of [[40, 70, 8], [210, 58, -6], [232, 74, 5], [470, 64, -8], [700, 72, 6], [716, 56, -4], [905, 66, -7]] as const) palm(pen, c, x, midBase(x), h, lean, r);
    for (const [x, h] of [[322, 26], [331, 14], [653, 22]] as const) { // free-standing broken pillars
      const y = midBase(x);
      pen.r(c, x, y - h, 4, h).r(c, x - 1, y - h, 6, 2).r(c, x - 1, y - 3, 6, 3);
    }
    for (let x = 0; x < W; x++) pen.r(c, x, midGroundY(x), 1, H - midGroundY(x));
  }, 228);
  // River mist around their feet.
  haze(p, 211, 226, MIST, 0.3 * HAZE, { seed: 24, wisp: 3, y2: H });
}

// --- Near: sparse grass and vines in front of everything ----------------------------------------------

function paintNear(p: Pix): void {
  const dark = mix(PAL.mossDark, PAL.ink, 0.62), midc = mix(PAL.mossDark, PAL.ink, 0.35);
  lit(p, PAL.mossDark, 0.45, 0.3, (pen) => {
    const r = rng(53);
    for (const x of [70, 215, 330, 505, 640, 790, 900]) tuft(pen, [midc, dark, dark], x, H, r);
    for (const x of [150, 455, 745]) {
      const strands = 2 + Math.floor(r() * 2);
      for (let s = 0; s < strands; s++) vine(pen, dark, midc, x + s * 7, 0, 14 + Math.floor(r() * 18), s);
    }
  });
}

export const HAMPI: StageTheme = {
  id: 'hampi',
  glow: GLOW,
  haze: HAZE,
  ink: PAL.ink,
  lamp: 0xffa838,
  sun: { ...SUN, scroll: 0.05, glitterY: RIVER_Y, glitter: [0xfff6c8, 0xffe9a0, 0xffb468] },
  layers: [
    { key: 'bg_sky', scroll: 0.05, depth: DEPTH.sky, paint: paintSky },
    { key: 'bg_far', scroll: 0.1, depth: DEPTH.far, paint: paintFar },
    { key: 'bg_skyline', scroll: 0.2, depth: DEPTH.skyline, paint: paintSkyline },
    { key: 'bg_mid', scroll: 0.45, depth: DEPTH.mid, paint: paintMid },
    { key: 'fg_near', scroll: 1.1, depth: DEPTH.near, paint: paintNear },
  ],
  // The road: warm dusty dirt with a grass line on top, as it has always been; only texture is added.
  ground: {
    soil: [mix(PAL.graniteLight, PAL.cream, 0.3), PAL.graniteLight, PAL.graniteDark],
    grass: [PAL.mossLight, PAL.mossDark, mix(PAL.mossDark, PAL.ink, 0.4)],
    rim: [PAL.gold, 0.25],
    shade: PAL.ink,
    under: 0.14,
    tufts: 3.5,
    pebbles: 7,
    ruts: 4.5,
    water: { line: 0xc8f6e4, glow: MIST, top: 0x1a6878, deep: 0x2a1c52, glints: [MIST_HI, MIST_HI, PAL.glint] },
  },
  mist: { colours: [MIST_HI, MIST], band: { y: RIVER_Y - 5, h: 20, scroll: 0.2, drift: 5 }, overWater: true },
  lamps: { scroll: 0.45, at: MID_LAMPS },
  smoke: { scroll: 0.2, x: SHRINE.x + 14, y: shrineBase - 5 - SHRINE.h - 12 },
  landmark: {
    key: 'chariot', w: 60, h: 48, scroll: 0.2, endScreenX: 300, paint: paintChariot,
    groundY: (x) => Math.min(skylineY(x - 26), skylineY(x), skylineY(x + 26)) - 2,
  },
};
