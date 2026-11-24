# DECISIONS

These are the judgement calls made where `GAME_SPEC.md` (v1.1 to v1.3) left room for interpretation.
Fable, the advisor and builder, makes each call; Opus, the coordinator, writes it down here.

## Spec process
- **v1 → v1.1:** all 30 edits from `SPEC_REVIEW.md` were applied, and the header now gives the run length as 30–45 s.
  After the advisor re-checked the spec, 4 more clarifications were added:
  - which files each test runner picks up
  - how over-speed decays
  - that the boost meter drains only while boost is applied
  - that `state()` also returns `v` and `boost`
- **Tuned values:** `hopVelocity` 260 → 280 and `boostSpeed` 340 → 360. Both were set during the spec review.
  No further tuning was needed in M2.

## M1: scaffold
- `phaser@3.90.0` is pinned exactly. The other tools are vite 6, vitest 3, typescript 5 and `@types/node`.
- `@playwright/test` is pinned to 1.63.0 to match the pre-installed Chromium (build 1243), so no `executablePath` is needed.
- Playwright runs a single worker on port 5173 (strict) and writes its output to `test-results/pw`. That keeps `test-results/shots` free for screenshots.
- `tests/e2e/smoke.spec.ts` checks that a 480×270 canvas exists and that there are no console errors.

## M2: pure physics
1. **Leaving a ramp lip doesn't depend on step timing.** When a grounded step crosses onto a new segment,
   the `airborneEps` test is also run as if the step had started exactly at the corner. Without this, whether the bike
   launched off a lip depended on where the 1/120 s steps happened to fall. Slow bikes still hug convex corners.
2. **Order of ground-speed updates:** slope gravity first, then boost, brake, over-speed decay, and throttle or drag.
   With this order the bike holds exactly 240 px/s up the river ramp.
3. **Input priority when not boosting:** brake beats throttle. Above `topSpeed`, decay at the `brake` rate replaces coast drag,
   and braking doesn't stack on top of it.
4. **Boost:** a hard `min(v, boostSpeed)` cap while boosting. The meter regenerates only when the bike is grounded, not boosting
   and Shift isn't held. Holding Shift with an empty meter gives no regen.
