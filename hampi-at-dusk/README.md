# Hampi at Dusk

A one-stage, 2D side-scrolling arcade motorcycle game set in the ruins of Hampi, Karnataka, at sunset, with three bikes to ride.
It is built with Phaser 3, TypeScript and Vite. The bike physics is custom, and all art, sound and music are generated in code.

## Run it

```bash
npm install
npm run dev        # play at http://localhost:5173
npm run build      # static site in dist/
npm test           # Vitest unit tests + Playwright e2e (bot run per bike, river jump, flips, ghost, menus, bike select, screenshots)
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
| P / Esc | Pause menu: Resume, Restart, Change bike, Main menu (Up / Down + Enter, or click; P / Esc again resumes) |
| R | Restart the run (works on the finish screen too) |
| C | Back to the last checkpoint (counts as a crash) |
| G | Show / hide the ghost of your best run |
| Enter | Start; pick the selected menu option (on the finish screen: Ride again, or Left / Right for Change bike / Main menu) |

### Bike select
Enter on the title opens the bike select. **Left / Right** choose a bike, **Enter** rides it, **Esc** goes back.
With the mouse or a tap: click a card to pick it, click it again (or RIDE) to ride. The game remembers your last bike,
and **Change bike** in the pause menu and on the finish screen brings you back here.

| Bike | Feel | Gold / silver / bronze |
|---|---|---|
| **Ton-Up** (green cafe racer) | Fastest, quick flips, long low hops, a short hard boost. Landings must be within 25° of the slope. | 34 / 40 / 50 s |
| **Daybreak** (red retro roadster) | The all-rounder the stage was built around. | 40 / 46 / 56 s |
| **Sundowner** (blue cruiser) | Slowest, strong off the line, a long gentle boost, lazy flips. Forgives landings up to 45° off. | 46 / 52 / 62 s |

Each bike has its own best time, medal and ghost. The bikes are original pixel-art tributes to three kinds of motorcycle;
there are no logos or model names in the game.

URL options: `?debug=1` (hitboxes, FPS, physics readout), `?cp=N` (practice from checkpoint 0–6; not ranked) and
`?bike=tonup|daybreak|sundowner` (ride that bike for this page load).

## The loop
One stage, about 40 seconds. Beat the clock for a medal (on the Daybreak: gold under 40 s, silver under 46 s, bronze under 56 s),
collect all 30 diyas, and race the ghost of your best run. Hop on a ramp for big air and hold Up or Down to flip:
a landed flip refills the boost meter. Best time, diyas and flips are kept per bike in the browser's local storage.

## Docs
- `GAME_SPEC.md`: the spec (v1.6: one stage, three bikes), the single source of truth
- `SPEC_REVIEW.md`: the review that produced v1.1
- `DECISIONS.md`: every judgement call, the measured results and the section 9 status
- `HOW_TO_BUILD.md`: the build process

## Custom art
Drop PNGs with the names listed in `GAME_SPEC.md` section 6.4 into `public/assets/`, then restart the dev server.
Each PNG replaces its code-drawn placeholder.
