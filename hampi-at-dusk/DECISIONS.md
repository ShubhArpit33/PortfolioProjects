# DECISIONS

These are the judgement calls made where `GAME_SPEC.md` (v1.1 to v1.7) left room for interpretation.
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

---

## v1.4: music rewrite ("a bit boring and farty")

Player feedback on v1.3: "change the music to something better, this is a bit boring and farty".

### What was farty
1. **The tanpura drone.** One sawtooth "string" per beat at 73, 110 and 147 Hz, each through a resonant (Q 3) low-pass
   that swept open and rang for 3.4 s, so four or five raw low sawtooths were always sounding. In a 45 s render 43% of the
   energy sat at 150-500 Hz (the buzz harmonics of those strings) and almost nothing above 2 kHz.
2. **The 'ge' drum:** a sine falling from 118 to 62 Hz over 0.16 s, a "bwomp" twice a bar.
3. **The engine:** a 48-170 Hz sawtooth plus a square sub-octave (24-85 Hz) tuned 1% sharp, so the two beat against each
   other, with filter Q 7 while boosting. This played for the whole run.
4. **The crash:** a sawtooth falling 150 to 38 Hz with a square falling 90 to 30 Hz.

"Boring": one static drone, no chords, 76 bpm, a wandering generative flute with no repeated phrase, a sparse pulse.

### What replaced it
1. **104 bpm, D major / Bhupali, a real song form:** intro 4 bars, A 8, B 8, A' 8, breakdown 4 = 32 bars, 73.8 s. Later
   passes skip the intro (28 bars, 64.6 s) and draw different grace notes, so it is deterministic but not an exact loop.
