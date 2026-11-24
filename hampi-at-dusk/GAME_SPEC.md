# HAMPI AT DUSK — Game Spec (v1.3, one stage)

A 2D side-scrolling arcade motorcycle game set in the ruins of Hampi, Karnataka, at sunset.
16-bit pixel-art look. One stage, about 30–45 seconds for a clean run.

This file is the single source of truth. If something is not specified here, choose the
simplest option and write it down in `DECISIONS.md`.

> v1.1: revised after the spec review in `SPEC_REVIEW.md` (all 30 proposed edits applied).
>
> v1.2 (after play-testing): backing up at a standstill (sections 2, 3, 4) and background ambience (section 6.2).
>
> v1.3 (the gameplay loop): still one stage, now 580 columns with two new sections (5.1, 5.2); tricks (flips, section 4.1);
> game feel (landing dust and camera bump, boost streaks, speed look-ahead; sections 4 and 6.3); procedural music (section 7);
> best run, medals, ghost and quick restart (section 8.1). A clean bot run takes 38.1 s.

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
| ← | Brake while moving forward. At a standstill on the ground: back the bike up slowly ("paddling with the feet"), up to `reverseSpeed`. A press that braked the bike to a stop must be held `reverseHoldDelayMs` longer before it backs up; a fresh press backs up at once. Releasing stops the bike at `brake` rate; → while backing up stops it first, then drives forward. No hop while backing up. No effect in the air. |
| Space | Hop (ground only; 80 ms coyote time, 100 ms jump buffer; works on slopes; disabled on `noHop` segments, including coyote time off them) |
| ↑ / ↓ | In the air: tilt the nose up / down. A tap turns at `airTiltSpeed`; holding the key speeds the turn up to `airTiltMaxSpeed`, enough for a full flip off a ramp hop (section 4.1) |
| Shift | Boost: while held, meter > 0 and grounded, acceleration is `boostAccel` (replaces `accel`, no throttle needed) and the cap is `boostSpeed`. No regen while held. When boost ends, speed above `topSpeed` decays at `brake` rate. The meter starts full. No effect in the air. The meter drains only while boost is actually applied (held, grounded, meter > 0); in the air it neither drains nor regenerates. |
| H | Honk (two-tone "pom-pom") |
| M | Sound: cycles all sound -> music off -> everything muted (remembered) |
| P / Esc | Pause |
| R | Restart the run from the start, at once (also on the finish screen). Timer, diyas, crashes and flips reset |
| C | Back to the last checkpoint (counts as a crash; the timer keeps running) |
| G | Show / hide the ghost of the best run (remembered) |
| Enter | Start (title screen), ride again (finish screen) |

Speed along the slope is clamped to ≥ 0 (no rolling back).

The game captures Space and the arrow keys so they never scroll the page.

