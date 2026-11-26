// window.__test (GAME_SPEC.md section 9.1). Installed only in dev / test builds.
import type Phaser from 'phaser';
import { audioDebug, type AudioDebug } from './audio/sfx';
import { isBikeId, type BikeId } from './bike/bikes';
import { currentBike, selectBike } from './bike/selection';
import { runtime, testInput, type GameInput } from './input';
import type { Journey } from './journey';
import { activeJourney, beginJourney, endJourney } from './journeyRun';
import { TILE } from './level/level';
import type { FinishData } from './scenes/Finish';
import type { FinishScene } from './scenes/Finish';
import type { GameScene, GameSnapshot, GameStart } from './scenes/Game';
import type { HudScene } from './scenes/Hud';
import type { JourneyFinishData, JourneyFinishScene } from './scenes/JourneyFinish';
import type { SelectCard, SelectScene } from './scenes/Select';
import type { StageCardInfo, StageCardScene } from './scenes/StageCard';
import type { StageRow, StagesScene } from './scenes/Stages';
import type { TitleScene } from './scenes/Title';
import { FIRST_STAGE, isStageId, levelOf, registerStage, stageDef, type LevelData, type StageId } from './stages';
import { defineStage } from './stages/stage';

const STEP_MS = 1000 / 120;

export interface TestHooks {
  ready(): boolean;
  setInput(input: GameInput): void;
  state(): GameSnapshot;
  /** start a fresh single run at a checkpoint, on the given bike (default: the selected one) and stage (default: the first) */
  startAt(checkpoint: number, bike?: BikeId, stage?: StageId): void;
  /** start a practice run at rest at a column of the stage (its checkpoint is the last one at or before it) */
  startAtCol(col: number, bike?: BikeId, stage?: StageId): void;
  /** start a journey, as JOURNEY -> bike select -> RIDE does; route = the stage ids to ride (default: the shipped journey) */
  startJourney(bike?: BikeId, route?: StageId[]): void;
  /** the journey being ridden (helmets, stage index, results, status), or null */
  journey(): Journey | null;
  /** crash the bike here and now (in a journey: a helmet) */
  crash(): void;
  /** register a copy of the first stage under another id and name, so a test can ride a journey of two stages */
  addTestStage(id: StageId, name: string): void;
  /** the selected bike; with an id, selects that bike first (as the select screen does) */
  bike(id?: BikeId): BikeId;
  setManual(manual: boolean): void;
  step(n: number): void;
  /** the finished run's result (medal, bests), or null before the finish line */
  finish(): FinishData | null;
  /** audio state and output levels (never creates audio) */
  audio(): AudioDebug;
  /** what is on screen */
  screen(): 'boot' | 'title' | 'stages' | 'select' | 'game' | 'paused' | 'gameover' | 'finish' | 'stagecard' | 'journeyfinish';
  /** click targets in game pixels (480x270): the shown menu's options (on the select screen: RIDE / BACK), and the HUD pause button */
  targets(): { menu: Array<{ x: number; y: number; w: number; h: number }>; index: number; pause: { x: number; y: number; w: number; h: number } | null };
  /** the bike select screen: the highlighted card, each card's click target and what it shows; null on any other screen */
  select(): { index: number; cards: Array<SelectCard & { rect: { x: number; y: number; w: number; h: number } }> } | null;
  /** the bike select screen: what it was opened for */
  selectFor(): { mode: 'single' | 'journey'; stage: StageId } | null;
  /** the STAGES screen: the highlighted row, each row's click target and what it shows; null on any other screen */
  stages(): { index: number; rows: Array<StageRow & { rect: { x: number; y: number; w: number; h: number } }> } | null;
  /** the stage card between two stages of a journey; null when it is not up */
  stageCard(): StageCardInfo | null;
  /** the journey finish screen's data; null when it is not up */
  journeyFinish(): JourneyFinishData | null;
  /** counts that must not grow from one title -> game -> title round trip to the next */
  leaks(): Record<string, number>;
  /** the stage being ridden (on any other screen: the first stage), as plain data */
  readonly levelData: LevelData;
}

declare global {
  interface Window {
    __test?: TestHooks;
  }
}

const IDLE: GameSnapshot = {
  x: 0, y: 0, vx: 0, vy: 0, v: 0, angle: 0, grounded: true, boost: 1, crashed: false,
  crashes: 0, diyas: 0, finished: false, checkpoint: 0, timeMs: 0, bike: 'daybreak', stage: FIRST_STAGE.id, mode: 'single',
  helmets: null, gameOver: false, flips: 0, spin: 0, camX: 0, ghost: null,
  boulder: { phase: 'hidden', x: 0 }, prompt: '', stumbles: 0, wobbles: 0,
};

