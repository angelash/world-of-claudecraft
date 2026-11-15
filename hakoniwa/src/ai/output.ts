// Output parsing and the structural gate of the AI layer: JSON shape, command kinds in the
// request's allowed list, data as an object, count limits, and light post-processing of
// speech and thought. Semantic checks (staleness, cost, eligibility) belong to the kernel's
// command handlers. See docs/50_tech/ai_architecture.md 2.3.5, 7.5 and 8.2.

export interface ProposedCommand {
  kind: string;
  data: Record<string, unknown>;
}

export interface RejectedCommand {
  index: number;
  kind?: string;
  reason: 'not_allowed' | 'bad_kind' | 'bad_data' | 'too_many';
}

export interface ValidatedProposal {
  /** False when the answer is not a usable object at all. */
  ok: boolean;
  commands: ProposedCommand[];
  rejected: RejectedCommand[];
  speech?: string;
  thought?: string;
  /** Structural problems, in Chinese, for the audit desk. */
  errors: string[];
}

export interface ValidateOptions {
  maxCommands: number;
  speechMaxChars?: number;
  thoughtMaxChars?: number;
  /** Speaker display name; a leading "name:" prefix is removed from speech. */
  speakAs?: string;
}

/**
 * Best-effort JSON recovery: use the provider's parsed JSON when present, otherwise parse
 * the text, tolerating code fences and prose around one object.
 */
