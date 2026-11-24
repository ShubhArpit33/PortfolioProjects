# HAMPI AT DUSK — Game Spec (v1.1, one stage)

A 2D side-scrolling arcade motorcycle game set in the ruins of Hampi, Karnataka, at sunset.
16-bit pixel-art look. One stage, about 30–45 seconds for a clean run.

This file is the single source of truth. If something is not specified here, choose the
simplest option and write it down in `DECISIONS.md`.

> v1.1: revised after the spec review in `SPEC_REVIEW.md` (all 30 proposed edits applied).

---

## 1. Tech stack

| Item | Choice |
|---|---|
| Engine | Phaser 3, pinned `phaser@3.90.0` (not v4) — rendering, input, camera, tweens, particles only. Config: `banner: false`, `audio: { noAudio: true }`, `type: Phaser.CANVAS` when `?renderer=canvas` (used by tests), else `Phaser.AUTO`. |
| Physics | **Custom** (section 4). Do NOT use Arcade or Matter physics for the bike or terrain. |
| Language / build | TypeScript + Vite |
| Font | `@fontsource/press-start-2p` (bundled, no CDN) |
| Audio | WebAudio generated in code (no audio files) |
| Tests | Vitest for `tests/unit/*.test.ts` (pure physics); Playwright (Chromium only) for `tests/e2e/*.spec.ts`, served by `vite --mode test`. `npm test` = `vitest run && playwright test`. Vitest `include: ['tests/unit/**/*.test.ts']`; Playwright `testDir: 'tests/e2e'`. |
| Resolution | Internal 480×270, `pixelArt: true`, `roundPixels: true`, `Scale.FIT`, centered |
| Timestep | Fixed physics step of 1/120 s (accumulator), so the game behaves the same on every machine. Accumulator capped at 0.1 s per frame. Integrator (semi-implicit Euler): `vy += g·dt; x += vx·dt; y += vy·dt`. |

Commands that must work: `npm run dev`, `npm run build`, `npm test`.

---

## 2. Controls

| Key | Action |
|---|---|
| → | Throttle |
| ← | Brake (no reverse) |
| Space | Hop (ground only; 80 ms coyote time, 100 ms jump buffer; works on slopes; disabled on `noHop` segments, including coyote time off them) |
| ↑ / ↓ | In the air: tilt the nose up / down |
| Shift | Boost: while held, meter > 0 and grounded, acceleration is `boostAccel` (replaces `accel`, no throttle needed) and the cap is `boostSpeed`. No regen while held. When boost ends, speed above `topSpeed` decays at `brake` rate. The meter starts full. No effect in the air. The meter drains only while boost is actually applied (held, grounded, meter > 0); in the air it neither drains nor regenerates. |
| H | Honk (two-tone "pom-pom") |
| M | Mute / unmute |
| P / Esc | Pause |
| R | Restart from the last checkpoint (counts as a crash; the timer keeps running) |
| Enter | Start (title screen), Play again (finish screen) |

Speed along the slope is clamped to ≥ 0 (no rolling back).

The game captures Space and the arrow keys so they never scroll the page.

