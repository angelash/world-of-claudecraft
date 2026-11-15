// Content check desk rules: validateContent, forbidden characters in every data text,
// map checks (exit references, shape, reachability), id naming, empty and invalid
// fields. Each issue carries a target so the UI can jump to the table row or the map.
// Pure: no DOM.

import type { TableSchema } from '../../content/pack';
import type { MapDef } from '../../systems/world/types';
import { validateRows } from '../content/form_model';
import { fileShape, idOf, type Row, rowsOf } from '../content/rows';
import { checkMap, type Severity } from '../map/map_checks';
import { isMapLike } from '../map/map_ops';
import { fmt, T } from '../text';

export type { Severity } from '../map/map_checks';

export type IssueTarget =
  | { kind: 'row'; file: string; table: string; id: string; field?: string }
  | { kind: 'map'; file: string; mapId: string; x?: number; y?: number }
  | { kind: 'file'; file: string }
  | { kind: 'none' };

export type RuleId = 'validate' | 'forbidden' | 'map_ref' | 'map' | 'id' | 'empty' | 'field';

export interface Issue {
  severity: Severity;
  rule: RuleId;
  message: string;
  target: IssueTarget;
}

/** Repository rule: no U+2013/2014/2015 dashes, no emoji, no U+2600..27BF symbols, no U+FE0F. */
export const FORBIDDEN_RE = /[\u2013\u2014\u2015\u2600-\u27BF]|\uFE0F|[\u{1F000}-\u{1FAFF}]/u;
const FORBIDDEN_GLOBAL = new RegExp(FORBIDDEN_RE.source, 'gu');

export interface ForbiddenHit {
  path: string;
  codePoint: number;
  snippet: string;
}

export function findForbidden(text: string): { index: number; codePoint: number }[] {
  const out: { index: number; codePoint: number }[] = [];
  for (const m of text.matchAll(FORBIDDEN_GLOBAL)) {
    out.push({ index: m.index ?? 0, codePoint: (m[0] as string).codePointAt(0) ?? 0 });
  }
  return out;
}

/** Every forbidden character in every string (and key) of a JSON value. */
export function scanValue(value: unknown, path = ''): ForbiddenHit[] {
  const out: ForbiddenHit[] = [];
  const visit = (v: unknown, p: string) => {
    if (typeof v === 'string') {
      for (const hit of findForbidden(v)) {
        const from = Math.max(0, hit.index - 12);
        out.push({ path: p, codePoint: hit.codePoint, snippet: v.slice(from, hit.index + 12) });
      }
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => {
        visit(x, `${p}[${i}]`);
      });
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        for (const hit of findForbidden(k)) {
          out.push({ path: `${p}.${k}`, codePoint: hit.codePoint, snippet: k });
        }
        visit(x, p ? `${p}.${k}` : k);
      }
    }
  };
  visit(value, path);
  return out;
}

/** Lower snake case, optionally namespaced with dots (feat.kill, like event and flag names). */
export const ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

/** Canonical ledger codes from docs/30_story/reveal_ledger.md, for example M01-C01. */
export const LEDGER_CODE_PATTERN = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+$/;

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id) || LEDGER_CODE_PATTERN.test(id);
}

export interface CheckInput {
  schemas: readonly TableSchema[];
  /** every data file (path under data/ to parsed JSON), drafts applied */
  files: ReadonlyMap<string, unknown>;
  /** validateContent output for the same state */
  problems: readonly string[];
}