5. **Hop:** handled before the move in the same step, and edge-triggered (holding the key doesn't repeat).
   A coyote-time hop also uses `vy −= hopVelocity`.
6. **Hop buffer and coyote times** (0.1 s and 0.08 s) are constants in `BikePhysics.ts`, so CONFIG still matches section 3.
   Coyote time is granted only when the bike leaves a segment where hopping is allowed.
7. **Far-wall rule:** checked only when the previous step was over a gap. If the bike is within `wallTolerance`, it snaps up and the landing is evaluated as normal.
8. **Overlaps:** bike-vs-obstacle overlap is strict (touching edges don't count). Diya pickup (circle vs bike box) does count touching.
9. **World bounds:** x is clamped to [0, 5744], and speed drops to zero at the end wall. The water kill line and world-end constants live in `levelData.ts`.
10. **Level data:** `cliff` is a zero-width segment (`TERRAIN.cliffs`: x = 4176, top y 174, bottom y 222).
    The river gap carries `farBankH: 0`. A point exactly on a boundary belongs to the segment on its right.
11. **Physics API:** `step()` returns a new state. One-step events are `evLanding` (`silent`/`clean`/`safe`/`crash`) and `evHop`.
    Once set, `crashed` makes `step()` a no-op. Checks against obstacles, the cow and diyas are separate helpers called by the scene:
    `hitsObstacle`, `touchesDiya`, `crash`, `addBoost` and `bikeAABB`.
12. **Hop-window measurement:** take-off x is swept in 0.5 px steps. The window is the longest unbroken clear range divided by 240.
    "Clear" means the bike box never overlaps the obstacle and the landing doesn't crash.
13. **Diya test:** one full scripted run instead of one script per diya. Monkeys are left out because they only cause a stumble, and they come in M3.

## Measured results (M2, Vitest)

| Check | Result | Requirement |
|---|---|---|
| Canal gaps: hop at 240 px/s | All 6 clear. Take-off windows 135–540 ms; the tightest is 108–110, limited by its 48 px platform | Clear with a hop |
| Canal gaps: rolling at 240 / 360 px/s | Every gap crashes (water or far wall) | Can't roll across |
| Pillar hop window | 375 ms | ≥ 120 ms |
| Cart hop window | 225 ms | ≥ 120 ms |
| River, no boost | Flight 127 px; falls 64.6 px short and lands in the water | Water |
| River, boost from cp4 | Flight 225 px; lands at x = 5474.4, 34.4 px past the edge (safe landing) | ≥ 16 px past the edge |
| Diyas | 17/17 in one crash-free scripted run, 23.2 s; still 17/17 with every hop shifted ±4 px | 17/17 |
| Performance | 10 000 steps in about 3 ms | < 100 ms |

**Risk for M5 (the bot run):** after the river jump only 0.08 of the boost meter is left. The bot must not use any boost before the cp4 run-up.

## M3: game world
1. **Optional PNG art:** `vite.config.ts` scans `public/assets/*.png` when the build or dev server starts and passes the list in as `__ASSET_PNGS__`.
   That way a PNG that isn't there never causes a 404. If you add a PNG, restart the dev server.
2. **Strip frames:** `deepastambha` (16×48) is two 8×48 frames side by side (unlit, lit). `monkey` is two 16×16 frames (running, sitting).
3. **Textures drawn only in code** (not in the manifest): chariot, glow, stars, speech bubble, and particles. There is one particle texture per colour because the Canvas renderer can't tint.
4. **Terrain:** baked into 960 px-wide chunks, drawn one pixel column at a time with the 2D canvas API so ramps stay sharp. The title screen reuses `terrain_0`.
5. **Near foliage:** one tiled layer, with grass only along the bottom edge and vines only along the top, so it never hides an obstacle.
6. **Stone chariot:** a separate image at scroll factor 0.2, placed so it sits at screen x = 300 at the end of the stage. It isn't baked into the tiled skyline because it would repeat.
7. **No Phaser tweens:** tweens run on wall-clock time, which would break manual stepping. Popups, flame flicker and the crash tumble are all driven by the frame delta.
8. **Manual stepping:** `setManual(true)` puts Phaser's game loop to sleep, and `step(n)` runs n fixed steps, then one update and render. `step` also unpauses. `__test.ready()` says when the scene can take commands.
9. **`state().crashed`** stays true for the whole crash sequence, until the bike respawns.
10. **Crash timeline:** a tumble lasting `respawnDelayMs`, a 0.25 s fade out, the respawn, then a 0.25 s fade in (you can ride during the fade-in).
    Hitting something solid bounces the bike back, a bad landing tumbles it forward, and water sinks it. R skips straight to the fade and still counts as a crash.
11. **Cow:** compares horizontal speed `|vx|` against `cowCrashSpeed`, so hopping in place next to her doesn't crash. She stops being solid the moment she starts walking.
    "Within 3 tiles" means a gap of 48 px or less between the bike box and the cow box. The wait timer resets if you move out of range or go over 20 px/s. A honk only gets the "..." bubble if it's within `honkRange`.
12. **Monkeys:** a monkey's x is the left edge of its 12×12 box. They can be hit while running and while sitting. A stumble scales both `v` and `vx`, at most once per monkey, and honk range is measured to the monkey's centre.
13. **Finish:** crossing the line stops the timer and leaves only braking active. A bad landing after the line settles the bike instead of crashing it. The finish screen appears 1.2 s of game time later, and Enter starts a new run from cp0.
14. **`?cp=N`** skips the title screen.
15. **Boost hint:** "HOLD SHIFT - BOOST!" shows for 5 s when you pass cp4, and also when you start or respawn there.
16. **Added text:** "+1" when you collect a diya, "OOK!" when you bump a monkey, "POM-POM!" when you honk.
    The title screen has the subtitle "A SUNSET RIDE THROUGH THE RUINS". The finish screen header is "STAGE CLEAR", with star labels FINISH / DIYAS / CLEAN.
17. **One-shot keys** (H, R, P/Esc, M, Enter) go through `onKeyPress` in `src/input.ts`. This works around Phaser re-processing its key queue,
    which could fire a key twice when two keys landed in the same frame.
18. **Camera:** smoothing runs once per fixed step, and the bike's screen position is rounded relative to the camera so it doesn't shimmer by a pixel.

## M4: UI and audio
1. **Pause:** a flag inside the Game scene, not a Phaser scene pause. H and R do nothing while paused, and you can't pause after finishing.
2. **Mute:** a window-level listener, so M works on every screen. Pressing M first is a real key press, so it also creates the AudioContext.
3. **Font:** only `latin-400.css` is imported (the game uses ASCII only), at sizes 8, 16 and 24 px.

**Checked:** the screenshots were reviewed, by Fable and by the coordinator. The Canvas renderer logs no errors or warnings.
In headless WebGL the only warning is SwiftShader's "GPU stall due to ReadPixels", which comes from taking screenshots.

**Known issues carried into M5 and M6:**
- After crossing the finish line at boost speed, the bike rolls out to the end wall (harmless).
- At cp0 the bike spawns overlapping the lamp pillar.
- Rotated sprites look slightly jagged at some angles.
- The bundle is about 1.5 MB, almost all of it Phaser.

## M5: end-to-end tests
1. **Bot plan:** built from `levelData` plus `CONFIG`. There is one hop centred over each hazard (canal gap, cow, pillar, cart).
   When a hop would land too late to take off for the next hazard, one hop clears both. That happens for the paired gaps 102–104 and 108–110, with 24 px margin on each side.
   Take-off x values: 624, 1016, 1210, 1404, 1608, 1856, 2424, 2872, 3096, 3320, 4400.
2. **Diyas:** a diya 2 or more tiles above the ground that no hazard hop passes through gets its own hop, 24 px before it. Only x276 needs one.
   Diyas within 8 columns after a cliff are skipped, because rolling off the cliff collects x264.
3. **Cow:** the bot hops over her instead of waiting. In the air it levels the bike to within ±3°, which gives CLEAN landings, but the run doesn't depend on that.
4. **Monkeys:** the bot honks 5 steps on, 5 off, from the trigger column to the furthest spawn column. It boosts only from cp4 onward.
5. **Console allowlist:** five patterns, all SwiftShader, GPU or WebGL driver notices. Console errors are never allowed.
   An automatic fixture in `tests/e2e/helpers.ts` fails a test on any page error, console error, or warning that isn't on the list.
6. **River "lands in the water" check:** the last position before the crash must be inside the river's x range and below the water line (y > 226), with crashes = 1.

## M6: visual review fixes
1. **Finish:** the bike is braked to stop 64 px past the finish line, because it used to roll to the end wall and off the screen.
   The speed cap is `sqrt(2·1200·distance left)`. It only applies after the timer has stopped, so it doesn't affect the time.
2. **Honk popups:** a new honk popup replaces the previous one instead of stacking on top of it.
3. **Lamp offset:** each checkpoint lamp is drawn 26 px left of the checkpoint x, so the bike doesn't spawn on top of the pillar. This is a visual offset only;
   where checkpoints trigger and where the bike respawns are unchanged.
4. **Exhaust puffs:** now a soft 3×3 blob, because the old plus shape looked like sparkles.
5. **Left as they are:** vines sometimes pass behind HUD text (it stays readable), rotated sprites look slightly jagged, and the bundle is about 1.5 MB.

## Section 9 status (final for v1.1)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Build and tests pass | Met | `tsc` and `vite build` clean; 31 Vitest and 4 Playwright tests pass. Fable ran the suite 3 times in a row and the coordinator re-ran it once more. |
| 2 | Console clean | Met | Nothing logged under `?renderer=canvas` |
| 3 | Bot run | Met | 23.22 s of game time, 0 crashes, 17/17 diyas |
| 4 | River needs boost | Met | No boost: about 61 px short, into the water. Boost from cp4: lands at x = 5474.4, 34.4 px past the edge (needs ≥ 16) |
| 5 | Canal gaps | Met | Vitest (M2) |
| 6 | Hop windows | Met | Pillar 375 ms, cart 225 ms |
| 7 | Landing at 40° / 5° | Met | Vitest |
| 8 | 60 fps | Partly met | The automated perf test passes (10 000 steps in about 3 ms). **60 fps on real hardware still needs a manual check.** |
| 9 | Screenshots reviewed | Met | 10 PNGs in `test-results/shots/`, reviewed by Fable and spot-checked by the coordinator |

In the live game, 0.18 of the boost meter is left after the river jump (the diya collected in mid-air adds 0.1).

## v1.2: play-test changes (reverse at a standstill, background ambience)

### Backing up
1. **Values:** `reverseSpeed` 45 px/s, `reverseAccel` 120 px/s² (full speed in 0.375 s), `reverseHoldDelayMs` 300.
2. **When Left backs up:** only on the ground with `v = 0` exactly (braking always ends at exactly 0, so no fuzzy threshold is needed).
   While `v > 0`, and in the air, Left behaves exactly as before.
3. **No instant reverse:** a Left press that braked the bike must be held 300 ms at rest before it starts backing up.
   Releasing clears that, so a fresh press at a standstill backs up at once. The pause keeps "brake hard and hold" from turning into a surprise roll-back
   (it matters when stopping for the cow or at a canal edge).
4. **Stopping:** with Left released the bike stops at the `brake` rate (0.11 s from full reverse speed). Right while backing up does the same, then accelerates forward
   from 0. Boost stops the bike in one step and then boosts forward.
5. **Slopes:** position follows the surface as usual, but slope gravity isn't applied while backing up, because the rider's feet are holding the bike.
   So backing speed is the same up or down a ramp, and the bike never runs away backward. A bike at rest on an uphill still holds, as before.
6. **`v` is now signed** while grounded (negative = backing up), in `BikeState` and in `__test.state()`.
7. **No hop while backing up.** A hop from a standstill still works, and a buffered press fires once the bike has stopped.
   This also means a bike can only be airborne with backward speed by backing off an edge into a canal or the river.
8. **Walls:** backing into the foot of the cliff (a vertical face more than `wallTolerance` high) just stops the bike. The level start has a wall at x = 24
   (`WORLD_START_X`, was 0), so a backed-up bike stays fully on screen. Backing into a canal or the river falls in and crashes with the normal rules.
9. **Unaffected:** the boost meter (plain regen, the same as standing still), landings, the cow (45 px/s is below `cowCrashSpeed`, so she is simply solid), checkpoints.
10. **Finish:** the auto-brake after the line is released once the bike has stopped, so it doesn't back out of the gateway.
11. **Look:** the rider puts a foot down at a standstill and shuffles it while backing up, leans back 5°, and the wheels turn backwards.
    The engine just idles. The title hint now says `LEFT BRAKE/BACK`.

### Ambience
1. **Palette:** only section 6.1 colours and mixes of them. Fireflies are a moss-light / gold mix. No new teal or green.
2. **Baked into the tiled layers:** stacked-boulder hills on the far skyline (two haze levels). The middle ground gets a hazier back row
   (4 ruined mandapas, 2 arches, 3 boulder hills, 4 banana clumps, 7 small lamps) plus 5 more banana clumps and 3 broken pillars in the main tone.
   The existing palms, boulder piles and monuments are pixel-for-pixel where they were (the new art uses its own random streams).
3. **Animated (`src/art/Ambience.ts`, owned by `Parallax`, so the title screen has it too):** 3 bird flocks (15 birds), 6 bats, up to 16 fireflies, a 7-puff smoke wisp,
   7 lamp glows. A fixed pool of 51 images, created once and repositioned each frame; no particles, no allocations per frame.
4. **Deterministic:** every position, frame and alpha is a function of game time and camera scroll, with an integer hash instead of `Math.random`.
5. **Depths:** all below the terrain (10): birds 0.5, bats and smoke 1.7, lamp glows 2.1, fireflies 3. Nothing is added in front of the bike.
6. **Birds and bats:** birds fade out over camera scroll 4000–4700 and bats fade in over 3300–4000, so section 4 has both and the river section has bats only.
7. **Fireflies:** one candidate per 36 px cell of a 0.8-scroll layer, at y 172–212. A cell holds one with probability 0.9 by the canals, 0.75 by the river and 0.22 elsewhere.
   They are 1 px with a faint cross, so they can't be mistaken for a diya (8 px with a 32 px glow).
8. **Coracles:** the river already had three bobbing coracles from M3, so none were added.
9. **If a PNG replaces `bg_skyline` or `bg_mid`,** the smoke and lamp glows still sit where the code-drawn shrine and lamps were.

### Results (v1.2)
- 42 Vitest tests (31 + 11 for backing up) and 5 Playwright tests (4 + `reverse.spec.ts`) pass. The M2 measurements above are unchanged: the bot run is still 23.22 s, 0 crashes, 17/17.
- Screenshots: 12 PNGs in `test-results/shots/` (the 10 from before plus `reverse` and `reverse-start-wall`), reviewed by Fable.
- Still open: 60 fps on real hardware needs a manual check, now with 51 more small images on screen.

## v1.3: the gameplay loop (longer stage, tricks, game feel, music, replay)

Asked for: still one stage, a bit longer, and a loop worth replaying. Built in four milestones (M-A to M-D), each committed with
the build clean and `npm test` green.

### M-A: longer single stage
1. **Length:** 360 → 580 columns (9280 px). Sections 1–4 are column-for-column where they were; two new sections go in before
   the river, which moves to columns 520–579 unchanged (still the climax). World end wall 9264, camera max scroll 8800.
2. **Section 5, Mandapa Run (300–409):** an h1 plinth (ramp 4 +1 up, ramp 4 −1 down) with fallen pillars at x324, x341, x358
   and a cart at x377. 17-column spacing = a 12-column hop plus 5 columns of ground: a steady rhythm, then one longer beat
   (19) before the taller cart. A dark colonnade behind the plinth is decoration only (85% alpha, behind every entity).
3. **Section 6, Hemakuta Rocks (410–519):** roller (6 +1 / 6 −1), bigger roller (6 +2, flat 5, 5 −2), then the kicker:
   ramp 4 +2 (26.6°, the river ramp's slope, but hop-able) ending over an 8-column tank with the far bank at h0, a 30-column
   landing flat and a last small roller. The tank makes the kicker a real beat instead of scenery: it teaches "hop on the
   ramp" (hint at cp5) one section before the river teaches "boost".
4. **The tank is a new kind of gap** (`kicker: true`): rolling off the ramp at 240 falls in; a hop from anywhere on the ramp
   clears it; boost alone clears it too (191 px of flight over a 128 px gap). So the canal rule "no gap can be rolled across,
   even at boost speed" still holds for the six canals and is deliberately relaxed here, giving two ways across.
5. **Checkpoints:** one per section start: cp0 x2, cp1 x62, cp2 x142, cp3 x222, cp4 x302, cp5 x412, cp6 x522. The longest
   stretch between two is 110 columns (7.3 s at top speed). `?cp=N` now takes 0–6. The boost hint moved to cp6.
6. **Diyas:** 17 → 30. Mandapa: one over each obstacle at hop height, two on the plinth where a centred hop lands (a hop
   taken too late overshoots them). Rocks: two free ones on roller crests, two on the arc of a hop taken on the second roller's
   up-ramp, three on the arc of a mid-ramp kicker hop (the third is missed by a hop at the very start or very lip of the ramp).
7. **Bot:** unchanged logic; it plans the kicker like any gap (hop centred on it = 32 px before the lip, on the ramp).
   One new rule: a floating diya further along the arc of the previous diya hop gets no hop of its own.
8. **Ambience:** bird / bat cross-fade and the river firefly zone moved with the river; a firefly zone was added at the tank.

### M-B: tricks
1. **What counts:** the rotation of each air is added up (`spin`, signed). On a landing the bike survives, `round(|spin|/360)`
   full turns are flips. Rounding is safe because a surviving landing is within 35° of the slope, so the total is always close
   to a whole number of turns give or take the take-off / landing slope difference.
2. **"Lands clean" read as "lands without crashing"** (`clean` or `safe`). Requiring the ≤ 10° CLEAN band after a turn at
   450°/s would be a 44 ms window; the 35° band is about 155 ms. A flip that is also CLEAN gets both bonuses.
3. **Reward:** `boostFlip` = 0.35 of the meter per flip (0.58 s of boost), "+FLIP" popup that replaces "CLEAN!", a rising
   jingle, +1 on the flip tally (HUD, finish screen, best).
4. **Tilt speed had to change, and how:** at the old fixed 180°/s a full turn takes 2 s; no jump in a 270 px tall stage lasts
   that long. Instead of raising the rate (which would make every small correction twitchy), a held tilt now accelerates:
   180°/s on the first step, +700°/s² while the same key stays held, capped at 450°/s. A tap is exactly what it was.
   A full turn takes 0.93 s.
5. **Where flips fit:** kicker hop 1.09–1.16 s of air (margin ≥ 0.16 s with the key simply held); also the x276 ramp hop
   (0.96 s), a hop off the cliff (0.91 s), the rollers (0.92–1.03 s). A flat-ground hop is 0.8 s: holding a tilt key all the
   way over-rotates to about 308° and crashes. So flips need a ramp and cannot be farmed on flat road.
6. **Double flips:** counted and labelled, and unit-tested under low gravity, but no jump in this stage is long enough
   (it would take about 1.7 s of air; the best is 1.3 s boosted off the kicker). Left as headroom for a bigger jump.
7. **Hopping on a ramp adds the hop to the ramp's lift** (unchanged v1.1 physics). That is what makes the kicker big:
   about twice the rise of a flat hop.

### M-C: game feel
1. **Landing:** dust puffs to both sides, count and speed scaled by the speed into the ground (flat hop about 280 px/s,
   kicker about 430), 25% more for a rough landing; the body squash scales the same way; the camera dips on a damped spring.
2. **Camera bump:** only ever moves the world down (at most 5 px), so nothing below the terrain textures is exposed.
   The HUD is a separate scene and does not move.
3. **Look-ahead:** the old fixed 80 px was less than it sounds: the scroll smoothing trails a moving bike by `v·0.158 s`
   (38 px at 240, 57 px at 360), so the bike sat further right the faster it went. The new values (56 / 108 / 166 at
   rest / top / boost) more than cancel that. Road visible ahead of the bike: 310 px at top speed (was 282),
   349 px at boost speed (was 263).
4. **"Zoom-out while boosting" is a pull-back, not a zoom.** A fractional zoom on a 480×270 pixel-art canvas shimmers,
   so the boost value of the look-ahead moves the bike back instead.
5. **Speed streaks** are screen-space lines in the sky band (y 40–190), at depth 9, just behind the terrain (10) and every
   entity, at most 52% alpha. They cannot cover an obstacle or a diya.
6. **Pooled and deterministic:** one pool of 56 world particles (dust, sparkles), 9 streak images, one flame sprite. No
   allocation per frame, positions from an integer hash and game time. The older Phaser emitters (exhaust, wheel dust,
   sparks, splash) are kept as they were.
7. **Already there:** the wheel dust trail at speed dates from M3; it was left alone.

### M-D: music and the replay loop
1. **Music:** generative rather than a fixed loop: a seeded phrase generator in Bhupali over a Sa–Pa drone, so it never
   repeats within a session yet is identical on every load. Chosen because Bhupali is an evening raag and a plain major
   pentatonic that cannot hit a sour note against the drone. Sa = D (146.83 Hz), 76 bpm, lifting to 88 with an added
   off-beat pulse and a high shimmer while boosting (55% of that on the river run-up).
2. **Mix:** music bus gain 0.28 into the 0.5 master. Measured in headless Chromium: music peak about 0.10 on its bus,
   master peak about 0.13 with engine and effects, no clipping. A crash dips the bus to 0.05 for 0.9 s.
3. **Scheduling:** from the frame loop with a 0.3 s look-ahead, not a timer. A backgrounded tab simply stops scheduling and
   picks up again; under manual stepping it schedules at most what real time allows.
4. **M was already master mute**, so it now cycles: all sound → music off → muted. The HUD tag reads "MUSIC OFF" or "MUTED".
   The mode is saved with the ghost preference.
5. **R now restarts the whole run** (it used to respawn at the last checkpoint). For a 40 s time-attack stage, restarting is
   the thing a player does most; the old behaviour moved to C.
6. **Ranked vs practice:** only a run from cp0 is scored. A `?cp=N` start shows "PRACTICE RUN - NO MEDAL".
7. **Scored at the line**, not when the finish screen opens 1.2 s later, so pressing R straight after the line still counts.
8. **Medals:** gold ≤ 40.00 s, silver ≤ 46.00 s, bronze ≤ 56.00 s, from the bot's 38.13 s. Gold = the clean no-flip line
   with about 2 s to spare, or a slip paid back with flips and boost. Silver allows about two crashes, bronze about five.
   All diyas stays the middle star rather than a fourth medal.
9. **Bests are independent** (fastest time, most diyas, most flips), not "the stats of the fastest run", so a slow
   collect-everything run still registers.
10. **Ghost:** 20 Hz, 7 base-36 characters per sample, 5348 characters for the bot's run. Stored inside the best record;
    replaced only by a faster run. Hidden after the line (the run timer it follows has stopped). 45% alpha, one layer
    behind the bike.
11. **Storage:** two keys, `hampi-at-dusk.best` and `hampi-at-dusk.prefs`. The best record carries a version and the stage
    length and is ignored when either differs. Every access is in try/catch; the session keeps its own copy of the bests,
    so with storage blocked the medal, "NEW BEST!" and ghost all still work until the page closes.
12. **Console allowlist:** unchanged.

### Measured results (v1.3)

| Check | Result | Requirement |
|---|---|---|
| Bot run | 38.13 s (38 125 ms), 0 crashes, 30/30 diyas, gold; 0.52 of the meter left | 0 crashes, all diyas, about 40 s |
| River, no boost | Flight 127 px; 64.6 px short of bank height (61.4 px in the e2e crash position); water | Water |
| River, boost from cp6 | Lip speed 360; lands at x = 8994.4, 34.4 px past the edge; 0.08 of the meter left (0.18 with the mid-air diya) | ≥ 16 px |
| Canal hop windows | 135–540 ms (unchanged); paired gaps in one hop 198 ms | Clear with a hop |
| Pillar / cart hop windows | 375 ms / 225 ms, the same for the four new ones on the plinth | ≥ 120 ms |
| Kicker hop window | 65 px = 271 ms (the whole ramp); lands ≥ 44 px past the tank | ≥ 120 ms, ≥ 16 px |
| Kicker airtime | 1.09–1.16 s with a hop (0.48 s without, which falls short) | A held flip fits |
| Full turn, key held | 0.93 s; lands clean off the kicker with either a back- or frontflip | Fits the kicker hop |
| Flat-ground hop | 0.80 s of air: a held tilt crashes, no flip | Flips need a ramp |
| Camera | Never steps backward; largest step 3.56 px; bike at screen x 150–177 away from the stage ends | No jumps |
| Medal thresholds | 40.00 / 46.00 / 56.00 s | From the bot time |
| Ghost size | 5348 characters for 38.13 s | Compact |
| Performance | 10 000 physics steps in about 4 ms | < 100 ms |

Tests: 73 Vitest (60 physics, 13 progress / music score) and 8 Playwright (smoke, reverse, river ×2, flip, run + replay loop,
storage throwing, audio). Run twice in a row at the end. 23 screenshots in `test-results/shots/`, reviewed by Fable.

### Open questions (v1.3)
- **Not heard by a person.** The music and the new jingle were checked for level, clipping and console warnings only.
  The mix (0.28) and the timbres need ears.
- **R / C swap** changes a v1.2 control. If checkpoint-respawn on R is preferred, the two handlers swap in one place.
- **Gold at 40 s** is generous for anyone who uses boost and flips; tighten it once real times are known.
- **60 fps on real hardware** still needs a manual check, now with the particle pool and the ghost.
- **Palette:** nothing new was added (the pending teal decision is untouched). Medals use gold, chrome and brass.

## Attribution
- Commits made by Fable carry a `Co-Authored-By: Claude Fable 5.2` trailer, which names the model that actually wrote them. Commits made by the coordinator carry the Opus trailer.
