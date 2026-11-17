// The NPC brain's root (builtin_ai.md 2.4 and 4.3): the layers in order, each answering
// "what is this person doing now, and where", the first that answers wins:
//   script   a scripted override or a follow order holds the person
//   talk     a conversation with the player freezes the schedule (handled by the caller)
//   emergency  danger: flee, seek help or stand ground (utility, persona-weighted)
//   duty     in duty hours: the functional-role trees under one utility selector (L1, L2)
//   need     a latched need: the generic utility library against the idle baseline
//   goal     a long-term goal's pursuit segment that is due today (L1, L2)
//   initiative  walk up to the player (L1, L2; ./initiative.ts)
//   social   look up a good partner elsewhere in town (L1, L2)
//   schedule today's plan or the template, with a bark now and then
// Residents (L4) keep the plain schedule with need overrides; offstage named NPCs (L3) get
// the need layer and the schedule. Every utility pick writes a BrainTrace. Deterministic:
// draws only from the actor's stream npc.brain.<id>.

import { traceOfPick } from '../../../core/brain/trace';
import { evaluateAction, LIFE_BAND, pickBest } from '../../../core/brain/utility';
import type { SystemContext } from '../../../core/system';
import { type TextParam, tr } from '../../../core/text';
import { TICKS_PER_GAME_DAY } from '../../../core/time';
import { conditionHolds } from '../../quests/effects';
import { EMERGENCY_HOLD, NEED_CRITICAL, NEED_RECONSIDER, NEED_RELEASE } from '../constants';
import { ensureNeeds, needOverride } from '../needs';
import type { CardView } from '../personas';
import { coversHour } from '../schedule';
import { personaDim } from '../traits';
import type { Activity, BrainLayer, NeedKey, NpcState } from '../types';
import { devotionOf } from '../wallet';
import { inputValue } from './inputs';
import {
  type BrainDo,
  type BrainNote,
  libraryActions,
  librarySpec,
  type RoleEffect,
} from './library';
import { runDuty } from './roles';
import { ensureBrain } from './state';
import { type ActorView, actorView } from './view';

/** What the brain decided for this evaluation. */
export interface BrainDecision {
  act: Activity;
  /** a schedule place reference or a special place (@here, @player, @patient, @crowd) */
  at: string;
  note?: TextParam;
  layer: BrainLayer;
  /** the brain action id ('' for the schedule) */
  action: string;
  effect?: RoleEffect;
  /** the initiative layer's approach (the caller starts it) */
  approach?: boolean;
  /** the social layer's partner to look up */
  partner?: string;
}

export function noteText(note: BrainNote | undefined): TextParam | undefined {
  return note ? tr(`sys.npc.note.${note}`) : undefined;
}

function fromDo(d: BrainDo, layer: BrainLayer, action: string): BrainDecision {
  return { act: d.act, at: d.at, note: noteText(d.note), layer, action, effect: d.effect };
}

/** Needs that latch the need layer (money only when critical: savings move slowly). */
function pressing(v: ActorView, line: number): NeedKey[] {
  const n = ensureNeeds(v.st.needs);
  const out: NeedKey[] = [];
  for (const k of Object.keys(n) as NeedKey[]) {
    const limit = k === 'money' ? Math.min(line, NEED_CRITICAL) : line;
    if (n[k] < limit) out.push(k);
  }
  return out;
}

/** The need layer's latch (builtin_ai 2.4): set under 35, released once all are at 45. */
export function updateLatch(v: ActorView): boolean {
  const b = v.brain;
  if (pressing(v, NEED_RECONSIDER).length > 0) b.needLatch = true;
  else if (b.needLatch && pressing(v, NEED_RELEASE).length === 0) b.needLatch = false;
  return b.needLatch;
}

