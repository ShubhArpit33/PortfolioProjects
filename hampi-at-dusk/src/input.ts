// Input shared between the keyboard, the test hooks and the scenes.
import type Phaser from 'phaser';
import type { BikeInput } from './bike/BikePhysics';
import { isBikeId, type BikeId } from './bike/bikes';

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
  return Number.isFinite(n) ? Math.min(6, Math.max(0, n)) : null;
})();

/** ?bike=tonup|daybreak|sundowner picks the bike for this page load (anything else is ignored). */
export const URL_BIKE = ((): BikeId | null => {
  const raw = params.get('bike');
  return isBikeId(raw) ? raw : null;
})();

/**
 * One-shot key press handler. Phaser re-processes its whole keyboard queue on every DOM key event,
 * so a 'keydown-X' listener can fire more than once when several keys arrive within one frame;
 * this fires exactly once per physical press (and ignores auto-repeat).
 */
export function onKeyPress(scene: Phaser.Scene, key: string, fn: () => void): void {
  const seen = new WeakSet<KeyboardEvent>();
  // A press that happened before this handler existed belongs to the screen that was showing then
  // (the Enter that opened this scene must not also press its button).
  const born = typeof performance !== 'undefined' ? performance.now() : 0;
  scene.input.keyboard?.on(`keydown-${key}`, (e: KeyboardEvent) => {
    if (e.repeat || seen.has(e) || e.timeStamp < born) return;
    seen.add(e);
    fn();
  });
}
