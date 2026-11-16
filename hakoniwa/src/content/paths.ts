// Field path patterns over content rows: `stages[].objectives[].mapId` names every
// `mapId` of every objective of every stage; `abilities[]` every element of an array
// field; `*` every value of an object (`lines.*[]`); a final `**` every leaf below it
// (`lines.**`). Used by the reference table (./references.ts) and by the content
// validators (tools/content/validators/) to address fields declaratively. Pure.

export interface PathValue {
  /** concrete path of the value, e.g. `stages[0].objectives[2].mapId` */
  path: string;
  value: unknown;
}

interface Step {
  key: string;
  /** iterate the array held by `key` */
  each: boolean;
}

const parsed = new Map<string, Step[]>();

function steps(pattern: string): Step[] {
  let out = parsed.get(pattern);
  if (!out) {
    out = pattern.split('.').map((part) => {
      const each = part.endsWith('[]');
      return { key: each ? part.slice(0, -2) : part, each };
    });
    parsed.set(pattern, out);
  }
  return out;
}

const join = (path: string, key: string): string => (path ? `${path}.${key}` : key);

/** Every value a pattern addresses in `root` (missing branches yield nothing). */
export function valuesAt(root: unknown, pattern: string): PathValue[] {
  const out: PathValue[] = [];
  const list = steps(pattern);
  const leaves = (v: unknown, path: string): void => {
    if (Array.isArray(v)) {
      v.forEach((x, n) => {
        leaves(x, `${path}[${n}]`);
      });
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) leaves(x, join(path, k));
    } else out.push({ path, value: v });
  };
  const step = (next: unknown, i: number, here: string, each: boolean): void => {
    if (next === undefined) return;
    if (!each) {
      visit(next, i + 1, here);
      return;
    }
    if (!Array.isArray(next)) return;
    next.forEach((x, n) => {
      visit(x, i + 1, `${here}[${n}]`);
    });
  };
  const visit = (v: unknown, i: number, path: string): void => {
    if (i === list.length) {
      out.push({ path, value: v });
      return;
    }
    const s = list[i] as Step;
    if (s.key === '**') {
      leaves(v, path);
      return;
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) return;
    const obj = v as Record<string, unknown>;
    if (s.key === '*') {
      for (const [k, next] of Object.entries(obj)) step(next, i, join(path, k), s.each);
      return;
    }
    step(obj[s.key], i, join(path, s.key), s.each);
  };
  visit(root, 0, '');
  return out;
}

/** String values a pattern addresses (other value types are skipped). */
export function stringsAt(root: unknown, pattern: string): { path: string; value: string }[] {
  return valuesAt(root, pattern).filter(
    (p): p is { path: string; value: string } => typeof p.value === 'string',
  );
}
