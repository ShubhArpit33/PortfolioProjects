# OPEN ROADS: INDIA — Game Spec (v1.9, the journey; one stage so far, three bikes)

The game was renamed from "Hampi at Dusk" (v1.6.5); Hampi at Dusk is now the name of Stage 1.

A 2D side-scrolling arcade motorcycle game set in the ruins of Hampi, Karnataka, at sunset.
16-bit pixel-art look. One stage, about a minute for a clean run (50–70 s, by bike).

This file is the single source of truth. If something is not specified here, choose the
simplest option and write it down in `DECISIONS.md`.

> v1.1: revised after the spec review in `SPEC_REVIEW.md` (all 30 proposed edits applied).
>
> v1.2 (after play-testing): backing up at a standstill (sections 2, 3, 4) and background ambience (section 6.2).
>
> v1.3 (the gameplay loop): still one stage, now 580 columns with two new sections (5.1, 5.2); tricks (flips, section 4.1);
> game feel (landing dust and camera bump, boost streaks, speed look-ahead; sections 4 and 6.3); procedural music (section 7);
> best run, medals, ghost and quick restart (section 8.1). A clean bot run takes 38.1 s.
>
> v1.5: pause menu and the way back to the title (section 8).
>
> v1.6 (the roster): three bikes to choose from, each with its own feel, sprite, medal targets and records
> (section 3.1, 6.3, 8, 8.1). The stage, the background and `CONFIG` are unchanged.
>
> v1.7 (the one-minute stage): still one stage, now 900 columns with three new sections: a Warm-up Road that teaches the
> controls and cannot crash the bike, a Ruins Road breather with a bonus ramp, and the Temple Steps (risers, a rolling
> boulder, stairs down). 12 checkpoints, 56 diyas, tutorial prompts until one full run is finished (sections 5, 5.3).
> Medals are recomputed from the new bot runs and are more generous at the bronze end; records are version 2 and the
> old ones are archived (section 8.1). `CONFIG`, the three bikes' tuning and the background are unchanged.
>
> v1.8 (HD look, round 1): art only. The background, the road's texture, the glows and the mist come from a shared
> look system with one theme per stage (sections 6.1, 6.2, 6.5). Physics, level, timings and medals are unchanged.
>
> v1.9 (the journey): the game is a journey through the stages on one bike and 5 helmets, with single runs of a stage
> beside it (sections 8, 8.2). A stage is one object (`StageDef`, section 5.4) in a registry, so Goa and Ladakh plug
> in; only Hampi exists so far. Hampi has 4 checkpoints instead of 12 (section 5.2). Records are version 3, per stage
> and bike, and the version 2 records carry over (section 8.1). The road, the physics and the bot's runs are unchanged.

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
| P / Esc | Pause menu. A single run: Resume / Restart / Change bike / Main menu. A journey: Resume / Restart stage (costs a helmet) / Quit journey |
| R | A single run: restart it from the start, at once (also on the finish screen). Timer, diyas, crashes and flips reset. In a journey R does nothing (a hint points to the pause menu): a restart there costs a helmet |
| C | Back to the last checkpoint (counts as a crash, so in a journey it costs a helmet; the timer keeps running) |
| G | Show / hide the ghost of the best run (remembered). Single runs only: no ghost rides in a journey |
| Enter | Pick the highlighted option on every menu; ride again (a single run's finish screen); ride on (the stage card); skip the GAME OVER screen |

Speed along the slope is clamped to ≥ 0 (no rolling back).

The game captures Space and the arrow keys so they never scroll the page.

URL params: `?debug=1` (hitboxes, FPS, bike state readout, terrain line), `?cp=N` (start a single run at checkpoint N, 0–3 on Hampi; a practice run: no medal, best or ghost), `?stage=<id>` (the stage of that practice run; default the first), `?renderer=canvas` (Canvas renderer, used by tests).

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

### 3.1 The roster (v1.6)

Three bikes. Each is a set of **overrides on `CONFIG`** (`src/bike/bikes.ts`); `CONFIG` itself is the Daybreak and is not
changed. All three share the 24 × 16 hitbox, the wheel contact points, gravity, brakes and every stage rule. The Game scene
takes the selected bike's config (`this.cfg`) and uses it for everything in the run: stepping, respawn, collisions, the cow,
monkeys, diyas, the horn, the camera and the engine pitch.

| | **Ton-Up** (`tonup`) | **Daybreak** (`daybreak`, default) | **Sundowner** (`sundowner`) |
|---|---|---|---|
| Character | cafe racer: fast, sharp, strict | the all-rounder | bobber: slow, easy, forgiving |
| `topSpeed` / `accel` | 288 / 180 | 240 / 160 | 204 / 220 |
| `boostSpeed` / `boostAccel` | 420 / 800 | 360 / 500 | 350 / 380 |
| `boostDrainPerSec` / `boostRegenPerSec` | 0.72 / 0.096 | 0.6 / 0.08 | 0.36 / 0.048 |
| `boostCleanLanding` / `boostDiya` | 0.30 / 0.12 | 0.25 / 0.10 | 0.15 / 0.06 |
| `hopVelocity` | 260 | 280 | 280 |
| `airTiltSpeed` / `airTiltAccel` / `airTiltMaxSpeed` | 200 / 900 / 520 | 180 / 700 / 450 | 150 / 500 / 360 |
| `safeLandingAngle` / `cleanLandingAngle` | 25 / 7 | 35 / 10 | 45 / 13 |
| `cameraLookAhead` / `cameraLookAheadBoost` | 124 / 184 | 108 / 166 | 108 / 166 |
| Medals: gold / silver / bronze (v1.7) | 53 / 63 / 110 s | 63 / 75 / 131 s | 73 / 87 / 153 s |
| Stat bars (SPEED PULL BOOST FLIP GRIP, 1–5) | 5 3 1 5 1 | 3 2 2 3 3 | 1 5 5 1 5 |

The stat bars are computed from the config: SPEED = `topSpeed`, PULL = `accel`, BOOST = seconds of boost in a full tank
(`1 / boostDrainPerSec`), FLIP = `airTiltMaxSpeed`, GRIP = `safeLandingAngle`.

What the numbers mean on the stage (all measured; see `DECISIONS.md` v1.6 and v1.7):
- Every bike clears every canal, riser, pillar, cart, the cow, the log, the boulder, the kicker and the river by the same
  rules; no canal or riser can be rolled on any of them, and the river needs boost on all three.
- **Ton-Up:** a flat hop is 214 px, so the paired canals (columns 222–230) are taken in one hop. Rolling off the kicker at
  its full 288 px/s just skims the tank (a perk; the hop is the safe line). A landing more than 25° off the slope is a
  crash, so the bike has to be flown level.
- **Sundowner:** a flat hop is 163 px, short enough to land on the 48 px platform between the paired canals and hop again
  (its easy line; one hop also works, with a short window). Its flip only just fits the kicker's air, and its 45° safe
  band forgives the landing. A full tank is 2.8 s of boost.

The bike is chosen on the select screen (section 8), with `?bike=tonup|daybreak|sundowner` (this page load only), or it is
the one ridden last (remembered in the prefs).

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
- v1.7: the **bonus ramp** on Ruins Road (ramp 9 +3, a 5-column top, a cliff back to h0) is a second flip spot with nothing
  to lose: a backflip lands from almost anywhere on it (216 of 220 px of take-off on the Daybreak, 204 on the Ton-Up, 108 on
  the Sundowner), and ignoring it (rolling over it at any speed, with or without boost) never crashes.

**Gap far wall:** when the bike enters a solid column with `y > surfaceY + wallTolerance`, it crashes (sparks); otherwise it snaps up.
**Water:** `y > 230` while over a gap → crash (splash).
**Riser (v1.7):** a one-column *dry* gap whose far bank is one tile higher than its near bank. The physics is exactly a
gap's: a hop that comes down on the upper step clears it; rolling into it meets the far wall (a wall crash, sparks, never
a splash). The slot has a stone floor: in the Game scene a bike more than `wallTolerance` below the near bank while over
the slot crashes as `wall` at once (it could only have hit the face or the kill plane a moment later; this just stops it
sinking into the drawn stone). No riser can be rolled up at any speed.

