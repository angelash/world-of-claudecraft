// The audio import branch on decoded PCM (audio_direction.md 9 and 11): channel layout, DC and
// 30 Hz high-pass, variant splitting and trimming with short fades for effects, loop cutting on
// the tempo grid with a baked crossfade for loops, loudness normalisation to the template target
// under the true-peak ceiling, and the measured values for the metadata. Pure and deterministic;
// decoding and Vorbis encoding happen in the CLI's ffmpeg adapter.
//
// Layers (stems) need a source separator (Demucs, 11.3) that is not part of this tool; a
// single-file music entry is processed as one layer and the metadata says so.

import { type Problem, problem } from '../reasons';
import {
  bakeLoop,
  fade,
  findSegments,
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

export interface AudioOut {
  /** File name suffix: '' for the single file, '_01'... for variants, '_s1'... for layers. */
  suffix: string;
  pcm: Pcm;
}

export interface AudioProcessed {
  outputs: AudioOut[];
  loopStart: number | null;
  loopEnd: number | null;
  lufs: number | null;
  truePeak: number | null;
  gainDb: number;
  processing: Record<string, unknown>;
  problems: Problem[];
}

/** Bring the PCM to the plan's channel count (stereo to mono averages, mono to stereo copies). */
export function conformChannels(pcm: Pcm, channels: 1 | 2): { pcm: Pcm; note: string | null } {
  if (pcm.length === channels) return { pcm, note: null };
  if (channels === 1) {
    const n = lengthOf(pcm);
    const m = new Float32Array(n);
    for (const c of pcm) for (let i = 0; i < n; i++) m[i]! += c[i]! / pcm.length;
    return { pcm: [m], note: `downmixed ${pcm.length} channels to mono` };
  }
  const src = pcm[0] ?? new Float32Array(0);
  if (pcm.length >= 2) {
    // Surround input: keep the front pair.
    return {
      pcm: [src.slice(), pcm[1]!.slice()],
      note: `kept the front pair of ${pcm.length} channels`,
    };
  }
  return { pcm: [src.slice(), src.slice()], note: 'mono copied to stereo' };
}

/** Peak limiting beyond this crushes transients audibly; the sound needs another take. */
export const MAX_LIMITING_DB = 9;

const finite = (v: number): number | null => (Number.isFinite(v) ? Number(v.toFixed(2)) : null);

export function processAudio(input: Pcm, fs: number, plan: AudioPlan): AudioProcessed {
  const problems: Problem[] = [];
  const processing: Record<string, unknown> = {};
  if (fs !== plan.sampleRate)
    problems.push(
      problem('format', 'sample_rate', `decoded at ${fs} Hz, the plan needs ${plan.sampleRate} Hz`),
    );
  const conformed = conformChannels(
    input.map((c) => c.slice()),
    plan.channels,
  );
  if (conformed.note) processing.channels = conformed.note;
  const pcm = conformed.pcm;
  removeDc(pcm);
  highpass(pcm, fs, 30);
  let outputs: AudioOut[] = [];
  let loopStart: number | null = null;
  let loopEnd: number | null = null;
  if (plan.loop) {
    const [a] = soundingRange(pcm, 60);
    const fadeLen = Math.round((plan.fadeMs / 1000) * fs);
    const start = nearestZeroCrossing(pcm, a, Math.round(fs * 0.002));
    // A stated body (tempo grid or seconds) is cut exactly; otherwise the longest body the
    // source allows within the template's range.
    const want = plan.loopSec
      ? Math.round(plan.loopSec * fs)
      : Math.min(lengthOf(pcm) - start - fadeLen, Math.round((plan.loopRange?.[1] ?? 8) * fs));
    const length = want;
    processing.loopCut = {
      start,
      length,
      fadeMs: plan.fadeMs,
      fadeShape: plan.fadeShape,
      fromTempo: !!(plan.bpm && plan.loopBars),
    };
    if (length <= 0 || start + length + fadeLen > lengthOf(pcm)) {
      problems.push(
        problem(
          'seam',
          'loop_points',
          `source is ${(lengthOf(pcm) / fs).toFixed(1)} s, too short for a ${(want / fs).toFixed(1)} s loop body plus its ${plan.fadeMs} ms crossfade`,
        ),
      );
      outputs = [{ suffix: '', pcm: slice(pcm, start, lengthOf(pcm)) }];
    } else {
      outputs = [{ suffix: '', pcm: bakeLoop(pcm, start, length, fadeLen, plan.fadeShape) }];
      loopStart = 0;
      loopEnd = length;
    }
  } else if (
    (plan.kind === 'sfx' || plan.kind === 'ui' || plan.template === 'ambience_point') &&
    plan.variants > 1
  ) {
    const segs = findSegments(pcm, fs, 0.5);
    processing.segments = segs.length;
    if (plan.variants > 1 && segs.length !== plan.variants) {
      problems.push(
        problem(
          'format',
          'variants',
          `found ${segs.length} sounding part(s), the entry asks for ${plan.variants} variants`,
        ),
      );
    }
    const pre = Math.round(fs * 0.002);
    outputs = segs.map(([s, e], i) => {
      const part = slice(pcm, Math.max(0, s - pre), e);
      const [a, b] = soundingRange(part, 60);
      const trimmed = slice(part, Math.max(0, a - pre), b);
      fade(trimmed, pre, Math.round(fs * 0.02));
      return { suffix: segs.length > 1 ? `_${String(i + 1).padStart(2, '0')}` : '', pcm: trimmed };
    });
    if (outputs.length === 0) problems.push(problem('format', 'silence', 'the file is silent'));
  } else if (plan.kind === 'sfx' || plan.kind === 'ui' || plan.template === 'ambience_point') {
    // One sound (pauses inside it stay): trim the ends, attack in the first milliseconds.
    const pre = Math.round(fs * 0.002);
    const [a, b] = soundingRange(pcm, 60);
    const one = slice(pcm, Math.max(0, a - pre), b);
    fade(one, pre, Math.round(fs * 0.02));
    outputs = [{ suffix: '', pcm: one }];
    if (lengthOf(one) === 0) problems.push(problem('format', 'silence', 'the file is silent'));
  } else {
    const [a, b] = soundingRange(pcm, 70);
    outputs = [{ suffix: '', pcm: slice(pcm, a, b) }];
  }
  if (plan.stems > 1) {
    processing.stems = `entry asks for ${plan.stems} layers; layer separation (11.3) is not run by this tool, processed as one layer`;
  }
  // Loudness: one gain for the whole entry, so variants keep their relative level (11.4).
  // Gain to the target, then the look-ahead limiter under the true-peak ceiling; limiting lowers
  // the loudness a little, so further rounds (at most eight) close the gap.
  const before = outputs.map((o) => measureLoudness(o.pcm, fs));
  const level = Math.max(...before.map((l) => loudnessFor(l, plan.measure)));
  let gain = 0;
  let limiterDb = 0;
  let lufs = level;
  let truePeak = Math.max(...before.map((l) => l.truePeak));
  const ceiling = plan.truePeakMax - 0.2;
  for (let round = 0; round < 8 && Number.isFinite(lufs); round++) {
    const delta = plan.targetLufs - lufs;
    if (Math.abs(delta) <= 0.2 && truePeak <= plan.truePeakMax) break;
    gain += delta;
    for (const o of outputs) {
      gainDb(o.pcm, delta);
      limiterDb = Math.max(limiterDb, limitTruePeak(o.pcm, fs, ceiling, truePeakEnvelope));
    }
    const after = outputs.map((o) => measureLoudness(o.pcm, fs));
    lufs = Math.max(...after.map((l) => loudnessFor(l, plan.measure)));
    truePeak = Math.max(...after.map((l) => l.truePeak));
  }
  processing.loudness = {
    measure: plan.measure,
    target: plan.targetLufs,
    before: finite(level),
    gainDb: Number(gain.toFixed(2)),
    limiterDb: Number(limiterDb.toFixed(2)),
  };
  problems.push(...loudnessProblems(finite(lufs), finite(truePeak), plan));
  if (limiterDb > MAX_LIMITING_DB) {
    problems.push(
      problem(
        'loudness',
        'limiting',
        `reaching the target needs ${limiterDb.toFixed(1)} dB of peak limiting (over ${MAX_LIMITING_DB} dB): too spiky, regenerate or rebalance`,
      ),
    );
  }
  if (plan.loop && loopEnd !== null) {
    const s = seamOf(outputs[0]!.pcm, fs);
    processing.seam = {
      jump: Number(s.jump.toFixed(4)),
      typical: Number(s.typical.toFixed(4)),
      levelStepDb: Number(s.levelStepDb.toFixed(2)),
    };
    problems.push(...seamProblems(s));
  }
  return {
    outputs,
    loopStart,
    loopEnd,
    lufs: finite(lufs),
    truePeak: finite(truePeak),
    gainDb: gain,
    processing,
    problems,
  };
}

/** Loudness within 1 LU of the target and true peak under the ceiling (release_engineering.md 9.8). */
export function loudnessProblems(
  lufs: number | null,
  truePeak: number | null,
  plan: Pick<AudioPlan, 'measure' | 'targetLufs' | 'truePeakMax'>,
): Problem[] {
  const out: Problem[] = [];
  const name =
    plan.measure === 'I' ? 'integrated' : plan.measure === 'S' ? 'short-term max' : 'momentary max';
  if (lufs === null) out.push(problem('loudness', 'loudness', 'loudness was not measured'));
  else if (Math.abs(lufs - plan.targetLufs) > 1) {
    out.push(
      problem(
        'loudness',
        'loudness',
        `${name} loudness ${lufs.toFixed(1)} LUFS, target ${plan.targetLufs} LUFS (plus or minus 1 LU)`,
      ),
    );
  }
  if (truePeak === null) out.push(problem('loudness', 'true_peak', 'true peak was not measured'));
  else if (truePeak > plan.truePeakMax + 0.05) {
    out.push(
      problem(
        'loudness',
        'true_peak',
        `true peak ${truePeak.toFixed(2)} dBTP over the ${plan.truePeakMax} dBTP ceiling`,
      ),
    );
  }
  return out;
}

export function seamProblems(s: { jump: number; typical: number; levelStepDb: number }): Problem[] {
  const out: Problem[] = [];
  if (s.jump > Math.max(0.02, 6 * s.typical))
    out.push(problem('seam', 'loop_seam', `loop wrap jumps ${s.jump.toFixed(3)} (a click)`));
  if (s.levelStepDb > 3)
    out.push(
      problem(
        'seam',
        'loop_seam',
        `level steps ${s.levelStepDb.toFixed(1)} dB across the loop seam`,
      ),
    );
  return out;
}
