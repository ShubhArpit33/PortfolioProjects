// Procedural music (v1.4): an upbeat, plucked, Indian-flavoured loop. Original, generated in code.
//
//   lead     santoor-like plucked string (Karplus-Strong, rendered into buffers) playing a 2-bar hook
//            and its answers in raag Bhupali (Sa Re Ga Pa Dha = D major pentatonic)
//   flute    a soft bansuri-like line (sines + a little breath noise, late vibrato) in the B section
//   bass     clean sine + quiet octave triangle, low-passed, following the chords
//   pad      soft low-passed triangles holding the chord (replaces the old buzzing tanpura drone)
//   drums    short tabla-flavoured hits: a tight 'dha' kick, 'na' / 'tin' rim tones, shaker, hats
//
// Song: intro (4 bars) -> A (8) -> B (8) -> A' (8) -> breakdown (4), 104 bpm, about 74 s; later passes
// skip the intro and vary the ornaments. The score (barScore) is pure and deterministic.
//
// Nothing here creates an AudioContext: sfx.ts owns it (a real key press or click only) and hands this
// module the context and a music bus. Notes are scheduled a fraction of a second ahead from tickMusic(),
// which the scenes call once per frame. createMusic() also works on an OfflineAudioContext (previews).

/** Sa = D. Lead and flute are written above D4; the bass above D2. */
const SA_HZ = 146.83;
const LEAD_SA = SA_HZ * 2; // D4
const BASS_SA = SA_HZ / 2; // D2 (73.4 Hz): the lowest note in the piece
/** Bhupali, in semitones above Sa. */
export const SCALE = [0, 2, 4, 7, 9] as const;
/** Lead / flute range in scale degrees above D4 (3 = A4, 5 = D5, 10 = D6). */
export const MELODY_MIN = 3;
export const MELODY_MAX = 10;

export const BASE_BPM = 104;
const LIFT_BPM = 6;           // added at full intensity (boost)
export const STEPS_PER_BAR = 16;
const LOOKAHEAD_S = 0.3;
export const MUSIC_LEVEL = 0.3; // bus gain: sits under the sound effects
const DUCK_LEVEL = 0.05;

/** Frequency of a scale degree (may be negative) above a base Sa. */
export function degreeHz(degree: number, saHz: number): number {
  const n = SCALE.length;
  const octave = Math.floor(degree / n);
  const semis = SCALE[((degree % n) + n) % n]! + 12 * octave;
  return saHz * 2 ** (semis / 12);
}

// ---------------------------------------------------------------------------------------------
// Score (pure)
// ---------------------------------------------------------------------------------------------

export type Section = 'intro' | 'A' | 'B' | 'A2' | 'break';
export type ChordName = 'D' | 'Bm' | 'G' | 'A';
export type DrumKind = 'kick' | 'na' | 'tin' | 'shaker' | 'clap';

interface Chord {
  /** bass root, semitones above D2 */
  bass: number;
  /** pad voicing, semitones above D4 */
  pad: readonly [number, number, number];
}
export const CHORDS: Record<ChordName, Chord> = {
  D: { bass: 0, pad: [0, 4, 7] },    // D2  | D4 F#4 A4
  Bm: { bass: 9, pad: [0, 4, 9] },   // B2  | D4 F#4 B4
  G: { bass: 5, pad: [0, 5, 9] },    // G2  | D4 G4 B4
  A: { bass: 7, pad: [-1, 2, 7] },   // A2  | C#4 E4 A4
};

/** Bars of each section, in play order. */
export const SECTIONS: ReadonlyArray<readonly [Section, number]> = [
  ['intro', 4], ['A', 8], ['B', 8], ['A2', 8], ['break', 4],
];
export const SONG_BARS = 32;
const INTRO_BARS = 4;

