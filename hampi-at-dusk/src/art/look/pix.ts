// Look system, part 1: a plain RGBA pixel buffer and the per-pixel passes the look is built from
// (ordered dither, banded sky, haze, mist wisps, rim light, stepped bloom). Pure: no Phaser, no DOM,
// so a stage's layers can be painted (and checked) outside the browser. Everything is baked once at boot.

import { mix, rng } from '../palette';
import type { PenTarget } from '../pen';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** 4 x 4 ordered-dither threshold in (0, 1). */
export const bayer = (x: number, y: number): number => BAYER[(y & 3) * 4 + (x & 3)]!;
export const smooth = (t: number): number => { const k = t < 0 ? 0 : t > 1 ? 1 : t; return k * k * (3 - 2 * k); };

/** A colour, or a colour per x (for hazes that change along a layer). */
export type Tint = number | ((x: number) => number);
const tintAt = (t: Tint, x: number): number => (typeof t === 'function' ? t(x) : t);

/**
 * An RGBA pixel buffer. It is a PenTarget, so the pixel Pen (rects, discs, lines) draws on it.
 * With wrap set, x wraps around: whatever crosses the left / right edge tiles seamlessly.
 */
export class Pix implements PenTarget {
  readonly d: Uint8ClampedArray;
  private c = 0;
  private a = 1;

  constructor(readonly w: number, readonly h: number, readonly wrap = false) {
    this.d = new Uint8ClampedArray(w * h * 4);
  }

  fillStyle(c: number, a = 1): void { this.c = c; this.a = a; }

  fillRect(x: number, y: number, w: number, h: number): void {
    const x0 = Math.round(x), y0 = Math.round(y), x1 = Math.round(x + w), y1 = Math.round(y + h);
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this.px(this.c, xx, yy, this.a);
  }

  private at(x: number, y: number): number {
    if (y < 0 || y >= this.h) return -1;
    if (this.wrap) x = ((x % this.w) + this.w) % this.w;
    else if (x < 0 || x >= this.w) return -1;
    return (y * this.w + x) * 4;
  }

  /** Paint one pixel over what is there (alpha a). */
  px(c: number, x: number, y: number, a = 1): void {
    const i = this.at(x, y);
    if (i < 0 || a <= 0) return;
    const d = this.d, da = d[i + 3]! / 255, out = a + da * (1 - a), k = a / out;
    d[i] = d[i]! + (((c >> 16) & 255) - d[i]!) * k;
    d[i + 1] = d[i + 1]! + (((c >> 8) & 255) - d[i + 1]!) * k;
    d[i + 2] = d[i + 2]! + ((c & 255) - d[i + 2]!) * k;
    d[i + 3] = out * 255;
  }

  /** Add light to one pixel. On a see-through pixel there is nothing to brighten: it is painted instead. */
  add(c: number, x: number, y: number, a = 1): void {
    const i = this.at(x, y);
    if (i < 0 || a <= 0) return;
    const d = this.d;
    if (d[i + 3]! < 255) { this.px(c, x, y, a); return; }
    d[i] = d[i]! + ((c >> 16) & 255) * a;
    d[i + 1] = d[i + 1]! + ((c >> 8) & 255) * a;
    d[i + 2] = d[i + 2]! + (c & 255) * a;
  }

  /** Composite another buffer of the same size over this one. */
  blit(src: Pix): void {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const i = (y * src.w + x) * 4;
        if (src.d[i + 3]! > 0) this.px((src.d[i]! << 16) | (src.d[i + 1]! << 8) | src.d[i + 2]!, x, y, src.d[i + 3]! / 255);
      }
    }
  }

  alpha(x: number, y: number): number {
    const i = this.at(x, y);
    return i < 0 ? 0 : this.d[i + 3]!;
  }

  /** The colour at a pixel (ignoring alpha). */
  rgb(x: number, y: number): number {
    const i = this.at(x, y);
    return i < 0 ? 0 : (this.d[i]! << 16) | (this.d[i + 1]! << 8) | this.d[i + 2]!;
  }
}

