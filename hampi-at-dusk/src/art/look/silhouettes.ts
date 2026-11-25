// Look system, part 2: the silhouette kit. Flat shapes for the parallax layers, drawn with the pixel Pen;
// the light on them (rim light, haze) is added afterwards by the passes in pix.ts. A stage theme picks
// from these and adds its own. Colours come in as arguments: nothing here knows a palette.

import type { Pen } from '../pen';

/** [light, mid, dark]: lit top-left, body, shaded right / underside. */
export type Tones = readonly [number, number, number];
/** A building: body, the dark of its openings, and the lamp-lit colour (null = no lit openings). */
export interface Stone { body: number; dark: number; lit: number | null }

/** A rounded rock with a highlight on the lit side and shade on the other. */
export function rock(p: Pen, x: number, y: number, w: number, h: number, [light, mid, dark]: Tones): void {
  for (let j = 0; j < h; j++) {
    const t = (j + 0.5) / h, k = Math.sqrt(1 - Math.pow(1 - Math.min(1, t * 1.6), 2));
    const inset = Math.round((1 - k) * w * 0.32);
    p.r(mid, x + inset, y + j, w - inset * 2, 1);
    p.r(dark, x + w - inset - Math.ceil(w * 0.3), y + j, Math.ceil(w * 0.3), 1);
    if (j < h * 0.4) p.r(light, x + inset + 1, y + j, Math.max(1, Math.floor(w * 0.35) - inset), 1);
  }
}

/** Boulders scattered along a ridge line (tops[x] = top y), some with a smaller one balanced on top. */
export function boulders(
  p: Pen, tops: readonly number[], C: Tones, rand: () => number, dens = 0.6, big = 22, skip?: (x: number) => boolean,
): void {
  const W = tops.length;
  for (let x = 0; x < W;) {
    const w = 6 + Math.floor(rand() * rand() * big), h = Math.round(w * (0.55 + rand() * 0.3));
    if (rand() < dens && !skip?.(x)) {
      const y = tops[(x + (w >> 1)) % W]!;
      rock(p, x, y - h + 3, w, h + 2, C);
      if (rand() < 0.35) {
        const w2 = Math.round(w * 0.6), h2 = Math.round(h * 0.65);
        rock(p, x + Math.round(w * (0.1 + rand() * 0.3)), y - h - h2 + 6, w2, h2, C);
      }
    }
    x += Math.max(3, Math.round(w * (0.45 + rand() * 0.9)));
  }
}

/** A hill of stacked granite boulders in shrinking tiers, with a balanced one on top. */
export function boulderHill(p: Pen, C: Tones, cx: number, baseY: number, w: number, h: number, rand: () => number): void {
  const r0 = Math.max(6, Math.min(15, Math.round(w / 5)));
  const tiers = Math.max(2, Math.round(h / (r0 * 1.1)));
  for (let k = 0; k < tiers; k++) {
    const f = k / tiers;
    const tw = Math.max(r0 * 2, w * Math.pow(1 - f, 0.85));
    const r = Math.max(4, Math.round(r0 * (1 - 0.45 * f)));
    const y = baseY - f * h - r * 0.4;
    const n = Math.max(1, Math.round((tw - 2 * r) / (r * 1.7)) + 1);
    p.r(C[1], Math.round(cx - tw / 2 + r), Math.round(y), Math.round(tw - 2 * r), Math.round(baseY - y) + 24); // solid core
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const rr = r + Math.floor(rand() * 3) - 1;
      const x = Math.round(cx - tw / 2 + r + t * (tw - 2 * r) + (rand() - 0.5) * r * 0.5);
      rock(p, x - rr, Math.round(y - rand() * r * 0.5) - rr, rr * 2 + 1, rr * 2 + 1, C);
    }
  }
  const rt = Math.max(4, Math.round(r0 * 0.55));
  rock(p, Math.round(cx + (rand() - 0.5) * r0) - rt, Math.round(baseY - h - rt * 1.7), rt * 2 + 1, rt * 2, C);
}