type Bar = ChordName | readonly [ChordName, ChordName];
const PROGRESSION: Record<Section, readonly Bar[]> = {
  intro: ['D', 'Bm', 'G', 'A'],
  A: ['D', 'Bm', 'G', 'A', 'D', 'Bm', ['G', 'A'], 'D'],
  A2: ['D', 'Bm', 'G', 'A', 'D', 'Bm', ['G', 'A'], 'D'],
  B: ['G', 'A', 'Bm', 'A', 'G', 'A', 'D', 'A'],
  break: ['D', 'Bm', 'G', 'A'],
};

/** [step, scale degree above D4, length in steps] */
type N = readonly [number, number, number];

/** The hook: bars 0-1 call, 2-3 answer, 4-7 the same again with a different ending that lands on Sa. */
const HOOK: readonly (readonly N[])[] = [
  [[0, 5, 2], [2, 6, 2], [4, 7, 3], [7, 8, 3], [10, 7, 2], [12, 6, 2], [14, 5, 2]], // D E F# . A . F# E D
  [[0, 4, 3], [3, 5, 3], [6, 7, 2], [8, 6, 5], [14, 5, 2]],                         // B . D . F# E -- D
  [[0, 5, 2], [2, 6, 2], [4, 7, 3], [7, 9, 3], [10, 8, 2], [12, 7, 2], [14, 6, 2]], // D E F# . B . A F# E
  [[0, 8, 3], [3, 6, 3], [6, 5, 2], [8, 6, 6]],                                     // A . E . D E --
  [[0, 5, 2], [2, 6, 2], [4, 7, 3], [7, 8, 3], [10, 7, 2], [12, 6, 2], [14, 5, 2]],
  [[0, 4, 3], [3, 5, 3], [6, 7, 2], [8, 9, 4], [12, 8, 2], [14, 7, 2]],             // B . D . F# B - A F#
  [[0, 9, 2], [2, 8, 2], [4, 7, 3], [7, 8, 3], [10, 6, 2], [12, 8, 2], [14, 6, 2]], // B A F# . A | E A E
  [[0, 5, 6], [8, 7, 2], [10, 8, 2], [12, 10, 4]],                                  // D -- F# A D'
];

/** The bansuri line of the B section: long notes, one phrase per two bars. */
const FLUTE: readonly (readonly N[])[] = [
  [[0, 4, 6], [6, 5, 2], [8, 7, 8]],           // B . D F# --
  [[0, 6, 10], [12, 5, 2], [14, 6, 2]],        // E --- D E
  [[0, 7, 6], [6, 8, 2], [8, 9, 6], [14, 8, 2]], // F# . A B -- A
  [[0, 6, 12]],                                // E ----
  [[0, 9, 6], [6, 8, 2], [8, 7, 8]],           // B . A F# --
  [[0, 8, 4], [4, 7, 4], [8, 6, 8]],           // A F# E --
  [[0, 7, 4], [4, 6, 4], [8, 5, 8]],           // F# E D --
  [[0, 6, 8]],                                 // E --   (the santoor runs back up into A')
];

/** A rising run that leads into the next section. */
const PICKUP: readonly N[] = [[10, 3, 1], [11, 4, 1], [12, 5, 1], [13, 6, 1], [14, 7, 1], [15, 8, 1]];

export interface NoteEvent {
  step: number;
  /** scale degree above D4 */
  degree: number;
  /** length in steps (16ths) */
  len: number;
  /** 0..1 */
  vel: number;
}
export interface ArpEvent { step: number; semis: number; vel: number }
export interface BassEvent { step: number; semis: number; len: number; vel: number }
export interface DrumEvent { step: number; kind: DrumKind; vel: number }
export interface PadEvent { step: number; len: number; chord: ChordName }

export interface BarScore {
  section: Section;
  /** bar within the section */
  bar: number;
  /** 0 on the first pass through the song, then 1, 2, ... */
  loop: number;
  /** the chord of each half of the bar */
  chords: readonly [ChordName, ChordName];
  lead: NoteEvent[];
  /** a quiet second santoor a third / fourth under the lead (second half of A') */
  harmony: NoteEvent[];
  /** quiet plucked chord tones under the flute (B) */
  arp: ArpEvent[];
  flute: NoteEvent[];
  bass: BassEvent[];
  pad: PadEvent[];
  drums: DrumEvent[];
  /** tanpura-style shimmer level (0..1): present in the intro and breakdown, faint elsewhere */
  shimmer: number;
}

