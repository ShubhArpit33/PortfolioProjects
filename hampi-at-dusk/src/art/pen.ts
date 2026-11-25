// Tiny pixel-art pen: integer-aligned filled rectangles on anything that can fill one (a Phaser Graphics
// object in the game; a plain pixel buffer in the art preview script). No Phaser import.

export interface PenTarget {
  fillStyle(colour: number, alpha?: number): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown;
}

/** Tiny pixel-art pen. With wrapW set, everything drawn across the left/right edge wraps (seamless tiling). */
export class Pen {
  constructor(private g: PenTarget, private wrapW = 0) {}

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