**Crash triggers:** bad landing; the bike AABB overlapping a pillar or cart AABB on any side, including the top;
overlapping the cow at a speed above `cowCrashSpeed` (below that the cow is solid, the bike stops, and the cow is unaffected either way);
the bike AABB overlapping the rolling boulder's box (v1.7); gap wall; riser; water.

**Stumbles (never a crash):** touching a monkey, or the log on the Warm-up Road (v1.7: once per contact), multiplies the
bike's speed by `monkeyStumbleFactor`, with a wobble.

**No-crash zone (v1.7):** the Warm-up Road (columns 0–119). A landing that would be a crash, *taken off* from inside the
zone (the x of the last grounded step < 16·120), is a **wobble** instead: the bike is stood upright along the surface,
keeps `monkeyStumbleFactor` of its forward speed, and "WOBBLE!" pops up. No bonus, no flip, crash count unchanged. The
zone has no gap and nothing solid, so nothing in it can crash the bike (C still goes back to the checkpoint).

**Crash sequence:** the bike tumbles (rotation tween and arc), sparks or a water splash, screen shake (150 ms), then after
`respawnDelayMs` fade out and back in at the last checkpoint with speed 0 and the boost meter full. The timer keeps running. Crash count +1.

**Respawn:** at `x = 16·cpCol + 8` on the surface. Collected diyas stay collected; the cow, the monkeys and the boulder (v1.7)
reset if they are ahead of the checkpoint. A checkpoint activates when the bike's x reaches its x.

**Camera:** follows **x only**. The whole stage fits vertically in 270 px, so there is no vertical scrolling.
`scrollX = clamp(x + look − 240, 0, 13920)`, smoothed by the factor `1 − (1 − cameraLerp)^(dt·60)`.
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
- Stage length 900 tiles = 14 400 px (v1.7; was 580, and 360 before v1.3).
- Column `c` covers x = 16c … 16c+15.

### 5.1 Terrain segments (authoritative; Hampi's are data in `src/stages/hampi.ts`)

`flat N` = N columns at the current height. `ramp N +R` / `ramp N −R` = rise or fall R tiles in a straight line over N columns.
`gap N` = N columns of water (no surface). `cliff hK` = instant drop to height K (vertical wall).
`riser hK` (v1.7) = a one-column dry gap whose far bank is at height K, one tile up (section 4).
`(noHop)` marks a segment where hopping is disabled.

| Section | Columns | Segments (in order) |
|---|---|---|
| 0. Warm-up Road (v1.7, no-crash zone) | 0–119 | flat 84 · ramp 5 +1 · ramp 5 −1 · flat 26 |
| 1. Bazaar Street | 120–179 | flat 60 |
| 2. Canals | 180–259 | flat 8 · gap 3 · flat 8 · gap 4 · flat 8 · gap 5 · flat 6 · gap 3 · flat 3 · gap 3 · flat 8 · gap 6 · flat 15 |
| 3. Fallen Pavilion | 260–339 | flat 80 |
| 4. Boulder Field | 340–419 | flat 6 · ramp 6 +2 · flat 5 · ramp 4 −2 · flat 6 · ramp 8 +3 · flat 6 · cliff h0 · flat 10 · ramp 5 +1 · ramp 5 −1 · flat 19 |
| 5. Ruins Road (v1.7, the breather) | 420–503 | flat 22 · ramp 9 +3 (the bonus ramp) · flat 5 · cliff h0 · flat 48 |
| 6. Mandapa Run (v1.3) | 504–613 | flat 10 · ramp 4 +1 · flat 82 (the plinth, h1) · ramp 4 −1 · flat 10 |
| 7. Hemakuta Rocks (v1.3) | 614–723 | flat 8 · ramp 6 +1 · ramp 6 −1 · flat 4 · ramp 6 +2 · flat 5 · ramp 5 −2 · flat 12 · ramp 4 +2 (the kicker) · **gap 8 (the tank)** · far bank at **h0** · flat 30 · ramp 5 +1 · ramp 5 −1 · flat 6 |
| 8. Temple Steps (v1.7) | 724–839 | flat 14 · **riser h1** · flat 15 · **riser h2** · flat 15 · **riser h3** · flat 46 (the terrace) · cliff h2 · flat 5 · cliff h1 · flat 5 · cliff h0 · flat 13 |
| 9. Tungabhadra Leap | 840–899 | flat 20 · ramp 8 +4 **(noHop)** · **gap 12 (river)** · far bank at **h0** · flat 20 |

(Check: each section adds up to its column range. Canal columns: 188–190, 199–202, 211–215, 222–224, 228–230, 239–244;
tank 670–677; risers 738, 754, 770; river 868–879. Cliffs at columns 381, 456, 817, 822, 827.)

After a gap the height is unchanged unless stated. The far banks of the tank and the river are h0.
Sections 1–4, 6, 7 and 9 are the v1.6 stage, column for column: sections 1–4 moved right by 120 columns, 6 and 7 by 204,
9 by 320.

**Section 0, Warm-up Road (v1.7):** the tutorial, and a no-crash zone (section 4). Flat road with a diya line; a log to hop
(a stumble if you do not); a boost strip (chevrons painted on the road under a second diya line, columns 48–73); one gentle
roller to try tilting on. Nothing here can crash the bike. Throttle alone gets through it.

