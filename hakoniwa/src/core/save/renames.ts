// The content ID rename table (release_engineering.md 5.5 and 7.6): data/registry/renames.json
// lists every renamed or removed id since saves began, each entry tagged with the rename
// version that registered it (`since`). Loading a save whose `renameVersion` is lower
// applies the newer entries to the flag names and values in `world.meta.flags`, to the ids
// in the slices their systems declare (`idFields`), and to the flag keys of the recent-event
// ring. Code that reads `world.meta.flags` directly never goes through alias resolution, so
// the keys themselves are rewritten.
//
// Entry kinds:
// - `flag`: a flag name rename, exact or a pattern whose `<slot>` placeholders capture name
//   segments (or parts of one) and fill the slots of `to` in order; `scale` and `offset`
//   convert a numeric value (new = old * scale + offset).
// - `flag_value`: an enum value spelling of one flag, or of a family written `prefix.*`.
// - any other kind (`quest`, `npc`, `faction`, `item`, `ability`, ...): a content id renamed
//   (`to`) or removed (`removed`, with an optional `refund` folded into money). Renamed ids
//   are also replaced where they stand as whole segments of a flag name.
// A flag rename only lands on a name the variable registry lists under that exact spelling
// (FlagNames), and it takes the shortest rewrite that does, trying exact entries, then id
// segments, then patterns in table order: the same answer the registry's own resolver gives
// for every alias it lists (tests/save_renames.test.ts holds the two together). Renamed
// names never come back as live names, so applying a table twice changes nothing.

import renamesJson from '../../../data/registry/renames.json';
import type { FlagValue } from '../contracts';
import type { World } from '../world';

export interface FlagRename {
  since: number;
  kind: 'flag';
  from: string;
  to: string;
  scale?: number;
  offset?: number;
}

export interface FlagValueRename {
  since: number;
  kind: 'flag_value';
  /** a flag name, or `prefix.*` for every flag under `prefix.` */
  flag: string;
  from: string;
  to: FlagValue;
}

export interface IdRename {
  since: number;
  /** quest, npc, faction, item, ability, door, ... */
  kind: string;
  from: string;
  to?: string;
  removed?: boolean;
  /** compensation for a removed id, per unit held */
  refund?: { copper: number };
}

export type RenameEntry = FlagRename | FlagValueRename | IdRename;

export interface RenameTable {
  version: number;
  entries: RenameEntry[];
}

/** The shipped table and its version (the `renameVersion` this build writes). */
export const RENAMES: RenameTable = renamesJson as unknown as RenameTable;
export const RENAME_VERSION: number = RENAMES.version;

/** Names a flag rename may produce: the variable registry fits (FlagRegistry.isCanonical). */
export interface FlagNames {
  isCanonical(name: string): boolean;
}

/**
 * Where a slice holds content ids (5.5 `idFields`), as a path relative to the slice:
 * segments separated by dots, `*` for every element of an array or value of an object,
 * and a final `@keys` for the keys of an object. A removed id is deleted (the array element,
 * the key, or the property holding it); with `refund` set, `copper * count` is added to the
 * number named `money` on the object that holds the id's container (the count is the value
 * under a removed key when it is a number, else 1). When a renamed key meets a key already
 * under the new name, `merge: 'sum'` adds two numbers (counts); otherwise the entry already
 * there is kept.
 */
export interface IdField {
  path: string;
  kind: string;
  refund?: { money: string };
  merge?: 'sum' | 'keep';
}

export interface RemovedId {
  kind: string;
  id: string;
  /** where it was: `meta.flags` or `slices.<slice>.<path>` */
  at: string;
  count: number;
  /** copper added to the holder's money */
  refunded: number;
}

export interface RenameReport {
  /** the table version applied from and to */
  from: number;
  to: number;
  flags: number;
  values: number;
  ids: number;
  removed: RemovedId[];
  /** renamed flags dropped because the new name was already set (the set value is kept) */
  conflicts: string[];
}

// ---------------------------------------------------------------------------
// Checking a table

const isInt = (v: unknown, min = 0): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min;
const isName = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 128;
const isFlagValue = (v: unknown): v is FlagValue =>
  typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));
const slotCount = (s: string): number => (s.match(/<[^<>]+>/g) ?? []).length;

