// A rolling boulder (v1.7: Hampi's temple terrace). The rules are in level/boulder.ts (pure); this is
// the view: the rock turning as it rolls, its dust, the "!" that warns of it, the break-up at the steps.
import Phaser from 'phaser';
import type { Fx } from '../art/Fx';
import { boulderModel, type BoulderModel, type BoulderState } from '../level/boulder';
import type { BoulderDef } from '../level/level';
import type { Box } from '../level/terrain';
import { pixelText } from '../ui/text';

/** The drawn rock is 22 px across (the hitbox is 16 x 14, centred under it). */
const RADIUS = 11;
/**
 * The rock turns an eighth of a turn at a time, and every frame is crisp: even eighths are the 'boulder'
 * texture turned by whole quarter turns, odd ones the 'boulder_turned' texture (the rock drawn 45 deg on).
 */
const TURN_STEP = Math.PI / 4;
/** Fixed steps between two puffs of dust. */
const DUST_EVERY = 5;
const VIEW_W = 480;
/** Seconds the "!" stays up once the boulder is on screen. */
const CUE_LINGER_S = 0.5;

export class Boulder {
  readonly state: BoulderState;
  readonly triggerX: number;
  private readonly model: BoulderModel;
  private readonly groundY: number;
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private cue: Phaser.GameObjects.Text;
  private steps = 0;
  /** the roll time (game seconds) at which the rock first came on screen; -1 = not yet */
  private seenAt = -1;

  constructor(scene: Phaser.Scene, def: BoulderDef, depth: number, cueDepth: number) {
    this.model = boulderModel(def);
    this.state = this.model.create();
    this.triggerX = this.model.triggerX;
    this.groundY = this.model.groundY;
    this.shadow = scene.add.image(0, this.groundY, 'boulder_shadow').setOrigin(0.5, 1).setDepth(depth).setVisible(false);
    this.sprite = scene.add.image(0, this.groundY - RADIUS, 'boulder').setDepth(depth + 0.1).setVisible(false);
    this.cue = pixelText(scene, 0, 0, '!', undefined, 16).setOrigin(0.5, 1).setDepth(cueDepth).setVisible(false);
  }

  /** The hitbox while it rolls, else null. */
  get box(): Box | null {
    return this.model.box(this.state);
  }

  reset(): void {
    Object.assign(this.state, this.model.create());
    this.steps = 0;
    this.seenAt = -1;
  }

  /** One fixed step (game time). Dust and the break-up are spawned here, so they are deterministic too. */
  step(dt: number, bikeX: number, fx: Fx): 'start' | 'break' | null {
    const ev = this.model.step(this.state, bikeX, dt);
    const cx = this.state.x + this.model.def.hitW / 2;
    if (ev === 'break') fx.rockBurst(cx, this.groundY - RADIUS);
    else if (this.state.phase === 'roll' && ++this.steps % DUST_EVERY === 0) fx.rollDust(cx + RADIUS - 3, this.groundY);
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
    const cx = Math.round(this.state.x + this.model.def.hitW / 2);
    // It rolls left, so it turns anticlockwise, by its own circumference.
    const turned = (this.state.t * this.model.def.speed) / RADIUS;
    // A one-pixel hop every half turn: the rock is not perfectly round.
    const bounce = Math.floor(turned / (Math.PI / 2)) % 2 === 0 ? 0 : 1;
    this.sprite.setPosition(cx, this.groundY - RADIUS - bounce);
    const eighth = Math.round(turned / TURN_STEP);
    this.sprite.setTexture(eighth % 2 === 0 ? 'boulder' : 'boulder_turned');
    this.sprite.setAngle(-Math.floor(eighth / 2) * 90);
    this.shadow.setPosition(cx, this.groundY + 1);

    // The "!": at the right edge of the screen while the rock is still off it, then over the rock.
    const onScreen = cx - RADIUS < scrollX + VIEW_W;
    if (onScreen && this.seenAt < 0) this.seenAt = this.state.t;
    const ahead = cx + RADIUS > bikeX;
    const show = ahead && (this.seenAt < 0 || this.state.t - this.seenAt < CUE_LINGER_S);
    const blink = Math.floor(t * 8) % 4 !== 3;
    this.cue.setVisible(show && blink);
    this.cue.setPosition(Math.min(cx, scrollX + VIEW_W - 12), this.groundY - 2 * RADIUS - 6);
  }
}
