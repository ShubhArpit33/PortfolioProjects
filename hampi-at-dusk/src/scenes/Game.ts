// The stage. All gameplay state advances in fixedStep() (1/120 s, sim time only), so the game is
// deterministic and can be driven by window.__test.step. Everything visual happens in renderFrame().

import Phaser from 'phaser';
import { BoostStreaks, Fx } from '../art/Fx';
import { DEPTH, Parallax } from '../art/Parallax';
import { PAL } from '../art/palette';
import { setMusicIntensity, tickMusic } from '../audio/music';
import * as sfx from '../audio/sfx';
import {
  FIXED_DT, aabbOverlap, addBoost, bikeAABB, crash, createBikeState, hitsObstacle, step, stumble, touchesDiya,
  wobbleLanding, type BikeState, type CrashCause,
} from '../bike/BikePhysics';
import { BikeView, GhostBike } from '../bike/BikeView';
import { BIKES, isBikeId, type BikeDef, type BikeId } from '../bike/bikes';
import { currentBike, selectBike } from '../bike/selection';
import type { Config } from '../config';
import { Boulder } from '../entities/Boulder';
import { Checkpoint } from '../entities/Checkpoint';
import { Cow } from '../entities/Cow';
import { Diya } from '../entities/Diya';
import { MonkeyTroop } from '../entities/Monkey';
import { Obstacle } from '../entities/Obstacle';
import { URL_DEBUG, onKeyPress, runtime, testInput, type GameInput } from '../input';
import {
  BASELINE_Y, CAMERA_MAX_SCROLL_X, CHECKPOINTS, COW, DIYAS, FINISH, OBSTACLES, SAFE_ZONE, TILE, WATER_LINE_Y, promptAt,
} from '../level/levelData';
import type { BoulderPhase } from '../level/boulder';
import { TERRAIN, type Box } from '../level/terrain';
import { addDecor, addTerrain } from '../level/terrainView';
import {
  GHOST_MAX_SAMPLES, GHOST_SAMPLE_STEPS, decodeGhost, encodeGhost, ghostPoseAt, loadBest, loadPrefs, medalFor,
  nextMedal, saveBest, savePrefs, submitRun, type Best, type GhostPose,
} from '../progress';
import { Popups } from '../ui/Popups';
import type { FinishData } from './Finish';

const VIEW_W = 480;
const VIEW_H = 270;
const FADE_S = 0.25;
/** Sim seconds between crossing the finish line and the finish screen. */
const FINISH_SCREEN_DELAY_S = 1.2;

/** After the line the bike stops within this distance, braking at up to FINISH_BRAKE px/s². */
const FINISH_STOP_PX = 64;
const FINISH_BRAKE = 1200;

/** Landing-bump spring: about 4 Hz, damping ratio 0.6 (one small rebound, then still). */
const BUMP_STIFFNESS = 620;
const BUMP_DAMPING = 30;

type Phase = 'ride' | 'crash';

/**
 * The bests as of the last finished run in this page session. Storage is only a copy of this: when it
 * is unavailable or throws, best / medal / ghost still work until the page is closed.
 */
const sessionBest: Partial<Record<BikeId, Best>> = {};

/** A bike's bests: this session's if a run on it has finished, else whatever storage holds. */
export function currentBest(bike: BikeId = currentBike()): Best {
  return sessionBest[bike] ?? loadBest(bike);
}

/**
 * The tutorial prompts (v1.7) show until one full run has been finished. This is the session's copy of
 * that fact; the prefs hold the lasting one. When storage is missing or throws, the prefs always read
 * "not done", so the prompts show again on the next visit, and this copy still switches them off for
 * the rest of the session.
 */
let sessionTutorialDone = false;

/** Has a full run been finished (this session, or on an earlier visit)? */
export function tutorialDone(): boolean {
  return sessionTutorialDone || loadPrefs().tutorialDone;
}

/** The warm-up ends here: a bad landing whose take-off was left of this x is a wobble, not a crash. */
const SAFE_X1 = SAFE_ZONE.toCol * TILE;

/** Popup text for n full flips in one air. */
export function flipLabel(n: number): string {
  if (n <= 1) return '+FLIP';
  if (n === 2) return '+DOUBLE FLIP';
  if (n === 3) return '+TRIPLE FLIP';
  return `+${n}X FLIP`;
}

export interface GameSnapshot {
  x: number; y: number; vx: number; vy: number; v: number; angle: number;
  grounded: boolean; boost: number; crashed: boolean; crashes: number; diyas: number;
  finished: boolean; checkpoint: number; timeMs: number;
  /** the bike being ridden */
  bike: BikeId;
  /** full flips landed this run (the trick tally) */
  flips: number;
  /** degrees turned in the current air (0 while grounded) */
  spin: number;
  /** camera scroll (world px of the left screen edge), before rounding */
  camX: number;
  /** where the ghost is drawn this frame (null when hidden or there is none) */
  ghost: { x: number; y: number; angle: number } | null;
  /** the rolling boulder on the temple terrace: its phase and the left edge of its hitbox */
  boulder: { phase: BoulderPhase; x: number };
  /** the tutorial prompt on screen ('' = none) */
  prompt: string;
  /** stumbles (a monkey, the log) and warm-up wobbles so far in this run */
  stumbles: number;
  wobbles: number;
}