/** Utility pick over a layer of the generic library; null when the idle baseline wins. */
function pickLibrary(
  v: ActorView,
  layer: 'need' | 'emergency',
  allowed?: (needKey: NeedKey | undefined) => boolean,
): BrainDecision | null {
  const content = v.ctx.content;
  const defs = libraryActions(content).filter((d) => d.tags?.includes(layer));
  const dims = content.npcBrain?.traitDims;
  const scored = defs
    .filter((d) => {
      const need = librarySpec(content, d.id)?.do.need;
      return !allowed || allowed(need);
    })
    .map((d) =>
      evaluateAction(d, {
        input: (id) => inputValue(v, id),
        persona: (dim) => personaDim(dims, v.p, dim),
        current: v.brain.current,
        tick: v.ctx.tick,
        lastUsedTick: (id) => v.brain.used[id],
      }),
    );
  const stream = `npc.brain.${v.st.id}`;
  const pick = pickBest(scored, {
    band: LIFE_BAND,
    rng: v.ctx.rng(stream),
    idleScore: layer === 'need' ? (content.npcBrain?.idle ?? 0.5) : 0.5,
  });
  v.ctx.brainTrace(traceOfPick(v.st.id, `npc.${layer}`, v.ctx.tick, pick, stream));
  if (!pick.chosen) return null;
  const spec = librarySpec(content, pick.chosen.id);
  return spec ? fromDo(spec.do, layer, spec.id) : null;
}

/** A goal pursuit due now (builtin_ai.md 3.2), or null. */
function duePursuit(v: ActorView): BrainDecision | null {
  const list = v.p?.pursuits ?? [];
  if (list.length === 0) return null;
  // a pursuit takes an hour or two out of the day (builtin_ai.md 3.2), never out of sleep
  if (v.segment.act === 'sleep') return null;
  let best: { id: string; urge: boolean; d: BrainDecision } | null = null;
  for (const g of list) {
    const span = { from: g.from, to: (g.from + g.hours) % 24 || 24 };
    if (!coversHour(span, v.hour)) continue;
    const last = v.brain.pursued[g.id];
    const startedToday = last === v.day;
    if (!startedToday && last !== undefined && v.day - last < g.everyDays) continue;
    if (g.done && conditionHolds(v.ctx, g.done)) continue;
    if (g.abandon && conditionHolds(v.ctx, g.abandon)) continue;
    const urge = !!g.urge && conditionHolds(v.ctx, g.urge);
    const d: BrainDecision = {
      act: g.act,
      at: g.at,
      note: noteText('pursuit'),
      layer: 'goal',
      action: `goal.${g.id}`,
    };
    if (!best || (urge && !best.urge) || (urge === best.urge && g.id < best.id))
      best = { id: g.id, urge, d };
  }
  if (best) v.brain.pursued[best.id] = v.day;
  return best?.d ?? null;
}

/** Hooks the later layers plug in (initiative and social live in their own modules). */
export interface LayerHooks {
  initiative?(v: ActorView): BrainDecision | null;
  social?(v: ActorView): BrainDecision | null;
  scheduleBark?(v: ActorView): void;
}

let hooks: LayerHooks = {};

/** Set the initiative and social layers (called once by the brain's index). */
export function setLayerHooks(h: LayerHooks): void {
  hooks = h;
}

/**
 * Decide what the actor does now. `beat` is a brain beat (L1, L2) rather than the hourly
 * schedule turn: barks and the social layers only run on beats.
 */
