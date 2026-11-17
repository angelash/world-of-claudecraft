// FFmpeg helpers for the audio pilot: two-pass EBU R128 loudness normalization
// (audio_direction.md section 11.4) and format conversion. The binary is the one the asset
// tools use (tools/assets/ffmpeg.ts ffmpegPath: HAKONIWA_FFMPEG, the bundled ffmpeg-static,
// or PATH).

import { spawnSync } from 'node:child_process';
import { ffmpegPath } from '../assets/ffmpeg';

const FFMPEG = ffmpegPath() ?? 'ffmpeg';

/** Run ffmpeg and return its stderr (where it prints analysis); throw on failure. */
function ffmpeg(args: string[]): string {
  const res = spawnSync(FFMPEG, ['-hide_banner', '-nostats', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) throw new Error(`ffmpeg ${args.join(' ')} failed:\n${res.stderr}`);
  return res.stderr ?? '';
}

export interface LoudnessReading {
  integrated: number;
  truePeak: number;
  lra: number;
  threshold: number;
}

function parseLoudnormJson(stderr: string): LoudnessReading {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('loudnorm printed no JSON');
  const json = JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;
  return {
    integrated: Number(json.input_i),
    truePeak: Number(json.input_tp),
    lra: Number(json.input_lra),
    threshold: Number(json.input_thresh),
  };
}

/** Measure integrated loudness and true peak. */
export function measureLoudness(input: string): LoudnessReading {
  return parseLoudnormJson(
    ffmpeg(['-i', input, '-af', 'loudnorm=print_format=json', '-f', 'null', '-']),
  );
}

/**
 * Two-pass loudness normalization to a target, writing 48 kHz 16-bit WAV.
 * Linear mode applies one gain when the true-peak target allows it.
 */
export function normalizeLoudness(
  input: string,
  output: string,
  targetLufs: number,
  truePeakDb: number,
  channels?: number,
): LoudnessReading {
  const first = measureLoudness(input);
  const filter = [
    `loudnorm=I=${targetLufs}:TP=${truePeakDb}:LRA=11`,
    `measured_I=${first.integrated}`,
    `measured_TP=${first.truePeak}`,
    `measured_LRA=${first.lra}`,
    `measured_thresh=${first.threshold}`,
    'linear=true:print_format=summary',
  ].join(':');
  const args = ['-y', '-i', input, '-af', filter, '-ar', '48000'];
  if (channels) args.push('-ac', String(channels));
  args.push('-c:a', 'pcm_s16le', output);
  ffmpeg(args);
  return measureLoudness(output);
}

/** Convert any audio file to 48 kHz 16-bit WAV. */
export function toWav(input: string, output: string, channels?: number): void {
  const args = ['-y', '-i', input, '-ar', '48000'];
  if (channels) args.push('-ac', String(channels));
  args.push('-c:a', 'pcm_s16le', output);
  ffmpeg(args);
}
