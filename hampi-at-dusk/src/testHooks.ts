// window.__test (GAME_SPEC.md section 9.1). Installed only in dev / test builds.
import type Phaser from 'phaser';
import { audioDebug, type AudioDebug } from './audio/sfx';
import { runtime, testInput, type GameInput } from './input';
import { LEVEL } from './level/levelData';
import type { FinishData } from './scenes/Finish';
import type { GameScene, GameSnapshot } from './scenes/Game';

const STEP_MS = 1000 / 120;

export interface TestHooks {
  ready(): boolean;
  setInput(input: GameInput): void;
  state(): GameSnapshot;
  startAt(checkpoint: number): void;
  setManual(manual: boolean): void;
  step(n: number): void;
  /** the finished run's result (medal, bests), or null before the finish line */
  finish(): FinishData | null;
  /** audio state and output levels (never creates audio) */
  audio(): AudioDebug;
  levelData: typeof LEVEL;
}

declare global {
  interface Window {
    __test?: TestHooks;
  }
}

const IDLE: GameSnapshot = {
  x: 0, y: 0, vx: 0, vy: 0, v: 0, angle: 0, grounded: true, boost: 1, crashed: false,
  crashes: 0, diyas: 0, finished: false, checkpoint: 0, timeMs: 0, flips: 0, spin: 0, camX: 0, ghost: null,
};

export function installTestHooks(game: Phaser.Game): void {
  let manualTime = 0;
  const gameScene = (): GameScene | null =>
    game.scene.isActive('Game') ? (game.scene.getScene('Game') as GameScene) : null;

  window.__test = {
    ready: () => runtime.ready,

    /** Replaces the whole test input (missing fields = released). Never touches audio. */
    setInput(input) {
      for (const k of Object.keys(testInput) as Array<keyof GameInput>) delete testInput[k];
      Object.assign(testInput, input);
    },

    state: () => gameScene()?.snapshot() ?? { ...IDLE },

    /** Start a fresh run at a checkpoint, from any screen. */
    startAt(checkpoint) {
      for (const key of ['Title', 'Finish', 'Hud']) {
        if (game.scene.getScene(key) && (game.scene.isActive(key) || game.scene.isPaused(key))) game.scene.stop(key);
      }
      game.scene.start('Game', { cp: checkpoint });
    },

    /** true stops rAF-driven stepping: only step() advances (and draws) the game. */
    setManual(manual) {
      if (manual === runtime.manual) return;
      runtime.manual = manual;
      if (manual) {
        manualTime = game.loop.time;
        game.loop.sleep();
      } else {
        game.loop.wake();
      }
    },

    /** Run n fixed steps, then one update + render, synchronously. */
    step(n) {
      const count = Math.max(0, Math.floor(n));
      gameScene()?.simulate(count);
      const delta = count * STEP_MS;
      manualTime += delta;
      game.step(manualTime, delta);
    },

    finish: () => gameScene()?.finishData ?? null,

    audio: () => audioDebug(),

    levelData: LEVEL,
  };
}
