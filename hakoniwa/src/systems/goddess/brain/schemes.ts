// Schemes of the goddess brain (builtin_ai.md 8.4; catalog_goddess_interventions.md 5): a
// scheme (div_plan_*) is an HTN compound task whose methods are ordered steps; each step is
// a divine action on a bound map, or a reactive step (`on`) that the player's own act fulfils
// (Merca's "first customer" waits for the coin, an offering, an intel sale). Adoption: the
// precondition holds and 10 × the goal's KPI value + 3 × affinity - 10 × the plan's power /
// her balance exceeds config.adoptAt; at most config.maxSchemes run at once. Running: the
// next step's action gets the +4 scheme bonus in the dawn score; the step advances when she
// acts it (or the reactive event comes); a step past its deadline replans, and the third
// stall aborts. A scheme with replanDays may be adopted again that many days after it ends.

import { type HtnDomain, type HtnStep, planHtn } from '../../../core/brain/htn';
import type { SystemContext } from '../../../core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../../../core/time';
import { currentActId } from '../../quests/act_order';
import { checkCondition, evaluate, flagResolver } from '../../quests/conditions';
import { conditionHolds } from '../../quests/effects';
import { actionDef, strongestMap } from '../actions';
import type { DivineActionDef, GoddessDef, GoddessState, SchemeRun } from '../types';
import { believersOn } from './gates';
import { brainConfig, type GoddessPersona, kpiValue, personaAct, personaAffinity } from './persona';
import { brainOf, ENDED_KEEP } from './state';

/** Reactive steps: the player's act fulfils them, not hers (catalog 5.3 first customer). */
export const SCHEME_EVENTS = ['coin_used', 'offering', 'intel', 'dream_door'] as const;
export type SchemeEvent = (typeof SCHEME_EVENTS)[number];

/** Map resolvers of a binding (a name), or a map or a person written in the data. */
export const BIND_RESOLVERS = ['player_map', 'faith_top', 'believers_top'] as const;
export type BindResolver = (typeof BIND_RESOLVERS)[number];
export type SchemeBinding = BindResolver | { map: string } | { person: string };

export interface SchemeStepDef {
  /** a divine action id (absent on a reactive step) */
  action?: string;
  /** the reactive event that fulfils the step */
  on?: SchemeEvent;
  /** `$binding`, or a binding resolver name; absent: any map */
  map?: string;
  /** `$binding` of a person: the action's target */
  target?: string;
  /** game hours the step may take before it stalls */
  etaHours: number;
  /** extra command params (price goods and factor, gaze days) */
  params?: Record<string, string | number>;
  /** step precondition (reveal-ledger syntax) */
  when?: string;
  /** a reactive step counts as done once this holds (it may have happened before adoption) */
  condition?: string;
}

export interface SchemeMethodDef {
  cost: number;
  when?: string;
  steps: SchemeStepDef[];
}

/** A scheme div_plan_* (catalog 5 HTN tables). */
export interface SchemeDef {
  id: string;
  goddess: string;
  title: string;
  /** adoption precondition (world condition) */
  when?: string;
  /** abort condition (world condition) */
  unless?: string;
  /** may be adopted again this many game days after it ends (absent: once per act) */
  replanDays?: number;
  /** the root goal's KPI estimate (builtin_ai 8.4 adoption score) */
  value: Record<string, number>;
  tags?: DivineActionDef['tags'];
  bind: Record<string, SchemeBinding>;
  methods: SchemeMethodDef[];
}

type SchemeContent = { goddessSchemes?: SchemeDef[] };

export function schemeDef(content: SchemeContent, id: string): SchemeDef | undefined {
  return content.goddessSchemes?.find((s) => s.id === id);
}

/** Task name of a step in the HTN domain: <scheme>#<method>.<step>. */
export function stepTask(scheme: string, method: number, step: number): string {
  return `${scheme}#${method}.${step}`;
}

/** The step definition behind a task name (undefined for an unknown task). */
export function stepOf(content: SchemeContent, task: string): SchemeStepDef | undefined {
  const m = /^(.+)#(\d+)\.(\d+)$/.exec(task);
  if (!m) return undefined;
  const def = schemeDef(content, m[1] as string);
  return def?.methods[Number(m[2])]?.steps[Number(m[3])];
}