/** Smooth 1D value noise in [0, 1] that repeats every `cells` units (so a layer built on it tiles). */
export function loopNoise(seed: number, cells: number): (u: number) => number {
  const r = rng(seed);
  const v = Array.from({ length: cells }, () => r());
  return (u) => {
    const i = Math.floor(u), s = smooth(u - i);
    return v[((i % cells) + cells) % cells]! * (1 - s) + v[(((i + 1) % cells) + cells) % cells]! * s;
  };
}

/** A ridge line: the top y for each x of a layer `w` wide (it tiles). `cells` = bumps across the layer. */
export function ridge(o: { seed: number; w: number; base: number; amp: number; cells: number; oct?: number; jag?: number }): number[] {
  const oct = o.oct ?? 3;
  const ns = Array.from({ length: oct }, (_, k) => loopNoise(o.seed + k * 37, o.cells * 2 ** k));
  const jag = loopNoise(o.seed + 99, Math.round(o.w / 2));
  const h: number[] = [];
  for (let x = 0; x < o.w; x++) {
    let v = 0, a = 1, tot = 0;
    ns.forEach((n, k) => { v += n((x / o.w) * o.cells * 2 ** k) * a; tot += a; a *= 0.5; });
    h.push(Math.round(o.base - o.amp * (v / tot) - (o.jag ?? 0) * jag(x / 2)));
  }
  return h;
}

/** Banded, dithered vertical gradient over the whole buffer. stops: [y, colour] from the top down; k bands per stop. */
export function skyBands(p: Pix, stops: ReadonlyArray<readonly [number, number]>, k = 5): void {
  for (let y = 0; y < p.h; y++) {
    let i = 0;
    while (i < stops.length - 2 && y >= stops[i + 1]![0]) i++;
    const [ya, ca] = stops[i]!, [yb, cb] = stops[i + 1]!;
    const f = Math.min(1, Math.max(0, (y - ya) / (yb - ya))) * k;
    const band = Math.min(k, Math.floor(f)), fr = Math.max(0, (f - band - 0.55) / 0.45);
    const c0 = mix(ca, cb, band / k), c1 = mix(ca, cb, Math.min(k, band + 1) / k);
    for (let x = 0; x < p.w; x++) p.px(fr > bayer(x, y) ? c1 : c0, x, y);
  }
}

/**
 * Haze: dithered bands that thicken from a wispy top near y0 to full strength (alpha a) at y1, and stay
 * at full strength down to y2. This is what separates one parallax layer from the next.
 */
export function haze(p: Pix, y0: number, y1: number, tint: Tint, a: number, o: { seed?: number; wisp?: number; y2?: number; levels?: number } = {}): void {
  if (a <= 0.01) return;
  const wisp = o.wisp ?? 5, L = o.levels ?? 6, y2 = o.y2 ?? y1;
  const n1 = loopNoise((o.seed ?? 1) * 7 + 1, Math.max(4, Math.round(p.w * 0.03)));
  const n2 = loopNoise((o.seed ?? 1) * 7 + 2, Math.max(8, Math.round(p.w * 0.11)));
  for (let x = 0; x < p.w; x++) {
    const c = tintAt(tint, x);
    const top = y0 + (n1((x / p.w) * Math.round(p.w * 0.03)) - 0.5) * wisp * 2 + (n2((x / p.w) * Math.round(p.w * 0.11)) - 0.5) * wisp * 0.7;
    for (let y = Math.max(0, Math.floor(top)); y < y2; y++) {
      const t = Math.min(1, (y - top) / (y1 - top));
      const q = Math.min(1, Math.floor(Math.pow(t, 1.3) * L + bayer(x, y)) / L);
      if (q > 0) p.px(c, x, y, a * q);
    }
  }
}

/** Mist wisps: n thin dithered streaks scattered in a box. */
export function wisps(p: Pix, seed: number, n: number, y0: number, y1: number, tint: Tint, a: number, x0 = 0, x1 = p.w): void {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(x0 + r() * (x1 - x0)), y = Math.floor(y0 + r() * (y1 - y0));
    const w = 24 + Math.floor(r() * 60), th = 1 + Math.floor(r() * 3);
    for (let j = 0; j < th; j++) {
      const inset = Math.round(Math.abs(j - (th - 1) / 2) * 7 + r() * 5);
      for (let k = inset; k < w - inset; k++) {
        if (Math.min(k - inset, w - inset - k) / 8 > bayer(x + k, y + j)) p.px(tintAt(tint, x + k), x + k, y + j, a);
      }
    }
  }
}

