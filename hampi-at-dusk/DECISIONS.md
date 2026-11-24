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

## Attribution
- Commits made by Fable carry a `Co-Authored-By: Claude Fable 5.2` trailer, which names the model that actually wrote them. Commits made by the coordinator carry the Opus trailer.