export function brainDecide(
  ctx: SystemContext,
  st: NpcState,
  card: CardView,
  beat: boolean,
): BrainDecision {
  const v = actorView(ctx, st, card);
  const b = v.brain;
  const schedule = (): BrainDecision => ({
    act: v.segment.act,
    at: v.segment.at,
    note: v.segment.note,
    layer: 'schedule',
    action: '',
  });
  // 1 script: an errand or a follow order holds the person
  if (st.override && ctx.tick < st.override.until)
    return {
      act: st.override.act,
      at: st.override.at,
      note: tr('sys.npc.note.busy'),
      layer: 'script',
      action: 'script',
    };
  st.override = null;
  if (st.follow && ctx.tick < st.follow.until)
    return {
      act: 'wander',
      at: '@player',
      note: noteText('follow'),
      layer: 'script',
      action: 'follow',
    };
  // residents: the plain schedule with need overrides
  if (st.resident) {
    const ov = needOverride(ensureNeeds(st.needs), v.segment, devotionOf(card), v.money);
    return ov ? { ...ov, layer: 'need', action: '' } : schedule();
  }
  const full = st.tier <= 2;
  // 3 emergency
  const danger = inputValue(v, 'danger');
  if (danger >= 0.6 || ctx.tick < b.emergencyUntil) {
    if (danger >= 0.6) b.emergencyUntil = ctx.tick + EMERGENCY_HOLD;
    const d = pickLibrary(v, 'emergency');
    if (d) return d;
  }
  const n = ensureNeeds(st.needs);
  // the bodily needs (and fear for one's life) override plans and duties (builtin_ai 2.4)
  const critical = n.hunger < NEED_CRITICAL || n.energy < NEED_CRITICAL || n.safety < NEED_CRITICAL;
  // a goal's pursuit segment due now is part of today's plan (builtin_ai.md 3.2 step 4):
  // its hour is not a duty hour, so it goes before the duty layer
  if (full && !critical) {
    const g = duePursuit(v);
    if (g) {
      trace(v, 'npc.goal', g.action, 1);
      return g;
    }
  }
  // 5 duty (roles), unless a need is critical or it is the person's sleeping time (the role
  // trees gate their own hours: duty_time, morning, !night)
  if (full && !critical && v.segment.act !== 'sleep') {
    const duty = runDuty(v);
    if (duty.action) {
      const d = fromDo(duty.action.spec.do, 'duty', `${duty.action.role}.${duty.action.id}`);
      trace(v, 'npc.duty', d.action, duty.action.spec.weight);
      return d;
    }
  }
  // 6 need: work and sleep give way only to critical needs (builtin_ai 2.4)
  if (updateLatch(v)) {
    const busy = v.segment.act === 'work' || v.segment.act === 'sleep';
    const d = pickLibrary(v, 'need', (k) => !busy || (k !== undefined && n[k] < NEED_CRITICAL));
    if (d) return d;
  }
  if (full && beat) {
    // 8 initiative, 9 social
    const i = hooks.initiative?.(v);
    if (i) {
      trace(v, 'npc.initiative', i.action, 1);
      return i;
    }
    const s = hooks.social?.(v);
    if (s) {
      trace(v, 'npc.social', s.action, 1);
      return s;
    }
  }
  // 10 schedule (a bark now and then on a beat)
  if (beat) hooks.scheduleBark?.(v);
  return schedule();
}

/** A decision of a layer that is not a utility pick, explained (builtin_ai.md 2.6). */
function trace(v: ActorView, kind: string, chosen: string, score: number): void {
  v.ctx.brainTrace({
    actor: v.st.id,
    kind,
    tick: v.ctx.tick,
    top: [{ id: chosen, score, terms: [{ name: 'layer', value: score }] }],
    chosen,
    stream: '',
    draw: -1,
  });
}

/** Bookkeeping of a decision: inertia, cooldowns, the layer (builtin_ai 2.1). */
export function noteDecision(st: NpcState, d: BrainDecision, tick: number): boolean {
  const b = ensureBrain(st);
  const fresh = b.current !== d.action;
  b.layer = d.layer;
  b.current = d.action;
  if (fresh && d.action) b.used[d.action] = tick;
  // forget cooldowns long past (a day of ticks is the longest a library action waits)
  for (const [k, t] of Object.entries(b.used))
    if (tick - t > 7 * TICKS_PER_GAME_DAY) delete b.used[k];
  return fresh;
}
