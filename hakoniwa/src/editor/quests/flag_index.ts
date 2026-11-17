// Flag write and read index (static analysis, no world needed): every place in data/**
// and in system source code that writes or reads a world flag. Data writes come from
// the narrative effect vocabulary (systems/quests/effect_types.ts); code writes from
// setFlag(...) calls and flag.set dispatches; templated keys become patterns with '*'
// (`boss.${id}.defeated` -> boss.*.defeated). Pure: source texts are passed in.

import type { FlagValue } from '../../core/contracts';
import { checkCondition, referencedVars } from '../../systems/quests';
import { flagEntryName } from '../../systems/world';

export interface FlagRef {
  /** exact key, or a pattern where '*' stands for a templated part; '*' alone = dynamic */
  key: string;
  kind: 'write' | 'read';
  origin: 'data' | 'code';
  /** path under data/ or under the source root */
  file: string;
  /** JSON path or "line N" */
  where: string;
  /** effect type, setFlag, flag.set, a condition field name, requiresFlags, ... */
  via: string;
  /** literal value written, when known */
  value?: FlagValue;
  /** a data write inside a quest definition: the quest id (gated by that quest) */
  quest?: string;
  /** a data write inside a quest: the stage index it belongs to (-1: onStart, stages.length: rewards) */
  stage?: number;
}

export const CONDITION_FIELDS = new Set([
  'when',
  'trigger',
  'orWhen',
  'unlock',
  'requires',
  'revealWhen',
  'condition',
  // goddess persona cards: her gates and her court seat's crisis bonus
  'actsWhen',
  'appearsWhen',
  'bonus',
  // map switch tile areas (systems/world/switches.ts)
  'openWhen',
  // act clock night rules and dispute default steps (systems/quests): the drop condition
  'unless',
]);

/** Data fields that name a flag the kernel writes (goddess gaze alias, a court seat's yield). */
export const WRITE_FIELDS = new Set(['gazeFlag', 'yieldFlag']);

/** Keys written by an effect object, per systems/quests/effect_types.ts. */
export function effectWrites(e: Record<string, unknown>): { key: string; value?: FlagValue }[] {
  const s = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  switch (e.type) {
    case 'flag': {
      const key = s(e.key);
      const v = e.value;
      const value =
        typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : undefined;
      return key ? [{ key, value }] : [];
    }
    case 'add':
    case 'append':
    case 'copy': {
      const key = s(e.key);
      return key ? [{ key }] : [];
    }
    case 'feature':
      return s(e.feature) ? [{ key: `feature.${e.feature}`, value: true }] : [];
    case 'companion':
      return s(e.id) ? [{ key: `companion.${e.id}.recruited`, value: true }] : [];
    case 'wave':
      return s(e.wave) ? [{ key: `combat.wave.${e.wave}`, value: 'go' }] : [];
    case 'war':
      return s(e.scenario) ? [{ key: 'war.pending', value: e.scenario as string }] : [];
    case 'scene':
      return s(e.scene) ? [{ key: 'scene.pending', value: e.scene as string }] : [];
    case 'act':
      return s(e.act) ? [{ key: 'act', value: e.act as string }] : [];
    case 'quest':
      return s(e.quest) ? [{ key: `quest.${e.quest}`, value: 'active' }] : [];
    default:
      return [];
  }
}

/** Variables a condition reads, or null when it does not parse. */
export function conditionVars(expr: string): string[] | null {
  if (checkCondition(expr) !== null) return null;
  return referencedVars(expr);
}

/** Quest-scoped location of a JSON path inside quests.json: quest id and stage index. */
function questScope(
  file: string,
  data: unknown,
  path: (string | number)[],
): { quest?: string; stage?: number } {
  if (!file.endsWith('quests/quests.json') || !Array.isArray(data)) return {};
  const qi = path[0];
  if (typeof qi !== 'number') return {};
  const q = data[qi] as { id?: unknown; stages?: unknown[] } | undefined;
  if (!q || typeof q.id !== 'string') return {};
  const stages = Array.isArray(q.stages) ? q.stages.length : 0;
  if (path[1] === 'onStart') return { quest: q.id, stage: -1 };
  if (path[1] === 'rewards') return { quest: q.id, stage: stages };
  if (path[1] === 'stages' && typeof path[2] === 'number') return { quest: q.id, stage: path[2] };
  return { quest: q.id };
}

