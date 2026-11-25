// Game-feel effects (v1.3): landing dust puffs, diya sparkles and boost speed streaks;
// the rolling boulder's dust and its break-up (v1.7).
// Everything is pooled (no allocations per frame), advanced by the frame's game-time delta, and uses an
// integer hash instead of Math.random, so it behaves the same under manual stepping.

import type Phaser from 'phaser';

const VIEW_W = 480;

/** Deterministic hash of two integers -> [0, 1). */
export function fxHash(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

interface Particle {
  img: Phaser.GameObjects.Image;
  x: number; y: number; vx: number; vy: number;
  gravity: number; age: number; life: number; alpha: number;
}

/** A small fixed pool of world-space particles. When the pool is full the oldest one is reused. */
export class Fx {
  private pool: Particle[] = [];
  private next = 0;
  private seq = 0;

  constructor(scene: Phaser.Scene, depth: number, size = 56) {
    for (let i = 0; i < size; i++) {
      const img = scene.add.image(0, 0, 'p_dust').setDepth(depth).setVisible(false);
      this.pool.push({ img, x: 0, y: 0, vx: 0, vy: 0, gravity: 0, age: 0, life: 0, alpha: 0 });
    }
  }

  private emit(key: string, x: number, y: number, vx: number, vy: number, gravity: number, life: number, alpha: number): void {
    const p = this.pool[this.next]!;
    this.next = (this.next + 1) % this.pool.length;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.gravity = gravity; p.age = 0; p.life = life; p.alpha = alpha;
    p.img.setTexture(key).setPosition(Math.round(x), Math.round(y)).setAlpha(alpha).setVisible(true);
  }

  private rand(): number {
    return fxHash(++this.seq, 77);
  }

  /**
   * Dust kicked out to both sides of a landing. impact = speed into the ground (px/s): a flat hop is
   * about 280, the kicker about 430. Low and wide, so it never covers anything above wheel height.
   */
  landingPuff(x: number, y: number, impact: number, hard: boolean): void {
    const k = Math.min(1.6, Math.max(0.25, impact / 280)) * (hard ? 1.25 : 1);
    const n = Math.round(4 + 5 * k);
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const speed = (26 + 60 * this.rand()) * k;
      this.emit(
        this.rand() < 0.4 * k ? 'p_puff' : 'p_dust',
        x + side * (6 + 6 * this.rand()), y - 1,
        side * speed, -(8 + 34 * this.rand()) * k,
        150, 0.28 + 0.3 * this.rand(), 0.85,
      );
    }
  }

  /** A ring of sparks where a diya was picked up. */
  sparkle(x: number, y: number): void {
    const n = 8;
    const turn = this.rand() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = turn + (i / n) * Math.PI * 2;
      const speed = 48 + 30 * this.rand();
      this.emit('p_spark', x, y, Math.cos(a) * speed, Math.sin(a) * speed - 12, 110, 0.3 + 0.12 * this.rand(), 1);
    }
  }

  /** A puff of dust behind the rolling boulder (it rolls left, so the dust trails to the right). */
  rollDust(x: number, y: number): void {
    this.emit(
      this.rand() < 0.5 ? 'p_puff' : 'p_dust',
      x + 4 * this.rand(), y - 1 - 3 * this.rand(),
      14 + 26 * this.rand(), -(10 + 24 * this.rand()),
      120, 0.3 + 0.25 * this.rand(), 0.8,
    );
  }

  /** The boulder breaking up at the top of the steps: chips of rock thrown up and out, and a cloud of dust. */
  rockBurst(x: number, y: number): void {
    for (let i = 0; i < 10; i++) {
      const a = Math.PI * (0.15 + 0.7 * this.rand());
      const speed = 60 + 80 * this.rand();
      this.emit('p_rock', x + 10 * (this.rand() - 0.5), y + 8 * (this.rand() - 0.5),
        Math.cos(a) * speed, -Math.sin(a) * speed, 420, 0.45 + 0.25 * this.rand(), 1);
    }
    for (let i = 0; i < 8; i++) {
      this.emit('p_puff', x + 16 * (this.rand() - 0.5), y + 6 + 6 * this.rand(),
        50 * (this.rand() - 0.5), -(6 + 22 * this.rand()), 30, 0.45 + 0.3 * this.rand(), 0.75);
    }
  }

  update(dt: number): void {
    if (dt <= 0) return;
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.life = 0;
        p.img.setVisible(false);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.age / p.life;
      p.img.setPosition(Math.round(p.x), Math.round(p.y)).setAlpha(p.alpha * (1 - k * k));
    }
  }
}

/**
 * Speed streaks while boosting: thin screen-space lines rushing right to left through the sky band.
 * A pure function of (game time, intensity). Drawn behind the terrain and every entity.
 */
export class BoostStreaks {
  private lines: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, depth: number, count = 9) {
    for (let i = 0; i < count; i++) {
      this.lines.push(scene.add.image(0, 0, 'p_streak').setOrigin(0, 0.5).setScrollFactor(0).setDepth(depth).setVisible(false));
    }
  }

  /** t = game time (s); intensity 0..1 (smoothed by the caller, so the lines fade in and out). */
  update(t: number, intensity: number): void {
    const on = intensity > 0.02;
    this.lines.forEach((img, i) => {
      if (!on) { img.setVisible(false); return; }
      const speed = 520 + 380 * fxHash(i, 1);
      const span = VIEW_W + 140;
      const travel = t * speed + fxHash(i, 2) * span;
      const pass = Math.floor(travel / span);
      const scale = 1 + Math.floor(fxHash(i, 3 + pass) * 3) * 0.5; // 24, 36 or 48 px
      img.setVisible(true)
        .setPosition(Math.round(VIEW_W + 40 - (travel % span)), 40 + Math.floor(fxHash(i, 100 + pass) * 150))
        .setScale(scale, 1)
        .setAlpha(intensity * (0.22 + 0.3 * fxHash(i, 200 + pass)));
    });
  }
}