/** The HTN domain of one scheme: the root's methods and one operator per step. */
export function schemeDomain(def: SchemeDef): HtnDomain {
  const domain: HtnDomain = { methods: [], operators: [] };
  def.methods.forEach((m, mi) => {
    domain.methods.push({
      task: def.id,
      pre: m.when ?? '',
      subtasks: m.steps.map((_, si) => stepTask(def.id, mi, si)),
      cost: m.cost,
    });
    m.steps.forEach((s, si) => {
      domain.operators.push({
        task: stepTask(def.id, mi, si),
        command: s.on ? `on:${s.on}` : 'goddess.act',
        params: { action: s.action ?? '', map: s.map ?? '' },
        pre: s.when,
        etaHours: s.etaHours,
      });
    });
  });
  return domain;
}

/** Entities standing for a person (the npc entity's ref is the person id). */
function personEntity(ctx: SystemContext, person: string) {
  const ents = ctx.world.slices.world.entities;
  for (const id of Object.keys(ents).sort()) {
    const e = ents[id];
    if (e?.ref === person && e.alive && !e.hidden) return e;
  }
  return undefined;
}

/** The map with most of her believers among her lands (ties: higher faith, then id). */
export function believersTop(ctx: SystemContext, def: GoddessDef, s: GoddessState): string {
  let best = '';
  let bestN = -1;
  let bestF = -1;
  for (const m of Object.keys(s.faith).sort()) {
    if ((s.faith[m] ?? 0) < 0.05 || !ctx.content.maps.some((x) => x.id === m)) continue;
    const n = believersOn(ctx, def, m);
    const f = s.faith[m] ?? 0;
    if (n > bestN || (n === bestN && f > bestF)) {
      best = m;
      bestN = n;
      bestF = f;
    }
  }
  return best || strongestMap(s, ctx.content);
}

/** Resolve a scheme's bindings now: map ids, and `<name>.target` entity ids for persons. */
export function resolveBindings(
  ctx: SystemContext,
  def: GoddessDef,
  s: GoddessState,
  bind: Record<string, SchemeBinding>,
): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [name, b] of Object.entries(bind)) {
    if (typeof b === 'string') {
      const v =
        b === 'player_map'
          ? (ctx.world.slices.world.entities[ctx.world.slices.world.playerId]?.mapId ?? '')
          : b === 'faith_top'
            ? strongestMap(s, ctx.content)
            : believersTop(ctx, def, s);
      if (!v) return null;
      out[name] = v;
    } else if ('map' in b) {
      out[name] = b.map;
    } else {
      const e = personEntity(ctx, b.person);
      if (!e) return null;
      out[name] = e.mapId;
      out[`${name}.target`] = e.id;
    }
  }
  return out;
}

/** A step's bound map now ('' when unbound, the player's map for player_map). */
export function stepMap(ctx: SystemContext, run: SchemeRun, step: SchemeStepDef): string {
  const m = step.map;
  if (!m) return '';
  if (m.startsWith('$')) return run.bindings[m.slice(1)] ?? '';
  if (m === 'player_map')
    return ctx.world.slices.world.entities[ctx.world.slices.world.playerId]?.mapId ?? '';
  return run.bindings[m] ?? m;
}

/** A step's bound target entity ('' when none). */
export function stepTarget(run: SchemeRun, step: SchemeStepDef): string {
  const t = step.target;
  if (!t?.startsWith('$')) return '';
  return run.bindings[`${t.slice(1)}.target`] ?? '';
}

/** The running scheme steps of a goddess, next step first per scheme. */
export function nextSteps(
  ctx: SystemContext,
  goddess: string,
): { run: SchemeRun; step: SchemeStepDef }[] {
  const out: { run: SchemeRun; step: SchemeStepDef }[] = [];
  for (const run of brainOf(ctx.world.slices.goddess, goddess).plans) {
    const task = run.steps[run.index];
    const step = task ? stepOf(ctx.content, task) : undefined;
    if (step) out.push({ run, step });
  }
  return out;
}

/** Ticks the first step of a plan may take. */
function etaTicks(steps: readonly HtnStep[]): number {
  return Math.max(1, Math.round((steps[0]?.etaHours ?? 24) * TICKS_PER_GAME_HOUR));
}

/** Advance the run past reactive steps whose condition already holds (done before or now). */
function settleDone(ctx: SystemContext, goddess: string, run: SchemeRun): void {
  for (let guard = 0; guard < run.steps.length + 1; guard++) {
    const task = run.steps[run.index];
    const step = task ? stepOf(ctx.content, task) : undefined;
    if (!step?.condition || !conditionHolds(ctx, step.condition)) return;
    advanceSchemes(ctx, goddess, {}, run);
    if (!brainOf(ctx.world.slices.goddess, goddess).plans.includes(run)) return;
  }
}