/** Shape and consistency problems of a rename table; empty when it is sound. */
export function checkRenameTable(t: unknown): string[] {
  const out: string[] = [];
  const table = t as RenameTable;
  if (typeof t !== 'object' || t === null || !isInt(table.version)) return ['bad version'];
  if (!Array.isArray(table.entries)) return ['entries is not an array'];
  const seen = new Set<string>();
  const froms = new Map<string, Set<string>>();
  const tos: { kind: string; to: string; at: number }[] = [];
  table.entries.forEach((e, i) => {
    const at = `entry ${i}`;
    if (typeof e !== 'object' || e === null) {
      out.push(`${at}: not an object`);
      return;
    }
    if (!isInt(e.since, 1) || e.since > table.version) {
      out.push(`${at}: since must be 1 to ${table.version}`);
    }
    if (!isName(e.kind)) {
      out.push(`${at}: bad kind`);
      return;
    }
    if (e.kind === 'flag_value') {
      const v = e as FlagValueRename;
      if (!isName(v.flag) || typeof v.from !== 'string' || !isFlagValue(v.to)) {
        out.push(`${at}: flag_value needs flag, from and to`);
        return;
      }
      const key = `flag_value ${v.flag} ${v.from}`;
      if (seen.has(key)) out.push(`${at}: duplicate ${key}`);
      seen.add(key);
      if (typeof v.to === 'string') tos.push({ kind: `flag_value ${v.flag}`, to: v.to, at: i });
      let vf = froms.get(`flag_value ${v.flag}`);
      if (!vf) {
        vf = new Set();
        froms.set(`flag_value ${v.flag}`, vf);
      }
      vf.add(v.from);
      return;
    }
    const r = e as FlagRename & IdRename;
    if (!isName(r.from)) {
      out.push(`${at}: bad from`);
      return;
    }
    // A pattern may stand twice with different targets (the first that lands wins).
    const key =
      r.kind === 'flag' && r.from.includes('<') ? `flag ${r.from} ${r.to}` : `${r.kind} ${r.from}`;
    if (seen.has(key)) out.push(`${at}: duplicate ${key}`);
    seen.add(key);
    let kindFroms = froms.get(r.kind);
    if (!kindFroms) {
      kindFroms = new Set();
      froms.set(r.kind, kindFroms);
    }
    kindFroms.add(r.from);
    if (r.kind === 'flag') {
      if (!isName(r.to)) out.push(`${at}: flag needs to`);
      else if (slotCount(r.to) > slotCount(r.from)) out.push(`${at}: to has unfilled slots`);
      for (const f of ['scale', 'offset'] as const) {
        if (r[f] !== undefined && !(typeof r[f] === 'number' && Number.isFinite(r[f]))) {
          out.push(`${at}: bad ${f}`);
        }
      }
      if (isName(r.to) && !r.from.includes('<')) tos.push({ kind: 'flag', to: r.to, at: i });
      return;
    }
    if (r.removed === true) {
      if (r.to !== undefined) out.push(`${at}: removed and renamed`);
      if (r.refund !== undefined && !(typeof r.refund === 'object' && isInt(r.refund?.copper))) {
        out.push(`${at}: bad refund`);
      }
    } else if (!isName(r.to)) {
      out.push(`${at}: needs to or removed`);
    } else {
      if (r.refund !== undefined) out.push(`${at}: refund without removed`);
      tos.push({ kind: r.kind, to: r.to, at: i });
    }
  });
  // An old id never comes back as a new one: no chains, no cycles, idempotent.
  for (const t2 of tos) {
    if (froms.get(t2.kind)?.has(t2.to))
      out.push(`entry ${t2.at}: ${t2.kind} ${t2.to} is renamed again`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The compiled table

interface Pattern {
  re: RegExp;
  to: string;
  scale: number;
  offset: number;
}

interface FlagStep {
  name: string;
  scale: number;
  offset: number;
}

const SEGMENT = '([A-Za-z0-9_-]+)';
/** Rewrites tried before giving up on a name (an alias of an alias of a renamed id). */
const MAX_DEPTH = 3;

function escapeRe(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\*]/g, '\\$&');
}

function patternRe(pattern: string): RegExp {
  return new RegExp(
    `^${pattern
      .split(/<[^<>]+>/)
      .map(escapeRe)
      .join(SEGMENT)}$`,
  );
}

function fill(target: string, keys: readonly string[]): string {
  let i = 0;
  return target.replace(/<[^<>]+>/g, () => keys[i++] ?? '');
}

export type IdOutcome = { to: string } | { removed: true; refund?: { copper: number } };

/** The entries of a table newer than a save's rename version, ready to apply. */
export class RenameSet {
  readonly from: number;
  readonly to: number;
  private readonly exact = new Map<string, FlagStep>();
  private readonly patterns: Pattern[] = [];
  private readonly ids = new Map<string, Map<string, IdRename>>();
  /** renamed ids by old id, every kind (for flag-name segments) */
  private readonly segments = new Map<string, string[]>();
  /** removed ids, every kind (flags naming one are dropped) */
  private readonly removedIds = new Set<string>();
  private readonly values = new Map<string, Map<string, FlagValue>>();
  private readonly starValues: { prefix: string; table: Map<string, FlagValue> }[] = [];
  private readonly cache = new Map<string, FlagStep | null>();

  constructor(
    table: RenameTable,
    fromVersion: number,
    private readonly names: FlagNames,
  ) {
    this.from = fromVersion;
    this.to = table.version;
    for (const e of table.entries) {
      if (e.since <= fromVersion) continue;
      if (e.kind === 'flag') {
        const f = e as FlagRename;
        const step = { name: f.to, scale: f.scale ?? 1, offset: f.offset ?? 0 };
        if (f.from.includes('<'))
          this.patterns.push({ re: patternRe(f.from), to: f.to, ...pick(step) });
        else if (!this.exact.has(f.from)) this.exact.set(f.from, step);
      } else if (e.kind === 'flag_value') {
        const v = e as FlagValueRename;
        if (v.flag.endsWith('.*')) {
          const prefix = v.flag.slice(0, -1);
          let star = this.starValues.find((s) => s.prefix === prefix);
          if (!star) {
            star = { prefix, table: new Map() };
            this.starValues.push(star);
          }
          star.table.set(v.from, v.to);
        } else {
          let m = this.values.get(v.flag);
          if (!m) {
            m = new Map();
            this.values.set(v.flag, m);
          }
          m.set(v.from, v.to);
        }
      } else {
        const r = e as IdRename;
        let m = this.ids.get(r.kind);
        if (!m) {
          m = new Map();
          this.ids.set(r.kind, m);
        }
        m.set(r.from, r);
        if (r.removed === true) this.removedIds.add(r.from);
        else if (r.to !== undefined) {
          const list = this.segments.get(r.from) ?? [];
          list.push(r.to);
          this.segments.set(r.from, list);
        }
      }
    }
  }

  /** Nothing to apply. */
  get empty(): boolean {
    return (
      this.exact.size === 0 &&
      this.patterns.length === 0 &&
      this.ids.size === 0 &&
      this.values.size === 0 &&
      this.starValues.length === 0
    );
  }

  /** The new name of a flag (with its value conversion), or null when it keeps its name. */
  renameFlag(name: string): FlagStep | null {
    const hit = this.cache.get(name);
    if (hit !== undefined) return hit;
    const out = this.search(name);
    this.cache.set(name, out);
    return out;
  }

  /** The canonical spelling of a value written for a (canonical) flag name. */
  flagValue(name: string, value: FlagValue): FlagValue {
    if (typeof value !== 'string') return value;
    const exact = this.values.get(name)?.get(value);
    if (exact !== undefined) return exact;
    for (const s of this.starValues) {
      if (!name.startsWith(s.prefix)) continue;
      const v = s.table.get(value);
      if (v !== undefined) return v;
    }
    return value;
  }

  /** A removed id stands as a whole segment of the flag name (the flag goes with it). */
  removedIn(name: string): string | null {
    if (this.removedIds.size === 0) return null;
    for (const p of name.split('.')) if (this.removedIds.has(p)) return p;
    return null;
  }

  /** The one new id of an old id of any kind (null when none, or when kinds disagree). */
  anyId(id: string): string | null {
    const to = this.segments.get(id);
    return to && to.length === 1 ? (to[0] as string) : null;
  }

  /** What became of a content id of a kind, or null when it stands. */
  id(kind: string, id: string): IdOutcome | null {
    const e = this.ids.get(kind)?.get(id);
    if (!e) return null;
    if (e.removed === true)
      return e.refund ? { removed: true, refund: e.refund } : { removed: true };
    return e.to !== undefined ? { to: e.to } : null;
  }

  /** Breadth first: the fewest rewrites that reach a registered name, in table order. */
  private search(name: string): FlagStep | null {
    if (this.names.isCanonical(name)) return null;
    let frontier: FlagStep[] = [{ name, scale: 1, offset: 0 }];
    const seen = new Set<string>([name]);
    for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
      const next: FlagStep[] = [];
      for (const state of frontier) {
        for (const step of this.steps(state.name)) {
          if (seen.has(step.name)) continue;
          seen.add(step.name);
          const composed = {
            name: step.name,
            scale: state.scale * step.scale,
            offset: state.offset * step.scale + step.offset,
          };
          if (this.names.isCanonical(step.name)) return composed;
          next.push(composed);
        }
      }
      frontier = next;
    }
    return null;
  }

  /** Every single rewrite of a name: exact entry, id segments, then patterns. */
  private steps(name: string): FlagStep[] {
    const out: FlagStep[] = [];
    const exact = this.exact.get(name);
    if (exact) out.push(exact);
    if (this.segments.size > 0) {
      const parts = name.split('.');
      parts.forEach((p, i) => {
        for (const to of this.segments.get(p) ?? []) {
          const copy = [...parts];
          copy[i] = to;
          out.push({ name: copy.join('.'), scale: 1, offset: 0 });
        }
      });
    }
    for (const p of this.patterns) {
      const m = p.re.exec(name);
      if (m) out.push({ name: fill(p.to, m.slice(1)), scale: p.scale, offset: p.offset });
    }
    return out;
  }
}

