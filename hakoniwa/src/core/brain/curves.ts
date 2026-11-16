// Response curves of the built-in AI (builtin_ai.md 2.1): every consideration maps one
// input to 0..1 through a piecewise linear table of at most 8 nodes. Tables only, never
// Math.exp or a fractional power at runtime, so the same save replays identically on
// every platform. Pure and deterministic: no clock, no randomness.

export interface CurvePoint {
  x: number;
  y: number;
}

/** A piecewise linear curve: nodes sorted by x (ties allowed, for a step), at most MAX_NODES. */
export type Curve = readonly CurvePoint[];

export const MAX_NODES = 8;

/**
 * The curve's value at `x`: linear between the nodes, clamped outside them. A repeated x
 * (a step) reads as right-continuous: the value just at or after x wins, so `step(t)`
 * reads 0 below t and 1 from t on. An empty curve and a NaN input read 0.
 */
export function evalCurve(curve: Curve, x: number): number {
  if (curve.length === 0 || Number.isNaN(x)) return 0;
  const first = curve[0] as CurvePoint;
  if (x < first.x) return first.y;
  const last = curve[curve.length - 1] as CurvePoint;
  if (x >= last.x) return last.y;
  // the last node at or before x, then the last node sharing its x (a step reads upward)
  let i = 0;
  while (i + 1 < curve.length && (curve[i + 1] as CurvePoint).x <= x) i++;
  const a = curve[i] as CurvePoint;
  const b = curve[i + 1] as CurvePoint;
  if (b.x === a.x) return b.y;
  return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
}

const pt = (x: number, y: number): CurvePoint => ({ x, y });

function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/** `lin(a,b)`: 0 at a, rising to 1 at b (the more the better); a must be below b. */
export function lin(a: number, b: number): Curve {
  if (a >= b) throw new Error(`lin: a (${a}) must be below b (${b})`);
  return [pt(a, 0), pt(b, 1)];
}

/** `inv(a,b)`: 1 - lin(a,b) (the less the better: the hungrier, the more one wants to eat). */
export function inv(a: number, b: number): Curve {
  if (a >= b) throw new Error(`inv: a (${a}) must be below b (${b})`);
  return [pt(a, 1), pt(b, 0)];
}

/** `quad(a,b,k)`: lin(a,b) to the k-th power, with the nodes computed here, not at runtime. */
export function quad(a: number, b: number, k: 2 | 3): Curve {
  if (a >= b) throw new Error(`quad: a (${a}) must be below b (${b})`);
  const n = MAX_NODES - 1;
  const out: CurvePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(pt(round(a + (b - a) * t), round(k === 2 ? t * t : t * t * t)));
  }
  return out;
}

/** `step(t)`: 0 below t, 1 from t on (a hard threshold). */
export function step(t: number): Curve {
  return [pt(t, 0), pt(t, 1)];
}

/** `bell(m,w)`: 1 at m, falling to 0 at m-w and m+w (just right is best); w must be positive. */
export function bell(m: number, w: number): Curve {
  if (w <= 0) throw new Error(`bell: w (${w}) must be positive`);
  return [pt(m - w, 0), pt(m - w / 2, 0.5), pt(m, 1), pt(m + w / 2, 0.5), pt(m + w, 0)];
}

// Logistic f(u) = 1 / (1 + e^-5u) sampled at u = -1 .. 1 in 7 steps, rescaled so the
// endpoints land exactly on 0 and 1 (computed offline; see curves.test.ts for the check
// against the true function).
const LOGISTIC_Y: readonly number[] = [0, 0.0209, 0.0996, 0.3263, 0.6737, 0.9004, 0.9791, 1];

/** `logi(m,s)`: an S curve centred on m, s wide (a soft threshold); s must be positive. */
export function logi(m: number, s: number): Curve {
  if (s <= 0) throw new Error(`logi: s (${s}) must be positive`);
  const n = LOGISTIC_Y.length - 1;
  return LOGISTIC_Y.map((y, i) => pt(round(m + s * (i / n - 0.5) * 2), y));
}

/** Problems of a curve table (content validation): node count, order, range. */
export function curveProblems(curve: Curve): string[] {
  const out: string[] = [];
  if (curve.length === 0) out.push('curve has no node');
  if (curve.length > MAX_NODES) out.push(`curve has ${curve.length} nodes, over the ${MAX_NODES}`);
  for (let i = 0; i < curve.length; i++) {
    const p = curve[i] as CurvePoint;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
      out.push(`node ${i}: x and y must be finite`);
    if (p.y < 0 || p.y > 1) out.push(`node ${i}: y ${p.y} outside 0 to 1`);
    if (i > 0 && p.x < (curve[i - 1] as CurvePoint).x) out.push(`node ${i}: x out of order`);
  }
  return out;
}
