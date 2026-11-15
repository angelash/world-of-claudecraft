// Loudness and true peak after ITU-R BS.1770-4 and EBU R128 / Tech 3341 (audio_direction.md 8.1
// and 11.4), on decoded PCM:
// - K-weighting: the standard high-shelf and RLB high-pass biquads, derived for any sample rate
//   (the same closed form libebur128 uses).
// - Momentary loudness: 400 ms windows; short-term: 3 s windows; both on a 100 ms hop.
// - Integrated loudness: 400 ms blocks with 75% overlap, absolute gate -70 LUFS, relative gate
//   -10 LU.
// - True peak: 4x oversampling with a 96-tap windowed-sinc polyphase interpolator (BS.1770-4
//   Annex 2 permits any filter of this class; measured values agree with reference meters to
//   about 0.1 dB on program material, inside the 1 LU tolerance of release_engineering.md 9.8).
// Mono and stereo channels weigh 1.0 each. Sounds shorter than a window are measured as if
// padded with silence to the window length.

export interface Loudness {
  /** Integrated loudness, LUFS (-Infinity for silence). */
  integrated: number;
  /** Highest momentary (400 ms) loudness, LUFS. */
  momentaryMax: number;
  /** Highest short-term (3 s) loudness, LUFS. */
  shortTermMax: number;
  /** True peak, dBTP. */
  truePeak: number;
  /** Sample peak, dBFS. */
  samplePeak: number;
}

interface Biquad {
  b: [number, number, number];
  a: [number, number, number];
}

export function kWeighting(fs: number): [Biquad, Biquad] {
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs);
  const Vh = 10 ** (G / 20);
  const Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b: [
      (Vh + (Vb * K) / Q + K * K) / a0,
      (2 * (K * K - Vh)) / a0,
      (Vh - (Vb * K) / Q + K * K) / a0,
    ],
    a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
  };
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / fs);
  a0 = 1 + K / Q + K * K;
  const highpass: Biquad = {
    b: [1, -2, 1],
    a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
  };
  return [shelf, highpass];
}

function filter(x: ArrayLike<number>, f: Biquad): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  const [b0, b1, b2] = f.b;
  const [, a1, a2] = f.a;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!;
    const yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    y[i] = yi;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = yi;
  }
  return y;
}

const toLufs = (meanSquare: number): number =>
  meanSquare > 0 ? -0.691 + 10 * Math.log10(meanSquare) : Number.NEGATIVE_INFINITY;

/** Energy (sum of squared K-weighted samples, summed over channels) per 100 ms segment. */
function segmentEnergy(
  channels: Float32Array[],
  fs: number,
): { seg: Float64Array; segLen: number } {
  const segLen = Math.round(fs / 10);
  const n = channels[0]?.length ?? 0;
  const count = Math.max(1, Math.ceil(n / segLen));
  const seg = new Float64Array(count);
  const [shelf, hp] = kWeighting(fs);
  for (const ch of channels) {
    const y = filter(filter(ch, shelf), hp);
    for (let i = 0; i < y.length; i++) seg[Math.floor(i / segLen)]! += y[i]! * y[i]!;
  }
  return { seg, segLen };
}

/** Window loudness values (window of `segs` segments, 1-segment hop); short input is padded. */
function windows(seg: Float64Array, segLen: number, segs: number): number[] {
  const out: number[] = [];
  const last = Math.max(0, seg.length - segs);
  for (let s = 0; s <= last; s++) {
    let e = 0;
    for (let k = s; k < Math.min(seg.length, s + segs); k++) e += seg[k]!;
    out.push(e / (segs * segLen));
  }
  return out;
}

