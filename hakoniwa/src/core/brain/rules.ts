// Rule tables of the built-in AI (builtin_ai.md 2.5): the narrative director, the
// reaction tables (goddess to player, NPC to event) and other "under this condition, do
// this" tables. Conditions use the reveal-ledger syntax; the caller evaluates them (the
// kernel's condition evaluator lives in src/systems/quests/conditions.ts, which core may
// not import), so this module stays a pure core primitive. Deterministic: ties and
// weighted draws follow fixed rules and only use the Rng the caller passes in.

import type { Rng } from '../rng';
import { calendarAt } from '../time';
import { weightedIndex } from './utility';

export type RuleOnce = 'act' | 'game' | 'day';

export interface RuleRow {
  id: string;
  /** reveal-ledger condition; may reference event fields (event.kind == 'feat_seen') */
  when: string;
  /** higher first */
  priority: number;
  then: { action: string; params?: Record<string, string> }[];
  cooldownTicks?: number;
  once?: RuleOnce;
  /** draw weight among rows of the same priority that hold together */
  weight?: number;
}

/** What a row was last fired at (kept by the caller, in its own slice when it must persist). */
export interface RuleMemory {
  /** row id to the tick it last fired */
  lastTick: Record<string, number>;
  /** row id to the once-scope token it fired in ('game', 'act:<act>', 'day:<n>') */
  onceToken: Record<string, string>;
}

export function newRuleMemory(): RuleMemory {
  return { lastTick: {}, onceToken: {} };
}

export interface RuleEnv {
  tick: number;
  /** the current act flag value, for once: 'act' */
  act?: string;
  /** evaluates a row's `when` (an empty condition holds) */
  holds(when: string, row: RuleRow): boolean;
}

/** The once-scope token a firing at `env` belongs to. */
export function onceToken(scope: RuleOnce, env: Pick<RuleEnv, 'tick' | 'act'>): string {
  if (scope === 'game') return 'game';
  if (scope === 'act') return `act:${env.act ?? ''}`;
  return `day:${calendarAt(env.tick).dayIndex}`;
}

/** True when the row is not cooling down and has not used its once-scope yet. */
export function rowReady(row: RuleRow, env: RuleEnv, mem?: RuleMemory): boolean {
  if (!mem) return true;
  const last = mem.lastTick[row.id];
  if (row.cooldownTicks !== undefined && last !== undefined && env.tick - last < row.cooldownTicks)
    return false;
  if (row.once && mem.onceToken[row.id] === onceToken(row.once, env)) return false;
  return true;
}

/** Priority descending, then id ascending (code unit order). */
function byPriorityThenId(a: RuleRow, b: RuleRow): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Every row that holds and is ready, highest priority first, ties by id ascending. */
export function allMatches(rows: readonly RuleRow[], env: RuleEnv, mem?: RuleMemory): RuleRow[] {
  return rows
    .filter((r) => rowReady(r, env, mem) && ((r.when ?? '').trim() === '' || env.holds(r.when, r)))
    .sort(byPriorityThenId);
}

/**
 * The single row to fire (builtin_ai 2.5): the highest priority among the rows that hold.
 * Rows tied on that priority are settled by weight when any of them declares one and an
 * rng is given (a draw in id order, missing weights count 1); otherwise the smallest id
 * wins.
 */
export function firstMatch(
  rows: readonly RuleRow[],
  env: RuleEnv,
  mem?: RuleMemory,
  rng?: Rng,
): RuleRow | null {
  const all = allMatches(rows, env, mem);
  const top = all[0];
  if (!top) return null;
  const tied = all.filter((r) => r.priority === top.priority);
  if (tied.length < 2 || !rng || !tied.some((r) => r.weight !== undefined)) return top;
  const { index } = weightedIndex(
    rng,
    tied.map((r) => r.weight ?? 1),
  );
  return tied[index] as RuleRow;
}

/** Record a firing (cooldown and once-scope). */
export function markFired(row: RuleRow, env: Pick<RuleEnv, 'tick' | 'act'>, mem: RuleMemory): void {
  mem.lastTick[row.id] = env.tick;
  if (row.once) mem.onceToken[row.id] = onceToken(row.once, env);
}

/** Problems of a rule table (content validation): ids, priorities, conditions. */
export function ruleProblems(
  rows: readonly RuleRow[],
  checkCondition?: (when: string) => string | null,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.id) out.push('rule without an id');
    if (seen.has(r.id)) out.push(`rule ${r.id}: duplicate id`);
    seen.add(r.id);
    if (!Number.isFinite(r.priority)) out.push(`rule ${r.id}: priority must be a number`);
    if (!Array.isArray(r.then) || r.then.length === 0) out.push(`rule ${r.id}: no action`);
    if (r.weight !== undefined && !(r.weight > 0))
      out.push(`rule ${r.id}: weight must be positive`);
    if (typeof r.when !== 'string') out.push(`rule ${r.id}: when must be a condition string`);
    const bad = (r.when ?? '').trim() === '' ? null : checkCondition?.(r.when);
    if (bad) out.push(`rule ${r.id}: condition does not parse: ${bad}`);
  }
  return out;
}
