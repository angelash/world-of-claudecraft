// The content rules of the world-state variable registry (world_state_registry.md 9.3,
// rules 1 to 14). Errors block the build (the registry pack returns them from
// validateContent); warnings go to the report. Pure: content and registry in, problems
// out. The data walk is ./registry_refs.ts.

import type { ContentMap, FlagValue } from '../core/contracts';
import { type FlagRegistry, NAME_MAX, NAME_RE, type ResolvedName } from '../core/registry';
import type { RegistryData, VarDef } from '../core/registry/types';
import { checkCondition } from '../systems/quests/conditions';
import { type ConditionUse, collectFlagUses, type FlagUse } from './registry_refs';

export interface RegistryProblem {
  rule: number;
  level: 'error' | 'warning';
  message: string;
}

export interface RegistryCheckOptions {
  /** Milestone index (M0 is 0): from M2 on an alias is an error (rule 3, section 10 step 5). */
  milestone?: number;
  /** Text keys known to the string table (rule 11); none yet before the string tables land. */
  textKeys?: ReadonlySet<string>;
}

const CJK = /[㐀-鿿豈-﫿]/;
const COMPARE_OPS = new Set(['==', '!=', '>=', '<=', '>', '<']);

/** Rule 14: the section 2.1 form and length. */
export function nameProblem(name: string): string | null {
  if (name.length > NAME_MAX) return `longer than ${NAME_MAX} characters`;
  if (!NAME_RE.test(name)) return 'does not match the section 2.1 form';
  return null;
}

/** Members of each key domain present in the content (`table#field`, `a|b`, or a list). */
export function domainMembers(
  data: RegistryData,
  content: ContentMap,
): Map<string, ReadonlySet<string>> {
  const tables = content as unknown as Record<string, unknown>;
  const out = new Map<string, ReadonlySet<string>>();
  for (const [domain, src] of Object.entries(data.keyDomains)) {
    if (Array.isArray(src)) {
      out.set(domain, new Set(src));
      continue;
    }
    const set = new Set<string>();
    let any = false;
    for (const part of src.split('|')) {
      const [table, field] = part.split('#') as [string, string | undefined];
      const rows = tables[table];
      if (!Array.isArray(rows)) continue;
      any = true;
      for (const r of rows) {
        const v = (r as Record<string, unknown>)[field ?? 'id'];
        if (typeof v === 'string') set.add(v);
      }
    }
    if (any) out.set(domain, set);
  }
  return out;
}

function where(u: { table: string; row: string; path: string }): string {
  return `${u.table}${u.row ? `:${u.row}` : ''} ${u.path}`;
}

function kindAccepts(def: VarDef, value: FlagValue, op: FlagUse['op']): string | null {
  const k = def.kind;
  if (k === 'any') return null;
  if (op === 'add') return k === 'int' || k === 'num' ? null : `add on a ${k}`;
  if (op === 'append') return k === 'set' ? null : `append on a ${k}`;
  if (k === 'flag' || k === 'bool')
    return typeof value === 'boolean' ? null : `${k} written ${typeof value}`;
  if (k === 'int' || k === 'num' || k === 'tick') {
    if (typeof value !== 'number') return `${k} written ${typeof value}`;
    if (k === 'int' && !Number.isInteger(value)) return 'int written a fraction';
    const r = def.range;
    if (r && ((r[0] !== null && value < r[0]) || (r[1] !== null && value > r[1])))
      return `${value} outside ${r[0] ?? ''} to ${r[1] ?? ''}`;
    return null;
  }
  if (k === 'enum') {
    if (typeof value !== 'string') return `enum written ${typeof value}`;
    if (def.values && !def.values.includes(value))
      return `${value} is not a value (${def.values.join(', ')})`;
    return null;
  }
  return typeof value === 'string' ? null : `${k} written ${typeof value}`;
}

