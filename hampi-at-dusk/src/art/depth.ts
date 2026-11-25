// Draw order of everything in a stage scene (no Phaser import: the stage themes use it too).
export const DEPTH = {
  sky: 0, far: 0.7, skyline: 1, chariot: 1.5, mid: 2,
  terrain: 10, deco: 11, checkpoint: 12, obstacle: 13, animal: 14, diya: 15,
  bike: 20, fx: 21, popup: 30, near: 40, fade: 50, debug: 60,
} as const;
