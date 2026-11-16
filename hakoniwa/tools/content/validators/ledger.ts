// V5 reveal ledger (release_engineering.md 7.4; reveal_ledger.md 0.2 and 8): player-visible
// text is scanned for leaks at the earliest act it can be seen. The scan is the narrative
// system's own (src/systems/quests findLeaks over the ledger's terms and lore). What the
// layer names, the forbidden terms (data/quests/terms.json) and a lore entry's
// `leakSignatures` (the coined words unique to that clue, ai_architecture.md 7.4, AQ-04),
// blocks. A lore entry's `keywords` are the AI guard's broader phrases (they include
// everyday words such as 后门 or 一模一样), so a keyword hit in written text is a warning
// for review, not a block.
//
// The world of act N holds `act = N` and every registered story flag of acts up to N: the
// ledger's per-act lists (reveal_ledger.md 8) name what stays locked for the whole act, so
// a text visible in act N may use what that act reveals, never what a later act does. A
// revealed name (a field shown once the row's revealWhen holds) is judged in a world where
// that condition holds.
//
// ./ledger_reviewed.json lists reviewed hits in files outside this layer's reach; each one
// warns until its milestone and blocks from then on, and an entry matching no hit is stale.

import type { ContentMap, FlagValue } from '../../../src/core/contracts';
import { defaultRegistry, FlagRegistry, registryData } from '../../../src/core/registry';
import type { LoreDef, TermDef } from '../../../src/systems/goddess/types';
import { findLeaks } from '../../../src/systems/quests';
import {
  checkCondition,
  comparisons,
  evaluate,
  flagResolver,
} from '../../../src/systems/quests/conditions';
import { earliestActs } from './acts';
import reviewedFile from './ledger_reviewed.json';
import { idFieldsOf, playerTexts } from './player_text';
import { type Finding, milestoneIndex, type ValidationInput, type Validator } from './types';

export interface ReviewedHit {
  table: string;
  row: string;
  path: string;
  term: string;
  /** milestone label from which the hit blocks again */
  until: string;
  reason: string;
}

export const REVIEWED: readonly ReviewedHit[] = (reviewedFile as { entries: ReviewedHit[] })
  .entries;

export const ACT_NAMES = [
  'prologue',
  'act1',
  'act2',
  'act3',
  'act4',
  'act5',
  'act6',
  'epilogue',
] as const;

type Lore = { lore: LoreDef[]; terms: TermDef[] };
type FlagWorld = { meta: { flags: Record<string, FlagValue> } };
type Signed = LoreDef & { leakSignatures?: string[] };

/**
 * The ledger content in two cuts: `strict` scans the terms and the leak signatures only,
 * `broad` adds every lore keyword.
 */
export function ledgerOf(content: ContentMap): { strict: Lore; broad: Lore } | null {
  const c = content as unknown as Partial<Lore>;
  if (!Array.isArray(c.lore) || !Array.isArray(c.terms)) return null;
  const sig = (l: Signed) => l.leakSignatures ?? [];
  return {
    strict: { terms: c.terms, lore: c.lore.map((l) => ({ ...l, keywords: sig(l) })) },
    broad: {
      terms: c.terms,
      lore: c.lore.map((l) => ({ ...l, keywords: [...(l.keywords ?? []), ...sig(l)] })),
    },
  };
}

/** Flags of the world at the earliest point of act `n` (0 prologue ... 7 epilogue). */
export function actWorld(content: ContentMap, n: number): FlagWorld {
  const data = (content as { registry?: ReturnType<typeof registryData> }).registry;
  const registry = !data || data === registryData() ? defaultRegistry() : new FlagRegistry(data);
  const flags: Record<string, FlagValue> = { act: ACT_NAMES[n] ?? 'epilogue' };
  for (const v of registry.data.vars) {
    if (v.act === null || v.act > n) continue;
    if (v.kind === 'flag' || v.kind === 'bool') flags[v.name] = true;
  }
  return { meta: { flags } };
}

/** A world where `expr` holds, built on `world` (unchanged when it cannot be satisfied). */
export function worldWhere(world: FlagWorld, expr: string): FlagWorld {
  if (checkCondition(expr) !== null) return world;
  const flags = { ...world.meta.flags };
  for (const c of comparisons(expr)) {
    const lit = c.literals[0];
    if (c.op === 'truthy') flags[c.name] = true;
    else if (
      (c.op === '==' || c.op === '>=' || c.op === '<=' || c.op === 'IN') &&
      lit !== undefined
    )
      flags[c.name] = lit;
    else if (c.op === '>' && typeof lit === 'number') flags[c.name] = lit + 1;
  }
  return evaluate(expr, flagResolver(flags)) ? { meta: { flags } } : world;
}

export function ledgerFindings(
  input: Pick<ValidationInput, 'content' | 'packs' | 'milestone'>,
  reviewed: readonly ReviewedHit[] = REVIEWED,
): Finding[] {
  const ledger = ledgerOf(input.content);
  if (!ledger) return [{ level: 'error', message: 'no lore or terms table to scan with' }];
  const acts = earliestActs(input.content);
  const worlds = new Map<number, FlagWorld>();
  const worldAt = (n: number): FlagWorld => {
    let w = worlds.get(n);
    if (!w) {
      w = actWorld(input.content, n);
      worlds.set(n, w);
    }
    return w;
  };
  const out: Finding[] = [];
  const used = new Set<ReviewedHit>();
  for (const t of playerTexts(input.content, undefined, idFieldsOf(input.packs))) {
    if (typeof t.value !== 'string' || t.value === '') continue;
    const n = acts.of(t.table, t.row);
    const world = t.gate ? worldWhere(worldAt(n), t.gate) : worldAt(n);
    const strict = findLeaks(t.value, world, ledger.strict);
    const broad = findLeaks(t.value, world, ledger.broad).filter((h) => !strict.includes(h));
    const base = { table: t.table, row: t.row, path: t.path };
    const when = `${ACT_NAMES[n] ?? n}${t.gate ? ` once ${t.gate}` : ''}`;
    const blocking: string[] = [];
    for (const term of strict) {
      const r = reviewed.find(
        (e) => e.table === t.table && e.row === t.row && e.path === t.path && e.term === term,
      );
      if (r) used.add(r);
      if (r && input.milestone < milestoneIndex(r.until))
        out.push({
          ...base,
          level: 'warning',
          message: `${t.table}:${t.row} ${t.path}: ${term} still locked in ${when}; reviewed, blocks from ${r.until}: ${r.reason}`,
        });
      else blocking.push(term);
    }
    if (blocking.length)
      out.push({
        ...base,
        level: 'error',
        message: `${t.table}:${t.row} ${t.path}: ${blocking.join(', ')} still locked in ${when} (earliest this text is visible)`,
      });
    if (broad.length)
      out.push({
        ...base,
        level: 'warning',
        message: `${t.table}:${t.row} ${t.path}: ledger keyword ${broad.join(', ')} still locked in ${when}`,
      });
  }
  for (const r of reviewed)
    if (!used.has(r))
      out.push({
        level: 'error',
        message: `ledger_reviewed.json: ${r.table}:${r.row} ${r.path} ${r.term} matches no hit (remove the stale entry)`,
        table: r.table,
        row: r.row,
        path: r.path,
      });
  return out;
}

export const ledgerValidator: Validator = {
  id: 'V5',
  title: 'reveal ledger',
  run: ledgerFindings,
};
