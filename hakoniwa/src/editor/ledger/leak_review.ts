// Reveal-ledger review (docs/30_story/reveal_ledger.md 0.2 and 8): with the narrative's
// own findLeaks / scanForLeaks / lockedTerms / knowledgeFor, find locked terms and lore
// keywords in AI audit records, in content texts (dialogue lines, scenes, persona cards)
// and in the live event stream, judged at the current world flags or at a chosen act.
// Pure: no DOM.

import type { AuditRecord } from '../../ai/audit';
import type { AnyWorldEvent, ContentMap, FlagValue } from '../../core/contracts';
import type { LoreDef, TermDef } from '../../systems/goddess/types';
import {
  findLeaks,
  type KnowledgeTier,
  knowledgeFor,
  lockedTerms,
  scanForLeaks,
} from '../../systems/quests';
import { recordTexts } from '../audit/audit_model';
import { snippetAround, walkStrings } from '../util/json';

export type FlagWorld = { meta: { flags: Record<string, FlagValue> } };
type Lore = { lore: LoreDef[]; terms: TermDef[] };

export const KNOWLEDGE_TIERS: readonly KnowledgeTier[] = ['K0', 'K1', 'K2', 'K3', 'K4', 'K5'];

/** The ledger files define the locked words themselves; scanning them is meaningless. */
export const LEDGER_FILES = ['quests/lore.json', 'quests/terms.json'];

export function loreOf(content: ContentMap): Lore | null {
  const c = content as unknown as Partial<Lore>;
  return Array.isArray(c.lore) && Array.isArray(c.terms) ? { lore: c.lore, terms: c.terms } : null;
}

/** The world's flags with overrides (for example act = act3 to judge a later act). */
export function flagWorldAt(world: FlagWorld, overrides: Record<string, FlagValue>): FlagWorld {
  return { meta: { flags: { ...world.meta.flags, ...overrides } } };
}

export interface LeakHit {
  /** data file, audit id or event seq */
  source: string;
  path: string;
  terms: string[];
  snippet: string;
}

function hitFor(source: string, path: string, text: string, terms: string[]): LeakHit {
  return { source, path, terms, snippet: snippetAround(text, terms[0] as string) };
}

/** Leaks in every reviewable text of each audit record. */
export function reviewRecords(
  records: readonly Readonly<AuditRecord>[],
  world: FlagWorld,
  content: ContentMap,
): (LeakHit & { agentId: string; role: string })[] {
  const lore = loreOf(content);
  if (!lore) return [];
  const out: (LeakHit & { agentId: string; role: string })[] = [];
  for (const r of records) {
    for (const { field, text } of recordTexts(r)) {
      const terms = findLeaks(text, world, lore);
      if (terms.length) {
        out.push({ ...hitFor(r.auditId, field, text, terms), agentId: r.agentId, role: r.role });
      }
    }
  }
  return out;
}

/**
 * Leaks in data files. A file is first scanned whole with scanForLeaks; only files with
 * a hit are walked string by string to locate it.
 */
export function reviewData(
  files: ReadonlyMap<string, unknown>,
  world: FlagWorld,
  content: ContentMap,
  exclude: readonly string[] = LEDGER_FILES,
): LeakHit[] {
  const lore = loreOf(content);
  if (!lore) return [];
  const out: LeakHit[] = [];
  for (const [file, value] of files) {
    if (exclude.includes(file)) continue;
    if (scanForLeaks(value, world, lore).length === 0) continue;
    walkStrings(value, (text, path) => {
      const terms = findLeaks(text, world, lore);
      if (terms.length) out.push(hitFor(file, path, text, terms));
    });
  }
  return out;
}

/** Leaks in the text of recent events (dialogue lines, rumours, revelations). */
export function reviewEvents(
  events: readonly AnyWorldEvent[],
  world: FlagWorld,
  content: ContentMap,
): LeakHit[] {
  const lore = loreOf(content);
  if (!lore) return [];
  const out: LeakHit[] = [];
  for (const ev of events) {
    if (scanForLeaks(ev.data, world, lore).length === 0) continue;
    walkStrings(ev.data, (text, path) => {
      const terms = findLeaks(text, world, lore);
      if (terms.length) out.push(hitFor(`${ev.kind}#${ev.seq}`, path, text, terms));
    });
  }
  return out;
}

export function lockedTermList(world: FlagWorld, content: ContentMap): TermDef[] {
  const lore = loreOf(content);
  return lore ? lockedTerms(world, lore) : [];
}

/** What an agent of each knowledge tier may know right now. */
export function knowledgeByTier(
  world: FlagWorld,
  content: ContentMap,
): Record<KnowledgeTier, string[]> {
  const lore = loreOf(content);
  const out = {} as Record<KnowledgeTier, string[]>;
  for (const t of KNOWLEDGE_TIERS) out[t] = lore ? knowledgeFor(world, lore, t) : [];
  return out;
}

/** Terms with hit counts, most frequent first. */
export function termCounts(hits: readonly LeakHit[]): { term: string; count: number }[] {
  const m = new Map<string, number>();
  for (const h of hits) for (const t of h.terms) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}