/** Where a bar (counted from the start of playback) falls in the song. Later passes skip the intro. */
export function songPosition(globalBar: number): { section: Section; bar: number; loop: number } {
  let idx = globalBar;
  let loop = 0;
  if (globalBar >= SONG_BARS) {
    const span = SONG_BARS - INTRO_BARS;
    idx = INTRO_BARS + ((globalBar - SONG_BARS) % span);
    loop = 1 + Math.floor((globalBar - SONG_BARS) / span);
  }
  for (const [section, bars] of SECTIONS) {
    if (idx < bars) return { section, bar: idx, loop };
    idx -= bars;
  }
  return { section: 'A', bar: 0, loop }; // unreachable
}

/** Deterministic 0..1 hash of a few small integers. */
function hash(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647 + 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}

function notes(src: readonly N[], vel: number): NoteEvent[] {
  return src.map(([step, degree, len]) => ({ step, degree, len, vel: vel * (step % 4 === 0 ? 1 : 0.82) }));
}

/** Grace notes: a quick upper neighbour one step before some on-beat notes. Different on every pass. */
function ornament(lead: NoteEvent[], loop: number, bar: number, chance: number): NoteEvent[] {
  const taken = new Set<number>();
  for (const n of lead) for (let s = n.step; s < Math.min(STEPS_PER_BAR, n.step + Math.min(n.len, 2)); s++) taken.add(s);
  const out = [...lead];
  for (const n of lead) {
    if (n.step === 0 || n.step % 4 !== 0 || taken.has(n.step - 1)) continue;
    if (hash(loop, bar, n.step) >= chance) continue;
    out.push({ step: n.step - 1, degree: Math.min(MELODY_MAX, n.degree + 1), len: 1, vel: n.vel * 0.55 });
  }
  return out.sort((x, y) => x.step - y.step);
}

function drumsFor(section: Section, bar: number): DrumEvent[] {
  const d: DrumEvent[] = [];
  const add = (kind: DrumKind, steps: readonly number[], vel: number): void => {
    for (const step of steps) d.push({ step, kind, vel });
  };
  const shaker = (level: number): void => {
    for (let s = 0; s < STEPS_PER_BAR; s++) d.push({ step: s, kind: 'shaker', vel: level * (s % 4 === 2 ? 1 : s % 2 === 0 ? 0.7 : 0.4) });
  };
  if (section === 'intro') {
    if (bar >= 2) { shaker(0.7); add('tin', [3, 6, 11], 0.6); }
    if (bar === 3) add('na', [12, 13, 14, 15], 0.7);
  } else if (section === 'A' || section === 'A2') {
    add('kick', [0, 6, 10], 1);
    add('na', [4, 12], 1);
    add('tin', [2, 7, 11], 0.7);
    add('tin', [14, 15], 0.45);
    shaker(1);
    if (section === 'A2') { add('clap', [4, 12], 0.8); add('kick', [15], 0.6); }
    if (bar % 4 === 3) add('na', [13, 14, 15], 0.75); // a little fill at the end of each 4 bars
  } else if (section === 'B') {
    add('kick', [0, 10], 0.85);
    add('na', [12], 0.8);
    add('tin', [3, 6, 11], 0.6);
    shaker(0.8);
    if (bar === 7) add('na', [12, 13, 14, 15], 0.8);
  } else {
    shaker(0.6);
    if (bar < 3) add('tin', [3, 11], 0.55);
    else {
      add('kick', [0], 0.8);
      for (let s = 8; s < STEPS_PER_BAR; s++) d.push({ step: s, kind: s % 2 === 0 ? 'na' : 'tin', vel: 0.4 + 0.07 * (s - 8) });
    }
  }
  return d.sort((x, y) => x.step - y.step);
}

