// All sound is generated with WebAudio (GAME_SPEC.md section 7). The AudioContext is created only
// inside a real (trusted) DOM keydown / pointerdown handler; until then every call here is a no-op,
// so the test hooks never create audio.
//
// Sound has three modes, cycled with M (v1.3): everything on, music off, everything muted.

import { loadPrefs, savePrefs } from '../progress';
import { attachMusic, duckMusic, makeNoise, setMusicOn } from './music';

export type SfxName = 'honk' | 'hop' | 'thud' | 'clean' | 'diya' | 'crash' | 'splash' | 'bell' | 'flip';

interface Engine {
  body: OscillatorNode;
  buzz: OscillatorNode;
  buzzGain: GainNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let engine: Engine | null = null;
let noiseBuf: AudioBuffer | null = null;
/** 0 = all sound, 1 = music off, 2 = everything muted */
export type SoundMode = 0 | 1 | 2;
let mode: SoundMode = 0;
let installed = false;
let musicTap: AnalyserNode | null = null;
let masterTap: AnalyserNode | null = null;

function create(): void {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = mode === 2 ? 0 : 0.5;
  // A safety limiter on the way out: it does nothing at normal levels and catches stacked effects.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 4;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  master.connect(limiter).connect(ctx.destination);

  noiseBuf = makeNoise(ctx);

  // Engine (v1.4, softened): a triangle body with a quiet sawtooth for the purr, through a low-pass and a
  // 45 Hz high-pass. No square sub-octave any more: at 24-60 Hz, slightly detuned, it only rasped.
  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.value = 62;
  const buzz = ctx.createOscillator();
  buzz.type = 'sawtooth';
  buzz.frequency.value = 62;
  const buzzGain = ctx.createGain();
  buzzGain.gain.value = 0.2;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 300;
  filter.Q.value = 1;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 45;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  body.connect(filter);
  buzz.connect(buzzGain).connect(filter);
  filter.connect(hp).connect(gain).connect(master);
  body.start();
  buzz.start();
  engine = { body, buzz, buzzGain, filter, gain };

  // Music goes through its own bus so it can be switched off and ducked on its own.
  const musicBus = ctx.createGain();
  musicBus.connect(master);
  attachMusic(ctx, musicBus, noiseBuf);

  // Level taps for the test hooks (analysers that lead nowhere; they cost next to nothing).
  musicTap = ctx.createAnalyser();
  masterTap = ctx.createAnalyser();
  musicBus.connect(musicTap);
  limiter.connect(masterTap);
}

export interface AudioDebug {
  created: boolean;
  state: string;
  mode: SoundMode;
  /** peak sample (0..1) in the last analyser window of the music bus / the master output */
  musicPeak: number;
  masterPeak: number;
}

function peak(tap: AnalyserNode | null): number {
  if (!tap) return 0;
  const buf = new Float32Array(tap.fftSize);
  tap.getFloatTimeDomainData(buf);
  let m = 0;
  for (const s of buf) m = Math.max(m, Math.abs(s));
  return m;
}

/** What the audio is doing right now (test hooks only). */
export function audioDebug(): AudioDebug {
  return { created: ctx !== null, state: ctx?.state ?? 'none', mode, musicPeak: peak(musicTap), masterPeak: peak(masterTap) };
}

/** Install the unlock + sound-mode listeners once. */
export function installAudio(): void {
  if (installed) return;
  installed = true;
  setSoundMode(loadPrefs().sound, false);
  const unlock = (e: Event): void => {
    if (!e.isTrusted) return;
    if (!ctx) create();
    else if (ctx.state === 'suspended') void ctx.resume();
  };
  window.addEventListener('keydown', (e) => {
    unlock(e);
    if (e.code === 'KeyM' && !e.repeat) setSoundMode(((mode + 1) % 3) as SoundMode);
  });
  window.addEventListener('pointerdown', unlock);
}

export function soundMode(): SoundMode {
  return mode;
}

/** HUD tag for the current mode ('' when everything is on). */
export function soundLabel(): string {
  return mode === 1 ? 'MUSIC OFF' : mode === 2 ? 'MUTED' : '';
}

export function setSoundMode(m: SoundMode, persist = true): void {
  mode = m;
  setMusicOn(m === 0);
  if (ctx && master) master.gain.setTargetAtTime(m === 2 ? 0 : 0.5, ctx.currentTime, 0.01);
  if (persist) savePrefs({ ...loadPrefs(), sound: m });
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, delay = 0): void {
  if (!ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(f0, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export function play(name: SfxName): void {
  if (!ctx) return;
  switch (name) {
    case 'honk': // two-tone "pom-pom"
      tone('square', 440, 440, 0.13, 0.16);
      tone('square', 554, 554, 0.13, 0.07);
      tone('square', 349, 349, 0.2, 0.16, 0.16);
      tone('square', 440, 440, 0.2, 0.07, 0.16);
      break;
    case 'hop':
      tone('triangle', 220, 560, 0.13, 0.22);
      break;
    case 'thud':
      tone('sine', 120, 45, 0.14, 0.4);
      noise(0.09, 0.2, 'lowpass', 500, 120);
      break;
    case 'clean':
      tone('triangle', 880, 880, 0.16, 0.2);
      tone('triangle', 1175, 1175, 0.16, 0.2, 0.07);
      tone('triangle', 1760, 1760, 0.3, 0.18, 0.14);
      break;
    case 'diya':
      tone('sine', 1319, 1319, 0.1, 0.2);
      tone('sine', 1976, 1976, 0.22, 0.16, 0.06);
      break;
    case 'crash':
      duckMusic();
      noise(0.4, 0.5, 'lowpass', 2400, 200);
      // a dull thump under the crunch (was a falling sawtooth + square: a raspberry)
      tone('triangle', 170, 60, 0.28, 0.3);
      tone('sine', 95, 50, 0.18, 0.25, 0.04);
      break;
    case 'splash':
      duckMusic();
      noise(0.55, 0.4, 'bandpass', 2600, 500);
      noise(0.3, 0.2, 'highpass', 3000, 1500, 0.08);
      break;
    case 'flip': // a quick rising run
      tone('triangle', 659, 659, 0.1, 0.2, 0.1);
      tone('triangle', 880, 880, 0.1, 0.2, 0.18);
      tone('triangle', 1319, 1319, 0.12, 0.2, 0.26);
      tone('square', 1760, 1760, 0.3, 0.06, 0.34);
      break;
    case 'bell':
      tone('sine', 660, 660, 0.9, 0.22);
      tone('sine', 1650, 1650, 0.6, 0.1);
      tone('sine', 2640, 2640, 0.35, 0.05);
      break;
  }
}

/**
 * Engine tone, called every frame. speed01 = speed / topSpeed; pitch and volume follow speed and
 * throttle, and the tone gets brighter while boosting. on = false silences it.
 */
export function setEngine(on: boolean, speed01 = 0, throttle = false, boosting = false): void {
  if (!ctx || !engine) return;
  const t = ctx.currentTime;
  const s = Math.max(0, Math.min(1.6, speed01));
  const freq = 60 + 84 * s + (throttle ? 10 : 0) + (boosting ? 14 : 0);
  engine.body.frequency.setTargetAtTime(freq, t, 0.06);
  engine.buzz.frequency.setTargetAtTime(freq, t, 0.06);
  engine.buzzGain.gain.setTargetAtTime(boosting ? 0.5 : throttle ? 0.3 : 0.18, t, 0.05);
  engine.filter.frequency.setTargetAtTime(280 + 700 * s + (throttle ? 350 : 0) + (boosting ? 900 : 0), t, 0.08);
  engine.filter.Q.setTargetAtTime(boosting ? 2.5 : 1, t, 0.08);
  const vol = on ? 0.04 + 0.03 * Math.min(1, s) + (throttle ? 0.03 : 0) + (boosting ? 0.03 : 0) : 0;
  engine.gain.gain.setTargetAtTime(vol, t, on ? 0.06 : 0.03);
}
