// Step 1 (art_pipeline.md 13; assets/README.md 3.1): registration. A dropped file is matched
// to its prompt entry by file name (the id) and folder (the template's outDir); a name that
// matches no entry is refused with the closest ids, a name built on an alias subject is
// refused with the canonical file name. The new record starts in `review` with the prompt
// fingerprint, the file hash and the generator's implicit AIGC label from the file metadata.

import { canonicalAssetId } from './aliases';
import type { ExpectedEntry, ManifestRecord } from './manifest';

export type MatchResult =
  | { ok: true; entry: ExpectedEntry }
  | { ok: false; error: string; suggestions: string[] };

export function levenshtein(a: string, b: string): number {
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]!;
      prev[j] = Math.min(up + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length]!;
}

/** The `count` ids nearest to `id` by edit distance (ties by id). */
export function closestIds(id: string, ids: Iterable<string>, count = 3): string[] {
  const prefix = id.split('_').slice(0, 2).join('_');
  const scored: [number, string][] = [];
  for (const other of ids) {
    // Same class prefix first: a misspelled monster should not suggest an icon.
    const penalty = other.startsWith(prefix) ? 0 : 4;
    scored.push([levenshtein(id, other) + penalty, other]);
  }
  scored.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
  return scored.slice(0, count).map((s) => s[1]);
}

/** Match a file path relative to assets/ (for example art/monsters/art_mon_dian_rat_d.png). */
export function matchFile(path: string, expected: Map<string, ExpectedEntry>): MatchResult {
  const name = path.split('/').pop() ?? path;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const entry = expected.get(stem);
  if (entry) {
    const want = entry.file;
    if (want !== path) {
      return { ok: false, error: `${path}: ${stem} belongs at ${want}`, suggestions: [want] };
    }
    if (!want.endsWith(`.${ext}`))
      return {
        ok: false,
        error: `${path}: expected a .${want.split('.').pop()} file`,
        suggestions: [],
      };
    return { ok: true, entry };
  }
  const canonical = canonicalAssetId(stem);
  if (canonical && expected.has(canonical)) {
    return {
      ok: false,
      error: `${path}: ${stem} is an alias subject that shares ${canonical}'s art; save it as ${expected.get(canonical)!.file}`,
      suggestions: [canonical],
    };
  }
  const suggestions = closestIds(stem, expected.keys());
  return {
    ok: false,
    error: `${path}: no prompt entry is named ${stem}; closest: ${suggestions.join(', ')}`,
    suggestions,
  };
}

/** The generator's implicit label from file metadata (PNG text chunks, Vorbis comments). */
export function aigcLabelOf(meta: Record<string, string | string[]>): string {
  const parts: string[] = [];
  for (const key of Object.keys(meta).sort()) {
    const v = meta[key];
    const values = Array.isArray(v) ? v : [v ?? ''];
    const isLabel =
      /aigc/i.test(key) ||
      values.some((x) => /aigc/i.test(x) && key.toLowerCase() === 'xml:com.adobe.xmp');
    if (!isLabel) continue;
    for (const value of values) parts.push(`${key}=${value.replace(/\s+/g, ' ').trim()}`);
  }
  const label = parts.join('; ');
  return label === '' ? 'none' : label.slice(0, 1000);
}

export interface RegisterInfo {
  tool: string;
  toolVersion: string;
  seed?: string;
  refs?: string[];
  generatedAt: string;
  sha256: string;
  aigcLabel: string;
  converted?: boolean;
  promptLang?: 'zh' | 'en';
  notes?: string;
}

export function newRecord(entry: ExpectedEntry, info: RegisterInfo): ManifestRecord {
  return {
    id: entry.id,
    kind: entry.kind === 'image' ? 'art' : 'audio',
    file: entry.file,
    template: entry.template,
    style: entry.style ?? '',
    promptHash: entry.promptHash,
    promptLang: info.promptLang ?? 'zh',
    tool: info.tool,
    toolVersion: info.toolVersion,
    seed: info.seed ?? '',
    refs: info.refs ?? [],
    generatedAt: info.generatedAt,
    sha256: info.sha256,
    aigcLabel: info.aigcLabel,
    converted: info.converted ?? false,
    status: 'review',
    reason: '',
    reviewer: '',
    reviewedAt: '',
    milestone: entry.milestone,
    notes: info.notes ?? '',
  };
}