export class GameScene extends Phaser.Scene {
  // --- sim state ---
  /** the bike being ridden: its tuning is this.cfg, used for everything in the run */
  bikeDef: BikeDef = BIKES[currentBike()];
  cfg: Config = this.bikeDef.cfg;
  bike!: BikeState;
  phase: Phase = 'ride';
  checkpoint = 0;
  crashes = 0;
  diyaCount = 0;
  /** trick tally: full flips landed without crashing */
  flips = 0;
  finished = false;
  paused = false;
  /** HUD hint (a checkpoint's): text and seconds left */
  hintText = '';
  hintT = 0;
  /** tutorial prompts are shown on this run (no full run has been finished yet) */
  tutorial = false;
  /** stumbles (a monkey, the log) and warm-up wobbles in this run */
  stumbles = 0;
  wobbles = 0;
  /** x of the last grounded step: where the current air was taken off from */
  private lastGroundX = 0;
  /** per log: was the bike box on it on the previous step (a stumble is one per contact) */
  private logTouch: boolean[] = [];
  /** fixed steps counted by the run timer */
  private timerSteps = 0;
  private crashT = 0;
  private crashCause: CrashCause = 'landing';
  private crashFrom = { x: 0, y: 0, vx: 0, angle: 0, floor: 0 };
  private respawnDelay = 0;
  private fadeInT = 0;
  private finishT = 0;
  private finishShown = false;
  private camX = 0;
  /** smoothed look-ahead (px): grows with speed, so obstacles show earlier the faster the bike goes */
  private look = 0;
  /** landing bump: the view dips by bumpY px (a damped spring, game time) */
  private bumpY = 0;
  private bumpV = 0;
  /** 0..1, eases toward 1 while boosting (drives the speed streaks) */
  private boostFx = 0;
  private honkHeld = false;
  private honkQueued = false;
  private restartQueued = false;
  /** a run from cp0 counts for best / medal / ghost; a ?cp=N start is practice */
  private ranked = true;
  private best: Best = currentBest();
  /** the best run's ghost (decoded), and this run's recording */
  private ghostPoses: GhostPose[] = [];
  private ghostRec: GhostPose[] = [];
  private ghostOn = true;
  private ghostPose: GhostPose | null = null;
  /** set at the finish line (the run is scored there, not when the finish screen opens) */
  finishData: FinishData | null = null;
  private lastInput: GameInput = {};
  private startCp = 0;

