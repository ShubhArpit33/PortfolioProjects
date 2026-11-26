import '@fontsource/press-start-2p/latin-400.css';
import Phaser from 'phaser';
import { installAudio } from './audio/sfx';
import { BootScene } from './scenes/Boot';
import { FinishScene } from './scenes/Finish';
import { GameScene } from './scenes/Game';
import { HudScene } from './scenes/Hud';
import { JourneyFinishScene } from './scenes/JourneyFinish';
import { SelectScene } from './scenes/Select';
import { StageCardScene } from './scenes/StageCard';
import { StagesScene } from './scenes/Stages';
import { TitleScene } from './scenes/Title';
import { installTestHooks } from './testHooks';

const params = new URLSearchParams(window.location.search);

const game = new Phaser.Game({
  type: params.get('renderer') === 'canvas' ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  width: 480,
  height: 270,
  backgroundColor: '#2b1a4a',
  pixelArt: true,
  roundPixels: true,
  banner: false,
  audio: { noAudio: true },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, StagesScene, SelectScene, GameScene, HudScene, FinishScene, StageCardScene, JourneyFinishScene],
});

installAudio();

if (import.meta.env.DEV || import.meta.env.MODE === 'test') installTestHooks(game);

export default game;
