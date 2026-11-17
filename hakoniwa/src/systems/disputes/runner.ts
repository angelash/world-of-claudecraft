// The dispute runner (PK-M1-46; act1_borderstone.md 4; npc_society_ai.md 9;
// quests_and_events.md 2.4 and 3.6). Every step brings each dispute of the content up to
// now, in content order:
//   1. the stage: the last listed stage whose week has come and whose condition holds
//      (dispute.<id>.stage and .escalation);
//   2. the decision points: a point opens at its week (or later inside its window once its
//      condition holds; `unless` drops it) and names its NPC (dispute.decision_opened); a
//      chooser may answer with disputes.decide until the deadline, after which the rule
//      fallback decides (utility.ts); the choice is written to dispute.<id>.choice.<point>
//      and its effects apply; the points that follow it are checked once;
//   3. the settlement: at the settle week, when the settle condition holds, or once the
//      world is past the dispute's act, the decisions still open are decided by the
//      fallback, the outcome rows are selected (outcomes.ts), their writes apply, and
//      dispute.<id>.ending and .by are written.
// The week-by-week default development is the chain quest's `defaults`, applied by the
// act clock before this runs (src/systems/quests/disputes.ts). Deterministic: conditions
// and the world's own flags, one named stream per dispute (disputes.<id>), no clock.

import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_HOUR } from '../../core/time';
import { currentActId } from '../quests/act_order';
import { actIndex } from '../quests/conditions';
import { applyEffects, conditionHolds } from '../quests/effects';
import { selectOutcomes } from './outcomes';
import type {
  DecisionPointDef,
  DecisionSource,
  DisputeDef,
  DisputeState,
  DisputesSlice,
  EndingBy,
  OpenDecision,
} from './types';
import { DEFAULT_DECISION_HOURS, decisionTrace, fallbackPick, legalOptions } from './utility';

declare module '../../core/contracts' {
  interface EventMap {
    /** a dispute entered a stage (escalation 0 to 3) */
    'dispute.stage': { disputeId: string; stage: string; escalation: number };
    /** a decision point named its NPC: a chooser may answer until dueTick */
    'dispute.decision_opened': {
      disputeId: string;
      pointId: string;
      actor: string;
      options: string[];
      dueTick: number;
    };
    /** a decision point was decided ('' when nothing was on the menu) */
    'dispute.decided': {
      disputeId: string;
      pointId: string;
      actor: string;
      optionId: string;
      source: DecisionSource;
    };
    /** a decision point will not happen (the player stepped in, or its window closed) */
    'dispute.decision_dropped': { disputeId: string; pointId: string; actor: string };
    /** a dispute settled; `forced` when the act ended first */
    'dispute.settled': {
      disputeId: string;
      ending: string;
      by: EndingBy;
      stacked: string[];
      forced: boolean;
    };
  }
}

/** The step cadence while nothing moved (ticks). */
export const POLL_EVERY = 10;

export function emptyDisputesSlice(): DisputesSlice {
  return { disputes: {}, open: [], dirty: true, act: '', week: 0 };
}

/** The slice (created on first use: saves from before PK-M1-46 have none). */
export function disputesSlice(world: { slices: { disputes?: DisputesSlice } }): DisputesSlice {
  world.slices.disputes ??= emptyDisputesSlice();
  return world.slices.disputes;
}

/** The disputes of the content. */
export function disputeDefs(content: { disputes?: readonly DisputeDef[] }): readonly DisputeDef[] {
  return content.disputes ?? [];
}

export function disputeDef(
  content: { disputes?: readonly DisputeDef[] },
  id: string,
): DisputeDef | undefined {
  return disputeDefs(content).find((d) => d.id === id);
}

/** A dispute's run-time state (created on first use). */
export function disputeState(slice: DisputesSlice, id: string): DisputeState {
  let st = slice.disputes[id];
  if (!st) {
    st = { stage: '', chosen: {}, dropped: [] };
    slice.disputes[id] = st;
  }
  return st;
}

function holdsIn(ctx: SystemContext): (when: string) => boolean {
  return (when) => conditionHolds(ctx, when);
}

function pointOf(def: DisputeDef, id: string): DecisionPointDef | undefined {
  return def.decisions.find((p) => p.id === id);
}

/** Whether a point opened already (decided, dropped, or open now). */
function seen(slice: DisputesSlice, def: DisputeDef, st: DisputeState, id: string): boolean {
  return (
    st.chosen[id] !== undefined ||
    st.dropped.includes(id) ||
    slice.open.some((o) => o.dispute === def.id && o.point === id)
  );
}

