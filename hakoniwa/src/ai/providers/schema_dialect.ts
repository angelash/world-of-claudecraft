// Schema dialects (docs/50_tech/llm_providers.md 3.6): a deterministic rewrite of the
// game's full output JSON Schema into the subset each channel accepts. Every object gets
// additionalProperties false; strict and local dialects make optional fields required and
// nullable, turn oneOf into anyOf and strip length, pattern, format and bound keywords; the
// local variant also splits the command menu into one const branch per verb and caps the
// calls array at one entry. Stripped constraints are returned so the game's own validator
// (src/ai/output.ts checkSchema against the original schema) still enforces them.

import type { JsonSchema, OutputChannel } from '../contracts';
import type { DialectFlags, ProviderKind } from './types';

export type SchemaDialect = 'anthropic' | 'openai_strict' | 'local';

/** Bumped whenever a rewrite rule changes; part of the cache key and the audit version. */
export const DIALECT_VERSION = 1;

/** Keywords the strict and local dialects strip (the original schema still enforces them). */
export const STRIP_KEYWORDS: readonly string[] = [
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'patternProperties',
  'propertyNames',
  'contains',
  'minContains',
  'maxContains',
  'default',
];

const STRIP = new Set(STRIP_KEYWORDS);

export const SCHEMA_TYPES: readonly string[] = [
  'object',
  'array',
  'string',
  'number',
  'integer',
  'boolean',
  'null',
];

export interface StrippedConstraint {
  /** JSON pointer of the schema node that carried the keyword. */
  path: string;
  keyword: string;
  value: unknown;
}

export interface DialectOptions {
  /** Anthropic only: the model table's flags (default: both on). */
  flags?: DialectFlags;
  /** Local variant: the menu property split into const branches. Default 'kind'. */
  menuKey?: string;
  /** Local variant: the root array of calls capped at one entry. Default 'commands'. */
  callsKey?: string;
  /** Local variant: properties written as constants, by dot path ('a.b', '[]' for items). */
  constants?: Readonly<Record<string, string | number | boolean>>;
}

export interface DialectResult {
  schema: JsonSchema;
  dialect: SchemaDialect;
  version: number;
  stripped: StrippedConstraint[];
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** Whether a schema node describes an object. */
export function isObjectSchema(node: unknown): node is Record<string, unknown> {
  if (!isObj(node)) return false;
  const t = node.type;
  return t === 'object' || (Array.isArray(t) && t.includes('object')) || isObj(node.properties);
}

/** Which dialect a provider kind uses on its json_schema and tool channels. */
export function dialectFor(kind: ProviderKind): SchemaDialect {
  if (kind === 'anthropic') return 'anthropic';
  if (kind === 'local') return 'local';
  return 'openai_strict';
}

interface Ctx {
  strip: boolean;
  /** Anthropic structured outputs take no maxItems and no minItems above one. */
  stripArrayBounds: boolean;
  oneOfToAnyOf: boolean;
  allRequired: boolean;
  stripped: StrippedConstraint[];
}

/** Make a (rewritten) property schema accept null as well. */
function nullable(s: unknown): Record<string, unknown> {
  if (!isObj(s) || 'const' in s) return { anyOf: [s, { type: 'null' }] };
  const out: Record<string, unknown> = { ...s };
  if (typeof s.type === 'string' && s.type !== 'null') {
    out.type = [s.type, 'null'];
    if (Array.isArray(s.enum) && !s.enum.includes(null)) out.enum = [...s.enum, null];
    return out;
  }
  if (Array.isArray(s.type)) {
    if (!s.type.includes('null')) out.type = [...s.type, 'null'];
    if (Array.isArray(s.enum) && !s.enum.includes(null)) out.enum = [...s.enum, null];
    return out;
  }
  if (Array.isArray(s.anyOf)) {
    const hasNull = s.anyOf.some((b) => isObj(b) && b.type === 'null');
    if (!hasNull) out.anyOf = [...s.anyOf, { type: 'null' }];
    return out;
  }
  return { anyOf: [s, { type: 'null' }] };
}

const SUBSCHEMA_MAPS = ['properties', '$defs', 'definitions'];
const SUBSCHEMA_LISTS = ['anyOf', 'allOf', 'oneOf', 'prefixItems'];
const SUBSCHEMA_ONE = ['not', 'if', 'then', 'else', 'additionalItems'];

function rw(node: unknown, path: string, ctx: Ctx): unknown {
  if (!isObj(node)) return clone(node);
  const objectNode = isObjectSchema(node);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    const arrayBound =
      ctx.stripArrayBounds &&
      (k === 'maxItems' || (k === 'minItems' && typeof v === 'number' && v > 1));
    if ((ctx.strip && STRIP.has(k)) || arrayBound) {
      ctx.stripped.push({ path, keyword: k, value: clone(v) });
      continue;
    }
    if (SUBSCHEMA_MAPS.includes(k) && isObj(v)) {
      const m: Record<string, unknown> = {};
      for (const [name, sub] of Object.entries(v)) m[name] = rw(sub, `${path}/${k}/${name}`, ctx);
      out[k] = m;
      continue;
    }
    if (SUBSCHEMA_LISTS.includes(k) && Array.isArray(v)) {
      const convert = k === 'oneOf' && ctx.oneOfToAnyOf;
      const key = convert ? 'anyOf' : k;
      const list = v.map((sub, i) => rw(sub, `${path}/${key}/${i}`, ctx));
      if (convert && Array.isArray(node.anyOf)) {
        // Both present: keep them intersected instead of merging the branch lists.
        out.allOf = [...(Array.isArray(out.allOf) ? out.allOf : []), { anyOf: list }];
        continue;
      }
      out[key] = Array.isArray(out[key]) ? [...(out[key] as unknown[]), ...list] : list;
      continue;
    }
    if (k === 'items') {
      out.items = Array.isArray(v)
        ? v.map((sub, i) => rw(sub, `${path}/items/${i}`, ctx))
        : rw(v, `${path}/items`, ctx);
      continue;
    }
    if (SUBSCHEMA_ONE.includes(k)) {
      out[k] = rw(v, `${path}/${k}`, ctx);
      continue;
    }
    if (k === 'additionalProperties' && objectNode) {
      out.additionalProperties = false;
      continue;
    }
    out[k] = clone(v);
  }
  if (objectNode) {
    const props = isObj(out.properties) ? out.properties : {};
    const keys = Object.keys(props);
    if (ctx.allRequired) {
      const req = new Set(Array.isArray(node.required) ? (node.required as string[]) : []);
      for (const key of keys) if (!req.has(key)) props[key] = nullable(props[key]);
      if (keys.length > 0 || 'required' in out) out.required = keys;
    }
    out.additionalProperties = false;
  }
  return out;
}

