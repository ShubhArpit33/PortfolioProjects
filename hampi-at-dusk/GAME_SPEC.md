# HAMPI AT DUSK — Game Spec (v1, one stage)

A 2D side-scrolling arcade motorcycle game set in the ruins of Hampi, Karnataka, at sunset.
16-bit pixel-art look. One stage, about 45–60 seconds for a clean run.

This file is the single source of truth. If something is not specified here, choose the
simplest option and write it down in `DECISIONS.md`.

---

## 1. Tech stack

| Item | Choice |
|---|---|
| Engine | Phaser 3 (latest 3.x) — rendering, input, camera, tweens, particles only |
| Physics | **Custom** (section 4). Do NOT use Arcade or Matter physics for the bike or terrain. |
| Language / build | TypeScript + Vite |
| Font | `@fontsource/press-start-2p` (bundled, no CDN) |
| Audio | WebAudio generated in code (no audio files) |
| Tests | Playwright |
| Resolution | Internal 480×270, `pixelArt: true`, `roundPixels: true`, `Scale.FIT`, centered |
| Timestep | Fixed physics step of 1/120 s (accumulator), so the game behaves the same on every machine |

Commands that must work: `npm run dev`, `npm run build`, `npm test`.

---

## 2. Controls

| Key | Action |
|---|---|
| → | Throttle |
| ← | Brake (no reverse) |
| Space | Hop (only on the ground; 80 ms coyote time, 100 ms jump buffer) |
| ↑ / ↓ | In the air: tilt the nose up / down |
| Shift | Boost (uses the boost meter) |
| H | Honk (two-tone "pom-pom") |
| P / Esc | Pause |
| R | Restart from the last checkpoint |
| Enter | Start (title screen), Play again (finish screen) |

URL params: `?debug=1` (hitboxes, FPS, bike state readout, terrain line), `?cp=N` (start at checkpoint N).

---

## 3. Tuning values — all in `src/config.ts`

Units: px, px/s, px/s², degrees. 1 tile = 16 px. These are **starting values**; section 9 defines what must be true after tuning.

```ts
export const CONFIG = {
  gravity: 700,
  accel: 160,            // throttle, on the ground
  brake: 400,
  coastDrag: 60,         // no input
  topSpeed: 240,
  boostSpeed: 340,       // top speed while boosting
  boostAccel: 500,
  boostDrainPerSec: 0.6, // meter is 0..1
  boostRegenPerSec: 0.08,
  boostCleanLanding: 0.25,
  boostDiya: 0.1,
  hopVelocity: 260,
  slopeGravityFactor: 0.5,   // how much slopes slow you on the way up / speed you up on the way down
  airTiltSpeed: 180,         // deg/s with ↑/↓
  airNoseDropSpeed: 20,      // deg/s drift with no input
  safeLandingAngle: 35,      // |bike angle − slope angle| at or below this = safe
  cleanLandingAngle: 10,     // at or below this = "CLEAN!" + boost bonus
  monkeyStumbleFactor: 0.4,  // speed multiplier when hitting a monkey
  honkRange: 120,
  cameraLookAhead: 80,
  cameraLerp: 0.1,
  respawnDelayMs: 1000,
};
```

---

## 4. Bike physics model (custom)

The terrain is a **heightfield**: `surfaceY(x)` returns the ground's y at any world x, or `null` over a gap.
`slopeAngle(x)` is derived from it.

**Bike state:** `x, y, vx, vy, angle, grounded, boost (0..1)`.

**On the ground:**
1. Speed `v` along the slope changes with throttle, brake, drag, boost, and `−gravity·sin(slope)·slopeGravityFactor`.
   Limit it to `topSpeed`, or `boostSpeed` while boosting.
2. Velocity vector = `(v·cos θ, −v·sin θ)` where θ is the slope angle.
3. Move one step as a projectile (with gravity). If the new y is **more than 1 px above** the surface
   (ramp lip, cliff edge, gap), the bike becomes **airborne** and keeps its velocity. Otherwise snap to the surface
   and ease `angle` toward the slope angle.
4. Hop: `vy −= hopVelocity`, then airborne.

**In the air:** `vy += gravity·dt`. ↑/↓ rotate the bike at `airTiltSpeed`; with no input the nose drifts down at `airNoseDropSpeed`.

**Landing** (bike y reaches the surface):
- `|angle − slope| ≤ cleanLandingAngle` → "CLEAN!" popup, +boost
- `≤ safeLandingAngle` → safe landing, with a small bounce or wobble
- otherwise → **crash**
- Keep only the part of the velocity that runs along the slope.

**Crash triggers:** bad landing; touching a pillar or cart; touching the cow above 60 px/s; falling below the water line in a gap.

**Crash sequence:** the bike tumbles (rotation tween and arc), sparks or a water splash, screen shake (150 ms), then after
`respawnDelayMs` fade out and back in at the last checkpoint with speed 0 and the boost meter full. The timer keeps running. Crash count +1.

The camera follows **x only**. The whole stage fits vertically in 270 px, so there is no vertical scrolling.

---

## 5. World layout

