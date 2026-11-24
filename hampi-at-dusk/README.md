# Hampi at Dusk

A one-stage, 2D side-scrolling arcade motorcycle game set in the ruins of Hampi, Karnataka, at sunset.
It is built with Phaser 3, TypeScript and Vite. The bike physics is custom, and all art and audio are generated in code.

## Run it

```bash
npm install
npm run dev        # play at http://localhost:5173
npm run build      # static site in dist/
npm test           # Vitest unit tests + Playwright e2e (bot run, river jump, screenshots)
```

The e2e tests need Chromium. The first time, install it with `npx playwright install chromium`.

## Controls

| Key | Action |
|---|---|
| Right arrow | Throttle |
| Left arrow | Brake; at a standstill, back the bike up slowly with your feet |
| Space | Hop |
| Up arrow / Down arrow | Tilt the nose in the air |
| Shift | Boost |
| H | Honk |
| M | Mute |
| P / Esc | Pause |
| R | Restart from the last checkpoint |
| Enter | Start / ride again |

URL options: `?debug=1` (hitboxes, FPS, physics readout) and `?cp=N` (start at checkpoint 0–4).

## Docs
- `GAME_SPEC.md`: the spec (v1.1), the single source of truth
- `SPEC_REVIEW.md`: the review that produced v1.1
- `DECISIONS.md`: every judgement call, the measured results and the section 9 status
- `HOW_TO_BUILD.md`: the build process

## Custom art
Drop PNGs with the names listed in `GAME_SPEC.md` section 6.4 into `public/assets/`, then restart the dev server.
Each PNG replaces its code-drawn placeholder.