2. **Hook:** a 2-bar call (D E F# A F# E D / B D F# E) and a 2-bar answer, restated with an ending that lands on Sa.
   Played on a santoor-like pluck: Karplus-Strong strings computed once per pitch into buffers (a DelayNode loop cannot
   reach these pitches), doubled a few cents apart, with a quiet dotted-eighth echo.
3. **B section:** a bansuri-like line (two sines, band-passed breath noise, vibrato that arrives late) over plucked chord
   arpeggios; half-time drums. **A'** adds grace notes, a clap and a second voice a third / fourth below.
4. **Harmony:** D Bm G A (A), G A Bm A G A D A (B). Bass = sine plus a quiet octave triangle, low-passed at 480 Hz,
   lowest note D2 (73 Hz). Pad = low-passed triangles at D4-B4. The drone is now a faint plucked shimmer, high-passed at
   500 Hz.
5. **Percussion:** kick settles 150 to 82 Hz in 30 ms and is gone in 0.13 s; 'na' and 'tin' are short sine pings tuned to
   Sa and Pa with a band-passed noise slap; shaker on 16ths. Nothing has a long falling pitch.
6. **Boost lift:** tempo 104 to 110, 16th hi-hats, open hat on the off-beats, four-on-the-floor kick, extra 'tin'.
7. **Bus:** voices, 70 Hz high-pass (plus a 55 Hz one), compressor (-16 dB, 3:1), bus gain 0.30, master 0.5, then a
   new safety limiter (-4 dB, 16:1). The test tap for "no clipping" now reads after the limiter.
8. **Engine and crash softened** (they were part of the complaint): triangle body plus a quiet sawtooth at the same
   pitch (60-160 Hz), filter Q at most 2.5, 45 Hz high-pass, about 25% quieter; the crash keeps its noise crunch over a
   triangle / sine thump.
9. **The score is pure** (`barScore(bar)`), so the form, the raag, the bass range and the variation are unit-tested.
   `createMusic()` runs on any BaseAudioContext; `scripts/render-music.mjs` bundles the module, renders it in headless
   Chromium with an OfflineAudioContext and writes `music-preview.wav` (git-ignored, normalised to -1 dBFS).

### Measured (45 s offline render, on the music bus, before the 0.5 master)

| | New (v1.4) | Old (v1.3) |
|---|---|---|
| Peak | 0.260 (-11.7 dBFS) | 0.247 (-12.1 dBFS) |
| RMS | 0.039 (-28.1 dBFS) | 0.057 (-24.9 dBFS) |
| Below 80 Hz | 5.9% | 2.6% |
| 80-150 Hz | 25.2% (sine bass, kick) | 9.1% |
| 150-500 Hz | 28.0% | 43.2% (sawtooth buzz) |
| 500 Hz-2 kHz | 37.3% | 45.0% |
| Above 2 kHz | 3.5% | 0.2% |

In the game (headless Chromium, real time): music bus peak 0.075, master peak 0.136 with engine and effects. No clipping,
no console warnings.

Tests: 75 Vitest (60 physics, 15 progress / music score) and 8 Playwright.

### Open questions (v1.4)
- **Still not heard by a person.** Levels, spectrum and the score were checked; whether the hook is actually catchy needs
  ears. The preview WAV is there for that.
- The new low end is a deliberate, clean sine bass (31% of the energy below 150 Hz, 6% below 80 Hz). If it is still too
  much on the player's speakers, the bass level is one number (`0.09` in `scheduleStep`).

---

## v1.5: pause menu and the way back to the main menu

"can u add a button go back to main menu too"

1. **Pause menu.** P / Esc (or the small "II" button at the top centre of the HUD, clear of the timer and of
   BOOST / CRASHES) opens a yellow pixel frame: RESUME, RESTART, MAIN MENU. Up / Down + Enter, or click / tap an option;
   P / Esc again resumes. It always opens on RESUME. The HUD scene draws it and takes its keys; the Game scene owns the flag.
2. **Pause really is a freeze.** No fixed steps run and every frame is drawn with dt 0, so the timer, physics, ghost
   recording, hints, popups and animals all stand still. The two things that ran on Phaser's frame clock are stopped
   too: the bike's particle emitters are paused, and a crash shake in progress is cancelled. `__test.step` no longer
   unpauses (it used to, v1.0 note 8): while paused it advances nothing. Music keeps playing; the engine sound stops.
3. **Finish screen.** "ENTER / R - RIDE AGAIN" became two options, RIDE AGAIN (selected) and MAIN MENU. Enter and R still
   ride again at once; Left / Right (or Up / Down) + Enter, or a click, picks the other. The panel is 14 px taller for the
   key hint line.
4. **Back to the title** is `GameScene.toTitle()`: stop Finish and Hud, start Title. Phaser tears the scenes down
   (objects, key and pointer listeners); the Game scene also resets its keys on shutdown so nothing stays held. The
   AudioContext and the music are untouched (the title keeps ticking the same music, intensity 0). Best / medal / ghost
   live in the module-level session best and in storage, so they survive.
5. **Title:** "PRESS ENTER" is also a click target. The hint line now reads "R RETRY ... P/ESC MENU" (58 characters,
   the widest that fits).
6. **One menu class** (`src/ui/Menu.ts`) serves both screens: text options, a "> <" marker on the selected one, and a
   click zone per option that is wider than the text.
7. **Tests** (`tests/e2e/menu.spec.ts`, 3 tests): pause freezes the state over 240 manual frames and over 1 s of real
   time; resume / restart / main menu by keys and by mouse; three title -> game -> title round trips with identical
   listener, object, interactive-object, tween and timer counts each time (new `__test.leaks()`), the Right key held
   through the exit and no stuck throttle on the next start; finish -> ride again / main menu by keys and mouse with the
   stored best unchanged and the ghost back on the next ranked run. `__test.screen()` and `__test.targets()` are new.

Tests: 75 Vitest and 11 Playwright.

### Open questions (v1.5)
- There are still no touch controls for riding; the click / tap targets only cover the menus.
- The game does not pause by itself when the tab loses focus.

## v1.6: three bikes (roster, bike select, tribute sprites)

"3-bike roster": Ton-Up (cafe racer), Daybreak (the existing bike), Sundowner (cruiser). The numbers were proposed from a
headless simulator first (the real physics and level modules plus a port of the Game ride loop and the e2e bot), approved
as proposed, and are used verbatim. Three decisions the user confirmed: Ton-Up `topSpeed` 288 (the kicker skim at full
speed is a perk, the hop stays the safe line); Sundowner `topSpeed` 204 (the paired canals' one-hop window is only 91 ms,
accepted because the two-hop route exists); Ton-Up safe / clean landing 25° / 7°.

### M1: physics and storage
1. **Overrides only.** `src/bike/bikes.ts` holds each bike as a `Partial<Config>` over `CONFIG`; the Daybreak's is empty
   and `CONFIG` is untouched (a unit test pins the table and that `daybreak.cfg` equals `CONFIG`). Hitbox, gravity, brake,
   coast drag, flip award, slope factor, nose drift, stumble, horn range, cow speed, reverse and respawn are shared.
2. **`this.cfg` everywhere.** The physics already took a config argument; the Game scene now passes the selected bike's
   to `step`, every `createBikeState` (start, respawn, the after-the-line settle), `bikeAABB`, `hitsObstacle`,
   `touchesDiya`, the cow push-back, the monkey stumble, the diya bonus, the horn range, the camera look-ahead and the
   engine pitch (speed / that bike's `topSpeed`, so every bike reaches the same pitch flat out).
3. **Selection** (`src/bike/selection.ts`): `?bike=` > the remembered pick > Daybreak. `?bike=` is for the page load only
   and is not saved; a pick made on the select screen (or `__test.bike`) is saved in the prefs.
4. **Records per bike:** `hampi-at-dusk.best.<id>`. The session copy of the bests is per bike too, so the game still plays
   the same with storage throwing. **Migration:** `loadBest('daybreak')` falls back to the old `hampi-at-dusk.best` only
   while the Daybreak has no record of its own, copies it to the new key if storage allows (it simply migrates again next
   time if it does not), and never touches the old key. Other bikes never read it. A malformed or other-layout old record
   is ignored.
5. **Medals per bike:** gold = the bot's clean run + about 2 s, silver + 6 s, bronze + 10 s more, as on the Daybreak:
   Ton-Up 34 / 40 / 50 s, Daybreak 40 / 46 / 56 s (unchanged), Sundowner 46 / 52 / 62 s.
6. **Bot.** The planner moved to `tests/shared/plan.ts` (pure) so the unit tests ride the same plan. Hop length and half
   bike width come from the bike's config. The Ton-Up's 214 px hops chain into each other and the centred planner has no
   solution, so it falls back to an **interval planner**: each hazard group has a range of take-offs that clear it; a
   forward pass gives each hop its earliest take-off, a backward pass its latest, and the hop goes in the middle (46 px of
   slack at the tightest hop). Daybreak and Sundowner still get the centred plan (the Daybreak's is unchanged to the pixel).
7. **Stat bars** are computed, not typed in: SPEED 204–288 px/s, PULL 140–220 px/s², BOOST 1.39–2.78 s of tank, FLIP
   360–520 °/s, GRIP 25–45°, each mapped to 1–5 pips. (PULL starts at 140 so the Daybreak's 160 shows 2 pips, not 1.)

### M2: bike select and UI
8. **Flow:** Title → BIKE SELECT → ride. `?cp=N` still goes straight into a practice run (on the selected / `?bike=` bike).
9. **Select screen** (`src/scenes/Select.ts`): three 148 × 194 cards, the bike at 3× on a strip of road, name, five 5-pip
   stat bars, that bike's best and medal or "NO RUN YET"; the tagline of the highlighted bike, RIDE / BACK and the key hint
   below. Left / Right wrap; Enter rides; Esc goes back. Mouse / touch: a click picks a card, a second click (or RIDE)
   rides. No hover-select, so a tap and a click behave the same. The pick is saved when the ride starts.
10. **CHANGE BIKE** is in the pause menu (RESUME / RESTART / CHANGE BIKE / MAIN MENU; the panel is 16 px taller) and on
    the finish screen (RIDE AGAIN / CHANGE BIKE / MAIN MENU; the frame is 40 px wider so three options fit on one row, and
    menu options can set their own click width so the targets do not overlap). The select screen always starts a ranked
    run from cp0; Esc from it goes to the title.
11. **Names in the UI:** the finish screen's medal line and the title's best line name the bike; the HUD shows the bike
    name small at the bottom left. While the finish screen is up the HUD hides CRASHES / FLIPS / the name (the wider frame
    reaches under them and shows the same numbers).
12. **A key press older than its handler is ignored** (`onKeyPress`): the Enter that opens the select screen must not
    also press RIDE. (Phaser re-processes its key queue, and the new scene's handlers have not "seen" the event.)
13. **One rig** (`BikeRig` in `src/bike/sprites.ts`): wheels, flame, body and planted leg in a container, built from a
    per-bike description. The ridden bike, the ghost (now the selected bike's sprite) and the previews all use it.

### M3: sprites
14. **Chassis:** body textures are 48 × 32 with the ground at the bottom edge, wheel centres at (11, 26) and (37, 26) and
    the lean / bob pivot at (24, 26). That is the old 40 × 24 sprite's geometry with 4 px of room either side and the
    lower 8 px added (so mudguards, forks and pipes can reach down past the axles). The wheel contact points, wheel radius
    and hitbox are unchanged, so landing, squash and dust line up exactly as before.
15. **Art as data** (`src/art/bikeArt.ts`): each bike is a list of `[row, column, pixels]` segments over a legend of
    colours, painted in layers (frame, engine, exhaust, bodywork, rider). `Pen` moved to `src/art/pen.ts` and no longer
    needs Phaser, so the art can be rendered to a PNG outside the game and unit-tested as pixels.
16. **Tributes without marks.** Ton-Up: competition green, silver tank stripe, cockpit fairing with a smoked screen
    around a round headlamp, humped single seat, clip-ons, upswept megaphones, wire wheels, gold forks and shock springs,
    rider tucked in black leather. Daybreak: red angular tank with shrouds, sharp tail, upright bars and mirror, cast
    wheels, compact headlamp, stubby silencer, the v1.0 rider (brown jacket, cream helmet, gold band) upright. Sundowner:
    celestial blue with a cream tank panel, big chrome headlamp, pulled-back bars, feet forward, two-tier seat, deep rear
    mudguard over a fat tyre, twin long pipes, rider leaning back in a tan jacket and an open-face helmet. No lettering,
    badges or logos are drawn anywhere.
17. **Blue, not maroon, for the Sundowner:** against the purple and orange dusk a maroon bike sinks into the silhouettes
    and sits too close to the Daybreak's red. Celestial blue with cream and chrome is the only cool colour on screen.
18. **The fairing was redrawn once.** The first version continued the tank line and stripe and read as one long tank.
    The fix: a rounded shell two rows taller than the tank, a one-column gap at the headstock, no stripe on the shell, a
    bigger lamp with a chrome bezel, and a pale translucent screen with a bright leading edge (a dark "smoked" one vanished
    against the dusk).
19. **Per-bike details:** the boost flame and the smoke come from each bike's exhaust tip (above and behind the rear axle
    on the Ton-Up, beside the rear tyre on the Daybreak, behind the axle on the Sundowner); the flame is drawn over the
    wheels and under the body so the Daybreak's is not hidden by its tyre. The planted leg has each rider's trousers and
    stands under that rider's knee. The Sundowner's rear wheel has a thicker tyre than its front; both are still 12 px
    across, so the contact points do not move.
20. **PNG overrides** (section 6.4) are now per bike: `bike_<id>`, `wheel_<...>`, `leg_<id>`; `bike_body` and `wheel` are gone.

### v1.6.1: art pass after the first play (sprites only; no physics, stats, medals or level change)
21. **Daybreak redrawn as a retro roadster.** The v1.6 sprite was a sharp modern naked bike (angular tank and shrouds,
    pointed tail, cast wheels, stubby silencer). The tribute wanted is the retro single-cylinder roadster, so the body and
    wheel were redrawn: a rounded teardrop tank in deep metallic red (highlight on top, thin cream pinstripe), a long flat
    ribbed seat, a red side panel, an upright air-cooled single (chrome fins with dark gaps, a round case cover, the
    header down the front of the cylinder), deep chrome mudguards on both wheels, one long low chrome silencer ending
    behind the rear axle, a round chrome headlamp with twin clocks, a wide upright bar with a round mirror, twin shocks,
    wire-spoke wheels with a chrome rim inside a full tyre. Same rider (brown jacket, cream helmet, gold band), bolt
    upright; the forearm now runs level to the bar so the whole tank shows. Still no lettering, badges or logos.
22. **Told apart from the Ton-Up** (which also has spokes): upright with no fairing or screen, red not green, a round
    tank not a long flat one, a flat seat not a hump, chrome mudguards, one fat low silencer not upswept megaphones, a
    single column of fins not a wide twin. From the Sundowner: one short fat silencer from mid-bike, not two thin pipes
    the length of the bike; mid-set pegs; chrome guards, not painted ones.
23. **Daybreak exhaust tip** moved with the silencer: `exhaustX` -9 to -22 (the flame and smoke now come out behind the
    rear axle). Sprite description only. Tagline: "THE ALL-ROUNDER. A CLASSIC ROADSTER."
24. **Sundowner pegs back 2 px.** The boot was at columns 28-32, over the front tyre, with the shin raked far forward.
    It is now at 26-30, just ahead of the engine and the frame's downtube, with the knee one pixel further back and a
    steeper shin: still feet-forward, knee bent near a right angle. (3 px was tried: the boot then hid the engine cover.)
25. **Tests:** the Daybreak's pixel test was rewritten for the new bike (tank, pinstripe, side panel, flat seat, fins and
    gaps, both mudguards, silencer, lamp, mirror, open wire wheel). Counts unchanged: Vitest 176, Playwright 28. All
    previews in `test-results/shots` were re-rendered and checked by eye (riding, standing, reverse, boost, hop, flip,
    landing, crash, respawn, finish, select).

### Measured (v1.6; unit tests and e2e, the same numbers as the proposal)

| | Ton-Up | Daybreak | Sundowner |
|---|---|---|---|
| Bot run (17 hops, boost only at the river) | **32.058 s**, interval planner | **38.125 s**, centred planner | **43.992 s**, centred planner |
| Crashes / diyas / medal | 0 / 30 / gold (34 s) | 0 / 30 / gold (40 s) | 0 / 30 / gold (46 s) |
| Worst landing in the bot run (limit) | 12.2° (25°) | 10.9° (35°) | 23.9° (45°) |
| Bot plan with every hop ±8 px | all 30, no crash | all 30, no crash | all 30, no crash |
| Bot plan with no tilt input at all | crashes on landing at x≈1599 (32° off) | finishes, 30/30 | finishes, 30/30 |
| Flat hop: air / length / apex | 0.74 s / 214 px / 48 px | 0.80 s / 192 px / 56 px | 0.80 s / 163 px / 56 px |
| Canal hop windows, in column order | 443, 365, 309, 240, (31), 406 ms | 540, 527, 406, 198, 135, 398 ms | 561, 483, 404, 142, 228, 326 ms |
| Paired canals in one hop | 240 ms | 198 ms | 91 ms |
| Paired canals in two hops (first-hop window) | not possible | not possible | 142 ms |
| Any canal rolled at top or boost speed | never | never | never |
| Pillar / cart / cow hop window | 347 / 172 / 319 ms | 375 / 225 / 375 ms | 321 / 169 / 331 ms |
| Kicker: rolled at top speed | **clears by 8.4 px** (10 px/s slower: water) | water | water |
| Kicker: hop window (landing ≥ 16 px clear) | 300 ms (241 ms) | 271 ms (271 ms) | 311 ms (257 ms) |
| Kicker: air / least landing margin of an on-ramp hop | 1.11–1.18 s / 94.3 px | 1.10–1.17 s / 44.1 px | 1.06–1.13 s / 2.6 px |
| Kicker: boost alone, no hop | clears by 119.9 px | 62.9 px | 59.3 px |
| Flip: full turn with the key held / kicker air | 0.82 s of 1.11–1.18 s | 0.93 s of 1.10–1.17 s | 1.12 s: does not fit 1.05–1.13 s |
| Flip off the kicker (hop 64 / 32 / 1 px before the lip) | lands, clean | lands, clean | lands (safe / clean / clean); held for the whole air it lands 330–357° round, inside the 45° band |
| Flat-hop flip, any timing, either way | impossible (319° of 335° needed) | impossible (296° of 325°) | impossible (234° of 315°) |
| River, no boost: lip speed, short by | 288 px/s, 28.8 px | 240 px/s, 64.6 px | 204 px/s, 88.2 px |
| River, boost from cp6 at rest: lip speed, margin, meter left | 420 px/s, **93.2 px**, 0.09 | 360 px/s, **34.4 px**, 0.08 | 350 px/s, **25.0 px**, 0.55 |
| River: least meter from rest | 0.82 | 0.90 | 0.60 |
| Full tank of boost | 1.39 s | 1.67 s | 2.78 s |
| Camera in the bot run: bike screen x | 146–174 | 150–177 | 150–167 |

Notes on the table:
- **(31 ms)**: the second of the paired canals has 48 px of run-up, less than the Ton-Up needs to start a 214 px hop there.
  That bike takes the pair in one hop (240 ms), which is what the bot does. The test asserts exactly this.
- The Sundowner's two-hop window reads 142 ms here and 137 ms in the proposal: the test sweeps the whole 96 px run-up,
  the simulator stopped 2 px short. Same physics.
- The Sundowner's 2.6 px kicker margin is a hop taken at the very foot of the ramp; 257 ms of the 311 ms window lands a
  full tile clear. The test asserts both (every on-ramp hop clears; ≥ 200 ms lands ≥ 16 px clear).
### v1.6.2: second art pass (sprites only; no physics, stats, medals or level change)
26. **Bug: two near legs at a standstill.** The planted leg (`leg_<id>`, shown when stopped and while backing up) was
    drawn over a body texture that still had the rider's near leg on its peg, so the rider had both: most obvious on the
    Sundowner, whose boot sat well ahead of the planted leg, but true of all three. The leg on the peg was baked into
    the one body texture, so nothing could hide it.
27. **Fix: two bodies per bike.** The art is now layered bike / leg / rider, and every bike has `bike_<id>` (riding) and
    `bike_<id>_stand` (foot down: no shin, no boot on the peg, only a thigh from the hip to the top of the planted leg).
    `BikeRig.setFootDown(on)` is the only place the planted leg is shown or hidden, and it swaps the body texture in the
    same call, so the two can not disagree; `BikeView.ride` (standing, reverse, and back to riding), the crash pose and
    the select-screen preview all go through it. The far leg is not drawn in any pose (it is behind the bike). A
    separate peg-leg sprite was the alternative; a second body texture needs no extra object to keep leaning and
    bobbing with the body.
28. **Sundowner redrawn as a bobber** (asked for: a tribute to the purple-and-black factory bobber with whitewalls). Deep
    violet teardrop tank with a soft highlight and nothing on it; everything else black with a grey edge light so it
    holds against the dusk: sprung solo saddle (no pillion, nothing behind it), bobbed rear mudguard with a small round
    tail lamp and a plate stub with an amber indicator, mini-ape bars with a round mirror, round headlamp in a black
    cowl, gaitered fork, whitewall tyres on black wire wheels (disc on the front), tall finned single, battery box, twin
    shocks, one black slash-cut pipe at axle height. Mid-set pegs replace the feet-forward pose; the rider keeps the tan
    jacket (it separates him from the purple and the black better than a dark one), sitting upright with a slight lean
    back and his arms raised to the grips. No lettering, badge or logo. This reverses decision 17 (blue, not a dark
    colour): the whitewalls and the bright violet tank carry the bike on a dark background instead.
29. **Told apart:** from the Daybreak by colour (violet and black against red and chrome), whitewalls, black bobbed
    guards against deep chrome ones, a solo saddle against a long flat seat, the high bars and raised arms, a thin black
    pipe against a fat chrome silencer; from the Ton-Up by all of that and no fairing.
30. **Sprite data:** Sundowner `exhaustX` / `exhaustY` -23 / -6 to -22 / -5 (the slash-cut tip), `legX` -2 to -4 (the
    planted leg drops from the hip on the saddle). Tagline: "THE BOBBER. LOW, HEAVY AND FORGIVING." Name, stats and
    medal times unchanged.
31. **Tests:** the Sundowner pixel test was rewritten (tank the only purple and unmarked, solo saddle on two springs,
    black bobbed guards, tail lamp, grip above the tank, mirror, cowl and lamp, fins and gaps, black slash-cut pipe and
    the exhaust tip on it, whitewall ring on both wheels and on no other bike, front disc, mid-set boot). New suite, one
    test per bike: the foot-down body has no boot or shin on the peg, its thigh meets the planted leg, and nothing but
    the leg differs from the riding body. Vitest 176 to 179 (bike art 6 to 9); Playwright 28. All previews in
    `test-results/shots` re-rendered and checked by eye for all three bikes (standing, riding, reverse, boost, hop, flip,
    landing, crash, respawn, finish, select).

### v1.6.3: a helmet for the Sundowner rider (sprite only)
32. **Reported:** "the guy on the bobber is missing a helmet". He had one, but it was matte black (`0x26222b`) with no
    rim, stripe or highlight, so at game scale it read as dark hair, with the dark glasses as more of it.
33. **Fix:** a cream open-face (3/4) retro helmet in the same seven columns and six rows (columns 14..20, rows 1..6), so
    nothing else moves: cream shell over the crown and down behind the ear with a shaded back edge, goggles pushed up on
    the brow (blue glass, chrome frame), their black strap round the shell, the face open below with one eye, a black
    chin strap. Matte black was tried first, three ways (cream crown stripe, cream band, highlight only): against the
    dusk sky each read as a hat, a bandana or hair. A separate crown stripe was dropped too: two pixels of it on the top
    row cut notches in the dome. The goggle strap is the helmet's one black stripe.
34. **Told apart:** Ton-Up, a plain silver-white full-face with a dark visor, tucked; Daybreak, cream with a gold band
    and a dark visor, no face; Sundowner, cream with a black band, goggles and an open face. One rider layer feeds both
    body textures, so riding, foot down, reverse, crash, respawn, flip, the select preview and the ghost all changed
    together.
35. **Tests:** new suite "every rider is helmeted" (one test per bike, both bodies: no hair-dark pixel on the crown, a
    bright shell that outweighs visor and straps, nothing above it; one for the Sundowner's open face, goggles, straps
    and its difference from the other two).

- Nothing changed during the build: the tuning table, the medal targets and every measured number match the proposal.

### Tests (v1.6)
- **Vitest: 176** (physics 150, progress 20, bike art 6). Canal, pair, kicker, flip, pillar / cart / cow, river and
  bot-plan suites run once per bike (`describe.each`) against floors from the table above. Bike-specific: the Ton-Up
  kicker roll clears at full speed and is wet 10 px/s slower; the Sundowner's pair by two hops; the Ton-Up's plan crashes
  without levelling; a flat-hop flip is impossible on all three at any release point. Progress: per-bike keys, medals per
  bike, migration (used, copied, legacy kept, never for other bikes, own record wins, malformed ignored, read-only and
  throwing storage). Bike art: one chassis, wheels touch the ground at the contact points, and each bike's features as
  pixels (the fairing shell above the tank line, the translucent screen, the lamp in its nose, ...).
- **Playwright: 28.** The full bot run from the title through the select screen on each bike (0 crashes, 30 / 30, gold, the
  exact measured time, record under that bike's key only, ghost, quick restart); the river pair on each bike; roster
  (migration in the browser, remembered pick, `?bike=`, each bike's top speed / hop / boost in the game); select (keys,
  mouse, CHANGE BIKE from pause and finish, separate records, round-trip leaks with `__test.leaks()`); sprites at 4× (every
  pose of every bike saved to `test-results/shots`).

### Open questions (v1.6)
- The engine sound is the same for all three bikes (only its pitch range follows the bike's top speed).
- The select screen has no touch controls beyond tapping a card twice or RIDE; riding still needs a keyboard.
- The Sundowner's one-hop line over the paired canals (91 ms) is the tightest window in the game; its two-hop line is
  not hinted anywhere in the stage.

## v1.7: the one-minute stage (900 columns, tutorial, Temple Steps, records version 2)

Asked for: a stage of about a minute, an opening that teaches the controls, a breather, and something new before the
river. The layout was designed and measured in a headless simulator first (the real physics and level modules, a port
of the Game ride loop and of the e2e bot), approved with six decisions, and built exactly as measured. Nothing moved
during the build: every number below is the proposal's.

The six approved decisions: (1) the warm-up is a no-crash zone; (2) risers are 1-column dry slots with a higher far
bank, with no change to the physics; (3) the boulder is announced by a rumble and a "!"; (4) ghosts are kept up to
180 s; (5) bronze is the bot's time × 2.2 (gold × 1.05, silver × 1.25, rounded up to whole seconds); (6) the incidental
flip spots stay. Decided earlier: the tutorial prompts show until one full run is finished; records are version 2 and
the old ones are archived, not migrated.

### Level
1. **Three new sections, the old ones untouched.** Warm-up Road (0–119) in front, Ruins Road (420–503) after the
   Boulder Field, Temple Steps (724–839) before the river. Bazaar Street to the Boulder Field moved right by 120
   columns, the Mandapa Run and the Hemakuta Rocks by 204, the river by 320, column for column: every v1.6 number for
   those sections (canal, pillar, cart, cow, kicker, flip and river windows) is the same, and the unit tests still
   assert the same floors. Section ids are now 0–9.
2. **Risers are gaps.** `riser hK` is a 1-column gap with `step: true` whose far bank is one tile up. `BikePhysics.ts`
   is unchanged: a hop that lands on the upper step clears it, anything else meets the far wall. The terrain view
   draws the slot as stone (no water), the scene skips its water glints, and a crash there throws sparks, not a splash.
3. **The slot has a floor (scene rule, same outcomes).** Rolled into slowly, a bike used to drop through the drawn
   stone to the kill plane (40 px on the third riser) before crashing. The Game scene now crashes it as `wall` as soon
   as it is more than `wallTolerance` below the near bank while over a slot. This cannot change who crashes: a bike in
   that state is falling (a hop or a coyote hop starts at most 2.2 px below the bank), and can only leave the slot
   through the far wall, 16 px higher, or the kill plane. The unit tests keep the two apart: the riser windows and
   roll-fails are measured on the bare physics, the "never sinks" test on the full ride loop.
4. **Twelve checkpoints.** New: cp3 inside the canal run (104 px before the widest canal; 72 px before the paired
   canals was tried in the simulator and rejected, the Ton-Up has no window from rest there), cp6 on Ruins Road, cp9 at
   the foot of the steps, cp10 on the terrace 7 columns before the boulder's trigger. The longest leg between two
   checkpoints is 9.9 s (the Sundowner's warm-up). A checkpoint without a hint now clears the hint showing, so
   "HOP UP THE STEPS!" is gone by the terrace, where the thing to read is the boulder's "!".
5. **56 diyas:** the old 30, 10 on the Warm-up Road, 10 on Ruins Road, 6 on the Temple Steps. All 20 of the first two
   groups are on the plain riding line (throttle only collects them, bar the one over the log).
6. **`?cp=N` goes to 11**, clamped to the last checkpoint whatever the number.

### Entities and rules
7. **Boulder: a pure state machine** (`src/level/boulder.ts`): hidden → roll → gone. It starts on the step the bike's
   x reaches 16·781, moves `80/120` px per fixed step from x = 16·811, and is gone when its left edge reaches 16·771
   (960 or 961 steps, by the rounding of ⅔ px). Nothing in it reads a clock or a random number. The scene checks the
   collision before it steps the boulder (as in the simulator). While the bike is crashed it cannot start, but one
   already rolling rolls on; a respawn at a checkpoint before the trigger puts it back in its doorway. The view
   (`src/entities/Boulder.ts`) adds the turning rock, a puff of dust every 5 steps, chips and dust at the break-up, and
   the "!": at the right edge of the screen while the rock is off it, then above the rock for half a second.
8. **The hitbox is smaller than the rock** (16 × 14 under a 22 px disc), as approved: a near miss is a miss.
9. **Log: one stumble per contact.** The scene stumbles the bike (speed × 0.4, as a monkey does) on the step its box
   first touches the log's, and not again until it has left it. `Obstacle.solid` is false for a log, so it is not in the
   list of boxes that crash. Its art (20 × 10) is a little wider than its 16 × 8 box.
10. **Warm-up no-crash rule, by take-off.** `wobbleLanding` (pure, in `BikePhysics.ts`) turns a landing that `step` has
    just judged a crash into an upright bike with 40% of its forward speed, when the last grounded x was left of
    column 120. So the last hop of the warm-up is covered even though it comes down in Bazaar Street, and the first hop
    past the line is not. There is no gap and nothing solid in the zone, so a landing is the only crash it could have:
    1000 runs of random input per bike never crash (without the rule, all of them do). C still works.
11. **Tutorial.** Four prompts by bike column (0–23, 24–39, 46–75, 78–99), drawn by the HUD as steady cream text on a
    dim ink plate with a yellow rule under it, below the blinking checkpoint hint. Shown while `tutorialDone` is false;
    set on the first ranked finish (a practice finish does not count), saved in the prefs, with a copy in memory for
    the session (the same pattern as the bests), so a browser that blocks storage shows the prompts on every visit but
    not twice in one. The warm-up's rules do not depend on the prompts.
12. **Medals from a formula.** `bikes.ts` holds the measured bot runs (`BOT_RUN_MS`) and `medalsFor(bot)`: gold ×1.05,
    silver ×1.25, bronze ×2.2, each rounded up to a whole second. The e2e bot run asserts `BOT_RUN_MS` to the
    millisecond, so the table cannot drift from the game.
13. **Records version 2, no migration.** Keys are `hampi-at-dusk.best.v2.<bike>`; a record also carries `v: 2` and
    `stage: 900` and is ignored if either differs. The four old keys are never read, written or removed
    (`ARCHIVED_BEST_KEYS` exists only so tests can check that). The v1.6 Daybreak migration is deleted: those runs were
    on another stage.
14. **Ghost cap 180 s** (3600 samples, about 25 kB at most), so every bronze run (up to 153 s) keeps its ghost.

### Bot and tests
15. **Planner** (`tests/shared/plan.ts`): the kicker's tank is found by its flag (it used to be "the last gap"); risers
    and the log are hazards like canals and pillars; the boulder is one more hazard standing where a bike at top speed
    meets it (`trigger + 488·v/(v + 80)`). 22 hops on every bike; the Ton-Up still needs the interval planner.
16. **A headless port of the ride loop** (`tests/shared/sim.ts`) built from the same pure modules the scene uses. The
    unit tests ride the bot's plan in it and get 49.908 / 59.517 / 69.150 s; the e2e bot gets the same in the real
    game, which is what keeps the port honest.
17. **Milestones as committed:** M1 the stage, the entities, the rules and the tutorial (they share `Game.ts`); M2
    records version 2 and the ghost cap; M3 art, screenshots and docs.
18. **Existing specs that had to change:** the audio spec rode into the cow for its crash sound, which is now 11 s of
    throttle away behind a no-crash zone, so it rides until it has crashed; the roster spec's hop and boost measurement
    was moved clear of the log; checkpoint numbers (river cp6 → cp11, rocks cp5 → cp8, pavilion cp2 → cp4).

### Art (all in the 6.1 palette; the background is unchanged)
19. **Temple Steps in dressed stone:** from two columns before the first riser to two past the last drop the terrain is
    courses of cut blocks with a pale worn lip, no moss. A riser's slot is the lower step's stone in shadow.
20. **Boulder frames:** a rotated 22 px sprite grew fringes at 45°, so the rock is two textures (as drawn, and an
    eighth of a turn on, made by turning only the marks inside a clean outline) shown at quarter turns: eight crisp
    frames per revolution.
21. **Boost strip:** orange chevrons on the road under the "HOLD SHIFT - BOOST" prompt (the meter's colour).
22. **Decoration** in the colonnade's dark tone, behind everything: two kinds of ruins along Ruins Road, and the temple
    doorway on the terrace where the boulder starts. The birds-to-bats change and the firefly zones moved with their
    sections.

### Measured (v1.7; unit tests and e2e)

| | Ton-Up | Daybreak | Sundowner |
|---|---|---|---|
| Bot run (22 hops, boost only at the river) | **49.908 s**, interval planner | **59.517 s**, centred planner | **69.150 s**, centred planner |
| Crashes / diyas / medal | 0 / 56 / gold (53 s) | 0 / 56 / gold (63 s) | 0 / 56 / gold (73 s) |
| Legs between checkpoints (s) | 7.5 3.3 2.8 1.7 4.4 4.6 4.7 6.1 6.3 2.7 3.8 2.0 | 8.8 4.0 3.3 2.0 5.3 5.5 5.6 7.3 7.6 3.2 4.5 2.4 | 9.9 4.7 3.9 2.4 6.3 6.4 6.6 8.7 8.8 3.8 5.3 2.5 |
| Worst landing in the bot run (limit) | 12.2° (25°) | 10.9° (35°) | 23.9° (45°) |
| Bot plan with every hop ±8 px | all 56, no crash | all 56, no crash | all 56, no crash |
| Bot plan with no tilt input at all | crashes on landing at x≈3520 | finishes, 56/56 | finishes, 56/56 |
| Boost meter at the line | 0.50 | 0.35 | 0.57 |
| Canal hop windows, in column order | 443, 365, 309, 240, (31), 406 ms | 540, 527, 406, 198, 135, 398 ms | 561, 483, 404, 145, 228, 326 ms |
| Paired canals in one hop / in two | 240 ms / not possible | 198 ms / not possible | 91 ms / 145 ms |
| Any canal or riser rolled, 10 px/s to boost speed | never | never | never |
| Log / pillar / cart / cow hop window | 542 / 347 / 172 / 321 ms | 575 / 375 / 225 / 375 ms | 542 / 321 / 169 / 331 ms |
| **Riser** hop windows (1, 2, 3) | 615, 615, 625 ms | 673, 673, 673 ms | 659, 659, 659 ms |
| Riser 1 at 40 / 80 / 120 / 160 px/s | 288 / 488 / 554 / 584 ms | 350 / 544 / 608 / 644 ms | 363 / 550 / 613 / 647 ms |
| Chained risers: least window left for the next | 242 ms | 358 ms | 558 ms |
| **Boulder** hop window: standing / from 60 px/s / top speed / boost | 125 / 367 / 517 / 550 ms | 192 / 408 / 567 / 600 ms | 192 / 400 / 550 / 600 ms |
| Boulder: from its start to the bike reaching it, flat out | 1.30 s | 1.50 s | 1.69 s |
| From rest, one hop: cp3 canal / cp9 riser / cp10 boulder | 233 / 483 / 517 ms | 258 / 533 / 567 ms | 292 / 600 / 550 ms |
| Kicker: rolled at top speed | clears by 8.4 px | water | water |
| Kicker: hop window (landing ≥ 16 px clear) | 300 ms (241 ms) | 271 ms (271 ms) | 311 ms (257 ms) |
| River, no boost: short by | 28.8 px | 64.6 px | 88.2 px |
| River, boost from cp11 at rest: margin, meter left | **93.2 px**, 0.09 | **34.4 px**, 0.08 | **25.0 px**, 0.55 |
| Bonus ramp: backflip lands from (of 220 px of take-off) / longest stretch | 204 px / 556 ms | 216 px / 650 ms | 108 px / 520 ms |
| Bonus ramp rolled at every speed: crashes / worst landing | 0 / 13.8° | 0 / 14.6° | 0 / 15.3° |
| Bonus ramp: one hop anywhere, no tilt | 53 of 125 crash (see below) | 0 of 125 | 0 of 125 |
| Stairs down: rolled at every speed / one hop anywhere, no tilt | 0 crashes, 5.7° / 0 of 104 | 0 crashes, 8.2° / 0 of 104 | 0 crashes, 4.0° / 0 of 104 |
| Warm-up to column 120: throttle only / the bot | 7.63 / 7.34 s | 8.86 / 8.59 s | 9.86 / 9.69 s |
| Warm-up, 1000 runs of random input: crashes / wobbles / log stumbles | 0 / 6691 / 646 | 0 / 6448 / 659 | 0 / 4338 / 621 |
| The same without the rule (200 runs) | 200 crash | 200 crash | 199 crash |
| Camera in the bot run: bike screen x | 146–174 | 150–177 | 150–167 |
| Stored ghost of the bot run | 7.0 kB | 8.3 kB | 9.7 kB |

Medals (seconds, inclusive):

| | Bot run | Gold (×1.05) | Silver (×1.25) | Bronze (×2.2) |
|---|---|---|---|---|
| Ton-Up | 49.908 | 53 | 63 | 110 |
| Daybreak | 59.517 | 63 | 75 | 131 |
| Sundowner | 69.150 | 73 | 87 | 153 |

Notes on the table:
- **Under 120 ms:** only the two windows accepted in v1.6, both unchanged: the Ton-Up's own hop over the second paired
  canal ((31 ms): it takes the pair in one hop, 240 ms) and the Sundowner's one-hop line over the pair (91 ms; its
  two-hop line is 145 ms). The tightest new window is the Ton-Up hopping the boulder from a standstill, 125 ms; from any
  rolling start it is 367 ms or more.
- **145, not 142:** the Sundowner's fourth canal and two-hop windows read 142 ms in v1.6. The sweep is in 0.5 px
  samples (2.5 ms at 204 px/s) and the canals are 1920 px further right, where the step positions round differently:
  one sample. Same physics.
- **53 of 125 on the Ton-Up:** all of them are a flat-ground hop taken before the bonus ramp that comes down on its
  18° up-slope without levelling: more than the Ton-Up's 25° band, exactly as on the Boulder Field's ramps. A hop
  taken on the ramp or its top never crashes on any bike, and rolling over it never does.
- **Flip spots** (decision 6, kept): besides the kicker and the bonus ramp, a hop with a held tilt can come round on
  the Boulder Field's ramps and the rollers as before, and now on the warm-up roller on the Ton-Up and the Daybreak.
  None is needed, none is hinted, and none happens without holding the key.

### Tests (v1.7)
- **Vitest: 263** (physics 228, progress 22, bike art 13). New suites, each once per bike: Warm-up Road (log, throttle
  only, roller rolled at every speed, the fuzz, the rule by take-off), Ruins Road (rolled at every speed, diyas on the
  rolling line, hop anywhere), the risers (windows, roll-fails at every speed, low-speed windows, chains, the slot's
  floor, the stairs down), the boulder (windows, warning time, the plan's meeting point, no trigger short of the line),
  standing starts at cp3 / cp9 / cp10, the bonus-ramp flip; once: the stage size and layout, the prompts, the boulder's
  state machine, `stumble` and `wobbleLanding`, the medal formula. Progress: version 2 keys, the archive (a store that
  records every access), `tutorialDone`, the ghost cap.
- **Playwright: 34.** The bot run per bike (exact time, 56 / 56, 0 crashes, gold, the prompts on the first run and none
  after, a v1.6 player's storage in place and unchanged); tutorial (2); boulder (3); the archive; the bonus-ramp flip;
  and the v1.6 specs on the new checkpoint numbers.

### Open questions (v1.7)
- At boost speed the boulder's warning is shorter than at top speed (0.96 s on the Ton-Up, boosting from the trigger);
  the hop window there is still 550 ms.
- The Ton-Up from a standstill has 125 ms to hop the boulder; a rider who stops on the terrace to wait for it is
  better off rolling.
- The tutorial has no prompt for H (the horn), C or R; the title's key hint still lists them.
- The engine sound and the touch controls are as in v1.6.

## Working agreement (from v1.6.3)
- Fable is used only for Fable-level work: level design, physics/tuning, large builds, hard bugs. Effort per task: medium for small follow-ups, high for design and big builds (user-approved).
- Opus handles everything else directly: small art/text/number tweaks, docs, verification, publishing, commits.
- Feedback is batched into as few Fable rounds as possible; small changes run targeted tests, with a full `npm test` before each push.

## v1.6.4 (Opus, small fixes from the play-test)
- Ton-Up tagline is now "THE CAFE RACER. FAST AND SHARP." (user trimmed "LAND IT STRAIGHT"; the length test allows up to 50 chars, which fit the select screen at 4x).
- Sundowner hands: the glove and grip were near-black and vanished against the dark bars, so the arm seemed to stop short of the handlebar. The glove is now brown leather and the grip a visible dark grey that joins the riser.
- Music plays on the menus only (title, bike select, finish). Game.create() calls setMusicInRun(true) and the menu scenes setMusicInRun(false); the bus fades out/in, the song resumes where it left off, M still works, and a crash duck cannot bring the music back during a run. The audio e2e now checks silence in a run (peak 0.000) and music back on the title (peak ~0.045).

## v1.6.5 (Opus): renamed to "Open Roads: India"
- The user renamed the game for the planned multi-region road trip (Ladakh, Goa). Hampi at Dusk is now Stage 1.
- Changed: title screen logo ("OPEN ROADS: INDIA", subtitle "STAGE 1: HAMPI AT DUSK"), page title, README heading, GAME_SPEC heading and title-screen line.
- Deliberately unchanged: the folder and branch name `hampi-at-dusk`, the package name, and the saved-record keys (`hampi-at-dusk.*`), so existing best times, ghosts and settings carry over. These can be renamed later with a migration.

## v1.8 — HD look, round 1 (Hampi)

Asked for: bring Stage 1 up to the look of the "Hampi HD" concept frame, as a reusable look system that Ladakh and Goa
can plug into. Art only: no physics, level geometry, hitbox, entity position, timing, `CONFIG`, `bikes.ts` or medal
change. The bot's three runs are still 49 908, 59 517 and 69 150 ms.

### The user's choices (from the concept sheet)
1. **Glow: subtle**, not medium. The theme's `glow` and `haze` are both 0.5 (the "subtle" panel of the comparison).
   The sun's bloom is a step smaller again than that panel (outer ring radius 62, strength 0.65 × glow).
2. **Teal: river mist only.** Teal is in the background river, the water in the road, and the mist over both. The sky
   runs purple to gold, the haze between the layers is warm (gold over mauve), and nothing else is teal. A unit test
   holds this: no teal pixel in the sky, on the far hills, in the temple town, on the ruins or in the near foliage.
3. **The road stays the dirt road:** the same 16 px ground tile, lit lip and 2 px grass line as before, in the same
   colours. Added: ruts, pebbles, thin grass tufts (at most 4 px tall), a soft darker band under the lip, dithered
   instead of hard steps where it darkens with depth, and a faint warm rim on the grass line. No masonry, no pale cap.
4. **No mound.** The concept's lit grey dome by the road is not in the game, and the middle layer's round boulder
   piles and boulder stacks (there since v1.2) are gone too: Hampi's boulders are now only on the two far layers,
   hazy and clearly distant. On the near bank there are only dark ruins, palms, trees and banana clumps.
5. **Palms redrawn** as coconut palms: fronds spring up and out from the crown and arch over at the tips, each a
   midrib with a comb of short leaflets (gaps between them, every other one shorter). No webbed "wing".
6. **One pixel size.** Everything is drawn at 480 × 270. The old halo texture was drawn in 2 px cells; the new one is not.

### The look system (`src/art/look/`, 839 lines) and the stage theme (`src/art/themes/hampi.ts`, 252 lines)
- `pix.ts` (241): `Pix`, a plain RGBA buffer that the pixel `Pen` draws on (wraps sideways for tiling layers), and
  the passes: `skyBands`, `haze`, `wisps`, `rimLight`, `bloom`, `stars`, `strata`, `fade`, `keyline`, `ridge`.
- `silhouettes.ts` (205): rock, boulders on a ridge, boulder hill, gopuram, mandapa, ruined arch, coconut palm,
  banana clump, tree, vine, grass tuft. Flat shapes; colours are arguments.
- `ground.ts` (116): `roadColumn`, `grassLine`, `waterColumn`, `roadDetail`, driven by a `GroundKit`.
- `theme.ts` (69): the `StageTheme` interface and the active theme.
- `bake.ts` (139): bakes a theme into textures at boot: layers, landmark, halo, light pool, mist band, mist wisp,
  sun glitter, and a keyline texture for any sprite; `keyUnder` / `followKey` place one under a sprite.
- `Atmosphere.ts` (69): the only moving parts: the mist band, the sun's reflection, mist wisps over water in the road.
- `placeholders.ts` lost its four layer painters and their helpers (958 → 547 lines); the entity sprites stay there.

**The theme interface** (`StageTheme`): `id`; `glow`, `haze` (0 = none, 0.5 = subtle, 1 = medium); `ink`; `lamp`
(lamp-light colour); `sun` (position and scroll factor in its layer, where and in what colours it reflects);
`layers[]` (`key`, `scroll`, `depth`, `paint(pix)`), back to front; `ground` (`soil`, `grass`, `rim`, `shade`,
`under`, densities of `tufts` / `pebbles` / `ruts` per 100 px, `water` colours); `mist` (`colours`, the drifting
`band` over the background water, `overWater`); `lamps` and `smoke` (where the shared ambience attaches);
`landmark` (a texture that stands on a layer at the end of the stage). A new stage writes its painters from the kit,
fills this in, and calls `setTheme`.

### Decisions made while building
1. **Pixel buffers, not Graphics.** Haze, rim light and bloom are per-pixel passes that need to read what is already
   drawn, so the layers are painted into typed arrays and put on canvas textures in one call each. It is pure, so the
   theme is unit-tested in Node. Cost: about 0.2 s more at boot; nothing per frame.
2. **A fifth parallax layer**, the far hills at scroll 0.1, between the sky and the skyline. Depth comes from four
   things together: each layer's colours faded toward the air colour by its distance, a dithered haze over the feet of
   the layer behind, rim light on the layer's own edges, and the parallax itself.
3. **The river is the bottom of the skyline layer** (below y 202), and the middle layer's ground was lowered from about
   y 210 to about y 217 so a strip of river shows above the road. The band of mist and the sun's reflection sit on it.
4. **Light from the right.** The sun stays where it was in the sky layer (x 360: clear of the title text, on screen
   for the first half of the stage), so rim light is on right-facing and upward edges. After the sun has left the
   screen the light still comes from ahead of the rider.
5. **Readability before glow.** Halos are additive and small, so on a bright background they nearly vanish; what makes
   things read is a one-pixel dark keyline drawn under the diya (with a white sparkle), the fallen pillars, the cart,
   the log, the cow and the monkeys. The boulder already had its outline. These are separate images under the sprites,
   so the manifest sizes and the hitboxes are untouched.
6. **Water in the road** changed colour: dusk water with a teal cast under a pale mint line, with mist wisps, instead
   of purple under an orange line. It is the one hazard whose colours changed; against the brown road it reads at
   least as clearly. The animated orange glints and the splash are as they were.
7. **The Temple Steps are still dressed stone** with a pale worn lip, as in v1.7. That is the level's, not the theme's.
8. **Decoration on the road** (colonnade, ruins, temple doorway, gateway, checkpoint lamps) is unchanged.
9. **PNG overrides** work as before; `bg_far.png` is a new optional name. The chariot and the halo are now painted by
   the theme, so they are no longer in the placeholder list.

### Measured
- Unit tests 276 (263 + 13 in `tests/unit/look.test.ts`); e2e 34, all as before: no test asserted the old art, so none
  was changed. Bot runs: Ton-Up 49 908 ms, Daybreak 59 517 ms, Sundowner 69 150 ms (identical).
- Frame cost with the game stepped by hand in headless Chromium (one frame = two fixed steps and a draw): canvas
  renderer about 1.45 → 1.85 ms, WebGL (script side only) about 0.5 → 0.75 ms. Budget at 60 fps: 16.7 ms.
- Boot: about +0.2 s. Bundle: 1 598 → 1 611 kB (gzip 382 → 388 kB).
- `npx playwright test -c playwright.look.config.ts --trace off` (not part of `npm test`) rides the stage with the bot
  and saves 30 fixed moments to `test-results/look/` for judging the look by eye; `LOOK_RENDERER=webgl` for WebGL.

### Open questions (v1.8)
- The decoration that stands on the road (colonnade, ruins, doorway, gateway) and the entity sprites are not relit;
  they sit a little flatter than the background now.
- The ambience's firefly zones and the birds-to-bats change are still Hampi constants in `Ambience.ts`, not in the theme.
- `HOW_TO_BUILD.md` still describes the old look in its prompts for optional PNG art.
- Round 2 candidates: rim light on sprites, lit windows that flicker, reflections of the far bank in the river.