**Section 5, Ruins Road (v1.7):** the breather between the Boulder Field and the Mandapa Run. No hazard at all: a diya
trail in, the bonus ramp (the same shape as the Boulder Field's big ramp and cliff; an optional flip spot, section 4.1),
a diya trail out past ruins. Every diya is on the rolling line.

**Section 6, Mandapa Run:** a hop rhythm. Three fallen pillars 17 columns apart on the raised plinth, then a cart after a
longer beat (19 columns). A hop at top speed covers 12 columns, so there are 5 columns of ground between landings and take-offs.

**Section 7, Hemakuta Rocks:** two rollers, then the kicker. The kicker ramp ends over a stepped tank: rolling off it at top
speed falls in the water; a hop taken anywhere on the ramp clears it with big air (the flip spot), and so does boost alone.
The tank is the one gap that boost can cross without a hop. The hint "HOP ON THE RAMP!" shows at column 616 (section 5.2).

**Section 8, Temple Steps (v1.7):** three risers 16 columns apart (hop, land, hop: each hop leaves a wide window for the
next), then a 46-column terrace at h3. When the bike reaches column 781 a boulder starts rolling toward it from the temple
doorway at column 811 (section 5.2): one hop clears it. Then three one-tile drops back to h0, which are simply rolled.
The hint "HOP UP THE STEPS!" shows at the section's checkpoint and is cleared on the terrace (column 774).

### 5.2 Entities (x = column, h = height above baseline in tiles)

Entity x is the left column; boxes extend right and up from the surface. Diya centre = `(16·x + 8, 222 − 16·h)`.
Pickup: a circle of `diyaRadius` overlapping the bike AABB.

| Type | Positions | Notes |
|---|---|---|
| Checkpoint (deepastambha, a stone lamp pillar) | cp0 x2 · cp1 x422 · cp2 x726 · cp3 x842 | **4** (v1.9; 12 in v1.7): the start, the Ruins Road breather in the middle of the stage, the foot of the Temple Steps, the river's run-up. Lamp lights up with a glow when passed; a crash goes back to the last one passed. Legs between them on a clean run: 24 / 17 / 6 / 2 s (Ton-Up), 29 / 21 / 8 / 2 s (Daybreak), 34 / 24 / 9 / 3 s (Sundowner). "CHECKPOINT" pops up over the lamp and keeps its place on the screen. |
| Hint (v1.9: its own list, not a checkpoint's) | x616 "HOP ON THE RAMP!" · x726 "HOP UP THE STEPS!" · x774 (clears it) · x842 "HOLD SHIFT - BOOST!" | Blinking HUD text for 5 s when the bike reaches the column (x = 16·col + 8), on every run. A hint replaces the one showing; the empty one clears it. One that stands on a checkpoint (x726, x842) shows again when the bike respawns there. |
| Diya (brass oil lamp, collectible) | Warm-up: x10 h1, x14 h1, x18 h1 · x36 h3 (over the log) · x54 h1, x60 h1, x66 h1, x72 h1 (the boost strip) · x88 h2, x89 h2 (the roller's crest) — Bazaar to Boulder Field: x138 h1, x142 h1, x146 h1 · x189 h3, x200 h3, x213 h3, x223 h3, x229 h3, x241 h3 · x277 h3, x319 h4, x333 h3 · x354 h3, x378 h4, x384 h3, x396 h3 — Ruins Road: x428 h1, x432 h1, x436 h1 · x446 h2, x450 h4 (up the bonus ramp) · x458 h3 (under its drop) · x470 h1, x476 h1, x482 h1, x488 h1 — Mandapa: x529 h4, x537 h2, x546 h4, x554 h2, x563 h4, x582 h5 — Rocks: x629 h2, x641 h4, x647 h7, x672 h7, x675 h8, x678 h7, x714 h2 — Temple Steps: x738 h3, x754 h4, x770 h5 (one over each riser) · x803 h6 (over the spot where the boulder is met) · x819 h3, x824 h2 (under the first two drops) — x872 h5 (over the river) | **56 total** (v1.7; the 30 of v1.6 moved with their sections). Flame flickers. Pick-up radius `diyaRadius`. x396 needs a hop on the up-ramp; x384 is collected by rolling off the cliff without hopping. Mandapa: one over each pillar and the cart, two on the plinth between hops. Rocks: x629 and x714 on roller crests (free), x641 and x647 on the arc of a hop taken on the second roller's up-ramp, x672–x678 on the arc of a hop taken mid-way up the kicker (an early or late hop misses the last one). The warm-up's and the breather's are all on the plain riding line (only x36, over the log, needs its hop). |
| Log (v1.7) | x36 | 1 wide × 0.5 tall (16 × 8 px). **Not solid**: the bike box touching it is one stumble per contact (speed × `monkeyStumbleFactor`, "BUMP!"), never a crash. |
| Fallen pillar | x276, x304, x332 · x528, x545, x562 (on the plinth) | 3 wide × 1 tall, solid → crash |
| Bullock cart (parked, no bullock) | x318 · x581 (on the plinth) | 3 wide × 2 tall, solid → crash |
| Boulder (v1.7) | trigger x781 · starts at x811 · gone at x771 | On the terrace (h3). When bike x ≥ 16·781 it starts at x = 16·811 and rolls left at 80 px/s, one fixed step at a time (game time only, so it is the same every time); when its left edge reaches x = 16·771 (the top riser) it breaks up and is gone. Hitbox 16 × 14 on the terrace (the drawn rock is 22 px across); any overlap with the bike box is a crash. It stays hidden while the bike is crashed, keeps rolling through a crash, and goes back to its doorway on a respawn at a checkpoint before the trigger. Warning: a rumble and a blinking "!" when it starts (at the right edge of the screen while the rock is still off it, then over the rock for half a second). From the trigger to the bike reaching it flat out: 1.30 s (Ton-Up), 1.50 s (Daybreak), 1.69 s (Sundowner). |
| Colonnade | behind the plinth, columns 520–598 | Decoration only (v1.3): standing pillars and lintels in a dark, low-contrast tone, behind every entity |
| Ruins and the temple doorway (v1.7) | ruins at columns 426, 462, 478, 493; doorway at 808–813 | Decoration only, in the colonnade's tone and behind every entity: broken halls and a small shrine along Ruins Road; the doorway the boulder rolls out of, on the terrace |
| Monkey troop | trigger x288 | When bike x ≥ 16·288, two monkeys (12×12 hitboxes) spawn at x = 16·298 and 16·300, run left at 40 px/s to x = 16·292 and 16·294, and sit. A honk with \|bike x − monkey x\| ≤ `honkRange` makes them leap away and become non-collidable at once. Contact = one stumble (speed × `monkeyStumbleFactor`, wobble), no crash; then that monkey leaps away. |
| Cow | x164 | Left column 164, box 32×24 (2 wide × 1.5 tall), standing on the road. Honk only shows a "..." bubble (the cow doesn't care). Wait within 3 tiles at under 20 px/s for 1.5 s and it walks right at 20 px/s for 2 s, fades out and becomes non-solid. Hopping over it also works. Resets on a respawn at cp0. She is the first thing in the stage that can crash the bike. |
| Coracles | river, below the jump | Decoration, bobbing slowly |
| Finish (ruined temple gateway) | x892 | Triggers at bike x ≥ 16·892 while not crashed: the timer stops, the run is scored (section 8.1), input is ignored, the bike auto-brakes, and the finish screen shows. The world ends in an invisible wall at x = 14 384. |

### 5.3 Tutorial (v1.7)

Until the player has finished **one full run** (a ranked single run from cp0, or a stage of a journey, on any bike), the HUD shows a prompt for where
the bike is on the Warm-up Road. Prompts are steady text in the UI font on a dim plate at the top centre, below the
checkpoint hint; ASCII only.

| Bike column | Prompt |
|---|---|
| 0–23 | HOLD RIGHT TO RIDE |
| 24–39 | SPACE - HOP THE LOG |
| 46–75 | HOLD SHIFT - BOOST |
| 78–99 | IN THE AIR: UP / DOWN TO TILT |

"Done" is `tutorialDone` in the prefs (default false) plus a copy in memory for the page session. It is set when a
ranked run or a journey stage crosses the line; a practice run does not count. When storage is missing or throws, the prefs read "not
done", so the prompts show on every visit, and the in-memory copy still switches them off for the rest of the session.
The rules of the Warm-up Road (the log, the no-crash zone) do not depend on the prompts.

### 5.4 A stage is one object (v1.9)

Everything above is Hampi's data, held in one `StageDef` (`src/stages/stage.ts`; Hampi's is `HAMPI` in
`src/stages/hampi.ts`). The Game scene, the HUD, the entities, the terrain bake, the records and the bot all take a
`StageDef`; nothing reads a stage's data any other way. What all stages share (the tile, the baseline, the water lines,
the screen, the shapes the data is written in) is in `src/level/level.ts`.

| Field | What it is |
|---|---|
| `id`, `name` | `'hampi'`, `'HAMPI AT DUSK'`. The id is in storage keys and in the journey's order. |
| `theme` | its `StageTheme` (section 6.5) |
| `collectible` | what its pickups are: `{ texture, glow, label }` (Hampi: `diya`, `glow_diya`, `DIYAS`) |
| `cols`, `sections` | the road (section 5.1); the sections must add up to `cols` |
| `checkpoints` | 3 or 4, ids 0..n-1 in column order, each on solid ground |
| `collectibles` | where the pickups are (`{ col, h }`) |
| `hazards` | `{ obstacles, cow, monkeys, boulder }`; `null` for what the stage does not have |
| `safeZone` | the no-crash warm-up, or `null` |
| `prompts`, `hints` | tutorial prompts (section 5.3) and hints (section 5.2) |
| `finish` | `{ col, art }`: the line's column and the texture that stands on it |
| `kicker`, `bonus` | the flip ramps, or `null` |
| `decor`, `boats` | decoration standing on the road; the boats bobbing on the river, or `null` |
| `botRunMs` | the bot's measured clean run per bike |
| `width`, `terrain`, `medalsMs` | built by `defineStage`: the width in px, the heightfield, the medal targets per bike (section 8.1) |

`defineStage` refuses a stage whose sections do not add up, whose checkpoints are out of order or over a gap, or whose
finish line is off the road. The stages are registered in `src/stages/index.ts` (`registerStage`), in riding order;
`JOURNEY_ORDER` there lists the ids the journey rides. Adding a stage is one line in each. A bike is its physics only
(`src/bike/bikes.ts`); bot runs and medal targets belong to a stage.

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

**v1.8:** this palette still holds for the road, every sprite and the UI. The background, the light and the mist take
their colours from the stage theme instead (`src/art/themes/hampi.ts`, section 6.5): a deeper purple-to-gold sky,
mauve haze, warm rim light, and teal, which is used only for the river, the water in the road and the mist over them.

**Exception (v1.6): the three bike sprites** may use their own colours (competition green and gold on the Ton-Up, a brighter
red on the Daybreak, deep violet and black with whitewalls on the Sundowner, the riders' clothes). Nothing else leaves the palette, and
the background is exactly as it was.

### 6.2 Parallax layers (back to front)

| Layer | Scroll factor | Code-drawn (v1.8: painted by the stage theme, section 6.5) |
|---|---|---|
| Sky | 0.05 | Dithered bands from deep purple to gold, pixel stars, thin cloud banks lit from below, a low sun with a subtle bloom, 3 kites |
| Far hills (v1.8) | 0.1 | Boulder hills faded toward the air colour, rim-lit, their feet lost in a low golden haze |
| Far skyline | 0.2 | The temple town on the far bank: stepped temple towers (gopurams) with a few lit openings, pavilions, boulder hills, trees and small palms, rim-lit, hazy at the base. Below the far shore (y 202) the layer is the river: dusk water with a teal cast, pale glints, mist |
| Middle ground | 0.45 | The near bank, darkest: ruined pillared halls and arches with lamps, coconut palms, banana clumps, broken pillars, rim-lit, river mist at their feet. No boulders here: nothing on the near bank may look like something to ride into |
| Terrain + entities | 1.0 | The dirt road from the heightfield: the 16 px ground tile, a lit lip, a soft darker band under it, shade that deepens with depth, a 2 px grass line on top, and (v1.8) ruts, pebbles and thin grass tufts at most 4 px tall, all placed by a hash of world x so chunks join. Water in gaps: dusk water with a teal cast under a bright line. Baked into textures in chunks of at most 1024 px wide (15 chunks of 960 px); never one stage-wide texture; not redrawn per frame. v1.7: a riser's slot is drawn as stone in the shadow of the step above it (no water); the Temple Steps, from two columns before the first riser to two past the last drop, are dressed stone (8 px courses with staggered joints, a pale worn lip instead of grass); the boost strip has chevrons painted on the road. |
| Near foliage | 1.1 (in front of the bike) | Occasional grass tufts and hanging vines, sparse — never blocking the view of obstacles |

The stone chariot silhouette appears on the far skyline near the finish.

**Ambience (v1.2).** Extra background detail, all behind the terrain layer, low contrast:
stacked-boulder hills on the far layers (v1.8: no longer behind the middle ground); a hazier back row in the middle ground
with ruined pillared halls (mandapas), arches, trees and banana plants; small lamps in those ruins with a flickering glow;
bird flocks crossing the sky near the sun, giving way to bats from the Mandapa Run on; fireflies just behind the road, densest by
the canals and the river; a smoke wisp from a small skyline shrine; coracles bobbing on the river.
Animated details are a pure function of game time and camera scroll (no tweens, no wall clock, no `Math.random`).

### 6.3 Bike (built from parts — no sprite-sheet animation)

- One chassis for every bike (`src/bike/sprites.ts`): a body texture of 48×32 whose bottom edge is the ground, wheel centres
  at (11, 26) and (37, 26) (the physics' two contact points, 13 px either side of the bike's position), and the pixel
  (24, 26) as the pivot the body leans and bobs about. Wheels are separate 12×12 textures rotated by code at
  `speed / radius`. The collision box is `bikeHitW × bikeHitH` for all three.
- The three bikes (v1.6, `src/art/bikeArt.ts`) are tributes to three kinds of motorcycle, clearly different at game scale.
  **No brand names, logos, tank badges, wordmarks or model names anywhere on screen.**
  - `bike_tonup`: a cafe racer in competition green. A cockpit fairing (a rounded shell standing above the tank line, with
    a short smoked screen) around a round headlamp; a long flat tank with a silver stripe and knee recesses; a single seat
    with a humped cowl; low clip-ons; upswept megaphone silencers; wire wheels; gold fork legs and shock springs; an exposed
    finned twin with polished covers. The rider is tucked in behind the screen: black leathers, silver helmet.
  - `bike_daybreak` (redrawn in v1.6.1): a retro roadster in deep metallic red and chrome. A rounded teardrop tank (full
    at the front, tapering to the seat) with a highlight and a thin cream pinstripe; a long flat ribbed seat with a red
    side panel under it; an upright air-cooled single with rows of cooling fins and a round polished case cover; deep
    chrome mudguards wrapping both tyres; one long low chrome silencer running back past the rear axle; a round chrome
    headlamp with twin clocks above it; a wide upright bar and a round mirror on a stalk; twin rear shocks; wire-spoke
    wheels with chrome rims. No fairing or screen. The rider sits bolt upright: brown jacket, cream helmet with a gold
    band (the v1.0 rider).
  - `bike_sundowner` (redrawn in v1.6.2): a bobber in purple and black. A deep metallic violet teardrop tank with a soft
    highlight is the only colour; everything else is blacked out. A single sprung solo saddle floating over the frame on
    two springs, no pillion; a short bobbed rear mudguard hugging the tyre, with a small round tail lamp and a side plate
    stub with an amber indicator on its end; tall mini-ape bars with a round mirror standing above them; a round headlamp
    in a black cowl; black fork gaiters over a length of chrome tube; **whitewall tyres** (a cream sidewall stripe inside
    the tread) on black wire wheels, a brake disc on the front; a tall long-stroke finned single, black with a few bright
    fin edges; a black battery box under the saddle; twin shocks; one black slash-cut pipe run low to behind the rear
    axle. Mid-set pegs (the boot under the knee, behind the cylinder). The rider sits upright with a slight lean back,
    arms raised to the grips: tan jacket, and (v1.6.3) a cream open-face helmet with goggles pushed up on the brow, their
    black strap round the shell, the face open below, a chin strap. All three riders are helmeted in every pose.
- **One near leg in every pose (v1.6.2).** Each body has two textures: `bike_<id>` (riding: the near leg on its peg) and
  `bike_<id>_stand` (foot down: that leg is off the peg, and only a thigh is left, reaching the planted leg). The planted
  leg `leg_<id>` is only ever shown with the `_stand` body (`BikeRig.setFootDown`), at a standstill, while backing up and
  on the select screen's unselected cards. The far leg is behind the bike and is not drawn.
- Per bike as well: the planted leg (`leg_<id>`), the exhaust tip (where the boost flame and the smoke puffs come from),
  and the wheel textures (`wheel_tonup`, `wheel_daybreak`, `wheel_sundowner_rear` / `_front`).
- Code-driven motion: rider bobs by 1 px at speed, body leans back under throttle and forward under braking,
  exhaust puffs scale with throttle, a dust trail when grounded and fast, sparks on a hard landing.
- Game feel (v1.3), all pooled, deterministic (integer hash, no `Math.random`) and driven by game time:
  landing dust puffs to both sides, more and faster the harder the landing (low and wide, never above wheel height);
  a ring of sparks on a diya pickup; while boosting, a flickering exhaust flame and thin speed streaks through the sky band
  (screen space, drawn behind the terrain and every entity, so they never cover an obstacle or a diya).
- Ghost (section 8.1): the selected bike's own sprites at 45% alpha, no effects, drawn just behind the bike.
- v1.7 entities, all in the 6.1 palette: the **log** (a short brown trunk, cut end to the left, a little moss); the
  **boulder** (a 22 px round granite rock with an ink outline; a crack, a chipped facet and a moss patch off-centre, so
  the turning shows; eight crisp frames per turn from two textures and quarter turns; a one-pixel hop twice a turn; dust
  behind it, chips and dust when it breaks; a flat shadow); the **"!"** cue (16 px UI font, UI yellow, blinking).
- Foot down at a standstill, the foot shuffle while backing up, the crash tumble and the respawn work the same for all three.

### 6.4 Asset manifest (optional PNGs that replace the placeholders)

| File | Size (px) | Notes |
|---|---|---|
| `bg_sky.png` | 960×270 | tiles horizontally |
| `bg_far.png` (v1.8) | 960×270 | transparent, tiles horizontally |
| `bg_skyline.png` | 960×270 | transparent, tiles horizontally |
| `bg_mid.png` | 960×270 | transparent, tiles horizontally |
| `fg_near.png` | 960×270 | transparent, tiles horizontally, sparse |
| `bike_tonup.png` / `bike_daybreak.png` / `bike_sundowner.png` | 48×32 | transparent; body and rider, layout as in 6.3 |
| `bike_tonup_stand.png` / `bike_daybreak_stand.png` / `bike_sundowner_stand.png` | 48×32 | transparent; the same body without the leg on the peg (foot down) |
| `wheel_tonup.png` / `wheel_daybreak.png` / `wheel_sundowner_rear.png` / `wheel_sundowner_front.png` | 12×12 | transparent |
| `leg_tonup.png` / `leg_daybreak.png` / `leg_sundowner.png` | 4×17 / 4×17 / 4×15 | transparent; boot on the bottom row |
| `tile_granite.png` | 16×16 | tiles in both directions, used as a texture fill |
| `pillar.png` / `cart.png` / `cow.png` | 48×16 / 48×32 / 32×24 | transparent |
| `log.png` (v1.7) | 20×10 | transparent; the hitbox is the middle 16×8 |
| `boulder.png` / `boulder_turned.png` (v1.7) | 22×22 | transparent; the rock, and the same rock an eighth of a turn anticlockwise |
| `monkey.png` | 32×16 | 2 frames of 16×16 |
| `deepastambha.png` | 16×48 | 2 frames: unlit / lit |
| `diya.png` | 8×8 | |
| `gateway.png` | 96×96 | transparent |
| `coracle.png` | 24×10 | transparent |

### 6.5 The look system (v1.8)

Everything that makes the picture read as lit and deep is one shared system, `src/art/look/`, fed by one **stage theme**
per stage (`src/art/themes/`; Hampi is the only one so far, Ladakh and Goa plug in the same way). All of it is drawn in
code into pixel buffers and baked to textures once at boot; nothing is a full-screen effect per frame, and there is one
pixel size throughout.

- **Passes** (`pix.ts`): banded dithered sky, haze between layers, mist wisps, rim light on silhouette edges, stepped
  additive bloom, dark keylines. **Silhouette kit** (`silhouettes.ts`): rocks and boulder hills, gopuram, pillared hall,
  arch, coconut palm, banana clump, tree, vine, grass tuft. **Ground kit** (`ground.ts`): a column of road, a column of
  water, and the road's texture.
- **A theme** (`theme.ts`: `StageTheme`) gives: `glow` and `haze` levels (0.5 = subtle), the lamp-light colour, the
  sun and its reflection, the parallax `layers` (key, scroll factor, depth, painter), the `ground` kit (soil, grass, rim,
  texture densities, water colours), the `mist` (colours, the drifting band over the background water, whether mist
  lies over water in the road), where the ambience's lamps and smoke attach, and a `landmark` for the far skyline.
- **Hampi's choices:** glow and haze at the subtle level; teal only in the river, the water in the road and their
  mist; the road is the dirt road it always was (texture added, no masonry, no pale cap); no boulder or mound on the
  near bank; light from the right, where the sun stands at the start.
- **In the scene:** diyas and lit checkpoint lamps have a small additive halo; a lit lamp pools light on the road at its
  foot; the diya, the fallen pillars, the cart, the log, the cow and the monkeys have a one-pixel dark keyline under
  them (the diya also a white sparkle) so they read against bright water and sky as well as against dark ruins; a band
  of mist drifts over the background river, the sun has a broken reflection on it, and wisps of mist drift over the
  canals, the tank and the river in the road. All a pure function of game time and camera scroll.

---

## 7. Audio (WebAudio, generated in code)

- Engine (softened in v1.4): a triangle body with a quiet sawtooth purr, low-passed and high-passed at 45 Hz; pitch and
  volume follow speed and throttle; a brighter tone while boosting. No square sub-octave.
- Honk: two short square-wave tones ("pom-pom").
- Hop, landing thud, "CLEAN!" chime, diya pickup chime, crash crunch, water splash, checkpoint bell.
- v1.7: the boulder's rumble when it starts (low-passed noise and a falling low sine, about 1.5 s) and a short crumble
  when it breaks up. The log and a wobble use the landing thud.
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

- **Flow (v1.9):** Title → **JOURNEY** → bike select (once) → the stages in order (a **stage card** between two) →
  **journey finish**; or Title → **STAGES** → a stage → bike select → a single run → its finish screen.
  `?cp=N` skips the menus and starts a practice single run on the selected bike.
- **Title:** the parallax scene slowly auto-scrolls; "OPEN ROADS: INDIA" in UI yellow with "STAGE 1: HAMPI AT DUSK" under it
  (with more than one stage in the journey: "A ROAD TRIP IN n STAGES"); a menu on a dim plate: **JOURNEY** (highlighted)
  and **STAGES** (Up / Down + Enter, or click / tap), with one line about the highlighted one (for JOURNEY, the picked
  bike's best journey time once there is one: "DAYBREAK JOURNEY BEST 00:59.51"); a controls hint; the bike picked last
  rides across.
- **Stages (v1.9):** "STAGES" over the dimmed parallax, one row per registered stage in the pixel-frame style (yellow
  frame on the highlighted one): its number and name; for an unlocked stage the fastest single run of any bike, that
  bike's name and its medal, or "NO RUN YET"; for a locked one a padlock, "LOCKED" and "REACH IT ON A JOURNEY", all dim.
  Up / Down move through the stages and then BACK (wrapping), Enter opens the bike select for the highlighted stage (on
  a locked stage: a note, nothing else), Esc or BACK returns to the title. A click or tap on a row highlights it, a second one picks it. The first stage is
  always unlocked; any other once a journey has reached it.
- **Bike select (v1.6):** "CHOOSE YOUR RIDE" over the dimmed parallax. Three cards side by side in the pixel-frame style
  (yellow frame on the highlighted one): the bike at 3× idling on a strip of road (the highlighted one revs: wheels turning,
  rider leaning in), its name, five stat bars of five pips (SPEED, PULL, BOOST, FLIP, GRIP; section 3.1), and that bike's
  own best time and medal or "NO RUN YET". Below: the highlighted bike's one-line tagline, RIDE / BACK, and the key hint.
  Left / Right move the highlight (wrapping); Enter rides; Up / Down move between RIDE and BACK.
  A click or tap on a card highlights it, a second one (or RIDE) rides. It opens on the bike ridden last (Daybreak the first
  time). The pick is saved when the ride starts, not while browsing. v1.9: it is opened either **for a journey** (tag
  "JOURNEY" top left; the cards show each bike's best journey time or "NO JOURNEY YET"; RIDE starts a journey on that
  bike; Esc / BACK go to the title) or **for a single run of a stage** (tag "STAGE n"; the cards show that stage's best
  and medal; Esc / BACK go to the STAGES list). In a journey it is shown once: the bike is never asked for again.
- **HUD** (a separate UI scene that doesn't scroll): timer `00:00.00`, diyas `x/56`, boost bar, crash count, the flip tally
  once it is above 0, "BEST mm:ss.cc" (the time to beat on this bike) once there is one, a "MUSIC OFF" / "MUTED" tag, and
  the bike's name, small, bottom left. v1.7: the tutorial prompt (section 5.3) at the top centre, under the hint.
  The timer starts on the first fixed step after Enter, pauses with Pause, and stops at the finish.
  v1.9: the stage's name at the top centre, on the line under the pause button. In a journey, a row of five helmet icons
  (17 × 15, drawn in code: a yellow full-face helmet with a red stripe and a dark visor; a spent one is a dim hollow outline) under the
  diya count, where a single run shows its best time; the helmet just lost blinks for 0.9 s. The timer is the stage's.
- **GAME OVER (v1.9, a journey):** when the last helmet is lost the tumble plays out (1 s), then, without a fade, a
  pixel frame over the dimmed, stopped stage: "GAME OVER", five spent helmets, "OUT OF HELMETS", "<STAGE> STARTS AGAIN
  WITH 5 HELMETS", "ENTER - GO ON". The clock stops. After 3 s of game time (or Enter, from half a second in) the stage
  starts again from its first checkpoint.
- **Stage card (v1.9, a journey):** 1.2 s after the line of every stage but the last, a pixel frame over the stopped
  game: "STAGE CLEAR", the cleared stage's name, its time, medal and collectibles; "NEXT: STAGE n OF m" and the next
  stage's name in large type; the helmets going on (one given back, up to 5: "+1 HELMET FOR THE NEW STAGE" or
  "HELMETS FULL"); the journey's time so far; RIDE ON (Enter or click).
- **Journey finish (v1.9):** 1.2 s after the last stage's line: "JOURNEY COMPLETE", the bike and the number of stages;
  one row per stage (name, time, the medal that time earns, collectibles found); the total time; the bike's best
  journey time before this one, with a blinking "NEW BEST!" when it was beaten; the helmets left and the number of
  game overs; NEW JOURNEY (highlighted: the bike select, for a journey) / STAGES / MAIN MENU (Left / Right + Enter, or click).
- **Popups:** "CLEAN!", "+FLIP", "CHECKPOINT", "BUMP!" (the log), "WOBBLE!" (the no-crash zone), short floating text.
- **Finish:** a yellow pixel frame (2 px UI-yellow border, 4 px notched corners, UI-ink fill). The medal earned (icons either
  side of "STAGE CLEAR", "DAYBREAK - GOLD MEDAL" / "DAYBREAK - NO MEDAL YET" with the bike's name); time, diyas and flips for this run next to the best before it, with a
  blinking "NEW BEST!" where the run beat it; crashes; the next target ("NEXT: SILVER UNDER 01:15.00", or after gold
  "GOLD! BEAT YOUR mm:ss.cc"); three code-drawn star icons: star 1 finished · star 2 all 56 diyas · star 3 zero crashes.
  Three options: "RIDE AGAIN" (selected; Enter or R), "CHANGE BIKE" (v1.6: to the bike select) and "MAIN MENU"
  (Left / Right + Enter, or click). Medal, targets and bests are the ridden bike's own. A practice run (`?cp=N`) shows
  "PRACTICE RUN - NO MEDAL" and saves nothing.
- **Pause** (v1.5): dim overlay and the same yellow pixel frame: "PAUSED", then RESUME / RESTART / CHANGE BIKE (v1.6) / MAIN MENU
  (Up / Down + Enter, or click / tap; P / Esc resumes). Game time stands still while it is open. A small pause
  button at the top centre of the HUD opens it with the mouse. v1.9, in a journey: RESUME / RESTART STAGE / QUIT JOURNEY,
  with "A RESTART COSTS A HELMET" under them. RESTART STAGE takes a helmet and starts the stage again (the last helmet:
  GAME OVER, then the stage with 5). QUIT JOURNEY ends the journey and returns to the title.
- **Music** plays on the menus only (v1.6.4): the title, the STAGES list, the bike select, the finish screens and the
  stage card. A run has the engine and the effects.

### 8.1 Replay loop (v1.3)

Only a **single run** from cp0 is ranked. It is scored on the step it crosses the line. (A stage of a journey is
scored by the journey: section 8.2.)

- **Medals** by time, inclusive, **per bike**. v1.7: each bike's targets come from its clean bot run (no flips, boost only
  at the river): **gold = bot × 1.05, silver = bot × 1.25, bronze = bot × 2.2, each rounded up to a whole second.**

  | | Bot run | Gold | Silver | Bronze |
  |---|---|---|---|---|
  | Ton-Up | 49.908 s | ≤ 53 s | ≤ 63 s | ≤ 110 s |
  | Daybreak | 59.517 s | ≤ 63 s | ≤ 75 s | ≤ 131 s |
  | Sundowner | 69.150 s | ≤ 73 s | ≤ 87 s | ≤ 153 s |

  Gold leaves 3–4 s of slack on the bot's line; bronze is more than twice the bot's time, so a first run with a handful
  of crashes still earns a medal. All diyas is the separate middle star.
- **Best run:** the fastest time, the most diyas and the most flips are kept, each on its own, in `localStorage`,
  **one record per stage and bike** (v1.9: version 3): `hampi-at-dusk.best.v3.<stage>.<bike>`, for example
  `hampi-at-dusk.best.v3.hampi.daybreak`. A record is `{ v: 3, stage, cols, timeMs, diyas, flips, ghost }` and is ignored
  if its version, stage id or stage length differs. **Migration (v1.9):** the version 2 records
  (`hampi-at-dusk.best.v2.<bike>`, v1.7 – v1.8) were ridden on today's Hampi, so they carry over. When a bike has no
  version 3 record on Hampi, its version 2 record is used (best, medal, ghost) and copied to the version 3 key; the
  version 2 key is never written or removed, and is not read again once the version 3 record exists. **The records of
  the 580-column stage are an archive:** `hampi-at-dusk.best` (pre-roster) and `hampi-at-dusk.best.<bike>` (v1.6) are
  never read, written or removed. Preferences (ghost on/off, sound mode, the bike picked last, `tutorialDone`) are in
  `hampi-at-dusk.prefs`. **Every storage access is wrapped in try/catch**; when storage is missing or throws, the game
  plays the same and the bests (and ghost) live in memory until the page is closed.
- **Ghost:** the bike's pose (x, y, angle) is recorded at 20 Hz of game time (every 6 fixed steps, from time 0, plus the pose
  on the line) and, when the run sets a new best time, stored with it: 7 base-36 characters per sample (x and y in half pixels,
  angle in whole degrees), about 8.3 kB for a 60 s run; runs over 180 s (v1.7; was 120 s) keep no ghost, so the longest
  stored ghost is about 25 kB. In later ranked runs it is replayed
  against the run timer as a translucent bike (interpolated between samples), hidden after the line. It has no collisions and
  no effects. G toggles it (default on).
- **Quick restart:** R restarts a single run at once, in a run and on the finish screen.

### 8.2 The journey (v1.9)

The rules are pure functions in `src/journey.ts`; the journey being ridden and its records are in `src/journeyRun.ts`.

- **One bike** for the whole journey, over the stages of `JOURNEY_ORDER` (today `['hampi']`; Goa and Ladakh follow).
- **5 helmets.** A helmet is lost by a crash, by C (back to the checkpoint) and by RESTART STAGE in the pause menu. A bad
  landing in a stage's warm-up zone is a wobble, not a crash, and costs nothing; nor does a stumble.
- **Helmets carry over** from stage to stage. Entering the next stage gives one back, up to 5.
- **Game over** (no helmets left): the stage being ridden starts again with 5 helmets. The bike and the stages already
  cleared are kept. A game over does not end the journey.
- **Time:** the journey's time is the sum of the times of the runs that cleared each stage (an attempt that ended in a
  game over does not count toward it). The best total is kept per bike and per route, in
  `hampi-at-dusk.journey.v1.<route>.<bike>` (`<route>` = the stage ids joined with `+`, so a longer journey is a new
  record): `{ v: 1, route, timeMs }`.
- **Medals** on the stage card and the journey finish are what the stage's time earns on that stage and bike (the
  single-run targets of section 8.1). A journey does not read or write the single-run records, and no ghost rides.
- **Unlocks:** the moment a journey reaches a stage, that stage is unlocked for single runs (`hampi-at-dusk.unlocks`:
  `{ v: 1, stages: [...] }`). The first stage is always unlocked.
- A journey lives in memory: closing the page ends it. Unlocks and bests are saved as they happen, with copies in
  memory so they work when storage is blocked.

---

## 9. Acceptance criteria (the build is done only when all are true)

1. `npm run build` and `npm test` pass; no TypeScript errors.
2. Zero console errors, and zero warnings outside the allowlist in `tests/e2e/consoleAllowlist.ts`
   (browser GPU/SwiftShader notices only), during a full run. Tests run with `?renderer=canvas`.
3. **The bot run (Playwright)** finishes the stage with 0 crashes and all 56 diyas, within 120 s of game time (`timeMs`),
   driven by `__test.step`, on each bike. (Measured, and asserted to the millisecond: 49.908 s, 59.517 s, 69.150 s; gold on each.)
4. **The river jump needs boost:** a Playwright test shows that hitting the river ramp at top speed without boost lands in the
   water, and with boost from the river checkpoint (the last one: cp3 since v1.9) clears it with ≥ 1 tile to spare. "No boost" means no boost and no hop (the ramp is `noHop`).
   Margin = landing x − 14 080 ≥ 16. Expected with these values: about 130 px of flight without boost (fails) and about 230 px with
   boost (38 px past the edge). Tune `ramp 8 +4`, the gap width or the speeds until this is true, and record the final values in `DECISIONS.md`.
5. Every canal gap can be cleared with a hop at normal top speed; none of them can be rolled across without a hop.
   This also holds at `boostSpeed`, through `wallTolerance`. The kicker tank (v1.3): not rolled across at top speed; cleared
   by a hop from anywhere on the kicker ramp (take-off window ≥ 120 ms, ≥ 1 s of air, landing ≥ 16 px past it), or by boost.
6. In a Vitest physics test at 240 px/s on flat ground, the range of take-off x that clears each pillar and the cart without overlap,
   divided by 240, is ≥ 120 ms (expected: cart about 220 ms, pillar about 370 ms).
7. Landing at 40° off the slope crashes; landing at 5° triggers "CLEAN!" (unit-test the landing function).
8. Manual check: 60 fps in desktop Chromium with the debug overlay. Automated: 10 000 physics steps take under 100 ms in Vitest.
   No fps assertion in Playwright.
9. Playwright saves screenshots to `test-results/shots/`: title, every section, a flip in mid-air, boost streaks,
   mid-air over the river, the ghost, the finish screen with medal and best. v1.7 adds: each tutorial prompt, the log
   (hopped and bumped), the boost strip, the warm-up roller, a wobble, the new cp3, the bonus ramp (rolled and mid-flip),
   the ruins trail, each riser, the boulder (its "!" at the trigger, on screen, mid-hop over it, a crash into it, its
   break-up), the stairs down, and the finish screen with the new medals on each bike.
   **Review these images yourself** and fix anything that looks broken (z-order, gaps in parallax seams, blurry pixels).

10. (v1.3) Vitest: a held backflip and frontflip off the kicker land and count; a partial rotation, a crash and a flat-ground
    hop do not; medal thresholds; best-run storage round-trip, including storage that throws; ghost encode / decode / playback.
    Playwright: a flip in the real game; best, medal, ghost, G and R after the bot run; a full run with `localStorage` throwing;
    audio only after a real key press, M cycling the sound modes.

11. (v1.7) Vitest, per bike unless noted: the stage is 900 columns; every riser has a hop window ≥ 120 ms at top speed
    and cannot be rolled at any speed from 10 px/s to boost speed; whatever hop cleared one riser leaves ≥ 120 ms for the
    next; the boulder has a hop window ≥ 120 ms from a standstill, at top speed and at boost speed, and at least 1.3 s
    between its start and the bike reaching it flat out; the log is one stumble (× 0.4) and no crash; 1000 runs of random
    input through the warm-up never crash; the bonus ramp, the warm-up roller and the stairs down are rolled at every
    speed (throttle, boost, coasting) with no crash; from a standing start at cp3, cp9 and cp10 a single hop clears the
    next hazard with a window ≥ 120 ms; a backflip lands off the bonus ramp; the medal table and its formula; records
    version 2, including storage that throws, `tutorialDone`, and the archive left untouched (checked with a store that
    records every access). Playwright: the bot run per bike at its exact time with a v1.6 player's storage in place and
    unchanged afterwards; the tutorial (prompts, log, wobble, when they stop); the boulder (the same trace on every run
    and after a reload, frozen by pause, reset by a respawn, hopped from a run and from a standstill, its break-up).
    Every hop window in the stage is ≥ 120 ms except the ones accepted in v1.6 (DECISIONS.md), which v1.7 does not
    change: the Ton-Up's own hop over the second paired canal (31 ms; it takes the pair in one hop, 240 ms) and the
    Sundowner's one-hop line over the pair (91 ms; its two-hop line is 145 ms). Nothing new is under 120 ms.

12. (v1.9) The bot's three runs are unchanged, in a single run and as a journey stage. Vitest: the journey's rules (a
    helmet per crash, +1 per new stage capped at 5, game over → the same stage with 5 and the cleared stages kept, the
    total time, unlocks); the stage registry and `defineStage`'s checks; Hampi's four checkpoints and its hints;
    records version 3, the version 2 → 3 migration (used, copied, the old key kept, only into Hampi, malformed ignored,
    read-only and throwing storage), the journey's records; the archive still untouched. (The standing starts of
    criterion 11 are now cp2, which was cp9, and columns 232 and 774, which were cp3 and cp10.) Playwright: a journey from the
    title with the bot to the journey finish, its values and its records; crashes forced until GAME OVER and the stage
    starting again with 5 helmets; the pause menu of a journey and of a single run; the STAGES list with a locked and an
    unlocked stage, the stage card and the unlock, over a two-stage test route; the version 2 → 3 migration in the
    browser. Screenshots: the title menu, the STAGES list (locked and unlocked), the bike select for a journey, the HUD
    with helmets, GAME OVER, the stage card, the journey finish, both pause menus, the "CHECKPOINT" popup.

