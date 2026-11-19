// Layers of a multi-layer music entry (audio_direction.md 5.2, 9.2, 11.3, 11.4): the stems of
// a separated mix merged into the entry's layers L1 to LN, checked, cut and normalised so that
// the layers stay sample-aligned and still sum to the mix.
//
// Sources: the generated mix is the original (`assets/audio/music/<id>.ogg`); its stems sit in
// a folder beside it, `<id>.stems/`, either already merged by layer (`s1`, `s2`, ... any of
// .ogg, .wav, .flac) or as a separator's six stems (`drums`, `bass`, `vocals`, `piano`,
// `guitar`, `other`, the six-stem Demucs model of 11.3) with an optional `layers.json` that
// says which stems make which layer ({ "layers": [["bass", "other"], ["drums"], ...] }); without
// it the 11.3 default applies (L1 the bass and the bed, L2 the drums, L3 the melody instruments
// and the choir). The separation itself runs offline outside this tool.
//
// Processing: every layer goes through the same DC removal and 30 Hz high-pass as the mix, the
// loop is cut on the mix's grid and the same cut is applied to every layer (11.2: one pair of
// loop points), and the loudness gain and the true-peak limiter are computed on the mix and the
// very same gain applied to every layer (11.4: layers are not normalised one by one, their
// ratios stay). Checks (11.3): the layers sum to the mix within -30 dB, L1 stands on its own
// (it is not just a tail of reverb), every layer has the mix's length. Outputs are `_s1` to
// `_sN`; no extra full mix is written (9.4: the layers together are the mix). Pure.

import { type Problem, problem } from '../reasons';
import {
  bakeLoop,
  gainDb,
  highpass,
  lengthOf,
  limitTruePeak,
  nearestZeroCrossing,
  type Pcm,
  removeDc,
  seamOf,
  slice,
  soundingRange,
} from './dsp';
import { loudnessFor, measureLoudness, truePeakEnvelope } from './loudness';
import type { AudioPlan } from './plan';
import { type AudioProcessed, conformChannels, loudnessProblems, seamProblems } from './process';

/** The six stems of the separator (11.3). */
export const SEPARATOR_STEMS = ['drums', 'bass', 'vocals', 'piano', 'guitar', 'other'] as const;
export type SeparatorStem = (typeof SEPARATOR_STEMS)[number];

/** Default merge of the six stems into N layers (11.3: L1 low and bed, L2 drums, L3 melody). */
export function defaultLayerMap(layers: number): SeparatorStem[][] | null {
  switch (layers) {
    case 2:
      return [
        ['bass', 'other', 'piano', 'guitar'],
        ['drums', 'vocals'],
      ];
    case 3:
      return [['bass', 'other'], ['drums'], ['piano', 'guitar', 'vocals']];
    case 4:
      return [['bass', 'other'], ['drums'], ['guitar', 'piano'], ['vocals']];
    default:
      return null;
  }
}

/** Audio file extensions a stem folder may hold. */
export const STEM_EXTS = ['.ogg', '.wav', '.flac'] as const;

/** The stem folder of an original (assets/audio/music/x.ogg to assets/audio/music/x.stems). */
export function stemFolderOf(originalPath: string): string {
  return originalPath.replace(/\.[a-z0-9]+$/i, '.stems');
}

/**
 * Which files of a stem folder make each layer: merged layers (s1..sN) when present, else the
 * separator's stems by the folder's layer map or the default. Returns the file names per layer,
 * or the problem that stops the split.
 */
export function stemLayout(
  names: readonly string[],
  layers: number,
  layerMap?: unknown,
): { layers: string[][] } | { problem: Problem } {
  const byBase = new Map<string, string>();
  for (const n of names) {
    const ext = STEM_EXTS.find((e) => n.toLowerCase().endsWith(e));
    if (ext) byBase.set(n.slice(0, -ext.length).toLowerCase(), n);
  }
  const merged = Array.from({ length: layers }, (_, i) => byBase.get(`s${i + 1}`));
  if (merged.every((x) => x)) return { layers: merged.map((x) => [x as string]) };
  if (merged.some((x) => x))
    return {
      problem: problem(
        'format',
        'stems',
        `stem folder has some merged layers (s1..s${layers}) but not all of them`,
      ),
    };
  let map: string[][] | null = null;
  if (layerMap !== undefined) {
    const m = (layerMap as { layers?: unknown })?.layers;
    if (
      !Array.isArray(m) ||
      m.length !== layers ||
      !m.every((l) => Array.isArray(l) && l.length > 0 && l.every((s) => typeof s === 'string'))
    )
      return {
        problem: problem(
          'format',
          'stems',
          `layers.json must list ${layers} layers, each a non-empty list of stem names`,
        ),
      };
    map = m as string[][];
  } else map = defaultLayerMap(layers);
  if (!map)
    return {
      problem: problem('format', 'stems', `no default merge for ${layers} layers: add layers.json`),
    };
  const used = new Set<string>();
  const out: string[][] = [];
  for (const layer of map) {
    const files: string[] = [];
    for (const stem of layer) {
      const key = stem.toLowerCase();
      const f = byBase.get(key);
      if (used.has(key)) return { problem: problem('format', 'stems', `stem ${stem} used twice`) };
      used.add(key);
      // A stem the separator did not write (a silent group) is simply left out.
      if (f) files.push(f);
    }
    out.push(files);
  }
  if (out.some((l) => l.length === 0))
    return { problem: problem('format', 'stems', 'a layer has none of its stems in the folder') };
  return { layers: out };
}

