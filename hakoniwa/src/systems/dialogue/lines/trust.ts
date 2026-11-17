// Trust bands (builtin_ai.md 7.4): the greeting and part of the reactions pick their lines
// by how the speaker stands with the player. Cold when like is -15 or less, trust under
// 30, the speaker is angry and it is the player's doing, or the speaker's belief forked
// hostile; warm when trust is 60 or more with like 20 or more, the speaker is a companion,
// or the belief forked into worship; neutral otherwise (cold is checked first). Pure.

import type { TrustBand } from './types';

export interface TrustInput {
  like: number;
  trust: number;
  /** the speaker's angry mood is aimed at the player */
  angryAtPlayer?: boolean;
  /** the speaker's belief state about the player (cognition) */
  belief?: string;
  /** the speaker is a companion of the player */
  companion?: boolean;
}

export function trustBandOf(x: TrustInput): TrustBand {
  if (x.like <= -15 || x.trust < 30 || x.angryAtPlayer || x.belief === 'hostile') return 'cold';
  if ((x.trust >= 60 && x.like >= 20) || x.companion || x.belief === 'worship') return 'warm';
  return 'neutral';
}

/** The day part of a greeting slot: day from 6 to 18 (builtin_ai.md 7.4). */
export function dayPartOf(hour: number): 'day' | 'night' {
  return hour >= 6 && hour < 18 ? 'day' : 'night';
}