// ---------------------------------------------------------------------------
// stages

function updateStage(ctx: SystemContext, def: DisputeDef, st: DisputeState, week: number): void {
  const holds = holdsIn(ctx);
  let target: DisputeDef['stages'][number] | undefined;
  for (const s of def.stages) if ((s.week ?? 1) <= week && (!s.when || holds(s.when))) target = s;
  if (!target || target.id === st.stage) return;
  st.stage = target.id;
  ctx.setFlag(`dispute.${def.id}.stage`, target.id);
  ctx.setFlag(`dispute.${def.id}.escalation`, target.escalation);
  ctx.emit('dispute.stage', {
    disputeId: def.id,
    stage: target.id,
    escalation: target.escalation,
  });
}

// ---------------------------------------------------------------------------
// decision points

function drop(ctx: SystemContext, def: DisputeDef, st: DisputeState, p: DecisionPointDef): void {
  const slice = disputesSlice(ctx.world);
  if (seen(slice, def, st, p.id)) return;
  st.dropped.push(p.id);
  ctx.emit('dispute.decision_dropped', { disputeId: def.id, pointId: p.id, actor: p.actor });
  // a point that follows one that never happens never happens either
  for (const next of def.decisions) if (next.after === p.id) drop(ctx, def, st, next);
}

function openPoint(
  ctx: SystemContext,
  def: DisputeDef,
  st: DisputeState,
  p: DecisionPointDef,
): void {
  const holds = holdsIn(ctx);
  if (p.unless && holds(p.unless)) {
    drop(ctx, def, st, p);
    return;
  }
  const slice = disputesSlice(ctx.world);
  const hours = p.hours ?? DEFAULT_DECISION_HOURS;
  const open: OpenDecision = {
    dispute: def.id,
    point: p.id,
    actor: p.actor,
    openedTick: ctx.tick,
    dueTick: ctx.tick + Math.max(0, Math.round(hours * TICKS_PER_GAME_HOUR)),
  };
  slice.open.push(open);
  ctx.emit('dispute.decision_opened', {
    disputeId: def.id,
    pointId: p.id,
    actor: p.actor,
    options: legalOptions(p, holds).map((o) => o.id),
    dueTick: open.dueTick,
  });
  if (open.dueTick <= ctx.tick) fallbackDecide(ctx, def, st, open);
}

/** Open the week points that are due (and drop those whose window closed unopened). */
function openDue(ctx: SystemContext, def: DisputeDef, st: DisputeState, week: number): void {
  const slice = disputesSlice(ctx.world);
  const holds = holdsIn(ctx);
  for (const p of def.decisions) {
    if (p.after !== undefined || seen(slice, def, st, p.id)) continue;
    if (week < (p.week ?? def.span.from)) continue;
    if (week > (p.until ?? def.span.to)) {
      drop(ctx, def, st, p);
      continue;
    }
    if (p.when && !holds(p.when)) continue;
    openPoint(ctx, def, st, p);
  }
}

/**
 * Record a decision: the choice flag, the option's effects, the event, then the points
 * that follow it (each checked once: its condition holds and it opens, or it is dropped).
 */
export function applyDecision(
  ctx: SystemContext,
  def: DisputeDef,
  st: DisputeState,
  open: OpenDecision,
  optionId: string,
  source: DecisionSource,
): void {
  const slice = disputesSlice(ctx.world);
  const i = slice.open.indexOf(open);
  if (i < 0) return;
  slice.open.splice(i, 1);
  const p = pointOf(def, open.point);
  st.chosen[open.point] = optionId;
  const option = p?.options.find((o) => o.id === optionId);
  if (option) {
    ctx.setFlag(`dispute.${def.id}.choice.${open.point}`, option.id);
    applyEffects(ctx, option.effects);
  }
  ctx.emit('dispute.decided', {
    disputeId: def.id,
    pointId: open.point,
    actor: open.actor,
    optionId,
    source,
  });
  const holds = holdsIn(ctx);
  for (const next of def.decisions) {
    if (next.after !== open.point || seen(slice, def, st, next.id)) continue;
    if (next.when && !holds(next.when)) drop(ctx, def, st, next);
    else openPoint(ctx, def, st, next);
  }
}

/** The rule fallback decides an open point now (builtin_ai.md 5.8), with its trace. */
function fallbackDecide(
  ctx: SystemContext,
  def: DisputeDef,
  st: DisputeState,
  open: OpenDecision,
): void {
  const p = pointOf(def, open.point);
  if (!p) {
    applyDecision(ctx, def, st, open, '', 'fallback');
    return;
  }
  const stream = `disputes.${def.id}`;
  const pick = fallbackPick(p, holdsIn(ctx), ctx.rng(stream));
  ctx.brainTrace(decisionTrace(p.actor, ctx.tick, pick, stream));
  applyDecision(ctx, def, st, open, pick.chosen?.id ?? '', 'fallback');
}

