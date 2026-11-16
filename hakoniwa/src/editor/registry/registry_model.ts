// Variable registry view model (release_engineering.md 7.5, D-076): search the registry
// (data/registry/vars.json) by canonical name, family pattern, alias and label key, and
// resolve the content's actual flag reads and writes (src/content/registry_refs.ts) to the
// registry entry they land on, so a definition shows its registered writers and readers
// next to the quests, scenes and other rows that really use it. Names the registry does
// not resolve are listed apart (they are V4 errors). Pure: no DOM.

import type { FlagUse } from '../../content/registry_refs';
import type { ContentMap } from '../../core/contracts';
import {
  defaultRegistry,
  type FamilyDef,
  FlagRegistry,
  type RegistryData,
  type ResolvedName,
  registryData,
  type VarDef,
} from '../../core/registry';

/** The registry the content carries (table `registry`), as the registry pack builds it. */
export function registryOf(content: ContentMap): FlagRegistry {
  const data = (content as { registry?: RegistryData }).registry;
  return !data || data === registryData() ? defaultRegistry() : new FlagRegistry(data);
}

/** One registry row: an exact variable or a family pattern. */
export interface RegistryEntry {
  /** canonical name, or the pattern of a family (`trust.<npc>`) */
  name: string;
  family: boolean;
  def: VarDef | FamilyDef;
}

export function registryEntries(registry: FlagRegistry): RegistryEntry[] {
  return [
    ...registry.data.vars.map((def) => ({ name: def.name, family: false, def })),
    ...registry.data.families.map((def) => ({ name: def.name, family: true, def })),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

/** The entry a resolved name lands on (a family member lands on its family). */
export function entryName(r: ResolvedName): string {
  return r.family ? r.family.name : r.def.name;
}

export type MatchKind = 'resolved' | 'name' | 'alias' | 'label';

export interface SearchHit {
  entry: RegistryEntry;
  match: MatchKind;
  /** the matching text: the alias or label that matched, or the resolved name */
  text: string;
}

/**
 * Entries whose name, pattern, alias or label key contains the query (case-insensitive).
 * A query the registry resolves as written (a family member, an alias spelling) puts its
 * entry first. Empty query: every entry.
 */
export function searchRegistry(
  registry: FlagRegistry,
  entries: readonly RegistryEntry[],
  query: string,
): SearchHit[] {
  const raw = query.trim();
  const q = raw.toLowerCase();
  if (q === '') return entries.map((entry) => ({ entry, match: 'name', text: entry.name }));
  const out: SearchHit[] = [];
  const seen = new Set<string>();
  const resolved = registry.resolve(raw);
  if (resolved) {
    const name = entryName(resolved);
    const entry = entries.find((e) => e.name === name);
    if (entry) {
      out.push({ entry, match: 'resolved', text: resolved.name });
      seen.add(name);
    }
  }
  const rank = (h: SearchHit): number => {
    const n = h.entry.name.toLowerCase();
    if (h.match === 'name') return n === q ? 0 : n.startsWith(q) ? 1 : 2;
    return h.match === 'alias' ? 3 : 4;
  };
  const rest: SearchHit[] = [];
  for (const entry of entries) {
    if (seen.has(entry.name)) continue;
    if (entry.name.toLowerCase().includes(q)) {
      rest.push({ entry, match: 'name', text: entry.name });
      continue;
    }
    const alias = entry.def.aliases.find((a) => a.toLowerCase().includes(q));
    if (alias !== undefined) {
      rest.push({ entry, match: 'alias', text: alias });
      continue;
    }
    if (entry.def.label.toLowerCase().includes(q))
      rest.push({ entry, match: 'label', text: entry.def.label });
  }
  rest.sort((a, b) => rank(a) - rank(b) || a.entry.name.localeCompare(b.entry.name));
  return [...out, ...rest];
}

/** A content use resolved against the registry. */
export interface ResolvedUse extends FlagUse {
  /** the canonical name it lands on (a concrete member for a family) */
  canonical: string;
  /** written through an alias spelling */
  alias: boolean;
}

export interface UseIndex {
  /** uses per registry entry name */
  byEntry: Map<string, ResolvedUse[]>;
  /** names the registry does not resolve, with their uses, sorted by name */
  unresolved: { name: string; uses: FlagUse[] }[];
}

/** Resolve every use: by registry entry, and the names nothing resolves. */
export function indexUses(uses: readonly FlagUse[], registry: FlagRegistry): UseIndex {
  const byEntry = new Map<string, ResolvedUse[]>();
  const missing = new Map<string, FlagUse[]>();
  for (const u of uses) {
    const r = registry.resolve(u.name);
    if (!r) {
      const list = missing.get(u.name) ?? [];
      list.push(u);
      missing.set(u.name, list);
      continue;
    }
    const key = entryName(r);
    const list = byEntry.get(key) ?? [];
    list.push({ ...u, canonical: r.name, alias: r.alias });
    byEntry.set(key, list);
  }
  return {
    byEntry,
    unresolved: [...missing.entries()]
      .map(([name, list]) => ({ name, uses: list }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Quests first, then scenes, then the other tables by name. */
function tableRank(table: string): number {
  return table === 'quests' ? 0 : table === 'scenes' ? 1 : 2;
}

export function sortUses<T extends FlagUse>(uses: readonly T[]): T[] {
  return [...uses].sort(
    (a, b) =>
      tableRank(a.table) - tableRank(b.table) ||
      a.table.localeCompare(b.table) ||
      a.row.localeCompare(b.row) ||
      a.path.localeCompare(b.path),
  );
}

export interface EntryUses {
  reads: ResolvedUse[];
  writes: ResolvedUse[];
  /** distinct quest and scene ids among the uses (reads and writes) */
  quests: string[];
  scenes: string[];
}

/** The content's uses of one entry, split into reads and writes, quests and scenes first. */
export function usesOf(index: UseIndex, name: string): EntryUses {
  const all = sortUses(index.byEntry.get(name) ?? []);
  const distinct = (table: string) => [
    ...new Set(all.filter((u) => u.table === table).map((u) => u.row)),
  ];
  return {
    reads: all.filter((u) => u.kind === 'read'),
    writes: all.filter((u) => u.kind === 'write'),
    quests: distinct('quests'),
    scenes: distinct('scenes'),
  };
}

/** Number of content uses per entry name (for the result list). */
export function useCounts(index: UseIndex): Map<string, number> {
  return new Map([...index.byEntry.entries()].map(([k, v]) => [k, v.length]));
}

/** A flag value or registry field as one line of text. */
export function valueText(v: unknown): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : JSON.stringify(v);
}
