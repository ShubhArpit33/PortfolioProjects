// Input shared between the keyboard, the test hooks and the scenes.
import type { BikeInput } from './bike/BikePhysics';

export interface GameInput extends BikeInput {
  honk?: boolean;
}

/** Input levels set by window.__test.setInput (OR-ed with the keyboard). */
export const testInput: GameInput = {};

export const runtime = {
  /** true = rAF-driven stepping is off; only __test.step advances the game */
  manual: false,
  /** set once Boot has generated textures and the font is ready */
  ready: false,
};

const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
export const URL_DEBUG = params.get('debug') === '1';
export const URL_CP = ((): number | null => {
  const raw = params.get('cp');
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(4, Math.max(0, n)) : null;
})();
