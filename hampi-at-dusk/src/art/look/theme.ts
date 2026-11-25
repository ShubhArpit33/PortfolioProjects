// Look system, part 4: what a stage hands to the shared look. One StageTheme per stage (Hampi is the first;
// Ladakh and Goa plug in the same way): its colours, how strong its glow and haze are, its parallax layers
// (painted from the silhouette kit), its road, its mist, and where the shared ambience attaches.

import type { GroundKit } from './ground';
import type { Pix } from './pix';

/** Every parallax layer is a 960 x 270 texture that tiles sideways. */
export const LAYER_W = 960;
export const LAYER_H = 270;

export interface LayerDef {
  /** texture key; a PNG of this name in public/assets replaces the painted layer */
  key: string;
  /** how fast it moves with the camera: 0 = fixed to the screen, 1 = with the road, above 1 = in front of it */
  scroll: number;
  /** draw order (see DEPTH in Parallax.ts) */
  depth: number;
  paint(p: Pix): void;
}

export interface MistDef {
  /** [highlight, body] */
  colours: readonly [number, number];
  /**
   * The slow band of mist over the background water, or null: its top y and height on the layer it lies
   * on, that layer's scroll factor, and how fast it drifts against it (px/s).
   */
  band: { y: number; h: number; scroll: number; drift: number } | null;
  /** low mist also drifts over the water in the road itself (the canals, the river) */
  overWater: boolean;
}

export interface StageTheme {
  id: string;
  /** strength of halos, light pools and the sun's bloom: 0 = none, 0.5 = subtle, 1 = medium */
  glow: number;
  /** strength of the haze between the parallax layers, same scale */
  haze: number;
  ink: number;
  /** the colour of lamp light: halos around pickups and lit lamps, light pooled on the road */
  lamp: number;
  /** the sun in its layer: used for its reflection on the background water (null = no reflection) */
  sun: { x: number; y: number; scroll: number; glitterY: number; glitter: readonly number[] } | null;
  /** back to front */
  layers: LayerDef[];
  ground: GroundKit;
  mist: MistDef;
  /** where the shared ambience attaches: flickering lamps and a smoke wisp, each on a layer with a scroll factor */
  lamps: { scroll: number; at: ReadonlyArray<readonly [number, number]> };
  smoke: { scroll: number; x: number; y: number };
  /**
   * A landmark that stands on a layer at the end of the stage (Hampi: the stone chariot): its texture, the
   * layer's scroll factor, its screen x when the camera is at the end, and the ground under it.
   */
  landmark: { key: string; w: number; h: number; scroll: number; endScreenX: number; groundY(layerX: number): number; paint(p: Pix): void } | null;
}

let active: StageTheme | null = null;

/** Set the stage's theme (before the textures are baked). */
export function setTheme(t: StageTheme): void {
  active = t;
}

export function theme(): StageTheme {
  if (!active) throw new Error('no stage theme set');
  return active;
}
