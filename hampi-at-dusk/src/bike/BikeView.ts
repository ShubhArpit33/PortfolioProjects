// The bike as drawn: a body sprite plus two wheels rotated by code, with lean, bob, exhaust puffs,
// dust and landing sparks (GAME_SPEC.md section 6.3). Purely visual; reads the physics state.

import Phaser from 'phaser';
import { fxHash } from '../art/Fx';
import type { BikeId } from './bikes';
import { BikeRig, WHEEL_DX, WHEEL_R, type BikeSprite } from './sprites';

const DEG = Math.PI / 180;

export interface BikeDrive {
  throttle: boolean;
  brake: boolean;
  /** backing up (paddling with the feet) */
  reversing: boolean;
  /** stopped or backing up: the rider has a foot on the ground */
  footDown: boolean;
  boosting: boolean;
  grounded: boolean;
  /** speed along the ground (px/s) */
  v: number;
}

/** The ghost of the best run: the same bike, translucent, with no effects and no collisions. */
export class GhostBike {
  private rig: BikeRig;
  private lastX = 0;
  private spin = 0;

  constructor(scene: Phaser.Scene, depth: number, bike: BikeId) {
    this.rig = new BikeRig(scene, bike);
    this.rig.container.setDepth(depth).setAlpha(0.45).setVisible(false);
  }

  show(x: number, y: number, angleDeg: number): void {
    // Wheels turn with the distance covered since the last frame.
    this.spin += (x - this.lastX) / WHEEL_R;
    this.lastX = x;
    this.rig.setWheelSpin(this.spin);
    this.rig.container.setVisible(true).setPosition(Math.round(x), Math.round(y));
    this.rig.container.rotation = -angleDeg * DEG;
  }

  hide(): void {
    this.rig.container.setVisible(false);
  }
}

/**
 * A bike standing on the select screen, drawn large: idling (a 1 px engine shudder), and with the
 * wheels turning and the rider leaning into it while it is the selected one.
 */
export class BikePreview {
  private rig: BikeRig;
  private t = 0;
  private spin = 0;
  private rev = 0; // 0..1, eases toward 1 while selected

  constructor(scene: Phaser.Scene, bike: BikeId, x: number, y: number, scale: number, depth: number) {
    this.rig = new BikeRig(scene, bike);
    this.rig.container.setPosition(x, y).setScale(scale).setDepth(depth);
  }

  update(dt: number, selected: boolean): void {
    this.t += dt;
    this.rev += ((selected ? 1 : 0) - this.rev) * Math.min(1, dt * 6);
    this.spin += dt * 16 * this.rev;
    this.rig.setWheelSpin(this.spin);
    // Idle shudder: the body drops 1 px a few times a second; faster while revving.
    const beat = Math.floor(this.t * (selected ? 9 : 4));
    this.rig.body.y = -WHEEL_R + (beat % 2 === 0 ? 0 : 1);
    this.rig.body.rotation = -3 * this.rev * DEG;
    this.rig.setFootDown(!selected);
    this.rig.container.setAlpha(selected ? 1 : 0.7);
  }
}

export class BikeView {
  readonly container: Phaser.GameObjects.Container;
  private rig: BikeRig;
  private sprite: BikeSprite;
  private body: Phaser.GameObjects.Image;
  private leg: Phaser.GameObjects.Image;
  private flame: Phaser.GameObjects.Sprite;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private splash: Phaser.GameObjects.Particles.ParticleEmitter;

  private lean = 0;        // degrees, positive = leaning back
  private spin = 0;        // wheel rotation, radians
  private bobT = 0;
  private squash = 0;      // px, decays after a landing
  private wobbleT = 0;     // seconds left of the stumble wobble
  private smokeAcc = 0;
  private dustAcc = 0;
  private paddle = 0;      // phase of the backing-up foot shuffle, radians
  private flameT = 0;      // game time spent boosting, drives the flame flicker

  constructor(scene: Phaser.Scene, depth: number, fxDepth: number, bike: BikeId) {
    const rig = this.rig = new BikeRig(scene, bike);
    this.sprite = rig.sprite;
    this.body = rig.body;
    this.leg = rig.leg;     // the rider's leg reaching the ground (shown at a standstill and while backing up)
    this.flame = rig.flame; // boost flame at the exhaust tip (flickers while boosting)
    this.container = rig.container.setDepth(depth);

    this.smoke = scene.add.particles(0, 0, 'p_smoke', {
      lifespan: { min: 260, max: 460 }, speedX: { min: -50, max: -15 }, speedY: { min: -26, max: -6 },
      alpha: { start: 0.9, end: 0 }, scale: { start: 1, end: 2 }, emitting: false,
    }).setDepth(fxDepth);
    this.dust = scene.add.particles(0, 0, 'p_dust', {
      lifespan: { min: 220, max: 420 }, speedX: { min: -60, max: -10 }, speedY: { min: -40, max: -5 },
      gravityY: 160, alpha: { start: 0.9, end: 0 }, emitting: false,
    }).setDepth(fxDepth);
    this.sparks = scene.add.particles(0, 0, 'p_spark', {
      lifespan: { min: 200, max: 520 }, speed: { min: 40, max: 170 }, angle: { min: 180, max: 360 },
      gravityY: 420, alpha: { start: 1, end: 0 }, emitting: false,
    }).setDepth(fxDepth);
    this.splash = scene.add.particles(0, 0, 'p_splash', {
      lifespan: { min: 350, max: 750 }, speedX: { min: -70, max: 70 }, speedY: { min: -210, max: -60 },
      gravityY: 520, alpha: { start: 1, end: 0.2 }, emitting: false,
    }).setDepth(fxDepth);
  }

