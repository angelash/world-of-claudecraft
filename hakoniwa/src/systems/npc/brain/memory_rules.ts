// Memory templates (builtin_ai.md 5.3): the kernel writes a memory the moment something
// happens, from a template per kind (sys.npc.memory.ev.<kind>) with a short version for the
// {memory} fill slot (sys.npc.memory.short.<kind>). Importance starts from the kind's base
// and is multiplied for relevance to the person's goals (x1.3), to the player (x1.2) and
// for rarity (the first of its kind this week, x1.2), capped at 1. Deterministic.

import type { SystemContext } from '../../../core/system';
import { type TextParam, tr } from '../../../core/text';
import { calendarAt } from '../../../core/time';
import { addMemory } from '../memory';
import type { MemorySource } from '../types';

/** Memory kinds of the event table (builtin_ai.md 5.3), plus the brain's own. */
export const MEMORY_KINDS = [
  'feat_seen',
  'rumor_heard',
  'talk_player',
  'gift',
  'helped',
  'saved',
  'insulted',
  'harmed',
  'cheated',
  'trade',
  'quarrel',
  'reconcile',
  'promise',
  'kept',
  'broken',
  'miracle',
  'oracle',
  'mourning',
  'belief_changed',
  'decision',
  'decision_heard',
  'approached',
  'invited',
  'asked_help',
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** Base importance of each kind (builtin_ai.md 5.3; the deed's salience adds to feat_seen). */
const BASE: Record<MemoryKind, number> = {
  feat_seen: 0.3,
  rumor_heard: 0.1,
  talk_player: 0.15,
  gift: 0.3,
  helped: 0.4,
  saved: 0.8,
  insulted: 0.4,
  harmed: 0.6,
  cheated: 0.5,
  trade: 0.05,
  quarrel: 0.3,
  reconcile: 0.2,
  promise: 0.2,
  kept: 0.2,
  broken: 0.4,
  miracle: 0.7,
  oracle: 0.9,
  mourning: 0.9,
  belief_changed: 0.5,
  decision: 0.5,
  decision_heard: 0.3,
  approached: 0.2,
  invited: 0.2,
  asked_help: 0.25,
};

const SOURCE: Partial<Record<MemoryKind, MemorySource>> = {
  feat_seen: 'seen',
  rumor_heard: 'heard',
  miracle: 'seen',
  belief_changed: 'inferred',
  decision_heard: 'heard',
};

export interface RememberOptions {
  /** who or what it is about: 'player', a persona id */
  about?: string;
  /** the deed's salience 0..1 (feat_seen: 0.3 + salience x 0.6) */
  salience?: number;
  /** bears on one of the person's goals */
  goal?: boolean;
  /** credibility of a heard memory */
  cred?: number;
}

/** The importance of a new memory of `kind` (builtin_ai.md 5.3), capped at 1. */
export function memoryImportance(
  kind: MemoryKind,
  opts: RememberOptions,
  firstThisWeek: boolean,
): number {
  let imp = BASE[kind];
  if (kind === 'feat_seen') imp += 0.6 * Math.max(0, Math.min(1, opts.salience ?? 0));
  if (kind === 'talk_player' && firstThisWeek) imp = Math.max(imp, 0.4);
  if (opts.goal) imp *= 1.3;
  if (opts.about === 'player') imp *= 1.2;
  if (firstThisWeek) imp *= 1.2;
  return Math.round(Math.min(1, imp) * 1000) / 1000;
}

/** Write one memory of `kind` for a named NPC from its template (no-op for residents). */
export function remember(
  ctx: SystemContext,
  npcId: string,
  kind: MemoryKind,
  params: Record<string, TextParam>,
  opts: RememberOptions = {},
): void {
  const mind = ctx.world.slices.npc.minds[npcId];
  if (!mind) return;
  const day = calendarAt(ctx.tick).dayIndex;
  const first = !mind.mem.some((m) => m.tag === kind && day - m.day < 7);
  addMemory(ctx, npcId, {
    text: tr(`sys.npc.memory.ev.${kind}`, params),
    short: tr(`sys.npc.memory.short.${kind}`, params),
    src: SOURCE[kind] ?? 'self',
    cred: opts.cred,
    about: opts.about,
    imp: memoryImportance(kind, opts, first),
    tag: kind,
  });
}