- Baseline surface (height h0) is at **y = 222**. Height `hN` = N tiles above it (y = 222 − 16·N).
- Water line in gaps: y = 226 (drawn), kill plane y = 230.
- Stage length 360 tiles = 5760 px.
- Column `c` covers x = 16c … 16c+15.

### 5.1 Terrain segments (authoritative; implement as data in `src/level/levelData.ts`)

`flat N` = N columns at the current height. `ramp N +R` / `ramp N −R` = rise or fall R tiles in a straight line over N columns.
`gap N` = N columns of water (no surface). `cliff hK` = instant drop to height K (vertical wall).

| Section | Columns | Segments (in order) |
|---|---|---|
| 1. Bazaar Street | 0–59 | flat 60 |
| 2. Canals | 60–139 | flat 8 · gap 3 · flat 8 · gap 4 · flat 8 · gap 5 · flat 6 · gap 3 · flat 3 · gap 3 · flat 8 · gap 6 · flat 15 |
| 3. Fallen Pavilion | 140–219 | flat 80 |
| 4. Boulder Field | 220–299 | flat 6 · ramp 6 +2 · flat 5 · ramp 4 −2 · flat 6 · ramp 8 +3 · flat 6 · cliff h0 · flat 10 · ramp 5 +1 · ramp 5 −1 · flat 19 |
| 5. Tungabhadra Leap | 300–359 | flat 20 · ramp 8 +4 · **gap 12 (river)** · flat 20 |

(Check: each section adds up to its column range. Gap columns, starting from column 60: 68–70, 79–82, 91–95, 102–104, 108–110, 119–124; river 328–339.)

### 5.2 Entities (x = column, h = height above baseline in tiles)