export function installTestHooks(game: Phaser.Game): void {
  let manualTime = 0;
  const gameScene = (): GameScene | null =>
    game.scene.isActive('Game') ? (game.scene.getScene('Game') as GameScene) : null;

  const active = <T extends Phaser.Scene>(key: string): T | null =>
    game.scene.isActive(key) ? (game.scene.getScene(key) as T) : null;
  const selectScene = (): SelectScene | null => active<SelectScene>('Select');

  /** Start the Game scene from any screen. */
  const start = (data: GameStart): void => {
    for (const key of ['Title', 'Stages', 'Select', 'Finish', 'StageCard', 'JourneyFinish', 'Hud']) {
      if (game.scene.getScene(key) && (game.scene.isActive(key) || game.scene.isPaused(key))) game.scene.stop(key);
    }
    game.scene.start('Game', data);
  };

  window.__test = {
    ready: () => runtime.ready,

    /** Replaces the whole test input (missing fields = released). Never touches audio. */
    setInput(input) {
      for (const k of Object.keys(testInput) as Array<keyof GameInput>) delete testInput[k];
      Object.assign(testInput, input);
    },

    state: () => gameScene()?.snapshot() ?? { ...IDLE, bike: currentBike() },

    /** Start a fresh single run at a checkpoint, from any screen. */
    startAt(checkpoint, bike, stage) {
      endJourney();
      start({ mode: 'single', stage: stageDef(stage).id, cp: checkpoint, bike });
    },

    startAtCol(col, bike, stage) {
      endJourney();
      start({ mode: 'single', stage: stageDef(stage).id, startX: col * TILE + TILE / 2, bike });
    },

    startJourney(bike, route) {
      if (isBikeId(bike)) selectBike(bike);
      beginJourney(currentBike(), route && route.length > 0 ? route.filter(isStageId) : undefined);
      start({ mode: 'journey' });
    },

    journey: () => activeJourney(),

    crash() {
      gameScene()?.forceCrash();
    },

    addTestStage(id, name) {
      if (!isStageId(id)) registerStage(defineStage({ ...FIRST_STAGE, id, name }));
    },

    bike(id) {
      if (isBikeId(id)) selectBike(id);
      return currentBike();
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
      if (game.scene.isActive('StageCard')) return 'stagecard';
      if (game.scene.isActive('JourneyFinish')) return 'journeyfinish';
      const g = gameScene();
      if (g) return g.phase === 'gameover' ? 'gameover' : g.paused ? 'paused' : 'game';
      if (game.scene.isActive('Select')) return 'select';
      if (game.scene.isActive('Stages')) return 'stages';
      return game.scene.isActive('Title') ? 'title' : 'boot';
    },

    targets() {
      // An overlay over the stopped game (a finish screen, the stage card) has the menu while it is up.
      const over = active<FinishScene>('Finish') ?? active<StageCardScene>('StageCard') ?? active<JourneyFinishScene>('JourneyFinish');
      const hud = active<HudScene>('Hud');
      const g = gameScene();
      const menu = over?.menu ?? (hud?.menu.shown ? hud.menu : null) ?? selectScene()?.menu
        ?? active<StagesScene>('Stages')?.menu ?? active<TitleScene>('Title')?.menu ?? null;
      return {
        menu: menu ? Array.from({ length: menu.length }, (_, i) => menu.hitRect(i)) : [],
        index: menu ? menu.index : -1,
        pause: hud && !over && !hud.menu.shown && g?.phase !== 'gameover' ? hud.pauseHit : null,
      };
    },

    select() {
      const s = selectScene();
      return s ? { index: s.index, cards: s.cards.map((c, i) => ({ ...c, rect: s.cardRect(i) })) } : null;
    },

    selectFor() {
      const s = selectScene();
      return s ? { mode: s.mode, stage: s.stage.id } : null;
    },

    stages() {
      const s = active<StagesScene>('Stages');
      return s ? { index: s.index, rows: s.rows.map((r, i) => ({ ...r, rect: s.rowRect(i) })) } : null;
    },

    stageCard: () => active<StageCardScene>('StageCard')?.info ?? null,

    journeyFinish: () => active<JourneyFinishScene>('JourneyFinish')?.shown ?? null,

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

    get levelData(): LevelData {
      return levelOf(gameScene()?.stage ?? FIRST_STAGE);
    },
  };
}