// 4x interpolator: 96 taps (24 per phase), Kaiser-windowed sinc (beta 8), each phase normalised
// to unit DC gain. Longer than the 48-tap example of BS.1770-4 Annex 2 so content near 20 kHz
// is not under-read.
const PHASES = 4;
const TAPS = 24;
/** Delay of the interpolator in input samples (half its span). */
export const TRUE_PEAK_DELAY = (TAPS - 1) / 2;
const POLY: Float64Array[] = (() => {
  const L = PHASES * TAPS;
  const beta = 8;
  const i0 = (x: number): number => {
    let s = 1;
    let t = 1;
    for (let k = 1; k < 40; k++) {
      t *= (x / (2 * k)) ** 2;
      s += t;
    }
    return s;
  };
  const h = new Float64Array(L);
  const mid = (L - 1) / 2;
  for (let n = 0; n < L; n++) {
    const t = (n - mid) / PHASES;
    const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
    const r = (n - mid) / mid;
    h[n] = sinc * (i0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / i0(beta));
  }
  const out: Float64Array[] = [];
  for (let p = 0; p < PHASES; p++) {
    const f = new Float64Array(TAPS);
    let sum = 0;
    for (let k = 0; k < TAPS; k++) {
      f[k] = h[k * PHASES + p]!;
      sum += f[k]!;
    }
    for (let k = 0; k < TAPS; k++) f[k]! /= sum;
    out.push(f);
  }
  return out;
})();

/**
 * Per input sample, the largest absolute value of the 4x oversampled signal around it (all
 * channels), aligned to the input timeline. The limiter reads it; truePeakLinear is its maximum.
 */
export function truePeakEnvelope(channels: Float32Array[]): Float32Array {
  const n = channels[0]?.length ?? 0;
  const env = new Float32Array(n);
  const d = Math.floor(TRUE_PEAK_DELAY);
  for (const ch of channels) {
    for (let i = 0; i < n + TAPS; i++) {
      let m = 0;
      for (let p = 0; p < PHASES; p++) {
        const f = POLY[p]!;
        let acc = 0;
        for (let k = 0; k < TAPS; k++) {
          const j = i - k;
          if (j >= 0 && j < n) acc += ch[j]! * f[k]!;
        }
        const a = Math.abs(acc);
        if (a > m) m = a;
      }
      const at = Math.min(n - 1, Math.max(0, i - d));
      if (m > env[at]!) env[at] = m;
    }
    for (let i = 0; i < n; i++) {
      const a = Math.abs(ch[i]!);
      if (a > env[i]!) env[i] = a;
    }
  }
  return env;
}

/** Linear true peak (maximum absolute value of the 4x oversampled signal over all channels). */
export function truePeakLinear(channels: Float32Array[]): number {
  const env = truePeakEnvelope(channels);
  let peak = 0;
  for (let i = 0; i < env.length; i++) if (env[i]! > peak) peak = env[i]!;
  return peak;
}

const db = (lin: number): number => (lin > 0 ? 20 * Math.log10(lin) : Number.NEGATIVE_INFINITY);

export function measureLoudness(channels: Float32Array[], fs: number): Loudness {
  const { seg, segLen } = segmentEnergy(channels, fs);
  const momentary = windows(seg, segLen, 4);
  const shortTerm = windows(seg, segLen, 30);
  // Gating blocks are the momentary windows (400 ms, 75% overlap).
  const abs = momentary.filter((e) => toLufs(e) > -70);
  let integrated = Number.NEGATIVE_INFINITY;
  if (abs.length > 0) {
    const rel = toLufs(abs.reduce((s, e) => s + e, 0) / abs.length) - 10;
    const gated = abs.filter((e) => toLufs(e) > rel);
    if (gated.length > 0) integrated = toLufs(gated.reduce((s, e) => s + e, 0) / gated.length);
  }
  let samplePeak = 0;
  for (const ch of channels)
    for (let i = 0; i < ch.length; i++) samplePeak = Math.max(samplePeak, Math.abs(ch[i]!));
  return {
    integrated,
    momentaryMax: Math.max(...momentary.map(toLufs)),
    shortTermMax: Math.max(...shortTerm.map(toLufs)),
    truePeak: db(truePeakLinear(channels)),
    samplePeak: db(samplePeak),
  };
}

/** The value a template's target refers to: integrated, short-term max or momentary max. */
export function loudnessFor(l: Loudness, measure: 'I' | 'S' | 'M'): number {
  return measure === 'I' ? l.integrated : measure === 'S' ? l.shortTermMax : l.momentaryMax;
}