function pick(s: FlagStep): { scale: number; offset: number } {
  return { scale: s.scale, offset: s.offset };
}

// ---------------------------------------------------------------------------
// Applying a table to a world

/** A slice and the id fields its system declares. */
export interface SliceIds {
  slice: string;
  fields: readonly IdField[];
}

function convert(value: FlagValue, step: FlagStep): FlagValue {
  if (typeof value !== 'number' || (step.scale === 1 && step.offset === 0)) return value;
  return value * step.scale + step.offset;
}

/**
 * Apply the entries newer than `fromVersion` to a world in place: flag names, conversions
 * and values, the declared slice id fields, and the flag keys of the recent-event ring.
 */
export function applyRenames(
  world: World,
  set: RenameSet,
  idFields: readonly SliceIds[] = [],
): RenameReport {
  const report: RenameReport = {
    from: set.from,
    to: set.to,
    flags: 0,
    values: 0,
    ids: 0,
    removed: [],
    conflicts: [],
  };
  if (set.empty) return report;
  renameFlags(world, set, report);
  for (const s of idFields) {
    const slice = (world.slices as unknown as Record<string, unknown>)[s.slice];
    if (slice === undefined || slice === null) continue;
    for (const f of s.fields) renameIdField(slice, f, set, report, `slices.${s.slice}`);
  }
  for (const ev of world.recent) {
    if (ev.kind === 'flag.changed') {
      const d = ev.data;
      const step = set.renameFlag(d.key);
      if (!step) continue;
      d.key = step.name;
      d.value = set.flagValue(step.name, convert(d.value, step));
      if (d.previous !== undefined) {
        d.previous = set.flagValue(step.name, convert(d.previous, step));
      }
      continue;
    }
    // Other events: a string that is exactly an old id (of one kind only) is renamed.
    renameEventIds(ev.data as unknown, set, 0);
  }
  return report;
}