function bassFor(section: Section, bar: number, chords: readonly [ChordName, ChordName]): BassEvent[] {
  const root = (step: number): number => CHORDS[chords[step < 8 ? 0 : 1]].bass;
  const at = (step: number, add: number, len: number, vel: number): BassEvent => ({ step, semis: root(step) + add, len, vel });
  if (section === 'intro') return bar >= 2 ? [at(0, 0, 10, 0.6)] : [];
  if (section === 'break') return [at(0, 0, 12, 0.6)];
  if (section === 'B') return [at(0, 0, 6, 0.9), at(6, 7, 2, 0.7), at(8, 0, 5, 0.9), at(14, 12, 2, 0.7)];
  return [at(0, 0, 3, 1), at(3, 0, 2, 0.7), at(6, 12, 2, 0.8), at(8, 0, 2, 0.9), at(10, 0, 2, 0.9), at(12, 7, 2, 0.8), at(14, 12, 2, 0.75)];
}

/** Everything that happens in one bar. Pure and deterministic (unit-tested); it knows nothing about audio. */
export function barScore(globalBar: number): BarScore {
  const { section, bar, loop } = songPosition(globalBar);
  const p = PROGRESSION[section][bar]!;
  const chords: readonly [ChordName, ChordName] = typeof p === 'string' ? [p, p] : p;

  let lead: NoteEvent[] = [];
  let harmony: NoteEvent[] = [];
  const arp: ArpEvent[] = [];
  let flute: NoteEvent[] = [];

  if (section === 'A') {
    lead = notes(HOOK[bar]!, 1);
    if (loop > 0) lead = ornament(lead, loop, bar, 0.35);
  } else if (section === 'A2') {
    lead = ornament(notes(HOOK[bar]!, 1), loop + 100, bar, 0.6);
    if (bar >= 4) harmony = notes(HOOK[bar]!, 0.45).map((n) => ({ ...n, degree: n.degree - 2 }));
  } else if (section === 'B') {
    flute = notes(FLUTE[bar]!, 1);
    const last = bar === 7;
    for (let s = 0; s < (last ? 8 : STEPS_PER_BAR); s += 2) {
      const tones = CHORDS[chords[s < 8 ? 0 : 1]].pad;
      const order = [0, 2, 1, 2, 0, 2, 1, 2];
      const k = s / 2;
      arp.push({ step: s, semis: tones[order[k]!]! + (k === 4 ? 12 : 0), vel: k % 4 === 0 ? 0.42 : 0.3 });
    }
    if (last) lead = PICKUP.map(([step, degree, len], i) => ({ step, degree, len, vel: 0.5 + 0.08 * i }));
  } else if (section === 'intro') {
    if (bar >= 2) lead = notes(HOOK[bar]!, 0.6);
  } else {
    if (bar === 0 || bar === 2) lead = notes(HOOK[bar]!, 0.7);
    if (bar === 3) lead = PICKUP.map(([step, degree, len], i) => ({ step, degree, len, vel: 0.5 + 0.08 * i }));
  }

  const pad: PadEvent[] = chords[0] === chords[1]
    ? [{ step: 0, len: 16, chord: chords[0] }]
    : [{ step: 0, len: 8, chord: chords[0] }, { step: 8, len: 8, chord: chords[1] }];

  return {
    section, bar, loop, chords, lead, harmony, arp, flute,
    bass: bassFor(section, bar, chords),
    pad,
    drums: drumsFor(section, bar),
    shimmer: section === 'intro' || section === 'break' ? 1 : section === 'B' ? 0.5 : 0.3,
  };
}

/** Length of the first pass through the song at the base tempo, in seconds. */
export function songSeconds(): number {
  return (SONG_BARS * 4 * 60) / BASE_BPM;
}

// ---------------------------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------------------------

/** One second of deterministic white noise (shared with the sound effects). */
export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 2147483648) - 1;
  }
  return buf;
}

export interface Music {
  /** Schedule every step that starts before `until` (context time). `intensity` is 0..1. */
  scheduleUntil(until: number, intensity: number): void;
  /** Start (or restart after a gap) just ahead of `now`. */
  resync(now: number): void;
  /** Context time of the next unscheduled step (0 = not started). */
  nextTime(): number;
}

