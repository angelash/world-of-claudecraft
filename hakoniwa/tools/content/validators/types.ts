// Shared types of the content validators V1 to V10 (release_engineering.md 7.4). Every
// validator is a pure function from a ValidationInput to findings; the command line tool
// (tools/content/validate.ts), the test suite (tests/content_validation.test.ts), the
// catalog importer and the editor's batch view all run the same set (./index.ts).

import type { ContentPack } from '../../../src/content/pack';
import type { ContentMap, FlagValue } from '../../../src/core/contracts';

export type ValidatorId = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7' | 'V8' | 'V9' | 'V10';

/** error blocks the batch (at the input's milestone); warning and info are reported. */
export type Level = 'error' | 'warning' | 'info';

export interface Finding {
  level: Level;
  message: string;
  /** content table and row id, when the finding has one */
  table?: string;
  row?: string;
  /** field path inside the row */
  path?: string;
  /** data file (path under data/), when known */
  file?: string;
}

/** Proper noun lists of V10 (tools/content/names/*.json). */
export interface NameList {
  /** category label, e.g. `woc.zones` or `works` */
  category: string;
  /** milestone index from which a hit is an error (before it a warning) */
  blockingFrom: number;
  names: readonly string[];
}

export interface ValidationInput {
  /** merged content (the packs, with a staged batch applied when validating one) */
  content: ContentMap;
  packs: readonly ContentPack[];
  /** data files keyed by path under data/ (the same overlay applied), for file-level scans */
  files: ReadonlyMap<string, unknown>;
  /** milestone index: M0 is 0 ... M6 is 6 (milestone-gated rules read it) */
  milestone: number;
  /** source texts of src/systems and src/game keyed by path under src/ (V9 flag index) */
  codeSources?: Readonly<Record<string, string>>;
  /** world flags right after a fresh world's init (V9) */
  initialFlags?: Record<string, FlagValue>;
  /** asset ids of the prompt library's requirement list; undefined when it is unavailable (V7) */
  assetIds?: ReadonlySet<string>;
  /** proper noun lists (V10; defaults to tools/content/names) */
  names?: readonly NameList[];
  /** interface text tables flattened to key and text (V10 scans them with the data) */
  uiText?: Readonly<Record<string, string>>;
  /** ending route names the autoplayer can steer toward (V9) */
  endingRoutes?: readonly string[];
  /** problems of the autoplayer's route table against the content (V9) */
  routeProblems?: readonly string[];
}

export interface Validator {
  id: ValidatorId;
  /** short English title, e.g. `schema` */
  title: string;
  run(input: ValidationInput): Finding[];
}

export interface ValidatorResult {
  id: ValidatorId;
  title: string;
  findings: Finding[];
  errors: number;
  warnings: number;
  infos: number;
  /** no error-level finding */
  ok: boolean;
}

/** Milestone label to index: 'M0' is 0 ... 'M6' is 6. */
export function milestoneIndex(label: string): number {
  const m = /^M([0-6])$/i.exec(label.trim());
  if (!m) throw new Error(`milestone must be one of M0 to M6, got ${label}`);
  return Number(m[1]);
}

/** `table:row path` for messages. */
export function where(f: { table?: string; row?: string; path?: string }): string {
  const head = f.table ? `${f.table}${f.row ? `:${f.row}` : ''}` : '';
  return [head, f.path ?? ''].filter((s) => s !== '').join(' ');
}
