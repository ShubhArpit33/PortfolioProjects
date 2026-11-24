# Hampi at Dusk

A one-stage, 2D side-scrolling arcade motorcycle game set in the ruins of Hampi, Karnataka, at sunset.
It is built with Phaser 3, TypeScript and Vite. The bike physics is custom, and all art, sound and music are generated in code.

## Run it

```bash
npm install
npm run dev        # play at http://localhost:5173
npm run build      # static site in dist/
npm test           # Vitest unit tests + Playwright e2e (bot run, river jump, flips, ghost, menus, screenshots)
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
| P / Esc | Pause menu: Resume, Restart, Main menu (Up / Down + Enter, or click; P / Esc again resumes) |
| R | Restart the run (works on the finish screen too) |
| C | Back to the last checkpoint (counts as a crash) |
| G | Show / hide the ghost of your best run |
| Enter | Start; pick the selected menu option (on the finish screen: Ride again, or Left / Right for Main menu) |

URL options: `?debug=1` (hitboxes, FPS, physics readout) and `?cp=N` (practice from checkpoint 0–6; not ranked).

## The loop
One stage, about 40 seconds. Beat the clock for a medal (gold under 40 s, silver under 46 s, bronze under 56 s),
collect all 30 diyas, and race the ghost of your best run. Hop on a ramp for big air and hold Up or Down to flip:
a landed flip refills the boost meter. Best time, diyas and flips are kept in the browser's local storage.

## Docs
- `GAME_SPEC.md`: the spec (v1.3; pause menu v1.5), the single source of truth
- `SPEC_REVIEW.md`: the review that produced v1.1
- `DECISIONS.md`: every judgement call, the measured results and the section 9 status
- `HOW_TO_BUILD.md`: the build process

## Custom art
Drop PNGs with the names listed in `GAME_SPEC.md` section 6.4 into `public/assets/`, then restart the dev server.
Each PNG replaces its code-drawn placeholder.
