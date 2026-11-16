// HTN planning of the built-in AI (builtin_ai.md 2.3): goddess schemes, ruler and leader
// multi-step plans, and the omen scheduling of P3 actions. Totally ordered forward
// decomposition (decompose first, execute later) over the actor's own projection, never
// the world truth; an operator's `expect` effects are for planning only, the real effects
// come back as receipts. Budget: depth 4, 12 atomic tasks, 200 expanded nodes per plan.
// Conditions use the reveal-ledger syntax and are evaluated by the caller (core may not
// import the quest system's evaluator). Pure and deterministic: no clock, no randomness.

import type { FlagValue } from '../contracts';

export interface HtnMethodDef {
  /** the compound task this method decomposes */
  task: string;
  /** reveal-ledger precondition over the planning state ('' always holds) */
  pre: string;
  /** ordered subtasks, compound or atomic */
  subtasks: string[];
  /** persona style: methods are tried cheapest first */
  cost: number;
}

export interface HtnOperatorDef {
  /** the atomic task */
  task: string;
  /** kernel command kind */
  command: string;
  /** command parameters; a value `$name` reads the plan binding `name` */
  params: Record<string, string>;
  pre?: string;
  /** planning-only effects on the state: value `$name` reads a binding */
  expect?: Record<string, string>;
  etaHours: number;
  /** hostile to the player: needs a registered omen before it */
  hostileToPlayer?: boolean;
  /** permission tier; P3 needs a registered omen before it */
  perm?: 'P1' | 'P2' | 'P3';
}

/** The omen a hostile or P3 task needs before it, and the allowed gap after the omen. */
export interface HtnOmen {
  /** the omen's atomic task (an operator of the domain) */
  task: string;
  minHours: number;
  maxHours: number;
}

export interface HtnDomain {
  methods: HtnMethodDef[];
  operators: HtnOperatorDef[];
  /** omens keyed by the hostile or P3 task they precede */
  omens?: Record<string, HtnOmen>;
}

export interface HtnBudget {
  /** compound tasks nested along one path, the root counted as 1 */
  depth: number;
  /** atomic tasks in the plan, omens included */
  atoms: number;
  /** method and operator applications tried */
  expansions: number;
}

export const HTN_BUDGET: Readonly<HtnBudget> = { depth: 4, atoms: 12, expansions: 200 };

export type HtnState = Record<string, FlagValue>;

/** Evaluates a precondition over the planning state. */
export type HtnHolds = (expr: string, state: Readonly<HtnState>) => boolean;

export interface HtnStep {
  task: string;
  command: string;
  params: Record<string, string>;
  etaHours: number;
  /** on an omen step: the hostile or P3 task it announces */
  omenFor?: string;
  /** on a step after an omen: the allowed gap after the omen, in game hours */
  gapHours?: [number, number];
}

export interface HtnPlan {
  root: string;
  steps: HtnStep[];
  /** summed method cost */
  cost: number;
  /** expansions spent */
  expanded: number;
}

export type HtnFailure = 'unknown_task' | 'no_method' | 'budget' | 'no_omen' | 'unbound';

export type HtnResult =
  | { ok: true; plan: HtnPlan }
  | { ok: false; reason: HtnFailure; expanded: number };

interface Frame {
  task: string;
  /** compound nesting of the task, the root at 1 */
  depth: number;
}

class Abort extends Error {}

/**
 * Plan `root` from `state`. Methods are tried by cost ascending, ties in declaration order
 * (the author's order is the tie rule); the first full decomposition wins. Failure
 * reasons: an unknown task name; no applicable method; the budget cut every branch; a
 * hostile or P3 operator without a registered omen; a `$binding` with no value.
 */
