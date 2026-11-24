import Phaser from 'phaser';

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
  scene: [],
});

export default game;