/** A stepped temple tower: a tall base with a doorway, shrinking tiers with niches, a barrel-vault cap with finials. */
export function gopuram(p: Pen, C: Stone, cx: number, base: number, w: number, tiers: number, th: number, litShare: number, rand: () => number): void {
  const bw = w + 6, bh = Math.round(th * 1.7);
  p.r(C.body, cx - bw / 2, base - bh, bw, bh + 40).r(C.body, cx - bw / 2 - 1, base - bh, bw + 2, 2);
  p.r(C.dark, cx - 2, base - bh + 5, 5, bh - 5).r(C.dark, cx - 1, base - bh + 4, 3, 1);
  let y = base - bh, tw = w;
  for (let i = 0; i < tiers; i++) {
    tw = Math.round(w * (1 - (i / (tiers + 1.2)) * 0.72));
    y -= th;
    p.r(C.body, cx - tw / 2, y, tw, th).r(C.body, cx - tw / 2 - 1, y, tw + 2, 1).r(C.dark, cx - tw / 2, y + th - 1, tw, 1);
    if (th > 4) {
      for (let nx = Math.round(cx - tw / 2) + 2; nx < cx + tw / 2 - 2; nx += 4) {
        const lit = C.lit !== null && rand() < litShare;
        p.r(lit ? C.lit! : C.dark, nx, y + 2, 2, th - 4);
      }
    }
  }
  const tp = Math.max(6, Math.round(tw * 0.9));
  p.r(C.body, cx - tp / 2, y - 4, tp, 4).r(C.body, cx - tp / 2 + 1, y - 6, tp - 2, 2);
  p.r(C.body, cx - tp / 2 - 1, y - 3, 1, 2).r(C.body, cx + tp / 2, y - 3, 1, 2);
  for (let k = 0; k < 3; k++) p.r(C.body, Math.round(cx - tp / 2 + 2 + (k * (tp - 5)) / 2), y - 8, 1, 2);
}

/** Where the lamp hangs in bay `bay` of a mandapa drawn with the same arguments. */
export const mandapaLamp = (x: number, baseY: number, gap: number, h: number, bay: number): [number, number] =>
  [x + bay * gap + 4 + ((gap - 4) >> 1) - 1, baseY - 5 - h + 6];

/** A ruined pillared hall: pillars on a plinth, lintels only where both neighbours still stand. */
export function mandapa(p: Pen, C: Stone, x: number, baseY: number, cols: number, gap: number, h: number, broken: readonly number[]): void {
  const w = (cols - 1) * gap + 4, c = C.body;
  p.r(c, x - 4, baseY - 3, w + 8, 16).r(c, x - 2, baseY - 5, w + 4, 2).r(C.dark, x - 2, baseY - 3, w + 4, 1);
  const top = baseY - 5 - h;
  for (let i = 0; i < cols; i++) {
    const px = x + i * gap;
    const isBroken = broken.includes(i);
    const ph = isBroken ? Math.round(h * 0.4) + (i % 2) * 5 : h;
    p.r(c, px, baseY - 5 - ph, 4, ph).r(c, px - 1, baseY - 8, 6, 3);
    if (isBroken) p.r(c, px, baseY - 5 - ph - 1, 2, 1);
    else p.r(c, px - 1, top, 6, 2).r(c, px - 2, top - 1, 8, 1);
    if (i < cols - 1 && !isBroken && !broken.includes(i + 1)) {
      p.r(c, px - 2, top - 5, gap + 8, 4).r(c, px - 3, top - 7, gap + 10, 2).r(C.dark, px - 2, top - 2, gap + 8, 1);
      for (let k = px; k < px + gap; k += 6) p.r(c, k, top - 9, 3, 2); // a row of worn finials
    }
  }
}

/** A crumbling arched gateway: two piers, a round arch, and a wall above that has fallen away on one side. */
export function ruinedArch(p: Pen, c: number, x: number, baseY: number, w: number, h: number): void {
  const r = w >> 1, inner = r - 5, cy = baseY - h + r;
  for (let dx = 0; dx <= w; dx++) {
    const u = dx - r;
    const bottom = Math.abs(u) < inner ? cy - Math.round(Math.sqrt(inner * inner - u * u)) : baseY + 10;
    const fallen = dx > w * 0.55 ? Math.floor((dx - w * 0.55) / 4) * 3 : 0;
    const top = baseY - h - 6 + fallen;
    p.r(c, x + dx, top, 1, bottom - top);
  }
  p.r(c, x - 2, baseY - h - 8, Math.round(w * 0.55) + 3, 2).r(c, x - 1, cy, 7, 2).r(c, x + w - 5, cy, 7, 2);
}

/**
 * A coconut palm: a slim leaning trunk and a crown of feathered fronds that spring up and out from one
 * point and arch over toward their tips. Each frond is a midrib with a comb of leaflets hanging from it,
 * longest in the middle and gone by the tip, so it reads as a feather and never as a webbed wing.
 */
