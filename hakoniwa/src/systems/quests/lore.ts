// The reveal ledger at run time (docs/30_story/reveal_ledger.md 0.2, 6): which lore an
// agent may know, which names are still forbidden, a leak scanner for AI prompts and
// outputs, and the rewrite applied to model text before it reaches the player.

import type { FlagValue } from '../../core/contracts';
import type { TextParam } from '../../core/text';
import type { LoreDef, TermDef } from '../goddess/types';
import { evaluate, flagResolver } from './conditions';

export type KnowledgeTier = 'K0' | 'K1' | 'K2' | 'K3' | 'K4' | 'K5';

const TIER_RANK: Record<string, number> = { K0: 0, K1: 1, K2: 2, K3: 3, K4: 4, K5: 5 };

type FlagWorld = { meta: { flags: Record<string, FlagValue> } };
type LoreContent = { lore: LoreDef[]; terms: TermDef[] };

export function isUnlocked(world: FlagWorld, expr: string): boolean {
  return evaluate(expr, flagResolver(world.meta.flags));
}

/**
 * Lore texts an agent may know right now (reveal_ledger.md 0.2 rule 1): unlocked, and
 * the agent's tier is high enough or the agent is a named knower.
 */
export function knowledgeFor(
  world: FlagWorld,
  content: Pick<LoreContent, 'lore'>,
  tier: KnowledgeTier,
  agentId?: string,
): string[] {
  const rank = TIER_RANK[tier] ?? 0;
  const out: string[] = [];
  for (const l of content.lore) {
    if (!isUnlocked(world, l.unlock)) continue;
    const known =
      (l.tier !== 'P' && rank >= (TIER_RANK[l.tier] ?? 9)) ||
      (!!agentId && (l.knowers ?? []).includes(agentId));
    if (known) out.push(l.text);
  }
  return out;
}

/** Terms whose unlock does not hold yet (forbidden in prompts and outputs). */
export function lockedTerms(world: FlagWorld, content: Pick<LoreContent, 'terms'>): TermDef[] {
  return content.terms.filter((t) => !isUnlocked(world, t.unlock));
}

/** Keywords of lore entries that are still locked. */
export function lockedKeywords(world: FlagWorld, content: Pick<LoreContent, 'lore'>): string[] {
  const out = new Set<string>();
  for (const l of content.lore) {
    if (isUnlocked(world, l.unlock)) continue;
    for (const k of l.keywords ?? []) out.add(k);
  }
  return [...out];
}

/**
 * Locked terms and lore keywords found in a text (the editor's ledger check and the
 * prompt guard). Keywords that are also unlocked terms are not reported.
 */
export function findLeaks(text: string, world: FlagWorld, content: LoreContent): string[] {
  const hits = new Set<string>();
  for (const t of lockedTerms(world, content)) if (text.includes(t.term)) hits.add(t.term);
  const open = new Set(content.terms.filter((t) => isUnlocked(world, t.unlock)).map((t) => t.term));
  for (const k of lockedKeywords(world, content)) if (!open.has(k) && text.includes(k)) hits.add(k);
  return [...hits];
}

/** Rewrite locked terms in model output with their allowed replacements (goddess_gm.md 7.1 clause 5). */
export function sanitizeText(
  text: string,
  world: FlagWorld,
  content: Pick<LoreContent, 'terms'>,
): string {
  let out = text;
  for (const t of lockedTerms(world, content)) {
    if (out.includes(t.term)) out = out.split(t.term).join(t.replacement);
  }
  return out;
}

/** sanitizeText over a text value: a string, or the string params of a TextRef. */
export function sanitizeTextParam(
  text: TextParam,
  world: FlagWorld,
  content: Pick<LoreContent, 'terms'>,
): TextParam {
  if (typeof text === 'string') return sanitizeText(text, world, content);
  if (typeof text === 'number' || !('key' in text) || !text.params) return text;
  const params: Record<string, TextParam> = {};
  for (const [k, v] of Object.entries(text.params))
    params[k] = sanitizeTextParam(v, world, content);
  return { key: text.key, params };
}

/**
 * Recursively scan any JSON value (an AI context) for leaks. Kernel text is TextRefs
 * (D-077): render them first (renderTextDeep from src/shared_ui/i18n) so the scan sees
 * the source-language text the keys stand for; content strings in params are scanned as is.
 */
export function scanForLeaks(value: unknown, world: FlagWorld, content: LoreContent): string[] {
  return findLeaks(JSON.stringify(value ?? ''), world, content);
}
