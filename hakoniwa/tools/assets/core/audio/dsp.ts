// PCM editing for the audio import branch (audio_direction.md 9.1 and 11.2): DC removal, the
// 30 Hz high-pass, fades, silence detection (variant splitting and trimming), zero-crossing
// snapping and loop baking. Channels are Float32Array per channel, all the same length.

export type Pcm = Float32Array[];

export function lengthOf(pcm: Pcm): number {
  return pcm[0]?.length ?? 0;
}

export function slice(pcm: Pcm, start: number, end: number): Pcm {
  return pcm.map((c) => c.slice(Math.max(0, start), Math.min(c.length, end)));
}

export function removeDc(pcm: Pcm): void {
  for (const c of pcm) {
    let mean = 0;
    for (let i = 0; i < c.length; i++) mean += c[i]!;
    mean /= Math.max(1, c.length);
    for (let i = 0; i < c.length; i++) c[i]! -= mean;
  }
}

/** Second-order Butterworth high-pass (RBJ cookbook, Q = 1/sqrt 2), in place. */
export function highpass(pcm: Pcm, fs: number, hz: number): void {
  const w = (2 * Math.PI * hz) / fs;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0;
  const b1 = -(1 + cos) / a0;
  const b2 = b0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  for (const c of pcm) {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < c.length; i++) {
      const x = c[i]!;
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      c[i] = y;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
    }
  }
}

export function fade(pcm: Pcm, inSamples: number, outSamples: number): void {
  for (const c of pcm) {
    const n = c.length;
    for (let i = 0; i < Math.min(inSamples, n); i++) c[i]! *= i / inSamples;
    for (let i = 0; i < Math.min(outSamples, n); i++) c[n - 1 - i]! *= i / outSamples;
  }
}

export function gainDb(pcm: Pcm, db: number): void {
  const g = 10 ** (db / 20);
  for (const c of pcm) for (let i = 0; i < c.length; i++) c[i]! *= g;
}

/** Envelope in dBFS over windows of `win` samples (max of the channels' RMS). */
export function envelopeDb(pcm: Pcm, win: number): number[] {
  const n = lengthOf(pcm);
  const out: number[] = [];
  for (let s = 0; s < n; s += win) {
    let e = 0;
    for (const c of pcm) {
      let sum = 0;
      const end = Math.min(n, s + win);
      for (let i = s; i < end; i++) sum += c[i]! * c[i]!;
      e = Math.max(e, sum / Math.max(1, end - s));
    }
    out.push(e > 0 ? 10 * Math.log10(e) : Number.NEGATIVE_INFINITY);
  }
  return out;
}

/**
 * Sounding regions separated by silences of at least `minGapSec` (variants laid out one after
 * another with 1 s of silence, 9.2). Silence is `silenceDb` below the loudest window.
 */
export function findSegments(
  pcm: Pcm,
  fs: number,
  minGapSec = 0.5,
  silenceDb = 45,
): [number, number][] {
  const win = Math.max(1, Math.round(fs * 0.01));
  const env = envelopeDb(pcm, win);
  const top = Math.max(...env);
  if (!Number.isFinite(top)) return [];
  const loud = env.map((e) => e > top - silenceDb);
  const gapWins = Math.round((minGapSec * fs) / win);
  const out: [number, number][] = [];
  let start = -1;
  let quiet = 0;
  for (let k = 0; k < loud.length; k++) {
    if (loud[k]) {
      if (start < 0) start = k;
      quiet = 0;
    } else if (start >= 0) {
      quiet++;
      if (quiet >= gapWins) {
        out.push([start * win, (k - quiet + 1) * win]);
        start = -1;
        quiet = 0;
      }
    }
  }
  if (start >= 0) out.push([start * win, (loud.length - quiet) * win]);
  const n = lengthOf(pcm);
  return out.map(([a, b]) => [Math.max(0, a), Math.min(n, b)]);
}

/** First and last sample above `silenceDb` below the peak (sample accurate). */
export function soundingRange(pcm: Pcm, silenceDb = 60): [number, number] {
  let peak = 0;
  for (const c of pcm) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]!));
  const thr = peak * 10 ** (-silenceDb / 20);
  const n = lengthOf(pcm);
  let a = 0;
  let b = n;
  const loud = (i: number) => pcm.some((c) => Math.abs(c[i]!) > thr);
  while (a < n && !loud(a)) a++;
  while (b > a && !loud(b - 1)) b--;
  return [a, b];
}