/** Plan a scheme from the world now; null when no method decomposes. */
function plan(
  ctx: SystemContext,
  def: SchemeDef,
  bindings: Record<string, string>,
): { steps: HtnStep[]; eta: number } | null {
  const res = planHtn(
    schemeDomain(def),
    def.id,
    ctx.world.meta.flags,
    (expr, state) => evaluate(expr, flagResolver(state)),
    { bindings: Object.fromEntries(Object.entries(bindings).filter(([k]) => !k.includes('.'))) },
  );
  if (!res.ok) return null;
  return { steps: res.plan.steps, eta: etaTicks(res.plan.steps) };
}

/** The adoption score of builtin_ai 8.4 (before the adoptAt threshold). */
export function adoptionScore(
  ctx: SystemContext,
  def: SchemeDef,
  p: GoddessPersona | undefined,
  power: number,
): number {
  const cfg = brainConfig(ctx.content);
  let cost = 0;
  for (const m of def.methods.slice(0, 1))
    for (const s of m.steps) cost += s.action ? (actionDef(ctx.content, s.action)?.power ?? 0) : 0;
  return (
    10 * kpiValue(p, { kpi: def.value }) +
    3 * personaAffinity(p, { tags: def.tags }, cfg) -
    (10 * cost) / Math.max(1, power)
  );
}

function endRun(ctx: SystemContext, goddess: string, run: SchemeRun, how: 'done' | 'aborted') {
  const brain = brainOf(ctx.world.slices.goddess, goddess);
  brain.plans = brain.plans.filter((r) => r !== run);
  brain.ended.push({ scheme: run.scheme, tick: ctx.tick, how });
  if (brain.ended.length > ENDED_KEEP) brain.ended.shift();
  ctx.emit('goddess.scheme', { goddessId: goddess, scheme: run.scheme, state: how });
}

/** Whether a scheme may be adopted again now (once per act, or after replanDays). */
function mayAdoptAgain(ctx: SystemContext, goddess: string, def: SchemeDef): boolean {
  const brain = brainOf(ctx.world.slices.goddess, goddess);
  const last = [...brain.ended].reverse().find((e) => e.scheme === def.id);
  if (!last) return true;
  if (def.replanDays === undefined) {
    const start = brain.actStart[currentActId(ctx)] ?? 0;
    return last.tick < start;
  }
  return ctx.tick - last.tick >= def.replanDays * TICKS_PER_GAME_DAY;
}

/**
 * The dawn step of her schemes: abort or replan the running ones, then adopt new ones up
 * to the limit. `forced` names schemes hung on an open scripted act (adopted directly).
 */
export function stepSchemes(
  ctx: SystemContext,
  def: GoddessDef,
  s: GoddessState,
  p: GoddessPersona | undefined,
  forced: readonly string[] = [],
): void {
  const cfg = brainConfig(ctx.content);
  const brain = brainOf(ctx.world.slices.goddess, def.id);
  for (const run of [...brain.plans]) {
    const sd = schemeDef(ctx.content, run.scheme);
    if (!sd || (sd.unless && conditionHolds(ctx, sd.unless))) {
      endRun(ctx, def.id, run, 'aborted');
      continue;
    }
    if (ctx.tick <= run.deadlineTick) continue;
    // the step stalled past its deadline: replan from the world now, or give up
    if (run.retries >= cfg.schemeRetries) {
      endRun(ctx, def.id, run, 'aborted');
      continue;
    }
    const bindings = resolveBindings(ctx, def, s, sd.bind);
    const fresh = bindings ? plan(ctx, sd, bindings) : null;
    if (!bindings || !fresh) {
      endRun(ctx, def.id, run, 'aborted');
      continue;
    }
    // the same steps again keep their progress (a reactive step already fulfilled stays so)
    const steps = fresh.steps.map((x) => x.task);
    const same = steps.length === run.steps.length && steps.every((t, i) => t === run.steps[i]);
    if (!same) {
      run.steps = steps;
      run.index = 0;
    }
    run.bindings = bindings;
    run.retries++;
    const cur = stepOf(ctx.content, run.steps[run.index] as string);
    run.deadlineTick = ctx.tick + Math.round((cur?.etaHours ?? 24) * TICKS_PER_GAME_HOUR);
  }
  for (const run of [...brain.plans]) settleDone(ctx, def.id, run);
  const act = currentActId(ctx);
  const allowed = personaAct(p, act)?.schemes ?? [];
  for (const id of allowed) {
    if (brain.plans.length >= cfg.maxSchemes) break;
    if (brain.plans.some((r) => r.scheme === id)) continue;
    const sd = schemeDef(ctx.content, id);
    if (!sd || !mayAdoptAgain(ctx, def.id, sd)) continue;
    if (sd.when && !conditionHolds(ctx, sd.when)) continue;
    if (sd.unless && conditionHolds(ctx, sd.unless)) continue;
    if (!forced.includes(id) && adoptionScore(ctx, sd, p, s.power) <= cfg.adoptAt) continue;
    const bindings = resolveBindings(ctx, def, s, sd.bind);
    const fresh = bindings ? plan(ctx, sd, bindings) : null;
    if (!bindings || !fresh) continue;
    const run: SchemeRun = {
      planId: ctx.newId('scheme'),
      scheme: sd.id,
      root: sd.id,
      steps: fresh.steps.map((x) => x.task),
      index: 0,
      bindings,
      startTick: ctx.tick,
      deadlineTick: ctx.tick + fresh.eta,
      retries: 0,
    };
    brain.plans.push(run);
    ctx.emit('goddess.scheme', { goddessId: def.id, scheme: sd.id, state: 'adopted' });
    settleDone(ctx, def.id, run);
  }
}