  // --- views ---
  private acc = 0;
  private visT = 0;
  private parallax!: Parallax;
  private popups!: Popups;
  private view!: BikeView;
  private ghost!: GhostBike;
  private fx!: Fx;
  private streaks!: BoostStreaks;
  private diyas: Diya[] = [];
  private obstacles: Obstacle[] = [];
  /** boxes that crash the bike on any overlap (pillars and carts; not the log) */
  private solid: Box[] = [];
  private logs: Obstacle[] = [];
  private checkpoints: Checkpoint[] = [];
  private cow!: Cow;
  private troop!: MonkeyTroop;
  private boulder!: Boulder;
  private coracles: Phaser.GameObjects.Image[] = [];
  private glints: Phaser.GameObjects.Image[] = [];
  private fade!: Phaser.GameObjects.Rectangle;
  private keys!: Record<'right' | 'left' | 'up' | 'down' | 'space' | 'shift', Phaser.Input.Keyboard.Key>;
  private debugGfx: Phaser.GameObjects.Graphics | null = null;
  private debugText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('Game');
  }

  init(data: { cp?: number; bike?: BikeId }): void {
    if (isBikeId(data?.bike)) selectBike(data.bike);
    this.bikeDef = BIKES[currentBike()];
    this.cfg = this.bikeDef.cfg;
    this.startCp = Math.min(CHECKPOINTS.length - 1, Math.max(0, data?.cp ?? 0));
    this.phase = 'ride';
    this.checkpoint = this.startCp;
    this.crashes = 0;
    this.diyaCount = 0;
    this.flips = 0;
    this.finished = false;
    this.paused = false;
    this.hintText = '';
    this.hintT = 0;
    this.tutorial = !tutorialDone();
    this.stumbles = 0;
    this.wobbles = 0;
    this.logTouch = [];
    this.timerSteps = 0;
    this.crashT = 0;
    this.fadeInT = 0;
    this.finishT = 0;
    this.finishShown = false;
    this.honkHeld = false;
    this.honkQueued = false;
    this.restartQueued = false;
    this.ranked = this.startCp === 0;
    this.best = currentBest(this.bikeDef.id);
    this.ghostPoses = this.ranked ? decodeGhost(this.best.ghost) : [];
    this.ghostRec = [];
    this.ghostOn = loadPrefs().ghost;
    this.ghostPose = null;
    this.finishData = null;
    this.lastInput = {};
    this.acc = 0;
    this.visT = 0;
    this.look = this.cfg.cameraLookAheadRest;
    this.bumpY = 0;
    this.bumpV = 0;
    this.boostFx = 0;
    this.diyas = [];
    this.obstacles = [];
    this.solid = [];
    this.logs = [];
    this.checkpoints = [];
    this.coracles = [];
    this.glints = [];
    this.debugGfx = null;
    this.debugText = null;
  }

  create(): void {
    this.parallax = new Parallax(this);
    addTerrain(this, DEPTH.terrain);

    // River decoration: bobbing coracles; shimmering glints on every stretch of water.
    const river = TERRAIN.gaps.find((g) => g.river);
    if (river) {
      for (const f of [0.2, 0.52, 0.8]) {
        const x = river.x0 + (river.x1 - river.x0) * f;
        this.coracles.push(this.add.image(x, WATER_LINE_Y + 4, 'coracle').setOrigin(0.5, 1).setDepth(DEPTH.deco));
      }
    }
    for (const g of TERRAIN.gaps) {
      if (g.step) continue; // a riser's slot is dry stone
      const n = Math.max(2, Math.round((g.x1 - g.x0) / 24));
      for (let i = 0; i < n; i++) {
        const x = g.x0 + 6 + ((i + 0.5) * (g.x1 - g.x0 - 12)) / n;
        const y = WATER_LINE_Y + 5 + ((i * 7) % 5) * 7;
        this.glints.push(this.add.image(Math.round(x), y, 'p_glint').setDepth(DEPTH.deco - 0.5));
      }
    }

    // Mandapa Run: a standing colonnade behind the plinth (decoration, behind every entity).
    const plinth = TERRAIN.pieces.find((p) => p.y0 === BASELINE_Y - TILE && p.y1 === p.y0 && p.cols >= 60);
    if (plinth) {
      for (let x = plinth.x0 + 24; x + 192 <= plinth.x1; x += 208) {
        this.add.image(x, plinth.y0 + 1, 'colonnade').setOrigin(0, 1).setDepth(DEPTH.deco - 0.6).setAlpha(0.85);
      }
    }

    // v1.7: ruins along the breather, the temple doorway on the terrace (decoration, behind every entity).
    addDecor(this, DEPTH.deco - 0.6);

    this.add.image(FINISH.col * TILE, BASELINE_Y, 'gateway').setOrigin(0, 1).setDepth(DEPTH.deco);
    this.checkpoints = CHECKPOINTS.map((def) => new Checkpoint(this, def, DEPTH.checkpoint));
    this.obstacles = OBSTACLES.map((def) => new Obstacle(this, def, DEPTH.obstacle));
    this.solid = this.obstacles.filter((o) => o.solid).map((o) => o.box);
    this.logs = this.obstacles.filter((o) => !o.solid);
    this.cow = new Cow(this, DEPTH.animal);
    this.troop = new MonkeyTroop(this, DEPTH.animal);
    this.boulder = new Boulder(this, DEPTH.obstacle, DEPTH.popup);
    this.diyas = DIYAS.map((def, i) => new Diya(this, def, i, DEPTH.diya));
    this.ghost = new GhostBike(this, DEPTH.bike - 1, this.bikeDef.id);
    this.view = new BikeView(this, DEPTH.bike, DEPTH.fx, this.bikeDef.id);
    this.fx = new Fx(this, DEPTH.fx);
    this.streaks = new BoostStreaks(this, DEPTH.terrain - 1);
    this.popups = new Popups(this, DEPTH.popup);
    this.fade = this.add.rectangle(0, 0, VIEW_W, VIEW_H, PAL.ink).setOrigin(0, 0).setScrollFactor(0)
      .setDepth(DEPTH.fade).setAlpha(0);

    for (const cp of this.checkpoints) cp.setLit(cp.id <= this.checkpoint);
    this.bike = createBikeState(this.checkpoints[this.checkpoint]!.x, TERRAIN, this.cfg);
    this.lastGroundX = this.bike.x;
    this.camX = this.cameraTarget();
    const startHint = this.checkpoints[this.checkpoint]!.hint;
    if (startHint) this.showHint(startHint);

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      right: kb.addKey(K.RIGHT), left: kb.addKey(K.LEFT), up: kb.addKey(K.UP), down: kb.addKey(K.DOWN),
      space: kb.addKey(K.SPACE), shift: kb.addKey(K.SHIFT),
    };
    onKeyPress(this, 'H', () => { if (!this.paused) this.honkQueued = true; });
    // R restarts the whole run at once (also from the finish screen); C goes back to the last checkpoint.
    onKeyPress(this, 'R', () => this.restartRun());
    onKeyPress(this, 'C', () => { if (!this.paused) this.restartQueued = true; });
    onKeyPress(this, 'G', () => this.toggleGhost());
    // P / Esc open and close the pause menu (the HUD scene draws it and takes its Up / Down / Enter).
    onKeyPress(this, 'P', () => this.togglePause());
    onKeyPress(this, 'ESC', () => this.togglePause());

    if (URL_DEBUG) {
      this.debugGfx = this.add.graphics().setDepth(DEPTH.debug);
      this.debugText = this.add.text(4, 44, '', {
        fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#f3ead7', backgroundColor: '#1a1020',
      }).setScrollFactor(0).setDepth(DEPTH.debug).setLineSpacing(2);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      sfx.setEngine(false);
      // No key stays "held" into the next scene or the next run.
      this.input.keyboard?.resetKeys();
      this.lastInput = {};
    });
    this.scene.launch('Hud');
    this.renderFrame(0);
  }

  // ---------------------------------------------------------------------------------------------
  // Public API (HUD, test hooks)
  // ---------------------------------------------------------------------------------------------

  get timeMs(): number {
    return Math.round((this.timerSteps * 1000) / 120);
  }

  get boosting(): boolean {
    return this.phase === 'ride' && this.bike.boosting;
  }

  snapshot(): GameSnapshot {
    const b = this.bike;
    return {
      x: b.x, y: b.y, vx: b.vx, vy: b.vy, v: b.v, angle: b.angle, grounded: b.grounded, boost: b.boost,
      crashed: this.phase === 'crash', crashes: this.crashes, diyas: this.diyaCount,
      finished: this.finished, checkpoint: this.checkpoint, timeMs: this.timeMs, bike: this.bikeDef.id,
      flips: this.flips, spin: b.spin, camX: this.camX,
      ghost: this.ghostPose ? { ...this.ghostPose } : null,
      boulder: { phase: this.boulder.state.phase, x: this.boulder.state.x },
      prompt: this.promptText, stumbles: this.stumbles, wobbles: this.wobbles,
    };
  }

  /** Run n fixed steps right now (used by window.__test.step). Nothing advances while paused. */
  simulate(n: number): void {
    if (this.paused) return;
    for (let i = 0; i < n; i++) this.fixedStep();
  }

  togglePause(): void {
    this.setPaused(!this.paused);
  }

  /**
   * Pause is a flag, not a Phaser scene pause: no fixed steps run and every frame is drawn with dt 0,
   * so the run timer, the physics, the ghost recording and all frame-time animation stand still.
   */
  setPaused(on: boolean): void {
    if (this.finished || on === this.paused) return;
    this.paused = on;
    // The only wall-clock visuals are Phaser's own: the particle emitters and the crash shake.
    this.view.setPaused(on);
    if (on) {
      this.cameras.main.resetFX();
      this.acc = 0;
    }
  }

  /** Leave the run for the title screen (from the pause menu or the finish screen). */
  toTitle(): void {
    this.scene.stop('Finish');
    this.scene.stop('Hud');
    this.scene.start('Title');
  }

  /** Leave the run for the bike select (from the pause menu or the finish screen). */
  toSelect(): void {
    this.scene.stop('Finish');
    this.scene.stop('Hud');
    this.scene.start('Select');
  }

  /** The tutorial prompt for where the bike is ('' = none). Only until one full run has been finished. */
  get promptText(): string {
    return this.tutorial && !this.finished && this.phase === 'ride' ? promptAt(this.bike.x) : '';
  }

  /** Best time so far (ms), or null. Practice runs show it too. */
  get bestTimeMs(): number | null {
    return this.best.timeMs;
  }

  /** Start the run again from its first checkpoint, right now. */
  restartRun(): void {
    this.scene.stop('Finish');
    this.scene.restart({ cp: this.startCp });
  }

  toggleGhost(): void {
    this.ghostOn = !this.ghostOn;
    savePrefs({ ...loadPrefs(), ghost: this.ghostOn });
    const text = !this.ghostOn ? 'GHOST OFF' : this.ghostPoses.length > 0 ? 'GHOST ON' : 'GHOST ON - NO BEST RUN YET';
    if (!this.finished) this.showHint(text, 1.6);
  }

  // ---------------------------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------------------------

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1);
    if (this.paused) {
      sfx.setEngine(false);
      this.renderFrame(0);
      return;
    }
    if (runtime.manual) {
      // __test.step already ran the fixed steps; this frame only draws.
      this.renderFrame(dt);
      return;
    }
    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= FIXED_DT) {
      this.fixedStep();
      this.acc -= FIXED_DT;
    }
    this.renderFrame(dt);
  }

  private readInput(): GameInput {
    const k = this.keys;
    const t = testInput;
    return {
      throttle: k.right.isDown || t.throttle === true,
      brake: k.left.isDown || t.brake === true,
      hop: k.space.isDown || t.hop === true,
      boost: k.shift.isDown || t.boost === true,
      tiltUp: k.up.isDown || t.tiltUp === true,
      tiltDown: k.down.isDown || t.tiltDown === true,
      honk: t.honk === true,
    };
  }

  private fixedStep(): void {
    const dt = FIXED_DT;
    if (!this.finished) {
      // Ghost recording: the pose every GHOST_SAMPLE_STEPS of run time, starting at time 0.
      if (this.ranked && this.timerSteps % GHOST_SAMPLE_STEPS === 0) this.recordGhost();
      this.timerSteps++;
    }

    // After the line only the brake is active (released once stopped, so the bike never backs up).
    const input: GameInput = this.finished
      ? { brake: !this.bike.grounded || this.bike.v > 0 }
      : this.readInput();
    this.lastInput = input;

    // Honk: keyboard presses are queued; the test input is edge-triggered here.
    const honkLevel = input.honk === true;
    const honk = this.honkQueued || (honkLevel && !this.honkHeld);
    this.honkHeld = honkLevel;
    this.honkQueued = false;
    if (honk && !this.finished) this.doHonk();

    if (this.phase === 'crash') {
      this.restartQueued = false;
      this.crashT += dt;
      this.stepAnimals(dt);
      if (this.crashT >= this.respawnDelay + FADE_S) this.respawn();
      this.stepCamera(dt);
      return;
    }

    if (this.fadeInT > 0) this.fadeInT = Math.max(0, this.fadeInT - dt);

    if (this.restartQueued) {
      this.restartQueued = false;
      if (!this.finished) {
        this.bike = crash(this.bike, 'restart');
        this.beginCrash();
        return;
      }
    }

    const prev = this.bike;
    const cfg = this.cfg;
    let b = step(prev, input, dt, TERRAIN, cfg);

    if (this.finished) {
      // After the line nothing can go wrong: a bad landing just settles the bike.
      if (b.crashed !== null) {
        const x = TERRAIN.surfaceY(b.x) === null ? prev.x : b.x;
        b = { ...createBikeState(x, TERRAIN, cfg), boost: b.boost };
      }
      // Pull up inside the gateway instead of rolling out to the end wall (matters after a boosted finish).
      if (b.grounded) {
        const cap = Math.sqrt(2 * FINISH_BRAKE * Math.max(0, FINISH.col * TILE + FINISH_STOP_PX - b.x));
        if (b.v > cap) b = { ...b, v: cap, vx: b.vx * (cap / b.v) };
      }
      this.bike = b;
      this.finishT += dt;
      if (!this.finishShown && this.finishT >= FINISH_SCREEN_DELAY_S) {
        this.finishShown = true;
        this.onFinishScreen();
      }
      this.stepAnimals(dt);
      this.stepCamera(dt);
      return;
    }

    // The warm-up is a no-crash zone: a bad landing taken off inside it is a wobble (upright, slowed).
    if (prev.grounded) this.lastGroundX = prev.x;
    let wobbled = false;
    if (b.crashed === 'landing' && this.lastGroundX < SAFE_X1) {
      b = wobbleLanding(b, cfg.monkeyStumbleFactor, TERRAIN);
      wobbled = true;
      this.wobbles++;
      this.view.stumble();
    }

    if (b.evHop) sfx.play('hop');
    if (b.evLanding === 'clean' || b.evLanding === 'safe') {
      const clean = b.evLanding === 'clean';
      sfx.play(clean ? 'clean' : 'thud');
      this.view.landed(!clean, b.x, b.y, b.evImpact);
      this.fx.landingPuff(b.x, b.y, b.evImpact, !clean);
      // Camera bump, scaled by how hard the bike came down (harder still for a rough landing).
      this.bumpV += b.evImpact * cfg.cameraBumpPerImpact * (clean ? 1 : 1.35);
      // One landing popup at a time: a flip replaces "CLEAN!" (the clean bonus still applies).
      if (b.evFlips !== 0) {
        const n = Math.abs(b.evFlips);
        this.flips += n;
        sfx.play('flip');
        this.popups.show(flipLabel(n), b.x, b.y - 36, undefined, 1.3, 'land');
      } else if (clean) {
        this.popups.show('CLEAN!', b.x, b.y - 36, undefined, undefined, 'land');
      } else if (wobbled) {
        this.popups.show('WOBBLE!', b.x, b.y - 36, PAL.cream, 1.1, 'land');
      }
    }

    if (b.crashed === null) b = this.collide(prev, b);
    this.bike = b;
    this.stepAnimals(dt);

    if (b.crashed !== null) {
      this.beginCrash();
    } else {
      this.checkProgress();
    }
    this.stepCamera(dt);
  }

  /** Obstacles, cow, monkeys and diyas against the bike box. */
  private collide(prev: BikeState, bike: BikeState): BikeState {
    let b = bike;
    const cfg = this.cfg;
    if (hitsObstacle(b, this.solid, cfg)) return crash(b, 'obstacle');

    // The boulder: any touch is a crash.
    const rock = this.boulder.box;
    if (rock && aabbOverlap(bikeAABB(b, cfg), rock)) return crash(b, 'obstacle');

    // A riser's slot has a stone floor: a bike that drops into it has hit the step. (It would hit the
    // riser's face or the kill plane a moment later anyway; this only keeps it from sinking into the stone.)
    const slot = TERRAIN.gapAt(b.x);
    if (slot !== null && slot.step && b.y > slot.nearY + cfg.wallTolerance) return crash(b, 'wall');

    // A log is not solid: riding into it is one stumble per contact.
    this.logs.forEach((log, i) => {
      const touching = aabbOverlap(bikeAABB(b, cfg), log.box);
      if (touching && !this.logTouch[i]) {
        b = stumble(b, cfg.monkeyStumbleFactor);
        this.stumbles++;
        this.view.stumble();
        sfx.play('thud');
        this.popup('BUMP!', log.box.x + log.box.w / 2, log.box.y - 14);
      }
      this.logTouch[i] = touching;
    });

    if (this.cow.solid && aabbOverlap(bikeAABB(b, cfg), this.cow.box)) {
      if (Math.abs(b.vx) > cfg.cowCrashSpeed) return crash(b, 'cow');
      // Slow contact: the cow is simply solid. Put the bike back beside her and stop it.
      const fromLeft = prev.x <= this.cow.x + COW.w / 2;
      const x = fromLeft ? this.cow.x - cfg.bikeHitW / 2 : this.cow.x + COW.w + cfg.bikeHitW / 2;
      b = { ...b, x, vx: 0, v: b.grounded ? 0 : Math.abs(b.vy) };
    }

    for (const m of this.troop.monkeys) {
      if (m.collidable && aabbOverlap(bikeAABB(b, cfg), m.box)) {
        b = stumble(b, cfg.monkeyStumbleFactor);
        this.stumbles++;
        m.leap();
        this.view.stumble();
        sfx.play('thud');
        this.popup('OOK!', m.centreX, BASELINE_Y - 22);
      }
    }

    for (const d of this.diyas) {
      if (!d.collected && touchesDiya(b, d, cfg)) {
        d.collect();
        this.diyaCount++;
        b = addBoost(b, cfg.boostDiya);
        sfx.play('diya');
        this.fx.sparkle(d.x, d.y);
        this.popup('+1', d.x, d.y - 10);
      }
    }
    return b;
  }

  private stepAnimals(dt: number): void {
    const b = this.bike;
    this.cow.step(dt, bikeAABB(b, this.cfg), this.phase === 'crash' ? Infinity : Math.hypot(b.vx, b.vy));
    this.troop.step(dt, this.phase === 'crash' ? -Infinity : b.x);
    // The boulder starts when the bike reaches its trigger; a rumble and a "!" give the warning.
    const ev = this.boulder.step(dt, this.phase === 'crash' || this.finished ? -Infinity : b.x, this.fx);
    if (ev === 'start') sfx.play('rumble');
    else if (ev === 'break') sfx.play('crumble');
  }

  private checkProgress(): void {
    const b = this.bike;
    for (const cp of this.checkpoints) {
      if (cp.id > this.checkpoint && b.x >= cp.x) {
        this.checkpoint = cp.id;
        cp.setLit(true);
        sfx.play('bell');
        this.popup('CHECKPOINT', cp.lampX, cp.y - 58);
        // A checkpoint's hint replaces the last one's; a checkpoint without one clears it (so "HOP UP
        // THE STEPS!" is gone by the terrace, where the next thing to read is the boulder's "!").
        if (cp.hint) this.showHint(cp.hint);
        else this.hintT = 0;
      }
    }
    if (b.x >= FINISH.col * TILE) {
      this.finished = true;
      this.finishT = 0;
      sfx.play('bell');
      this.scoreRun();
    }
  }

  private recordGhost(): void {
    if (this.ghostRec.length > GHOST_MAX_SAMPLES) return;
    const b = this.bike;
    this.ghostRec.push({ x: b.x, y: b.y, angle: b.angle });
  }

  /** At the line: medal, bests and the ghost. Storage failing changes nothing here. */
  private scoreRun(): void {
    const run = { timeMs: this.timeMs, diyas: this.diyaCount, flips: this.flips };
    const targets = this.bikeDef.medalsMs;
    const data: FinishData = {
      ...run, crashes: this.crashes, ranked: this.ranked, bike: this.bikeDef.id,
      medal: this.ranked ? medalFor(run.timeMs, targets) : null, next: this.ranked ? nextMedal(run.timeMs, targets) : null,
      prevBest: { timeMs: this.best.timeMs, diyas: this.best.diyas, flips: this.best.flips },
      newTime: false, newDiyas: false, newFlips: false, saved: false,
    };
    if (this.ranked) {
      this.recordGhost(); // the pose on the line closes the recording
      const ghost = this.ghostRec.length <= GHOST_MAX_SAMPLES ? encodeGhost(this.ghostRec) : '';
      const update = submitRun(this.best, run, ghost);
      data.newTime = update.newTime;
      data.newDiyas = update.newDiyas;
      data.newFlips = update.newFlips;
      sessionBest[this.bikeDef.id] = update.best;
      this.best = update.best;
      data.saved = saveBest(this.bikeDef.id, update.best);
      // One full run finished: the tutorial prompts are done (remembered when storage allows).
      if (!sessionTutorialDone) {
        sessionTutorialDone = true;
        savePrefs({ ...loadPrefs(), tutorialDone: true });
      }
    }
    this.finishData = data;
  }

  private doHonk(): void {
    sfx.play('honk');
    if (this.phase !== 'ride') return;
    const x = this.bike.x;
    this.troop.honked(x, this.cfg.honkRange);
    const cowMid = this.cow.x + COW.w / 2;
    if (Math.abs(x - cowMid) <= this.cfg.honkRange) this.cow.honked();
    this.popups.show('POM-POM!', x + 8, this.bike.y - 40, undefined, undefined, 'honk');
  }

  private beginCrash(): void {
    const b = this.bike;
    const cause = b.crashed ?? 'landing';
    this.phase = 'crash';
    this.crashT = 0;
    this.crashCause = cause;
    this.crashes++;
    const surf = TERRAIN.surfaceY(b.x);
    const slot = TERRAIN.gapAt(b.x);
    // Over water the bike sinks out of view; in a riser's dry slot it comes to rest on the lower step.
    const floor = surf !== null ? Math.max(surf, b.y) : slot !== null && slot.step ? slot.nearY : VIEW_H + 40;
    this.crashFrom = { x: b.x, y: b.y, vx: b.vx, angle: b.angle, floor };
    if (cause === 'restart') {
      this.respawnDelay = 0;
      return;
    }
    this.respawnDelay = this.cfg.respawnDelayMs / 1000;
    if (cause === 'water') {
      this.view.crashSplash(b.x, WATER_LINE_Y);
      sfx.play('splash');
    } else {
      this.view.crashSparks(b.x, b.y);
      sfx.play('crash');
    }
    this.cameras.main.shake(150, 0.012);
  }

  private respawn(): void {
    const cp = this.checkpoints[this.checkpoint]!;
    this.bike = createBikeState(cp.x, TERRAIN, this.cfg); // speed 0, boost full
    this.phase = 'ride';
    this.fadeInT = FADE_S;
    // Animals ahead of the checkpoint go back to their starting places.
    if (this.cow.homeX > cp.x) this.cow.reset();
    if (this.troop.triggerX > cp.x) this.troop.reset();
    if (this.boulder.triggerX > cp.x) this.boulder.reset();
    this.logTouch = [];
    this.lastGroundX = this.bike.x;
    this.view.reset();
    this.look = this.cfg.cameraLookAheadRest;
    this.bumpY = 0;
    this.bumpV = 0;
    this.camX = this.cameraTarget();
    if (cp.hint) this.showHint(cp.hint);
  }

  private cameraTarget(): number {
    const x = this.phase === 'crash' ? this.crashFrom.x : this.bike.x;
    return Phaser.Math.Clamp(x + this.look - VIEW_W / 2, 0, CAMERA_MAX_SCROLL_X);
  }

  /** Look-ahead for a speed: Rest at 0, cameraLookAhead at topSpeed, Boost at boostSpeed. */
  private lookFor(speed: number): number {
    const c = this.cfg;
    if (speed <= c.topSpeed) return c.cameraLookAheadRest + (c.cameraLookAhead - c.cameraLookAheadRest) * Math.max(0, speed / c.topSpeed);
    const k = Math.min(1, (speed - c.topSpeed) / (c.boostSpeed - c.topSpeed));
    return c.cameraLookAhead + (c.cameraLookAheadBoost - c.cameraLookAhead) * k;
  }

  private stepCamera(dt: number): void {
    // The look-ahead is smoothed first and the scroll second, so a sudden speed change (a landing,
    // a stumble) can never jerk the view. It is frozen during a crash.
    if (this.phase === 'ride') {
      const b = this.bike;
      const speed = b.grounded ? b.v : Math.abs(b.vx);
      this.look += (this.lookFor(speed) - this.look) * (1 - Math.exp(-dt / this.cfg.cameraLookSmoothS));
    }
    const k = 1 - Math.pow(1 - this.cfg.cameraLerp, dt * 60);
    this.camX += (this.cameraTarget() - this.camX) * k;

    // Landing bump: a damped spring back to rest.
    this.bumpV += (-BUMP_STIFFNESS * this.bumpY - BUMP_DAMPING * this.bumpV) * dt;
    this.bumpY += this.bumpV * dt;
    if (this.bumpY > this.cfg.cameraBumpMaxPx) { this.bumpY = this.cfg.cameraBumpMaxPx; this.bumpV = Math.min(0, this.bumpV); }
  }

  // ---------------------------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------------------------

  private popup(text: string, x: number, y: number): void {
    this.popups.show(text, x, y);
  }

  private showHint(text: string, seconds = 5): void {
    this.hintText = text;
    this.hintT = seconds;
  }

  private onFinishScreen(): void {
    if (this.finishData) this.scene.launch('Finish', this.finishData);
  }

  // ---------------------------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------------------------

  private renderFrame(dt: number): void {
    this.visT += dt;
    const t = this.visT;
    const cam = this.cameras.main;
    const scroll = Math.round(this.camX);
    cam.scrollX = scroll;
    // The bump only ever dips the view (world moves down), so nothing below the terrain is exposed.
    cam.scrollY = -Math.max(0, Math.round(this.bumpY));
    this.parallax.update(scroll, t);

    const b = this.bike;
    if (this.phase === 'crash') {
      this.drawTumble();
    } else {
      // Round relative to the camera so the bike does not shimmer against the scrolling world.
      const sx = scroll + Math.round(b.x - this.camX);
      const inp = this.lastInput;
      this.view.ride(sx, Math.round(b.y), b.angle, {
        throttle: inp.throttle === true && b.grounded,
        brake: inp.brake === true && b.grounded && b.v > 1,
        reversing: b.grounded && b.v < -1,
        footDown: b.grounded && Math.abs(b.v) < 2 && inp.throttle !== true && !b.boosting,
        boosting: b.boosting,
        grounded: b.grounded,
        v: b.grounded ? b.v : Math.abs(b.vx),
      }, dt);
    }

    // Ghost of the best run: same clock as the run timer; hidden after the line and when toggled off.
    this.ghostPose = this.ghostOn && !this.finished ? ghostPoseAt(this.ghostPoses, this.timerSteps / 120) : null;
    if (this.ghostPose) this.ghost.show(this.ghostPose.x, this.ghostPose.y, this.ghostPose.angle);
    else this.ghost.hide();

    for (const d of this.diyas) d.render(t, dt);
    for (const cp of this.checkpoints) cp.render(t);
    this.cow.render(t);
    this.troop.render(t);
    this.boulder.render(t, scroll, b.x);
    this.coracles.forEach((c, i) => {
      c.y = WATER_LINE_Y + 4 + Math.round(Math.sin(t * 1.3 + i * 2.1) * 1.4);
      c.rotation = Math.sin(t * 1.1 + i * 1.7) * 0.05;
    });
    this.glints.forEach((g, i) => {
      g.setAlpha(0.15 + 0.55 * Math.max(0, Math.sin(t * 2.4 + i * 1.9)));
    });

    let fade = 0;
    if (this.phase === 'crash') fade = Phaser.Math.Clamp((this.crashT - this.respawnDelay) / FADE_S, 0, 1);
    else if (this.fadeInT > 0) fade = this.fadeInT / FADE_S;
    this.fade.setAlpha(fade);

    this.popups.update(dt);
    this.fx.update(dt);
    const boostOn = this.phase === 'ride' && b.boosting;
    this.boostFx += ((boostOn ? 1 : 0) - this.boostFx) * Math.min(1, dt * (boostOn ? 9 : 5));
    this.streaks.update(t, this.boostFx);
    if (this.hintT > 0) this.hintT = Math.max(0, this.hintT - dt);
    const riding = this.phase === 'ride' && !this.paused && !(this.finished && b.v < 1);
    const inp = this.lastInput;
    sfx.setEngine(riding, Math.hypot(b.vx, b.vy) / this.cfg.topSpeed,
      !this.finished && (inp.throttle === true || b.boosting), b.boosting);

    // Music: lifted while boosting, a little on the river run-up.
    const riverRunUp = this.checkpoint === this.checkpoints.length - 1 && !this.finished;
    setMusicIntensity(boostOn ? 1 : riverRunUp ? 0.55 : 0);
    tickMusic();

    if (this.debugGfx) this.drawDebug();
  }

  /** Crash animation: an arc and a spin, or a sink into the water. Purely visual. */
  private drawTumble(): void {
    const c = this.crashFrom;
    const t = this.crashT;
    if (this.crashCause === 'restart') {
      this.view.pose(Math.round(c.x), Math.round(c.y), c.angle, 1);
      return;
    }
    if (this.crashCause === 'water') {
      const k = Math.min(1, t / 0.5);
      this.view.pose(Math.round(c.x + c.vx * 0.08 * k), Math.round(c.y + 30 * k), c.angle - 60 * k, 1 - k);
      return;
    }
    const s = Math.min(1, t / 0.8);
    // Bad landings tumble on forward; hitting something solid bounces the bike back.
    const dir = this.crashCause === 'landing' ? 1 : -1;
    const x = c.x + dir * 34 * s;
    const y = Math.min(c.floor, c.y - 4 * 26 * s * (1 - s) + (c.floor - c.y) * s);
    const angle = c.angle - dir * 540 * s + (s >= 1 ? 90 : 0);
    this.view.pose(Math.round(x), Math.round(y - (s >= 1 ? 4 : 0)), angle, 1);
  }

  private drawDebug(): void {
    const g = this.debugGfx!;
    const b = this.bike;
    g.clear();
    const x0 = this.cameras.main.scrollX;
    // terrain line
    g.lineStyle(1, 0x00ffff, 1);
    for (const p of TERRAIN.pieces) {
      if (p.x1 < x0 || p.x0 > x0 + VIEW_W) continue;
      g.lineBetween(p.x0, p.y0, p.x1, p.y1);
    }
    for (const c of TERRAIN.cliffs) g.lineBetween(c.x, c.topY, c.x, c.bottomY);
    g.lineStyle(1, 0xff00ff, 1);
    for (const gap of TERRAIN.gaps) g.lineBetween(gap.x0, 230, gap.x1, 230);
    // hitboxes
    g.lineStyle(1, 0xff3030, 1);
    for (const o of this.obstacles) {
      g.lineStyle(1, o.solid ? 0xff3030 : 0xff9a4a, 1);
      g.strokeRect(o.box.x + 0.5, o.box.y + 0.5, o.box.w - 1, o.box.h - 1);
    }
    g.lineStyle(1, 0xff3030, 1);
    const rock = this.boulder.box;
    if (rock) g.strokeRect(rock.x + 0.5, rock.y + 0.5, rock.w - 1, rock.h - 1);
    if (this.cow.solid) { const c = this.cow.box; g.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1); }
    for (const m of this.troop.monkeys) {
      if (m.collidable) g.strokeRect(m.box.x + 0.5, m.box.y + 0.5, m.box.w - 1, m.box.h - 1);
    }
    g.lineStyle(1, 0xffff00, 1);
    for (const d of this.diyas) if (!d.collected) g.strokeCircle(d.x, d.y, this.cfg.diyaRadius);
    for (const cp of this.checkpoints) g.lineBetween(cp.x, cp.y - 52, cp.x, cp.y);
    g.lineBetween(FINISH.col * TILE, 0, FINISH.col * TILE, VIEW_H);
    g.lineStyle(1, 0x00ff00, 1);
    const box = bikeAABB(b, this.cfg);
    g.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);

    const f = (n: number): string => n.toFixed(1);
    this.debugText!.setText([
      `FPS ${Math.round(this.game.loop.actualFps)}`,
      `X ${f(b.x)} Y ${f(b.y)}`,
      `V ${f(b.v)} VX ${f(b.vx)} VY ${f(b.vy)}`,
      `ANG ${f(b.angle)} ${b.grounded ? 'GROUND' : 'AIR'}`,
      `BOOST ${b.boost.toFixed(2)} CP ${this.checkpoint} ${this.bikeDef.name}`,
      `${this.phase.toUpperCase()}${this.finished ? ' FINISHED' : ''}`,
    ]);
  }
}
