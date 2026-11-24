// The stage. All gameplay state advances in fixedStep() (1/120 s, sim time only), so the game is
// deterministic and can be driven by window.__test.step. Everything visual happens in renderFrame().

import Phaser from 'phaser';
import { DEPTH, Parallax } from '../art/Parallax';
import { PAL } from '../art/palette';
import * as sfx from '../audio/sfx';
import {
  FIXED_DT, aabbOverlap, addBoost, bikeAABB, crash, createBikeState, hitsObstacle, step, touchesDiya,
  type BikeState, type CrashCause,
} from '../bike/BikePhysics';
import { BikeView } from '../bike/BikeView';
import { CONFIG } from '../config';
import { Checkpoint } from '../entities/Checkpoint';
import { Cow } from '../entities/Cow';
import { Diya } from '../entities/Diya';
import { MonkeyTroop } from '../entities/Monkey';
import { Obstacle } from '../entities/Obstacle';
import { URL_DEBUG, onKeyPress, runtime, testInput, type GameInput } from '../input';
import {
  BASELINE_Y, CAMERA_MAX_SCROLL_X, CHECKPOINTS, COW, DIYAS, FINISH, OBSTACLES, TILE, WATER_LINE_Y,
} from '../level/levelData';
import { TERRAIN } from '../level/terrain';
import { addTerrain } from '../level/terrainView';
import { Popups } from '../ui/Popups';
import type { FinishData } from './Finish';

const VIEW_W = 480;
const VIEW_H = 270;
const FADE_S = 0.25;
/** Sim seconds between crossing the finish line and the finish screen. */
const FINISH_SCREEN_DELAY_S = 1.2;

type Phase = 'ride' | 'crash';

export interface GameSnapshot {
  x: number; y: number; vx: number; vy: number; v: number; angle: number;
  grounded: boolean; boost: number; crashed: boolean; crashes: number; diyas: number;
  finished: boolean; checkpoint: number; timeMs: number;
}

export class GameScene extends Phaser.Scene {
  // --- sim state ---
  bike!: BikeState;
  phase: Phase = 'ride';
  checkpoint = 0;
  crashes = 0;
  diyaCount = 0;
  finished = false;
  paused = false;
  /** HUD hint (cp4): text and seconds left */
  hintText = '';
  hintT = 0;
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
  private honkHeld = false;
  private honkQueued = false;
  private restartQueued = false;
  private lastInput: GameInput = {};
  private startCp = 0;

