// Loop sources for the asset import (audio_direction.md 11.2, tools/assets/core/audio/process.ts).
// The import cuts every loop itself: DC removed and high-passed at 30 Hz, the body starts at the
// source's first sounding sample (-60 dB of its peak, nudged to a zero crossing within 2 ms) and
// runs the stated body length, or the longest the source allows within the template's range; the
// crossfade is baked from the material right after the body, and the seam check reads the level
// step between the first and last half second and the jump across the wrap. So a generated take
// is handed over as raw material that starts at the chosen seam and runs the body, the crossfade
// and a short margin; a loop pre-baked to one body leaves the import nothing to crossfade and
// fails with seam/loop_points.
//
// Choosing the seam: every candidate start is read cheaply on the whole take (seamAt), then the
// best few are confirmed by running the import's own cut on the exact source they would hand
// over (importLoopCut), so what passes here passes in the import up to its loudness stage, which
// only applies one gain and a true-peak limiter.

import {
  bakeLoop,
  highpass,
  nearestZeroCrossing,
  type Pcm,
  removeDc,
  seamOf,
  soundingRange,
} from '../assets/core/audio/dsp';
import type { AudioPlan } from '../assets/core/audio/plan';
import { frameCount, type PcmAudio, sliceFrames } from './wav';

/** Extra material after body plus crossfade, so the import's start nudge still fits. */
export const LOOP_SOURCE_MARGIN_SECONDS = 0.01;
/** Headroom under the import's limits (level step 3 dB, jump 6 times the typical step). */
export const SEAM_LEVEL_STEP_LIMIT_DB = 2;
const SEAM_JUMP_SHARE = 0.8;
/** How many of the best cheap readings get the exact import cut before giving up. */
export const MAX_CONFIRMED = 16;
/** The import starts a loop at the source's first sample above -60 dB of its peak. */
const IMPORT_SILENCE_DB = 60;

export type LoopPlan = Pick<
  AudioPlan,
  'loopSec' | 'loopRange' | 'fadeMs' | 'fadeShape' | 'bpm' | 'beatsPerBar'
>;

export interface SeamReading {
  jump: number;
  typical: number;
  levelStepDb: number;
}

/** Frames a source must hold after `start`: body, crossfade and the margin. */
export function sourceFrames(body: number, fade: number, fs: number): number {
  return body + fade + Math.round(LOOP_SOURCE_MARGIN_SECONDS * fs);
}

/** Interleaved PCM to the import's planar channels. */
export function toPlanar(audio: PcmAudio): Pcm {
  const n = frameCount(audio);
  const ch = audio.channels;
  const out: Pcm = [];
  for (let c = 0; c < ch; c++) {
    const plane = new Float32Array(n);
    for (let i = 0; i < n; i++) plane[i] = audio.samples[i * ch + c] ?? 0;
    out.push(plane);
  }
  return out;
}

/** PCM as the import filters it before cutting (a copy): DC removed, high-passed at 30 Hz. */
export function asImportSees(pcm: Pcm, fs: number): Pcm {
  const out = pcm.map((c) => c.slice());
  removeDc(out);
  highpass(out, fs, 30);
  return out;
}

/**
 * The import's seam reading for a loop of `length` samples cut at `start` with a `fadeLen`
 * crossfade of the given shape: exactly seamOf(bakeLoop(...)) when the body fits the array.
 * seamOf only reads the first and last half second (and the last 50 ms inside it), so for loops
 * of a second or more it runs on a compact copy holding just those two windows of the baked loop.
 */
export function seamAt(
  pcm: Pcm,
  fs: number,
  start: number,
  length: number,
  fadeLen: number,
  shape: 'power' | 'linear',
): SeamReading {
  const n = pcm[0]?.length ?? 0;
  if (start < 0 || start + length > n) throw new Error('seamAt: the body does not fit the PCM');
  if (length < fs) return seamOf(bakeLoop(pcm, start, length, fadeLen, shape), fs);
  const win = Math.round(fs * 0.5);
  const compact = pcm.map((c) => {
    const baked = (i: number): number => {
      const src = start + length + i;
      if (i < fadeLen && src < c.length) {
        const t = (i + 0.5) / fadeLen;
        const ws = shape === 'power' ? Math.sin((t * Math.PI) / 2) : t;
        const wc = shape === 'power' ? Math.cos((t * Math.PI) / 2) : 1 - t;
        return (c[start + i] ?? 0) * ws + (c[src] ?? 0) * wc;
      }
      return c[start + i] ?? 0;
    };
    const out = new Float32Array(2 * win);
    for (let i = 0; i < win; i++) {
      out[i] = baked(i);
      out[win + i] = baked(length - win + i);
    }
    return out;
  });
  return seamOf(compact, fs);
}

