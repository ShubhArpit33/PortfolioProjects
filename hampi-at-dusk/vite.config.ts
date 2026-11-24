import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Manifest of the optional art PNGs that actually exist, so the game never requests a missing file
// (GAME_SPEC.md section 6: placeholder-first rule). Read once at build / dev-server start.
const assetsDir = fileURLToPath(new URL('./public/assets', import.meta.url));
const assetPngs = existsSync(assetsDir)
  ? readdirSync(assetsDir).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4))
  : [];

export default defineConfig({
  base: './',
  define: { __ASSET_PNGS__: JSON.stringify(assetPngs) },
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
