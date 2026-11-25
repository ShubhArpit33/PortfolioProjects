// Look system, part 5: bake a stage theme into Phaser textures, once, at boot. The parallax layers, the
// landmark, and the shared light and mist sprites (halo, light pool, mist band, mist wisp, sun glitter),
// all in the theme's colours and at its glow level. Nothing here runs per frame.

import type Phaser from 'phaser';
import { Pix, bayer, bloom, hash2, keyline, wisps } from './pix';
import { LAYER_H, LAYER_W, type StageTheme } from './theme';

/** Turn a pixel buffer into a texture, unless one with that key exists already (a PNG was supplied). */
export function toTexture(scene: Phaser.Scene, key: string, p: Pix, frameW = 0): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, p.w, p.h);
  if (!tex) return;
  const img = tex.getContext().createImageData(p.w, p.h);
  img.data.set(p.d);
  tex.getContext().putImageData(img, 0, 0);
  if (frameW > 0) for (let i = 0; i * frameW < p.w; i++) tex.add(i, 0, i * frameW, 0, frameW, p.h);
  tex.refresh();
}

/** The pixels of an existing texture (code-drawn or a PNG). */
function fromTexture(scene: Phaser.Scene, key: string): Pix {
  const src = scene.textures.get(key).getSourceImage() as HTMLCanvasElement | HTMLImageElement;
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const p = new Pix(src.width, src.height);
  p.d.set(ctx.getImageData(0, 0, src.width, src.height).data);
  return p;
}

/**
 * A dark keyline for a sprite, as the texture `<key>_key`: the sprite's outline, one pixel larger each way,
 * to be drawn under it (see keyUnder). It keeps pickups and hazards readable against a bright background.
 * A strip of frames (frameW) gets a strip of outlines.
 */
export function bakeKeyline(scene: Phaser.Scene, key: string, ink: number, alpha: number, frameW = 0, glint?: readonly [number, number]): void {
  const src = fromTexture(scene, key);
  const fw = frameW || src.w, n = Math.round(src.w / fw);
  const out = new Pix(n * (fw + 2), src.h + 2);
  for (let f = 0; f < n; f++) {
    const one = new Pix(fw, src.h);
    for (let y = 0; y < src.h; y++) for (let x = 0; x < fw; x++) if (src.alpha(f * fw + x, y) > 100) one.px(0, x, y);
    const k = keyline(one, ink, alpha);
    for (let y = 0; y < k.h; y++) for (let x = 0; x < k.w; x++) if (k.alpha(x, y) > 0) out.px(ink, f * (fw + 2) + x, y, alpha);
  }
  if (glint) {
    // a small white sparkle beside the sprite (sprite coordinates): "this one is for picking up"
    const [gx, gy] = [glint[0] + 1, glint[1] + 1];
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]] as const) out.px(0xffffff, gx + dx, gy + dy);
  }
  toTexture(scene, `${key}_key`, out, n > 1 ? fw + 2 : 0);
}

/** A round additive halo, size x size. */
export function halo(c: number, size: number, r: number, k: number): Pix {
  const p = new Pix(size, size);
  bloom(p, c, size >> 1, size >> 1, r, k);
  return p;
}

/** Light pooled on the road under a lamp: brightest along the surface, falling off sideways and down. Additive. */
export function lightPool(c: number, halfW: number, k: number): Pix {
  const p = new Pix(halfW * 2 + 1, 8);
  for (let dx = -halfW; dx <= halfW; dx++) {
    const t = 1 - Math.abs(dx) / halfW, x = dx + halfW;
    p.px(c, x, 0, Math.min(1, 0.55 * k * t));
    for (let y = 1; y < 5; y++) p.px(c, x, y, Math.min(1, 0.2 * k * t * t));
    for (let y = 5; y < 8; y++) if (bayer(x, y) < t) p.px(c, x, y, Math.min(1, 0.1 * k * t));
  }
  return p;
}

