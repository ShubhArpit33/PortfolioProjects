// Procedural music (v1.3): a tanpura-style Sa-Pa drone, a soft bansuri-like line in raag Bhupali
// (the evening pentatonic: Sa Re Ga Pa Dha) and a light tabla-like pulse. Original, generated in code.
//
// Nothing here creates an AudioContext: sfx.ts owns it (a real key press or click only) and hands this
// module the context and a music bus. The score is generative: phrases come from a seeded PRNG, so the
// line keeps changing instead of looping, yet is the same on every page load. Notes are scheduled a
// fraction of a second ahead from tick(), which the scenes call once per frame.

/** Sa = D. The drone sits at D2 / A2 / D3, the melody around D4-D5. */
const SA_HZ = 146.83;
/** Bhupali, in semitones above Sa. */
export const SCALE = [0, 2, 4, 7, 9] as const;
/** Melody range in scale degrees above the melody Sa (0 = Sa, 5 = upper Sa, 9 = upper Dha). */
export const MELODY_MIN = -2; // lower Pa
export const MELODY_MAX = 9;

const BASE_BPM = 76;
const LIFT_BPM = 12;          // added at full intensity (boost / river)
const LOOKAHEAD_S = 0.3;
const MUSIC_LEVEL = 0.28;     // bus gain: sits under the sound effects
const DUCK_LEVEL = 0.05;

/** Frequency of a scale degree (may be negative) above a base Sa. */
export function degreeHz(degree: number, saHz: number): number {
  const n = SCALE.length;
  const octave = Math.floor(degree / n);
  const semis = SCALE[((degree % n) + n) % n]! + 12 * octave;
  return saHz * 2 ** (semis / 12);
}

export interface MelodyEvent {
  /** scale degree to play, or null for a rest */
  degree: number | null;
  /** length in half-beats */
  halfBeats: number;
  /** slide slowly into the note (meend) */
  glide: boolean;
}

/** Small deterministic PRNG (mulberry32). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The melodic line: short stepwise phrases that come to rest on Sa, Ga or Pa, separated by breaths.
 * Pure and deterministic (unit-tested); it knows nothing about audio.
 */
export class MelodyGen {
  private rand: () => number;
  private degree = 0;
  private left = 0;       // notes left in the current phrase
  private dir = 1;

  constructor(seed = 20251) {
    this.rand = prng(seed);
  }

  next(): MelodyEvent {
    const r = this.rand;
    if (this.left === 0) {
      // A breath between phrases, then start the next one from a resting tone.
      this.left = 3 + Math.floor(r() * 5);
      const starts = [0, 0, 2, 3, 5, 3];
      this.degree = starts[Math.floor(r() * starts.length)]!;
      this.dir = this.degree >= 4 ? -1 : 1;
      return { degree: null, halfBeats: 3 + Math.floor(r() * 6), glide: false };
    }
    this.left--;
    const last = this.left === 0;
    if (last) {
      // Land on the nearest of Sa / Ga / Pa (in any octave) and hold it.
      const rests = [-2, 0, 2, 3, 5, 7, 8];
      let best = rests[0]!;
      for (const d of rests) if (Math.abs(d - this.degree) < Math.abs(best - this.degree)) best = d;
      this.degree = best;
      return { degree: this.degree, halfBeats: 4 + Math.floor(r() * 3), glide: r() < 0.5 };
    }
    // Mostly steps in the current direction, the odd skip or turn.
    const roll = r();
    if (roll < 0.18) this.dir = -this.dir;
    const stepSize = roll > 0.82 ? 2 : 1;
    let d = this.degree + this.dir * stepSize;
    if (d > MELODY_MAX) { d = MELODY_MAX - 1; this.dir = -1; }
    if (d < MELODY_MIN) { d = MELODY_MIN + 1; this.dir = 1; }
    const out: MelodyEvent = { degree: this.degree, halfBeats: [1, 1, 2, 2, 2, 3][Math.floor(r() * 6)]!, glide: r() < 0.3 };
    this.degree = d;
    return out;
  }
}

// ---------------------------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------------------------

interface Voices {
  ctx: AudioContext;
  bus: GainNode;
  noise: AudioBuffer;
  flute: OscillatorNode;
  fluteBreath: OscillatorNode;
  fluteGain: GainNode;
  vibrato: GainNode;
  shimmer: GainNode;
}

