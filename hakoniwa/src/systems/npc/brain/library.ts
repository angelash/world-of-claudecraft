// The NPC brain's content (builtin_ai.md 4.1 to 4.3 and 5.6): the generic utility action
// library of the need and emergency layers, the trait dimension multipliers, the fifteen
// functional-role behavior trees with their role actions, and the reaction table. Data
// lives in data/npc/brain/*.json; this module types it, builds the response curves from
// their shape specs once per content object, and lists the problems content validation
// reports. Pure.

import type { BtNodeDef } from '../../../core/brain/bt';
import { treeProblems } from '../../../core/brain/bt';
import {
  bell,
  type Curve,
  type CurvePoint,
  curveProblems,
  inv,
  lin,
  logi,
  quad,
  step,
} from '../../../core/brain/curves';
import type { RuleRow } from '../../../core/brain/rules';
import { ruleProblems } from '../../../core/brain/rules';
import type { Consideration, NamedTerm, UtilityActionDef } from '../../../core/brain/utility';
import type { ContentMap } from '../../../core/contracts';
import type { TraitDims } from '../traits';
import {
  ACTIVITIES,
  type Activity,
  FUNCTIONAL_ROLES,
  type FunctionalRole,
  NEED_KEYS,
} from '../types';

/** A response curve as data: a shape with its parameters, or explicit [x, y] nodes. */
export type CurveSpec =
  | ['lin' | 'inv' | 'bell' | 'logi', number, number]
  | ['quad', number, number, 2 | 3]
  | ['step', number]
  | [number, number][];

export interface ConsiderationSpec {
  name: string;
  input: string;
  curve: CurveSpec;
}

/** Notes a brain decision may carry (sys.npc.note.<note>). */
export const BRAIN_NOTES = [
  'hungry',
  'black_bread',
  'exhausted',
  'anxious',
  'lonely',
  'busy',
  'work_more',
  'afraid',
  'confess',
  'save_face',
  'duty',
  'fled',
  'seek_help',
  'stand_ground',
  'post_request',
  'open_stall',
  'restock',
  'tend',
  'buy_materials',
  'craft',
  'train',
  'practice',
  'treat',
  'clinic',
  'herbs',
  'listen',
  'verify',
  'perform',
  'gossip',
  'office',
  'drill',
  'patrol',
  'avoid',
  'keep_evidence',
  'hide_key',
  'taunt',
  'back',
  'service',
  'confession',
  'vespers',
  'alms',
  'chapel',
  'pursuit',
  'visit',
  'approach',
  'follow',
  'errand',
] as const;
export type BrainNote = (typeof BRAIN_NOTES)[number];

/** Side effects of role actions (./role_effects.ts). */
export const ROLE_EFFECTS = [
  'request',
  'restock',
  'treat',
  'collect',
  'verify',
  'perform',
  'back',
  'sermon',
  'confession',
  'vespers',
  'alms',
  'broadcast',
] as const;
export type RoleEffect = (typeof ROLE_EFFECTS)[number];

export interface BrainDo {
  act: Activity;
  /** a schedule place reference, or @here, @player, @patient, @crowd */
  at: string;
  note?: BrainNote;
  /** the need the action answers (the need layer) */
  need?: (typeof NEED_KEYS)[number];
  effect?: RoleEffect;
}

export interface BrainActionSpec {
  id: string;
  layer: 'need' | 'emergency';
  weight: number;
  gates: ConsiderationSpec[];
  bonuses?: NamedTerm[];
  costs?: NamedTerm[];
  persona?: string[];
  cooldownTicks?: number;
  do: BrainDo;
}

export interface RoleActionSpec {
  weight: number;
  persona?: string[];
  do: BrainDo;
}

export interface RoleSpec {
  actions: Record<string, RoleActionSpec>;
  tree: BtNodeDef;
}

/**
 * A reaction-table row (builtin_ai.md 5.6): a rule row whose condition is `cond`, the brain's
 * predicate names joined by AND (not a reveal-ledger condition: those live in `when`
 * fields, which the variable registry reads, so these rows have none).
 */
