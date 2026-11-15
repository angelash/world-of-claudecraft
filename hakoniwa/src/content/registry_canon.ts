// The registry loader (world_state_registry.md 9.4): rewrite the content's variable names
// and enum values to their canonical spelling at load time, and the quest data ids to
// their section 6.2 ids. Every change is one string replaced in place, listed as an edit
// with its JSON path, so the same pass drives the load-time rewrite (buildContent) and
// the data migration of a batch. Data at zero aliases loads unchanged (no edits).

import type { ContentMap, FlagValue } from '../core/contracts';
import type { FlagRegistry } from '../core/registry';
import { rewriteCondition } from '../systems/quests/conditions';
import { CONDITION_FIELDS } from './registry_refs';

export interface CanonEdit {
  /** content table */
  table: string;
  /** path from the table value to the string */
  path: (string | number)[];
  from: string;
  to: string;
}

const NAME_FIELDS = new Set([
  'endOnFlag',
  'pacifiedBy',
  'removeOnFlag',
  'storeAs',
  'gazeFlag',
  'yieldFlag',
  'trustKey',
]);
const NAME_LIST_FIELDS = new Set(['requiresFlags', 'evidenceFlags']);
const RAW_WRITE_TYPES = new Set(['flag', 'add', 'append', 'copy']);

/** The canonical spelling of a name when the registry knows it as a plain alias. */
function canonName(registry: FlagRegistry, name: string): string {
  const r = registry.resolve(name);
  if (!r?.alias || r.condition !== null || r.conversion !== null) return name;
  return r.name;
}

function canonValue(registry: FlagRegistry, name: string, value: string): string {
  const r = registry.resolve(name);
  if (!r) return value;
  const v = registry.canonicalValue(r.name, value);
  return typeof v === 'string' ? v : value;
}

/** Edits that bring one table to canonical names and values (nothing is changed). */
export function canonEdits(table: string, value: unknown, registry: FlagRegistry): CanonEdit[] {
  const out: CanonEdit[] = [];
  const quests = registry.data.questIds;
  const edit = (path: (string | number)[], from: string, to: string) => {
    if (from !== to) out.push({ table, path, from, to });
  };
  const condition = (expr: string, path: (string | number)[]) => {
    const next = rewriteCondition(
      expr,
      (v) => canonName(registry, v),
      (v, lit) => canonValue(registry, v, lit),
    );
    edit(path, expr, next);
  };
  const visit = (v: unknown, path: (string | number)[], inKeys: boolean, inObjectives: boolean) => {
    if (Array.isArray(v)) {
      v.forEach((x, i) => {
        visit(x, [...path, i], inKeys, inObjectives);
      });
      return;
    }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    const type = typeof o.type === 'string' ? o.type : undefined;
    // effect keys and written values; door flag keys and their compared values
    if (type && !inObjectives && typeof o.key === 'string') {
      if (RAW_WRITE_TYPES.has(type) || (inKeys && type === 'flag')) {
        const key = canonName(registry, o.key);
        edit([...path, 'key'], o.key, key);
        if (typeof o.value === 'string')
          edit([...path, 'value'], o.value, canonValue(registry, key, o.value));
        if (typeof o.equals === 'string')
          edit([...path, 'equals'], o.equals, canonValue(registry, key, o.equals));
      }
    }
    if (type === 'copy' && typeof o.from === 'string')
      edit([...path, 'from'], o.from, canonName(registry, o.from));
    if (type === 'name' && typeof o.from === 'string')
      edit([...path, 'from'], o.from, canonName(registry, o.from));
    if (type === 'quest' && typeof o.quest === 'string' && quests[o.quest])
      edit([...path, 'quest'], o.quest, quests[o.quest] as string);
    for (const [k, x] of Object.entries(o)) {
      const p = [...path, k];
      if (typeof x === 'string' && CONDITION_FIELDS.has(k)) condition(x, p);
      else if (typeof x === 'string' && NAME_FIELDS.has(k)) edit(p, x, canonName(registry, x));
      else if (Array.isArray(x) && NAME_LIST_FIELDS.has(k)) {
        x.forEach((n, i) => {
          if (typeof n === 'string') edit([...p, i], n, canonName(registry, n));
        });
      } else if (Array.isArray(x) && k === 'hideWhen') {
        x.forEach((n, i) => {
          if (typeof n === 'string') condition(n, [...p, i]);
        });
      } else if (k === 'flag' && typeof x === 'string' && type === undefined) {
        const name = canonName(registry, x);
        edit(p, x, name);
        if (typeof o.equals === 'string')
          edit([...path, 'equals'], o.equals, canonValue(registry, name, o.equals));
      } else if (k === 'flag' && x && typeof x === 'object' && !Array.isArray(x)) {
        const f = x as { key?: unknown; value?: unknown };
        if (typeof f.key === 'string') {
          const name = canonName(registry, f.key);
          edit([...p, 'key'], f.key, name);
          if (typeof f.value === 'string')
            edit([...p, 'value'], f.value, canonValue(registry, name, f.value));
        }
      } else if (k === 'unlock' && x && typeof x === 'object' && !Array.isArray(x)) {
        const flags = (x as { flags?: unknown }).flags;
        if (Array.isArray(flags))
          flags.forEach((n, i) => {
            if (typeof n === 'string') edit([...p, 'flags', i], n, canonName(registry, n));
          });
      } else if (x && typeof x === 'object') {
        visit(
          x,
          p,
          inKeys || (table === 'doors' && (k === 'keys' || k === 'reveal')),
          inObjectives || k === 'objectives',
        );
      }
    }
  };
  if (table === 'quests' && Array.isArray(value)) {
    value.forEach((q, i) => {
      const id = (q as { id?: unknown })?.id;
      if (typeof id === 'string' && quests[id]) edit([i, 'id'], id, quests[id] as string);
    });
  }
  visit(value, [], false, false);
  return out;
}

function setAt(root: unknown, path: (string | number)[], value: FlagValue): void {
  let cur = root as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++)
    cur = cur[path[i] as string | number] as Record<string | number, unknown>;
  cur[path[path.length - 1] as string | number] = value;
}

/** One table at canonical spelling: itself when nothing changes, else an edited copy. */
export function canonicalTable<T>(table: string, value: T, registry: FlagRegistry): T {
  if (!value || typeof value !== 'object' || table === 'registry') return value;
  const edits = canonEdits(table, value, registry);
  if (edits.length === 0) return value;
  const copy = structuredClone(value);
  for (const e of edits) setAt(copy, e.path, e.to);
  return copy;
}

/** Canonical content and the edits it took (the input is not changed). */
export function canonicalizeContent(
  content: ContentMap,
  registry: FlagRegistry,
): { content: ContentMap; edits: CanonEdit[] } {
  const tables = content as unknown as Record<string, unknown>;
  const edits: CanonEdit[] = [];
  const copy: Record<string, unknown> = { ...tables };
  for (const [table, value] of Object.entries(tables)) {
    if (table === 'registry') continue;
    const e = canonEdits(table, value, registry);
    if (e.length === 0) continue;
    edits.push(...e);
    copy[table] = canonicalTable(table, value, registry);
  }
  return { content: edits.length === 0 ? content : (copy as unknown as ContentMap), edits };
}