export function planHtn(
  domain: HtnDomain,
  root: string,
  state: Readonly<HtnState>,
  holds: HtnHolds,
  opts: { bindings?: Record<string, string>; budget?: Partial<HtnBudget> } = {},
): HtnResult {
  const budget = { ...HTN_BUDGET, ...opts.budget };
  const bindings = opts.bindings ?? {};
  const methods = new Map<string, HtnMethodDef[]>();
  domain.methods.forEach((m) => {
    const list = methods.get(m.task) ?? [];
    list.push(m);
    methods.set(m.task, list);
  });
  for (const list of methods.values()) list.sort((a, b) => a.cost - b.cost); // stable: ties keep declaration order
  const operators = new Map(domain.operators.map((o) => [o.task, o]));
  let expanded = 0;
  let worst: HtnFailure = 'no_method';
  const note = (r: HtnFailure) => {
    // the most telling reason wins: a broken domain (unknown task) first, then the budget
    // that cut the search, then content gaps (unbound parameter, missing omen)
    const rank: Record<HtnFailure, number> = {
      no_method: 0,
      no_omen: 1,
      unbound: 2,
      budget: 3,
      unknown_task: 4,
    };
    if (rank[r] > rank[worst]) worst = r;
  };
  const spend = () => {
    expanded++;
    if (expanded > budget.expansions) {
      note('budget');
      throw new Abort();
    }
  };
  const bind = (v: string): string | null => {
    if (!v.startsWith('$')) return v;
    const b = bindings[v.slice(1)];
    return b === undefined ? null : b;
  };
  const coerce = (v: string): FlagValue => {
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    return v;
  };
  /** Apply an operator: its step(s) and the state after, or null when it cannot apply. */
  const apply = (
    op: HtnOperatorDef,
    st: HtnState,
  ): { steps: HtnStep[]; state: HtnState } | null => {
    if (op.pre && !holds(op.pre, st)) return null;
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(op.params)) {
      const b = bind(v);
      if (b === null) {
        note('unbound');
        return null;
      }
      params[k] = b;
    }
    const next: HtnState = { ...st };
    for (const [k, v] of Object.entries(op.expect ?? {})) {
      const b = bind(v);
      if (b === null) {
        note('unbound');
        return null;
      }
      next[k] = coerce(b);
    }
    return {
      steps: [{ task: op.task, command: op.command, params, etaHours: op.etaHours }],
      state: next,
    };
  };

  const seek = (agenda: Frame[], st: HtnState, steps: HtnStep[], cost: number): HtnPlan | null => {
    const head = agenda[0];
    if (!head) return { root, steps, cost, expanded };
    const rest = agenda.slice(1);
    const op = operators.get(head.task);
    if (op) {
      spend();
      let pre: HtnStep[] = [];
      let s0 = st;
      const hostile = op.hostileToPlayer === true || op.perm === 'P3';
      let gap: [number, number] | undefined;
      if (hostile) {
        const omen = domain.omens?.[op.task];
        const omenOp = omen ? operators.get(omen.task) : undefined;
        if (!omen || !omenOp) {
          note('no_omen');
          return null;
        }
        const last = steps[steps.length - 1];
        if (!last || last.task !== omen.task) {
          const o = apply(omenOp, s0);
          if (!o) return null;
          pre = o.steps.map((x) => ({ ...x, omenFor: op.task }));
          s0 = o.state;
        }
        gap = [omen.minHours, omen.maxHours];
      }
      const a = apply(op, s0);
      if (!a) return null;
      const added = [...pre, ...a.steps.map((x) => (gap ? { ...x, gapHours: gap } : x))];
      if (steps.length + added.length > budget.atoms) {
        note('budget');
        return null;
      }
      return seek(rest, a.state, [...steps, ...added], cost);
    }
    const options = methods.get(head.task);
    if (!options) {
      note('unknown_task');
      throw new Abort();
    }
    if (head.depth > budget.depth) {
      note('budget');
      return null;
    }
    for (const m of options) {
      spend();
      if (m.pre && !holds(m.pre, st)) continue;
      const sub: Frame[] = m.subtasks.map((task) => ({ task, depth: head.depth + 1 }));
      const plan = seek([...sub, ...rest], st, steps, cost + m.cost);
      if (plan) return plan;
    }
    return null;
  };

  try {
    const plan = seek([{ task: root, depth: 1 }], { ...state }, [], 0);
    if (plan) return { ok: true, plan: { ...plan, expanded } };
  } catch (e) {
    if (!(e instanceof Abort)) throw e;
  }
  return { ok: false, reason: worst, expanded };
}

/** A plan in execution, stored in the actor's slice (builtin_ai 2.3 and 18). */
export interface HtnPlanState {
  planId: string;
  root: string;
  /** the plan's step tasks in order */
  steps: string[];
  /** next step to execute */
  index: number;
  bindings: Record<string, string>;
  startTick: number;
  deadlineTick: number;
}

export function startPlan(
  planId: string,
  plan: HtnPlan,
  bindings: Record<string, string>,
  startTick: number,
  deadlineTick: number,
): HtnPlanState {
  return {
    planId,
    root: plan.root,
    steps: plan.steps.map((s) => s.task),
    index: 0,
    bindings: { ...bindings },
    startTick,
    deadlineTick,
  };
}

/** The task to execute next, or null when the plan is complete. */
export function currentStep(p: HtnPlanState): string | null {
  return p.steps[p.index] ?? null;
}

/** Mark the current step done (on its successful receipt). */
export function advancePlan(p: HtnPlanState): void {
  if (p.index < p.steps.length) p.index++;
}