/** Sum stems into one layer (all at the length of the longest; channels by the first). */
export function sumPcm(parts: readonly Pcm[]): Pcm {
  const n = Math.max(0, ...parts.map(lengthOf));
  const ch = Math.max(1, ...parts.map((p) => p.length));
  const out: Pcm = Array.from({ length: ch }, () => new Float32Array(n));
  for (const p of parts)
    for (let c = 0; c < ch; c++) {
      const src = p[Math.min(c, p.length - 1)] as Float32Array;
      const dst = out[c] as Float32Array;
      for (let i = 0; i < src.length; i++) dst[i] = (dst[i] as number) + (src[i] as number);
    }
  return out;
}

/** The residual of the layers against the mix in dB (energy ratio); -Infinity when exact. */
export function residualDb(mix: Pcm, layers: readonly Pcm[]): number {
  const sum = sumPcm(layers);
  const n = Math.min(lengthOf(mix), lengthOf(sum));
  let e = 0;
  let r = 0;
  for (let c = 0; c < mix.length; c++) {
    const m = mix[c] as Float32Array;
    const s = (sum[Math.min(c, sum.length - 1)] ?? new Float32Array(0)) as Float32Array;
    for (let i = 0; i < n; i++) {
      const v = m[i] as number;
      const d = v - ((s[i] as number) ?? 0);
      e += v * v;
      r += d * d;
    }
  }
  if (e === 0) return 0;
  return r === 0 ? Number.NEGATIVE_INFINITY : 10 * Math.log10(r / e);
}

/** The separation must reproduce the mix within this (11.3). */
export const MAX_RESIDUAL_DB = -30;
/** L1 must be at least this loud against the mix to stand on its own (11.3). */
export const MIN_L1_LU = -20;

/** Separation checks of 11.3 on aligned layers. */
export function separationProblems(mix: Pcm, layers: readonly Pcm[], fs: number): Problem[] {
  const out: Problem[] = [];
  const n = lengthOf(mix);
  layers.forEach((l, i) => {
    if (Math.abs(lengthOf(l) - n) > Math.round(fs * 0.01))
      out.push(
        problem(
          'format',
          'stems',
          `layer L${i + 1} is ${(lengthOf(l) / fs).toFixed(2)} s, the mix ${(n / fs).toFixed(2)} s: layers must share length and start`,
        ),
      );
  });
  const res = residualDb(mix, layers);
  if (res > MAX_RESIDUAL_DB)
    out.push(
      problem(
        'format',
        'stems',
        `the layers differ from the mix by ${res.toFixed(1)} dB (must stay under ${MAX_RESIDUAL_DB} dB)`,
      ),
    );
  const mixL = measureLoudness(mix, fs).integrated;
  const l1 = layers[0] ? measureLoudness(layers[0], fs).integrated : Number.NEGATIVE_INFINITY;
  if (!(l1 - mixL >= MIN_L1_LU))
    out.push(
      problem(
        'format',
        'stems',
        `L1 is ${Number.isFinite(l1) ? (l1 - mixL).toFixed(1) : 'silent'} LU against the mix: it must stand on its own`,
      ),
    );
  return out;
}

/** Pad or cut a layer to `n` samples (a separator may round the length by a few samples). */
function fit(p: Pcm, n: number): Pcm {
  return p.map((c) => {
    if (c.length === n) return c;
    const out = new Float32Array(n);
    out.set(c.subarray(0, n));
    return out;
  });
}

const finite = (v: number): number | null => (Number.isFinite(v) ? Number(v.toFixed(2)) : null);

/**
 * Process a layered entry: the mix decides the cut and the loudness, the layers follow it.
 * Outputs `_s1` to `_sN`; the measured values are the mix's.
 */