/** The sun's broken reflection on the background water: short bright dashes, densest under the sun. */
export function sunGlitter(cols: readonly number[], k: number): Pix {
  const w = 72, h = 18, p = new Pix(w, h);
  for (let y = 0; y < h; y++) {
    const half = Math.round(26 - y * 0.8);
    for (let x = (w >> 1) - half; x < (w >> 1) + half; x++) {
      const t = 1 - Math.abs(x - (w >> 1)) / half;
      const cell = hash2(Math.floor((x + (y % 2) * 3) / 5), y);
      if (y % 2 === 0 ? cell < 0.25 + 0.6 * t : cell < 0.12 * t) p.px(cols[Math.min(cols.length - 1, Math.floor((1 - t) * cols.length))]!, x, y, Math.min(1, (0.5 + 0.5 * t) * (0.6 + 0.8 * k) * (1 - y / (h * 1.5))));
    }
  }
  return p;
}

/** One wisp of low mist, 64 x 9: a few dithered streaks, thickest in the middle. */
export function mistWisp(hi: number, body: number): Pix {
  const p = new Pix(64, 9);
  const rows: ReadonlyArray<readonly [number, number, number, number]> = [
    [14, 50, hi, 0.3], [6, 58, hi, 0.5], [2, 62, hi, 0.45], [8, 60, body, 0.5], [0, 52, body, 0.4], [12, 44, hi, 0.3], [20, 40, body, 0.3],
  ];
  rows.forEach(([x0, x1, c, a], y) => {
    for (let x = x0; x < x1; x++) if (Math.min(x - x0, x1 - x) / 10 > bayer(x, y)) p.px(c, x, y + 1, a);
  });
  return p;
}

export function bakeLook(scene: Phaser.Scene, t: StageTheme): void {
  for (const l of t.layers) {
    if (scene.textures.exists(l.key)) continue;
    const p = new Pix(LAYER_W, LAYER_H, true);
    l.paint(p);
    toTexture(scene, l.key, p);
  }
  if (t.landmark && !scene.textures.exists(t.landmark.key)) {
    const p = new Pix(t.landmark.w, t.landmark.h);
    t.landmark.paint(p);
    toTexture(scene, t.landmark.key, p);
  }
  toTexture(scene, 'glow', halo(t.lamp, 32, 11, t.glow * 1.1));
  toTexture(scene, 'light_pool', lightPool(t.lamp, 26, t.glow * 1.6));
  if (t.sun) toTexture(scene, 'sun_glitter', sunGlitter(t.sun.glitter, t.glow));

  // Mist: a band that tiles sideways, and a single wisp for the water in the road.
  const [hi, body] = t.mist.colours;
  if (t.mist.band) {
    const band = new Pix(480, t.mist.band.h, true);
    wisps(band, 91, 12, 1, t.mist.band.h - 4, hi, 0.55 * t.haze + 0.1);
    wisps(band, 92, 8, 3, t.mist.band.h - 3, body, 0.4 * t.haze + 0.1);
    toTexture(scene, 'mist_band', band);
  }
  toTexture(scene, 'p_mist', mistWisp(hi, body));
}

/** Place a sprite's keyline (baked by bakeKeyline) under it. Call followKey whenever the sprite moves or changes. */
export function keyUnder(scene: Phaser.Scene, img: Phaser.GameObjects.Image): Phaser.GameObjects.Image {
  const w = img.width, h = img.height;
  return scene.add.image(img.x, img.y, `${img.texture.key}_key`, img.frame.name)
    .setOrigin((img.originX * w + 1) / (w + 2), (img.originY * h + 1) / (h + 2)).setDepth(img.depth - 0.01).setVisible(img.visible);
}

export function followKey(key: Phaser.GameObjects.Image, img: Phaser.GameObjects.Image): void {
  key.setPosition(img.x, img.y).setVisible(img.visible).setAlpha(img.alpha).setFlipX(img.flipX);
  if (key.frame.name !== img.frame.name) key.setFrame(img.frame.name);
}
