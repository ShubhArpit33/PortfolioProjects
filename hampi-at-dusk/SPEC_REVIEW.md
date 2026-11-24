# GAME_SPEC.md review: Hampi at Dusk

The spec is not buildable in one go as written: three blockers would each sink acceptance. All figures below are closed-form arithmetic (no simulation was run), and nothing was edited.

**Blockers**
- **Far bank height:** read literally, the far river bank is at h4, which makes the river jump impossible even with boost.
- **Airborne rule:** the "more than 1 px above" rule never launches the bike off any ramp lip at 120 Hz.
- **Hop off the river ramp:** a plain hop at the lip clears the river without boost, defeating criterion 4.

## (a) Guess-list

**Bike and collision**
1. No bike hitbox is given, and it is not stated which point `x, y` is (wheel contact, centre) or whether the box rotates.
2. Diya radius 10 px is measured from an undefined point, and it is unclear whether diya `x`/`h` mean cell centre or corner.
3. Landing on top of a pillar or cart is not covered (crash or ride?).
4. Obstacle and cow boxes are not anchored (left column assumed) and the monkey hitbox is missing.

**Terrain and airborne/landing**
5. `surfaceY` could be per-column steps or continuous piecewise-linear.
6. The "1 px above" airborne rule is step-rate dependent (see b3).
7. Nothing says what happens when the bike is below the surface as it re-enters a solid column at a gap's far wall (crash, snap up, tolerance).
8. Far-bank height after the river is unstated (see b1).
9. The integrator is unspecified; Euler variants differ by about 1 px of apex.
10. Angle sign convention, wrap-around, and the "ease toward slope" rate are undefined.
11. Micro-airs at convex corners may or may not trigger "CLEAN!" and the boost bonus.
12. "Small bounce" on landing is undefined.

**Controls and boost**
13. Boost may or may not need throttle, work in the air, or add to `accel`.
14. Behaviour when the meter empties above `topSpeed` is undefined (instant clamp or decay).
15. Initial meter value and regen-while-boosting are unstated.
16. Whether hop works on slopes, and whether coyote time applies off the river lip.
17. It is unclear whether R counts as a crash, and M (mute) is missing from the controls table.
18. Whether `v` can go negative on an upslope ("no reverse").

**Entities**
19. Cow: solid below 60 px/s or not, which way and how fast it ambles off, and whether it resets on respawn.
20. "Never harmed, bike only stops or stumbles" reads as contradicting "cow above 60 px/s = crash".
21. Monkeys: spawn point, speed, whether they stop at x172–176, and whether honk range is from bike to monkey.
22. Checkpoint trigger and respawn point are undefined, as is whether diyas, cow and monkeys persist after respawn.
23. Finish: what the bike does afterwards and where the world ends.

**Timer, camera, tests**
24. Timer start and stop are undefined, as is whether "within 120 s" means game time or wall time.
25. `cameraLerp 0.1` has no unit (per frame or per second) and the bike's screen position is not given.
26. "Timing window" in criterion 6 has no definition.
27. `__test` is exposed "in dev and test builds", but which build Playwright serves is not stated.
28. No unit-test runner is named.

**Text and art**
29. Section 8 says "style taken from the reference"; there is no reference.
30. "Use only these colours" has no brown, white or skin tone for cow, monkey, jacket or flame.
31. The header says "45–60 s clean run", but 5760 px at 240 px/s is 24 s.
32. ⭐, arrows, "…" and "—" are probably not in Press Start 2P (not checked).

## (b) Arithmetic

Assumed model: the bike point is the wheel-contact midpoint, the hitbox is an unrotated box W wide × 16 tall sitting on that point, a diya is a radius-10 circle at its cell centre overlapping that box, and motion is ballistic.

**1. Column sums (5.1)**
- Section 2: 8+3+8+4+8+5+6+3+3+3+8+6+15 = 80. Correct.
- Section 4: 6+6+5+4+6+8+6+0+10+5+5+19 = 80. Correct.
- Section 5: 20+8+12+20 = 60. Correct.
- The listed gap columns are correct.
- After `ramp 8 +4` the "current height" is h4, so the far bank is at h4 by the spec's own rule. The boosted flight back to launch height is 2·152.1/700 = 0.435 s, or 132 px, against a 192 px gap. That is impossible; the bank must be declared h0.