/** Nearest index within `radius` where the first channel crosses zero (rising or falling). */
export function nearestZeroCrossing(pcm: Pcm, pos: number, radius: number): number {
  const c = pcm[0];
  if (!c) return pos;
  let best = pos;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = Math.max(1, pos - radius); i <= Math.min(c.length - 1, pos + radius); i++) {
    const s0 = c[i - 1]!;
    const s1 = c[i]!;
    if ((s0 <= 0 && s1 >= 0) || (s0 >= 0 && s1 <= 0)) {
      const d = Math.abs(i - pos);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  return best;
}

/**
 * Bake a seamless loop of `length` samples starting at `start` (11.2): the material after the
 * loop end is crossfaded into the loop start over `fadeLen` samples, so playing the result end
 * to start continues the sound (and its reverb tail) instead of cutting it. `power` is the
 * equal-power fade for uncorrelated beds (ambience, effect loops); `linear` is the equal-gain
 * fade for music, where the material after the end repeats the start (a cyclic piece) and an
 * equal-power fade of correlated signals would bump the level. The linear fade over 1 to 2 s is
 * this pipeline's tail wrap.
 */
export function bakeLoop(
  pcm: Pcm,
  start: number,
  length: number,
  fadeLen: number,
  shape: 'power' | 'linear',
): Pcm {
  return pcm.map((c) => {
    const out = c.slice(start, start + length);
    for (let i = 0; i < Math.min(fadeLen, out.length); i++) {
      const src = start + length + i;
      if (src >= c.length) break;
      const t = (i + 0.5) / fadeLen;
      const ws = shape === 'power' ? Math.sin((t * Math.PI) / 2) : t;
      const wc = shape === 'power' ? Math.cos((t * Math.PI) / 2) : 1 - t;
      out[i] = c[start + i]! * ws + c[src]! * wc;
    }
    return out;
  });
}

/** Seam quality of a loop: sample jump across the wrap versus typical, and the level step. */
export function seamOf(
  pcm: Pcm,
  fs: number,
): { jump: number; typical: number; levelStepDb: number } {
  const n = lengthOf(pcm);
  let jump = 0;
  let typical = 0;
  let count = 0;
  for (const c of pcm) {
    jump = Math.max(jump, Math.abs(c[0]! - c[n - 1]!));
    const from = Math.max(1, n - Math.round(fs * 0.05));
    for (let i = from; i < n; i++) {
      typical += Math.abs(c[i]! - c[i - 1]!);
      count++;
    }
  }
  typical /= Math.max(1, count);
  const win = Math.min(Math.round(fs * 0.5), Math.floor(n / 2));
  const rms = (a: number, b: number): number => {
    let s = 0;
    for (const c of pcm) for (let i = a; i < b; i++) s += c[i]! * c[i]!;
    return Math.sqrt(s / Math.max(1, (b - a) * pcm.length));
  };
  const head = rms(0, win);
  const tailR = rms(n - win, n);
  const levelStepDb = head > 0 && tailR > 0 ? Math.abs(20 * Math.log10(head / tailR)) : 0;
  return { jump, typical, levelStepDb };
}

/** Sliding minimum over the centred window [i - r, i + r] (monotonic deque, linear time). */
function slidingMin(v: Float32Array, r: number): Float32Array {
  const n = v.length;
  const out = new Float32Array(n);
  const dq = new Int32Array(n + 2 * r + 1);
  let head = 0;
  let tail = 0;
  let next = 0;
  for (let i = 0; i < n; i++) {
    const hi = Math.min(n - 1, i + r);
    while (next <= hi) {
      while (tail > head && v[dq[tail - 1]!]! >= v[next]!) tail--;
      dq[tail++] = next++;
    }
    while (dq[head]! < i - r) head++;
    out[i] = v[dq[head]!]!;
  }
  return out;
}

/**
 * Look-ahead true-peak limiter (the limiting half of the two-pass loudness step, 11.4): the gain
 * each sample needs to keep the 4x oversampled peak under `ceilingDb` is held over a window of
 * plus or minus `holdMs`, averaged over the same window (which never exceeds the needed gain),
 * and released over `releaseMs`. Returns the deepest gain reduction in dB (0 when untouched).
 */
export function limitTruePeak(
  pcm: Pcm,
  fs: number,
  ceilingDb: number,
  envelope: (p: Pcm) => Float32Array,
  holdMs = 1.5,
  releaseMs = 60,
): number {
  const n = lengthOf(pcm);
  const c = 10 ** (ceilingDb / 20);
  const env = envelope(pcm);
  const need = new Float32Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    need[i] = env[i]! > c ? c / env[i]! : 1;
    if (need[i]! < 1) any = true;
  }
  if (!any) return 0;
  const r = Math.max(1, Math.round((holdMs / 1000) * fs));
  const held = slidingMin(need, r);
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i]! + held[i]!;
  const rel = 1 - Math.exp(-1 / Math.max(1, (releaseMs / 1000) * fs));
  let prev = 1;
  let deepest = 1;
  const gain = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - r);
    const b = Math.min(n, i + r + 1);
    const avg = (prefix[b]! - prefix[a]!) / (b - a);
    const g = Math.min(avg, prev + (1 - prev) * rel);
    gain[i] = g;
    prev = g;
    if (g < deepest) deepest = g;
  }
  for (const ch of pcm) for (let i = 0; i < n; i++) ch[i]! *= gain[i]!;
  return -20 * Math.log10(deepest);
}
