// Merge every content pack under ./packs into one ContentMap. Array tables from
// different packs are concatenated; ids must stay unique (checked by validateContent).

import type { ContentMap } from '../core/contracts';
import { defaultRegistry } from '../core/registry';
import type { ContentPack, TableSchema } from './pack';
import { canonicalTable } from './registry_canon';

export type { ContentPack, FieldSchema, TableSchema } from './pack';

const modules = import.meta.glob<{ pack: ContentPack }>('./packs/*.ts', { eager: true });

export function allPacks(): ContentPack[] {
  return Object.keys(modules)
    .sort()
    .map((k) => (modules[k] as { pack: ContentPack }).pack)
    .filter((p): p is ContentPack => !!p);
}

/** Pack tables at canonical variable spelling, computed once per table object. */
const canonical = new WeakMap<object, unknown>();

/**
 * The registry loader (world_state_registry.md 9.4): a table written with aliases loads
 * with the canonical names and values. Shipped data is already canonical (the registry
 * guard in tests/registry.test.ts), so its tables load as they are.
 */
function loadTable(table: string, value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  let out = canonical.get(value);
  if (out === undefined) {
    out = canonicalTable(table, value, defaultRegistry());
    canonical.set(value, out);
  }
  return out;
}

export function buildContent(packs: ContentPack[] = allPacks()): ContentMap {
  const out: Record<string, unknown> = {};
  for (const pack of packs) {
    for (const [table, raw] of Object.entries(pack.tables)) {
      const value = loadTable(table, raw);
      const prev = out[table];
      if (Array.isArray(prev) && Array.isArray(value)) out[table] = [...prev, ...value];
      else if (prev && typeof prev === 'object' && value && typeof value === 'object') {
        out[table] = { ...(prev as object), ...(value as object) };
      } else out[table] = value;
    }
  }
  return out as unknown as ContentMap;
}

export function allSchemas(packs: ContentPack[] = allPacks()): TableSchema[] {
  return packs.flatMap((p) => p.schemas ?? []);
}

/** Generic checks (unique ids in array tables) plus every pack's own validator. */
export function validateContent(content: ContentMap, packs: ContentPack[] = allPacks()): string[] {
  const problems: string[] = [];
  for (const [table, value] of Object.entries(content as unknown as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const seen = new Set<string>();
    for (const row of value) {
      const id = (row as { id?: unknown })?.id;
      if (typeof id !== 'string') continue;
      if (seen.has(id)) problems.push(`${table}: duplicate id ${id}`);
      seen.add(id);
    }
  }
  for (const pack of packs) problems.push(...(pack.validate?.(content) ?? []));
  return problems;
}