/** Advance her running schemes whose next step this act or event fulfils. */
export function advanceSchemes(
  ctx: SystemContext,
  goddess: string,
  done: { action?: string; mapId?: string; on?: SchemeEvent },
  only?: SchemeRun,
): void {
  const brain = brainOf(ctx.world.slices.goddess, goddess);
  for (const run of only ? [only] : [...brain.plans]) {
    const task = run.steps[run.index];
    const step = task ? stepOf(ctx.content, task) : undefined;
    if (!step) continue;
    // `only`: the caller settled the step itself (its condition holds)
    const hit =
      run === only ||
      (step.on
        ? step.on === done.on
        : step.action !== undefined &&
          step.action === done.action &&
          (!step.map || stepMap(ctx, run, step) === done.mapId));
    if (!hit) continue;
    run.index++;
    if (run.index >= run.steps.length) endRun(ctx, goddess, run, 'done');
    else {
      // the next step gets its own time from now
      const next = stepOf(ctx.content, run.steps[run.index] as string);
      run.deadlineTick = ctx.tick + Math.round((next?.etaHours ?? 24) * TICKS_PER_GAME_HOUR);
    }
  }
}

/**
 * A planned step of hers was refused when it came to run (builtin_ai 8.4 "某步被拒时重规划"):
 * the scheme replans at her next dawn.
 */
export function stepRefused(
  ctx: SystemContext,
  goddess: string,
  action: string,
  scheme?: string,
): void {
  for (const { run, step } of nextSteps(ctx, goddess))
    if (step.action === action && (scheme === undefined || run.scheme === scheme))
      run.deadlineTick = ctx.tick - 1;
}

/** Load-time problems of the scheme table. */
export function schemeProblems(content: {
  goddessSchemes?: readonly SchemeDef[];
  goddesses: readonly { id: string }[];
  divineActions: readonly { id: string }[];
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of content.goddessSchemes ?? []) {
    const at = `scheme ${s.id}`;
    if (!s.id.startsWith('div_plan_')) out.push(`${at}: id must start with div_plan_`);
    if (seen.has(s.id)) out.push(`${at}: duplicate id`);
    seen.add(s.id);
    if (!content.goddesses.some((g) => g.id === s.goddess))
      out.push(`${at}: unknown goddess ${s.goddess}`);
    for (const c of [s.when, s.unless]) {
      const bad = c ? checkCondition(c) : null;
      if (bad) out.push(`${at}: condition does not parse: ${bad}`);
    }
    if (s.methods.length === 0) out.push(`${at}: no method`);
    s.methods.forEach((m, mi) => {
      if (m.steps.length === 0) out.push(`${at} method ${mi}: no step`);
      for (const st of m.steps) {
        if (!st.action === !st.on) out.push(`${at}: a step names an action or an event`);
        if (st.action && !content.divineActions.some((a) => a.id === st.action))
          out.push(`${at}: unknown action ${st.action}`);
        if (st.on && !(SCHEME_EVENTS as readonly string[]).includes(st.on))
          out.push(`${at}: unknown step event ${st.on}`);
        for (const ref of [st.map, st.target])
          if (ref?.startsWith('$') && !(ref.slice(1) in s.bind)) out.push(`${at}: unbound ${ref}`);
        if (
          st.map &&
          !st.map.startsWith('$') &&
          !(BIND_RESOLVERS as readonly string[]).includes(st.map)
        )
          out.push(`${at}: step map ${st.map} is neither a binding nor a resolver`);
        if (!(st.etaHours > 0)) out.push(`${at}: etaHours must be positive`);
      }
    });
    for (const [name, b] of Object.entries(s.bind))
      if (typeof b === 'string' && !(BIND_RESOLVERS as readonly string[]).includes(b))
        out.push(`${at}: binding ${name} names an unknown resolver ${b}`);
  }
  return out;
}