function setConstant(schema: Record<string, unknown>, dotPath: string, value: unknown): void {
  let node: unknown = schema;
  const parts = dotPath.split('.');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] as string;
    if (!isObj(node)) return;
    if (part === '[]') {
      node = node.items;
      continue;
    }
    const props = node.properties;
    if (!isObj(props) || !isObj(props[part])) return;
    if (i === parts.length - 1) {
      const target = props[part] as Record<string, unknown>;
      delete target.enum;
      target.const = value;
      return;
    }
    node = props[part];
  }
}

/** Local variant: one branch per menu verb, and at most one call per answer. */
function localMenu(root: Record<string, unknown>, callsKey: string, menuKey: string): void {
  const props = root.properties;
  if (!isObj(props)) return;
  const calls = props[callsKey];
  if (!isObj(calls) || calls.type !== 'array') return;
  calls.maxItems = 1;
  const items = calls.items;
  if (!isObj(items) || !isObj(items.properties)) return;
  const menu = items.properties[menuKey];
  if (!isObj(menu) || !Array.isArray(menu.enum)) return;
  const verbs = menu.enum.filter((v) => v !== null);
  const branch = (verb: unknown): Record<string, unknown> => {
    const p: Record<string, unknown> = {};
    for (const [name, sub] of Object.entries(items.properties as Record<string, unknown>)) {
      if (name !== menuKey) {
        p[name] = clone(sub);
        continue;
      }
      const c: Record<string, unknown> = { type: 'string', const: verb };
      if (typeof menu.description === 'string') c.description = menu.description;
      p[name] = c;
    }
    return { ...clone(items), properties: p };
  };
  calls.items = verbs.length === 1 ? branch(verbs[0]) : { anyOf: verbs.map(branch) };
}

/**
 * Rewrite the game's output schema for one dialect. Throws on a non-object root: every
 * channel requires an object at the root, and the game never builds another shape.
 */
export function rewriteSchema(
  schema: JsonSchema,
  dialect: SchemaDialect,
  opts: DialectOptions = {},
): DialectResult {
  if (!isObjectSchema(schema)) throw new Error('schema root must be an object');
  const flags = opts.flags ?? { oneOfToAnyOf: true, stripConstraints: true };
  const ctx: Ctx = {
    strip: dialect === 'anthropic' ? flags.stripConstraints : true,
    stripArrayBounds: dialect === 'anthropic' && flags.stripConstraints,
    oneOfToAnyOf: dialect === 'anthropic' ? flags.oneOfToAnyOf : true,
    allRequired: dialect !== 'anthropic',
    stripped: [],
  };
  const out = rw(schema, '', ctx) as Record<string, unknown>;
  if (dialect === 'local') {
    for (const [path, value] of Object.entries(opts.constants ?? {})) setConstant(out, path, value);
    localMenu(out, opts.callsKey ?? 'commands', opts.menuKey ?? 'kind');
  }
  return { schema: out, dialect, version: DIALECT_VERSION, stripped: ctx.stripped };
}

