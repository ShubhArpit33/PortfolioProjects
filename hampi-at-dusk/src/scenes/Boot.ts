// Boot: load any PNGs that exist, draw the rest in code, wait for the pixel font, then start.
import Phaser from 'phaser';
import { ensureTextures, queueAssetPngs } from '../art/assets';
import { URL_CP, runtime } from '../input';
import { bakeTerrain } from '../level/terrainView';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    queueAssetPngs(this);
  }

  create(): void {
    ensureTextures(this);
    bakeTerrain(this);
    const K = Phaser.Input.Keyboard.KeyCodes;
    // Space and the arrow keys must never scroll the page.
    this.input.keyboard?.addCapture([K.SPACE, K.UP, K.DOWN, K.LEFT, K.RIGHT]);

    const start = (): void => {
      if (runtime.ready) return;
      runtime.ready = true;
      // ?cp=N jumps straight into the stage at that checkpoint; otherwise show the title.
      if (URL_CP !== null) this.scene.start('Game', { cp: URL_CP });
      else this.scene.start('Title');
    };
    document.fonts.load('8px "Press Start 2P"').then(start, start);
  }
}
