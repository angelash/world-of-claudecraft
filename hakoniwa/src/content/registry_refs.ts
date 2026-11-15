// Every world-state variable the content reads or writes, with where it sits
// (world_state_registry.md 9.3 rule 1): conditions, effect keys, door keys and door
// effects, requiresFlags, endOnFlag, pacifiedBy, removeOnFlag, storeAs, from, trustKey,
// evidenceFlags, revealWhen, hideWhen, the goddess gaze and yield flags, the director
// menu writes and the companion bond flags. Pure: walks a ContentMap, no world.

import type { ContentMap, FlagValue } from '../core/contracts';
import { actIndex, checkCondition, comparisons } from '../systems/quests/conditions';

export interface FlagUse {
  /** the name as written */
  name: string;
  kind: 'read' | 'write';
  /** the field or effect type it comes from */
  via: string;
  /** content table and the row's id */
  table: string;
  row: string;
  /** JSON path inside the table */
  path: string;
  /** act of the containing content (quest, scene, door, act), null when it has none */
  act: number | null;
  /** literal written by a flag effect, a door flag effect or a menu item */
  value?: FlagValue;
  /** how a write changes the value */
  op?: 'set' | 'add' | 'append' | 'copy' | 'store' | 'typed';
  /** the condition text a read comes from */
  expr?: string;
  /** the comparison of a condition read: operator ('truthy' for a bare test) and literals */
  cmp?: { op: string; literals: FlagValue[] };
}

export interface ConditionUse {
  expr: string;
  via: string;
  table: string;
  row: string;
  path: string;
  act: number | null;
}

/** String fields holding a condition expression. */
export const CONDITION_FIELDS = new Set([
  'when',
  'trigger',
  'orWhen',
  'unlock',
  'requires',
  'revealWhen',
  'condition',
  'actsWhen',
  'appearsWhen',
  'bonus',
]);

/** String fields naming one flag the kernel reads. */
const READ_NAME_FIELDS = new Set(['endOnFlag', 'pacifiedBy', 'removeOnFlag', 'from']);
/** String fields naming one flag the kernel writes. */
const WRITE_NAME_FIELDS = new Set(['storeAs', 'gazeFlag', 'yieldFlag', 'trustKey']);
/** Arrays of flag names the kernel reads. */
const READ_LIST_FIELDS = new Set(['requiresFlags', 'evidenceFlags']);
/** Arrays of conditions (persona hideWhen). */
const CONDITION_LIST_FIELDS = new Set(['hideWhen']);

/** Effect types whose `key` is written by the content itself. */
const RAW_WRITES: Record<string, FlagUse['op']> = {
  flag: 'set',
  add: 'add',
  append: 'append',
  copy: 'copy',
};

function fmt(path: (string | number)[]): string {
  let out = '';
  for (const p of path) out += typeof p === 'number' ? `[${p}]` : out ? `.${p}` : p;
  return out;
}