**2. Canal gaps (criterion 5)**
- Hop air time is 2·260/700 = 0.743 s, so range at 240 px/s is 178 px. The largest gap is 96 px, so every gap clears.
- The paired gaps at columns 102–110 span 144 px and clear in one hop, with a 34 px (143 ms) take-off window.
- Rolling in: the bike falls 8 px to the kill plane in 0.151 s, or 36 px, which is less than the smallest gap (48 px). It dies at top speed.
- At boost speed 340 it travels 51 px in that time and has dropped only 7 px at the far edge of a 3-tile gap. Without a far-wall rule it rolls across. A rule of "more than 4 px below the lip = crash" holds up to about 449 px/s.

**3. The "1 px" airborne rule**
- At 120 Hz the bike moves 2 px per step. Off the `ramp 6 +2` lip the separation is 0.63 − 0.02 = 0.61 px, off `ramp 8 +3` it is 0.68 px, and at the +1/−1 peak 0.76 px.
- All are under 1 px, so the bike snaps to the surface and never launches off any lip onto ground at top speed. It only goes airborne over gaps and the cliff.
- The flat-to-`ramp 4 −2` corner gives 0.976 px, a knife edge. A threshold near 0.25 px is needed, plus a minimum airtime before "CLEAN!" counts.

**4. Pillars and cart (criterion 6)**

Window = time above the obstacle height − (48 + W)/240.

| Hop velocity | Obstacle | Time above | W = 40 | W = 28 | W = 24 |
|---|---|---|---|---|---|
| 260 | Pillar (16 px) | 607 ms | 240 ms | 290 ms | 307 ms |
| 260 | Cart (32 px) | 431 ms | 64 ms | 115 ms | 131 ms |
| 280 | Cart (32 px) | 524 ms | 157 ms | 207 ms | 224 ms |

- The earlier "about 64 ms" cart figure is confirmed, but only for a 40 px sprite-wide hitbox. At W = 24 the cart passes at 131 ms, which is too thin against 8–17 ms input quantisation.
- Recommendation: both `hopVelocity` 280 and W = 24. Apex becomes 56 px and range 192 px.
- With 280, a hop over pillar x184 then the cart x198 is feasible (for example take off at 2850, land 3042, take off again at 3090).
- The cow (24 px tall, 32 wide) has a 293 ms window at 260.

**5. River (criterion 4), far bank h0**

The lip is 64 px above the bank, the ramp is 26.57°, and slope drag is 700·0.447·0.5 = 156.5, under `accel` 160, so 240 is held on the ramp.

| Case | Flight time | Distance | Result against 192 px gap |
|---|---|---|---|
| 240, no boost | 0.608 s | 130 px | 62 px short, lands in water |
| 340 boost | 0.697 s | 211.9 px | 19.9 px past the edge, 3.9 px over the 1-tile requirement |
| 360 boost | 0.716 s | 230.4 px | 38 px past the edge, 22 px over the requirement |
| 240, no boost, hop at lip | 1.20 s | 258 px | clears the river |

- The earlier "about 4 px margin" claim is confirmed, and `boostSpeed` 360 fixes it.
- The hop-at-lip case is a new finding: boost is not needed. With `hopVelocity` 280 it gets worse. Gap width cannot fix this, because boost without hop (212–230 px) is shorter than hop without boost (258 px). The river ramp needs a no-hop rule.
- Boost budget from cp4 at rest, at 360: 0.72 s to reach speed plus 0.77 s cruise is 1.49 s, against 1.67 s of meter. The bot must not waste any boost before the lip.

**6. Diyas (17)**

Box 24×16, radius 10, so the box bottom must be between 26 px below and 10 px above the diya centre. Reachable under this model:
- **x18, x22, x26 (h1):** 16 px above ground, collected by riding through.
- **x69, x80, x93, x121 (h3):** collected on the gap hop.
- **x103 and x109:** both collected in one hop if the apex is within ±17 px of x = 1704 at 260 (±24 px at 280).
- **x157, x213:** collected on the pillar hop.
- **x199 (h4, 64 px):** at 260 the box top reaches 64.3 px, which is marginal; at 280 it is comfortable across the whole cart window.
- **x234, x258:** 16 px above their plateaus, collected by riding or landing.
- **x264:** 56 px past the cliff the bike has dropped 19 px, so the box just overlaps. The bike must not hop here.
- **x276:** 32 px above the peak. Natural lift is 1.6 px, a 0.4 px miss, so a hop on the up-ramp is required.
- **x332 (h5):** the boosted arc is 16–19 px above the lip at that point, so it is collected.

