// Loop construction for the audio pilot (audio_direction.md section 11.2): exact loop
// bodies from double renders, and seam selection plus crossfade for generated beds.

import { frameCount, type PcmAudio, sliceFrames } from './wav';

/**
 * Cut one loop body out of a render that played the loop twice in a row.
 * The body is frames [L, 2L): its head already carries the first pass's reverb tail
 * (the tail wrap of section 11.2). Its last fadeFrames are crossfaded toward frames [L - fade, L), which flow without a break into frame L, so playing the
 * body on repeat has no step at the seam even when the two passes differ slightly.
 * Use the linear curve when both passes are near identical (a deterministic render) and
 * the equal-power curve when they are not (a generated cover).
 */
export function cutLoopFromDoubleRender(
  audio: PcmAudio,
  loopFrames: number,
  fadeFrames: number,
  curve: 'linear' | 'power' = 'linear',
): PcmAudio {
  if (frameCount(audio) < 2 * loopFrames) throw new Error('Render is shorter than two loops');
  if (fadeFrames < 0 || fadeFrames > loopFrames) throw new Error(`Bad fade length ${fadeFrames}`);
  const body = sliceFrames(audio, loopFrames, 2 * loopFrames);
  const ch = audio.channels;
  for (let k = 0; k < fadeFrames; k++) {
    const t = (k + 1) / fadeFrames;
    const keep = curve === 'power' ? Math.cos((t * Math.PI) / 2) : 1 - t;
    const take = curve === 'power' ? Math.sin((t * Math.PI) / 2) : t;
    const bodyFrame = loopFrames - fadeFrames + k;
    const sourceFrame = loopFrames - fadeFrames + k; // same offset before frame L
    for (let c = 0; c < ch; c++) {
      body.samples[bodyFrame * ch + c] =
        keep * body.samples[bodyFrame * ch + c] + take * audio.samples[sourceFrame * ch + c];
    }
  }
  return body;
}

/** Short-term RMS envelope, one value per window of windowFrames (mono sum). */
export function rmsEnvelope(audio: PcmAudio, windowFrames: number): Float64Array {
  const frames = frameCount(audio);
  const count = Math.floor(frames / windowFrames);
  const out = new Float64Array(count);
  const ch = audio.channels;
  for (let w = 0; w < count; w++) {
    let sum = 0;
    for (let f = w * windowFrames; f < (w + 1) * windowFrames; f++) {
      let mono = 0;
      for (let c = 0; c < ch; c++) mono += audio.samples[f * ch + c];
      mono /= ch;
      sum += mono * mono;
    }
    out[w] = Math.sqrt(sum / windowFrames);
  }
  return out;
}

/**
 * Pick the start frame of a loop body of bodyFrames inside a longer bed so that neither
 * seam region (fadeFrames at the start and fadeFrames right after the body) holds a
 * prominent event: the score is the loudest envelope window in both regions over the
 * bed's median window. Candidates step by stepFrames from minStart.
 */
export function findQuietSeam(
  audio: PcmAudio,
  bodyFrames: number,
  fadeFrames: number,
  windowFrames: number,
  stepFrames: number,
  minStart = 0,
): { start: number; score: number } {
  let best = { start: -1, score: Number.POSITIVE_INFINITY };
  for (const c of quietSeamScores(
    audio,
    bodyFrames,
    fadeFrames,
    windowFrames,
    stepFrames,
    minStart,
  )) {
    if (c.score < best.score) best = c;
  }
  if (best.start < 0) throw new Error('Bed is too short for the loop body and its fade');
  return best;
}

/** Every candidate seam start of findQuietSeam with its score (lower is quieter). */
export function quietSeamScores(
  audio: PcmAudio,
  bodyFrames: number,
  fadeFrames: number,
  windowFrames: number,
  stepFrames: number,
  minStart = 0,
): Array<{ start: number; score: number }> {
  const env = rmsEnvelope(audio, windowFrames);
  const sorted = [...env].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1e-9;
  const frames = frameCount(audio);
  const out: Array<{ start: number; score: number }> = [];
  for (let start = minStart; start + bodyFrames + fadeFrames <= frames; start += stepFrames) {
    let peak = 0;
    for (const regionStart of [start, start + bodyFrames]) {
      const from = Math.floor(regionStart / windowFrames);
      const to = Math.ceil((regionStart + fadeFrames) / windowFrames);
      for (let w = from; w < Math.min(to, env.length); w++) peak = Math.max(peak, env[w]);
    }
    out.push({ start, score: peak / median });
  }
  return out;
}

/**
 * Loop body of bodyFrames from start, with its head crossfaded (equal power) from the
 * material right after the body, so the end of the body flows into its own head.
 */
export function crossfadeLoop(
  audio: PcmAudio,
  start: number,
  bodyFrames: number,
  fadeFrames: number,
): PcmAudio {
  if (start + bodyFrames + fadeFrames > frameCount(audio))
    throw new Error('Not enough material after the body');
  const body = sliceFrames(audio, start, start + bodyFrames);
  const ch = audio.channels;
  for (let k = 0; k < fadeFrames; k++) {
    const t = k / fadeFrames;
    const fadeIn = Math.sin((t * Math.PI) / 2);
    const fadeOut = Math.cos((t * Math.PI) / 2);
    const after = start + bodyFrames + k;
    for (let c = 0; c < ch; c++) {
      body.samples[k * ch + c] =
        fadeIn * body.samples[k * ch + c] + fadeOut * audio.samples[after * ch + c];
    }
  }
  return body;
}
