// The only colours the game uses (GAME_SPEC.md section 6.1). Alpha blends / mixes of these are allowed.
export const PAL = {
  skyTop: 0x2b1a4a,
  skyMid: 0x6b2d6b,
  skyHorizon: 0xe0673a,
  sun: 0xffb347,
  gold: 0xf4c542,
  skyline: 0x3d2350,
  mid: 0x2a1f3d,
  graniteLight: 0x8a6f5a,
  graniteDark: 0x4a3b35,
  mossLight: 0xa8d84a,
  mossDark: 0x7fae3a,
  water: 0x3a2850,
  glint: 0xff9a4a,
  uiYellow: 0xf7d23e,
  ink: 0x1a1020,
  bikeBody: 0x7a1f1f,
  chrome: 0xd9d4c7,
  tyre: 0x1c1418,
  cream: 0xf3ead7,
  brown: 0x6b4a2e,
  brass: 0xc98a3a,
} as const;

/** Mix two palette colours (t = 0 -> a, t = 1 -> b). */
export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export function css(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

/** Small deterministic PRNG (mulberry32) so the code-drawn art is identical on every boot. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