Under a point-distance model (10 px from the contact point), x18–26, x199, x264 and x276 are unreachable or fragile, so the model must be specified.

## (c) Build risks

- **Phaser version:** "latest 3.x" is unsafe if `npm i phaser` now resolves to v4 (not checked). Pin 3.90.0.
- **Test runners:** Playwright's default match also picks up `physics.test.ts`. Split unit tests (Vitest) from e2e and say what `npm test` runs. `npx playwright install chromium` needs network.
- **Determinism:** inputs sent by `page.evaluate` on wall-clock time, plus an accumulator fed by frame time, will make the bot run and the window test flaky. Add manual stepping hooks and measure windows in pure-physics unit tests.
- **Zero console warnings:** headless software GL can emit SwiftShader and ReadPixels warnings (not checked on this Chromium), and Phaser's own AudioContext warns before a user gesture. `__test.setInput` is not a gesture.
- **60 fps:** it cannot be asserted under headless software GL. Make it a manual check and never assert it in CI.
- **Texture size:** the terrain is 5760 px wide, larger than a 4096 px texture limit. Bake it in chunks, and do not redraw Graphics every frame.
- **Font:** wait for the font to load before creating text and before screenshots. Use ASCII only and drawn star icons.
- **Camera lerp:** a per-frame lerp is frame-rate dependent.
- **Page scrolling:** Space and arrow keys scroll the page unless captured.
- **Time limit:** a slow CI machine can exceed 120 s of wall time even when game time is fine.
- **Mid-air screenshot:** it needs the manual stepping hook.

## (d) Proposed edits to GAME_SPEC.md

