// Small statistics helpers for the audit desk and the balance lab. Pure.

export function mean(values: readonly number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Nearest-rank percentile (p in 0..1); 0 for an empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[rank] as number;
}

export function rate(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

/** Seeds 1..n offset by a base, so batches are reproducible. */
export function seedList(base: number, n: number): number[] {
  return Array.from({ length: Math.max(0, Math.floor(n)) }, (_, i) => (base + i) | 0);
}