### 9.1 Test hooks

Expose `window.__test` only when `import.meta.env.DEV || import.meta.env.MODE === 'test'`:
- `setInput({ throttle, brake, hop, boost, tiltUp, tiltDown, honk })`
- `state()` → `{ x, y, vx, vy, v, angle, grounded, boost, crashed, crashes, diyas, finished, checkpoint, timeMs, bike, stage, mode, helmets, gameOver, flips, spin, camX, ghost, boulder, prompt, stumbles, wobbles }`
  (`ghost` = the pose the ghost is drawn at, or null; v1.7: `boulder` = `{ phase: 'hidden' | 'roll' | 'gone', x }`,
  `prompt` = the tutorial prompt on screen or `''`, `stumbles` / `wobbles` = counts for this run; v1.9: `stage` = the
  stage's id, `mode` = `'single' | 'journey'`, `helmets` = helmets left or null on a single run, `gameOver` = the
  GAME OVER screen is up)
- `finish()` → a single run's scored result once the line is crossed (medal, next target, bests before it, what was beaten, whether it was saved)
- `audio()` → `{ created, state, mode, musicPeak, masterPeak, musicInRun }`; never creates audio
- `startAt(checkpoint, bike?, stage?)` (a single run); `startAtCol(col, bike?, stage?)` (v1.9: a practice run at rest
  at a column; its checkpoint is the last one at or before it); `bike(id?)` → the selected bike (with an id: select it first)