/** True when the import's seam check passes with headroom to spare. */
export function seamPasses(s: SeamReading): boolean {
  return (
    s.levelStepDb <= SEAM_LEVEL_STEP_LIMIT_DB &&
    s.jump <= SEAM_JUMP_SHARE * Math.max(0.02, 6 * s.typical)
  );
}

export interface ImportCut {
  /** Where the import starts the body inside the source, and its length, in frames. */
  start: number;
  length: number;
  /** False when the source is too short for the body plus crossfade (seam/loop_points). */
  fits: boolean;
  seam: SeamReading | null;
}

/** The import's loop cut of a source (process.ts processAudio, loop branch), and its seam. */
export function importLoopCut(source: Pcm, fs: number, plan: LoopPlan): ImportCut {
  const pcm = asImportSees(source, fs);
  const n = pcm[0]?.length ?? 0;
  const [a] = soundingRange(pcm, IMPORT_SILENCE_DB);
  const fadeLen = Math.round((plan.fadeMs / 1000) * fs);
  const start = nearestZeroCrossing(pcm, a, Math.round(fs * 0.002));
  const length = plan.loopSec
    ? Math.round(plan.loopSec * fs)
    : Math.min(n - start - fadeLen, Math.round((plan.loopRange?.[1] ?? 8) * fs));
  const fits = length > 0 && start + length + fadeLen <= n;
  return {
    start,
    length,
    fits,
    seam: fits ? seamAt(pcm, fs, start, length, fadeLen, plan.fadeShape) : null,
  };
}

function peakOf(pcm: Pcm): number {
  let peak = 0;
  for (const c of pcm)
    for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i] ?? 0));
  return peak;
}

/**
 * True when some channel is above the threshold within `radius` samples of `at`: a cheap filter
 * for starts in silence, where the import would begin the body later than the cut. It reads the
 * unfiltered take, because the import filters the source from rest, so silence at the cut stays
 * silence there (on the filtered whole take the high-pass would ring into it). The exact check
 * is importLoopCut on the source itself.
 */
export function soundsAt(pcm: Pcm, at: number, radius: number, threshold: number): boolean {
  for (const c of pcm) {
    for (let i = at; i <= Math.min(c.length - 1, at + radius); i++) {
      if (Math.abs(c[i] ?? 0) > threshold) return true;
    }
  }
  return false;
}

export interface LoopChoice {
  /** Cut position in the take, and the import's reading of the source cut there. */
  start: number;
  cut: ImportCut;
  seam: SeamReading;
  passes: boolean;
}

/**
 * Pick the seam start among the candidates (in preference order). Cheap readings on the filtered
 * take rank them: passing ones first, in candidate order when `firstPassing` is set (keep the
 * natural start when it works) or by `rank` (lower is better, e.g. quietness), then the rest by
 * level step. The first MAX_CONFIRMED are confirmed with the import's exact cut of the source;
 * the first confirmed pass wins, else the confirmed one with the smallest level step. `body` is
 * the stated body when the plan has one (the import cuts exactly that), else the body the source
 * is cut for.
 */
export function chooseLoopStart(
  take: Pcm,
  fs: number,
  candidates: ReadonlyArray<{ start: number; rank?: number }>,
  plan: LoopPlan,
  body: number,
  firstPassing = false,
): LoopChoice {
  if (plan.loopSec && Math.round(plan.loopSec * fs) !== body)
    throw new Error('chooseLoopStart: body differs from the stated loop body the import cuts');
  const fade = Math.round((plan.fadeMs / 1000) * fs);
  const filtered = asImportSees(take, fs);
  const n = filtered[0]?.length ?? 0;
  const threshold = peakOf(take) * 10 ** (-IMPORT_SILENCE_DB / 20);
  const cheap = candidates
    .map((c, order) => ({ ...c, order }))
    .filter(
      (c) =>
        c.start >= 0 &&
        c.start + sourceFrames(body, fade, fs) <= n &&
        soundsAt(take, c.start, Math.round(fs * 0.002), threshold),
    )
    .map((c) => {
      const seam = seamAt(filtered, fs, c.start, body, fade, plan.fadeShape);
      return { ...c, seam, passes: seamPasses(seam) };
    });
  cheap.sort((x, y) => {
    if (x.passes !== y.passes) return x.passes ? -1 : 1;
    if (x.passes) return firstPassing ? x.order - y.order : (x.rank ?? 0) - (y.rank ?? 0);
    return x.seam.levelStepDb - y.seam.levelStepDb;
  });
  let best: LoopChoice | null = null;
  for (const c of cheap.slice(0, MAX_CONFIRMED)) {
    const source = take.map((ch) => ch.subarray(c.start, c.start + sourceFrames(body, fade, fs)));
    const cut = importLoopCut(source, fs, plan);
    if (!cut.fits || !cut.seam) continue;
    const choice = { start: c.start, cut, seam: cut.seam, passes: seamPasses(cut.seam) };
    if (choice.passes) return choice;
    if (!best || choice.seam.levelStepDb < best.seam.levelStepDb) best = choice;
  }
  if (!best) throw new Error('No seam start leaves room for the loop body and its crossfade');
  return best;
}