URL params: `?debug=1` (hitboxes, FPS, bike state readout, terrain line), `?cp=N` (start at checkpoint N, 0–6; a practice run: no medal, best or ghost), `?renderer=canvas` (Canvas renderer, used by tests).

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
  boostFlip: 0.35,           // meter refill per full flip landed without crashing (v1.3)
  hopVelocity: 280,
  slopeGravityFactor: 0.5,   // how much slopes slow you on the way up / speed you up on the way down
  airTiltSpeed: 180,         // deg/s with ↑/↓ (the rate of a tap, and where a hold starts)
  airTiltAccel: 700,         // deg/s² added while the same tilt key stays held (v1.3)
  airTiltMaxSpeed: 450,      // deg/s cap of a held tilt: a full flip takes about 0.93 s
  airNoseDropSpeed: 20,      // deg/s drift with no input
  safeLandingAngle: 35,      // |bike angle − slope angle| at or below this = safe
  cleanLandingAngle: 10,     // at or below this = "CLEAN!" + boost bonus
  monkeyStumbleFactor: 0.4,  // speed multiplier when hitting a monkey
  honkRange: 120,
  cameraLookAhead: 108,      // look-ahead at topSpeed (v1.3: grows with speed; was a fixed 80)
  cameraLookAheadRest: 56,   // at a standstill
  cameraLookAheadBoost: 166, // at boostSpeed
  cameraLookSmoothS: 0.3,    // time constant of the look-ahead smoothing
  cameraBumpPerImpact: 0.35, // landing bump: kick (px/s) per px/s of landing speed into the ground
  cameraBumpMaxPx: 5,
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
  reverseSpeed: 45,          // top speed backing up, grounded only
  reverseAccel: 120,
  reverseHoldDelayMs: 300,   // Left held through a stop: pause this long before backing up
};
```

---

## 4. Bike physics model (custom)

The terrain is a **heightfield**: `surfaceY(x)` returns the ground's y at any world x, or `null` over a gap.
`slopeAngle(x)` is derived from it.

**Bike state:** `x, y, vx, vy, angle, grounded, boost (0..1)`, plus `spin` (degrees turned in the current air, v1.3).

`(x, y)` is the wheel-contact midpoint. The hitbox is an unrotated AABB `bikeHitW × bikeHitH`, bottom-centre at `(x, y)`.
`surfaceY` is continuous piecewise-linear (ramps interpolate; columns do not step).
Angles: positive = nose up or uphill; angle differences are normalised to [−180, 180].

**On the ground:**
1. Speed `v` along the slope changes with throttle, brake, drag, boost, and `−gravity·sin(slope)·slopeGravityFactor`.
   While boosting, cap at `boostSpeed`. Otherwise throttle cannot accelerate past `topSpeed`, and any speed above it
   (after boost, a landing, or a downhill) decays at `brake` rate, with no instant clamp. Clamp to ≥ 0,
   except when backing up (v1.2): with ← held at `v = 0`, `v` goes down to `−reverseSpeed` at `reverseAccel`; slope gravity is not applied
   while `v ≤ 0` with ← held or while `v < 0` (the rider's feet hold the bike). A backing bike stops against a vertical face more than
   `wallTolerance` high (the foot of the cliff) and at the wall at the level start (x = 24); backing into a gap falls in as usual.
2. Velocity vector = `(v·cos θ, −v·sin θ)` where θ is the slope angle.
3. Move one step as a projectile (with gravity). If the new y is **more than `airborneEps` (0.25 px) above the surface, or the surface is `null`**
   (ramp lip, cliff edge, gap), the bike becomes **airborne** and keeps its velocity. Otherwise snap to the surface
   and ease `angle` toward the slope angle at `angleEaseDegPerSec`.
4. Hop: `vy −= hopVelocity`, then airborne. Not allowed on `noHop` segments.

**In the air:** `vy += gravity·dt`. ↑/↓ rotate the bike; with no input the nose drifts down at `airNoseDropSpeed`.
The tilt rate is `airTiltSpeed` on the first step of a press and grows by `airTiltAccel` while the same key stays held, up to
`airTiltMaxSpeed`; releasing or switching keys resets it. `spin` adds up every turn (tilt and drift, signed) since take-off.

**Landing** (bike y reaches the surface):
- Airtime under `minAirMsForLanding`: silent re-attach, with no angle check, popup or bonus.
- `|angle − slope| ≤ cleanLandingAngle` → "CLEAN!" popup, +boost
- `≤ safeLandingAngle` → safe landing (no bounce in physics; visual squash or wobble only)
- otherwise → **crash**
- Keep only the part of the velocity that runs along the slope: `v = vx·cos θ − vy·sin θ`, clamped to ≥ 0.

### 4.1 Tricks: flips (v1.3)

- On a landing the bike survives (`clean` or `safe`, not a silent re-attach), `flips = round(|spin| / 360)`, signed by direction
  (positive = backflip, nose up). A crash landing awards nothing.
- Each flip: popup "+FLIP" ("+DOUBLE FLIP", "+TRIPLE FLIP", "+NX FLIP"), which replaces "CLEAN!" (one landing popup at a time);
  `boostFlip` added to the meter per flip (on top of the clean bonus if the landing is also clean); +1 on the run's flip tally,
  shown in the HUD and on the finish screen.
- A held tilt makes a full turn in about 0.93 s. That fits a hop taken on a ramp (the kicker: 1.09–1.16 s of air; also the
  boulder-field ramps, the cliff and the rollers) but not a hop on flat ground (0.8 s), so flips need terrain and never happen
  by accident. Flips are optional: nothing in the stage requires one.

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
`scrollX = clamp(x + look − 240, 0, 8800)`, smoothed by the factor `1 − (1 − cameraLerp)^(dt·60)`.
`look` (v1.3) grows with speed: `cameraLookAheadRest` at 0, `cameraLookAhead` at `topSpeed`, `cameraLookAheadBoost` at
`boostSpeed` (linear in between), itself smoothed with time constant `cameraLookSmoothS`, frozen during a crash and reset on
respawn. Because the scroll smoothing trails a moving bike by about `v · 0.158 s`, the bike sits at screen x of about 184 at
rest, 170 at top speed and 131 at boost speed (the camera pulls back while boosting). The camera never jumps or runs backward
in a crash-free run.
**Landing bump (v1.3):** a `clean` or `safe` landing kicks a damped spring (about 4 Hz, damping ratio 0.6) by
`impact · cameraBumpPerImpact` px/s (×1.35 for `safe`), where `impact` is the speed into the ground. The view dips by up to
`cameraBumpMaxPx`; it only ever moves the world down. Driven by game time. The crash shake is unchanged.

---

## 5. World layout

- Baseline surface (height h0) is at **y = 222**. Height `hN` = N tiles above it (y = 222 − 16·N).
- Water line in gaps: y = 226 (drawn), kill plane y = 230.
- Stage length 580 tiles = 9280 px (v1.3; was 360).
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
| 5. Mandapa Run (v1.3) | 300–409 | flat 10 · ramp 4 +1 · flat 82 (the plinth, h1) · ramp 4 −1 · flat 10 |
| 6. Hemakuta Rocks (v1.3) | 410–519 | flat 8 · ramp 6 +1 · ramp 6 −1 · flat 4 · ramp 6 +2 · flat 5 · ramp 5 −2 · flat 12 · ramp 4 +2 (the kicker) · **gap 8 (the tank)** · far bank at **h0** · flat 30 · ramp 5 +1 · ramp 5 −1 · flat 6 |
| 7. Tungabhadra Leap | 520–579 | flat 20 · ramp 8 +4 **(noHop)** · **gap 12 (river)** · far bank at **h0** · flat 20 |

(Check: each section adds up to its column range. Gap columns, starting from column 60: 68–70, 79–82, 91–95, 102–104, 108–110, 119–124; tank 466–473; river 548–559.)

After a gap the height is unchanged unless stated. The far banks of the tank and the river are h0.

**Section 5, Mandapa Run:** a hop rhythm. Three fallen pillars 17 columns apart on the raised plinth, then a cart after a
longer beat (19 columns). A hop at top speed covers 12 columns, so there are 5 columns of ground between landings and take-offs.

**Section 6, Hemakuta Rocks:** two rollers, then the kicker. The kicker ramp ends over a stepped tank: rolling off it at top
speed falls in the water; a hop taken anywhere on the ramp clears it with big air (the flip spot), and so does boost alone.
The tank is the one gap that boost can cross without a hop. The hint "HOP ON THE RAMP!" shows at the section's checkpoint.

### 5.2 Entities (x = column, h = height above baseline in tiles)

Entity x is the left column; boxes extend right and up from the surface. Diya centre = `(16·x + 8, 222 − 16·h)`.
Pickup: a circle of `diyaRadius` overlapping the bike AABB.

| Type | Positions | Notes |
|---|---|---|
| Checkpoint (deepastambha, a stone lamp pillar) | cp0 x2 · cp1 x62 · cp2 x142 · cp3 x222 · cp4 x302 · cp5 x412 · cp6 x522 | Lamp lights up with a glow when passed. cp5 shows the hint "HOP ON THE RAMP!", cp6 "HOLD SHIFT - BOOST!" |
| Diya (brass oil lamp, collectible) | x18 h1, x22 h1, x26 h1 · x69 h3, x80 h3, x93 h3, x103 h3, x109 h3, x121 h3 · x157 h3, x199 h4, x213 h3 · x234 h3, x258 h4, x264 h3, x276 h3 · x325 h4, x333 h2, x342 h4, x350 h2, x359 h4, x378 h5 · x425 h2, x437 h4, x443 h7, x468 h7, x471 h8, x474 h7, x510 h2 · x552 h5 | **30 total.** Flame flickers. Pick-up radius `diyaRadius`. x276 needs a hop on the up-ramp; x264 is collected by rolling off the cliff without hopping. Section 5: one over each pillar and the cart, two on the plinth between hops. Section 6: x425 and x510 on roller crests (free), x437 and x443 on the arc of a hop taken on the second roller's up-ramp, x468–x474 on the arc of a hop taken mid-way up the kicker (an early or late hop misses the last one). |
| Fallen pillar | x156, x184, x212 · x324, x341, x358 (on the plinth) | 3 wide × 1 tall, solid → crash |
| Bullock cart (parked, no bullock) | x198 · x377 (on the plinth) | 3 wide × 2 tall, solid → crash |
| Colonnade | behind the plinth, columns 316–394 | Decoration only (v1.3): standing pillars and lintels in a dark, low-contrast tone, behind every entity |
| Monkey troop | trigger x168 | When bike x ≥ 16·168, two monkeys (12×12 hitboxes) spawn at x = 16·178 and 16·180, run left at 40 px/s to x = 16·172 and 16·174, and sit. A honk with \|bike x − monkey x\| ≤ `honkRange` makes them leap away and become non-collidable at once. Contact = one stumble (speed × `monkeyStumbleFactor`, wobble), no crash; then that monkey leaps away. |
| Cow | x44 | Left column 44, box 32×24 (2 wide × 1.5 tall), standing on the road. Honk only shows a "..." bubble (the cow doesn't care). Wait within 3 tiles at under 20 px/s for 1.5 s and it walks right at 20 px/s for 2 s, fades out and becomes non-solid. Hopping over it also works. Resets on respawn at cp0. |
| Coracles | river, below the jump | Decoration, bobbing slowly |
| Finish (ruined temple gateway) | x572 | Triggers at bike x ≥ 16·572 while not crashed: the timer stops, the run is scored (section 8.1), input is ignored, the bike auto-brakes, and the finish screen shows. The world ends in an invisible wall at x = 9264. |

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
| Terrain + entities | 1.0 | Granite polygon from the heightfield, 2 px moss line on top, random stone speckles, glowing water in gaps. Baked into textures in chunks of at most 1024 px wide; never one stage-wide texture; not redrawn per frame. |
| Near foliage | 1.1 (in front of the bike) | Occasional grass tufts and hanging vines, sparse — never blocking the view of obstacles |

The stone chariot silhouette appears on the far skyline near the finish.

**Ambience (v1.2).** Extra background detail, all behind the terrain layer, all in the 6.1 palette, low contrast:
stacked-boulder hills on the far skyline and behind the middle ground; a hazier back row in the middle ground with ruined
pillared halls (mandapas), arches, boulder stacks and more banana plants; small lamps in those ruins with a flickering glow;
bird flocks crossing the sky near the sun, giving way to bats in sections 5–7; fireflies just behind the road, densest by
the canals and the river; a smoke wisp from a small skyline shrine; coracles bobbing on the river.
Animated details are a pure function of game time and camera scroll (no tweens, no wall clock, no `Math.random`).

### 6.3 Bike (built from parts — no sprite-sheet animation)

- `bike_body` 40×24: roadster motorcycle (round headlamp, teardrop tank, single seat) with a rider in a helmet and jacket.
  It must be an original design: no brand names, logos or model numbers.
  (The sprite is 40 px wide; the collision box is `bikeHitW × bikeHitH`.)
- `wheel` 12×12, used twice and rotated by code at `speed / radius`.
- Code-driven motion: rider bobs by 1 px at speed, body leans back under throttle and forward under braking,
  exhaust puffs scale with throttle, a dust trail when grounded and fast, sparks on a hard landing.
- Game feel (v1.3), all pooled, deterministic (integer hash, no `Math.random`) and driven by game time:
  landing dust puffs to both sides, more and faster the harder the landing (low and wide, never above wheel height);
  a ring of sparks on a diya pickup; while boosting, a flickering exhaust flame and thin speed streaks through the sky band
  (screen space, drawn behind the terrain and every entity, so they never cover an obstacle or a diya).
- Ghost (section 8.1): the same sprites at 45% alpha, no effects, drawn just behind the bike.

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

- Engine (softened in v1.4): a triangle body with a quiet sawtooth purr, low-passed and high-passed at 45 Hz; pitch and
  volume follow speed and throttle; a brighter tone while boosting. No square sub-octave.
- Honk: two short square-wave tones ("pom-pom").
- Hop, landing thud, "CLEAN!" chime, diya pickup chime, crash crunch, water splash, checkpoint bell.
- "+FLIP" jingle (a quick rising run).
- **Music (rewritten in v1.4), original and generated in code** (`src/audio/music.ts`): an upbeat plucked loop in D, 104 bpm.
  A santoor-like plucked lead (Karplus-Strong strings rendered into buffers) plays a 2-bar hook and its answers in raag
  Bhupali (Sa Re Ga Pa Dha); a soft bansuri-like line (sines, a little breath noise, late vibrato) takes the B section;
  a clean sine bass and a soft low-passed pad follow the chords (D Bm G A in A, G A Bm A in B); short tabla-flavoured
  percussion (tight 'dha' kick, 'na' / 'tin' rim tones, shaker, clap in A'); a faint high-passed tanpura shimmer.
  Form: intro 4 bars, A 8, B 8, A' 8 (ornaments and a second voice), breakdown 4, about 74 s; later passes skip the intro
  and change the ornaments. While boosting the tempo lifts to 110 and hi-hats, an open hat and a four-on-the-floor kick
  come in (about half of that on the river run-up). No sawtooth or square anywhere in the music; the music bus is
  high-passed at 70 Hz and gently compressed, and the master has a safety limiter. Mixed well under the effects; dips for
  about a second on a crash. Plays on the title, in the game and on the finish screen. Notes are scheduled about 0.3 s
  ahead from the frame loop. `node scripts/render-music.mjs` renders a preview WAV offline and prints its levels.
- Sound modes (M): all sound, music off, everything muted. The mode is remembered. Create the AudioContext only inside a real
  DOM `keydown`/`pointerdown` handler, so no sound or music before the first key press or click.
  `__test.setInput` never creates audio. Phaser's own audio is disabled (`noAudio: true`). No console warnings.

---

## 8. Screens & HUD

All on-screen text is ASCII only. Wait for `document.fonts.load('8px "Press Start 2P"')` before the Title scene.

- **Title:** the parallax scene slowly auto-scrolls; "HAMPI AT DUSK" in UI yellow; "PRESS ENTER"; a controls hint;
  the best time with its medal once there is one.
- **HUD** (a separate UI scene that doesn't scroll): timer `00:00.00`, diyas `x/30`, boost bar, crash count, the flip tally
  once it is above 0, "BEST mm:ss.cc" (the time to beat) once there is one, and a "MUSIC OFF" / "MUTED" tag.
  The timer starts on the first fixed step after Enter, pauses with Pause, and stops at the finish.
- **Popups:** "CLEAN!", "+FLIP", "CHECKPOINT", short floating text.
- **Finish:** a yellow pixel frame (2 px UI-yellow border, 4 px notched corners, UI-ink fill). The medal earned (icons either
  side of "STAGE CLEAR", "GOLD MEDAL" / "NO MEDAL YET"); time, diyas and flips for this run next to the best before it, with a
  blinking "NEW BEST!" where the run beat it; crashes; the next target ("NEXT: SILVER UNDER 00:46.00", or after gold
  "GOLD! BEAT YOUR mm:ss.cc"); three code-drawn star icons: star 1 finished · star 2 all 30 diyas · star 3 zero crashes.
  "ENTER / R - RIDE AGAIN". A practice run (`?cp=N`) shows "PRACTICE RUN - NO MEDAL" and saves nothing.
- **Pause:** dim overlay, "PAUSED".

### 8.1 Replay loop (v1.3)

Only a run from cp0 is ranked. It is scored on the step it crosses the line.

- **Medals** by time, inclusive: gold ≤ 40.00 s, silver ≤ 46.00 s, bronze ≤ 56.00 s. Set from the bot's clean run (38.13 s,
  no flips, boost only at the river): gold leaves about 2 s of slack on that line. All diyas is the separate middle star.
- **Best run:** the fastest time, the most diyas and the most flips are kept, each on its own, in `localStorage`
  (`hampi-at-dusk.best`; the record carries the stage length and is ignored if that changes). Preferences (ghost on/off,
  sound mode) are in `hampi-at-dusk.prefs`. **Every storage access is wrapped in try/catch**; when storage is missing or
  throws, the game plays the same and the bests (and ghost) live in memory until the page is closed.
- **Ghost:** the bike's pose (x, y, angle) is recorded at 20 Hz of game time (every 6 fixed steps, from time 0, plus the pose
  on the line) and, when the run sets a new best time, stored with it: 7 base-36 characters per sample (x and y in half pixels,
  angle in whole degrees), about 5.3 kB for a 38 s run; runs over 120 s keep no ghost. In later ranked runs it is replayed
  against the run timer as a translucent bike (interpolated between samples), hidden after the line. It has no collisions and
  no effects. G toggles it (default on).
- **Quick restart:** R restarts the run at once, in a run and on the finish screen.

---

## 9. Acceptance criteria (the build is done only when all are true)

1. `npm run build` and `npm test` pass; no TypeScript errors.
2. Zero console errors, and zero warnings outside the allowlist in `tests/e2e/consoleAllowlist.ts`
   (browser GPU/SwiftShader notices only), during a full run. Tests run with `?renderer=canvas`.
3. **The bot run (Playwright)** finishes the stage with 0 crashes and all 30 diyas, within 120 s of game time (`timeMs`),
   driven by `__test.step`. (Measured: 38.13 s, a gold medal.)
4. **The river jump needs boost:** a Playwright test shows that hitting the river ramp at top speed without boost lands in the
   water, and with boost from the river checkpoint (cp6) clears it with ≥ 1 tile to spare. "No boost" means no boost and no hop (the ramp is `noHop`).
   Margin = landing x − 8960 ≥ 16. Expected with these values: about 130 px of flight without boost (fails) and about 230 px with
   boost (38 px past the edge). Tune `ramp 8 +4`, the gap width or the speeds until this is true, and record the final values in `DECISIONS.md`.
5. Every canal gap can be cleared with a hop at normal top speed; none of them can be rolled across without a hop.
   This also holds at `boostSpeed`, through `wallTolerance`. The kicker tank (v1.3): not rolled across at top speed; cleared
   by a hop from anywhere on the kicker ramp (take-off window ≥ 120 ms, ≥ 1 s of air, landing ≥ 16 px past it), or by boost.
6. In a Vitest physics test at 240 px/s on flat ground, the range of take-off x that clears each pillar and the cart without overlap,
   divided by 240, is ≥ 120 ms (expected: cart about 220 ms, pillar about 370 ms).
7. Landing at 40° off the slope crashes; landing at 5° triggers "CLEAN!" (unit-test the landing function).
8. Manual check: 60 fps in desktop Chromium with the debug overlay. Automated: 10 000 physics steps take under 100 ms in Vitest.
   No fps assertion in Playwright.
9. Playwright saves screenshots to `test-results/shots/`: title, each section (1–7), a flip in mid-air, boost streaks,
   mid-air over the river, the ghost, the finish screen with medal and best.
   **Review these images yourself** and fix anything that looks broken (z-order, gaps in parallax seams, blurry pixels).

10. (v1.3) Vitest: a held backflip and frontflip off the kicker land and count; a partial rotation, a crash and a flat-ground
    hop do not; medal thresholds; best-run storage round-trip, including storage that throws; ghost encode / decode / playback.
    Playwright: a flip in the real game; best, medal, ghost, G and R after the bot run; a full run with `localStorage` throwing;
    audio only after a real key press, M cycling the sound modes.

### 9.1 Test hooks

Expose `window.__test` only when `import.meta.env.DEV || import.meta.env.MODE === 'test'`:
- `setInput({ throttle, brake, hop, boost, tiltUp, tiltDown, honk })`
- `state()` → `{ x, y, vx, vy, v, angle, grounded, boost, crashed, crashes, diyas, finished, checkpoint, timeMs, flips, spin, camX, ghost }`
  (`ghost` = the pose the ghost is drawn at, or null)
- `finish()` → the scored run once the line is crossed (medal, next target, bests before it, what was beaten, whether it was saved)
- `audio()` → `{ created, state, mode, musicPeak, masterPeak }`; never creates audio
- `startAt(checkpoint)`
- `setManual(true)` stops rAF-driven stepping; `step(n)` runs n fixed steps and one render synchronously
- `levelData`

All e2e tests use manual stepping. The bot may read `levelData` to time its hops and tilts.

---

## 10. Out of scope

Touch controls, more stages, an online leaderboard, gamepad support, recorded music or audio files.
(v1.3 brought the local best run and code-generated music into scope.)

---

## 11. Suggested file layout

```
src/
  main.ts            config.ts
  scenes/  Boot.ts  Title.ts  Game.ts  Hud.ts  Finish.ts
  level/   levelData.ts  terrain.ts (heightfield, surfaceY, slopeAngle)
  bike/    BikePhysics.ts (pure, no Phaser — unit-testable)  BikeView.ts
  entities/ Diya.ts  Obstacle.ts  Monkey.ts  Cow.ts  Checkpoint.ts
  art/     assets.ts  placeholders.ts  palette.ts  Parallax.ts  Ambience.ts  Fx.ts
  audio/   sfx.ts  music.ts
  progress.ts        (medals, best run, ghost, storage; pure, no Phaser)
tests/
  unit/  physics.test.ts  progress.test.ts
  e2e/   run.spec.ts  river.spec.ts  reverse.spec.ts  flip.spec.ts  storage.spec.ts  audio.spec.ts
         bot.ts  helpers.ts  consoleAllowlist.ts
DECISIONS.md
```