/**
 * Rim light: paint the edge pixels of everything drawn so far. `side` lights the edges that face `dir`
 * (-1 = lit from the left), `top` the edges that face up. Run it before any haze goes on the buffer.
 */
export function rimLight(p: Pix, c: number, o: { side: number; top: number; dir?: -1 | 1; maxY?: number }): void {
  const dir = o.dir ?? -1;
  const marks: Array<[number, number, number]> = [];
  for (let y = 0; y < (o.maxY ?? p.h); y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.alpha(x, y) <= 200) continue;
      if (p.alpha(x + dir, y) < 50) marks.push([x, y, o.side]);
      else if (p.alpha(x, y - 1) < 50) marks.push([x, y, o.top]);
    }
  }
  for (const [x, y, a] of marks) p.px(c, x, y, Math.min(1, a));
}

/** Stepped additive halo: a few stacked discs and a dithered fringe. k scales its strength. */
export function bloom(p: Pix, c: number, cx: number, cy: number, r: number, k = 1): void {
  if (k <= 0.01) return;
  const n = 5, R = Math.round(r * 1.3);
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx, dy);
      let a = d <= R && (1 - d / R) * 0.8 > bayer(cx + dx, cy + dy) ? 0.09 * k : 0;
      for (let i = 0; i < n; i++) if (d <= Math.max(1, Math.round(r * (1 - i / n))) + 0.5) a += 0.07 * k * (1 + i * 0.55);
      if (a > 0) p.add(c, cx + dx, cy + dy, Math.min(1, a));
    }
  }
}

/** Pixel stars above yMax, a few of them with a little cross. */
export function stars(p: Pix, seed: number, n: number, yMax: number, cols: readonly number[]): void {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * p.w), y = Math.floor(r() * yMax), c = cols[Math.floor(r() * cols.length)]!;
    const a = (0.4 + r() * 0.6) * (1 - (y / yMax) * 0.6);
    p.px(c, x, y, a);
    if (r() < 0.12) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) p.px(c, x + dx, y + dy, a * 0.5);
  }
}

/** A flat cloud bank in thin layers, its underside lit by the low sun. */
export function strata(p: Pix, x: number, y: number, w: number, body: number, lit: number, seed: number): void {
  const r = rng(seed), rows = 3 + (w > 60 ? 1 : 0);
  for (let j = 0; j < rows; j++) {
    const t = j / (rows - 1);
    const ww = Math.round(w * (0.45 + 0.55 * Math.sin(Math.PI * (0.25 + t * 0.6))));
    const xx = Math.round(x + (w - ww) * (0.3 + r() * 0.4));
    p.fillStyle(j === rows - 1 ? lit : body);
    p.fillRect(xx, y + j * 2, ww, 2);
    if (j < rows - 1) {
      p.fillStyle(body);
      for (let k = 0; k < ww / 10; k++) p.fillRect(xx + Math.floor(r() * Math.max(1, ww - 8)), y + j * 2 - 1, 4 + Math.floor(r() * 6), 1);
    } else {
      p.fillStyle(lit, 0.6);
      p.fillRect(xx + 3, y + j * 2 + 2, ww - 9, 1);
    }
  }
}

/** Fade a colour toward the air colour by its distance d (0 = here, 1 = lost in the haze). */
export const fade = (c: number, air: number, d: number): number => mix(c, air, Math.min(0.85, d));

/** A dark one-pixel keyline around whatever is in `src`, as its own buffer (2 px larger each way). */
export function keyline(src: Pix, ink: number, a = 1): Pix {
  const out = new Pix(src.w + 2, src.h + 2);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const sx = x - 1, sy = y - 1;
      if (src.alpha(sx, sy) > 100 || src.alpha(sx - 1, sy) > 100 || src.alpha(sx + 1, sy) > 100 || src.alpha(sx, sy - 1) > 100 || src.alpha(sx, sy + 1) > 100) out.px(ink, x, y, a);
    }
  }
  return out;
}

/** Deterministic 0..1 hash of two integers (texture that is a function of world x, so baked chunks join up). */
export function hash2(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