- v1.9: `startJourney(bike?, route?)` (as JOURNEY → bike select → RIDE; `route` = stage ids, default the shipped
  journey); `journey()` → the journey being ridden (`{ bike, route, index, helmets, results, gameOvers, status }`) or
  null; `crash()` (crash the bike now); `addTestStage(id, name)` (registers a copy of the first stage, so a test can
  ride a two-stage journey)
- `screen()` → `'boot' | 'title' | 'stages' | 'select' | 'game' | 'paused' | 'gameover' | 'finish' | 'stagecard' | 'journeyfinish'`;
  `targets()` (the shown menu's click targets and the pause button);
  `select()` → the select screen's highlighted index and each card's bike, click target, best time and medal;
  `selectFor()` → `{ mode, stage }`; `stages()` → the STAGES list's highlighted index and each row (id, name,
  unlocked, best, click target); `stageCard()`; `journeyFinish()`; `leaks()`
- `setManual(true)` stops rAF-driven stepping; `step(n)` runs n fixed steps and one render synchronously
- `levelData` → the stage being ridden (on a menu: the first stage) as plain data

All e2e tests use manual stepping. The bot may read `levelData` to time its hops and tilts.

---

## 10. Out of scope

Touch controls, an online leaderboard, gamepad support, recorded music or audio files.
(v1.3 brought the local best run and code-generated music into scope. v1.9 brought more stages into scope as a
framework; the stages themselves, Goa and Ladakh, are the next rounds.)

