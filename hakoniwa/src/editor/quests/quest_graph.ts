// Quest and story graph: quests, stages, the flags they read and write, act gates, and
// a reachability analysis over the flag write index. A fixed point grows the set of
// reachable quests: a quest is reachable when its trigger can be true with values some
// reachable writer can produce (code and non-quest data writers always count; writes
// inside a quest count once that quest, and the stage they belong to, is reachable).
// The verdicts are approximations for review, not proofs. Pure: no DOM.

import type { FlagValue } from '../../core/contracts';
import { type ActDef, evaluate, type QuestDef } from '../../systems/quests';
import { conditionVars, type FlagRef, isDynamic, isPattern, keyMatches } from './flag_index';

/** Resolver built-ins of systems/quests/conditions.ts flagResolver callers. */
export const BUILTIN_VARS: Record<string, FlagValue[]> = {
  ai_enabled: [true, false],
  day: [0, 1, 7, 30, 100, 1000],
  // the act clock writes act_week through its constant (systems/quests/act_clock.ts
  // ACT_WEEK_FLAG), which the source scan cannot read; its values are the weeks the
  // content's conditions tell apart (actWeekValues)
  act_week: [0],
};

/**
 * The act weeks that tell the content's act_week conditions apart: week 0 (before the
 * clock) and each week a condition compares act_week with, with its neighbours. Every
 * week of a long act would multiply the combinations past the cap for nothing.
 */
export function actWeekValues(input: Pick<GraphInput, 'quests' | 'acts'>): FlagValue[] {
  const out = new Set<number>([0]);
  const text = JSON.stringify([input.quests, input.acts]);
  for (const m of text.matchAll(/act_week\s*(?:>=|<=|==|!=|>|<)\s*(\d+)/g)) {
    const n = Number(m[1]);
    for (const w of [n - 1, n, n + 1]) if (w >= 0) out.add(w);
  }
  return [...out].sort((x, y) => x - y);
}

const ANY = Symbol('any');
type Val = FlagValue | typeof ANY;

export interface QuestInfo {
  id: string;
  act: string;
  title: string;
  kind: string;
  order: number;
  trigger: string;
  triggerVars: string[];
  /** quests started by this quest's effects */
  starts: string[];
  writes: FlagRef[];
  badConditions: { where: string; error: string }[];
}

export interface FlagInfo {
  key: string;
  writers: FlagRef[];
  readers: FlagRef[];
  builtin: boolean;
  initial: boolean;
}

export type QuestState = 'reachable' | 'stuck' | 'unreachable' | 'undecided';

export interface QuestVerdict {
  id: string;
  state: QuestState;
  /** for 'stuck': the first stage that cannot complete */
  stage?: number;
  /** trigger or objective variables that block it */
  blockers: string[];
  /** blockers no writer at all can set */
  unwritten: string[];
}

export interface GraphEdge {
  from: string;
  to: string;
  /** the flag connecting them, or 'quest' for a start effect */
  via: string;
}

export interface QuestGraph {
  quests: QuestInfo[];
  acts: ActDef[];
  edges: GraphEdge[];
  flags: FlagInfo[];
  verdicts: Record<string, QuestVerdict>;
  /** read somewhere, written nowhere (not built-in, not initial) */
  noWriter: FlagInfo[];
  /** written as an exact key, read nowhere */
  unread: FlagInfo[];
  /** acts no reachable writer switches to (excluding the initial act) */
  unreachableActs: string[];
}

export interface GraphInput {
  quests: readonly QuestDef[];
  acts: readonly ActDef[];
  index: readonly FlagRef[];
  /** world flags right after a fresh world's init */
  initialFlags: Record<string, FlagValue>;
  /** combination cap per satisfiability check */
  maxCombos?: number;
}