function fmtPath(path: (string | number)[]): string {
  let out = '';
  for (const p of path) out += typeof p === 'number' ? `[${p}]` : out ? `.${p}` : p;
  return out;
}

/** Writes and reads in one data file. */
export function indexData(file: string, data: unknown): FlagRef[] {
  const out: FlagRef[] = [];
  const visit = (v: unknown, path: (string | number)[]) => {
    if (Array.isArray(v)) {
      v.forEach((x, i) => {
        visit(x, [...path, i]);
      });
      return;
    }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    const where = fmtPath(path);
    // Objectives reuse some effect type names ({ type: 'scene' }); they are not writes.
    const oi = path.lastIndexOf('objectives');
    const isObjective = oi >= 0 && path.length === oi + 2;
    if (typeof o.type === 'string' && !isObjective) {
      for (const w of effectWrites(o)) {
        out.push({
          key: w.key,
          kind: 'write',
          origin: 'data',
          file,
          where,
          via: o.type,
          value: w.value,
          ...questScope(file, data, path),
        });
      }
      if (o.type === 'copy' && typeof o.from === 'string') {
        out.push({
          key: o.from,
          kind: 'read',
          origin: 'data',
          file,
          where,
          via: 'copy',
          ...questScope(file, data, path),
        });
      }
      if (o.type === 'name' && typeof o.from === 'string') {
        out.push({ key: o.from, kind: 'read', origin: 'data', file, where, via: 'name' });
      }
    }
    for (const [k, x] of Object.entries(o)) {
      if (typeof x === 'string' && CONDITION_FIELDS.has(k)) {
        for (const name of conditionVars(x) ?? []) {
          out.push({
            key: name,
            kind: 'read',
            origin: 'data',
            file,
            where: `${where}.${k}`,
            via: k,
            ...questScope(file, data, path),
          });
        }
      } else if (k === 'requiresFlags' && Array.isArray(x)) {
        for (const entry of x) {
          if (typeof entry === 'string') {
            // a negated entry of a map spawn point (`!name`) reads the flag `name`
            const key = path.includes('spawns') ? flagEntryName(entry) : entry;
            out.push({ key, kind: 'read', origin: 'data', file, where: `${where}.${k}`, via: k });
          }
        }
      } else if (k === 'flag' && typeof x === 'string' && o.type === undefined) {
        out.push({ key: x, kind: 'read', origin: 'data', file, where: `${where}.${k}`, via: k });
      } else if (WRITE_FIELDS.has(k) && typeof x === 'string' && x) {
        out.push({ key: x, kind: 'write', origin: 'data', file, where: `${where}.${k}`, via: k });
      } else if (k === 'storeAs' && typeof x === 'string' && x) {
        // scene input and choice nodes store the answer in a flag (scenes/runner.ts)
        out.push({ key: x, kind: 'write', origin: 'data', file, where: `${where}.${k}`, via: k });
      } else if (
        k === 'flag' &&
        x &&
        typeof x === 'object' &&
        typeof (x as { key?: unknown }).key === 'string'
      ) {
        // { "flag": { "key": ..., "value": ... } } items (director menu)
        const f = x as { key: string; value?: unknown };
        const value =
          typeof f.value === 'string' || typeof f.value === 'number' || typeof f.value === 'boolean'
            ? f.value
            : undefined;
        out.push({
          key: f.key,
          kind: 'write',
          origin: 'data',
          file,
          where: `${where}.${k}`,
          via: k,
          value,
        });
      } else {
        visit(x, [...path, k]);
      }
    }
  };
  visit(data, []);
  return out;
}

/** Blank out comments, keeping line numbers. */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

/** A string literal's text as a key pattern: template parts become '*'. */
function literalKey(quote: string, body: string): string {
  return quote === '`' ? body.replace(/\$\{[^}]*\}/g, '*') : body;
}