---

## 11. Suggested file layout

```
src/
  main.ts            config.ts
  scenes/  Boot.ts  Title.ts  Stages.ts  Select.ts  Game.ts  Hud.ts  Finish.ts  StageCard.ts  JourneyFinish.ts
  stages/  stage.ts (StageDef, defineStage, medalsFor, levelOf; pure)  index.ts (the registry, JOURNEY_ORDER)
           hampi.ts (stage 1's data)
  level/   level.ts (what stages share: tile, baseline, the data shapes)  terrain.ts (heightfield, surfaceY, slopeAngle)
           terrainView.ts  boulder.ts (a rolling boulder's state machine; pure)
  bike/    BikePhysics.ts (pure, no Phaser — unit-testable)  BikeView.ts
           bikes.ts (the roster: overrides, stat bars; pure)  selection.ts  sprites.ts
  entities/ Diya.ts  Obstacle.ts  Monkey.ts  Cow.ts  Checkpoint.ts  Boulder.ts
  art/     assets.ts  placeholders.ts  palette.ts  Parallax.ts  Ambience.ts  Fx.ts  pen.ts  depth.ts  bikeArt.ts (the three bikes)
           look/   pix.ts  silhouettes.ts  ground.ts  theme.ts  bake.ts  Atmosphere.ts   (the shared look system, v1.8)
           themes/ hampi.ts                                                               (one theme per stage)
  audio/   sfx.ts  music.ts
  journey.ts         (the journey's rules: helmets, game over, stages, unlocks; pure, no Phaser)
  journeyRun.ts      (the journey being ridden; its unlocks and best times)
  progress.ts        (medals, best run, ghost, storage, the journey's records; pure, no Phaser)
tests/
  unit/  physics.test.ts  progress.test.ts  journey.test.ts  stages.test.ts  bikeArt.test.ts  look.test.ts
  shared/ plan.ts (the bot's hop planner, per bike; pure)  sim.ts (a headless port of the Game scene's ride loop)
  e2e/   run.spec.ts  journey.spec.ts  river.spec.ts  reverse.spec.ts  flip.spec.ts  storage.spec.ts  audio.spec.ts
         menu.spec.ts  roster.spec.ts  select.spec.ts  sprites.spec.ts  tutorial.spec.ts  boulder.spec.ts
         bot.ts  helpers.ts  flipHelper.ts  consoleAllowlist.ts
  look/  shots.spec.ts (not part of `npm test`: fixed moments saved as PNGs; see playwright.look.config.ts)
DECISIONS.md
```