1. **Section 1 — replace the Engine row:** "Phaser 3, pinned `phaser@3.90.0` (not v4). Config: `banner: false`, `audio: { noAudio: true }`, `type: Phaser.CANVAS` when `?renderer=canvas` (used by tests), else AUTO."
2. **Section 1 — replace the Tests row:** "Vitest for `tests/unit/*.test.ts` (pure physics); Playwright (Chromium only) for `tests/e2e/*.spec.ts`, served by `vite --mode test`. `npm test` = `vitest run && playwright test`."
3. **Section 1 — add to the Timestep row:** "Accumulator capped at 0.1 s per frame. Integrator: `vy += g·dt; x += vx·dt; y += vy·dt`."
4. **Section 2 — replace the Space row:** "Hop (ground only; 80 ms coyote time, 100 ms buffer; works on slopes; disabled on `noHop` segments, including coyote time off them)."
5. **Section 2 — replace the Shift row:** "Boost: while held, meter > 0 and grounded, acceleration is `boostAccel` (replaces `accel`, no throttle needed) and the cap is `boostSpeed`. No regen while held. When it ends, speed above `topSpeed` decays at `brake` rate. The meter starts full. No effect in the air."
6. **Section 2 — add rows:** "M | Mute" and, on the R row, "counts as a crash; the timer keeps running". Add: "Speed along the slope is clamped to ≥ 0 (no rolling back)."
7. **Section 3 — replace:** `boostSpeed: 360`, `hopVelocity: 280`. Add: `bikeHitW: 24, bikeHitH: 16, diyaRadius: 10, airborneEps: 0.25, wallTolerance: 4, minAirMsForLanding: 120, angleEaseDegPerSec: 720, cowCrashSpeed: 60`.
8. **Section 4 — add after the bike state:** "`(x, y)` is the wheel-contact midpoint. The hitbox is an unrotated AABB `bikeHitW × bikeHitH`, bottom-centre at `(x, y)`. `surfaceY` is continuous piecewise-linear (ramps interpolate; columns do not step). Angles: positive = nose up or uphill; differences are normalised to [−180, 180]."
9. **Section 4 step 3 — replace "more than 1 px above":** "more than `airborneEps` (0.25 px) above the surface, or the surface is `null`".
10. **Section 4 Landing — add:** "Airtime under `minAirMsForLanding`: silent re-attach, with no angle check, popup or bonus. Along-slope speed = `vx·cos θ − vy·sin θ`, clamped to ≥ 0. No bounce in physics (visual squash only). Gap far wall: on entering a solid column with `y > surfaceY + wallTolerance`, crash (sparks); otherwise snap up. Water: `y > 230` over a gap."
11. **Section 4 Crash triggers — replace:** "bad landing; bike AABB overlapping a pillar or cart AABB on any side, including the top; overlapping the cow at speed above `cowCrashSpeed` (below that the cow is solid, the bike stops, and the cow is unaffected either way); gap wall; water."
12. **Section 4 — add:** "Respawn: at `x = 16·cpCol + 8` on the surface. Collected diyas persist; the cow and monkeys reset if they are ahead of the checkpoint. A checkpoint activates when bike x reaches its x. Camera: `scrollX = clamp(x + cameraLookAhead − 240, 0, 5280)`, smoothed by `1 − (1 − cameraLerp)^(dt·60)`."
13. **Section 5.1 row 5 — replace:** "flat 20 · ramp 8 +4 **(noHop)** · **gap 12 (river)** · far bank at **h0** · flat 20". Add under the table: "After a gap the height is unchanged unless stated. The river's far bank is h0."
14. **Section 5.2 — add above the table:** "Entity x is the left column; boxes extend right and up from the surface. Diya centre = `(16·x + 8, 222 − 16·h)`. Pickup: a circle of `diyaRadius` overlapping the bike AABB."
15. **Section 5.2 Diya row — add:** "x276 needs a hop on the up-ramp; x264 is collected by rolling off the cliff without hopping." Optionally move x276 to h2 so it is collected by riding.
16. **Section 5.2 Monkey row — replace the behaviour:** "When bike x ≥ 16·168, two monkeys (12×12 hitboxes) spawn at x = 16·178 and 16·180, run left at 40 px/s to x = 16·172 and 16·174, and sit. A honk with |bike x − monkey x| ≤ `honkRange` makes them leap away and become non-collidable at once. Contact: one stumble, then that monkey leaps away."
17. **Section 5.2 Cow row — add:** "Left column 44, box 32×24. After the wait it walks right at 20 px/s for 2 s, fades out and becomes non-solid. Resets on respawn at cp0."
18. **Section 5.2 Finish row — add:** "Triggers at bike x ≥ 16·352 while not crashed; the timer stops, input is ignored and the bike auto-brakes. The world ends in an invisible wall at x = 5744."
19. **Section 6.1 — add:** "Extra neutrals allowed for characters: `#f3ead7` (cream), `#6b4a2e` (brown), `#c98a3a` (brass). Alpha blends and tints of palette colours are allowed."
20. **Section 6.2 Terrain row — add:** "Baked into textures in chunks of at most 1024 px wide; never one 5760 px texture; not redrawn per frame."
21. **Section 7 — replace the last sentence:** "Create the AudioContext only inside a real DOM `keydown`/`pointerdown` handler. `__test.setInput` never creates audio."
22. **Section 8 — replace** "(style taken from the reference)" with "(2 px UI-yellow border, 4 px notched corners, UI-ink fill)". Replace the ⭐ glyphs with "three code-drawn star icons". Add: "All text is ASCII only. Wait for `document.fonts.load('8px \"Press Start 2P\"')` before the Title scene. The timer starts on the first fixed step after Enter, pauses with Pause, and stops at the finish."
23. **Section 9.2 — replace:** "Zero console errors, and zero warnings outside the allowlist in `tests/e2e/consoleAllowlist.ts` (browser GPU/SwiftShader notices only). Tests run with `?renderer=canvas`."
24. **Section 9.3 — add:** "within 120 s of game time (`timeMs`), driven by `__test.step`."
25. **Section 9.4 — add:** "'No boost' means no boost and no hop (the ramp is `noHop`). Margin = landing x − 5440 ≥ 16. Expected with these values: about 130 px without boost (fails) and about 230 px with boost (38 px past the edge)."
26. **Section 9.5 — add:** "Also holds at `boostSpeed`, through `wallTolerance`."
27. **Section 9.6 — replace:** "In a Vitest physics test at 240 px/s on flat ground, the range of take-off x that clears each obstacle without overlap, divided by 240, is ≥ 120 ms (expected: cart about 220 ms, pillar about 370 ms)."
28. **Section 9.8 — replace:** "Manual check: 60 fps in desktop Chromium with the debug overlay. Automated: 10 000 physics steps take under 100 ms in Vitest. No fps assertion in Playwright."
29. **Section 9.1 — add hooks:** "`setManual(true)` stops rAF-driven stepping; `step(n)` runs n fixed steps and one render synchronously; `levelData`. Exposed when `import.meta.env.DEV || import.meta.env.MODE === 'test'`. All e2e tests use manual stepping."
30. **Header — replace** "about 45–60 seconds" with "about 30–45 seconds", or lengthen the stage.