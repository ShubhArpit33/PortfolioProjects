// Look system, part 6: the few things in the look that move. A band of mist drifting over the background
// water, the sun's reflection under the sun, and low mist over the water in the road. All of it is a pure
// function of (game time, camera scroll) on a fixed set of images: no tweens, no wall clock, no Math.random.

import type Phaser from 'phaser';
import { DEPTH } from '../depth';
import { hash2 } from './pix';
import { LAYER_W, type StageTheme } from './theme';

const VIEW_W = 480;
const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Screen-fixed: lives with the parallax layers, between the far bank and the near one. */
export class Atmosphere {
  private band: Phaser.GameObjects.TileSprite | null = null;
  private glitter: Phaser.GameObjects.Image | null = null;

  constructor(scene: Phaser.Scene, private t: StageTheme) {
    if (t.sun) {
      this.glitter = scene.add.image(0, t.sun.glitterY, 'sun_glitter').setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH.chariot + 0.1);
    }
    const b = t.mist.band;
    if (b) {
      this.band = scene.add.tileSprite(0, b.y, VIEW_W, b.h, 'mist_band').setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.chariot + 0.2);
    }
  }

  update(scrollX: number, time: number): void {
    const b = this.t.mist.band;
    if (this.band && b) this.band.tilePositionX = Math.round(scrollX * b.scroll + time * b.drift);
    const sun = this.t.sun;
    if (this.glitter && sun) {
      const x = mod(sun.x - Math.round(scrollX * sun.scroll) + 60, LAYER_W) - 60;
      const on = x < VIEW_W + 60;
      this.glitter.setVisible(on);
      if (on) this.glitter.setPosition(x, sun.glitterY).setAlpha(0.8 + 0.2 * Math.sin(time * 3.1) * Math.sin(time * 1.3));
    }
  }
}

/** World-space: wisps of mist drifting low over each stretch of water in the road (behind every entity). */
export class WaterMist {
  private wisps: Array<{ img: Phaser.GameObjects.Image; x0: number; span: number; speed: number; phase: number; y: number }> = [];

  constructor(scene: Phaser.Scene, spans: ReadonlyArray<readonly [number, number]>, waterY: number, depth: number) {
    spans.forEach(([x0, x1], g) => {
      const n = Math.max(2, Math.round((x1 - x0) / 26) + 1);
      for (let i = 0; i < n; i++) {
        this.wisps.push({
          img: scene.add.image(0, 0, 'p_mist').setDepth(depth).setVisible(false),
          x0: x0 - 4, span: x1 - x0 + 8,
          speed: 5 + 6 * hash2(g, i * 7 + 1), phase: (i + hash2(g, i)) / n,
          y: waterY + 1 - Math.floor(hash2(g, i * 7 + 3) * 10),
        });
      }
    });
  }

  update(scrollX: number, time: number): void {
    for (const w of this.wisps) {
      const k = mod(w.phase + (time * w.speed) / w.span, 1);
      const x = w.x0 + k * w.span;
      const on = x > scrollX - 30 && x < scrollX + VIEW_W + 30;
      w.img.setVisible(on);
      // each wisp fades in at one bank and out at the other
      if (on) w.img.setPosition(Math.round(x), w.y).setAlpha(Math.min(1, 1.3 * Math.sin(Math.PI * k)));
    }
  }
}
