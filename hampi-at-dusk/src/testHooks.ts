// window.__test (GAME_SPEC.md section 9.1). Installed only in dev / test builds.
import type Phaser from 'phaser';
import { audioDebug, type AudioDebug } from './audio/sfx';
import { runtime, testInput, type GameInput } from './input';
import { LEVEL } from './level/levelData';
import type { FinishData } from './scenes/Finish';
import type { FinishScene } from './scenes/Finish';
import type { GameScene, GameSnapshot } from './scenes/Game';
import type { HudScene } from './scenes/Hud';

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
  /** what is on screen: 'title' | 'game' | 'paused' | 'finish' */
  screen(): 'boot' | 'title' | 'game' | 'paused' | 'finish';
  /** click targets in game pixels (480x270): the shown menu's options, and the HUD pause button */
  targets(): { menu: Array<{ x: number; y: number; w: number; h: number }>; index: number; pause: { x: number; y: number; w: number; h: number } | null };
  /** counts that must not grow from one title -> game -> title round trip to the next */
  leaks(): Record<string, number>;
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

    screen() {
      if (game.scene.isActive('Finish')) return 'finish';
      const g = gameScene();
      if (g) return g.paused ? 'paused' : 'game';
      return game.scene.isActive('Title') ? 'title' : 'boot';
    },

    targets() {
      const finish = game.scene.isActive('Finish') ? (game.scene.getScene('Finish') as FinishScene) : null;
      const hud = game.scene.isActive('Hud') ? (game.scene.getScene('Hud') as HudScene) : null;
      const menu = finish?.menu ?? (hud?.menu.shown ? hud.menu : null);
      return {
        menu: menu ? Array.from({ length: menu.length }, (_, i) => menu.hitRect(i)) : [],
        index: menu ? menu.index : -1,
        pause: hud && !finish && !hud.menu.shown ? hud.pauseHit : null,
      };
    },

    leaks() {
      const count = (e: Phaser.Events.EventEmitter | null | undefined): number =>
        e ? e.eventNames().reduce((n, name) => n + e.listenerCount(name), 0) : 0;
      const out: Record<string, number> = {
        scenes: game.scene.scenes.length,
        running: game.scene.getScenes(true).length,
        gameEvents: count(game.events),
        inputManagerEvents: count(game.input.events),
        scaleEvents: count(game.scale),
      };
      for (const s of game.scene.scenes) {
        const k = s.sys.settings.key;
        const on = game.scene.isActive(k);
        out[`${k}.sceneEvents`] = count(s.events);
        out[`${k}.inputEvents`] = count(s.input);
        out[`${k}.keyEvents`] = count(s.input.keyboard);
        out[`${k}.objects`] = on ? s.children.length : 0;
        out[`${k}.updating`] = on ? s.sys.updateList.length : 0;
        out[`${k}.interactive`] = on ? (s.input as unknown as { _list: unknown[] })._list.length : 0;
        out[`${k}.tweens`] = s.tweens.getTweens().length;
        out[`${k}.timers`] = (s.time as unknown as { _active: unknown[] })._active.length;
      }
      return out;
    },

    levelData: LEVEL,
  };
}
