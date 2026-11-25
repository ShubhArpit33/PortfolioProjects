// Look shots (not part of `npm test`): `npx playwright test -c playwright.look.config.ts --trace off`
// rides the stage with the bot and saves full-screen PNGs of fixed moments for a look by eye.
// LOOK_DIR = output folder (default test-results/look); LOOK_RENDERER=webgl uses the WebGL renderer.
import base from './playwright.config';

export default { ...base, testDir: 'tests/look', outputDir: 'test-results/pw-look' };