export function recoverJson(json: unknown, text: string): unknown {
  if (json !== null && json !== undefined) return json;
  const t = text.trim();
  if (!t) return undefined;
  const attempts = [t];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fenced?.[1]) attempts.push(fenced[1].trim());
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first >= 0 && last > first) attempts.push(t.slice(first, last + 1));
  for (const a of attempts) {
    try {
      return JSON.parse(a);
    } catch {
      // try the next form
    }
  }
  return undefined;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseData(v: unknown): Record<string, unknown> | undefined {
  if (isPlainObject(v)) return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '') return {};
    try {
      const parsed: unknown = JSON.parse(s);
      return isPlainObject(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Light post-processing (docs/50_tech/ai_architecture.md 7.5): no markdown marks, no outer
 * quotes, no self-name prefix, bounded length. No rewriting.
 */
export function tidyLine(s: string, maxChars: number, speakAs?: string): string {
  let t = s.replace(/[*_#`~]/g, '').trim();
  if (speakAs) {
    for (const sep of ['：', ':']) {
      if (t.startsWith(`${speakAs}${sep}`)) t = t.slice(speakAs.length + sep.length).trim();
    }
  }
  const pairs: [string, string][] = [
    ['“', '”'],
    ['"', '"'],
    ['「', '」'],
    ['『', '』'],
  ];
  for (const [a, b] of pairs) {
    if (t.length >= 2 && t.startsWith(a) && t.endsWith(b)) t = t.slice(a.length, -b.length).trim();
  }
  const chars = [...t];
  if (chars.length > maxChars) {
    const cut = chars.slice(0, maxChars).join('');
    const stop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'));
    t = stop >= maxChars / 2 ? cut.slice(0, stop + 1) : cut;
  }
  return t;
}

/** Validate one model answer against the request's allowed command kinds. */
export function validateProposal(
  raw: unknown,
  allowed: readonly string[],
  opts: ValidateOptions,
): ValidatedProposal {
  const out: ValidatedProposal = { ok: false, commands: [], rejected: [], errors: [] };
  if (!isPlainObject(raw)) {
    out.errors.push('输出不是一个 JSON 对象');
    return out;
  }
  const cmds = raw.commands;
  if (!Array.isArray(cmds)) {
    out.errors.push('缺少 commands 数组（commands 应放在最外层）');
    return out;
  }
  out.ok = true;
  const allow = new Set(allowed);
  cmds.forEach((c, index) => {
    if (!isPlainObject(c) || typeof c.kind !== 'string' || c.kind === '') {
      out.rejected.push({ index, reason: 'bad_kind' });
      return;
    }
    const kind = c.kind;
    if (!allow.has(kind)) {
      out.rejected.push({ index, kind, reason: 'not_allowed' });
      return;
    }
    const data = parseData(c.data);
    if (!data) {
      out.rejected.push({ index, kind, reason: 'bad_data' });
      return;
    }
    if (out.commands.length >= opts.maxCommands) {
      out.rejected.push({ index, kind, reason: 'too_many' });
      return;
    }
    out.commands.push({ kind, data });
  });
  if (typeof raw.speech === 'string') {
    const s = tidyLine(raw.speech, opts.speechMaxChars ?? 200, opts.speakAs);
    if (s) out.speech = s;
  }
  if (typeof raw.thought === 'string') {
    const s = tidyLine(raw.thought, opts.thoughtMaxChars ?? 300);
    if (s) out.thought = s;
  }
  return out;
}

/** Every string inside a value (for leak scanning of command data). */
export function collectStrings(v: unknown, into: string[] = []): string[] {
  if (typeof v === 'string') into.push(v);
  else if (Array.isArray(v)) for (const x of v) collectStrings(x, into);
  else if (isPlainObject(v)) for (const x of Object.values(v)) collectStrings(x, into);
  return into;
}

// --- full schema check -----------------------------------------------------------------------

/** One way a value breaks a JSON Schema: the value path and the failing keyword. */
export interface SchemaIssue {
  path: string;
  keyword: string;
}

function typeMatches(t: string, v: unknown): boolean {
  switch (t) {
    case 'null':
      return v === null;
    case 'boolean':
      return typeof v === 'boolean';
    case 'string':
      return typeof v === 'string';
    case 'number':
      return typeof v === 'number' && Number.isFinite(v);
    case 'integer':
      return typeof v === 'number' && Number.isInteger(v);
    case 'array':
      return Array.isArray(v);
    case 'object':
      return isPlainObject(v);
    default:
      return true;
  }
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** String formats the check knows; unknown formats pass. */
const FORMATS: Record<string, RegExp> = {
  'date-time': /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  time: /^\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})?$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  uri: /^[A-Za-z][A-Za-z0-9+.-]*:\S+$/,
  uuid: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  ipv4: /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$/,
};

function patternOk(pattern: unknown, text: string): boolean {
  if (typeof pattern !== 'string') return true;
  try {
    return new RegExp(pattern, 'u').test(text);
  } catch {
    return true;
  }
}

/** Resolve a local reference such as '#/$defs/name' against the root schema. */
function resolveRef(ref: unknown, root: unknown): unknown {
  if (typeof ref !== 'string' || !ref.startsWith('#')) return undefined;
  let node: unknown = root;
  for (const raw of ref
    .slice(1)
    .split('/')
    .filter((p) => p !== '')) {
    const part = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isPlainObject(node)) return undefined;
    node = node[part];
  }
  return node;
}

/**
 * Check a value against the game's full output schema, constraints included. Providers
 * enforce only their dialect's subset (src/ai/providers/schema_dialect.ts); this check is
 * where every stripped constraint (lengths, patterns, formats, numeric bounds, array and
 * object keywords, oneOf) is still enforced. Local references ($ref to #/...) and
 * if/then/else are followed. Empty list means valid.
 */
export function checkSchema(
  value: unknown,
  schema: unknown,
  path = '',
  root: unknown = schema,
): SchemaIssue[] {
  if (schema === true || schema === undefined) return [];
  if (schema === false) return [{ path, keyword: 'false' }];
  if (!isPlainObject(schema)) return [];
  const s = schema;
  const out: SchemaIssue[] = [];
  const add = (keyword: string, at = path) => out.push({ path: at, keyword });
  const sub = (v: unknown, sch: unknown, at: string) => checkSchema(v, sch, at, root);
  if (s.$ref !== undefined) {
    const target = resolveRef(s.$ref, root);
    if (target === undefined) add('$ref');
    else out.push(...sub(value, target, path));
  }
  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some((t) => typeof t === 'string' && typeMatches(t, value))) {
      add('type');
      return out;
    }
  }
  if (Array.isArray(s.enum) && !s.enum.some((e) => sameJson(e, value))) add('enum');
  if ('const' in s && !sameJson(s.const, value)) add('const');
  if (typeof value === 'string') {
    const len = [...value].length;
    const minL = num(s.minLength);
    const maxL = num(s.maxLength);
    if (minL !== undefined && len < minL) add('minLength');
    if (maxL !== undefined && len > maxL) add('maxLength');
    if (!patternOk(s.pattern, value)) add('pattern');
    const fmt = typeof s.format === 'string' ? FORMATS[s.format] : undefined;
    if (fmt && !fmt.test(value)) add('format');
  }
  if (typeof value === 'number') {
    const min = num(s.minimum);
    const max = num(s.maximum);
    const xmin = num(s.exclusiveMinimum);
    const xmax = num(s.exclusiveMaximum);
    const mult = num(s.multipleOf);
    if (min !== undefined && value < min) add('minimum');
    if (max !== undefined && value > max) add('maximum');
    if (xmin !== undefined && value <= xmin) add('exclusiveMinimum');
    if (xmax !== undefined && value >= xmax) add('exclusiveMaximum');
    if (
      mult !== undefined &&
      mult > 0 &&
      Math.abs(value / mult - Math.round(value / mult)) > 1e-9
    ) {
      add('multipleOf');
    }
  }
  if (Array.isArray(value)) {
    const minI = num(s.minItems);
    const maxI = num(s.maxItems);
    if (minI !== undefined && value.length < minI) add('minItems');
    if (maxI !== undefined && value.length > maxI) add('maxItems');
    if (s.uniqueItems === true) {
      const seen = new Set(value.map((x) => JSON.stringify(x)));
      if (seen.size !== value.length) add('uniqueItems');
    }
    const prefix = Array.isArray(s.prefixItems)
      ? s.prefixItems
      : Array.isArray(s.items)
        ? s.items
        : [];
    value.forEach((item, i) => {
      const itemSchema =
        i < prefix.length ? prefix[i] : Array.isArray(s.items) ? undefined : s.items;
      out.push(...sub(item, itemSchema, `${path}/${i}`));
    });
    if (s.contains !== undefined) {
      const hits = value.filter(
        (item, i) => sub(item, s.contains, `${path}/${i}`).length === 0,
      ).length;
      const minC = num(s.minContains) ?? 1;
      const maxC = num(s.maxContains);
      if (hits < minC) add(s.minContains === undefined ? 'contains' : 'minContains');
      if (maxC !== undefined && hits > maxC) add('maxContains');
    }
  }
  if (isPlainObject(value)) {
    const props = isPlainObject(s.properties) ? s.properties : {};
    const patterns = isPlainObject(s.patternProperties) ? s.patternProperties : {};
    if (Array.isArray(s.required)) {
      for (const r of s.required) {
        if (typeof r === 'string' && !(r in value)) add('required', `${path}/${r}`);
      }
    }
    const keys = Object.keys(value);
    const minP = num(s.minProperties);
    const maxP = num(s.maxProperties);
    if (minP !== undefined && keys.length < minP) add('minProperties');
    if (maxP !== undefined && keys.length > maxP) add('maxProperties');
    for (const k of keys) {
      if (s.propertyNames !== undefined && sub(k, s.propertyNames, `${path}/${k}`).length > 0) {
        add('propertyNames', `${path}/${k}`);
      }
      const matched = Object.keys(patterns).filter((p) => patternOk(p, k) && typeof p === 'string');
      for (const p of matched) out.push(...sub(value[k], patterns[p], `${path}/${k}`));
      if (k in props) out.push(...sub(value[k], props[k], `${path}/${k}`));
      else if (matched.length > 0) continue;
      else if (s.additionalProperties === false) add('additionalProperties', `${path}/${k}`);
      else if (isPlainObject(s.additionalProperties)) {
        out.push(...sub(value[k], s.additionalProperties, `${path}/${k}`));
      }
    }
  }
  if (Array.isArray(s.allOf)) for (const one of s.allOf) out.push(...sub(value, one, path));
  if (Array.isArray(s.anyOf) && !s.anyOf.some((one) => sub(value, one, path).length === 0)) {
    add('anyOf');
  }
  if (Array.isArray(s.oneOf)) {
    const passing = s.oneOf.filter((one) => sub(value, one, path).length === 0).length;
    if (passing !== 1) add('oneOf');
  }
  if (s.not !== undefined && sub(value, s.not, path).length === 0) add('not');
  if (s.if !== undefined) {
    const branch = sub(value, s.if, path).length === 0 ? s.then : s.else;
    if (branch !== undefined) out.push(...sub(value, branch, path));
  }
  return out;
}

/**
 * Undo the strict dialects' "optional as required and nullable" (schema_dialect.ts): drop
 * null values of properties the original schema does not require, so the answer can be
 * checked against the original schema.
 */
export function dropNullOptionals(value: unknown, schema: unknown): unknown {
  if (!isPlainObject(schema)) return value;
  if (Array.isArray(value)) {
    const items = schema.items;
    return isPlainObject(items) ? value.map((x) => dropNullOptionals(x, items)) : value;
  }
  if (!isPlainObject(value)) return value;
  const props = isPlainObject(schema.properties) ? schema.properties : {};
  const req = new Set(Array.isArray(schema.required) ? schema.required : []);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === null && k in props && !req.has(k)) continue;
    out[k] = k in props ? dropNullOptionals(v, props[k]) : v;
  }
  return out;
}