/** Another goal must beat the current goal's utility by this many percent to force a replan. */
export const REPLAN_GAIN_PCT = 30;

export type ReplanReason = 'step_failed' | 'pre_broken' | 'expired' | 'better_goal';

/**
 * Why the plan must be replanned now, or null (builtin_ai 2.3): the current step failed,
 * its precondition broke, the deadline passed, or another goal's utility beats the current
 * goal's by REPLAN_GAIN_PCT percent or more (compared in whole percent, so 13 against 10
 * counts). Never checked every tick: on the actor's beat.
 */
export function replanReason(
  p: HtnPlanState,
  check: {
    tick: number;
    stepFailed?: boolean;
    preHolds?: boolean;
    currentUtility?: number;
    bestOtherUtility?: number;
  },
): ReplanReason | null {
  if (check.stepFailed) return 'step_failed';
  if (check.preHolds === false) return 'pre_broken';
  if (check.tick > p.deadlineTick) return 'expired';
  const cur = check.currentUtility;
  const other = check.bestOtherUtility;
  if (
    cur !== undefined &&
    other !== undefined &&
    other > cur &&
    (other - cur) * 100 >= Math.abs(cur) * REPLAN_GAIN_PCT
  )
    return 'better_goal';
  return null;
}

/** Problems of a domain (content validation): unknown tasks, cycles, depth, omens, values. */
export function domainProblems(
  domain: HtnDomain,
  opts: { checkCondition?(expr: string): string | null; maxDepth?: number } = {},
): string[] {
  const out: string[] = [];
  const maxDepth = opts.maxDepth ?? HTN_BUDGET.depth;
  const ops = new Map<string, HtnOperatorDef>();
  for (const o of domain.operators) {
    if (ops.has(o.task)) out.push(`operator ${o.task}: duplicate task`);
    ops.set(o.task, o);
    if (!(o.etaHours >= 0)) out.push(`operator ${o.task}: etaHours must be 0 or more`);
    const bad = o.pre ? opts.checkCondition?.(o.pre) : null;
    if (bad) out.push(`operator ${o.task}: precondition does not parse: ${bad}`);
    if ((o.hostileToPlayer || o.perm === 'P3') && !domain.omens?.[o.task])
      out.push(`operator ${o.task}: hostile or P3 without a registered omen`);
  }
  const compound = new Map<string, HtnMethodDef[]>();
  for (const m of domain.methods) {
    if (ops.has(m.task)) out.push(`method for ${m.task}: the task is also an operator`);
    const list = compound.get(m.task) ?? [];
    list.push(m);
    compound.set(m.task, list);
    if (!(m.cost >= 0)) out.push(`method for ${m.task}: cost must be 0 or more`);
    if (m.subtasks.length === 0) out.push(`method for ${m.task}: no subtasks`);
    const bad = m.pre ? opts.checkCondition?.(m.pre) : null;
    if (bad) out.push(`method for ${m.task}: precondition does not parse: ${bad}`);
    for (const s of m.subtasks)
      if (!ops.has(s) && !domain.methods.some((x) => x.task === s))
        out.push(`method for ${m.task}: unknown subtask ${s}`);
  }
  for (const [task, omen] of Object.entries(domain.omens ?? {})) {
    if (!ops.has(omen.task)) out.push(`omen of ${task}: unknown omen task ${omen.task}`);
    if (!(omen.minHours >= 0 && omen.maxHours >= omen.minHours))
      out.push(`omen of ${task}: the gap must be 0 <= minHours <= maxHours`);
  }
  // cycles and depth over the compound graph (longest chain of compound tasks)
  const depthOf = new Map<string, number>();
  const visiting = new Set<string>();
  const cyclic = new Set<string>();
  const walk = (task: string): number => {
    if (!compound.has(task)) return 0;
    const known = depthOf.get(task);
    if (known !== undefined) return known;
    if (visiting.has(task)) {
      cyclic.add(task);
      return 0;
    }
    visiting.add(task);
    let deepest = 0;
    for (const m of compound.get(task) ?? [])
      for (const s of m.subtasks) deepest = Math.max(deepest, walk(s));
    visiting.delete(task);
    depthOf.set(task, deepest + 1);
    return deepest + 1;
  };
  for (const task of [...compound.keys()].sort()) {
    const d = walk(task);
    if (d > maxDepth)
      out.push(`task ${task}: decomposes ${d} compound levels deep, over ${maxDepth}`);
  }
  for (const t of [...cyclic].sort()) out.push(`task ${t}: methods form a cycle`);
  return out;
}
