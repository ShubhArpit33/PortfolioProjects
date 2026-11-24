# Hampi at Dusk — How to build it with Claude Code

Which model for what: **Fable** reviews the spec and fixes bugs Opus gets stuck on. **Opus** does the build and the tuning.

---

## Phase 0 — Setup (5 min)

```bash
mkdir hampi-at-dusk && cd hampi-at-dusk
git init
# copy GAME_SPEC.md into this folder
mkdir -p reference && # put 2–3 frames from the reel in here (for the mood only)
claude
```

---

## Phase 1 — Spec review with Fable (plan mode)

Type `/model` and pick Fable. Press Shift+Tab until you're in **plan mode**, then send:

```
Read GAME_SPEC.md and the images in /reference (they are mood only — do not copy anything
from them). Review the spec as a skeptical senior game developer who has to build it in one go.
1. List every place an implementer would have to guess.
2. Check the numbers: can every gap, pillar and the cart be cleared with these values?
   Does the river jump really need boost? Show the arithmetic.
3. Point out anything likely to break a one-shot build.
Propose exact edits to GAME_SPEC.md. Do not write any game code.
```

Read its list, accept the edits you agree with, and let it update `GAME_SPEC.md`. Commit:
`git add -A && git commit -m "spec reviewed"`

---

## Phase 2 — The one-shot build with Opus

Type `/model` and pick Opus. Leave plan mode, then send:

```
Build the game exactly as specified in GAME_SPEC.md. That file is the source of truth.

Working rules:
- Start with the pure physics (src/bike/BikePhysics.ts + terrain.ts) and their unit tests
  before any rendering.
- Use the placeholder-first art rule: everything drawn in code, PNGs optional.
- Record every judgement call in DECISIONS.md.
- Commit after each working milestone.

Definition of done = every item in section 9 is true. Run `npm run build` and `npm test`
repeatedly. Open the screenshots in test-results/shots/ and look at them yourself; fix
anything that looks wrong. Do not stop or ask me questions until section 9 passes —
if something is ambiguous, pick the simplest option and note it in DECISIONS.md.
```

When it says it's done, run `npm run dev` and play it.

---

## Phase 3 — Tuning (Opus, 2–3 rounds)

Play it and describe what feels off, using the config names. This cheat sheet maps feel to setting:

| It feels… | Change |
|---|---|
| Slow to get going | `accel` up |
| Floaty in the air | `gravity` up, and `hopVelocity` up a little to keep the same jump height |
| Hops too short | `hopVelocity` up |
| Landings too strict | `safeLandingAngle` up (40) |
| The camera shows too little ahead | `cameraLookAhead` up |
| The river jump is too easy or too hard | Gap width or `boostSpeed`, then re-run the river test |

Prompt template:
```
Tuning round: [your notes]. Change only config.ts (or levelData.ts if it's a level change),
then re-run npm test and make sure section 9 still passes.
```

---

## Phase 4 — Real art (optional, Gemini, then drop the files in)

Generate each image separately. Start every prompt with this style line:

> `16-bit pixel art, side view, dusk palette of deep purple #2b1a4a, magenta #6b2d6b, burnt orange #e0673a and warm gold #f4c542, crisp hard pixels, no anti-aliasing, no text`

| File | Add to the prompt |
|---|---|
| `bg_sky.png` | Wide sunset sky, huge low orange sun near the horizon, gradient bands, small pixel stars, two kites. Seamless horizontal tiling. |
| `bg_skyline.png` | Silhouettes of Hampi: a stepped temple tower like the Virupaksha gopuram, ruined stone pavilions and a hill of giant round boulders, in a single dark purple #3d2350. Transparent background. Seamless horizontal tiling. |
| `bg_mid.png` | Coconut palms, banana plants and piles of round granite boulders in dark #2a1f3d with gold rim light. Transparent background. Seamless horizontal tiling. |
| `bike_body.png` | Original classic roadster motorcycle in deep red with chrome, round headlamp, teardrop tank, **no wheels**, rider in a helmet and brown jacket, facing right, no logos or text. Transparent background. |

Then:
1. Shrink each image to the exact size in GAME_SPEC.md 6.4 with nearest-neighbour scaling, so pixels stay sharp.
   You can ask Claude Code: "resize these to the manifest sizes with nearest-neighbour and snap colours to the palette."
2. Put them in `public/assets/` with the exact file names. The game picks them up automatically.
3. Ask Opus: "New PNGs are in public/assets. Check that the parallax seams tile cleanly and fix any alignment issues."

---

## If something goes wrong

| Problem | Do this |
|---|---|
| Opus goes round in circles on a bug for 3+ attempts | `/model` → Fable: "Here's the failing test and what we've tried. Find the root cause before changing code." |
| The context window gets long | `/compact`, then "re-read GAME_SPEC.md and DECISIONS.md and continue." |
| The build is broken after a change | `git log`, then go back to the last good commit |