function quotedLiterals(expr: string): string[] {
  const out = new Set<string>();
  for (const m of expr.matchAll(/'([^']*)'|"([^"]*)"/g)) out.add((m[1] ?? m[2]) as string);
  for (const m of expr.matchAll(/(?:==|!=|\bin\b)\s*\(?\s*([A-Za-z_][\w.]*)/g)) {
    out.add(m[1] as string);
  }
  return [...out];
}

/** Is there an assignment of possible values that makes expr true? */
function satisfiable(
  expr: string | undefined,
  candidates: (name: string) => Set<Val>,
  maxCombos: number,
): 'yes' | 'no' | 'undecided' {
  if (!expr || expr.trim() === '') return 'yes';
  const vars = conditionVars(expr);
  if (!vars) return 'no';
  const probes: FlagValue[] = [
    true,
    false,
    0,
    1,
    5,
    10,
    30,
    50,
    100,
    1000,
    ...quotedLiterals(expr),
  ];
  const domains: (FlagValue | undefined)[][] = vars.map((v) => {
    const set = candidates(v);
    const out = new Set<FlagValue | undefined>([undefined]);
    for (const x of set) {
      if (x === ANY) for (const p of probes) out.add(p);
      else out.add(x);
    }
    return [...out];
  });
  let total = 1;
  for (const d of domains) total *= d.length;
  if (total > maxCombos) return 'undecided';
  const idx = vars.map(() => 0);
  for (let n = 0; n < total; n++) {
    const assign: Record<string, FlagValue | undefined> = {};
    vars.forEach((v, i) => {
      assign[v] = (domains[i] as (FlagValue | undefined)[])[idx[i] as number];
    });
    try {
      if (evaluate(expr, (name) => assign[name])) return 'yes';
    } catch {
      return 'no';
    }
    for (let i = 0; i < idx.length; i++) {
      idx[i] = (idx[i] as number) + 1;
      if ((idx[i] as number) < (domains[i] as unknown[]).length) break;
      idx[i] = 0;
    }
  }
  return 'no';
}

function questInfo(q: QuestDef, index: readonly FlagRef[]): QuestInfo {
  const bad: { where: string; error: string }[] = [];
  const check = (where: string, expr: string | undefined) => {
    if (!expr) return;
    if (conditionVars(expr) === null) bad.push({ where, error: expr });
  };
  check('trigger', q.trigger);
  q.stages.forEach((s, si) => {
    s.objectives.forEach((o, oi) => {
      if (o.type === 'flag') check(`stages[${si}].objectives[${oi}].when`, o.when);
      check(`stages[${si}].objectives[${oi}].orWhen`, o.orWhen);
    });
  });
  const writes = index.filter((r) => r.kind === 'write' && r.quest === q.id);
  const starts = writes
    .filter((w) => w.via === 'quest' && w.key.startsWith('quest.'))
    .map((w) => w.key.slice('quest.'.length));
  return {
    id: q.id,
    act: q.act,
    title: q.title,
    kind: q.kind,
    order: q.order ?? 0,
    trigger: q.trigger ?? '',
    triggerVars: (q.trigger && conditionVars(q.trigger)) || [],
    starts: [...new Set(starts)],
    writes,
    badConditions: bad,
  };
}

/** Variables an objective's completion depends on (flag objectives only). */
function objectiveExprs(q: QuestDef, stage: number): { required: boolean; exprs: string[] }[] {
  const s = q.stages[stage];
  if (!s) return [];
  return s.objectives.map((o) => {
    const exprs: string[] = [];
    if (o.type === 'flag') exprs.push(o.when);
    return { required: !o.optional, exprs: o.orWhen ? [...exprs, o.orWhen] : exprs };
  });
}

export function buildQuestGraph(input: GraphInput): QuestGraph {
  const maxCombos = input.maxCombos ?? 20000;
  const builtins: Record<string, FlagValue[]> = { ...BUILTIN_VARS, act_week: actWeekValues(input) };
  const quests = input.quests.map((q) => questInfo(q, input.index));
  const byId = new Map(input.quests.map((q) => [q.id, q]));
  const writes = input.index.filter((r) => r.kind === 'write');
  const reads = input.index.filter((r) => r.kind === 'read');
  const patternWriters = writes.filter((w) => isPattern(w.key) && !isDynamic(w.key));

  // --- flags table
  const keys = new Set<string>();
  for (const r of input.index) if (!isDynamic(r.key)) keys.add(r.key);
  for (const k of Object.keys(input.initialFlags)) keys.add(k);
  const flags: FlagInfo[] = [...keys].sort().map((key) => ({
    key,
    writers: writes.filter((w) => keyMatches(w.key, key)),
    readers: reads.filter((r) => r.key === key || keyMatches(r.key, key)),
    builtin: key in BUILTIN_VARS || key === 'act',
    initial: key in input.initialFlags,
  }));
  const flagByKey = new Map(flags.map((f) => [f.key, f]));
  const noWriter = flags.filter(
    (f) =>
      !isPattern(f.key) &&
      f.readers.length > 0 &&
      f.writers.length === 0 &&
      !f.builtin &&
      !f.initial,
  );
  const unread = flags.filter(
    (f) => !isPattern(f.key) && f.writers.some((w) => w.key === f.key) && f.readers.length === 0,
  );

  // --- reachability fixed point
  const reachable = new Set<string>();
  const completable = new Map<string, number>();
  const undecided = new Set<string>();
  const values = new Map<string, Set<Val>>();
  const add = (key: string, v: Val) => {
    let s = values.get(key);
    if (!s) {
      s = new Set();
      values.set(key, s);
    }
    s.add(v);
  };
  const rebuildValues = () => {
    values.clear();
    for (const [k, v] of Object.entries(input.initialFlags)) add(k, v);
    for (const w of writes) {
      if (isPattern(w.key)) continue;
      if (w.quest !== undefined) {
        if (!reachable.has(w.quest)) continue;
        const done = completable.get(w.quest) ?? 0;
        const q = byId.get(w.quest);
        const n = q?.stages.length ?? 0;
        const stage = w.stage ?? -1;
        const onEnter = w.where.includes('.onEnter');
        const ok =
          stage < 0 ||
          stage < done ||
          (stage === done && stage < n && onEnter) ||
          (stage === n && done === n);
        if (!ok) continue;
      }
      add(w.key, w.value ?? ANY);
    }
    for (const id of reachable) {
      add(`quest.${id}`, 'active');
      const q = byId.get(id);
      if (q && (completable.get(id) ?? 0) >= q.stages.length) {
        add(`quest.${id}`, 'ready');
        add(`quest.${id}`, 'done');
      }
    }
  };
  const candidates = (name: string): Set<Val> => {
    const out = new Set<Val>(values.get(name) ?? []);
    for (const b of builtins[name] ?? []) out.add(b);
    if (!name.startsWith('quest.') && patternWriters.some((w) => keyMatches(w.key, name))) {
      out.add(ANY);
    }
    return out;
  };

  for (let guard = 0; guard < 200; guard++) {
    rebuildValues();
    let changed = false;
    for (const q of input.quests) {
      if (!reachable.has(q.id)) {
        const s = satisfiable(q.trigger, candidates, maxCombos);
        if (s === 'undecided') undecided.add(q.id);
        if (s !== 'no') {
          reachable.add(q.id);
          changed = true;
        }
      }
      if (!reachable.has(q.id)) continue;
      let done = 0;
      for (let si = 0; si < q.stages.length; si++) {
        const objs = objectiveExprs(q, si);
        const mode = q.stages[si]?.complete ?? 'all';
        const ok = (o: { exprs: string[] }) =>
          o.exprs.length === 0 ||
          o.exprs.some((e) => satisfiable(e, candidates, maxCombos) !== 'no');
        const required = objs.filter((o) => o.required);
        const pass = mode === 'any' ? objs.length === 0 || objs.some(ok) : required.every(ok);
        if (!pass) break;
        done++;
      }
      if (done !== (completable.get(q.id) ?? 0)) {
        completable.set(q.id, done);
        changed = true;
      }
    }
    if (!changed) break;
  }
  rebuildValues();

  // --- verdicts
  const verdicts: Record<string, QuestVerdict> = {};
  const unwrittenOf = (vars: string[]) =>
    vars.filter((v) => {
      if (v in BUILTIN_VARS || v === 'act' || v in input.initialFlags) return false;
      if (v.startsWith('quest.')) return !byId.has(v.slice('quest.'.length));
      return !(flagByKey.get(v)?.writers.length ?? 0);
    });
  for (const q of input.quests) {
    const info = quests.find((x) => x.id === q.id) as QuestInfo;
    if (!reachable.has(q.id)) {
      const blockers = info.triggerVars;
      verdicts[q.id] = {
        id: q.id,
        state: 'unreachable',
        blockers,
        unwritten: unwrittenOf(blockers),
      };
      continue;
    }
    const done = completable.get(q.id) ?? 0;
    if (done < q.stages.length) {
      const blockers = [
        ...new Set(
          objectiveExprs(q, done).flatMap((o) => o.exprs.flatMap((e) => conditionVars(e) ?? [])),
        ),
      ];
      verdicts[q.id] = {
        id: q.id,
        state: 'stuck',
        stage: done,
        blockers,
        unwritten: unwrittenOf(blockers),
      };
      continue;
    }
    verdicts[q.id] = {
      id: q.id,
      state: undecided.has(q.id) ? 'undecided' : 'reachable',
      blockers: [],
      unwritten: [],
    };
  }

  // --- edges: writer quest -> reader quest through a trigger variable, and start effects
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const pushEdge = (from: string, to: string, via: string) => {
    const k = `${from}>${to}>${via}`;
    if (from === to || seen.has(k)) return;
    seen.add(k);
    edges.push({ from, to, via });
  };
  for (const a of quests) {
    for (const b of quests) {
      for (const v of b.triggerVars) {
        if (v === `quest.${a.id}`) pushEdge(a.id, b.id, v);
        else if (a.writes.some((w) => keyMatches(w.key, v))) pushEdge(a.id, b.id, v);
      }
    }
    for (const s of a.starts) if (byId.has(s)) pushEdge(a.id, s, 'quest');
  }

  const actValues = values.get('act') ?? new Set<Val>();
  const unreachableActs = input.acts
    .map((a) => a.id)
    .filter((id) => !actValues.has(id) && !actValues.has(ANY));

  return {
    quests,
    acts: [...input.acts].sort((a, b) => a.index - b.index),
    edges,
    flags,
    verdicts,
    noWriter,
    unread,
    unreachableActs,
  };
}
