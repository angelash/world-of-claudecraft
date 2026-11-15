// Deterministic seeded random number generator (mulberry32).
// The state lives in a plain object so it serializes with the world and every
// system can own an independent named stream (see World.rng).

export interface RngState {
  s: number;
}

export class Rng {
  constructor(private readonly st: RngState) {}

  /** Uniform float in [0, 1). */
  next(): number {
    this.st.s = (this.st.s + 0x6d2b79f5) | 0;
    let t = this.st.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty array');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  weighted<T>(items: readonly { w: number; v: T }[]): T {
    let total = 0;
    for (const it of items) total += Math.max(0, it.w);
    if (total <= 0) throw new Error('Rng.weighted with no positive weight');
    let roll = this.next() * total;
    for (const it of items) {
      roll -= Math.max(0, it.w);
      if (roll < 0) return it.v;
    }
    return (items[items.length - 1] as { v: T }).v;
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }
}

/** FNV-1a style mix of a numeric seed and a stream name into a 32-bit state. */
export function hashSeed(seed: number, name: string): number {
  let h = 0x811c9dc5 ^ (seed | 0);
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return h | 0;
}