export function palm(p: Pen, c: number, x: number, baseY: number, h: number, lean: number, rand: () => number): void {
  for (let i = 0; i <= h; i++) {
    const t = i / h;
    p.r(c, x + Math.round(lean * t * t), baseY - i, i < h * 0.1 ? 4 : i < h * 0.45 ? 3 : 2, 1);
  }
  const cx = x + lean + 1, cy = baseY - h;
  const big = h >= 50;
  const len0 = Math.min(34, 10 + h * 0.34);
  // launch angles (degrees above the horizon, right side then mirrored): low, mid, high
  const side = big ? [-8, 16, 42, 72] : [-6, 24, 62];
  const angles = [...side.map((a) => [a, 1] as const), ...side.map((a) => [a, -1] as const)];
  for (const [deg, dirX] of angles) {
    const ang = ((deg + (rand() - 0.5) * 10) * Math.PI) / 180;
    const up = Math.sin(ang), out = Math.cos(ang) * dirX;
    const len = Math.round(len0 * (0.85 + 0.25 * rand()) * (1 - 0.3 * Math.max(0, up)));
    const droop = len * (0.56 - 0.18 * up);
    const leaf = big ? 4 : 3;
    for (let s = 0; s <= len; s++) {
      const t = s / len;
      const px = Math.round(cx + out * s * (1 - 0.15 * t));
      const py = Math.round(cy - up * s + droop * t * t);
      p.r(c, px, py, 1, t < 0.6 ? 2 : 1);
      // the comb: gaps between the leaflets and every other one shorter, so the lower edge is serrated
      const l = Math.round(leaf * Math.sin(Math.PI * Math.min(1, t * 1.05)) - (s % 2));
      if (s >= 4 && s % 3 !== 0 && l > 0) p.r(c, px, py + 2, 1, l);
    }
  }
  p.disc(c, cx, cy + 1, 2);
  if (big) p.r(c, cx - 3, cy + 3, 2, 3).r(c, cx + 2, cy + 3, 2, 3); // coconuts under the crown
}

/** A banana clump: four broad paddle leaves of different lengths rising out of one stem, with sky between them. */
export function banana(p: Pen, c: number, x: number, baseY: number, rand: () => number): void {
  for (const lean0 of [-0.72, -0.2, 0.3, 0.8]) {
    const lean = lean0 + (rand() - 0.5) * 0.2;
    const len = Math.round((20 + rand() * 8) * (1 - 0.3 * Math.abs(lean0)));
    for (let s = 0; s <= len; s++) {
      const t = s / len;
      // rises along its lean, and nods a little at the tip
      const px = Math.round(x + Math.sin(lean) * s + Math.sign(lean) * 5 * t * t * t);
      const py = Math.round(baseY - 5 - Math.cos(lean) * s + 4 * t * t * t);
      const w = Math.max(1, Math.round(5.4 * Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.96))));
      p.r(c, px - (w >> 1), py, w, 2);
    }
  }
  p.r(c, x - 1, baseY - 9, 3, 11);
}

/** A spreading tree (banyan / neem): a short trunk, two boughs, a canopy of overlapping discs. */
export function tree(p: Pen, c: number, x: number, baseY: number, h: number, w: number, rand: () => number): void {
  p.r(c, x - 1, baseY - h, 3, h);
  p.line(c, x, baseY - h * 0.5, x - w * 0.3, baseY - h * 0.8, 2).line(c, x, baseY - h * 0.6, x + w * 0.3, baseY - h * 0.85, 2);
  for (let i = 0; i < 7; i++) {
    const dx = Math.round((rand() - 0.5) * w), dy = Math.round(rand() * h * 0.35);
    p.disc(c, x + dx, Math.round(baseY - h - dy + 3), Math.round(w * (0.16 + rand() * 0.14)));
  }
}

/** A hanging vine with small leaves, from y0 down. */
export function vine(p: Pen, stem: number, leaf: number, x: number, y0: number, len: number, phase: number): void {
  let vx = x;
  for (let y = 0; y < len; y++) {
    vx = x + Math.round(Math.sin(y / 4 + phase) * 1.5);
    p.r(stem, vx, y0 + y, 1, 1);
    if (y % 5 === 2) p.r(leaf, vx + (y % 10 === 2 ? 1 : -2), y0 + y, 2, 2);
  }
  p.r(leaf, vx - 1, y0 + len, 3, 2);
}

/** A tuft of long grass blades rising from baseY. */
export function tuft(p: Pen, cols: readonly number[], x: number, baseY: number, rand: () => number): void {
  const blades = 6 + Math.floor(rand() * 5);
  for (let i = 0; i < blades; i++) {
    const bx = x + i * 3 + Math.floor(rand() * 2);
    const h = 7 + Math.floor(rand() * 12);
    p.line(cols[i % cols.length]!, bx, baseY, bx + Math.floor(rand() * 7) - 3, baseY - h, 2);
  }
}
