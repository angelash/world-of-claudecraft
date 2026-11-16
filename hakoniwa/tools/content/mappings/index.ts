// Every catalog mapping of the content importer (tools/content/import_catalog.ts). One
// module per design catalog (tools/content/mappings/<catalog>.ts, release_engineering.md
// 7.1); add a module's MAPPINGS here when a new catalog table gets imported.

import type { CatalogMapping } from '../catalog/mapping';
import { MAPPINGS as BESTIARY } from './bestiary';
import { MAPPINGS as GATHERING } from './gathering_crafting';

export const MAPPINGS: readonly CatalogMapping[] = [...GATHERING, ...BESTIARY];

export function mappingById(id: string): CatalogMapping | undefined {
  return MAPPINGS.find((m) => m.id === id);
}