function actOfRow(row: unknown): number | null {
  if (!row || typeof row !== 'object') return null;
  const o = row as { act?: unknown; index?: unknown; id?: unknown };
  if (typeof o.act === 'number') return o.act;
  if (typeof o.act === 'string') {
    const n = actIndex(o.act);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

interface Ctx {
  table: string;
  row: string;
  act: number | null;
  /** inside door keys or reveal keys (flag keys are reads there) */
  keys: boolean;
  /** inside quest objectives (their type names are not effects) */
  objective: boolean;
}

/** Walk every table of the content and list its flag reads and writes and its conditions. */
export function collectFlagUses(content: ContentMap): {
  uses: FlagUse[];
  conditions: ConditionUse[];
} {
  const uses: FlagUse[] = [];
  const conditions: ConditionUse[] = [];
  const tables = content as unknown as Record<string, unknown>;
  const condition = (expr: string, via: string, ctx: Ctx, path: (string | number)[]) => {
    conditions.push({ expr, via, table: ctx.table, row: ctx.row, path: fmt(path), act: ctx.act });
    if (checkCondition(expr) !== null) return;
    for (const c of comparisons(expr)) {
      uses.push({
        name: c.name,
        kind: 'read',
        via,
        table: ctx.table,
        row: ctx.row,
        path: fmt(path),
        act: ctx.act,
        expr,
        cmp: { op: c.op, literals: c.literals },
      });
    }
  };
  const visit = (v: unknown, path: (string | number)[], ctx: Ctx): void => {
    if (Array.isArray(v)) {
      v.forEach((x, i) => {
        visit(x, [...path, i], ctx);
      });
      return;
    }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    const at = (via: string, extra: Partial<FlagUse>, name: string): FlagUse => ({
      name,
      kind: 'read',
      via,
      table: ctx.table,
      row: ctx.row,
      path: fmt(path),
      act: ctx.act,
      ...extra,
    });
    const type = typeof o.type === 'string' ? o.type : undefined;
    if (type && !ctx.objective) {
      if (ctx.keys && type === 'flag' && typeof o.key === 'string') {
        uses.push(at('door key', {}, o.key));
      } else if (type in RAW_WRITES && typeof o.key === 'string') {
        const value = o.value;
        uses.push(
          at(
            type,
            {
              kind: 'write',
              op: RAW_WRITES[type],
              value:
                typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
                  ? value
                  : undefined,
            },
            o.key,
          ),
        );
      } else if (type === 'feature' && typeof o.feature === 'string') {
        uses.push(
          at('feature', { kind: 'write', op: 'typed', value: true }, `feature.${o.feature}`),
        );
      } else if (type === 'companion' && typeof o.id === 'string') {
        uses.push(
          at(
            'companion',
            { kind: 'write', op: 'typed', value: true },
            `companion.${o.id}.recruited`,
          ),
        );
      } else if (type === 'wave' && typeof o.wave === 'string') {
        uses.push(at('wave', { kind: 'write', op: 'typed', value: 'go' }, `combat.wave.${o.wave}`));
      }
    }
    for (const [k, x] of Object.entries(o)) {
      const p = [...path, k];
      if (typeof x === 'string' && CONDITION_FIELDS.has(k)) {
        condition(x, k, ctx, p);
      } else if (typeof x === 'string' && READ_NAME_FIELDS.has(k)) {
        if (k === 'from' && type !== 'copy' && type !== 'name') continue;
        uses.push(at(k, { path: fmt(p) }, x));
      } else if (typeof x === 'string' && WRITE_NAME_FIELDS.has(k)) {
        uses.push(
          at(k, { kind: 'write', op: k === 'trustKey' ? 'typed' : 'store', path: fmt(p) }, x),
        );
      } else if (Array.isArray(x) && READ_LIST_FIELDS.has(k)) {
        x.forEach((name, i) => {
          if (typeof name === 'string') uses.push(at(k, { path: fmt([...p, i]) }, name));
        });
      } else if (Array.isArray(x) && CONDITION_LIST_FIELDS.has(k)) {
        x.forEach((expr, i) => {
          if (typeof expr === 'string') condition(expr, k, ctx, [...p, i]);
        });
      } else if (k === 'flag' && typeof x === 'string' && type === undefined) {
        // companion bond flags: { flag, equals?, amount }
        uses.push(at('bondFlag', { path: fmt(p), value: undefined }, x));
        if (
          typeof o.equals === 'string' ||
          typeof o.equals === 'number' ||
          typeof o.equals === 'boolean'
        ) {
          const lit = o.equals;
          uses.push(at('bondFlag.equals', { path: fmt([...path, 'equals']), value: lit }, x));
        }
      } else if (
        k === 'flag' &&
        x &&
        typeof x === 'object' &&
        typeof (x as { key?: unknown }).key === 'string'
      ) {
        // director menu items: { flag: { key, value } }
        const f = x as { key: string; value?: unknown };
        const value =
          typeof f.value === 'string' || typeof f.value === 'number' || typeof f.value === 'boolean'
            ? f.value
            : undefined;
        uses.push(at('menu flag', { kind: 'write', op: 'set', value, path: fmt(p) }, f.key));
      } else if (k === 'unlock' && x && typeof x === 'object' && !Array.isArray(x)) {
        // building unlocks: { flags: [...] }
        const flags = (x as { flags?: unknown }).flags;
        if (Array.isArray(flags))
          flags.forEach((name, i) => {
            if (typeof name === 'string')
              uses.push(at('unlock.flags', { path: fmt([...p, 'flags', i]) }, name));
          });
        visit(x, p, ctx);
      } else {
        visit(x, p, {
          ...ctx,
          keys: ctx.keys || (ctx.table === 'doors' && (k === 'keys' || k === 'reveal')),
          objective: ctx.objective || k === 'objectives',
        });
      }
    }
  };
  for (const [table, value] of Object.entries(tables)) {
    if (table === 'registry') continue;
    if (Array.isArray(value)) {
      value.forEach((row, i) => {
        const id = (row as { id?: unknown })?.id;
        const actNo =
          table === 'acts' && typeof (row as { index?: unknown }).index === 'number'
            ? ((row as { index: number }).index as number)
            : actOfRow(row);
        visit(row, [i], {
          table,
          row: typeof id === 'string' ? id : String(i),
          act: actNo,
          keys: false,
          objective: false,
        });
      });
    } else if (value && typeof value === 'object') {
      visit(value, [], { table, row: '', act: null, keys: false, objective: false });
    }
  }
  return { uses, conditions };
}
