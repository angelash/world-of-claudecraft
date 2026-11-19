// Free text that touches a ledger clue with no topic of its own (builtin_ai.md 6.6 rows 5
// and 6, 6.3 step 3 "台账泄露签名"): the player names a locked truth. Nobody confirms it. A
// speaker the ledger names for that clue answers by its "解锁前处理" column
// (reveal_ledger.md 0.2 rule 3; the per-clue table data/dialogue/ledger_refusals.json): deny,
// evade, mislead with a topic's `mis` version, not know, or hint. Any other knower the lore
// lists takes the row's default (evade when none), and anyone else takes it for nonsense.
// Reads the lore table's keywords and leak signatures; a keyword counts as a signature
// (the lore rows carry keywords only so far).

import type { SystemContext } from '../../../core/system';
import type { TextParam } from '../../../core/text';
import type { LoreDef } from '../../goddess/types';
import { conditionHolds } from '../../quests/effects';
import { speak } from '../speak';
import { allTopics } from './graph';
import { topicFill } from './talk';
import { REFUSALS, type Refusal } from './types';

type SignedLore = LoreDef & { leakSignatures?: string[] };

/** One speaker's handling of a clue before it unlocks. */
export interface LedgerRefusalBy {
  /** a persona, companion, scene speaker or goddess id */
  speaker: string;
  refusal: Refusal;
}

/**
 * The "解锁前处理" of one ledger clue (reveal_ledger.md 0.2 rule 3): the speakers the ledger
 * names with their handling, the handling of any other knower, and the misdirection number
 * a `mis` speaker says (MIS-xx of the ledger's section 5).
 */
export interface LedgerRefusalRow {
  /** lore id (data/quests/lore.json) */
  clue: string;
  by: LedgerRefusalBy[];
  /** a knower the row does not name (evade when absent) */
  default?: Refusal;
  /** the misdirection a `mis` speaker gives: a topic listing it (or the clue) in `clues` */
  mis?: string;
}

declare module '../../../core/contracts' {
  interface ContentMap {
    ledgerRefusals: LedgerRefusalRow[];
  }
}

/** What a speaker does with a named locked clue: a ledger refusal, or nonsense. */
export type ClueRefusal = Refusal | 'nonsense';

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
 * The refusal for the locked clues the player named (6.6), with the clue it came from: the
 * first clue whose ledger row names the speaker gives that handling; else the first clue the
 * speaker is a listed knower of gives its row default (evade); else a row `default` written
 * for everyone (the ledger's "全体" rows, whose lore lists no knowers) applies to anyone;
 * else nonsense.
 */
export function clueRefusal(
  rows: readonly LedgerRefusalRow[] | undefined,
  clues: readonly Pick<LoreDef, 'id' | 'knowers'>[],
  speaker: string,
): { refusal: ClueRefusal; clue?: string } {
  const rowOf = (id: string) => rows?.find((r) => r.clue === id);
  for (const c of clues) {
    const named = rowOf(c.id)?.by.find((b) => b.speaker === speaker);
    if (named) return { refusal: named.refusal, clue: c.id };
  }
  for (const c of clues)
    if ((c.knowers ?? []).includes(speaker))
      return { refusal: rowOf(c.id)?.default ?? 'evade', clue: c.id };
  for (const c of clues) {
    const all = rowOf(c.id)?.default;
    if (all !== undefined && (c.knowers ?? []).length === 0) return { refusal: all, clue: c.id };
  }
  return { refusal: 'nonsense' };
}

/**
 * A `mis` speaker's misdirection of a clue (6.6, said sincerely): the `mis` version of the
 * first topic whose `clues` list the clue or its misdirection number; null when the speaker
 * has no such line (the caller evades instead).
 */
export function clueMisLine(ctx: SystemContext, npcRef: string, clue: string): TextParam | null {
  const mis = ctx.content.ledgerRefusals?.find((r) => r.clue === clue)?.mis;
  for (const t of allTopics(ctx.content)) {
    if (!(t.clues ?? []).some((c) => c === clue || (mis !== undefined && c === mis))) continue;
    const said = speak(ctx, {
      speaker: npcRef,
      slot: `topic.${t.id}`,
      vars: topicFill(ctx, npcRef, t).vars,
      version: 'mis',
      versionBy: 'exact',
    });
    if (said) return said.text;
  }
  return null;
}

/** Problems of the per-clue refusal table: clues, speakers, refusals and misdirections. */
export function ledgerRefusalProblems(
  rows: readonly LedgerRefusalRow[] | undefined,
  lore: readonly { id: string }[],
  speakers: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  const clues = new Set(lore.map((l) => l.id));
  const seen = new Set<string>();
  const isRefusal = (v: unknown) => (REFUSALS as readonly unknown[]).includes(v);
  for (const r of rows ?? []) {
    const at = `ledger refusal ${r.clue}`;
    if (!clues.has(r.clue)) out.push(`${at}: no lore row ${r.clue}`);
    if (seen.has(r.clue)) out.push(`${at}: duplicate clue`);
    seen.add(r.clue);
    if (!Array.isArray(r.by)) {
      out.push(`${at}: by must be a list of speaker and refusal`);
      continue;
    }
    if (r.by.length === 0 && r.default === undefined) out.push(`${at}: names nobody`);
    const named = new Set<string>();
    for (const b of r.by) {
      if (!speakers.has(b.speaker)) out.push(`${at}: unknown speaker ${b.speaker}`);
      if (named.has(b.speaker)) out.push(`${at}: speaker ${b.speaker} listed twice`);
      named.add(b.speaker);
      if (!isRefusal(b.refusal))
        out.push(
          `${at}: ${b.speaker}: refusal ${String(b.refusal)} is not one of ${REFUSALS.join(', ')}`,
        );
    }
    if (r.default !== undefined && !isRefusal(r.default))
      out.push(`${at}: default ${String(r.default)} is not one of ${REFUSALS.join(', ')}`);
    const misUsed = r.by.some((b) => b.refusal === 'mis') || r.default === 'mis';
    if (r.mis !== undefined && !/^MIS-\d+$/.test(r.mis))
      out.push(`${at}: mis ${r.mis} is not a misdirection number (MIS-xx)`);
    if (r.mis !== undefined && !misUsed) out.push(`${at}: mis given but nobody misleads`);
  }
  return out;
}
