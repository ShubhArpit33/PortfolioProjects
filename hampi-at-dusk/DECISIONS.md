# DECISIONS

These are the judgement calls made where `GAME_SPEC.md` (v1.1) left room for interpretation.
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

## Attribution
- Commits made by Fable carry a `Co-Authored-By: Claude Fable 5.2` trailer, which names the model that actually wrote them. Commits made by the coordinator carry the Opus trailer.