URL params: `?debug=1` (hitboxes, FPS, bike state readout, terrain line), `?cp=N` (start at checkpoint N), `?renderer=canvas` (Canvas renderer, used by tests).

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
  boostSpeed: 360,       // top speed while boosting
  boostAccel: 500,
  boostDrainPerSec: 0.6, // meter is 0..1
  boostRegenPerSec: 0.08,
  boostCleanLanding: 0.25,
  boostDiya: 0.1,
  hopVelocity: 280,
  slopeGravityFactor: 0.5,   // how much slopes slow you on the way up / speed you up on the way down
  airTiltSpeed: 180,         // deg/s with ↑/↓
  airNoseDropSpeed: 20,      // deg/s drift with no input
  safeLandingAngle: 35,      // |bike angle − slope angle| at or below this = safe
  cleanLandingAngle: 10,     // at or below this = "CLEAN!" + boost bonus
  monkeyStumbleFactor: 0.4,  // speed multiplier when hitting a monkey
  honkRange: 120,
  cameraLookAhead: 80,
  cameraLerp: 0.1,           // per 1/60 s; see section 4 Camera
  respawnDelayMs: 1000,
  bikeHitW: 24,              // bike AABB width
  bikeHitH: 16,              // bike AABB height
  diyaRadius: 10,
  airborneEps: 0.25,         // px above the surface that counts as airborne
  wallTolerance: 4,          // px below a gap's far lip that still snaps up
  minAirMsForLanding: 120,   // shorter airs re-attach silently
  angleEaseDegPerSec: 720,   // grounded angle easing toward the slope
  cowCrashSpeed: 60,
};
```

---

## 4. Bike physics model (custom)

The terrain is a **heightfield**: `surfaceY(x)` returns the ground's y at any world x, or `null` over a gap.
`slopeAngle(x)` is derived from it.

**Bike state:** `x, y, vx, vy, angle, grounded, boost (0..1)`.

`(x, y)` is the wheel-contact midpoint. The hitbox is an unrotated AABB `bikeHitW × bikeHitH`, bottom-centre at `(x, y)`.
`surfaceY` is continuous piecewise-linear (ramps interpolate; columns do not step).
Angles: positive = nose up or uphill; angle differences are normalised to [−180, 180].

**On the ground:**
1. Speed `v` along the slope changes with throttle, brake, drag, boost, and `−gravity·sin(slope)·slopeGravityFactor`.
   While boosting, cap at `boostSpeed`. Otherwise throttle cannot accelerate past `topSpeed`, and any speed above it
   (after boost, a landing, or a downhill) decays at `brake` rate, with no instant clamp. Clamp to ≥ 0.
2. Velocity vector = `(v·cos θ, −v·sin θ)` where θ is the slope angle.
3. Move one step as a projectile (with gravity). If the new y is **more than `airborneEps` (0.25 px) above the surface, or the surface is `null`**
   (ramp lip, cliff edge, gap), the bike becomes **airborne** and keeps its velocity. Otherwise snap to the surface
   and ease `angle` toward the slope angle at `angleEaseDegPerSec`.
4. Hop: `vy −= hopVelocity`, then airborne. Not allowed on `noHop` segments.

**In the air:** `vy += gravity·dt`. ↑/↓ rotate the bike at `airTiltSpeed`; with no input the nose drifts down at `airNoseDropSpeed`.

**Landing** (bike y reaches the surface):
- Airtime under `minAirMsForLanding`: silent re-attach, with no angle check, popup or bonus.
- `|angle − slope| ≤ cleanLandingAngle` → "CLEAN!" popup, +boost
- `≤ safeLandingAngle` → safe landing (no bounce in physics; visual squash or wobble only)
- otherwise → **crash**
- Keep only the part of the velocity that runs along the slope: `v = vx·cos θ − vy·sin θ`, clamped to ≥ 0.

**Gap far wall:** when the bike enters a solid column with `y > surfaceY + wallTolerance`, it crashes (sparks); otherwise it snaps up.
**Water:** `y > 230` while over a gap → crash (splash).

**Crash triggers:** bad landing; the bike AABB overlapping a pillar or cart AABB on any side, including the top;
overlapping the cow at a speed above `cowCrashSpeed` (below that the cow is solid, the bike stops, and the cow is unaffected either way);
gap wall; water.

**Crash sequence:** the bike tumbles (rotation tween and arc), sparks or a water splash, screen shake (150 ms), then after
`respawnDelayMs` fade out and back in at the last checkpoint with speed 0 and the boost meter full. The timer keeps running. Crash count +1.

**Respawn:** at `x = 16·cpCol + 8` on the surface. Collected diyas stay collected; the cow and the monkeys reset if they are ahead of
the checkpoint. A checkpoint activates when the bike's x reaches its x.

**Camera:** follows **x only**. The whole stage fits vertically in 270 px, so there is no vertical scrolling.
`scrollX = clamp(x + cameraLookAhead − 240, 0, 5280)`, smoothed by the factor `1 − (1 − cameraLerp)^(dt·60)`.

---

## 5. World layout

- Baseline surface (height h0) is at **y = 222**. Height `hN` = N tiles above it (y = 222 − 16·N).
- Water line in gaps: y = 226 (drawn), kill plane y = 230.
- Stage length 360 tiles = 5760 px.
- Column `c` covers x = 16c … 16c+15.

### 5.1 Terrain segments (authoritative; implement as data in `src/level/levelData.ts`)

`flat N` = N columns at the current height. `ramp N +R` / `ramp N −R` = rise or fall R tiles in a straight line over N columns.
`gap N` = N columns of water (no surface). `cliff hK` = instant drop to height K (vertical wall).
`(noHop)` marks a segment where hopping is disabled.

| Section | Columns | Segments (in order) |
|---|---|---|
| 1. Bazaar Street | 0–59 | flat 60 |
| 2. Canals | 60–139 | flat 8 · gap 3 · flat 8 · gap 4 · flat 8 · gap 5 · flat 6 · gap 3 · flat 3 · gap 3 · flat 8 · gap 6 · flat 15 |
| 3. Fallen Pavilion | 140–219 | flat 80 |
| 4. Boulder Field | 220–299 | flat 6 · ramp 6 +2 · flat 5 · ramp 4 −2 · flat 6 · ramp 8 +3 · flat 6 · cliff h0 · flat 10 · ramp 5 +1 · ramp 5 −1 · flat 19 |
| 5. Tungabhadra Leap | 300–359 | flat 20 · ramp 8 +4 **(noHop)** · **gap 12 (river)** · far bank at **h0** · flat 20 |

(Check: each section adds up to its column range. Gap columns, starting from column 60: 68–70, 79–82, 91–95, 102–104, 108–110, 119–124; river 328–339.)

After a gap the height is unchanged unless stated. The river's far bank is h0.

### 5.2 Entities (x = column, h = height above baseline in tiles)

Entity x is the left column; boxes extend right and up from the surface. Diya centre = `(16·x + 8, 222 − 16·h)`.
Pickup: a circle of `diyaRadius` overlapping the bike AABB.

| Type | Positions | Notes |
|---|---|---|
| Checkpoint (deepastambha, a stone lamp pillar) | cp0 x2 · cp1 x62 · cp2 x142 · cp3 x222 · cp4 x302 | Lamp lights up with a glow when passed. cp4 shows the hint "HOLD SHIFT - BOOST!" |
| Diya (brass oil lamp, collectible) | x18 h1, x22 h1, x26 h1 · x69 h3, x80 h3, x93 h3, x103 h3, x109 h3, x121 h3 · x157 h3, x199 h4, x213 h3 · x234 h3, x258 h4, x264 h3, x276 h3 · x332 h5 | **17 total.** Flame flickers. Pick-up radius `diyaRadius`. x276 needs a hop on the up-ramp; x264 is collected by rolling off the cliff without hopping. |
| Fallen pillar | x156, x184, x212 | 3 wide × 1 tall, solid → crash |
| Bullock cart (parked, no bullock) | x198 | 3 wide × 2 tall, solid → crash |
| Monkey troop | trigger x168 | When bike x ≥ 16·168, two monkeys (12×12 hitboxes) spawn at x = 16·178 and 16·180, run left at 40 px/s to x = 16·172 and 16·174, and sit. A honk with \|bike x − monkey x\| ≤ `honkRange` makes them leap away and become non-collidable at once. Contact = one stumble (speed × `monkeyStumbleFactor`, wobble), no crash; then that monkey leaps away. |
| Cow | x44 | Left column 44, box 32×24 (2 wide × 1.5 tall), standing on the road. Honk only shows a "..." bubble (the cow doesn't care). Wait within 3 tiles at under 20 px/s for 1.5 s and it walks right at 20 px/s for 2 s, fades out and becomes non-solid. Hopping over it also works. Resets on respawn at cp0. |
| Coracles | river, below the jump | Decoration, bobbing slowly |
| Finish (ruined temple gateway) | x352 | Triggers at bike x ≥ 16·352 while not crashed: the timer stops, input is ignored, the bike auto-brakes, and the finish screen shows. The world ends in an invisible wall at x = 5744. |

The cow and the monkeys are there for humour and local flavour. Keep them friendly, never harmed: the bike only stops or stumbles
(a fast hit on the cow crashes the bike, not the cow).

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
| Character neutrals: cream / brown / brass | `#f3ead7` / `#6b4a2e` / `#c98a3a` |