| Type | Positions | Notes |
|---|---|---|
| Checkpoint (deepastambha, a stone lamp pillar) | cp0 x2 · cp1 x62 · cp2 x142 · cp3 x222 · cp4 x302 | Lamp lights up with a glow when passed. cp4 shows the hint "HOLD SHIFT — BOOST!" |
| Diya (brass oil lamp, collectible) | x18 h1, x22 h1, x26 h1 · x69 h3, x80 h3, x93 h3, x103 h3, x109 h3, x121 h3 · x157 h3, x199 h4, x213 h3 · x234 h3, x258 h4, x264 h3, x276 h3 · x332 h5 | **17 total.** Flame flickers. Pick-up radius 10 px. |
| Fallen pillar | x156, x184, x212 | 3 wide × 1 tall, solid → crash |
| Bullock cart (parked, no bullock) | x198 | 3 wide × 2 tall, solid → crash |
| Monkey troop | trigger x168 | When the bike passes x168, 2 monkeys run from the right edge across the road around x172–176. Contact = stumble (speed × 0.4, wobble), no crash. Honking in range makes them leap off-screen. |
| Cow | x44 | 2 wide × 1.5 tall, standing on the road. Honk only shows a "…" bubble (the cow doesn't care). Wait within 3 tiles at under 20 px/s for 1.5 s and it ambles off. Hopping over it also works. |
| Coracles | river, below the jump | Decoration, bobbing slowly |
| Finish (ruined temple gateway) | x352 | Crossing it triggers the finish screen |

The cow and the monkeys are there for humour and local flavour. Keep them friendly, never harmed: the bike only stops or stumbles.

---

## 6. Art direction

**Placeholder-first rule:** the game must look decent using **only art drawn in code** (Phaser Graphics → `generateTexture`
at boot). Every texture is loaded through `src/art/assets.ts`: if a PNG exists in `public/assets/` with the manifest name,
use it; otherwise use the code-drawn version. This way the build never depends on art being ready.

### 6.1 Palette (use only these colours)

| Role | Hex |
|---|---|
| Sky top / mid / horizon | `#2b1a4a` / `#6b2d6b` / `#e0673a` |
| Sun / gold highlight | `#ffb347` / `#f4c542` |
| Far skyline silhouette | `#3d2350` |
| Middle ground silhouette | `#2a1f3d` |
| Granite light / dark | `#8a6f5a` / `#4a3b35` |
| Moss light / dark | `#a8d84a` / `#7fae3a` |
| Water base / sunset glint | `#3a2850` / `#ff9a4a` |
| UI yellow / UI ink | `#f7d23e` / `#1a1020` |
| Bike body / chrome / tyre | `#7a1f1f` / `#d9d4c7` / `#1c1418` |

### 6.2 Parallax layers (back to front)

| Layer | Scroll factor | Code-drawn placeholder |
|---|---|---|
| Sky | 0.05 | Dithered gradient bands, large low sun, pixel stars, 2–3 kites |
| Far skyline | 0.2 | Stepped temple-tower (gopuram) silhouettes, pavilion outlines, a ridge of boulder hills |
| Middle ground | 0.45 | Coconut palms, banana plants, round boulder piles, river glints |
| Terrain + entities | 1.0 | Granite polygon from the heightfield, 2 px moss line on top, random stone speckles, glowing water in gaps |
| Near foliage | 1.1 (in front of the bike) | Occasional grass tufts and hanging vines, sparse — never blocking the view of obstacles |

The stone chariot silhouette appears on the far skyline near the finish.

### 6.3 Bike (built from parts — no sprite-sheet animation)

- `bike_body` 40×24: roadster motorcycle (round headlamp, teardrop tank, single seat) with a rider in a helmet and jacket.
  It must be an original design: no brand names, logos or model numbers.
- `wheel` 12×12, used twice and rotated by code at `speed / radius`.
- Code-driven motion: rider bobs by 1 px at speed, body leans back under throttle and forward under braking,
  exhaust puffs scale with throttle, a dust trail when grounded and fast, sparks on a hard landing.

### 6.4 Asset manifest (optional PNGs that replace the placeholders)

| File | Size (px) | Notes |
|---|---|---|
| `bg_sky.png` | 960×270 | tiles horizontally |
| `bg_skyline.png` | 960×270 | transparent, tiles horizontally |
| `bg_mid.png` | 960×270 | transparent, tiles horizontally |
| `fg_near.png` | 960×270 | transparent, tiles horizontally, sparse |
| `bike_body.png` | 40×24 | transparent |
| `wheel.png` | 12×12 | transparent |
| `tile_granite.png` | 16×16 | tiles in both directions, used as a texture fill |
| `pillar.png` / `cart.png` / `cow.png` | 48×16 / 48×32 / 32×24 | transparent |
| `monkey.png` | 32×16 | 2 frames of 16×16 |
| `deepastambha.png` | 16×48 | 2 frames: unlit / lit |
| `diya.png` | 8×8 | |
| `gateway.png` | 96×96 | transparent |
| `coracle.png` | 24×10 | transparent |

---

## 7. Audio (WebAudio, generated in code)

- Engine: sawtooth plus a low-pass filter; pitch and volume follow speed and throttle; a rougher tone while boosting.
- Honk: two short square-wave tones ("pom-pom").
- Hop, landing thud, "CLEAN!" chime, diya pickup chime, crash crunch, water splash, checkpoint bell.
- A master mute toggle (M). Audio starts only after the first key press, because browsers block it until then.

---

## 8. Screens & HUD

- **Title:** the parallax scene slowly auto-scrolls; "HAMPI AT DUSK" in UI yellow; "PRESS ENTER"; a controls hint.
- **HUD** (a separate UI scene that doesn't scroll): timer `00:00.00`, diyas `x/17`, boost bar, crash count.
- **Popups:** "CLEAN!", "CHECKPOINT", short floating text.
- **Finish:** a yellow pixel frame with notched corners (style taken from the reference) showing time, diyas, crashes, and 3 stars:
  ⭐ finished · ⭐ all 17 diyas · ⭐ zero crashes. "ENTER — RIDE AGAIN".
- **Pause:** dim overlay, "PAUSED".

---

## 9. Acceptance criteria (the build is done only when all are true)

1. `npm run build` and `npm test` pass; no TypeScript errors.
2. Zero console errors or warnings during a full run.
3. **The bot run (Playwright)** finishes the stage with 0 crashes and all 17 diyas, within 120 s.
4. **The river jump needs boost:** a Playwright test shows that hitting the river ramp at top speed without boost lands in the
   water, and with boost from cp4 clears it with ≥ 1 tile to spare. Tune `ramp 8 +4`, the gap width or the speeds until this is true,
   and record the final values in `DECISIONS.md`.
5. Every canal gap can be cleared with a hop at normal top speed; none of them can be rolled across without a hop.
6. Pillars and the cart can be hopped at top speed with a timing window of at least 120 ms (measure it in a test).
7. Landing at 40° off the slope crashes; landing at 5° triggers "CLEAN!" (unit-test the landing function).
8. Holds 60 fps in Chromium on a mid-range laptop (debug overlay shows it).
9. Playwright saves screenshots to `test-results/shots/`: title, each section (1–5), mid-air over the river, finish screen.
   **Review these images yourself** and fix anything that looks broken (z-order, gaps in parallax seams, blurry pixels).

### 9.1 Test hooks

Expose `window.__test` only in dev and test builds:
- `setInput({ throttle, brake, hop, boost, tiltUp, tiltDown, honk })`
- `state()` → `{ x, y, vx, vy, angle, grounded, crashed, crashes, diyas, finished, checkpoint, timeMs }`
- `startAt(checkpoint)`

The bot may read `levelData` to time its hops and tilts.

---

## 10. Out of scope for v1

Touch controls, more stages, a leaderboard, saving progress, gamepad support, music tracks.

---

## 11. Suggested file layout

```
src/
  main.ts            config.ts
  scenes/  Boot.ts  Title.ts  Game.ts  Hud.ts  Finish.ts
  level/   levelData.ts  terrain.ts (heightfield, surfaceY, slopeAngle)
  bike/    BikePhysics.ts (pure, no Phaser — unit-testable)  BikeView.ts
  entities/ Diya.ts  Obstacle.ts  Monkey.ts  Cow.ts  Checkpoint.ts
  art/     assets.ts  placeholders.ts  palette.ts
  audio/   sfx.ts
tests/
  physics.test.ts    run.spec.ts    river.spec.ts
DECISIONS.md
```
