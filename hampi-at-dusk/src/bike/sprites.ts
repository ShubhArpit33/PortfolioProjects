// How each bike is drawn (v1.6): which textures, and where they sit on the shared chassis.
//
// The chassis is the same for every bike, because the physics is: a 24 x 16 hitbox and two wheel contact
// points WHEEL_DX either side of the bike's position, wheels of radius WHEEL_R. Only the pictures differ.

import type Phaser from 'phaser';
import type { BikeId } from './bikes';

export const WHEEL_R = 6;
export const WHEEL_DX = 13;

export interface BikeSprite {
  /** body + rider texture, and the pixel in it that sits on the body pivot (0, -WHEEL_R above the contact midpoint) */
  body: string;
  w: number;
  h: number;
  pivotX: number;
  pivotY: number;
  rearWheel: string;
  frontWheel: string;
  /** the rider's planted leg (shown at a standstill and while backing up): texture and x of the foot */
  leg: string;
  legX: number;
  /** exhaust tip (boost flame, smoke puffs), relative to the contact midpoint */
  exhaustX: number;
  exhaustY: number;
}

export const BIKE_SPRITES: Readonly<Record<BikeId, BikeSprite>> = {
  tonup: {
    body: 'bike_body_tonup', w: 40, h: 24, pivotX: 20, pivotY: 24, rearWheel: 'wheel', frontWheel: 'wheel',
    leg: 'rider_leg', legX: -1, exhaustX: -19, exhaustY: -9,
  },
  daybreak: {
    body: 'bike_body', w: 40, h: 24, pivotX: 20, pivotY: 24, rearWheel: 'wheel', frontWheel: 'wheel',
    leg: 'rider_leg', legX: -1, exhaustX: -19, exhaustY: -9,
  },
  sundowner: {
    body: 'bike_body_sundowner', w: 40, h: 24, pivotX: 20, pivotY: 24, rearWheel: 'wheel', frontWheel: 'wheel',
    leg: 'rider_leg', legX: -1, exhaustX: -19, exhaustY: -9,
  },
};

/**
 * The parts of a bike in a container whose origin is the wheel-contact midpoint: flame, wheels, body, leg.
 * Used by the ridden bike, the ghost and the select-screen previews.
 */
export class BikeRig {
  readonly container: Phaser.GameObjects.Container;
  readonly body: Phaser.GameObjects.Image;
  readonly rear: Phaser.GameObjects.Image;
  readonly front: Phaser.GameObjects.Image;
  readonly leg: Phaser.GameObjects.Image;
  readonly flame: Phaser.GameObjects.Sprite;
  readonly sprite: BikeSprite;

  constructor(scene: Phaser.Scene, readonly bike: BikeId) {
    const sp = this.sprite = BIKE_SPRITES[bike];
    this.rear = scene.add.image(-WHEEL_DX, -WHEEL_R, sp.rearWheel);
    this.front = scene.add.image(WHEEL_DX, -WHEEL_R, sp.frontWheel);
    this.body = scene.add.image(0, -WHEEL_R, sp.body).setOrigin(sp.pivotX / sp.w, sp.pivotY / sp.h);
    this.leg = scene.add.image(sp.legX, 0, sp.leg).setOrigin(0.5, 1).setVisible(false);
    this.flame = scene.add.sprite(sp.exhaustX, sp.exhaustY, 'flame', 0).setOrigin(1, 0.5).setVisible(false);
    this.container = scene.add.container(0, 0, [this.flame, this.rear, this.front, this.body, this.leg]);
  }

  setWheelSpin(rad: number): void {
    this.rear.rotation = rad;
    this.front.rotation = rad;
  }
}
