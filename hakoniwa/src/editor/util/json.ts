// JSON helpers shared by the editor tools: structural equality, cloning, a stable
// text hash, and the file formatter used when writing data/ files back to disk.
// Pure: no DOM, no Vite APIs.

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    if (a.length !== bb.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], bb[i])) return false;
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (!deepEqual(ao[k], bo[k])) return false;
  return true;
}

/** Deep copy of JSON-shaped data. */
export function cloneJson<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/** FNV-1a 32-bit hash of a string, as 8 hex digits. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Format JSON for a data file: 2-space indent, the top two levels (the file and its
 * rows) and every array holding objects always expanded, other deeper values kept on
 * one line when they fit in maxWidth.
 * This reproduces the hand-written style of data/world/maps_test.json, so saving an
 * unchanged file from the editor produces no diff.
 */
export function formatJson(value: unknown, maxWidth = 100): string {
  return `${fmt(value, 0, 0)}\n`;

  function inline(v: unknown): string {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
    if (Array.isArray(v)) {
      if (v.length === 0) return '[]';
      return `[${v.map((x) => inline(x === undefined ? null : x)).join(', ')}]`;
    }
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    if (entries.length === 0) return '{}';
    return `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }`;
  }

  function fmt(v: unknown, depth: number, prefix: number): string {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
    const pad = '  '.repeat(depth);
    const inner = '  '.repeat(depth + 1);
    if (Array.isArray(v)) {
      if (v.length === 0) return '[]';
      const hasObject = v.some((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
      if (depth >= 2 && !hasObject) {
        const one = inline(v);
        if (pad.length + prefix + one.length <= maxWidth) return one;
      }
      const items = v.map((x) => `${inner}${fmt(x === undefined ? null : x, depth + 1, 0)}`);
      return `[\n${items.join(',\n')}\n${pad}]`;
    }
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    if (entries.length === 0) return '{}';
    if (depth >= 2) {
      const one = inline(v);
      if (pad.length + prefix + one.length <= maxWidth) return one;
    }
    const items = entries.map(([k, x]) => {
      const key = `${JSON.stringify(k)}: `;
      return `${inner}${key}${fmt(x, depth + 1, key.length)}`;
    });
    return `{\n${items.join(',\n')}\n${pad}}`;
  }
}

/** Call fn for every string in a JSON value with its path ("[3].name", "a.b[2]"). */
export function walkStrings(
  value: unknown,
  fn: (text: string, path: string) => void,
  path = '',
): void {
  if (typeof value === 'string') fn(value, path);
  else if (Array.isArray(value)) {
    value.forEach((x, i) => {
      walkStrings(x, fn, `${path}[${i}]`);
    });
  } else if (value && typeof value === 'object') {
    for (const [k, x] of Object.entries(value as Record<string, unknown>)) {
      walkStrings(x, fn, path ? `${path}.${k}` : k);
    }
  }
}

/** Up to `radius` characters either side of the first occurrence of needle. */
export function snippetAround(text: string, needle: string, radius = 16): string {
  const i = text.indexOf(needle);
  if (i < 0) return text.slice(0, radius * 2);
  const from = Math.max(0, i - radius);
  const to = Math.min(text.length, i + needle.length + radius);
  return `${from > 0 ? '...' : ''}${text.slice(from, to)}${to < text.length ? '...' : ''}`;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
