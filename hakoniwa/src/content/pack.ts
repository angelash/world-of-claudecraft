// Content packs. Each system contributes one pack module at src/content/packs/<name>.ts
// exporting `pack`. Packs are discovered automatically (see ./index.ts), so adding a
// system never edits a shared registry file.

import type { ContentMap } from '../core/contracts';

/** Field description used by the editor to render forms (docs/50_tech/architecture.md 8). */
export interface FieldSchema {
  key: string;
  label: string;
  type: 'string' | 'text' | 'number' | 'boolean' | 'enum' | 'ref' | 'list' | 'json';
  /** enum values */
  options?: string[];
  /** for ref: the content table name it points into */
  refTable?: string;
  required?: boolean;
  min?: number;
  max?: number;
  help?: string;
}

export interface TableSchema {
  /** content table name (a ContentMap key) */
  table: string;
  label: string;
  /** JSON file under hakoniwa/data/ the editor writes back to */
  file: string;
  idField: string;
  nameField?: string;
  fields: FieldSchema[];
}

export interface ContentPack {
  id: string;
  tables: Partial<ContentMap>;
  schemas?: TableSchema[];
  /** Return human-readable problems in the merged content (empty = valid). */
  validate?(content: ContentMap): string[];
}
