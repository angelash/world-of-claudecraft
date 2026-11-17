// Shared handling of generated takes for the audio pilot and the batch generator: load any
// generator output as 48 kHz PCM, trim a one-shot to its hit, pair two mono beds into one
// wide stereo bed, and scale. Pure except loadTake (which converts through ffmpeg).

import { readFileSync } from 'node:fs';
import { toWav } from './ffmpeg';
import { frameCount, type PcmAudio, readWav } from './wav';

export const RATE = 48000;

/** Any audio file as 48 kHz PCM with the given channel count (a converted copy is kept beside it). */
export function loadTake(path: string, channels?: number): PcmAudio {
  const wavPath = `${path}.48k.wav`;
  toWav(path, wavPath, channels);
  return readWav(readFileSync(wavPath));
}

export function scale(audio: PcmAudio, gain: number): PcmAudio {
  const samples = audio.samples.slice();
  for (let i = 0; i < samples.length; i++) samples[i] = (samples[i] ?? 0) * gain;
  return { ...audio, samples };
}

export function peakOf(audio: PcmAudio): number {
  let peak = 0;
  for (const s of audio.samples) peak = Math.max(peak, Math.abs(s));
  return peak;
}

/** Index of the first frame whose mono level reaches threshold (0 when none does). */
export function onsetFrame(audio: PcmAudio, threshold: number): number {
  const ch = audio.channels;
  for (let f = 0; f < frameCount(audio); f++) {
    let mono = 0;
    for (let c = 0; c < ch; c++) mono += audio.samples[f * ch + c] ?? 0;
    if (Math.abs(mono / ch) >= threshold) return f;
  }
  return 0;
}

/**
 * A one-shot trimmed to its hit: from 2 ms before the onset (5 % of the peak), at most
 * maxSeconds long, a 40 ms fade at the end, peak at -1.5 dBFS.
 */
export function trimHit(audio: PcmAudio, maxSeconds: number): PcmAudio {
  const peak = peakOf(audio);
  const start = Math.max(0, onsetFrame(audio, peak * 0.05) - Math.round(0.002 * audio.sampleRate));
  const end = Math.min(frameCount(audio), start + Math.round(maxSeconds * audio.sampleRate));
  const ch = audio.channels;
  const samples = audio.samples.slice(start * ch, end * ch);
  const frames = end - start;
  const fade = Math.min(frames, Math.round(0.04 * audio.sampleRate));
  for (let k = 0; k < fade; k++) {
    const g = 1 - k / fade;
    const f = frames - fade + k;
    for (let c = 0; c < ch; c++) samples[f * ch + c] = (samples[f * ch + c] ?? 0) * g;
  }
  return scale({ ...audio, samples }, 10 ** (-1.5 / 20) / (peak || 1));
}

/** Two mono beds as the left and right channel of one wide stereo bed. */
export function pairToStereo(left: PcmAudio, right: PcmAudio): PcmAudio {
  const frames = Math.min(frameCount(left), frameCount(right));
  const samples = new Float32Array(frames * 2);
  for (let f = 0; f < frames; f++) {
    samples[f * 2] = left.samples[f * left.channels] ?? 0;
    samples[f * 2 + 1] = right.samples[f * right.channels] ?? 0;
  }
  return { sampleRate: left.sampleRate, channels: 2, samples };
}