let v: Voices | null = null;
let on = true;
let melody = new MelodyGen();
let nextTime = 0;        // AudioContext time of the next half-beat
let halfBeat = 0;        // half-beat counter
let melodyWait = 0;      // half-beats until the melody's next event
let intensity = 0;       // smoothed 0..1
let intensityTarget = 0;
let lastTick = 0;
let shimmerLevel = 0;

/** Called by sfx.ts once the AudioContext exists. */
export function attachMusic(ctx: AudioContext, bus: GainNode, noise: AudioBuffer): void {
  bus.gain.value = on ? MUSIC_LEVEL : 0;

  // Flute: a triangle with a quiet octave partial, through a gentle low-pass, with a slow vibrato.
  const flute = ctx.createOscillator();
  flute.type = 'triangle';
  flute.frequency.value = SA_HZ * 2;
  const fluteBreath = ctx.createOscillator();
  fluteBreath.type = 'sine';
  fluteBreath.frequency.value = SA_HZ * 4;
  const breathGain = ctx.createGain();
  breathGain.gain.value = 0.18;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200;
  const fluteGain = ctx.createGain();
  fluteGain.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.2;
  const vibrato = ctx.createGain();
  vibrato.gain.value = 0;
  lfo.connect(vibrato);
  vibrato.connect(flute.frequency);
  flute.connect(lp);
  fluteBreath.connect(breathGain).connect(lp);
  lp.connect(fluteGain).connect(bus);

  // Shimmer: two slightly detuned high Sa sines that fade in with the intensity (boost / river).
  const shimmer = ctx.createGain();
  shimmer.gain.value = 0;
  const oscs = [flute, fluteBreath, lfo];
  for (const detune of [-5, 6]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = SA_HZ * 4;
    o.detune.value = detune;
    o.connect(shimmer);
    oscs.push(o);
  }
  const fifth = ctx.createOscillator();
  fifth.type = 'sine';
  fifth.frequency.value = SA_HZ * 6;
  const fifthGain = ctx.createGain();
  fifthGain.gain.value = 0.4;
  fifth.connect(fifthGain).connect(shimmer);
  oscs.push(fifth);
  shimmer.connect(bus);
  for (const o of oscs) o.start();

  v = { ctx, bus, noise, flute, fluteBreath, fluteGain, vibrato, shimmer };
  melody = new MelodyGen();
  nextTime = 0;
  halfBeat = 0;
  melodyWait = 4;
  lastTick = ctx.currentTime;
}

export function isMusicOn(): boolean {
  return on;
}

export function setMusicOn(value: boolean): void {
  on = value;
  if (!v) return;
  const t = v.ctx.currentTime;
  v.bus.gain.cancelScheduledValues(t);
  v.bus.gain.setTargetAtTime(on ? MUSIC_LEVEL : 0, t, 0.05);
  if (!on) v.fluteGain.gain.setTargetAtTime(0, t, 0.1);
}

/** 0 = calm, 1 = lifted (boosting; the river run-up sits in between). Smoothed inside tick(). */
export function setMusicIntensity(target: number): void {
  intensityTarget = Math.min(1, Math.max(0, target));
}

/** Dip the music briefly (a crash). */
export function duckMusic(seconds = 0.9): void {
  if (!v || !on) return;
  const t = v.ctx.currentTime;
  v.bus.gain.cancelScheduledValues(t);
  v.bus.gain.setTargetAtTime(DUCK_LEVEL, t, 0.03);
  v.bus.gain.setTargetAtTime(MUSIC_LEVEL, t + seconds, 0.35);
}

/** One tanpura string: a buzzing pluck that blooms and rings for a few seconds. */
function pluck(t: number, hz: number, vol: number): void {
  if (!v) return;
  const { ctx, bus } = v;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = hz;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 3;
  filter.frequency.setValueAtTime(hz * 2, t);
  filter.frequency.linearRampToValueAtTime(hz * 9, t + 0.35); // the bloom of the buzz
  filter.frequency.exponentialRampToValueAtTime(hz * 2.5, t + 3.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
  osc.connect(filter).connect(g).connect(bus);
  osc.start(t);
  osc.stop(t + 3.5);
}

/** Tabla-like strokes: a low drum with a falling pitch (ge), and a short ringing rim tone (na / ti). */
function drum(t: number, kind: 'ge' | 'na' | 'ti', vol: number): void {
  if (!v || vol <= 0) return;
  const { ctx, bus, noise } = v;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const g = ctx.createGain();
  if (kind === 'ge') {
    osc.frequency.setValueAtTime(118, t);
    osc.frequency.exponentialRampToValueAtTime(62, t + 0.16);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  } else {
    osc.frequency.setValueAtTime(SA_HZ * (kind === 'na' ? 2 : 3), t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol * 0.6, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'na' ? 0.16 : 0.07));
    // the slap of the finger
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = kind === 'na' ? 1800 : 3200;
    bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.35, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    src.connect(bp).connect(ng).connect(bus);
    src.start(t);
    src.stop(t + 0.06);
  }
  osc.connect(g).connect(bus);
  osc.start(t);
  osc.stop(t + 0.35);
}

