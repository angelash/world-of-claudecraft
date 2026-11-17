// Dispute decision points from the person's side (builtin_ai.md 5.8; npc_society_ai.md 9):
// when a chain names a named NPC (dispute.decision_opened), the brain scores the legal menu
// with persona-derived weights on the four inputs of the rule utility (stance 0.35,
// relation 0.25, safety 0.20, values 0.15, -100 for a must-keep rule) and files the
// npc.decision_point request whose fallback is that choice (`disputes.decide`); with no
// model the fallback lands on the next tick, before the runner's own rule fallback at the
// deadline. The decision then goes into the memory of the person and of the parties
// (dispute.decided), the material of later talk and of act six's voices.

import { systemSource } from '../../../core';
import type { AiContextV1 } from '../../../core/ai_port';
import { traceOfPick } from '../../../core/brain/trace';
import {
  clampPersona,
  LIFE_BAND,
  pickBest,
  type ScoredAction,
  type ScoredTerm,
} from '../../../core/brain/utility';
import { contentRef } from '../../../core/content_key';
import type { AnyCommand } from '../../../core/contracts';
import type { SystemContext } from '../../../core/system';
import { tr } from '../../../core/text';
import {
  DECISION_WEIGHTS,
  decisionMenu,
  disputeDef,
  type MenuOption,
  MUST_KEEP_PENALTY,
} from '../../disputes';
import { baseContext } from '../ai_context';
import { personaById } from '../personas';
import { relationOf } from '../relations';
import { personaDim } from '../traits';
import type { PersonaCard } from '../types';
import { remember } from './memory_rules';

/** The decision kind of the traces (builtin_ai.md 2.6). */
export const NPC_DECISION_KIND = 'npc.decision_point';

/** Persona multipliers of the four inputs (builtin_ai.md 2.1 M(a), applied per input). */
export function personaWeights(
  ctx: SystemContext,
  p: PersonaCard,
  disputeId: string,
): Record<keyof typeof DECISION_WEIGHTS, number> {
  const dims = ctx.content.npcBrain?.traitDims;
  const stance = Math.abs(p.stances?.[disputeId] ?? 0);
  const parties = disputeDef(ctx.content, disputeId)?.parties.filter((x) => x !== p.id) ?? [];
  let warmth = 0.5;
  if (parties.length > 0) {
    let sum = 0;
    for (const q of parties) sum += (relationOf(ctx.world.slices.npc, p.id, q).like + 100) / 200;
    warmth = sum / parties.length;
  }
  return {
    stance: clampPersona((1 + 0.5 * stance) * personaDim(dims, p, 'stubborn')),
    relation: clampPersona(0.7 + 0.6 * warmth),
    safety: clampPersona(personaDim(dims, p, 'fear')),
    values: clampPersona((0.6 + 0.8 * (p.devotion ?? 0.3)) * personaDim(dims, p, 'conscience')),
  };
}

/** The persona-weighted utility of one menu option (named terms for the trace). */
export function personaUtility(
  o: MenuOption,
  w: Record<keyof typeof DECISION_WEIGHTS, number>,
): ScoredAction {
  const names = ['stance', 'relation', 'safety', 'values'] as const;
  const terms: ScoredTerm[] = names.map((n) => ({
    name: n,
    value: Math.round(o.inputs[n] * DECISION_WEIGHTS[n] * w[n] * 1e6) / 1e6,
  }));
  let score = terms.reduce((s, t) => s + t.value, 0);
  if (o.inputs.breaks) {
    terms.push({ name: 'must_keep', value: -MUST_KEEP_PENALTY });
    score -= MUST_KEEP_PENALTY;
  }
  return { id: o.id, score: Math.round(score * 1e6) / 1e6, blocked: false, terms };
}

/** The brain's choice for an open point (null when the menu is empty). */
export function brainChoice(
  ctx: SystemContext,
  actor: string,
  disputeId: string,
  pointId: string,
): string | null {
  const p = personaById(ctx.content, actor);
  const menu = decisionMenu(ctx, disputeId, pointId);
  if (!p || menu.length === 0) return null;
  const w = personaWeights(ctx, p, disputeId);
  const stream = `npc.brain.${actor}`;
  const pick = pickBest(
    menu.map((o) => personaUtility(o, w)),
    { band: LIFE_BAND, rng: ctx.rng(stream) },
  );
  ctx.brainTrace(traceOfPick(actor, NPC_DECISION_KIND, ctx.tick, pick, stream));
  return pick.chosen?.id ?? null;
}

/** A decision point named a person: file the request with the brain's choice as fallback. */
export function onDecisionOpened(
  ctx: SystemContext,
  d: { disputeId: string; pointId: string; actor: string; dueTick: number },
): void {
  const st = ctx.world.slices.npc.npcs[d.actor];
  const p = personaById(ctx.content, d.actor);
  if (!st || !p || st.gone) return;
  const optionId = brainChoice(ctx, d.actor, d.disputeId, d.pointId);
  if (optionId === null) return;
  const data = { disputeId: d.disputeId, pointId: d.pointId, optionId };
  const fallback: AnyCommand[] = [{ kind: 'disputes.decide', data, source: systemSource('npc') }];
  const menu = decisionMenu(ctx, d.disputeId, d.pointId);
  const context: AiContextV1 = baseContext(
    ctx.content,
    p,
    ctx.world.slices.npc.minds[d.actor],
    (k) => ctx.flag(k),
    tr('sys.npc.prompt.decision_situation', {
      point: contentRef('disputes', d.disputeId, `decisions.${d.pointId}.label`),
    }),
    {
      'disputes.decide': tr('sys.npc.prompt.decision_command', {
        dispute: d.disputeId,
        point: d.pointId,
      }),
    },
    { options: menu.map((o) => ({ id: o.id, label: o.label })), suggested: optionId },
  );
  ctx.ai.request({
    agentId: d.actor,
    role: 'npc.decision_point',
    purpose: 'dispute_decision',
    revision: ctx.tick,
    context,
    allowed: ['disputes.decide'],
    fallback,
    // a to-the-deadline request (builtin_ai 1.2): answered before the runner's own fallback
    deadlineTicks: Math.max(1, d.dueTick - ctx.tick - 1),
    priority: 4,
  });
}

/** A point was decided: the person and the parties remember it (builtin_ai.md 5.8). */
export function onDecided(
  ctx: SystemContext,
  d: { disputeId: string; pointId: string; actor: string; optionId: string },
): void {
  if (!d.optionId) return;
  const choice = contentRef(
    'disputes',
    d.disputeId,
    `decisions.${d.pointId}.options.${d.optionId}.label`,
  );
  const who = personaById(ctx.content, d.actor)?.name ?? d.actor;
  remember(ctx, d.actor, 'decision', { choice }, { goal: true });
  for (const q of disputeDef(ctx.content, d.disputeId)?.parties ?? []) {
    if (q === d.actor) continue;
    remember(ctx, q, 'decision_heard', { choice, who }, { about: d.actor, cred: 0.8 });
  }
}
