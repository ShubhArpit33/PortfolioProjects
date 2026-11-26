// A monkey troop (Hampi: in the Fallen Pavilion). Triggered by the bike, they run in and sit on the road.
// A honk in range makes them leap away; contact is a single stumble per monkey, never a crash.
import Phaser from 'phaser';
import { followKey, keyUnder } from '../art/look/bake';
import { BASELINE_Y, TILE, type MonkeysDef } from '../level/level';
import type { Box } from '../level/terrain';

type MonkeyState = 'hidden' | 'run' | 'sit' | 'leap' | 'gone';

export class Monkey {
  state: MonkeyState = 'hidden';
  x: number;               // left edge of the 12x12 hitbox
  private leapT = 0;
  private sprite: Phaser.GameObjects.Sprite;
  private key: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, private def: MonkeysDef, private spawnX: number, private sitX: number, depth: number, private seed: number) {
    this.x = spawnX;
    this.sprite = scene.add.sprite(0, 0, 'monkey', 0).setOrigin(0.5, 1).setDepth(depth).setVisible(false);
    this.key = keyUnder(scene, this.sprite);
  }

  get collidable(): boolean {
    return this.state === 'run' || this.state === 'sit';
  }

  get centreX(): number {
    return this.x + this.def.hitW / 2;
  }

  get box(): Box {
    return { x: this.x, y: BASELINE_Y - this.def.hitH, w: this.def.hitW, h: this.def.hitH };
  }

  reset(): void {
    this.state = 'hidden';
    this.x = this.spawnX;
    this.leapT = 0;
  }

  spawn(): void {
    if (this.state === 'hidden') this.state = 'run';
  }

  /** Leap away: non-collidable at once. */
  leap(): void {
    if (this.collidable) {
      this.state = 'leap';
      this.leapT = 0;
    }
  }

  step(dt: number): void {
    if (this.state === 'run') {
      this.x -= this.def.runSpeed * dt;
      if (this.x <= this.sitX) {
        this.x = this.sitX;
        this.state = 'sit';
      }
    } else if (this.state === 'leap') {
      this.leapT += dt;
      if (this.leapT >= 0.7) this.state = 'gone';
    }
  }

  render(t: number): void {
    const s = this.sprite;
    if (this.state === 'hidden' || this.state === 'gone') {
      s.setVisible(false);
      this.key.setVisible(false);
      return;
    }
    s.setVisible(true).setAlpha(1);
    let x = this.centreX;
    let y = BASELINE_Y;
    if (this.state === 'run') {
      s.setFrame(0);
      y -= Math.sin(t * 16 + this.seed) > 0 ? 1 : 0;
    } else if (this.state === 'sit') {
      s.setFrame(1);
    } else {
      // leap: an arc up and away (into the ruins behind the road)
      const k = this.leapT / 0.7;
      s.setFrame(0);
      x += 46 * k;
      y -= 70 * k * (1.6 - k);
      s.setAlpha(1 - k * k);
    }
    s.setPosition(Math.round(x), Math.round(y));
    followKey(this.key, s);
  }
}

export class MonkeyTroop {
  readonly monkeys: Monkey[];
  readonly triggerX: number;
  triggered = false;

  constructor(scene: Phaser.Scene, def: MonkeysDef, depth: number) {
    this.triggerX = def.triggerCol * TILE;
    this.monkeys = def.spawnCols.map(
      (col, i) => new Monkey(scene, def, col * TILE, def.sitCols[i]! * TILE, depth, i * 2.1),
    );
  }

  reset(): void {
    this.triggered = false;
    for (const m of this.monkeys) m.reset();
  }

  step(dt: number, bikeX: number): void {
    if (!this.triggered && bikeX >= this.triggerX) {
      this.triggered = true;
      for (const m of this.monkeys) m.spawn();
    }
    for (const m of this.monkeys) m.step(dt);
  }

  /** Returns how many monkeys leapt away. */
  honked(bikeX: number, range: number): number {
    let n = 0;
    for (const m of this.monkeys) {
      if (m.collidable && Math.abs(bikeX - m.centreX) <= range) {
        m.leap();
        n++;
      }
    }
    return n;
  }

  render(t: number): void {
    for (const m of this.monkeys) m.render(t);
  }
}