Alpha blends and tints of palette colours are allowed.

### 6.2 Parallax layers (back to front)

| Layer | Scroll factor | Code-drawn placeholder |
|---|---|---|
| Sky | 0.05 | Dithered gradient bands, large low sun, pixel stars, 2–3 kites |
| Far skyline | 0.2 | Stepped temple-tower (gopuram) silhouettes, pavilion outlines, a ridge of boulder hills |
| Middle ground | 0.45 | Coconut palms, banana plants, round boulder piles, river glints |
| Terrain + entities | 1.0 | Granite polygon from the heightfield, 2 px moss line on top, random stone speckles, glowing water in gaps. Baked into textures in chunks of at most 1024 px wide; never one 5760 px texture; not redrawn per frame. |
| Near foliage | 1.1 (in front of the bike) | Occasional grass tufts and hanging vines, sparse — never blocking the view of obstacles |

The stone chariot silhouette appears on the far skyline near the finish.

### 6.3 Bike (built from parts — no sprite-sheet animation)

- `bike_body` 40×24: roadster motorcycle (round headlamp, teardrop tank, single seat) with a rider in a helmet and jacket.
  It must be an original design: no brand names, logos or model numbers.
  (The sprite is 40 px wide; the collision box is `bikeHitW × bikeHitH`.)
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
- A master mute toggle (M). Create the AudioContext only inside a real DOM `keydown`/`pointerdown` handler.
  `__test.setInput` never creates audio. Phaser's own audio is disabled (`noAudio: true`).