export interface ReactionRow extends Omit<RuleRow, 'when'> {
  cond: string;
}

/** The npcBrain content table (data/npc/brain/*.json, merged by the npc pack). */
export interface NpcBrainContent {
  /** the do-nothing baseline of the need layer */
  idle: number;
  actions: BrainActionSpec[];
  traitDims: TraitDims;
  roles: Partial<Record<FunctionalRole, RoleSpec>>;
  reactions: ReactionRow[];
}

declare module '../../../core/contracts' {
  interface ContentMap {
    npcBrain: NpcBrainContent;
  }
}

/** Build a curve from its data spec. */
export function buildCurve(spec: CurveSpec): Curve {
  if (spec.length > 0 && Array.isArray(spec[0])) {
    return (spec as [number, number][]).map(([x, y]) => ({ x, y }) as CurvePoint);
  }
  const [shape, a, b, k] = spec as [string, number, number?, number?];
  switch (shape) {
    case 'lin':
      return lin(a, b as number);
    case 'inv':
      return inv(a, b as number);
    case 'quad':
      return quad(a, b as number, (k ?? 2) as 2 | 3);
    case 'step':
      return step(a);
    case 'bell':
      return bell(a, b as number);
    case 'logi':
      return logi(a, b as number);
    default:
      throw new Error(`unknown curve shape ${String(shape)}`);
  }
}

const builtCache = new WeakMap<object, UtilityActionDef[]>();

/** The generic library as utility definitions (curves built), cached per content. */
export function libraryActions(content: Pick<ContentMap, 'npcBrain'>): UtilityActionDef[] {
  const brain = content.npcBrain;
  if (!brain) return [];
  let out = builtCache.get(brain);
  if (!out) {
    out = brain.actions.map((a) => ({
      id: a.id,
      weight: a.weight,
      gates: a.gates.map((g): Consideration => ({ ...g, curve: buildCurve(g.curve) })),
      bonuses: a.bonuses,
      costs: a.costs,
      persona: a.persona,
      cooldownTicks: a.cooldownTicks,
      tags: [a.layer],
    }));
    builtCache.set(brain, out);
  }
  return out;
}

/** The library spec of an action id. */
export function librarySpec(
  content: Pick<ContentMap, 'npcBrain'>,
  id: string,
): BrainActionSpec | undefined {
  return content.npcBrain?.actions.find((a) => a.id === id);
}

export interface BrainCheckOptions {
  /** registered input ids (./inputs.ts) */
  inputs: ReadonlySet<string>;
  /** registered predicate names (./predicates.ts) */
  predicates: ReadonlySet<string>;
  /** registered reaction predicate names (./reactions.ts) */
  reactionPredicates: ReadonlySet<string>;
  /** reaction behaviours (./reactions.ts) */
  reactionActions: ReadonlySet<string>;
  /** a line slot has lines along the common chain */
  slotHasLines?(slot: string): boolean;
}

function inputOk(inputs: ReadonlySet<string>, id: string): boolean {
  return inputs.has(id) || inputs.has(`${id.split('.')[0]}.*`);
}

function predicateProblem(names: ReadonlySet<string>, expr: string): string | null {
  for (const part of expr.split(' AND ')) {
    const name = part.trim().replace(/^!/, '');
    if (!names.has(name)) return `unknown predicate ${name}`;
  }
  return null;
}