/**
 * Build the instruments on `ctx` and connect them to `out`. Works on any BaseAudioContext, so the same
 * code renders offline previews. Signal path: voices -> high-pass 70 Hz -> gentle compressor -> out.
 */
export function createMusic(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer): Music {
  // --- bus ---
  const input = ctx.createGain();
  const hp1 = ctx.createBiquadFilter();
  hp1.type = 'highpass';
  hp1.frequency.value = 70;
  hp1.Q.value = 0.7;
  const hp2 = ctx.createBiquadFilter();
  hp2.type = 'highpass';
  hp2.frequency.value = 55;
  hp2.Q.value = 0.7;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.012;
  comp.release.value = 0.18;
  input.connect(hp1).connect(hp2).connect(comp).connect(out);

  // Echo for the lead and the flute: a dotted eighth, dark and quiet.
  const stepBase = 60 / BASE_BPM / 4;
  const echo = ctx.createDelay(1);
  echo.delayTime.value = stepBase * 3;
  const echoLp = ctx.createBiquadFilter();
  echoLp.type = 'lowpass';
  echoLp.frequency.value = 2600;
  const echoFb = ctx.createGain();
  echoFb.gain.value = 0.3;
  const echoOut = ctx.createGain();
  echoOut.gain.value = 0.9;
  echo.connect(echoLp).connect(echoFb).connect(echo);
  echoLp.connect(echoOut).connect(input);

  // Plucked strings: tame the very top, keep them out of the bass.
  const pluckBus = ctx.createBiquadFilter();
  pluckBus.type = 'lowpass';
  pluckBus.frequency.value = 6500;
  const pluckHp = ctx.createBiquadFilter();
  pluckHp.type = 'highpass';
  pluckHp.frequency.value = 220;
  pluckBus.connect(pluckHp).connect(input);
  const pluckSend = ctx.createGain();
  pluckSend.gain.value = 0.22;
  pluckHp.connect(pluckSend).connect(echo);

  const fluteBus = ctx.createBiquadFilter();
  fluteBus.type = 'lowpass';
  fluteBus.frequency.value = 3200;
  fluteBus.connect(input);
  const fluteSend = ctx.createGain();
  fluteSend.gain.value = 0.3;
  fluteBus.connect(fluteSend).connect(echo);

  const bassBus = ctx.createBiquadFilter();
  bassBus.type = 'lowpass';
  bassBus.frequency.value = 480;
  bassBus.Q.value = 0.5;
  bassBus.connect(input);

  const padBus = ctx.createBiquadFilter();
  padBus.type = 'lowpass';
  padBus.frequency.value = 1100;
  padBus.Q.value = 0.5;
  padBus.connect(input);

  // The tanpura-style shimmer is high-passed so it never adds anything down low.
  const shimmerBus = ctx.createBiquadFilter();
  shimmerBus.type = 'highpass';
  shimmerBus.frequency.value = 500;
  shimmerBus.connect(input);

  const panned = (dest: AudioNode, pan: number): AudioNode => {
    if (pan === 0 || typeof ctx.createStereoPanner !== 'function') return dest;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(dest);
    return p;
  };

  // --- plucked string (Karplus-Strong, rendered once per pitch) ---
  const strings = new Map<number, { buf: AudioBuffer; rate: number }>();
  const stringFor = (hz: number): { buf: AudioBuffer; rate: number } => {
    const key = Math.round(hz * 10);
    let s = strings.get(key);
    if (s) return s;
    const sr = ctx.sampleRate;
    const period = Math.max(8, Math.round(sr / hz));
    const len = Math.floor(sr * 1.5);
    const buf = ctx.createBuffer(1, len, sr);
    const y = buf.getChannelData(0);
    // excitation: a burst of low-passed noise, one period long (a soft hammer, not a hard pick)
    let seed = (key * 2654435761) >>> 0;
    let lp = 0;
    let mean = 0;
    for (let i = 0; i < period; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      lp += 0.55 * ((seed / 2147483648) - 1 - lp);
      y[i] = lp;
      mean += lp;
    }
    mean /= period;
    for (let i = 0; i < period; i++) y[i]! -= mean;
    // the string: a delay line with a gentle averaging filter in the loop
    const blend = 0.5;
    const decay = 0.9975;
    for (let i = period + 1; i < len; i++) y[i] = decay * ((1 - blend) * y[i - period]! + blend * y[i - period - 1]!);
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(y[i]!));
    const fade = Math.floor(sr * 0.05);
    for (let i = 0; i < len; i++) {
      y[i] = (y[i]! / (peak || 1)) * (i > len - fade ? (len - i) / fade : 1);
    }
    s = { buf, rate: (hz * (period + blend)) / sr };
    strings.set(key, s);
    return s;
  };

  const pluck = (t: number, hz: number, vol: number, ring: number, dest: AudioNode, pan = 0, double = true): void => {
    if (vol <= 0) return;
    const s = stringFor(hz);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.setTargetAtTime(0, t + ring, 0.22);
    g.connect(panned(dest, pan));
    // santoor courses are pairs of strings: two copies a few cents apart
    for (const [cents, level] of double ? [[-3, 1], [4, 0.6]] as const : [[0, 1]] as const) {
      const src = ctx.createBufferSource();
      src.buffer = s.buf;
      src.playbackRate.value = s.rate * 2 ** (cents / 1200);
      if (level === 1) src.connect(g);
      else { const lg = ctx.createGain(); lg.gain.value = level; src.connect(lg).connect(g); }
      src.start(t);
      src.stop(t + ring + 1.4);
    }
  };

  // --- bansuri ---
  const flute = (t: number, hz: number, dur: number, vol: number): void => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.06);
    g.gain.setTargetAtTime(vol * 0.8, t + 0.06, 0.25);
    g.gain.setTargetAtTime(0, t + dur, 0.07);
    g.connect(fluteBus);
    const end = t + dur + 0.5;
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = hz;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = hz * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.14;
    o1.connect(g);
    o2.connect(g2).connect(g);
    // a small scoop into the note
    o1.frequency.setValueAtTime(hz * 0.985, t);
    o1.frequency.setTargetAtTime(hz, t, 0.03);
    if (dur > 0.5) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.3;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.setTargetAtTime(hz * 0.007, t + 0.3, 0.25);
      const depth2 = ctx.createGain();
      depth2.gain.value = 2;
      lfo.connect(depth).connect(o1.frequency);
      depth.connect(depth2).connect(o2.frequency);
      lfo.start(t);
      lfo.stop(end);
    }
    // breath: a little band-passed noise, strongest at the start of the note
    const n = ctx.createBufferSource();
    n.buffer = noise;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = hz * 2;
    bp.Q.value = 1.4;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.16, t);
    ng.gain.setTargetAtTime(0.05, t + 0.03, 0.08);
    n.connect(bp).connect(ng).connect(g);
    for (const node of [o1, o2, n]) { node.start(t); node.stop(end); }
  };

  // --- bass: sine plus a quiet triangle an octave up (so it still reads on small speakers) ---
  const bass = (t: number, hz: number, dur: number, vol: number): void => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.setTargetAtTime(vol * 0.7, t + 0.008, 0.09);
    g.gain.setTargetAtTime(0, t + dur, 0.035);
    g.connect(bassBus);
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = hz;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = hz * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.45;
    o1.connect(g);
    o2.connect(g2).connect(g);
    for (const o of [o1, o2]) { o.start(t); o.stop(t + dur + 0.3); }
  };

  // --- pad ---
  const pad = (t: number, chord: ChordName, dur: number, vol: number): void => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.3);
    g.gain.setTargetAtTime(0, t + dur, 0.3);
    g.connect(padBus);
    const left = panned(g, -0.5);
    const right = panned(g, 0.5);
    for (const semis of CHORDS[chord].pad) {
      for (const [cents, dest] of [[-5, left], [5, right]] as const) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = LEAD_SA * 2 ** (semis / 12);
        o.detune.value = cents;
        o.connect(dest);
        o.start(t);
        o.stop(t + dur + 1.6);
      }
    }
  };

  // --- drums: all short, nothing with a long falling pitch ---
  const burst = (t: number, type: BiquadFilterType, hz: number, q: number, dur: number, vol: number, pan = 0, attack = 0.001): void => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    src.connect(f).connect(g).connect(panned(input, pan));
    src.start(t, (t * 7.31) % 0.8);
    src.stop(t + attack + dur + 0.02);
  };
  const ping = (t: number, hz: number, dur: number, vol: number, pan = 0, fromHz = hz, sweep = 0.02): void => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(fromHz, t);
    if (fromHz !== hz) o.frequency.exponentialRampToValueAtTime(hz, t + sweep);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(panned(input, pan));
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  const drum = (t: number, kind: DrumKind | 'hat' | 'openhat', vel: number): void => {
    if (vel <= 0) return;
    switch (kind) {
      case 'kick': // 'dha': a tight thump (a 30 ms settle from 150 to 82 Hz, gone in 0.13 s) and a soft click
        ping(t, 82, 0.13, 0.22 * vel, 0, 150, 0.03);
        burst(t, 'lowpass', 1200, 0.5, 0.012, 0.16 * vel);
        break;
      case 'na': // the ringing rim of the small drum, tuned to Sa
        ping(t, SA_HZ * 4, 0.09, 0.15 * vel, -0.2);
        ping(t, SA_HZ * 8.02, 0.045, 0.05 * vel, -0.2);
        burst(t, 'bandpass', 2300, 1.1, 0.03, 0.2 * vel, -0.2);
        break;
      case 'tin':
        ping(t, SA_HZ * 6, 0.05, 0.09 * vel, 0.3);
        burst(t, 'bandpass', 4200, 1.4, 0.02, 0.1 * vel, 0.3);
        break;
      case 'clap':
        burst(t, 'bandpass', 1500, 0.9, 0.08, 0.16 * vel, 0.1);
        burst(t + 0.012, 'bandpass', 1700, 0.9, 0.06, 0.1 * vel, 0.1);
        break;
      case 'shaker':
        burst(t, 'highpass', 6500, 0.7, 0.04, 0.07 * vel, 0.35, 0.006);
        break;
      case 'hat':
        burst(t, 'highpass', 9000, 0.7, 0.028, 0.09 * vel, -0.3);
        break;
      case 'openhat':
        burst(t, 'highpass', 8000, 0.7, 0.11, 0.08 * vel, -0.3);
        break;
    }
  };

  // --- sequencer ---
  let next = 0;   // context time of the next step
  let step = 0;   // steps since the start of playback
  let score: BarScore | null = null;
  let scoreBar = -1;
  const SHIMMER = [3, 5, 5, 0]; // Pa, upper Sa, upper Sa, Sa: one string per beat

  const scheduleStep = (t: number, dur: number, intensity: number): void => {
    const gbar = Math.floor(step / STEPS_PER_BAR);
    const s = step % STEPS_PER_BAR;
    if (gbar !== scoreBar || !score) { score = barScore(gbar); scoreBar = gbar; }
    const sc = score;

    for (const p of sc.pad) if (p.step === s) pad(t, p.chord, p.len * dur, 0.036);
    for (const b of sc.bass) if (b.step === s) bass(t, BASS_SA * 2 ** (b.semis / 12), b.len * dur * 0.9, 0.09 * b.vel);
    for (const n of sc.lead) if (n.step === s) pluck(t, degreeHz(n.degree, LEAD_SA), 0.36 * n.vel, Math.max(0.2, n.len * dur), pluckBus, -0.12);
    for (const n of sc.harmony) if (n.step === s) pluck(t, degreeHz(n.degree, LEAD_SA), 0.3 * n.vel, Math.max(0.2, n.len * dur), pluckBus, 0.35, false);
    for (const a of sc.arp) if (a.step === s) pluck(t, LEAD_SA * 2 ** (a.semis / 12), 0.3 * a.vel, 0.25, pluckBus, 0.3, false);
    for (const n of sc.flute) if (n.step === s) flute(t, degreeHz(n.degree, LEAD_SA), n.len * dur * 0.92, 0.125 * n.vel);
    if (s % 4 === 0) pluck(t, degreeHz(SHIMMER[s / 4]!, LEAD_SA), 0.07 * sc.shimmer, 0.9, shimmerBus, s % 8 === 0 ? -0.5 : 0.5, true);
    for (const d of sc.drums) if (d.step === s) drum(t, d.kind, d.vel);

    // The lift (boost, a little on the river run-up): hats on every 16th, an open hat on the off-beats
    // and a four-on-the-floor kick where the pattern has none.
    if (intensity > 0.25) {
      drum(t, 'hat', intensity * (s % 2 === 0 ? 0.9 : 0.55));
      if (s % 4 === 2) drum(t, 'openhat', intensity);
      if (s % 4 === 0 && !sc.drums.some((d) => d.step === s && d.kind === 'kick')) drum(t, 'kick', 0.75 * intensity);
      if (s === 7 || s === 13) drum(t, 'tin', 0.7 * intensity);
    }
    step++;
  };

  return {
    scheduleUntil(until, intensity) {
      let guard = 0;
      while (next < until && guard++ < 100000) {
        const dur = 60 / (BASE_BPM + LIFT_BPM * intensity) / 4;
        scheduleStep(next, dur, intensity);
        next += dur;
      }
    },
    resync(now) { next = now + 0.06; },
    nextTime: () => next,
  };
}

