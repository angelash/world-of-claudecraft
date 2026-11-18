// The goddess brain's slice parts (builtin_ai.md 18 "谋划 goddess"): created on first use so a
// save written before the brain loads unchanged. Pure accessors over the goddess slice.

import { newRuleMemory } from '../../../core/brain/rules';
import { newLineHistory } from '../../dialogue/lines/history';
import type { BeatState, GoddessBrainState, GoddessSlice, OfferingAccount } from '../types';

export function newBrainState(): GoddessBrainState {
  return {
    plans: [],
    ended: [],
    react: newRuleMemory(),
    lines: newLineHistory(),
    notices: [],
    spent: {},
    actStart: {},
  };
}

/** Her brain state, created on first use. */
export function brainOf(slice: GoddessSlice, goddess: string): GoddessBrainState {
  slice.brains ??= {};
  let b = slice.brains[goddess];
  if (!b) {
    b = newBrainState();
    slice.brains[goddess] = b;
  }
  return b;
}

/** The scripted acts' states, created on first use. */
export function beatsOf(slice: GoddessSlice): Record<string, BeatState> {
  slice.beats ??= {};
  return slice.beats;
}

export function offeringAccount(slice: GoddessSlice): OfferingAccount {
  slice.offerings ??= { day: -1, gifted: [], interestAt: 0 };
  return slice.offerings;
}

/** Ended schemes kept in the save (oldest dropped first). */
export const ENDED_KEEP = 24;
/** Notices kept per goddess (the oldest drop first). */
export const NOTICES_KEEP = 8;