function renameEventIds(v: unknown, set: RenameSet, depth: number): void {
  if (depth > 6 || typeof v !== 'object' || v === null) return;
  const holder = v as Record<string | number, unknown>;
  for (const k of Object.keys(holder)) {
    const x = holder[k];
    if (typeof x === 'string') {
      const to = set.anyId(x);
      if (to !== null) holder[k] = to;
    } else renameEventIds(x, set, depth + 1);
  }
}

function renameFlags(world: World, set: RenameSet, report: RenameReport): void {
  const flags = world.meta.flags;
  const keys = Object.keys(flags);
  const plan = keys.map((k) => ({ key: k, step: set.renameFlag(k) }));
  // A flag set under its current name wins over an old spelling of it.
  const kept = new Set(plan.filter((p) => !p.step).map((p) => p.key));
  const out: Record<string, FlagValue> = {};
  for (const { key, step } of plan) {
    const old = flags[key] as FlagValue;
    const removed = set.removedIn(step?.name ?? key);
    if (removed !== null) {
      report.removed.push({
        kind: 'flag',
        id: removed,
        at: `meta.flags.${key}`,
        count: 1,
        refunded: 0,
      });
      continue;
    }
    if (!step) {
      const v = set.flagValue(key, old);
      if (v !== old) report.values++;
      out[key] = v;
      continue;
    }
    if (kept.has(step.name) || Object.hasOwn(out, step.name)) {
      report.conflicts.push(`${key} -> ${step.name}`);
      continue;
    }
    out[step.name] = set.flagValue(step.name, convert(old, step));
    report.flags++;
  }
  world.meta.flags = out;
}