export function processLayers(
  mixIn: Pcm,
  layersIn: readonly Pcm[],
  fs: number,
  plan: AudioPlan,
): AudioProcessed & { stems: number } {
  const problems: Problem[] = [];
  const processing: Record<string, unknown> = { stems: { layers: layersIn.length, from: 'stems' } };
  if (layersIn.length !== plan.stems)
    problems.push(
      problem(
        'format',
        'stems',
        `${layersIn.length} layer(s) found, the entry asks for ${plan.stems}`,
      ),
    );
  const mix = conformChannels(
    mixIn.map((c) => c.slice()),
    plan.channels,
  ).pcm;
  const n = lengthOf(mix);
  const layers = layersIn.map((l) =>
    fit(
      conformChannels(
        l.map((c) => c.slice()),
        plan.channels,
      ).pcm,
      n,
    ),
  );
  for (const p of [mix, ...layers]) {
    removeDc(p);
    highpass(p, fs, 30);
  }
  problems.push(...separationProblems(mix, layers, fs));
  // One cut for the mix and every layer.
  let loopStart: number | null = null;
  let loopEnd: number | null = null;
  let cutMix = mix;
  let cut = layers;
  if (plan.loop) {
    const [a] = soundingRange(mix, 60);
    const fadeLen = Math.round((plan.fadeMs / 1000) * fs);
    const start = nearestZeroCrossing(mix, a, Math.round(fs * 0.002));
    const length = plan.loopSec
      ? Math.round(plan.loopSec * fs)
      : Math.min(n - start - fadeLen, Math.round((plan.loopRange?.[1] ?? 8) * fs));
    processing.loopCut = { start, length, fadeMs: plan.fadeMs, fadeShape: plan.fadeShape };
    if (length <= 0 || start + length + fadeLen > n) {
      problems.push(
        problem(
          'seam',
          'loop_points',
          `source is ${(n / fs).toFixed(1)} s, too short for a ${(length / fs).toFixed(1)} s loop body plus its ${plan.fadeMs} ms crossfade`,
        ),
      );
      cutMix = slice(mix, start, n);
      cut = layers.map((l) => slice(l, start, n));
    } else {
      cutMix = bakeLoop(mix, start, length, fadeLen, plan.fadeShape);
      cut = layers.map((l) => bakeLoop(l, start, length, fadeLen, plan.fadeShape));
      loopStart = 0;
      loopEnd = length;
    }
  } else {
    const [a, b] = soundingRange(mix, 70);
    cutMix = slice(mix, a, b);
    cut = layers.map((l) => slice(l, a, b));
  }
  // One gain from the mix; the limiter's gain curve is computed on the mix and applied to every
  // layer as well (they ride as extra channels whose level the envelope ignores).
  const ch = cutMix.length;
  const stack: Pcm = [...cutMix, ...cut.flat()];
  const env = (p: Pcm) => truePeakEnvelope(p.slice(0, ch));
  const level = loudnessFor(measureLoudness(cutMix, fs), plan.measure);
  let lufs = level;
  let truePeak = measureLoudness(cutMix, fs).truePeak;
  let gain = 0;
  let limiterDb = 0;
  const ceiling = plan.truePeakMax - 0.2;
  for (let round = 0; round < 8 && Number.isFinite(lufs); round++) {
    const delta = plan.targetLufs - lufs;
    if (Math.abs(delta) <= 0.2 && truePeak <= plan.truePeakMax) break;
    gain += delta;
    gainDb(stack, delta);
    limiterDb = Math.max(limiterDb, limitTruePeak(stack, fs, ceiling, env));
    const m = measureLoudness(stack.slice(0, ch), fs);
    lufs = loudnessFor(m, plan.measure);
    truePeak = m.truePeak;
  }
  processing.loudness = {
    measure: plan.measure,
    target: plan.targetLufs,
    before: finite(level),
    gainDb: Number(gain.toFixed(2)),
    limiterDb: Number(limiterDb.toFixed(2)),
    appliedTo: 'mix, the same gain on every layer',
  };
  problems.push(...loudnessProblems(finite(lufs), finite(truePeak), plan));
  const outs = cut.map((_, i) => stack.slice(ch * (i + 1), ch * (i + 2)));
  if (plan.loop && loopEnd !== null) {
    const s = seamOf(stack.slice(0, ch), fs);
    processing.seam = {
      jump: Number(s.jump.toFixed(4)),
      typical: Number(s.typical.toFixed(4)),
      levelStepDb: Number(s.levelStepDb.toFixed(2)),
    };
    problems.push(...seamProblems(s));
  }
  return {
    outputs: outs.map((pcm, i) => ({ suffix: `_s${i + 1}`, pcm })),
    loopStart,
    loopEnd,
    lufs: finite(lufs),
    truePeak: finite(truePeak),
    gainDb: gain,
    processing,
    problems,
    stems: outs.length,
  };
}

/**
 * Loudness and true peak of decoded layers measured together (their sum is the mix): what the
 * import measures after encoding a layered entry, instead of the loudest single file.
 */
export function measureLayers(
  layers: readonly Pcm[],
  fs: number,
  measure: AudioPlan['measure'],
): { lufs: number; truePeak: number } {
  const l = measureLoudness(sumPcm(layers), fs);
  return { lufs: loudnessFor(l, measure), truePeak: l.truePeak };
}
