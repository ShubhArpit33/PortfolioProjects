# Open Roads: India

A pixel-art motorcycle game across India: a journey of stages on one bike. Stage 1 is **Hampi at Dusk**; Goa and
Ladakh are next (the game is built so a stage plugs in, but only Hampi exists so far).

A 2D side-scrolling arcade motorcycle game set in the ruins of Hampi, Karnataka, at sunset, with three bikes to ride.
It is built with Phaser 3, TypeScript and Vite. The bike physics is custom, and all art, sound and music are generated in code.

## Two ways to play

- **JOURNEY** (the main mode): pick a bike once, then ride the stages in order. You have **5 helmets**. A crash costs
  one. Helmets carry over to the next stage, which gives one back (up to 5). Out of helmets is **GAME OVER**: the stage
  you are on starts again with 5 helmets, and you keep your bike and the stages already cleared. The journey ends on a
  finish screen with each stage's time, medal and diyas, the total time, and your best journey time on that bike.
  With one stage built, the journey is Hampi and then the finish.
- **STAGES**: ride one stage on its own, as often as you like: no lives, a medal by time, a ghost of your best run, a
  best time per bike. A stage is unlocked once a journey has reached it (Hampi always is).

## Run it

```bash
npm install
npm run dev        # play at http://localhost:5173
npm run build      # static site in dist/
npm test           # Vitest unit tests + Playwright e2e (bot run per bike, the journey, tutorial, boulder, river jump, flips, ghost, menus, bike select, screenshots)
```

The e2e tests need Chromium. The first time, install it with `npx playwright install chromium`.

## Controls

| Key | Action |
|---|---|
| Right arrow | Throttle |
| Left arrow | Brake; at a standstill, back the bike up slowly with your feet |
| Space | Hop |
| Up arrow / Down arrow | Tilt the nose in the air; hold it through a big jump for a flip (lands = +FLIP and a boost refill) |
| Shift | Boost |
| H | Honk |
| M | Sound: all on, music off, muted |
| P / Esc | Pause menu (Up / Down + Enter, or click; P / Esc again resumes). In STAGES: Resume, Restart, Change bike, Main menu. In a journey: Resume, Restart stage (costs a helmet), Quit journey |
| R | Restart the run (STAGES only; works on the finish screen too). In a journey, restart from the pause menu |
| C | Back to the last checkpoint (counts as a crash; in a journey it costs a helmet) |
| G | Show / hide the ghost of your best run (STAGES only) |
| Enter | Pick the selected menu option (on a single run's finish screen: Ride again, or Left / Right for Change bike / Main menu) |

### Menus
The title offers **JOURNEY** and **STAGES** (Up / Down + Enter, or click).
- JOURNEY opens the bike select. Your pick is for the whole journey: you are not asked again between stages.
- STAGES lists the stages; Enter on an unlocked one opens the bike select for a single run of it. A locked stage shows
  a padlock.

### Bike select
**Left / Right** choose a bike, **Enter** rides it, **Esc** goes back.
With the mouse or a tap: click a card to pick it, click it again (or RIDE) to ride. The game remembers your last bike.
In STAGES mode, **Change bike** in the pause menu and on the finish screen brings you back here.

| Bike | Feel | Gold / silver / bronze |
|---|---|---|
| **Ton-Up** (green cafe racer) | Fastest, quick flips, long low hops, a short hard boost. Landings must be within 25° of the slope. | 53 / 63 / 110 s |
| **Daybreak** (red retro roadster) | The all-rounder the stage was built around. | 63 / 75 / 131 s |
| **Sundowner** (purple and black bobber, whitewall tyres) | Slowest, strong off the line, a long gentle boost, lazy flips. Forgives landings up to 45° off. | 73 / 87 / 153 s |

The medal times are Hampi's. Each bike has its own best time, medal and ghost on each stage, and its own best journey
time. The bikes are original pixel-art tributes to three kinds of motorcycle; there are no logos or model names in the game.

URL options: `?debug=1` (hitboxes, FPS, physics readout), `?cp=N` (practice a single run from checkpoint 0–3; not ranked) and
`?bike=tonup|daybreak|sundowner` (ride that bike for this page load).

## Stage 1: Hampi at Dusk
900 columns, about a minute: roughly 50 s on the Ton-Up, 60 s on the Daybreak and 70 s on the Sundowner for a clean run.

| | Section | What it asks |
|---|---|---|
| 0 | **Warm-up Road** | The tutorial: ride, hop a log, try the boost strip, tilt over a roller. Nothing here can crash you: the log only costs speed, and a bad landing is just a wobble. |
| 1 | Bazaar Street | The cow. Wait for her, or hop her. |
| 2 | Canals | Six canals to hop. |
| 3 | Fallen Pavilion | Pillars, a cart, and monkeys (honk). |
| 4 | Boulder Field | Ramps and a cliff. |
| 5 | **Ruins Road** | A breather: a diya trail and a bonus ramp. Roll over it, or hop on it and flip. |
| 6 | Mandapa Run | A hop rhythm on the plinth. |
| 7 | Hemakuta Rocks | Rollers, then the kicker over the tank: the big flip spot. |
| 8 | **Temple Steps** | Hop up three steps; a boulder rolls at you along the terrace (a rumble and a "!" warn you: hop it); roll down the stairs. |
| 9 | Tungabhadra Leap | Hold boost and jump the river. |

There are 4 checkpoints (lamp pillars) and 56 diyas. The checkpoints are at the start, in the middle of the stage
(Ruins Road), at the foot of the Temple Steps and before the river. A crash sends you back to the last one you passed,
so a crash early in the stage costs a lot of road.

### Tutorial
On the Warm-up Road the game shows a prompt for each control (**HOLD RIGHT TO RIDE**, **SPACE - HOP THE LOG**,
**HOLD SHIFT - BOOST**, **IN THE AIR: UP / DOWN TO TILT**) until you have finished one full run. After that they are gone
for good (the game remembers it; if the browser blocks storage they come back on the next visit).

## The loop
Beat the clock for a medal (on the Daybreak: gold under 63 s, silver under 75 s, bronze under 131 s),
collect all 56 diyas, and race the ghost of your best run. Hop on a ramp for big air and hold Up or Down to flip:
a landed flip refills the boost meter. Best time, diyas and flips are kept per stage and bike in the browser's local
storage, and so are your best journey time per bike and the stages you have unlocked. A journey in progress is not
saved: closing the page ends it. Records from v1.7 and v1.8 carry over as Hampi's. Records from before v1.7 were ridden
on the shorter stage: they are left in storage untouched and no longer count.

## Docs
- `GAME_SPEC.md`: the spec (v1.9: the journey, one stage of about a minute so far, three bikes), the single source of truth
- `SPEC_REVIEW.md`: the review that produced v1.1
- `DECISIONS.md`: every judgement call, the measured results and the section 9 status
- `HOW_TO_BUILD.md`: the build process

## Custom art
Drop PNGs with the names listed in `GAME_SPEC.md` section 6.4 into `public/assets/`, then restart the dev server.
Each PNG replaces its code-drawn placeholder.
