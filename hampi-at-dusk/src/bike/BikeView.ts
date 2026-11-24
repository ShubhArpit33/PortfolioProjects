// The bike as drawn: a body sprite plus two wheels rotated by code, with lean, bob, exhaust puffs,
// dust and landing sparks (GAME_SPEC.md section 6.3). Purely visual; reads the physics state.

import Phaser from 'phaser';
import { fxHash } from '../art/Fx';

const WHEEL_R = 6;
const WHEEL_DX = 13;
const DEG = Math.PI / 180;
/** x of the planted foot, relative to the wheel-contact midpoint */
const LEG_X = -1;

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

/** The ghost of the best run: a translucent bike with no effects and no collisions. */
export class GhostBike {
  private container: Phaser.GameObjects.Container;
  private rear: Phaser.GameObjects.Image;
  private front: Phaser.GameObjects.Image;
  private lastX = 0;
  private spin = 0;

  constructor(scene: Phaser.Scene, depth: number) {
    this.rear = scene.add.image(-WHEEL_DX, -WHEEL_R, 'wheel');
    this.front = scene.add.image(WHEEL_DX, -WHEEL_R, 'wheel');
    const body = scene.add.image(0, -WHEEL_R, 'bike_body').setOrigin(0.5, 1);
    this.container = scene.add.container(0, 0, [this.rear, this.front, body]).setDepth(depth).setAlpha(0.45).setVisible(false);
  }

  show(x: number, y: number, angleDeg: number): void {
    // Wheels turn with the distance covered since the last frame.
    this.spin += (x - this.lastX) / WHEEL_R;
    this.lastX = x;
    this.rear.rotation = this.spin;
    this.front.rotation = this.spin;
    this.container.setVisible(true).setPosition(Math.round(x), Math.round(y));
    this.container.rotation = -angleDeg * DEG;
  }

  hide(): void {
    this.container.setVisible(false);
  }
}

export class BikeView {
  readonly container: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private rear: Phaser.GameObjects.Image;
  private front: Phaser.GameObjects.Image;
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

  constructor(scene: Phaser.Scene, depth: number, fxDepth: number) {
    this.rear = scene.add.image(-WHEEL_DX, -WHEEL_R, 'wheel');
    this.front = scene.add.image(WHEEL_DX, -WHEEL_R, 'wheel');
    this.body = scene.add.image(0, -WHEEL_R, 'bike_body').setOrigin(0.5, 1);
    // The rider's leg reaching the ground (shown at a standstill and while backing up).
    this.leg = scene.add.image(LEG_X, 0, 'rider_leg').setOrigin(0.5, 1).setVisible(false);
    // Boost flame at the exhaust tip (flickers while boosting).
    this.flame = scene.add.sprite(-19, -9, 'flame', 0).setOrigin(1, 0.5).setVisible(false);
    this.container = scene.add.container(0, 0, [this.flame, this.rear, this.front, this.body, this.leg]).setDepth(depth);

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
    this.rear.rotation = this.spin;
    this.front.rotation = this.spin;

    // Foot down; it shuffles back and forth with the distance covered while backing up.
    this.leg.setVisible(drive.footDown || drive.reversing);
    if (drive.reversing) this.paddle += Math.abs(drive.v) * dt * 0.5;
    else this.paddle = 0;
    this.leg.x = LEG_X + (drive.reversing ? Math.round(Math.sin(this.paddle) * 2) : 0);
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
      const [ex, ey] = at(-19, -9);
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
    this.leg.setVisible(false);
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
