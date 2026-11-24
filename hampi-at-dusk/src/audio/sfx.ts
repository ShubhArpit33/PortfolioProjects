// All sound is generated with WebAudio (GAME_SPEC.md section 7). The AudioContext is created only
// inside a real (trusted) DOM keydown / pointerdown handler; until then every call here is a no-op,
// so the test hooks never create audio.

export type SfxName = 'honk' | 'hop' | 'thud' | 'clean' | 'diya' | 'crash' | 'splash' | 'bell' | 'flip';

interface Engine {
  saw: OscillatorNode;
  sub: OscillatorNode;
  subGain: GainNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let engine: Engine | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
let installed = false;

function create(): void {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ctx.destination);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 2147483648) - 1;
  }

  // Engine: sawtooth through a low-pass; a square sub-oscillator adds the rough boost tone.
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = 55;
  const sub = ctx.createOscillator();
  sub.type = 'square';
  sub.frequency.value = 27.5;
  const subGain = ctx.createGain();
  subGain.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 300;
  filter.Q.value = 2;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  saw.connect(filter);
  sub.connect(subGain).connect(filter);
  filter.connect(gain).connect(master);
  saw.start();
  sub.start();
  engine = { saw, sub, subGain, filter, gain };
}

/** Install the unlock + mute listeners once. */
export function installAudio(): void {
  if (installed) return;
  installed = true;
  const unlock = (e: Event): void => {
    if (!e.isTrusted) return;
    if (!ctx) create();
    else if (ctx.state === 'suspended') void ctx.resume();
  };
  window.addEventListener('keydown', (e) => {
    unlock(e);
    if (e.code === 'KeyM' && !e.repeat) setMuted(!muted);
  });
  window.addEventListener('pointerdown', unlock);
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.01);
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
      noise(0.4, 0.5, 'lowpass', 2400, 200);
      tone('sawtooth', 150, 38, 0.35, 0.3);
      tone('square', 90, 30, 0.2, 0.2, 0.05);
      break;
    case 'splash':
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
 * throttle, and the tone gets rougher while boosting. on = false silences it.
 */
export function setEngine(on: boolean, speed01 = 0, throttle = false, boosting = false): void {
  if (!ctx || !engine) return;
  const t = ctx.currentTime;
  const s = Math.max(0, Math.min(1.6, speed01));
  const freq = 48 + 78 * s + (throttle ? 10 : 0) + (boosting ? 14 : 0);
  engine.saw.frequency.setTargetAtTime(freq, t, 0.06);
  engine.sub.frequency.setTargetAtTime(freq * 0.5 * 1.01, t, 0.06);
  engine.subGain.gain.setTargetAtTime(boosting ? 0.9 : 0.12, t, 0.05);
  engine.filter.frequency.setTargetAtTime(260 + 900 * s + (throttle ? 500 : 0) + (boosting ? 1500 : 0), t, 0.08);
  engine.filter.Q.setTargetAtTime(boosting ? 7 : 2, t, 0.08);
  const vol = on ? 0.05 + 0.035 * Math.min(1, s) + (throttle ? 0.04 : 0) + (boosting ? 0.04 : 0) : 0;
  engine.gain.gain.setTargetAtTime(vol, t, on ? 0.06 : 0.03);
}
