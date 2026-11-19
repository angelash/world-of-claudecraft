// Audio metadata next to every processed sound, assets/processed/audio/<outDir>/<id>.json
// (audio_direction.md 9.3), and the checks `assets:check` runs on it and on the processed Ogg
// headers: sample rate, channels, length, loop points (JSON and the LOOPSTART / LOOPLENGTH
// Vorbis comments agree and lie inside the file), file count, loudness and true peak.

import { AUDIO_IMPORT_VERSION } from '../import_versions';
import { type Problem, problem } from '../reasons';
import type { OggInfo } from './ogg';
import type { AudioPlan } from './plan';
import { loudnessProblems } from './process';

export interface AudioMeta {
  id: string;
  kind: AudioPlan['kind'];
  template: string;
  bus: AudioPlan['bus'];
  group: string | null;
  /** Processed files relative to assets/. */
  files: string[];
  durationSec: number;
  loop: boolean;
  loopStart: number | null;
  loopEnd: number | null;
  bpm: number | null;
  beatsPerBar: number | null;
  bars: number | null;
  stems: number;
  variants: number;
  lufs: number | null;
  truePeak: number | null;
  measure: AudioPlan['measure'];
  target: number;
  truePeakMax: number;
  channels: 'mono' | 'stereo';
  syncOffsetMs: number | null;
  priority: number | null;
  caption: string | null;
  importVersion: string;
  source: { file: string; sha256: string };
  aigcLabel: string;
  processing: Record<string, unknown>;
  problems: Problem[];
}

export function newAudioMeta(
  id: string,
  plan: AudioPlan,
  source: { file: string; sha256: string },
  aigcLabel: string,
): AudioMeta {
  return {
    id,
    kind: plan.kind,
    template: plan.template,
    bus: plan.bus,
    group: plan.group,
    files: [],
    durationSec: 0,
    loop: plan.loop,
    loopStart: null,
    loopEnd: null,
    bpm: plan.bpm,
    beatsPerBar: plan.beatsPerBar,
    bars: plan.loopBars,
    stems: 1,
    variants: 1,
    lufs: null,
    truePeak: null,
    measure: plan.measure,
    target: plan.targetLufs,
    truePeakMax: plan.truePeakMax,
    channels: plan.channels === 1 ? 'mono' : 'stereo',
    syncOffsetMs: null,
    priority: plan.priority,
    caption: null,
    importVersion: AUDIO_IMPORT_VERSION,
    source,
    aigcLabel,
    processing: {},
    problems: [],
  };
}

export interface ProcessedHeader {
  file: string;
  info: OggInfo | null;
  error?: string;
}

export function checkAudio(
  meta: AudioMeta,
  headers: ProcessedHeader[],
  plan: AudioPlan,
): Problem[] {
  const out: Problem[] = [];
  if (headers.length === 0) out.push(problem('format', 'files', 'no processed audio file'));
  // A layered entry (stems.ts): one file per layer, all of one length (5.2: sample-aligned).
  if (meta.stems > 1) {
    if (meta.files.length !== plan.stems)
      out.push(
        problem(
          'format',
          'stems',
          `${meta.files.length} layer file(s), the entry asks for ${plan.stems} layers`,
        ),
      );
    const lengths = new Set(headers.filter((h) => h.info).map((h) => h.info!.totalSamples));
    if (lengths.size > 1)
      out.push(problem('format', 'stems', 'layer files differ in length: they must stay aligned'));
  }
  if (plan.variants > 1 && meta.files.length !== plan.variants) {
    out.push(
      problem(
        'format',
        'variants',
        `${meta.files.length} processed file(s), the entry asks for ${plan.variants} variants`,
      ),
    );
  }
  for (const h of headers) {
    if (!h.info) {
      out.push(problem('format', 'ogg', `${h.file}: ${h.error ?? 'unreadable'}`));
      continue;
    }
    const i = h.info;
    if (i.crcErrors > 0)
      out.push(problem('format', 'ogg', `${h.file}: ${i.crcErrors} Ogg page(s) fail their CRC`));
    if (i.sampleRate !== plan.sampleRate)
      out.push(
        problem(
          'format',
          'sample_rate',
          `${h.file}: ${i.sampleRate} Hz, needs ${plan.sampleRate} Hz`,
        ),
      );
    if (i.channels !== plan.channels) {
      out.push(
        problem(
          'format',
          'channels',
          `${h.file}: ${i.channels} channel(s), needs ${plan.channels === 1 ? 'mono' : 'stereo'}`,
        ),
      );
    }
    if (i.totalSamples <= 0) out.push(problem('format', 'duration', `${h.file}: no audio`));
    if (!plan.loop && plan.maxDurationSec !== null && i.durationSec > plan.maxDurationSec * 1.25) {
      out.push(
        problem(
          'format',
          'duration',
          `${h.file}: ${i.durationSec.toFixed(1)} s, the template allows about ${plan.maxDurationSec} s`,
        ),
      );
    }
    if (plan.loop) {
      const ls = Number(i.comments.LOOPSTART?.[0]);
      const ll = Number(i.comments.LOOPLENGTH?.[0]);
      if (meta.loopStart === null || meta.loopEnd === null) {
        out.push(problem('seam', 'loop_points', `${meta.id}: a loop template without loop points`));
      } else {
        if (
          !(meta.loopStart >= 0 && meta.loopStart < meta.loopEnd && meta.loopEnd <= i.totalSamples)
        ) {
          out.push(
            problem(
              'seam',
              'loop_points',
              `${h.file}: loop ${meta.loopStart} to ${meta.loopEnd} lies outside the ${i.totalSamples} samples`,
            ),
          );
        }
        if (!(ls === meta.loopStart && ll === meta.loopEnd - meta.loopStart)) {
          out.push(
            problem(
              'seam',
              'loop_points',
              `${h.file}: LOOPSTART / LOOPLENGTH comments (${i.comments.LOOPSTART?.[0] ?? 'none'} / ${i.comments.LOOPLENGTH?.[0] ?? 'none'}) disagree with the metadata`,
            ),
          );
        }
        const sec = (meta.loopEnd - meta.loopStart) / plan.sampleRate;
        if (plan.loopRange && (sec < plan.loopRange[0] || sec > plan.loopRange[1])) {
          out.push(
            problem(
              'seam',
              'loop_length',
              `${h.file}: loop body ${sec.toFixed(2)} s, expected ${plan.loopRange[0].toFixed(1)} to ${plan.loopRange[1].toFixed(1)} s`,
            ),
          );
        }
      }
    }
  }
  out.push(...loudnessProblems(meta.lufs, meta.truePeak, plan));
  return out;
}