---

## 8. Screens & HUD

All on-screen text is ASCII only. Wait for `document.fonts.load('8px "Press Start 2P"')` before the Title scene.

- **Title:** the parallax scene slowly auto-scrolls; "HAMPI AT DUSK" in UI yellow; "PRESS ENTER"; a controls hint.
- **HUD** (a separate UI scene that doesn't scroll): timer `00:00.00`, diyas `x/17`, boost bar, crash count.
  The timer starts on the first fixed step after Enter, pauses with Pause, and stops at the finish.
- **Popups:** "CLEAN!", "CHECKPOINT", short floating text.
- **Finish:** a yellow pixel frame (2 px UI-yellow border, 4 px notched corners, UI-ink fill) showing time, diyas, crashes, and
  three code-drawn star icons: star 1 finished · star 2 all 17 diyas · star 3 zero crashes. "ENTER - RIDE AGAIN".
- **Pause:** dim overlay, "PAUSED".

---

## 9. Acceptance criteria (the build is done only when all are true)

1. `npm run build` and `npm test` pass; no TypeScript errors.
2. Zero console errors, and zero warnings outside the allowlist in `tests/e2e/consoleAllowlist.ts`
   (browser GPU/SwiftShader notices only), during a full run. Tests run with `?renderer=canvas`.
3. **The bot run (Playwright)** finishes the stage with 0 crashes and all 17 diyas, within 120 s of game time (`timeMs`),
   driven by `__test.step`.
4. **The river jump needs boost:** a Playwright test shows that hitting the river ramp at top speed without boost lands in the
   water, and with boost from cp4 clears it with ≥ 1 tile to spare. "No boost" means no boost and no hop (the ramp is `noHop`).
   Margin = landing x − 5440 ≥ 16. Expected with these values: about 130 px of flight without boost (fails) and about 230 px with
   boost (38 px past the edge). Tune `ramp 8 +4`, the gap width or the speeds until this is true, and record the final values in `DECISIONS.md`.
5. Every canal gap can be cleared with a hop at normal top speed; none of them can be rolled across without a hop.
   This also holds at `boostSpeed`, through `wallTolerance`.
6. In a Vitest physics test at 240 px/s on flat ground, the range of take-off x that clears each pillar and the cart without overlap,
   divided by 240, is ≥ 120 ms (expected: cart about 220 ms, pillar about 370 ms).
7. Landing at 40° off the slope crashes; landing at 5° triggers "CLEAN!" (unit-test the landing function).
8. Manual check: 60 fps in desktop Chromium with the debug overlay. Automated: 10 000 physics steps take under 100 ms in Vitest.
   No fps assertion in Playwright.
9. Playwright saves screenshots to `test-results/shots/`: title, each section (1–5), mid-air over the river, finish screen.
   **Review these images yourself** and fix anything that looks broken (z-order, gaps in parallax seams, blurry pixels).

### 9.1 Test hooks

Expose `window.__test` only when `import.meta.env.DEV || import.meta.env.MODE === 'test'`:
- `setInput({ throttle, brake, hop, boost, tiltUp, tiltDown, honk })`
- `state()` → `{ x, y, vx, vy, v, angle, grounded, boost, crashed, crashes, diyas, finished, checkpoint, timeMs }`
- `startAt(checkpoint)`
- `setManual(true)` stops rAF-driven stepping; `step(n)` runs n fixed steps and one render synchronously
- `levelData`

All e2e tests use manual stepping. The bot may read `levelData` to time its hops and tilts.

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
  unit/  physics.test.ts
  e2e/   run.spec.ts  river.spec.ts  consoleAllowlist.ts
DECISIONS.md
```