// ---------------------------------------------------------------------------------------------
// The game's one instance
// ---------------------------------------------------------------------------------------------

interface Live { ctx: BaseAudioContext; bus: GainNode; music: Music }

let v: Live | null = null;
let on = true;
let started = false;
let intensity = 0;       // smoothed 0..1
let intensityTarget = 0;
let lastTick = 0;

/** Called by sfx.ts once the AudioContext exists. */
export function attachMusic(ctx: BaseAudioContext, bus: GainNode, noise: AudioBuffer): void {
  bus.gain.value = on ? MUSIC_LEVEL : 0;
  v = { ctx, bus, music: createMusic(ctx, bus, noise) };
  started = false;
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
}

/** 0 = calm, 1 = lifted (boosting; the river run-up sits in between). Smoothed inside tickMusic(). */
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

/** Schedule whatever falls inside the look-ahead window. Call once per frame; a no-op until audio exists. */
export function tickMusic(): void {
  if (!v) return;
  const { ctx, music } = v;
  if (ctx.state !== 'running') return;
  const now = ctx.currentTime;
  const dt = Math.min(0.25, Math.max(0, now - lastTick));
  lastTick = now;
  intensity += (intensityTarget - intensity) * Math.min(1, dt * 2.5);
  if (!on) {
    started = false; // schedule nothing; the song picks up where it left off when music comes back
    return;
  }
  // First call, or the tab was in the background: start again just ahead of now.
  if (!started || music.nextTime() < now) { music.resync(now); started = true; }
  music.scheduleUntil(now + LOOKAHEAD_S, intensity);
}

/**
 * Render the music alone into an OfflineAudioContext exactly as the game plays it (same instruments,
 * same bus level). `intensityAt` gives the boost lift over time. Used for previews and level checks.
 */
export function scheduleOffline(ctx: BaseAudioContext, seconds: number, intensityAt: (t: number) => number = () => 0): void {
  const bus = ctx.createGain();
  bus.gain.value = MUSIC_LEVEL;
  bus.connect(ctx.destination);
  const music = createMusic(ctx, bus, makeNoise(ctx));
  music.resync(0);
  while (music.nextTime() < seconds) music.scheduleUntil(music.nextTime() + 0.01, intensityAt(music.nextTime()));
}
