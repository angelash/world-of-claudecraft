// The former rule-template keys, kept as a map into the line packs (PK-M0-25; builtin_ai.md
// 19 step 2, catalog_dialogue_lines.md 4.14). data/dialogue/templates.json and
// data/cognition/lines.json moved into ln_common (with Lina's appraisal lines in ln_lina
// and the clergy's in ln_class_clergy), text unchanged; data/dialogue/legacy_lines.json
// names, for each old key, the slice of a pack slot that holds exactly its old lines in the
// old order. The callers keep their old keys and their old draws until the brains of the
// later steps choose slots directly; persona cards still override any old key. The content
// pack pins every slice's text (legacyProblems), so an edit to a pack cannot silently
// change what an old key says.

import type { ContentMap } from '../../../core/contracts';
import { lineKey, packById } from './packs';
import { isLine, type Line, lineEntry } from './types';

export interface LegacySource {
  /** pack id; ln_common when absent */
  pack?: string;
  slot: string;
  /** version list inside a versioned slot */
  version?: string;
  /** first index of the slice and its length */
  start: number;
  count: number;
}

export interface LegacyLineMap {
  keys: Record<string, LegacySource>;
}

declare module '../../../core/contracts' {
  interface ContentMap {
    legacyLines: LegacyLineMap;
  }
}

/** One line of a legacy slice: its source text and its content text key. */
export interface LegacyLine {
  zh: string;
  key: string;
}

type Source = Pick<ContentMap, 'linePacks' | 'legacyLines'>;

const cache = new WeakMap<object, Map<string, LegacyLine[]>>();

/** The slice of a source, holes included as null (for the checks). */
function slice(content: Source, src: LegacySource): (Line | null)[] | null {
  const pack = packById(content, src.pack ?? 'ln_common');
  const entry = pack?.slots[src.slot];
  const list = Array.isArray(entry)
    ? entry
    : src.version !== undefined
      ? entry?.[src.version]
      : undefined;
  if (!list) return null;
  return list.slice(src.start, src.start + src.count);
}

/** The lines of a legacy key (empty when the key, its pack or its slot is unknown). */
export function legacyLines(content: Source, key: string): LegacyLine[] {
  let byKey = cache.get(content);
  if (!byKey) {
    byKey = new Map();
    cache.set(content, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  const out: LegacyLine[] = [];
  const src = content.legacyLines?.keys[key];
  const lines = src ? slice(content, src) : null;
  if (src && lines) {
    lines.forEach((line, i) => {
      if (!isLine(line)) return;
      out.push({
        zh: lineEntry(line).zh,
        key: lineKey(src.pack ?? 'ln_common', src.slot, src.start + i, {
          version: src.version,
          entry: typeof line !== 'string',
        }),
      });
    });
  }
  byKey.set(key, out);
  return out;
}

/**
 * FNV-1a of a slice's texts joined by a separator: the content pack pins it, so moving,
 * inserting or rewording a line under an old key shows up (catalog edits go to new indexes).
 */
export function sliceDigest(texts: readonly string[]): string {
  let h = 0x811c9dc5;
  const s = texts.join('\u0001');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Problems of the legacy map: missing packs or slots, short slices, holes. */
export function legacyProblems(content: Source): string[] {
  const out: string[] = [];
  for (const [key, src] of Object.entries(content.legacyLines?.keys ?? {})) {
    const lines = slice(content, src);
    const where = `${src.pack ?? 'ln_common'} ${src.slot}${src.version ? ` ${src.version}` : ''}`;
    if (!lines) out.push(`legacy line key ${key}: ${where} does not exist`);
    else if (lines.length !== src.count || !lines.every(isLine))
      out.push(`legacy line key ${key}: ${where} lost lines`);
  }
  return out;
}