/**
 * Structural lint of a rewritten schema against its dialect's rules; an empty list means the
 * schema is a valid member of the subset. Used by tests and at startup checks.
 */
export function lintDialectSchema(
  schema: unknown,
  dialect: SchemaDialect,
  opts: DialectOptions = {},
): string[] {
  const issues: string[] = [];
  const flags = opts.flags ?? { oneOfToAnyOf: true, stripConstraints: true };
  const strict = dialect !== 'anthropic';
  const strip = strict || flags.stripConstraints;
  const noOneOf = strict || flags.oneOfToAnyOf;
  if (!isObjectSchema(schema)) issues.push('root: not an object schema');
  const walk = (node: unknown, path: string): void => {
    if (!isObj(node)) {
      if (typeof node !== 'boolean') issues.push(`${path}: not a schema`);
      return;
    }
    const t = node.type;
    const types = Array.isArray(t) ? t : t === undefined ? [] : [t];
    for (const x of types) {
      if (typeof x !== 'string' || !SCHEMA_TYPES.includes(x))
        issues.push(`${path}: bad type ${String(x)}`);
    }
    for (const k of Object.keys(node)) {
      if (strip && STRIP.has(k)) issues.push(`${path}: keyword ${k} not allowed`);
      const v = node[k];
      if (
        dialect === 'anthropic' &&
        flags.stripConstraints &&
        (k === 'maxItems' || (k === 'minItems' && typeof v === 'number' && v > 1))
      ) {
        issues.push(`${path}: keyword ${k} not allowed`);
      }
      if (noOneOf && k === 'oneOf') issues.push(`${path}: oneOf not allowed`);
    }
    if (isObjectSchema(node)) {
      if (node.additionalProperties !== false)
        issues.push(`${path}: additionalProperties not false`);
      const props = isObj(node.properties) ? node.properties : {};
      const req = Array.isArray(node.required) ? (node.required as unknown[]) : [];
      for (const r of req) {
        if (typeof r !== 'string' || !(r in props))
          issues.push(`${path}: required ${String(r)} missing`);
      }
      if (strict) {
        for (const key of Object.keys(props)) {
          if (!req.includes(key)) issues.push(`${path}: property ${key} not required`);
        }
      }
      for (const [k, sub] of Object.entries(props)) walk(sub, `${path}/properties/${k}`);
    }
    if (node.items !== undefined) {
      if (Array.isArray(node.items)) {
        node.items.forEach((s, i) => {
          walk(s, `${path}/items/${i}`);
        });
      } else walk(node.items, `${path}/items`);
    }
    for (const k of SUBSCHEMA_LISTS) {
      const list = node[k];
      if (!Array.isArray(list)) continue;
      list.forEach((s, i) => {
        walk(s, `${path}/${k}/${i}`);
      });
    }
    for (const k of ['$defs', 'definitions']) {
      const m = node[k];
      if (isObj(m)) for (const [name, s] of Object.entries(m)) walk(s, `${path}/${k}/${name}`);
    }
    for (const k of SUBSCHEMA_ONE) if (node[k] !== undefined) walk(node[k], `${path}/${k}`);
  };
  walk(schema, '');
  if (dialect === 'local' && isObj(schema) && isObj(schema.properties)) {
    const calls = schema.properties[opts.callsKey ?? 'commands'];
    if (isObj(calls) && calls.type === 'array') {
      if (calls.maxItems !== 1) issues.push('/properties/commands: local variant needs maxItems 1');
      const menuKey = opts.menuKey ?? 'kind';
      const items = calls.items;
      const branches = isObj(items) && Array.isArray(items.anyOf) ? items.anyOf : [items];
      for (const b of branches) {
        const menu = isObj(b) && isObj(b.properties) ? b.properties[menuKey] : undefined;
        if (isObj(menu) && Array.isArray(menu.enum)) {
          issues.push('/properties/commands: local variant needs one const branch per verb');
        }
      }
    }
  }
  return issues;
}

/**
 * Memo of rewrites keyed by (schema id, schema version, channel, dialect, dialect version,
 * flags), as llm_providers.md 3.6 asks; a host keeps one per process.
 */
export class DialectCache {
  private readonly map = new Map<string, DialectResult>();

  static key(
    schemaId: string,
    schemaVersion: string,
    channel: OutputChannel,
    dialect: SchemaDialect,
    flags?: DialectFlags,
  ): string {
    const f = flags ? `${flags.oneOfToAnyOf ? 1 : 0}${flags.stripConstraints ? 1 : 0}` : '11';
    return [schemaId, schemaVersion, channel, dialect, DIALECT_VERSION, f].join('|');
  }

  get(key: string, build: () => DialectResult): DialectResult {
    let hit = this.map.get(key);
    if (!hit) {
      hit = build();
      this.map.set(key, hit);
    }
    return hit;
  }

  get size(): number {
    return this.map.size;
  }
}
