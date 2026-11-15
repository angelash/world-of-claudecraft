// Path resolution for the editor's data endpoints (/api/data). Only JSON files under
// hakoniwa/data/ are reachable: no absolute paths, drive letters, backslashes, empty, dot or
// dot-dot segments, hidden names, or characters outside [A-Za-z0-9_.-]. Pure (node:path
// only), so the traversal guard is unit tested. See docs/50_tech/architecture.md 9.

import { isAbsolute, relative, resolve, sep } from 'node:path';

export type DataPathResult =
  | { ok: true; path: string; rel: string }
  | { ok: false; reason: string };

const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const MAX_LENGTH = 200;

/** Resolve `file` (as sent in ?file=, already URL-decoded) inside `dataRoot`. */
export function resolveDataPath(dataRoot: string, file: string | null | undefined): DataPathResult {
  if (typeof file !== 'string' || file === '') return { ok: false, reason: 'missing_file' };
  if (file.length > MAX_LENGTH) return { ok: false, reason: 'too_long' };
  if (file.includes('\0') || file.includes('\\')) return { ok: false, reason: 'bad_character' };
  if (file.startsWith('/') || /^[A-Za-z]:/.test(file)) return { ok: false, reason: 'absolute' };
  if (!file.endsWith('.json')) return { ok: false, reason: 'not_json' };
  const segments = file.split('/');
  for (const s of segments) {
    if (s === '' || s === '.' || s === '..') return { ok: false, reason: 'traversal' };
    if (!SEGMENT.test(s)) return { ok: false, reason: 'bad_segment' };
  }
  const root = resolve(dataRoot);
  const full = resolve(root, ...segments);
  const rel = relative(root, full);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel))
    return { ok: false, reason: 'outside' };
  if (!full.startsWith(root.endsWith(sep) ? root : root + sep))
    return { ok: false, reason: 'outside' };
  return { ok: true, path: full, rel: segments.join('/') };
}

/** Pretty JSON exactly as the data files are stored: two-space indent, trailing newline. */
export function formatJsonFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