const LIT = String.raw`(['"\x60])((?:\\.|(?!\1)[^\\\n])*)\1`;
const WRITE_LITERAL = new RegExp(String.raw`\bsetFlag\(\s*(?:ctx\s*,\s*)?${LIT}`, 'g');
const WRITE_VARIABLE = /\bsetFlag\(\s*(?:ctx\s*,\s*)?([A-Za-z_$][\w.$]*)\s*[,)]/g;
const FLAG_SET = new RegExp(String.raw`'flag\.set'\s*,\s*\{\s*key:\s*${LIT}`, 'g');
const READ_CALL = new RegExp(String.raw`\.flag\(\s*${LIT}`, 'g');
const READ_INDEX = new RegExp(String.raw`flags\[\s*${LIT}\s*\]`, 'g');
const READ_FN = new RegExp(String.raw`\bflag\(\s*(?:[\w.]+\s*,\s*)${LIT}`, 'g');

function lineOf(src: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
}

/** Writes (setFlag, flag.set) and reads (ctx.flag, flags['x']) in one source file. */
export function indexCode(file: string, source: string): FlagRef[] {
  const src = stripComments(source);
  const out: FlagRef[] = [];
  const push = (key: string, kind: FlagRef['kind'], via: string, index: number) => {
    out.push({ key, kind, origin: 'code', file, where: `line ${lineOf(src, index)}`, via });
  };
  for (const m of src.matchAll(WRITE_LITERAL)) {
    push(literalKey(m[1] as string, m[2] as string), 'write', 'setFlag', m.index ?? 0);
  }
  for (const m of src.matchAll(WRITE_VARIABLE)) {
    const name = m[1] as string;
    if (name === 'ctx' || name === 'world') continue;
    push('*', 'write', `setFlag(${name})`, m.index ?? 0);
  }
  for (const m of src.matchAll(FLAG_SET)) {
    push(literalKey(m[1] as string, m[2] as string), 'write', 'flag.set', m.index ?? 0);
  }
  for (const re of [READ_CALL, READ_INDEX, READ_FN]) {
    for (const m of src.matchAll(re)) {
      push(literalKey(m[1] as string, m[2] as string), 'read', 'flag', m.index ?? 0);
    }
  }
  // Computed flag sets: `out.key = ...` / `out['key'] = ...` on an object whose keys are
  // later written in a loop (`for (const k of Object.keys(out)) ctx.setFlag(k, ...)`).
  if (out.some((r) => r.kind === 'write' && isDynamic(r.key))) {
    const bags = new Set<string>();
    for (const m of src.matchAll(/Object\.(?:keys|entries)\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
      bags.add(m[1] as string);
    }
    for (const bag of bags) {
      const dot = new RegExp(String.raw`\b${bag}\.([A-Za-z_$][\w$]*)\s*=(?!=)`, 'g');
      for (const m of src.matchAll(dot)) push(m[1] as string, 'write', 'computed', m.index ?? 0);
      const idx = new RegExp(String.raw`\b${bag}\[\s*${LIT}\s*\]\s*=(?!=)`, 'g');
      for (const m of src.matchAll(idx)) {
        push(literalKey(m[1] as string, m[2] as string), 'write', 'computed', m.index ?? 0);
      }
    }
  }
  return out;
}

export function isPattern(key: string): boolean {
  return key.includes('*');
}

export function isDynamic(key: string): boolean {
  return /^\*+$/.test(key);
}

/** Does a write key (exact or pattern) cover a concrete key? Dynamic writes cover nothing. */
export function keyMatches(writeKey: string, key: string): boolean {
  if (writeKey === key) return true;
  if (!isPattern(writeKey) || isDynamic(writeKey)) return false;
  const re = new RegExp(
    `^${writeKey
      .split('*')
      .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.+')}$`,
  );
  return re.test(key);
}

/** Index every data file and source file. */
export function buildFlagIndex(
  dataFiles: ReadonlyMap<string, unknown>,
  sources: Readonly<Record<string, string>>,
): FlagRef[] {
  const out: FlagRef[] = [];
  for (const [file, data] of dataFiles) out.push(...indexData(file, data));
  for (const [file, text] of Object.entries(sources)) out.push(...indexCode(file, text));
  return out;
}
