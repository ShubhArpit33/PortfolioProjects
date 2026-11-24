// Renders the game's music offline (OfflineAudioContext in headless Chromium, the same code the game runs)
// to music-preview.wav and prints its levels. Not part of the build or the tests.
//   node scripts/render-music.mjs [seconds=45] [--old <git-ref>]   (--old also renders that commit's music)
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const SR = 44100;
const seconds = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 45;
const oldAt = process.argv.indexOf('--old');
const oldRef = oldAt > 0 ? process.argv[oldAt + 1] : null;

async function bundle(entry) {
  const r = await build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', globalName: 'M', target: 'es2022' });
  return r.outputFiles[0].text;
}

/** Runs in the page. Returns the two channels as base64 Float32. */
async function renderInPage({ seconds, SR, legacy }) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  const M = window.M;
  if (!legacy) {
    // a boost lift for a few seconds, so the preview shows it
    M.scheduleOffline(ctx, seconds, (t) => (t > 23 && t < 27.6 ? 1 : 0));
  } else {
    // the v1.3 module schedules from tickMusic() against the clock: tick it every 100 ms of render time
    const bus = ctx.createGain();
    bus.connect(ctx.destination);
    const noise = ctx.createBuffer(1, SR, SR);
    const d = noise.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < d.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = seed / 2147483648 - 1; }
    Object.defineProperty(ctx, 'state', { get: () => 'running' }); // tickMusic() only runs on a 'running' context
    M.attachMusic(ctx, bus, noise);
    for (let t = 0.1; t < seconds; t += 0.1) void ctx.suspend(t).then(() => { M.tickMusic(); void ctx.resume(); });
  }
  const buf = await ctx.startRendering();
  const b64 = (f32) => {
    const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  return [b64(buf.getChannelData(0)), b64(buf.getChannelData(1))];
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const a = i + k, b = a + len / 2;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  }
}

const db = (x) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);

function analyse(name, L, R) {
  const n = L.length;
  let peak = 0, sq = 0;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    sq += (L[i] * L[i] + R[i] * R[i]) / 2;
    mono[i] = (L[i] + R[i]) / 2;
  }
  const rms = Math.sqrt(sq / n);
  // averaged power spectrum (Hann, 16384, 50% overlap)
  const N = 16384;
  const edges = [0, 80, 150, 500, 2000, 6000, SR / 2];
  const bands = new Array(edges.length - 1).fill(0);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let off = 0; off + N <= n; off += N / 2) {
    for (let i = 0; i < N; i++) { re[i] = mono[off + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)); im[i] = 0; }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const hz = (k * SR) / N;
      const p = re[k] * re[k] + im[k] * im[k];
      for (let b = 0; b < bands.length; b++) if (hz >= edges[b] && hz < edges[b + 1]) { bands[b] += p; break; }
    }
  }
  const total = bands.reduce((a, b) => a + b, 0) || 1;
  const pct = bands.map((b) => ((100 * b) / total).toFixed(1) + '%');
  // loudest 50 ms window (catches bursts the average hides)
  const w = Math.floor(SR * 0.05);
  let maxWin = 0;
  for (let off = 0; off + w <= n; off += w) {
    let s = 0;
    for (let i = 0; i < w; i++) s += mono[off + i] * mono[off + i];
    maxWin = Math.max(maxWin, Math.sqrt(s / w));
  }
  console.log(`[${name}] ${(n / SR).toFixed(1)} s on the music bus (the game then applies the 0.5 master)`);
  console.log(`  peak ${peak.toFixed(4)} (${db(peak)} dBFS)   RMS ${rms.toFixed(4)} (${db(rms)} dBFS)   crest ${(peak / rms).toFixed(1)}   loudest 50 ms RMS ${db(maxWin)} dBFS`);
  console.log(`  energy: <80 Hz ${pct[0]} | 80-150 ${pct[1]} | 150-500 ${pct[2]} | 500-2k ${pct[3]} | 2k-6k ${pct[4]} | >6k ${pct[5]}`);
  console.log(`  below 150 Hz: ${((100 * (bands[0] + bands[1])) / total).toFixed(1)}% of the energy`);
  return peak;
}

function writeWav(file, L, R, gain) {
  const n = L.length;
  const out = Buffer.alloc(44 + n * 4);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 4, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
  out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(n * 4, 40);
  const q = (x) => Math.max(-32768, Math.min(32767, Math.round(x * gain * 32767)));
  for (let i = 0; i < n; i++) { out.writeInt16LE(q(L[i]), 44 + i * 4); out.writeInt16LE(q(R[i]), 46 + i * 4); }
  writeFileSync(file, out);
}

const browser = await chromium.launch();
try {
  const jobs = [{ name: 'new', entry: 'src/audio/music.ts', file: 'music-preview.wav', legacy: false }];
  if (oldRef) {
    const dir = mkdtempSync(path.join(tmpdir(), 'hampi-music-'));
    const entry = path.join(dir, 'music.ts');
    writeFileSync(entry, execSync(`git show ${oldRef}:./src/audio/music.ts`));
    jobs.push({ name: `old (${oldRef})`, entry, file: 'music-preview-old.wav', legacy: true });
  }
  for (const job of jobs) {
    const page = await browser.newPage();
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
    page.on('pageerror', (e) => problems.push(String(e)));
    await page.addScriptTag({ content: await bundle(job.entry) });
    const [l, r] = await page.evaluate(renderInPage, { seconds, SR, legacy: job.legacy });
    const f32 = (s) => { const b = Buffer.from(s, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
    const L = f32(l), R = f32(r);
    const peak = analyse(job.name, L, R);
    const gain = 0.89 / (peak || 1); // the file is normalised to -1 dBFS so it can be auditioned; levels above are as played
    writeWav(job.file, L, R, gain);
    console.log(`  wrote ${path.resolve(job.file)} (normalised x${gain.toFixed(2)})${problems.length ? '  CONSOLE: ' + problems.join(' | ') : '  console clean'}`);
    await page.close();
  }
} finally {
  await browser.close();
}
