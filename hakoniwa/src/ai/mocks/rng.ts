// A small seeded random source for the test doubles (mulberry32): the same seed always gives
// the same fault and latency sequence, so chaos runs and randomized budget checks replay
// exactly. Never used by the world kernel, which has its own named streams.

export interface SeededRandom {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number;
}

export function seededRandom(seed: number): SeededRandom {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
  };
}