/**
 * Starts on the tempo grid that leave room for the body and crossfade: every bar, or every
 * beat with `beats` 1 (one second apart when the plan has no tempo).
 */
export function barStarts(
  frames: number,
  fs: number,
  plan: Pick<AudioPlan, 'bpm' | 'beatsPerBar'>,
  length: number,
  fadeLen: number,
  beats = plan.beatsPerBar ?? 4,
): number[] {
  const step = plan.bpm && plan.bpm > 0 ? Math.round((60 / plan.bpm) * beats * fs) : fs;
  const out: number[] = [];
  for (let s = 0; s + sourceFrames(length, fadeLen, fs) <= frames; s += step) out.push(s);
  return out;
}

/** The raw source handed to the import: from `start`, the body, the crossfade and the margin. */
export function loopSource(audio: PcmAudio, start: number, body: number, fade: number): PcmAudio {
  const end = start + sourceFrames(body, fade, audio.sampleRate);
  if (end > frameCount(audio))
    throw new Error('Not enough material after the loop body for its crossfade and margin');
  return sliceFrames(audio, start, end);
}

export interface LoopSourceResult {
  source: PcmAudio;
  choice: LoopChoice;
  /** The body the source was cut for, and the crossfade, in frames. */
  body: number;
  fade: number;
}

/**
 * A generated bed or effect loop (equal-power crossfade): candidate starts on the quietness grid
 * of loops.quietSeamScores, and the quietest one the import's seam check passes. The body is the
 * stated one, else `defaultBodySec` (the import then takes the source's length minus the
 * crossfade, which is this body plus the margin, and that is the length confirmed).
 */
export function bedLoopSource(
  audio: PcmAudio,
  plan: LoopPlan,
  defaultBodySec: number,
  scores: ReadonlyArray<{ start: number; score: number }>,
): LoopSourceResult {
  const fs = audio.sampleRate;
  const body = Math.round((plan.loopSec ?? defaultBodySec) * fs);
  const fade = Math.round((plan.fadeMs / 1000) * fs);
  const choice = chooseLoopStart(
    toPlanar(audio),
    fs,
    scores.map((s) => ({ start: s.start, rank: s.score })),
    plan,
    body,
  );
  return { source: loopSource(audio, choice.start, body, fade), choice, body, fade };
}

/**
 * A generated music loop (linear crossfade, body on the tempo grid): the take's own start when
 * the import's seam check passes there, otherwise the first bar start that passes, otherwise the
 * first beat start that passes (the body is whole bars, so the wrap keeps the beat; only the
 * first play enters off the downbeat), otherwise the start with the smallest level step. Null
 * when the plan states no body length (the import then takes the longest body the source
 * allows, so the take is handed over whole).
 */
export function musicLoopSource(audio: PcmAudio, plan: LoopPlan): LoopSourceResult | null {
  if (!plan.loopSec) return null;
  const fs = audio.sampleRate;
  const body = Math.round(plan.loopSec * fs);
  const fade = Math.round((plan.fadeMs / 1000) * fs);
  const pcm = toPlanar(audio);
  const choose = (beats?: number): LoopChoice =>
    chooseLoopStart(
      pcm,
      fs,
      barStarts(frameCount(audio), fs, plan, body, fade, beats).map((start) => ({ start })),
      plan,
      body,
      true,
    );
  let choice = choose();
  if (!choice.passes) {
    const onBeats = choose(1);
    if (onBeats.passes || onBeats.seam.levelStepDb < choice.seam.levelStepDb) choice = onBeats;
  }
  return { source: loopSource(audio, choice.start, body, fade), choice, body, fade };
}