/** Run the fourteen rules over the content. */
export function registryProblems(
  content: ContentMap,
  registry: FlagRegistry,
  opts: RegistryCheckOptions = {},
): RegistryProblem[] {
  const out: RegistryProblem[] = [];
  const push = (rule: number, level: RegistryProblem['level'], message: string) =>
    out.push({ rule, level, message });
  const aliasLevel = (opts.milestone ?? 0) >= 2 ? 'error' : 'warning';
  const domains = domainMembers(registry.data, content);
  const { uses, conditions } = collectFlagUses(content);

  const checkName = (u: FlagUse): ResolvedName | null => {
    const r = registry.resolve(u.name);
    if (!r) {
      push(
        u.table === 'lore' || u.table === 'terms' ? 13 : 1,
        'error',
        `${where(u)}: ${u.name} is not registered`,
      );
      return null;
    }
    if (r.alias)
      push(3, aliasLevel, `${where(u)}: ${u.name} is an alias of ${r.condition ?? r.name}`);
    const bad = r.condition === null ? nameProblem(r.name) : null;
    if (bad) push(14, 'error', `${where(u)}: ${r.name} ${bad}`);
    // rule 2: family keys belong to their domains
    if (r.family) {
      r.family.slots.forEach((slot, i) => {
        const key = r.keys[i];
        if (key === undefined || slot.keys) return;
        const members = slot.domain ? domains.get(slot.domain) : undefined;
        if (members && !members.has(key))
          push(2, 'error', `${where(u)}: ${key} in ${u.name} is not a ${slot.domain} id`);
      });
    }
    return r;
  };

  for (const u of uses) {
    const r = checkName(u);
    if (!r || r.condition !== null) continue;
    const def = r.def;
    if (u.kind === 'write') {
      const raw =
        u.op === 'set' ||
        u.op === 'add' ||
        u.op === 'append' ||
        u.op === 'copy' ||
        u.op === 'store';
      // rule 9: derived quantities are never written
      if (def.derive !== null && raw) push(9, 'error', `${where(u)}: writes derived ${r.name}`);
      // rule 8: writers, and no raw content write to a system mirror
      if (raw && def.scope === 'mirror' && !def.writers.includes('content'))
        push(8, 'error', `${where(u)}: content writes system mirror ${r.name}`);
      else if (raw && !def.writers.includes('content') && def.derive === null)
        push(
          8,
          'error',
          `${where(u)}: content is not a writer of ${r.name} (${def.writers.join(', ')})`,
        );
      // rule 5: value kind and range; rule 6: story flags never written false
      if (u.op === 'add' || u.op === 'append') {
        const bad = kindAccepts(def, 0, u.op);
        if (bad) push(5, 'error', `${where(u)}: ${r.name} ${bad}`);
      } else if (u.value !== undefined && (u.op === 'set' || u.op === 'typed')) {
        const value = registry.canonicalWrite(r, u.value);
        if (def.kind === 'flag' && value === false)
          push(6, 'error', `${where(u)}: story flag ${r.name} written false`);
        const bad = kindAccepts(def, value, 'set');
        if (bad) push(5, 'error', `${where(u)}: ${r.name} ${bad}`);
        if (typeof u.value === 'string' && CJK.test(u.value) && def.kind !== 'text')
          push(12, 'error', `${where(u)}: Chinese value ${u.value} for ${r.name}`);
      }
      // rule 7: an act-prefixed quantity is written by its own act's content; the epilogue
      // scenes are the settlement of act 6 (its exit quantities are written there)
      const settles = def.act === 6 && u.act === 7;
      if (
        raw &&
        def.act !== null &&
        def.act >= 1 &&
        def.act <= 6 &&
        u.act !== null &&
        u.act !== def.act &&
        !settles
      )
        push(7, 'error', `${where(u)}: act ${u.act} content writes ${r.name}`);
    } else {
      if (def.act !== null && def.act >= 1 && def.act <= 6 && u.act !== null && u.act < def.act)
        push(7, 'error', `${where(u)}: act ${u.act} content reads ${r.name}`);
      if (u.via === 'bondFlag.equals' && u.value !== undefined)
        literalChecks(u, r, [u.value], '==');
    }
  }

  // rule 4: conditions parse, literals in the value sets, HAS on sets
  for (const c of conditions) {
    const err = checkCondition(c.expr);
    if (err) {
      push(c.table === 'lore' || c.table === 'terms' ? 13 : 4, 'error', `${where(c)}: ${err}`);
      continue;
    }
    if (c.expr.length > 400)
      push(4, 'warning', `${where(c)}: condition longer than 400 characters`);
  }
  for (const u of uses) {
    if (u.kind !== 'read' || !u.cmp) continue;
    const r = registry.resolve(u.name);
    if (!r || r.condition !== null) continue;
    literalChecks(u, r, u.cmp.literals, u.cmp.op);
  }

  function literalChecks(u: FlagUse, r: ResolvedName, literals: FlagValue[], op: string): void {
    const def = r.def;
    for (const lit of literals) {
      if (typeof lit === 'string' && CJK.test(lit) && def.kind !== 'text')
        push(12, 'error', `${where(u)}: Chinese literal ${lit} for ${r.name}`);
    }
    if (op === 'HAS' && def.kind !== 'set' && def.kind !== 'any')
      push(4, 'error', `${where(u)}: HAS on ${r.name}, a ${def.kind}`);
    if (def.kind === 'enum' && def.values && (COMPARE_OPS.has(op) || op === 'IN')) {
      for (const lit of literals) {
        const v = typeof lit === 'string' ? registry.canonicalValue(r.name, lit) : lit;
        if (typeof v === 'string' && !def.values.includes(v))
          push(4, 'error', `${where(u)}: ${lit} is not a value of ${r.name}`);
      }
    }
  }

  // rules 10, 11, 14 over the registry itself
  for (const def of [...registry.data.vars, ...registry.data.families]) {
    const probe = def.name.replace(/<[^<>]+>/g, 'x');
    const bad = nameProblem(probe);
    if (bad) push(14, 'error', `registry: ${def.name} ${bad}`);
    if (def.writers.length === 0 && def.derive === null)
      push(10, 'warning', `registry: ${def.name} has no writer`);
    if (def.readers.length === 0) push(10, 'warning', `registry: ${def.name} has no reader`);
    if (def.kind === 'enum' && def.visibility === 'player' && def.values) {
      for (const v of def.values) {
        const key = `var.${def.name.replace(/<([^<>]+)>/g, '$1')}.${v}`;
        if (!opts.textKeys?.has(key)) push(11, 'warning', `registry: no text key ${key}`);
      }
    }
  }
  return out;
}

/** Errors only, as validateContent messages. */
export function registryErrors(content: ContentMap, registry: FlagRegistry): string[] {
  return registryProblems(content, registry)
    .filter((p) => p.level === 'error')
    .map((p) => `registry rule ${p.rule}: ${p.message}`);
}

export type { ConditionUse, FlagUse };