type Holder = Record<string, unknown> | unknown[];

function isHolder(v: unknown): v is Holder {
  return typeof v === 'object' && v !== null;
}

function renameIdField(
  slice: unknown,
  field: IdField,
  set: RenameSet,
  report: RenameReport,
  at: string,
): void {
  const segs = field.path.split('.');
  const where = `${at}.${field.path}`;
  const refund = (parent: unknown, copper: number, count: number): number => {
    const money = field.refund?.money;
    if (!money || !isHolder(parent) || Array.isArray(parent)) return 0;
    const p = parent as Record<string, unknown>;
    if (typeof p[money] !== 'number') return 0;
    const amount = copper * count;
    p[money] = (p[money] as number) + amount;
    return amount;
  };
  const value = (holder: Holder, key: string | number, parent: unknown): void => {
    const v = (holder as Record<string | number, unknown>)[key];
    if (typeof v !== 'string') return;
    const o = set.id(field.kind, v);
    if (!o) return;
    if ('to' in o) {
      (holder as Record<string | number, unknown>)[key] = o.to;
      report.ids++;
      return;
    }
    if (Array.isArray(holder)) holder.splice(key as number, 1);
    else delete (holder as Record<string, unknown>)[key as string];
    const refunded = o.refund ? refund(parent, o.refund.copper, 1) : 0;
    report.removed.push({ kind: field.kind, id: v, at: where, count: 1, refunded });
  };
  const keysOf = (holder: unknown, parent: unknown): void => {
    if (!isHolder(holder) || Array.isArray(holder)) return;
    const obj = holder as Record<string, unknown>;
    let changed = false;
    const next = new Map<string, unknown>();
    // Two entries meet under one key: counts add up (merge 'sum'), otherwise the winner stays.
    const meet = (key: string, winner: unknown, loser: unknown, what: string): void => {
      if (field.merge === 'sum' && typeof winner === 'number' && typeof loser === 'number') {
        next.set(key, winner + loser);
      } else {
        next.set(key, winner);
        report.conflicts.push(`${where}: ${what}`);
      }
    };
    for (const [k, v] of Object.entries(obj)) {
      const o = set.id(field.kind, k);
      if (!o) {
        // An id under its current name wins over an old one renamed onto it.
        if (next.has(k)) meet(k, v, next.get(k), `${k} kept`);
        else next.set(k, v);
        continue;
      }
      changed = true;
      if ('to' in o) {
        report.ids++;
        if (next.has(o.to)) meet(o.to, next.get(o.to), v, `${k} -> ${o.to}`);
        else next.set(o.to, v);
        continue;
      }
      const count = typeof v === 'number' ? v : 1;
      const refunded = o.refund ? refund(parent, o.refund.copper, count) : 0;
      report.removed.push({ kind: field.kind, id: k, at: where, count, refunded });
    }
    if (!changed) return;
    for (const k of Object.keys(obj)) delete obj[k];
    for (const [k, v] of next) obj[k] = v;
  };
  const walk = (holder: unknown, parent: unknown, i: number): void => {
    if (!isHolder(holder)) return;
    const seg = segs[i] as string;
    const last = i === segs.length - 1;
    if (seg === '@keys') {
      if (last) keysOf(holder, parent);
      return;
    }
    if (seg === '*') {
      if (Array.isArray(holder)) {
        for (let k = holder.length - 1; k >= 0; k--) {
          if (last) value(holder, k, parent);
          else walk(holder[k], holder, i + 1);
        }
      } else {
        for (const k of Object.keys(holder)) {
          if (last) value(holder, k, parent);
          else walk((holder as Record<string, unknown>)[k], holder, i + 1);
        }
      }
      return;
    }
    if (last) value(holder, seg, parent);
    else walk((holder as Record<string, unknown>)[seg], holder, i + 1);
  };
  walk(slice, null, 0);
}
