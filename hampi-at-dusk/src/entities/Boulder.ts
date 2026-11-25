// The rolling boulder on the temple terrace (v1.7). The rules are in level/boulder.ts (pure); this is
// the view: the rock turning as it rolls, its dust, the "!" that warns of it, the break-up at the steps.
import Phaser from 'phaser';
import type { Fx } from '../art/Fx';
import {
  BOULDER_GROUND_Y, BOULDER_TRIGGER_X, boulderBox, createBoulder, stepBoulder, type BoulderState,
} from '../level/boulder';
import { BOULDER } from '../level/levelData';
import type { Box } from '../level/terrain';
import { pixelText } from '../ui/text';

/** The drawn rock is 22 px across (the hitbox is 16 x 14, centred under it). */
const RADIUS = 11;
/** The rock turns in steps, so its pixels stay crisp. */
const TURN_STEP = Math.PI / 4;
/** Fixed steps between two puffs of dust. */
const DUST_EVERY = 5;
const VIEW_W = 480;
/** Seconds the "!" stays up once the boulder is on screen. */
const CUE_LINGER_S = 0.5;

export class Boulder {
  readonly state: BoulderState = createBoulder();
  readonly triggerX = BOULDER_TRIGGER_X;
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private cue: Phaser.GameObjects.Text;
  private steps = 0;
  /** the roll time (game seconds) at which the rock first came on screen; -1 = not yet */
  private seenAt = -1;

  constructor(scene: Phaser.Scene, depth: number, cueDepth: number) {
    this.shadow = scene.add.image(0, BOULDER_GROUND_Y, 'boulder_shadow').setOrigin(0.5, 1).setDepth(depth).setVisible(false);
    this.sprite = scene.add.image(0, BOULDER_GROUND_Y - RADIUS, 'boulder').setDepth(depth + 0.1).setVisible(false);
    this.cue = pixelText(scene, 0, 0, '!', undefined, 16).setOrigin(0.5, 1).setDepth(cueDepth).setVisible(false);
  }

  /** The hitbox while it rolls, else null. */
  get box(): Box | null {
    return boulderBox(this.state);
  }

  reset(): void {
    Object.assign(this.state, createBoulder());
    this.steps = 0;
    this.seenAt = -1;
  }

  /** One fixed step (game time). Dust and the break-up are spawned here, so they are deterministic too. */
  step(dt: number, bikeX: number, fx: Fx): 'start' | 'break' | null {
    const ev = stepBoulder(this.state, bikeX, dt);
    const cx = this.state.x + BOULDER.hitW / 2;
    if (ev === 'break') fx.rockBurst(cx, BOULDER_GROUND_Y - RADIUS);
    else if (this.state.phase === 'roll' && ++this.steps % DUST_EVERY === 0) fx.rollDust(cx + RADIUS - 3, BOULDER_GROUND_Y);
    return ev;
  }

  /** t = game time (s), scrollX = camera scroll, bikeX = the bike's x (the cue goes once the rock is behind it). */
  render(t: number, scrollX: number, bikeX: number): void {
    const rolling = this.state.phase === 'roll';
    this.sprite.setVisible(rolling);
    this.shadow.setVisible(rolling);
    if (!rolling) {
      this.cue.setVisible(false);
      return;
    }
    const cx = Math.round(this.state.x + BOULDER.hitW / 2);
    // It rolls left, so it turns anticlockwise, by its own circumference.
    const turned = (this.state.t * BOULDER.speed) / RADIUS;
    // A one-pixel hop every half turn: the rock is not perfectly round.
    const bounce = Math.floor(turned / (Math.PI / 2)) % 2 === 0 ? 0 : 1;
    this.sprite.setPosition(cx, BOULDER_GROUND_Y - RADIUS - bounce);
    this.sprite.rotation = -Math.round(turned / TURN_STEP) * TURN_STEP;
    this.shadow.setPosition(cx, BOULDER_GROUND_Y + 1);

    // The "!": at the right edge of the screen while the rock is still off it, then over the rock.
    const onScreen = cx - RADIUS < scrollX + VIEW_W;
    if (onScreen && this.seenAt < 0) this.seenAt = this.state.t;
    const ahead = cx + RADIUS > bikeX;
    const show = ahead && (this.seenAt < 0 || this.state.t - this.seenAt < CUE_LINGER_S);
    const blink = Math.floor(t * 8) % 4 !== 3;
    this.cue.setVisible(show && blink);
    this.cue.setPosition(Math.min(cx, scrollX + VIEW_W - 12), BOULDER_GROUND_Y - 2 * RADIUS - 6);
  }
}