// One 8-beat cycle (16 half-beats). The calm pattern is sparse; the lift fills in the off-beats.
const CALM: ReadonlyArray<readonly ['ge' | 'na' | 'ti', number] | null> = [
  ['ge', 1], null, ['na', 0.5], null, null, null, ['ti', 0.4], null,
  ['ge', 0.7], null, ['na', 0.5], null, ['ti', 0.35], null, ['na', 0.45], null,
];
const LIFT: ReadonlyArray<readonly ['ge' | 'na' | 'ti', number] | null> = [
  null, ['ti', 0.4], null, ['ti', 0.35], ['ge', 0.6], ['ti', 0.35], null, ['na', 0.45],
  null, ['ti', 0.4], null, ['ti', 0.35], null, ['ge', 0.5], null, ['ti', 0.4],
];
/** Tanpura strings, one per beat: Pa, Sa, Sa, low Sa. */
const DRONE = [SA_HZ * 0.75, SA_HZ, SA_HZ, SA_HZ * 0.5];

function scheduleHalfBeat(t: number, dur: number): void {
  if (!v) return;
  const i = halfBeat % 16;

  if (halfBeat % 2 === 0) pluck(t, DRONE[(halfBeat / 2) % 4]!, 0.3);

  const calm = CALM[i];
  if (calm) drum(t, calm[0], calm[1] * (0.3 + 0.12 * intensity));
  const lift = LIFT[i];
  if (lift && intensity > 0.3) drum(t, lift[0], lift[1] * 0.4 * intensity);

  if (melodyWait <= 0) {
    const ev = melody.next();
    melodyWait = ev.halfBeats;
    const { flute, fluteBreath, fluteGain, vibrato } = v;
    if (ev.degree === null) {
      fluteGain.gain.setTargetAtTime(0, t, 0.14);
      vibrato.gain.setTargetAtTime(0, t, 0.1);
    } else {
      const hz = degreeHz(ev.degree, SA_HZ * 2);
      const slide = ev.glide ? 0.09 : 0.018;
      flute.frequency.setTargetAtTime(hz, t, slide);
      fluteBreath.frequency.setTargetAtTime(hz * 2, t, slide);
      // a soft attack, then settle; long notes get vibrato after a moment
      fluteGain.gain.setTargetAtTime(0.5, t, 0.03);
      fluteGain.gain.setTargetAtTime(0.34, t + 0.12, 0.2);
      vibrato.gain.setTargetAtTime(0, t, 0.02);
      if (ev.halfBeats >= 3) vibrato.gain.setTargetAtTime(hz * 0.006, t + dur * 1.2, 0.25);
    }
  }
  melodyWait--;
  halfBeat++;
}

/** Schedule whatever falls inside the look-ahead window. Call once per frame; a no-op until audio exists. */
export function tickMusic(): void {
  if (!v) return;
  const { ctx } = v;
  if (ctx.state !== 'running') return;
  const now = ctx.currentTime;
  const dt = Math.min(0.25, Math.max(0, now - lastTick));
  lastTick = now;
  intensity += (intensityTarget - intensity) * Math.min(1, dt * 2.5);
  const shimmer = 0.05 * intensity;
  if (Math.abs(shimmer - shimmerLevel) > 0.002) {
    shimmerLevel = shimmer;
    v.shimmer.gain.setTargetAtTime(shimmer, now, 0.2);
  }
  if (!on) {
    nextTime = 0; // schedule nothing; the score picks up where it left off when music comes back
    return;
  }
  // First call, or the tab was in the background: start again just ahead of now.
  if (nextTime < now) nextTime = now + 0.06;
  let guard = 0;
  while (nextTime < now + LOOKAHEAD_S && guard++ < 8) {
    const dur = 60 / (BASE_BPM + LIFT_BPM * intensity) / 2;
    scheduleHalfBeat(nextTime, dur);
    nextTime += dur;
  }
}