/** Decide every open point of a dispute whose deadline has come (all of them with `all`). */
function resolveDue(ctx: SystemContext, def: DisputeDef, st: DisputeState, all = false): void {
  const slice = disputesSlice(ctx.world);
  // a decision may open the points after it: loop until nothing of this dispute is due
  for (let guard = 0; guard < 256; guard++) {
    const due = slice.open.find((o) => o.dispute === def.id && (all || o.dueTick <= ctx.tick));
    if (!due) return;
    fallbackDecide(ctx, def, st, due);
  }
}

// ---------------------------------------------------------------------------
// settlement

function settle(ctx: SystemContext, def: DisputeDef, st: DisputeState, forced: boolean): void {
  const slice = disputesSlice(ctx.world);
  // the chain never waits: what is still open is decided by the fallback now
  resolveDue(ctx, def, st, true);
  for (const p of def.decisions) if (!seen(slice, def, st, p.id)) drop(ctx, def, st, p);
  const sel = selectOutcomes(def, holdsIn(ctx));
  const ending = sel?.ending ?? '';
  const by: EndingBy = sel?.by ?? 'world';
  const stacked = sel ? sel.stacked.map((o) => o.id) : [];
  st.ending = ending;
  st.by = by;
  st.stacked = stacked;
  st.settledTick = ctx.tick;
  if (sel) {
    applyEffects(ctx, sel.primary.effects);
    for (const o of sel.stacked) applyEffects(ctx, o.effects);
  }
  ctx.setFlag(`dispute.${def.id}.ending`, ending);
  ctx.setFlag(`dispute.${def.id}.by`, by);
  if (st.stage) ctx.setFlag(`dispute.${def.id}.escalation`, 0);
  ctx.emit('dispute.settled', {
    disputeId: def.id,
    ending,
    by,
    stacked: [...stacked],
    forced,
  });
}

// ---------------------------------------------------------------------------
// the step

/** Whether the runner has something to look at this tick. */
export function needsStep(ctx: SystemContext): boolean {
  const slice = disputesSlice(ctx.world);
  if (slice.dirty || ctx.tick % POLL_EVERY === 0) return true;
  if (currentActId(ctx) !== slice.act) return true;
  if (Number(ctx.flag('act_week') ?? 0) !== slice.week) return true;
  return slice.open.some((o) => o.dueTick <= ctx.tick);
}

/** Bring every dispute up to now (stages, decision points, settlement). */
export function stepDisputes(ctx: SystemContext): void {
  const slice = disputesSlice(ctx.world);
  slice.dirty = false;
  const act = currentActId(ctx);
  const week = Number(ctx.flag('act_week') ?? 0);
  slice.act = act;
  slice.week = week;
  const here = actIndex(act);
  const holds = holdsIn(ctx);
  for (const def of disputeDefs(ctx.content)) {
    const st = disputeState(slice, def.id);
    if (st.ending !== undefined) continue;
    const mine = actIndex(def.act);
    if (Number.isNaN(here) || Number.isNaN(mine) || here < mine) continue;
    if (here > mine) {
      settle(ctx, def, st, true);
      continue;
    }
    if (week < def.span.from) continue;
    updateStage(ctx, def, st, week);
    openDue(ctx, def, st, week);
    resolveDue(ctx, def, st);
    if (week >= def.settle.week || (!!def.settle.when && holds(def.settle.when))) {
      settle(ctx, def, st, false);
    }
  }
}

/**
 * A chooser's answer (the NPC brain, a model proposal): the point must be open and the
 * option on its legal menu now; otherwise the code says why it was not taken.
 */
export function chooseOption(
  ctx: SystemContext,
  disputeId: string,
  pointId: string,
  optionId: string,
): 'ok' | 'no_decision' | 'bad_option' {
  const def = disputeDef(ctx.content, disputeId);
  const slice = disputesSlice(ctx.world);
  const open = slice.open.find((o) => o.dispute === disputeId && o.point === pointId);
  const p = def ? pointOf(def, pointId) : undefined;
  if (!def || !open || !p) return 'no_decision';
  if (!legalOptions(p, holdsIn(ctx)).some((o) => o.id === optionId)) return 'bad_option';
  applyDecision(ctx, def, disputeState(slice, def.id), open, optionId, 'chooser');
  return 'ok';
}