  /** Freeze / unfreeze the particles (they run on Phaser's frame clock, not on game time). */
  setPaused(on: boolean): void {
    for (const e of [this.smoke, this.dust, this.sparks, this.splash]) {
      if (on) e.pause();
      else e.resume();
    }
  }

  /** Normal riding pose. dt is the visual frame time in seconds. */
  ride(x: number, y: number, angleDeg: number, drive: BikeDrive, dt: number): void {
    const c = this.container;
    c.setVisible(true).setAlpha(1);
    c.setPosition(x, y);
    c.rotation = -angleDeg * DEG;

    // Lean back under throttle / boost, forward under braking.
    const target = drive.brake ? -4 : drive.boosting ? 6 : drive.reversing ? 5 : drive.throttle ? 3 : 0;
    this.lean += (target - this.lean) * Math.min(1, dt * 10);
    this.squash = Math.max(0, this.squash - dt * 14);
    this.wobbleT = Math.max(0, this.wobbleT - dt);
    const wobble = this.wobbleT > 0 ? Math.sin(this.wobbleT * 34) * 10 * (this.wobbleT / 0.6) : 0;

    // 1 px rider bob at speed.
    this.bobT += dt * (drive.v / 240) * 9;
    const bob = drive.grounded && drive.v > 30 && Math.sin(this.bobT * Math.PI) > 0 ? 1 : 0;

    this.body.rotation = -(this.lean + wobble) * DEG;
    this.body.y = -WHEEL_R + bob + Math.round(this.squash);

    // drive.v is negative while backing up, so the wheels turn backwards.
    this.spin += (drive.v / WHEEL_R) * dt;
    this.rig.setWheelSpin(this.spin);

    // Foot down; it shuffles back and forth with the distance covered while backing up.
    this.rig.setFootDown(drive.footDown || drive.reversing);
    if (drive.reversing) this.paddle += Math.abs(drive.v) * dt * 0.5;
    else this.paddle = 0;
    this.leg.x = this.sprite.legX + (drive.reversing ? Math.round(Math.sin(this.paddle) * 2) : 0);
    this.leg.y = drive.reversing && Math.cos(this.paddle) > 0.6 ? -1 : 0;

    // Boost flame: two frames and a stretch, re-rolled 30 times a second of game time.
    this.flame.setVisible(drive.boosting);
    if (drive.boosting) {
      this.flameT += dt;
      const tick = Math.floor(this.flameT * 30);
      const roll = fxHash(tick, 5);
      this.flame.setFrame(roll < 0.3 ? 1 : 0);
      this.flame.setScale(1 + 0.6 * fxHash(tick, 6), 1);
      this.flame.setAlpha(0.75 + 0.25 * fxHash(tick, 7));
    }

    // Exhaust puffs scale with throttle; dust trail when grounded and fast.
    const cos = Math.cos(c.rotation), sin = Math.sin(c.rotation);
    const at = (lx: number, ly: number): [number, number] => [x + lx * cos - ly * sin, y + lx * sin + ly * cos];
    const puffRate = drive.boosting ? 46 : drive.throttle ? 20 : 4;
    this.smokeAcc += dt * puffRate;
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1;
      const [ex, ey] = at(this.sprite.exhaustX, this.sprite.exhaustY);
      this.smoke.emitParticleAt(ex, ey, 1);
    }
    if (drive.grounded && drive.v > 150) {
      this.dustAcc += dt * (drive.v / 240) * 26;
      while (this.dustAcc >= 1) {
        this.dustAcc -= 1;
        const [dx, dy] = at(-WHEEL_DX - 2, -1);
        this.dust.emitParticleAt(dx, dy, 1);
      }
    }
  }

  /** Free pose used by the crash tumble. */
  pose(x: number, y: number, angleDeg: number, alpha: number): void {
    this.container.setVisible(alpha > 0).setAlpha(alpha);
    this.container.setPosition(x, y);
    this.container.rotation = -angleDeg * DEG;
    this.body.rotation = 0;
    this.body.y = -WHEEL_R;
    this.rig.setFootDown(false);
    this.flame.setVisible(false);
  }

  /** Landing squash (deeper for harder landings) and sparks on a hard one. The dust is drawn by Fx. */
  landed(hard: boolean, x: number, y: number, impact = 280): void {
    this.squash = Math.min(4, (hard ? 3 : 2) * Math.max(0.5, impact / 280));
    if (hard) this.sparks.emitParticleAt(x, y - 2, 8);
  }

  stumble(): void {
    this.wobbleT = 0.6;
  }

  crashSparks(x: number, y: number): void {
    this.sparks.emitParticleAt(x, y - 8, 26);
    this.dust.emitParticleAt(x, y - 2, 10);
  }

  crashSplash(x: number, y: number): void {
    this.splash.emitParticleAt(x, y, 34);
  }

  reset(): void {
    this.lean = 0;
    this.squash = 0;
    this.wobbleT = 0;
    this.paddle = 0;
  }
}