/** Problems of the brain content (the npc pack's validation and the data gate). */
export function brainProblems(
  brain: NpcBrainContent | undefined,
  opts: BrainCheckOptions,
): string[] {
  const out: string[] = [];
  if (!brain) return ['npc brain content is missing'];
  if (!(brain.idle >= 0)) out.push('brain: idle baseline must be a number');
  const ids = new Set<string>();
  const doProblems = (who: string, d: BrainDo) => {
    if (!ACTIVITIES.includes(d.act)) out.push(`${who}: unknown activity ${d.act}`);
    if (typeof d.at !== 'string' || !d.at) out.push(`${who}: no place`);
    if (d.note && !(BRAIN_NOTES as readonly string[]).includes(d.note))
      out.push(`${who}: unknown note ${d.note}`);
    if (d.need && !(NEED_KEYS as readonly string[]).includes(d.need))
      out.push(`${who}: unknown need ${d.need}`);
    if (d.effect && !(ROLE_EFFECTS as readonly string[]).includes(d.effect))
      out.push(`${who}: unknown effect ${d.effect}`);
    if (typeof d.at === 'string' && d.at.startsWith('@') && d.at.includes(':'))
      out.push(`${who}: '@' places take no map`);
  };
  for (const a of brain.actions) {
    const who = `brain action ${a.id}`;
    if (ids.has(a.id)) out.push(`${who}: duplicate id`);
    ids.add(a.id);
    if (a.layer !== 'need' && a.layer !== 'emergency') out.push(`${who}: unknown layer`);
    if (!(a.weight > 0)) out.push(`${who}: weight must be positive`);
    if (a.layer === 'need' && !a.do.need) out.push(`${who}: a need action names its need`);
    for (const g of a.gates) {
      if (!inputOk(opts.inputs, g.input)) out.push(`${who}: unknown input ${g.input}`);
      try {
        for (const p of curveProblems(buildCurve(g.curve))) out.push(`${who} gate ${g.name}: ${p}`);
      } catch (e) {
        out.push(`${who} gate ${g.name}: ${(e as Error).message}`);
      }
    }
    for (const t of [...(a.bonuses ?? []), ...(a.costs ?? [])])
      if (!inputOk(opts.inputs, t.input)) out.push(`${who}: unknown input ${t.input}`);
    doProblems(who, a.do);
  }
  for (const [code, dims] of Object.entries(brain.traitDims))
    for (const [dim, v] of Object.entries(dims))
      if (!(v >= 0.3 && v <= 2)) out.push(`trait ${code}: dimension ${dim} out of 0.3 to 2`);
  const nodeIds = new Set<string>();
  for (const role of Object.keys(brain.roles)) {
    const who = `role ${role}`;
    if (!(FUNCTIONAL_ROLES as readonly string[]).includes(role)) out.push(`${who}: unknown role`);
    const spec = brain.roles[role as FunctionalRole] as RoleSpec;
    for (const [id, a] of Object.entries(spec.actions)) {
      if (!(a.weight > 0)) out.push(`${who} action ${id}: weight must be positive`);
      doProblems(`${who} action ${id}`, a.do);
    }
    const commands = new Set(Object.keys(spec.actions));
    for (const p of treeProblems(spec.tree, {
      commands,
      checkCondition: (expr) => predicateProblem(opts.predicates, expr),
      slotHasLines: opts.slotHasLines,
    }))
      out.push(`${who} tree: ${p}`);
    const visit = (n: BtNodeDef) => {
      if (!n.id.startsWith(`${role}.`))
        out.push(`${who} tree: node ${n.id} is not prefixed ${role}.`);
      if (nodeIds.has(n.id)) out.push(`${who} tree: node ${n.id} repeats another role's id`);
      nodeIds.add(n.id);
      for (const c of n.children ?? []) visit(c);
    };
    visit(spec.tree);
  }
  for (const r of FUNCTIONAL_ROLES) if (!brain.roles[r]) out.push(`role ${r}: no tree`);
  // the rule-table checks on `cond` (ids, priorities, actions), the condition being a
  // predicate expression rather than a reveal-ledger one
  out.push(
    ...ruleProblems(
      brain.reactions.map((r) => ({ ...r, when: r.cond })),
      (cond) => predicateProblem(opts.reactionPredicates, cond),
    ),
  );
  for (const row of brain.reactions) {
    if ('when' in row) out.push(`reaction ${row.id}: write the condition as cond, not when`);
    for (const t of row.then)
      if (!opts.reactionActions.has(t.action))
        out.push(`reaction ${row.id}: unknown behaviour ${t.action}`);
  }
  return out;
}