  // --- views ---
  private acc = 0;
  private visT = 0;
  private parallax!: Parallax;
  private popups!: Popups;
  private view!: BikeView;
  private diyas: Diya[] = [];
  private obstacles: Obstacle[] = [];
  private checkpoints: Checkpoint[] = [];
  private cow!: Cow;
  private troop!: MonkeyTroop;
  private coracles: Phaser.GameObjects.Image[] = [];
  private glints: Phaser.GameObjects.Image[] = [];
  private fade!: Phaser.GameObjects.Rectangle;
  private keys!: Record<'right' | 'left' | 'up' | 'down' | 'space' | 'shift', Phaser.Input.Keyboard.Key>;
  private debugGfx: Phaser.GameObjects.Graphics | null = null;
  private debugText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('Game');
  }

  init(data: { cp?: number }): void {
    this.startCp = Math.min(CHECKPOINTS.length - 1, Math.max(0, data?.cp ?? 0));
    this.phase = 'ride';
    this.checkpoint = this.startCp;
    this.crashes = 0;
    this.diyaCount = 0;
    this.finished = false;
    this.paused = false;
    this.hintText = '';
    this.hintT = 0;
    this.timerSteps = 0;
    this.crashT = 0;
    this.fadeInT = 0;
    this.finishT = 0;
    this.finishShown = false;
    this.honkHeld = false;
    this.honkQueued = false;
    this.restartQueued = false;
    this.lastInput = {};
    this.acc = 0;
    this.visT = 0;
    this.diyas = [];
    this.obstacles = [];
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
      const n = Math.max(2, Math.round((g.x1 - g.x0) / 24));
      for (let i = 0; i < n; i++) {
        const x = g.x0 + 6 + ((i + 0.5) * (g.x1 - g.x0 - 12)) / n;
        const y = WATER_LINE_Y + 5 + ((i * 7) % 5) * 7;
        this.glints.push(this.add.image(Math.round(x), y, 'p_glint').setDepth(DEPTH.deco - 0.5));
      }
    }

    this.add.image(FINISH.col * TILE, BASELINE_Y, 'gateway').setOrigin(0, 1).setDepth(DEPTH.deco);
    this.checkpoints = CHECKPOINTS.map((def) => new Checkpoint(this, def, DEPTH.checkpoint));
    this.obstacles = OBSTACLES.map((def) => new Obstacle(this, def, DEPTH.obstacle));
    this.cow = new Cow(this, DEPTH.animal);
    this.troop = new MonkeyTroop(this, DEPTH.animal);
    this.diyas = DIYAS.map((def, i) => new Diya(this, def, i, DEPTH.diya));
    this.view = new BikeView(this, DEPTH.bike, DEPTH.fx);
    this.popups = new Popups(this, DEPTH.popup);
    this.fade = this.add.rectangle(0, 0, VIEW_W, VIEW_H, PAL.ink).setOrigin(0, 0).setScrollFactor(0)
      .setDepth(DEPTH.fade).setAlpha(0);

    for (const cp of this.checkpoints) cp.setLit(cp.id <= this.checkpoint);
    this.bike = createBikeState(this.checkpoints[this.checkpoint]!.x);
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
    onKeyPress(this, 'R', () => { if (!this.paused) this.restartQueued = true; });
    onKeyPress(this, 'P', () => this.togglePause());
    onKeyPress(this, 'ESC', () => this.togglePause());

    if (URL_DEBUG) {
      this.debugGfx = this.add.graphics().setDepth(DEPTH.debug);
      this.debugText = this.add.text(4, 44, '', {
        fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#f3ead7', backgroundColor: '#1a1020',
      }).setScrollFactor(0).setDepth(DEPTH.debug).setLineSpacing(2);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => sfx.setEngine(false));
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
      finished: this.finished, checkpoint: this.checkpoint, timeMs: this.timeMs,
    };
  }

  /** Run n fixed steps right now (used by window.__test.step). */
  simulate(n: number): void {
    this.paused = false;
    for (let i = 0; i < n; i++) this.fixedStep();
  }

  togglePause(): void {
    if (this.finished) return;
    this.paused = !this.paused;
  }

  // ---------------------------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------------------------

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1);
    if (runtime.manual) {
      // __test.step already ran the fixed steps; this frame only draws.
      this.renderFrame(dt);
      return;
    }
    if (this.paused) {
      sfx.setEngine(false);
      this.renderFrame(0);
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
    if (!this.finished) this.timerSteps++;

    const input: GameInput = this.finished ? { brake: true } : this.readInput();
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
    let b = step(prev, input, dt);

    if (this.finished) {
      // After the line nothing can go wrong: a bad landing just settles the bike.
      if (b.crashed !== null) {
        const x = TERRAIN.surfaceY(b.x) === null ? prev.x : b.x;
        b = { ...createBikeState(x), boost: b.boost };
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

    if (b.evHop) sfx.play('hop');
    if (b.evLanding === 'clean') {
      sfx.play('clean');
      this.view.landed(false, b.x, b.y);
      this.popup('CLEAN!', b.x, b.y - 36);
    } else if (b.evLanding === 'safe') {
      sfx.play('thud');
      this.view.landed(true, b.x, b.y);
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
    if (hitsObstacle(b, this.obstacles.map((o) => o.box))) return crash(b, 'obstacle');

    if (this.cow.solid && aabbOverlap(bikeAABB(b), this.cow.box)) {
      if (Math.abs(b.vx) > CONFIG.cowCrashSpeed) return crash(b, 'cow');
      // Slow contact: the cow is simply solid. Put the bike back beside her and stop it.
      const fromLeft = prev.x <= this.cow.x + COW.w / 2;
      const x = fromLeft ? this.cow.x - CONFIG.bikeHitW / 2 : this.cow.x + COW.w + CONFIG.bikeHitW / 2;
      b = { ...b, x, vx: 0, v: b.grounded ? 0 : Math.abs(b.vy) };
    }

    for (const m of this.troop.monkeys) {
      if (m.collidable && aabbOverlap(bikeAABB(b), m.box)) {
        const f = CONFIG.monkeyStumbleFactor;
        b = { ...b, v: b.v * f, vx: b.vx * f };
        m.leap();
        this.view.stumble();
        sfx.play('thud');
        this.popup('OOK!', m.centreX, BASELINE_Y - 22);
      }
    }

    for (const d of this.diyas) {
      if (!d.collected && touchesDiya(b, d)) {
        d.collect();
        this.diyaCount++;
        b = addBoost(b, CONFIG.boostDiya);
        sfx.play('diya');
        this.popup('+1', d.x, d.y - 10);
      }
    }
    return b;
  }

  private stepAnimals(dt: number): void {
    const b = this.bike;
    this.cow.step(dt, bikeAABB(b), this.phase === 'crash' ? Infinity : Math.hypot(b.vx, b.vy));
    this.troop.step(dt, this.phase === 'crash' ? -Infinity : b.x);
  }

  private checkProgress(): void {
    const b = this.bike;
    for (const cp of this.checkpoints) {
      if (cp.id > this.checkpoint && b.x >= cp.x) {
        this.checkpoint = cp.id;
        cp.setLit(true);
        sfx.play('bell');
        this.popup('CHECKPOINT', cp.x, cp.y - 58);
        if (cp.hint) this.showHint(cp.hint);
      }
    }
    if (b.x >= FINISH.col * TILE) {
      this.finished = true;
      this.finishT = 0;
      sfx.play('bell');
    }
  }

  private doHonk(): void {
    sfx.play('honk');
    if (this.phase !== 'ride') return;
    const x = this.bike.x;
    this.troop.honked(x, CONFIG.honkRange);
    const cowMid = this.cow.x + COW.w / 2;
    if (Math.abs(x - cowMid) <= CONFIG.honkRange) this.cow.honked();
    this.popup('POM-POM!', x + 8, this.bike.y - 40);
  }

  private beginCrash(): void {
    const b = this.bike;
    const cause = b.crashed ?? 'landing';
    this.phase = 'crash';
    this.crashT = 0;
    this.crashCause = cause;
    this.crashes++;
    const surf = TERRAIN.surfaceY(b.x);
    this.crashFrom = { x: b.x, y: b.y, vx: b.vx, angle: b.angle, floor: surf === null ? VIEW_H + 40 : Math.max(surf, b.y) };
    if (cause === 'restart') {
      this.respawnDelay = 0;
      return;
    }
    this.respawnDelay = CONFIG.respawnDelayMs / 1000;
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
    this.bike = createBikeState(cp.x); // speed 0, boost full
    this.phase = 'ride';
    this.fadeInT = FADE_S;
    // Animals ahead of the checkpoint go back to their starting places.
    if (this.cow.homeX > cp.x) this.cow.reset();
    if (this.troop.triggerX > cp.x) this.troop.reset();
    this.view.reset();
    this.camX = this.cameraTarget();
    if (cp.hint) this.showHint(cp.hint);
  }

  private cameraTarget(): number {
    const x = this.phase === 'crash' ? this.crashFrom.x : this.bike.x;
    return Phaser.Math.Clamp(x + CONFIG.cameraLookAhead - VIEW_W / 2, 0, CAMERA_MAX_SCROLL_X);
  }

  private stepCamera(dt: number): void {
    const k = 1 - Math.pow(1 - CONFIG.cameraLerp, dt * 60);
    this.camX += (this.cameraTarget() - this.camX) * k;
  }

  // ---------------------------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------------------------

  private popup(text: string, x: number, y: number): void {
    this.popups.show(text, x, y);
  }

  private showHint(text: string): void {
    this.hintText = text;
    this.hintT = 5;
  }

  private onFinishScreen(): void {
    const data: FinishData = { timeMs: this.timeMs, diyas: this.diyaCount, crashes: this.crashes };
    this.scene.launch('Finish', data);
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
    this.parallax.update(scroll);

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
        boosting: b.boosting,
        grounded: b.grounded,
        v: b.grounded ? b.v : Math.abs(b.vx),
      }, dt);
    }

    for (const d of this.diyas) d.render(t, dt);
    for (const cp of this.checkpoints) cp.render(t);
    this.cow.render(t);
    this.troop.render(t);
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
    if (this.hintT > 0) this.hintT = Math.max(0, this.hintT - dt);
    const riding = this.phase === 'ride' && !this.paused && !(this.finished && b.v < 1);
    const inp = this.lastInput;
    sfx.setEngine(riding, Math.hypot(b.vx, b.vy) / CONFIG.topSpeed,
      !this.finished && (inp.throttle === true || b.boosting), b.boosting);

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
    for (const o of this.obstacles) g.strokeRect(o.box.x + 0.5, o.box.y + 0.5, o.box.w - 1, o.box.h - 1);
    if (this.cow.solid) { const c = this.cow.box; g.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1); }
    for (const m of this.troop.monkeys) {
      if (m.collidable) g.strokeRect(m.box.x + 0.5, m.box.y + 0.5, m.box.w - 1, m.box.h - 1);
    }
    g.lineStyle(1, 0xffff00, 1);
    for (const d of this.diyas) if (!d.collected) g.strokeCircle(d.x, d.y, CONFIG.diyaRadius);
    for (const cp of this.checkpoints) g.lineBetween(cp.x, cp.y - 52, cp.x, cp.y);
    g.lineBetween(FINISH.col * TILE, 0, FINISH.col * TILE, VIEW_H);
    g.lineStyle(1, 0x00ff00, 1);
    const box = bikeAABB(b);
    g.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);

    const f = (n: number): string => n.toFixed(1);
    this.debugText!.setText([
      `FPS ${Math.round(this.game.loop.actualFps)}`,
      `X ${f(b.x)} Y ${f(b.y)}`,
      `V ${f(b.v)} VX ${f(b.vx)} VY ${f(b.vy)}`,
      `ANG ${f(b.angle)} ${b.grounded ? 'GROUND' : 'AIR'}`,
      `BOOST ${b.boost.toFixed(2)} CP ${this.checkpoint}`,
      `${this.phase.toUpperCase()}${this.finished ? ' FINISHED' : ''}`,
    ]);
  }
}