/** Which schema row a JSON path like "[3].name", "maps[3].rows[2]" or "name" points into. */
export function rowTargetForPath(input: CheckInput, file: string, path: string): IssueTarget {
  for (const schema of input.schemas) {
    if (schema.file !== file) continue;
    const data = input.files.get(file);
    const shape = fileShape(data, schema.table, schema.idField);
    const rows = rowsOf(data, schema.table, schema.idField);
    if (!rows) continue;
    if (shape === 'single') {
      const id = idOf(data, schema.idField) as string;
      const field = /^([^.[]+)/.exec(path)?.[1];
      return { kind: 'row', file, table: schema.table, id, field };
    }
    const prefix = shape === 'array' ? '' : schema.table;
    const m = new RegExp(
      `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[(\\d+)\\]\\.?([^.[]*)`,
    ).exec(path);
    if (!m) continue;
    const row = rows[Number(m[1])];
    const id = idOf(row, schema.idField);
    if (id === undefined) return { kind: 'file', file };
    return { kind: 'row', file, table: schema.table, id, field: m[2] || undefined };
  }
  return { kind: 'file', file };
}

function forbiddenIssues(input: CheckInput): Issue[] {
  const out: Issue[] = [];
  for (const [file, data] of input.files) {
    for (const hit of scanValue(data)) {
      out.push({
        severity: 'error',
        rule: 'forbidden',
        message: fmt(T.checks.forbiddenChar, {
          path: `${file} ${hit.path}`,
          code: hit.codePoint.toString(16).toUpperCase().padStart(4, '0'),
          snippet: hit.snippet,
        }),
        target: rowTargetForPath(input, file, hit.path),
      });
    }
  }
  return out;
}

interface SchemaRows {
  schema: TableSchema;
  rows: Row[];
}

function schemaRows(input: CheckInput): SchemaRows[] {
  const out: SchemaRows[] = [];
  for (const schema of input.schemas) {
    const rows = rowsOf(input.files.get(schema.file), schema.table, schema.idField);
    if (rows) out.push({ schema, rows });
  }
  return out;
}

/** Ids per table across every schema file, for ref fields. */
function refIndex(all: readonly SchemaRows[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const { schema, rows } of all) {
    let set = out.get(schema.table);
    if (!set) {
      set = new Set();
      out.set(schema.table, set);
    }
    for (const r of rows) {
      const id = idOf(r, schema.idField);
      if (id !== undefined) set.add(id);
    }
  }
  return out;
}

function rowTarget(
  schema: TableSchema,
  id: string | undefined,
  index: number,
  field?: string,
): IssueTarget {
  return {
    kind: 'row',
    file: schema.file,
    table: schema.table,
    id: id ?? `#${index + 1}`,
    field,
  };
}

function fieldIssues(all: readonly SchemaRows[], refs: Map<string, Set<string>>): Issue[] {
  const out: Issue[] = [];
  for (const { schema, rows } of all) {
    const labelOf = (key: string) => schema.fields.find((f) => f.key === key)?.label ?? key;
    for (const p of validateRows(schema, rows, (t) => refs.get(t))) {
      const empty = p.code === 'required' || p.code === 'id_missing';
      out.push({
        severity: 'error',
        rule: empty ? 'empty' : 'field',
        message: empty
          ? fmt(T.checks.emptyRequired, { field: labelOf(p.field) })
          : `${labelOf(p.field)}：${p.message}`,
        target: rowTarget(schema, p.id, p.index, p.field),
      });
    }
    rows.forEach((row, index) => {
      const id = idOf(row, schema.idField);
      for (const f of schema.fields) {
        if (f.required) continue;
        const v = row[f.key];
        if (typeof v === 'string' && v.trim() === '') {
          out.push({
            severity: 'info',
            rule: 'empty',
            message: fmt(T.checks.emptyOptional, { field: f.label }),
            target: rowTarget(schema, id, index, f.key),
          });
        }
      }
    });
  }
  return out;
}

function idIssues(all: readonly SchemaRows[]): Issue[] {
  const out: Issue[] = [];
  for (const { schema, rows } of all) {
    rows.forEach((row, index) => {
      const id = idOf(row, schema.idField);
      if (id !== undefined && id !== '' && !isValidId(id)) {
        out.push({
          severity: 'warning',
          rule: 'id',
          message: fmt(T.checks.badId, { what: schema.label, id }),
          target: rowTarget(schema, id, index, schema.idField),
        });
      }
      if (schema.table !== 'maps' || !isMapLike(row)) return;
      const lists = [
        [T.mapCheck.whatLocation, row.locations],
        [T.mapCheck.whatSpawn, row.spawns],
        [T.mapCheck.whatExit, row.exits],
      ] as const;
      for (const [what, list] of lists) {
        for (const obj of list) {
          if (typeof obj.id === 'string' && !isValidId(obj.id)) {
            out.push({
              severity: 'warning',
              rule: 'id',
              message: fmt(T.checks.badId, { what, id: obj.id }),
              target: { kind: 'map', file: schema.file, mapId: row.id, x: obj.x, y: obj.y },
            });
          }
        }
      }
    });
  }
  return out;
}

function mapIssues(all: readonly SchemaRows[]): Issue[] {
  const maps: { file: string; map: MapDef }[] = [];
  for (const { schema, rows } of all) {
    if (schema.table !== 'maps') continue;
    for (const r of rows) if (isMapLike(r)) maps.push({ file: schema.file, map: r });
  }
  const allMaps = maps.map((m) => m.map);
  const out: Issue[] = [];
  for (const { file, map } of maps) {
    for (const issue of checkMap(map, allMaps)) {
      out.push({
        severity: issue.severity,
        rule: issue.rule === 'exit_ref' ? 'map_ref' : 'map',
        message: `${map.id}：${issue.message}`,
        target: { kind: 'map', file, mapId: map.id, x: issue.x, y: issue.y },
      });
    }
  }
  return out;
}

/**
 * A free-text validateContent problem has no structured location. Link it to the first
 * word that is a known row id (for example "map testfield: ..."), if any.
 */
export function guessTarget(message: string, all: readonly SchemaRows[]): IssueTarget {
  const tokens = message.split(/[\s:,'"()<>=!]+/).filter((t) => t.length > 0);
  for (const token of tokens) {
    for (const { schema, rows } of all) {
      const row = rows.find((r) => idOf(r, schema.idField) === token);
      if (!row) continue;
      if (schema.table === 'maps') return { kind: 'map', file: schema.file, mapId: token };
      return { kind: 'row', file: schema.file, table: schema.table, id: token };
    }
  }
  return { kind: 'none' };
}

export function runChecks(input: CheckInput): Issue[] {
  const all = schemaRows(input);
  const refs = refIndex(all);
  const issues: Issue[] = [
    ...input.problems.map(
      (message): Issue => ({
        severity: 'error',
        rule: 'validate',
        message,
        target: guessTarget(message, all),
      }),
    ),
    ...forbiddenIssues(input),
    ...mapIssues(all),
    ...idIssues(all),
    ...fieldIssues(all, refs),
  ];
  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return issues
    .map((issue, i) => ({ issue, i }))
    .sort((a, b) => rank[a.issue.severity] - rank[b.issue.severity] || a.i - b.i)
    .map((x) => x.issue);
}

export const RULE_LABELS: Record<RuleId, string> = {
  validate: T.checks.ruleValidate,
  forbidden: T.checks.ruleForbidden,
  map_ref: T.checks.ruleMapRef,
  map: T.checks.ruleMap,
  id: T.checks.ruleId,
  empty: T.checks.ruleEmpty,
  field: T.checks.ruleField,
};
