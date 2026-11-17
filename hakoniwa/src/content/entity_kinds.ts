// The entity kinds of the content: which tables hold the ids of maps, persons, items,
// monsters, doors, quests, scenes and the rest. Shared by the content id guard
// (tests/content_id_guard.test.ts, release_engineering.md 13.2: systems never write
// these ids) and the namespace validator V3 (tools/content/validators/namespace.ts: one
// id, one owner). Pure.

import type { ContentMap } from '../core/contracts';

export interface EntityKind {
  table: keyof ContentMap;
  kind: string;
  /** ids of a protected kind are never a vocabulary word (persons, quests, scenes...) */
  protectedKind: boolean;
}

/** Entity tables: table name, kind label, and whether it can be a vocabulary word. */
export const ENTITY_KINDS: readonly EntityKind[] = [
  { table: 'maps', kind: 'map', protectedKind: false },
  { table: 'atlas_maps', kind: 'map', protectedKind: false },
  { table: 'atlas_regions', kind: 'region', protectedKind: false },
  { table: 'slg_provinces', kind: 'province', protectedKind: false },
  { table: 'items', kind: 'item', protectedKind: false },
  { table: 'itemSets', kind: 'item set', protectedKind: false },
  { table: 'enchants', kind: 'enchant', protectedKind: false },
  { table: 'monsters', kind: 'monster', protectedKind: false },
  { table: 'doors', kind: 'door', protectedKind: false },
  { table: 'city_sites', kind: 'site', protectedKind: true },
  { table: 'markets', kind: 'market', protectedKind: true },
  { table: 'npcs', kind: 'person', protectedKind: true },
  { table: 'companions', kind: 'person', protectedKind: true },
  { table: 'goddesses', kind: 'goddess', protectedKind: true },
  { table: 'quests', kind: 'quest', protectedKind: true },
  { table: 'scenes', kind: 'scene', protectedKind: true },
  { table: 'slg_nations', kind: 'nation', protectedKind: true },
  { table: 'evidence', kind: 'evidence', protectedKind: true },
  { table: 'deeds', kind: 'deed', protectedKind: true },
  { table: 'titles', kind: 'title', protectedKind: true },
  { table: 'letters', kind: 'letter', protectedKind: true },
  { table: 'codexEntries', kind: 'codex note', protectedKind: true },
  { table: 'commissions', kind: 'commission', protectedKind: true },
  { table: 'dynamicEvents', kind: 'dynamic event', protectedKind: true },
  { table: 'guildBoards', kind: 'guild board', protectedKind: true },
  { table: 'dungeons', kind: 'dungeon', protectedKind: true },
  { table: 'nests', kind: 'nest', protectedKind: true },
  { table: 'gatherNodes', kind: 'gathering node', protectedKind: true },
  { table: 'craftStations', kind: 'work station', protectedKind: true },
  { table: 'recipes', kind: 'recipe', protectedKind: true },
];

export interface EntityIdIndex {
  /** id -> kinds it names */
  kinds: Map<string, Set<string>>;
  /** ids that can never be a vocabulary word */
  protectedIds: Set<string>;
}

/** Index the entity ids of the content by kind. */
export function entityIdIndex(
  content: ContentMap,
  kinds: readonly EntityKind[] = ENTITY_KINDS,
): EntityIdIndex {
  const out = new Map<string, Set<string>>();
  const protectedIds = new Set<string>();
  for (const k of kinds) {
    const rows = (content as unknown as Record<string, unknown>)[k.table];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const id = (row as { id?: unknown }).id;
      if (typeof id !== 'string' || id === '') continue;
      if (!out.has(id)) out.set(id, new Set());
      out.get(id)?.add(k.kind);
      if (k.protectedKind) protectedIds.add(id);
    }
  }
  return { kinds: out, protectedIds };
}
