// Free text that touches a ledger clue with no topic of its own (builtin_ai.md 6.6 rows 5
// and 6, 6.3 step 3 "台账泄露签名"): the player names a locked truth. Nobody confirms it: a
// knower gives the clue's handling (evade unless the clue says otherwise), anyone else
// takes it for nonsense. Reads the lore table's keywords and leak signatures.

import type { SystemContext } from '../../../core/system';
import type { LoreDef } from '../../goddess/types';
import { conditionHolds } from '../../quests/effects';
import type { Refusal } from './types';

type SignedLore = LoreDef & { leakSignatures?: string[] };

/** Locked lore entries the text names by a keyword or a leak signature. */
export function lockedCluesIn(ctx: SystemContext, text: string): LoreDef[] {
  const out: LoreDef[] = [];
  for (const l of (ctx.content as { lore?: SignedLore[] }).lore ?? []) {
    const words = [...(l.keywords ?? []), ...(l.leakSignatures ?? [])];
    if (!words.some((w) => w && text.includes(w))) continue;
    if (conditionHolds(ctx, l.unlock)) continue;
    out.push(l);
  }
  return out;
}

/**
 * The refusal for a locked clue the player named (6.6): a knower evades (the handling
 * table is per clue in the ledger; evade is the safe default), anyone else hears nonsense.
 */
export function clueRefusal(clues: readonly LoreDef[], speaker: string): Refusal | 'nonsense' {
  return clues.some((c) => (c.knowers ?? []).includes(speaker)) ? 'evade' : 'nonsense';
}
