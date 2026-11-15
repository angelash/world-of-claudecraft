// Hand-written payload validators for the hk:* channels (docs/50_tech/release_engineering.md
// 2.3: no third-party schema library, the same approach as architecture.md 6). A check
// returns the accepted value or a developer-facing error path; it never echoes the
// rejected value, so a payload that carries a secret cannot leak through an error.

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };
export type Check<T> = (value: unknown, path?: string) => Checked<T>;
export type CheckValue<C> = C extends Check<infer T> ? T : never;

const ok = <T>(value: T): Checked<T> => ({ ok: true, value });
const fail = (path: string, what: string): Checked<never> => ({
  ok: false,
  error: `${path || 'payload'}: ${what}`,
});

/** No payload at all (the channel takes no argument). */
export const none: Check<undefined> = (v, path = '') =>
  v === undefined ? ok(undefined) : fail(path, 'no payload expected');

export function str(opts: { min?: number; max: number; pattern?: RegExp }): Check<string> {
  return (v, path = '') => {
    if (typeof v !== 'string') return fail(path, 'string expected');
    if (v.length < (opts.min ?? 0) || v.length > opts.max) return fail(path, 'length out of range');
    if (opts.pattern && !opts.pattern.test(v)) return fail(path, 'bad format');
    return ok(v);
  };
}

export function num(opts: { min: number; max: number; int?: boolean }): Check<number> {
  return (v, path = '') => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return fail(path, 'number expected');
    if (opts.int && !Number.isInteger(v)) return fail(path, 'integer expected');
    if (v < opts.min || v > opts.max) return fail(path, 'out of range');
    return ok(v);
  };
}

export const bool: Check<boolean> = (v, path = '') =>
  typeof v === 'boolean' ? ok(v) : fail(path, 'boolean expected');

export function oneOf<const T extends string | number>(values: readonly T[]): Check<T> {
  return (v, path = '') =>
    (values as readonly unknown[]).includes(v) ? ok(v as T) : fail(path, 'not an allowed value');
}

/** A predicate check, for ids whose rule lives elsewhere (slot ids, run ids, hashes). */
export function where(test: (v: unknown) => boolean, what: string): Check<string> {
  return (v, path = '') => (test(v) ? ok(v as string) : fail(path, what));
}

export function bytes(max: number): Check<Uint8Array> {
  return (v, path = '') => {
    if (!(v instanceof Uint8Array)) return fail(path, 'bytes expected');
    if (v.byteLength > max) return fail(path, 'too large');
    return ok(v);
  };
}

export function arr<T>(item: Check<T>, opts: { min?: number; max: number }): Check<T[]> {
  return (v, path = '') => {
    if (!Array.isArray(v)) return fail(path, 'array expected');
    if (v.length < (opts.min ?? 0) || v.length > opts.max) return fail(path, 'length out of range');
    const out: T[] = [];
    for (let i = 0; i < v.length; i++) {
      const r = item(v[i], `${path}[${i}]`);
      if (!r.ok) return r;
      out.push(r.value);
    }
    return ok(out);
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

type Shape = Record<string, Check<unknown>>;
type ShapeValue<S extends Shape, O extends keyof S> = {
  [K in Exclude<keyof S, O>]: CheckValue<S[K]>;
} & { [K in O]?: CheckValue<S[K]> };

/**
 * A plain object with the given fields. `optional` fields may be absent. Unknown fields
 * are rejected (the default, for request payloads) or dropped (for settings values, 2.3).
 */
export function obj<S extends Shape, O extends keyof S = never>(
  shape: S,
  opts: { optional?: readonly O[]; unknown?: 'reject' | 'drop' } = {},
): Check<ShapeValue<S, O>> {
  const optional = new Set<PropertyKey>(opts.optional ?? []);
  return (v, path = '') => {
    if (!isPlainObject(v)) return fail(path, 'object expected');
    if (opts.unknown !== 'drop') {
      const extra = Object.keys(v).find((k) => !Object.hasOwn(shape, k));
      if (extra !== undefined) return fail(path, `unexpected field ${extra.slice(0, 40)}`);
    }
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) {
      const field = v[key];
      if (field === undefined) {
        if (optional.has(key)) continue;
        return fail(`${path}.${key}`, 'missing');
      }
      const r = (shape[key] as Check<unknown>)(field, `${path}.${key}`);
      if (!r.ok) return r;
      out[key] = r.value;
    }
    return ok(out as ShapeValue<S, O>);
  };
}

/**
 * Plain JSON data (null, booleans, finite numbers, strings, arrays, plain objects) within
 * a depth and node budget; anything else (functions, class instances, binary) is refused.
 */
export function json(opts: { maxDepth: number; maxNodes: number }): Check<unknown> {
  return (v, path = '') => {
    let nodes = 0;
    const walk = (x: unknown, depth: number): boolean => {
      nodes++;
      if (nodes > opts.maxNodes || depth > opts.maxDepth) return false;
      if (x === null || typeof x === 'boolean' || typeof x === 'string') return true;
      if (typeof x === 'number') return Number.isFinite(x);
      if (Array.isArray(x)) return x.every((e) => walk(e, depth + 1));
      // An absent optional field may arrive as an own property holding undefined.
      if (isPlainObject(x)) {
        return Object.values(x).every((e) => e === undefined || walk(e, depth + 1));
      }
      return false;
    };
    return walk(v, 0) ? ok(v) : fail(path, 'plain JSON within budget expected');
  };
}

/**
 * Approximate wire size of a payload in bytes (UTF-16 strings, binary by length), with an
 * early exit: once the running total passes `limit` (or the walk is too deep or too wide)
 * it returns Infinity, so an oversized payload costs at most `limit` work.
 */
export function payloadBytes(v: unknown, limit: number): number {
  let total = 0;
  let nodes = 0;
  const walk = (x: unknown, depth: number): boolean => {
    nodes++;
    if (depth > 64 || nodes > 1_000_000) return false;
    if (x === null || x === undefined || typeof x === 'boolean') total += 1;
    else if (typeof x === 'number') total += 8;
    else if (typeof x === 'string') total += x.length * 2 + 2;
    else if (ArrayBuffer.isView(x)) total += x.byteLength;
    else if (x instanceof ArrayBuffer) total += x.byteLength;
    else if (Array.isArray(x)) {
      for (const e of x) if (!walk(e, depth + 1)) return false;
    } else if (typeof x === 'object') {
      for (const [k, e] of Object.entries(x as Record<string, unknown>)) {
        total += k.length * 2 + 2;
        if (!walk(e, depth + 1)) return false;
      }
    } else return false;
    return total <= limit;
  };
  return walk(v, 0) ? total : Number.POSITIVE_INFINITY;
}
